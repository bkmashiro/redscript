/**
 * Scoreboard Read Batching — MIR optimization pass.
 *
 * Eliminates redundant score_read instructions within a basic block:
 * if the same (player, obj) is read twice with no intervening score_write
 * to that player+obj, the second read is replaced with a copy from the
 * first read's dst.
 *
 * This reduces expensive `scoreboard players get` commands in generated
 * .mcfunction files.
 */

import type { MIRFunction, MIRBlock, MIRInstr, Temp } from '../mir/types'

export function scoreboardBatchRead(fn: MIRFunction): MIRFunction {
  return {
    ...fn,
    blocks: fn.blocks.map(deduplicateBlock),
  }
}

function deduplicateBlock(block: MIRBlock): MIRBlock {
  // Map from "player\0obj" → dst temp of the first read
  const cache = new Map<string, Temp>()

  const instrs: MIRInstr[] = []
  for (const instr of block.instrs) {
    if (instr.kind === 'score_read') {
      const key = `${instr.player}\0${instr.obj}`
      const cached = cache.get(key)
      if (cached !== undefined) {
        // Replace with copy from cached temp
        instrs.push({ kind: 'copy', dst: instr.dst, src: { kind: 'temp', name: cached } })
      } else {
        cache.set(key, instr.dst)
        instrs.push(instr)
      }
    } else if (instr.kind === 'score_write') {
      // Invalidate cache for this player+obj
      cache.delete(`${instr.player}\0${instr.obj}`)
      instrs.push(instr)
    } else if (instr.kind === 'call' || instr.kind === 'call_macro') {
      // Conservative: calls may have side effects that modify scoreboards
      cache.clear()
      instrs.push(instr)
    } else {
      instrs.push(instr)
    }
  }

  return { ...block, instrs }
}
