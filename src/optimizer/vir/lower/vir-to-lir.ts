import type { LIRFunction, LIRInstr, LIRModule, Slot } from '../../../lir/types'
import type { ValueId } from '../ids'
import type { VIRFunction, VIRModule, VIROperation } from '../types'
import { isPureOp, isTerminator, operationOperands, operationResults } from '../types'
import { verifyVIR } from '../verifier'

export type VirToLirResultUnsupported = { kind: 'unsupported'; reason: string }
export type VirToLirResultOk = { kind: 'ok'; module: LIRModule }
export type VirToLirResult = VirToLirResultOk | VirToLirResultUnsupported

function asNumber(id: { readonly __brand: string }): number {
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

  const instructions: LIRInstr[] = [
    { kind: 'score_copy', dst: resultSlot, src: lhsSlot },
  ]

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

function lowerFunction(
  module: VIRModule,
  fn: VIRFunction,
): VirToLirResultUnsupported | { kind: 'ok'; instructions: LIRInstr[] } {
  if (fn.blocks.length !== 1) {
    return {
      kind: 'unsupported',
      reason: `function '${fn.name}' has ${fn.blocks.length} blocks (expected 1)`,
    }
  }

  const block = module.blocks[asNumber(fn.entryBlock)]
  if (!block || block.id !== fn.entryBlock) {
    return {
      kind: 'unsupported',
      reason: `function '${fn.name}' has missing entry block ${asNumber(fn.entryBlock)}`,
    }
  }

  const instructions: LIRInstr[] = []

  for (const opId of block.opIds) {
    const op = module.ops[asNumber(opId)]
    if (!op || op.id !== opId) {
      return {
        kind: 'unsupported',
        reason: `function '${fn.name}' has missing op ${asNumber(opId)}`,
      }
    }

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

    const resultCount = operationResults(op).length
    if (resultCount !== 1 && !op.kind.startsWith('arith.')) {
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

    for (const result of operationResults(op)) {
      const value = module.values[asNumber(result)]
      if (!value || value.id !== result || value.function !== fn.id) {
        return {
          kind: 'unsupported',
          reason: `op '${asNumber(op.id)}' in '${fn.name}' result ${asNumber(result)} missing`,
        }
      }
    }

    const emitted = emitArithmetic(op, module)
    if (emitted.kind === 'unsupported') return emitted
    instructions.push(...emitted.instructions)
  }

  return { kind: 'ok', instructions }
}

export function lowerVirToLir(module: VIRModule): VirToLirResult {
  const validation = verifyVIR(module)
  if (validation.length > 0) {
    return {
      kind: 'unsupported',
      reason: `invalid VIR module: ${validation[0].message}`,
    }
  }

  const functions: LIRFunction[] = []
  const names = new Set<string>()

  for (const fn of module.functions) {
    if (names.has(fn.name)) {
      return {
        kind: 'unsupported',
        reason: `duplicate function name '${fn.name}'`,
      }
    }

    names.add(fn.name)
    const lowered = lowerFunction(module, fn)
    if (lowered.kind === 'unsupported') return lowered

    functions.push({
      name: fn.name,
      instructions: lowered.instructions,
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
