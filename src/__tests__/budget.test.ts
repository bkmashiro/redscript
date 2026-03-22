import {
  estimateCommandCount,
  analyzeBudget,
  BUDGET_WARN_THRESHOLD,
  BUDGET_ERROR_THRESHOLD,
} from '../lir/budget'
import type { LIRModule, LIRFunction, LIRInstr, Slot } from '../lir/types'
import { compile } from '../emit/compile'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NS = 'test'
const OBJ = '__test'

function slot(name: string): Slot {
  return { player: name, obj: OBJ }
}

function mkFn(name: string, instructions: LIRInstr[]): LIRFunction {
  return { name, instructions, isMacro: false, macroParams: [] }
}

function mkModule(functions: LIRFunction[]): LIRModule {
  return { functions, namespace: NS, objective: OBJ }
}

// ---------------------------------------------------------------------------
// Unit tests: estimateCommandCount
// ---------------------------------------------------------------------------

describe('estimateCommandCount', () => {
  test('missing function returns 0', () => {
    const mod = mkModule([mkFn('main', [])])
    expect(estimateCommandCount('missing', mod)).toBe(0)
  })

  test('flat function — counts each instruction as 1', () => {
    const fn = mkFn('simple', [
      { kind: 'score_set', dst: slot('$x'), value: 0 },
      { kind: 'score_set', dst: slot('$y'), value: 1 },
      { kind: 'score_add', dst: slot('$x'), src: slot('$y') },
    ])
    const mod = mkModule([fn])
    expect(estimateCommandCount('simple', mod)).toBe(3)
  })

  test('function calling another — sums callee cost', () => {
    const callee = mkFn('helper', [
      { kind: 'score_set', dst: slot('$a'), value: 42 },
      { kind: 'score_set', dst: slot('$b'), value: 43 },
    ])
    const caller = mkFn('main', [
      { kind: 'score_set', dst: slot('$x'), value: 0 },
      { kind: 'call', fn: `${NS}:helper` },
    ])
    const mod = mkModule([caller, callee])
    // caller: 2 instrs + callee: 2 instrs = 4
    expect(estimateCommandCount('main', mod)).toBe(4)
  })

  test('self-recursive function (loop) — multiplies by estimated iterations', () => {
    // Simulate a loop: header checks condition, calls body, body calls header
    const header = mkFn('loop__header', [
      { kind: 'call_if_matches', fn: `${NS}:loop__body`, slot: slot('$i'), range: '..99' },
    ])
    const body = mkFn('loop__body', [
      { kind: 'score_add', dst: slot('$i'), src: slot('$one') },
      { kind: 'score_set', dst: slot('$tmp'), value: 1 },
      { kind: 'call', fn: `${NS}:loop__header` },
    ])
    const mod = mkModule([header, body])
    // Cycle: header(1) + body(3) = 4 cmds/iteration
    // Range ..99 → 100 iterations
    // Total: 4 × 100 = 400
    expect(estimateCommandCount('loop__header', mod)).toBe(400)
  })

  test('unknown loop bound defaults to 100 iterations', () => {
    const header = mkFn('loop__header', [
      { kind: 'call_if_score', fn: `${NS}:loop__body`, a: slot('$i'), op: 'lt', b: slot('$limit') },
    ])
    const body = mkFn('loop__body', [
      { kind: 'score_add', dst: slot('$i'), src: slot('$one') },
      { kind: 'call', fn: `${NS}:loop__header` },
    ])
    const mod = mkModule([header, body])
    // Cycle: 1 + 2 = 3 cmds/iteration, 100 default iterations = 300
    expect(estimateCommandCount('loop__header', mod)).toBe(300)
  })

  test('nested loops — outer × inner', () => {
    // Inner loop: inner_header ↔ inner_body (5 cmds/iter, 10 iters)
    const innerHeader = mkFn('inner__header', [
      { kind: 'call_if_matches', fn: `${NS}:inner__body`, slot: slot('$j'), range: '..9' },
    ])
    const innerBody = mkFn('inner__body', [
      { kind: 'score_set', dst: slot('$a'), value: 1 },
      { kind: 'score_set', dst: slot('$b'), value: 2 },
      { kind: 'score_add', dst: slot('$j'), src: slot('$one') },
      { kind: 'call', fn: `${NS}:inner__header` },
    ])

    // Outer loop: outer_header ↔ outer_body (calls inner loop + own work)
    const outerHeader = mkFn('outer__header', [
      { kind: 'call_if_matches', fn: `${NS}:outer__body`, slot: slot('$i'), range: '..19' },
    ])
    const outerBody = mkFn('outer__body', [
      { kind: 'score_set', dst: slot('$j'), value: 0 },
      { kind: 'call', fn: `${NS}:inner__header` },
      { kind: 'score_add', dst: slot('$i'), src: slot('$one') },
      { kind: 'call', fn: `${NS}:outer__header` },
    ])

    const mod = mkModule([innerHeader, innerBody, outerHeader, outerBody])

    // Inner cycle: header(1) + body(4) = 5 cmds × 10 iters = 50
    // Outer cycle local: header(1) + body(4) = 5 cmds
    // Outer cycle external callee: inner = 50
    // Outer total: (5 + 50) × 20 = 1100
    expect(estimateCommandCount('outer__header', mod)).toBe(1100)
  })

  test('external call (not in module) contributes 0', () => {
    const fn = mkFn('main', [
      { kind: 'score_set', dst: slot('$x'), value: 0 },
      { kind: 'call', fn: 'other_ns:external_fn' },
    ])
    const mod = mkModule([fn])
    expect(estimateCommandCount('main', mod)).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// Unit tests: analyzeBudget
// ---------------------------------------------------------------------------

describe('analyzeBudget', () => {
  test('small loop (100 iters × 5 cmds = 500) → no diagnostic', () => {
    const header = mkFn('process', [
      { kind: 'call_if_matches', fn: `${NS}:process__body`, slot: slot('$i'), range: '..99' },
    ])
    const body = mkFn('process__body', [
      { kind: 'score_set', dst: slot('$a'), value: 1 },
      { kind: 'score_set', dst: slot('$b'), value: 2 },
      { kind: 'score_add', dst: slot('$c'), src: slot('$a') },
      { kind: 'call', fn: `${NS}:process` },
    ])
    const mod = mkModule([header, body])
    const diags = analyzeBudget(mod)
    expect(diags).toEqual([])
  })

  test('medium loop (1000 iters × 50 cmds = 50000) → warning', () => {
    // Build a body with 48 instructions + 1 call back + header 1 = 50 per iter
    const bodyInstrs: LIRInstr[] = []
    for (let i = 0; i < 48; i++) {
      bodyInstrs.push({ kind: 'score_set', dst: slot(`$v${i}`), value: i })
    }
    bodyInstrs.push({ kind: 'call', fn: `${NS}:bigloop` })

    const header = mkFn('bigloop', [
      { kind: 'call_if_matches', fn: `${NS}:bigloop__body`, slot: slot('$i'), range: '..999' },
    ])
    const body = mkFn('bigloop__body', bodyInstrs)
    const mod = mkModule([header, body])
    const diags = analyzeBudget(mod)
    expect(diags).toHaveLength(1)
    expect(diags[0].level).toBe('warning')
    expect(diags[0].fnName).toBe('bigloop')
    expect(diags[0].estimatedCommands).toBe(50000)
    expect(diags[0].message).toContain('consider @coroutine')
  })

  test('large loop (1000 iters × 100 cmds = 100000) → error', () => {
    const bodyInstrs: LIRInstr[] = []
    for (let i = 0; i < 98; i++) {
      bodyInstrs.push({ kind: 'score_set', dst: slot(`$v${i}`), value: i })
    }
    bodyInstrs.push({ kind: 'call', fn: `${NS}:hugeloop` })

    const header = mkFn('hugeloop', [
      { kind: 'call_if_matches', fn: `${NS}:hugeloop__body`, slot: slot('$i'), range: '..999' },
    ])
    const body = mkFn('hugeloop__body', bodyInstrs)
    const mod = mkModule([header, body])
    const diags = analyzeBudget(mod)
    expect(diags).toHaveLength(1)
    expect(diags[0].level).toBe('error')
    expect(diags[0].fnName).toBe('hugeloop')
    expect(diags[0].estimatedCommands).toBe(100000)
  })

  test('@coroutine function is skipped', () => {
    const bodyInstrs: LIRInstr[] = []
    for (let i = 0; i < 98; i++) {
      bodyInstrs.push({ kind: 'score_set', dst: slot(`$v${i}`), value: i })
    }
    bodyInstrs.push({ kind: 'call', fn: `${NS}:bigfn` })

    const header = mkFn('bigfn', [
      { kind: 'call_if_matches', fn: `${NS}:bigfn__body`, slot: slot('$i'), range: '..999' },
    ])
    const body = mkFn('bigfn__body', bodyInstrs)
    const mod = mkModule([header, body])

    const diags = analyzeBudget(mod, new Set(['bigfn']))
    expect(diags).toEqual([])
  })

  test('compiler-generated __helper functions are skipped', () => {
    // Only top-level user functions are analyzed; __body etc are internal
    const bodyInstrs: LIRInstr[] = []
    for (let i = 0; i < 98; i++) {
      bodyInstrs.push({ kind: 'score_set', dst: slot(`$v${i}`), value: i })
    }
    bodyInstrs.push({ kind: 'call', fn: `${NS}:fn__header` })

    // Only fn__header and fn__body exist — both have __ so both skipped
    const header = mkFn('fn__header', [
      { kind: 'call_if_matches', fn: `${NS}:fn__body`, slot: slot('$i'), range: '..999' },
    ])
    const body = mkFn('fn__body', bodyInstrs)
    const mod = mkModule([header, body])
    const diags = analyzeBudget(mod)
    expect(diags).toEqual([])
  })

  test('nested loop estimation is correct', () => {
    // Inner: 5 cmds × 10 iters = 50
    const innerHeader = mkFn('run__inner_header', [
      { kind: 'call_if_matches', fn: `${NS}:run__inner_body`, slot: slot('$j'), range: '..9' },
    ])
    const innerBody = mkFn('run__inner_body', [
      { kind: 'score_set', dst: slot('$a'), value: 1 },
      { kind: 'score_set', dst: slot('$b'), value: 2 },
      { kind: 'score_add', dst: slot('$c'), src: slot('$a') },
      { kind: 'call', fn: `${NS}:run__inner_header` },
    ])

    // Outer: (5 + inner=50) × 20 = 1100
    const outerHeader = mkFn('run__outer_header', [
      { kind: 'call_if_matches', fn: `${NS}:run__outer_body`, slot: slot('$i'), range: '..19' },
    ])
    const outerBody = mkFn('run__outer_body', [
      { kind: 'score_set', dst: slot('$j'), value: 0 },
      { kind: 'call', fn: `${NS}:run__inner_header` },
      { kind: 'score_add', dst: slot('$i'), src: slot('$one') },
      { kind: 'call', fn: `${NS}:run__outer_header` },
    ])

    // The "root" user function that sets up the outer loop
    const run = mkFn('run', [
      { kind: 'score_set', dst: slot('$i'), value: 0 },
      { kind: 'call', fn: `${NS}:run__outer_header` },
    ])

    const mod = mkModule([run, innerHeader, innerBody, outerHeader, outerBody])
    const estimate = estimateCommandCount('run', mod)
    // run: 2 local + outer(1100) = 1102
    expect(estimate).toBe(1102)
  })
})

// ---------------------------------------------------------------------------
// E2E: compile pipeline integration
// ---------------------------------------------------------------------------

describe('budget analysis — compile pipeline integration', () => {
  test('small loop produces no warning', () => {
    const source = `
      fn process(): void {
        let i: int = 0;
        while (i < 10) {
          let x: int = i * 2;
          i = i + 1;
        }
      }
    `
    const result = compile(source, { namespace: 'budgettest' })
    expect(result.warnings).toEqual([])
  })

  test('@coroutine function skips budget check', () => {
    const source = `
      @coroutine(batch=5)
      fn process_all(): void {
        let i: int = 0;
        while (i < 10000) {
          let x: int = i * 2;
          i = i + 1;
        }
      }
    `
    // Should not throw even with huge loop — @coroutine exempts it
    const result = compile(source, { namespace: 'budgettest' })
    // No budget error/warning for coroutine functions
    const budgetWarnings = result.warnings.filter(w => w.includes('tick budget'))
    expect(budgetWarnings).toEqual([])
  })
})
