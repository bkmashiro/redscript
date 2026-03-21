/**
 * Tests for the @config decorator — compile-time configuration injection.
 *
 * @config("key", default: value) on a global let variable allows values to be
 * injected at compile time via CompileOptions.config, enabling customizable
 * build-time constants.
 */

import { compile } from '../emit/compile'

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  const f = files.find(f => f.path.includes(pathSubstr))
  return f?.content
}

describe('@config decorator — compile-time configuration injection', () => {
  test('uses default value when no config is provided', () => {
    const source = `
      @config("max_players", default: 20)
      let MAX_PLAYERS: int

      fn get_max(): int {
        return MAX_PLAYERS;
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'get_max.mcfunction')
    expect(fn).toBeDefined()
    // Default value 20 should be used
    expect(fn).toContain('20')
  })

  test('overrides default value with provided config', () => {
    const source = `
      @config("max_players", default: 20)
      let MAX_PLAYERS: int

      fn get_max(): int {
        return MAX_PLAYERS;
      }
    `
    const result = compile(source, { namespace: 'test', config: { max_players: 10 } })
    const fn = getFile(result.files, 'get_max.mcfunction')
    expect(fn).toBeDefined()
    // Config value 10 should be used, not default 20
    expect(fn).toContain('10')
  })

  test('different config values produce different outputs', () => {
    const source = `
      @config("difficulty", default: 1)
      let DIFFICULTY: int

      fn get_difficulty(): int {
        return DIFFICULTY;
      }
    `

    const resultEasy = compile(source, { namespace: 'test', config: { difficulty: 1 } })
    const resultHard = compile(source, { namespace: 'test', config: { difficulty: 5 } })

    const fnEasy = getFile(resultEasy.files, 'get_difficulty.mcfunction')
    const fnHard = getFile(resultHard.files, 'get_difficulty.mcfunction')

    expect(fnEasy).toBeDefined()
    expect(fnHard).toBeDefined()

    // Hard difficulty (5) vs easy (1) — outputs differ
    expect(fnEasy).not.toEqual(fnHard)
    expect(fnEasy).toContain('1')
    expect(fnHard).toContain('5')
  })

  test('multiple @config variables', () => {
    const source = `
      @config("max_players", default: 20)
      let MAX_PLAYERS: int

      @config("difficulty", default: 1)
      let DIFFICULTY: int

      fn get_max(): int {
        return MAX_PLAYERS;
      }

      fn get_diff(): int {
        return DIFFICULTY;
      }
    `
    const result = compile(source, {
      namespace: 'test',
      config: { max_players: 10, difficulty: 3 },
    })

    const maxFn = getFile(result.files, 'get_max.mcfunction')
    const diffFn = getFile(result.files, 'get_diff.mcfunction')

    expect(maxFn).toBeDefined()
    expect(diffFn).toBeDefined()

    // max_players=10 used
    expect(maxFn).toContain('10')
    // difficulty=3 used
    expect(diffFn).toContain('3')
  })

  test('config without default falls back to 0', () => {
    const source = `
      @config("some_value")
      let SOME_VALUE: int

      fn get_val(): int {
        return SOME_VALUE;
      }
    `
    // No config provided, no default — should fall back to 0
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'get_val.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('0')
  })

  test('config value overrides even when default is provided', () => {
    const source = `
      @config("boost", default: 100)
      let BOOST: int

      fn get_boost(): int {
        return BOOST;
      }
    `
    const result = compile(source, { namespace: 'test', config: { boost: 999 } })
    const fn = getFile(result.files, 'get_boost.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('999')
    // Default 100 should NOT appear
    expect(fn).not.toContain('100')
  })

  test('compilation succeeds without errors for @config globals', () => {
    const source = `
      @config("max_players", default: 20)
      let MAX_PLAYERS: int

      @config("difficulty", default: 1)
      let DIFFICULTY: int

      fn spawn_enemies(): void {
        let count: int = 3 * DIFFICULTY;
      }
    `
    // Should compile cleanly with config values
    expect(() =>
      compile(source, { namespace: 'test', config: { max_players: 10, difficulty: 3 } })
    ).not.toThrow()
  })
})
