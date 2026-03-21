/**
 * Tests for stdlib/noise.mcrs — procedural noise functions.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const MATH_SRC  = fs.readFileSync(path.join(__dirname, '../../stdlib/math.mcrs'), 'utf-8')
const NOISE_SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/noise.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(extra, { namespace: 'test', librarySources: [MATH_SRC, NOISE_SRC] })
}

describe('stdlib/noise.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('fn _noop(): int { return 0; }')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('hash_1d is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return hash_1d(42); }`)
    expect(r.files.some(f => f.path.includes('hash_1d'))).toBe(true)
  })

  test('hash_2d is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return hash_2d(3, 7); }`)
    expect(r.files.some(f => f.path.includes('hash_2d'))).toBe(true)
  })

  test('value_noise_1d is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return value_noise_1d(100); }`)
    expect(r.files.some(f => f.path.includes('value_noise_1d'))).toBe(true)
  })

  test('value_noise_2d is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return value_noise_2d(10, 20); }`)
    expect(r.files.some(f => f.path.includes('value_noise_2d'))).toBe(true)
  })

  test('fbm_1d is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return fbm_1d(50, 3, 5000); }`)
    expect(r.files.some(f => f.path.includes('fbm_1d'))).toBe(true)
  })
})
