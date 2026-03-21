/**
 * Tests for the @inline function inlining optimizer pass.
 */
import { inlinePass } from '../../optimizer/inline'
import type { MIRFunction, MIRModule, MIRBlock, MIRInstr, Operand } from '../../mir/types'

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function mkMod(functions: MIRFunction[], inlineFunctions?: Set<string>): MIRModule {
  return { functions, namespace: 'test', objective: '__test', inlineFunctions }
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('inlinePass', () => {
  test('no-op when inlineFunctions is empty', () => {
    const fn = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 't0', fn: 'test:add', args: [c(1), c(2)] },
      ], { kind: 'return', value: t('t0') }),
    ])
    const mod = mkMod([fn]) // no inlineFunctions
    const result = inlinePass(mod)
    expect(result).toBe(mod) // exact same reference — nothing changed
  })

  test('inlines a single-block function, replacing call with inlined body', () => {
    // fn add(a, b) { return a + b }  — @inline
    const addFn = mkFn('test:add', ['a', 'b'], [
      mkBlock('entry', [
        { kind: 'add', dst: 'result', a: t('a'), b: t('b') },
      ], { kind: 'return', value: t('result') }),
    ])

    // fn main() { let r = add(3, 4); return r }
    const mainFn = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 't0', fn: 'test:add', args: [c(3), c(4)] },
      ], { kind: 'return', value: t('t0') }),
    ])

    const mod = mkMod([mainFn, addFn], new Set(['test:add']))
    const result = inlinePass(mod)

    const main = result.functions.find(f => f.name === 'test:main')!

    // There must be no `call` instruction in main after inlining
    const allInstrs = main.blocks.flatMap(b => [...b.instrs, b.term])
    const callInstrs = allInstrs.filter(i => i.kind === 'call')
    expect(callInstrs).toHaveLength(0)

    // The add instruction must appear somewhere (substituted: a→3, b→4)
    const addInstrs = allInstrs.filter(i => i.kind === 'add') as Extract<MIRInstr, { kind: 'add' }>[]
    expect(addInstrs).toHaveLength(1)
    expect(addInstrs[0].a).toEqual(c(3))
    expect(addInstrs[0].b).toEqual(c(4))

    // The return value should be the result of the add (via copy into t0)
    const copyInstrs = allInstrs.filter(i => i.kind === 'copy') as Extract<MIRInstr, { kind: 'copy' }>[]
    expect(copyInstrs.some(ci => ci.dst === 't0')).toBe(true)
  })

  test('inlines a multi-block callee (if/else CFG)', () => {
    // fn clamp(val, lo, hi):
    //   entry: branch val<lo → lo_blk else gt_blk
    //   lo_blk: return lo
    //   gt_blk: branch val>hi → hi_blk else mid_blk
    //   hi_blk: return hi
    //   mid_blk: return val
    const clampFn = mkFn('test:clamp', ['val', 'lo', 'hi'], [
      mkBlock('entry', [
        { kind: 'cmp', dst: 'lt', op: 'lt', a: t('val'), b: t('lo') },
      ], { kind: 'branch', cond: t('lt'), then: 'lo_blk', else: 'gt_blk' }),
      mkBlock('lo_blk', [], { kind: 'return', value: t('lo') }),
      mkBlock('gt_blk', [
        { kind: 'cmp', dst: 'gt', op: 'gt', a: t('val'), b: t('hi') },
      ], { kind: 'branch', cond: t('gt'), then: 'hi_blk', else: 'mid_blk' }),
      mkBlock('hi_blk', [], { kind: 'return', value: t('hi') }),
      mkBlock('mid_blk', [], { kind: 'return', value: t('val') }),
    ])

    const mainFn = mkFn('test:main', ['x'], [
      mkBlock('entry', [
        { kind: 'call', dst: 'r', fn: 'test:clamp', args: [t('x'), c(0), c(100)] },
      ], { kind: 'return', value: t('r') }),
    ])

    const mod = mkMod([mainFn, clampFn], new Set(['test:clamp']))
    const result = inlinePass(mod)

    const main = result.functions.find(f => f.name === 'test:main')!

    // No call instructions remain
    const allInstrs = main.blocks.flatMap(b => [...b.instrs, b.term])
    expect(allInstrs.filter(i => i.kind === 'call')).toHaveLength(0)

    // Should have 5 original clamp blocks + the split entry (pre-call) + continuation
    // clamp has 5 blocks; entry splits into pre+jump and continuation
    expect(main.blocks.length).toBeGreaterThanOrEqual(5)

    // cmp instructions should be present (substituted)
    const cmpInstrs = allInstrs.filter(i => i.kind === 'cmp') as Extract<MIRInstr, { kind: 'cmp' }>[]
    expect(cmpInstrs.length).toBeGreaterThanOrEqual(2)
    // lo arg should be substituted: lo → const 0
    const ltCmp = cmpInstrs.find(i => i.op === 'lt')!
    expect(ltCmp.b).toEqual(c(0))
  })

  test('does not inline recursive callee', () => {
    // fn fact(n) { call fact(n-1); return ... }  — self-recursive
    const factFn = mkFn('test:fact', ['n'], [
      mkBlock('entry', [
        { kind: 'sub', dst: 'n1', a: t('n'), b: c(1) },
        { kind: 'call', dst: 'sub', fn: 'test:fact', args: [t('n1')] },
        { kind: 'mul', dst: 'res', a: t('n'), b: t('sub') },
      ], { kind: 'return', value: t('res') }),
    ])

    const mainFn = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 'r', fn: 'test:fact', args: [c(5)] },
      ], { kind: 'return', value: t('r') }),
    ])

    const mod = mkMod([mainFn, factFn], new Set(['test:fact']))
    const result = inlinePass(mod)

    // The call must remain since fact is recursive
    const main = result.functions.find(f => f.name === 'test:main')!
    const allInstrs = main.blocks.flatMap(b => [...b.instrs, b.term])
    expect(allInstrs.filter(i => i.kind === 'call')).toHaveLength(1)
  })

  test('does not inline macro functions', () => {
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

    const mod = mkMod([mainFn, macroFn], new Set(['test:mfn']))
    const result = inlinePass(mod)

    const main = result.functions.find(f => f.name === 'test:main')!
    const allInstrs = main.blocks.flatMap(b => [...b.instrs, b.term])
    expect(allInstrs.filter(i => i.kind === 'call')).toHaveLength(1)
  })

  test('does not inline external functions (not in module)', () => {
    const mainFn = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: null, fn: 'external:fn', args: [c(1)] },
      ], { kind: 'return', value: null }),
    ])

    const mod = mkMod([mainFn], new Set(['external:fn']))
    const result = inlinePass(mod)

    const main = result.functions.find(f => f.name === 'test:main')!
    const allInstrs = main.blocks.flatMap(b => [...b.instrs, b.term])
    expect(allInstrs.filter(i => i.kind === 'call')).toHaveLength(1)
  })

  test('inlines multiple calls to the same function', () => {
    const addFn = mkFn('test:add', ['a', 'b'], [
      mkBlock('entry', [
        { kind: 'add', dst: 'result', a: t('a'), b: t('b') },
      ], { kind: 'return', value: t('result') }),
    ])

    const mainFn = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 't0', fn: 'test:add', args: [c(1), c(2)] },
        { kind: 'call', dst: 't1', fn: 'test:add', args: [c(3), c(4)] },
      ], { kind: 'return', value: null }),
    ])

    const mod = mkMod([mainFn, addFn], new Set(['test:add']))
    const result = inlinePass(mod)

    const main = result.functions.find(f => f.name === 'test:main')!
    const allInstrs = main.blocks.flatMap(b => [...b.instrs, b.term])
    // Both calls should be gone
    expect(allInstrs.filter(i => i.kind === 'call')).toHaveLength(0)
    // Two add instructions (one from each inlined call)
    expect(allInstrs.filter(i => i.kind === 'add')).toHaveLength(2)
  })

  test('does not inline function not in inlineFunctions set', () => {
    const addFn = mkFn('test:add', ['a', 'b'], [
      mkBlock('entry', [
        { kind: 'add', dst: 'result', a: t('a'), b: t('b') },
      ], { kind: 'return', value: t('result') }),
    ])

    const mainFn = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: 't0', fn: 'test:add', args: [c(1), c(2)] },
      ], { kind: 'return', value: t('t0') }),
    ])

    // add is NOT in the inline set
    const mod = mkMod([mainFn, addFn], new Set(['test:other']))
    const result = inlinePass(mod)

    const main = result.functions.find(f => f.name === 'test:main')!
    const allInstrs = main.blocks.flatMap(b => [...b.instrs, b.term])
    expect(allInstrs.filter(i => i.kind === 'call')).toHaveLength(1)
  })

  test('inlines void function (null dst)', () => {
    // fn greet() { say("hi") via nbt_write side-effects; return; }
    const greetFn = mkFn('test:greet', [], [
      mkBlock('entry', [
        { kind: 'nbt_write', ns: 'greet', path: 'msg', type: 'int', scale: 1, src: c(1) },
      ], { kind: 'return', value: null }),
    ])

    const mainFn = mkFn('test:main', [], [
      mkBlock('entry', [
        { kind: 'call', dst: null, fn: 'test:greet', args: [] },
      ], { kind: 'return', value: null }),
    ])

    const mod = mkMod([mainFn, greetFn], new Set(['test:greet']))
    const result = inlinePass(mod)

    const main = result.functions.find(f => f.name === 'test:main')!
    const allInstrs = main.blocks.flatMap(b => [...b.instrs, b.term])
    expect(allInstrs.filter(i => i.kind === 'call')).toHaveLength(0)
    // nbt_write should be present from inlined body
    expect(allInstrs.filter(i => i.kind === 'nbt_write')).toHaveLength(1)
  })
})
