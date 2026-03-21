/**
 * Tests for stdlib/fft.mcrs — DFT functions.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const MATH_SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/math.mcrs'), 'utf-8')
const FFT_SRC  = fs.readFileSync(path.join(__dirname, '../../stdlib/fft.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(extra, { namespace: 'test', librarySources: [MATH_SRC, FFT_SRC] })
}

describe('stdlib/fft.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('fn _noop(): int { return 0; }')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('dft_real is emitted', () => {
    const r = compileWith(`@keep fn t() {
      let sig: int[] = [10000, 0, -10000, 0];
      let re: int[] = [0, 0, 0, 0];
      let im: int[] = [0, 0, 0, 0];
      dft_real(sig, 4, re, im);
    }`)
    expect(r.files.some(f => f.path.includes('dft_real'))).toBe(true)
  })

  test('dft_magnitude is emitted', () => {
    const r = compileWith(`@keep fn t(): int {
      let re: int[] = [10000, 0, 0, 0];
      let im: int[] = [0, 0, 0, 0];
      return dft_magnitude(re, im, 0);
    }`)
    expect(r.files.some(f => f.path.includes('dft_magnitude'))).toBe(true)
  })

  test('dft_power is emitted', () => {
    const r = compileWith(`@keep fn t(): int {
      let re: int[] = [5000, 0, 0, 0];
      let im: int[] = [0, 0, 0, 0];
      return dft_power(re, im, 0);
    }`)
    expect(r.files.some(f => f.path.includes('dft_power'))).toBe(true)
  })

  test('dft_freq_bin is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return dft_freq_bin(44100, 4, 1); }`)
    expect(r.files.some(f => f.path.includes('dft_freq_bin'))).toBe(true)
  })
})
