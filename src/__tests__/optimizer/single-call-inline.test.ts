import { optimizeModule } from '../../optimizer/pipeline'
import { inlineSingleCallFunctions } from '../../optimizer/single-call-inline'
import { inlineSingleCallFunctions } from '../../optimizer/single-call-inline'
import type { MIRBlock, MIRFunction, MIRInstr, MIRModule, Operand } from '../../mir/types'

function mkFn(
  name: string,
  params: string[],
  blocks: MIRBlock[],
  extras: Partial<Pick<MIRFunction, 'isMacro'>> = {},
): MIRFunction {
  return {
    name,
    params: params.map(param => ({ name: param, isMacroParam: extras.isMacro ?? false })),
    blocks,
    entry: 'entry',
    isMacro: false,
    ...extras,
  }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr): MIRBlock {
  return { id, instrs, term, preds: [] }
}

function mkMod(
  functions: MIRFunction[],
  extras: Partial<Pick<MIRModule, 'noInlineFunctions'>> = {},
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

function getFn(mod: MIRModule, name: string): MIRFunction | undefined {
  return mod.functions.find(candidate => candidate.name === name)
}

function getAllInstrs(fn: MIRFunction): MIRInstr[] {
  return fn.blocks.flatMap(block => [...block.instrs, block.term])
}

describe('inlineSingleCallFunctions', () => {
  test('inlines a small function called exactly once and removes its definition', () => {
    const helper = mkFn('test:helper', ['x'], [
      mkBlock('entry', [
        { kind: 'add', dst: 'sum', a: t('x'), b: c(1) },
      ], { kind: 'return', value: t('sum') }),
    ])
    const main = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 'r', fn: 'test:helper', args: [c(41)] },
      ], { kind: 'return', value: t('r') }),
    ])

    const result = inlineSingleCallFunctions(mkMod([main, helper]))
    const instrs = getAllInstrs(getFn(result, 'test:main')!)

    expect(instrs.filter(instr => instr.kind === 'call')).toHaveLength(0)
    expect(instrs.filter(instr => instr.kind === 'add')).toHaveLength(1)
    expect(getFn(result, 'test:helper')).toBeUndefined()
  })

  test('pipeline inlines a larger function called exactly once', () => {
    const helper = mkFn('test:helper', ['x'], [
      mkBlock('entry', [
        { kind: 'copy', dst: 'a', src: t('x') },
        { kind: 'add', dst: 'b', a: t('a'), b: c(1) },
        { kind: 'mul', dst: 'c', a: t('b'), b: c(2) },
        { kind: 'sub', dst: 'd', a: t('c'), b: c(3) },
        { kind: 'add', dst: 'e', a: t('d'), b: c(4) },
        { kind: 'mul', dst: 'f', a: t('e'), b: c(5) },
      ], { kind: 'return', value: t('f') }),
    ])
    const main = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 'r', fn: 'test:helper', args: [c(2)] },
      ], { kind: 'return', value: t('r') }),
    ])

    const result = inlineSingleCallFunctions(mkMod([main, helper]))
    const instrs = getAllInstrs(getFn(result, 'test:main')!)

    expect(instrs.filter(instr => instr.kind === 'call')).toHaveLength(0)
    expect(getFn(result, 'test:helper')).toBeUndefined()
  })

  test('does not inline a function called more than once across the module', () => {
    const helper = mkFn('test:helper', ['x'], [
      mkBlock('entry', [
        { kind: 'copy', dst: 'r', src: t('x') },
      ], { kind: 'return', value: t('r') }),
    ])
    const first = mkFn('test:first', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 'r1', fn: 'test:helper', args: [c(1)] },
      ], { kind: 'return', value: t('r1') }),
    ])
    const second = mkFn('test:second', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 'r2', fn: 'test:helper', args: [c(2)] },
      ], { kind: 'return', value: t('r2') }),
    ])

    const result = inlineSingleCallFunctions(mkMod([first, second, helper]))

    expect(getAllInstrs(getFn(result, 'test:first')!).filter(instr => instr.kind === 'call')).toHaveLength(1)
    expect(getAllInstrs(getFn(result, 'test:second')!).filter(instr => instr.kind === 'call')).toHaveLength(1)
    expect(getFn(result, 'test:helper')).toBeDefined()
  })

  test('does not inline functions marked @no-inline', () => {
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

    const result = inlineSingleCallFunctions(mkMod([main, helper], {
      noInlineFunctions: new Set(['test:helper']),
    }))

    expect(getAllInstrs(getFn(result, 'test:main')!).filter(instr => instr.kind === 'call')).toHaveLength(1)
    expect(getFn(result, 'test:helper')).toBeDefined()
  })

  test('does not inline macro functions', () => {
    const macro = mkFn('test:macro', ['x'], [
      mkBlock('entry', [
        { kind: 'copy', dst: 'r', src: t('x') },
      ], { kind: 'return', value: t('r') }),
    ], { isMacro: true })
    const main = mkFn('test:main', [], [
      mkBlock('entry', [
        {
          kind: 'call_macro',
          dst: 'r',
          fn: 'test:macro',
          args: [{ name: 'x', value: c(1), type: 'int', scale: 1 }],
        },
      ], { kind: 'return', value: t('r') }),
    ])

    const result = inlineSingleCallFunctions(mkMod([main, macro]))

    expect(getAllInstrs(getFn(result, 'test:main')!).filter(instr => instr.kind === 'call_macro')).toHaveLength(1)
    expect(getFn(result, 'test:macro')).toBeDefined()
  })

  test('does not inline functions containing raw() calls', () => {
    const helper = mkFn('test:helper', [], [
      mkBlock('entry', [
        { kind: 'call', dst: null, fn: '__raw:say hi', args: [] },
      ], { kind: 'return', value: null }),
    ])
    const main = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: null, fn: 'test:helper', args: [] },
      ], { kind: 'return', value: null }),
    ])

    const result = inlineSingleCallFunctions(mkMod([main, helper]))

    expect(getAllInstrs(getFn(result, 'test:main')!).filter(instr => instr.kind === 'call')).toHaveLength(1)
    expect(getFn(result, 'test:helper')).toBeDefined()
  })

  test('does not inline directly recursive functions', () => {
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

    const result = inlineSingleCallFunctions(mkMod([main, recur]))

    expect(getAllInstrs(getFn(result, 'test:main')!).filter(instr => instr.kind === 'call')).toHaveLength(1)
    expect(getFn(result, 'test:recur')).toBeDefined()
  })

  test('does not inline indirectly recursive functions', () => {
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

    const result = inlineSingleCallFunctions(mkMod([main, first, second]))

    expect(getAllInstrs(getFn(result, 'test:main')!).filter(instr => instr.kind === 'call')).toHaveLength(1)
    expect(getFn(result, 'test:first')).toBeDefined()
    expect(getFn(result, 'test:second')).toBeDefined()
  })
})
