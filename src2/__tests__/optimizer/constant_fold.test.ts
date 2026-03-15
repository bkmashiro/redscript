import { constantFold } from '../../optimizer/constant_fold'
import type { MIRFunction, MIRBlock, MIRInstr, Operand } from '../../mir/types'

function mkFn(blocks: MIRBlock[]): MIRFunction {
  return { name: 'test', params: [], blocks, entry: 'entry', isMacro: false }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr): MIRBlock {
  return { id, instrs, term, preds: [] }
}

const c = (v: number): Operand => ({ kind: 'const', value: v })
const t = (n: string): Operand => ({ kind: 'temp', name: n })

describe('constant folding', () => {
  test('folds add(const, const)', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: c(3), b: c(4) },
      ], { kind: 'return', value: t('t0') }),
    ])
    const result = constantFold(fn)
    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'const', dst: 't0', value: 7 })
  })

  test('folds sub(const, const)', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'sub', dst: 't0', a: c(10), b: c(3) },
      ], { kind: 'return', value: t('t0') }),
    ])
    const result = constantFold(fn)
    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'const', dst: 't0', value: 7 })
  })

  test('folds mul(const, const)', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'mul', dst: 't0', a: c(3), b: c(5) },
      ], { kind: 'return', value: t('t0') }),
    ])
    const result = constantFold(fn)
    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'const', dst: 't0', value: 15 })
  })

  test('folds div(const, const) with truncation', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'div', dst: 't0', a: c(7), b: c(2) },
      ], { kind: 'return', value: t('t0') }),
    ])
    const result = constantFold(fn)
    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'const', dst: 't0', value: 3 })
  })

  test('does not fold div by zero', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'div', dst: 't0', a: c(7), b: c(0) },
      ], { kind: 'return', value: t('t0') }),
    ])
    const result = constantFold(fn)
    expect(result.blocks[0].instrs[0].kind).toBe('div')
  })

  test('folds mod(const, const)', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'mod', dst: 't0', a: c(7), b: c(3) },
      ], { kind: 'return', value: t('t0') }),
    ])
    const result = constantFold(fn)
    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'const', dst: 't0', value: 1 })
  })

  test('folds neg(const)', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'neg', dst: 't0', src: c(5) },
      ], { kind: 'return', value: t('t0') }),
    ])
    const result = constantFold(fn)
    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'const', dst: 't0', value: -5 })
  })

  test('folds not(0) → 1', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'not', dst: 't0', src: c(0) },
      ], { kind: 'return', value: t('t0') }),
    ])
    const result = constantFold(fn)
    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'const', dst: 't0', value: 1 })
  })

  test('folds cmp(lt, 3, 4) → 1', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'cmp', dst: 't0', op: 'lt', a: c(3), b: c(4) },
      ], { kind: 'return', value: t('t0') }),
    ])
    const result = constantFold(fn)
    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'const', dst: 't0', value: 1 })
  })

  test('folds cmp(eq, 5, 5) → 1', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'cmp', dst: 't0', op: 'eq', a: c(5), b: c(5) },
      ], { kind: 'return', value: t('t0') }),
    ])
    const result = constantFold(fn)
    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'const', dst: 't0', value: 1 })
  })

  test('folds and(1, 0) → 0', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'and', dst: 't0', a: c(1), b: c(0) },
      ], { kind: 'return', value: t('t0') }),
    ])
    const result = constantFold(fn)
    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'const', dst: 't0', value: 0 })
  })

  test('folds or(0, 1) → 1', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'or', dst: 't0', a: c(0), b: c(1) },
      ], { kind: 'return', value: t('t0') }),
    ])
    const result = constantFold(fn)
    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'const', dst: 't0', value: 1 })
  })

  test('does not fold when operand is temp', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: t('a'), b: c(4) },
      ], { kind: 'return', value: t('t0') }),
    ])
    const result = constantFold(fn)
    expect(result.blocks[0].instrs[0].kind).toBe('add')
  })
})
