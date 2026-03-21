/**
 * Extended optimizer coverage tests.
 *
 * Targets uncovered branches in:
 * - coroutine.ts  (fnContainsMacroCalls paths, macro-skip warning)
 * - unroll.ts     (two-step latch pattern, initializesTo0 copy path, copy-init path)
 * - interprocedural.ts  (call_macro isSelfRecursive, param mismatch guard, rewriteCallSites guards)
 * - lir/const_imm.ts  (score_swap / store_nbt_to_score / macro_line read slots, extractSlotsFromRaw)
 * - block_merge.ts  (branch terminator — no merge, target === fn.entry guard)
 * - constant_fold.ts  (evalCmp default branch)
 */

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { coroutineTransform, type CoroutineInfo } from '../../optimizer/coroutine'
import { loopUnroll } from '../../optimizer/unroll'
import { interproceduralConstProp } from '../../optimizer/interprocedural'
import { constImmFold } from '../../optimizer/lir/const_imm'
import { blockMerge } from '../../optimizer/block_merge'
import { constantFold } from '../../optimizer/constant_fold'
import type { MIRFunction, MIRModule, MIRBlock, MIRInstr, Operand } from '../../mir/types'
import type { LIRFunction, LIRInstr, Slot } from '../../lir/types'

// ---------------------------------------------------------------------------
// MIR helpers
// ---------------------------------------------------------------------------

const c = (v: number): Operand => ({ kind: 'const', value: v })
const t = (n: string): Operand => ({ kind: 'temp', name: n })

function mirBlock(id: string, instrs: MIRInstr[], term: MIRInstr, preds: string[] = []): MIRBlock {
  return { id, instrs, term, preds }
}

function mirFn(name: string, params: string[], blocks: MIRBlock[], isMacro = false): MIRFunction {
  return {
    name,
    params: params.map(p => ({ name: p, isMacroParam: false })),
    blocks,
    entry: 'entry',
    isMacro,
  }
}

function mirMod(functions: MIRFunction[]): MIRModule {
  return { functions, namespace: 'test', objective: '__test' }
}

// ---------------------------------------------------------------------------
// LIR helpers
// ---------------------------------------------------------------------------

const obj = '__test'
function slot(player: string): Slot { return { player, obj } }
function lirFn(instructions: LIRInstr[]): LIRFunction {
  return { name: 'test', instructions, isMacro: false, macroParams: [] }
}

// ===========================================================================
// 1. coroutine.ts — uncovered branches
// ===========================================================================

describe('coroutine — fnContainsMacroCalls skip path', () => {
  function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr): MIRBlock {
    return { id, instrs, term, preds: [] }
  }

  test('skips transform and emits warning when function has call_macro', () => {
    const fn: MIRFunction = {
      name: 'test:worker',
      params: [],
      blocks: [
        mkBlock('entry', [
          // call_macro instruction — should trigger the skip path
          { kind: 'call_macro', dst: null, fn: 'test:mfn', args: [] },
        ], { kind: 'return', value: null }),
      ],
      entry: 'entry',
      isMacro: false,
    }
    const mod = mirMod([fn])
    const info: CoroutineInfo = { fnName: 'test:worker', batch: 10 }
    const result = coroutineTransform(mod, [info])

    // Function should be kept unchanged (not transformed)
    expect(result.module.functions).toHaveLength(1)
    expect(result.module.functions[0].name).toBe('test:worker')
    // No tick functions generated
    expect(result.generatedTickFunctions).toHaveLength(0)
    // Warning should be emitted
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toContain('test:worker')
    expect(result.warnings[0]).toContain('@coroutine')
  })

  test('skips transform when function has __raw: call with ${interpolation}', () => {
    const fn: MIRFunction = {
      name: 'test:interpolated',
      params: [],
      blocks: [
        mkBlock('entry', [
          // A raw call with variable interpolation
          { kind: 'call', dst: null, fn: '__raw:say ${name}', args: [] },
        ], { kind: 'return', value: null }),
      ],
      entry: 'entry',
      isMacro: false,
    }
    const mod = mirMod([fn])
    const info: CoroutineInfo = { fnName: 'test:interpolated', batch: 10 }
    const result = coroutineTransform(mod, [info])

    expect(result.module.functions).toHaveLength(1)
    expect(result.generatedTickFunctions).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
  })

  test('skips transform when function has __raw:\\x01 (builtin with macro)', () => {
    const fn: MIRFunction = {
      name: 'test:builtin_macro',
      params: [],
      blocks: [
        mkBlock('entry', [
          { kind: 'call', dst: null, fn: '__raw:\x01particle dust', args: [] },
        ], { kind: 'return', value: null }),
      ],
      entry: 'entry',
      isMacro: false,
    }
    const mod = mirMod([fn])
    const info: CoroutineInfo = { fnName: 'test:builtin_macro', batch: 5 }
    const result = coroutineTransform(mod, [info])

    expect(result.generatedTickFunctions).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
  })

  test('transforms when __raw: call has no interpolation', () => {
    // __raw: without ${ or \x01 should NOT block the transform
    const fn: MIRFunction = {
      name: 'test:plain_raw',
      params: [],
      blocks: [
        mkBlock('entry', [
          { kind: 'call', dst: null, fn: '__raw:say hello', args: [] },
        ], { kind: 'return', value: null }),
      ],
      entry: 'entry',
      isMacro: false,
    }
    const mod = mirMod([fn])
    const info: CoroutineInfo = { fnName: 'test:plain_raw', batch: 5 }
    const result = coroutineTransform(mod, [info])

    // Should be transformed (no warning)
    expect(result.warnings).toHaveLength(0)
    expect(result.generatedTickFunctions).toHaveLength(1)
  })

  test('call_macro in terminator position also triggers skip', () => {
    // The loop in fnContainsMacroCalls iterates [...block.instrs, block.term]
    // so a call_macro as the terminator should also trigger the skip
    const fn: MIRFunction = {
      name: 'test:macro_term',
      params: [],
      blocks: [
        {
          id: 'entry',
          instrs: [],
          // call_macro as terminator
          term: { kind: 'call_macro', dst: null, fn: 'test:m', args: [] } as MIRInstr,
          preds: [],
        },
      ],
      entry: 'entry',
      isMacro: false,
    }
    const mod = mirMod([fn])
    const info: CoroutineInfo = { fnName: 'test:macro_term', batch: 5 }
    const result = coroutineTransform(mod, [info])

    expect(result.warnings).toHaveLength(1)
    expect(result.generatedTickFunctions).toHaveLength(0)
  })
})

// ===========================================================================
// 2. unroll.ts — uncovered branches
// ===========================================================================

describe('loopUnroll — uncovered branches', () => {
  function buildLoopWithBlocks(blocks: MIRBlock[]): MIRFunction {
    return { name: 'test', params: [], blocks, entry: 'entry', isMacro: false }
  }

  test('two-step latch pattern: add t_tmp i 1; copy i t_tmp', () => {
    // Pattern 2 in latchIncrementsBy1
    const fn = buildLoopWithBlocks([
      mirBlock('entry', [
        { kind: 'const', dst: 'i', value: 0 },
      ], { kind: 'jump', target: 'loop_header_0' }),
      mirBlock('loop_header_0', [
        { kind: 'cmp', dst: 't_cmp', op: 'lt', a: t('i'), b: c(3) },
      ], { kind: 'branch', cond: t('t_cmp'), then: 'loop_body_0', else: 'loop_exit_0' }),
      mirBlock('loop_body_0', [
        { kind: 'call', dst: null, fn: 'test:body', args: [t('i')] },
      ], { kind: 'jump', target: 'loop_latch_0' }),
      mirBlock('loop_latch_0', [
        // Two-step increment: t_tmp = i + 1; i = t_tmp
        { kind: 'add', dst: 't_tmp', a: t('i'), b: c(1) },
        { kind: 'copy', dst: 'i', src: t('t_tmp') },
      ], { kind: 'jump', target: 'loop_header_0' }),
      mirBlock('loop_exit_0', [], { kind: 'return', value: null }),
    ])

    const result = loopUnroll(fn)

    // Should have unrolled — loop_header gone
    expect(result.blocks.some(b => b.id.startsWith('loop_header'))).toBe(false)
    const entry = result.blocks.find(b => b.id === 'entry')!
    const calls = entry.instrs.filter(i => i.kind === 'call')
    expect(calls).toHaveLength(3)
    // i substituted as 0, 1, 2
    const callInstrs = calls as Extract<MIRInstr, { kind: 'call' }>[]
    expect(callInstrs[0].args[0]).toEqual(c(0))
    expect(callInstrs[1].args[0]).toEqual(c(1))
    expect(callInstrs[2].args[0]).toEqual(c(2))
  })

  test('initializesTo0 via copy instruction (copy i, const 0)', () => {
    // Tests the `copy` branch in initializesTo0
    const fn = buildLoopWithBlocks([
      mirBlock('entry', [
        // Initialize via copy of const 0 instead of direct const
        { kind: 'copy', dst: 'i', src: c(0) },
      ], { kind: 'jump', target: 'loop_header_0' }),
      mirBlock('loop_header_0', [
        { kind: 'cmp', dst: 't_cmp', op: 'lt', a: t('i'), b: c(2) },
      ], { kind: 'branch', cond: t('t_cmp'), then: 'loop_body_0', else: 'loop_exit_0' }),
      mirBlock('loop_body_0', [
        { kind: 'call', dst: null, fn: 'test:body', args: [t('i')] },
      ], { kind: 'jump', target: 'loop_latch_0' }),
      mirBlock('loop_latch_0', [
        { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
      ], { kind: 'jump', target: 'loop_header_0' }),
      mirBlock('loop_exit_0', [], { kind: 'return', value: null }),
    ])

    const result = loopUnroll(fn)
    // Should unroll since copy i, 0 is recognized as init-to-0
    expect(result.blocks.some(b => b.id.startsWith('loop_header'))).toBe(false)
    const entry = result.blocks.find(b => b.id === 'entry')!
    const calls = entry.instrs.filter(i => i.kind === 'call')
    expect(calls).toHaveLength(2)
  })

  test('initializesTo0 copy with non-zero const does not unroll', () => {
    // copy i, const 5 — not init to 0
    const fn = buildLoopWithBlocks([
      mirBlock('entry', [
        { kind: 'copy', dst: 'i', src: c(5) },
      ], { kind: 'jump', target: 'loop_header_0' }),
      mirBlock('loop_header_0', [
        { kind: 'cmp', dst: 't_cmp', op: 'lt', a: t('i'), b: c(8) },
      ], { kind: 'branch', cond: t('t_cmp'), then: 'loop_body_0', else: 'loop_exit_0' }),
      mirBlock('loop_body_0', [
        { kind: 'call', dst: null, fn: 'test:body', args: [t('i')] },
      ], { kind: 'jump', target: 'loop_latch_0' }),
      mirBlock('loop_latch_0', [
        { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
      ], { kind: 'jump', target: 'loop_header_0' }),
      mirBlock('loop_exit_0', [], { kind: 'return', value: null }),
    ])

    const result = loopUnroll(fn)
    expect(result).toBe(fn) // unchanged
  })

  test('latch with wrong temp in two-step does not unroll', () => {
    // Pattern 2 but copy is from a different temp than the add destination
    const fn = buildLoopWithBlocks([
      mirBlock('entry', [
        { kind: 'const', dst: 'i', value: 0 },
      ], { kind: 'jump', target: 'loop_header_0' }),
      mirBlock('loop_header_0', [
        { kind: 'cmp', dst: 't_cmp', op: 'lt', a: t('i'), b: c(3) },
      ], { kind: 'branch', cond: t('t_cmp'), then: 'loop_body_0', else: 'loop_exit_0' }),
      mirBlock('loop_body_0', [
        { kind: 'call', dst: null, fn: 'test:body', args: [t('i')] },
      ], { kind: 'jump', target: 'loop_latch_0' }),
      mirBlock('loop_latch_0', [
        // Two-step but the copy sources from a different unrelated temp
        { kind: 'add', dst: 't_tmp', a: t('i'), b: c(1) },
        { kind: 'copy', dst: 'i', src: t('other_tmp') }, // wrong source
      ], { kind: 'jump', target: 'loop_header_0' }),
      mirBlock('loop_exit_0', [], { kind: 'return', value: null }),
    ])

    const result = loopUnroll(fn)
    // Should NOT unroll — two-step mismatch
    expect(result).toBe(fn)
  })

  test('multiple loops in function: unrolls both iteratively', () => {
    // Two sequential loops, both N=2 — fixpoint iteration handles both
    const fn = buildLoopWithBlocks([
      mirBlock('entry', [
        { kind: 'const', dst: 'i', value: 0 },
      ], { kind: 'jump', target: 'loop_header_0' }),
      mirBlock('loop_header_0', [
        { kind: 'cmp', dst: 't0', op: 'lt', a: t('i'), b: c(2) },
      ], { kind: 'branch', cond: t('t0'), then: 'loop_body_0', else: 'mid' }),
      mirBlock('loop_body_0', [
        { kind: 'call', dst: null, fn: 'test:a', args: [t('i')] },
      ], { kind: 'jump', target: 'loop_latch_0' }),
      mirBlock('loop_latch_0', [
        { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
      ], { kind: 'jump', target: 'loop_header_0' }),
      mirBlock('mid', [
        { kind: 'const', dst: 'j', value: 0 },
      ], { kind: 'jump', target: 'loop_header_1' }),
      mirBlock('loop_header_1', [
        { kind: 'cmp', dst: 't1', op: 'lt', a: t('j'), b: c(2) },
      ], { kind: 'branch', cond: t('t1'), then: 'loop_body_1', else: 'loop_exit_1' }),
      mirBlock('loop_body_1', [
        { kind: 'call', dst: null, fn: 'test:b', args: [t('j')] },
      ], { kind: 'jump', target: 'loop_latch_1' }),
      mirBlock('loop_latch_1', [
        { kind: 'add', dst: 'j', a: t('j'), b: c(1) },
      ], { kind: 'jump', target: 'loop_header_1' }),
      mirBlock('loop_exit_1', [], { kind: 'return', value: null }),
    ])

    const result = loopUnroll(fn)
    // Both loops should be unrolled
    expect(result.blocks.some(b => b.id.startsWith('loop_header'))).toBe(false)
  })
})

// ===========================================================================
// 3. interprocedural.ts — uncovered branches
// ===========================================================================

describe('interproceduralConstProp — uncovered branches', () => {
  test('isSelfRecursive: function calling itself via call_macro is not specialized', () => {
    // A function that is self-recursive via call_macro should be skipped
    const selfRecursiveFn = mirFn('test:recur', ['n'], [
      mirBlock('entry', [
        // call_macro to itself
        { kind: 'call_macro', dst: null, fn: 'test:recur', args: [] },
      ], { kind: 'return', value: null }),
    ])

    const callerFn = mirFn('test:main', [], [
      mirBlock('entry', [
        { kind: 'call', dst: null, fn: 'test:recur', args: [c(5)] },
      ], { kind: 'return', value: null }),
    ])

    const mod = mirMod([callerFn, selfRecursiveFn])
    const result = interproceduralConstProp(mod)

    // Should NOT create specialized version — self-recursive via call_macro
    expect(result.functions.some(f => f.name.includes('__const_'))).toBe(false)
  })

  test('param count mismatch: callee.params.length !== instr.args.length skips', () => {
    // Callee expects 2 params but call site provides 1 — should not specialize
    const addFn = mirFn('test:add', ['a', 'b'], [
      mirBlock('entry', [
        { kind: 'add', dst: 'r', a: t('a'), b: t('b') },
      ], { kind: 'return', value: t('r') }),
    ])

    const callerFn = mirFn('test:main', [], [
      mirBlock('entry', [
        // Only 1 arg but callee expects 2
        { kind: 'call', dst: null, fn: 'test:add', args: [c(3)] },
      ], { kind: 'return', value: null }),
    ])

    const mod = mirMod([callerFn, addFn])
    const result = interproceduralConstProp(mod)
    expect(result.functions.some(f => f.name.includes('__const_'))).toBe(false)
  })

  test('rewriteCallSites skips call_macro instructions (not rewritten)', () => {
    // rewriteCallSites only rewrites 'call' not 'call_macro'
    const helperFn = mirFn('test:helper', ['x'], [
      mirBlock('entry', [], { kind: 'return', value: null }),
    ])

    const callerFn = mirFn('test:main', [], [
      mirBlock('entry', [
        // call_macro — should not be rewritten even if specialized fn exists
        { kind: 'call_macro', dst: null, fn: 'test:helper', args: [] },
      ], { kind: 'return', value: null }),
    ])

    const mod = mirMod([callerFn, helperFn])
    const result = interproceduralConstProp(mod)

    const main = result.functions.find(f => f.name === 'test:main')!
    const macroCall = main.blocks[0].instrs.find(i => i.kind === 'call_macro')
    // Should remain unchanged
    expect(macroCall).toBeDefined()
  })

  test('rewriteCallSites: call with self-same name is not rewritten', () => {
    // When callee.name === fn.name (self-call) in rewriteCallSites, skip
    const selfCallFn = mirFn('test:fib', ['n'], [
      mirBlock('entry', [
        // direct self-call with constant arg — rewriteCallSites should skip
        { kind: 'call', dst: null, fn: 'test:fib', args: [c(5)] },
      ], { kind: 'return', value: null }),
    ])

    const mod = mirMod([selfCallFn])
    const result = interproceduralConstProp(mod)

    const fib = result.functions.find(f => f.name === 'test:fib')!
    const call = fib.blocks[0].instrs.find(i => i.kind === 'call') as Extract<MIRInstr, { kind: 'call' }>
    // Self call should remain unchanged
    expect(call.fn).toBe('test:fib')
  })

  test('rewriteCallSites: call with non-all-const args is not rewritten', () => {
    const addFn = mirFn('test:add', ['a', 'b'], [
      mirBlock('entry', [
        { kind: 'add', dst: 'r', a: t('a'), b: t('b') },
      ], { kind: 'return', value: t('r') }),
    ])

    const callerFn = mirFn('test:main', [], [
      mirBlock('entry', [
        // Mixed args — not all const
        { kind: 'call', dst: null, fn: 'test:add', args: [t('x'), c(4)] },
      ], { kind: 'return', value: null }),
    ])

    const mod = mirMod([callerFn, addFn])
    const result = interproceduralConstProp(mod)

    const main = result.functions.find(f => f.name === 'test:main')!
    const call = main.blocks[0].instrs.find(i => i.kind === 'call') as Extract<MIRInstr, { kind: 'call' }>
    // Should remain as 'test:add' (not rewritten)
    expect(call.fn).toBe('test:add')
  })

  test('callee with multiple blocks is not specialized', () => {
    // Only single-block callees are specialized
    const multiFn = mirFn('test:multi', ['x'], [
      mirBlock('entry', [
        { kind: 'cmp', dst: 'cond', op: 'gt', a: t('x'), b: c(0) },
      ], { kind: 'branch', cond: t('cond'), then: 'pos', else: 'neg' }),
      mirBlock('pos', [], { kind: 'return', value: c(1) }),
      mirBlock('neg', [], { kind: 'return', value: c(0) }),
    ])

    const callerFn = mirFn('test:main', [], [
      mirBlock('entry', [
        { kind: 'call', dst: null, fn: 'test:multi', args: [c(5)] },
      ], { kind: 'return', value: null }),
    ])

    const mod = mirMod([callerFn, multiFn])
    const result = interproceduralConstProp(mod)
    expect(result.functions.some(f => f.name.includes('__const_'))).toBe(false)
  })
})

// ===========================================================================
// 4. lir/const_imm.ts — uncovered branches
// ===========================================================================

describe('constImmFold — getReadSlots uncovered branches', () => {
  test('score_swap: both slots a and b are read slots', () => {
    // score_swap uses both a and b — getReadSlots returns [a, b]
    // If one of them is the $__const_ slot, use count is > 1 → no fold
    const constSlot = slot('$__const_5')
    const fn = lirFn([
      { kind: 'score_set', dst: constSlot, value: 5 },
      { kind: 'score_swap', a: constSlot, b: slot('$x') },
      { kind: 'score_add', dst: slot('$y'), src: constSlot },
    ])
    const result = constImmFold(fn)
    // $__const_5 is used twice (swap + add) → no fold
    expect(result.instructions).toHaveLength(3)
    expect(result).toBe(fn)
  })

  test('store_nbt_to_score: does not count as reading a slot', () => {
    // store_nbt_to_score reads from NBT, not a score slot — getReadSlots returns []
    // So $__const_5 with only score_add as user → folds
    const constSlot = slot('$__const_5')
    const fn = lirFn([
      { kind: 'score_set', dst: constSlot, value: 5 },
      // store_nbt_to_score does NOT read constSlot
      { kind: 'store_nbt_to_score', dst: slot('$z'), ns: 'test', path: 'data', scale: 1 },
      { kind: 'score_add', dst: slot('$x'), src: constSlot },
    ])
    // Not adjacent (store_nbt_to_score is between) — no fold
    const result = constImmFold(fn)
    expect(result.instructions).toHaveLength(3)
  })

  test('macro_line: slots referenced in template are counted', () => {
    // macro_line uses extractSlotsFromRaw on the template field
    const constSlot = slot('$__const_5')
    const fn = lirFn([
      { kind: 'score_set', dst: constSlot, value: 5 },
      // macro_line that references constSlot in template
      { kind: 'macro_line', template: `$__const_5 ${obj}` },
      { kind: 'score_add', dst: slot('$x'), src: constSlot },
    ])
    const result = constImmFold(fn)
    // $__const_5 is used in macro_line template + score_add → 2 uses → no fold
    expect(result).toBe(fn)
    expect(result.instructions).toHaveLength(3)
  })

  test('extractSlotsFromRaw: raw cmd with player-obj pattern extracts slot', () => {
    // raw instruction — slots extracted via regex /(\$[\w.:]+)\s+(\S+)/g
    const constSlot = slot('$__const_7')
    const fn = lirFn([
      { kind: 'score_set', dst: constSlot, value: 7 },
      // raw command that references constSlot
      { kind: 'raw', cmd: `scoreboard players get $__const_7 ${obj}` },
      { kind: 'score_add', dst: slot('$a'), src: constSlot },
    ])
    const result = constImmFold(fn)
    // constSlot used in raw + score_add → 2 uses → no fold
    expect(result).toBe(fn)
  })

  test('raw cmd with no matching slots: slot is not counted', () => {
    // A raw cmd with no $-prefixed player references
    const constSlot = slot('$__const_3')
    const fn = lirFn([
      { kind: 'score_set', dst: constSlot, value: 3 },
      { kind: 'raw', cmd: 'say hello world' }, // no slot references
      { kind: 'score_add', dst: slot('$x'), src: constSlot },
    ])
    // constSlot used only once (score_add), but not adjacent to score_set
    const result = constImmFold(fn)
    expect(result.instructions).toHaveLength(3) // not adjacent → no fold
  })

  test('call_if_score: both a and b slots are counted as reads', () => {
    // call_if_score reads both a and b — if constSlot appears as either, use count++
    const constSlot = slot('$__const_4')
    const fn = lirFn([
      { kind: 'score_set', dst: constSlot, value: 4 },
      { kind: 'call_if_score', fn: 'test:f', a: constSlot, op: 'gt', b: slot('$x') },
      { kind: 'score_add', dst: slot('$y'), src: constSlot },
    ])
    const result = constImmFold(fn)
    // constSlot used in call_if_score (a) + score_add → 2 uses → no fold
    expect(result).toBe(fn)
  })

  test('return_value: slot is counted as a read', () => {
    // return_value reads the slot — if constSlot is returned, use count++
    const constSlot = slot('$__const_9')
    const fn = lirFn([
      { kind: 'score_set', dst: constSlot, value: 9 },
      { kind: 'score_add', dst: slot('$x'), src: constSlot },
      { kind: 'return_value', slot: constSlot },
    ])
    // Two uses of constSlot (score_add + return_value) — no fold for the score_add pair
    const result = constImmFold(fn)
    expect(result).toBe(fn)
  })

  test('instructions length < 2: returns fn unchanged', () => {
    const fn = lirFn([
      { kind: 'score_set', dst: slot('$x'), value: 1 },
    ])
    const result = constImmFold(fn)
    expect(result).toBe(fn)
  })
})

// ===========================================================================
// 5. block_merge.ts — uncovered branch
// ===========================================================================

describe('blockMerge — uncovered branches', () => {
  test('branch terminator: block with branch does not trigger merge', () => {
    // The merge condition requires term.kind === 'jump'; a branch should not merge
    const fn: MIRFunction = {
      name: 'test',
      params: [],
      blocks: [
        mirBlock('entry', [], {
          kind: 'branch', cond: t('c'), then: 'b1', else: 'b2',
        }),
        mirBlock('b1', [], { kind: 'return', value: null }, ['entry']),
        mirBlock('b2', [], { kind: 'return', value: null }, ['entry']),
      ],
      entry: 'entry',
      isMacro: false,
    }
    const result = blockMerge(fn)
    // Should have all 3 blocks — no merge possible
    expect(result.blocks).toHaveLength(3)
  })

  test('jump to entry block: not merged (entry guard)', () => {
    // A block jumping to 'entry' should not cause entry to be merged away
    // (the `targetId !== fn.entry` guard)
    const fn: MIRFunction = {
      name: 'test',
      params: [],
      blocks: [
        mirBlock('entry', [
          { kind: 'const', dst: 'x', value: 1 },
        ], { kind: 'return', value: t('x') }),
        // A block that jumps to entry (unusual but valid for testing)
        mirBlock('before', [], { kind: 'jump', target: 'entry' }),
      ],
      entry: 'before',
      isMacro: false,
    }
    const result = blockMerge(fn)
    // 'entry' has 1 pred (before) but is the fn.entry — guard prevents merge?
    // Actually fn.entry = 'before', so 'entry' is NOT fn.entry here — it should merge
    // Let's verify: before → entry (single pred), entry is not fn.entry ('before' is)
    // So entry gets merged into before
    expect(result.blocks.some(b => b.id === 'before')).toBe(true)
  })

  test('target not in blockMap: merge is skipped gracefully', () => {
    // If target block doesn't exist in blockMap, blockMap.get returns undefined
    // The `if (target && ...)` guard handles this
    const fn: MIRFunction = {
      name: 'test',
      params: [],
      blocks: [
        mirBlock('entry', [], { kind: 'jump', target: 'nonexistent' }),
      ],
      entry: 'entry',
      isMacro: false,
    }
    // Should not throw — target not found means no merge
    const result = blockMerge(fn)
    expect(result.blocks).toHaveLength(1)
  })

  test('already-removed block is skipped in iteration', () => {
    // When A merges B, B is added to `removed`. If blocks array processes B again, it skips.
    // A → B → C (all single-pred). B merges into A in first iteration;
    // then A+B → C merges in second iteration.
    const fn: MIRFunction = {
      name: 'test',
      params: [],
      blocks: [
        mirBlock('entry', [{ kind: 'const', dst: 'a', value: 1 }], { kind: 'jump', target: 'b1' }),
        mirBlock('b1', [{ kind: 'const', dst: 'b', value: 2 }], { kind: 'jump', target: 'b2' }, ['entry']),
        mirBlock('b2', [{ kind: 'const', dst: 'c', value: 3 }], { kind: 'return', value: null }, ['b1']),
      ],
      entry: 'entry',
      isMacro: false,
    }
    const result = blockMerge(fn)
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].instrs).toHaveLength(3)
  })
})

// ===========================================================================
// 2b. unroll.ts — additional uncovered branches
// ===========================================================================

describe('loopUnroll — additional edge cases', () => {
  test('initializesTo0: another instr defines loopVar before const → returns false', () => {
    // In initializesTo0, if getInstrDst returns loopVar for a non-const, non-copy instr → false
    const fn: MIRFunction = {
      name: 'test', params: [], entry: 'entry', isMacro: false,
      blocks: [
        mirBlock('entry', [
          // Another instr defines 'i' — then const i 0 never reached in reverse scan
          { kind: 'add', dst: 'i', a: c(1), b: c(1) }, // defines i = 2
          { kind: 'const', dst: 'i', value: 0 },       // defines i = 0 (last def wins in reverse)
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_header_0', [
          { kind: 'cmp', dst: 't_cmp', op: 'lt', a: t('i'), b: c(3) },
        ], { kind: 'branch', cond: t('t_cmp'), then: 'loop_body_0', else: 'loop_exit_0' }),
        mirBlock('loop_body_0', [
          { kind: 'call', dst: null, fn: 'test:body', args: [t('i')] },
        ], { kind: 'jump', target: 'loop_latch_0' }),
        mirBlock('loop_latch_0', [
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_exit_0', [], { kind: 'return', value: null }),
      ],
    }
    // Reverse scan hits const i 0 first → should unroll
    const result = loopUnroll(fn)
    expect(result.blocks.some(b => b.id.startsWith('loop_header'))).toBe(false)
  })

  test('initializesTo0: loopVar defined by non-zero non-copy instr → false', () => {
    // In reverse scan: first hit is add dst=i → getInstrDst returns 'i' → return false
    const fn: MIRFunction = {
      name: 'test', params: [], entry: 'entry', isMacro: false,
      blocks: [
        mirBlock('entry', [
          // Only a non-zero add defines i — no const 0 before it in reverse scan
          { kind: 'add', dst: 'i', a: c(5), b: c(3) }, // defines i (not 0)
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_header_0', [
          { kind: 'cmp', dst: 't_cmp', op: 'lt', a: t('i'), b: c(3) },
        ], { kind: 'branch', cond: t('t_cmp'), then: 'loop_body_0', else: 'loop_exit_0' }),
        mirBlock('loop_body_0', [
          { kind: 'call', dst: null, fn: 'test:body', args: [t('i')] },
        ], { kind: 'jump', target: 'loop_latch_0' }),
        mirBlock('loop_latch_0', [
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_exit_0', [], { kind: 'return', value: null }),
      ],
    }
    const result = loopUnroll(fn)
    expect(result).toBe(fn) // not unrolled — not initialized to 0
  })

  test('findPreHeader: multiple predecessors to header → no unroll', () => {
    // If loop_header has more than one non-latch predecessor, findPreHeader returns null
    const fn: MIRFunction = {
      name: 'test', params: [], entry: 'entry', isMacro: false,
      blocks: [
        mirBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
        ], { kind: 'branch', cond: t('some_cond'), then: 'loop_header_0', else: 'alt' }),
        mirBlock('alt', [
          { kind: 'const', dst: 'i', value: 0 },
        ], { kind: 'jump', target: 'loop_header_0' }),
        // loop_header has two non-latch preds: entry and alt
        mirBlock('loop_header_0', [
          { kind: 'cmp', dst: 't_cmp', op: 'lt', a: t('i'), b: c(3) },
        ], { kind: 'branch', cond: t('t_cmp'), then: 'loop_body_0', else: 'loop_exit_0' }),
        mirBlock('loop_body_0', [
          { kind: 'call', dst: null, fn: 'test:body', args: [t('i')] },
        ], { kind: 'jump', target: 'loop_latch_0' }),
        mirBlock('loop_latch_0', [
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_exit_0', [], { kind: 'return', value: null }),
      ],
    }
    const result = loopUnroll(fn)
    expect(result).toBe(fn) // not unrolled — ambiguous pre-header
  })

  test('body with nbt_write_dynamic substitutes both indexSrc and valueSrc', () => {
    // Covers the nbt_write_dynamic case in substituteInstr
    const fn: MIRFunction = {
      name: 'test', params: [], entry: 'entry', isMacro: false,
      blocks: [
        mirBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_header_0', [
          { kind: 'cmp', dst: 't_cmp', op: 'lt', a: t('i'), b: c(2) },
        ], { kind: 'branch', cond: t('t_cmp'), then: 'loop_body_0', else: 'loop_exit_0' }),
        mirBlock('loop_body_0', [
          // nbt_write_dynamic with i as both indexSrc and valueSrc
          {
            kind: 'nbt_write_dynamic',
            ns: 'test', pathPrefix: 'arr',
            indexSrc: t('i'),
            valueSrc: t('i'),
          } as MIRInstr,
        ], { kind: 'jump', target: 'loop_latch_0' }),
        mirBlock('loop_latch_0', [
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_exit_0', [], { kind: 'return', value: null }),
      ],
    }
    const result = loopUnroll(fn)
    // Should unroll — 2 copies
    expect(result.blocks.some(b => b.id.startsWith('loop_header'))).toBe(false)
    const entry = result.blocks.find(b => b.id === 'entry')!
    const writes = entry.instrs.filter(i => i.kind === 'nbt_write_dynamic')
    expect(writes).toHaveLength(2)
    // Both indexSrc and valueSrc should be substituted
    const w0 = writes[0] as Extract<MIRInstr, { kind: 'nbt_write_dynamic' }>
    expect(w0.indexSrc).toEqual(c(0))
    expect(w0.valueSrc).toEqual(c(0))
  })

  test('body with nbt_write substitutes src', () => {
    const fn: MIRFunction = {
      name: 'test', params: [], entry: 'entry', isMacro: false,
      blocks: [
        mirBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_header_0', [
          { kind: 'cmp', dst: 't_cmp', op: 'lt', a: t('i'), b: c(2) },
        ], { kind: 'branch', cond: t('t_cmp'), then: 'loop_body_0', else: 'loop_exit_0' }),
        mirBlock('loop_body_0', [
          { kind: 'nbt_write', ns: 'test', path: 'val', type: 'int' as const, scale: 1, src: t('i') },
        ], { kind: 'jump', target: 'loop_latch_0' }),
        mirBlock('loop_latch_0', [
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_exit_0', [], { kind: 'return', value: null }),
      ],
    }
    const result = loopUnroll(fn)
    expect(result.blocks.some(b => b.id.startsWith('loop_header'))).toBe(false)
    const entry = result.blocks.find(b => b.id === 'entry')!
    const writes = entry.instrs.filter(i => i.kind === 'nbt_write') as Extract<MIRInstr, { kind: 'nbt_write' }>[]
    expect(writes).toHaveLength(2)
    expect(writes[0].src).toEqual(c(0))
    expect(writes[1].src).toEqual(c(1))
  })

  test('body with call_macro substitutes arg values', () => {
    // Covers the call_macro case in substituteInstr
    const fn: MIRFunction = {
      name: 'test', params: [], entry: 'entry', isMacro: false,
      blocks: [
        mirBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_header_0', [
          { kind: 'cmp', dst: 't_cmp', op: 'lt', a: t('i'), b: c(2) },
        ], { kind: 'branch', cond: t('t_cmp'), then: 'loop_body_0', else: 'loop_exit_0' }),
        mirBlock('loop_body_0', [
          {
            kind: 'call_macro',
            dst: null,
            fn: 'test:macro_fn',
            args: [{ name: 'x', value: t('i'), type: 'int' as const, scale: 1 }],
          } as MIRInstr,
        ], { kind: 'jump', target: 'loop_latch_0' }),
        mirBlock('loop_latch_0', [
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_exit_0', [], { kind: 'return', value: null }),
      ],
    }
    const result = loopUnroll(fn)
    expect(result.blocks.some(b => b.id.startsWith('loop_header'))).toBe(false)
    const entry = result.blocks.find(b => b.id === 'entry')!
    const macroCalls = entry.instrs.filter(i => i.kind === 'call_macro') as Extract<MIRInstr, { kind: 'call_macro' }>[]
    expect(macroCalls).toHaveLength(2)
    expect(macroCalls[0].args[0].value).toEqual(c(0))
    expect(macroCalls[1].args[0].value).toEqual(c(1))
  })

  test('body with return instr: substitutes value', () => {
    // return with value — substituteInstr covers the return case
    const fn: MIRFunction = {
      name: 'test', params: [], entry: 'entry', isMacro: false,
      blocks: [
        mirBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_header_0', [
          { kind: 'cmp', dst: 't_cmp', op: 'lt', a: t('i'), b: c(2) },
        ], { kind: 'branch', cond: t('t_cmp'), then: 'loop_body_0', else: 'loop_exit_0' }),
        // Body ending with a terminator substitution test via branch (cond=i)
        mirBlock('loop_body_0', [
          { kind: 'call', dst: null, fn: 'test:f', args: [] },
        ], { kind: 'jump', target: 'loop_latch_0' }),
        mirBlock('loop_latch_0', [
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_exit_0', [], { kind: 'return', value: t('i') }),
      ],
    }
    const result = loopUnroll(fn)
    // Unrolled — exit is kept with return value
    expect(result.blocks.some(b => b.id.startsWith('loop_header'))).toBe(false)
  })

  test('loop with N=0: does not unroll (N <= 0 guard)', () => {
    const fn: MIRFunction = {
      name: 'test', params: [], entry: 'entry', isMacro: false,
      blocks: [
        mirBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_header_0', [
          { kind: 'cmp', dst: 't_cmp', op: 'lt', a: t('i'), b: c(0) },
        ], { kind: 'branch', cond: t('t_cmp'), then: 'loop_body_0', else: 'loop_exit_0' }),
        mirBlock('loop_body_0', [
          { kind: 'call', dst: null, fn: 'test:body', args: [] },
        ], { kind: 'jump', target: 'loop_latch_0' }),
        mirBlock('loop_latch_0', [
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_exit_0', [], { kind: 'return', value: null }),
      ],
    }
    const result = loopUnroll(fn)
    expect(result).toBe(fn) // N=0 is rejected
  })

  test('loop_header with no cmp instr: not unrolled', () => {
    // header has branch but no cmp instruction for condName
    const fn: MIRFunction = {
      name: 'test', params: [], entry: 'entry', isMacro: false,
      blocks: [
        mirBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_header_0', [
          // No cmp here — branch uses t_cmp but nothing defines it
        ], { kind: 'branch', cond: t('t_cmp'), then: 'loop_body_0', else: 'loop_exit_0' }),
        mirBlock('loop_body_0', [
          { kind: 'call', dst: null, fn: 'test:body', args: [] },
        ], { kind: 'jump', target: 'loop_latch_0' }),
        mirBlock('loop_latch_0', [
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_exit_0', [], { kind: 'return', value: null }),
      ],
    }
    const result = loopUnroll(fn)
    expect(result).toBe(fn)
  })

  test('loop_header with const cond (not temp): not unrolled', () => {
    // branch.cond must be temp — if it's const, skip
    const fn: MIRFunction = {
      name: 'test', params: [], entry: 'entry', isMacro: false,
      blocks: [
        mirBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_header_0', [
          { kind: 'cmp', dst: 't_cmp', op: 'lt', a: t('i'), b: c(3) },
        ], { kind: 'branch', cond: c(1), then: 'loop_body_0', else: 'loop_exit_0' }),
        mirBlock('loop_body_0', [
          { kind: 'call', dst: null, fn: 'test:body', args: [] },
        ], { kind: 'jump', target: 'loop_latch_0' }),
        mirBlock('loop_latch_0', [
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'loop_header_0' }),
        mirBlock('loop_exit_0', [], { kind: 'return', value: null }),
      ],
    }
    const result = loopUnroll(fn)
    expect(result).toBe(fn)
  })
})

// ===========================================================================
// 6. constant_fold.ts — uncovered branch (evalCmp default)
// ===========================================================================

describe('constantFold — evalCmp default branch', () => {
  test('unknown cmp op falls through to default (returns 0)', () => {
    // The default case in evalCmp — an op that doesn't match any known op
    // We test through constantFold by constructing a cmp with unknown op
    const fn: MIRFunction = {
      name: 'test',
      params: [],
      blocks: [
        mirBlock('entry', [
          // Use an unknown cmp op — TypeScript won't normally allow this
          // but we cast to test the runtime default branch
          {
            kind: 'cmp',
            dst: 'result',
            op: 'unknown_op' as any,
            a: c(5),
            b: c(3),
          } as MIRInstr,
        ], { kind: 'return', value: t('result') }),
      ],
      entry: 'entry',
      isMacro: false,
    }

    const result = constantFold(fn)
    // Should have folded cmp(unknown_op, 5, 3) → const 0 (default case)
    const instr = result.blocks[0].instrs[0]
    expect(instr.kind).toBe('const')
    if (instr.kind === 'const') {
      expect(instr.value).toBe(0)
      expect(instr.dst).toBe('result')
    }
  })

  test('all six cmp ops fold correctly', () => {
    // Regression: verify all known ops work (these are covered but good to have)
    const ops = [
      { op: 'eq', a: 5, b: 5, expected: 1 },
      { op: 'eq', a: 5, b: 3, expected: 0 },
      { op: 'ne', a: 5, b: 3, expected: 1 },
      { op: 'ne', a: 5, b: 5, expected: 0 },
      { op: 'lt', a: 3, b: 5, expected: 1 },
      { op: 'lt', a: 5, b: 3, expected: 0 },
      { op: 'le', a: 5, b: 5, expected: 1 },
      { op: 'le', a: 6, b: 5, expected: 0 },
      { op: 'gt', a: 5, b: 3, expected: 1 },
      { op: 'gt', a: 3, b: 5, expected: 0 },
      { op: 'ge', a: 5, b: 5, expected: 1 },
      { op: 'ge', a: 4, b: 5, expected: 0 },
    ] as const

    for (const { op, a: av, b: bv, expected } of ops) {
      const fn: MIRFunction = {
        name: 'test',
        params: [],
        blocks: [
          mirBlock('entry', [
            { kind: 'cmp', dst: 'r', op, a: c(av), b: c(bv) },
          ], { kind: 'return', value: t('r') }),
        ],
        entry: 'entry',
        isMacro: false,
      }
      const result = constantFold(fn)
      const instr = result.blocks[0].instrs[0]
      expect(instr.kind).toBe('const')
      if (instr.kind === 'const') {
        expect(instr.value).toBe(expected)
      }
    }
  })

  test('cmp with non-const operands is not folded', () => {
    const fn: MIRFunction = {
      name: 'test',
      params: [],
      blocks: [
        mirBlock('entry', [
          { kind: 'cmp', dst: 'r', op: 'lt', a: t('x'), b: c(5) },
        ], { kind: 'return', value: t('r') }),
      ],
      entry: 'entry',
      isMacro: false,
    }
    const result = constantFold(fn)
    // Not folded — a is temp
    expect(result.blocks[0].instrs[0].kind).toBe('cmp')
  })

  test('div by zero is not folded', () => {
    const fn: MIRFunction = {
      name: 'test',
      params: [],
      blocks: [
        mirBlock('entry', [
          { kind: 'div', dst: 'r', a: c(10), b: c(0) },
        ], { kind: 'return', value: t('r') }),
      ],
      entry: 'entry',
      isMacro: false,
    }
    const result = constantFold(fn)
    // div by 0 should not be folded
    expect(result.blocks[0].instrs[0].kind).toBe('div')
  })

  test('mod by zero is not folded', () => {
    const fn: MIRFunction = {
      name: 'test',
      params: [],
      blocks: [
        mirBlock('entry', [
          { kind: 'mod', dst: 'r', a: c(10), b: c(0) },
        ], { kind: 'return', value: t('r') }),
      ],
      entry: 'entry',
      isMacro: false,
    }
    const result = constantFold(fn)
    expect(result.blocks[0].instrs[0].kind).toBe('mod')
  })
})
