import type { VIROperation, VIRModule } from '../types'
import {
  cloneVIRModule,
  isPureOp,
  isTerminator,
  operationOperands,
  operationResults,
} from '../types'
import type { VIRPassResult } from '../pass-manager'
import type { OpId, ValueId } from '../ids'

function asNumber(id: { readonly __brand: string }): number {
  return Number(id)
}

function canonicalKey(op: VIROperation): string {
  if (op.kind === 'cf.return') {
    return `return:${operationOperands(op).map(value => asNumber(value)).join(',')}`
  }

  if (op.kind === 'arith.constant') {
    return `constant:${op.type ? asNumber(op.type) : 'none'}:${op.value}`
  }

  if (op.kind === 'arith.identity') {
    return `identity:${asNumber(op.type)}:${asNumber(op.operands[0])}`
  }

  const left = asNumber(op.operands[0])
  const right = asNumber(op.operands[1])
  const type = `t${asNumber(op.type)}`

  if (op.kind === 'arith.add' || op.kind === 'arith.mul' || op.kind === 'arith.min' || op.kind === 'arith.max') {
    const ordered = left <= right ? `${left},${right}` : `${right},${left}`
    return `${op.kind}:${type}:${ordered}`
  }

  return `${op.kind}:${type}:${left},${right}`
}

function rewriteOperand(value: ValueId, replacements: Map<ValueId, ValueId>): ValueId {
  let current = value
  const seen = new Set<number>()

  while (replacements.has(current)) {
    const currentId = asNumber(current)
    if (seen.has(currentId)) {
      return current
    }
    seen.add(currentId)

    const next = replacements.get(current)
    if (next === undefined) break
    current = next
  }

  return current
}

function markRemoved(module: VIRModule, valueId: ValueId): void {
  const index = asNumber(valueId)
  const value = module.values[index]
  if (!value || value.kind !== 'op') return

  module.values[index] = {
    kind: 'removed',
    id: value.id,
    function: value.function,
    type: value.type,
    loc: value.loc,
    attrs: { ...value.attrs },
    removedBy: 'cse',
    reason: 'common subexpression',
  }
}

export function localCsePass(module: VIRModule): VIRPassResult {
  const next = cloneVIRModule(module)
  let changed = false

  for (const fn of next.functions) {
    for (const blockId of fn.blocks) {
      const block = next.blocks[asNumber(blockId)]
      if (!block || block.id !== blockId) continue

      const seen = new Map<string, ValueId>()
      const replacement = new Map<ValueId, ValueId>()
      const kept: OpId[] = []

      for (const opId of block.opIds) {
        const op = next.ops[asNumber(opId)]
        if (!op || op.id !== opId) continue

        let rewritten = op

        if (!isTerminator(op)) {
          const operands = operationOperands(op).map(value => rewriteOperand(value, replacement))
          if (op.kind === 'arith.constant') {
            // constants are already canonical by value
          } else if (op.kind === 'arith.identity') {
            rewritten = {
              kind: 'arith.identity',
              id: op.id,
              block: op.block,
              loc: op.loc,
              resultIds: [...op.resultIds],
              type: op.type,
              operands: [operands[0]],
            }
          } else {
            rewritten = {
              kind: op.kind,
              id: op.id,
              block: op.block,
              loc: op.loc,
              resultIds: [...op.resultIds],
              type: op.type,
              operands: [operands[0], operands[1]],
            }
          }
        } else {
        rewritten = {
            kind: 'cf.return',
            id: op.id,
            block: op.block,
            loc: op.loc,
            resultIds: [],
            operands: operationOperands(op).map(value => rewriteOperand(value, replacement)),
          }
        }

        next.ops[asNumber(opId)] = rewritten

        if (isTerminator(op)) {
          kept.push(opId)
          continue
        }

        if (!isPureOp(rewritten) || operationResults(rewritten).length !== 1) {
          kept.push(opId)
          continue
        }

        const key = canonicalKey(rewritten)
        const existing = seen.get(key)
          if (existing === undefined) {
          const keyValue = operationResults(rewritten)[0]
          if (keyValue === undefined) {
            kept.push(opId)
            continue
          }

          seen.set(key, keyValue)
          kept.push(opId)
          continue
        }

        const replacedValue = operationResults(rewritten)[0]
        if (replacedValue === undefined) {
          kept.push(opId)
          continue
        }

        markRemoved(next, replacedValue)
        replacement.set(replacedValue, existing)
        changed = true
      }

      block.opIds = kept
    }
  }

  return { changed, module: next }
}
