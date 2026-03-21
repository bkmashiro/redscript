/**
 * Tests for stdlib/bigint.mcrs — multi-precision integer arithmetic.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/bigint.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/bigint.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('bigint_base is emitted or constant-folded', () => {
    // bigint_base() returns 10000 — compiler may constant-fold it instead of emitting a function
    const r = compileWith(`@keep fn t(): int { return bigint_base(); }`)
    // Either a dedicated function file is emitted, or the value 10000 appears inlined
    const emittedFile = r.files.some(f => f.path.includes('bigint_base'))
    const inlined = r.files.some(f => f.content.includes('10000'))
    expect(emittedFile || inlined).toBe(true)
  })

  test('bigint3_add_lo is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return bigint3_add_lo(7000, 5000); }`)
    expect(r.files.some(f => f.path.includes('bigint3_add_lo'))).toBe(true)
  })

  test('bigint3_cmp is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return bigint3_cmp(0, 0, 1, 0, 0, 2); }`)
    expect(r.files.some(f => f.path.includes('bigint3_cmp'))).toBe(true)
  })

  test('int32_to_bigint3_lo is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return int32_to_bigint3_lo(123456789); }`)
    expect(r.files.some(f => f.path.includes('int32_to_bigint3'))).toBe(true)
  })

  test('bigint3_to_int32 is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return bigint3_to_int32(0, 1, 2345); }`)
    expect(r.files.some(f => f.path.includes('bigint3_to_int32'))).toBe(true)
  })

  test('bigint_zero is emitted', () => {
    const r = compileWith(`@keep fn t() {
      let a: int[] = [0, 0, 0];
      bigint_zero(a, 3);
    }`)
    expect(r.files.some(f => f.path.includes('bigint_zero'))).toBe(true)
  })
})
