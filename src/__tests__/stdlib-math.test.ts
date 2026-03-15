/**
 * stdlib/math.mcrs — Runtime behavioural tests
 *
 * Each test compiles the math stdlib together with a small driver function,
 * runs it through MCRuntime, and checks scoreboard values.
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../compile'
import { MCRuntime } from '../runtime'

const MATH_SRC = fs.readFileSync(
  path.join(__dirname, '../../src/stdlib/math.mcrs'),
  'utf-8'
)

function run(driver: string): MCRuntime {
  // Use librarySources so math functions are only compiled when actually called
  const result = compile(driver, { namespace: 'mathtest', librarySources: [MATH_SRC] })
  // v2: compile() throws on error; success is always true if we reach here
  const runtime = new MCRuntime('mathtest')
  for (const file of result.files ?? []) {
    if (!file.path.endsWith('.mcfunction')) continue
    const match = file.path.match(/data\/([^/]+)\/function\/(.+)\.mcfunction$/)
    if (!match) continue
    runtime.loadFunction(`${match[1]}:${match[2]}`, file.content.split('\n'))
  }
  runtime.load()
  return runtime
}

function scoreOf(rt: MCRuntime, key: string): number {
  return rt.getScore('out', `mathtest.${key}`)
}

// ─── abs ─────────────────────────────────────────────────────────────────────

describe('abs', () => {
  it('abs of positive', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", abs(42)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(42)
  })

  it('abs of negative', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", abs(-7)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(7)
  })

  it('abs of zero', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", abs(0)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(0)
  })
})

// ─── sign ────────────────────────────────────────────────────────────────────

describe('sign', () => {
  it.each([
    [5, 1],
    [-3, -1],
    [0, 0],
  ])('sign(%d) == %d', (x, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", sign(${x})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

// ─── min / max ───────────────────────────────────────────────────────────────

describe('min', () => {
  it.each([
    [3, 7, 3],
    [7, 3, 3],
    [5, 5, 5],
    [-2, 0, -2],
  ])('min(%d, %d) == %d', (a, b, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", min(${a}, ${b})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

describe('max', () => {
  it.each([
    [3, 7, 7],
    [7, 3, 7],
    [5, 5, 5],
    [-2, 0, 0],
  ])('max(%d, %d) == %d', (a, b, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", max(${a}, ${b})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

// ─── clamp ───────────────────────────────────────────────────────────────────

describe('clamp', () => {
  it.each([
    [5, 0, 10, 5],   // in range
    [-5, 0, 10, 0],  // below lo
    [15, 0, 10, 10], // above hi
    [0, 0, 10, 0],   // at lo
    [10, 0, 10, 10], // at hi
  ])('clamp(%d, %d, %d) == %d', (x, lo, hi, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", clamp(${x}, ${lo}, ${hi})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

// ─── lerp ────────────────────────────────────────────────────────────────────

describe('lerp', () => {
  it.each([
    [0, 1000, 0, 0],      // t=0 → a
    [0, 1000, 1000, 1000], // t=1000 → b
    [0, 1000, 500, 500],   // t=0.5 → midpoint
    [100, 200, 750, 175],  // 100 + (200-100)*0.75 = 175
    [0, 100, 333, 33],     // integer division truncation
  ])('lerp(%d, %d, %d) == %d', (a, b, t, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", lerp(${a}, ${b}, ${t})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

// ─── isqrt ───────────────────────────────────────────────────────────────────

describe('isqrt', () => {
  it.each([
    [0, 0],
    [1, 1],
    [4, 2],
    [9, 3],
    [10, 3],  // floor
    [16, 4],
    [24, 4],  // floor
    [25, 5],
    [100, 10],
    [1000000, 1000],
  ])('isqrt(%d) == %d', (n, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", isqrt(${n})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

// ─── sqrt_fixed ──────────────────────────────────────────────────────────────

describe('sqrt_fixed (scale=1000)', () => {
  it.each([
    [1000, 1000],  // sqrt(1.0) = 1.0
    [4000, 2000],  // sqrt(4.0) = 2.0
    [2000, 1414],  // sqrt(2.0) ≈ 1.414 (truncated)
    [9000, 3000],  // sqrt(9.0) = 3.0
  ])('sqrt_fixed(%d) ≈ %d', (x, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", sqrt_fixed(${x})); }`)
    rt.execFunction('test')
    // Allow ±1 from integer truncation
    expect(Math.abs(scoreOf(rt, 'r') - expected)).toBeLessThanOrEqual(1)
  })
})

// ─── pow_int ─────────────────────────────────────────────────────────────────

describe('pow_int', () => {
  it.each([
    [2, 0, 1],
    [2, 1, 2],
    [2, 10, 1024],
    [3, 3, 27],
    [5, 4, 625],
    [10, 5, 100000],
    [7, 0, 1],
    [1, 100, 1],
  ])('pow_int(%d, %d) == %d', (base, exp, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", pow_int(${base}, ${exp})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

// ─── gcd ─────────────────────────────────────────────────────────────────────

describe('gcd', () => {
  it.each([
    [12, 8, 4],
    [7, 5, 1],
    [100, 25, 25],
    [0, 5, 5],
    [5, 0, 5],
    [12, 12, 12],
    [-12, 8, 4],  // abs handled internally
  ])('gcd(%d, %d) == %d', (a, b, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", gcd(${a}, ${b})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

// ─── Phase 4: Number theory & utilities ──────────────────────────────────────

describe('lcm', () => {
  it.each([
    [4, 6, 12],
    [3, 5, 15],
    [0, 5, 0],
    [12, 12, 12],
    [7, 1, 7],
  ])('lcm(%d, %d) == %d', (a, b, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", lcm(${a}, ${b})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

describe('map', () => {
  it.each([
    [5,  0, 10,  0, 100, 50],
    [0,  0, 10,  0, 100, 0],
    [10, 0, 10,  0, 100, 100],
    [1,  0, 10, 100, 200, 110],
    [5,  0, 10, -100, 100, 0],
  ])('map(%d, %d, %d, %d, %d) == %d', (x, il, ih, ol, oh, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", map(${x}, ${il}, ${ih}, ${ol}, ${oh})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

describe('ceil_div', () => {
  it.each([
    [7, 3, 3],
    [6, 3, 2],
    [9, 3, 3],
    [1, 5, 1],
    [10, 10, 1],
  ])('ceil_div(%d, %d) == %d', (a, b, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", ceil_div(${a}, ${b})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

describe('log2_int', () => {
  it.each([
    [1, 0],
    [2, 1],
    [4, 2],
    [8, 3],
    [7, 2],
    [1024, 10],
    [0, -1],
  ])('log2_int(%d) == %d', (n, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", log2_int(${n})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

// ─── Phase 3: Trigonometry ────────────────────────────────────────────────────
// MCRuntime doesn't support real NBT storage macro functions (data get storage
// path[$(i)]) — those require Minecraft 1.20.2+.
// We test what we can: compile-only + sin table initialisation check,
// and verify sin_fixed output for key angles where the MCRuntime
// can simulate the scoreboard value after we manually stub the lookup.

describe('sin table init', () => {
  it('_math_init in __load when sin_fixed is called (via librarySources)', () => {
    const mathSrc = require('fs').readFileSync(require('path').join(__dirname, '../../src/stdlib/math.mcrs'), 'utf-8')
    const result = require('../compile').compile(
      'fn test() { scoreboard_set("out", "r", sin_fixed(30)); }',
      { namespace: 'mathtest', librarySources: [mathSrc] }
    )
    expect(result.success).toBe(true)
    const hasSinTable = result.files?.some((f: any) =>
      f.content?.includes('data modify storage math:tables sin set value')
    )
    expect(hasSinTable).toBe(true)
  })

  it('_math_init NOT in output when sin_fixed is not used (library DCE)', () => {
    const mathSrc = require('fs').readFileSync(require('path').join(__dirname, '../../src/stdlib/math.mcrs'), 'utf-8')
    const result = require('../compile').compile(
      'fn test() { scoreboard_set("out", "r", abs(-5)); }',
      { namespace: 'mathtest', librarySources: [mathSrc] }
    )
    expect(result.success).toBe(true)
    const hasSinTable = result.files?.some((f: any) =>
      f.content?.includes('data modify storage math:tables sin set value')
    )
    expect(hasSinTable).toBe(false)
  })
})

describe('sin_fixed compile check', () => {
  it('sin_fixed compiles without errors', () => {
    const mathSrc = require('fs').readFileSync(require('path').join(__dirname, '../../src/stdlib/math.mcrs'), 'utf-8')
    const result = require('../compile').compile(
      'fn test() { scoreboard_set("out", "r", sin_fixed(30)); }',
      { namespace: 'mathtest', librarySources: [mathSrc] }
    )
    expect(result.success).toBe(true)
  })

  it('cos_fixed compiles without errors', () => {
    const mathSrc = require('fs').readFileSync(require('path').join(__dirname, '../../src/stdlib/math.mcrs'), 'utf-8')
    const result = require('../compile').compile(
      'fn test() { scoreboard_set("out", "r", cos_fixed(0)); }',
      { namespace: 'mathtest', librarySources: [mathSrc] }
    )
    expect(result.success).toBe(true)
  })
})

// ─── Phase 5: Vectors, directions & easing ───────────────────────────────────

describe('mulfix / divfix', () => {
  it.each([
    [500, 707, 353],   // 0.5 × 0.707 ≈ 0.353
    [1000, 1000, 1000],
    [1000, 500, 500],
    [0, 999, 0],
  ])('mulfix(%d, %d) == %d', (a, b, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", mulfix(${a}, ${b})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })

  it.each([
    [1, 3, 333],
    [1, 2, 500],
    [2, 1, 2000],
    [0, 5, 0],
  ])('divfix(%d, %d) == %d', (a, b, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", divfix(${a}, ${b})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

// dot2d, cross2d, length2d_fixed, manhattan, chebyshev, atan2_fixed
// have moved to vec.mcrs — tested in stdlib-vec.test.ts

describe('smoothstep', () => {
  it.each([
    [0,   0],
    [100, 1000],
    [50,  500],  // midpoint: 3×0.5²−2×0.5³ = 0.5 → 500
  ])('smoothstep(0,100,%d) == %d', (x, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", smoothstep(0, 100, ${x})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })

  it('smoothstep is monotonically increasing', () => {
    let prev = -1
    for (const x of [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
      const rt = run(`fn test() { scoreboard_set("out", "r", smoothstep(0, 100, ${x})); }`)
      rt.execFunction('test')
      const v = scoreOf(rt, 'r')
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })
})

// atan2_fixed / _atan_init tests moved to stdlib-vec.test.ts
