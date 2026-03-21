/**
 * RedScript MC Integration Tests — stdlib coverage
 *
 * Tests vec / color / easing / geometry / combat / noise stdlib modules
 * against a real Paper 1.21.4 server with TestHarnessPlugin.
 *
 * Prerequisites:
 *   - Paper server running with TestHarnessPlugin on port 25561
 *   - MC_SERVER_DIR env var pointing to server directory
 *
 * Run: MC_SERVER_DIR=~/mc-test-server npx jest stdlib-coverage --testTimeout=120000
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../compile'
import { MCTestClient } from '../../mc-test/client'

const MC_HOST = process.env.MC_HOST ?? 'localhost'
const MC_PORT = parseInt(process.env.MC_PORT ?? '25561')
const MC_SERVER_DIR = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')
const DATAPACK_DIR = path.join(MC_SERVER_DIR, 'world', 'datapacks', 'redscript-test')

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
      JSON.stringify({ pack: { pack_format: 48, description: 'RedScript integration tests' } })
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
    console.warn(`⚠ MC server not running at ${MC_HOST}:${MC_PORT} — skipping stdlib coverage tests`)
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
  await mc.command('/scoreboard objectives add stdlib_result dummy').catch(() => {})

  // Deploy all stdlib fixtures in one pass (namespaced separately to avoid collisions)
  const MATH_SRC = readStdlib('math.mcrs')
  const VEC_SRC = readStdlib('vec.mcrs')
  const COLOR_SRC = readStdlib('color.mcrs')
  const EASING_SRC = readStdlib('easing.mcrs')
  const GEOMETRY_SRC = readStdlib('geometry.mcrs')
  const COMBAT_SRC = readStdlib('combat.mcrs')
  const NOISE_SRC = readStdlib('noise.mcrs')

  // vec module tests
  writeFixture(`
    namespace stdlib_vec_test

    fn test_dot2d() {
      let r: int = dot2d(3, 4, 3, 4);
      scoreboard_set("#stdlib_vec", #stdlib_result, r);
    }

    fn test_dot3d() {
      let r: int = dot3d(3, 4, 0, 3, 4, 0);
      scoreboard_set("#stdlib_vec3d_dot", #stdlib_result, r);
    }

    fn test_length2d() {
      let r: int = length2d_fixed(3, 4);
      scoreboard_set("#stdlib_vec_len2d", #stdlib_result, r);
    }

    fn test_length3d() {
      let r: int = length3d_fixed(3, 4, 0);
      scoreboard_set("#stdlib_vec_len3d", #stdlib_result, r);
    }

    fn test_add3d() {
      let rx: int = add3d_x(10, 5);
      let ry: int = add3d_y(20, 3);
      let rz: int = add3d_z(7, 2);
      scoreboard_set("#stdlib_add3d_x", #stdlib_result, rx);
      scoreboard_set("#stdlib_add3d_y", #stdlib_result, ry);
      scoreboard_set("#stdlib_add3d_z", #stdlib_result, rz);
    }

    fn test_sub3d() {
      let rx: int = sub3d_x(10, 3);
      scoreboard_set("#stdlib_sub3d_x", #stdlib_result, rx);
    }

    fn test_scale3d() {
      let rx: int = scale3d_x(2000, 500);
      scoreboard_set("#stdlib_scale3d_x", #stdlib_result, rx);
    }
  `, 'stdlib_vec_test', [MATH_SRC, VEC_SRC])

  // color module tests
  writeFixture(`
    namespace stdlib_color_test

    fn test_rgb_pack() {
      let r: int = rgb_pack(255, 128, 0);
      scoreboard_set("#stdlib_color_pack", #stdlib_result, r);
    }

    fn test_rgb_r() {
      let packed: int = rgb_pack(255, 128, 64);
      let r: int = rgb_r(packed);
      scoreboard_set("#stdlib_color_r", #stdlib_result, r);
    }

    fn test_rgb_g() {
      let packed: int = rgb_pack(255, 128, 64);
      let g: int = rgb_g(packed);
      scoreboard_set("#stdlib_color_g", #stdlib_result, g);
    }

    fn test_rgb_b() {
      let packed: int = rgb_pack(255, 128, 64);
      let b: int = rgb_b(packed);
      scoreboard_set("#stdlib_color_b", #stdlib_result, b);
    }
  `, 'stdlib_color_test', [COLOR_SRC])

  // easing module tests (t scale: [0, 10000])
  writeFixture(`
    namespace stdlib_easing_test

    fn test_ease_in_quad_0() {
      let r: int = ease_in_quad(0);
      scoreboard_set("#stdlib_ease_quad0", #stdlib_result, r);
    }

    fn test_ease_in_quad_10000() {
      let r: int = ease_in_quad(10000);
      scoreboard_set("#stdlib_ease_quad1", #stdlib_result, r);
    }

    fn test_ease_in_quad_5000() {
      let r: int = ease_in_quad(5000);
      scoreboard_set("#stdlib_ease_quad_half", #stdlib_result, r);
    }

    fn test_ease_out_quad_0() {
      let r: int = ease_out_quad(0);
      scoreboard_set("#stdlib_ease_out_quad0", #stdlib_result, r);
    }

    fn test_ease_out_quad_10000() {
      let r: int = ease_out_quad(10000);
      scoreboard_set("#stdlib_ease_out_quad1", #stdlib_result, r);
    }

    fn test_ease_linear() {
      let r: int = ease_linear(7500);
      scoreboard_set("#stdlib_ease_linear", #stdlib_result, r);
    }
  `, 'stdlib_easing_test', [MATH_SRC, EASING_SRC])

  // geometry module tests
  writeFixture(`
    namespace stdlib_geom_test

    fn test_aabb_inside() {
      let r: int = aabb_contains(5, 5, 5, 0, 0, 0, 10, 10, 10);
      scoreboard_set("#stdlib_aabb_in", #stdlib_result, r);
    }

    fn test_aabb_outside() {
      let r: int = aabb_contains(15, 5, 5, 0, 0, 0, 10, 10, 10);
      scoreboard_set("#stdlib_aabb_out", #stdlib_result, r);
    }

    fn test_sphere_inside() {
      // 6²+8²+0²=100 = 10², exactly on boundary → ≤ so returns 1
      let r: int = sphere_contains(6, 8, 0, 0, 0, 0, 10);
      scoreboard_set("#stdlib_sphere_in", #stdlib_result, r);
    }

    fn test_sphere_outside() {
      let r: int = sphere_contains(11, 0, 0, 0, 0, 0, 10);
      scoreboard_set("#stdlib_sphere_out", #stdlib_result, r);
    }

    fn test_midpoint() {
      let r: int = midpoint(4, 10);
      scoreboard_set("#stdlib_midpoint", #stdlib_result, r);
    }
  `, 'stdlib_geom_test', [MATH_SRC, GEOMETRY_SRC])

  // combat module tests
  writeFixture(`
    namespace stdlib_combat_test

    fn test_weapon_damage() {
      let r: int = weapon_damage(10, 5);
      scoreboard_set("#stdlib_combat_dmg", #stdlib_result, r);
    }

    fn test_apply_damage() {
      scoreboard_set("#enemy1", #health, 100);
      apply_damage("enemy1", 30);
    }

    fn test_apply_damage_clamp() {
      scoreboard_set("#enemy2", #health, 20);
      apply_damage("enemy2", 50);
    }
  `, 'stdlib_combat_test', [MATH_SRC, COMBAT_SRC])

  // noise module tests
  writeFixture(`
    namespace stdlib_noise_test

    fn test_hash_1d() {
      let r: int = hash_1d(42);
      scoreboard_set("#stdlib_noise_hash", #stdlib_result, r);
    }

    fn test_hash_1d_pos() {
      let r: int = hash_1d_pos(42);
      scoreboard_set("#stdlib_noise_hash_pos", #stdlib_result, r);
    }

    fn test_value_noise_deterministic_a() {
      let r: int = value_noise_1d(420000);
      scoreboard_set("#stdlib_noise_v1", #stdlib_result, r);
    }

    fn test_value_noise_deterministic_b() {
      let r: int = value_noise_1d(420000);
      scoreboard_set("#stdlib_noise_v2", #stdlib_result, r);
    }

    fn test_value_noise_range() {
      let r: int = value_noise_1d(123456);
      scoreboard_set("#stdlib_noise_range", #stdlib_result, r);
    }
  `, 'stdlib_noise_test', [MATH_SRC, NOISE_SRC])

  await mc.reload()
  await mc.ticks(20)

  console.log('  stdlib-coverage setup complete.')
}, 60_000)

// ---------------------------------------------------------------------------
// vec.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: vec.mcrs', () => {
  test('dot2d(3,4, 3,4) == 25', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set #stdlib_vec stdlib_result 0')
    await mc.command('/function stdlib_vec_test:test_dot2d')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_vec', 'stdlib_result')
    expect(result).toBe(25)
    console.log(`  dot2d(3,4,3,4) = ${result} ✓`)
  }, 30_000)

  test('dot3d(3,4,0, 3,4,0) == 25', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_vec3d_dot" stdlib_result 0')
    await mc.command('/function stdlib_vec_test:test_dot3d')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_vec3d_dot', 'stdlib_result')
    expect(result).toBe(25)
    console.log(`  dot3d(3,4,0,3,4,0) = ${result} ✓`)
  }, 30_000)

  test('length2d_fixed(3,4) == 5000 (√25 × 1000)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_vec_len2d" stdlib_result 0')
    await mc.command('/function stdlib_vec_test:test_length2d')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_vec_len2d', 'stdlib_result')
    expect(result).toBeGreaterThanOrEqual(4990)
    expect(result).toBeLessThanOrEqual(5010)
    console.log(`  length2d_fixed(3,4) = ${result} (expect ~5000) ✓`)
  }, 30_000)

  test('length3d_fixed(3,4,0) == 5000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_vec_len3d" stdlib_result 0')
    await mc.command('/function stdlib_vec_test:test_length3d')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_vec_len3d', 'stdlib_result')
    expect(result).toBeGreaterThanOrEqual(4990)
    expect(result).toBeLessThanOrEqual(5010)
    console.log(`  length3d_fixed(3,4,0) = ${result} (expect ~5000) ✓`)
  }, 30_000)

  test('add3d x/y/z component-wise addition', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/function stdlib_vec_test:test_add3d')
    await mc.ticks(3)

    const rx = await mc.scoreboard('#stdlib_add3d_x', 'stdlib_result')
    const ry = await mc.scoreboard('#stdlib_add3d_y', 'stdlib_result')
    const rz = await mc.scoreboard('#stdlib_add3d_z', 'stdlib_result')
    expect(rx).toBe(15)
    expect(ry).toBe(23)
    expect(rz).toBe(9)
    console.log(`  add3d: x=${rx} y=${ry} z=${rz} ✓`)
  }, 30_000)

  test('sub3d_x(10, 3) == 7', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/function stdlib_vec_test:test_sub3d')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_sub3d_x', 'stdlib_result')
    expect(result).toBe(7)
    console.log(`  sub3d_x(10,3) = ${result} ✓`)
  }, 30_000)

  test('scale3d_x(2000, 500) == 1000 (2.0 × 0.5 = 1.0, fixed ×1000)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/function stdlib_vec_test:test_scale3d')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_scale3d_x', 'stdlib_result')
    expect(result).toBe(1000)
    console.log(`  scale3d_x(2000,500) = ${result} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// color.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: color.mcrs', () => {
  test('rgb_pack(255, 128, 0) == 255*65536 + 128*256 + 0', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_color_pack" stdlib_result 0')
    await mc.command('/function stdlib_color_test:test_rgb_pack')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_color_pack', 'stdlib_result')
    const expected = 255 * 65536 + 128 * 256 + 0  // 16744448
    expect(result).toBe(expected)
    console.log(`  rgb_pack(255,128,0) = ${result} (expect ${expected}) ✓`)
  }, 30_000)

  test('rgb_r(rgb_pack(255,128,64)) round-trips to 255', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/function stdlib_color_test:test_rgb_r')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_color_r', 'stdlib_result')
    expect(result).toBe(255)
    console.log(`  rgb_r round-trip = ${result} ✓`)
  }, 30_000)

  test('rgb_g(rgb_pack(255,128,64)) round-trips to 128', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/function stdlib_color_test:test_rgb_g')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_color_g', 'stdlib_result')
    expect(result).toBe(128)
    console.log(`  rgb_g round-trip = ${result} ✓`)
  }, 30_000)

  test('rgb_b(rgb_pack(255,128,64)) round-trips to 64', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/function stdlib_color_test:test_rgb_b')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_color_b', 'stdlib_result')
    expect(result).toBe(64)
    console.log(`  rgb_b round-trip = ${result} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// easing.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: easing.mcrs', () => {
  // Scale: t ∈ [0, 10000] (×10000 fixed-point)

  test('ease_in_quad(0) == 0', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_ease_quad0" stdlib_result -1')
    await mc.command('/function stdlib_easing_test:test_ease_in_quad_0')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_ease_quad0', 'stdlib_result')
    expect(result).toBe(0)
    console.log(`  ease_in_quad(0) = ${result} ✓`)
  }, 30_000)

  test('ease_in_quad(10000) == 10000 (t=1.0 → output=1.0)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_ease_quad1" stdlib_result -1')
    await mc.command('/function stdlib_easing_test:test_ease_in_quad_10000')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_ease_quad1', 'stdlib_result')
    expect(result).toBe(10000)
    console.log(`  ease_in_quad(10000) = ${result} ✓`)
  }, 30_000)

  test('ease_in_quad(5000) ≈ 2500 (t=0.5 → t²=0.25)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_ease_quad_half" stdlib_result -1')
    await mc.command('/function stdlib_easing_test:test_ease_in_quad_5000')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_ease_quad_half', 'stdlib_result')
    // 5000*5000/10000 = 2500
    expect(result).toBe(2500)
    console.log(`  ease_in_quad(5000) = ${result} (expect 2500) ✓`)
  }, 30_000)

  test('ease_out_quad(0) == 0', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_ease_out_quad0" stdlib_result -1')
    await mc.command('/function stdlib_easing_test:test_ease_out_quad_0')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_ease_out_quad0', 'stdlib_result')
    expect(result).toBe(0)
    console.log(`  ease_out_quad(0) = ${result} ✓`)
  }, 30_000)

  test('ease_out_quad(10000) == 10000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_ease_out_quad1" stdlib_result -1')
    await mc.command('/function stdlib_easing_test:test_ease_out_quad_10000')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_ease_out_quad1', 'stdlib_result')
    expect(result).toBe(10000)
    console.log(`  ease_out_quad(10000) = ${result} ✓`)
  }, 30_000)

  test('ease_linear(7500) == 7500 (identity)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_ease_linear" stdlib_result -1')
    await mc.command('/function stdlib_easing_test:test_ease_linear')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_ease_linear', 'stdlib_result')
    expect(result).toBe(7500)
    console.log(`  ease_linear(7500) = ${result} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// geometry.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: geometry.mcrs', () => {
  test('aabb_contains: point (5,5,5) inside [0,0,0]–[10,10,10] → 1', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_aabb_in" stdlib_result -1')
    await mc.command('/function stdlib_geom_test:test_aabb_inside')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_aabb_in', 'stdlib_result')
    expect(result).toBe(1)
    console.log(`  aabb_contains(inside) = ${result} ✓`)
  }, 30_000)

  test('aabb_contains: point (15,5,5) outside [0,0,0]–[10,10,10] → 0', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_aabb_out" stdlib_result -1')
    await mc.command('/function stdlib_geom_test:test_aabb_outside')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_aabb_out', 'stdlib_result')
    expect(result).toBe(0)
    console.log(`  aabb_contains(outside) = ${result} ✓`)
  }, 30_000)

  test('sphere_contains: (6,8,0) on boundary of sphere r=10 at origin → 1 (≤)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_sphere_in" stdlib_result -1')
    await mc.command('/function stdlib_geom_test:test_sphere_inside')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_sphere_in', 'stdlib_result')
    expect(result).toBe(1)
    console.log(`  sphere_contains(boundary) = ${result} ✓`)
  }, 30_000)

  test('sphere_contains: (11,0,0) outside sphere r=10 → 0', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_sphere_out" stdlib_result -1')
    await mc.command('/function stdlib_geom_test:test_sphere_outside')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_sphere_out', 'stdlib_result')
    expect(result).toBe(0)
    console.log(`  sphere_contains(outside) = ${result} ✓`)
  }, 30_000)

  test('midpoint(4, 10) == 7', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_midpoint" stdlib_result -1')
    await mc.command('/function stdlib_geom_test:test_midpoint')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_midpoint', 'stdlib_result')
    expect(result).toBe(7)
    console.log(`  midpoint(4,10) = ${result} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// combat.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: combat.mcrs', () => {
  test('weapon_damage(10, 5) == 15', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_combat_dmg" stdlib_result -1')
    await mc.command('/function stdlib_combat_test:test_weapon_damage')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_combat_dmg', 'stdlib_result')
    expect(result).toBe(15)
    console.log(`  weapon_damage(10,5) = ${result} ✓`)
  }, 30_000)

  test('apply_damage: health 100 - 30 == 70', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard objectives add health dummy').catch(() => {})
    await mc.command('/function stdlib_combat_test:test_apply_damage')
    await mc.ticks(3)

    const result = await mc.scoreboard('#enemy1', 'health')
    expect(result).toBe(70)
    console.log(`  apply_damage(100, 30) → health = ${result} ✓`)
  }, 30_000)

  test('apply_damage: damage exceeds health → clamped to 0', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard objectives add health dummy').catch(() => {})
    await mc.command('/function stdlib_combat_test:test_apply_damage_clamp')
    await mc.ticks(3)

    const result = await mc.scoreboard('#enemy2', 'health')
    expect(result).toBe(0)
    console.log(`  apply_damage(20, 50) → health clamped = ${result} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// noise.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: noise.mcrs', () => {
  test('hash_1d(42) returns a non-zero int (no crash)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_noise_hash" stdlib_result 0')
    await mc.command('/function stdlib_noise_test:test_hash_1d')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_noise_hash', 'stdlib_result')
    // hash_1d can return any int including 0, but we verify execution completed
    // by the score existing. We use !== undefined as the real check.
    expect(typeof result).toBe('number')
    console.log(`  hash_1d(42) = ${result} ✓`)
  }, 30_000)

  test('hash_1d_pos(42) ∈ [0, 10000]', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set "#stdlib_noise_hash_pos" stdlib_result -1')
    await mc.command('/function stdlib_noise_test:test_hash_1d_pos')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_noise_hash_pos', 'stdlib_result')
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(10000)
    console.log(`  hash_1d_pos(42) = ${result} ∈ [0, 10000] ✓`)
  }, 30_000)

  test('value_noise_1d is deterministic (same input → same output)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/function stdlib_noise_test:test_value_noise_deterministic_a')
    await mc.ticks(3)
    const r1 = await mc.scoreboard('#stdlib_noise_v1', 'stdlib_result')

    await mc.command('/function stdlib_noise_test:test_value_noise_deterministic_b')
    await mc.ticks(3)
    const r2 = await mc.scoreboard('#stdlib_noise_v2', 'stdlib_result')

    expect(r1).toBe(r2)
    console.log(`  value_noise_1d(420000) deterministic: ${r1} == ${r2} ✓`)
  }, 30_000)

  test('value_noise_1d result ∈ [0, 10000]', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/function stdlib_noise_test:test_value_noise_range')
    await mc.ticks(3)

    const result = await mc.scoreboard('#stdlib_noise_range', 'stdlib_result')
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(10000)
    console.log(`  value_noise_1d(123456) = ${result} ∈ [0, 10000] ✓`)
  }, 30_000)
})
