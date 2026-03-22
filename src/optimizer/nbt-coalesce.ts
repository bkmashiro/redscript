/**
 * NBT Write Coalescing — MIR backward analysis pass.
 *
 * Removes redundant consecutive writes to the same NBT storage path.
 * If a path is written multiple times with no intervening read, only the
 * last write (in program order) has any observable effect.
 *
 * Algorithm (backward scan per basic block):
 * 1. Scan instructions from last to first.
 * 2. Maintain `writtenPaths: Set<string>` — paths that are definitely
 *    overwritten later in the block.
 * 3. nbt_write(path, ...):
 *    - If path is in writtenPaths → redundant, drop it.
 *    - Otherwise → keep it, add path to writtenPaths.
 * 4. nbt_read(path) / nbt_read_dynamic / nbt_list_len → remove path
 *    from writtenPaths (the value is observed, cannot be dropped).
 * 5. call / call_macro / call_context → conservatively clear writtenPaths
 *    (callee may read any NBT path).
 *
 * This is a single-block analysis; cross-block dataflow is left to
 * future work (inter-block backward analysis).
 */

import type { MIRBlock, MIRFunction, MIRInstr } from '../mir/types'

export function nbtCoalesce(fn: MIRFunction): MIRFunction {
  return {
    ...fn,
    blocks: fn.blocks.map(coalesceBlock),
  }
}

function coalesceBlock(block: MIRBlock): MIRBlock {
  const writtenPaths = new Set<string>()
  // Scan backwards and mark which instructions to keep
  const keep: boolean[] = new Array(block.instrs.length).fill(true)

  for (let i = block.instrs.length - 1; i >= 0; i--) {
    const instr = block.instrs[i]
    processInstr(instr, writtenPaths, keep, i)
  }

  return {
    ...block,
    instrs: block.instrs.filter((_, i) => keep[i]),
  }
}

function nbtKey(ns: string, path: string): string {
  return `${ns}\0${path}`
}

function processInstr(
  instr: MIRInstr,
  writtenPaths: Set<string>,
  keep: boolean[],
  idx: number,
): void {
  switch (instr.kind) {
    case 'nbt_write': {
      const key = nbtKey(instr.ns, instr.path)
      if (writtenPaths.has(key)) {
        // This write will be overwritten before being read — drop it.
        keep[idx] = false
      } else {
        writtenPaths.add(key)
      }
      break
    }

    case 'nbt_read': {
      // Value is consumed here; the write that produces it is no longer redundant.
      writtenPaths.delete(nbtKey(instr.ns, instr.path))
      break
    }

    case 'nbt_read_dynamic': {
      // Dynamic read — conservatively invalidate all paths with the same ns+prefix.
      // Simpler: clear everything (safe, just less precise).
      writtenPaths.clear()
      break
    }

    case 'nbt_list_len': {
      writtenPaths.delete(nbtKey(instr.ns, instr.path))
      break
    }

    case 'nbt_write_dynamic': {
      // Dynamic write — we cannot determine the exact path statically.
      // Conservatively do NOT add anything to writtenPaths, and do NOT remove
      // anything (a dynamic write could alias any path).
      writtenPaths.clear()
      break
    }

    case 'call':
    case 'call_macro':
    case 'call_context': {
      // Callee may read any NBT path — conservatively flush.
      writtenPaths.clear()
      break
    }

    default:
      // Arithmetic, comparisons, copies, score ops, etc. — no NBT effect.
      break
  }
}
