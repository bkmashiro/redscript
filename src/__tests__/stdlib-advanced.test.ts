/**
 * stdlib/advanced.mcrs — runtime behavioural tests
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../compile'
import { MCRuntime } from '../runtime'

const MATH_SRC = fs.readFileSync(path.join(__dirname, '../../src/stdlib/math.mcrs'), 'utf-8')
const ADV_SRC  = fs.readFileSync(path.join(__dirname, '../../src/stdlib/advanced.mcrs'), 'utf-8')

function run(driver: string): MCRuntime {
  const result = compile(driver, {
    namespace: 'advtest',
    librarySources: [MATH_SRC, ADV_SRC],
  })
  if (!result.success) throw new Error(result.error?.message ?? 'compile failed')
  const rt = new MCRuntime('advtest')
  for (const file of result.files ?? []) {
    if (!file.path.endsWith('.mcfunction')) continue
    const match = file.path.match(/data\/([^/]+)\/function\/(.+)\.mcfunction$/)
    if (!match) continue
    rt.loadFunction(`${match[1]}:${match[2]}`, file.content.split('\n'))
  }
  rt.load()
  return rt
}

function scoreOf(rt: MCRuntime, key: string): number {
  return rt.getScore('out', `advtest.${key}`)
}

// ─── fib ─────────────────────────────────────────────────────────────────────

describe('fib', () => {
  it.each([
    [0,  0],
    [1,  1],
    [2,  1],
    [5,  5],
    [10, 55],
    [20, 6765],
  ])('fib(%d) == %d', (n, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", fib(${n})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

// ─── is_prime ─────────────────────────────────────────────────────────────────

describe('is_prime', () => {
  it.each([
    [0, 0], [1, 0], [2, 1], [3, 1], [4, 0],
    [7, 1], [9, 0], [11, 1], [97, 1], [100, 0],
  ])('is_prime(%d) == %d', (n, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", is_prime(${n})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

// ─── collatz_steps ───────────────────────────────────────────────────────────

describe('collatz_steps', () => {
  it.each([
    [1,  0],
    [2,  1],
    [4,  2],
    [6,  8],
    [27, 111],
  ])('collatz_steps(%d) == %d', (n, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", collatz_steps(${n})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

// ─── digit helpers ───────────────────────────────────────────────────────────

describe('digit_sum', () => {
  it.each([
    [0, 0], [1, 1], [9, 9], [123, 6], [999, 27], [-42, 6],
  ])('digit_sum(%d) == %d', (n, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", digit_sum(${n})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

describe('count_digits', () => {
  it.each([
    [0, 1], [9, 1], [10, 2], [100, 3], [9999, 4],
  ])('count_digits(%d) == %d', (n, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", count_digits(${n})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

describe('reverse_int', () => {
  it.each([
    [12345, 54321],
    [100,   1],
    [7,     7],
  ])('reverse_int(%d) == %d', (n, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", reverse_int(${n})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

// ─── mod_pow ─────────────────────────────────────────────────────────────────

describe('mod_pow', () => {
  it.each([
    [2, 10, 1000, 24],    // 2^10 = 1024, 1024 mod 1000 = 24
    [3,  4,  100, 81],    // 3^4 = 81
    [2,  0,   10,  1],    // any^0 = 1
    [5,  1,  100, 5],
    [7,  3,   13, 343 % 13],  // 343 mod 13 = 5
  ])('mod_pow(%d,%d,%d) == %d', (b, e, m, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", mod_pow(${b},${e},${m})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

// ─── hash_int ────────────────────────────────────────────────────────────────

describe('hash_int', () => {
  it('is deterministic', () => {
    const rt1 = run(`fn test() { scoreboard_set("out", "r", hash_int(42)); }`)
    rt1.execFunction('test')
    const rt2 = run(`fn test() { scoreboard_set("out", "r", hash_int(42)); }`)
    rt2.execFunction('test')
    expect(scoreOf(rt1, 'r')).toBe(scoreOf(rt2, 'r'))
  })

  it('different inputs → different outputs', () => {
    const rt = run(`fn test() {
      scoreboard_set("out", "a", hash_int(0));
      scoreboard_set("out", "b", hash_int(1));
      scoreboard_set("out", "c", hash_int(1000));
    }`)
    rt.execFunction('test')
    const a = scoreOf(rt, 'a')
    const b = scoreOf(rt, 'b')
    const c = scoreOf(rt, 'c')
    expect(a).not.toBe(b)
    expect(b).not.toBe(c)
  })

  it('output is non-negative', () => {
    for (const n of [-1000, -1, 0, 1, 999, 46340]) {
      const rt = run(`fn test() { scoreboard_set("out", "r", hash_int(${n})); }`)
      rt.execFunction('test')
      expect(scoreOf(rt, 'r')).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─── noise1d ─────────────────────────────────────────────────────────────────

describe('noise1d', () => {
  it('output in [0, 999]', () => {
    for (const x of [0, 100, 500, 999, 1000, 2000]) {
      const rt = run(`fn test() { scoreboard_set("out", "r", noise1d(${x})); }`)
      rt.execFunction('test')
      const v = scoreOf(rt, 'r')
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1000)
    }
  })

  it('is deterministic', () => {
    const rt1 = run(`fn test() { scoreboard_set("out", "r", noise1d(1234)); }`)
    rt1.execFunction('test')
    const rt2 = run(`fn test() { scoreboard_set("out", "r", noise1d(1234)); }`)
    rt2.execFunction('test')
    expect(scoreOf(rt1, 'r')).toBe(scoreOf(rt2, 'r'))
  })
})

// ─── bezier ──────────────────────────────────────────────────────────────────

describe('bezier_quad', () => {
  it.each([
    [0, 500, 1000, 0,    0],     // t=0: start
    [0, 500, 1000, 1000, 1000],  // t=1000: end
    [0, 1000, 0,   500,  500],   // arch midpoint
  ])('bezier_quad(%d,%d,%d,t=%d) == %d', (p0, p1, p2, t, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", bezier_quad(${p0},${p1},${p2},${t})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

describe('bezier_cubic', () => {
  it('t=0: start', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", bezier_cubic(0,333,667,1000,0)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(0)
  })
  it('t=1000: end', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", bezier_cubic(0,333,667,1000,1000)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(1000)
  })
})

// ─── mandelbrot_iter ─────────────────────────────────────────────────────────

describe('mandelbrot_iter', () => {
  // c = 0 + 0i → always in set (z always 0)
  it('origin (0,0) stays bounded for max_iter=20', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", mandelbrot_iter(0,0,20)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(20)
  })

  // c = 2 + 0i → escapes immediately (|z1| = 2, |z2| = 6 > 2)
  it('c=(2000,0) escapes quickly', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", mandelbrot_iter(2000,0,50)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBeLessThan(5)
  })

  // c = -1 + 0i → stays bounded (period-2 cycle: 0 → -1 → 0 → ...)
  it('c=(-1000,0) is in the set', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", mandelbrot_iter(-1000,0,50)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(50)
  })

  // c = 0.5 + 0.5i → escapes
  it('c=(500,500) escapes before max_iter=100', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", mandelbrot_iter(500,500,100)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBeLessThan(100)
  })
})

// ─── julia_iter ──────────────────────────────────────────────────────────────

describe('julia_iter', () => {
  it('z0=(0,0) with c=(0,0) stays bounded', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", julia_iter(0,0,0,0,20)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(20)
  })

  it('z0=(3000,0) escapes immediately', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", julia_iter(3000,0,0,0,20)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(0)
  })
})

// ─── Experiment: cross-stdlib (vec + math + advanced) ────────────────────────

const VEC_SRC = fs.readFileSync(path.join(__dirname, '../../src/stdlib/vec.mcrs'), 'utf-8')

function runAll(driver: string): MCRuntime {
  const result = compile(driver, {
    namespace: 'exptest',
    librarySources: [MATH_SRC, VEC_SRC, ADV_SRC],
  })
  if (!result.success) throw new Error(result.error?.message ?? 'compile failed: ' + result.error?.message)
  const rt = new MCRuntime('exptest')
  for (const file of result.files ?? []) {
    if (!file.path.endsWith('.mcfunction')) continue
    const match = file.path.match(/data\/([^/]+)\/function\/(.+)\.mcfunction$/)
    if (!match) continue
    rt.loadFunction(`${match[1]}:${match[2]}`, file.content.split('\n'))
  }
  rt.load()
  return rt
}

function exp(rt: MCRuntime, key: string): number {
  return rt.getScore('out', `exptest.${key}`) ?? 0
}

describe('newton_sqrt', () => {
  it('newton_sqrt(25) == 5', () => {
    const rt = runAll(`fn test() { scoreboard_set("out", "r", newton_sqrt(25)); }`)
    rt.execFunction('test')
    expect(exp(rt, 'r')).toBe(5)
  })
  it('newton_sqrt(100) == 10', () => {
    const rt = runAll(`fn test() { scoreboard_set("out", "r", newton_sqrt(100)); }`)
    rt.execFunction('test')
    expect(exp(rt, 'r')).toBe(10)
  })
  it('newton_sqrt(2) == 1', () => {
    const rt = runAll(`fn test() { scoreboard_set("out", "r", newton_sqrt(2)); }`)
    rt.execFunction('test')
    expect(exp(rt, 'r')).toBe(1)
  })
  it('newton_sqrt(0) == 0', () => {
    const rt = runAll(`fn test() { scoreboard_set("out", "r", newton_sqrt(0)); }`)
    rt.execFunction('test')
    expect(exp(rt, 'r')).toBe(0)
  })
})

describe('digital_root', () => {
  it('digital_root(493) == 7', () => {
    const rt = runAll(`fn test() { scoreboard_set("out", "r", digital_root(493)); }`)
    rt.execFunction('test')
    expect(exp(rt, 'r')).toBe(7)
  })
  it('digital_root(9) == 9', () => {
    const rt = runAll(`fn test() { scoreboard_set("out", "r", digital_root(9)); }`)
    rt.execFunction('test')
    expect(exp(rt, 'r')).toBe(9)
  })
  it('digital_root(0) == 0', () => {
    const rt = runAll(`fn test() { scoreboard_set("out", "r", digital_root(0)); }`)
    rt.execFunction('test')
    expect(exp(rt, 'r')).toBe(0)
  })
})

describe('spiral_ring', () => {
  it('spiral_ring(1) == 0', () => {
    const rt = runAll(`fn test() { scoreboard_set("out", "r", spiral_ring(1)); }`)
    rt.execFunction('test')
    expect(exp(rt, 'r')).toBe(0)
  })
  it('spiral_ring(9) == 1', () => {
    const rt = runAll(`fn test() { scoreboard_set("out", "r", spiral_ring(9)); }`)
    rt.execFunction('test')
    expect(exp(rt, 'r')).toBe(1)
  })
  it('spiral_ring(25) == 2', () => {
    const rt = runAll(`fn test() { scoreboard_set("out", "r", spiral_ring(25)); }`)
    rt.execFunction('test')
    expect(exp(rt, 'r')).toBe(2)
  })
})

describe('clamp_circle', () => {
  it('point inside: clamp_circle_x(3,4,10) == 3', () => {
    const rt = runAll(`fn test() { scoreboard_set("out", "r", clamp_circle_x(3, 4, 10)); }`)
    rt.execFunction('test')
    expect(exp(rt, 'r')).toBe(3)
  })
  it('point outside: clamp_circle_x(600,0,500) == 500', () => {
    const rt = runAll(`fn test() { scoreboard_set("out", "r", clamp_circle_x(600, 0, 500)); }`)
    rt.execFunction('test')
    expect(exp(rt, 'r')).toBe(500)
  })
  it('clamp_circle_y(0,600,500) == 500', () => {
    const rt = runAll(`fn test() { scoreboard_set("out", "r", clamp_circle_y(0, 600, 500)); }`)
    rt.execFunction('test')
    expect(exp(rt, 'r')).toBe(500)
  })
})

describe('angle_between', () => {
  it('perpendicular vectors: angle_between(1000,0,0,1000) == 90', () => {
    const rt = runAll(`fn test() { scoreboard_set("out", "r", angle_between(1000, 0, 0, 1000)); }`)
    rt.execFunction('test')
    expect(exp(rt, 'r')).toBe(90)
  })
  it('parallel vectors: angle_between(1000,0,1000,0) == 0', () => {
    const rt = runAll(`fn test() { scoreboard_set("out", "r", angle_between(1000, 0, 1000, 0)); }`)
    rt.execFunction('test')
    expect(exp(rt, 'r')).toBe(0)
  })
  it('opposite vectors: angle_between(1000,0,-1000,0) == 180', () => {
    const rt = runAll(`fn test() { scoreboard_set("out", "r", angle_between(1000, 0, -1000, 0)); }`)
    rt.execFunction('test')
    expect(exp(rt, 'r')).toBe(180)
  })
})
