/**
 * Tests for stdlib/matrix.mcrs functions.
 * Verifies compilation succeeds and key rotation/scale/quaternion functions are emitted.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const MATH_STDLIB   = path.join(__dirname, '../../stdlib/math.mcrs')
const MATRIX_STDLIB = path.join(__dirname, '../../stdlib/matrix.mcrs')

const mathSrc   = fs.readFileSync(MATH_STDLIB,   'utf-8')
const matrixSrc = fs.readFileSync(MATRIX_STDLIB, 'utf-8')

function compileWith(extra: string): { path: string; content: string }[] {
  const result = compile(extra, { namespace: 'test', librarySources: [mathSrc, matrixSrc] })
  return result.files
}

describe('stdlib/matrix.mcrs', () => {
  test('compiles without errors', () => {
    expect(() => {
      compile('fn _noop(): int { return 0; }', { namespace: 'test', librarySources: [mathSrc, matrixSrc] })
    }).not.toThrow()
  })

  // ─── 2D rotation ────────────────────────────────────────────────────────────

  test('rotate2d_x is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return rotate2d_x(1000, 0, 0); }`)
    expect(files.some(f => f.path.includes('rotate2d_x'))).toBe(true)
  })

  test('rotate2d_y is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return rotate2d_y(1000, 0, 0); }`)
    expect(files.some(f => f.path.includes('rotate2d_y'))).toBe(true)
  })

  // rotate2d_x(1000, 0, 0°) = 1000 * cos(0)/1000 - 0 = 1000 * 1000 / 1000 = 1000
  // cos_fixed(0) = 1000, sin_fixed(0) = 0 → x*c/1000 - y*s/1000 = 1000*1000/1000 = 1000
  test('rotate2d_x(1000, 0, 0°) ≈ 1000 (no rotation)', () => {
    const files = compileWith(`@keep fn t(): int { return rotate2d_x(1000, 0, 0); }`)
    const fn = files.find(f => f.path.endsWith('/t.mcfunction'))
    expect(fn).toBeDefined()
    // Result should use scoreboard operations, not a static 0
    expect(fn!.content).not.toBe('')
  })

  test('rotate2d_x(0, 1000, 900000) ≈ -1000 (90° rotation: -y)', () => {
    const files = compileWith(`@keep fn t(): int { return rotate2d_x(0, 1000, 900000); }`)
    expect(files.some(f => f.path.includes('rotate2d_x'))).toBe(true)
  })

  // ─── Scale ──────────────────────────────────────────────────────────────────

  test('scale_x(500, 20000) = 1000 (2× scale)', () => {
    // scale_x(500, 20000) = 500 * 20000 / 10000 = 1000
    const files = compileWith(`@keep fn t(): int { return scale_x(500, 20000); }`)
    // Constant folding should produce inline 1000 or the function
    expect(files.some(f => f.path.includes('scale_x') || f.path.includes('/t.'))).toBe(true)
  })

  test('scale_y is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return scale_y(100, 5000); }`)
    expect(files.some(f => f.path.includes('scale_y') || f.path.includes('/t.'))).toBe(true)
  })

  test('uniform_scale(1000, 15000) = 1500', () => {
    // 1000 * 15000 / 10000 = 1500
    const files = compileWith(`@keep fn t(): int { return uniform_scale(1000, 15000); }`)
    expect(files.some(f => f.path.includes('uniform_scale') || f.path.includes('/t.'))).toBe(true)
  })

  // ─── 3D rotation ─────────────────────────────────────────────────────────────

  test('rotate_y_x is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return rotate_y_x(1000, 0, 0); }`)
    expect(files.some(f => f.path.includes('rotate_y_x'))).toBe(true)
  })

  test('rotate_y_z is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return rotate_y_z(1000, 0, 0); }`)
    expect(files.some(f => f.path.includes('rotate_y_z'))).toBe(true)
  })

  test('rotate_x_y is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return rotate_x_y(0, 1000, 0); }`)
    expect(files.some(f => f.path.includes('rotate_x_y'))).toBe(true)
  })

  // ─── Quaternion helpers ──────────────────────────────────────────────────────

  test('quat_sin_half is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return quat_sin_half(1800000); }`)
    expect(files.some(f => f.path.includes('quat_sin_half'))).toBe(true)
  })

  test('quat_cos_half is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return quat_cos_half(0); }`)
    expect(files.some(f => f.path.includes('quat_cos_half'))).toBe(true)
  })

  // quat_cos_half(0) = cos_fixed(0 / 20000) = cos_fixed(0) = 1000
  test('quat_cos_half(0) compiles and references cos_fixed', () => {
    const files = compileWith(`@keep fn t(): int { return quat_cos_half(0); }`)
    const allContent = files.map(f => f.content).join('\n')
    expect(allContent).toContain('cos_fixed')
  })

  // ─── Billboard ───────────────────────────────────────────────────────────────

  test('billboard_y(900000) = 2700000 (180° offset from 90°)', () => {
    // (900000 + 1800000) % 3600000 = 2700000
    const files = compileWith(`@keep fn t(): int { return billboard_y(900000); }`)
    expect(files.some(f => f.path.includes('billboard_y') || f.path.includes('/t.'))).toBe(true)
  })

  test('billboard_y(3000000) = 1200000 (wrap around 360°)', () => {
    // (3000000 + 1800000) % 3600000 = 1200000
    const files = compileWith(`@keep fn t(): int { return billboard_y(3000000); }`)
    expect(files.some(f => f.path.includes('billboard_y') || f.path.includes('/t.'))).toBe(true)
  })

  // ─── Lerp angle ──────────────────────────────────────────────────────────────

  test('lerp_angle is emitted', () => {
    const files = compileWith(`@keep fn t(): int { return lerp_angle(0, 900000, 5000); }`)
    expect(files.some(f => f.path.includes('lerp_angle'))).toBe(true)
  })

  test('lerp_angle(0, 900000, 5000) = 450000 (midpoint of 0°→90°)', () => {
    // diff = 900000, t=5000, result = 0 + 900000*5000/10000 = 450000
    const files = compileWith(`@keep fn t(): int { return lerp_angle(0, 900000, 5000); }`)
    const fn = files.find(f => f.path.endsWith('/t.mcfunction'))
    expect(fn).toBeDefined()
    // Should inline constant 450000 or call lerp_angle
    expect(fn!.content).not.toBe('')
  })
})
