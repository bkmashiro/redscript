/**
 * Tests for stdlib/bits.mcrs — bitwise operations.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/bits.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/bits.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('bit_get is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return bit_get(12, 2); }`)
    expect(r.files.some(f => f.path.includes('bit_get'))).toBe(true)
  })

  test('bit_set is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return bit_set(8, 1); }`)
    expect(r.files.some(f => f.path.includes('bit_set'))).toBe(true)
  })

  test('bit_clear is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return bit_clear(15, 1); }`)
    expect(r.files.some(f => f.path.includes('bit_clear'))).toBe(true)
  })

  test('bit_toggle is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return bit_toggle(5, 1); }`)
    expect(r.files.some(f => f.path.includes('bit_toggle'))).toBe(true)
  })

  test('bit_and is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return bit_and(12, 10); }`)
    expect(r.files.some(f => f.path.includes('bit_and'))).toBe(true)
  })

  test('bit_or is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return bit_or(12, 3); }`)
    expect(r.files.some(f => f.path.includes('bit_or'))).toBe(true)
  })

  test('bit_xor is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return bit_xor(15, 9); }`)
    expect(r.files.some(f => f.path.includes('bit_xor'))).toBe(true)
  })

  test('bit_not is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return bit_not(0); }`)
    expect(r.files.some(f => f.path.includes('bit_not'))).toBe(true)
  })

  test('bit_shl is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return bit_shl(1, 3); }`)
    expect(r.files.some(f => f.path.includes('bit_shl'))).toBe(true)
  })

  test('bit_shr is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return bit_shr(8, 2); }`)
    expect(r.files.some(f => f.path.includes('bit_shr'))).toBe(true)
  })

  test('popcount is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return popcount(255); }`)
    expect(r.files.some(f => f.path.includes('popcount'))).toBe(true)
  })
})
