import { interproceduralConstProp } from '../../optimizer/interprocedural'
import type { MIRFunction, MIRModule, MIRBlock, MIRInstr, Operand } from '../../mir/types'

function mkMod(functions: MIRFunction[]): MIRModule {
  return { functions, namespace: 'test', objective: '__test' }
}

function mkFn(name: string, params: string[], blocks: MIRBlock[]): MIRFunction {
  return {
    name,
    params: params.map(p => ({ name: p, isMacroParam: false })),
    blocks,
    entry: 'entry',
    isMacro: false,
  }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr): MIRBlock {
  return { id, instrs, term, preds: [] }
}

const c = (v: number): Operand => ({ kind: 'const', value: v })
const t = (n: string): Operand => ({ kind: 'temp', name: n })

describe('interproceduralConstProp', () => {
  test('specializes callee when all args are constants', () => {
    // fn add(a, b) { return a + b }
    // fn main() { call add(3, 4) }
    const addFn = mkFn('test:add', ['a', 'b'], [
      mkBlock('entry', [
        { kind: 'add', dst: 'result', a: t('a'), b: t('b') },
      ], { kind: 'return', value: t('result') }),
    ])

    const mainFn = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 't0', fn: 'test:add', args: [c(3), c(4)] },
      ], { kind: 'return', value: t('t0') }),
    ])

    const mod = mkMod([mainFn, addFn])
    const result = interproceduralConstProp(mod)

    // Should have a specialized function
    const specializedName = 'test:add__const_3_4'
    const specialized = result.functions.find(f => f.name === specializedName)
    expect(specialized).toBeDefined()

    // Specialized function should have no params
    expect(specialized!.params).toHaveLength(0)

    // Specialized function should have constant-folded result: add(3,4) → 7
    const entry = specialized!.blocks[0]
    const returnInstr = entry.term as Extract<MIRInstr, { kind: 'return' }>
    // After const fold, the add(3,4) becomes const 7, and return references it
    const resultInstr = entry.instrs.find(i => i.kind === 'const' && (i as any).value === 7)
    expect(resultInstr).toBeDefined()
  })

  test('rewrites call site to use specialized function', () => {
    const addFn = mkFn('test:add', ['a', 'b'], [
      mkBlock('entry', [
        { kind: 'add', dst: 'result', a: t('a'), b: t('b') },
      ], { kind: 'return', value: t('result') }),
    ])

    const mainFn = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 't0', fn: 'test:add', args: [c(3), c(4)] },
      ], { kind: 'return', value: t('t0') }),
    ])

    const mod = mkMod([mainFn, addFn])
    const result = interproceduralConstProp(mod)

    const main = result.functions.find(f => f.name === 'test:main')!
    const callInstr = main.blocks[0].instrs.find(i => i.kind === 'call') as Extract<MIRInstr, { kind: 'call' }>
    expect(callInstr.fn).toBe('test:add__const_3_4')
    expect(callInstr.args).toHaveLength(0)
  })

  test('does not specialize when args are not all constants', () => {
    const addFn = mkFn('test:add', ['a', 'b'], [
      mkBlock('entry', [
        { kind: 'add', dst: 'result', a: t('a'), b: t('b') },
      ], { kind: 'return', value: t('result') }),
    ])

    const mainFn = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 't0', fn: 'test:add', args: [t('x'), c(4)] },
      ], { kind: 'return', value: t('t0') }),
    ])

    const mod = mkMod([mainFn, addFn])
    const result = interproceduralConstProp(mod)

    // No specialization created
    expect(result.functions.some(f => f.name.includes('__const_'))).toBe(false)
  })

  test('does not specialize macro functions', () => {
    const macroFn: MIRFunction = {
      name: 'test:mfn',
      params: [{ name: 'a', isMacroParam: true }],
      blocks: [mkBlock('entry', [], { kind: 'return', value: null })],
      entry: 'entry',
      isMacro: true,
    }

    const mainFn = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: null, fn: 'test:mfn', args: [c(5)] },
      ], { kind: 'return', value: null }),
    ])

    const mod = mkMod([mainFn, macroFn])
    const result = interproceduralConstProp(mod)
    expect(result.functions.some(f => f.name.includes('__const_'))).toBe(false)
  })

  test('does not specialize external functions (not in module)', () => {
    const mainFn = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: null, fn: 'external:fn', args: [c(1), c(2)] },
      ], { kind: 'return', value: null }),
    ])

    const mod = mkMod([mainFn])
    const result = interproceduralConstProp(mod)
    expect(result.functions).toHaveLength(1)
  })

  test('mangles negative constant args with n prefix', () => {
    const addFn = mkFn('test:add', ['a'], [
      mkBlock('entry', [
        { kind: 'neg', dst: 'result', src: t('a') },
      ], { kind: 'return', value: t('result') }),
    ])

    const mainFn = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 't0', fn: 'test:add', args: [c(-5)] },
      ], { kind: 'return', value: t('t0') }),
    ])

    const mod = mkMod([mainFn, addFn])
    const result = interproceduralConstProp(mod)

    const specialized = result.functions.find(f => f.name === 'test:add__const_n5')
    expect(specialized).toBeDefined()
  })

  test('does not create duplicate specializations', () => {
    const addFn = mkFn('test:add', ['a', 'b'], [
      mkBlock('entry', [
        { kind: 'add', dst: 'result', a: t('a'), b: t('b') },
      ], { kind: 'return', value: t('result') }),
    ])

    const mainFn = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 't0', fn: 'test:add', args: [c(1), c(2)] },
        { kind: 'call', dst: 't1', fn: 'test:add', args: [c(1), c(2)] },
      ], { kind: 'return', value: null }),
    ])

    const mod = mkMod([mainFn, addFn])
    const result = interproceduralConstProp(mod)

    const specialized = result.functions.filter(f => f.name === 'test:add__const_1_2')
    expect(specialized).toHaveLength(1)
  })
})
