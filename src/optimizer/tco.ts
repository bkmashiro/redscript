/**
 * Tail Call Optimization (TCO) — MIR optimization pass.
 *
 * Detects direct self-tail-calls and converts them into loops, eliminating
 * the recursive function call entirely.
 *
 * ## Definition
 * A tail call is a `call` instruction whose result is immediately returned
 * in the same block (i.e., the block's terminator is `return` and the last
 * non-terminator instruction is `call dst fn args` where fn === current fn,
 * and the return value is that dst temp).
 *
 * ## Transformation
 * Given a function like:
 *
 *   fn factorial(n, acc):
 *     entry:
 *       t0 = cmp le n 1
 *       branch t0 → base_case, recurse
 *     base_case:
 *       return acc
 *     recurse:
 *       t1 = mul acc n
 *       t2 = sub n 1
 *       t3 = call factorial(t2, t1)   ← tail call
 *       return t3
 *
 * We:
 *   1. Create a new "__tco_entry" preamble block that copies original params
 *      into "loop parameter" temps (__lp0, __lp1, ...) and jumps to the
 *      original entry block.
 *   2. In all blocks (including entry), substitute uses of original param
 *      temps with loop params, so subsequent iterations use updated values.
 *   3. In tail-call blocks: evaluate call args (to avoid aliasing), assign
 *      results to loop params, and jump back to original entry — no call emitted.
 */

import type {
  MIRFunction,
  MIRBlock,
  MIRInstr,
  Operand,
  Temp,
  BlockId,
} from '../mir/types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to apply TCO to a single function.
 * Returns the transformed function if any tail calls were optimized,
 * or the original function unchanged if no self-tail-calls were found.
 */
export function tailCallOptimize(fn: MIRFunction): MIRFunction {
  // Skip macro functions — they use a different calling convention.
  if (fn.isMacro) return fn

  // Find all blocks that end with a self-tail-call.
  const tailBlocks = findTailCallBlocks(fn)
  if (tailBlocks.length === 0) return fn

  return rewriteWithLoop(fn, tailBlocks)
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Returns a list of tail-call block descriptors for every block that contains
 * a self-tail-call: the last non-terminator instruction is a `call` to the
 * same function, and the block terminator is `return` of that call's result.
 */
export function findTailCallBlocks(
  fn: MIRFunction,
): Array<{ blockId: BlockId; callIdx: number; argCount: number }> {
  const results: Array<{ blockId: BlockId; callIdx: number; argCount: number }> = []

  for (const block of fn.blocks) {
    const term = block.term
    if (term.kind !== 'return') continue

    // Find the last call instruction in this block
    let callIdx = -1
    for (let i = block.instrs.length - 1; i >= 0; i--) {
      if (block.instrs[i].kind === 'call') {
        callIdx = i
        break
      }
    }
    if (callIdx === -1) continue

    const callInstr = block.instrs[callIdx] as Extract<MIRInstr, { kind: 'call' }>

    // Must be a self-call
    if (callInstr.fn !== fn.name) continue

    // The return value must be exactly the call's dst temp
    const retVal = term.value
    if (retVal === null) continue
    if (retVal.kind !== 'temp') continue
    if (callInstr.dst === null) continue
    if (retVal.name !== callInstr.dst) continue

    // Arg count must match param count
    if (callInstr.args.length !== fn.params.length) continue

    results.push({ blockId: block.id, callIdx, argCount: callInstr.args.length })
  }

  return results
}

// ---------------------------------------------------------------------------
// Transformation
// ---------------------------------------------------------------------------

function rewriteWithLoop(
  fn: MIRFunction,
  tailBlocks: Array<{ blockId: BlockId; callIdx: number; argCount: number }>,
): MIRFunction {
  const tailBlockIds = new Set(tailBlocks.map(t => t.blockId))

  // 1. Create loop parameter temps: __lp0, __lp1, ...
  //    These shadow the original params inside the loop body.
  const loopParams: Temp[] = fn.params.map((_, i) => `__lp${i}`)

  // 2. Build the entry-preamble block (new entry).
  //    It copies original params → loop params, then jumps to the old entry.
  const newEntryBlock: MIRBlock = {
    id: '__tco_entry',
    instrs: fn.params.map((p, i) => ({
      kind: 'copy' as const,
      dst: loopParams[i],
      src: { kind: 'temp' as const, name: p.name },
    })),
    term: { kind: 'jump', target: fn.entry },
    preds: [],
  }

  // 3. Build substitution map: original param → loop param
  const paramSubst = new Map<Temp, Temp>()
  fn.params.forEach((p, i) => paramSubst.set(p.name, loopParams[i]))

  // 4. Rewrite each block
  const newBlocks: MIRBlock[] = []

  for (const block of fn.blocks) {
    if (tailBlockIds.has(block.id)) {
      // Rewrite tail-call block: strip call+return, update loop params, jump back
      const tailInfo = tailBlocks.find(t => t.blockId === block.id)!
      const callInstr = block.instrs[tailInfo.callIdx] as Extract<MIRInstr, { kind: 'call' }>

      // Instructions before the call (substitute param uses)
      const preInstrs = block.instrs
        .slice(0, tailInfo.callIdx)
        .map(i => substituteInstr(i, paramSubst))

      // Evaluate all args into fresh temps first (avoid aliasing when
      // e.g. lp0 := lp1; lp1 := lp0 — classic swap problem)
      const argTemps: Temp[] = callInstr.args.map((_, i) => `__tco_arg${i}`)

      const evalInstrs: MIRInstr[] = callInstr.args.map((arg, i) => ({
        kind: 'copy' as const,
        dst: argTemps[i],
        src: substituteOperand(arg, paramSubst),
      }))

      const assignInstrs: MIRInstr[] = argTemps.map((argTemp, i) => ({
        kind: 'copy' as const,
        dst: loopParams[i],
        src: { kind: 'temp' as const, name: argTemp },
      }))

      const newBlock: MIRBlock = {
        ...block,
        instrs: [...preInstrs, ...evalInstrs, ...assignInstrs],
        term: { kind: 'jump', target: fn.entry },
      }
      newBlocks.push(newBlock)
    } else {
      // Non-tail-call block: substitute param uses with loop params
      const newInstrs = block.instrs.map(i => substituteInstr(i, paramSubst))
      const newTerm = substituteInstr(block.term, paramSubst) as MIRBlock['term']
      newBlocks.push({ ...block, instrs: newInstrs, term: newTerm })
    }
  }

  // 5. Recompute predecessors
  const allBlocks = [newEntryBlock, ...newBlocks]
  const recomputedBlocks = recomputePreds(allBlocks)

  return {
    ...fn,
    entry: '__tco_entry',
    blocks: recomputedBlocks,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function substituteOperand(op: Operand, subst: Map<Temp, Temp>): Operand {
  if (op.kind === 'temp') {
    const mapped = subst.get(op.name)
    if (mapped !== undefined) return { kind: 'temp', name: mapped }
  }
  return op
}

function substituteInstr(instr: MIRInstr, subst: Map<Temp, Temp>): MIRInstr {
  const s = (op: Operand) => substituteOperand(op, subst)

  switch (instr.kind) {
    case 'copy': return { ...instr, src: s(instr.src) }
    case 'add': return { ...instr, a: s(instr.a), b: s(instr.b) }
    case 'sub': return { ...instr, a: s(instr.a), b: s(instr.b) }
    case 'mul': return { ...instr, a: s(instr.a), b: s(instr.b) }
    case 'div': return { ...instr, a: s(instr.a), b: s(instr.b) }
    case 'mod': return { ...instr, a: s(instr.a), b: s(instr.b) }
    case 'neg': return { ...instr, src: s(instr.src) }
    case 'cmp': return { ...instr, a: s(instr.a), b: s(instr.b) }
    case 'and': return { ...instr, a: s(instr.a), b: s(instr.b) }
    case 'or': return { ...instr, a: s(instr.a), b: s(instr.b) }
    case 'not': return { ...instr, src: s(instr.src) }
    case 'nbt_write': return { ...instr, src: s(instr.src) }
    case 'nbt_write_dynamic': return { ...instr, indexSrc: s(instr.indexSrc), valueSrc: s(instr.valueSrc) }
    case 'nbt_read_dynamic': return { ...instr, indexSrc: s(instr.indexSrc) }
    case 'score_write': return { ...instr, src: s(instr.src) }
    case 'call': return { ...instr, args: instr.args.map(s) }
    case 'call_macro': return {
      ...instr,
      args: instr.args.map(a => ({ ...a, value: s(a.value) })),
    }
    case 'branch': return { ...instr, cond: s(instr.cond) }
    case 'return': return {
      ...instr,
      value: instr.value !== null ? s(instr.value) : null,
    }
    default:
      return instr
  }
}

function recomputePreds(blocks: MIRBlock[]): MIRBlock[] {
  const predsMap = new Map<BlockId, BlockId[]>()
  for (const b of blocks) predsMap.set(b.id, [])

  for (const b of blocks) {
    const targets = getTermTargets(b.term)
    for (const tgt of targets) {
      const list = predsMap.get(tgt)
      if (list) list.push(b.id)
    }
  }

  return blocks.map(b => ({ ...b, preds: predsMap.get(b.id) ?? [] }))
}

function getTermTargets(term: MIRInstr): BlockId[] {
  if (term.kind === 'jump') return [term.target]
  if (term.kind === 'branch') return [term.then, term.else]
  return []
}
