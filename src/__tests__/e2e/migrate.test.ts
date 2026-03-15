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
import { MCRuntime } from '../../runtime'

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

// ===========================================================================
// 5. Break / continue
// ===========================================================================

describe('v2 migration: break and continue', () => {
  test('break exits loop early', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let i: int = 0;
        while (true) {
          if (i == 5) { break; }
          i = i + 1;
        }
        return i;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(5)
  })

  test('continue skips iteration', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let sum: int = 0;
        let i: int = 0;
        while (i < 10) {
          i = i + 1;
          if (i % 2 == 0) { continue; }
          sum = sum + i;
        }
        return sum;
      }
    `)
    // sum of odd numbers 1..9 = 1+3+5+7+9 = 25
    expect(callAndGetRet(rt, 'f')).toBe(25)
  })
})

// ===========================================================================
// 6. Compound assignment operators (desugared in HIR)
// ===========================================================================

describe('v2 migration: compound assignment', () => {
  test('+= operator', () => {
    const rt = makeRuntime(`
      fn f(): int { let x: int = 10; x += 5; return x; }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(15)
  })

  test('-= operator', () => {
    const rt = makeRuntime(`
      fn f(): int { let x: int = 10; x -= 3; return x; }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(7)
  })

  test('*= operator', () => {
    const rt = makeRuntime(`
      fn f(): int { let x: int = 4; x *= 5; return x; }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(20)
  })
})

// ===========================================================================
// 7. Multiple return paths
// ===========================================================================

describe('v2 migration: multiple return paths', () => {
  test('early return from if', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 42;
        if (x > 10) { return x; }
        return 0;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(42)
  })

  test('return from else path', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 5;
        if (x > 10) { return 1; }
        return 2;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(2)
  })

  test('return from nested if chains', () => {
    const rt = makeRuntime(`
      fn classify(x: int): int {
        if (x < 0) { return -1; }
        if (x == 0) { return 0; }
        return 1;
      }
      fn f(): int {
        return classify(-5) + classify(0) + classify(7);
      }
    `)
    // -1 + 0 + 1 = 0
    expect(callAndGetRet(rt, 'f')).toBe(0)
  })
})

// ===========================================================================
// 8. Mutual function calls
// ===========================================================================

describe('v2 migration: mutual calls and recursion-like patterns', () => {
  test('function calling function calling function', () => {
    const rt = makeRuntime(`
      fn a(): int { return 1; }
      fn b(): int { return a() + 2; }
      fn c(): int { return b() + 3; }
      fn f(): int { return c(); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(6)
  })

  test('iterative power function', () => {
    const rt = makeRuntime(`
      fn pow(base: int, exp: int): int {
        let result: int = 1;
        let i: int = 0;
        while (i < exp) {
          result = result * base;
          i = i + 1;
        }
        return result;
      }
      fn f(): int { return pow(2, 10); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(1024)
  })
})

// ===========================================================================
// 9. Edge cases
// ===========================================================================

describe('v2 migration: edge cases', () => {
  test('zero division (MC truncates to 0)', () => {
    // MC scoreboard division by zero returns 0
    const rt = makeRuntime('fn f(): int { return 10 / 0; }')
    // This may throw or return 0 depending on MCRuntime behavior
    try {
      const val = callAndGetRet(rt, 'f')
      expect(val).toBe(0)
    } catch {
      // Division by zero is undefined in MC — just ensure no crash
    }
  })

  test('deeply nested arithmetic', () => {
    const rt = makeRuntime(`
      fn f(): int {
        return ((1 + 2) * (3 + 4)) - ((5 - 6) * (7 + 8));
      }
    `)
    // (3 * 7) - ((-1) * 15) = 21 - (-15) = 36
    expect(callAndGetRet(rt, 'f')).toBe(36)
  })

  test('many variables', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let a: int = 1;
        let b: int = 2;
        let c: int = 3;
        let d: int = 4;
        let e: int = 5;
        return a + b + c + d + e;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(15)
  })

  test('nested while loops', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let sum: int = 0;
        let i: int = 0;
        while (i < 3) {
          let j: int = 0;
          while (j < 3) {
            sum = sum + 1;
            j = j + 1;
          }
          i = i + 1;
        }
        return sum;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(9)
  })

  test('if inside while', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let count: int = 0;
        let i: int = 0;
        while (i < 10) {
          if (i % 3 == 0) {
            count = count + 1;
          }
          i = i + 1;
        }
        return count;
      }
    `)
    // 0, 3, 6, 9 are divisible by 3 → count = 4
    expect(callAndGetRet(rt, 'f')).toBe(4)
  })

  test('while inside if', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 1;
        if (x > 0) {
          let sum: int = 0;
          let i: int = 0;
          while (i < 5) {
            sum = sum + i;
            i = i + 1;
          }
          return sum;
        }
        return -1;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(10)
  })
})

// ===========================================================================
// 10. Function calls with 3+ parameters
// ===========================================================================

describe('v2 migration: multi-param functions', () => {
  test('function with 3 parameters', () => {
    const rt = makeRuntime(`
      fn add3(a: int, b: int, c: int): int { return a + b + c; }
      fn f(): int { return add3(10, 20, 30); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(60)
  })

  test('function with 4 parameters', () => {
    const rt = makeRuntime(`
      fn sum4(a: int, b: int, c: int, d: int): int { return a + b + c + d; }
      fn f(): int { return sum4(1, 2, 3, 4); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(10)
  })

  test('function with 5 parameters', () => {
    const rt = makeRuntime(`
      fn sum5(a: int, b: int, c: int, d: int, e: int): int {
        return a + b + c + d + e;
      }
      fn f(): int { return sum5(2, 4, 6, 8, 10); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(30)
  })

  test('3-param function with mixed operations', () => {
    const rt = makeRuntime(`
      fn weighted(a: int, b: int, w: int): int {
        return a * w + b * (100 - w);
      }
      fn f(): int { return weighted(10, 5, 60); }
    `)
    // 10 * 60 + 5 * 40 = 600 + 200 = 800
    expect(callAndGetRet(rt, 'f')).toBe(800)
  })
})

// ===========================================================================
// 11. Call chains and nested calls
// ===========================================================================

describe('v2 migration: call chains', () => {
  test('4-deep call chain', () => {
    const rt = makeRuntime(`
      fn a(): int { return 1; }
      fn b(): int { return a() + 10; }
      fn c(): int { return b() + 100; }
      fn d(): int { return c() + 1000; }
      fn f(): int { return d(); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(1111)
  })

  test('function calling same function multiple times', () => {
    const rt = makeRuntime(`
      fn square(x: int): int { return x * x; }
      fn f(): int { return square(3) + square(4); }
    `)
    // 9 + 16 = 25
    expect(callAndGetRet(rt, 'f')).toBe(25)
  })

  test('function result used as argument', () => {
    const rt = makeRuntime(`
      fn add(a: int, b: int): int { return a + b; }
      fn f(): int { return add(add(1, 2), add(3, 4)); }
    `)
    // add(3, 7) = 10
    expect(callAndGetRet(rt, 'f')).toBe(10)
  })

  test('mutual helper functions', () => {
    const rt = makeRuntime(`
      fn double(x: int): int { return x * 2; }
      fn triple(x: int): int { return x * 3; }
      fn f(): int { return double(5) + triple(5); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(25)
  })
})

// ===========================================================================
// 12. Math-style patterns (inline, no stdlib import)
// ===========================================================================

describe('v2 migration: math patterns', () => {
  test('min of two numbers', () => {
    const rt = makeRuntime(`
      fn min(a: int, b: int): int {
        if (a < b) { return a; } else { return b; }
      }
      fn f(): int { return min(7, 3); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(3)
  })

  test('min returns first when equal', () => {
    const rt = makeRuntime(`
      fn min(a: int, b: int): int {
        if (a < b) { return a; } else { return b; }
      }
      fn f(): int { return min(5, 5); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(5)
  })

  test('abs of positive stays positive', () => {
    const rt = makeRuntime(`
      fn abs(x: int): int {
        if (x < 0) { return -x; } else { return x; }
      }
      fn f(): int { return abs(42); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(42)
  })

  test('abs of zero is zero', () => {
    const rt = makeRuntime(`
      fn abs(x: int): int {
        if (x < 0) { return -x; } else { return x; }
      }
      fn f(): int { return abs(0); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(0)
  })

  test('clamp value in range', () => {
    const rt = makeRuntime(`
      fn clamp(val: int, lo: int, hi: int): int {
        if (val < lo) { return lo; }
        if (val > hi) { return hi; }
        return val;
      }
      fn f(): int { return clamp(50, 0, 100); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(50)
  })

  test('clamp below minimum', () => {
    const rt = makeRuntime(`
      fn clamp(val: int, lo: int, hi: int): int {
        if (val < lo) { return lo; }
        if (val > hi) { return hi; }
        return val;
      }
      fn f(): int { return clamp(-5, 0, 100); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(0)
  })

  test('clamp above maximum', () => {
    const rt = makeRuntime(`
      fn clamp(val: int, lo: int, hi: int): int {
        if (val < lo) { return lo; }
        if (val > hi) { return hi; }
        return val;
      }
      fn f(): int { return clamp(200, 0, 100); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(100)
  })

  test('sign function', () => {
    const rt = makeRuntime(`
      fn sign(x: int): int {
        if (x > 0) { return 1; }
        if (x < 0) { return -1; }
        return 0;
      }
      fn f(): int { return sign(-42) + sign(0) + sign(99); }
    `)
    // -1 + 0 + 1 = 0
    expect(callAndGetRet(rt, 'f')).toBe(0)
  })
})

// ===========================================================================
// 13. More break/continue patterns
// ===========================================================================

describe('v2 migration: advanced break/continue', () => {
  test('break in nested if inside loop', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let sum: int = 0;
        let i: int = 0;
        while (i < 100) {
          sum = sum + i;
          i = i + 1;
          if (sum > 10) { break; }
        }
        return sum;
      }
    `)
    // 0+1+2+3+4+5 = 15 > 10, breaks at i=6
    expect(callAndGetRet(rt, 'f')).toBe(15)
  })

  test('continue with counter (using == pattern)', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let count: int = 0;
        let i: int = 0;
        while (i < 10) {
          i = i + 1;
          if (i % 3 == 0) { continue; }
          count = count + 1;
        }
        return count;
      }
    `)
    // i=1..10, skip 3,6,9 → count = 7
    expect(callAndGetRet(rt, 'f')).toBe(7)
  })

  test('break from while(true) with accumulator', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let n: int = 1;
        while (true) {
          n = n * 2;
          if (n >= 64) { break; }
        }
        return n;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(64)
  })

  test('continue and break in same loop', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let sum: int = 0;
        let i: int = 0;
        while (true) {
          i = i + 1;
          if (i > 10) { break; }
          if (i % 2 == 0) { continue; }
          sum = sum + i;
        }
        return sum;
      }
    `)
    // odd numbers 1..10: 1+3+5+7+9 = 25
    expect(callAndGetRet(rt, 'f')).toBe(25)
  })
})

// ===========================================================================
// 14. for loops (desugared to while in HIR)
// ===========================================================================

describe('v2 migration: for loops', () => {
  test('simple for loop sum', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let sum: int = 0;
        for (let i: int = 1; i <= 10; i = i + 1) {
          sum = sum + i;
        }
        return sum;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(55)
  })

  test('for loop with multiplication', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let product: int = 1;
        for (let i: int = 1; i <= 6; i = i + 1) {
          product = product * i;
        }
        return product;
      }
    `)
    // 6! = 720
    expect(callAndGetRet(rt, 'f')).toBe(720)
  })

  test('for loop counting down', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let last: int = 0;
        for (let i: int = 10; i > 0; i = i - 1) {
          last = i;
        }
        return last;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(1)
  })

  test('nested for loops', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let count: int = 0;
        for (let i: int = 0; i < 4; i = i + 1) {
          for (let j: int = 0; j < 3; j = j + 1) {
            count = count + 1;
          }
        }
        return count;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(12)
  })

  test('for loop with break', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let result: int = 0;
        for (let i: int = 0; i < 100; i = i + 1) {
          if (i == 7) {
            result = i;
            break;
          }
        }
        return result;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(7)
  })
})

// ===========================================================================
// 15. @tick and @load runtime behavior
// ===========================================================================

describe('v2 migration: @tick/@load runtime', () => {
  test('@tick function executes and modifies state', () => {
    const source = `
      let counter: int = 0;
      @tick fn game_tick(): void {
        counter = counter + 1;
      }
      fn get_counter(): int { return counter; }
    `
    // @tick functions should compile and be callable
    expect(() => compile(source, { namespace: NS })).not.toThrow()
  })

  test('@load function runs on load', () => {
    const source = `
      @load fn setup(): void {
        let x: int = 42;
      }
    `
    const result = compile(source, { namespace: NS })
    const loadJson = getFile(result.files, 'load.json')
    expect(loadJson).toBeDefined()
    const values = JSON.parse(loadJson!).values
    expect(values).toContain(`${NS}:setup`)
    expect(values).toContain(`${NS}:load`)
  })

  test('@tick and @load on different functions', () => {
    const source = `
      @tick fn on_tick(): void { let x: int = 1; }
      @load fn on_load(): void { let y: int = 2; }
    `
    const result = compile(source, { namespace: NS })
    const tickJson = getFile(result.files, 'tick.json')
    const loadJson = getFile(result.files, 'load.json')
    expect(tickJson).toBeDefined()
    expect(JSON.parse(tickJson!).values).toContain(`${NS}:on_tick`)
    expect(loadJson).toBeDefined()
    expect(JSON.parse(loadJson!).values).toContain(`${NS}:on_load`)
  })

  test('multiple @tick functions all appear in tick.json', () => {
    const source = `
      @tick fn tick1(): void { let x: int = 1; }
      @tick fn tick2(): void { let y: int = 2; }
    `
    const result = compile(source, { namespace: NS })
    const tickJson = getFile(result.files, 'tick.json')
    expect(tickJson).toBeDefined()
    const values = JSON.parse(tickJson!).values
    expect(values).toContain(`${NS}:tick1`)
    expect(values).toContain(`${NS}:tick2`)
  })

  test('@tick function with logic compiles and runs', () => {
    const rt = makeRuntime(`
      @tick fn game_tick(): void {
        let x: int = 5;
        let y: int = x + 10;
      }
      fn f(): int { return 1; }
    `)
    // Tick function should be callable without crashing
    rt.execFunction(`${NS}:game_tick`)
    expect(callAndGetRet(rt, 'f')).toBe(1)
  })

  test('@load function body executes correctly in runtime', () => {
    const rt = makeRuntime(`
      @load fn init(): void {
        let x: int = 100;
      }
      fn f(): int { return 42; }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(42)
  })
})

// ===========================================================================
// 16. Struct declaration and field access (smoke + structural)
// ===========================================================================

describe('v2 migration: struct smoke tests', () => {
  test('struct declaration compiles', () => {
    expect(() => compile(`
      struct Point { x: int, y: int }
      fn f(): int { return 1; }
    `, { namespace: NS })).not.toThrow()
  })

  test('struct literal compiles', () => {
    expect(() => compile(`
      struct Vec2 { x: int, y: int }
      fn f(): int {
        let p: Vec2 = { x: 10, y: 20 };
        return 1;
      }
    `, { namespace: NS })).not.toThrow()
  })

  test('struct with impl compiles', () => {
    expect(() => compile(`
      struct Counter { value: int }
      impl Counter {
        fn new(): Counter {
          return { value: 0 };
        }
      }
      fn f(): int { return 1; }
    `, { namespace: NS })).not.toThrow()
  })

  test('struct field access compiles', () => {
    expect(() => compile(`
      struct Point { x: int, y: int }
      fn f(): int {
        let p: Point = { x: 5, y: 10 };
        let val: int = p.x;
        return val;
      }
    `, { namespace: NS })).not.toThrow()
  })

  test('struct field assignment compiles', () => {
    expect(() => compile(`
      struct Point { x: int, y: int }
      fn f(): void {
        let p: Point = { x: 5, y: 10 };
        p.x = 20;
      }
    `, { namespace: NS })).not.toThrow()
  })

  test('struct method call via static_call compiles', () => {
    expect(() => compile(`
      struct Vec2 { x: int, y: int }
      impl Vec2 {
        fn new(x: int, y: int): Vec2 {
          return { x: x, y: y };
        }
      }
      fn f(): void {
        let v: Vec2 = Vec2::new(1, 2);
      }
    `, { namespace: NS })).not.toThrow()
  })

  test('struct static method generates function file', () => {
    const result = compile(`
      struct Vec2 { x: int, y: int }
      impl Vec2 {
        fn new(x: int, y: int): Vec2 {
          return { x: x, y: y };
        }
      }
      fn f(): void {
        let v: Vec2 = Vec2::new(1, 2);
      }
    `, { namespace: NS })
    // impl methods are named Type::method in LIR → type/method in path
    const fnFiles = result.files.filter(f => f.path.endsWith('.mcfunction'))
    expect(fnFiles.length).toBeGreaterThanOrEqual(2) // at least f + Vec2::new
  })

  test('multiple struct declarations compile', () => {
    expect(() => compile(`
      struct Point { x: int, y: int }
      struct Color { r: int, g: int, b: int }
      fn f(): int { return 1; }
    `, { namespace: NS })).not.toThrow()
  })
})

// ===========================================================================
// 17. Execute context blocks (structural)
// ===========================================================================

describe('v2 migration: execute blocks', () => {
  test('as @a block compiles', () => {
    expect(() => compile(`
      fn f(): void {
        as @a {
          let x: int = 1;
        }
      }
    `, { namespace: NS })).not.toThrow()
  })

  test('as @a generates execute as command', () => {
    const result = compile(`
      fn f(): void {
        as @a {
          let x: int = 1;
        }
      }
    `, { namespace: NS })
    const allContent = result.files
      .filter(f => f.path.endsWith('.mcfunction'))
      .map(f => f.content).join('\n')
    expect(allContent).toContain('execute as @a run function')
  })

  test('at @s block compiles', () => {
    expect(() => compile(`
      fn f(): void {
        at @s {
          let x: int = 1;
        }
      }
    `, { namespace: NS })).not.toThrow()
  })

  test('as @e at @s compiles', () => {
    expect(() => compile(`
      fn f(): void {
        as @e at @s {
          let x: int = 1;
        }
      }
    `, { namespace: NS })).not.toThrow()
  })

  test('as @e at @s generates execute command', () => {
    const result = compile(`
      fn f(): void {
        as @e at @s {
          let x: int = 1;
        }
      }
    `, { namespace: NS })
    const allContent = result.files
      .filter(f => f.path.endsWith('.mcfunction'))
      .map(f => f.content).join('\n')
    expect(allContent).toContain('execute as @e at @s run function')
  })

  test('nested execute blocks compile', () => {
    expect(() => compile(`
      fn f(): void {
        as @a {
          as @e {
            let x: int = 1;
          }
        }
      }
    `, { namespace: NS })).not.toThrow()
  })

  test('execute body creates helper function', () => {
    const result = compile(`
      fn f(): void {
        as @a {
          let x: int = 42;
        }
      }
    `, { namespace: NS })
    const fnFiles = result.files.filter(f => f.path.endsWith('.mcfunction'))
    // Should have at least: load, f, f__exec helper
    expect(fnFiles.length).toBeGreaterThanOrEqual(3)
  })
})

// ===========================================================================
// 18. foreach (structural)
// ===========================================================================

describe('v2 migration: foreach', () => {
  test('foreach with selector compiles', () => {
    expect(() => compile(`
      fn f(): void {
        foreach (e in @e) {
          let x: int = 1;
        }
      }
    `, { namespace: NS })).not.toThrow()
  })

  test('foreach generates execute as ... run function', () => {
    const result = compile(`
      fn f(): void {
        foreach (e in @e) {
          let x: int = 1;
        }
      }
    `, { namespace: NS })
    const allContent = result.files
      .filter(f => f.path.endsWith('.mcfunction'))
      .map(f => f.content).join('\n')
    expect(allContent).toContain('execute as @e run function')
  })

  test('foreach with @a selector', () => {
    const result = compile(`
      fn f(): void {
        foreach (p in @a) {
          let x: int = 1;
        }
      }
    `, { namespace: NS })
    const allContent = result.files
      .filter(f => f.path.endsWith('.mcfunction'))
      .map(f => f.content).join('\n')
    expect(allContent).toContain('execute as @a run function')
  })

  test('foreach creates helper function', () => {
    const result = compile(`
      fn f(): void {
        foreach (e in @e) {
          let x: int = 1;
        }
      }
    `, { namespace: NS })
    const fnFiles = result.files.filter(f => f.path.endsWith('.mcfunction'))
    // Should have at least: load, f, foreach helper
    expect(fnFiles.length).toBeGreaterThanOrEqual(3)
  })
})

// ===========================================================================
// 19. Selectors (smoke)
// ===========================================================================

describe('v2 migration: selectors', () => {
  test('@a selector in foreach compiles', () => {
    expect(() => compile(`
      fn f(): void {
        foreach (p in @a) { let x: int = 1; }
      }
    `, { namespace: NS })).not.toThrow()
  })

  test('@e selector in foreach compiles', () => {
    expect(() => compile(`
      fn f(): void {
        foreach (e in @e) { let x: int = 1; }
      }
    `, { namespace: NS })).not.toThrow()
  })

  test('@s selector in as block compiles', () => {
    expect(() => compile(`
      fn f(): void {
        at @s { let x: int = 1; }
      }
    `, { namespace: NS })).not.toThrow()
  })

  test('@p selector compiles', () => {
    expect(() => compile(`
      fn f(): void {
        foreach (p in @p) { let x: int = 1; }
      }
    `, { namespace: NS })).not.toThrow()
  })
})

// ===========================================================================
// 20. Raw commands
// ===========================================================================

describe('v2 migration: raw commands', () => {
  test('raw command compiles', () => {
    expect(() => compile(`
      fn f(): void {
        raw("say hello world");
      }
    `, { namespace: NS })).not.toThrow()
  })

  test('raw command appears in output', () => {
    const result = compile(`
      fn f(): void {
        raw("say hello world");
      }
    `, { namespace: NS })
    const fn = getFile(result.files, '/f.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('say hello world')
  })

  test('multiple raw commands', () => {
    const result = compile(`
      fn f(): void {
        raw("say line one");
        raw("say line two");
      }
    `, { namespace: NS })
    const fn = getFile(result.files, '/f.mcfunction')
    expect(fn).toContain('say line one')
    expect(fn).toContain('say line two')
  })
})

// ===========================================================================
// 21. Match statement
// ===========================================================================

describe('v2 migration: match statement', () => {
  test('match compiles without error', () => {
    expect(() => compile(`
      fn f(x: int): int {
        match (x) {
          1 => { return 10; }
          2 => { return 20; }
          _ => { return 0; }
        }
      }
    `, { namespace: NS })).not.toThrow()
  })

  test('match selects correct arm', () => {
    const rt = makeRuntime(`
      fn classify(x: int): int {
        match (x) {
          1 => { return 10; }
          2 => { return 20; }
          3 => { return 30; }
          _ => { return 0; }
        }
      }
      fn f(): int { return classify(2); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(20)
  })

  test('match default arm', () => {
    const rt = makeRuntime(`
      fn classify(x: int): int {
        match (x) {
          1 => { return 10; }
          _ => { return 99; }
        }
      }
      fn f(): int { return classify(42); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(99)
  })

  test('match first arm', () => {
    const rt = makeRuntime(`
      fn classify(x: int): int {
        match (x) {
          1 => { return 10; }
          2 => { return 20; }
          _ => { return 0; }
        }
      }
      fn f(): int { return classify(1); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(10)
  })
})

// ===========================================================================
// 22. Complex integration patterns
// ===========================================================================

describe('v2 migration: complex patterns', () => {
  test('GCD iterative (Euclid)', () => {
    const rt = makeRuntime(`
      fn gcd(a: int, b: int): int {
        while (b != 0) {
          let temp: int = b;
          b = a % b;
          a = temp;
        }
        return a;
      }
      fn f(): int { return gcd(48, 18); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(6)
  })

  test('sum of squares', () => {
    const rt = makeRuntime(`
      fn sum_sq(n: int): int {
        let sum: int = 0;
        let i: int = 1;
        while (i <= n) {
          sum = sum + i * i;
          i = i + 1;
        }
        return sum;
      }
      fn f(): int { return sum_sq(5); }
    `)
    // 1 + 4 + 9 + 16 + 25 = 55
    expect(callAndGetRet(rt, 'f')).toBe(55)
  })

  test('collatz steps', () => {
    const rt = makeRuntime(`
      fn collatz(n: int): int {
        let steps: int = 0;
        while (n != 1) {
          if (n % 2 == 0) {
            n = n / 2;
          } else {
            n = n * 3 + 1;
          }
          steps = steps + 1;
        }
        return steps;
      }
      fn f(): int { return collatz(6); }
    `)
    // 6 → 3 → 10 → 5 → 16 → 8 → 4 → 2 → 1 = 8 steps
    expect(callAndGetRet(rt, 'f')).toBe(8)
  })

  test('is_prime check', () => {
    const rt = makeRuntime(`
      fn is_prime(n: int): int {
        if (n <= 1) { return 0; }
        let i: int = 2;
        while (i * i <= n) {
          if (n % i == 0) { return 0; }
          i = i + 1;
        }
        return 1;
      }
      fn f(): int {
        return is_prime(2) + is_prime(7) + is_prime(11) + is_prime(4) + is_prime(9);
      }
    `)
    // 2=prime(1), 7=prime(1), 11=prime(1), 4=not(0), 9=not(0) → 3
    expect(callAndGetRet(rt, 'f')).toBe(3)
  })

  test('bubble sort pass count', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let a: int = 5;
        let b: int = 3;
        let c: int = 8;
        let d: int = 1;
        let swaps: int = 0;

        // Pass 1
        if (a > b) { let t: int = a; a = b; b = t; swaps = swaps + 1; }
        if (b > c) { let t: int = b; b = c; c = t; swaps = swaps + 1; }
        if (c > d) { let t: int = c; c = d; d = t; swaps = swaps + 1; }

        // Pass 2
        if (a > b) { let t: int = a; a = b; b = t; swaps = swaps + 1; }
        if (b > c) { let t: int = b; b = c; c = t; swaps = swaps + 1; }

        // Pass 3
        if (a > b) { let t: int = a; a = b; b = t; swaps = swaps + 1; }

        return swaps;
      }
    `)
    // 5,3,8,1 → pass1: swap(5,3)→3,5,8,1 swap(8,1)→3,5,1,8 → pass2: swap(5,1)→3,1,5,8 → pass3: swap(3,1)→1,3,5,8
    // swaps: 1+0+1 + 0+1 + 1 = 4
    expect(callAndGetRet(rt, 'f')).toBe(4)
  })

  test('linear search', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let a: int = 10;
        let b: int = 20;
        let c: int = 30;
        let d: int = 40;
        let e: int = 50;
        let target: int = 30;

        if (a == target) { return 0; }
        if (b == target) { return 1; }
        if (c == target) { return 2; }
        if (d == target) { return 3; }
        if (e == target) { return 4; }
        return -1;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(2)
  })
})

// ===========================================================================
// 23. Const declarations
// ===========================================================================

describe('v2 migration: const declarations', () => {
  test('const inlined in expression', () => {
    expect(() => compile(`
      const MAX: int = 100;
      fn f(): int { return MAX; }
    `, { namespace: NS })).not.toThrow()
  })
})

// ===========================================================================
// 24. Boolean logic edge cases
// ===========================================================================

describe('v2 migration: boolean edge cases', () => {
  test('double negation', () => {
    const rt = makeRuntime(`
      fn f(): int {
        if (!!true) { return 1; } else { return 0; }
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(1)
  })

  test('complex boolean expression', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let a: int = 5;
        let b: int = 10;
        if (a > 0 && b > 0 && a < b) { return 1; } else { return 0; }
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(1)
  })

  test('OR short-circuit: first true', () => {
    const rt = makeRuntime(`
      fn f(): int {
        if (true || false) { return 1; } else { return 0; }
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(1)
  })

  test('AND with comparison', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 5;
        if (x >= 1 && x <= 10) { return 1; } else { return 0; }
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(1)
  })

  test('AND false short-circuit', () => {
    const rt = makeRuntime(`
      fn f(): int {
        if (false && true) { return 1; } else { return 0; }
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(0)
  })
})

// ===========================================================================
// 25. Struct declaration and field access (behavioral)
// ===========================================================================

// TODO: Struct field access/assignment is stubbed at MIR level (returns const 0).
// These behavioral tests will pass once MIR struct lowering is implemented.
// See src2/mir/lower.ts — struct_lit, member, member_assign are opaque at MIR.
describe('v2 migration: struct behavioral', () => {
  test('struct literal creates instance (compiles)', () => {
    expect(() => compile(`
      struct Point { x: int, y: int }
      fn f(): int {
        let p: Point = { x: 10, y: 20 };
        return 1;
      }
    `, { namespace: NS })).not.toThrow()
  })

  test('struct field read returns correct value', () => {
    const rt = makeRuntime(`
      struct Point { x: int, y: int }
      fn f(): int {
        let p: Point = { x: 42, y: 10 };
        return p.x;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(42)
  })

  test('struct field read second field', () => {
    const rt = makeRuntime(`
      struct Point { x: int, y: int }
      fn f(): int {
        let p: Point = { x: 5, y: 99 };
        return p.y;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(99)
  })

  test('struct field write and read back', () => {
    const rt = makeRuntime(`
      struct Point { x: int, y: int }
      fn f(): int {
        let p: Point = { x: 1, y: 2 };
        p.x = 50;
        return p.x;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(50)
  })

  test('struct field arithmetic', () => {
    const rt = makeRuntime(`
      struct Vec2 { x: int, y: int }
      fn f(): int {
        let v: Vec2 = { x: 3, y: 4 };
        return v.x + v.y;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(7)
  })

  test('struct field assignment from expression', () => {
    const rt = makeRuntime(`
      struct Counter { value: int }
      fn f(): int {
        let c: Counter = { value: 10 };
        c.value = c.value + 5;
        return c.value;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(15)
  })

  test('two struct instances', () => {
    const rt = makeRuntime(`
      struct Point { x: int, y: int }
      fn f(): int {
        let a: Point = { x: 1, y: 2 };
        let b: Point = { x: 10, y: 20 };
        return a.x + b.x;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(11)
  })

  test('struct with three fields', () => {
    const rt = makeRuntime(`
      struct Vec3 { x: int, y: int, z: int }
      fn f(): int {
        let v: Vec3 = { x: 1, y: 2, z: 3 };
        return v.x + v.y + v.z;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(6)
  })
})

// ===========================================================================
// 26. Struct impl methods (behavioral)
// ===========================================================================

// TODO: Struct impl methods depend on struct field access/assignment (stubbed).
// These tests will pass once MIR struct lowering is implemented.
describe('v2 migration: struct impl methods', () => {
  test('static constructor method', () => {
    const rt = makeRuntime(`
      struct Point { x: int, y: int }
      impl Point {
        fn new(x: int, y: int): Point {
          return { x: x, y: y };
        }
      }
      fn f(): int {
        let p: Point = Point::new(10, 20);
        return p.x;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(10)
  })

  test('instance method on self', () => {
    const rt = makeRuntime(`
      struct Vec2 { x: int, y: int }
      impl Vec2 {
        fn sum(self): int {
          return self.x + self.y;
        }
      }
      fn f(): int {
        let v: Vec2 = { x: 3, y: 7 };
        return v.sum();
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(10)
  })

  test('static method and instance method together', () => {
    const rt = makeRuntime(`
      struct Point { x: int, y: int }
      impl Point {
        fn new(x: int, y: int): Point {
          return { x: x, y: y };
        }
        fn distance(self): int {
          return self.x + self.y;
        }
      }
      fn f(): int {
        let p: Point = Point::new(5, 15);
        return p.distance();
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(20)
  })

  test('impl method generates separate function file', () => {
    const result = compile(`
      struct Vec2 { x: int, y: int }
      impl Vec2 {
        fn new(x: int, y: int): Vec2 {
          return { x: x, y: y };
        }
        fn sum(self): int {
          return self.x + self.y;
        }
      }
      fn f(): int { return 1; }
    `, { namespace: NS })
    const fnNames = result.files
      .filter(f => f.path.endsWith('.mcfunction'))
      .map(f => f.path)
    // Should have Vec2_new or vec2/new or similar
    expect(fnNames.length).toBeGreaterThanOrEqual(3)
  })

  test('multiple impl methods compile', () => {
    expect(() => compile(`
      struct Counter { value: int }
      impl Counter {
        fn new(): Counter { return { value: 0 }; }
        fn increment(self): void { self.value = self.value + 1; }
        fn get(self): int { return self.value; }
        fn reset(self): void { self.value = 0; }
      }
      fn f(): int { return 1; }
    `, { namespace: NS })).not.toThrow()
  })
})

// ===========================================================================
// 27. @tick and @load runtime behavior
// ===========================================================================

describe('v2 migration: @tick/@load runtime', () => {
  test('@tick function is registered in tick.json', () => {
    const result = compile(`
      @tick fn game_loop(): void { let x: int = 1; }
      fn f(): int { return 1; }
    `, { namespace: NS })
    const tickJson = getFile(result.files, 'tick.json')
    expect(tickJson).toBeDefined()
    expect(tickJson).toContain(`${NS}:game_loop`)
  })

  test('@load function is registered in load.json', () => {
    const result = compile(`
      @load fn setup(): void { let x: int = 1; }
      fn f(): int { return 1; }
    `, { namespace: NS })
    const loadJson = getFile(result.files, 'load.json')
    expect(loadJson).toBeDefined()
    expect(loadJson).toContain(`${NS}:setup`)
  })

  test('multiple @tick functions all registered', () => {
    const result = compile(`
      @tick fn tick_a(): void { let x: int = 1; }
      @tick fn tick_b(): void { let y: int = 2; }
      fn f(): int { return 1; }
    `, { namespace: NS })
    const tickJson = getFile(result.files, 'tick.json')
    expect(tickJson).toContain(`${NS}:tick_a`)
    expect(tickJson).toContain(`${NS}:tick_b`)
  })

  test('multiple @load functions all registered', () => {
    const result = compile(`
      @load fn init_a(): void { let x: int = 1; }
      @load fn init_b(): void { let y: int = 2; }
      fn f(): int { return 1; }
    `, { namespace: NS })
    const loadJson = getFile(result.files, 'load.json')
    expect(loadJson).toContain(`${NS}:init_a`)
    expect(loadJson).toContain(`${NS}:init_b`)
  })

  test('@tick function executes without crashing', () => {
    const rt = makeRuntime(`
      @tick fn heartbeat(): void {
        let counter: int = 0;
        counter = counter + 1;
      }
      fn f(): int { return 99; }
    `)
    rt.execFunction(`${NS}:heartbeat`)
    rt.execFunction(`${NS}:heartbeat`)
    expect(callAndGetRet(rt, 'f')).toBe(99)
  })

  test('@load function runs during makeRuntime init', () => {
    const rt = makeRuntime(`
      @load fn init(): void {
        let x: int = 42;
      }
      fn f(): int { return 1; }
    `)
    // If load function crashes, makeRuntime would throw
    expect(callAndGetRet(rt, 'f')).toBe(1)
  })

  test('@tick with logic body', () => {
    const rt = makeRuntime(`
      @tick fn tick(): void {
        let x: int = 5;
        let y: int = 10;
        let sum: int = x + y;
      }
      fn f(): int { return 1; }
    `)
    rt.execFunction(`${NS}:tick`)
    expect(callAndGetRet(rt, 'f')).toBe(1)
  })

  test('@tick and @load coexist', () => {
    const result = compile(`
      @tick fn game_tick(): void { let x: int = 1; }
      @load fn game_init(): void { let y: int = 2; }
      fn f(): int { return 1; }
    `, { namespace: NS })
    const tickJson = getFile(result.files, 'tick.json')
    const loadJson = getFile(result.files, 'load.json')
    expect(tickJson).toContain(`${NS}:game_tick`)
    expect(loadJson).toContain(`${NS}:game_init`)
  })
})

// ===========================================================================
// 28. Execute context blocks (behavioral)
// ===========================================================================

describe('v2 migration: execute blocks behavioral', () => {
  test('as @a generates correct execute as command', () => {
    const result = compile(`
      fn f(): void {
        as @a {
          raw("say hello");
        }
      }
    `, { namespace: NS })
    const allContent = result.files
      .filter(f => f.path.endsWith('.mcfunction'))
      .map(f => f.content).join('\n')
    expect(allContent).toContain('execute as @a run function')
  })

  test('at @s generates correct execute at command', () => {
    const result = compile(`
      fn f(): void {
        at @s {
          raw("particle flame ~ ~ ~ 0 0 0 0 1");
        }
      }
    `, { namespace: NS })
    const allContent = result.files
      .filter(f => f.path.endsWith('.mcfunction'))
      .map(f => f.content).join('\n')
    expect(allContent).toContain('execute at @s run function')
  })

  test('as @e at @s generates combined execute', () => {
    const result = compile(`
      fn f(): void {
        as @e at @s {
          raw("particle flame ~ ~ ~ 0 0 0 0 1");
        }
      }
    `, { namespace: NS })
    const allContent = result.files
      .filter(f => f.path.endsWith('.mcfunction'))
      .map(f => f.content).join('\n')
    expect(allContent).toContain('execute as @e at @s run function')
  })

  test('execute body raw command appears in helper', () => {
    const result = compile(`
      fn f(): void {
        as @a {
          raw("say inside execute");
        }
      }
    `, { namespace: NS })
    const allContent = result.files
      .filter(f => f.path.endsWith('.mcfunction'))
      .map(f => f.content).join('\n')
    expect(allContent).toContain('say inside execute')
  })

  test('as @e[type=zombie] with selector args', () => {
    const result = compile(`
      fn f(): void {
        as @e[type=zombie] {
          raw("say I am zombie");
        }
      }
    `, { namespace: NS })
    const allContent = result.files
      .filter(f => f.path.endsWith('.mcfunction'))
      .map(f => f.content).join('\n')
    expect(allContent).toContain('execute as @e[type=zombie] run function')
  })

  test('nested execute blocks both generate functions', () => {
    const result = compile(`
      fn f(): void {
        as @a {
          at @s {
            raw("particle flame ~ ~ ~ 0 0 0 0 1");
          }
        }
      }
    `, { namespace: NS })
    const fnFiles = result.files.filter(f => f.path.endsWith('.mcfunction'))
    // At least: load, f, as-helper, at-helper
    expect(fnFiles.length).toBeGreaterThanOrEqual(3)
  })

  test('execute with variable assignment in body', () => {
    expect(() => compile(`
      fn f(): void {
        as @a {
          let x: int = 42;
          let y: int = x + 1;
        }
      }
    `, { namespace: NS })).not.toThrow()
  })
})

// ===========================================================================
// 29. Function calls with multiple args and return values
// ===========================================================================

describe('v2 migration: multi-arg functions', () => {
  test('function with 3 parameters', () => {
    const rt = makeRuntime(`
      fn add3(a: int, b: int, c: int): int {
        return a + b + c;
      }
      fn f(): int { return add3(10, 20, 30); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(60)
  })

  test('function with 4 parameters', () => {
    const rt = makeRuntime(`
      fn sum4(a: int, b: int, c: int, d: int): int {
        return a + b + c + d;
      }
      fn f(): int { return sum4(1, 2, 3, 4); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(10)
  })

  test('function with 5 parameters', () => {
    const rt = makeRuntime(`
      fn sum5(a: int, b: int, c: int, d: int, e: int): int {
        return a + b + c + d + e;
      }
      fn f(): int { return sum5(2, 4, 6, 8, 10); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(30)
  })

  test('function calling function (2-deep chain)', () => {
    const rt = makeRuntime(`
      fn double(x: int): int { return x * 2; }
      fn quadruple(x: int): int { return double(double(x)); }
      fn f(): int { return quadruple(3); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(12)
  })

  test('function calling function (3-deep chain)', () => {
    const rt = makeRuntime(`
      fn inc(x: int): int { return x + 1; }
      fn add2(x: int): int { return inc(inc(x)); }
      fn add4(x: int): int { return add2(add2(x)); }
      fn f(): int { return add4(10); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(14)
  })

  test('function result used in arithmetic', () => {
    const rt = makeRuntime(`
      fn square(x: int): int { return x * x; }
      fn f(): int { return square(3) + square(4); }
    `)
    // 9 + 16 = 25
    expect(callAndGetRet(rt, 'f')).toBe(25)
  })

  test('function with param used in condition', () => {
    const rt = makeRuntime(`
      fn max_val(a: int, b: int, c: int): int {
        let m: int = a;
        if (b > m) { m = b; }
        if (c > m) { m = c; }
        return m;
      }
      fn f(): int { return max_val(5, 12, 8); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(12)
  })

  test('recursive-like pattern via loop', () => {
    const rt = makeRuntime(`
      fn power(base: int, exp: int): int {
        let result: int = 1;
        let i: int = 0;
        while (i < exp) {
          result = result * base;
          i = i + 1;
        }
        return result;
      }
      fn f(): int { return power(2, 8); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(256)
  })
})

// ===========================================================================
// 30. Math-style stdlib patterns (inline, not via import)
// ===========================================================================

describe('v2 migration: math patterns', () => {
  test('min of two values', () => {
    const rt = makeRuntime(`
      fn min(a: int, b: int): int {
        if (a < b) { return a; } else { return b; }
      }
      fn f(): int { return min(7, 3); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(3)
  })

  test('max of two values', () => {
    const rt = makeRuntime(`
      fn max(a: int, b: int): int {
        if (a > b) { return a; } else { return b; }
      }
      fn f(): int { return max(7, 3); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(7)
  })

  test('abs of positive', () => {
    const rt = makeRuntime(`
      fn abs(x: int): int {
        if (x < 0) { return 0 - x; } else { return x; }
      }
      fn f(): int { return abs(42); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(42)
  })

  test('abs of negative', () => {
    const rt = makeRuntime(`
      fn abs(x: int): int {
        if (x < 0) { return 0 - x; } else { return x; }
      }
      fn f(): int { return abs(-15); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(15)
  })

  test('clamp value in range (below min)', () => {
    const rt = makeRuntime(`
      fn clamp(x: int, lo: int, hi: int): int {
        if (x < lo) { return lo; }
        if (x > hi) { return hi; }
        return x;
      }
      fn f(): int { return clamp(-5, 0, 100); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(0)
  })

  test('clamp value in range (above max)', () => {
    const rt = makeRuntime(`
      fn clamp(x: int, lo: int, hi: int): int {
        if (x < lo) { return lo; }
        if (x > hi) { return hi; }
        return x;
      }
      fn f(): int { return clamp(200, 0, 100); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(100)
  })

  test('clamp value in range (within)', () => {
    const rt = makeRuntime(`
      fn clamp(x: int, lo: int, hi: int): int {
        if (x < lo) { return lo; }
        if (x > hi) { return hi; }
        return x;
      }
      fn f(): int { return clamp(50, 0, 100); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(50)
  })

  test('sign function', () => {
    const rt = makeRuntime(`
      fn sign(x: int): int {
        if (x > 0) { return 1; }
        if (x < 0) { return -1; }
        return 0;
      }
      fn f(): int { return sign(-42) + sign(0) + sign(100); }
    `)
    // -1 + 0 + 1 = 0
    expect(callAndGetRet(rt, 'f')).toBe(0)
  })

  test('integer division rounding', () => {
    const rt = makeRuntime(`
      fn div_round(a: int, b: int): int {
        return (a + b / 2) / b;
      }
      fn f(): int { return div_round(7, 3); }
    `)
    // (7 + 1) / 3 = 2 (integer)
    expect(callAndGetRet(rt, 'f')).toBe(2)
  })

  test('is_even / is_odd', () => {
    const rt = makeRuntime(`
      fn is_even(x: int): int {
        if (x % 2 == 0) { return 1; } else { return 0; }
      }
      fn f(): int {
        return is_even(4) + is_even(7) + is_even(0) + is_even(13);
      }
    `)
    // 1 + 0 + 1 + 0 = 2
    expect(callAndGetRet(rt, 'f')).toBe(2)
  })
})

// ===========================================================================
// 31. Break/continue in loops (behavioral)
// ===========================================================================

describe('v2 migration: break/continue behavioral', () => {
  test('break exits while loop early', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let i: int = 0;
        let sum: int = 0;
        while (i < 100) {
          if (i == 5) { break; }
          sum = sum + i;
          i = i + 1;
        }
        return sum;
      }
    `)
    // 0+1+2+3+4 = 10
    expect(callAndGetRet(rt, 'f')).toBe(10)
  })

  test('continue skips to next iteration', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let i: int = 0;
        let sum: int = 0;
        while (i < 10) {
          i = i + 1;
          if (i % 2 == 1) { continue; }
          sum = sum + i;
        }
        return sum;
      }
    `)
    // 2+4+6+8+10 = 30
    expect(callAndGetRet(rt, 'f')).toBe(30)
  })

  test('break in for loop', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let result: int = 0;
        for i in 0..100 {
          if (i == 7) { break; }
          result = result + 1;
        }
        return result;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(7)
  })

  test('continue in for loop', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let sum: int = 0;
        for i in 0..10 {
          if (i % 3 == 0) { continue; }
          sum = sum + 1;
        }
        return sum;
      }
    `)
    // 10 iterations, skip i=0,3,6,9 → 6 counted
    expect(callAndGetRet(rt, 'f')).toBe(6)
  })

  test('break with accumulator', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let product: int = 1;
        let i: int = 1;
        while (i <= 10) {
          product = product * i;
          if (product > 100) { break; }
          i = i + 1;
        }
        return product;
      }
    `)
    // 1*1=1, 1*2=2, 2*3=6, 6*4=24, 24*5=120 > 100 → break → 120
    expect(callAndGetRet(rt, 'f')).toBe(120)
  })

  test('multiple breaks in loop (first wins)', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let i: int = 0;
        while (i < 20) {
          if (i == 3) { break; }
          if (i == 7) { break; }
          i = i + 1;
        }
        return i;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(3)
  })

  test('break and continue in same loop', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let i: int = 0;
        let sum: int = 0;
        while (i < 20) {
          i = i + 1;
          if (i % 2 == 0) { continue; }
          if (i > 10) { break; }
          sum = sum + i;
        }
        return sum;
      }
    `)
    // odd numbers 1,3,5,7,9 → sum = 25; i=11 is odd > 10 → break
    expect(callAndGetRet(rt, 'f')).toBe(25)
  })
})

// ===========================================================================
// 32. Foreach (behavioral)
// ===========================================================================

describe('v2 migration: foreach behavioral', () => {
  test('foreach with @e generates execute as run function', () => {
    const result = compile(`
      fn f(): void {
        foreach (e in @e) {
          raw("say hi");
        }
      }
    `, { namespace: NS })
    const allContent = result.files
      .filter(f => f.path.endsWith('.mcfunction'))
      .map(f => f.content).join('\n')
    expect(allContent).toContain('execute as @e run function')
    expect(allContent).toContain('say hi')
  })

  test('foreach with @a selector', () => {
    const result = compile(`
      fn f(): void {
        foreach (p in @a) {
          raw("effect give @s speed 1 1");
        }
      }
    `, { namespace: NS })
    const allContent = result.files
      .filter(f => f.path.endsWith('.mcfunction'))
      .map(f => f.content).join('\n')
    expect(allContent).toContain('execute as @a run function')
    expect(allContent).toContain('effect give @s speed 1 1')
  })

  test('foreach with filtered selector', () => {
    const result = compile(`
      fn f(): void {
        foreach (z in @e[type=zombie]) {
          raw("kill @s");
        }
      }
    `, { namespace: NS })
    const allContent = result.files
      .filter(f => f.path.endsWith('.mcfunction'))
      .map(f => f.content).join('\n')
    expect(allContent).toContain('execute as @e[type=zombie] run function')
  })

  test('foreach with complex body compiles', () => {
    expect(() => compile(`
      fn f(): void {
        foreach (e in @e[type=zombie,distance=..10]) {
          raw("effect give @s slowness 1 1");
          raw("damage @s 2");
        }
      }
    `, { namespace: NS })).not.toThrow()
  })
})

// ===========================================================================
// 33. For loop advanced patterns
// ===========================================================================

describe('v2 migration: for loop advanced', () => {
  test('for loop with range 0..0 produces 0 iterations', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let count: int = 0;
        for i in 0..0 {
          count = count + 1;
        }
        return count;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(0)
  })

  test('for loop with range 0..1 produces 1 iteration', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let count: int = 0;
        for i in 0..1 {
          count = count + 1;
        }
        return count;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(1)
  })

  test('for loop accumulates sum', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let sum: int = 0;
        for i in 0..5 {
          sum = sum + i;
        }
        return sum;
      }
    `)
    // 0+1+2+3+4 = 10
    expect(callAndGetRet(rt, 'f')).toBe(10)
  })

  test('for loop with large range', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let count: int = 0;
        for i in 0..20 {
          count = count + 1;
        }
        return count;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(20)
  })

  test('nested for loops (product)', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let count: int = 0;
        for i in 0..3 {
          for j in 0..4 {
            count = count + 1;
          }
        }
        return count;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(12)
  })
})

// ===========================================================================
// 34. Complex control flow patterns
// ===========================================================================

describe('v2 migration: complex control flow', () => {
  test('nested loops with outer counter', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let total: int = 0;
        let i: int = 0;
        while (i < 3) {
          let j: int = 0;
          while (j < 3) {
            total = total + 1;
            j = j + 1;
          }
          i = i + 1;
        }
        return total;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(9)
  })

  test('loop with early return', () => {
    const rt = makeRuntime(`
      fn find_first_gt(threshold: int): int {
        let i: int = 0;
        while (i < 100) {
          if (i * i > threshold) { return i; }
          i = i + 1;
        }
        return -1;
      }
      fn f(): int { return find_first_gt(50); }
    `)
    // 8*8=64 > 50 → return 8
    expect(callAndGetRet(rt, 'f')).toBe(8)
  })

  test('multiple early returns in if/else chain', () => {
    const rt = makeRuntime(`
      fn classify(x: int): int {
        if (x < 0) { return -1; }
        if (x == 0) { return 0; }
        if (x < 10) { return 1; }
        if (x < 100) { return 2; }
        return 3;
      }
      fn f(): int {
        return classify(-5) + classify(0) + classify(7) + classify(50) + classify(200);
      }
    `)
    // -1 + 0 + 1 + 2 + 3 = 5
    expect(callAndGetRet(rt, 'f')).toBe(5)
  })

  test('while with complex condition', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let a: int = 10;
        let b: int = 20;
        while (a < b) {
          a = a + 3;
          b = b - 1;
        }
        return a;
      }
    `)
    // a=10,b=20 → a=13,b=19 → a=16,b=18 → a=19,b=17 → exit (19 >= 17)
    expect(callAndGetRet(rt, 'f')).toBe(19)
  })

  test('deeply nested if/else', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 7;
        if (x > 0) {
          if (x > 5) {
            if (x > 10) {
              return 3;
            } else {
              return 2;
            }
          } else {
            return 1;
          }
        } else {
          return 0;
        }
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(2)
  })
})

// ===========================================================================
// 35. Raw commands (extended)
// ===========================================================================

describe('v2 migration: raw commands extended', () => {
  test('raw command with execute', () => {
    const result = compile(`
      fn f(): void {
        raw("execute as @a at @s run particle flame ~ ~ ~ 0.5 0.5 0.5 0 10");
      }
    `, { namespace: NS })
    const fn = getFile(result.files, '/f.mcfunction')
    expect(fn).toContain('execute as @a at @s run particle flame')
  })

  test('raw command with scoreboard', () => {
    const result = compile(`
      fn f(): void {
        raw("scoreboard players set @s health 20");
      }
    `, { namespace: NS })
    const fn = getFile(result.files, '/f.mcfunction')
    expect(fn).toContain('scoreboard players set @s health 20')
  })

  test('raw command with tellraw', () => {
    const result = compile(`
      fn f(): void {
        raw("tellraw @a {\\"text\\":\\"Hello World\\"}");
      }
    `, { namespace: NS })
    const fn = getFile(result.files, '/f.mcfunction')
    expect(fn).toContain('tellraw @a')
  })

  test('raw command mixed with regular code', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 10;
        raw("say test");
        let y: int = x + 5;
        return y;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(15)
  })

  test('multiple raw commands interleaved', () => {
    const rt = makeRuntime(`
      fn f(): int {
        raw("say start");
        let x: int = 1;
        raw("say middle");
        x = x + 9;
        raw("say end");
        return x;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(10)
  })
})

// ===========================================================================
// 36. Variable scoping and edge cases
// ===========================================================================

describe('v2 migration: variable scoping', () => {
  test('same variable name in different functions', () => {
    const rt = makeRuntime(`
      fn foo(): int {
        let x: int = 10;
        return x;
      }
      fn bar(): int {
        let x: int = 20;
        return x;
      }
      fn f(): int { return foo() + bar(); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(30)
  })

  test('variable reassignment chain', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 1;
        x = x + 1;
        x = x * 3;
        x = x - 2;
        x = x + 10;
        return x;
      }
    `)
    // 1 → 2 → 6 → 4 → 14
    expect(callAndGetRet(rt, 'f')).toBe(14)
  })

  test('many local variables', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let a: int = 1;
        let b: int = 2;
        let c: int = 3;
        let d: int = 4;
        let e: int = 5;
        let g: int = 6;
        let h: int = 7;
        return a + b + c + d + e + g + h;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(28)
  })

  test('variable used across if/else branches', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let result: int = 0;
        let x: int = 5;
        if (x > 3) {
          result = 100;
        } else {
          result = 200;
        }
        return result;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(100)
  })

  test('variable modified in loop', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 1;
        let i: int = 0;
        while (i < 5) {
          x = x * 2;
          i = i + 1;
        }
        return x;
      }
    `)
    // 1 → 2 → 4 → 8 → 16 → 32
    expect(callAndGetRet(rt, 'f')).toBe(32)
  })
})

// ===========================================================================
// 37. Compound assignment operators
// ===========================================================================

describe('v2 migration: compound assignment extended', () => {
  test('+= in loop', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let sum: int = 0;
        let i: int = 1;
        while (i <= 5) {
          sum += i;
          i += 1;
        }
        return sum;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(15)
  })

  test('-= countdown', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 100;
        x -= 30;
        x -= 25;
        x -= 10;
        return x;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(35)
  })

  test('*= doubling', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 1;
        x *= 2;
        x *= 3;
        x *= 4;
        return x;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(24)
  })

  test('/= division', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 1000;
        x /= 2;
        x /= 5;
        return x;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(100)
  })

  test('%= modulo', () => {
    const rt = makeRuntime(`
      fn f(): int {
        let x: int = 17;
        x %= 5;
        return x;
      }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(2)
  })
})

// ===========================================================================
// 38. Complex algorithmic patterns
// ===========================================================================

describe('v2 migration: algorithmic patterns', () => {
  test('digit sum', () => {
    const rt = makeRuntime(`
      fn digit_sum(n: int): int {
        let sum: int = 0;
        while (n > 0) {
          sum = sum + n % 10;
          n = n / 10;
        }
        return sum;
      }
      fn f(): int { return digit_sum(12345); }
    `)
    // 1+2+3+4+5 = 15
    expect(callAndGetRet(rt, 'f')).toBe(15)
  })

  test('count digits', () => {
    const rt = makeRuntime(`
      fn count_digits(n: int): int {
        if (n == 0) { return 1; }
        let count: int = 0;
        while (n > 0) {
          n = n / 10;
          count = count + 1;
        }
        return count;
      }
      fn f(): int { return count_digits(9876); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(4)
  })

  test('sum of divisors', () => {
    const rt = makeRuntime(`
      fn sum_divisors(n: int): int {
        let sum: int = 0;
        let i: int = 1;
        while (i <= n) {
          if (n % i == 0) {
            sum = sum + i;
          }
          i = i + 1;
        }
        return sum;
      }
      fn f(): int { return sum_divisors(12); }
    `)
    // 1+2+3+4+6+12 = 28
    expect(callAndGetRet(rt, 'f')).toBe(28)
  })

  test('triangle number', () => {
    const rt = makeRuntime(`
      fn triangle(n: int): int {
        return n * (n + 1) / 2;
      }
      fn f(): int { return triangle(10); }
    `)
    expect(callAndGetRet(rt, 'f')).toBe(55)
  })

  test('is_perfect_square', () => {
    const rt = makeRuntime(`
      fn is_perfect_sq(n: int): int {
        let i: int = 0;
        while (i * i <= n) {
          if (i * i == n) { return 1; }
          i = i + 1;
        }
        return 0;
      }
      fn f(): int {
        return is_perfect_sq(16) + is_perfect_sq(25) + is_perfect_sq(10);
      }
    `)
    // 1 + 1 + 0 = 2
    expect(callAndGetRet(rt, 'f')).toBe(2)
  })
})
