import { findTailCallBlocks, tailCallOptimize } from '../../optimizer/tco'
import type { MIRBlock, MIRFunction, MIRInstr, Operand } from '../../mir/types'

const c = (value: number): Operand => ({ kind: 'const', value })
const t = (name: string): Operand => ({ kind: 'temp', name })

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr): MIRBlock {
  return { id, instrs, term, preds: [] }
}

function mkFn(
  name: string,
  params: string[],
  blocks: MIRBlock[],
  isMacro = false,
): MIRFunction {
  return {
    name,
    params: params.map(param => ({ name: param, isMacroParam: false })),
    blocks,
    entry: 'entry',
    isMacro,
  }
}

function getBlock(fn: MIRFunction, id: string): MIRBlock {
  const block = fn.blocks.find(blockCandidate => blockCandidate.id === id)
  expect(block).toBeDefined()
  return block!
}

describe('optimizer/tco edge cases', () => {
  test('findTailCallBlocks returns empty when a function has no blocks', () => {
    const fn = mkFn('test:empty', ['x'], [])

    expect(findTailCallBlocks(fn)).toEqual([])
    expect(tailCallOptimize(fn)).toBe(fn)
  })

  test('findTailCallBlocks rejects returns that are not self-tail-call results', () => {
    const fn = mkFn('test:not_tail_return', ['x'], [
      mkBlock('ret-null', [
        { kind: 'call', dst: 'r0', fn: 'test:not_tail_return', args: [t('x')] },
      ], { kind: 'return', value: null }),
      mkBlock('ret-const', [
        { kind: 'call', dst: 'r1', fn: 'test:not_tail_return', args: [t('x')] },
      ], { kind: 'return', value: c(1) }),
      mkBlock('ret-other-temp', [
        { kind: 'call', dst: 'r2', fn: 'test:not_tail_return', args: [t('x')] },
      ], { kind: 'return', value: t('other') }),
      mkBlock('call-no-dst', [
        { kind: 'call', dst: null, fn: 'test:not_tail_return', args: [t('x')] },
      ], { kind: 'return', value: t('x') }),
    ])

    expect(findTailCallBlocks(fn)).toEqual([])
  })

  test('tailCallOptimize skips macro functions even when detection would succeed', () => {
    const fn = mkFn('test:macro_skip', ['x'], [
      mkBlock('entry', [
        { kind: 'call', dst: 'next', fn: 'test:macro_skip', args: [t('x')] },
      ], { kind: 'return', value: t('next') }),
    ], true)

    expect(findTailCallBlocks(fn)).toEqual([{ blockId: 'entry', callIdx: 0, argCount: 1 }])
    expect(tailCallOptimize(fn)).toBe(fn)
  })

  test('tailCallOptimize rewrites a three-parameter tail-recursive function', () => {
    const fn = mkFn('test:triple', ['n', 'acc', 'step'], [
      mkBlock('entry', [
        { kind: 'cmp', dst: 'done', op: 'le', a: t('n'), b: c(0) },
      ], { kind: 'branch', cond: t('done'), then: 'base', else: 'loop' }),
      mkBlock('base', [], { kind: 'return', value: t('acc') }),
      mkBlock('loop', [
        { kind: 'add', dst: 'nextAcc', a: t('acc'), b: t('step') },
        { kind: 'sub', dst: 'nextN', a: t('n'), b: c(1) },
        { kind: 'call', dst: 'result', fn: 'test:triple', args: [t('nextN'), t('nextAcc'), t('step')] },
      ], { kind: 'return', value: t('result') }),
    ])

    const optimized = tailCallOptimize(fn)
    const entry = getBlock(optimized, '__tco_entry')
    const loop = getBlock(optimized, 'loop')

    expect(optimized.entry).toBe('__tco_entry')
    expect(entry.instrs).toEqual([
      { kind: 'copy', dst: '__lp0', src: t('n') },
      { kind: 'copy', dst: '__lp1', src: t('acc') },
      { kind: 'copy', dst: '__lp2', src: t('step') },
    ])
    expect(loop.instrs.slice(-6)).toEqual([
      { kind: 'copy', dst: '__tco_arg0', src: t('nextN') },
      { kind: 'copy', dst: '__tco_arg1', src: t('nextAcc') },
      { kind: 'copy', dst: '__tco_arg2', src: t('__lp2') },
      { kind: 'copy', dst: '__lp0', src: t('__tco_arg0') },
      { kind: 'copy', dst: '__lp1', src: t('__tco_arg1') },
      { kind: 'copy', dst: '__lp2', src: t('__tco_arg2') },
    ])
    expect(loop.term).toEqual({ kind: 'jump', target: 'entry' })
  })

  test('tailCallOptimize leaves a function unchanged when the final call result is not returned', () => {
    const fn = mkFn('test:not_tail_call', ['x'], [
      mkBlock('entry', [
        { kind: 'call', dst: 'next', fn: 'test:not_tail_call', args: [t('x')] },
      ], { kind: 'return', value: t('x') }),
    ])

    expect(findTailCallBlocks(fn)).toEqual([])
    expect(tailCallOptimize(fn)).toBe(fn)
  })

  test('mutual recursion is not treated as TCO candidate', () => {
    const fnA = mkFn('test:A', ['x'], [
      mkBlock('entry', [
        { kind: 'call', dst: 'next', fn: 'test:B', args: [t('x')] },
      ], { kind: 'return', value: t('next') }),
    ])
    const fnB = mkFn('test:B', ['x'], [
      mkBlock('entry', [
        { kind: 'call', dst: 'next', fn: 'test:A', args: [t('x')] },
      ], { kind: 'return', value: t('next') }),
    ])

    expect(findTailCallBlocks(fnA)).toEqual([])
    expect(findTailCallBlocks(fnB)).toEqual([])
    expect(tailCallOptimize(fnA)).toBe(fnA)
    expect(tailCallOptimize(fnB)).toBe(fnB)
  })

  test('a single-block function is rewritten into loop form', () => {
    const fn = mkFn('test:single_block', ['a', 'b'], [
      mkBlock('entry', [
        { kind: 'add', dst: 'sum', a: t('a'), b: t('b') },
        { kind: 'call', dst: 'next', fn: 'test:single_block', args: [t('b'), t('sum')] },
      ], { kind: 'return', value: t('next') }),
    ])

    const optimized = tailCallOptimize(fn)
    const tcoEntry = getBlock(optimized, '__tco_entry')
    const loop = getBlock(optimized, 'entry')

    expect(findTailCallBlocks(fn)).toEqual([{ blockId: 'entry', callIdx: 1, argCount: 2 }])
    expect(optimized.entry).toBe('__tco_entry')
    expect(tcoEntry.term).toEqual({ kind: 'jump', target: 'entry' })
    expect(loop.term).toEqual({ kind: 'jump', target: 'entry' })
    expect(loop.preds.sort()).toEqual(['__tco_entry', 'entry'])
  })
})
