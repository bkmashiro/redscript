/**
 * @inline Decorator — MIR-level function inlining pass.
 *
 * For each call instruction where the callee is marked @inline in the module's
 * `inlineFunctions` set, replaces the call with a copy of the callee's CFG:
 *
 *   1. Clone all callee blocks with fresh names (prefixed by a unique inline ID).
 *   2. Substitute formal parameters with the actual argument operands.
 *   3. Replace every `return` terminator with a `jump` to a new continuation block.
 *      The return value (if any) is copied into the call's dst temp via a `copy`.
 *   4. Replace the original call instruction with a `jump` to the inlined entry block.
 *   5. Move all instructions that followed the call into the continuation block.
 *
 * Constraints (inlining is skipped when violated):
 *   - Callee must be in `mod.inlineFunctions`.
 *   - Callee must exist in the module (no external calls).
 *   - Callee must not be a macro function.
 *   - Callee must not be directly recursive.
 *   - Callee arg count must match param count.
 *
 * This is a module-level pass because it needs to read callee bodies.
 */

import type { MIRModule, MIRFunction, MIRBlock, MIRInstr, Operand, Temp, BlockId } from '../mir/types'

let _inlineCounter = 0
function freshInlineId(): string {
  return `__inline_${_inlineCounter++}`
}

export function inlinePass(mod: MIRModule): MIRModule {
  const inlineSet = mod.inlineFunctions
  if (!inlineSet || inlineSet.size === 0) return mod

  const fnMap = new Map<string, MIRFunction>(mod.functions.map(f => [f.name, f]))

  const updatedFunctions = mod.functions.map(fn => inlineCallsInFunction(fn, fnMap, inlineSet))

  return { ...mod, functions: updatedFunctions }
}

// ---------------------------------------------------------------------------
// Per-function inlining
// ---------------------------------------------------------------------------

function inlineCallsInFunction(
  fn: MIRFunction,
  fnMap: Map<string, MIRFunction>,
  inlineSet: Set<string>,
): MIRFunction {
  // Flatten all blocks into a mutable list; we may split blocks during inlining.
  let blocks = fn.blocks.map(b => ({ ...b, instrs: [...b.instrs] }))

  let changed = true
  while (changed) {
    changed = false
    const nextBlocks: MIRBlock[] = []

    for (const block of blocks) {
      // Find the first inlinable call in this block
      const callIdx = block.instrs.findIndex(instr => {
        if (instr.kind !== 'call') return false
        if (!inlineSet.has(instr.fn)) return false
        const callee = fnMap.get(instr.fn)
        if (!callee) return false
        if (callee.isMacro) return false
        if (callee.name === fn.name) return false // no self-recursion
        if (isSelfRecursive(callee)) return false
        if (callee.params.length !== instr.args.length) return false
        return true
      })

      if (callIdx === -1) {
        nextBlocks.push(block)
        continue
      }

      changed = true
      const callInstr = block.instrs[callIdx] as Extract<MIRInstr, { kind: 'call' }>
      const callee = fnMap.get(callInstr.fn)!

      const inlineId = freshInlineId()

      // Instructions before the call stay in the current block.
      const priorInstrs = block.instrs.slice(0, callIdx)
      // Instructions after the call go into the continuation block.
      const afterInstrs = block.instrs.slice(callIdx + 1)

      // The continuation block collects the return value and continues with
      // whatever followed the call (plus the block's original terminator).
      const contBlockId: BlockId = `${block.id}${inlineId}_cont`

      // Clone callee blocks
      const clonedBlocks = cloneCallee(callee, inlineId, callInstr.args, callInstr.dst, contBlockId)

      // Patch current block: drop the call, add jump to cloned entry.
      const clonedEntryId = `${callee.entry}${inlineId}`
      const patchedCurrentBlock: MIRBlock = {
        ...block,
        instrs: priorInstrs,
        term: { kind: 'jump', target: clonedEntryId },
      }

      // Continuation block: runs afterInstrs then the original terminator.
      const contBlock: MIRBlock = {
        id: contBlockId,
        instrs: afterInstrs,
        term: block.term,
        preds: [],
      }

      nextBlocks.push(patchedCurrentBlock, ...clonedBlocks, contBlock)
    }

    blocks = nextBlocks
  }

  return { ...fn, blocks }
}

// ---------------------------------------------------------------------------
// Clone callee CFG with renamed blocks/temps
// ---------------------------------------------------------------------------

function cloneCallee(
  callee: MIRFunction,
  inlineId: string,
  args: Operand[],
  dst: Temp | null,
  contBlockId: BlockId,
): MIRBlock[] {
  // Build param → arg substitution map
  const sub = new Map<Temp, Operand>()
  for (let i = 0; i < callee.params.length; i++) {
    sub.set(callee.params[i].name, args[i])
  }

  // Rename every temp in the callee to avoid collisions with the caller.
  // Collect all callee-defined temps first.
  const calleeTemps = new Set<Temp>()
  for (const block of callee.blocks) {
    collectDefinedTemps(block, calleeTemps)
  }
  // Build renaming map: old temp → new temp (scoped to inlineId)
  const tempRename = new Map<Temp, Temp>()
  for (const tmp of calleeTemps) {
    if (!sub.has(tmp)) {
      tempRename.set(tmp, `${tmp}${inlineId}`)
    }
  }

  // Combined substitution: params replaced by args, local temps renamed
  const fullSub = new Map<Temp, Operand>([...sub])
  for (const [old, renamed] of tempRename) {
    fullSub.set(old, { kind: 'temp', name: renamed })
  }

  // Block ID renaming
  const blockRename = (id: BlockId): BlockId => `${id}${inlineId}`

  return callee.blocks.map(block => cloneBlock(block, inlineId, fullSub, blockRename, dst, contBlockId))
}

function collectDefinedTemps(block: MIRBlock, out: Set<Temp>): void {
  const collect = (instr: MIRInstr) => {
    if ('dst' in instr && instr.dst !== null && instr.dst !== undefined) {
      out.add(instr.dst as Temp)
    }
  }
  block.instrs.forEach(collect)
  collect(block.term)
}

function cloneBlock(
  block: MIRBlock,
  inlineId: string,
  sub: Map<Temp, Operand>,
  blockRename: (id: BlockId) => BlockId,
  callDst: Temp | null,
  contBlockId: BlockId,
): MIRBlock {
  const newId = blockRename(block.id)

  const newInstrs = block.instrs.map(instr => subAndRenameInstr(instr, sub, blockRename))

  // Handle terminator: `return` → copy return value into callDst, then jump to cont
  let newTerm: MIRInstr
  const term = block.term
  if (term.kind === 'return') {
    const retInstrs: MIRInstr[] = []
    if (term.value !== null && callDst !== null) {
      const subbed = substituteOp(term.value, sub)
      retInstrs.push({ kind: 'copy', dst: callDst, src: subbed })
    }
    // Prepend copy instruction(s) before the jump by folding into instrs
    return {
      id: newId,
      instrs: [...newInstrs, ...retInstrs],
      term: { kind: 'jump', target: contBlockId },
      preds: block.preds.map(blockRename),
    }
  } else {
    newTerm = subAndRenameInstr(term, sub, blockRename)
  }

  return {
    id: newId,
    instrs: newInstrs,
    term: newTerm,
    preds: block.preds.map(blockRename),
  }
}

// ---------------------------------------------------------------------------
// Substitution helpers
// ---------------------------------------------------------------------------

function substituteOp(op: Operand, sub: Map<Temp, Operand>): Operand {
  if (op.kind === 'temp') {
    const replacement = sub.get(op.name)
    if (replacement !== undefined) return replacement
  }
  return op
}

function renameBlockId(id: BlockId, blockRename: (id: BlockId) => BlockId): BlockId {
  return blockRename(id)
}

function subAndRenameInstr(
  instr: MIRInstr,
  sub: Map<Temp, Operand>,
  blockRename: (id: BlockId) => BlockId,
): MIRInstr {
  // Helper to rename a dst temp via sub (if sub maps it to a temp)
  const renameDst = (dst: Temp | null): Temp | null => {
    if (dst === null) return null
    const r = sub.get(dst)
    if (r && r.kind === 'temp') return r.name
    return dst
  }

  switch (instr.kind) {
    case 'const':
      return { ...instr, dst: renameDst(instr.dst)! }
    case 'copy':
      return { ...instr, dst: renameDst(instr.dst)!, src: substituteOp(instr.src, sub) }
    case 'neg': case 'not':
      return { ...instr, dst: renameDst(instr.dst)!, src: substituteOp(instr.src, sub) }
    case 'add': case 'sub': case 'mul': case 'div': case 'mod':
    case 'and': case 'or':
      return { ...instr, dst: renameDst(instr.dst)!, a: substituteOp(instr.a, sub), b: substituteOp(instr.b, sub) }
    case 'cmp':
      return { ...instr, dst: renameDst(instr.dst)!, a: substituteOp(instr.a, sub), b: substituteOp(instr.b, sub) }
    case 'nbt_read':
      return { ...instr, dst: renameDst(instr.dst)! }
    case 'nbt_read_dynamic':
      return { ...instr, dst: renameDst(instr.dst)!, indexSrc: substituteOp(instr.indexSrc, sub) }
    case 'nbt_write':
      return { ...instr, src: substituteOp(instr.src, sub) }
    case 'nbt_write_dynamic':
      return { ...instr, indexSrc: substituteOp(instr.indexSrc, sub), valueSrc: substituteOp(instr.valueSrc, sub) }
    case 'nbt_list_len':
      return { ...instr, dst: renameDst(instr.dst)! }
    case 'score_read':
      return { ...instr, dst: renameDst(instr.dst)! }
    case 'score_write':
      return { ...instr, src: substituteOp(instr.src, sub) }
    case 'call':
      return { ...instr, dst: renameDst(instr.dst), args: instr.args.map(a => substituteOp(a, sub)) }
    case 'call_macro':
      return { ...instr, dst: renameDst(instr.dst), args: instr.args.map(a => ({ ...a, value: substituteOp(a.value, sub) })) }
    case 'call_context':
      return instr
    case 'jump':
      return { ...instr, target: renameBlockId(instr.target, blockRename) }
    case 'branch':
      return { ...instr, cond: substituteOp(instr.cond, sub), then: renameBlockId(instr.then, blockRename), else: renameBlockId(instr.else, blockRename) }
    case 'return':
      return { ...instr, value: instr.value ? substituteOp(instr.value, sub) : null }
    default:
      return instr
  }
}

function isSelfRecursive(fn: MIRFunction): boolean {
  for (const block of fn.blocks) {
    for (const instr of block.instrs) {
      if (instr.kind === 'call' && instr.fn === fn.name) return true
      if (instr.kind === 'call_macro' && instr.fn === fn.name) return true
    }
  }
  return false
}
