/**
 * Tests for stdlib/easing.mcrs functions.
 * Verifies easing function boundary values via MCRuntime.
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../emit/compile'
import { MCRuntime } from '../../runtime'

const NS = 'test'
const OBJ = `__${NS}`

const MATH_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/math.mcrs'),
  'utf-8',
)
const EASING_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/easing.mcrs'),
  'utf-8',
)

function makeEasingRuntime(source: string): MCRuntime {
  const result = compile(source, {
    namespace: NS,
    librarySources: [MATH_SRC, EASING_SRC],
  })
  const rt = new MCRuntime(NS)
  for (const file of result.files) {
    if (!file.path.endsWith('.mcfunction')) continue
    const m = file.path.match(/data\/([^/]+)\/function\/(.+)\.mcfunction$/)
    if (!m) continue
    rt.loadFunction(`${m[1]}:${m[2]}`, file.content.split('\n'))
  }
  rt.execFunction(`${NS}:load`)
  return rt
}

function callAndGetRet(rt: MCRuntime, fnName: string): number {
  rt.execFunction(`${NS}:${fnName}`)
  return rt.getScore('$ret', OBJ)
}

describe('stdlib/easing.mcrs — boundary values', () => {
  const rt = makeEasingRuntime(`
    fn test_ease_linear_0(): int { return ease_linear(0); }
    fn test_ease_linear_10000(): int { return ease_linear(10000); }
    fn test_ease_in_quad_5000(): int { return ease_in_quad(5000); }
    fn test_ease_out_quad_5000(): int { return ease_out_quad(5000); }
    fn test_ease_out_bounce_0(): int { return ease_out_bounce(0); }
    fn test_ease_out_bounce_10000(): int { return ease_out_bounce(10000); }
    fn test_ease_in_quad_0(): int { return ease_in_quad(0); }
    fn test_ease_in_quad_10000(): int { return ease_in_quad(10000); }
    fn test_ease_out_quad_0(): int { return ease_out_quad(0); }
    fn test_ease_out_quad_10000(): int { return ease_out_quad(10000); }
    fn test_ease_in_cubic_0(): int { return ease_in_cubic(0); }
    fn test_ease_in_cubic_10000(): int { return ease_in_cubic(10000); }
    fn test_ease_out_cubic_0(): int { return ease_out_cubic(0); }
    fn test_ease_out_cubic_10000(): int { return ease_out_cubic(10000); }
    fn test_ease_in_out_quad_0(): int { return ease_in_out_quad(0); }
    fn test_ease_in_out_quad_10000(): int { return ease_in_out_quad(10000); }
    fn test_ease_in_bounce_0(): int { return ease_in_bounce(0); }
    fn test_ease_in_bounce_10000(): int { return ease_in_bounce(10000); }
  `)

  // Linear
  test('ease_linear(0) == 0', () => expect(callAndGetRet(rt, 'test_ease_linear_0')).toBe(0))
  test('ease_linear(10000) == 10000', () => expect(callAndGetRet(rt, 'test_ease_linear_10000')).toBe(10000))

  // Quadratic in
  test('ease_in_quad(0) == 0', () => expect(callAndGetRet(rt, 'test_ease_in_quad_0')).toBe(0))
  test('ease_in_quad(10000) == 10000', () => expect(callAndGetRet(rt, 'test_ease_in_quad_10000')).toBe(10000))
  // ease_in_quad(5000) = 5000²/10000 = 25000000/10000 = 2500
  test('ease_in_quad(5000) == 2500', () => expect(callAndGetRet(rt, 'test_ease_in_quad_5000')).toBe(2500))

  // Quadratic out
  test('ease_out_quad(0) == 0', () => expect(callAndGetRet(rt, 'test_ease_out_quad_0')).toBe(0))
  test('ease_out_quad(10000) == 10000', () => expect(callAndGetRet(rt, 'test_ease_out_quad_10000')).toBe(10000))
  // ease_out_quad(5000) = 10000 - 5000²/10000 = 10000 - 2500 = 7500
  test('ease_out_quad(5000) == 7500', () => expect(callAndGetRet(rt, 'test_ease_out_quad_5000')).toBe(7500))

  // Cubic
  test('ease_in_cubic(0) == 0', () => expect(callAndGetRet(rt, 'test_ease_in_cubic_0')).toBe(0))
  test('ease_in_cubic(10000) == 10000', () => expect(callAndGetRet(rt, 'test_ease_in_cubic_10000')).toBe(10000))
  test('ease_out_cubic(0) == 0', () => expect(callAndGetRet(rt, 'test_ease_out_cubic_0')).toBe(0))
  test('ease_out_cubic(10000) == 10000', () => expect(callAndGetRet(rt, 'test_ease_out_cubic_10000')).toBe(10000))

  // In-out quad
  test('ease_in_out_quad(0) == 0', () => expect(callAndGetRet(rt, 'test_ease_in_out_quad_0')).toBe(0))
  test('ease_in_out_quad(10000) == 10000', () => expect(callAndGetRet(rt, 'test_ease_in_out_quad_10000')).toBe(10000))

  // Bounce boundary values
  test('ease_out_bounce(0) == 0', () => expect(callAndGetRet(rt, 'test_ease_out_bounce_0')).toBe(0))
  test('ease_out_bounce(10000) == 10000', () => expect(callAndGetRet(rt, 'test_ease_out_bounce_10000')).toBe(10000))
  test('ease_in_bounce(0) == 0', () => expect(callAndGetRet(rt, 'test_ease_in_bounce_0')).toBe(0))
  test('ease_in_bounce(10000) == 10000', () => expect(callAndGetRet(rt, 'test_ease_in_bounce_10000')).toBe(10000))
})
