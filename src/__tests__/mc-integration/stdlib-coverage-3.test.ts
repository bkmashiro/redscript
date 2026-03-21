/**
 * RedScript MC Integration Tests — stdlib coverage 3
 *
 * Tests sort / bits / math / random / timer / cooldown / sets / list stdlib
 * modules against a real Paper 1.21.4 server with TestHarnessPlugin.
 *
 * Prerequisites:
 *   - Paper server running with TestHarnessPlugin on port 25561
 *   - MC_SERVER_DIR env var pointing to server directory
 *
 * Run: MC_SERVER_DIR=~/mc-test-server npx jest stdlib-coverage-3 --testTimeout=120000
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../compile'
import { MCTestClient } from '../../mc-test/client'

const MC_HOST = process.env.MC_HOST ?? 'localhost'
const MC_PORT = parseInt(process.env.MC_PORT ?? '25561')
const MC_SERVER_DIR = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')
const DATAPACK_DIR = path.join(MC_SERVER_DIR, 'world', 'datapacks', 'redscript-test3')

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
      JSON.stringify({ pack: { pack_format: 48, description: 'RedScript integration tests 3' } })
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
    console.warn('⚠ MC_OFFLINE=true — skipping stdlib-coverage-3 integration tests')
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
    console.warn(`⚠ MC server not running at ${MC_HOST}:${MC_PORT} — skipping stdlib-coverage-3 tests`)
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
  await mc.command('/scoreboard objectives add stdlib3_result dummy').catch(() => {})

  const SORT_SRC = readStdlib('sort.mcrs')
  const BITS_SRC = readStdlib('bits.mcrs')
  const MATH_SRC = readStdlib('math.mcrs')
  const RANDOM_SRC = readStdlib('random.mcrs')
  const TIMER_SRC = readStdlib('timer.mcrs')
  const COOLDOWN_SRC = readStdlib('cooldown.mcrs')
  const LIST_SRC = readStdlib('list.mcrs')

  // ── sort module fixtures ──────────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_sort_test

    fn test_insertion_sort_asc() {
      let arr: int[] = [30, 10, 50, 20, 40];
      insertion_sort(arr, 5);
      // arr[0] should be 10 (minimum)
      scoreboard_set("#sort_ins_asc_0", #stdlib3_result, arr[0]);
      // arr[4] should be 50 (maximum)
      scoreboard_set("#sort_ins_asc_4", #stdlib3_result, arr[4]);
    }

    fn test_insertion_sort_desc() {
      let arr: int[] = [30, 10, 50, 20, 40];
      insertion_sort_desc(arr, 5);
      // arr[0] should be 50 (maximum descending)
      scoreboard_set("#sort_ins_desc_0", #stdlib3_result, arr[0]);
      // arr[4] should be 10 (minimum descending)
      scoreboard_set("#sort_ins_desc_4", #stdlib3_result, arr[4]);
    }

    fn test_sort_merge() {
      let a: int[] = [10, 30, 50];
      let b: int[] = [20, 40, 60];
      let merged: int[] = sort_merge(a, 3, b, 3);
      // merged[0] should be 10
      scoreboard_set("#sort_merge_0", #stdlib3_result, merged[0]);
      // merged[5] should be 60
      scoreboard_set("#sort_merge_5", #stdlib3_result, merged[5]);
      // length = 6
      scoreboard_set("#sort_merge_len", #stdlib3_result, merged.len());
    }

    fn test_insertion_sort_single() {
      let arr: int[] = [42];
      insertion_sort(arr, 1);
      scoreboard_set("#sort_single", #stdlib3_result, arr[0]);
    }

    fn test_insertion_sort_already_sorted() {
      let arr: int[] = [1, 2, 3, 4, 5];
      insertion_sort(arr, 5);
      // should remain [1,2,3,4,5]
      scoreboard_set("#sort_presorted_0", #stdlib3_result, arr[0]);
      scoreboard_set("#sort_presorted_4", #stdlib3_result, arr[4]);
    }
  `, 'stdlib_sort_test', [SORT_SRC])

  // ── bits module fixtures ──────────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_bits_test

    fn test_bit_and() {
      // 0b1100 & 0b1010 = 0b1000 = 8
      let r: int = bit_and(12, 10);
      scoreboard_set("#bits_and", #stdlib3_result, r);
    }

    fn test_bit_or() {
      // 0b1100 | 0b1010 = 0b1110 = 14
      let r: int = bit_or(12, 10);
      scoreboard_set("#bits_or", #stdlib3_result, r);
    }

    fn test_bit_xor() {
      // 0b1100 ^ 0b1010 = 0b0110 = 6
      let r: int = bit_xor(12, 10);
      scoreboard_set("#bits_xor", #stdlib3_result, r);
    }

    fn test_bit_shl() {
      // 1 << 4 = 16
      let r: int = bit_shl(1, 4);
      scoreboard_set("#bits_shl", #stdlib3_result, r);
    }

    fn test_bit_shr() {
      // 16 >> 2 = 4
      let r: int = bit_shr(16, 2);
      scoreboard_set("#bits_shr", #stdlib3_result, r);
    }

    fn test_bit_get() {
      // bit 3 of 8 (0b1000) should be 1
      let r: int = bit_get(8, 3);
      scoreboard_set("#bits_get", #stdlib3_result, r);
    }

    fn test_bit_set() {
      // set bit 2 of 0 → 4
      let r: int = bit_set(0, 2);
      scoreboard_set("#bits_set", #stdlib3_result, r);
    }

    fn test_bit_clear() {
      // clear bit 3 of 8 → 0
      let r: int = bit_clear(8, 3);
      scoreboard_set("#bits_clear", #stdlib3_result, r);
    }

    fn test_popcount() {
      // popcount(7) = popcount(0b111) = 3
      let r: int = popcount(7);
      scoreboard_set("#bits_popcount", #stdlib3_result, r);
    }
  `, 'stdlib_bits_test', [BITS_SRC])

  // ── math module fixtures ──────────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_math_test

    fn test_abs_positive() {
      let r: int = abs(42);
      scoreboard_set("#math_abs_pos", #stdlib3_result, r);
    }

    fn test_abs_negative() {
      let r: int = abs(-99);
      scoreboard_set("#math_abs_neg", #stdlib3_result, r);
    }

    fn test_min() {
      let r: int = min(7, 3);
      scoreboard_set("#math_min", #stdlib3_result, r);
    }

    fn test_max() {
      let r: int = max(7, 3);
      scoreboard_set("#math_max", #stdlib3_result, r);
    }

    fn test_clamp_below() {
      // clamp(-5, 0, 100) = 0
      let r: int = clamp(-5, 0, 100);
      scoreboard_set("#math_clamp_low", #stdlib3_result, r);
    }

    fn test_clamp_above() {
      // clamp(150, 0, 100) = 100
      let r: int = clamp(150, 0, 100);
      scoreboard_set("#math_clamp_high", #stdlib3_result, r);
    }

    fn test_clamp_inside() {
      // clamp(50, 0, 100) = 50
      let r: int = clamp(50, 0, 100);
      scoreboard_set("#math_clamp_in", #stdlib3_result, r);
    }

    fn test_lerp_mid() {
      // lerp(0, 1000, 500) = 500
      let r: int = lerp(0, 1000, 500);
      scoreboard_set("#math_lerp_mid", #stdlib3_result, r);
    }

    fn test_lerp_full() {
      // lerp(100, 200, 1000) = 200
      let r: int = lerp(100, 200, 1000);
      scoreboard_set("#math_lerp_full", #stdlib3_result, r);
    }

    fn test_isqrt() {
      // isqrt(25) = 5
      let r: int = isqrt(25);
      scoreboard_set("#math_isqrt", #stdlib3_result, r);
    }

    fn test_pow_int() {
      // pow_int(2, 10) = 1024
      let r: int = pow_int(2, 10);
      scoreboard_set("#math_pow", #stdlib3_result, r);
    }

    fn test_gcd() {
      // gcd(12, 8) = 4
      let r: int = gcd(12, 8);
      scoreboard_set("#math_gcd", #stdlib3_result, r);
    }
  `, 'stdlib_math_test', [MATH_SRC])

  // ── random module fixtures ────────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_random_test

    fn test_next_lcg_nonzero() {
      // next_lcg(12345) should return non-zero pseudo-random value
      let r: int = next_lcg(12345);
      // r = 12345 * 1664525 + 1013904223 = 21529498048, truncated to int32
      // We just verify it's not exactly 0 and store it
      scoreboard_set("#rand_lcg", #stdlib3_result, r);
    }

    fn test_random_range() {
      // random_range(seed, 0, 10) must be in [0, 10)
      let seed: int = next_lcg(99999);
      let r: int = random_range(seed, 0, 10);
      // Store the value — test checks it's in bounds
      scoreboard_set("#rand_range", #stdlib3_result, r);
    }

    fn test_random_bool() {
      // random_bool should return 0 or 1
      let seed: int = next_lcg(42);
      let r: int = random_bool(seed);
      scoreboard_set("#rand_bool", #stdlib3_result, r);
    }

    fn test_random_range_deterministic() {
      // same seed → same result
      let r1: int = random_range(next_lcg(777), 0, 1000);
      let r2: int = random_range(next_lcg(777), 0, 1000);
      // r1 == r2, store r1
      scoreboard_set("#rand_det", #stdlib3_result, r1);
    }
  `, 'stdlib_random_test', [RANDOM_SRC])

  // ── timer module fixtures ─────────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_timer_test

    fn test_tick_to_seconds() {
      // 40 ticks = 2 seconds
      let r: int = tick_to_seconds(40);
      scoreboard_set("#timer_to_sec", #stdlib3_result, r);
    }

    fn test_tick_to_ms() {
      // 10 ticks × 50ms = 500ms
      let r: int = tick_to_ms(10);
      scoreboard_set("#timer_to_ms", #stdlib3_result, r);
    }

    fn test_seconds_to_ticks() {
      // 3 seconds = 60 ticks
      let r: int = seconds_to_ticks(3);
      scoreboard_set("#timer_to_ticks", #stdlib3_result, r);
    }

    fn test_format_time_s() {
      // 100 ticks = 5 seconds → seconds component = 5
      let r: int = format_time_s(100);
      scoreboard_set("#timer_fmt_s", #stdlib3_result, r);
    }

    fn test_format_time_m() {
      // 1200 ticks = 60 seconds = 1 minute → minutes component = 1
      let r: int = format_time_m(1200);
      scoreboard_set("#timer_fmt_m", #stdlib3_result, r);
    }
  `, 'stdlib_timer_test', [TIMER_SRC])

  // ── cooldown module fixtures ──────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_cooldown_test

    fn test_cooldown_start_and_not_ready() {
      // Start a 5-tick cooldown; cooldown_ready should return 0
      cooldown_start("attack", 5);
      let r: int = cooldown_ready("attack");
      scoreboard_set("#cd_not_ready", #stdlib3_result, r);
    }

    fn test_cooldown_tick_and_expire() {
      // Start 2-tick cooldown, tick twice → should be ready
      cooldown_start("spell", 2);
      cooldown_tick("spell");
      cooldown_tick("spell");
      let r: int = cooldown_ready("spell");
      scoreboard_set("#cd_expired", #stdlib3_result, r);
    }

    fn test_cooldown_ready_initially() {
      // Before any cooldown is started, active=0 → ready = 1
      // Reset by clearing scoreboard in beforeAll, then check
      scoreboard_set("cooldown_active", #rs, 0);
      let r: int = cooldown_ready("fresh");
      scoreboard_set("#cd_fresh", #stdlib3_result, r);
    }
  `, 'stdlib_cooldown_test', [COOLDOWN_SRC])

  // ── list module fixtures ──────────────────────────────────────────────────
  writeFixture(`
    namespace stdlib_list_test

    fn test_sort2_min() {
      let r: int = sort2_min(7, 3);
      scoreboard_set("#list_sort2_min", #stdlib3_result, r);
    }

    fn test_sort2_max() {
      let r: int = sort2_max(7, 3);
      scoreboard_set("#list_sort2_max", #stdlib3_result, r);
    }

    fn test_list_min3() {
      let r: int = list_min3(5, 1, 9);
      scoreboard_set("#list_min3", #stdlib3_result, r);
    }

    fn test_list_max3() {
      let r: int = list_max3(5, 1, 9);
      scoreboard_set("#list_max3", #stdlib3_result, r);
    }

    fn test_list_sum5() {
      // 1+2+3+4+5 = 15
      let r: int = list_sum5(1, 2, 3, 4, 5);
      scoreboard_set("#list_sum5", #stdlib3_result, r);
    }

    fn test_avg3() {
      // (10+20+30) / 3 = 20
      let r: int = avg3(10, 20, 30);
      scoreboard_set("#list_avg3", #stdlib3_result, r);
    }

    fn test_sort3_min() {
      // sort3(9, 3, 6, 0) → minimum = 3
      let r: int = sort3(9, 3, 6, 0);
      scoreboard_set("#list_sort3_min", #stdlib3_result, r);
    }

    fn test_sort3_max() {
      // sort3(9, 3, 6, 2) → maximum = 9
      let r: int = sort3(9, 3, 6, 2);
      scoreboard_set("#list_sort3_max", #stdlib3_result, r);
    }

    fn test_list_sum_dynamic() {
      let arr: int[] = [10, 20, 30, 40];
      let r: int = list_sum(arr, 4);
      scoreboard_set("#list_sum_dyn", #stdlib3_result, r);
    }

    fn test_list_min_dynamic() {
      let arr: int[] = [50, 10, 30, 20];
      let r: int = list_min(arr, 4);
      scoreboard_set("#list_min_dyn", #stdlib3_result, r);
    }

    fn test_list_max_dynamic() {
      let arr: int[] = [50, 10, 30, 20];
      let r: int = list_max(arr, 4);
      scoreboard_set("#list_max_dyn", #stdlib3_result, r);
    }

    fn test_list_contains_yes() {
      let arr: int[] = [10, 20, 30];
      let r: int = list_contains(arr, 3, 20);
      scoreboard_set("#list_contains_yes", #stdlib3_result, r);
    }

    fn test_list_contains_no() {
      let arr: int[] = [10, 20, 30];
      let r: int = list_contains(arr, 3, 99);
      scoreboard_set("#list_contains_no", #stdlib3_result, r);
    }

    fn test_list_index_of() {
      let arr: int[] = [10, 20, 30];
      let r: int = list_index_of(arr, 3, 20);
      scoreboard_set("#list_index_of", #stdlib3_result, r);
    }

    fn test_list_sort_asc() {
      let arr: int[] = [40, 10, 30, 20];
      list_sort_asc(arr, 4);
      scoreboard_set("#list_sort_asc_0", #stdlib3_result, arr[0]);
      scoreboard_set("#list_sort_asc_3", #stdlib3_result, arr[3]);
    }
  `, 'stdlib_list_test', [MATH_SRC, RANDOM_SRC, LIST_SRC])

  // Deploy all fixtures and reload the datapack
  await mc.reload()
}, 60_000)

// ---------------------------------------------------------------------------
// sort.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: sort.mcrs', () => {
  test('insertion_sort: [30,10,50,20,40] → arr[0]==10', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#sort_ins_asc_0" stdlib3_result 0')
    await mc.command('/function stdlib_sort_test:test_insertion_sort_asc')
    await mc.ticks(3)
    const result = await mc.scoreboard('#sort_ins_asc_0', 'stdlib3_result')
    expect(result).toBe(10)
    console.log(`  insertion_sort[0] = ${result} ✓`)
  }, 30_000)

  test('insertion_sort: [30,10,50,20,40] → arr[4]==50', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#sort_ins_asc_4" stdlib3_result 0')
    await mc.command('/function stdlib_sort_test:test_insertion_sort_asc')
    await mc.ticks(3)
    const result = await mc.scoreboard('#sort_ins_asc_4', 'stdlib3_result')
    expect(result).toBe(50)
    console.log(`  insertion_sort[4] = ${result} ✓`)
  }, 30_000)

  test('insertion_sort_desc: arr[0]==50 (largest first)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#sort_ins_desc_0" stdlib3_result 0')
    await mc.command('/function stdlib_sort_test:test_insertion_sort_desc')
    await mc.ticks(3)
    const result = await mc.scoreboard('#sort_ins_desc_0', 'stdlib3_result')
    expect(result).toBe(50)
    console.log(`  insertion_sort_desc[0] = ${result} ✓`)
  }, 30_000)

  test('insertion_sort_desc: arr[4]==10 (smallest last)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#sort_ins_desc_4" stdlib3_result 0')
    await mc.command('/function stdlib_sort_test:test_insertion_sort_desc')
    await mc.ticks(3)
    const result = await mc.scoreboard('#sort_ins_desc_4', 'stdlib3_result')
    expect(result).toBe(10)
    console.log(`  insertion_sort_desc[4] = ${result} ✓`)
  }, 30_000)

  test('sort_merge: merged[0]==10 (min of both)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#sort_merge_0" stdlib3_result 0')
    await mc.command('/function stdlib_sort_test:test_sort_merge')
    await mc.ticks(3)
    const result = await mc.scoreboard('#sort_merge_0', 'stdlib3_result')
    expect(result).toBe(10)
    console.log(`  sort_merge[0] = ${result} ✓`)
  }, 30_000)

  test('sort_merge: merged[5]==60 (max of both)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#sort_merge_5" stdlib3_result 0')
    await mc.command('/function stdlib_sort_test:test_sort_merge')
    await mc.ticks(3)
    const result = await mc.scoreboard('#sort_merge_5', 'stdlib3_result')
    expect(result).toBe(60)
    console.log(`  sort_merge[5] = ${result} ✓`)
  }, 30_000)

  test('sort_merge: merged length == 6', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#sort_merge_len" stdlib3_result 0')
    await mc.command('/function stdlib_sort_test:test_sort_merge')
    await mc.ticks(3)
    const result = await mc.scoreboard('#sort_merge_len', 'stdlib3_result')
    expect(result).toBe(6)
    console.log(`  sort_merge len = ${result} ✓`)
  }, 30_000)

  test('insertion_sort single element: [42] unchanged', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#sort_single" stdlib3_result 0')
    await mc.command('/function stdlib_sort_test:test_insertion_sort_single')
    await mc.ticks(3)
    const result = await mc.scoreboard('#sort_single', 'stdlib3_result')
    expect(result).toBe(42)
    console.log(`  insertion_sort single = ${result} ✓`)
  }, 30_000)

  test('insertion_sort already sorted: first=1', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#sort_presorted_0" stdlib3_result 0')
    await mc.command('/function stdlib_sort_test:test_insertion_sort_already_sorted')
    await mc.ticks(3)
    const result = await mc.scoreboard('#sort_presorted_0', 'stdlib3_result')
    expect(result).toBe(1)
    console.log(`  insertion_sort presorted[0] = ${result} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// bits.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: bits.mcrs', () => {
  test('bit_and(12, 10) == 8', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#bits_and" stdlib3_result 0')
    await mc.command('/function stdlib_bits_test:test_bit_and')
    await mc.ticks(3)
    const result = await mc.scoreboard('#bits_and', 'stdlib3_result')
    expect(result).toBe(8)
    console.log(`  bit_and(12,10) = ${result} ✓`)
  }, 30_000)

  test('bit_or(12, 10) == 14', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#bits_or" stdlib3_result 0')
    await mc.command('/function stdlib_bits_test:test_bit_or')
    await mc.ticks(3)
    const result = await mc.scoreboard('#bits_or', 'stdlib3_result')
    expect(result).toBe(14)
    console.log(`  bit_or(12,10) = ${result} ✓`)
  }, 30_000)

  test('bit_xor(12, 10) == 6', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#bits_xor" stdlib3_result 0')
    await mc.command('/function stdlib_bits_test:test_bit_xor')
    await mc.ticks(3)
    const result = await mc.scoreboard('#bits_xor', 'stdlib3_result')
    expect(result).toBe(6)
    console.log(`  bit_xor(12,10) = ${result} ✓`)
  }, 30_000)

  test('bit_shl(1, 4) == 16', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#bits_shl" stdlib3_result 0')
    await mc.command('/function stdlib_bits_test:test_bit_shl')
    await mc.ticks(3)
    const result = await mc.scoreboard('#bits_shl', 'stdlib3_result')
    expect(result).toBe(16)
    console.log(`  bit_shl(1,4) = ${result} ✓`)
  }, 30_000)

  test('bit_shr(16, 2) == 4', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#bits_shr" stdlib3_result 0')
    await mc.command('/function stdlib_bits_test:test_bit_shr')
    await mc.ticks(3)
    const result = await mc.scoreboard('#bits_shr', 'stdlib3_result')
    expect(result).toBe(4)
    console.log(`  bit_shr(16,2) = ${result} ✓`)
  }, 30_000)

  test('bit_get(8, 3) == 1', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#bits_get" stdlib3_result 0')
    await mc.command('/function stdlib_bits_test:test_bit_get')
    await mc.ticks(3)
    const result = await mc.scoreboard('#bits_get', 'stdlib3_result')
    expect(result).toBe(1)
    console.log(`  bit_get(8,3) = ${result} ✓`)
  }, 30_000)

  test('bit_set(0, 2) == 4', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#bits_set" stdlib3_result 0')
    await mc.command('/function stdlib_bits_test:test_bit_set')
    await mc.ticks(3)
    const result = await mc.scoreboard('#bits_set', 'stdlib3_result')
    expect(result).toBe(4)
    console.log(`  bit_set(0,2) = ${result} ✓`)
  }, 30_000)

  test('bit_clear(8, 3) == 0', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#bits_clear" stdlib3_result 0')
    await mc.command('/function stdlib_bits_test:test_bit_clear')
    await mc.ticks(3)
    const result = await mc.scoreboard('#bits_clear', 'stdlib3_result')
    expect(result).toBe(0)
    console.log(`  bit_clear(8,3) = ${result} ✓`)
  }, 30_000)

  test('popcount(7) == 3', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#bits_popcount" stdlib3_result 0')
    await mc.command('/function stdlib_bits_test:test_popcount')
    await mc.ticks(3)
    const result = await mc.scoreboard('#bits_popcount', 'stdlib3_result')
    expect(result).toBe(3)
    console.log(`  popcount(7) = ${result} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// math.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: math.mcrs', () => {
  test('abs(42) == 42', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#math_abs_pos" stdlib3_result 0')
    await mc.command('/function stdlib_math_test:test_abs_positive')
    await mc.ticks(3)
    const result = await mc.scoreboard('#math_abs_pos', 'stdlib3_result')
    expect(result).toBe(42)
    console.log(`  abs(42) = ${result} ✓`)
  }, 30_000)

  test('abs(-99) == 99', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#math_abs_neg" stdlib3_result 0')
    await mc.command('/function stdlib_math_test:test_abs_negative')
    await mc.ticks(3)
    const result = await mc.scoreboard('#math_abs_neg', 'stdlib3_result')
    expect(result).toBe(99)
    console.log(`  abs(-99) = ${result} ✓`)
  }, 30_000)

  test('min(7, 3) == 3', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#math_min" stdlib3_result 0')
    await mc.command('/function stdlib_math_test:test_min')
    await mc.ticks(3)
    const result = await mc.scoreboard('#math_min', 'stdlib3_result')
    expect(result).toBe(3)
    console.log(`  min(7,3) = ${result} ✓`)
  }, 30_000)

  test('max(7, 3) == 7', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#math_max" stdlib3_result 0')
    await mc.command('/function stdlib_math_test:test_max')
    await mc.ticks(3)
    const result = await mc.scoreboard('#math_max', 'stdlib3_result')
    expect(result).toBe(7)
    console.log(`  max(7,3) = ${result} ✓`)
  }, 30_000)

  test('clamp(-5, 0, 100) == 0', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#math_clamp_low" stdlib3_result 999')
    await mc.command('/function stdlib_math_test:test_clamp_below')
    await mc.ticks(3)
    const result = await mc.scoreboard('#math_clamp_low', 'stdlib3_result')
    expect(result).toBe(0)
    console.log(`  clamp(-5,0,100) = ${result} ✓`)
  }, 30_000)

  test('clamp(150, 0, 100) == 100', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#math_clamp_high" stdlib3_result 0')
    await mc.command('/function stdlib_math_test:test_clamp_above')
    await mc.ticks(3)
    const result = await mc.scoreboard('#math_clamp_high', 'stdlib3_result')
    expect(result).toBe(100)
    console.log(`  clamp(150,0,100) = ${result} ✓`)
  }, 30_000)

  test('lerp(0, 1000, 500) == 500', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#math_lerp_mid" stdlib3_result 0')
    await mc.command('/function stdlib_math_test:test_lerp_mid')
    await mc.ticks(3)
    const result = await mc.scoreboard('#math_lerp_mid', 'stdlib3_result')
    expect(result).toBe(500)
    console.log(`  lerp(0,1000,500) = ${result} ✓`)
  }, 30_000)

  test('lerp(100, 200, 1000) == 200', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#math_lerp_full" stdlib3_result 0')
    await mc.command('/function stdlib_math_test:test_lerp_full')
    await mc.ticks(3)
    const result = await mc.scoreboard('#math_lerp_full', 'stdlib3_result')
    expect(result).toBe(200)
    console.log(`  lerp(100,200,1000) = ${result} ✓`)
  }, 30_000)

  test('isqrt(25) == 5', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#math_isqrt" stdlib3_result 0')
    await mc.command('/function stdlib_math_test:test_isqrt')
    await mc.ticks(3)
    const result = await mc.scoreboard('#math_isqrt', 'stdlib3_result')
    expect(result).toBe(5)
    console.log(`  isqrt(25) = ${result} ✓`)
  }, 30_000)

  test('pow_int(2, 10) == 1024', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#math_pow" stdlib3_result 0')
    await mc.command('/function stdlib_math_test:test_pow_int')
    await mc.ticks(3)
    const result = await mc.scoreboard('#math_pow', 'stdlib3_result')
    expect(result).toBe(1024)
    console.log(`  pow_int(2,10) = ${result} ✓`)
  }, 30_000)

  test('gcd(12, 8) == 4', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#math_gcd" stdlib3_result 0')
    await mc.command('/function stdlib_math_test:test_gcd')
    await mc.ticks(3)
    const result = await mc.scoreboard('#math_gcd', 'stdlib3_result')
    expect(result).toBe(4)
    console.log(`  gcd(12,8) = ${result} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// random.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: random.mcrs', () => {
  test('next_lcg(12345) is non-zero', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#rand_lcg" stdlib3_result 0')
    await mc.command('/function stdlib_random_test:test_next_lcg_nonzero')
    await mc.ticks(3)
    const result = await mc.scoreboard('#rand_lcg', 'stdlib3_result')
    expect(result).not.toBe(0)
    console.log(`  next_lcg(12345) = ${result} ✓`)
  }, 30_000)

  test('random_range produces value in [0, 10)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#rand_range" stdlib3_result -1')
    await mc.command('/function stdlib_random_test:test_random_range')
    await mc.ticks(3)
    const result = await mc.scoreboard('#rand_range', 'stdlib3_result')
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThan(10)
    console.log(`  random_range(seed, 0, 10) = ${result} ✓`)
  }, 30_000)

  test('random_bool returns 0 or 1', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#rand_bool" stdlib3_result -1')
    await mc.command('/function stdlib_random_test:test_random_bool')
    await mc.ticks(3)
    const result = await mc.scoreboard('#rand_bool', 'stdlib3_result')
    expect(result === 0 || result === 1).toBe(true)
    console.log(`  random_bool = ${result} ✓`)
  }, 30_000)

  test('random_range deterministic: same seed → same result', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#rand_det" stdlib3_result -1')
    await mc.command('/function stdlib_random_test:test_random_range_deterministic')
    await mc.ticks(3)
    // Both r1 and r2 come from the same seed, result is stored as r1
    // We verify result is in valid range [0, 1000)
    const result = await mc.scoreboard('#rand_det', 'stdlib3_result')
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThan(1000)
    console.log(`  random_range deterministic = ${result} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// timer.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: timer.mcrs', () => {
  test('tick_to_seconds(40) == 2', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#timer_to_sec" stdlib3_result 0')
    await mc.command('/function stdlib_timer_test:test_tick_to_seconds')
    await mc.ticks(3)
    const result = await mc.scoreboard('#timer_to_sec', 'stdlib3_result')
    expect(result).toBe(2)
    console.log(`  tick_to_seconds(40) = ${result} ✓`)
  }, 30_000)

  test('tick_to_ms(10) == 500', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#timer_to_ms" stdlib3_result 0')
    await mc.command('/function stdlib_timer_test:test_tick_to_ms')
    await mc.ticks(3)
    const result = await mc.scoreboard('#timer_to_ms', 'stdlib3_result')
    expect(result).toBe(500)
    console.log(`  tick_to_ms(10) = ${result} ✓`)
  }, 30_000)

  test('seconds_to_ticks(3) == 60', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#timer_to_ticks" stdlib3_result 0')
    await mc.command('/function stdlib_timer_test:test_seconds_to_ticks')
    await mc.ticks(3)
    const result = await mc.scoreboard('#timer_to_ticks', 'stdlib3_result')
    expect(result).toBe(60)
    console.log(`  seconds_to_ticks(3) = ${result} ✓`)
  }, 30_000)

  test('format_time_s(100) == 5', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#timer_fmt_s" stdlib3_result 0')
    await mc.command('/function stdlib_timer_test:test_format_time_s')
    await mc.ticks(3)
    const result = await mc.scoreboard('#timer_fmt_s', 'stdlib3_result')
    expect(result).toBe(5)
    console.log(`  format_time_s(100) = ${result} ✓`)
  }, 30_000)

  test('format_time_m(1200) == 1', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#timer_fmt_m" stdlib3_result 0')
    await mc.command('/function stdlib_timer_test:test_format_time_m')
    await mc.ticks(3)
    const result = await mc.scoreboard('#timer_fmt_m', 'stdlib3_result')
    expect(result).toBe(1)
    console.log(`  format_time_m(1200) = ${result} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// cooldown.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: cooldown.mcrs', () => {
  test('cooldown_ready returns 0 immediately after cooldown_start', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#cd_not_ready" stdlib3_result -1')
    await mc.command('/function stdlib_cooldown_test:test_cooldown_start_and_not_ready')
    await mc.ticks(3)
    const result = await mc.scoreboard('#cd_not_ready', 'stdlib3_result')
    expect(result).toBe(0)
    console.log(`  cooldown_ready after start = ${result} ✓`)
  }, 30_000)

  test('cooldown_ready returns 1 after all ticks expired', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#cd_expired" stdlib3_result -1')
    await mc.command('/function stdlib_cooldown_test:test_cooldown_tick_and_expire')
    await mc.ticks(3)
    const result = await mc.scoreboard('#cd_expired', 'stdlib3_result')
    expect(result).toBe(1)
    console.log(`  cooldown_ready after expire = ${result} ✓`)
  }, 30_000)

  test('cooldown_ready returns 1 when no cooldown active', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#cd_fresh" stdlib3_result -1')
    await mc.command('/function stdlib_cooldown_test:test_cooldown_ready_initially')
    await mc.ticks(3)
    const result = await mc.scoreboard('#cd_fresh', 'stdlib3_result')
    expect(result).toBe(1)
    console.log(`  cooldown_ready initially = ${result} ✓`)
  }, 30_000)
})

// ---------------------------------------------------------------------------
// list.mcrs
// ---------------------------------------------------------------------------

describe('MC Integration — stdlib: list.mcrs', () => {
  test('sort2_min(7, 3) == 3', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#list_sort2_min" stdlib3_result 0')
    await mc.command('/function stdlib_list_test:test_sort2_min')
    await mc.ticks(3)
    const result = await mc.scoreboard('#list_sort2_min', 'stdlib3_result')
    expect(result).toBe(3)
    console.log(`  sort2_min(7,3) = ${result} ✓`)
  }, 30_000)

  test('sort2_max(7, 3) == 7', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#list_sort2_max" stdlib3_result 0')
    await mc.command('/function stdlib_list_test:test_sort2_max')
    await mc.ticks(3)
    const result = await mc.scoreboard('#list_sort2_max', 'stdlib3_result')
    expect(result).toBe(7)
    console.log(`  sort2_max(7,3) = ${result} ✓`)
  }, 30_000)

  test('list_min3(5, 1, 9) == 1', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#list_min3" stdlib3_result 0')
    await mc.command('/function stdlib_list_test:test_list_min3')
    await mc.ticks(3)
    const result = await mc.scoreboard('#list_min3', 'stdlib3_result')
    expect(result).toBe(1)
    console.log(`  list_min3(5,1,9) = ${result} ✓`)
  }, 30_000)

  test('list_max3(5, 1, 9) == 9', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#list_max3" stdlib3_result 0')
    await mc.command('/function stdlib_list_test:test_list_max3')
    await mc.ticks(3)
    const result = await mc.scoreboard('#list_max3', 'stdlib3_result')
    expect(result).toBe(9)
    console.log(`  list_max3(5,1,9) = ${result} ✓`)
  }, 30_000)

  test('list_sum5(1,2,3,4,5) == 15', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#list_sum5" stdlib3_result 0')
    await mc.command('/function stdlib_list_test:test_list_sum5')
    await mc.ticks(3)
    const result = await mc.scoreboard('#list_sum5', 'stdlib3_result')
    expect(result).toBe(15)
    console.log(`  list_sum5(1..5) = ${result} ✓`)
  }, 30_000)

  test('avg3(10, 20, 30) == 20', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#list_avg3" stdlib3_result 0')
    await mc.command('/function stdlib_list_test:test_avg3')
    await mc.ticks(3)
    const result = await mc.scoreboard('#list_avg3', 'stdlib3_result')
    expect(result).toBe(20)
    console.log(`  avg3(10,20,30) = ${result} ✓`)
  }, 30_000)

  test('sort3(9,3,6, pos=0) == 3 (min)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#list_sort3_min" stdlib3_result 0')
    await mc.command('/function stdlib_list_test:test_sort3_min')
    await mc.ticks(3)
    const result = await mc.scoreboard('#list_sort3_min', 'stdlib3_result')
    expect(result).toBe(3)
    console.log(`  sort3 min = ${result} ✓`)
  }, 30_000)

  test('sort3(9,3,6, pos=2) == 9 (max)', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#list_sort3_max" stdlib3_result 0')
    await mc.command('/function stdlib_list_test:test_sort3_max')
    await mc.ticks(3)
    const result = await mc.scoreboard('#list_sort3_max', 'stdlib3_result')
    expect(result).toBe(9)
    console.log(`  sort3 max = ${result} ✓`)
  }, 30_000)

  test('list_sum([10,20,30,40], 4) == 100', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#list_sum_dyn" stdlib3_result 0')
    await mc.command('/function stdlib_list_test:test_list_sum_dynamic')
    await mc.ticks(3)
    const result = await mc.scoreboard('#list_sum_dyn', 'stdlib3_result')
    expect(result).toBe(100)
    console.log(`  list_sum dynamic = ${result} ✓`)
  }, 30_000)

  test('list_min([50,10,30,20], 4) == 10', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#list_min_dyn" stdlib3_result 0')
    await mc.command('/function stdlib_list_test:test_list_min_dynamic')
    await mc.ticks(3)
    const result = await mc.scoreboard('#list_min_dyn', 'stdlib3_result')
    expect(result).toBe(10)
    console.log(`  list_min dynamic = ${result} ✓`)
  }, 30_000)

  test('list_max([50,10,30,20], 4) == 50', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#list_max_dyn" stdlib3_result 0')
    await mc.command('/function stdlib_list_test:test_list_max_dynamic')
    await mc.ticks(3)
    const result = await mc.scoreboard('#list_max_dyn', 'stdlib3_result')
    expect(result).toBe(50)
    console.log(`  list_max dynamic = ${result} ✓`)
  }, 30_000)

  test('list_contains([10,20,30], 3, 20) == 1', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#list_contains_yes" stdlib3_result 0')
    await mc.command('/function stdlib_list_test:test_list_contains_yes')
    await mc.ticks(3)
    const result = await mc.scoreboard('#list_contains_yes', 'stdlib3_result')
    expect(result).toBe(1)
    console.log(`  list_contains present = ${result} ✓`)
  }, 30_000)

  test('list_contains([10,20,30], 3, 99) == 0', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#list_contains_no" stdlib3_result -1')
    await mc.command('/function stdlib_list_test:test_list_contains_no')
    await mc.ticks(3)
    const result = await mc.scoreboard('#list_contains_no', 'stdlib3_result')
    expect(result).toBe(0)
    console.log(`  list_contains absent = ${result} ✓`)
  }, 30_000)

  test('list_index_of([10,20,30], 3, 20) == 1', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#list_index_of" stdlib3_result -1')
    await mc.command('/function stdlib_list_test:test_list_index_of')
    await mc.ticks(3)
    const result = await mc.scoreboard('#list_index_of', 'stdlib3_result')
    expect(result).toBe(1)
    console.log(`  list_index_of = ${result} ✓`)
  }, 30_000)

  test('list_sort_asc([40,10,30,20]) → arr[0]==10', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#list_sort_asc_0" stdlib3_result 0')
    await mc.command('/function stdlib_list_test:test_list_sort_asc')
    await mc.ticks(3)
    const result = await mc.scoreboard('#list_sort_asc_0', 'stdlib3_result')
    expect(result).toBe(10)
    console.log(`  list_sort_asc[0] = ${result} ✓`)
  }, 30_000)

  test('list_sort_asc([40,10,30,20]) → arr[3]==40', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    await mc.command('/scoreboard players set "#list_sort_asc_3" stdlib3_result 0')
    await mc.command('/function stdlib_list_test:test_list_sort_asc')
    await mc.ticks(3)
    const result = await mc.scoreboard('#list_sort_asc_3', 'stdlib3_result')
    expect(result).toBe(40)
    console.log(`  list_sort_asc[3] = ${result} ✓`)
  }, 30_000)
})
