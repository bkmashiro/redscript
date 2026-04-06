import { strengthReduction } from '../../optimizer/strength_reduction'
import type { MIRBlock, MIRFunction, MIRInstr, Operand } from '../../mir/types'

function mkFn(blocks: MIRBlock[]): MIRFunction {
  return { name: 'test', params: [], blocks, entry: 'entry', isMacro: false }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr): MIRBlock {
  return { id, instrs, term, preds: [] }
}

const c = (value: number): Operand => ({ kind: 'const', value })
const t = (name: string): Operand => ({ kind: 'temp', name })

describe('strength reduction', () => {
  test('rewrites x * 2 to x + x', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'mul', dst: 't0', a: t('x'), b: c(2) },
      ], { kind: 'return', value: t('t0') }),
    ])

    const result = strengthReduction(fn)

    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'add', dst: 't0', a: t('x'), b: t('x') })
  })

  test('rewrites x * 1 to x', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'mul', dst: 't0', a: t('x'), b: c(1) },
      ], { kind: 'return', value: t('t0') }),
    ])

    const result = strengthReduction(fn)

    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'copy', dst: 't0', src: t('x') })
  })

  test('rewrites x * 0 to 0', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'mul', dst: 't0', a: t('x'), b: c(0) },
      ], { kind: 'return', value: t('t0') }),
    ])

    const result = strengthReduction(fn)

    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'const', dst: 't0', value: 0 })
  })

  test('rewrites x + 0 to x', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: t('x'), b: c(0) },
      ], { kind: 'return', value: t('t0') }),
    ])

    const result = strengthReduction(fn)

    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'copy', dst: 't0', src: t('x') })
  })

  test('rewrites x - 0 to x', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'sub', dst: 't0', a: t('x'), b: c(0) },
      ], { kind: 'return', value: t('t0') }),
    ])

    const result = strengthReduction(fn)

    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'copy', dst: 't0', src: t('x') })
  })

  test('rewrites x / 1 to x', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'div', dst: 't0', a: t('x'), b: c(1) },
      ], { kind: 'return', value: t('t0') }),
    ])

    const result = strengthReduction(fn)

    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'copy', dst: 't0', src: t('x') })
  })

  test('rewrites x ^ 1 to x', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'pow', dst: 't0', a: t('x'), b: c(1) } as unknown as MIRInstr,
      ], { kind: 'return', value: t('t0') }),
    ])

    const result = strengthReduction(fn)

    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'copy', dst: 't0', src: t('x') })
  })

  test('rewrites x * -1 to -x', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'mul', dst: 't0', a: t('x'), b: c(-1) },
      ], { kind: 'return', value: t('t0') }),
    ])

    const result = strengthReduction(fn)

    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'neg', dst: 't0', src: t('x') })
  })

  test('rewrites 2 * x to x + x (const on left)', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'mul', dst: 't0', a: c(2), b: t('x') },
      ], { kind: 'return', value: t('t0') }),
    ])

    const result = strengthReduction(fn)

    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'add', dst: 't0', a: t('x'), b: t('x') })
  })

  test('rewrites 1 * x to x (const on left)', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'mul', dst: 't0', a: c(1), b: t('x') },
      ], { kind: 'return', value: t('t0') }),
    ])

    const result = strengthReduction(fn)

    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'copy', dst: 't0', src: t('x') })
  })

  test('rewrites -1 * x to -x (const on left)', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'mul', dst: 't0', a: c(-1), b: t('x') },
      ], { kind: 'return', value: t('t0') }),
    ])

    const result = strengthReduction(fn)

    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'neg', dst: 't0', src: t('x') })
  })

  test('rewrites 0 * x to 0 (const on left)', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'mul', dst: 't0', a: c(0), b: t('x') },
      ], { kind: 'return', value: t('t0') }),
    ])

    const result = strengthReduction(fn)

    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'const', dst: 't0', value: 0 })
  })

  test('rewrites 0 + x to x (const on left)', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'add', dst: 't0', a: c(0), b: t('x') },
      ], { kind: 'return', value: t('t0') }),
    ])

    const result = strengthReduction(fn)

    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'copy', dst: 't0', src: t('x') })
  })

  test('leaves x * 3 unchanged (no applicable rule)', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'mul', dst: 't0', a: t('x'), b: c(3) },
      ], { kind: 'return', value: t('t0') }),
    ])

    const result = strengthReduction(fn)

    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'mul', dst: 't0', a: t('x'), b: c(3) })
  })

  test('leaves x / 2 unchanged (no applicable rule)', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'div', dst: 't0', a: t('x'), b: c(2) },
      ], { kind: 'return', value: t('t0') }),
    ])

    const result = strengthReduction(fn)

    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'div', dst: 't0', a: t('x'), b: c(2) })
  })
})
