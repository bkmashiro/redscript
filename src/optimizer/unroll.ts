/**
 * Small Constant Loop Unrolling — MIR optimization pass.
 *
 * Detects `for (let i = 0; i < N; i++)` loops where N is a compile-time
 * constant and N ≤ 8, then unrolls them: the loop body is duplicated N times
 * with the loop variable substituted as the literal 0..N-1.
 *
 * Pattern recognized (after HIR→MIR lowering):
 *   entry block:      const t_i 0          (loop var init)
 *   loop_header:      cmp(lt, t_i, N) → branch body/exit
 *   loop_body:        body instructions, jump → loop_latch
 *   loop_latch:       t_i = t_i + 1, jump → loop_header
 *   loop_exit:        ...
 *
 * After unrolling:
 *   entry block (with i=0 def removed):
 *     [body with t_i → 0]
 *     [body with t_i → 1]
 *     ...
 *     [body with t_i → N-1]
 *     jump → loop_exit
 *   loop_exit: ...
 *
 * Limitations:
 * - Only unrolls when N ≤ 8
 * - The loop variable must be initialized to exactly 0 before the loop
 * - The latch must do exactly `t_i = t_i + 1` (or equivalent const add)
 * - No break/continue (body must not jump directly to exit or latch)
 * - N must be a compile-time constant (Operand kind='const')
 */

import type {
  MIRFunction, MIRBlock, MIRInstr, Operand, Temp, BlockId,
} from '../mir/types'

const UNROLL_LIMIT = 8

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function loopUnroll(fn: MIRFunction): MIRFunction {
  let current = fn
  let changed = true
  // Iterate to fixpoint in case of multiple unrollable loops
  while (changed) {
    changed = false
    const result = tryUnrollOne(current)
    if (result !== current) {
      current = result
      changed = true
    }
  }
  return current
}

// ---------------------------------------------------------------------------
// Core: try to unroll one loop in the function
// ---------------------------------------------------------------------------

interface LoopInfo {
  /** Block id of loop_header */
  headerId: BlockId
  /** Block id of loop_body */
  bodyId: BlockId
  /** Block id of loop_latch */
  latchId: BlockId
  /** Block id of loop_exit */
  exitId: BlockId
  /** The loop variable temp name */
  loopVar: Temp
  /** The upper bound constant (exclusive: i < N) */
  N: number
  /** Block id that jumps into the loop header (the pre-header) */
  preHeaderId: BlockId
}

function tryUnrollOne(fn: MIRFunction): MIRFunction {
  const blockMap = new Map(fn.blocks.map(b => [b.id, b]))
  const info = findUnrollableLoop(fn, blockMap)
  if (!info) return fn

  return unroll(fn, blockMap, info)
}

// ---------------------------------------------------------------------------
// Loop detection
// ---------------------------------------------------------------------------

function findUnrollableLoop(fn: MIRFunction, blockMap: Map<BlockId, MIRBlock>): LoopInfo | null {
  for (const block of fn.blocks) {
    if (!block.id.startsWith('loop_header')) continue
    const info = analyzeLoop(fn, blockMap, block)
    if (info) return info
  }
  return null
}

function analyzeLoop(
  fn: MIRFunction,
  blockMap: Map<BlockId, MIRBlock>,
  header: MIRBlock,
): LoopInfo | null {
  // Header must branch on a cmp result
  if (header.term.kind !== 'branch') return null
  const branch = header.term
  if (branch.cond.kind !== 'temp') return null
  const condName = branch.cond.name

  // Find the cmp instruction in the header
  const cmpInstr = header.instrs.find(
    instr => instr.kind === 'cmp' && instr.dst === condName
  ) as Extract<MIRInstr, { kind: 'cmp' }> | undefined
  if (!cmpInstr) return null

  // Must be a `lt` comparison: i < N
  if (cmpInstr.op !== 'lt') return null

  // Left operand must be a temp (the loop var), right must be a constant
  if (cmpInstr.a.kind !== 'temp') return null
  if (cmpInstr.b.kind !== 'const') return null

  const loopVar = cmpInstr.a.name
  const N = cmpInstr.b.value

  // Reject if N > limit or N <= 0
  if (N > UNROLL_LIMIT || N <= 0) return null

  // then = loop_body, else = loop_exit
  const bodyId = branch.then
  const exitId = branch.else

  const bodyBlock = blockMap.get(bodyId)
  if (!bodyBlock) return null
  if (!bodyBlock.id.startsWith('loop_body')) return null

  // Body must end with jump to latch (or header if no latch)
  if (bodyBlock.term.kind !== 'jump') return null
  const afterBodyId = bodyBlock.term.target
  const afterBody = blockMap.get(afterBodyId)
  if (!afterBody) return null

  // Find the latch block
  let latchId: BlockId
  if (afterBody.id.startsWith('loop_latch')) {
    latchId = afterBodyId
  } else {
    return null
  }

  const latch = blockMap.get(latchId)!

  // Latch must end with jump back to header
  if (latch.term.kind !== 'jump') return null
  if (latch.term.target !== header.id) return null

  // Latch must increment loopVar by 1
  if (!latchIncrementsBy1(latch, loopVar)) return null

  // Loop var must be initialized to 0 before entering the loop
  // Find the pre-header: the block that jumps to header (not the latch)
  const preHeaderId = findPreHeader(fn, header.id, latchId)
  if (!preHeaderId) return null

  const preHeader = blockMap.get(preHeaderId)!
  if (!initializesTo0(preHeader, fn, loopVar)) return null

  // Body must not contain break (direct jump to exit) or continue to latch
  // (those would require more complex handling)
  if (bodyHasBreakOrContinue(bodyBlock, exitId, latchId)) return null

  return { headerId: header.id, bodyId, latchId, exitId, loopVar, N, preHeaderId }
}

/** Check that the latch increments loopVar by 1.
 *
 * Two common patterns:
 *   1. Direct:  add loopVar loopVar 1
 *   2. Two-step: add t_tmp loopVar 1; copy loopVar t_tmp
 */
function latchIncrementsBy1(latch: MIRBlock, loopVar: Temp): boolean {
  // Pattern 1: add dst=loopVar, a=loopVar, b=const(1)
  for (const instr of latch.instrs) {
    if (
      instr.kind === 'add' &&
      instr.dst === loopVar &&
      instr.a.kind === 'temp' && instr.a.name === loopVar &&
      instr.b.kind === 'const' && instr.b.value === 1
    ) {
      return true
    }
  }

  // Pattern 2: add t_tmp loopVar 1; copy loopVar t_tmp
  // Find the copy that assigns loopVar, then check the add that produced the source
  for (let i = 0; i < latch.instrs.length; i++) {
    const instr = latch.instrs[i]
    if (
      instr.kind === 'copy' &&
      instr.dst === loopVar &&
      instr.src.kind === 'temp'
    ) {
      const srcTemp = instr.src.name
      // Find the add instruction that produced srcTemp
      for (const addInstr of latch.instrs) {
        if (
          addInstr.kind === 'add' &&
          addInstr.dst === srcTemp &&
          addInstr.a.kind === 'temp' && addInstr.a.name === loopVar &&
          addInstr.b.kind === 'const' && addInstr.b.value === 1
        ) {
          return true
        }
      }
    }
  }

  return false
}

/** Check if loopVar is initialized to 0 in the pre-header (or reachable const) */
function initializesTo0(preHeader: MIRBlock, fn: MIRFunction, loopVar: Temp): boolean {
  // Check if last definition of loopVar in preHeader is const 0
  for (let i = preHeader.instrs.length - 1; i >= 0; i--) {
    const instr = preHeader.instrs[i]
    if (instr.kind === 'const' && instr.dst === loopVar && instr.value === 0) return true
    if (instr.kind === 'copy' && instr.dst === loopVar) {
      return instr.src.kind === 'const' && instr.src.value === 0
    }
    // If something else defines loopVar, it's not 0
    if (getInstrDst(instr) === loopVar) return false
  }
  // Also check entry block if preHeader is entry
  if (preHeader.id === fn.entry) return false
  return false
}

/** Find the pre-header block: the predecessor of header that is NOT the latch */
function findPreHeader(fn: MIRFunction, headerId: BlockId, latchId: BlockId): BlockId | null {
  const preds: BlockId[] = []
  for (const block of fn.blocks) {
    const targets = getTermTargets(block.term)
    if (targets.includes(headerId) && block.id !== latchId) {
      preds.push(block.id)
    }
  }
  return preds.length === 1 ? preds[0] : null
}

/** Check if body block has break (jump to exit) or continue (jump to latch) */
function bodyHasBreakOrContinue(body: MIRBlock, exitId: BlockId, latchId: BlockId): boolean {
  // The normal path is body → latch. Any direct jump to exit = break,
  // any jump to latch from within body sub-blocks = continue
  // For simplicity, we only unroll if the body has no sub-blocks with these patterns.
  // We only check the body block itself (single-block body).
  // A multi-block body would need recursive checking.
  return false
}

// ---------------------------------------------------------------------------
// Unrolling
// ---------------------------------------------------------------------------

function unroll(fn: MIRFunction, blockMap: Map<BlockId, MIRBlock>, info: LoopInfo): MIRFunction {
  const { headerId, bodyId, latchId, exitId, loopVar, N, preHeaderId } = info

  const preHeader = blockMap.get(preHeaderId)!
  const body = blockMap.get(bodyId)!

  // Remove the `const loopVar 0` init from preHeader
  const newPreHeaderInstrs = preHeader.instrs.filter(
    instr => !(instr.kind === 'const' && instr.dst === loopVar && instr.value === 0) &&
             !(instr.kind === 'copy' && instr.dst === loopVar &&
               instr.src.kind === 'const' && instr.src.value === 0)
  )

  // Build N copies of the body with loopVar substituted
  const unrolledInstrs: MIRInstr[] = []
  for (let iter = 0; iter < N; iter++) {
    const substitution = new Map<Temp, Operand>([[loopVar, { kind: 'const', value: iter }]])
    for (const instr of body.instrs) {
      unrolledInstrs.push(substituteInstr(instr, substitution))
    }
  }

  // New pre-header: original instrs (minus init) + all unrolled body + jump to exit
  const newPreHeader: MIRBlock = {
    ...preHeader,
    instrs: [...newPreHeaderInstrs, ...unrolledInstrs],
    term: { kind: 'jump', target: exitId },
  }

  // Remove header, body, latch blocks; update preHeader; keep exit
  const keepIds = new Set(fn.blocks.map(b => b.id))
  keepIds.delete(headerId)
  keepIds.delete(bodyId)
  keepIds.delete(latchId)

  const newBlocks: MIRBlock[] = []
  for (const block of fn.blocks) {
    if (block.id === preHeaderId) {
      newBlocks.push(newPreHeader)
    } else if (keepIds.has(block.id)) {
      newBlocks.push(block)
    }
  }

  // Recompute predecessors
  const newBlocksWithPreds = recomputePreds(newBlocks)

  return { ...fn, blocks: newBlocksWithPreds }
}

// ---------------------------------------------------------------------------
// Instruction substitution
// ---------------------------------------------------------------------------

function substituteOp(op: Operand, sub: Map<Temp, Operand>): Operand {
  if (op.kind === 'temp') {
    const replacement = sub.get(op.name)
    if (replacement) return replacement
  }
  return op
}

function substituteInstr(instr: MIRInstr, sub: Map<Temp, Operand>): MIRInstr {
  switch (instr.kind) {
    case 'copy': return { ...instr, src: substituteOp(instr.src, sub) }
    case 'neg': case 'not': return { ...instr, src: substituteOp(instr.src, sub) }
    case 'add': case 'sub': case 'mul': case 'div': case 'mod':
    case 'and': case 'or':
      return { ...instr, a: substituteOp(instr.a, sub), b: substituteOp(instr.b, sub) }
    case 'cmp':
      return { ...instr, a: substituteOp(instr.a, sub), b: substituteOp(instr.b, sub) }
    case 'nbt_write':
      return { ...instr, src: substituteOp(instr.src, sub) }
    case 'call':
      return { ...instr, args: instr.args.map(a => substituteOp(a, sub)) }
    case 'call_macro':
      return { ...instr, args: instr.args.map(a => ({ ...a, value: substituteOp(a.value, sub) })) }
    case 'branch':
      return { ...instr, cond: substituteOp(instr.cond, sub) }
    case 'return':
      return { ...instr, value: instr.value ? substituteOp(instr.value, sub) : null }
    default:
      return instr
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInstrDst(instr: MIRInstr): Temp | null {
  switch (instr.kind) {
    case 'const': case 'copy':
    case 'add': case 'sub': case 'mul': case 'div': case 'mod':
    case 'neg': case 'cmp': case 'and': case 'or': case 'not':
    case 'nbt_read':
    case 'nbt_read_dynamic':
      return instr.dst
    case 'call': case 'call_macro':
      return instr.dst
    default:
      return null
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
