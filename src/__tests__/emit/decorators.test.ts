import { emit } from '../../emit'
import type { DatapackFile } from '../../emit'
import type { LIRFunction, LIRInstr, LIRModule } from '../../lir/types'

function getFile(files: DatapackFile[], path: string): string {
  const file = files.find(entry => entry.path === path)
  if (!file) {
    throw new Error(`Missing file: ${path}\nFiles:\n${files.map(entry => entry.path).join('\n')}`)
  }
  return file.content
}

function makeFn(name: string, instructions: LIRInstr[]): LIRFunction {
  return { name, isMacro: false, macroParams: [], instructions }
}

function baseModule(fns: LIRFunction[]): LIRModule {
  return { namespace: 'test', objective: '__test', functions: fns }
}

// ---------------------------------------------------------------------------
// @retry
// ---------------------------------------------------------------------------

describe('@retry decorator code generation', () => {
  test('max=1: dispatcher calls function once and resets counter on success', () => {
    const fn = makeFn('try_once', [
      { kind: 'score_set', dst: { player: '$ret', obj: '__test' }, value: 1 },
    ])
    const files = emit(baseModule([fn]), {
      namespace: 'test',
      retryFunctions: [{ name: 'try_once', max: 1 }],
    })

    const dispatcher = getFile(files, 'data/test/function/__retry_try_once.mcfunction')
    // Only fires when counter >= 1
    expect(dispatcher).toContain('execute if score __retry_try_once __retry matches 1.. run function test:try_once')
    // On failure ($ret == 0): decrement counter
    expect(dispatcher).toContain(
      'execute if score __retry_try_once __retry matches 1.. if score $ret __retry matches 0 run scoreboard players remove __retry_try_once __retry 1',
    )
    // On success ($ret != 0): reset counter to 0 (stops retrying)
    expect(dispatcher).toContain(
      'execute if score __retry_try_once __retry matches 1.. unless score $ret __retry matches 0 run scoreboard players set __retry_try_once __retry 0',
    )

    // Start file initialises counter to max (1)
    const start = getFile(files, 'data/test/function/try_once_start.mcfunction')
    expect(start).toBe('scoreboard players set __retry_try_once __retry 1\n')
  })

  test('max=3: start file sets counter to 3', () => {
    const fn = makeFn('retry_action', [])
    const files = emit(baseModule([fn]), {
      namespace: 'test',
      retryFunctions: [{ name: 'retry_action', max: 3 }],
    })

    const start = getFile(files, 'data/test/function/retry_action_start.mcfunction')
    expect(start).toBe('scoreboard players set __retry_retry_action __retry 3\n')
  })

  test('dispatcher is registered as a tick function', () => {
    const fn = makeFn('retry_fn', [])
    const files = emit(baseModule([fn]), {
      namespace: 'test',
      retryFunctions: [{ name: 'retry_fn', max: 2 }],
    })

    const tick = JSON.parse(getFile(files, 'data/minecraft/tags/function/tick.json'))
    expect(tick.values).toContain('test:__retry_retry_fn')
  })

  test('state machine: failure path decrements, success path zeroes — both branches present', () => {
    // This verifies the two-branch state machine logic that drives retry across ticks.
    // Failure branch: counter > 0, $ret == 0 → decrement (so next tick retries again)
    // Success branch: counter > 0, $ret != 0 → set to 0 (halts retries)
    const fn = makeFn('flaky', [])
    const files = emit(baseModule([fn]), {
      namespace: 'test',
      retryFunctions: [{ name: 'flaky', max: 5 }],
    })

    const dispatcher = getFile(files, 'data/test/function/__retry_flaky.mcfunction')
    const lines = dispatcher.split('\n').filter(Boolean)

    // Exactly three lines: call, failure-decrement, success-reset
    expect(lines).toHaveLength(3)

    const [callLine, failLine, successLine] = lines
    expect(callLine).toMatch(/^execute if score __retry_flaky __retry matches 1\.\. run function test:flaky$/)
    expect(failLine).toMatch(/if score \$ret __retry matches 0 run scoreboard players remove __retry_flaky __retry 1$/)
    expect(successLine).toMatch(/unless score \$ret __retry matches 0 run scoreboard players set __retry_flaky __retry 0$/)

    // Both branches are guarded by the same counter check
    expect(failLine).toContain('execute if score __retry_flaky __retry matches 1..')
    expect(successLine).toContain('execute if score __retry_flaky __retry matches 1..')
  })

  test('load.mcfunction adds __retry objective', () => {
    const fn = makeFn('net_call', [])
    const files = emit(baseModule([fn]), {
      namespace: 'test',
      retryFunctions: [{ name: 'net_call', max: 2 }],
    })

    const load = getFile(files, 'data/test/function/load.mcfunction')
    expect(load).toContain('scoreboard objectives add __retry dummy')
  })

  test('multiple retry functions each get independent counters and dispatchers', () => {
    const fn1 = makeFn('task_a', [])
    const fn2 = makeFn('task_b', [])
    const files = emit(baseModule([fn1, fn2]), {
      namespace: 'test',
      retryFunctions: [
        { name: 'task_a', max: 2 },
        { name: 'task_b', max: 4 },
      ],
    })

    const dispA = getFile(files, 'data/test/function/__retry_task_a.mcfunction')
    const dispB = getFile(files, 'data/test/function/__retry_task_b.mcfunction')
    expect(dispA).toContain('__retry_task_a')
    expect(dispA).not.toContain('task_b')
    expect(dispB).toContain('__retry_task_b')
    expect(dispB).not.toContain('task_a')

    expect(getFile(files, 'data/test/function/task_a_start.mcfunction')).toBe(
      'scoreboard players set __retry_task_a __retry 2\n',
    )
    expect(getFile(files, 'data/test/function/task_b_start.mcfunction')).toBe(
      'scoreboard players set __retry_task_b __retry 4\n',
    )

    const tick = JSON.parse(getFile(files, 'data/minecraft/tags/function/tick.json'))
    expect(tick.values).toContain('test:__retry_task_a')
    expect(tick.values).toContain('test:__retry_task_b')
  })
})

// ---------------------------------------------------------------------------
// @memoize
// ---------------------------------------------------------------------------

describe('@memoize decorator code generation', () => {
  test('cache-hit path: copies cached value and returns early', () => {
    // The impl function is already compiled as <name>_impl; the wrapper is <name>.
    const impl = makeFn('square_impl', [
      { kind: 'score_copy', dst: { player: '$ret', obj: '__test' }, src: { player: '$p0', obj: '__test' } },
    ])
    const files = emit(baseModule([impl]), {
      namespace: 'test',
      memoizeFunctions: ['square'],
    })

    const wrapper = getFile(files, 'data/test/function/square.mcfunction')
    // Cache-hit guard: hit flag == 1 AND stored key matches current arg
    expect(wrapper).toContain('execute if score __memo_square_hit __memo matches 1 if score __memo_square_key __memo = $p0 __test run scoreboard players operation $ret __test = __memo_square_val __memo')
    // Early return on hit
    expect(wrapper).toContain('execute if score __memo_square_hit __memo matches 1 if score __memo_square_key __memo = $p0 __test run return 0')
  })

  test('cache-miss path: calls impl, stores key/val/hit', () => {
    const impl = makeFn('square_impl', [])
    const files = emit(baseModule([impl]), {
      namespace: 'test',
      memoizeFunctions: ['square'],
    })

    const wrapper = getFile(files, 'data/test/function/square.mcfunction')
    // Falls through to impl call
    expect(wrapper).toContain('function test:square_impl')
    // Stores new key
    expect(wrapper).toContain('scoreboard players operation __memo_square_key __memo = $p0 __test')
    // Stores new value
    expect(wrapper).toContain('scoreboard players operation __memo_square_val __memo = $ret __test')
    // Marks cache valid
    expect(wrapper).toContain('scoreboard players set __memo_square_hit __memo 1')
  })

  test('wrapper contains identifying comment', () => {
    const impl = makeFn('fib_impl', [])
    const files = emit(baseModule([impl]), {
      namespace: 'test',
      memoizeFunctions: ['fib'],
    })

    const wrapper = getFile(files, 'data/test/function/fib.mcfunction')
    expect(wrapper).toContain('# @memoize wrapper for fib (LRU-1 cache)')
  })

  test('cache-miss stores result after impl, so stale key from previous call is overwritten', () => {
    // Verifies that the store operations come *after* the function call (miss path
    // can't cache before impl has run).
    const impl = makeFn('abs_impl', [])
    const files = emit(baseModule([impl]), {
      namespace: 'test',
      memoizeFunctions: ['abs'],
    })

    const wrapper = getFile(files, 'data/test/function/abs.mcfunction')
    const lines = wrapper.split('\n').filter(Boolean)
    const callIdx = lines.findIndex(l => l === 'function test:abs_impl')
    // The unconditional store lines (miss path) must come after the impl call
    const storeKeyIdx = lines.findIndex((l, i) => i > callIdx && l.includes('__memo_abs_key __memo = $p0'))
    const storeValIdx = lines.findIndex((l, i) => i > callIdx && l.includes('__memo_abs_val __memo = $ret'))
    const setHitIdx = lines.findIndex(l => l === 'scoreboard players set __memo_abs_hit __memo 1')

    expect(callIdx).toBeGreaterThanOrEqual(0)
    expect(storeKeyIdx).toBeGreaterThan(callIdx)
    expect(storeValIdx).toBeGreaterThan(callIdx)
    expect(setHitIdx).toBeGreaterThan(callIdx)
  })

  test('load.mcfunction adds __memo objective', () => {
    const impl = makeFn('add_impl', [])
    const files = emit(baseModule([impl]), {
      namespace: 'test',
      memoizeFunctions: ['add'],
    })

    const load = getFile(files, 'data/test/function/load.mcfunction')
    expect(load).toContain('scoreboard objectives add __memo dummy')
  })

  test('__memo objective is not added when no memoize functions present', () => {
    const fn = makeFn('plain', [])
    const files = emit(baseModule([fn]), { namespace: 'test' })

    const load = getFile(files, 'data/test/function/load.mcfunction')
    expect(load).not.toContain('__memo')
  })
})

// ---------------------------------------------------------------------------
// @throttle
// ---------------------------------------------------------------------------

describe('@throttle decorator code generation', () => {
  test('cooldown objective prevents re-execution within ticks window', () => {
    // The dispatcher increments a counter each tick.
    // Only when counter >= ticks does it fire the inner function and reset.
    const fn = makeFn('heavy_fn', [])
    const files = emit(baseModule([fn]), {
      namespace: 'test',
      throttleFunctions: [{ name: 'heavy_fn', ticks: 10 }],
    })

    const dispatcher = getFile(files, 'data/test/function/__throttle_heavy_fn.mcfunction')
    // Counter increments every tick regardless
    expect(dispatcher).toContain('scoreboard players add __throttle_heavy_fn __throttle 1')
    // Only fires when cooldown elapsed
    expect(dispatcher).toContain('execute if score __throttle_heavy_fn __throttle matches 10.. run function test:heavy_fn_inner')
    // Resets counter so cooldown restarts
    expect(dispatcher).toContain('execute if score __throttle_heavy_fn __throttle matches 10.. run scoreboard players set __throttle_heavy_fn __throttle 0')
  })

  test('ticks=1: fires on every tick (minimum cooldown)', () => {
    const fn = makeFn('per_tick', [])
    const files = emit(baseModule([fn]), {
      namespace: 'test',
      throttleFunctions: [{ name: 'per_tick', ticks: 1 }],
    })

    const dispatcher = getFile(files, 'data/test/function/__throttle_per_tick.mcfunction')
    expect(dispatcher).toContain('matches 1.. run function test:per_tick_inner')
  })

  test('inner wrapper delegates to the original function', () => {
    const fn = makeFn('guarded', [])
    const files = emit(baseModule([fn]), {
      namespace: 'test',
      throttleFunctions: [{ name: 'guarded', ticks: 5 }],
    })

    const inner = getFile(files, 'data/test/function/guarded_inner.mcfunction')
    expect(inner).toBe('function test:guarded\n')
  })

  test('dispatcher is registered as a tick function', () => {
    const fn = makeFn('slow', [])
    const files = emit(baseModule([fn]), {
      namespace: 'test',
      throttleFunctions: [{ name: 'slow', ticks: 20 }],
    })

    const tick = JSON.parse(getFile(files, 'data/minecraft/tags/function/tick.json'))
    expect(tick.values).toContain('test:__throttle_slow')
  })

  test('load.mcfunction adds __throttle objective', () => {
    const fn = makeFn('slow2', [])
    const files = emit(baseModule([fn]), {
      namespace: 'test',
      throttleFunctions: [{ name: 'slow2', ticks: 5 }],
    })

    const load = getFile(files, 'data/test/function/load.mcfunction')
    expect(load).toContain('scoreboard objectives add __throttle dummy')
  })

  test('reset happens only when threshold is met, not before', () => {
    // Verifies the counter never resets at ticks-1 (off-by-one check).
    const fn = makeFn('infrequent', [])
    const files = emit(baseModule([fn]), {
      namespace: 'test',
      throttleFunctions: [{ name: 'infrequent', ticks: 7 }],
    })

    const dispatcher = getFile(files, 'data/test/function/__throttle_infrequent.mcfunction')
    // Should NOT contain a threshold of 6 (one less than configured)
    expect(dispatcher).not.toContain('matches 6..')
    expect(dispatcher).toContain('matches 7..')
  })
})
