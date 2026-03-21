/**
 * Tests for stdlib/parabola.mcrs — projectile motion helpers.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const MATH_SRC     = fs.readFileSync(path.join(__dirname, '../../stdlib/math.mcrs'), 'utf-8')
const PARABOLA_SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/parabola.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(extra, { namespace: 'test', librarySources: [MATH_SRC, PARABOLA_SRC] })
}

describe('stdlib/parabola.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('fn _noop(): int { return 0; }')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('parabola_gravity constant is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return parabola_gravity(); }`)
    expect(r.files.some(f => f.path.includes('parabola_gravity'))).toBe(true)
  })

  test('parabola_vy is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return parabola_vy(100000, 20); }`)
    expect(r.files.some(f => f.path.includes('parabola_vy'))).toBe(true)
  })

  test('parabola_y is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return parabola_y(5000, 10); }`)
    expect(r.files.some(f => f.path.includes('parabola_y'))).toBe(true)
  })

  test('parabola_flight_time is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return parabola_flight_time(8000); }`)
    expect(r.files.some(f => f.path.includes('parabola_flight_time'))).toBe(true)
  })

  test('parabola_max_height is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return parabola_max_height(8000); }`)
    expect(r.files.some(f => f.path.includes('parabola_max_height'))).toBe(true)
  })

  test('parabola_step_vy is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return parabola_step_vy(8000, 9900); }`)
    expect(r.files.some(f => f.path.includes('parabola_step_vy'))).toBe(true)
  })
})
