/**
 * Execute-Store Peephole Pass — LIR optimization pass.
 *
 * Merges a `call_context` immediately followed by `score_set(dst, value)`
 * into a single `store_cmd_to_score` instruction:
 *
 *   execute [subcommands] run function ns:fn      ← call_context
 *   scoreboard players set $result __ns N         ← score_set
 *
 * becomes:
 *
 *   execute store result score $result __ns [subcommands] run function ns:fn
 *
 * This saves one command when the caller only needs to know whether the
 * execute chain ran (success = 1) or to capture the function's return value.
 *
 * Safety: only merges when the two instructions are immediately adjacent
 * (no instructions between them).
 */

import type { LIRFunction, LIRInstr } from '../../lir/types'

export function execStorePeephole(fn: LIRFunction): LIRFunction {
  const instrs = fn.instructions
  if (instrs.length < 2) return fn

  const result: LIRInstr[] = []
  let changed = false
  let i = 0

  while (i < instrs.length) {
    const curr = instrs[i]
    const next = instrs[i + 1]

    // Pattern: call_context immediately followed by score_set
    if (
      next &&
      curr.kind === 'call_context' &&
      next.kind === 'score_set'
    ) {
      // Merge: execute store result score <dst> [subcommands] run function <fn>
      result.push({
        kind: 'store_cmd_to_score',
        dst: next.dst,
        cmd: curr,
      })
      changed = true
      i += 2
      continue
    }

    result.push(curr)
    i++
  }

  return changed ? { ...fn, instructions: result } : fn
}
