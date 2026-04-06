/**
 * Tests for Common Subexpression Elimination (CSE) pass.
 */

import { cse } from '../../optimizer/cse'
import type { MIRFunction, MIRBlock, MIRInstr, Operand } from '../../mir/types'

function mkFn(blocks: MIRBlock[]): MIRFunction {
  return { name: 'test', params: [], blocks, entry: 'entry', isMacro: false }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr): MIRBlock {
  return { id, instrs, term, preds: [] }
}

const c = (v: number): Operand => ({ kind: 'const', value: v })
const t = (n: string): Operand => ({ kind: 'temp', name: n })

// ---------------------------------------------------------------------------

describe('CSE — basic intra-block elimination', () => {
  test('eliminates duplicate add within same block', () => {
    // t0 = x + y
    // t1 = x + y  ← should become: t1 = copy t0
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: t('x'), b: t('y') },
        { kind: 'add', dst: 't1', a: t('x'), b: t('y') },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('add')
    expect(instrs[1]).toEqual({ kind: 'copy', dst: 't1', src: { kind: 'temp', name: 't0' } })
  })

  test('eliminates duplicate mul within same block', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'mul', dst: 't0', a: t('a'), b: c(2) },
        { kind: 'mul', dst: 't1', a: t('a'), b: c(2) },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('mul')
    expect(instrs[1]).toEqual({ kind: 'copy', dst: 't1', src: { kind: 'temp', name: 't0' } })
  })

  test('eliminates duplicate cmp within same block', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'cmp', dst: 't0', op: 'lt', a: t('x'), b: c(10) },
        { kind: 'cmp', dst: 't1', op: 'lt', a: t('x'), b: c(10) },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('cmp')
    expect(instrs[1]).toEqual({ kind: 'copy', dst: 't1', src: { kind: 'temp', name: 't0' } })
  })

  test('eliminates duplicate neg within same block', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'neg', dst: 't0', src: t('x') },
        { kind: 'neg', dst: 't1', src: t('x') },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('neg')
    expect(instrs[1]).toEqual({ kind: 'copy', dst: 't1', src: { kind: 'temp', name: 't0' } })
  })

  test('handles commutative ops (a+b == b+a)', () => {
    // add is commutative: t('x') + t('y') == t('y') + t('x')
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: t('x'), b: t('y') },
        { kind: 'add', dst: 't1', a: t('y'), b: t('x') },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('add')
    expect(instrs[1]).toEqual({ kind: 'copy', dst: 't1', src: { kind: 'temp', name: 't0' } })
  })
})

// ---------------------------------------------------------------------------

describe('CSE — side effects break elimination', () => {
  test('call instruction clears available expressions', () => {
    // t0 = x + y
    // call foo()     ← side effect: clears available
    // t1 = x + y     ← must NOT be eliminated
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: t('x'), b: t('y') },
        { kind: 'call', dst: null, fn: 'foo', args: [] },
        { kind: 'add', dst: 't1', a: t('x'), b: t('y') },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[2].kind).toBe('add')  // not a copy
  })

  test('score_write clears available expressions', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: t('x'), b: t('y') },
        { kind: 'score_write', player: '@s', obj: 'score', src: c(5) },
        { kind: 'add', dst: 't1', a: t('x'), b: t('y') },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[2].kind).toBe('add')
  })
})

// ---------------------------------------------------------------------------

describe('CSE — different operation types don\'t match', () => {
  test('add and sub with same operands are not equivalent', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: t('x'), b: t('y') },
        { kind: 'sub', dst: 't1', a: t('x'), b: t('y') },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('add')
    expect(instrs[1].kind).toBe('sub')  // not eliminated
  })

  test('cmp with different ops are not equivalent', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'cmp', dst: 't0', op: 'lt', a: t('x'), b: c(5) },
        { kind: 'cmp', dst: 't1', op: 'gt', a: t('x'), b: c(5) },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('cmp')
    expect(instrs[1].kind).toBe('cmp')  // not eliminated
  })
})

// ---------------------------------------------------------------------------

describe('CSE — operand redefinition invalidates', () => {
  test('redefining an operand invalidates dependent expression', () => {
    // t0 = x + y
    // x  = const 99   ← x is overwritten
    // t1 = x + y      ← x has changed, must NOT reuse t0
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: t('x'), b: t('y') },
        { kind: 'const', dst: 'x', value: 99 },
        { kind: 'add', dst: 't1', a: t('x'), b: t('y') },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[2].kind).toBe('add')  // not a copy
  })

  test('multiple uses before redefinition are all eliminated', () => {
    // t0 = x + y
    // t1 = x + y   ← eliminated → copy t0
    // t2 = x + y   ← also eliminated → copy t0
    // ...then x overwritten, t3 = x+y is NOT eliminated
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: t('x'), b: t('y') },
        { kind: 'add', dst: 't1', a: t('x'), b: t('y') },
        { kind: 'add', dst: 't2', a: t('x'), b: t('y') },
        { kind: 'const', dst: 'x', value: 0 },
        { kind: 'add', dst: 't3', a: t('x'), b: t('y') },
      ], { kind: 'return', value: t('t3') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('add')
    expect(instrs[1]).toEqual({ kind: 'copy', dst: 't1', src: { kind: 'temp', name: 't0' } })
    expect(instrs[2]).toEqual({ kind: 'copy', dst: 't2', src: { kind: 'temp', name: 't0' } })
    expect(instrs[3].kind).toBe('const')
    expect(instrs[4].kind).toBe('add')
  })

  test('reassigning the result temp invalidates its own entry in available', () => {
    // t0 = x + y          ← recorded: add:t:x:t:y → t0
    // t0 = const 5        ← t0 is overwritten; old mapping for add:t:x:t:y must be removed
    // t1 = x + y          ← must NOT be eliminated (t0 no longer holds x+y)
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: t('x'), b: t('y') },
        { kind: 'const', dst: 't0', value: 5 },
        { kind: 'add', dst: 't1', a: t('x'), b: t('y') },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('add')
    expect(instrs[1].kind).toBe('const')
    expect(instrs[2].kind).toBe('add')  // not a copy — t0 was overwritten
  })
})

// ---------------------------------------------------------------------------

describe('CSE — self-modifying instructions are not eliminated', () => {
  test('t0 = t0 + 1 is not CSE-eligible across multiple occurrences', () => {
    // Each t0 = t0 + 1 uses a different value of t0, so they must not be replaced
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: t('t0'), b: c(1) },
        { kind: 'add', dst: 't0', a: t('t0'), b: c(1) },
        { kind: 'add', dst: 't0', a: t('t0'), b: c(1) },
      ], { kind: 'return', value: t('t0') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs).toHaveLength(3)
    expect(instrs.every(i => i.kind === 'add')).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('CSE — nbt and call_macro side effects clear available', () => {
  test('nbt_write clears available expressions', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: t('x'), b: t('y') },
        { kind: 'nbt_write', ns: 'test', path: 'p', type: 'int', scale: 1, src: t('x') },
        { kind: 'add', dst: 't1', a: t('x'), b: t('y') },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[2].kind).toBe('add')  // not a copy
  })

  test('nbt_write_dynamic clears available expressions', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: t('x'), b: t('y') },
        { kind: 'nbt_write_dynamic', ns: 'test', pathPrefix: 'p', indexSrc: t('i'), valueSrc: t('x') },
        { kind: 'add', dst: 't1', a: t('x'), b: t('y') },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[2].kind).toBe('add')  // not a copy
  })

  test('call_macro clears available expressions', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: t('x'), b: t('y') },
        {
          kind: 'call_macro',
          dst: null,
          fn: 'test:macro_helper',
          args: [{ name: 'val', value: t('x'), type: 'int', scale: 1 }],
        },
        { kind: 'add', dst: 't1', a: t('x'), b: t('y') },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[2].kind).toBe('add')  // not a copy
  })
})

// ---------------------------------------------------------------------------

describe('CSE — commutativity for and/or, non-commutativity for pow', () => {
  test('and is commutative: a&&b == b&&a', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'and', dst: 't0', a: t('x'), b: t('y') },
        { kind: 'and', dst: 't1', a: t('y'), b: t('x') },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('and')
    expect(instrs[1]).toEqual({ kind: 'copy', dst: 't1', src: { kind: 'temp', name: 't0' } })
  })

  test('or is commutative: a||b == b||a', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'or', dst: 't0', a: t('x'), b: t('y') },
        { kind: 'or', dst: 't1', a: t('y'), b: t('x') },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('or')
    expect(instrs[1]).toEqual({ kind: 'copy', dst: 't1', src: { kind: 'temp', name: 't0' } })
  })

  test('pow is not commutative: x^2 != 2^x', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'pow', dst: 't0', a: t('x'), b: c(2) },
        { kind: 'pow', dst: 't1', a: c(2), b: t('x') },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('pow')
    expect(instrs[1].kind).toBe('pow')  // not eliminated
  })
})

// ---------------------------------------------------------------------------

describe('CSE — does not propagate across blocks', () => {
  test('expression computed in block A is not eliminated in block B', () => {
    // CSE is intra-block only — block B must recompute x+y even if A did it
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: t('x'), b: t('y') },
      ], { kind: 'jump', target: 'next' }),
      mkBlock('next', [
        { kind: 'add', dst: 't1', a: t('x'), b: t('y') },
      ], { kind: 'return', value: t('t1') }),
    ])
    const result = cse(fn)
    const nextBlock = result.blocks[1]
    expect(nextBlock.instrs[0].kind).toBe('add')  // not a copy
  })
})
