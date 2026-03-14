/**
 * stdlib/vec.mcrs — runtime behavioural tests
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../compile'
import { MCRuntime } from '../runtime'

const MATH_SRC = fs.readFileSync(path.join(__dirname, '../../src/stdlib/math.mcrs'), 'utf-8')
const VEC_SRC  = fs.readFileSync(path.join(__dirname, '../../src/stdlib/vec.mcrs'),  'utf-8')

function run(driver: string): MCRuntime {
  const result = compile(driver, {
    namespace: 'vectest',
    librarySources: [MATH_SRC, VEC_SRC],
  })
  if (!result.success) throw new Error(result.error?.message ?? 'compile failed')
  const rt = new MCRuntime('vectest')
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
  return rt.getScore('out', `vectest.${key}`)
}

// ─── 2D basic ────────────────────────────────────────────────────────────────

describe('dot2d', () => {
  it('dot2d(3,4,3,4) == 25', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", dot2d(3,4,3,4)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(25)
  })
  it('perpendicular == 0', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", dot2d(1,0,0,1)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(0)
  })
})

describe('cross2d', () => {
  it('cross2d(1,0,0,1) == 1', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", cross2d(1,0,0,1)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(1)
  })
  it('cross2d parallel == 0', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", cross2d(3,0,6,0)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(0)
  })
})

describe('length2d_fixed', () => {
  it.each([
    [3, 4, 5000],
    [0, 5, 5000],
    [5, 0, 5000],
    [1, 1, 1414],
  ])('length2d_fixed(%d,%d) == %d', (x, y, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", length2d_fixed(${x},${y})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

describe('distance2d_fixed', () => {
  it('distance2d_fixed(0,0,3,4) == 5000', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", distance2d_fixed(0,0,3,4)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(5000)
  })
  it('distance2d_fixed(p,p) == 0', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", distance2d_fixed(5,7,5,7)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(0)
  })
})

describe('manhattan', () => {
  it.each([
    [0,0,3,4, 7],
    [0,0,0,5, 5],
    [1,1,1,1, 0],
  ])('manhattan(%d,%d,%d,%d) == %d', (x1,y1,x2,y2,e) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", manhattan(${x1},${y1},${x2},${y2})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(e)
  })
})

describe('chebyshev', () => {
  it.each([
    [0,0,3,4, 4],
    [0,0,4,3, 4],
    [0,0,5,5, 5],
  ])('chebyshev(%d,%d,%d,%d) == %d', (x1,y1,x2,y2,e) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", chebyshev(${x1},${y1},${x2},${y2})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(e)
  })
})

describe('normalize2d', () => {
  it('normalize2d_x(3,4) == 600', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", normalize2d_x(3,4)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(600)
  })
  it('normalize2d_y(3,4) == 800', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", normalize2d_y(3,4)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(800)
  })
  it('zero vector → 0', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", normalize2d_x(0,0)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(0)
  })
})

describe('lerp2d', () => {
  it('lerp2d_x midpoint', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", lerp2d_x(0,0,100,200,500)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(50)
  })
  it('lerp2d_y midpoint', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", lerp2d_y(0,0,100,200,500)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(100)
  })
})

// ─── 2D direction ────────────────────────────────────────────────────────────

describe('atan2_fixed', () => {
  it.each([
    [0,  1,   0],
    [1,  0,  90],
    [0, -1, 180],
    [-1, 0, 270],
    [1,  1,  45],
  ])('atan2_fixed(%d,%d) == %d', (y, x, expected) => {
    const rt = run(`fn test() { scoreboard_set("out", "r", atan2_fixed(${y},${x})); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(expected)
  })
})

describe('rotate2d', () => {
  it('rotate 90°: (1000,0) → x≈0', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", rotate2d_x(1000,0,90)); }`)
    rt.execFunction('test')
    expect(Math.abs(scoreOf(rt, 'r'))).toBeLessThan(5)  // ≈0, allow rounding
  })
  it('rotate 90°: (1000,0) → y≈1000', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", rotate2d_y(1000,0,90)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(1000)
  })
  it('rotate 0°: no change', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", rotate2d_x(700,0,0)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(700)
  })
})

// ─── 3D geometry ─────────────────────────────────────────────────────────────

describe('dot3d', () => {
  it('dot3d(1,0,0,1,0,0) == 1', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", dot3d(1,0,0,1,0,0)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(1)
  })
  it('perpendicular == 0', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", dot3d(1,0,0,0,1,0)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(0)
  })
})

describe('cross3d', () => {
  // (1,0,0) × (0,1,0) = (0,0,1)
  it('cross3d_z(1,0,0,0,1,0) == 1', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", cross3d_z(1,0,0,0,1,0)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(1)
  })
  it('cross3d_x(1,0,0,0,1,0) == 0', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", cross3d_x(1,0,0,0,1,0)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(0)
  })
})

describe('length3d_fixed', () => {
  it('length3d_fixed(1,1,1) == 1732', () => {  // √3 × 1000 ≈ 1732
    const rt = run(`fn test() { scoreboard_set("out", "r", length3d_fixed(1,1,1)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(1732)
  })
  it('length3d_fixed(3,4,0) == 5000', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", length3d_fixed(3,4,0)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(5000)
  })
})

describe('manhattan3d / chebyshev3d', () => {
  it('manhattan3d(0,0,0,1,2,3) == 6', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", manhattan3d(0,0,0,1,2,3)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(6)
  })
  it('chebyshev3d(0,0,0,3,1,2) == 3', () => {
    const rt = run(`fn test() { scoreboard_set("out", "r", chebyshev3d(0,0,0,3,1,2)); }`)
    rt.execFunction('test')
    expect(scoreOf(rt, 'r')).toBe(3)
  })
})

// ─── library DCE check ────────────────────────────────────────────────────────

describe('library DCE: vec.mcrs', () => {
  it('only dot2d compiled when only dot2d called', () => {
    const result = require('../compile').compile(
      'fn test() { scoreboard_set("out", "r", dot2d(1,0,0,1)); }',
      { namespace: 'vectest', librarySources: [MATH_SRC, VEC_SRC] }
    )
    expect(result.success).toBe(true)
    // atan2_fixed not called → no tan table in __load
    const hasTanTable = result.files?.some((f: any) =>
      f.content?.includes('data modify storage math:tables tan set value')
    )
    expect(hasTanTable).toBe(false)
  })

  it('_atan_init in __load when atan2_fixed is called', () => {
    const result = require('../compile').compile(
      'fn test() { scoreboard_set("out", "r", atan2_fixed(1,0)); }',
      { namespace: 'vectest', librarySources: [MATH_SRC, VEC_SRC] }
    )
    expect(result.success).toBe(true)
    const hasTanTable = result.files?.some((f: any) =>
      f.content?.includes('data modify storage math:tables tan set value')
    )
    expect(hasTanTable).toBe(true)
  })
})
