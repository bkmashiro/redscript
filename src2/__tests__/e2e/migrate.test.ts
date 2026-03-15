/**
 * Migration tests — representative cases from the existing 920-test suite
 * run through the NEW v2 compiler pipeline.
 *
 * Pattern:
 *   1. Compile source with src2/emit/compile.ts
 *   2. Load .mcfunction files into MCRuntime
 *   3. Execute functions and assert scoreboard state
 *
 * NOTE: v2 uses objective `__<ns>` (not `rs`), load function is `ns:load`
 * (not `ns:__load`), and return values go to `$ret` on the objective.
 */

import { compile } from '../../emit/compile'
import { MCRuntime } from '../../../src/runtime'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NS = 'test'
const OBJ = `__${NS}`

function getFile(
  files: { path: string; content: string }[],
  pathSubstr: string,
): string | undefined {
  return files.find(f => f.path.includes(pathSubstr))?.content
}

/** Compile source, load all .mcfunction files into MCRuntime, init objective */
function makeRuntime(source: string, namespace = NS): MCRuntime {
  const result = compile(source, { namespace })
  const rt = new MCRuntime(namespace)
  for (const file of result.files) {
    if (!file.path.endsWith('.mcfunction')) continue
    const m = file.path.match(/data\/([^/]+)\/function\/(.+)\.mcfunction$/)
    if (!m) continue
    rt.loadFunction(`${m[1]}:${m[2]}`, file.content.split('\n'))
  }
  // Init the objective (v2 load function creates it)
  rt.execFunction(`${namespace}:load`)
  return rt
}

/** Execute a function and return the $ret value on the v2 objective */
function callAndGetRet(rt: MCRuntime, fnName: string, namespace = NS): number {
  rt.execFunction(`${namespace}:${fnName}`)
  return rt.getScore('$ret', `__${namespace}`)
}

// ===========================================================================
// 1. Compilation smoke tests — does the compiler not crash?
// ===========================================================================

describe('v2 migration: compilation smoke', () => {
  const cases: [string, string][] = [
    ['empty function', 'fn noop(): void {}'],
    ['return constant', 'fn f(): int { return 42; }'],
    ['arithmetic', 'fn f(): int { return 1 + 2; }'],
    ['variable', 'fn f(): int { let x: int = 10; return x; }'],
    ['negation', 'fn f(): int { return -5; }'],
    ['comparison', 'fn f(): bool { return 3 > 2; }'],
    ['if/else', 'fn f(x: int): int { if (x > 0) { return 1; } else { return 0; } }'],
    ['while loop', 'fn f(): void { let i: int = 0; while (i < 10) { i = i + 1; } }'],
    ['multiple functions', 'fn a(): int { return 1; }\nfn b(): int { return 2; }'],
    ['function call', 'fn add(a: int, b: int): int { return a + b; }\nfn main(): int { return add(3, 4); }'],
    ['boolean AND', 'fn f(): bool { return true && false; }'],
    ['boolean OR', 'fn f(): bool { return true || false; }'],
    ['boolean NOT', 'fn f(): bool { return !true; }'],
    ['nested arithmetic', 'fn f(): int { return (1 + 2) * (3 - 4); }'],
    ['modulo', 'fn f(): int { return 10 % 3; }'],
    ['@tick decorator', '@tick fn game_tick(): void { let x: int = 1; }'],
    ['@load decorator', '@load fn setup(): void { let x: int = 0; }'],
    ['chained comparison', 'fn f(x: int): bool { return x >= 0 && x <= 100; }'],
  ]

  test.each(cases)('%s compiles without error', (_name, source) => {
    expect(() => compile(source, { namespace: NS })).not.toThrow()
  })
})

// ===========================================================================
// 2. Structural tests — output shape
// ===========================================================================

describe('v2 migration: output structure', () => {
  test('pack.mcmeta present with pack_format 26', () => {
    const result = compile('fn noop(): void {}', { namespace: NS })
    const meta = getFile(result.files, 'pack.mcmeta')
    expect(meta).toBeDefined()
    expect(JSON.parse(meta!).pack.pack_format).toBe(26)
  })

  test('load.mcfunction creates scoreboard objective', () => {
    const result = compile('fn noop(): void {}', { namespace: NS })
    const load = getFile(result.files, 'load.mcfunction')
    expect(load).toBeDefined()
    expect(load).toContain(`scoreboard objectives add ${OBJ} dummy`)
  })

  test('load.json always includes namespace:load', () => {
    const result = compile('fn noop(): void {}', { namespace: NS })
    const loadJson = getFile(result.files, 'load.json')
    expect(loadJson).toBeDefined()
    expect(JSON.parse(loadJson!).values).toContain(`${NS}:load`)
  })

  test('@tick function appears in tick.json', () => {
    const result = compile('@tick fn game_tick(): void { let x: int = 1; }', { namespace: NS })
    const tickJson = getFile(result.files, 'tick.json')
    expect(tickJson).toBeDefined()
    expect(JSON.parse(tickJson!).values).toContain(`${NS}:game_tick`)
  })

  test('@load function appears in load.json', () => {
    const result = compile('@load fn setup(): void { let x: int = 0; }', { namespace: NS })
    const loadJson = getFile(result.files, 'load.json')
    expect(loadJson).toBeDefined()
    expect(JSON.parse(loadJson!).values).toContain(`${NS}:setup`)
  })

  test('no tick.json when no @tick functions', () => {
    const result = compile('fn noop(): void {}', { namespace: NS })
    const tickJson = getFile(result.files, 'tick.json')
    expect(tickJson).toBeUndefined()
  })

  test('function names are lowercased in output paths', () => {
    const result = compile('fn MyFunc(): void {}', { namespace: NS })
    const fn = result.files.find(f => f.path.includes('myfunc.mcfunction'))
    expect(fn).toBeDefined()
  })

  test('simple function produces scoreboard commands', () => {
    const result = compile('fn add(a: int, b: int): int { return a + b; }', { namespace: NS })
    const fn = getFile(result.files, 'add.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('scoreboard players operation')
    expect(fn).toContain(OBJ)
  })

  test('constant assignment produces score_set', () => {
    const result = compile('fn init(): int { let x: int = 42; return x; }', { namespace: NS })
    const fn = getFile(result.files, 'init.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('scoreboard players set')
    expect(fn).toContain('42')
  })

  test('if/else produces conditional call pattern', () => {
    const source = `
      fn check(x: int): int {
        if (x > 0) { return 1; } else { return 0; }
      }
    `
    const result = compile(source, { namespace: NS })
    const fn = getFile(result.files, 'check.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('execute if score')
    expect(fn).toContain('matches')
    expect(fn).toContain('run function')
  })

  test('while loop produces loop structure with function calls', () => {
    const source = `
      fn count(): void {
        let i: int = 0;
        while (i < 10) { i = i + 1; }
      }
    `
    const result = compile(source, { namespace: NS })
    const fnFiles = result.files.filter(f => f.path.endsWith('.mcfunction'))
    expect(fnFiles.length).toBeGreaterThan(1) // main + loop blocks
    const allContent = fnFiles.map(f => f.content).join('\n')
    expect(allContent).toContain('execute if score')
    expect(allContent).toContain('run function')
  })
})

// ===========================================================================
// 3. Runtime behavioural tests — execute and check scoreboard values
// ===========================================================================

describe('v2 migration: return values', () => {
  test('return constant 42', () => {
    const rt = makeRuntime('fn f(): int { return 42; }')
    expect(callAndGetRet(rt, 'f')).toBe(42)
  })

  test('return zero', () => {
    const rt = makeRuntime('fn f(): int { return 0; }')
    expect(callAndGetRet(rt, 'f')).toBe(0)
  })

  test('return negative', () => {
    const rt = makeRuntime('fn f(): int { return -10; }')
    expect(callAndGetRet(rt, 'f')).toBe(-10)
  })
})

describe('v2 migration: arithmetic', () => {
  test('1 + 2 = 3', () => {
    const rt = makeRuntime('fn f(): int { return 1 + 2; }')
    expect(callAndGetRet(rt, 'f')).toBe(3)
  })

  test('10 - 3 = 7', () => {
    const rt = makeRuntime('fn f(): int { return 10 - 3; }')
    expect(callAndGetRet(rt, 'f')).toBe(7)
  })

  test('4 * 5 = 20', () => {
    const rt = makeRuntime('fn f(): int { return 4 * 5; }')
    expect(callAndGetRet(rt, 'f')).toBe(20)
  })

  test('20 / 4 = 5', () => {
    const rt = makeRuntime('fn f(): int { return 20 / 4; }')
    expect(callAndGetRet(rt, 'f')).toBe(5)
  })

  test('10 % 3 = 1', () => {
    const rt = makeRuntime('fn f(): int { return 10 % 3; }')
    expect(callAndGetRet(rt, 'f')).toBe(1)
  })

  test('chained: (2 + 3) * 4 = 20', () => {
    const rt = makeRuntime('fn f(): int { return (2 + 3) * 4; }')
    expect(callAndGetRet(rt, 'f')).toBe(20)
  })

  test('negation: -(5) = -5', () => {
    const rt = makeRuntime('fn f(): int { return -(5); }')
    expect(callAndGetRet(rt, 'f')).toBe(-5)
  })
})

describe('v2 migration: variables', () => {
  test('let and return', () => {
    const rt = makeRuntime('fn f(): int { let x: int = 42; return x; }')
    expect(callAndGetRet(rt, 'f')).toBe(42)
  })

  test('variable reassignment', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 1;
        x = 10;
        return x;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(10)
  })

  test('multiple variables', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let a: int = 3;
        let b: int = 7;
        return a + b;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(10)
  })

  test('variable used in expression', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 5;
        let y: int = x * 2 + 1;
        return y;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(11)
  })
})

describe('v2 migration: comparisons', () => {
  test('3 > 2 is true (1)', () => {
    const rt = makeRuntime('fn f(): int { if (3 > 2) { return 1; } else { return 0; } }')
    expect(callAndGetRet(rt, 'f')).toBe(1)
  })

  test('2 > 3 is false (0)', () => {
    const rt = makeRuntime('fn f(): int { if (2 > 3) { return 1; } else { return 0; } }')
    expect(callAndGetRet(rt, 'f')).toBe(0)
  })

  test('5 == 5 is true', () => {
    const rt = makeRuntime('fn f(): int { if (5 == 5) { return 1; } else { return 0; } }')
    expect(callAndGetRet(rt, 'f')).toBe(1)
  })

  test('5 != 3 is true', () => {
    const rt = makeRuntime('fn f(): int { if (5 != 3) { return 1; } else { return 0; } }')
    expect(callAndGetRet(rt, 'f')).toBe(1)
  })

  test('3 <= 3 is true', () => {
    const rt = makeRuntime('fn f(): int { if (3 <= 3) { return 1; } else { return 0; } }')
    expect(callAndGetRet(rt, 'f')).toBe(1)
  })

  test('4 >= 5 is false', () => {
    const rt = makeRuntime('fn f(): int { if (4 >= 5) { return 1; } else { return 0; } }')
    expect(callAndGetRet(rt, 'f')).toBe(0)
  })
})

describe('v2 migration: if/else control flow', () => {
  test('if-true branch taken', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 10;
        if (x > 5) { return 1; } else { return 0; }
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(1)
  })

  test('if-false branch taken', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 2;
        if (x > 5) { return 1; } else { return 0; }
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(0)
  })

  test('if without else — falls through', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 0;
        if (true) { x = 42; }
        return x;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(42)
  })

  test('nested if/else', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 15;
        if (x > 20) {
          return 3;
        } else {
          if (x > 10) {
            return 2;
          } else {
            return 1;
          }
        }
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(2)
  })
})

describe('v2 migration: while loops', () => {
  test('simple countdown', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let i: int = 10;
        while (i > 0) { i = i - 1; }
        return i;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(0)
  })

  test('sum 1 to 5', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let sum: int = 0;
        let i: int = 1;
        while (i <= 5) {
          sum = sum + i;
          i = i + 1;
        }
        return sum;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(15)
  })

  test('while false — never executes', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 99;
        while (false) { x = 0; }
        return x;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(99)
  })
})

describe('v2 migration: function calls', () => {
  test('call simple function', () => {
    const rt = makeRuntime(`
      fn double(x: int): int { return x * 2; }
      fn f(): int { return double(21); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(42)
  })

  test('call with two params', () => {
    const rt = makeRuntime(`
      fn add(a: int, b: int): int { return a + b; }
      fn f(): int { return add(17, 25); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(42)
  })

  test('chain of calls', () => {
    const rt = makeRuntime(`
      fn inc(x: int): int { return x + 1; }
      fn f(): int { return inc(inc(inc(0))); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(3)
  })

  test('call function with no return used in expression', () => {
    const rt = makeRuntime(`
      fn five(): int { return 5; }
      fn f(): int {
        let x: int = five() + five();
        return x;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(10)
  })
})

describe('v2 migration: boolean logic', () => {
  test('true AND true = 1', () => {
    const rt = makeRuntime(`
      fn f(): int {
        if (true && true) { return 1; } else { return 0; }
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(1)
  })

  test('true AND false = 0', () => {
    const rt = makeRuntime(`
      fn f(): int {
        if (true && false) { return 1; } else { return 0; }
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(0)
  })

  test('false OR true = 1', () => {
    const rt = makeRuntime(`
      fn f(): int {
        if (false || true) { return 1; } else { return 0; }
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(1)
  })

  test('NOT true = 0', () => {
    const rt = makeRuntime(`
      fn f(): int {
        if (!true) { return 1; } else { return 0; }
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(0)
  })
})

// ===========================================================================
// 4. More complex patterns from the original test suite
// ===========================================================================

describe('v2 migration: compound expressions', () => {
  test('abs via if/else', () => {
    const rt = makeRuntime(`
      fn abs(x: int): int {
        if (x < 0) { return -x; } else { return x; }
      }
      fn f(): int { return abs(-7); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(7)
  })

  test('max of two', () => {
    const rt = makeRuntime(`
      fn max(a: int, b: int): int {
        if (a > b) { return a; } else { return b; }
      }
      fn f(): int { return max(3, 7); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(7)
  })

  test('factorial iterative', () => {
    const rt = makeRuntime(`
      fn fact(n: int): int {
        let result: int = 1;
        let i: int = 1;
        while (i <= n) {
          result = result * i;
          i = i + 1;
        }
        return result;
      }
      fn f(): int { return fact(5); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(120)
  })

  test('fibonacci iterative', () => {
    const rt = makeRuntime(`
      fn fib(n: int): int {
        let a: int = 0;
        let b: int = 1;
        let i: int = 0;
        while (i < n) {
          let tmp: int = b;
          b = a + b;
          a = tmp;
          i = i + 1;
        }
        return a;
      }
      fn f(): int { return fib(10); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(55)
  })
})
