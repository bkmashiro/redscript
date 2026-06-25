import type { LIRFunction, LIRInstr, LIRModule, Slot } from '../../../lir/types'
import type { ValueId } from '../ids'
import type { VIRFunction, VIRModule, VIROperation } from '../types'
import { isPureOp, isTerminator, operationOperands, operationResults } from '../types'
import { verifyVIR } from '../verifier'
import { collectAllocationFailure } from './allocation-checker'
import { emitPlannedFunction, planSlotsForFunction } from './slot-planner'

interface BrandedId {
  readonly __brand: string
}

export type VirToLirResultUnsupported = { kind: 'unsupported'; reason: string }
export type VirToLirResultOk = { kind: 'ok'; module: LIRModule }
export type VirToLirResult = VirToLirResultOk | VirToLirResultUnsupported

export interface VirToLirOptions {
  mode?: 'direct' | 'planned'
  runAllocationCheck?: boolean
}

function asNumber(id: BrandedId): number {
  return Number(id)
}

function slotForValue(module: VIRModule, valueId: ValueId | undefined): Slot | undefined {
  if (valueId === undefined) return undefined
  const value = module.values[asNumber(valueId)]
  if (!value || value.id !== valueId) return undefined
  return { player: `$v${asNumber(valueId)}`, obj: module.objective }
}

function valueInFunction(module: VIRModule, fn: VIRFunction, valueId: ValueId): boolean {
  const value = module.values[asNumber(valueId)]
  return Boolean(value && value.id === valueId && value.function === fn.id)
}

function emitArithmetic(
  op: VIROperation,
  module: VIRModule,
): { kind: 'ok'; instructions: LIRInstr[] } | VirToLirResultUnsupported {
  if (op.kind === 'cf.return') {
    return {
      kind: 'unsupported',
      reason: `operation '${asNumber(op.id)}' is a return and cannot be emitted as arithmetic`,
    }
  }

  const resultSlot = slotForValue(module, op.resultIds[0])
  if (!resultSlot) {
    return {
      kind: 'unsupported',
      reason: `operation '${asNumber(op.id)}' has invalid result`,
    }
  }

  if (op.kind === 'arith.constant') {
    return {
      kind: 'ok',
      instructions: [{
        kind: 'score_set',
        dst: resultSlot,
        value: op.value,
      }],
    }
  }

  if (op.kind === 'arith.identity') {
    const sourceSlot = slotForValue(module, op.operands[0])
    if (!sourceSlot) {
      return {
        kind: 'unsupported',
        reason: `operation '${asNumber(op.id)}' has missing source operand`,
      }
    }

    return {
      kind: 'ok',
      instructions: [{
        kind: 'score_copy',
        dst: resultSlot,
        src: sourceSlot,
      }],
    }
  }

  const lhsSlot = slotForValue(module, op.operands[0])
  const rhsSlot = slotForValue(module, op.operands[1])
  if (!lhsSlot || !rhsSlot) {
    return {
      kind: 'unsupported',
      reason: `operation '${asNumber(op.id)}' has missing binary operand`,
    }
  }

  const instructions: LIRInstr[] = [{ kind: 'score_copy', dst: resultSlot, src: lhsSlot }]

  if (op.kind === 'arith.add') {
    instructions.push({ kind: 'score_add', dst: resultSlot, src: rhsSlot })
    return { kind: 'ok', instructions }
  }

  if (op.kind === 'arith.sub') {
    instructions.push({ kind: 'score_sub', dst: resultSlot, src: rhsSlot })
    return { kind: 'ok', instructions }
  }

  if (op.kind === 'arith.mul') {
    instructions.push({ kind: 'score_mul', dst: resultSlot, src: rhsSlot })
    return { kind: 'ok', instructions }
  }

  if (op.kind === 'arith.div') {
    instructions.push({ kind: 'score_div', dst: resultSlot, src: rhsSlot })
    return { kind: 'ok', instructions }
  }

  if (op.kind === 'arith.mod') {
    instructions.push({ kind: 'score_mod', dst: resultSlot, src: rhsSlot })
    return { kind: 'ok', instructions }
  }

  if (op.kind === 'arith.min') {
    instructions.push({ kind: 'score_min', dst: resultSlot, src: rhsSlot })
    return { kind: 'ok', instructions }
  }

  instructions.push({ kind: 'score_max', dst: resultSlot, src: rhsSlot })
  return { kind: 'ok', instructions }
}

function verifyFunctionOps(module: VIRModule, fn: VIRFunction): VirToLirResultUnsupported | { kind: 'ok'; opSequence: VIROperation[] } {
  if (fn.blocks.length !== 1) {
    return {
      kind: 'unsupported',
      reason: `function '${fn.name}' has ${fn.blocks.length} blocks (expected 1)`,
    }
  }

  const blockId = fn.blocks[0]
  const block = module.blocks[asNumber(blockId)]
  if (!block || block.id !== blockId) {
    return {
      kind: 'unsupported',
      reason: `function '${fn.name}' has missing entry block ${asNumber(blockId)}`,
    }
  }

  const opSequence: VIROperation[] = []

  for (const opId of block.opIds) {
    const op = module.ops[asNumber(opId)]
    if (!op || op.id !== opId) {
      return {
        kind: 'unsupported',
        reason: `function '${fn.name}' has missing op ${asNumber(opId)}`,
      }
    }
    opSequence.push(op)
  }

  if (opSequence.length === 0) {
    return { kind: 'unsupported', reason: `function '${fn.name}' has no operations` }
  }

  const terminator = opSequence.at(-1)
  if (!terminator || terminator.kind !== 'cf.return') {
    return { kind: 'unsupported', reason: `function '${fn.name}' does not terminate with cf.return` }
  }

  return { kind: 'ok', opSequence }
}

function lowerFunctionDirect(module: VIRModule, fn: VIRFunction): VirToLirResultUnsupported | { kind: 'ok'; functionInstructions: LIRInstr[] } {
  const verified = verifyFunctionOps(module, fn)
  if (verified.kind === 'unsupported') return verified
  const opSequence = verified.opSequence

  const instructions: LIRInstr[] = []

  for (const op of opSequence) {
    if (op.kind === 'cf.return') {
      if (op.operands.length > 1) {
        return {
          kind: 'unsupported',
          reason: `function '${fn.name}' has multi-result return`,
        }
      }

      if (op.operands.length === 1) {
        const returnOperand = op.operands[0]
        const returnSlot = slotForValue(module, returnOperand)
        if (!returnSlot) {
          return {
            kind: 'unsupported',
            reason: `function '${fn.name}' return uses invalid operand`,
          }
        }

        instructions.push({ kind: 'return_value', slot: returnSlot })
        continue
      }

      continue
    }

    if (!isPureOp(op)) {
      return {
        kind: 'unsupported',
        reason: `unsupported non-pure VIR op '${op.kind}' in '${fn.name}'`,
      }
    }

    if (operationResults(op).length !== 1 && !op.kind.startsWith('arith.')) {
      return {
        kind: 'unsupported',
        reason: `op '${asNumber(op.id)}' in '${fn.name}' has unexpected result arity`,
      }
    }

    for (const operand of operationOperands(op)) {
      if (!valueInFunction(module, fn, operand)) {
        return {
          kind: 'unsupported',
          reason: `op '${asNumber(op.id)}' in '${fn.name}' uses invalid operand ${asNumber(operand)}`,
        }
      }
    }

    const emitted = emitArithmetic(op, module)
    if (emitted.kind === 'unsupported') return emitted
    instructions.push(...emitted.instructions)
  }

  return { kind: 'ok', functionInstructions: instructions }
}

function lowerFunctionPlanned(module: VIRModule, fn: VIRFunction): VirToLirResultUnsupported | { kind: 'ok'; functionInstructions: LIRInstr[] } {
  const planned = planSlotsForFunction(module, fn)
  if (planned.kind === 'unsupported') {
    return {
      kind: 'unsupported',
      reason: `planned slotting unsupported for '${fn.name}': ${planned.reason}`,
    }
  }

  const emitted = emitPlannedFunction(planned.plan)
  if (emitted.kind === 'unsupported') {
    return {
      kind: 'unsupported',
      reason: `planned emission failed for '${fn.name}': ${emitted.kind === 'unsupported' ? emitted.reason : 'unknown'}`,
    }
  }

  const allocationFailure = collectAllocationFailure(module, fn, planned.plan)
  if (allocationFailure) {
    return {
      kind: 'unsupported',
      reason: `planned allocation check failed for '${fn.name}': ${allocationFailure.reason}`,
    }
  }

  return { kind: 'ok', functionInstructions: emitted.value }
}

function lowerFunction(module: VIRModule, fn: VIRFunction, options: VirToLirOptions): VirToLirResultUnsupported | { kind: 'ok'; functionInstructions: LIRInstr[] } {
  const mode = options.mode ?? 'direct'
  if (mode === 'planned') return lowerFunctionPlanned(module, fn)
  return lowerFunctionDirect(module, fn)
}

export function lowerVirToLir(module: VIRModule, options: VirToLirOptions = {}): VirToLirResult {
  const validation = verifyVIR(module)
  if (validation.length > 0) {
    return {
      kind: 'unsupported',
      reason: `invalid VIR module: ${validation[0].message}`,
    }
  }

  const functions: LIRFunction[] = []
  const names = new Set<string>()
  const mode = options.mode ?? 'direct'

  for (const fn of module.functions) {
    if (names.has(fn.name)) {
      return {
        kind: 'unsupported',
        reason: `duplicate function name '${fn.name}'`,
      }
    }
    names.add(fn.name)

    const lowered = lowerFunction(module, fn, { mode, runAllocationCheck: options.runAllocationCheck })
    if (lowered.kind === 'unsupported') return lowered

    functions.push({
      name: fn.name,
      instructions: lowered.functionInstructions,
      isMacro: false,
      macroParams: [],
    })
  }

  return {
    kind: 'ok',
    module: {
      namespace: module.namespace,
      objective: module.objective,
      functions,
    },
  }
}
