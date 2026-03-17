/**
 * End-to-end stdlib tests through the v2 pipeline.
 *
 * Tests pure-arithmetic stdlib functions (math.mcrs, vec.mcrs) by compiling
 * with librarySources, loading into MCRuntime, and asserting return values.
 *
 * NOTE: sin_fixed/cos_fixed/atan2_fixed are skipped — they depend on
 * storage_get_int/storage_set_array which are not available in MCRuntime.
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../emit/compile'
import { MCRuntime } from '../../runtime'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NS = 'test'
const OBJ = `__${NS}`

const MATH_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/math.mcrs'),
  'utf-8',
)
const VEC_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/vec.mcrs'),
  'utf-8',
)

/** Compile source with math stdlib, load into MCRuntime, init objective */
function makeRuntime(source: string, libs: string[] = [MATH_SRC]): MCRuntime {
  const result = compile(source, { namespace: NS, librarySources: libs })
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

/** Execute a function and return the $ret value */
function callAndGetRet(rt: MCRuntime, fnName: string): number {
  rt.execFunction(`${NS}:${fnName}`)
  return rt.getScore('$ret', OBJ)
}

// ===========================================================================
// math.mcrs — Phase 1: Basic integer helpers
// ===========================================================================

describe('stdlib e2e: abs', () => {
  const rt = makeRuntime(`
    fn test_abs_neg(): int { return abs(-5); }
    fn test_abs_pos(): int { return abs(5); }
    fn test_abs_zero(): int { return abs(0); }
  `)

  test('abs(-5) = 5', () => expect(callAndGetRet(rt, 'test_abs_neg')).toBe(5))
  test('abs(5) = 5', () => expect(callAndGetRet(rt, 'test_abs_pos')).toBe(5))
  test('abs(0) = 0', () => expect(callAndGetRet(rt, 'test_abs_zero')).toBe(0))
})

describe('stdlib e2e: sign', () => {
  const rt = makeRuntime(`
    fn test_sign_pos(): int { return sign(42); }
    fn test_sign_neg(): int { return sign(-7); }
    fn test_sign_zero(): int { return sign(0); }
  `)

  test('sign(42) = 1', () => expect(callAndGetRet(rt, 'test_sign_pos')).toBe(1))
  test('sign(-7) = -1', () => expect(callAndGetRet(rt, 'test_sign_neg')).toBe(-1))
  test('sign(0) = 0', () => expect(callAndGetRet(rt, 'test_sign_zero')).toBe(0))
})

describe('stdlib e2e: min/max', () => {
  const rt = makeRuntime(`
    fn test_min(): int { return min(3, 7); }
    fn test_max(): int { return max(3, 7); }
    fn test_min_eq(): int { return min(5, 5); }
    fn test_max_neg(): int { return max(-10, -3); }
  `)

  test('min(3, 7) = 3', () => expect(callAndGetRet(rt, 'test_min')).toBe(3))
  test('max(3, 7) = 7', () => expect(callAndGetRet(rt, 'test_max')).toBe(7))
  test('min(5, 5) = 5', () => expect(callAndGetRet(rt, 'test_min_eq')).toBe(5))
  test('max(-10, -3) = -3', () => expect(callAndGetRet(rt, 'test_max_neg')).toBe(-3))
})

describe('stdlib e2e: clamp', () => {
  const rt = makeRuntime(`
    fn test_clamp_above(): int { return clamp(10, 0, 5); }
    fn test_clamp_below(): int { return clamp(-10, 0, 5); }
    fn test_clamp_in(): int { return clamp(3, 0, 5); }
    fn test_clamp_edge(): int { return clamp(0, 0, 5); }
  `)

  test('clamp(10, 0, 5) = 5', () => expect(callAndGetRet(rt, 'test_clamp_above')).toBe(5))
  test('clamp(-10, 0, 5) = 0', () => expect(callAndGetRet(rt, 'test_clamp_below')).toBe(0))
  test('clamp(3, 0, 5) = 3', () => expect(callAndGetRet(rt, 'test_clamp_in')).toBe(3))
  test('clamp(0, 0, 5) = 0', () => expect(callAndGetRet(rt, 'test_clamp_edge')).toBe(0))
})

describe('stdlib e2e: lerp', () => {
  const rt = makeRuntime(`
    fn test_lerp_half(): int { return lerp(0, 1000, 500); }
    fn test_lerp_quarter(): int { return lerp(100, 200, 750); }
    fn test_lerp_zero(): int { return lerp(10, 20, 0); }
    fn test_lerp_full(): int { return lerp(10, 20, 1000); }
  `)

  test('lerp(0, 1000, 500) = 500', () => expect(callAndGetRet(rt, 'test_lerp_half')).toBe(500))
  test('lerp(100, 200, 750) = 175', () => expect(callAndGetRet(rt, 'test_lerp_quarter')).toBe(175))
  test('lerp(10, 20, 0) = 10', () => expect(callAndGetRet(rt, 'test_lerp_zero')).toBe(10))
  test('lerp(10, 20, 1000) = 20', () => expect(callAndGetRet(rt, 'test_lerp_full')).toBe(20))
})

// ===========================================================================
// math.mcrs — Phase 2: Iterative algorithms
// ===========================================================================

describe('stdlib e2e: isqrt', () => {
  const rt = makeRuntime(`
    fn test_isqrt_9(): int { return isqrt(9); }
    fn test_isqrt_10(): int { return isqrt(10); }
    fn test_isqrt_0(): int { return isqrt(0); }
    fn test_isqrt_1(): int { return isqrt(1); }
    fn test_isqrt_100(): int { return isqrt(100); }
  `)

  test('isqrt(9) = 3', () => expect(callAndGetRet(rt, 'test_isqrt_9')).toBe(3))
  test('isqrt(10) = 3', () => expect(callAndGetRet(rt, 'test_isqrt_10')).toBe(3))
  test('isqrt(0) = 0', () => expect(callAndGetRet(rt, 'test_isqrt_0')).toBe(0))
  test('isqrt(1) = 1', () => expect(callAndGetRet(rt, 'test_isqrt_1')).toBe(1))
  test('isqrt(100) = 10', () => expect(callAndGetRet(rt, 'test_isqrt_100')).toBe(10))
})

describe('stdlib e2e: sqrt_fixed', () => {
  const rt = makeRuntime(`
    fn test_sqrt_1(): int { return sqrt_fixed(1000); }
    fn test_sqrt_2(): int { return sqrt_fixed(2000); }
    fn test_sqrt_4(): int { return sqrt_fixed(4000); }
  `)

  test('sqrt_fixed(1000) = 1000 (sqrt(1)*1000)', () =>
    expect(callAndGetRet(rt, 'test_sqrt_1')).toBe(1000))
  test('sqrt_fixed(2000) ≈ 1414', () => {
    const val = callAndGetRet(rt, 'test_sqrt_2')
    expect(val).toBeGreaterThanOrEqual(1413)
    expect(val).toBeLessThanOrEqual(1415)
  })
  test('sqrt_fixed(4000) = 2000 (sqrt(4)*1000)', () =>
    expect(callAndGetRet(rt, 'test_sqrt_4')).toBe(2000))
})

describe('stdlib e2e: pow_int', () => {
  const rt = makeRuntime(`
    fn test_pow_2_10(): int { return pow_int(2, 10); }
    fn test_pow_3_0(): int { return pow_int(3, 0); }
    fn test_pow_5_3(): int { return pow_int(5, 3); }
  `)

  test('pow_int(2, 10) = 1024', () => expect(callAndGetRet(rt, 'test_pow_2_10')).toBe(1024))
  test('pow_int(3, 0) = 1', () => expect(callAndGetRet(rt, 'test_pow_3_0')).toBe(1))
  test('pow_int(5, 3) = 125', () => expect(callAndGetRet(rt, 'test_pow_5_3')).toBe(125))
})

describe('stdlib e2e: gcd', () => {
  const rt = makeRuntime(`
    fn test_gcd_12_8(): int { return gcd(12, 8); }
    fn test_gcd_0_5(): int { return gcd(0, 5); }
    fn test_gcd_neg(): int { return gcd(-12, 8); }
  `)

  test('gcd(12, 8) = 4', () => expect(callAndGetRet(rt, 'test_gcd_12_8')).toBe(4))
  test('gcd(0, 5) = 5', () => expect(callAndGetRet(rt, 'test_gcd_0_5')).toBe(5))
  test('gcd(-12, 8) = 4', () => expect(callAndGetRet(rt, 'test_gcd_neg')).toBe(4))
})

// ===========================================================================
// math.mcrs — Phase 4: Number theory & utilities
// ===========================================================================

describe('stdlib e2e: lcm', () => {
  const rt = makeRuntime(`
    fn test_lcm_4_6(): int { return lcm(4, 6); }
    fn test_lcm_0_5(): int { return lcm(0, 5); }
  `)

  test('lcm(4, 6) = 12', () => expect(callAndGetRet(rt, 'test_lcm_4_6')).toBe(12))
  test('lcm(0, 5) = 0', () => expect(callAndGetRet(rt, 'test_lcm_0_5')).toBe(0))
})

describe('stdlib e2e: map', () => {
  const rt = makeRuntime(`
    fn test_map_half(): int { return map(5, 0, 10, 0, 100); }
    fn test_map_offset(): int { return map(1, 0, 10, 100, 200); }
  `)

  test('map(5, 0, 10, 0, 100) = 50', () => expect(callAndGetRet(rt, 'test_map_half')).toBe(50))
  test('map(1, 0, 10, 100, 200) = 110', () => expect(callAndGetRet(rt, 'test_map_offset')).toBe(110))
})

describe('stdlib e2e: ceil_div', () => {
  const rt = makeRuntime(`
    fn test_ceil_7_3(): int { return ceil_div(7, 3); }
    fn test_ceil_6_3(): int { return ceil_div(6, 3); }
  `)

  test('ceil_div(7, 3) = 3', () => expect(callAndGetRet(rt, 'test_ceil_7_3')).toBe(3))
  test('ceil_div(6, 3) = 2', () => expect(callAndGetRet(rt, 'test_ceil_6_3')).toBe(2))
})

describe('stdlib e2e: log2_int', () => {
  const rt = makeRuntime(`
    fn test_log2_1(): int { return log2_int(1); }
    fn test_log2_8(): int { return log2_int(8); }
    fn test_log2_7(): int { return log2_int(7); }
    fn test_log2_neg(): int { return log2_int(-1); }
  `)

  test('log2_int(1) = 0', () => expect(callAndGetRet(rt, 'test_log2_1')).toBe(0))
  test('log2_int(8) = 3', () => expect(callAndGetRet(rt, 'test_log2_8')).toBe(3))
  test('log2_int(7) = 2', () => expect(callAndGetRet(rt, 'test_log2_7')).toBe(2))
  test('log2_int(-1) = -1', () => expect(callAndGetRet(rt, 'test_log2_neg')).toBe(-1))
})

// ===========================================================================
// math.mcrs — Phase 5: Fixed-point arithmetic
// ===========================================================================

describe('stdlib e2e: mulfix/divfix', () => {
  const rt = makeRuntime(`
    fn test_mulfix(): int { return mulfix(500, 707); }
    fn test_divfix(): int { return divfix(1, 3); }
    fn test_divfix_zero(): int { return divfix(5, 0); }
  `)

  test('mulfix(500, 707) = 353', () => expect(callAndGetRet(rt, 'test_mulfix')).toBe(353))
  test('divfix(1, 3) = 333', () => expect(callAndGetRet(rt, 'test_divfix')).toBe(333))
  test('divfix(5, 0) = 0', () => expect(callAndGetRet(rt, 'test_divfix_zero')).toBe(0))
})

describe('stdlib e2e: smoothstep', () => {
  const rt = makeRuntime(`
    fn test_ss_zero(): int { return smoothstep(0, 100, 0); }
    fn test_ss_half(): int { return smoothstep(0, 100, 50); }
    fn test_ss_full(): int { return smoothstep(0, 100, 100); }
  `)

  test('smoothstep(0, 100, 0) = 0', () => expect(callAndGetRet(rt, 'test_ss_zero')).toBe(0))
  test('smoothstep(0, 100, 50) = 500', () => expect(callAndGetRet(rt, 'test_ss_half')).toBe(500))
  test('smoothstep(0, 100, 100) = 1000', () => expect(callAndGetRet(rt, 'test_ss_full')).toBe(1000))
})

// ===========================================================================
// vec.mcrs — 2D geometry (pure arithmetic, no storage)
// ===========================================================================

describe('stdlib e2e: vec2d geometry', () => {
  const rt = makeRuntime(`
    fn test_dot2d(): int { return dot2d(3, 4, 3, 4); }
    fn test_cross2d(): int { return cross2d(1, 0, 0, 1); }
    fn test_manhattan(): int { return manhattan(0, 0, 3, 4); }
    fn test_chebyshev(): int { return chebyshev(0, 0, 3, 4); }
  `, [MATH_SRC, VEC_SRC])

  test('dot2d(3,4,3,4) = 25', () => expect(callAndGetRet(rt, 'test_dot2d')).toBe(25))
  test('cross2d(1,0,0,1) = 1', () => expect(callAndGetRet(rt, 'test_cross2d')).toBe(1))
  test('manhattan(0,0,3,4) = 7', () => expect(callAndGetRet(rt, 'test_manhattan')).toBe(7))
  test('chebyshev(0,0,3,4) = 4', () => expect(callAndGetRet(rt, 'test_chebyshev')).toBe(4))
})

describe('stdlib e2e: vec2d length & distance', () => {
  const rt = makeRuntime(`
    fn test_length2d(): int { return length2d_fixed(3, 4); }
    fn test_distance2d(): int { return distance2d_fixed(0, 0, 3, 4); }
  `, [MATH_SRC, VEC_SRC])

  test('length2d_fixed(3, 4) = 5000', () => expect(callAndGetRet(rt, 'test_length2d')).toBe(5000))
  test('distance2d_fixed(0,0,3,4) = 5000', () => expect(callAndGetRet(rt, 'test_distance2d')).toBe(5000))
})

describe('stdlib e2e: vec2d normalize', () => {
  const rt = makeRuntime(`
    fn test_norm_x(): int { return normalize2d_x(3, 4); }
    fn test_norm_y(): int { return normalize2d_y(3, 4); }
    fn test_norm_zero(): int { return normalize2d_x(0, 0); }
  `, [MATH_SRC, VEC_SRC])

  test('normalize2d_x(3, 4) = 600', () => expect(callAndGetRet(rt, 'test_norm_x')).toBe(600))
  test('normalize2d_y(3, 4) = 800', () => expect(callAndGetRet(rt, 'test_norm_y')).toBe(800))
  test('normalize2d_x(0, 0) = 0', () => expect(callAndGetRet(rt, 'test_norm_zero')).toBe(0))
})

describe('stdlib e2e: vec2d lerp', () => {
  const rt = makeRuntime(`
    fn test_lerp2d_x(): int { return lerp2d_x(0, 0, 100, 200, 500); }
    fn test_lerp2d_y(): int { return lerp2d_y(0, 0, 100, 200, 500); }
  `, [MATH_SRC, VEC_SRC])

  test('lerp2d_x(0,0,100,200,500) = 50', () => expect(callAndGetRet(rt, 'test_lerp2d_x')).toBe(50))
  test('lerp2d_y(0,0,100,200,500) = 100', () => expect(callAndGetRet(rt, 'test_lerp2d_y')).toBe(100))
})

// ===========================================================================
// vec.mcrs — 3D geometry
// ===========================================================================

describe('stdlib e2e: vec3d geometry', () => {
  const rt = makeRuntime(`
    fn test_dot3d(): int { return dot3d(1, 2, 3, 4, 5, 6); }
    fn test_cross3d_x(): int { return cross3d_x(1, 0, 0, 0, 1, 0); }
    fn test_cross3d_y(): int { return cross3d_y(1, 0, 0, 0, 1, 0); }
    fn test_cross3d_z(): int { return cross3d_z(1, 0, 0, 0, 1, 0); }
    fn test_manhattan3d(): int { return manhattan3d(0, 0, 0, 1, 2, 3); }
    fn test_chebyshev3d(): int { return chebyshev3d(0, 0, 0, 3, 1, 2); }
  `, [MATH_SRC, VEC_SRC])

  test('dot3d(1,2,3,4,5,6) = 32', () => expect(callAndGetRet(rt, 'test_dot3d')).toBe(32))
  test('cross3d_x(1,0,0, 0,1,0) = 0', () => expect(callAndGetRet(rt, 'test_cross3d_x')).toBe(0))
  test('cross3d_y(1,0,0, 0,1,0) = 0', () => expect(callAndGetRet(rt, 'test_cross3d_y')).toBe(0))
  test('cross3d_z(1,0,0, 0,1,0) = 1', () => expect(callAndGetRet(rt, 'test_cross3d_z')).toBe(1))
  test('manhattan3d(0,0,0, 1,2,3) = 6', () => expect(callAndGetRet(rt, 'test_manhattan3d')).toBe(6))
  test('chebyshev3d(0,0,0, 3,1,2) = 3', () => expect(callAndGetRet(rt, 'test_chebyshev3d')).toBe(3))
})

describe('stdlib e2e: vec3d length & distance', () => {
  const rt = makeRuntime(`
    fn test_length3d(): int { return length3d_fixed(1, 1, 1); }
    fn test_distance3d(): int { return distance3d_fixed(0, 0, 0, 1, 1, 1); }
  `, [MATH_SRC, VEC_SRC])

  test('length3d_fixed(1,1,1) ≈ 1732', () => {
    const val = callAndGetRet(rt, 'test_length3d')
    expect(val).toBeGreaterThanOrEqual(1731)
    expect(val).toBeLessThanOrEqual(1733)
  })
  test('distance3d_fixed(0,0,0, 1,1,1) ≈ 1732', () => {
    const val = callAndGetRet(rt, 'test_distance3d')
    expect(val).toBeGreaterThanOrEqual(1731)
    expect(val).toBeLessThanOrEqual(1733)
  })
})

// ===========================================================================
// Additional stdlib: load sources
// ===========================================================================

const RANDOM_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/random.mcrs'),
  'utf-8',
)
const LIST_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/list.mcrs'),
  'utf-8',
)
const BIGINT_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/bigint.mcrs'),
  'utf-8',
)
const EASING_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/easing.mcrs'),
  'utf-8',
)

// ===========================================================================
// math.mcrs — runtime execution (extended)
// ===========================================================================

describe('math.mcrs — runtime execution', () => {
  const rt = makeRuntime(`
    fn test_abs_neg42(): int { return abs(-42); }
    fn test_min_3_7(): int { return min(3, 7); }
    fn test_max_3_7(): int { return max(3, 7); }
    fn test_clamp_15(): int { return clamp(15, 0, 10); }
    fn test_clamp_neg5(): int { return clamp(-5, 0, 10); }
    fn test_isqrt_144(): int { return isqrt(144); }
    fn test_isqrt_2(): int { return isqrt(2); }
    fn test_gcd_12_8(): int { return gcd(12, 8); }
    fn test_lcm_4_6(): int { return lcm(4, 6); }
    fn test_pow_2_10(): int { return pow_int(2, 10); }
    fn test_comb_5_2(): int { return combinations(5, 2); }
    fn test_comb_10_3(): int { return combinations(10, 3); }
    fn test_factorial_5(): int { return factorial(5); }
    fn test_log2_8(): int { return log2_int(8); }
    fn test_log2_1024(): int { return log2_int(1024); }
    fn test_sqrt_fx_40000(): int { return sqrt_fx(40000); }
    fn test_cbrt_fx_27(): int { return cbrt_fx(27); }
    fn test_cbrt_fx_1000(): int { return cbrt_fx(1000); }
    fn test_approx_eq_1(): int { return approx_eq(100, 103, 5); }
    fn test_approx_eq_0(): int { return approx_eq(100, 110, 5); }
  `)

  test('abs(-42) == 42', () => expect(callAndGetRet(rt, 'test_abs_neg42')).toBe(42))
  test('min(3,7) == 3', () => expect(callAndGetRet(rt, 'test_min_3_7')).toBe(3))
  test('max(3,7) == 7', () => expect(callAndGetRet(rt, 'test_max_3_7')).toBe(7))
  test('clamp(15,0,10) == 10', () => expect(callAndGetRet(rt, 'test_clamp_15')).toBe(10))
  test('clamp(-5,0,10) == 0', () => expect(callAndGetRet(rt, 'test_clamp_neg5')).toBe(0))
  test('isqrt(144) == 12', () => expect(callAndGetRet(rt, 'test_isqrt_144')).toBe(12))
  test('isqrt(2) == 1', () => expect(callAndGetRet(rt, 'test_isqrt_2')).toBe(1))
  test('gcd(12,8) == 4', () => expect(callAndGetRet(rt, 'test_gcd_12_8')).toBe(4))
  test('lcm(4,6) == 12', () => expect(callAndGetRet(rt, 'test_lcm_4_6')).toBe(12))
  test('pow_int(2,10) == 1024', () => expect(callAndGetRet(rt, 'test_pow_2_10')).toBe(1024))
  test('combinations(5,2) == 10', () => expect(callAndGetRet(rt, 'test_comb_5_2')).toBe(10))
  test('combinations(10,3) == 120', () => expect(callAndGetRet(rt, 'test_comb_10_3')).toBe(120))
  test('factorial(5) == 120', () => expect(callAndGetRet(rt, 'test_factorial_5')).toBe(120))
  test('log2_int(8) == 3', () => expect(callAndGetRet(rt, 'test_log2_8')).toBe(3))
  test('log2_int(1024) == 10', () => expect(callAndGetRet(rt, 'test_log2_1024')).toBe(10))
  test('sqrt_fx(40000) == 20000 (√4.0 × 10000 scale, fixed)', () => {
    // sqrt_fx(40000) = √(40000/10000) × 10000 = √4 × 10000 = 20000
    // Implementation: isqrt(40000) * 100 = 200 * 100 = 20000
    const val = callAndGetRet(rt, 'test_sqrt_fx_40000')
    expect(val).toBe(20000)
  })
  test('cbrt_fx(27) == 3', () => expect(callAndGetRet(rt, 'test_cbrt_fx_27')).toBe(3))
  test('cbrt_fx(1000) == 10', () => expect(callAndGetRet(rt, 'test_cbrt_fx_1000')).toBe(10))
  test('approx_eq(100, 103, 5) == 1', () => expect(callAndGetRet(rt, 'test_approx_eq_1')).toBe(1))
  test('approx_eq(100, 110, 5) == 0', () => expect(callAndGetRet(rt, 'test_approx_eq_0')).toBe(0))
})

// ===========================================================================
// random.mcrs — runtime
// ===========================================================================

describe('random.mcrs — runtime', () => {
  const rt = makeRuntime(`
    fn test_lcg_a(): int { return next_lcg(12345); }
    fn test_lcg_b(): int { return next_lcg(next_lcg(12345)); }
    fn test_rrange(): int { return random_range(next_lcg(99999), 0, 100); }
    fn test_rbool(): int { return random_bool(next_lcg(42)); }
  `, [MATH_SRC, RANDOM_SRC])

  test('next_lcg produces different values each call', () => {
    const a = callAndGetRet(rt, 'test_lcg_a')
    const b = callAndGetRet(rt, 'test_lcg_b')
    expect(a).not.toBe(b)
  })
  test('random_range stays in bounds [0,100)', () => {
    const val = callAndGetRet(rt, 'test_rrange')
    expect(val).toBeGreaterThanOrEqual(0)
    expect(val).toBeLessThan(100)
  })
  test('random_bool returns 0 or 1', () => {
    const val = callAndGetRet(rt, 'test_rbool')
    expect([0, 1]).toContain(val)
  })
})

// ===========================================================================
// list.mcrs — runtime
// ===========================================================================

describe('list.mcrs — runtime', () => {
  const rt = makeRuntime(`
    fn test_sort3_min(): int { return sort3(30, 10, 20, 0); }
    fn test_sort3_max(): int { return sort3(30, 10, 20, 2); }
    fn test_sort4_min(): int { return sort4(40, 10, 30, 20, 0); }
    fn test_list_min3(): int { return list_min3(5, 3, 8); }
    fn test_list_max3(): int { return list_max3(5, 3, 8); }
    fn test_avg3(): int { return avg3(10, 20, 30); }
    fn test_weighted2(): int { return weighted2(12345, 1, 1); }
  `, [MATH_SRC, LIST_SRC])

  test('sort3(30,10,20, 0) == 10 (min)', () => expect(callAndGetRet(rt, 'test_sort3_min')).toBe(10))
  test('sort3(30,10,20, 2) == 30 (max)', () => expect(callAndGetRet(rt, 'test_sort3_max')).toBe(30))
  test('sort4(40,10,30,20, 0) == 10', () => expect(callAndGetRet(rt, 'test_sort4_min')).toBe(10))
  test('list_min3(5,3,8) == 3', () => expect(callAndGetRet(rt, 'test_list_min3')).toBe(3))
  test('list_max3(5,3,8) == 8', () => expect(callAndGetRet(rt, 'test_list_max3')).toBe(8))
  test('avg3(10,20,30) == 20', () => expect(callAndGetRet(rt, 'test_avg3')).toBe(20))
  test('weighted2 returns 0 or 1', () => {
    const val = callAndGetRet(rt, 'test_weighted2')
    expect([0, 1]).toContain(val)
  })
})

// ===========================================================================
// bigint.mcrs — runtime
// ===========================================================================

describe('bigint.mcrs — runtime', () => {
  // bigint3_add: [0, 9999, 1] + [0, 0, 9999] = [0, 1, 0, 0] overflow mid → [1, 0, 0]
  // Use simpler: add_lo / carry
  const rt = makeRuntime(`
    fn test_bigint3_add_lo(): int { return bigint3_add_lo(9999, 1); }
    fn test_bigint3_carry_lo(): int { return bigint3_carry_lo(9999, 1); }
    fn test_bigint3_add_mid_carry(): int {
        let carry: int = bigint3_carry_lo(9999, 1);
        return bigint3_add_mid(9999, 0, carry);
    }
    fn test_bigint3_carry_mid(): int {
        let carry: int = bigint3_carry_lo(9999, 1);
        return bigint3_carry_mid(9999, 0, carry);
    }
    fn test_bigint3_cmp_gt(): int {
        return bigint3_cmp(1, 0, 0, 0, 9999, 9999);
    }
    fn test_bigint3_cmp_eq(): int {
        return bigint3_cmp(0, 100, 5000, 0, 100, 5000);
    }
    fn test_int32_bigint3_lo(): int { return int32_to_bigint3_lo(1023456789); }
    fn test_int32_bigint3_mid(): int { return int32_to_bigint3_mid(1023456789); }
    fn test_int32_bigint3_hi(): int { return int32_to_bigint3_hi(1023456789); }
  `, [MATH_SRC, BIGINT_SRC])

  test('bigint3_add_lo(9999,1) == 0 (overflow)', () =>
    expect(callAndGetRet(rt, 'test_bigint3_add_lo')).toBe(0))
  test('bigint3_carry_lo(9999,1) == 1', () =>
    expect(callAndGetRet(rt, 'test_bigint3_carry_lo')).toBe(1))
  test('bigint3_add_mid with carry propagates: (9999+0+1)%10000 == 0', () =>
    expect(callAndGetRet(rt, 'test_bigint3_add_mid_carry')).toBe(0))
  test('bigint3_carry_mid(9999,0,1) == 1 (cascade carry)', () =>
    expect(callAndGetRet(rt, 'test_bigint3_carry_mid')).toBe(1))
  test('bigint3_cmp: [1,0,0] > [0,9999,9999] returns 1', () =>
    expect(callAndGetRet(rt, 'test_bigint3_cmp_gt')).toBe(1))
  test('bigint3_cmp: equal returns 0', () =>
    expect(callAndGetRet(rt, 'test_bigint3_cmp_eq')).toBe(0))
  // 1023456789 = 10 * 10000^2 + 2345 * 10000 + 6789
  test('int32_to_bigint3_lo(1023456789) == 6789', () =>
    expect(callAndGetRet(rt, 'test_int32_bigint3_lo')).toBe(6789))
  test('int32_to_bigint3_mid(1023456789) == 2345', () =>
    expect(callAndGetRet(rt, 'test_int32_bigint3_mid')).toBe(2345))
  test('int32_to_bigint3_hi(1023456789) == 10', () =>
    expect(callAndGetRet(rt, 'test_int32_bigint3_hi')).toBe(10))
})
