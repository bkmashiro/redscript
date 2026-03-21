/**
 * RedScript MC Integration Tests — stdlib coverage 2
 *
 * Tests calculus / matrix / signal stdlib modules against a real Paper 1.21.4
 * server with TestHarnessPlugin.
 *
 * Prerequisites:
 *   - Paper server running with TestHarnessPlugin on port 25561
 *   - MC_SERVER_DIR env var pointing to server directory
 *
 * Run: MC_SERVER_DIR=~/mc-test-server npx jest stdlib-coverage-2 --testTimeout=120000
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../compile'
import { MCTestClient } from '../../mc-test/client'

const MC_HOST = process.env.MC_HOST ?? 'localhost'
const MC_PORT = parseInt(process.env.MC_PORT ?? '25561')
const MC_SERVER_DIR = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')
const DATAPACK_DIR = path.join(MC_SERVER_DIR, 'world', 'datapacks', 'redscript-test2')

const STDLIB_DIR = path.join(__dirname, '../../stdlib')

let serverOnline = false
let mc: MCTestClient

// ---------------------------------------------------------------------------
// Helper: compile and deploy a RedScript snippet with optional stdlib libs
// ---------------------------------------------------------------------------
function writeFixture(source: string, namespace: string, librarySources: string[] = []): void {
  fs.mkdirSync(DATAPACK_DIR, { recursive: true })
  if (!fs.existsSync(path.join(DATAPACK_DIR, 'pack.mcmeta'))) {
    fs.writeFileSync(
      path.join(DATAPACK_DIR, 'pack.mcmeta'),
      JSON.stringify({ pack: { pack_format: 48, description: 'RedScript integration tests 2' } })
    )
  }

  const result = compile(source, { namespace, librarySources })

  for (const file of result.files) {
    if (file.path === 'pack.mcmeta') continue
    const filePath = path.join(DATAPACK_DIR, file.path)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })

    // Merge minecraft tag files (tick.json / load.json) instead of overwriting
    if (file.path.includes('data/minecraft/tags/') && fs.existsSync(filePath)) {
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      const incoming = JSON.parse(file.content)
      const merged = { values: [...new Set([...(existing.values ?? []), ...(incoming.values ?? [])])] }
      fs.writeFileSync(filePath, JSON.stringify(merged, null, 2))
    } else {
      fs.writeFileSync(filePath, file.content)
    }
  }
}

function readStdlib(name: string): string {
  return fs.readFileSync(path.join(STDLIB_DIR, name), 'utf-8')
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  if (process.env.MC_OFFLINE === 'true') {
    console.warn('⚠ MC_OFFLINE=true — skipping stdlib-coverage-2 integration tests')
    return
  }

  mc = new MCTestClient(MC_HOST, MC_PORT)

  try {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if (await mc.isOnline()) { serverOnline = true; break }
      await new Promise(r => setTimeout(r, 1000))
    }
  } catch {
    serverOnline = false
  }

  if (!serverOnline) {
    console.warn(`⚠ MC server not running at ${MC_HOST}:${MC_PORT} — skipping stdlib-coverage-2 tests`)
    return
  }

  // Clear stale minecraft tag files before writing fixtures
  for (const tagFile of [
    'data/minecraft/tags/function/tick.json',
    'data/minecraft/tags/function/load.json',
    'data/minecraft/tags/functions/tick.json',
    'data/minecraft/tags/functions/load.json',
  ]) {
    const p = path.join(DATAPACK_DIR, tagFile)
    if (fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify({ values: [] }, null, 2))
  }

  // Ensure result objective exists
  await mc.command('/scoreboard objectives add stdlib2_result dummy').catch(() => {})

  const MATH_SRC = readStdlib('math.mcrs')
  const CALCULUS_SRC = readStdlib('calculus.mcrs')
  const MATRIX_SRC = readStdlib('matrix.mcrs')
  const SIGNAL_SRC = readStdlib('signal.mcrs')

  // ── calculus module fixtures ──────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_calculus_test

    fn test_deriv_forward() {
      // f(x+h)=20000, f(x)=10000, h=10000 → derivative = (20000-10000)*10000/10000 = 10000
      let r: int = deriv_forward(20000, 10000, 10000);
      scoreboard_set("#calc_deriv_fwd", #stdlib2_result, r);
    }

    fn test_deriv_central() {
      // f(x+h)=30000, f(x-h)=10000, h=10000 → (30000-10000)*10000/(2*10000) = 10000
      let r: int = deriv_central(30000, 10000, 10000);
      scoreboard_set("#calc_deriv_cen", #stdlib2_result, r);
    }

    fn test_deriv_central_linear() {
      // For f(x) = 2x (slope = 2), f(x+h)=12000, f(x-h)=8000, h=1000
      // central diff = (12000-8000)*10000/(2*1000) = 40000000/2000 = 20000 (= 2.0 ×10000)
      let r: int = deriv_central(12000, 8000, 1000);
      scoreboard_set("#calc_deriv_linear", #stdlib2_result, r);
    }

    fn test_integrate_trapezoid() {
      // 3 points [0, 5000, 10000] with h=10000 (step = 1.0)
      // Trapezoid: sum = 0/2 + 10000/2 + 5000 = 10000; result = 10000*10000/10000 = 10000
      let vals: int[] = [0, 5000, 10000];
      let r: int = integrate_trapezoid(vals, 3, 10000);
      scoreboard_set("#calc_trap", #stdlib2_result, r);
    }

    fn test_integrate_trapezoid_constant() {
      // Constant function f=10000 over [0, 2] with h=10000, n=3
      // sum = 10000/2 + 10000/2 + 10000 = 20000; result = 20000*10000/10000 = 20000
      let vals: int[] = [10000, 10000, 10000];
      let r: int = integrate_trapezoid(vals, 3, 10000);
      scoreboard_set("#calc_trap_const", #stdlib2_result, r);
    }

    fn test_integrate_simpson() {
      // Simpson on linear [0, 5000, 10000], h=10000, n=3
      // sum = 0 + 10000 + 4*5000 = 30000; result = 30000*10000/30000 = 10000
      let vals: int[] = [0, 5000, 10000];
      let r: int = integrate_simpson(vals, 3, 10000);
      scoreboard_set("#calc_simp", #stdlib2_result, r);
    }

    fn test_running_mean_first() {
      // First sample: n=1 → returns new_val directly
      let r: int = running_mean(0, 20000, 1);
      scoreboard_set("#calc_mean1", #stdlib2_result, r);
    }

    fn test_running_mean_second() {
      // Second sample: prev_mean=20000, new_val=40000, n=2
      // = 20000 + (40000-20000)*10000/(2*10000) = 20000 + 10000 = 30000
      let r: int = running_mean(20000, 40000, 2);
      scoreboard_set("#calc_mean2", #stdlib2_result, r);
    }

    fn test_running_m2() {
      // Welford M2 update: prev_m2=0, prev_mean=20000, new_mean=30000, new_val=40000
      // = 0 + (40000-20000)*(40000-30000)/10000 = 20000*10000/10000 = 20000
      let r: int = running_m2(0, 20000, 30000, 40000);
      scoreboard_set("#calc_m2", #stdlib2_result, r);
    }

    fn test_variance_from_m2() {
      // variance_from_m2(20000, 2) = 20000 / (2-1) = 20000
      let r: int = variance_from_m2(20000, 2);
      scoreboard_set("#calc_var", #stdlib2_result, r);
    }
  `, 'stdlib_calculus_test', [MATH_SRC, CALCULUS_SRC])

  // ── matrix module fixtures ────────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_matrix_test

    fn test_scale_x() {
      // scale_x(30000, 20000) = 30000*20000/10000 = 60000 (3.0 × 2.0 = 6.0 ×10000)
      let r: int = scale_x(30000, 20000);
      scoreboard_set("#mat_scale_x", #stdlib2_result, r);
    }

    fn test_uniform_scale() {
      // uniform_scale(15000, 30000) = 15000*30000/10000 = 45000
      let r: int = uniform_scale(15000, 30000);
      scoreboard_set("#mat_unif_scale", #stdlib2_result, r);
    }

    fn test_billboard_y() {
      // billboard_y(900000) = (900000+1800000)%3600000 = 2700000
      let r: int = billboard_y(900000);
      scoreboard_set("#mat_billboard", #stdlib2_result, r);
    }

    fn test_billboard_y_wrap() {
      // billboard_y(3000000) = (3000000+1800000)%3600000 = 4800000%3600000 = 1200000
      let r: int = billboard_y(3000000);
      scoreboard_set("#mat_billboard_wrap", #stdlib2_result, r);
    }

    fn test_lerp_angle_half() {
      // lerp_angle(0, 10000, 5000) = 0 + 10000*5000/10000 = 5000
      let r: int = lerp_angle(0, 10000, 5000);
      scoreboard_set("#mat_lerp_half", #stdlib2_result, r);
    }

    fn test_lerp_angle_full() {
      // lerp_angle(0, 10000, 10000) = 0 + 10000*10000/10000 = 10000
      let r: int = lerp_angle(0, 10000, 10000);
      scoreboard_set("#mat_lerp_full", #stdlib2_result, r);
    }

    fn test_mat3_identity_elem() {
      // Identity matrix × Identity matrix: element [0][0] should be 10000 (= 1.0 ×10000)
      // I = [[10000,0,0],[0,10000,0],[0,0,10000]]
      let r: int = mat3_mul_elem(
        10000, 0, 0,
        0, 10000, 0,
        0, 0, 10000,
        10000, 0, 0,
        0, 10000, 0,
        0, 0, 10000,
        0, 0
      );
      scoreboard_set("#mat3_id_00", #stdlib2_result, r);
    }

    fn test_mat3_identity_off_diag() {
      // Identity × Identity: element [0][1] should be 0
      let r: int = mat3_mul_elem(
        10000, 0, 0,
        0, 10000, 0,
        0, 0, 10000,
        10000, 0, 0,
        0, 10000, 0,
        0, 0, 10000,
        0, 1
      );
      scoreboard_set("#mat3_id_01", #stdlib2_result, r);
    }

    fn test_mat3_mul_vec3() {
      // Scale matrix (2×,3×,4×) × vector (10000, 20000, 30000)
      // x component = 2.0*10000 = 20000
      let r: int = mat3_mul_vec3_elem(
        20000, 0, 0,
        0, 30000, 0,
        0, 0, 40000,
        10000, 20000, 30000,
        0
      );
      scoreboard_set("#mat3_vec_x", #stdlib2_result, r);
    }

    fn test_mat3_mul_vec3_y() {
      // y component = 3.0*20000 = 60000
      let r: int = mat3_mul_vec3_elem(
        20000, 0, 0,
        0, 30000, 0,
        0, 0, 40000,
        10000, 20000, 30000,
        1
      );
      scoreboard_set("#mat3_vec_y", #stdlib2_result, r);
    }

    fn test_rotate2d_identity() {
      // rotate2d_x(10000, 0, 0) — rotate by 0 degrees: cos0=1000, sin0=0
      // x' = x*cos/1000 - y*sin/1000 = 10000*1000/1000 - 0 = 10000
      let r: int = rotate2d_x(10000, 0, 0);
      scoreboard_set("#mat_rot2d_id", #stdlib2_result, r);
    }
  `, 'stdlib_matrix_test', [MATH_SRC, MATRIX_SRC])

  // ── signal module fixtures ────────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_signal_test

    fn test_bernoulli_certain() {
      // p_fx=10000 (100%) — r%10000 is always in [0,9999] < 10000 → always 1
      let r: int = bernoulli(42, 10000);
      scoreboard_set("#sig_bern_1", #stdlib2_result, r);
    }

    fn test_bernoulli_impossible() {
      // p_fx=0 (0%) — r%10000 >= 0 is never < 0 → always 0
      let r: int = bernoulli(42, 0);
      scoreboard_set("#sig_bern_0", #stdlib2_result, r);
    }

    fn test_weighted2_all_first() {
      // w0=100, w1=0, total=100 → r%100 always < 100 = w0 → always 0
      let r: int = weighted2(42, 100, 0);
      scoreboard_set("#sig_w2_first", #stdlib2_result, r);
    }

    fn test_weighted2_all_second() {
      // w0=0, w1=100, total=100 → r%100 is never < 0 = w0 → always 1
      let r: int = weighted2(42, 0, 100);
      scoreboard_set("#sig_w2_second", #stdlib2_result, r);
    }

    fn test_weighted3_all_first() {
      // w0=100, w1=0, w2=0, total=100 → v = r%100 < 100 = w0 → always 0
      let r: int = weighted3(42, 100, 0, 0);
      scoreboard_set("#sig_w3_first", #stdlib2_result, r);
    }

    fn test_weighted3_all_last() {
      // w0=0, w1=0, w2=100, total=100 → v never < 0 or < 0 → always 2
      let r: int = weighted3(42, 0, 0, 100);
      scoreboard_set("#sig_w3_last", #stdlib2_result, r);
    }

    fn test_uniform_frac_range() {
      // uniform_frac result must be in [0, 10000]
      let r: int = uniform_frac(99999);
      scoreboard_set("#sig_ufrac", #stdlib2_result, r);
    }

    fn test_uniform_int_range() {
      // uniform_int(seed, 5, 10): result must be in [5, 10]
      let r: int = uniform_int(12345, 5, 10);
      scoreboard_set("#sig_uint", #stdlib2_result, r);
    }

    fn test_normal_approx_range() {
      // normal_approx12 range ≈ [-60000, 60000]; just verify it runs and is bounded
      let r: int = normal_approx12(42);
      scoreboard_set("#sig_normal", #stdlib2_result, r);
    }

    fn test_sin45_known() {
      // _sin45(2) = 10000 (sin(90°))
      let r: int = _sin45(2);
      scoreboard_set("#sig_sin45_2", #stdlib2_result, r);
    }

    fn test_sin45_zero() {
      // _sin45(0) = 0 (sin(0°))
      let r: int = _sin45(0);
      scoreboard_set("#sig_sin45_0", #stdlib2_result, r);
    }

    fn test_cos45_identity() {
      // _cos45(0) = _sin45(2) = 10000 (cos(0°) = 1.0)
      let r: int = _cos45(0);
      scoreboard_set("#sig_cos45_0", #stdlib2_result, r);
    }

    fn test_dft_dc_bin() {
      // DFT bin k=0 (DC) of [10000, 10000, 10000, 10000] with n=4
      // real[0] = (s0+s1+s2+s3)/4 = 40000/4 = 10000
      let r: int = dft_real(10000, 10000, 10000, 10000, 0, 0, 0, 0, 4, 0);
      scoreboard_set("#sig_dft_dc", #stdlib2_result, r);
    }

    fn test_dft_imag_dc() {
      // imag[0] = -(s0*sin(0)+...) / n. sin(0)=0 for all j at k=0 → 0
      let r: int = dft_imag(10000, 10000, 10000, 10000, 0, 0, 0, 0, 4, 0);
      scoreboard_set("#sig_dft_imag_dc", #stdlib2_result, r);
    }
  `, 'stdlib_signal_test', [MATH_SRC, SIGNAL_SRC])

  await mc.reload()
  await mc.ticks(20)

  console.log('  stdlib-coverage-2 setup complete.')
}, 60_000)

// ---------------------------------------------------------------------------
// calculus.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: calculus.mcrs', () => {
  test('deriv_forward(20000, 10000, 10000) == 10000 (slope = 1.0 ×10000)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#calc_deriv_fwd" stdlib2_result -1')
    await mc.command('/function stdlib_calculus_test:test_deriv_forward')
    await mc.ticks(3)

    const result = await mc.scoreboard('#calc_deriv_fwd', 'stdlib2_result')
    expect(result).toBe(10000)
    console.log(`  deriv_forward = ${result} ✓`)
  }, 30_000)

  test('deriv_central(30000, 10000, 10000) == 10000 (slope = 1.0)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#calc_deriv_cen" stdlib2_result -1')
    await mc.command('/function stdlib_calculus_test:test_deriv_central')
    await mc.ticks(3)

    const result = await mc.scoreboard('#calc_deriv_cen', 'stdlib2_result')
    expect(result).toBe(10000)
    console.log(`  deriv_central = ${result} ✓`)
  }, 30_000)

  test('deriv_central on f=2x: (12000-8000)*10000/(2*1000) == 20000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#calc_deriv_linear" stdlib2_result -1')
    await mc.command('/function stdlib_calculus_test:test_deriv_central_linear')
    await mc.ticks(3)

    const result = await mc.scoreboard('#calc_deriv_linear', 'stdlib2_result')
    expect(result).toBe(20000)
    console.log(`  deriv_central(linear f=2x) = ${result} ✓`)
  }, 30_000)

  test('integrate_trapezoid([0,5000,10000], 3, 10000) == 10000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#calc_trap" stdlib2_result -1')
    await mc.command('/function stdlib_calculus_test:test_integrate_trapezoid')
    await mc.ticks(3)

    const result = await mc.scoreboard('#calc_trap', 'stdlib2_result')
    expect(result).toBe(10000)
    console.log(`  integrate_trapezoid(linear) = ${result} ✓`)
  }, 30_000)

  test('integrate_trapezoid([10000,10000,10000], 3, 10000) == 20000 (constant f=1)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#calc_trap_const" stdlib2_result -1')
    await mc.command('/function stdlib_calculus_test:test_integrate_trapezoid_constant')
    await mc.ticks(3)

    const result = await mc.scoreboard('#calc_trap_const', 'stdlib2_result')
    expect(result).toBe(20000)
    console.log(`  integrate_trapezoid(constant) = ${result} ✓`)
  }, 30_000)

  test('integrate_simpson([0,5000,10000], 3, 10000) == 10000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#calc_simp" stdlib2_result -1')
    await mc.command('/function stdlib_calculus_test:test_integrate_simpson')
    await mc.ticks(3)

    const result = await mc.scoreboard('#calc_simp', 'stdlib2_result')
    expect(result).toBe(10000)
    console.log(`  integrate_simpson(linear) = ${result} ✓`)
  }, 30_000)

  test('running_mean: first sample (n=1) returns new_val = 20000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#calc_mean1" stdlib2_result -1')
    await mc.command('/function stdlib_calculus_test:test_running_mean_first')
    await mc.ticks(3)

    const result = await mc.scoreboard('#calc_mean1', 'stdlib2_result')
    expect(result).toBe(20000)
    console.log(`  running_mean(first) = ${result} ✓`)
  }, 30_000)

  test('running_mean(20000, 40000, n=2) == 30000 (average of 2.0 and 4.0)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#calc_mean2" stdlib2_result -1')
    await mc.command('/function stdlib_calculus_test:test_running_mean_second')
    await mc.ticks(3)

    const result = await mc.scoreboard('#calc_mean2', 'stdlib2_result')
    expect(result).toBe(30000)
    console.log(`  running_mean(second) = ${result} ✓`)
  }, 30_000)

  test('running_m2(0, 20000, 30000, 40000) == 20000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#calc_m2" stdlib2_result -1')
    await mc.command('/function stdlib_calculus_test:test_running_m2')
    await mc.ticks(3)

    const result = await mc.scoreboard('#calc_m2', 'stdlib2_result')
    expect(result).toBe(20000)
    console.log(`  running_m2 = ${result} ✓`)
  }, 30_000)

  test('variance_from_m2(20000, 2) == 20000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#calc_var" stdlib2_result -1')
    await mc.command('/function stdlib_calculus_test:test_variance_from_m2')
    await mc.ticks(3)

    const result = await mc.scoreboard('#calc_var', 'stdlib2_result')
    expect(result).toBe(20000)
    console.log(`  variance_from_m2 = ${result} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// matrix.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: matrix.mcrs', () => {
  test('scale_x(30000, 20000) == 60000 (3.0 × 2.0 = 6.0 ×10000)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#mat_scale_x" stdlib2_result -1')
    await mc.command('/function stdlib_matrix_test:test_scale_x')
    await mc.ticks(3)

    const result = await mc.scoreboard('#mat_scale_x', 'stdlib2_result')
    expect(result).toBe(60000)
    console.log(`  scale_x(30000, 20000) = ${result} ✓`)
  }, 30_000)

  test('uniform_scale(15000, 30000) == 45000 (1.5 × 3.0)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#mat_unif_scale" stdlib2_result -1')
    await mc.command('/function stdlib_matrix_test:test_uniform_scale')
    await mc.ticks(3)

    const result = await mc.scoreboard('#mat_unif_scale', 'stdlib2_result')
    expect(result).toBe(45000)
    console.log(`  uniform_scale(15000, 30000) = ${result} ✓`)
  }, 30_000)

  test('billboard_y(900000) == 2700000 (90° → opposite face 270°)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#mat_billboard" stdlib2_result -1')
    await mc.command('/function stdlib_matrix_test:test_billboard_y')
    await mc.ticks(3)

    const result = await mc.scoreboard('#mat_billboard', 'stdlib2_result')
    expect(result).toBe(2700000)
    console.log(`  billboard_y(900000) = ${result} ✓`)
  }, 30_000)

  test('billboard_y(3000000) == 1200000 (wraps correctly)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#mat_billboard_wrap" stdlib2_result -1')
    await mc.command('/function stdlib_matrix_test:test_billboard_y_wrap')
    await mc.ticks(3)

    const result = await mc.scoreboard('#mat_billboard_wrap', 'stdlib2_result')
    expect(result).toBe(1200000)
    console.log(`  billboard_y(3000000) = ${result} ✓`)
  }, 30_000)

  test('lerp_angle(0, 10000, 5000) == 5000 (midpoint)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#mat_lerp_half" stdlib2_result -1')
    await mc.command('/function stdlib_matrix_test:test_lerp_angle_half')
    await mc.ticks(3)

    const result = await mc.scoreboard('#mat_lerp_half', 'stdlib2_result')
    expect(result).toBe(5000)
    console.log(`  lerp_angle(0,10000,5000) = ${result} ✓`)
  }, 30_000)

  test('lerp_angle(0, 10000, 10000) == 10000 (full)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#mat_lerp_full" stdlib2_result -1')
    await mc.command('/function stdlib_matrix_test:test_lerp_angle_full')
    await mc.ticks(3)

    const result = await mc.scoreboard('#mat_lerp_full', 'stdlib2_result')
    expect(result).toBe(10000)
    console.log(`  lerp_angle(0,10000,10000) = ${result} ✓`)
  }, 30_000)

  test('mat3_mul_elem: I × I element [0][0] == 10000 (= 1.0)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#mat3_id_00" stdlib2_result -1')
    await mc.command('/function stdlib_matrix_test:test_mat3_identity_elem')
    await mc.ticks(3)

    const result = await mc.scoreboard('#mat3_id_00', 'stdlib2_result')
    expect(result).toBe(10000)
    console.log(`  mat3_mul_elem I×I [0][0] = ${result} ✓`)
  }, 30_000)

  test('mat3_mul_elem: I × I element [0][1] == 0 (off-diagonal)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#mat3_id_01" stdlib2_result -1')
    await mc.command('/function stdlib_matrix_test:test_mat3_identity_off_diag')
    await mc.ticks(3)

    const result = await mc.scoreboard('#mat3_id_01', 'stdlib2_result')
    expect(result).toBe(0)
    console.log(`  mat3_mul_elem I×I [0][1] = ${result} ✓`)
  }, 30_000)

  test('mat3_mul_vec3_elem: scale(2,3,4) × (1,2,3) → x component == 20000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#mat3_vec_x" stdlib2_result -1')
    await mc.command('/function stdlib_matrix_test:test_mat3_mul_vec3')
    await mc.ticks(3)

    const result = await mc.scoreboard('#mat3_vec_x', 'stdlib2_result')
    expect(result).toBe(20000)
    console.log(`  mat3_mul_vec3 x = ${result} ✓`)
  }, 30_000)

  test('mat3_mul_vec3_elem: scale(2,3,4) × (1,2,3) → y component == 60000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#mat3_vec_y" stdlib2_result -1')
    await mc.command('/function stdlib_matrix_test:test_mat3_mul_vec3_y')
    await mc.ticks(3)

    const result = await mc.scoreboard('#mat3_vec_y', 'stdlib2_result')
    expect(result).toBe(60000)
    console.log(`  mat3_mul_vec3 y = ${result} ✓`)
  }, 30_000)

  test('rotate2d_x(10000, 0, angle=0) == 10000 (no rotation)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#mat_rot2d_id" stdlib2_result -1')
    await mc.command('/function stdlib_matrix_test:test_rotate2d_identity')
    await mc.ticks(3)

    const result = await mc.scoreboard('#mat_rot2d_id', 'stdlib2_result')
    // cos(0)=1000, sin(0)=0 in sin_fixed units; x' = 10000*1000/1000 - 0 = 10000
    expect(result).toBe(10000)
    console.log(`  rotate2d_x identity = ${result} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// signal.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: signal.mcrs', () => {
  test('bernoulli(seed, p=10000) == 1 (100% probability)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#sig_bern_1" stdlib2_result -1')
    await mc.command('/function stdlib_signal_test:test_bernoulli_certain')
    await mc.ticks(3)

    const result = await mc.scoreboard('#sig_bern_1', 'stdlib2_result')
    expect(result).toBe(1)
    console.log(`  bernoulli(p=100%) = ${result} ✓`)
  }, 30_000)

  test('bernoulli(seed, p=0) == 0 (0% probability)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#sig_bern_0" stdlib2_result -1')
    await mc.command('/function stdlib_signal_test:test_bernoulli_impossible')
    await mc.ticks(3)

    const result = await mc.scoreboard('#sig_bern_0', 'stdlib2_result')
    expect(result).toBe(0)
    console.log(`  bernoulli(p=0%) = ${result} ✓`)
  }, 30_000)

  test('weighted2(seed, 100, 0) == 0 (all weight on first)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#sig_w2_first" stdlib2_result -1')
    await mc.command('/function stdlib_signal_test:test_weighted2_all_first')
    await mc.ticks(3)

    const result = await mc.scoreboard('#sig_w2_first', 'stdlib2_result')
    expect(result).toBe(0)
    console.log(`  weighted2(100,0) = ${result} ✓`)
  }, 30_000)

  test('weighted2(seed, 0, 100) == 1 (all weight on second)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#sig_w2_second" stdlib2_result -1')
    await mc.command('/function stdlib_signal_test:test_weighted2_all_second')
    await mc.ticks(3)

    const result = await mc.scoreboard('#sig_w2_second', 'stdlib2_result')
    expect(result).toBe(1)
    console.log(`  weighted2(0,100) = ${result} ✓`)
  }, 30_000)

  test('weighted3(seed, 100, 0, 0) == 0 (all weight on first)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#sig_w3_first" stdlib2_result -1')
    await mc.command('/function stdlib_signal_test:test_weighted3_all_first')
    await mc.ticks(3)

    const result = await mc.scoreboard('#sig_w3_first', 'stdlib2_result')
    expect(result).toBe(0)
    console.log(`  weighted3(100,0,0) = ${result} ✓`)
  }, 30_000)

  test('weighted3(seed, 0, 0, 100) == 2 (all weight on last)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#sig_w3_last" stdlib2_result -1')
    await mc.command('/function stdlib_signal_test:test_weighted3_all_last')
    await mc.ticks(3)

    const result = await mc.scoreboard('#sig_w3_last', 'stdlib2_result')
    expect(result).toBe(2)
    console.log(`  weighted3(0,0,100) = ${result} ✓`)
  }, 30_000)

  test('uniform_frac(seed) ∈ [0, 10000]', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#sig_ufrac" stdlib2_result -1')
    await mc.command('/function stdlib_signal_test:test_uniform_frac_range')
    await mc.ticks(3)

    const result = await mc.scoreboard('#sig_ufrac', 'stdlib2_result')
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(10000)
    console.log(`  uniform_frac = ${result} ∈ [0, 10000] ✓`)
  }, 30_000)

  test('uniform_int(seed, 5, 10) ∈ [5, 10]', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#sig_uint" stdlib2_result -1')
    await mc.command('/function stdlib_signal_test:test_uniform_int_range')
    await mc.ticks(3)

    const result = await mc.scoreboard('#sig_uint', 'stdlib2_result')
    expect(result).toBeGreaterThanOrEqual(5)
    expect(result).toBeLessThanOrEqual(10)
    console.log(`  uniform_int(5,10) = ${result} ∈ [5, 10] ✓`)
  }, 30_000)

  test('normal_approx12 ∈ [-60000, 60000]', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#sig_normal" stdlib2_result 0')
    await mc.command('/function stdlib_signal_test:test_normal_approx_range')
    await mc.ticks(3)

    const result = await mc.scoreboard('#sig_normal', 'stdlib2_result')
    expect(result).toBeGreaterThanOrEqual(-60000)
    expect(result).toBeLessThanOrEqual(60000)
    console.log(`  normal_approx12(42) = ${result} ∈ [-60000, 60000] ✓`)
  }, 30_000)

  test('_sin45(2) == 10000 (sin(90°) = 1.0 ×10000)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#sig_sin45_2" stdlib2_result -1')
    await mc.command('/function stdlib_signal_test:test_sin45_known')
    await mc.ticks(3)

    const result = await mc.scoreboard('#sig_sin45_2', 'stdlib2_result')
    expect(result).toBe(10000)
    console.log(`  _sin45(2) = ${result} ✓`)
  }, 30_000)

  test('_sin45(0) == 0 (sin(0°) = 0)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#sig_sin45_0" stdlib2_result -1')
    await mc.command('/function stdlib_signal_test:test_sin45_zero')
    await mc.ticks(3)

    const result = await mc.scoreboard('#sig_sin45_0', 'stdlib2_result')
    expect(result).toBe(0)
    console.log(`  _sin45(0) = ${result} ✓`)
  }, 30_000)

  test('_cos45(0) == 10000 (cos(0°) = 1.0 ×10000)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#sig_cos45_0" stdlib2_result -1')
    await mc.command('/function stdlib_signal_test:test_cos45_identity')
    await mc.ticks(3)

    const result = await mc.scoreboard('#sig_cos45_0', 'stdlib2_result')
    expect(result).toBe(10000)
    console.log(`  _cos45(0) = ${result} ✓`)
  }, 30_000)

  test('dft_real DC bin of constant signal [1,1,1,1] × n=4 == 10000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#sig_dft_dc" stdlib2_result -1')
    await mc.command('/function stdlib_signal_test:test_dft_dc_bin')
    await mc.ticks(3)

    const result = await mc.scoreboard('#sig_dft_dc', 'stdlib2_result')
    expect(result).toBe(10000)
    console.log(`  dft_real DC bin = ${result} ✓`)
  }, 30_000)

  test('dft_imag DC bin of constant signal == 0 (no imaginary component)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#sig_dft_imag_dc" stdlib2_result -1')
    await mc.command('/function stdlib_signal_test:test_dft_imag_dc')
    await mc.ticks(3)

    const result = await mc.scoreboard('#sig_dft_imag_dc', 'stdlib2_result')
    expect(result).toBe(0)
    console.log(`  dft_imag DC bin = ${result} ✓`)
  }, 30_000)
})
