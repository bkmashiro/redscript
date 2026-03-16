/**
 * Tests for @schedule decorator (Phase 5c)
 *
 * @schedule(ticks=N) generates a _schedule_xxx.mcfunction wrapper that
 * emits `schedule function ns:xxx Nt`.
 */

import { compile } from '../emit/compile'

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  const f = files.find(f => f.path.includes(pathSubstr))
  return f?.content
}

describe('@schedule decorator', () => {
  test('@schedule(ticks=20) generates _schedule wrapper with 20t', () => {
    const source = `
      @schedule(ticks=20)
      fn after_one_second(): void {
        say("One second passed!");
      }
    `
    const result = compile(source, { namespace: 'test' })
    const wrapper = getFile(result.files, '_schedule_after_one_second.mcfunction')
    expect(wrapper).toBeDefined()
    expect(wrapper).toBe('schedule function test:after_one_second 20t\n')
  })

  test('@schedule(ticks=1) generates _schedule wrapper with 1t', () => {
    const source = `
      @schedule(ticks=1)
      fn next_tick(): void {
        say("next tick!");
      }
    `
    const result = compile(source, { namespace: 'ns' })
    const wrapper = getFile(result.files, '_schedule_next_tick.mcfunction')
    expect(wrapper).toBeDefined()
    expect(wrapper).toBe('schedule function ns:next_tick 1t\n')
  })

  test('@schedule does not affect tick.json', () => {
    const source = `
      @schedule(ticks=20)
      fn deferred(): void {
        say("deferred");
      }
    `
    const result = compile(source, { namespace: 'test' })
    const tickJson = getFile(result.files, 'tick.json')
    expect(tickJson).toBeUndefined()
  })

  test('@schedule coexists with @tick and @load', () => {
    const source = `
      @tick
      fn game_tick(): void {
        let x: int = 1;
      }

      @load
      fn init(): void {
        let y: int = 0;
      }

      @schedule(ticks=40)
      fn two_seconds(): void {
        say("two seconds!");
      }
    `
    const result = compile(source, { namespace: 'combo' })

    // @tick still works
    const tickJson = getFile(result.files, 'tick.json')
    expect(tickJson).toBeDefined()
    expect(JSON.parse(tickJson!).values).toContain('combo:game_tick')

    // @load still works
    const loadJson = getFile(result.files, 'load.json')
    expect(loadJson).toBeDefined()
    expect(JSON.parse(loadJson!).values).toContain('combo:init')

    // @schedule generates wrapper
    const wrapper = getFile(result.files, '_schedule_two_seconds.mcfunction')
    expect(wrapper).toBeDefined()
    expect(wrapper).toBe('schedule function combo:two_seconds 40t\n')
  })

  test('calling _schedule_xxx() invokes the schedule wrapper', () => {
    const source = `
      @schedule(ticks=20)
      fn after_one_second(): void {
        say("delayed");
      }

      fn start(): void {
        _schedule_after_one_second();
      }
    `
    const result = compile(source, { namespace: 'test' })
    const startFn = getFile(result.files, 'start.mcfunction')
    expect(startFn).toBeDefined()
    expect(startFn).toContain('function test:_schedule_after_one_second')
  })
})

describe('setTimeout / setInterval codegen', () => {
  test('setTimeout lifts lambda to __timeout_callback_0 and schedules it', () => {
    const source = `
      fn start() {
        setTimeout(20, () => {
          say("later");
        });
      }
    `
    const result = compile(source, { namespace: 'ns' })
    const startFn = getFile(result.files, 'start.mcfunction')
    const cbFn = getFile(result.files, '__timeout_callback_0.mcfunction')
    expect(startFn).toContain('schedule function ns:__timeout_callback_0 20t')
    expect(cbFn).toBeDefined()
    expect(cbFn).toContain('say later')
  })

  test('setInterval lambda reschedules itself at the end', () => {
    const source = `
      fn start() {
        setInterval(10, () => {
          say("tick");
        });
      }
    `
    const result = compile(source, { namespace: 'ns' })
    const cbFn = getFile(result.files, '__timeout_callback_0.mcfunction')
    expect(cbFn).toBeDefined()
    expect(cbFn).toContain('schedule function ns:__timeout_callback_0 10t')
  })

  test('multiple setTimeout calls get unique callback names', () => {
    const source = `
      fn start() {
        setTimeout(10, () => { say("a"); });
        setTimeout(20, () => { say("b"); });
      }
    `
    const result = compile(source, { namespace: 'ns' })
    const cb0 = getFile(result.files, '__timeout_callback_0.mcfunction')
    const cb1 = getFile(result.files, '__timeout_callback_1.mcfunction')
    expect(cb0).toBeDefined()
    expect(cb1).toBeDefined()
    expect(cb0).toContain('say a')
    expect(cb1).toContain('say b')
  })
})

const TIMER_STRUCT = `
struct Timer {
    _id: int,
    _duration: int
}
impl Timer {
    fn new(duration: int) -> Timer {
        return { _id: 0, _duration: duration };
    }
    fn start(self) {}
    fn pause(self) {}
    fn reset(self) {}
    fn tick(self) {}
    fn done(self) -> bool { return false; }
    fn elapsed(self) -> int { return 0; }
}
`

describe('Timer static allocation codegen', () => {
  test('Timer::new() initializes unique scoreboard slots', () => {
    const source = TIMER_STRUCT + `
fn init() {
    let t: Timer = Timer::new(20);
}
`
    const result = compile(source, { namespace: 'ns' })
    const initFn = getFile(result.files, 'init.mcfunction')
    expect(initFn).toContain('scoreboard players set __timer_0_ticks ns 0')
    expect(initFn).toContain('scoreboard players set __timer_0_active ns 0')
  })

  test('Timer.start() inlines to scoreboard set active=1', () => {
    const source = TIMER_STRUCT + `
fn init() {
    let t: Timer = Timer::new(20);
    t.start();
}
`
    const result = compile(source, { namespace: 'ns' })
    const initFn = getFile(result.files, 'init.mcfunction')
    expect(initFn).toContain('scoreboard players set __timer_0_active ns 1')
    expect(initFn).not.toContain('function ns:timer/start')
  })

  test('two Timer::new() calls get distinct IDs', () => {
    const source = TIMER_STRUCT + `
fn init() {
    let t0: Timer = Timer::new(10);
    let t1: Timer = Timer::new(20);
    t0.start();
    t1.start();
}
`
    const result = compile(source, { namespace: 'ns' })
    const initFn = getFile(result.files, 'init.mcfunction')
    // Both timers initialized
    expect(initFn).toContain('__timer_0_ticks')
    expect(initFn).toContain('__timer_1_ticks')
    // Both started with unique slot names
    expect(initFn).toContain('scoreboard players set __timer_0_active ns 1')
    expect(initFn).toContain('scoreboard players set __timer_1_active ns 1')
  })
})
