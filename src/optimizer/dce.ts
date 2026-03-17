/**
 * Dead Code Elimination — MIR optimization pass.
 *
 * 1. Removes definitions of temps that are never used anywhere in the function.
 * 2. Removes unreachable blocks (no predecessors and not the entry block).
 */

import type { MIRFunction, MIRBlock, MIRInstr, Operand, Temp, BlockId } from '../mir/types'

export function dce(fn: MIRFunction): MIRFunction {
  // Phase 1: Remove unreachable blocks
  let blocks = removeUnreachable(fn)

  // Phase 2: Remove unused temp definitions
  blocks = removeDeadDefs(fn.params, blocks)

  // Phase 3: Recompute preds after block removal
  blocks = recomputePreds(blocks)

  return { ...fn, blocks }
}

function removeUnreachable(fn: MIRFunction): MIRBlock[] {
  const reachable = new Set<BlockId>()
  const queue: BlockId[] = [fn.entry]
  const blockMap = new Map(fn.blocks.map(b => [b.id, b]))

  while (queue.length > 0) {
    const id = queue.shift()!
    if (reachable.has(id)) continue
    reachable.add(id)
    const block = blockMap.get(id)
    if (block) {
      for (const target of getTermTargets(block.term)) {
        if (!reachable.has(target)) queue.push(target)
      }
    }
  }

  return fn.blocks.filter(b => reachable.has(b.id))
}

function removeDeadDefs(params: { name: Temp }[], blocks: MIRBlock[]): MIRBlock[] {
  // Collect all used temps across the entire function
  const used = new Set<Temp>()
  for (const block of blocks) {
    for (const instr of block.instrs) {
      for (const t of getUsedTemps(instr)) used.add(t)
    }
    for (const t of getUsedTemps(block.term)) used.add(t)
  }

  // Remove instructions whose dst is never used, unless they have side effects
  return blocks.map(block => ({
    ...block,
    instrs: block.instrs.filter(instr => {
      const dst = getDst(instr)
      if (dst === null) return true  // no dst → keep (side-effectful)
      if (hasSideEffects(instr)) return true
      return used.has(dst)
    }),
  }))
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

function hasSideEffects(instr: MIRInstr): boolean {
  if (instr.kind === 'call' || instr.kind === 'call_macro' ||
    instr.kind === 'call_context' || instr.kind === 'nbt_write' ||
    instr.kind === 'score_write') return true
  // Return field temps (__rf_) write to global return slots — not dead even if unused locally
  // Option slot temps (__opt_) write observable scoreboard state — preserve even if var unused
  const dst = getDst(instr)
  if (dst && (dst.startsWith('__rf_') || dst.startsWith('__opt_'))) return true
  return false
}

function getTermTargets(term: MIRInstr): BlockId[] {
  switch (term.kind) {
    case 'jump': return [term.target]
    case 'branch': return [term.then, term.else]
    default: return []
  }
}

function getDst(instr: MIRInstr): Temp | null {
  switch (instr.kind) {
    case 'const': case 'copy':
    case 'add': case 'sub': case 'mul': case 'div': case 'mod':
    case 'neg': case 'cmp':
    case 'and': case 'or': case 'not':
    case 'nbt_read':
    case 'nbt_read_dynamic':
      return instr.dst
    case 'call': case 'call_macro':
      return instr.dst
    case 'score_read':
      return instr.dst
    default:
      return null
  }
}

function getUsedTemps(instr: MIRInstr): Temp[] {
  const temps: Temp[] = []
  const addOp = (op: Operand) => { if (op.kind === 'temp') temps.push(op.name) }

  switch (instr.kind) {
    case 'copy': case 'neg': case 'not':
      addOp(instr.src); break
    case 'add': case 'sub': case 'mul': case 'div': case 'mod':
    case 'cmp': case 'and': case 'or':
      addOp(instr.a); addOp(instr.b); break
    case 'nbt_write':
      addOp(instr.src); break
    case 'nbt_read_dynamic':
      addOp(instr.indexSrc); break
    case 'call':
      instr.args.forEach(addOp); break
    case 'call_macro':
      instr.args.forEach(a => addOp(a.value)); break
    case 'branch':
      addOp(instr.cond); break
    case 'return':
      if (instr.value) addOp(instr.value); break
    case 'score_write':
      addOp(instr.src); break
  }
  return temps
}
