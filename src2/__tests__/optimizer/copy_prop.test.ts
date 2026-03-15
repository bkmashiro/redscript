import { copyProp } from '../../optimizer/copy_prop'
import type { MIRFunction, MIRBlock, MIRInstr, Operand } from '../../mir/types'

function mkFn(blocks: MIRBlock[]): MIRFunction {
  return { name: 'test', params: [], blocks, entry: 'entry', isMacro: false }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr): MIRBlock {
  return { id, instrs, term, preds: [] }
}

const c = (v: number): Operand => ({ kind: 'const', value: v })
const t = (n: string): Operand => ({ kind: 'temp', name: n })

describe('copy propagation', () => {
  test('propagates copy into subsequent use', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'copy', dst: 'x', src: t('y') },
        { kind: 'add', dst: 'z', a: t('x'), b: c(1) },
      ], { kind: 'return', value: t('z') }),
    ])
    const result = copyProp(fn)
    const add = result.blocks[0].instrs[1]
    expect(add.kind).toBe('add')
    expect((add as any).a).toEqual(t('y'))
  })

  test('propagates into terminator', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'copy', dst: 'x', src: t('y') },
      ], { kind: 'return', value: t('x') }),
    ])
    const result = copyProp(fn)
    expect(result.blocks[0].term).toEqual({ kind: 'return', value: t('y') })
  })

  test('invalidates mapping when source is redefined', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'copy', dst: 'x', src: t('y') },
        { kind: 'const', dst: 'y', value: 99 },
        { kind: 'add', dst: 'z', a: t('x'), b: c(1) },
      ], { kind: 'return', value: t('z') }),
    ])
    const result = copyProp(fn)
    // x's mapping was invalidated because y was redefined
    const add = result.blocks[0].instrs[2]
    expect((add as any).a).toEqual(t('x'))
  })

  test('propagates const definitions into uses', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'const', dst: 'x', value: 42 },
        { kind: 'add', dst: 'z', a: t('x'), b: c(1) },
      ], { kind: 'return', value: t('z') }),
    ])
    const result = copyProp(fn)
    const add = result.blocks[0].instrs[1]
    expect((add as any).a).toEqual(c(42))
  })

  test('propagates copy-of-const into uses', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'copy', dst: 'x', src: c(42) },
        { kind: 'add', dst: 'z', a: t('x'), b: c(1) },
      ], { kind: 'return', value: t('z') }),
    ])
    const result = copyProp(fn)
    const add = result.blocks[0].instrs[1]
    expect((add as any).a).toEqual(c(42))
  })

  test('chains propagation: x=y, z=x → z uses y', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'copy', dst: 'x', src: t('y') },
        { kind: 'copy', dst: 'z', src: t('x') },
      ], { kind: 'return', value: t('z') }),
    ])
    const result = copyProp(fn)
    // z = copy x → rewritten to z = copy y
    // then return z → rewritten to return y
    expect(result.blocks[0].term).toEqual({ kind: 'return', value: t('y') })
  })

  test('propagates into branch condition', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'copy', dst: 'c', src: t('flag') },
      ], { kind: 'branch', cond: t('c'), then: 'b1', else: 'b2' }),
    ])
    const result = copyProp(fn)
    expect(result.blocks[0].term).toEqual({ kind: 'branch', cond: t('flag'), then: 'b1', else: 'b2' })
  })
})
