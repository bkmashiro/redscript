/**
 * Error-path coverage for src/emit/modules.ts
 *
 * Targets:
 * - Empty modules array (throws)
 * - Module name mismatch (declares vs registered)
 * - Unknown imported module
 * - Exporting non-existent symbol
 * - Circular imports
 * - Wildcard imports (import mod::*)
 */

import { compileModules } from '../../emit/modules'

// ── Error paths ───────────────────────────────────────────────────────────

describe('compileModules — error paths', () => {
  test('throws on empty modules array', () => {
    expect(() => compileModules([])).toThrow()
  })

  test('throws when module declares different name than registered', () => {
    expect(() =>
      compileModules([
        {
          name: 'wrongname',
          source: `
            module actualname;
            fn hello(): int { return 1; }
          `,
        },
      ], { namespace: 'err' })
    ).toThrow(/declares name/)
  })

  test('throws when importing unknown module', () => {
    expect(() =>
      compileModules([
        {
          name: 'main',
          source: `
            import nonexistent::foo;
            fn entry(): int { return 0; }
          `,
        },
      ], { namespace: 'err2' })
    ).toThrow()
  })

  test('throws on circular imports', () => {
    expect(() =>
      compileModules([
        {
          name: 'a',
          source: `
            module a;
            import b::bar;
            export fn foo(): int { return bar(); }
          `,
        },
        {
          name: 'b',
          source: `
            module b;
            import a::foo;
            export fn bar(): int { return foo(); }
          `,
        },
      ], { namespace: 'circ' })
    ).toThrow(/[Cc]ircular/)
  })

  test('throws when importing symbol not exported by module', () => {
    expect(() =>
      compileModules([
        {
          name: 'lib',
          source: `
            module lib;
            fn private_fn(): int { return 99; }
          `,
        },
        {
          name: 'main',
          source: `
            import lib::private_fn;
            fn entry(): int { return private_fn(); }
          `,
        },
      ], { namespace: 'err3' })
    ).toThrow()
  })
})

// ── Wildcard import ────────────────────────────────────────────────────────

describe('compileModules — wildcard imports', () => {
  test('import module::* imports all exported symbols', () => {
    const result = compileModules([
      {
        name: 'utils',
        source: `
          module utils;
          export fn add(a: int, b: int): int { return a + b; }
          export fn sub(a: int, b: int): int { return a - b; }
        `,
      },
      {
        name: 'main',
        source: `
          import utils::*;
          fn entry(): int { return add(1, 2); }
        `,
      },
    ], { namespace: 'wild' })

    expect(result.files.length).toBeGreaterThan(0)
  })
})

// ── Single module without module declaration ───────────────────────────────

describe('compileModules — single module no declaration', () => {
  test('single module with no module keyword compiles', () => {
    const result = compileModules([
      {
        name: 'standalone',
        source: `
          fn greet(): int { return 42; }
        `,
      },
    ], { namespace: 'solo' })

    expect(result.files.length).toBeGreaterThan(0)
    expect(result.warnings).toBeDefined()
  })
})

// ── Multiple modules ────────────────────────────────────────────────────────

describe('compileModules — multi-module compilation', () => {
  test('three module chain: a → b → c', () => {
    const result = compileModules([
      {
        name: 'c',
        source: `
          module c;
          export fn base(): int { return 1; }
        `,
      },
      {
        name: 'b',
        source: `
          module b;
          import c::base;
          export fn mid(): int { return base(); }
        `,
      },
      {
        name: 'main',
        source: `
          import b::mid;
          fn entry(): int { return mid(); }
        `,
      },
    ], { namespace: 'chain' })

    expect(result.files.some(f => f.path.includes('entry'))).toBe(true)
  })

  test('two modules with matching declared names compile fine', () => {
    const result = compileModules([
      {
        name: 'math',
        source: `
          module math;
          export fn square(n: int): int { return n * n; }
        `,
      },
      {
        name: 'app',
        source: `
          module app;
          import math::square;
          fn compute(): int { return square(5); }
        `,
      },
    ], { namespace: 'mathapp' })

    expect(result.files.some(f => f.path.includes('compute') || f.path.includes('square'))).toBe(true)
  })
})
