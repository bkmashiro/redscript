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
})
