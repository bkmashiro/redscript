/**
 * Tests for stdlib/vec.mcrs — 2D / 3D vector math.
 * Note: vec.mcrs has a dependency on math.mcrs (for sqrt_fixed etc.)
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const MATH_SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/math.mcrs'), 'utf-8')
const VEC_SRC  = fs.readFileSync(path.join(__dirname, '../../stdlib/vec.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(extra, { namespace: 'test', librarySources: [MATH_SRC, VEC_SRC] })
}

describe('stdlib/vec.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('fn _noop(): int { return 0; }')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('dot2d is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return dot2d(3, 4, 3, 4); }`)
    expect(r.files.some(f => f.path.includes('dot2d'))).toBe(true)
  })

  test('cross2d is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return cross2d(1, 0, 0, 1); }`)
    expect(r.files.some(f => f.path.includes('cross2d'))).toBe(true)
  })

  test('manhattan is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return manhattan(0, 0, 3, 4); }`)
    expect(r.files.some(f => f.path.includes('manhattan'))).toBe(true)
  })

  test('chebyshev is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return chebyshev(0, 0, 3, 4); }`)
    expect(r.files.some(f => f.path.includes('chebyshev'))).toBe(true)
  })

  test('dot3d is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return dot3d(1, 2, 3, 4, 5, 6); }`)
    expect(r.files.some(f => f.path.includes('dot3d'))).toBe(true)
  })

  test('cross3d_x is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return cross3d_x(1, 0, 0, 0, 1, 0); }`)
    expect(r.files.some(f => f.path.includes('cross3d'))).toBe(true)
  })

  test('length2d_fixed is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return length2d_fixed(3, 4); }`)
    expect(r.files.some(f => f.path.includes('length2d_fixed') || f.path.includes('length2d'))).toBe(true)
  })

  test('distance2d_fixed is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return distance2d_fixed(0, 0, 3, 4); }`)
    expect(r.files.some(f => f.path.includes('distance2d'))).toBe(true)
  })

  test('normalize2d_x is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return normalize2d_x(3, 4); }`)
    expect(r.files.some(f => f.path.includes('normalize2d'))).toBe(true)
  })

  test('lerp2d_x is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return lerp2d_x(0, 0, 1000, 0, 5000); }`)
    expect(r.files.some(f => f.path.includes('lerp2d'))).toBe(true)
  })
})
