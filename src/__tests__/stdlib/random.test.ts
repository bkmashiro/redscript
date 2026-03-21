/**
 * Tests for stdlib/random.mcrs — LCG / PCG RNG helpers.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/random.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/random.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('next_lcg is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return next_lcg(12345); }`)
    expect(r.files.some(f => f.path.includes('next_lcg'))).toBe(true)
  })

  test('random_range is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return random_range(999, 0, 100); }`)
    expect(r.files.some(f => f.path.includes('random_range'))).toBe(true)
  })

  test('random_bool is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return random_bool(42); }`)
    expect(r.files.some(f => f.path.includes('random_bool'))).toBe(true)
  })

  test('pcg_next_lo is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return pcg_next_lo(123); }`)
    expect(r.files.some(f => f.path.includes('pcg_next_lo'))).toBe(true)
  })

  test('binomial_sample is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return binomial_sample(10, 5000, 777); }`)
    expect(r.files.some(f => f.path.includes('binomial_sample'))).toBe(true)
  })

  test('hypergeometric_sample is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return hypergeometric_sample(20, 5, 10, 999); }`)
    expect(r.files.some(f => f.path.includes('hypergeometric_sample'))).toBe(true)
  })
})
