import type { VIROperation, VIRModule, VIRValue } from '../types'
import {
  cloneVIRModule,
  isPureOp,
  isTerminator,
  operationOperands,
  operationResults,
} from '../types'
import type { VIRPassResult } from '../pass-manager'
import type { OpId } from '../ids'

function asNumber(id: { readonly __brand: string }): number {
  return Number(id)
}

function markRemoved(module: VIRModule, value: VIRValue, reason: string): void {
  const index = asNumber(value.id)
  if (value.kind !== 'op') return

  module.values[index] = {
    kind: 'removed',
    id: value.id,
    function: value.function,
    type: value.type,
    loc: value.loc,
    attrs: { ...value.attrs },
    removedBy: 'dce',
    reason,
  }
}

function collectLiveFromTerminator(op: VIROperation, live: Set<number>): void {
  for (const operand of op.operands) {
    live.add(asNumber(operand))
  }
}

export function dcePass(module: VIRModule): VIRPassResult {
  const next = cloneVIRModule(module)
  let changed = false

  for (const fn of next.functions) {
    const live = new Set<number>(fn.paramValues.map(value => asNumber(value)))

    for (const blockId of fn.blocks.slice().reverse()) {
      const block = next.blocks[asNumber(blockId)]
      if (!block || block.id !== blockId) continue

      const kept: OpId[] = []

      for (let index = block.opIds.length - 1; index >= 0; index -= 1) {
        const op = next.ops[asNumber(block.opIds[index])]
        if (!op || op.id !== block.opIds[index]) continue

        const results = operationResults(op)

        if (isTerminator(op)) {
          collectLiveFromTerminator(op, live)
          kept.push(block.opIds[index])
          continue
        }

        const allPure = isPureOp(op)
        const allUnused = results.every(result => !live.has(asNumber(result)))

        if (allPure && allUnused && results.length > 0) {
          for (const result of results) {
            const value = next.values[asNumber(result)]
            if (!value) continue
            markRemoved(next, value, 'dead value')
          }
          changed = true
          continue
        }

        for (const result of results) {
          live.delete(asNumber(result))
        }

        for (const operand of operationOperands(op)) {
          live.add(asNumber(operand))
        }

        kept.push(block.opIds[index])
      }

      block.opIds = kept.reverse()
    }
  }

  return { changed, module: next }
}
