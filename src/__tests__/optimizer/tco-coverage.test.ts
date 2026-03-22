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
  const block = fn.blocks.find(candidate => candidate.id === id)
  expect(block).toBeDefined()
  return block!
}

describe('optimizer/tco coverage cases', () => {
  test('optimizes a single-block self tail call with two parameters', () => {
    const fn = mkFn('test:pair', ['a', 'b'], [
      mkBlock('entry', [
        { kind: 'add', dst: 'sum', a: t('a'), b: t('b') },
        { kind: 'call', dst: 'next', fn: 'test:pair', args: [t('b'), t('sum')] },
      ], { kind: 'return', value: t('next') }),
    ])

    const optimized = tailCallOptimize(fn)
    const entry = getBlock(optimized, '__tco_entry')
    const loop = getBlock(optimized, 'entry')

    expect(findTailCallBlocks(fn)).toEqual([{ blockId: 'entry', callIdx: 1, argCount: 2 }])
    expect(optimized.entry).toBe('__tco_entry')
    expect(entry.instrs).toHaveLength(2)
    expect(loop.term).toEqual({ kind: 'jump', target: 'entry' })
    expect(loop.instrs.slice(-4)).toEqual([
      { kind: 'copy', dst: '__tco_arg0', src: t('__lp1') },
      { kind: 'copy', dst: '__tco_arg1', src: t('sum') },
      { kind: 'copy', dst: '__lp0', src: t('__tco_arg0') },
      { kind: 'copy', dst: '__lp1', src: t('__tco_arg1') },
    ])
  })

  test('optimizes a three-parameter tail-recursive function', () => {
    const fn = mkFn('test:triple', ['n', 'acc', 'step'], [
      mkBlock('entry', [
        { kind: 'cmp', dst: 'done', op: 'le', a: t('n'), b: c(0) },
      ], { kind: 'branch', cond: t('done'), then: 'base', else: 'recur' }),
      mkBlock('base', [], { kind: 'return', value: t('acc') }),
      mkBlock('recur', [
        { kind: 'add', dst: 'nextAcc', a: t('acc'), b: t('step') },
        { kind: 'sub', dst: 'nextN', a: t('n'), b: c(1) },
        { kind: 'call', dst: 'result', fn: 'test:triple', args: [t('nextN'), t('nextAcc'), t('step')] },
      ], { kind: 'return', value: t('result') }),
    ])

    const optimized = tailCallOptimize(fn)
    const recur = getBlock(optimized, 'recur')

    expect(findTailCallBlocks(fn)).toEqual([{ blockId: 'recur', callIdx: 2, argCount: 3 }])
    expect(optimized.entry).toBe('__tco_entry')
    expect(recur.instrs.slice(-6)).toEqual([
      { kind: 'copy', dst: '__tco_arg0', src: t('nextN') },
      { kind: 'copy', dst: '__tco_arg1', src: t('nextAcc') },
      { kind: 'copy', dst: '__tco_arg2', src: t('__lp2') },
      { kind: 'copy', dst: '__lp0', src: t('__tco_arg0') },
      { kind: 'copy', dst: '__lp1', src: t('__tco_arg1') },
      { kind: 'copy', dst: '__lp2', src: t('__tco_arg2') },
    ])
  })

  test('leaves a normal non-tail recursive function unchanged', () => {
    const fn = mkFn('test:not_tail', ['n'], [
      mkBlock('entry', [
        { kind: 'call', dst: 'tmp', fn: 'test:not_tail', args: [t('n')] },
        { kind: 'add', dst: 'out', a: t('tmp'), b: c(1) },
      ], { kind: 'return', value: t('out') }),
    ])

    expect(findTailCallBlocks(fn)).toEqual([])
    expect(tailCallOptimize(fn)).toBe(fn)
  })

  test('does not treat mutual recursion as self tail recursion', () => {
    const fnA = mkFn('test:A', ['n'], [
      mkBlock('entry', [
        { kind: 'call', dst: 'next', fn: 'test:B', args: [t('n')] },
      ], { kind: 'return', value: t('next') }),
    ])
    const fnB = mkFn('test:B', ['n'], [
      mkBlock('entry', [
        { kind: 'call', dst: 'next', fn: 'test:A', args: [t('n')] },
      ], { kind: 'return', value: t('next') }),
    ])

    expect(findTailCallBlocks(fnA)).toEqual([])
    expect(findTailCallBlocks(fnB)).toEqual([])
    expect(tailCallOptimize(fnA)).toBe(fnA)
    expect(tailCallOptimize(fnB)).toBe(fnB)
  })

  test('returns an empty function unchanged', () => {
    const fn = mkFn('test:empty', ['x'], [])
    expect(findTailCallBlocks(fn)).toEqual([])
    expect(tailCallOptimize(fn)).toBe(fn)
  })

  test('skips macro functions even if they look tail-recursive', () => {
    const fn = mkFn('test:macro', ['x'], [
      mkBlock('entry', [
        { kind: 'call', dst: 'tmp', fn: 'test:macro', args: [t('x')] },
      ], { kind: 'return', value: t('tmp') }),
    ], true)

    expect(findTailCallBlocks(fn)).toEqual([{ blockId: 'entry', callIdx: 0, argCount: 1 }])
    expect(tailCallOptimize(fn)).toBe(fn)
  })

  test('rewrites supported operand-carrying instructions and keeps default-case instructions intact', () => {
    const fn = mkFn('test:ops', ['a', 'b'], [
      mkBlock('entry', [
        { kind: 'cmp', dst: 'cond', op: 'eq', a: t('a'), b: c(0) },
      ], { kind: 'branch', cond: t('cond'), then: 'base', else: 'ops' }),
      mkBlock('base', [], { kind: 'return', value: t('b') }),
      mkBlock('ops', [
        { kind: 'copy', dst: 'copy1', src: t('a') },
        { kind: 'add', dst: 'add1', a: t('a'), b: t('b') },
        { kind: 'sub', dst: 'sub1', a: t('a'), b: t('b') },
        { kind: 'mul', dst: 'mul1', a: t('a'), b: t('b') },
        { kind: 'div', dst: 'div1', a: t('a'), b: t('b') },
        { kind: 'mod', dst: 'mod1', a: t('a'), b: t('b') },
        { kind: 'neg', dst: 'neg1', src: t('a') },
        { kind: 'cmp', dst: 'cmp1', op: 'gt', a: t('a'), b: t('b') },
        { kind: 'and', dst: 'and1', a: t('a'), b: t('b') },
        { kind: 'or', dst: 'or1', a: t('a'), b: t('b') },
        { kind: 'not', dst: 'not1', src: t('a') },
        { kind: 'nbt_write', ns: 'test', path: 'p', type: 'int', scale: 1, src: t('a') },
        { kind: 'nbt_write_dynamic', ns: 'test', pathPrefix: 'p', indexSrc: t('a'), valueSrc: t('b') },
        { kind: 'nbt_read_dynamic', dst: 'dyn1', ns: 'test', pathPrefix: 'p', indexSrc: t('a') },
        { kind: 'score_write', player: 'p', obj: 'o', src: t('a') },
        {
          kind: 'call_macro',
          dst: 'macro1',
          fn: 'test:macro_helper',
          args: [{ name: 'value', value: t('a'), type: 'int', scale: 1 }],
        },
        { kind: 'const', dst: 'const1', value: 42 },
        { kind: 'call', dst: 'tail', fn: 'test:ops', args: [t('b'), t('a')] },
      ], { kind: 'return', value: t('tail') }),
    ])

    const optimized = tailCallOptimize(fn)
    const entry = getBlock(optimized, 'entry')
    const base = getBlock(optimized, 'base')
    const ops = getBlock(optimized, 'ops')
    const lastEvalStart = ops.instrs.length - 4

    expect(entry.term).toEqual({ kind: 'branch', cond: t('cond'), then: 'base', else: 'ops' })
    expect((entry.instrs[0] as Extract<MIRInstr, { kind: 'cmp' }>).a).toEqual(t('__lp0'))
    expect((base.term as Extract<MIRInstr, { kind: 'return' }>).value).toEqual(t('__lp1'))
    expect((ops.instrs[0] as Extract<MIRInstr, { kind: 'copy' }>).src).toEqual(t('__lp0'))
    expect((ops.instrs[4] as Extract<MIRInstr, { kind: 'div' }>).a).toEqual(t('__lp0'))
    expect((ops.instrs[5] as Extract<MIRInstr, { kind: 'mod' }>).b).toEqual(t('__lp1'))
    expect((ops.instrs[6] as Extract<MIRInstr, { kind: 'neg' }>).src).toEqual(t('__lp0'))
    expect((ops.instrs[8] as Extract<MIRInstr, { kind: 'and' }>).a).toEqual(t('__lp0'))
    expect((ops.instrs[9] as Extract<MIRInstr, { kind: 'or' }>).b).toEqual(t('__lp1'))
    expect((ops.instrs[10] as Extract<MIRInstr, { kind: 'not' }>).src).toEqual(t('__lp0'))
    expect((ops.instrs[11] as Extract<MIRInstr, { kind: 'nbt_write' }>).src).toEqual(t('__lp0'))
    expect((ops.instrs[12] as Extract<MIRInstr, { kind: 'nbt_write_dynamic' }>).indexSrc).toEqual(t('__lp0'))
    expect((ops.instrs[12] as Extract<MIRInstr, { kind: 'nbt_write_dynamic' }>).valueSrc).toEqual(t('__lp1'))
    expect((ops.instrs[13] as Extract<MIRInstr, { kind: 'nbt_read_dynamic' }>).indexSrc).toEqual(t('__lp0'))
    expect((ops.instrs[14] as Extract<MIRInstr, { kind: 'score_write' }>).src).toEqual(t('__lp0'))
    expect((ops.instrs[15] as Extract<MIRInstr, { kind: 'call_macro' }>).args[0].value).toEqual(t('__lp0'))
    expect(ops.instrs[16]).toEqual({ kind: 'const', dst: 'const1', value: 42 })
    expect(ops.instrs.slice(lastEvalStart)).toEqual([
      { kind: 'copy', dst: '__tco_arg0', src: t('__lp1') },
      { kind: 'copy', dst: '__tco_arg1', src: t('__lp0') },
      { kind: 'copy', dst: '__lp0', src: t('__tco_arg0') },
      { kind: 'copy', dst: '__lp1', src: t('__tco_arg1') },
    ])
  })
})
