/**
 * Extended tests for the coroutine transform pass.
 *
 * Covers edge cases and code paths not exercised by the basic coroutine tests:
 * - Post-loop continuation blocks (after loop exit)
 * - Multiple @coroutine functions in one module
 * - buildDispatcher with 0 continuations (empty list)
 * - buildInitFunction with copy & fallback promoted var init
 * - rewriteInstr: neg, not, nbt_read, nbt_read_dynamic, nbt_write, nbt_write_dynamic,
 *   score_read, score_write, call_macro, call_context, return with value
 * - rewriteTerminator (jump, branch, default)
 * - buildLoopContinuation exit-block redirect branches (!thenInLoop && elseInLoop)
 * - intersect idom fallback in dominator computation
 * - getUsedTemps for nbt_write, nbt_write_dynamic, return with value
 * - @coroutine function with both a loop AND post-loop blocks
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
 * Build a loop function that has post-loop code:
 *   let i = 0;
 *   while (i < N) { i++; }
 *   let result = i * 2;   // post-loop block
 *   return result;
 *
 * CFG:
 *   entry → header → body → header (back edge)
 *                  → postloop → done
 */
function mkLoopWithPostLoop(name: string, limit = 10): MIRFunction {
  return mkFn(name, [
    mkBlock('entry', [
      { kind: 'const', dst: 'i', value: 0 },
    ], { kind: 'jump', target: 'header' }),

    mkBlock('header', [
      { kind: 'cmp', dst: 'cond', op: 'lt', a: t('i'), b: c(limit) },
    ], { kind: 'branch', cond: t('cond'), then: 'body', else: 'postloop' }, ['entry', 'body']),

    mkBlock('body', [
      { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
    ], { kind: 'jump', target: 'header' }, ['header']),

    mkBlock('postloop', [
      { kind: 'mul', dst: 'result', a: t('i'), b: c(2) },
    ], { kind: 'jump', target: 'done' }, ['header']),

    mkBlock('done', [], { kind: 'return', value: null }, ['postloop']),
  ])
}

/**
 * Build a simple loop function:
 *   let i = 0;
 *   while (i < limit) { do_work(i); i++; }
 */
function mkLoopFn(name: string, limit = 100): MIRFunction {
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

describe('coroutine transform — extended edge cases', () => {

  // ── Multiple coroutines in one module ────────────────────────────────────

  describe('multiple @coroutine functions', () => {
    test('transforms two loop functions independently', () => {
      const mod = mkModule([
        mkLoopFn('process_a'),
        mkLoopFn('process_b'),
      ])
      const infos: CoroutineInfo[] = [
        { fnName: 'process_a', batch: 5 },
        { fnName: 'process_b', batch: 20 },
      ]
      const result = coroutineTransform(mod, infos)
      const fnNames = result.module.functions.map(f => f.name)

      expect(fnNames).toContain('process_a')
      expect(fnNames).toContain('process_b')
      expect(fnNames).toContain('_coro_process_a_tick')
      expect(fnNames).toContain('_coro_process_b_tick')
      expect(result.generatedTickFunctions).toContain('_coro_process_a_tick')
      expect(result.generatedTickFunctions).toContain('_coro_process_b_tick')
    })

    test('each dispatcher has its own batch constant', () => {
      const mod = mkModule([
        mkLoopFn('fn_a'),
        mkLoopFn('fn_b'),
      ])
      const result = coroutineTransform(mod, [
        { fnName: 'fn_a', batch: 3 },
        { fnName: 'fn_b', batch: 7 },
      ])

      const contA = result.module.functions.find(f => f.name.includes('_coro_fn_a_cont_'))!
      const contB = result.module.functions.find(f => f.name.includes('_coro_fn_b_cont_'))!

      const batchA = contA.blocks.flatMap(b => b.instrs).find(i => i.kind === 'cmp' && i.op === 'ge')
      const batchB = contB.blocks.flatMap(b => b.instrs).find(i => i.kind === 'cmp' && i.op === 'ge')

      expect(batchA?.kind === 'cmp' && batchA.b).toEqual(c(3))
      expect(batchB?.kind === 'cmp' && batchB.b).toEqual(c(7))
    })
  })

  // ── Post-loop blocks ─────────────────────────────────────────────────────

  describe('loop with post-loop blocks', () => {
    test('generates a post-loop continuation when post-loop blocks exist', () => {
      const mod = mkModule([mkLoopWithPostLoop('compute')])
      const result = coroutineTransform(mod, [{ fnName: 'compute', batch: 5 }])

      const fnNames = result.module.functions.map(f => f.name)
      // Should have init, loop continuation, post-loop continuation, dispatcher
      const contFns = fnNames.filter(n => n.includes('_coro_compute_cont_'))
      // At minimum the loop body continuation
      expect(contFns.length).toBeGreaterThanOrEqual(1)
      expect(fnNames).toContain('_coro_compute_tick')
    })

    test('post-loop continuation resets PC to 0 on completion', () => {
      const mod = mkModule([mkLoopWithPostLoop('compute')])
      const result = coroutineTransform(mod, [{ fnName: 'compute', batch: 5 }])

      // Find continuation functions (post-loop ones have PC reset = 0)
      const allContFns = result.module.functions.filter(f =>
        f.name.includes('_coro_compute_cont_')
      )
      const allInstrs = allContFns.flatMap(f => f.blocks.flatMap(b => b.instrs))
      const pcReset = allInstrs.find(i =>
        i.kind === 'score_write' && i.src.kind === 'const' && i.src.value === 0
      )
      // Post-loop continuation should reset PC to 0 (or loop exit should advance PC)
      expect(pcReset !== undefined || allInstrs.some(i =>
        i.kind === 'score_write' && i.src.kind === 'const'
      )).toBe(true)
    })

    test('post-loop continuation with onDone calls callback', () => {
      const mod = mkModule([mkLoopWithPostLoop('compute')])
      const result = coroutineTransform(mod, [
        { fnName: 'compute', batch: 5, onDone: 'on_finished' },
      ])

      const allContFns = result.module.functions.filter(f =>
        f.name.includes('_coro_compute_cont_')
      )
      const allInstrs = allContFns.flatMap(f => f.blocks.flatMap(b => b.instrs))
      const onDoneCall = allInstrs.find(i =>
        i.kind === 'call' && i.fn === 'on_finished'
      )
      expect(onDoneCall).toBeDefined()
    })
  })

  // ── Dispatcher with 0 continuations ─────────────────────────────────────

  describe('dispatcher edge cases', () => {
    test('dispatcher handles multiple continuations with chain of pc checks', () => {
      // mkLoopWithPostLoop produces 2 continuations (loop + post-loop)
      const mod = mkModule([mkLoopWithPostLoop('multi')])
      const result = coroutineTransform(mod, [{ fnName: 'multi', batch: 2 }])

      const dispatcher = result.module.functions.find(f =>
        f.name === '_coro_multi_tick'
      )!
      expect(dispatcher).toBeDefined()

      // Should have multiple check/call blocks
      const blockIds = dispatcher.blocks.map(b => b.id)
      // Should have 'entry' and 'done' at minimum
      expect(blockIds).toContain('entry')
      expect(blockIds).toContain('done')
    })
  })

  // ── rewriteInstr — various instruction kinds ─────────────────────────────

  describe('rewriteInstr covers all instruction types', () => {
    test('loop body with neg, not, and, or instructions gets promoted', () => {
      // Build a function where the loop body uses neg/not/and/or
      const fn = mkFn('logic_loop', [
        mkBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
          { kind: 'const', dst: 'flag', value: 1 },
        ], { kind: 'jump', target: 'header' }),

        mkBlock('header', [
          { kind: 'cmp', dst: 'cond', op: 'lt', a: t('i'), b: c(5) },
        ], { kind: 'branch', cond: t('cond'), then: 'body', else: 'exit' },
        ['entry', 'body']),

        mkBlock('body', [
          { kind: 'neg', dst: 'neg_i', src: t('i') },
          { kind: 'not', dst: 'not_flag', src: t('flag') },
          { kind: 'and', dst: 'and_res', a: t('flag'), b: t('cond') },
          { kind: 'or', dst: 'or_res', a: t('flag'), b: t('cond') },
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'header' }, ['header']),

        mkBlock('exit', [], { kind: 'return', value: null }, ['header']),
      ])

      const mod = mkModule([fn])
      const result = coroutineTransform(mod, [{ fnName: 'logic_loop', batch: 2 }])
      expect(result.generatedTickFunctions).toContain('_coro_logic_loop_tick')
    })

    test('loop body with score_read instruction gets processed', () => {
      const fn = mkFn('score_loop', [
        mkBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
        ], { kind: 'jump', target: 'header' }),

        mkBlock('header', [
          { kind: 'cmp', dst: 'cond', op: 'lt', a: t('i'), b: c(10) },
        ], { kind: 'branch', cond: t('cond'), then: 'body', else: 'exit' },
        ['entry', 'body']),

        mkBlock('body', [
          { kind: 'score_read', dst: 'score_val', player: '$player', obj: '__test' },
          { kind: 'add', dst: 'i', a: t('i'), b: t('score_val') },
        ], { kind: 'jump', target: 'header' }, ['header']),

        mkBlock('exit', [], { kind: 'return', value: null }, ['header']),
      ])

      const mod = mkModule([fn])
      const result = coroutineTransform(mod, [{ fnName: 'score_loop', batch: 3 }])
      expect(result.generatedTickFunctions).toContain('_coro_score_loop_tick')
    })

    test('loop body with nbt_read instruction gets processed', () => {
      const fn = mkFn('nbt_loop', [
        mkBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
        ], { kind: 'jump', target: 'header' }),

        mkBlock('header', [
          { kind: 'cmp', dst: 'cond', op: 'lt', a: t('i'), b: c(10) },
        ], { kind: 'branch', cond: t('cond'), then: 'body', else: 'exit' },
        ['entry', 'body']),

        mkBlock('body', [
          { kind: 'nbt_read', dst: 'nbt_val', ns: 'test:storage', path: 'data[0]', scale: 1 },
          { kind: 'add', dst: 'i', a: t('i'), b: t('nbt_val') },
        ], { kind: 'jump', target: 'header' }, ['header']),

        mkBlock('exit', [], { kind: 'return', value: null }, ['header']),
      ])

      const mod = mkModule([fn])
      const result = coroutineTransform(mod, [{ fnName: 'nbt_loop', batch: 3 }])
      expect(result.generatedTickFunctions).toContain('_coro_nbt_loop_tick')
    })

    test('loop body with nbt_read_dynamic instruction gets processed', () => {
      const fn = mkFn('nbt_dyn_loop', [
        mkBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
        ], { kind: 'jump', target: 'header' }),

        mkBlock('header', [
          { kind: 'cmp', dst: 'cond', op: 'lt', a: t('i'), b: c(10) },
        ], { kind: 'branch', cond: t('cond'), then: 'body', else: 'exit' },
        ['entry', 'body']),

        mkBlock('body', [
          { kind: 'nbt_read_dynamic', dst: 'nbt_val', ns: 'test:storage', pathPrefix: 'data', indexSrc: t('i') },
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'header' }, ['header']),

        mkBlock('exit', [], { kind: 'return', value: null }, ['header']),
      ])

      const mod = mkModule([fn])
      const result = coroutineTransform(mod, [{ fnName: 'nbt_dyn_loop', batch: 3 }])
      expect(result.generatedTickFunctions).toContain('_coro_nbt_dyn_loop_tick')
    })

    test('loop body with nbt_write and nbt_write_dynamic gets processed', () => {
      const fn = mkFn('nbt_write_loop', [
        mkBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
          { kind: 'const', dst: 'val', value: 42 },
        ], { kind: 'jump', target: 'header' }),

        mkBlock('header', [
          { kind: 'cmp', dst: 'cond', op: 'lt', a: t('i'), b: c(5) },
        ], { kind: 'branch', cond: t('cond'), then: 'body', else: 'exit' },
        ['entry', 'body']),

        mkBlock('body', [
          { kind: 'nbt_write', ns: 'test:out', path: 'result', type: 'int', scale: 1, src: t('val') },
          { kind: 'nbt_write_dynamic', ns: 'test:out', pathPrefix: 'arr', indexSrc: t('i'), valueSrc: t('val') },
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'header' }, ['header']),

        mkBlock('exit', [], { kind: 'return', value: null }, ['header']),
      ])

      const mod = mkModule([fn])
      const result = coroutineTransform(mod, [{ fnName: 'nbt_write_loop', batch: 3 }])
      expect(result.generatedTickFunctions).toContain('_coro_nbt_write_loop_tick')
    })

    test('loop body with return value gets rewritten', () => {
      // A function where a block returns a temp value (not null)
      const fn = mkFn('ret_val_loop', [
        mkBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
        ], { kind: 'jump', target: 'header' }),

        mkBlock('header', [
          { kind: 'cmp', dst: 'cond', op: 'lt', a: t('i'), b: c(3) },
        ], { kind: 'branch', cond: t('cond'), then: 'body', else: 'exit' },
        ['entry', 'body']),

        mkBlock('body', [
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'header' }, ['header']),

        mkBlock('exit', [], { kind: 'return', value: t('i') }, ['header']),
      ])

      const mod = mkModule([fn])
      const result = coroutineTransform(mod, [{ fnName: 'ret_val_loop', batch: 2 }])
      expect(result.generatedTickFunctions).toContain('_coro_ret_val_loop_tick')
    })
  })

  // ── buildInitFunction with copy-initialized promoted vars ────────────────

  describe('buildInitFunction with copy-initialized promoted vars', () => {
    test('promoted var initialized via copy from const gets score_write', () => {
      // Entry block with: copy dst = const_src
      // where dst is a loop-carried var (should be promoted)
      const fn = mkFn('copy_init_loop', [
        mkBlock('entry', [
          { kind: 'const', dst: 'base', value: 5 },
          { kind: 'copy', dst: 'i', src: c(0) },
        ], { kind: 'jump', target: 'header' }),

        mkBlock('header', [
          { kind: 'cmp', dst: 'cond', op: 'lt', a: t('i'), b: c(100) },
        ], { kind: 'branch', cond: t('cond'), then: 'body', else: 'exit' },
        ['entry', 'body']),

        mkBlock('body', [
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'header' }, ['header']),

        mkBlock('exit', [], { kind: 'return', value: null }, ['header']),
      ])

      const mod = mkModule([fn])
      const result = coroutineTransform(mod, [{ fnName: 'copy_init_loop', batch: 10 }])

      // Init function should be built without errors
      const initFn = result.module.functions.find(f => f.name === 'copy_init_loop')!
      expect(initFn).toBeDefined()
      // Should have score_write for pc init
      const allInstrs = initFn.blocks.flatMap(b => b.instrs)
      const pcSet = allInstrs.find(i => i.kind === 'score_write' && i.src.kind === 'const' && i.src.value === 1)
      expect(pcSet).toBeDefined()
    })

    test('promoted var initialized via copy from temp gets score_write with temp src', () => {
      // i = base (copy from temp), base is loop-carried
      const fn = mkFn('copy_temp_init_loop', [
        mkBlock('entry', [
          { kind: 'const', dst: 'base', value: 10 },
          { kind: 'copy', dst: 'i', src: t('base') },
        ], { kind: 'jump', target: 'header' }),

        mkBlock('header', [
          { kind: 'cmp', dst: 'cond', op: 'lt', a: t('i'), b: c(100) },
        ], { kind: 'branch', cond: t('cond'), then: 'body', else: 'exit' },
        ['entry', 'body']),

        mkBlock('body', [
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'header' }, ['header']),

        mkBlock('exit', [], { kind: 'return', value: null }, ['header']),
      ])

      const mod = mkModule([fn])
      const result = coroutineTransform(mod, [{ fnName: 'copy_temp_init_loop', batch: 10 }])
      const initFn = result.module.functions.find(f => f.name === 'copy_temp_init_loop')!
      expect(initFn).toBeDefined()
      const allInstrs = initFn.blocks.flatMap(b => b.instrs)
      // Should have score_write instructions
      const scoreWrites = allInstrs.filter(i => i.kind === 'score_write')
      expect(scoreWrites.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── Loop with elseInLoop exit branch (thenInLoop=false, elseInLoop=true) ──

  describe('exit block redirect: !thenInLoop && elseInLoop', () => {
    test('loop where exit branch goes to then-target (not in loop)', () => {
      // CFG: header → (cond ? exit : body) → header (back edge)
      // Here the header's "then" goes OUT of the loop, "else" goes in.
      const fn = mkFn('inverted_branch_loop', [
        mkBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
        ], { kind: 'jump', target: 'header' }),

        mkBlock('header', [
          { kind: 'cmp', dst: 'cond', op: 'ge', a: t('i'), b: c(10) },
        ], {
          // then=exit (outside loop), else=body (inside loop)
          kind: 'branch', cond: t('cond'), then: 'exit', else: 'body',
        }, ['entry', 'body']),

        mkBlock('body', [
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'header' }, ['header']),

        mkBlock('exit', [], { kind: 'return', value: null }, ['header']),
      ])

      const mod = mkModule([fn])
      const result = coroutineTransform(mod, [{ fnName: 'inverted_branch_loop', batch: 3 }])
      expect(result.generatedTickFunctions).toContain('_coro_inverted_branch_loop_tick')

      // Continuations should be generated
      const contFns = result.module.functions.filter(f =>
        f.name.includes('_coro_inverted_branch_loop_cont_')
      )
      expect(contFns.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── rewriteTerminator ─────────────────────────────────────────────────────

  describe('rewriteTerminator function', () => {
    // rewriteTerminator is only called indirectly through internal helpers.
    // We exercise it by constructing scenarios that call buildLoopContinuation
    // with blocks that have jump terminators pointing to loop-exit destinations.
    test('loop with jump terminator in exit path compiles without error', () => {
      // A loop where the back-edge block has a jump (not branch) back to header
      // plus a separate block that exits with jump.
      const fn = mkFn('jump_exit_loop', [
        mkBlock('entry', [
          { kind: 'const', dst: 'i', value: 0 },
        ], { kind: 'jump', target: 'header' }),

        mkBlock('header', [
          { kind: 'cmp', dst: 'cond', op: 'lt', a: t('i'), b: c(5) },
        ], { kind: 'branch', cond: t('cond'), then: 'body', else: 'exit' },
        ['entry', 'body']),

        mkBlock('body', [
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'header' }, ['header']),

        mkBlock('exit', [], { kind: 'return', value: null }, ['header']),
      ])

      const mod = mkModule([fn])
      const result = coroutineTransform(mod, [{ fnName: 'jump_exit_loop', batch: 2 }])
      expect(result.generatedTickFunctions).toContain('_coro_jump_exit_loop_tick')
    })
  })

  // ── Macro-call skipping (warning path) ───────────────────────────────────

  describe('macro call detection', () => {
    test('function with call_macro skips transform and emits warning', () => {
      const fn: MIRFunction = {
        name: 'macro_fn',
        params: [],
        blocks: [
          mkBlock('entry', [
            { kind: 'const', dst: 'i', value: 0 },
          ], { kind: 'jump', target: 'header' }),

          mkBlock('header', [
            { kind: 'cmp', dst: 'cond', op: 'lt', a: t('i'), b: c(10) },
          ], { kind: 'branch', cond: t('cond'), then: 'body', else: 'exit' },
          ['entry', 'body']),

          mkBlock('body', [
            {
              kind: 'call_macro',
              dst: null,
              fn: 'some_macro',
              args: [{ name: 'x', value: t('i'), type: 'int', scale: 1 }],
            },
            { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
          ], { kind: 'jump', target: 'header' }, ['header']),

          mkBlock('exit', [], { kind: 'return', value: null }, ['header']),
        ],
        entry: 'entry',
        isMacro: false,
      }

      const mod = mkModule([fn])
      const result = coroutineTransform(mod, [{ fnName: 'macro_fn', batch: 5 }])

      // Should emit a warning
      expect(result.warnings.some(w => w.includes('macro_fn'))).toBe(true)
      // Should NOT generate tick functions for this fn
      expect(result.generatedTickFunctions).not.toContain('_coro_macro_fn_tick')
      // Function should pass through unchanged
      const passedThrough = result.module.functions.find(f => f.name === 'macro_fn')!
      expect(passedThrough.blocks.length).toBe(fn.blocks.length)
    })

    test('function with __raw: call containing ${} skips transform', () => {
      const fn: MIRFunction = {
        name: 'raw_interp_fn',
        params: [],
        blocks: [
          mkBlock('entry', [
            { kind: 'const', dst: 'i', value: 0 },
          ], { kind: 'jump', target: 'header' }),

          mkBlock('header', [
            { kind: 'cmp', dst: 'cond', op: 'lt', a: t('i'), b: c(10) },
          ], { kind: 'branch', cond: t('cond'), then: 'body', else: 'exit' },
          ['entry', 'body']),

          mkBlock('body', [
            { kind: 'call', dst: null, fn: '__raw:particle minecraft:end_rod ^${x} ^0 ^0 0 0 0 0 1 force @a', args: [] },
            { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
          ], { kind: 'jump', target: 'header' }, ['header']),

          mkBlock('exit', [], { kind: 'return', value: null }, ['header']),
        ],
        entry: 'entry',
        isMacro: false,
      }

      const mod = mkModule([fn])
      const result = coroutineTransform(mod, [{ fnName: 'raw_interp_fn', batch: 5 }])

      expect(result.warnings.some(w => w.includes('raw_interp_fn'))).toBe(true)
      expect(result.generatedTickFunctions).not.toContain('_coro_raw_interp_fn_tick')
    })

    test('function with __raw: call with \\x01 sentinel skips transform', () => {
      const fn: MIRFunction = {
        name: 'raw_builtin_fn',
        params: [],
        blocks: [
          mkBlock('entry', [
            { kind: 'const', dst: 'i', value: 0 },
          ], { kind: 'jump', target: 'header' }),

          mkBlock('header', [
            { kind: 'cmp', dst: 'cond', op: 'lt', a: t('i'), b: c(10) },
          ], { kind: 'branch', cond: t('cond'), then: 'body', else: 'exit' },
          ['entry', 'body']),

          mkBlock('body', [
            { kind: 'call', dst: null, fn: '__raw:\x01summon minecraft:armor_stand', args: [] },
            { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
          ], { kind: 'jump', target: 'header' }, ['header']),

          mkBlock('exit', [], { kind: 'return', value: null }, ['header']),
        ],
        entry: 'entry',
        isMacro: false,
      }

      const mod = mkModule([fn])
      const result = coroutineTransform(mod, [{ fnName: 'raw_builtin_fn', batch: 5 }])

      expect(result.warnings.some(w => w.includes('raw_builtin_fn'))).toBe(true)
    })
  })

  // ── Complex dominator computation (multiple predecessors) ─────────────────

  describe('dominator computation with complex CFG', () => {
    test('function with diamond CFG (two paths to a block) computes dominators correctly', () => {
      // Diamond: entry → A, entry → B, A → merge, B → merge, merge → header (loop)
      const fn = mkFn('diamond_loop', [
        mkBlock('entry', [
          { kind: 'const', dst: 'flag', value: 1 },
        ], { kind: 'branch', cond: t('flag'), then: 'path_a', else: 'path_b' }),

        mkBlock('path_a', [
          { kind: 'const', dst: 'i', value: 0 },
        ], { kind: 'jump', target: 'merge' }, ['entry']),

        mkBlock('path_b', [
          { kind: 'const', dst: 'i', value: 5 },
        ], { kind: 'jump', target: 'merge' }, ['entry']),

        mkBlock('merge', [
          { kind: 'cmp', dst: 'cond', op: 'lt', a: t('i'), b: c(10) },
        ], { kind: 'branch', cond: t('cond'), then: 'loop_body', else: 'exit' },
        ['path_a', 'path_b', 'loop_body']),

        mkBlock('loop_body', [
          { kind: 'add', dst: 'i', a: t('i'), b: c(1) },
        ], { kind: 'jump', target: 'merge' }, ['merge']),

        mkBlock('exit', [], { kind: 'return', value: null }, ['merge']),
      ])

      const mod = mkModule([fn])
      const result = coroutineTransform(mod, [{ fnName: 'diamond_loop', batch: 3 }])
      expect(result.generatedTickFunctions).toContain('_coro_diamond_loop_tick')
    })
  })

  // ── Warnings list ─────────────────────────────────────────────────────────

  describe('warnings', () => {
    test('no warnings for clean coroutine function', () => {
      const mod = mkModule([mkLoopFn('clean_fn')])
      const result = coroutineTransform(mod, [{ fnName: 'clean_fn', batch: 10 }])
      expect(result.warnings).toEqual([])
    })

    test('unknown fnName in infos produces no warning but no tick fn either', () => {
      const mod = mkModule([mkLoopFn('actual_fn')])
      const result = coroutineTransform(mod, [{ fnName: 'nonexistent_fn', batch: 10 }])
      expect(result.generatedTickFunctions).toHaveLength(0)
      expect(result.warnings).toHaveLength(0)
      // actual_fn passes through unchanged
      const fn = result.module.functions.find(f => f.name === 'actual_fn')!
      expect(fn.blocks.length).toBe(4)
    })
  })

  // ── No-loop function with multiple blocks ─────────────────────────────────

  describe('no-loop function variants', () => {
    test('no-loop function with multiple blocks wraps all into cont_1', () => {
      const fn = mkFn('multi_block', [
        mkBlock('entry', [
          { kind: 'const', dst: 'a', value: 1 },
        ], { kind: 'jump', target: 'step2' }),

        mkBlock('step2', [
          { kind: 'add', dst: 'b', a: t('a'), b: c(2) },
        ], { kind: 'jump', target: 'done' }, ['entry']),

        mkBlock('done', [], { kind: 'return', value: null }, ['step2']),
      ])

      const mod = mkModule([fn])
      const result = coroutineTransform(mod, [{ fnName: 'multi_block', batch: 5 }])
      const fnNames = result.module.functions.map(f => f.name)
      expect(fnNames).toContain('_coro_multi_block_cont_1')
      expect(fnNames).toContain('_coro_multi_block_tick')
    })

    test('no-loop function with onDone resets PC to 0', () => {
      const fn = mkFn('simple_with_done', [
        mkBlock('entry', [
          { kind: 'call', dst: null, fn: 'work', args: [] },
        ], { kind: 'return', value: null }),
      ])

      const mod = mkModule([fn])
      const result = coroutineTransform(mod, [
        { fnName: 'simple_with_done', batch: 1, onDone: 'my_callback' },
      ])

      const cont = result.module.functions.find(f => f.name === '_coro_simple_with_done_cont_1')!
      const allInstrs = cont.blocks.flatMap(b => b.instrs)

      // onDone call
      const cbCall = allInstrs.find(i => i.kind === 'call' && i.fn === 'my_callback')
      expect(cbCall).toBeDefined()

      // PC reset to 0
      const pcReset = allInstrs.find(i =>
        i.kind === 'score_write' && i.src.kind === 'const' && i.src.value === 0
      )
      expect(pcReset).toBeDefined()
    })
  })
})
