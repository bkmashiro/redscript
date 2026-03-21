/**
 * Tests for stdlib/linalg.mcrs — double-precision linear algebra.
 * Depends on math_hp.mcrs for double_sqrt etc.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const MATH_HP_SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/math_hp.mcrs'), 'utf-8')
const LINALG_SRC  = fs.readFileSync(path.join(__dirname, '../../stdlib/linalg.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(extra, { namespace: 'test', librarySources: [MATH_HP_SRC, LINALG_SRC] })
}

describe('stdlib/linalg.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('fn _noop(): int { return 0; }')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('vec2d_dot is emitted', () => {
    const r = compileWith(`@keep fn t(): double { return vec2d_dot(1.0d, 0.0d, 0.0d, 1.0d); }`)
    expect(r.files.some(f => f.path.includes('vec2d_dot'))).toBe(true)
  })

  test('vec3d_dot is emitted', () => {
    const r = compileWith(`@keep fn t(): double { return vec3d_dot(1.0d, 0.0d, 0.0d, 0.0d, 1.0d, 0.0d); }`)
    expect(r.files.some(f => f.path.includes('vec3d_dot'))).toBe(true)
  })

  test('vec3d_cross_x is emitted', () => {
    const r = compileWith(`@keep fn t(): double { return vec3d_cross_x(1.0d, 0.0d, 0.0d, 0.0d, 1.0d, 0.0d); }`)
    expect(r.files.some(f => f.path.includes('vec3d_cross'))).toBe(true)
  })

  test('mat2d_det is emitted', () => {
    const r = compileWith(`@keep fn t(): double { return mat2d_det(1.0d, 0.0d, 0.0d, 1.0d); }`)
    expect(r.files.some(f => f.path.includes('mat2d_det'))).toBe(true)
  })

  test('vec2d_length is emitted', () => {
    const r = compileWith(`@keep fn t(): double { return vec2d_length(3.0d, 4.0d); }`)
    expect(r.files.some(f => f.path.includes('vec2d_length') || f.path.includes('vec2d_len'))).toBe(true)
  })

  test('vec3d_normalize_x is emitted', () => {
    const r = compileWith(`@keep fn t(): double { return vec3d_normalize_x(1.0d, 0.0d, 0.0d); }`)
    expect(r.files.some(f => f.path.includes('vec3d_normalize'))).toBe(true)
  })
})
