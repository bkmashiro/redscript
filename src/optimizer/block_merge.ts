/**
 * Block Merging — MIR optimization pass.
 *
 * Merges a block B into its sole predecessor A when:
 * - A ends with an unconditional jump to B
 * - B has exactly one predecessor (A)
 * - B is not the entry block
 *
 * The merged block keeps A's id and combines A's instrs + B's instrs + B's terminator.
 */

import type { MIRFunction, MIRBlock, BlockId } from '../mir/types'

export function blockMerge(fn: MIRFunction): MIRFunction {
  let blocks = fn.blocks

  // Iterate until no more merges possible
  let changed = true
  while (changed) {
    changed = false
    const blockMap = new Map(blocks.map(b => [b.id, b]))
    const predCounts = computePredCounts(blocks)

    const newBlocks: MIRBlock[] = []
    const removed = new Set<BlockId>()

    for (const block of blocks) {
      if (removed.has(block.id)) continue

      // Check: does this block jump unconditionally to a single-pred successor?
      if (block.term.kind === 'jump') {
        const targetId = block.term.target
        const target = blockMap.get(targetId)
        if (target && targetId !== fn.entry && predCounts.get(targetId) === 1) {
          // Merge target into this block
          const merged: MIRBlock = {
            id: block.id,
            instrs: [...block.instrs, ...target.instrs],
            term: target.term,
            preds: block.preds,
          }
          newBlocks.push(merged)
          removed.add(targetId)
          changed = true
          continue
        }
      }

      newBlocks.push(block)
    }

    blocks = newBlocks
  }

  // Recompute preds after merging
  blocks = recomputePreds(blocks)

  return { ...fn, blocks }
}

function computePredCounts(blocks: MIRBlock[]): Map<BlockId, number> {
  const counts = new Map<BlockId, number>()
  for (const b of blocks) counts.set(b.id, 0)

  for (const block of blocks) {
    for (const target of getTermTargets(block.term)) {
      counts.set(target, (counts.get(target) ?? 0) + 1)
    }
  }
  return counts
}

function recomputePreds(blocks: MIRBlock[]): MIRBlock[] {
  const predMap = new Map<BlockId, BlockId[]>()
  for (const b of blocks) predMap.set(b.id, [])

  for (const block of blocks) {
    for (const target of getTermTargets(block.term)) {
      const preds = predMap.get(target)
      if (preds) preds.push(block.id)
    }
  }

  return blocks.map(b => ({ ...b, preds: predMap.get(b.id) ?? [] }))
}

function getTermTargets(term: MIRBlock['term']): BlockId[] {
  switch (term.kind) {
    case 'jump': return [term.target]
    case 'branch': return [term.then, term.else]
    default: return []
  }
}
