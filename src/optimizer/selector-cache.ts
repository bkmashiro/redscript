/**
 * Selector Cache — MIR optimization pass.
 *
 * Within a single basic block, if the same complex selector (one containing '[')
 * appears in ≥2 call_context instructions (as `as` or `at` subcommands),
 * the pass replaces the 2nd and subsequent occurrences with a simpler
 * tag-based selector `@e[tag=__cache_sel_N]`.
 *
 * Two new call_context instructions are prepended to the block:
 *   1. Cleanup: execute as @e[tag=__cache_sel_N] run <fn: __sel_cleanup_<tag>>
 *      — signals codegen to emit: tag @e[tag=<tag>] remove <tag>
 *   2. Tag-add: execute as <original_selector> run <fn: __sel_tag_<tag>>
 *      — signals codegen to emit: tag @s add <tag>
 *
 * The synthetic fn names `__sel_cleanup_*` and `__sel_tag_*` are a convention
 * recognized by the codegen layer for special-case emission.
 *
 * This is a block-local pass (does not track selector lifetime across block
 * boundaries) so it is always correct with respect to control flow.
 */

import type { MIRFunction, MIRBlock, MIRInstr } from '../mir/types'

export function selectorCache(fn: MIRFunction): MIRFunction {
  let tagId = 0
  return {
    ...fn,
    blocks: fn.blocks.map(block => processBlock(block, () => tagId++)),
  }
}

function processBlock(block: MIRBlock, nextId: () => number): MIRBlock {
  // Count how many times each complex selector appears across call_context instrs
  const selectorCount = new Map<string, number>()
  for (const instr of block.instrs) {
    if (instr.kind === 'call_context') {
      for (const sub of instr.subcommands) {
        if ((sub.kind === 'as' || sub.kind === 'at') && isComplexSelector(sub.selector)) {
          selectorCount.set(sub.selector, (selectorCount.get(sub.selector) ?? 0) + 1)
        }
      }
    }
  }

  // Build a map of selectors that appear ≥2 times → assigned tag name
  const repeated = new Map<string, string>() // selector → tag name
  for (const [sel, count] of selectorCount) {
    if (count >= 2) {
      repeated.set(sel, `__cache_sel_${nextId()}`)
    }
  }

  if (repeated.size === 0) return block

  // Prepend cleanup + tag-add instructions for each repeated selector
  const prefixInstrs: MIRInstr[] = []
  for (const [sel, tag] of repeated) {
    // 1. Cleanup: remove stale tags from any entities that still carry this tag
    prefixInstrs.push({
      kind: 'call_context',
      fn: `__sel_cleanup_${tag}`,
      subcommands: [{ kind: 'as', selector: `@e[tag=${tag}]` }],
    })
    // 2. Tag-add: tag all matching entities with the cache tag
    prefixInstrs.push({
      kind: 'call_context',
      fn: `__sel_tag_${tag}`,
      subcommands: [{ kind: 'as', selector: sel }],
    })
  }

  // Rewrite instructions: first occurrence of each repeated selector is kept
  // as-is; subsequent occurrences are replaced with the tag-based selector.
  const seen = new Set<string>()
  const newInstrs: MIRInstr[] = [...prefixInstrs]
  for (const instr of block.instrs) {
    if (instr.kind === 'call_context') {
      const newSubs = instr.subcommands.map(sub => {
        if ((sub.kind === 'as' || sub.kind === 'at') && repeated.has(sub.selector)) {
          const tag = repeated.get(sub.selector)!
          if (seen.has(sub.selector)) {
            // Subsequent occurrence — use the tag selector
            return { ...sub, selector: `@e[tag=${tag}]` }
          } else {
            // First occurrence — keep original, mark as seen
            seen.add(sub.selector)
            return sub
          }
        }
        return sub
      })
      newInstrs.push({ ...instr, subcommands: newSubs })
    } else {
      newInstrs.push(instr)
    }
  }

  return { ...block, instrs: newInstrs }
}

function isComplexSelector(selector: string): boolean {
  return selector.includes('[')
}
