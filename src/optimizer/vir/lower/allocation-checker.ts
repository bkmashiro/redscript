import { isProtectedSlot, sameSlot } from '../../lir/analysis'
import { emitParallelCopyInstructions } from './parallel-copies'
import { VIRSlotPlan, PlannedOperation } from './slot-planner'
import { analyzeFunctionLiveness, collectFunctionValues, type VIRFunctionLiveness, collectFunctionOperations } from './liveness'
import type { VIRFunction, VIRModule, VIROperation } from '../types'
import { isTerminator, isPureOp, operationOperands } from '../types'
import type { Slot } from '../../../lir/types'
import type { ValueId } from '../ids'

interface BrandedId {
  readonly __brand: string
}

interface UnionFind {
  parent: Map<number, number>
}

export interface VIRAllocationFailure {
  reason: string
}

function asNumber(id: BrandedId): number {
  return Number(id)
}

function asRoot(union: UnionFind, value: number): number {
  const parent = union.parent.get(value)
  if (parent === undefined) {
    union.parent.set(value, value)
    return value
  }
  if (parent === value) return value
  const root = asRoot(union, parent)
  union.parent.set(value, root)
  return root
}

function unionRoots(union: UnionFind, left: number, right: number): void {
  const leftRoot = asRoot(union, left)
  const rightRoot = asRoot(union, right)
  if (leftRoot === rightRoot) return
  union.parent.set(rightRoot, leftRoot)
}

function isCommutativeOp(op: VIROperation): boolean {
  return op.kind === 'arith.add' || op.kind === 'arith.mul' || op.kind === 'arith.min' || op.kind === 'arith.max'
}

function collectUnionAndMembers(module: VIRModule, fn: VIRFunction): { union: UnionFind; members: Map<number, ValueId[]>; values: ValueId[] } {
  const operations = collectFunctionOperations(module, fn)
  const values = collectFunctionValues(module, fn, operations)

  const union: UnionFind = { parent: new Map<number, number>() }
  for (const value of values) {
    union.parent.set(asNumber(value), asNumber(value))
  }

  for (const op of operations) {
    if (op.kind === 'arith.identity' && op.operands.length === 1 && op.resultIds.length === 1) {
      unionRoots(union, asNumber(op.operands[0]), asNumber(op.resultIds[0]))
    }
  }

  const members = new Map<number, ValueId[]>()
  for (const value of values) {
    const root = asRoot(union, asNumber(value))
    const existing = members.get(root)
    if (existing) {
      existing.push(value)
      continue
    }
    members.set(root, [value])
  }

  return { union, members, values }
}

function collectRootMembers(plan: VIRSlotPlan, union: UnionFind): Map<number, Slot> {
  const roots = new Map<number, Slot>()
  for (const [valueNumber, slot] of plan.valueToSlot.entries()) {
    const root = asRoot(union, valueNumber)
    const prior = roots.get(root)
    if (prior && !sameSlot(prior, slot)) {
      throw new Error(`value ${valueNumber} maps to conflicting slots for root ${root}`)
    }
    roots.set(root, slot)
  }
  return roots
}

function isRootLiveAfter(
  liveness: VIRFunctionLiveness,
  membersByRoot: Map<number, ValueId[]>,
  root: number,
  opIndex: number,
): boolean {
  const members = membersByRoot.get(root)
  if (!members) return false
  return members.some(member => liveness.isLiveAfter(opIndex, member))
}

function makeState(union: UnionFind, rootToSlot: Map<number, Slot>): Map<string, number> {
  const state = new Map<string, number>()
  for (const [root, slot] of rootToSlot.entries()) {
    state.set(`${slot.player}\u0000${slot.obj}`, root)
  }
  return state
}

function slotKey(slot: Slot): string {
  return `${slot.player}\u0000${slot.obj}`
}

function slotHasRoot(state: Map<string, number>, slot: Slot): number | null {
  const owner = state.get(slotKey(slot))
  return owner ?? null
}

function writeResult(
  opIndex: number,
  liveness: VIRFunctionLiveness,
  rootMembers: Map<number, ValueId[]>,
  slotState: Map<string, number>,
  rootToSlot: Map<number, Slot>,
  destination: Slot,
  resultRoot: number,
): VIRAllocationFailure | null {
  const key = slotKey(destination)
  const current = slotState.get(key)
  if (current !== undefined && current !== resultRoot && isRootLiveAfter(liveness, rootMembers, current, opIndex)) {
    return { reason: `binary write to ${destination.player} ${destination.obj} in op ${opIndex} clobbers live root ${current}` }
  }

  const previous = rootToSlot.get(resultRoot)
  if (previous && !sameSlot(previous, destination)) {
    slotState.delete(slotKey(previous))
  }

  slotState.set(key, resultRoot)
  rootToSlot.set(resultRoot, destination)
  return null
}

function isValidSlot(slot: Slot): boolean {
  return slot.obj.length > 0 && (slot.obj.startsWith('__') || slot.obj.length > 0)
}

function checkPlanValueMap(plan: VIRSlotPlan, fn: VIRFunction, union: UnionFind): VIRAllocationFailure | null {
  for (const [valueIndex, slot] of plan.valueToSlot.entries()) {
    if (valueIndex < 0) return { reason: `plan in '${fn.name}' has invalid value index ${valueIndex}` }
    if (!slot.obj || !slot.player) {
      return { reason: `plan in '${fn.name}' maps value ${valueIndex} to invalid slot` }
    }
    if (isProtectedSlot(slot) && slot.player !== '$ret') {
      return { reason: `plan in '${fn.name}' maps value ${valueIndex} to protected slot ${slot.player}` }
  }
  }

  const operations = collectFunctionOperations(planModuleToOpsSource(), fn)
  return null
}

function planModuleToOpsSource(): VIRModule {
  return { id: 0 as unknown as never, namespace: '', objective: '', types: [], locs: [], values: [], blocks: [], functions: [], ops: [] }
}

export function collectAllocationFailure(
  module: VIRModule,
  fn: VIRFunction,
  plan: VIRSlotPlan,
): VIRAllocationFailure | null {
  try {
    const operations = collectFunctionOperations(module, fn)
    if (operations.length === 0) return { reason: `function '${fn.name}' has no operations` }

    const { union, members, values } = collectUnionAndMembers(module, fn)
    const liveness = analyzeFunctionLiveness(module, fn)

    let returnRoot = null
    const terminator = operations.at(-1)
    if (!terminator || !isTerminator(terminator)) {
      return { reason: `function '${fn.name}' does not terminate with cf.return` }
    }
    if (terminator.operands.length > 0) {
      returnRoot = asRoot(union, asNumber(terminator.operands[0]))
    }

    for (const value of values) {
      const slot = plan.valueToSlot.get(asNumber(value))
      if (!slot) return { reason: `value ${asNumber(value)} missing slot mapping in '${fn.name}'` }
      if (!isValidSlot(slot)) return { reason: `value ${asNumber(value)} maps to invalid slot in '${fn.name}'` }
      if (isProtectedSlot(slot) && slot.player !== '$ret') {
        return { reason: `value ${asNumber(value)} maps to protected slot ${slot.player}` }
      }
      if (slot.obj !== module.objective) {
        return { reason: `value ${asNumber(value)} maps to foreign objective '${slot.obj}'` }
      }
    }

    for (const op of operations) {
      if (op.kind === 'cf.return') continue
      if (op.kind !== 'arith.constant' && op.kind !== 'arith.identity' && operationOperands(op).length !== 2) {
        if (!isPureOp(op)) return { reason: `unsupported operation '${op.kind}' in '${fn.name}'` }
      }
    }

    let rootToSlot: Map<number, Slot> = new Map<number, Slot>()
    for (const param of fn.paramValues) {
      const root = asRoot(union, asNumber(param))
      const slot = plan.valueToSlot.get(asNumber(param))
      if (!slot) return { reason: `parameter ${asNumber(param)} missing initial slot in '${fn.name}'` }
      const previous = rootToSlot.get(root)
      if (previous && !sameSlot(previous, slot)) {
        return { reason: `parameter root ${root} maps to conflicting initial slots in '${fn.name}'` }
      }
      rootToSlot.set(root, slot)
    }

    const slotState = makeState(union, rootToSlot)

    const plannedOperationByIndex: PlannedOperation[] = []
    if (plan.operations.length !== operations.length) {
      return { reason: `planned operation count mismatch in '${fn.name}'` }
    }
    for (let index = 0; index < operations.length; index += 1) {
      if (plan.operations[index].op.id !== operations[index].id) {
        return { reason: `planned operation order mismatch in '${fn.name}'` }
      }
      plannedOperationByIndex.push(plan.operations[index])
    }

    for (let opIndex = 0; opIndex < operations.length; opIndex += 1) {
      const op = operations[opIndex]
      const planned = plannedOperationByIndex[opIndex]

      const copyResolution = emitParallelCopyInstructions({ copies: planned.copies, scratch: plan.scratchSlot })
      if (copyResolution.kind === 'unsupported') {
        return {
          reason: `parallel copies failed at '${fn.name}' op ${op.id}: ${copyResolution.reason}`,
        }
      }

      for (const move of copyResolution.instructions) {
        const sourceRoot = slotHasRoot(slotState, { player: (move as { src: Slot }).src.player, obj: (move as { src: Slot }).src.obj })
        if (sourceRoot === null) {
          return { reason: `copy source is empty in '${fn.name}' op ${op.id}` }
        }
        const destinationRoot = slotHasRoot(slotState, { player: (move as { dst: Slot }).dst.player, obj: (move as { dst: Slot }).dst.obj })
        if (destinationRoot !== null && destinationRoot !== sourceRoot && isRootLiveAfter(liveness, members, destinationRoot, opIndex)) {
          return {
            reason: `copy destination clobbers live root in '${fn.name}' op ${op.id}`,
          }
        }
        const dst = (move as { dst: Slot }).dst
        slotState.set(slotKey(dst), sourceRoot)
        rootToSlot.set(sourceRoot, dst)
      }

      if (op.kind === 'arith.constant') {
        const resultRoot = asRoot(union, asNumber(op.resultIds[0]))
        const plannedDst = plannedOperationByIndex[opIndex].dstSlot
        const writeFailure = writeResult(opIndex, liveness, members, slotState, rootToSlot, plannedDst, resultRoot)
        if (writeFailure) return writeFailure
        continue
      }

      if (op.kind === 'arith.identity') {
        const sourceRoot = asRoot(union, asNumber(op.operands[0]))
        const resultRoot = asRoot(union, asNumber(op.resultIds[0]))
        if (sourceRoot !== resultRoot) return { reason: `identity root mismatch in '${fn.name}' op ${op.id}` }
        const plannedDst = plannedOperationByIndex[opIndex].dstSlot
        const writeFailure = writeResult(opIndex, liveness, members, slotState, rootToSlot, plannedDst, resultRoot)
        if (writeFailure) return writeFailure
        continue
      }

      if (!isTerminator(op)) {
        const operands = operationOperands(op)
        if (operands.length !== 2) return { reason: `binary arity mismatch in '${fn.name}' op ${op.id}` }

        const lhsRoot = asRoot(union, asNumber(operands[0]))
        const rhsRoot = asRoot(union, asNumber(operands[1]))
        const resultRoot = asRoot(union, asNumber(op.resultIds[0]))
        const lhsSlot = plannedOperationByIndex[opIndex].lhsSlot
        const rhsSlot = plannedOperationByIndex[opIndex].rhsSlot

        if (!lhsSlot || !rhsSlot) return { reason: `planned operands missing for '${fn.name}' op ${op.id}` }
        const lhsObserved = slotHasRoot(slotState, lhsSlot)
        const rhsObserved = slotHasRoot(slotState, rhsSlot)
        const directOperands = lhsObserved === lhsRoot && rhsObserved === rhsRoot
        const swappedOperands = isCommutativeOp(op) && lhsObserved === rhsRoot && rhsObserved === lhsRoot
        if (!directOperands && !swappedOperands) {
          return { reason: `operand slot mismatch for '${fn.name}' op ${op.id}` }
        }

        const plannedDst = plannedOperationByIndex[opIndex].dstSlot
        const writeFailure = writeResult(opIndex, liveness, members, slotState, rootToSlot, plannedDst, resultRoot)
        if (writeFailure) return writeFailure

        continue
      }

      if (terminator.operands.length === 1) {
        const returnRootSlot = plannedOperationByIndex[opIndex].returnSlot
        if (!returnRootSlot && returnRoot !== null) return { reason: `return slot missing in planned op ${op.id}` }
        if (returnRoot !== null && returnRootSlot) {
          const observed = slotHasRoot(slotState, returnRootSlot)
          if (observed !== returnRoot) return { reason: `return slot does not carry returned root in '${fn.name}' op ${op.id}` }
        }
      }
    }

    return null
  } catch (error) {
    if (error instanceof Error) return { reason: error.message }
    return { reason: 'unexpected allocation check failure' }
  }
}

function slotHasRootToSlot(state: Map<string, number>, root: number, slot: Slot): Slot {
  const observed = slotHasRoot(state, slot)
  if (observed === null) return { player: '', obj: '' }
  if (observed !== root) return { player: '__mismatch__', obj: '__' + observed }
  return slot
}
