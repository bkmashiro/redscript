/**
 * Copy Propagation — MIR optimization pass.
 *
 * Within each block, tracks `copy dst, src` and `const dst, value` instructions
 * and replaces subsequent uses of `dst` with the known operand.
 * Invalidates mappings when a temp is redefined (written to).
 */

import type { MIRFunction, MIRBlock, MIRInstr, Operand, Temp } from '../mir/types'

export function copyProp(fn: MIRFunction): MIRFunction {
  return {
    ...fn,
    blocks: fn.blocks.map(propBlock),
  }
}

function propBlock(block: MIRBlock): MIRBlock {
  // Map from temp → the operand it was copied from
  const copies = new Map<Temp, Operand>()

  const instrs: MIRInstr[] = []
  for (const instr of block.instrs) {
    // Rewrite uses first
    const rewritten = rewriteUses(instr, copies)

    // Invalidate any mapping whose source was just redefined
    const dst = getDst(rewritten)
    if (dst) {
      // Remove any mapping that points TO this dst (as a temp source)
      for (const [k, v] of copies) {
        if (v.kind === 'temp' && v.name === dst) {
          copies.delete(k)
        }
      }
      // Remove dst's own previous mapping (will be re-added below if applicable)
      copies.delete(dst)
    }

    // Track new propagatable definitions
    if (rewritten.kind === 'const') {
      // const dst, value → record dst → const operand
      copies.set(rewritten.dst, { kind: 'const', value: rewritten.value })
    } else if (rewritten.kind === 'copy') {
      // copy dst, src → record dst → src (temp or const)
      copies.set(rewritten.dst, rewritten.src)
    }

    instrs.push(rewritten)
  }

  // Also rewrite terminator uses
  const term = rewriteUses(block.term, copies)

  return { ...block, instrs, term }
}

function resolve(op: Operand, copies: Map<Temp, Operand>): Operand {
  if (op.kind === 'temp') {
    const replacement = copies.get(op.name)
    if (replacement) return replacement
  }
  return op
}

function rewriteUses(instr: MIRInstr, copies: Map<Temp, Operand>): MIRInstr {
  switch (instr.kind) {
    case 'copy':
      return { ...instr, src: resolve(instr.src, copies) }
    case 'neg':
    case 'not':
      return { ...instr, src: resolve(instr.src, copies) }
    case 'add': case 'sub': case 'mul': case 'div': case 'mod':
    case 'and': case 'or':
      return { ...instr, a: resolve(instr.a, copies), b: resolve(instr.b, copies) }
    case 'cmp':
      return { ...instr, a: resolve(instr.a, copies), b: resolve(instr.b, copies) }
    case 'nbt_write':
      return { ...instr, src: resolve(instr.src, copies) }
    case 'call':
      return { ...instr, args: instr.args.map(a => resolve(a, copies)) }
    case 'call_macro':
      return { ...instr, args: instr.args.map(a => ({ ...a, value: resolve(a.value, copies) })) }
    case 'branch':
      return { ...instr, cond: resolve(instr.cond, copies) }
    case 'return':
      return { ...instr, value: instr.value ? resolve(instr.value, copies) : null }
    case 'score_write':
      return { ...instr, src: resolve(instr.src, copies) }
    default:
      return instr
  }
}

function getDst(instr: MIRInstr): Temp | null {
  switch (instr.kind) {
    case 'const': case 'copy':
    case 'add': case 'sub': case 'mul': case 'div': case 'mod':
    case 'neg': case 'cmp':
    case 'and': case 'or': case 'not':
    case 'nbt_read':
      return instr.dst
    case 'call': case 'call_macro':
      return instr.dst
    case 'score_read':
      return instr.dst
    default:
      return null
  }
}
