/**
 * Execute-Store Peephole Pass — LIR optimization pass.
 *
 * Pattern 1: Merges a `call_context` immediately followed by `score_set(dst, value)`
 * into a single `store_cmd_to_score` instruction:
 *
 *   execute [subcommands] run function ns:fn      ← call_context
 *   scoreboard players set $result __ns N         ← score_set
 *
 * becomes:
 *
 *   execute store result score $result __ns [subcommands] run function ns:fn
 *
 * Pattern 2: Merges a `score_set(dst, 0)` immediately followed by a `raw` command
 * of the form `execute <cond> run scoreboard players set $dst __ns 1`:
 *
 *   scoreboard players set $dst __ns 0            ← score_set(dst, 0)
 *   execute <cond> run scoreboard players set $dst __ns 1  ← raw
 *
 * becomes:
 *
 *   execute store success score $dst __ns <cond>
 *
 * This saves one command per boolean comparison (cmp instruction lowering).
 *
 * Safety: only merges when the two instructions are immediately adjacent
 * (no instructions between them) and the destination slot is identical.
 */

import type { LIRFunction, LIRInstr } from '../../lir/types'

/**
 * Regex for Pattern 2's second instruction:
 * execute (if|unless) score ... run scoreboard players set $X OBJ 1
 *
 * Captures:
 *   [1] the full condition part (everything before " run scoreboard ...")
 *   [2] the destination player  ($X)
 *   [3] the destination objective
 */
const SET_ZERO_SET_ONE_RE = /^execute (.+) run scoreboard players set (\S+) (\S+) 1$/

export function execStorePeephole(fn: LIRFunction): LIRFunction {
  const instrs = fn.instructions
  if (instrs.length < 2) return fn

  const result: LIRInstr[] = []
  let changed = false
  let i = 0

  while (i < instrs.length) {
    const curr = instrs[i]
    const next = instrs[i + 1]

    // Pattern 1: call_context immediately followed by score_set
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

    // Pattern 2: score_set(dst, 0) + raw("execute <cond> run scoreboard players set $dst OBJ 1")
    // → raw("execute store success score $dst OBJ <cond>")
    if (
      next &&
      curr.kind === 'score_set' &&
      curr.value === 0 &&
      next.kind === 'raw'
    ) {
      const m = SET_ZERO_SET_ONE_RE.exec(next.cmd)
      if (
        m &&
        m[2] === curr.dst.player &&
        m[3] === curr.dst.obj
      ) {
        const cond = m[1]
        result.push({
          kind: 'raw',
          cmd: `execute store success score ${curr.dst.player} ${curr.dst.obj} ${cond}`,
        })
        changed = true
        i += 2
        continue
      }
    }

    result.push(curr)
    i++
  }

  return changed ? { ...fn, instructions: result } : fn
}
