/**
 * Tests for diagnostic error messages when JSON.parse fails in:
 * - src/emit/modules.ts — mergeTagFile (internal guard)
 * - src/emit/modules.ts — named-module load tag rewrite
 *
 * The tag content in the emit pipeline is always machine-generated, so these
 * are defensive guards. We test them via the internal helpers by re-exporting
 * them in a test-only shim would be invasive; instead we confirm that the
 * public API surfaces clear messages on the paths we can exercise.
 *
 * For the mc-validator constructor we CAN inject malformed JSON directly
 * (see mc-validator-json-parse.test.ts).
 */

import { compileModules } from '../../emit/modules'

// ── named-module load tag rewrite — happy path ────────────────────────────
// Confirms the rewrite path runs without error (the JSON.parse inside it
// operates on internally-generated content so this also indirectly tests
// that the try-catch wrapper does not interfere with the success case).

describe('compileModules — named module load tag rewrite', () => {
  test('single named module with @load emits correctly-rewritten load tag', () => {
    const result = compileModules([
      {
        name: 'mymod',
        source: `
          module mymod;
          @load
          fn on_load(): void { raw("say loaded"); }
        `,
      },
    ], { namespace: 'tns' })

    const loadTag = result.files.find(f => f.path === 'data/minecraft/tags/function/load.json')
    expect(loadTag).toBeDefined()
    const parsed = JSON.parse(loadTag!.content) as { values: string[] }
    // Should reference the renamed _load path, not the plain :load path
    expect(parsed.values.some((v: string) => v.includes('_load'))).toBe(true)
    expect(parsed.values.some((v: string) => v === 'tns:load')).toBe(false)
  })

  test('single named module with @tick does not rewrite tick tag', () => {
    const result = compileModules([
      {
        name: 'ticker',
        source: `
          module ticker;
          @tick
          fn on_tick(): void { raw("say tick"); }
        `,
      },
    ], { namespace: 'tns2' })

    const tickTag = result.files.find(f => f.path === 'data/minecraft/tags/function/tick.json')
    expect(tickTag).toBeDefined()
    // Tick tag should not be rewritten by the load-rename logic
    const parsed = JSON.parse(tickTag!.content) as { values: string[] }
    expect(parsed.values.length).toBeGreaterThan(0)
  })
})

// ── mergeTagFile — multiple modules merging tick/load tags ────────────────

describe('compileModules — tag merging across modules', () => {
  test('two modules each with @tick merge into a single tick.json', () => {
    const result = compileModules([
      {
        name: 'a',
        source: `
          module a;
          @tick
          fn tick_a(): void { raw("say a"); }
        `,
      },
      {
        name: 'b',
        source: `
          module b;
          @tick
          fn tick_b(): void { raw("say b"); }
        `,
      },
    ], { namespace: 'merge' })

    const tickTags = result.files.filter(f => f.path === 'data/minecraft/tags/function/tick.json')
    // Only one tick.json in the output
    expect(tickTags).toHaveLength(1)
    const parsed = JSON.parse(tickTags[0].content) as { values: string[] }
    // Both tick functions are referenced
    expect(parsed.values.length).toBeGreaterThanOrEqual(2)
  })

  test('two modules each with @load merge into a single load.json', () => {
    const result = compileModules([
      {
        name: 'x',
        source: `
          module x;
          @load
          fn load_x(): void { raw("say x"); }
        `,
      },
      {
        name: 'y',
        source: `
          module y;
          @load
          fn load_y(): void { raw("say y"); }
        `,
      },
    ], { namespace: 'mergeload' })

    const loadTags = result.files.filter(f => f.path === 'data/minecraft/tags/function/load.json')
    expect(loadTags).toHaveLength(1)
    const parsed = JSON.parse(loadTags[0].content) as { values: string[] }
    expect(parsed.values.length).toBeGreaterThanOrEqual(2)
  })
})
