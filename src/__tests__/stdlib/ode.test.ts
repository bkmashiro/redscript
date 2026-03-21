/**
 * Tests for stdlib/ode.mcrs — Runge-Kutta 4th-order ODE helpers.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/ode.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/ode.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('ode_mul_fx is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return ode_mul_fx(10000, 5000); }`)
    expect(r.files.some(f => f.path.includes('ode_mul_fx'))).toBe(true)
  })

  test('ode_reset is emitted', () => {
    const r = compileWith(`@keep fn t() { ode_reset(1, 0, 10000, 0, 10000, 0); }`)
    expect(r.files.some(f => f.path.includes('ode_reset'))).toBe(true)
  })

  test('ode_get_system is emitted', () => {
    const r = compileWith(`@keep fn t(): int { ode_reset(1, 0, 10000, 0, 10000, 0); return ode_get_system(); }`)
    expect(r.files.some(f => f.path.includes('ode_get_system'))).toBe(true)
  })

  test('ode_weighted_increment is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return ode_weighted_increment(1000, 12000); }`)
    expect(r.files.some(f => f.path.includes('ode_weighted_increment'))).toBe(true)
  })
})
