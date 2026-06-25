import {
  cloneVIRModule,
  isPureOp,
  operationResults,
} from '../types'
import type { VIROperation, VIRModule } from '../types'
import type { VIRPassResult } from '../pass-manager'

function asNumber(id: { readonly __brand: string }): number {
  return Number(id)
}

function isConstantValue(module: VIRModule, valueId: number): number | null {
  const value = module.values[valueId]
  if (!value || value.kind !== 'op') return null

  const op = module.ops[asNumber(value.definingOp)]
  if (!op || op.kind !== 'arith.constant') return null

  return op.value
}

function canonicalize(op: VIROperation, module: VIRModule): VIROperation | null {
  if (!isPureOp(op) || op.kind === 'arith.identity' || op.kind === 'arith.constant') {
    return null
  }

  const left = isConstantValue(module, asNumber(op.operands[0]))
  const right = isConstantValue(module, asNumber(op.operands[1]))

  if (op.kind === 'arith.add') {
    if (left === 0) {
      return {
        kind: 'arith.identity',
        id: op.id,
        block: op.block,
        loc: op.loc,
        resultIds: [...op.resultIds],
        type: op.type,
        operands: [op.operands[1]],
      }
    }

    if (right === 0) {
      return {
        kind: 'arith.identity',
        id: op.id,
        block: op.block,
        loc: op.loc,
        resultIds: [...op.resultIds],
        type: op.type,
        operands: [op.operands[0]],
      }
    }

    return null
  }

  if (op.kind === 'arith.sub' && right === 0) {
    return {
      kind: 'arith.identity',
      id: op.id,
      block: op.block,
      loc: op.loc,
      resultIds: [...op.resultIds],
      type: op.type,
      operands: [op.operands[0]],
    }
  }

  if (op.kind === 'arith.mul') {
    if (left === 0 || right === 0) {
      return {
        kind: 'arith.constant',
        id: op.id,
        block: op.block,
        loc: op.loc,
        resultIds: [...operationResults(op)] as [typeof op.resultIds[number]],
        type: op.type,
        value: 0,
        operands: [],
      }
    }

    if (left === 1) {
      return {
        kind: 'arith.identity',
        id: op.id,
        block: op.block,
        loc: op.loc,
        resultIds: [...op.resultIds],
        type: op.type,
        operands: [op.operands[1]],
      }
    }

    if (right === 1) {
      return {
        kind: 'arith.identity',
        id: op.id,
        block: op.block,
        loc: op.loc,
        resultIds: [...op.resultIds],
        type: op.type,
        operands: [op.operands[0]],
      }
    }
  }

  return null
}

export function canonicalizePass(module: VIRModule): VIRPassResult {
  const next = cloneVIRModule(module)
  let changed = false

  for (const fn of next.functions) {
    for (const blockId of fn.blocks) {
      const block = next.blocks[asNumber(blockId)]
      if (!block || block.id !== blockId) continue

      for (const opId of block.opIds) {
        const op = next.ops[asNumber(opId)]
        if (!op || op.id !== opId) continue

        const replacement = canonicalize(op, next)
        if (!replacement) continue

        if (!('resultIds' in replacement) || replacement.resultIds.length === 0) continue
        if (replacement.kind === 'arith.constant' && replacement.resultIds.length !== 1) continue
        if (replacement.kind === 'arith.identity' && replacement.operands.length !== 1) continue

        next.ops[asNumber(opId)] = replacement
        changed = true
      }
    }
  }

  return { changed, module: next }
}
