import {
  cloneVIRModule,
  isPureOp,
  isTerminator,
  operationResults,
} from '../types'
import type { VIROperation, VIRModule } from '../types'
import type { VIRPassResult } from '../pass-manager'

function asNumber(id: { readonly __brand: string }): number {
  return Number(id)
}

function constantValue(module: VIRModule, valueId: number): number | null {
  const value = module.values[valueId]
  if (!value || value.kind !== 'op') return null

  const op = module.ops[asNumber(value.definingOp)]
  if (!op || op.kind !== 'arith.constant') return null

  return op.value
}

function foldBinary(operation: VIROperation, left: number, right: number): number | null {
  if (operation.kind === 'arith.div' && right === 0) return null
  if (operation.kind === 'arith.mod' && right === 0) return null

  switch (operation.kind) {
    case 'arith.add':
      return left + right
    case 'arith.sub':
      return left - right
    case 'arith.mul':
      return left * right
    case 'arith.div':
      return Math.trunc(left / right)
    case 'arith.mod':
      return left % right
    case 'arith.min':
      return Math.min(left, right)
    case 'arith.max':
      return Math.max(left, right)
    default:
      return null
  }
}

function foldConstant(operation: VIROperation, module: VIRModule): VIROperation | null {
  if (isTerminator(operation)) return null

  if (!isPureOp(operation)) return null

  if (operation.kind === 'arith.identity') {
    const operand = constantValue(module, asNumber(operation.operands[0]))
    if (operand === null) return null

    return {
      kind: 'arith.constant',
      id: operation.id,
      block: operation.block,
      loc: operation.loc,
      resultIds: [...operationResults(operation)] as [typeof operation.resultIds[number]],
      type: operation.type,
      value: operand,
      operands: [],
    }
  }

  if (operation.kind === 'arith.constant') return null

  const left = constantValue(module, asNumber(operation.operands[0]))
  const right = constantValue(module, asNumber(operation.operands[1]))
  if (left === null || right === null) return null

  const value = foldBinary(operation, left, right)
  if (value === null) return null

  return {
    kind: 'arith.constant',
    id: operation.id,
    block: operation.block,
    loc: operation.loc,
    resultIds: [...operationResults(operation)] as [typeof operation.resultIds[number]],
    type: operation.type,
    value,
    operands: [],
  }
}

export function constantFoldPass(module: VIRModule): VIRPassResult {
  const next = cloneVIRModule(module)
  let changed = false

  for (const fn of next.functions) {
    for (const blockId of fn.blocks) {
      const block = next.blocks[asNumber(blockId)]
      if (!block || block.id !== blockId) continue

      for (const opId of block.opIds) {
        const op = next.ops[asNumber(opId)]
        if (!op || op.id !== opId) continue

        const folded = foldConstant(op, next)
        if (!folded) continue

        next.ops[asNumber(opId)] = folded
        changed = true
      }
    }
  }

  return { changed, module: next }
}
