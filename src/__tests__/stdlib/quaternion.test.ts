/**
 * Tests for stdlib/quaternion.mcrs — quaternion math for display entity rotations.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const MATH_SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/math.mcrs'), 'utf-8')
const QUAT_SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/quaternion.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(extra, { namespace: 'test', librarySources: [MATH_SRC, QUAT_SRC] })
}

describe('stdlib/quaternion.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('fn _noop(): int { return 0; }')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('quat_identity_w is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return quat_identity_w(); }`)
    expect(r.files.some(f => f.path.includes('quat_identity_w'))).toBe(true)
  })

  test('quat_axis_x_w is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return quat_axis_x_w(90); }`)
    expect(r.files.some(f => f.path.includes('quat_axis_x_w'))).toBe(true)
  })

  test('quat_mul_x is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return quat_mul_x(0, 0, 0, 10000, 0, 0, 0, 10000); }`)
    expect(r.files.some(f => f.path.includes('quat_mul_x'))).toBe(true)
  })

  test('quat_mul_w is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return quat_mul_w(0, 0, 0, 10000, 0, 0, 0, 10000); }`)
    expect(r.files.some(f => f.path.includes('quat_mul_w'))).toBe(true)
  })

  test('quat_axis_y_y is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return quat_axis_y_y(45); }`)
    expect(r.files.some(f => f.path.includes('quat_axis_y_y') || f.path.includes('sin_fixed'))).toBe(true)
  })
})
