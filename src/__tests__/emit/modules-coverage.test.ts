/**
 * Additional coverage for src/emit/modules.ts
 *
 * Targets:
 * - compileModules with 0 modules (throws)
 * - declared module name mismatch (throws)
 * - wildcard import (*)
 * - import from non-existent module (throws)
 * - import symbol not exported (throws)
 * - circular import detection
 * - cross-module DCE (library function pruned when not reachable)
 * - named module load tag rename
 * - multiple modules merging tick/load tags
 */

import { compileModules } from '../../emit/modules'

function getFile(files: { path: string; content: string }[], pathSubstr: string) {
  return files.find(f => f.path.includes(pathSubstr))
}

describe('compileModules — error paths', () => {
  test('throws when no modules provided', () => {
    expect(() => compileModules([])).toThrow()
  })

  test('throws when declared module name mismatches registered name', () => {
    expect(() => compileModules([
      { name: 'wrong', source: 'module actual; export fn foo(): int { return 1; }' },
    ])).toThrow(/declares name/)
  })

  test('throws when importing non-existent module', () => {
    expect(() => compileModules([
      { name: 'main', source: 'import nonexistent::foo; fn bar(): int { return foo(); }' },
    ])).toThrow(/not found/)
  })

  test('throws when importing unexported symbol', () => {
    expect(() => compileModules([
      {
        name: 'lib',
        source: 'module lib; fn private_fn(): int { return 0; }',
      },
      {
        name: 'main',
        source: 'import lib::private_fn; fn main(): int { return private_fn(); }',
      },
    ])).toThrow(/does not export/)
  })

  test('throws on circular imports', () => {
    expect(() => compileModules([
      { name: 'a', source: 'module a; import b::bar; export fn foo(): int { return bar(); }' },
      { name: 'b', source: 'module b; import a::foo; export fn bar(): int { return foo(); }' },
    ])).toThrow(/Circular/)
  })
})

describe('compileModules — wildcard import (*)', () => {
  test('wildcard import brings in all exports', () => {
    const result = compileModules([
      {
        name: 'math',
        source: `
          module math;
          export fn double(n: int): int { return n * 2; }
          export fn triple(n: int): int { return n * 3; }
        `,
      },
      {
        name: 'main',
        source: `
          import math::*;
          fn calc(): int {
            let a: int = double(3);
            let b: int = triple(2);
            return a + b;
          }
        `,
      },
    ], { namespace: 'wildcard' })

    expect(result.files.length).toBeGreaterThan(0)
    const calc = getFile(result.files, 'calc.mcfunction')
    expect(calc).toBeDefined()
    expect(calc!.content).toContain('function wildcard:math/double')
  })
})

describe('compileModules — load/tick tag merging', () => {
  test('multiple modules with @load merge tags', () => {
    const result = compileModules([
      {
        name: 'a',
        source: `
          module a;
          @load fn init_a() {}
        `,
      },
      {
        name: 'b',
        source: `
          module b;
          @load fn init_b() {}
        `,
      },
    ], { namespace: 'multimod' })

    const loadJson = getFile(result.files, 'load.json')
    expect(loadJson).toBeDefined()
    const parsed = JSON.parse(loadJson!.content) as { values: string[] }
    expect(parsed.values.length).toBeGreaterThanOrEqual(2)
  })

  test('multiple modules with @tick merge tags', () => {
    const result = compileModules([
      {
        name: 'a',
        source: `
          module a;
          @tick fn loop_a() {}
        `,
      },
      {
        name: 'b',
        source: `
          module b;
          @tick fn loop_b() {}
        `,
      },
    ], { namespace: 'tickmod' })

    const tickJson = getFile(result.files, 'tick.json')
    expect(tickJson).toBeDefined()
    const parsed = JSON.parse(tickJson!.content) as { values: string[] }
    expect(parsed.values.length).toBeGreaterThanOrEqual(2)
  })

  test('named module load path renamed to avoid collision', () => {
    const result = compileModules([
      {
        name: 'mymod',
        source: `
          module mymod;
          @load fn init() {}
          export fn helper(): int { return 42; }
        `,
      },
    ], { namespace: 'loadtest' })

    // The load function should be at mymod/_load.mcfunction, not load.mcfunction
    const loadFile = getFile(result.files, 'mymod/_load')
    expect(loadFile).toBeDefined()

    // load.json should reference the renamed path
    const loadJson = getFile(result.files, 'load.json')
    expect(loadJson).toBeDefined()
    const parsed = JSON.parse(loadJson!.content) as { values: string[] }
    expect(parsed.values.some(v => v.includes('mymod/_load'))).toBe(true)
  })
})

describe('compileModules — cross-module DCE', () => {
  test('exported but unimported functions are DCE-pruned', () => {
    const result = compileModules([
      {
        name: 'lib',
        source: `
          module lib;
          export fn used(): int { return 1; }
          export fn never_used(): int { return 999; }
        `,
      },
      {
        name: 'main',
        source: `
          import lib::used;
          fn entry(): int { return used(); }
        `,
      },
    ], { namespace: 'dce' })

    const paths = result.files.map(f => f.path)
    // 'used' should be in output
    expect(paths.some(p => p.includes('lib/used'))).toBe(true)
    // 'never_used' should be pruned (DCE)
    expect(paths.some(p => p.includes('lib/never_used'))).toBe(false)
  })

  test('exported function reachable via calls is kept', () => {
    const result = compileModules([
      {
        name: 'lib',
        source: `
          module lib;
          export fn a(): int { return b(); }
          export fn b(): int { return 42; }
        `,
      },
      {
        name: 'main',
        source: `
          import lib::a;
          fn entry(): int { return a(); }
        `,
      },
    ], { namespace: 'dce2' })

    const paths = result.files.map(f => f.path)
    // a should be present (it's imported)
    expect(paths.some(p => p.includes('lib/a'))).toBe(true)
    // entry should also be present
    expect(paths.some(p => p.includes('entry'))).toBe(true)
  })
})

describe('compileModules — single anonymous module', () => {
  test('compiles a single module without module declaration', () => {
    const result = compileModules([
      {
        name: 'standalone',
        source: `
          fn hello(): int { return 42; }
        `,
      },
    ], { namespace: 'sa' })

    expect(result.files.length).toBeGreaterThan(0)
    const hello = getFile(result.files, 'hello.mcfunction')
    expect(hello).toBeDefined()
  })

  test('uses default namespace when none specified', () => {
    const result = compileModules([
      { name: 'mod', source: 'fn f(): int { return 0; }' },
    ])
    // Default namespace is 'redscript'
    expect(result.files.some(f => f.path.includes('redscript'))).toBe(true)
  })
})
