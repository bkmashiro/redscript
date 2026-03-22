/**
 * Strength Reduction — MIR algebraic simplification pass.
 *
 * Rewrites expensive or redundant arithmetic into cheaper equivalents:
 * - x * 2   -> x + x
 * - x * 1   -> x
 * - x * 0   -> 0
 * - x + 0   -> x
 * - x - 0   -> x
 * - x / 1   -> x
 * - x ^ 1   -> x
 * - x * -1  -> -x
 */

import type { MIRBlock, MIRFunction, MIRInstr, Operand } from '../mir/types'

type PowInstr = { kind: 'pow'; dst: string; a: Operand; b: Operand; sourceLoc?: MIRInstr['sourceLoc'] }

export function strengthReduction(fn: MIRFunction): MIRFunction {
  return {
    ...fn,
    blocks: fn.blocks.map(rewriteBlock),
  }
}

function rewriteBlock(block: MIRBlock): MIRBlock {
  return {
    ...block,
    instrs: block.instrs.map(instr => rewriteInstr(instr) ?? instr),
  }
}

function rewriteInstr(instr: MIRInstr): MIRInstr | null {
  const powInstr = asPowInstr(instr)
  if (powInstr && isConst(powInstr.b, 1))
    return makeCopy(powInstr.dst, powInstr.a, powInstr.sourceLoc)

  switch (instr.kind) {
    case 'mul':
      return rewriteMul(instr)
    case 'add':
      if (isConst(instr.a, 0)) return makeCopy(instr.dst, instr.b, instr.sourceLoc)
      if (isConst(instr.b, 0)) return makeCopy(instr.dst, instr.a, instr.sourceLoc)
      return null
    case 'sub':
      if (isConst(instr.b, 0)) return makeCopy(instr.dst, instr.a, instr.sourceLoc)
      return null
    case 'div':
      if (isConst(instr.b, 1)) return makeCopy(instr.dst, instr.a, instr.sourceLoc)
      return null
    default:
      return null
  }
}

function rewriteMul(instr: Extract<MIRInstr, { kind: 'mul' }>): MIRInstr | null {
  if (isConst(instr.a, 0) || isConst(instr.b, 0))
    return makeConst(instr.dst, 0, instr.sourceLoc)

  if (isConst(instr.a, 1)) return makeCopy(instr.dst, instr.b, instr.sourceLoc)
  if (isConst(instr.b, 1)) return makeCopy(instr.dst, instr.a, instr.sourceLoc)

  if (isConst(instr.a, -1)) return makeNeg(instr.dst, instr.b, instr.sourceLoc)
  if (isConst(instr.b, -1)) return makeNeg(instr.dst, instr.a, instr.sourceLoc)

  if (isConst(instr.a, 2)) return makeAdd(instr.dst, instr.b, instr.b, instr.sourceLoc)
  if (isConst(instr.b, 2)) return makeAdd(instr.dst, instr.a, instr.a, instr.sourceLoc)

  return null
}

function isConst(op: Operand, value: number): boolean {
  return op.kind === 'const' && op.value === value
}

function asPowInstr(instr: MIRInstr): PowInstr | null {
  const candidate = instr as MIRInstr | PowInstr
  return candidate.kind === 'pow' ? candidate : null
}

function makeCopy(dst: string, src: Operand, sourceLoc?: MIRInstr['sourceLoc']): MIRInstr {
  return sourceLoc ? { kind: 'copy', dst, src, sourceLoc } : { kind: 'copy', dst, src }
}

function makeConst(dst: string, value: number, sourceLoc?: MIRInstr['sourceLoc']): MIRInstr {
  return sourceLoc ? { kind: 'const', dst, value, sourceLoc } : { kind: 'const', dst, value }
}

function makeNeg(dst: string, src: Operand, sourceLoc?: MIRInstr['sourceLoc']): MIRInstr {
  return sourceLoc ? { kind: 'neg', dst, src, sourceLoc } : { kind: 'neg', dst, src }
}

function makeAdd(dst: string, a: Operand, b: Operand, sourceLoc?: MIRInstr['sourceLoc']): MIRInstr {
  return sourceLoc ? { kind: 'add', dst, a, b, sourceLoc } : { kind: 'add', dst, a, b }
}
