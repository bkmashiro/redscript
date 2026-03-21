/**
 * Tests for stdlib/color.mcrs — color packing, HSL conversion.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/color.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/color.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('rgb_pack is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return rgb_pack(255, 128, 0); }`)
    expect(r.files.some(f => f.path.includes('rgb_pack'))).toBe(true)
  })

  test('rgb_r is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return rgb_r(16711680); }`)
    expect(r.files.some(f => f.path.includes('rgb_r'))).toBe(true)
  })

  test('rgb_g is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return rgb_g(65280); }`)
    expect(r.files.some(f => f.path.includes('rgb_g'))).toBe(true)
  })

  test('rgb_b is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return rgb_b(255); }`)
    expect(r.files.some(f => f.path.includes('rgb_b'))).toBe(true)
  })

  test('rgb_lerp is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return rgb_lerp(0, 16777215, 5000); }`)
    expect(r.files.some(f => f.path.includes('rgb_lerp') || f.path.includes('lerp'))).toBe(true)
  })

  test('rgb_to_h is emitted (HSL hue)', () => {
    const r = compileWith(`@keep fn t(): int { return rgb_to_h(255, 0, 0); }`)
    expect(r.files.some(f => f.path.includes('rgb_to_h'))).toBe(true)
  })

  test('rgb_to_s is emitted (HSL saturation)', () => {
    const r = compileWith(`@keep fn t(): int { return rgb_to_s(255, 0, 0); }`)
    expect(r.files.some(f => f.path.includes('rgb_to_s'))).toBe(true)
  })

  test('rgb_to_l is emitted (HSL lightness)', () => {
    const r = compileWith(`@keep fn t(): int { return rgb_to_l(255, 0, 0); }`)
    expect(r.files.some(f => f.path.includes('rgb_to_l'))).toBe(true)
  })
})
