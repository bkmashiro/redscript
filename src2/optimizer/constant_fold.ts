/**
 * Constant Folding — MIR optimization pass.
 *
 * Folds instructions where all operands are constants:
 * - Arithmetic: add(3, 4) → 7, neg(5) → -5
 * - Comparison: cmp(lt, 3, 4) → 1
 * - Boolean: and(1, 0) → 0, not(0) → 1
 */

import type { MIRFunction, MIRBlock, MIRInstr, Operand } from '../mir/types'

export function constantFold(fn: MIRFunction): MIRFunction {
  return {
    ...fn,
    blocks: fn.blocks.map(foldBlock),
  }
}

function foldBlock(block: MIRBlock): MIRBlock {
  const instrs: MIRInstr[] = []
  for (const instr of block.instrs) {
    const folded = tryFold(instr)
    instrs.push(folded ?? instr)
  }
  return { ...block, instrs }
}

function isConst(op: Operand): op is { kind: 'const'; value: number } {
  return op.kind === 'const'
}

function tryFold(instr: MIRInstr): MIRInstr | null {
  switch (instr.kind) {
    case 'add':
      if (isConst(instr.a) && isConst(instr.b))
        return { kind: 'const', dst: instr.dst, value: instr.a.value + instr.b.value }
      break
    case 'sub':
      if (isConst(instr.a) && isConst(instr.b))
        return { kind: 'const', dst: instr.dst, value: instr.a.value - instr.b.value }
      break
    case 'mul':
      if (isConst(instr.a) && isConst(instr.b))
        return { kind: 'const', dst: instr.dst, value: instr.a.value * instr.b.value }
      break
    case 'div':
      if (isConst(instr.a) && isConst(instr.b) && instr.b.value !== 0)
        return { kind: 'const', dst: instr.dst, value: Math.trunc(instr.a.value / instr.b.value) }
      break
    case 'mod':
      if (isConst(instr.a) && isConst(instr.b) && instr.b.value !== 0)
        return { kind: 'const', dst: instr.dst, value: instr.a.value % instr.b.value }
      break
    case 'neg':
      if (isConst(instr.src))
        return { kind: 'const', dst: instr.dst, value: -instr.src.value }
      break
    case 'not':
      if (isConst(instr.src))
        return { kind: 'const', dst: instr.dst, value: instr.src.value === 0 ? 1 : 0 }
      break
    case 'and':
      if (isConst(instr.a) && isConst(instr.b))
        return { kind: 'const', dst: instr.dst, value: (instr.a.value !== 0 && instr.b.value !== 0) ? 1 : 0 }
      break
    case 'or':
      if (isConst(instr.a) && isConst(instr.b))
        return { kind: 'const', dst: instr.dst, value: (instr.a.value !== 0 || instr.b.value !== 0) ? 1 : 0 }
      break
    case 'cmp':
      if (isConst(instr.a) && isConst(instr.b))
        return { kind: 'const', dst: instr.dst, value: evalCmp(instr.op, instr.a.value, instr.b.value) }
      break
  }
  return null
}

function evalCmp(op: string, a: number, b: number): number {
  switch (op) {
    case 'eq': return a === b ? 1 : 0
    case 'ne': return a !== b ? 1 : 0
    case 'lt': return a < b ? 1 : 0
    case 'le': return a <= b ? 1 : 0
    case 'gt': return a > b ? 1 : 0
    case 'ge': return a >= b ? 1 : 0
    default: return 0
  }
}
