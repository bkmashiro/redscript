import { branchSimplify } from '../../optimizer/branch_simplify'
import type { MIRFunction, MIRBlock, MIRInstr, Operand } from '../../mir/types'

function mkFn(blocks: MIRBlock[]): MIRFunction {
  return { name: 'test', params: [], blocks, entry: 'entry', isMacro: false }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr, preds: string[] = []): MIRBlock {
  return { id, instrs, term, preds }
}

const c = (v: number): Operand => ({ kind: 'const', value: v })
const t = (n: string): Operand => ({ kind: 'temp', name: n })

describe('branch simplification', () => {
  test('branch(1, then, else) → jump(then)', () => {
    const fn = mkFn([
      mkBlock('entry', [], { kind: 'branch', cond: c(1), then: 'b1', else: 'b2' }),
      mkBlock('b1', [], { kind: 'return', value: null }, ['entry']),
      mkBlock('b2', [], { kind: 'return', value: null }, ['entry']),
    ])
    const result = branchSimplify(fn)
    expect(result.blocks[0].term).toEqual({ kind: 'jump', target: 'b1' })
  })

  test('branch(0, then, else) → jump(else)', () => {
    const fn = mkFn([
      mkBlock('entry', [], { kind: 'branch', cond: c(0), then: 'b1', else: 'b2' }),
      mkBlock('b1', [], { kind: 'return', value: null }, ['entry']),
      mkBlock('b2', [], { kind: 'return', value: null }, ['entry']),
    ])
    const result = branchSimplify(fn)
    expect(result.blocks[0].term).toEqual({ kind: 'jump', target: 'b2' })
  })

  test('nonzero const (42) → jump(then)', () => {
    const fn = mkFn([
      mkBlock('entry', [], { kind: 'branch', cond: c(42), then: 'b1', else: 'b2' }),
      mkBlock('b1', [], { kind: 'return', value: null }),
      mkBlock('b2', [], { kind: 'return', value: null }),
    ])
    const result = branchSimplify(fn)
    expect(result.blocks[0].term).toEqual({ kind: 'jump', target: 'b1' })
  })

  test('does not simplify branch with temp cond', () => {
    const fn = mkFn([
      mkBlock('entry', [], { kind: 'branch', cond: t('flag'), then: 'b1', else: 'b2' }),
      mkBlock('b1', [], { kind: 'return', value: null }),
      mkBlock('b2', [], { kind: 'return', value: null }),
    ])
    const result = branchSimplify(fn)
    expect(result.blocks[0].term.kind).toBe('branch')
  })

  test('does not touch jump terminators', () => {
    const fn = mkFn([
      mkBlock('entry', [], { kind: 'jump', target: 'b1' }),
      mkBlock('b1', [], { kind: 'return', value: null }),
    ])
    const result = branchSimplify(fn)
    expect(result.blocks[0].term).toEqual({ kind: 'jump', target: 'b1' })
  })
})
