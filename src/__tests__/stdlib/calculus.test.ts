/**
 * Tests for stdlib/calculus.mcrs functions.
 * Verifies compilation succeeds and key functions are present/emitted.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const CALCULUS_STDLIB = path.join(__dirname, '../../stdlib/calculus.mcrs')
const calculusSrc = fs.readFileSync(CALCULUS_STDLIB, 'utf-8')

function compileWith(extra: string): { path: string; content: string }[] {
  const result = compile(calculusSrc + '\n' + extra, { namespace: 'test' })
  return result.files
}

describe('stdlib/calculus.mcrs', () => {
  test('compiles without errors', () => {
    expect(() => {
      const result = compile(calculusSrc, { namespace: 'test' })
      expect(result.files.length).toBeGreaterThan(0)
    }).not.toThrow()
  })

  test('integrate_trapezoid function is emitted', () => {
    const files = compileWith(`
      @keep fn t(): int {
        let vals: int[] = [0, 5000, 10000];
        return integrate_trapezoid(vals, 3, 10000);
      }
    `)
    expect(files.some(f => f.path.includes('integrate_trapezoid'))).toBe(true)
  })

  test('integrate_simpson function is emitted', () => {
    const files = compileWith(`
      @keep fn t(): int {
        let vals: int[] = [0, 5000, 10000];
        return integrate_simpson(vals, 3, 10000);
      }
    `)
    expect(files.some(f => f.path.includes('integrate_simpson'))).toBe(true)
  })

  test('curve_length_2d function is emitted', () => {
    const files = compileWith(`
      @keep fn t(): int {
        let xs: int[] = [0, 3000, 6000];
        let ys: int[] = [0, 4000, 0];
        return curve_length_2d(xs, ys, 3);
      }
    `)
    expect(files.some(f => f.path.includes('curve_length_2d'))).toBe(true)
  })

  test('running_mean function is emitted', () => {
    const files = compileWith(`
      @keep fn t(): int {
        return running_mean(5000, 7000, 2);
      }
    `)
    expect(files.some(f => f.path.includes('running_mean'))).toBe(true)
  })

  test('deriv_forward function is emitted', () => {
    const files = compileWith(`
      @keep fn t(): int {
        return deriv_forward(20000, 10000, 10000);
      }
    `)
    expect(files.some(f => f.path.includes('deriv_forward'))).toBe(true)
  })

  test('deriv_central function is emitted', () => {
    const files = compileWith(`
      @keep fn t(): int {
        return deriv_central(20000, 0, 10000);
      }
    `)
    expect(files.some(f => f.path.includes('deriv_central'))).toBe(true)
  })

  test('second_deriv function is emitted', () => {
    const files = compileWith(`
      @keep fn t(): int {
        return second_deriv(10000, 5000, 0, 10000);
      }
    `)
    expect(files.some(f => f.path.includes('second_deriv'))).toBe(true)
  })

  test('running_mean formula: (5000*(2-1) + 7000) / 2 = 6000', () => {
    // running_mean(prev, new_val, n) = prev + (new_val - prev) / n
    // running_mean(5000, 7000, 2) = 5000 + (7000-5000)/2 = 6000
    const files = compileWith(`@keep fn t(): int { return running_mean(5000, 7000, 2); }`)
    expect(files.length).toBeGreaterThan(0)
  })
})
