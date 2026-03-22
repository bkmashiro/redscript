import { autoInlineSmallFunctions } from '../../optimizer/auto-inline'
import { optimizeModule } from '../../optimizer/pipeline'
import type { MIRBlock, MIRFunction, MIRInstr, MIRModule, Operand } from '../../mir/types'

function mkFn(name: string, params: string[], blocks: MIRBlock[]): MIRFunction {
  return {
    name,
    params: params.map(param => ({ name: param, isMacroParam: false })),
    blocks,
    entry: 'entry',
    isMacro: false,
  }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr): MIRBlock {
  return { id, instrs, term, preds: [] }
}

function mkMod(
  functions: MIRFunction[],
  extras: Partial<Pick<MIRModule, 'inlineFunctions' | 'noInlineFunctions'>> = {},
): MIRModule {
  return {
    functions,
    namespace: 'test',
    objective: '__test',
    ...extras,
  }
}

const c = (value: number): Operand => ({ kind: 'const', value })
const t = (name: string): Operand => ({ kind: 'temp', name })

function getFn(mod: MIRModule, name: string): MIRFunction {
  const fn = mod.functions.find(candidate => candidate.name === name)
  if (!fn) throw new Error(`Missing function ${name}`)
  return fn
}

function getAllInstrs(fn: MIRFunction): MIRInstr[] {
  return fn.blocks.flatMap(block => [...block.instrs, block.term])
}

describe('autoInlineSmallFunctions', () => {
  test('automatically inlines a small function without @inline', () => {
    const addOne = mkFn('test:add_one', ['x'], [
      mkBlock('entry', [
        { kind: 'add', dst: 'sum', a: t('x'), b: c(1) },
      ], { kind: 'return', value: t('sum') }),
    ])
    const main = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 'r', fn: 'test:add_one', args: [c(41)] },
      ], { kind: 'return', value: t('r') }),
    ])

    const result = autoInlineSmallFunctions(mkMod([main, addOne]))
    const instrs = getAllInstrs(getFn(result, 'test:main'))

    expect(instrs.filter(instr => instr.kind === 'call')).toHaveLength(0)
    expect(instrs.filter(instr => instr.kind === 'add')).toHaveLength(1)
  })

  test('does not auto-inline functions marked @no-inline', () => {
    const helper = mkFn('test:helper', ['x'], [
      mkBlock('entry', [
        { kind: 'copy', dst: 'r', src: t('x') },
      ], { kind: 'return', value: t('r') }),
    ])
    const main = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 'r', fn: 'test:helper', args: [c(1)] },
      ], { kind: 'return', value: t('r') }),
    ])

    const result = autoInlineSmallFunctions(mkMod([main, helper], {
      noInlineFunctions: new Set(['test:helper']),
    }))

    expect(getAllInstrs(getFn(result, 'test:main')).filter(instr => instr.kind === 'call')).toHaveLength(1)
  })

  test('does not auto-inline functions larger than 5 MIR instructions', () => {
    const big = mkFn('test:big', ['x'], [
      mkBlock('entry', [
        { kind: 'copy', dst: 'a', src: t('x') },
        { kind: 'add', dst: 'b', a: t('a'), b: c(1) },
        { kind: 'mul', dst: 'c', a: t('b'), b: c(2) },
        { kind: 'sub', dst: 'd', a: t('c'), b: c(3) },
        { kind: 'add', dst: 'e', a: t('d'), b: c(4) },
      ], { kind: 'return', value: t('e') }),
    ])
    const main = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 'r', fn: 'test:big', args: [c(2)] },
      ], { kind: 'return', value: t('r') }),
    ])

    const result = autoInlineSmallFunctions(mkMod([main, big]))

    expect(getAllInstrs(getFn(result, 'test:main')).filter(instr => instr.kind === 'call')).toHaveLength(1)
  })

  test('auto-inlines functions with exactly 5 MIR instructions', () => {
    const exactFive = mkFn('test:exact_five', ['x'], [
      mkBlock('entry', [
        { kind: 'copy', dst: 'a', src: t('x') },
        { kind: 'add', dst: 'b', a: t('a'), b: c(1) },
        { kind: 'mul', dst: 'c', a: t('b'), b: c(2) },
        { kind: 'sub', dst: 'd', a: t('c'), b: c(3) },
      ], { kind: 'return', value: t('d') }),
    ])
    const main = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 'r', fn: 'test:exact_five', args: [c(2)] },
      ], { kind: 'return', value: t('r') }),
    ])

    const result = autoInlineSmallFunctions(mkMod([main, exactFive]))

    expect(getAllInstrs(getFn(result, 'test:main')).filter(instr => instr.kind === 'call')).toHaveLength(0)
  })

  test('does not auto-inline directly recursive functions', () => {
    const recur = mkFn('test:recur', ['n'], [
      mkBlock('entry', [
        { kind: 'sub', dst: 'n1', a: t('n'), b: c(1) },
        { kind: 'call', dst: 'r', fn: 'test:recur', args: [t('n1')] },
      ], { kind: 'return', value: t('r') }),
    ])
    const main = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 'r', fn: 'test:recur', args: [c(3)] },
      ], { kind: 'return', value: t('r') }),
    ])

    const result = autoInlineSmallFunctions(mkMod([main, recur]))

    expect(getAllInstrs(getFn(result, 'test:main')).filter(instr => instr.kind === 'call')).toHaveLength(1)
  })

  test('does not auto-inline indirectly recursive functions', () => {
    const first = mkFn('test:first', ['n'], [
      mkBlock('entry', [
        { kind: 'call', dst: 'r', fn: 'test:second', args: [t('n')] },
      ], { kind: 'return', value: t('r') }),
    ])
    const second = mkFn('test:second', ['n'], [
      mkBlock('entry', [
        { kind: 'call', dst: 'r', fn: 'test:first', args: [t('n')] },
      ], { kind: 'return', value: t('r') }),
    ])
    const main = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 'r', fn: 'test:first', args: [c(1)] },
      ], { kind: 'return', value: t('r') }),
    ])

    const result = autoInlineSmallFunctions(mkMod([main, first, second]))

    expect(getAllInstrs(getFn(result, 'test:main')).filter(instr => instr.kind === 'call')).toHaveLength(1)
  })

  test('pipeline still honors explicit @inline for larger functions', () => {
    const explicitInline = mkFn('test:explicit', ['x'], [
      mkBlock('entry', [
        { kind: 'copy', dst: 'a', src: t('x') },
        { kind: 'add', dst: 'b', a: t('a'), b: c(1) },
        { kind: 'mul', dst: 'c', a: t('b'), b: c(2) },
        { kind: 'sub', dst: 'd', a: t('c'), b: c(3) },
        { kind: 'add', dst: 'e', a: t('d'), b: c(4) },
      ], { kind: 'return', value: t('e') }),
    ])
    const main = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 'r', fn: 'test:explicit', args: [c(2)] },
      ], { kind: 'return', value: t('r') }),
    ])

    const result = optimizeModule(mkMod([main, explicitInline], {
      inlineFunctions: new Set(['test:explicit']),
    }))

    expect(getAllInstrs(getFn(result, 'test:main')).filter(instr => instr.kind === 'call')).toHaveLength(0)
  })

  test('inlining before DCE removes dead code exposed by the inline', () => {
    const id = mkFn('test:id', ['x'], [
      mkBlock('entry', [
        { kind: 'copy', dst: 'r', src: t('x') },
      ], { kind: 'return', value: t('r') }),
    ])
    const main = mkFn('test:main', ['p'], [
      mkBlock('entry', [
        { kind: 'call', dst: 'dead', fn: 'test:id', args: [t('p')] },
      ], { kind: 'return', value: null }),
    ])

    const result = optimizeModule(mkMod([main, id]))
    const instrs = getAllInstrs(getFn(result, 'test:main'))

    expect(instrs.filter(instr => instr.kind === 'call')).toHaveLength(0)
    expect(instrs.filter(instr => instr.kind === 'copy')).toHaveLength(0)
    expect(getFn(result, 'test:main').blocks).toHaveLength(1)
  })
})
