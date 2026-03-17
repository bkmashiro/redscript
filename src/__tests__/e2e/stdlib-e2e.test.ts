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
const NOISE_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/noise.mcrs'),
  'utf-8',
)
const SIGNAL_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/signal.mcrs'),
  'utf-8',
)
const ADVANCED_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/advanced.mcrs'),
  'utf-8',
)
const VEC_SRC_FULL = fs.readFileSync(
  path.join(__dirname, '../../stdlib/vec.mcrs'),
  'utf-8',
)
const PARABOLA_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/parabola.mcrs'),
  'utf-8',
)
const QUAT_SRC = fs.readFileSync(
  path.join(__dirname, '../../stdlib/quaternion.mcrs'),
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

// ===========================================================================
// noise.mcrs — runtime
// ===========================================================================

describe('noise.mcrs — runtime', () => {
  const rt = makeRuntime(`
    fn test_hash_det(): int {
      let a: int = hash_1d(42);
      let b: int = hash_1d(42);
      if (a == b) { return 1; }
      return 0;
    }
    fn test_hash_diff(): int {
      let a: int = hash_1d(0);
      let b: int = hash_1d(1);
      if (a != b) { return 1; }
      return 0;
    }
    fn test_hash_1d_pos_in_range(): int {
      let h: int = hash_1d_pos(99);
      if (h >= 0) {
        if (h <= 10000) { return 1; }
      }
      return 0;
    }
    fn test_hash_2d_det(): int {
      let a: int = hash_2d(3, 7);
      let b: int = hash_2d(3, 7);
      if (a == b) { return 1; }
      return 0;
    }
    fn test_vn1d_in_range(): int {
      let v: int = value_noise_1d(15000);
      if (v >= 0) {
        if (v <= 10000) { return 1; }
      }
      return 0;
    }
    fn test_vn1d_det(): int {
      let a: int = value_noise_1d(25000);
      let b: int = value_noise_1d(25000);
      if (a == b) { return 1; }
      return 0;
    }
    fn test_vn1d_at_integer(): int {
      let vn: int = value_noise_1d(20000);
      let h: int = hash_1d_pos(2);
      if (vn == h) { return 1; }
      return 0;
    }
    fn test_vn2d_in_range(): int {
      let v: int = value_noise_2d(15000, 25000);
      if (v >= 0) {
        if (v <= 10000) { return 1; }
      }
      return 0;
    }
    fn test_fbm1d_1oct(): int {
      let f: int = fbm_1d(20000, 1, 5000);
      let v: int = value_noise_1d(20000);
      if (f == v) { return 1; }
      return 0;
    }
    fn test_fbm1d_in_range(): int {
      let v: int = fbm_1d(30000, 3, 5000);
      if (v >= 0) {
        if (v <= 10000) { return 1; }
      }
      return 0;
    }
    fn test_fbm2d_in_range(): int {
      let v: int = fbm_2d(10000, 20000, 2, 6000);
      if (v >= 0) {
        if (v <= 10000) { return 1; }
      }
      return 0;
    }
    fn test_terrain_in_range(): int {
      let h: int = terrain_height(0, 0, 64, 20);
      if (h >= 64) {
        if (h <= 84) { return 1; }
      }
      return 0;
    }
    fn test_terrain_spatial(): int {
      let a: int = terrain_height(0, 0, 64, 20);
      let b: int = terrain_height(7, 13, 64, 20);
      if (a != b) { return 1; }
      return 0;
    }
  `, [MATH_SRC, NOISE_SRC])

  test('hash_1d is deterministic', () => expect(callAndGetRet(rt, 'test_hash_det')).toBe(1))
  test('hash_1d(0) != hash_1d(1)', () => expect(callAndGetRet(rt, 'test_hash_diff')).toBe(1))
  test('hash_1d_pos returns [0, 10000]', () => expect(callAndGetRet(rt, 'test_hash_1d_pos_in_range')).toBe(1))
  test('hash_2d is deterministic', () => expect(callAndGetRet(rt, 'test_hash_2d_det')).toBe(1))
  test('value_noise_1d returns [0, 10000]', () => expect(callAndGetRet(rt, 'test_vn1d_in_range')).toBe(1))
  test('value_noise_1d is deterministic', () => expect(callAndGetRet(rt, 'test_vn1d_det')).toBe(1))
  test('value_noise_1d at integer boundary == hash_1d_pos', () => expect(callAndGetRet(rt, 'test_vn1d_at_integer')).toBe(1))
  test('value_noise_2d returns [0, 10000]', () => expect(callAndGetRet(rt, 'test_vn2d_in_range')).toBe(1))
  test('fbm_1d(x,1,p) == value_noise_1d(x) (1 octave)', () => expect(callAndGetRet(rt, 'test_fbm1d_1oct')).toBe(1))
  test('fbm_1d returns [0, 10000]', () => expect(callAndGetRet(rt, 'test_fbm1d_in_range')).toBe(1))
  test('fbm_2d returns [0, 10000]', () => expect(callAndGetRet(rt, 'test_fbm2d_in_range')).toBe(1))
  test('terrain_height(0,0,64,20) in [64,84]', () => expect(callAndGetRet(rt, 'test_terrain_in_range')).toBe(1))
  test('terrain_height varies spatially', () => expect(callAndGetRet(rt, 'test_terrain_spatial')).toBe(1))
})

// ===========================================================================
// signal.mcrs — runtime
// ===========================================================================

describe('signal.mcrs — runtime', () => {
  const rt = makeRuntime(`
    fn test_uniform_int_range(): int {
      let v: int = uniform_int(12345, 0, 10);
      if (v >= 0) { if (v <= 10) { return 1; } }
      return 0;
    }
    fn test_uniform_int_det(): int {
      let a: int = uniform_int(99999, 0, 100);
      let b: int = uniform_int(99999, 0, 100);
      if (a == b) { return 1; }
      return 0;
    }
    fn test_uniform_int_single(): int {
      return uniform_int(42, 5, 5);
    }
    fn test_uniform_frac_range(): int {
      let v: int = uniform_frac(12345);
      if (v >= 0) { if (v <= 10000) { return 1; } }
      return 0;
    }
    fn test_bernoulli_range(): int {
      let v: int = bernoulli(42, 5000);
      if (v >= 0) { if (v <= 1) { return 1; } }
      return 0;
    }
    fn test_bernoulli_always(): int { return bernoulli(42, 10000); }
    fn test_bernoulli_never(): int { return bernoulli(42, 0); }
    fn test_normal_range(): int {
      let v: int = normal_approx12(42);
      if (v >= -60000) { if (v <= 60000) { return 1; } }
      return 0;
    }
    fn test_normal_det(): int {
      let a: int = normal_approx12(100);
      let b: int = normal_approx12(100);
      if (a == b) { return 1; }
      return 0;
    }
    fn test_weighted2_range(): int {
      let v: int = weighted2(12345, 3, 7);
      if (v >= 0) { if (v <= 1) { return 1; } }
      return 0;
    }
    fn test_weighted2_all_on_1(): int { return weighted2(42, 0, 1); }
    fn test_weighted2_all_on_0(): int { return weighted2(42, 1, 0); }
    fn test_weighted3_range(): int {
      let v: int = weighted3(99999, 2, 3, 5);
      if (v >= 0) { if (v <= 2) { return 1; } }
      return 0;
    }
    fn test_weighted3_all_on_2(): int { return weighted3(42, 0, 0, 1); }
    fn test_weighted3_all_on_0(): int { return weighted3(42, 1, 0, 0); }
    fn test_exp_range(): int {
      let v: int = exp_dist_approx(42, 10000);
      if (v >= 0) { if (v <= 100000) { return 1; } }
      return 0;
    }
    fn test_exp_det(): int {
      let a: int = exp_dist_approx(12345, 10000);
      let b: int = exp_dist_approx(12345, 10000);
      if (a == b) { return 1; }
      return 0;
    }
  `, [MATH_SRC, RANDOM_SRC, SIGNAL_SRC])

  test('uniform_int(seed,0,10) in [0,10]', () => expect(callAndGetRet(rt, 'test_uniform_int_range')).toBe(1))
  test('uniform_int is deterministic', () => expect(callAndGetRet(rt, 'test_uniform_int_det')).toBe(1))
  test('uniform_int(seed,5,5) == 5', () => expect(callAndGetRet(rt, 'test_uniform_int_single')).toBe(5))
  test('uniform_frac returns [0,10000]', () => expect(callAndGetRet(rt, 'test_uniform_frac_range')).toBe(1))
  test('bernoulli returns 0 or 1', () => expect(callAndGetRet(rt, 'test_bernoulli_range')).toBe(1))
  test('bernoulli(seed,10000) == 1 (always)', () => expect(callAndGetRet(rt, 'test_bernoulli_always')).toBe(1))
  test('bernoulli(seed,0) == 0 (never)', () => expect(callAndGetRet(rt, 'test_bernoulli_never')).toBe(0))
  test('normal_approx12 in [-60000,60000]', () => expect(callAndGetRet(rt, 'test_normal_range')).toBe(1))
  test('normal_approx12 is deterministic', () => expect(callAndGetRet(rt, 'test_normal_det')).toBe(1))
  test('weighted2 returns 0 or 1', () => expect(callAndGetRet(rt, 'test_weighted2_range')).toBe(1))
  test('weighted2(seed,0,1) == 1 (all weight on 1)', () => expect(callAndGetRet(rt, 'test_weighted2_all_on_1')).toBe(1))
  test('weighted2(seed,1,0) == 0 (all weight on 0)', () => expect(callAndGetRet(rt, 'test_weighted2_all_on_0')).toBe(0))
  test('weighted3 returns 0,1,2', () => expect(callAndGetRet(rt, 'test_weighted3_range')).toBe(1))
  test('weighted3(seed,0,0,1) == 2 (all weight on 2)', () => expect(callAndGetRet(rt, 'test_weighted3_all_on_2')).toBe(2))
  test('weighted3(seed,1,0,0) == 0 (all weight on 0)', () => expect(callAndGetRet(rt, 'test_weighted3_all_on_0')).toBe(0))
  test('exp_dist_approx in [0,100000]', () => expect(callAndGetRet(rt, 'test_exp_range')).toBe(1))
  test('exp_dist_approx is deterministic', () => expect(callAndGetRet(rt, 'test_exp_det')).toBe(1))
})

// ===========================================================================
// advanced.mcrs — runtime
// ===========================================================================

describe('advanced.mcrs — number theory', () => {
  const rt = makeRuntime(`
    fn test_fib_0(): int { return fib(0); }
    fn test_fib_1(): int { return fib(1); }
    fn test_fib_10(): int { return fib(10); }
    fn test_fib_20(): int { return fib(20); }
    fn test_is_prime_2(): int { return is_prime(2); }
    fn test_is_prime_4(): int { return is_prime(4); }
    fn test_is_prime_97(): int { return is_prime(97); }
    fn test_is_prime_1(): int { return is_prime(1); }
    fn test_collatz_1(): int { return collatz_steps(1); }
    fn test_collatz_6(): int { return collatz_steps(6); }
    fn test_collatz_27(): int { return collatz_steps(27); }
    fn test_digit_sum_123(): int { return digit_sum(123); }
    fn test_digit_sum_0(): int { return digit_sum(0); }
    fn test_count_digits_0(): int { return count_digits(0); }
    fn test_count_digits_100(): int { return count_digits(100); }
    fn test_reverse_12345(): int { return reverse_int(12345); }
    fn test_reverse_neg42(): int { return reverse_int(-42); }
    fn test_mod_pow(): int { return mod_pow(2, 10, 1000); }
    fn test_mod_pow_base(): int { return mod_pow(3, 0, 7); }
    fn test_digital_root_493(): int { return digital_root(493); }
    fn test_digital_root_9(): int { return digital_root(9); }
    fn test_digital_root_0(): int { return digital_root(0); }
    fn test_newton_sqrt_25(): int { return newton_sqrt(25); }
    fn test_newton_sqrt_100(): int { return newton_sqrt(100); }
    fn test_newton_sqrt_2(): int { return newton_sqrt(2); }
    fn test_spiral_ring_1(): int { return spiral_ring(1); }
    fn test_spiral_ring_9(): int { return spiral_ring(9); }
    fn test_spiral_ring_25(): int { return spiral_ring(25); }
  `, [MATH_SRC, ADVANCED_SRC])

  // fib
  test('fib(0) == 0', () => expect(callAndGetRet(rt, 'test_fib_0')).toBe(0))
  test('fib(1) == 1', () => expect(callAndGetRet(rt, 'test_fib_1')).toBe(1))
  test('fib(10) == 55', () => expect(callAndGetRet(rt, 'test_fib_10')).toBe(55))
  test('fib(20) == 6765', () => expect(callAndGetRet(rt, 'test_fib_20')).toBe(6765))

  // is_prime
  test('is_prime(2) == 1', () => expect(callAndGetRet(rt, 'test_is_prime_2')).toBe(1))
  test('is_prime(4) == 0', () => expect(callAndGetRet(rt, 'test_is_prime_4')).toBe(0))
  test('is_prime(97) == 1', () => expect(callAndGetRet(rt, 'test_is_prime_97')).toBe(1))
  test('is_prime(1) == 0', () => expect(callAndGetRet(rt, 'test_is_prime_1')).toBe(0))

  // collatz
  test('collatz_steps(1) == 0', () => expect(callAndGetRet(rt, 'test_collatz_1')).toBe(0))
  test('collatz_steps(6) == 8', () => expect(callAndGetRet(rt, 'test_collatz_6')).toBe(8))
  test('collatz_steps(27) == 111', () => expect(callAndGetRet(rt, 'test_collatz_27')).toBe(111))

  // digit_sum / count_digits
  test('digit_sum(123) == 6', () => expect(callAndGetRet(rt, 'test_digit_sum_123')).toBe(6))
  test('digit_sum(0) == 0', () => expect(callAndGetRet(rt, 'test_digit_sum_0')).toBe(0))
  test('count_digits(0) == 1', () => expect(callAndGetRet(rt, 'test_count_digits_0')).toBe(1))
  test('count_digits(100) == 3', () => expect(callAndGetRet(rt, 'test_count_digits_100')).toBe(3))

  // reverse_int
  test('reverse_int(12345) == 54321', () => expect(callAndGetRet(rt, 'test_reverse_12345')).toBe(54321))
  test('reverse_int(-42) == -24', () => expect(callAndGetRet(rt, 'test_reverse_neg42')).toBe(-24))

  // mod_pow
  test('mod_pow(2, 10, 1000) == 24', () => expect(callAndGetRet(rt, 'test_mod_pow')).toBe(24))
  test('mod_pow(3, 0, 7) == 1 (anything^0 = 1)', () => expect(callAndGetRet(rt, 'test_mod_pow_base')).toBe(1))

  // digital_root
  test('digital_root(493) == 7', () => expect(callAndGetRet(rt, 'test_digital_root_493')).toBe(7))
  test('digital_root(9) == 9', () => expect(callAndGetRet(rt, 'test_digital_root_9')).toBe(9))
  test('digital_root(0) == 0', () => expect(callAndGetRet(rt, 'test_digital_root_0')).toBe(0))

  // newton_sqrt
  test('newton_sqrt(25) == 5', () => expect(callAndGetRet(rt, 'test_newton_sqrt_25')).toBe(5))
  test('newton_sqrt(100) == 10', () => expect(callAndGetRet(rt, 'test_newton_sqrt_100')).toBe(10))
  test('newton_sqrt(2) == 1 (floor)', () => expect(callAndGetRet(rt, 'test_newton_sqrt_2')).toBe(1))

  // spiral_ring
  test('spiral_ring(1) == 0', () => expect(callAndGetRet(rt, 'test_spiral_ring_1')).toBe(0))
  test('spiral_ring(9) == 1', () => expect(callAndGetRet(rt, 'test_spiral_ring_9')).toBe(1))
  test('spiral_ring(25) == 2', () => expect(callAndGetRet(rt, 'test_spiral_ring_25')).toBe(2))
})

describe('advanced.mcrs — curves & fractals', () => {
  const rt = makeRuntime(`
    fn test_bezier_quad_start(): int { return bezier_quad(0, 500, 1000, 0); }
    fn test_bezier_quad_end(): int { return bezier_quad(0, 500, 1000, 1000); }
    fn test_bezier_quad_mid(): int { return bezier_quad(0, 500, 1000, 500); }
    fn test_bezier_quad_arch(): int { return bezier_quad(0, 1000, 0, 500); }
    fn test_bezier_cubic_start(): int { return bezier_cubic(0, 333, 667, 1000, 0); }
    fn test_bezier_cubic_end(): int { return bezier_cubic(0, 333, 667, 1000, 1000); }
    fn test_mandelbrot_in_set(): int { return mandelbrot_iter(-1000, 0, 100); }
    fn test_mandelbrot_outside(): int { return mandelbrot_iter(1000, 0, 100); }
    fn test_hash_int_det(): int {
      let a: int = hash_int(42);
      let b: int = hash_int(42);
      if (a == b) { return 1; }
      return 0;
    }
    fn test_hash_int_diff(): int {
      let a: int = hash_int(0);
      let b: int = hash_int(1);
      if (a != b) { return 1; }
      return 0;
    }
    fn test_noise1d_range(): int {
      let v: int = noise1d(500);
      if (v >= 0) { if (v < 1000) { return 1; } }
      return 0;
    }
  `, [MATH_SRC, ADVANCED_SRC])

  // bezier_quad
  test('bezier_quad(0,500,1000, t=0) == 0 (start)', () => expect(callAndGetRet(rt, 'test_bezier_quad_start')).toBe(0))
  test('bezier_quad(0,500,1000, t=1000) == 1000 (end)', () => expect(callAndGetRet(rt, 'test_bezier_quad_end')).toBe(1000))
  test('bezier_quad(0,500,1000, t=500) == 500 (midpoint)', () => expect(callAndGetRet(rt, 'test_bezier_quad_mid')).toBe(500))
  test('bezier_quad(0,1000,0, t=500) == 500 (arch)', () => expect(callAndGetRet(rt, 'test_bezier_quad_arch')).toBe(500))

  // bezier_cubic
  test('bezier_cubic(0,333,667,1000, t=0) == 0 (start)', () => expect(callAndGetRet(rt, 'test_bezier_cubic_start')).toBe(0))
  test('bezier_cubic(0,333,667,1000, t=1000) == 1000 (end)', () => expect(callAndGetRet(rt, 'test_bezier_cubic_end')).toBe(1000))

  // mandelbrot
  test('mandelbrot_iter(-1000,0,100) == 100 (in set, c=-1+0i)', () => expect(callAndGetRet(rt, 'test_mandelbrot_in_set')).toBe(100))
  test('mandelbrot_iter(1000,0,100) < 100 (outside, escapes quickly)', () => expect(callAndGetRet(rt, 'test_mandelbrot_outside')).toBeLessThan(100))

  // hash_int
  test('hash_int is deterministic', () => expect(callAndGetRet(rt, 'test_hash_int_det')).toBe(1))
  test('hash_int(0) != hash_int(1)', () => expect(callAndGetRet(rt, 'test_hash_int_diff')).toBe(1))

  // noise1d
  test('noise1d(500) in [0, 1000)', () => expect(callAndGetRet(rt, 'test_noise1d_range')).toBe(1))
})

// ===========================================================================
// bigint.mcrs — full multiplication (bigint_mul / bigint_sq)
// ===========================================================================

describe('bigint.mcrs — bigint_mul / bigint_sq', () => {
  const rt = makeRuntime(`
    // bigint_mul: [0, 0, 3] * [0, 0, 4] = [0, 0, 0, 0, 12]
    fn test_mul_simple_lo(): int {
        let a: int[] = [0, 0, 3];
        let b: int[] = [0, 0, 4];
        let r: int[] = [0, 0, 0, 0, 0, 0];
        bigint_mul(a, b, r, 3, 3);
        return r[5];     // LSB: 3*4=12
    }
    fn test_mul_simple_hi(): int {
        let a: int[] = [0, 0, 3];
        let b: int[] = [0, 0, 4];
        let r: int[] = [0, 0, 0, 0, 0, 0];
        bigint_mul(a, b, r, 3, 3);
        return r[4];     // should be 0
    }

    // bigint_mul: [0, 1, 0] * [0, 0, 5000] = [0, 0, 0, 5000, 0, 0]
    // = 10000 * 5000 = 50,000,000 = [0, 0, 5000, 0] in base 10000
    // With 3+3=6 chunks: [0, 0, 0, 5000, 0, 0]
    fn test_mul_carry_chunk(): int {
        let a: int[] = [0, 1, 0];     // value = 10000
        let b: int[] = [0, 0, 5000]; // value = 5000
        // product = 50,000,000 = [0,0,0,5000,0,0] in 6 chunks
        // a[1]*b[2] -> pos = 1+2+1 = 4, so r[4]=5000
        let r: int[] = [0, 0, 0, 0, 0, 0];
        bigint_mul(a, b, r, 3, 3);
        return r[4];   // 5000
    }

    // bigint_mul: 9999 * 9999 = 99,980,001
    // bigint3: [0, 0, 9999] * [0, 0, 9999] = 99,980,001
    // = [0, 0, 0, 9998, 1] in base 10000
    fn test_mul_max_chunk_lo(): int {
        let a: int[] = [0, 0, 9999];
        let b: int[] = [0, 0, 9999];
        let r: int[] = [0, 0, 0, 0, 0, 0];
        bigint_mul(a, b, r, 3, 3);
        return r[5];   // 99980001 % 10000 = 1 (wait: 99980001 = 9998*10000 + 1)... = 1
    }
    fn test_mul_max_chunk_hi(): int {
        let a: int[] = [0, 0, 9999];
        let b: int[] = [0, 0, 9999];
        let r: int[] = [0, 0, 0, 0, 0, 0];
        bigint_mul(a, b, r, 3, 3);
        return r[4];   // 9998
    }

    // bigint_sq: [0, 0, 3]^2 = [0, 0, 0, 0, 0, 9]
    fn test_sq_simple(): int {
        let a: int[] = [0, 0, 3];
        let r: int[] = [0, 0, 0, 0, 0, 0];
        bigint_sq(a, r, 3);
        return r[5];  // 9
    }

    // bigint_sq: [0, 0, 100]^2 = [0, 0, 0, 0, 1, 0]   (10000)
    fn test_sq_100_hi(): int {
        let a: int[] = [0, 0, 100];
        let r: int[] = [0, 0, 0, 0, 0, 0];
        bigint_sq(a, r, 3);
        return r[4];   // 10000/10000 = 1
    }
    fn test_sq_100_lo(): int {
        let a: int[] = [0, 0, 100];
        let r: int[] = [0, 0, 0, 0, 0, 0];
        bigint_sq(a, r, 3);
        return r[5];   // 10000 % 10000 = 0
    }

    // bigint_mul_result_len
    fn test_result_len(): int { return bigint_mul_result_len(3, 4); }
  `, [MATH_SRC, BIGINT_SRC])

  test('bigint_mul([0,0,3], [0,0,4]) lo == 12', () => expect(callAndGetRet(rt, 'test_mul_simple_lo')).toBe(12))
  test('bigint_mul([0,0,3], [0,0,4]) hi == 0 (no overflow)', () => expect(callAndGetRet(rt, 'test_mul_simple_hi')).toBe(0))
  test('bigint_mul([0,1,0], [0,0,5000]) chunk[4] == 5000 (carry)', () => expect(callAndGetRet(rt, 'test_mul_carry_chunk')).toBe(5000))
  test('bigint_mul(9999, 9999) lo == 1', () => expect(callAndGetRet(rt, 'test_mul_max_chunk_lo')).toBe(1))
  test('bigint_mul(9999, 9999) hi chunk == 9998', () => expect(callAndGetRet(rt, 'test_mul_max_chunk_hi')).toBe(9998))
  test('bigint_sq([0,0,3]) lo == 9', () => expect(callAndGetRet(rt, 'test_sq_simple')).toBe(9))
  test('bigint_sq([0,0,100]) chunk[4] == 1 (10000 carry)', () => expect(callAndGetRet(rt, 'test_sq_100_hi')).toBe(1))
  test('bigint_sq([0,0,100]) chunk[5] == 0', () => expect(callAndGetRet(rt, 'test_sq_100_lo')).toBe(0))
  test('bigint_mul_result_len(3, 4) == 7', () => expect(callAndGetRet(rt, 'test_result_len')).toBe(7))
})

// ===========================================================================
// parabola.mcrs — runtime
// ===========================================================================

describe('parabola.mcrs — ballistic trajectory', () => {
  const rt = makeRuntime(`
    // parabola_vx(10, 20) = 10*10000/20 = 5000 (0.5 b/tick)
    fn test_vx(): int { return parabola_vx(10, 20); }

    // parabola_vz(0, 20) = 0
    fn test_vz_zero(): int { return parabola_vz(0, 20); }

    // parabola_vy: flat shot (dy=0, t=20) = gravity_half * t^2 / t = 400*400/20 = 8000
    // = (0 + 400*20*20/10000) / 20 = (0 + 1600) / 20 = 80... wait
    // g_term = 400 * 20 * 20 / 10000 = 160000/10000 = 16
    // vy = (0 + 16*10000) / 20... no:
    // g_term = parabola_gravity_half() * ticks * ticks / 10000 = 400*20*20/10000 = 16
    // vy = (dy*10000 + g_term) / ticks = (0 + 16) / 20 = 0 (integer division)
    // Actually: g_term = 400 * 20 * 20 / 10000 = 160000/10000 = 16
    // vy = (0 + 16) / 20 = 0 (floors!)
    // That's correct for integer: very small arc over 20 ticks
    fn test_vy_flat(): int { return parabola_vy(0, 20); }

    // parabola_vy(10, 20): dy=10 blocks up in 20 ticks
    // g_term = 400*400/10000 = 16 (same)
    // vy = (10*10000 + 16) / 20 = 100016 / 20 = 5000
    fn test_vy_up(): int { return parabola_vy(10, 20); }

    // parabola_x(5000, 20) = 5000*20/10000 = 10
    fn test_x_at_t(): int { return parabola_x(5000, 20); }

    // parabola_y(5000, 20): vy0=5000 (0.5 b/t), at t=20
    // = 5000*20/10000 - 400*20*20/10000 = 10 - 16 = -6 (landed below)
    fn test_y_at_t(): int { return parabola_y(5000, 20); }

    // parabola_flight_time(8000): vy0=0.8 b/t
    // t = 2 * 8000 / 800 = 20
    fn test_flight_time(): int { return parabola_flight_time(8000); }

    // parabola_max_height(8000): apex at t=8000/800=10
    // y(10) = 8000*10/10000 - 400*100/10000 = 8 - 4 = 4
    fn test_max_height(): int { return parabola_max_height(8000); }

    // parabola_in_range(3, 4, 5) = 1 (dist=5, range=5)
    fn test_in_range(): int { return parabola_in_range(3, 4, 5); }

    // parabola_in_range(3, 4, 4) = 0 (dist=5 > 4)
    fn test_out_of_range(): int { return parabola_in_range(3, 4, 4); }

    // drag step: step_vx(10000, 9900) = mulfix(10000, 9900) = 10000*9900/1000 = 99000... 
    // mulfix is ×1000 scale: mulfix(a,b) = a*b/1000
    // 10000 * 9900 / 1000 = 99000
    fn test_drag_vx(): int { return parabola_step_vx(10000, 9900); }

    // step_vy(10000, 9900) = mulfix(10000 - 800, 9900) = 9200 * 9900 / 1000 = 91080
    fn test_drag_vy(): int { return parabola_step_vy(10000, 9900); }

    // gravity constant
    fn test_gravity(): int { return parabola_gravity(); }

    // ticks_for_range(8) = 8*10000/8000 = 10
    fn test_ticks_range(): int { return parabola_ticks_for_range(8); }
  `, [MATH_SRC, PARABOLA_SRC])

  test('parabola_gravity() == 800', () => expect(callAndGetRet(rt, 'test_gravity')).toBe(800))
  test('parabola_vx(10, 20) == 5000', () => expect(callAndGetRet(rt, 'test_vx')).toBe(5000))
  test('parabola_vz(0, 20) == 0', () => expect(callAndGetRet(rt, 'test_vz_zero')).toBe(0))
  test('parabola_vy(0, 20) == 0 (flat shot integer floor)', () => expect(callAndGetRet(rt, 'test_vy_flat')).toBe(0))
  test('parabola_vy(10, 20) == 5000 (arc up 10 blocks)', () => expect(callAndGetRet(rt, 'test_vy_up')).toBe(5000))
  test('parabola_x(5000, 20) == 10 (0.5 b/t × 20t)', () => expect(callAndGetRet(rt, 'test_x_at_t')).toBe(10))
  test('parabola_y(5000, 20) == -6 (landed below launch)', () => expect(callAndGetRet(rt, 'test_y_at_t')).toBe(-6))
  test('parabola_flight_time(8000) == 20 ticks', () => expect(callAndGetRet(rt, 'test_flight_time')).toBe(20))
  test('parabola_max_height(8000) == 4 blocks', () => expect(callAndGetRet(rt, 'test_max_height')).toBe(4))
  test('parabola_in_range(3,4,5) == 1 (on boundary)', () => expect(callAndGetRet(rt, 'test_in_range')).toBe(1))
  test('parabola_in_range(3,4,4) == 0 (out of range)', () => expect(callAndGetRet(rt, 'test_out_of_range')).toBe(0))
  test('parabola_step_vx(10000, 9900) == 99000 (drag)', () => expect(callAndGetRet(rt, 'test_drag_vx')).toBe(99000))
  test('parabola_step_vy(10000, 9900) == 91080 (gravity+drag)', () => expect(callAndGetRet(rt, 'test_drag_vy')).toBe(91080))
  test('parabola_ticks_for_range(8) == 10', () => expect(callAndGetRet(rt, 'test_ticks_range')).toBe(10))
})

// ===========================================================================
// quaternion.mcrs — runtime
// ===========================================================================

describe('quaternion.mcrs — rotation math', () => {
  // Note: sin_fixed/cos_fixed use NBT lookup tables unavailable in MCRuntime.
  // Tests use pre-computed values directly instead of axis constructor functions.
  // quat components ×10000: identity=(0,0,0,10000), 90°Y=(0,7071,0,7071)
  const rt = makeRuntime(`
    // Identity quaternion constants
    fn test_identity_w(): int { return quat_identity_w(); }
    fn test_identity_x(): int { return quat_identity_x(); }

    // Quaternion multiplication: identity * identity = identity
    fn test_mul_identity_w(): int {
        return quat_mul_w(0, 0, 0, 10000, 0, 0, 0, 10000);
    }
    fn test_mul_identity_x(): int {
        return quat_mul_x(0, 0, 0, 10000, 0, 0, 0, 10000);
    }

    // q * q_inv = identity: q=(0,7071,0,7071), conj=(0,-7071,0,7071)
    fn test_mul_q_conj_w(): int {
        return quat_mul_w(0, 7071, 0, 7071, 0, -7071, 0, 7071);
    }

    // Conjugate
    fn test_conj_w(): int { return quat_conj_w(0, 0, 0, 10000); }
    fn test_conj_x(): int { return quat_conj_x(7071, 0, 0, 7071); }

    // Magnitude squared of identity: mulfix(10000,10000) = 10000*10000/1000 = 100000
    fn test_mag_sq_identity(): int { return quat_mag_sq(0, 0, 0, 10000); }

    // Magnitude squared of precomputed 90°Y: (0, 7071, 0, 7071)
    // mulfix(7071,7071)*2 = 7071*7071/1000 * 2 = 49998 * 2 = 99996
    fn test_mag_sq_rot(): int { return quat_mag_sq(0, 7071, 0, 7071); }

    // Dot product of identity with itself: mulfix(10000,10000) = 100000
    fn test_dot_identity(): int {
        return quat_dot(0, 0, 0, 10000, 0, 0, 0, 10000);
    }

    // Dot of two identical 90°Y quats
    fn test_dot_same(): int {
        return quat_dot(0, 7071, 0, 7071, 0, 7071, 0, 7071);
    }

    // SLERP: lerp between identity and 90°Y at t=0 → identity
    fn test_slerp_t0_w(): int {
        return quat_slerp_w(0, 0, 0, 10000, 0, 7071, 0, 7071, 0);
    }
    fn test_slerp_t0_y(): int {
        return quat_slerp_y(0, 0, 0, 10000, 0, 7071, 0, 7071, 0);
    }
    // SLERP at t=1000 → second quat (normalized)
    fn test_slerp_t1000_y(): int {
        return quat_slerp_y(0, 0, 0, 10000, 0, 7071, 0, 7071, 1000);
    }
    fn test_slerp_t1000_w(): int {
        return quat_slerp_w(0, 0, 0, 10000, 0, 7071, 0, 7071, 1000);
    }
    // SLERP midpoint t=500: lerp(identity, 90°Y) → normalize([0, 3535, 0, 13535])
    fn test_slerp_t500_y(): int {
        return quat_slerp_y(0, 0, 0, 10000, 0, 7071, 0, 7071, 500);
    }
  `, [MATH_SRC, QUAT_SRC])

  test('quat_identity_w() == 10000', () => expect(callAndGetRet(rt, 'test_identity_w')).toBe(10000))
  test('quat_identity_x() == 0', () => expect(callAndGetRet(rt, 'test_identity_x')).toBe(0))
  test('quat_mul(identity, identity).w == 100000 (×10000 scale)', () => expect(callAndGetRet(rt, 'test_mul_identity_w')).toBe(100000))
  test('quat_mul(identity, identity).x == 0', () => expect(callAndGetRet(rt, 'test_mul_identity_x')).toBe(0))
  test('quat_mul(q, conj(q)).w ≈ 100000 (≈ identity)', () => {
    const v = callAndGetRet(rt, 'test_mul_q_conj_w')
    expect(Math.abs(v - 100000)).toBeLessThanOrEqual(200)
  })
  test('quat_conj(identity).w == 10000', () => expect(callAndGetRet(rt, 'test_conj_w')).toBe(10000))
  test('quat_conj([7071,0,0,7071]).x == -7071', () => expect(callAndGetRet(rt, 'test_conj_x')).toBe(-7071))
  test('quat_mag_sq(identity) == 100000 (mulfix scale)', () => expect(callAndGetRet(rt, 'test_mag_sq_identity')).toBe(100000))
  test('quat_mag_sq([0,7071,0,7071]) ≈ 99996 (near unit)', () => {
    const v = callAndGetRet(rt, 'test_mag_sq_rot')
    expect(Math.abs(v - 100000)).toBeLessThanOrEqual(10)
  })
  test('quat_dot(identity, identity) == 100000', () => expect(callAndGetRet(rt, 'test_dot_identity')).toBe(100000))
  test('quat_dot(q, q) ≈ 99996 (near unit)', () => {
    const v = callAndGetRet(rt, 'test_dot_same')
    expect(Math.abs(v - 100000)).toBeLessThanOrEqual(10)
  })
  test('quat_slerp(a,b,0).w == 10000 (= a)', () => expect(callAndGetRet(rt, 'test_slerp_t0_w')).toBe(10000))
  test('quat_slerp(a,b,0).y == 0 (= a)', () => expect(callAndGetRet(rt, 'test_slerp_t0_y')).toBe(0))
  test('quat_slerp(a,b,1000).y ≈ 7071 (= b normalized)', () => {
    const v = callAndGetRet(rt, 'test_slerp_t1000_y')
    expect(Math.abs(v - 7071)).toBeLessThanOrEqual(20)
  })
  test('quat_slerp(a,b,1000).w ≈ 7071 (= b normalized)', () => {
    const v = callAndGetRet(rt, 'test_slerp_t1000_w')
    expect(Math.abs(v - 7071)).toBeLessThanOrEqual(20)
  })
  test('quat_slerp(a,b,500).y > 0 (moving toward b)', () => {
    const v = callAndGetRet(rt, 'test_slerp_t500_y')
    expect(v).toBeGreaterThan(0)
    expect(v).toBeLessThan(7071)
  })
})
