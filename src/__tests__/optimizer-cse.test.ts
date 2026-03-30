/**
 * Tests for src/optimizer/cse.ts — Common Subexpression Elimination
 *
 * Covers: exprKey computation, commutative normalization, CSE replacement,
 * invalidation on side effects, self-modifying instruction handling.
 */

import { cse } from '../optimizer/cse'
import type { MIRFunction, MIRBlock, MIRInstr, Operand, Temp, CmpOp } from '../mir/types'

function temp(name: string): Temp {
  return name
}

function tempOp(name: string): Operand {
  return { kind: 'temp', name }
}

function constOp(value: number): Operand {
  return { kind: 'const', value }
}

function makeBlock(instrs: MIRInstr[]): MIRBlock {
  return { id: 'b0', instrs, term: { kind: 'return' } as MIRInstr, preds: [] }
}

function makeFn(blocks: MIRBlock[]): MIRFunction {
  return {
    name: 'test',
    params: [],
    returnType: { kind: 'named', name: 'void' },
    blocks,
    temps: [],
  } as unknown as MIRFunction
}

describe('CSE — basic elimination', () => {
  it('replaces duplicate add with copy', () => {
    const block = makeBlock([
      { kind: 'add', dst: temp('t1'), a: tempOp('t0'), b: constOp(1) },
      { kind: 'add', dst: temp('t2'), a: tempOp('t0'), b: constOp(1) },
    ])
    const result = cse(makeFn([block]))
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('add')
    expect(instrs[1].kind).toBe('copy')
    if (instrs[1].kind === 'copy') {
      expect(instrs[1].dst).toBe('t2')
      expect(instrs[1].src).toEqual(tempOp('t1'))
    }
  })

  it('replaces duplicate sub with copy', () => {
    const block = makeBlock([
      { kind: 'sub', dst: temp('t1'), a: tempOp('t0'), b: constOp(2) },
      { kind: 'sub', dst: temp('t2'), a: tempOp('t0'), b: constOp(2) },
    ])
    const result = cse(makeFn([block]))
    expect(result.blocks[0].instrs[1].kind).toBe('copy')
  })

  it('replaces duplicate mul with copy', () => {
    const block = makeBlock([
      { kind: 'mul', dst: temp('t1'), a: tempOp('x'), b: tempOp('y') },
      { kind: 'mul', dst: temp('t2'), a: tempOp('x'), b: tempOp('y') },
    ])
    const result = cse(makeFn([block]))
    expect(result.blocks[0].instrs[1].kind).toBe('copy')
  })

  it('replaces duplicate neg with copy', () => {
    const block = makeBlock([
      { kind: 'neg', dst: temp('t1'), src: tempOp('t0') },
      { kind: 'neg', dst: temp('t2'), src: tempOp('t0') },
    ])
    const result = cse(makeFn([block]))
    expect(result.blocks[0].instrs[1].kind).toBe('copy')
  })

  it('replaces duplicate not with copy', () => {
    const block = makeBlock([
      { kind: 'not', dst: temp('t1'), src: tempOp('t0') },
      { kind: 'not', dst: temp('t2'), src: tempOp('t0') },
    ])
    const result = cse(makeFn([block]))
    expect(result.blocks[0].instrs[1].kind).toBe('copy')
  })

  it('replaces duplicate cmp with copy', () => {
    const block = makeBlock([
      { kind: 'cmp', dst: temp('t1'), op: 'lt' as CmpOp, a: tempOp('x'), b: tempOp('y') },
      { kind: 'cmp', dst: temp('t2'), op: 'lt' as CmpOp, a: tempOp('x'), b: tempOp('y') },
    ])
    const result = cse(makeFn([block]))
    expect(result.blocks[0].instrs[1].kind).toBe('copy')
  })
})

describe('CSE — commutative normalization', () => {
  it('treats a+b and b+a as same expression', () => {
    const block = makeBlock([
      { kind: 'add', dst: temp('t1'), a: tempOp('x'), b: tempOp('y') },
      { kind: 'add', dst: temp('t2'), a: tempOp('y'), b: tempOp('x') },
    ])
    const result = cse(makeFn([block]))
    expect(result.blocks[0].instrs[1].kind).toBe('copy')
  })

  it('treats a*b and b*a as same expression', () => {
    const block = makeBlock([
      { kind: 'mul', dst: temp('t1'), a: tempOp('x'), b: tempOp('y') },
      { kind: 'mul', dst: temp('t2'), a: tempOp('y'), b: tempOp('x') },
    ])
    const result = cse(makeFn([block]))
    expect(result.blocks[0].instrs[1].kind).toBe('copy')
  })

  it('does NOT treat a-b and b-a as same (sub is non-commutative)', () => {
    const block = makeBlock([
      { kind: 'sub', dst: temp('t1'), a: tempOp('x'), b: tempOp('y') },
      { kind: 'sub', dst: temp('t2'), a: tempOp('y'), b: tempOp('x') },
    ])
    const result = cse(makeFn([block]))
    expect(result.blocks[0].instrs[1].kind).toBe('sub')
  })

  it('does NOT treat a/b and b/a as same (div is non-commutative)', () => {
    const block = makeBlock([
      { kind: 'div', dst: temp('t1'), a: tempOp('x'), b: tempOp('y') },
      { kind: 'div', dst: temp('t2'), a: tempOp('y'), b: tempOp('x') },
    ])
    const result = cse(makeFn([block]))
    expect(result.blocks[0].instrs[1].kind).toBe('div')
  })
})

describe('CSE — invalidation', () => {
  it('invalidates expression when operand is redefined', () => {
    const block = makeBlock([
      { kind: 'add', dst: temp('t1'), a: tempOp('x'), b: constOp(1) },
      { kind: 'copy', dst: temp('x'), src: constOp(99) },
      { kind: 'add', dst: temp('t2'), a: tempOp('x'), b: constOp(1) },
    ])
    const result = cse(makeFn([block]))
    // t2 should NOT be replaced because x was modified
    expect(result.blocks[0].instrs[2].kind).toBe('add')
  })

  it('invalidates all expressions after a call', () => {
    const block = makeBlock([
      { kind: 'add', dst: temp('t1'), a: tempOp('x'), b: constOp(1) },
      { kind: 'call', dst: temp('t_ret'), fn: 'sideEffect', args: [] } as unknown as MIRInstr,
      { kind: 'add', dst: temp('t2'), a: tempOp('x'), b: constOp(1) },
    ])
    const result = cse(makeFn([block]))
    expect(result.blocks[0].instrs[2].kind).toBe('add')
  })

  it('invalidates all expressions after score_write', () => {
    const block = makeBlock([
      { kind: 'add', dst: temp('t1'), a: tempOp('x'), b: constOp(1) },
      { kind: 'score_write', target: '@s', objective: 'test', src: tempOp('v') } as unknown as MIRInstr,
      { kind: 'add', dst: temp('t2'), a: tempOp('x'), b: constOp(1) },
    ])
    const result = cse(makeFn([block]))
    expect(result.blocks[0].instrs[2].kind).toBe('add')
  })
})

describe('CSE — self-modifying skip', () => {
  it('does not CSE self-modifying instruction (t5 = t5 + 1)', () => {
    const block = makeBlock([
      { kind: 'add', dst: temp('t5'), a: tempOp('t5'), b: constOp(1) },
      { kind: 'add', dst: temp('t5'), a: tempOp('t5'), b: constOp(1) },
    ])
    const result = cse(makeFn([block]))
    // Both should remain as 'add' because they're self-modifying
    expect(result.blocks[0].instrs[0].kind).toBe('add')
    expect(result.blocks[0].instrs[1].kind).toBe('add')
  })
})

describe('CSE — different expressions not merged', () => {
  it('does not merge different operations on same operands', () => {
    const block = makeBlock([
      { kind: 'add', dst: temp('t1'), a: tempOp('x'), b: tempOp('y') },
      { kind: 'sub', dst: temp('t2'), a: tempOp('x'), b: tempOp('y') },
    ])
    const result = cse(makeFn([block]))
    expect(result.blocks[0].instrs[0].kind).toBe('add')
    expect(result.blocks[0].instrs[1].kind).toBe('sub')
  })

  it('does not merge same operation with different constants', () => {
    const block = makeBlock([
      { kind: 'add', dst: temp('t1'), a: tempOp('x'), b: constOp(1) },
      { kind: 'add', dst: temp('t2'), a: tempOp('x'), b: constOp(2) },
    ])
    const result = cse(makeFn([block]))
    expect(result.blocks[0].instrs[0].kind).toBe('add')
    expect(result.blocks[0].instrs[1].kind).toBe('add')
  })

  it('different cmp operators are not merged', () => {
    const block = makeBlock([
      { kind: 'cmp', dst: temp('t1'), op: 'lt' as CmpOp, a: tempOp('x'), b: tempOp('y') },
      { kind: 'cmp', dst: temp('t2'), op: 'gt' as CmpOp, a: tempOp('x'), b: tempOp('y') },
    ])
    const result = cse(makeFn([block]))
    expect(result.blocks[0].instrs[0].kind).toBe('cmp')
    expect(result.blocks[0].instrs[1].kind).toBe('cmp')
  })
})

describe('CSE — multiple blocks', () => {
  it('processes each block independently', () => {
    const block1 = makeBlock([
      { kind: 'add', dst: temp('t1'), a: tempOp('x'), b: constOp(1) },
    ])
    const block2 = makeBlock([
      // Same expression in different block — should NOT be CSE'd
      { kind: 'add', dst: temp('t2'), a: tempOp('x'), b: constOp(1) },
    ])
    block2.id = 'b1'
    const result = cse(makeFn([block1, block2]))
    expect(result.blocks[0].instrs[0].kind).toBe('add')
    expect(result.blocks[1].instrs[0].kind).toBe('add')
  })
})

describe('CSE — passthrough of non-pure instructions', () => {
  it('passes through const instruction unchanged', () => {
    const block = makeBlock([
      { kind: 'const', dst: temp('t1'), value: '42' } as unknown as MIRInstr,
      { kind: 'const', dst: temp('t2'), value: '42' } as unknown as MIRInstr,
    ])
    const result = cse(makeFn([block]))
    // const instructions don't have exprKey so both should pass through
    expect(result.blocks[0].instrs.length).toBe(2)
  })

  it('preserves jump and branch instructions', () => {
    const block = makeBlock([
      { kind: 'add', dst: temp('t1'), a: tempOp('x'), b: constOp(1) },
      { kind: 'branch', cond: tempOp('t1'), thenBlock: 'b1', elseBlock: 'b2' } as unknown as MIRInstr,
    ])
    const result = cse(makeFn([block]))
    expect(result.blocks[0].instrs[1].kind).toBe('branch')
  })
})
