/**
 * Tests for stdlib/signal.mcrs — statistical distributions and probability.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/signal.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/signal.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('uniform_int is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return uniform_int(42, 0, 100); }`)
    expect(r.files.some(f => f.path.includes('uniform_int'))).toBe(true)
  })

  test('uniform_frac is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return uniform_frac(999); }`)
    expect(r.files.some(f => f.path.includes('uniform_frac'))).toBe(true)
  })

  test('bernoulli is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return bernoulli(77, 5000); }`)
    expect(r.files.some(f => f.path.includes('bernoulli'))).toBe(true)
  })

  test('weighted2 is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return weighted2(55, 3, 7); }`)
    expect(r.files.some(f => f.path.includes('weighted2'))).toBe(true)
  })

  test('weighted3 is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return weighted3(55, 2, 5, 3); }`)
    expect(r.files.some(f => f.path.includes('weighted3'))).toBe(true)
  })

  test('poisson_sample is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return poisson_sample(30000, 123); }`)
    expect(r.files.some(f => f.path.includes('poisson_sample'))).toBe(true)
  })

  test('geometric_sample is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return geometric_sample(3000, 456); }`)
    expect(r.files.some(f => f.path.includes('geometric_sample'))).toBe(true)
  })

  test('dft_magnitude is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return dft_magnitude(10000, 0, -10000, 0, 0, 0, 0, 0, 4, 0); }`)
    expect(r.files.some(f => f.path.includes('dft_magnitude'))).toBe(true)
  })
})
