import type { LIRInstr, Slot } from '../../../lir/types'
import type { SourceLoc as MirSourceLoc } from '../../../mir/types'
import { isProtectedSlot, sameSlot, slotKey } from '../../lir/analysis'
import type { ValueId } from '../ids'
import { isTerminator, operationOperands, operationResults } from '../types'
import type { VIRFunction, VIRModule, VIROperation } from '../types'
import { analyzeFunctionLiveness, collectFunctionOperations, collectFunctionValues, type VIRFunctionLiveness } from './liveness'
import { resolveParallelCopies } from './parallel-copies'

interface BrandedId {
  readonly __brand: string
}

interface UnionFind {
  parent: Map<number, number>
}

interface SlotCopy {
  dst: Slot
  src: Slot
}

interface SlotWritePlan {
  dstSlot: Slot
  lhsSlot: Slot
  rhsSlot: Slot
  lhsRoot: number
  rhsRoot: number
  copies: SlotCopy[]
  copyCount: number
  destructive: boolean
  score: number
}

export interface PlannedOperation {
  op: VIROperation
  opIndex: number
  copies: SlotCopy[]
  dstSlot: Slot
  lhsSlot?: Slot
  rhsSlot?: Slot
  returnSlot?: Slot
  sourceLoc?: MirSourceLoc
}

export interface VIRSlotPlan {
  functionName: string
  objective: string
  valueToSlot: Map<number, Slot>
  scratchSlot: Slot
  copiedSlotsCount: number
  operations: PlannedOperation[]
}

export type PlanSlotsResult =
  | { kind: 'ok'; plan: VIRSlotPlan }
  | { kind: 'unsupported'; reason: string }

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

function emitInstructionForBinary(op: VIROperation, dst: Slot, src: Slot): LIRInstr {
  if (op.kind === 'arith.add') return { kind: 'score_add', dst, src }
  if (op.kind === 'arith.sub') return { kind: 'score_sub', dst, src }
  if (op.kind === 'arith.mul') return { kind: 'score_mul', dst, src }
  if (op.kind === 'arith.div') return { kind: 'score_div', dst, src }
  if (op.kind === 'arith.mod') return { kind: 'score_mod', dst, src }
  if (op.kind === 'arith.min') return { kind: 'score_min', dst, src }
  return { kind: 'score_max', dst, src }
}

function isCommutativeBinary(op: VIROperation): boolean {
  return op.kind === 'arith.add' || op.kind === 'arith.mul' || op.kind === 'arith.min' || op.kind === 'arith.max'
}

function toMirSourceLoc(module: VIRModule, op: VIROperation): MirSourceLoc | undefined {
  const entry = module.locs[asNumber(op.loc)]
  if (!entry || entry.id !== op.loc) return undefined
  if (entry.loc.kind !== 'source') return undefined

  return {
    file: entry.loc.file,
    line: entry.loc.start.line,
    col: entry.loc.start.col,
  }
}

function buildRootMembers(union: UnionFind, values: ValueId[]): Map<number, ValueId[]> {
  const members = new Map<number, ValueId[]>()
  for (const value of values) {
    const root = asRoot(union, asNumber(value))
    const existing = members.get(root)
    if (existing === undefined) {
      members.set(root, [value])
      continue
    }
    existing.push(value)
  }
  return members
}

function isRootLiveAfter(
  liveness: VIRFunctionLiveness,
  membersByRoot: Map<number, ValueId[]>,
  root: number,
  opIndex: number,
): boolean {
  if (opIndex < 0) return false
  const members = membersByRoot.get(root)
  if (!members) return false
  return members.some(value => liveness.isLiveAfter(opIndex, value))
}

function resolveCopyMoves(scratchSlot: Slot, copies: SlotCopy[]): { kind: 'ok'; moves: SlotCopy[] } | { kind: 'unsupported'; reason: string } {
  if (copies.length === 0) return { kind: 'ok', moves: [] }
  const resolved = resolveParallelCopies({ copies, scratch: scratchSlot })
  if (resolved.kind === 'unsupported') {
    return { kind: 'unsupported', reason: resolved.reason }
  }
  return { kind: 'ok', moves: resolved.moves }
}

export function planSlotsForFunction(module: VIRModule, fn: VIRFunction): PlanSlotsResult {
  try {
    const operations = collectFunctionOperations(module, fn)
    const liveness = analyzeFunctionLiveness(module, fn)
    const values = collectFunctionValues(module, fn, operations)

    if (operations.length === 0) {
      return { kind: 'unsupported', reason: `function '${fn.name}' has no operations` }
    }

    const terminator = operations.at(-1)
    if (!terminator || !isTerminator(terminator)) {
      return { kind: 'unsupported', reason: `function '${fn.name}' does not terminate with cf.return` }
    }

    if (terminator.operands.length > 1) {
      return { kind: 'unsupported', reason: `function '${fn.name}' has unsupported return arity ${terminator.operands.length}` }
    }

    for (const op of operations) {
      if (op.kind !== 'cf.return' && !op.kind.startsWith('arith.')) {
        return { kind: 'unsupported', reason: `unsupported operation '${op.kind}' in '${fn.name}'` }
      }

      if (op.kind === 'arith.constant') {
        if (op.operands.length !== 0 || operationResults(op).length !== 1) {
          return { kind: 'unsupported', reason: `invalid constant op '${op.id}' in '${fn.name}'` }
        }
      } else if (op.kind === 'arith.identity') {
        if (op.operands.length !== 1 || operationResults(op).length !== 1) {
          return { kind: 'unsupported', reason: `invalid identity op '${op.id}' in '${fn.name}'` }
        }
      } else if (!isTerminator(op)) {
        if (operationOperands(op).length !== 2 || operationResults(op).length !== 1) {
          return { kind: 'unsupported', reason: `invalid arithmetic op '${op.id}' in '${fn.name}'` }
        }
      }
    }

    const union: UnionFind = { parent: new Map<number, number>() }
    for (const value of values) {
      union.parent.set(asNumber(value), asNumber(value))
    }

    for (const op of operations) {
      if (op.kind === 'arith.identity') {
        unionRoots(union, asNumber(op.operands[0]), asNumber(op.resultIds[0]))
      }
    }

    const membersByRoot = buildRootMembers(union, values)
    const rootForValue = (valueId: ValueId): number => asRoot(union, asNumber(valueId))

    const scratchSlot: Slot = { player: '$__vir_planner', obj: module.objective }
    const returnSlot: Slot = { player: '$ret', obj: module.objective }
    const returnRoot = terminator.operands.length === 0 ? null : rootForValue(terminator.operands[0])
    const returnIndex = operations.length - 1

    const rootToSlot = new Map<number, Slot>()
    const slotToRoot = new Map<string, number>()
    const valueToSlot = new Map<number, Slot>()

    function slotOwnerKey(slot: Slot): string {
      return slotKey(slot)
    }

    function isRootLive(opIndex: number, root: number): boolean {
      if (opIndex < 0) return false
      const members = membersByRoot.get(root)
      if (!members) return false
      return members.some(value => liveness.isLiveAfter(opIndex, value))
    }

    function isRootDead(opIndex: number, root: number): boolean {
      return !isRootLive(opIndex, root)
    }

    function isSafeToWriteSlot(
      slot: Slot,
      newRoot: number,
      opIndex: number,
      allowClobberSource: number | undefined = undefined,
    ): boolean {
      if (slot.obj !== module.objective) return false
      if (slot.player === scratchSlot.player) return false
      if (slot.player === '$ret' && returnRoot !== newRoot) return false
      if (isProtectedSlot(slot) && slot.player !== '$ret') return false

      const occupant = slotToRoot.get(slotOwnerKey(slot))
      if (occupant === undefined || occupant === newRoot) return true
      if (allowClobberSource !== undefined && allowClobberSource === occupant) {
        return isRootDead(opIndex, allowClobberSource)
      }

      return isRootDead(opIndex, occupant)
    }

    function assignSlot(slot: Slot, root: number): void {
      const priorSlot = rootToSlot.get(root)
      if (priorSlot && !sameSlot(priorSlot, slot)) {
        slotToRoot.delete(slotOwnerKey(priorSlot))
      }

      const priorOccupant = slotToRoot.get(slotOwnerKey(slot))
      if (priorOccupant !== undefined && priorOccupant !== root) {
        rootToSlot.delete(priorOccupant)
      }

      slotToRoot.set(slotOwnerKey(slot), root)
      rootToSlot.set(root, slot)
    }

    function releaseDeadRoots(opIndex: number): void {
      for (const [root, slot] of [...rootToSlot.entries()]) {
        if (isRootDead(opIndex, root)) {
          rootToSlot.delete(root)
          slotToRoot.delete(slotOwnerKey(slot))
        }
      }
    }

    function rootCanBeReturnedAfter(index: number, root: number): boolean {
      if (returnRoot === null || returnRoot !== root || returnIndex <= index) return false
      const members = membersByRoot.get(root)
      if (!members) return false

      return members.every(member => liveness.nextUseAfter(index, member) === returnIndex)
    }

    function resolveCopiesBeforeOp(opIndex: number, copies: SlotCopy[]): { kind: 'ok'; resolved: SlotCopy[] } | { kind: 'unsupported'; reason: string } {
      const resolvedResult = resolveCopyMoves(scratchSlot, copies)
      if (resolvedResult.kind === 'unsupported') return resolvedResult

      for (const move of resolvedResult.moves) {
        const sourceRoot = slotToRoot.get(slotOwnerKey(move.src))
        if (sourceRoot === undefined) {
          return {
            kind: 'unsupported',
            reason: `copy source ${move.src.player} ${move.src.obj} has no live root before op ${opIndex}`,
          }
        }

        const destinationRoot = slotToRoot.get(slotOwnerKey(move.dst))
        if (
          destinationRoot !== undefined &&
          destinationRoot !== sourceRoot &&
          !isRootDead(opIndex - 1, destinationRoot)
        ) {
          return {
            kind: 'unsupported',
            reason: `copy destination ${move.dst.player} ${move.dst.obj} clobbers live root before op ${opIndex}`,
          }
        }

        assignSlot(move.dst, sourceRoot)
      }

      return { kind: 'ok', resolved: resolvedResult.moves }
    }

    function pickCandidateSlot(opIndex: number, resultRoot: number, includeReturn: boolean): Slot[] {
      const seen = new Set<string>()
      const slots: Slot[] = []

      function add(slot: Slot): void {
        const key = slotOwnerKey(slot)
        if (seen.has(key)) return
        seen.add(key)
        slots.push(slot)
      }

      const existing = rootToSlot.get(resultRoot)
      if (existing) add(existing)

      if (includeReturn) add(returnSlot)

      for (const [existingRoot, existingSlot] of rootToSlot.entries()) {
        if (isRootDead(opIndex, existingRoot)) {
          add(existingSlot)
          break
        }
      }

      let suffix = 0
      while (true) {
        const candidate = { player: `$v${suffix}`, obj: module.objective }
        suffix += 1
        const candidateKey = slotOwnerKey(candidate)

        if (slotToRoot.has(candidateKey)) continue
        if (candidate.player === '$ret' || candidate.player === '$p0' || candidate.player === '$__vir_planner') continue
        if (isProtectedSlot(candidate)) continue

        add(candidate)
        break
      }

      return slots
    }

    function chooseBinaryPlan(
      opIndex: number,
      lhsSlot: Slot,
      rhsSlot: Slot,
      lhsRoot: number,
      rhsRoot: number,
      resultRoot: number,
      op: VIROperation,
    ): SlotWritePlan {
      const returnPreferred = rootCanBeReturnedAfter(opIndex, resultRoot)
      const slotCandidates = pickCandidateSlot(opIndex, resultRoot, returnPreferred)

      const candidateSet: SlotWritePlan[] = []

      const consider = (
        chosenLhsSlot: Slot,
        chosenRhsSlot: Slot,
        chosenLhsRoot: number,
        chosenRhsRoot: number,
        allowDestructive: boolean,
      ) => {
        for (const destination of slotCandidates) {
          const destructive = sameSlot(destination, chosenLhsSlot)
          if (destructive && !isRootDead(opIndex, chosenLhsRoot)) continue
          if (!destructive && (sameSlot(destination, chosenLhsSlot) || sameSlot(destination, chosenRhsSlot))) continue

          let copyCount = 0
          const unresolvedCopies: SlotCopy[] = []
          if (!sameSlot(destination, chosenLhsSlot)) {
            unresolvedCopies.push({ dst: destination, src: chosenLhsSlot })
            copyCount = 1
          }

          const allowClobber = destructive ? chosenLhsRoot : undefined
          if (!isSafeToWriteSlot(destination, resultRoot, opIndex, allowClobber)) continue

          let score = 0
          if (destructive) score += 12
          if (sameSlot(destination, returnSlot) && returnPreferred) score += 20
          if (existingRootSlotMatches(resultRoot, destination)) score += 8
          if (isCommutativeBinary(op)) score += 1

          candidateSet.push({
            dstSlot: destination,
            lhsSlot: chosenLhsSlot,
            rhsSlot: chosenRhsSlot,
            lhsRoot: chosenLhsRoot,
            rhsRoot: chosenRhsRoot,
            copies: unresolvedCopies,
            copyCount,
            destructive,
            score,
          })
        }
      }

      const existingRootSlotMatches = (root: number, destination: Slot): boolean => {
        const existing = rootToSlot.get(root)
        return existing !== undefined && sameSlot(existing, destination)
      }

      consider(lhsSlot, rhsSlot, lhsRoot, rhsRoot, true)
      if (isCommutativeBinary(op)) {
        consider(rhsSlot, lhsSlot, rhsRoot, lhsRoot, true)
      }

      if (candidateSet.length > 0) {
        candidateSet.sort((left, right) => {
          if (left.copyCount !== right.copyCount) return left.copyCount - right.copyCount
          if (left.score !== right.score) return right.score - left.score
          if (left.destructive !== right.destructive) return left.destructive ? -1 : 1
          return 0
        })
        return candidateSet[0]
      }

      const fallback: Slot = { player: `$v${slotToRoot.size + rootToSlot.size + opIndex}`, obj: module.objective }
      return {
        dstSlot: fallback,
        lhsSlot,
        rhsSlot,
        lhsRoot,
        rhsRoot,
        copies: [],
        copyCount: 1,
        destructive: false,
        score: 0,
      }
    }

    function preAllocateParams(): boolean {
      for (const param of fn.paramValues) {
        const root = rootForValue(param)
        if (rootToSlot.has(root)) continue

        const slot: Slot = { player: `$v${rootToSlot.size}`, obj: module.objective }
        if (!isSafeToWriteSlot(slot, root, -1)) {
          return false
        }
        assignSlot(slot, root)
        valueToSlot.set(asNumber(param), slot)
      }
      return true
    }

    if (!preAllocateParams()) {
      return { kind: 'unsupported', reason: `function '${fn.name}' cannot pre-allocate parameters` }
    }

    const plannedOperations: PlannedOperation[] = []

    for (let opIndex = 0; opIndex < operations.length; opIndex += 1) {
      const op = operations[opIndex]
      const sourceLoc = toMirSourceLoc(module, op)

      if (op.kind === 'cf.return') {
        if (op.operands.length === 0) {
          plannedOperations.push({
            op,
            opIndex,
            copies: [],
            dstSlot: returnSlot,
            sourceLoc,
          })
          continue
        }

        const resultRoot = rootForValue(op.operands[0])
        const resultSlot = rootToSlot.get(resultRoot)
        if (!resultSlot) {
          return { kind: 'unsupported', reason: `return operand in '${fn.name}' is unassigned` }
        }

        const copies: SlotCopy[] = []
        const finalSlot = sameSlot(resultSlot, returnSlot) ? returnSlot : returnSlot
        if (!sameSlot(finalSlot, resultSlot)) {
          copies.push({ dst: finalSlot, src: resultSlot })
        }

        const resolved = resolveCopiesBeforeOp(opIndex, copies)
        if (resolved.kind === 'unsupported') {
          return { kind: 'unsupported', reason: `return copy failed in '${fn.name}': ${resolved.reason}` }
        }

        assignSlot(finalSlot, resultRoot)
        plannedOperations.push({
          op,
          opIndex,
          copies: resolved.resolved,
          dstSlot: finalSlot,
          returnSlot: finalSlot,
          sourceLoc,
        })
        continue
      }

      if (op.kind === 'arith.constant') {
        const resultRoot = rootForValue(op.resultIds[0])
        const returnPreferred = returnRoot === resultRoot && rootCanBeReturnedAfter(opIndex, resultRoot)
        const candidates = pickCandidateSlot(opIndex, resultRoot, returnPreferred)

        const destination = candidates.find(slot => isSafeToWriteSlot(slot, resultRoot, opIndex))
          ?? null

        if (!destination) {
          return {
            kind: 'unsupported',
            reason: `cannot allocate constant result in '${fn.name}' op ${op.id}`,
          }
        }

        assignSlot(destination, resultRoot)
        valueToSlot.set(asNumber(op.resultIds[0]), destination)
        plannedOperations.push({
          op,
          opIndex,
          copies: [],
          dstSlot: destination,
          sourceLoc,
        })

        releaseDeadRoots(opIndex)
        continue
      }

      if (op.kind === 'arith.identity') {
        const sourceRoot = rootForValue(op.operands[0])
        const resultRoot = rootForValue(op.resultIds[0])
        if (sourceRoot !== resultRoot) {
          return {
            kind: 'unsupported',
            reason: `identity roots mismatch in '${fn.name}' op '${op.id}'`,
          }
        }

        const sourceSlot = rootToSlot.get(sourceRoot)
        if (!sourceSlot) {
          return {
            kind: 'unsupported',
            reason: `identity source slot missing in '${fn.name}' op '${op.id}'`,
          }
        }

        const returnPreferred = returnRoot === resultRoot && rootCanBeReturnedAfter(opIndex, resultRoot)
        const destination = returnPreferred ? returnSlot : sourceSlot

        const copies: SlotCopy[] = []
        if (!sameSlot(destination, sourceSlot)) {
          copies.push({ dst: destination, src: sourceSlot })
        }

        const resolved = resolveCopiesBeforeOp(opIndex, copies)
        if (resolved.kind === 'unsupported') {
          return { kind: 'unsupported', reason: `identity copy failed in '${fn.name}' op ${op.id}: ${resolved.reason}` }
        }

        assignSlot(destination, resultRoot)
        valueToSlot.set(asNumber(op.resultIds[0]), destination)
        plannedOperations.push({
          op,
          opIndex,
          copies: resolved.resolved,
          dstSlot: destination,
          lhsSlot: sourceSlot,
          sourceLoc,
        })

        releaseDeadRoots(opIndex)
        continue
      }

      const operands = operationOperands(op)
      const lhsRoot = rootForValue(operands[0])
      const rhsRoot = rootForValue(operands[1])
      const resultRoot = rootForValue(op.resultIds[0])
      const lhsSlot = rootToSlot.get(lhsRoot)
      const rhsSlot = rootToSlot.get(rhsRoot)

      if (!lhsSlot || !rhsSlot) {
        return {
          kind: 'unsupported',
          reason: `binary op '${op.id}' in '${fn.name}' has missing source slots`,
        }
      }

      const binaryPlan = chooseBinaryPlan(opIndex, lhsSlot, rhsSlot, lhsRoot, rhsRoot, resultRoot, op)
      const resolved = { kind: 'ok' as const, resolved: binaryPlan.copies }

      const allowClobber = binaryPlan.destructive ? lhsRoot : undefined
      if (!isSafeToWriteSlot(binaryPlan.dstSlot, resultRoot, opIndex, allowClobber)) {
        return {
          kind: 'unsupported',
          reason: `binary destination unsafe in '${fn.name}' op ${op.id}`,
        }
      }

      if (rootToSlot.get(binaryPlan.lhsRoot) !== binaryPlan.lhsSlot) {
        return {
          kind: 'unsupported',
          reason: `binary lhs slot changed in '${fn.name}' op ${op.id}`,
        }
      }

      if (rootToSlot.get(binaryPlan.rhsRoot) !== binaryPlan.rhsSlot) {
        return {
          kind: 'unsupported',
          reason: `binary rhs slot changed in '${fn.name}' op ${op.id}`,
        }
      }

      assignSlot(binaryPlan.dstSlot, resultRoot)
      valueToSlot.set(asNumber(op.resultIds[0]), binaryPlan.dstSlot)
      plannedOperations.push({
        op,
        opIndex,
        copies: resolved.resolved,
        dstSlot: binaryPlan.dstSlot,
        lhsSlot: binaryPlan.lhsSlot,
        rhsSlot: binaryPlan.rhsSlot,
        sourceLoc,
      })
      releaseDeadRoots(opIndex)
    }

    for (const value of values) {
      const valueNumber = asNumber(value)
      const root = rootForValue(value)
      const slot = rootToSlot.get(root) ?? valueToSlot.get(valueNumber)
      if (!slot) {
        return {
          kind: 'unsupported',
          reason: `value ${valueNumber} in '${fn.name}' has no slot allocation`,
        }
      }
      valueToSlot.set(valueNumber, slot)
    }

    const copiedSlotsCount = plannedOperations.reduce((sum, op) => sum + op.copies.length, 0)
    return {
      kind: 'ok',
      plan: {
        functionName: fn.name,
        objective: module.objective,
        valueToSlot,
        scratchSlot,
        copiedSlotsCount,
        operations: plannedOperations,
      },
    }
  } catch (error) {
    return { kind: 'unsupported', reason: error instanceof Error ? error.message : 'failed to plan VIR slots' }
  }
}

export function emitPlannedFunction(plan: VIRSlotPlan): { kind: 'ok'; value: LIRInstr[] } | { kind: 'unsupported'; reason: string } {
  const instructions: LIRInstr[] = []

  for (const op of plan.operations) {
    for (const copy of op.copies) {
      instructions.push({
        kind: 'score_copy',
        dst: copy.dst,
        src: copy.src,
        sourceLoc: op.sourceLoc,
      })
    }

    if (op.op.kind === 'arith.constant') {
      instructions.push({
        kind: 'score_set',
        dst: op.dstSlot,
        value: op.op.value,
        sourceLoc: op.sourceLoc,
      })
      continue
    }

    if (op.op.kind === 'arith.identity') {
      continue
    }

    if (op.op.kind === 'cf.return') {
      if (op.op.operands.length === 0) continue

      const slot = op.returnSlot ?? op.dstSlot
      if (!slot) {
        return {
          kind: 'unsupported',
          reason: `return op missing destination slot in '${plan.functionName}'`,
        }
      }

      instructions.push({
        kind: 'return_value',
        slot,
        sourceLoc: op.sourceLoc,
      })
      continue
    }

    if (!op.lhsSlot || !op.rhsSlot) {
      return { kind: 'unsupported', reason: `binary op '${op.op.id}' missing operand slots` }
    }

    instructions.push({
      ...emitInstructionForBinary(op.op, op.dstSlot, op.rhsSlot),
      sourceLoc: op.sourceLoc,
    })
  }

  return { kind: 'ok', value: instructions }
}
