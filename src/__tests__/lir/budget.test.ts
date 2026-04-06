import {
  analyzeBudget,
  estimateCommandCount,
  BUDGET_WARN_THRESHOLD,
  BUDGET_ERROR_THRESHOLD,
} from '../../lir/budget'
import type { LIRModule, LIRFunction, LIRInstr, Slot } from '../../lir/types'

const OBJ = '__test'
const NS = 'test'

function mkModule(functions: LIRFunction[]): LIRModule {
  return { functions, namespace: NS, objective: OBJ }
}

function mkFn(name: string, instructions: LIRInstr[]): LIRFunction {
  return { name, instructions, isMacro: false, macroParams: [] }
}

function slot(name: string): Slot {
  return { player: `$${name}`, obj: OBJ }
}

function qualify(name: string): string {
  return `${NS}:${name}`
}

// ---------------------------------------------------------------------------
// estimateCommandCount — linear (acyclic) functions
// ---------------------------------------------------------------------------

describe('estimateCommandCount — linear functions', () => {
  test('empty function has 0 cost', () => {
    const mod = mkModule([mkFn('main', [])])
    expect(estimateCommandCount('main', mod)).toBe(0)
  })

  test('counts each instruction as 1 command', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'score_set', dst: slot('x'), value: 1 },
        { kind: 'score_set', dst: slot('y'), value: 2 },
        { kind: 'score_add', dst: slot('x'), src: slot('y') },
      ]),
    ])
    expect(estimateCommandCount('main', mod)).toBe(3)
  })

  test('includes callee cost transitively', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'score_set', dst: slot('x'), value: 0 },
        { kind: 'call', fn: qualify('helper') },
      ]),
      mkFn('helper', [
        { kind: 'raw', cmd: 'say hi' },
        { kind: 'raw', cmd: 'say bye' },
      ]),
    ])
    // main: 2 local + helper: 2 = 4
    expect(estimateCommandCount('main', mod)).toBe(4)
  })

  test('unknown function name returns 0', () => {
    const mod = mkModule([mkFn('main', [])])
    expect(estimateCommandCount('nonexistent', mod)).toBe(0)
  })

  test('calls to external (non-module) functions are excluded', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'call', fn: 'other_ns:external' },
      ]),
    ])
    // external not in module, call instr itself counts as 1
    expect(estimateCommandCount('main', mod)).toBe(1)
  })

  test('store_cmd_to_score counts as 1 command', () => {
    const mod = mkModule([
      mkFn('main', [
        {
          kind: 'store_cmd_to_score',
          dst: slot('r'),
          cmd: { kind: 'call', fn: qualify('helper') },
        },
      ]),
      mkFn('helper', []),
    ])
    // store_cmd_to_score itself = 1; the nested call is inside store, not separately counted
    expect(estimateCommandCount('main', mod)).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// estimateCommandCount — cyclic call graphs (loops)
// ---------------------------------------------------------------------------

describe('estimateCommandCount — loop / SCC detection', () => {
  test('self-recursive function is estimated at DEFAULT_LOOP_ITERATIONS * local cost', () => {
    const DEFAULT_LOOP_ITERATIONS = 100
    const mod = mkModule([
      mkFn('loop', [
        { kind: 'score_set', dst: slot('x'), value: 1 },  // 1 local instr
        { kind: 'call', fn: qualify('loop') },              // self-call
      ]),
    ])
    // SCC = ['loop'], isCyclic = true (self-loop)
    // cycleLocalCost = 2 (score_set + call)
    // iterations = DEFAULT_LOOP_ITERATIONS = 100
    const estimated = estimateCommandCount('loop', mod)
    expect(estimated).toBe(2 * DEFAULT_LOOP_ITERATIONS)
  })

  test('mutual recursion (header ↔ body) is treated as one SCC', () => {
    const DEFAULT_LOOP_ITERATIONS = 100
    const mod = mkModule([
      mkFn('fn__header', [
        { kind: 'score_set', dst: slot('i'), value: 0 },
        { kind: 'call', fn: qualify('fn__body') },
      ]),
      mkFn('fn__body', [
        { kind: 'score_add', dst: slot('i'), src: slot('one') },
        { kind: 'call', fn: qualify('fn__header') },
      ]),
      mkFn('fn', [
        { kind: 'call', fn: qualify('fn__header') },
      ]),
    ])
    // SCC = ['fn__header', 'fn__body'], cycleLocalCost = 4, iterations = 100
    const headerCost = estimateCommandCount('fn__header', mod)
    const bodyCost = estimateCommandCount('fn__body', mod)
    expect(headerCost).toBe(4 * DEFAULT_LOOP_ITERATIONS)
    expect(bodyCost).toBe(4 * DEFAULT_LOOP_ITERATIONS)
  })

  test('loop with call_if_matches uses range upper bound as iteration count', () => {
    const mod = mkModule([
      mkFn('loop', [
        { kind: 'call_if_matches', fn: qualify('loop'), slot: slot('i'), range: '..49' },
      ]),
    ])
    // range '..49' → match[1] = '49' → iterations = 50
    const estimated = estimateCommandCount('loop', mod)
    expect(estimated).toBe(1 * 50)
  })

  test('loop with call_unless_matches falls back to DEFAULT_LOOP_ITERATIONS', () => {
    const DEFAULT_LOOP_ITERATIONS = 100
    const mod = mkModule([
      mkFn('loop', [
        { kind: 'call_unless_matches', fn: qualify('loop'), slot: slot('i'), range: '0' },
      ]),
    ])
    // range '0' has no '..' → estimateLoopIterations returns DEFAULT
    const estimated = estimateCommandCount('loop', mod)
    expect(estimated).toBe(1 * DEFAULT_LOOP_ITERATIONS)
  })

  test('SCC with external callee includes callee cost per iteration', () => {
    const DEFAULT_LOOP_ITERATIONS = 100
    const mod = mkModule([
      mkFn('loop', [
        { kind: 'call', fn: qualify('loop') },
        { kind: 'call', fn: qualify('helper') },
      ]),
      mkFn('helper', [
        { kind: 'raw', cmd: 'say inside' },
        { kind: 'raw', cmd: 'say also' },
      ]),
    ])
    // cycleLocalCost = 2 (loop's own instrs)
    // externalCalleeCost = 2 (helper)
    // total = (2 + 2) * 100 = 400
    const estimated = estimateCommandCount('loop', mod)
    expect(estimated).toBe(4 * DEFAULT_LOOP_ITERATIONS)
  })
})

// ---------------------------------------------------------------------------
// analyzeBudget — threshold diagnostics
// ---------------------------------------------------------------------------

describe('analyzeBudget — thresholds', () => {
  test('no diagnostics for cheap function', () => {
    const mod = mkModule([
      mkFn('main', [
        { kind: 'score_set', dst: slot('x'), value: 1 },
      ]),
    ])
    expect(analyzeBudget(mod)).toEqual([])
  })

  test('warning for function exceeding BUDGET_WARN_THRESHOLD', () => {
    // BUDGET_WARN_THRESHOLD = 32768
    // Each instr = 1 cmd; need a self-loop with enough cost
    // self-loop: cycleLocalCost * 100 > 32768 → cycleLocalCost ≥ 328 instrs
    const instrCount = Math.ceil(BUDGET_WARN_THRESHOLD / 100) + 1 // 329
    const instrs: LIRInstr[] = Array.from({ length: instrCount }, (_, i) => ({
      kind: 'score_set' as const,
      dst: slot(`v${i}`),
      value: i,
    }))
    // Add self-call to create a cycle
    instrs.push({ kind: 'call', fn: qualify('bigloop') })

    const mod = mkModule([mkFn('bigloop', instrs)])
    const diags = analyzeBudget(mod)

    expect(diags.length).toBe(1)
    expect(diags[0].level).toBe('warning')
    expect(diags[0].fnName).toBe('bigloop')
    expect(diags[0].estimatedCommands).toBeGreaterThan(BUDGET_WARN_THRESHOLD)
    expect(diags[0].estimatedCommands).toBeLessThanOrEqual(BUDGET_ERROR_THRESHOLD)
  })

  test('error for function exceeding BUDGET_ERROR_THRESHOLD', () => {
    // BUDGET_ERROR_THRESHOLD = 65536
    // cycleLocalCost * 100 > 65536 → cycleLocalCost ≥ 656 instrs
    const instrCount = Math.ceil(BUDGET_ERROR_THRESHOLD / 100) + 1 // 657
    const instrs: LIRInstr[] = Array.from({ length: instrCount }, (_, i) => ({
      kind: 'score_set' as const,
      dst: slot(`v${i}`),
      value: i,
    }))
    instrs.push({ kind: 'call', fn: qualify('crashloop') })

    const mod = mkModule([mkFn('crashloop', instrs)])
    const diags = analyzeBudget(mod)

    expect(diags.length).toBe(1)
    expect(diags[0].level).toBe('error')
    expect(diags[0].fnName).toBe('crashloop')
    expect(diags[0].estimatedCommands).toBeGreaterThan(BUDGET_ERROR_THRESHOLD)
    expect(diags[0].message).toContain('crash')
  })

  test('skips coroutine-annotated functions', () => {
    const instrCount = Math.ceil(BUDGET_ERROR_THRESHOLD / 100) + 1
    const instrs: LIRInstr[] = Array.from({ length: instrCount }, (_, i) => ({
      kind: 'score_set' as const,
      dst: slot(`v${i}`),
      value: i,
    }))
    instrs.push({ kind: 'call', fn: qualify('coroloop') })

    const mod = mkModule([mkFn('coroloop', instrs)])
    const diags = analyzeBudget(mod, new Set(['coroloop']))
    expect(diags).toEqual([])
  })

  test('skips compiler-generated functions (containing __)', () => {
    const instrCount = Math.ceil(BUDGET_ERROR_THRESHOLD / 100) + 1
    const instrs: LIRInstr[] = Array.from({ length: instrCount }, (_, i) => ({
      kind: 'score_set' as const,
      dst: slot(`v${i}`),
      value: i,
    }))
    instrs.push({ kind: 'call', fn: qualify('fn__blockloop') })

    const mod = mkModule([mkFn('fn__blockloop', instrs)])
    expect(analyzeBudget(mod)).toEqual([])
  })

  test('skips _coro_ prefixed functions', () => {
    const instrCount = Math.ceil(BUDGET_ERROR_THRESHOLD / 100) + 1
    const instrs: LIRInstr[] = Array.from({ length: instrCount }, (_, i) => ({
      kind: 'score_set' as const,
      dst: slot(`v${i}`),
      value: i,
    }))
    instrs.push({ kind: 'call', fn: qualify('_coro_tick') })

    const mod = mkModule([mkFn('_coro_tick', instrs)])
    expect(analyzeBudget(mod)).toEqual([])
  })

  test('returns multiple diagnostics for multiple expensive functions', () => {
    const warnCount = Math.ceil(BUDGET_WARN_THRESHOLD / 100) + 1
    const errorCount = Math.ceil(BUDGET_ERROR_THRESHOLD / 100) + 1

    const makeInstrs = (count: number, selfName: string): LIRInstr[] => [
      ...Array.from({ length: count }, (_, i) => ({
        kind: 'score_set' as const,
        dst: slot(`v${i}`),
        value: i,
      })),
      { kind: 'call' as const, fn: qualify(selfName) },
    ]

    const mod = mkModule([
      mkFn('warnfn', makeInstrs(warnCount, 'warnfn')),
      mkFn('errorfn', makeInstrs(errorCount, 'errorfn')),
    ])

    const diags = analyzeBudget(mod)
    expect(diags).toHaveLength(2)

    const warn = diags.find(d => d.fnName === 'warnfn')
    const error = diags.find(d => d.fnName === 'errorfn')
    expect(warn?.level).toBe('warning')
    expect(error?.level).toBe('error')
  })

  test('empty module produces no diagnostics', () => {
    expect(analyzeBudget(mkModule([]))).toEqual([])
  })
})
