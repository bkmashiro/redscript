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
