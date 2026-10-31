/**
 * Reuse reads of stable scoreboard holders within a basic block. Calls remain
 * barriers unless a module summary proves an ordinary helper preserves user
 * scores. Copy propagation and DCE can then remove the replacement copies.
 */
import type { MIRFunction, MIRBlock, MIRInstr, Temp } from '../mir/types'

export interface ScoreboardReadContext {
  objective: string
  preservingCalls: ReadonlySet<string>
}

export function scoreboardBatchRead(fn: MIRFunction, context?: ScoreboardReadContext): MIRFunction {
  return {
    ...fn,
    blocks: fn.blocks.map(block => deduplicateBlock(block, context)),
  }
}

function isSelector(player: string): boolean {
  return player.startsWith('@')
}

function deduplicateBlock(block: MIRBlock, context?: ScoreboardReadContext): MIRBlock {
  // Map from "player\0obj" to the temporary holding the first read.
  const cache = new Map<string, Temp>()
  const instrs: MIRInstr[] = []
  for (const instr of block.instrs) {
    // MIR can contain redefinitions after lowering/transformations. Never reuse
    // a cached value whose destination has since been overwritten.
    if ('dst' in instr && instr.dst !== null) {
      for (const [key, value] of cache) {
        if (value === instr.dst) cache.delete(key)
      }
    }

    if (instr.kind === 'score_read') {
      // General selectors may pick different holders on successive evaluations
      // (random order, score filters, etc.). @s retains the current executor.
      if ((isSelector(instr.player) && instr.player !== '@s') || instr.player === '*') {
        instrs.push(instr)
        continue
      }
      const key = `${instr.player}\0${instr.obj}`
      const cached = cache.get(key)
      if (cached !== undefined) {
        instrs.push({
          kind: 'copy', dst: instr.dst, src: { kind: 'temp', name: cached },
          ...(instr.sourceLoc ? { sourceLoc: instr.sourceLoc } : {}),
        })
      } else {
        cache.set(key, instr.dst)
        instrs.push(instr)
      }
    } else if (instr.kind === 'score_write') {
      for (const key of cache.keys()) {
        const [player, objective] = key.split('\0')
        // Selector/wildcard writes may alias a named holder, and @s reads may
        // alias named writes. Different literal holders remain independent.
        if (objective === instr.obj && (player === instr.player ||
          isSelector(player) || isSelector(instr.player) || instr.player === '*')) {
          cache.delete(key)
        }
      }
      instrs.push(instr)
    } else if (instr.kind === 'call') {
      if (!context?.preservingCalls.has(instr.fn)) {
        cache.clear()
      } else {
        // All ordinary calls can write parameter, return and temporary slots in
        // the compiler objective, even when they preserve user scoreboards.
        for (const key of cache.keys()) {
          if (key.split('\0')[1] === context.objective) cache.delete(key)
        }
      }
      instrs.push(instr)
    } else if (instr.kind === 'call_macro' || instr.kind === 'call_context') {
      cache.clear()
      instrs.push(instr)
    } else {
      instrs.push(instr)
    }
  }

  return { ...block, instrs }
}
