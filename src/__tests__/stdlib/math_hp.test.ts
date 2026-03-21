/**
 * Tests for stdlib/math_hp.mcrs — high-precision trig / double arithmetic.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/math_hp.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/math_hp.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('init_trig is emitted', () => {
    const r = compileWith(`@keep fn t() { init_trig(); }`)
    expect(r.files.some(f => f.path.includes('init_trig'))).toBe(true)
  })

  test('sin_hp is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return sin_hp(450000); }`)
    expect(r.files.some(f => f.path.includes('sin_hp'))).toBe(true)
  })

  test('cos_hp is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return cos_hp(0); }`)
    expect(r.files.some(f => f.path.includes('cos_hp'))).toBe(true)
  })

  test('sqrt_hp is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return sqrt_hp(200000000); }`)
    expect(r.files.some(f => f.path.includes('sqrt_hp'))).toBe(true)
  })

  test('div_hp is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return div_hp(10000, 3); }`)
    expect(r.files.some(f => f.path.includes('div_hp'))).toBe(true)
  })

  test('double_add is emitted', () => {
    const r = compileWith(`@keep fn t(): double { return double_add(1.0d, 2.0d); }`)
    expect(r.files.some(f => f.path.includes('double_add'))).toBe(true)
  })

  test('double_mul_fixed is emitted', () => {
    const r = compileWith(`@keep fn t(): double { return double_mul_fixed(1.5d, 10000); }`)
    expect(r.files.some(f => f.path.includes('double_mul_fixed'))).toBe(true)
  })
})
