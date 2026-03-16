/**
 * Phase 5b — Module system tests
 *
 * Tests for `module <name>;`, `export fn`, `import <mod>::<sym>;`, and
 * cross-module function calls with namespace-isolated scoreboards.
 */

import { compileModules } from '../emit/modules'

function getFile(files: { path: string; content: string }[], substr: string): string | undefined {
  return files.find(f => f.path.includes(substr))?.content
}

function getPath(files: { path: string; content: string }[], substr: string): string | undefined {
  return files.find(f => f.path.includes(substr))?.path
}

// ---------------------------------------------------------------------------
// Basic module declaration and export
// ---------------------------------------------------------------------------

describe('module declaration', () => {
  test('module <name>; prefixes function paths with module name', () => {
    const result = compileModules([
      {
        name: 'math',
        source: `
          module math;
          export fn add(a: int, b: int): int { return a + b; }
        `,
      },
    ], { namespace: 'ns' })

    // Function should be emitted under math/add path
    const path = getPath(result.files, 'math/add')
    expect(path).toBeDefined()
    expect(path).toMatch(/math\/add\.mcfunction$/)
  })

  test('non-exported function in module gets no special treatment', () => {
    const result = compileModules([
      {
        name: 'utils',
        source: `
          module utils;
          export fn pub() { say("public"); }
          fn priv() { say("private"); }
        `,
      },
    ], { namespace: 'ns' })

    expect(getFile(result.files, 'utils/pub')).toBeDefined()
    expect(getFile(result.files, 'utils/priv')).toBeDefined()
  })

  test('named module gets per-module scoreboard objective in load file', () => {
    const result = compileModules([
      {
        name: 'math',
        source: `
          module math;
          export fn add(a: int, b: int): int { return a + b; }
        `,
      },
    ], { namespace: 'mypack' })

    // load.mcfunction for named module lives under math/_load.mcfunction
    const loadContent = getFile(result.files, 'math/_load')
    expect(loadContent).toBeDefined()
    // It should create the module-namespaced objective
    expect(loadContent).toContain('scoreboard objectives add __mypack_math dummy')
  })
})

// ---------------------------------------------------------------------------
// Import and cross-module calls
// ---------------------------------------------------------------------------

describe('cross-module imports', () => {
  test('import math::add resolves to math/add function path', () => {
    const result = compileModules([
      {
        name: 'math',
        source: `
          module math;
          export fn add(a: int, b: int): int { return a + b; }
        `,
      },
      {
        name: 'main',
        source: `
          import math::add;
          fn main() { let x: int = add(1, 2); }
        `,
      },
    ], { namespace: 'ns' })

    const mainContent = getFile(result.files, '/main.mcfunction')
    expect(mainContent).toBeDefined()
    // Cross-module call must use the qualified path
    expect(mainContent).toContain('function ns:math/add')
  })

  test('import math::* imports all exports from math', () => {
    const result = compileModules([
      {
        name: 'math',
        source: `
          module math;
          export fn sin(x: int): int { return x; }
          export fn cos(x: int): int { return x; }
        `,
      },
      {
        name: 'main',
        source: `
          import math::*;
          fn main() {
            let a: int = sin(1);
            let b: int = cos(2);
          }
        `,
      },
    ], { namespace: 'ns' })

    const mainContent = getFile(result.files, '/main.mcfunction')
    expect(mainContent).toBeDefined()
    expect(mainContent).toContain('function ns:math/sin')
    expect(mainContent).toContain('function ns:math/cos')
  })

  test('multiple modules importing each other', () => {
    const result = compileModules([
      {
        name: 'vec',
        source: `
          module vec;
          export fn dot(a: int, b: int): int { return a * b; }
        `,
      },
      {
        name: 'physics',
        source: `
          module physics;
          import vec::dot;
          export fn energy(v: int): int { return dot(v, v); }
        `,
      },
      {
        name: 'main',
        source: `
          import physics::energy;
          @tick fn tick() { let e: int = energy(5); }
        `,
      },
    ], { namespace: 'game' })

    // physics/energy should call vec/dot
    const physicsContent = getFile(result.files, 'physics/energy')
    expect(physicsContent).toBeDefined()
    expect(physicsContent).toContain('function game:vec/dot')

    // main tick should call physics/energy
    const tickContent = getFile(result.files, '/tick.mcfunction')
    expect(tickContent).toBeDefined()
    expect(tickContent).toContain('function game:physics/energy')
  })
})

// ---------------------------------------------------------------------------
// DCE across modules
// ---------------------------------------------------------------------------

describe('cross-module DCE', () => {
  test('exported function not imported anywhere is DCE-eligible (library fn)', () => {
    // export fn unused in `math` — never imported in `main`
    const result = compileModules([
      {
        name: 'math',
        source: `
          module math;
          export fn used(x: int): int { return x; }
          export fn unused(x: int): int { return x + 1; }
        `,
      },
      {
        name: 'main',
        source: `
          import math::used;
          @tick fn tick() { let x: int = used(3); }
        `,
      },
    ], { namespace: 'ns' })

    // `math/used` must be present
    expect(getFile(result.files, 'math/used')).toBeDefined()
    // `math/unused` should be DCE'd (it's marked as library fn)
    // (library fns are stripped if not reachable from any entry point)
    expect(getFile(result.files, 'math/unused')).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Circular import detection
// ---------------------------------------------------------------------------

describe('circular import detection', () => {
  test('direct circular import throws LoweringError', () => {
    expect(() => compileModules([
      {
        name: 'a',
        source: `
          module a;
          import b::foo;
          export fn bar() { foo(); }
        `,
      },
      {
        name: 'b',
        source: `
          module b;
          import a::bar;
          export fn foo() { bar(); }
        `,
      },
    ], { namespace: 'ns' })).toThrow(/Circular import/)
  })

  test('transitive circular import throws LoweringError', () => {
    expect(() => compileModules([
      {
        name: 'a',
        source: `
          module a;
          import c::baz;
          export fn foo() { baz(); }
        `,
      },
      {
        name: 'b',
        source: `
          module b;
          import a::foo;
          export fn bar() { foo(); }
        `,
      },
      {
        name: 'c',
        source: `
          module c;
          import b::bar;
          export fn baz() { bar(); }
        `,
      },
    ], { namespace: 'ns' })).toThrow(/Circular import/)
  })
})

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('module error cases', () => {
  test('importing non-existent module throws', () => {
    expect(() => compileModules([
      {
        name: 'main',
        source: `
          import nonexistent::foo;
          fn main() { foo(); }
        `,
      },
    ], { namespace: 'ns' })).toThrow(/not found/)
  })

  test('importing non-exported symbol throws', () => {
    expect(() => compileModules([
      {
        name: 'math',
        source: `
          module math;
          fn private_fn() { }
        `,
      },
      {
        name: 'main',
        source: `
          import math::private_fn;
          fn main() { private_fn(); }
        `,
      },
    ], { namespace: 'ns' })).toThrow(/does not export/)
  })

  test('module name mismatch throws', () => {
    expect(() => compileModules([
      {
        name: 'wrong_name',
        source: `
          module math;
          export fn add(a: int, b: int): int { return a + b; }
        `,
      },
    ], { namespace: 'ns' })).toThrow(/registered as/)
  })
})

// ---------------------------------------------------------------------------
// Namespace isolation
// ---------------------------------------------------------------------------

describe('namespace isolation', () => {
  test('each named module has its own scoreboard objective', () => {
    const result = compileModules([
      {
        name: 'modA',
        source: `
          module modA;
          export fn hello() { say("hello"); }
        `,
      },
      {
        name: 'modB',
        source: `
          module modB;
          export fn world() { say("world"); }
        `,
      },
    ], { namespace: 'myns' })

    const loadA = getFile(result.files, 'modA/_load')
    const loadB = getFile(result.files, 'modB/_load')

    expect(loadA).toBeDefined()
    expect(loadA).toContain('__myns_modA')

    expect(loadB).toBeDefined()
    expect(loadB).toContain('__myns_modB')
  })

  test('load.json includes all module load functions', () => {
    const result = compileModules([
      {
        name: 'a',
        source: `
          module a;
          export fn f() { }
        `,
      },
      {
        name: 'b',
        source: `
          module b;
          export fn g() { }
        `,
      },
    ], { namespace: 'ns' })

    const loadJson = getFile(result.files, 'load.json')
    expect(loadJson).toBeDefined()
    const tag = JSON.parse(loadJson!)
    expect(tag.values).toContain('ns:a/_load')
    expect(tag.values).toContain('ns:b/_load')
  })
})
