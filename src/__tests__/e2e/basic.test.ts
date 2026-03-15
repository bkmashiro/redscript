/**
 * End-to-end tests for the v2 compiler pipeline.
 *
 * These tests compile RedScript source through the full pipeline
 * (Lexer → Parser → HIR → MIR → optimize → LIR → emit) and verify
 * the generated .mcfunction output contains expected MC commands.
 */

import { compile } from '../../emit/compile'

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  const f = files.find(f => f.path.includes(pathSubstr))
  return f?.content
}

describe('e2e: basic compilation', () => {
  test('simple arithmetic function produces scoreboard commands', () => {
    const source = `
      fn add(a: int, b: int): int {
        return a + b;
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.files.length).toBeGreaterThan(0)

    const addFn = getFile(result.files, 'add.mcfunction')
    expect(addFn).toBeDefined()
    expect(addFn).toContain('scoreboard players operation')
    expect(addFn).toContain('__test')
  })

  test('pack.mcmeta is generated with pack_format 26', () => {
    const source = `fn noop(): void {}`
    const result = compile(source, { namespace: 'demo' })
    const meta = getFile(result.files, 'pack.mcmeta')
    expect(meta).toBeDefined()
    const parsed = JSON.parse(meta!)
    expect(parsed.pack.pack_format).toBe(26)
  })

  test('load.mcfunction creates scoreboard objective', () => {
    const source = `fn noop(): void {}`
    const result = compile(source, { namespace: 'mypack' })
    const load = getFile(result.files, 'load.mcfunction')
    expect(load).toBeDefined()
    expect(load).toContain('scoreboard objectives add __mypack dummy')
  })

  test('@tick function appears in tick.json', () => {
    const source = `
      @tick fn game_tick(): void {
        let x: int = 1;
      }
    `
    const result = compile(source, { namespace: 'ticktest' })
    const tickJson = getFile(result.files, 'tick.json')
    expect(tickJson).toBeDefined()
    const parsed = JSON.parse(tickJson!)
    expect(parsed.values).toContain('ticktest:game_tick')
  })

  test('@load function appears in load.json', () => {
    const source = `
      @load fn setup(): void {
        let x: int = 42;
      }
    `
    const result = compile(source, { namespace: 'loadtest' })
    const loadJson = getFile(result.files, 'load.json')
    expect(loadJson).toBeDefined()
    const parsed = JSON.parse(loadJson!)
    expect(parsed.values).toContain('loadtest:setup')
    // load.json should also reference the objective-init load function
    expect(parsed.values).toContain('loadtest:load')
  })

  test('if/else produces conditional call pattern', () => {
    const source = `
      fn check(x: int): int {
        if (x > 0) {
          return 1;
        } else {
          return 0;
        }
      }
    `
    const result = compile(source, { namespace: 'cond' })

    // The main function should contain call_if_matches / call_unless_matches
    const checkFn = getFile(result.files, 'check.mcfunction')
    expect(checkFn).toBeDefined()
    expect(checkFn).toContain('execute if score')
    expect(checkFn).toContain('matches')
    expect(checkFn).toContain('run function')
  })

  test('while loop produces loop structure with recursive call', () => {
    const source = `
      fn count(): void {
        let i: int = 0;
        while (i < 10) {
          i = i + 1;
        }
      }
    `
    const result = compile(source, { namespace: 'loop' })

    // There should be a loop body function that calls itself (or a header)
    const fnFiles = result.files.filter(f => f.path.endsWith('.mcfunction'))
    expect(fnFiles.length).toBeGreaterThan(1) // main + at least one extracted block

    // At least one file should have a conditional call pattern for the loop
    const allContent = fnFiles.map(f => f.content).join('\n')
    expect(allContent).toContain('execute if score')
    expect(allContent).toContain('run function')
  })

  test('function names are lowercased in output paths', () => {
    const source = `fn MyFunc(): void {}`
    const result = compile(source, { namespace: 'ns' })
    const fn = result.files.find(f => f.path.includes('myfunc.mcfunction'))
    expect(fn).toBeDefined()
  })

  test('constant assignment produces score_set', () => {
    const source = `
      fn init(): int {
        let x: int = 42;
        return x;
      }
    `
    const result = compile(source, { namespace: 'cst' })
    const fn = getFile(result.files, 'init.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('scoreboard players set')
    expect(fn).toContain('42')
  })

  test('load.json always includes namespace:load', () => {
    const source = `fn noop(): void {}`
    const result = compile(source, { namespace: 'abc' })
    const loadJson = getFile(result.files, 'load.json')
    expect(loadJson).toBeDefined()
    const parsed = JSON.parse(loadJson!)
    expect(parsed.values).toContain('abc:load')
  })

  test('no tick.json when no @tick functions', () => {
    const source = `fn noop(): void {}`
    const result = compile(source, { namespace: 'notick' })
    const tickJson = getFile(result.files, 'tick.json')
    expect(tickJson).toBeUndefined()
  })
})
