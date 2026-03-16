/**
 * End-to-end tests for @coroutine decorator.
 *
 * Compiles RedScript with @coroutine through the full pipeline and
 * verifies generated .mcfunction output and tick.json registration.
 */

import { compile } from '../../emit/compile'

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  const f = files.find(f => f.path.includes(pathSubstr))
  return f?.content
}

function getFileNames(files: { path: string; content: string }[]): string[] {
  return files.map(f => f.path)
}

describe('e2e: @coroutine', () => {
  test('@coroutine loop function generates dispatcher in tick.json', () => {
    const source = `
      @coroutine(batch=10)
      fn process_all(): void {
        let i: int = 0;
        while (i < 100) {
          let x: int = i * 2;
          i = i + 1;
        }
      }
    `
    const result = compile(source, { namespace: 'corotest' })
    const tickJson = getFile(result.files, 'tick.json')
    expect(tickJson).toBeDefined()
    const parsed = JSON.parse(tickJson!)
    // The generated tick dispatcher should be registered
    const hasCoroTick = parsed.values.some((v: string) => v.includes('_coro_'))
    expect(hasCoroTick).toBe(true)
  })

  test('@coroutine generates continuation mcfunction files', () => {
    const source = `
      @coroutine(batch=5)
      fn heavy_loop(): void {
        let i: int = 0;
        while (i < 1000) {
          let x: int = i + 1;
          i = i + 1;
        }
      }
    `
    const result = compile(source, { namespace: 'corotest' })
    const paths = getFileNames(result.files)

    // Should have at least one continuation function file
    const contFiles = paths.filter(p => p.includes('_coro_') && p.includes('_cont_'))
    expect(contFiles.length).toBeGreaterThanOrEqual(1)

    // Should have a dispatcher tick function file (may include sub-function files)
    const tickFiles = paths.filter(p => p.includes('_coro_') && p.includes('_tick'))
    expect(tickFiles.length).toBeGreaterThanOrEqual(1)
  })

  test('@coroutine with onDone generates call to callback', () => {
    const source = `
      fn after_done(): void {
        let x: int = 42;
      }

      @coroutine(batch=10, onDone=after_done)
      fn process(): void {
        let i: int = 0;
        while (i < 100) {
          let x: int = i;
          i = i + 1;
        }
      }
    `
    const result = compile(source, { namespace: 'corotest' })

    // The continuation files should reference after_done somewhere
    const contFiles = result.files.filter(f => f.path.includes('_coro_') && f.path.includes('_cont_'))
    const allContent = contFiles.map(f => f.content).join('\n')
    expect(allContent).toContain('after_done')
  })

  test('@coroutine function without loops still compiles', () => {
    const source = `
      @coroutine(batch=10)
      fn no_loop(): void {
        let x: int = 1;
        let y: int = x + 2;
      }
    `
    const result = compile(source, { namespace: 'corotest' })
    expect(result.files.length).toBeGreaterThan(0)

    // Should still produce continuation + dispatcher
    const paths = getFileNames(result.files)
    const contFiles = paths.filter(p => p.includes('_coro_'))
    expect(contFiles.length).toBeGreaterThanOrEqual(2) // at least cont + tick
  })

  test('@coroutine preserves non-coroutine functions', () => {
    const source = `
      fn helper(): int {
        return 42;
      }

      @coroutine(batch=10)
      fn process(): void {
        let i: int = 0;
        while (i < 100) {
          let x: int = i;
          i = i + 1;
        }
      }
    `
    const result = compile(source, { namespace: 'corotest' })
    const helperFn = getFile(result.files, 'helper.mcfunction')
    expect(helperFn).toBeDefined()
  })

  test('@coroutine with macro call_macro is skipped with warning', () => {
    // call_macro: a function that has isMacro params will be called via call_macro
    // We simulate this with raw() containing ${var} which generates __raw:\x01 in MIR
    const source = `
      @coroutine(batch=10)
      fn with_macro_raw(): void {
        let i: int = 0;
        while (i < 100) {
          let x: int = i;
          raw("particle minecraft:end_rod ^$\{x} ^0 ^0 0 0 0 0 1 force @a");
          i = i + 1;
        }
      }
    `
    const result = compile(source, { namespace: 'corotest' })
    // Should emit a warning about skipping
    expect(result.warnings.some(w => w.includes('@coroutine cannot be applied') && w.includes('with_macro_raw'))).toBe(true)
    // Should NOT generate continuation files — function kept as-is
    const paths = getFileNames(result.files)
    const contFiles = paths.filter(p => p.includes('_coro_'))
    expect(contFiles.length).toBe(0)
  })

  test('default batch value is 10 when not specified', () => {
    // @coroutine without batch should default to batch=10
    // We test by ensuring compilation succeeds
    const source = `
      @coroutine
      fn process(): void {
        let i: int = 0;
        while (i < 100) {
          let x: int = i;
          i = i + 1;
        }
      }
    `
    const result = compile(source, { namespace: 'corotest' })
    expect(result.files.length).toBeGreaterThan(0)
    const paths = getFileNames(result.files)
    const contFiles = paths.filter(p => p.includes('_coro_'))
    expect(contFiles.length).toBeGreaterThanOrEqual(2)
  })
})
