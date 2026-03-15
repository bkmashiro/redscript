/**
 * Branch Simplification — MIR optimization pass.
 *
 * Replaces `branch(const, then, else)` with an unconditional `jump`:
 * - branch(nonzero, then, else) → jump(then)
 * - branch(0, then, else) → jump(else)
 */

import type { MIRFunction, MIRBlock } from '../mir/types'

export function branchSimplify(fn: MIRFunction): MIRFunction {
  return {
    ...fn,
    blocks: fn.blocks.map(simplifyBlock),
  }
}

function simplifyBlock(block: MIRBlock): MIRBlock {
  if (block.term.kind !== 'branch') return block
  if (block.term.cond.kind !== 'const') return block

  const target = block.term.cond.value !== 0 ? block.term.then : block.term.else
  return {
    ...block,
    term: { kind: 'jump', target },
  }
}
