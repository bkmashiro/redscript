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
        { kind: 'pow', dst: 't0', a: t('x'), b: c(1) },
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
})
