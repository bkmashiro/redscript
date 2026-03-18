/**
 * Tests for the coroutine transform pass.
 *
 * Verifies:
 * - Loop-containing functions are split into continuations
 * - Dispatcher @tick function is generated
 * - batch parameter controls iteration count
 * - onDone callback is called when coroutine completes
 * - Variables live across yield points are promoted
 * - Functions without loops get single-continuation wrapping
 */

import { coroutineTransform, type CoroutineInfo } from '../../optimizer/coroutine'
import type { MIRFunction, MIRModule, MIRBlock, MIRInstr, Operand } from '../../mir/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkFn(name: string, blocks: MIRBlock[], entry = 'entry'): MIRFunction {
  return { name, params: [], blocks, entry, isMacro: false }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr, preds: string[] = []): MIRBlock {
  return { id, instrs, term, preds }
}

function mkModule(functions: MIRFunction[], namespace = 'test'): MIRModule {
  return { functions, namespace, objective: `__${namespace}` }
}

const c = (v: number): Operand => ({ kind: 'const', value: v })
const t = (n: string): Operand => ({ kind: 'temp', name: n })

/**
 * Build a simple loop function:
 *   let i = 0;
 *   while (i < limit) { call do_work(i); i++; }
 *   return;
 *
 * CFG:
 *   entry → header → body → header (back edge)
 *                  → exit
 */
function mkLoopFn(name: string, limit = 1000): MIRFunction {
  return mkFn(name, [
    mkBlock('entry', [
      { kind: 'const', dst: 'i', value: 0 },
    ], { kind: 'jump', target: 'header' }),

    mkBlock('header', [
      { kind: 'cmp', dst: 'cond', op: 'lt', a: t('i'), b: c(limit) },
    ], { kind: 'branch', cond: t('cond'), then: 'body', else: 'exit' }, ['entry', 'body']),

    mkBlock('body', [
      { kind: 'call', dst: null, fn: 'do_work', args: [t('i')] },
      { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
    ], { kind: 'jump', target: 'header' }, ['header']),

    mkBlock('exit', [], { kind: 'return', value: null }, ['header']),
  ])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('coroutine transform', () => {
  describe('basic loop splitting', () => {
    test('splits a loop function into continuations + dispatcher', () => {
      const mod = mkModule([mkLoopFn('process_all')])
      const info: CoroutineInfo = { fnName: 'process_all', batch: 10 }
      const result = coroutineTransform(mod, [info])

      // Should have: init fn (process_all), at least 1 continuation, dispatcher
      const fnNames = result.module.functions.map(f => f.name)
      expect(fnNames).toContain('process_all') // init function
      expect(fnNames).toContain('_coro_process_all_tick') // dispatcher

      // Should have at least one continuation
      const contFns = fnNames.filter(n => n.includes('_coro_process_all_cont_'))
      expect(contFns.length).toBeGreaterThanOrEqual(1)
    })

    test('dispatcher is added to generatedTickFunctions', () => {
      const mod = mkModule([mkLoopFn('process_all')])
      const info: CoroutineInfo = { fnName: 'process_all', batch: 10 }
      const result = coroutineTransform(mod, [info])

      expect(result.generatedTickFunctions).toContain('_coro_process_all_tick')
    })

    test('init function sets pc = 1', () => {
      const mod = mkModule([mkLoopFn('process_all')])
      const info: CoroutineInfo = { fnName: 'process_all', batch: 10 }
      const result = coroutineTransform(mod, [info])

      const initFn = result.module.functions.find(f => f.name === 'process_all')!
      expect(initFn).toBeDefined()

      // Init function should have a score_write instruction setting pc = 1
      // (score_write is used instead of const so DCE cannot eliminate it)
      const allInstrs = initFn.blocks.flatMap(b => b.instrs)
      const pcSet = allInstrs.find(i =>
        i.kind === 'score_write' && i.player.includes('_pc') && i.src.kind === 'const' && i.src.value === 1
      )
      expect(pcSet).toBeDefined()
    })

    test('init function ends with return', () => {
      const mod = mkModule([mkLoopFn('process_all')])
      const info: CoroutineInfo = { fnName: 'process_all', batch: 10 }
      const result = coroutineTransform(mod, [info])

      const initFn = result.module.functions.find(f => f.name === 'process_all')!
      const lastBlock = initFn.blocks[initFn.blocks.length - 1]
      expect(lastBlock.term.kind).toBe('return')
    })
  })

  describe('dispatcher generation', () => {
    test('dispatcher checks pc for each continuation', () => {
      const mod = mkModule([mkLoopFn('process_all')])
      const info: CoroutineInfo = { fnName: 'process_all', batch: 10 }
      const result = coroutineTransform(mod, [info])

      const dispatcher = result.module.functions.find(f => f.name === '_coro_process_all_tick')!
      expect(dispatcher).toBeDefined()

      // Dispatcher should contain cmp instructions checking pc
      const allInstrs = dispatcher.blocks.flatMap(b => b.instrs)
      const cmpInstrs = allInstrs.filter(i => i.kind === 'cmp')
      expect(cmpInstrs.length).toBeGreaterThanOrEqual(1)

      // Dispatcher should call continuation functions
      const callInstrs = allInstrs.filter(i => i.kind === 'call')
      expect(callInstrs.length).toBeGreaterThanOrEqual(1)
      for (const call of callInstrs) {
        if (call.kind === 'call') {
          expect(call.fn).toContain('_coro_process_all_cont_')
        }
      }
    })
  })

  describe('batch parameter', () => {
    test('continuation contains batch counting logic', () => {
      const mod = mkModule([mkLoopFn('process_all')])
      const info: CoroutineInfo = { fnName: 'process_all', batch: 5 }
      const result = coroutineTransform(mod, [info])

      // Find the loop continuation
      const contFn = result.module.functions.find(f => f.name.includes('_cont_'))!
      expect(contFn).toBeDefined()

      // Should contain batch count initialization (const 0)
      const allInstrs = contFn.blocks.flatMap(b => b.instrs)
      const batchInit = allInstrs.find(i =>
        i.kind === 'const' && i.dst.includes('batch_count') && i.value === 0
      )
      expect(batchInit).toBeDefined()

      // Should contain batch comparison (cmp ge against batch value)
      const batchCmp = allInstrs.find(i =>
        i.kind === 'cmp' && i.op === 'ge'
      )
      expect(batchCmp).toBeDefined()
      if (batchCmp && batchCmp.kind === 'cmp') {
        expect(batchCmp.b).toEqual(c(5))
      }
    })

    test('different batch values produce different comparison constants', () => {
      const mod1 = mkModule([mkLoopFn('fn1')])
      const mod2 = mkModule([mkLoopFn('fn2')])

      const result1 = coroutineTransform(mod1, [{ fnName: 'fn1', batch: 10 }])
      const result2 = coroutineTransform(mod2, [{ fnName: 'fn2', batch: 50 }])

      const cont1 = result1.module.functions.find(f => f.name.includes('_cont_'))!
      const cont2 = result2.module.functions.find(f => f.name.includes('_cont_'))!

      const batchCmp1 = cont1.blocks.flatMap(b => b.instrs).find(i =>
        i.kind === 'cmp' && i.op === 'ge'
      )
      const batchCmp2 = cont2.blocks.flatMap(b => b.instrs).find(i =>
        i.kind === 'cmp' && i.op === 'ge'
      )

      expect(batchCmp1).toBeDefined()
      expect(batchCmp2).toBeDefined()
      if (batchCmp1?.kind === 'cmp' && batchCmp2?.kind === 'cmp') {
        expect(batchCmp1.b).toEqual(c(10))
        expect(batchCmp2.b).toEqual(c(50))
      }
    })
  })

  describe('onDone callback', () => {
    test('generates call to onDone function when coroutine completes', () => {
      const mod = mkModule([mkLoopFn('process_all')])
      const info: CoroutineInfo = { fnName: 'process_all', batch: 10, onDone: 'after_process' }
      const result = coroutineTransform(mod, [info])

      // Find post-loop continuation or the exit path
      // onDone should appear as a call instruction somewhere in the continuations
      const allFns = result.module.functions.filter(f => f.name.includes('_cont_'))
      const allInstrs = allFns.flatMap(f => f.blocks.flatMap(b => b.instrs))
      const onDoneCall = allInstrs.find(i =>
        i.kind === 'call' && i.fn === 'after_process'
      )
      expect(onDoneCall).toBeDefined()
    })

    test('no onDone call when onDone is not specified', () => {
      const mod = mkModule([mkLoopFn('process_all')])
      const info: CoroutineInfo = { fnName: 'process_all', batch: 10 }
      const result = coroutineTransform(mod, [info])

      const allFns = result.module.functions.filter(f => f.name.includes('_cont_'))
      const allInstrs = allFns.flatMap(f => f.blocks.flatMap(b => b.instrs))
      const unexpectedCall = allInstrs.find(i =>
        i.kind === 'call' && i.fn === 'after_process'
      )
      expect(unexpectedCall).toBeUndefined()
    })
  })

  describe('variable promotion', () => {
    test('live variables at yield points get promoted names', () => {
      const mod = mkModule([mkLoopFn('process_all')])
      const info: CoroutineInfo = { fnName: 'process_all', batch: 10 }
      const result = coroutineTransform(mod, [info])

      // The loop variable 'i' should be promoted to a persistent name
      const contFn = result.module.functions.find(f => f.name.includes('_cont_'))!
      const allInstrs = contFn.blocks.flatMap(b => [...b.instrs, b.term])

      // Check that promoted variable names contain the coroutine prefix
      const hasPromoted = allInstrs.some(i => {
        if (i.kind === 'call' && i.args.length > 0) {
          return i.args.some(a => a.kind === 'temp' && a.name.includes('_coro_'))
        }
        return false
      })
      expect(hasPromoted).toBe(true)
    })
  })

  describe('no-loop functions', () => {
    test('function without loops gets single-continuation wrapping', () => {
      const fn = mkFn('simple', [
        mkBlock('entry', [
          { kind: 'call', dst: null, fn: 'do_something', args: [] },
        ], { kind: 'return', value: null }),
      ])
      const mod = mkModule([fn])
      const info: CoroutineInfo = { fnName: 'simple', batch: 10 }
      const result = coroutineTransform(mod, [info])

      const fnNames = result.module.functions.map(f => f.name)
      expect(fnNames).toContain('simple')
      expect(fnNames).toContain('_coro_simple_tick')
      expect(fnNames).toContain('_coro_simple_cont_1')
    })

    test('no-loop function with onDone calls onDone', () => {
      const fn = mkFn('simple', [
        mkBlock('entry', [
          { kind: 'call', dst: null, fn: 'work', args: [] },
        ], { kind: 'return', value: null }),
      ])
      const mod = mkModule([fn])
      const info: CoroutineInfo = { fnName: 'simple', batch: 10, onDone: 'callback' }
      const result = coroutineTransform(mod, [info])

      const cont = result.module.functions.find(f => f.name === '_coro_simple_cont_1')!
      const allInstrs = cont.blocks.flatMap(b => b.instrs)
      const onDoneCall = allInstrs.find(i => i.kind === 'call' && i.fn === 'callback')
      expect(onDoneCall).toBeDefined()
    })
  })

  describe('non-coroutine functions are unchanged', () => {
    test('functions not in coroutine list pass through untouched', () => {
      const fn1 = mkFn('helper', [
        mkBlock('entry', [
          { kind: 'const', dst: 't0', value: 42 },
        ], { kind: 'return', value: t('t0') }),
      ])
      const fn2 = mkLoopFn('process_all')
      const mod = mkModule([fn1, fn2])
      const info: CoroutineInfo = { fnName: 'process_all', batch: 10 }
      const result = coroutineTransform(mod, [info])

      // helper should be in the output unchanged
      const helper = result.module.functions.find(f => f.name === 'helper')!
      expect(helper).toBeDefined()
      expect(helper.blocks).toHaveLength(1)
      expect(helper.blocks[0].instrs[0]).toEqual({ kind: 'const', dst: 't0', value: 42 })
    })
  })

  describe('empty coroutine list', () => {
    test('returns module unchanged when no coroutines', () => {
      const mod = mkModule([mkLoopFn('process_all')])
      const result = coroutineTransform(mod, [])

      expect(result.module).toBe(mod) // same reference
      expect(result.generatedTickFunctions).toEqual([])
    })
  })
})
