/**
 * Loop-Invariant Code Motion (LICM) — MIR optimization pass.
 *
 * For each natural loop (detected by the loop_header / loop_body / loop_latch
 * naming convention used by the RedScript HIR→MIR lowering), instructions
 * whose operands are not modified inside the loop and that have no side
 * effects are hoisted to a newly-inserted preheader block that jumps to the
 * loop header.
 *
 * Algorithm:
 *   1. Identify all loops via the loop_header block naming convention.
 *   2. Collect all temps defined anywhere in the loop (variant set).
 *   3. Walk each loop block's instructions; an instruction is loop-invariant
 *      when:
 *        a. It has no side effects (no call, nbt_write, score_write, etc.).
 *        b. Every operand is either a constant OR a temp not in the variant set.
 *   4. Insert a fresh preheader block before the loop header, redirect the
 *      predecessor(s) of the header (excluding the back-edge latch) to the
 *      preheader, and move the hoisted instructions there.
 *   5. Remove hoisted instructions from their original blocks.
 *   6. Recompute predecessor lists.
 *
 * Limitations:
 *   - Only handles the canonical loop shape produced by the RedScript compiler
 *     (loop_header / loop_body / loop_latch block id prefixes).
 *   - Requires that the loop have exactly one non-back-edge predecessor of
 *     the header (i.e. one entry edge).
 *   - Does not hoist instructions that could trap (div/mod with a variable
 *     denominator) — we conservatively keep those in place.
 */

import type { MIRFunction, MIRBlock, MIRInstr, Operand, Temp, BlockId } from '../mir/types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function licm(fn: MIRFunction): MIRFunction {
  let current = fn
  let changed = true
  // Iterate to fixpoint — multiple loops, or newly-exposed invariants
  while (changed) {
    changed = false
    const result = tryHoistOne(current)
    if (result !== current) {
      current = result
      changed = true
    }
  }
  return current
}

// ---------------------------------------------------------------------------
// Core: try to hoist invariant instructions from one loop
// ---------------------------------------------------------------------------

interface LoopInfo {
  headerId: BlockId
  /** All block ids that belong to the loop body (header + body blocks + latch) */
  loopBlockIds: Set<BlockId>
  /** The single non-back-edge predecessor of the header */
  preHeaderPredId: BlockId
  /** The latch block id (back-edge source) */
  latchId: BlockId
}

function tryHoistOne(fn: MIRFunction): MIRFunction {
  const blockMap = new Map(fn.blocks.map(b => [b.id, b]))

  for (const block of fn.blocks) {
    if (!block.id.startsWith('loop_header')) continue
    const info = analyzeLoop(fn, blockMap, block)
    if (!info) continue

    const hoisted = collectInvariant(info, blockMap, fn)
    if (hoisted.length === 0) continue

    return applyHoist(fn, blockMap, info, hoisted)
  }

  return fn
}

// ---------------------------------------------------------------------------
// Loop detection
// ---------------------------------------------------------------------------

function analyzeLoop(
  fn: MIRFunction,
  blockMap: Map<BlockId, MIRBlock>,
  header: MIRBlock,
): LoopInfo | null {
  // Header must branch (loop condition check)
  if (header.term.kind !== 'branch') return null

  // Find the latch: the block that jumps back to the header
  const latchId = findLatch(fn, header.id)
  if (!latchId) return null

  // Find the non-back-edge predecessor (the block that first enters the loop)
  const preHeaderPredId = findPreHeaderPred(fn, header.id, latchId)
  if (!preHeaderPredId) return null

  // Collect all loop block ids: header + any block reachable from header
  // that can reach the latch (simple: everything up to and including latch)
  const loopBlockIds = collectLoopBlocks(fn, blockMap, header.id, latchId)

  return { headerId: header.id, loopBlockIds, preHeaderPredId, latchId }
}

/** Find the latch: a predecessor of header that is dominated by header.
 *  In the canonical shape, it's the block with id prefix loop_latch that
 *  jumps back to the header.  Fall back to any predecessor != preheader. */
function findLatch(fn: MIRFunction, headerId: BlockId): BlockId | null {
  for (const block of fn.blocks) {
    if (block.id.startsWith('loop_latch')) {
      const targets = getTermTargets(block.term)
      if (targets.includes(headerId)) return block.id
    }
  }
  // Fallback: any predecessor that comes after the header in block order
  // (a back-edge in the CFG)
  const headerIdx = fn.blocks.findIndex(b => b.id === headerId)
  for (let i = headerIdx + 1; i < fn.blocks.length; i++) {
    const block = fn.blocks[i]
    const targets = getTermTargets(block.term)
    if (targets.includes(headerId)) return block.id
  }
  return null
}

/** Find the single non-latch predecessor of the header. */
function findPreHeaderPred(fn: MIRFunction, headerId: BlockId, latchId: BlockId): BlockId | null {
  const preds: BlockId[] = []
  for (const block of fn.blocks) {
    if (block.id === latchId) continue
    const targets = getTermTargets(block.term)
    if (targets.includes(headerId)) preds.push(block.id)
  }
  return preds.length === 1 ? preds[0] : null
}

/**
 * Collect all block ids that belong to the loop using backward reachability.
 *
 * Algorithm: start from the latch and follow predecessors backward until we
 * reach the header. Every visited block (including header and latch) is part
 * of the loop. This is correct regardless of block naming conventions, so it
 * handles branches, merges, and nested conditionals inside the loop body.
 */
function collectLoopBlocks(
  fn: MIRFunction,
  blockMap: Map<BlockId, MIRBlock>,
  headerId: BlockId,
  latchId: BlockId,
): Set<BlockId> {
  // Build predecessor map
  const predsMap = new Map<BlockId, BlockId[]>()
  for (const b of fn.blocks) predsMap.set(b.id, [])
  for (const b of fn.blocks) {
    for (const tgt of getTermTargets(b.term)) {
      const list = predsMap.get(tgt)
      if (list) list.push(b.id)
    }
  }

  // Backward BFS from latch to header
  const result = new Set<BlockId>()
  const queue: BlockId[] = [latchId]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (result.has(id)) continue
    result.add(id)
    if (id === headerId) continue  // don't go past the header
    for (const pred of predsMap.get(id) ?? []) {
      if (!result.has(pred)) queue.push(pred)
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Invariant detection
// ---------------------------------------------------------------------------

interface HoistedInstr {
  fromBlockId: BlockId
  instrIndex: number
  instr: MIRInstr
}

function collectInvariant(
  info: LoopInfo,
  blockMap: Map<BlockId, MIRBlock>,
  fn: MIRFunction,
): HoistedInstr[] {
  // Step 1: collect the set of all temps defined (written) anywhere in the loop
  const variantTemps = new Set<Temp>()
  for (const id of info.loopBlockIds) {
    const block = blockMap.get(id)
    if (!block) continue
    for (const instr of block.instrs) {
      const dst = getInstrDst(instr)
      if (dst !== null) variantTemps.add(dst)
    }
    // Terminator dsts (there are none in practice, but be safe)
    const termDst = getInstrDst(block.term)
    if (termDst !== null) variantTemps.add(termDst)
  }

  // Step 2: iteratively find invariant instructions
  // (an instr whose operands are all non-variant can itself be treated as
  //  non-variant after it is removed, exposing further candidates)
  const hoisted: HoistedInstr[] = []
  let changed = true
  const removedKeys = new Set<string>()  // "blockId:index"

  // Compute the set of temps defined OUTSIDE the loop (in preheader or earlier).
  // An instruction can only be safely hoisted from the loop body if its dst is
  // NOT already defined outside the loop — otherwise hoisting would shadow the
  // prior value when the loop iterates zero times (e.g. while(false)).
  const definedOutsideLoop = new Set<Temp>()
  for (const block of fn.blocks) {
    if (info.loopBlockIds.has(block.id)) continue  // skip loop blocks
    for (const instr of block.instrs) {
      const d = getInstrDst(instr)
      if (d !== null) definedOutsideLoop.add(d)
    }
  }

  while (changed) {
    changed = false
    for (const id of info.loopBlockIds) {
      const block = blockMap.get(id)
      if (!block) continue

      for (let i = 0; i < block.instrs.length; i++) {
        const key = `${id}:${i}`
        if (removedKeys.has(key)) continue

        const instr = block.instrs[i]
        const dst = getInstrDst(instr)

        // Must have a dst (otherwise it's a side-effectful no-dst instr)
        if (dst === null) continue

        // Must not have side effects
        if (hasSideEffects(instr)) continue

        // Skip div/mod with variable denominator (potential trap)
        if ((instr.kind === 'div' || instr.kind === 'mod') && instr.b.kind === 'temp') continue

        // All source operands must be invariant (not in variantTemps)
        if (!allOperandsInvariant(instr, variantTemps)) continue

        // Don't hoist if there are OTHER writers of dst in the loop (excluding
        // this instruction itself). If another non-hoisted instruction also writes
        // dst, hoisting this one would leave stale values on subsequent iterations.
        const currentKeyForCheck = key  // this instruction's key (not yet in removedKeys)
        if (hasOtherWriters(dst, info.loopBlockIds, blockMap, removedKeys, currentKeyForCheck)) continue

        // Don't hoist if dst is also defined outside the loop. Hoisting would
        // shadow the prior value when the loop executes zero times.
        if (definedOutsideLoop.has(dst)) continue

        // This instruction is loop-invariant — hoist it
        hoisted.push({ fromBlockId: id, instrIndex: i, instr })
        removedKeys.add(key)
        // After hoisting, the dst is no longer variant inside the loop
        // (we already checked above that no other writer remains).
        variantTemps.delete(dst)
        changed = true
      }
    }
  }

  return hoisted
}

/** Returns true if there exists another non-hoisted instruction in the loop
 *  (other than `excludeKey`) that also writes to `dst`. */
function hasOtherWriters(
  dst: Temp,
  loopBlockIds: Set<BlockId>,
  blockMap: Map<BlockId, MIRBlock>,
  removedKeys: Set<string>,
  excludeKey: string,
): boolean {
  for (const id of loopBlockIds) {
    const block = blockMap.get(id)
    if (!block) continue
    for (let i = 0; i < block.instrs.length; i++) {
      const k = `${id}:${i}`
      if (k === excludeKey) continue  // skip the current candidate
      if (removedKeys.has(k)) continue  // skip already-hoisted
      const d = getInstrDst(block.instrs[i])
      if (d === dst) return true
    }
  }
  return false
}

function allOperandsInvariant(instr: MIRInstr, variantTemps: Set<Temp>): boolean {
  for (const op of getSourceOperands(instr)) {
    if (op.kind === 'temp' && variantTemps.has(op.name)) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Applying the hoist
// ---------------------------------------------------------------------------

function applyHoist(
  fn: MIRFunction,
  blockMap: Map<BlockId, MIRBlock>,
  info: LoopInfo,
  hoisted: HoistedInstr[],
): MIRFunction {
  const { headerId, preHeaderPredId, latchId } = info

  // Build a key set for quick lookup: "blockId:instrIndex"
  const hoistedKeys = new Set(hoisted.map(h => `${h.fromBlockId}:${h.instrIndex}`))
  // Collect hoisted instrs in order (they were collected left-to-right)
  const hoistedInstrs = hoisted.map(h => h.instr)

  // Insert a fresh preheader block
  const preHeaderId = headerId.replace('loop_header', 'loop_preheader')

  const preHeaderBlock: MIRBlock = {
    id: preHeaderId,
    instrs: hoistedInstrs,
    term: { kind: 'jump', target: headerId },
    preds: [],  // will be recomputed
  }

  // Rewrite the predecessor's jump from header → preHeader
  const newBlocks: MIRBlock[] = []
  for (const block of fn.blocks) {
    if (block.id === preHeaderPredId) {
      // Redirect its outgoing edge(s) from headerId to preHeaderId
      newBlocks.push({
        ...block,
        term: redirectTerm(block.term, headerId, preHeaderId),
      })
      // Insert the new preheader right after this block
      newBlocks.push(preHeaderBlock)
    } else {
      // Remove hoisted instructions from their source blocks
      if (info.loopBlockIds.has(block.id)) {
        const newInstrs = block.instrs.filter((_, i) => !hoistedKeys.has(`${block.id}:${i}`))
        newBlocks.push({ ...block, instrs: newInstrs })
      } else {
        newBlocks.push(block)
      }
    }
  }

  return { ...fn, blocks: recomputePreds(newBlocks) }
}

function redirectTerm(term: MIRInstr, from: BlockId, to: BlockId): MIRInstr {
  switch (term.kind) {
    case 'jump':
      return term.target === from ? { ...term, target: to } : term
    case 'branch':
      return {
        ...term,
        then: term.then === from ? to : term.then,
        else: term.else === from ? to : term.else,
      }
    default:
      return term
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasSideEffects(instr: MIRInstr): boolean {
  return (
    instr.kind === 'call' ||
    instr.kind === 'call_macro' ||
    instr.kind === 'call_context' ||
    instr.kind === 'nbt_write' ||
    instr.kind === 'nbt_write_dynamic' ||
    instr.kind === 'score_write'
  )
}

function getInstrDst(instr: MIRInstr): Temp | null {
  switch (instr.kind) {
    case 'const': case 'copy':
    case 'add': case 'sub': case 'mul': case 'div': case 'mod': case 'pow':
    case 'neg': case 'cmp': case 'and': case 'or': case 'not':
    case 'nbt_read': case 'nbt_read_dynamic': case 'nbt_list_len':
    case 'string_match': case 'score_read':
      return instr.dst
    case 'call': case 'call_macro':
      return instr.dst
    default:
      return null
  }
}

function getSourceOperands(instr: MIRInstr): Operand[] {
  switch (instr.kind) {
    case 'copy': case 'neg': case 'not':
      return [instr.src]
    case 'add': case 'sub': case 'mul': case 'div': case 'mod': case 'pow':
    case 'cmp': case 'and': case 'or':
      return [instr.a, instr.b]
    case 'nbt_write':
      return [instr.src]
    case 'nbt_write_dynamic':
      return [instr.indexSrc, instr.valueSrc]
    case 'nbt_read_dynamic':
      return [instr.indexSrc]
    case 'call':
      return [...instr.args]
    case 'call_macro':
      return instr.args.map(a => a.value)
    case 'branch':
      return [instr.cond]
    case 'return':
      return instr.value ? [instr.value] : []
    case 'score_write':
      return [instr.src]
    default:
      return []
  }
}

function getTermTargets(term: MIRInstr): BlockId[] {
  switch (term.kind) {
    case 'jump': return [term.target]
    case 'branch': return [term.then, term.else]
    default: return []
  }
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
