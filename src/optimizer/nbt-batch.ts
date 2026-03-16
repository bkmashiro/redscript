/**
 * NBT Batch Read — MIR optimization pass.
 *
 * Eliminates redundant nbt_read instructions within a basic block:
 * if the same (ns, path, scale) is read twice with no intervening nbt_write
 * to that ns, the second read is replaced with a copy from the first read's dst.
 *
 * This reduces expensive `data get` commands in generated .mcfunction files.
 */

import type { MIRFunction, MIRBlock, MIRInstr, Temp } from '../mir/types'

export function nbtBatchRead(fn: MIRFunction): MIRFunction {
  return {
    ...fn,
    blocks: fn.blocks.map(deduplicateBlock),
  }
}

function deduplicateBlock(block: MIRBlock): MIRBlock {
  // Map from "ns\0path\0scale" → dst temp of the first read
  const cache = new Map<string, Temp>()

  const instrs: MIRInstr[] = []
  for (const instr of block.instrs) {
    if (instr.kind === 'nbt_read') {
      const key = `${instr.ns}\0${instr.path}\0${instr.scale}`
      const cached = cache.get(key)
      if (cached !== undefined) {
        // Replace with copy from cached temp
        instrs.push({ kind: 'copy', dst: instr.dst, src: { kind: 'temp', name: cached } })
      } else {
        cache.set(key, instr.dst)
        instrs.push(instr)
      }
    } else if (instr.kind === 'nbt_write') {
      // Invalidate all cached reads for this ns
      for (const key of [...cache.keys()]) {
        if (key.startsWith(instr.ns + '\0')) {
          cache.delete(key)
        }
      }
      instrs.push(instr)
    } else {
      instrs.push(instr)
    }
  }

  return { ...block, instrs }
}
