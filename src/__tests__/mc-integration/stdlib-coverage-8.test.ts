/**
 * RedScript MC Integration Tests — stdlib coverage 8
 *
 * Covers queue / cooldown / timer / bits stdlib modules against a real
 * Paper 1.21.4 server with TestHarnessPlugin.
 *
 * Run: MC_SERVER_DIR=~/mc-test-server npx jest stdlib-coverage-8 --testTimeout=120000
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

function writeFixture(source: string, namespace: string, librarySources: string[] = []): void {
  fs.mkdirSync(DATAPACK_DIR, { recursive: true })
  if (!fs.existsSync(path.join(DATAPACK_DIR, 'pack.mcmeta'))) {
    fs.writeFileSync(
      path.join(DATAPACK_DIR, 'pack.mcmeta'),
      JSON.stringify({ pack: { pack_format: 48, description: 'RedScript integration tests 8' } })
    )
  }

  const result = compile(source, { namespace, librarySources })

  for (const file of result.files) {
    if (file.path === 'pack.mcmeta') continue
    const filePath = path.join(DATAPACK_DIR, file.path)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })

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

async function runAndRead(fn: string, player: string): Promise<number> {
  await mc.command(`/function ${fn}`)
  await mc.ticks(3)
  return mc.scoreboard(player, 'sc8_result')
}

beforeAll(async () => {
  if (process.env.MC_OFFLINE === 'true') {
    console.warn('⚠ MC_OFFLINE=true — skipping stdlib coverage 8 integration tests')
    return
  }

  mc = new MCTestClient(MC_HOST, MC_PORT)

  try {
    const deadline = Date.now() + 10_000
    while (Date.now() < deadline) {
      if (await mc.isOnline()) {
        serverOnline = true
        break
      }
      await new Promise(r => setTimeout(r, 1000))
    }
  } catch {
    serverOnline = false
  }

  if (!serverOnline) {
    console.warn(`⚠ MC server not running at ${MC_HOST}:${MC_PORT} — skipping stdlib coverage 8 tests`)
    return
  }

  for (const tagFile of [
    'data/minecraft/tags/function/tick.json',
    'data/minecraft/tags/function/load.json',
    'data/minecraft/tags/functions/tick.json',
    'data/minecraft/tags/functions/load.json',
  ]) {
    const p = path.join(DATAPACK_DIR, tagFile)
    if (fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify({ values: [] }, null, 2))
  }

  await mc.command('/scoreboard objectives add sc8_result dummy').catch(() => {})
  await mc.command('/scoreboard objectives add rs dummy').catch(() => {})

  const QUEUE_SRC = readStdlib('queue.mcrs')
  const COOLDOWN_SRC = readStdlib('cooldown.mcrs')
  const TIMER_SRC = readStdlib('timer.mcrs')
  const BITS_SRC = readStdlib('bits.mcrs')

  writeFixture(`
    namespace stdlib_queue8_test

    fn test_queue_push_and_size() {
      queue_clear();
      queue_push(11);
      queue_push(22);
      let n: int = queue_size();
      scoreboard_set("#queue_size", #sc8_result, n);
    }

    fn test_queue_peek_front() {
      queue_clear();
      queue_push(7);
      queue_push(9);
      let v: int = queue_peek();
      scoreboard_set("#queue_peek", #sc8_result, v);
    }

    fn test_queue_pop_front() {
      queue_clear();
      queue_push(15);
      queue_push(30);
      let v: int = queue_pop();
      scoreboard_set("#queue_pop", #sc8_result, v);
    }

    fn test_queue_pop_advances_head() {
      queue_clear();
      queue_push(4);
      queue_push(8);
      queue_pop();
      let v: int = queue_peek();
      scoreboard_set("#queue_next", #sc8_result, v);
    }

    fn test_queue_clear_resets_size() {
      queue_clear();
      queue_push(1);
      queue_push(2);
      queue_clear();
      let n: int = queue_size();
      scoreboard_set("#queue_clear", #sc8_result, n);
    }
  `, 'stdlib_queue8_test', [QUEUE_SRC])

  writeFixture(`
    namespace stdlib_cooldown8_test

    fn test_cooldown_start_sets_ticks() {
      cooldown_start("dash", 6);
      let ticks: int = scoreboard_get("cooldown_ticks", #rs);
      scoreboard_set("#cooldown_ticks", #sc8_result, ticks);
    }

    fn test_cooldown_ready_after_start() {
      cooldown_start("dash", 5);
      let r: int = cooldown_ready("dash");
      scoreboard_set("#cooldown_ready_start", #sc8_result, r);
    }

    fn test_cooldown_tick_decrements() {
      cooldown_start("dash", 3);
      cooldown_tick("dash");
      let ticks: int = scoreboard_get("cooldown_ticks", #rs);
      scoreboard_set("#cooldown_after_tick", #sc8_result, ticks);
    }

    fn test_cooldown_expires_after_tick() {
      cooldown_start("dash", 1);
      cooldown_tick("dash");
      let r: int = cooldown_ready("dash");
      scoreboard_set("#cooldown_expired", #sc8_result, r);
    }

    fn test_cooldown_inactive_stays_ready() {
      scoreboard_set("cooldown_active", #rs, 0);
      scoreboard_set("cooldown_ticks", #rs, 0);
      cooldown_tick("dash");
      let r: int = cooldown_ready("dash");
      scoreboard_set("#cooldown_inactive", #sc8_result, r);
    }
  `, 'stdlib_cooldown8_test', [COOLDOWN_SRC])

  writeFixture(`
    namespace stdlib_timer8_test

    fn test_timer_elapsed_after_ticks() {
      let t: Timer = Timer::new(3);
      t.start();
      t.tick();
      t.tick();
      let elapsed: int = t.elapsed();
      scoreboard_set("#timer_elapsed", #sc8_result, elapsed);
    }

    fn test_timer_remaining_after_ticks() {
      let t: Timer = Timer::new(3);
      t.start();
      t.tick();
      t.tick();
      let left: int = t.remaining();
      scoreboard_set("#timer_remaining", #sc8_result, left);
    }

    fn test_timer_pause_stops_progress() {
      let t: Timer = Timer::new(4);
      t.start();
      t.tick();
      t.pause();
      t.tick();
      let elapsed: int = t.elapsed();
      scoreboard_set("#timer_pause", #sc8_result, elapsed);
    }

    fn test_timer_reset_clears_elapsed() {
      let t: Timer = Timer::new(4);
      t.start();
      t.tick();
      t.reset();
      let elapsed: int = t.elapsed();
      scoreboard_set("#timer_reset", #sc8_result, elapsed);
    }

    fn test_timer_done_after_full_duration() {
      let t: Timer = Timer::new(2);
      t.start();
      t.tick();
      t.tick();
      let done: int = 0;
      if (t.done()) {
        done = 1;
      }
      scoreboard_set("#timer_done", #sc8_result, done);
    }
  `, 'stdlib_timer8_test', [TIMER_SRC])

  writeFixture(`
    namespace stdlib_bits8_test

    fn test_bit_toggle() {
      let r: int = bit_toggle(5, 1);
      scoreboard_set("#bits_toggle", #sc8_result, r);
    }

    fn test_bit_not_zero() {
      let r: int = bit_not(0);
      scoreboard_set("#bits_not", #sc8_result, r);
    }

    fn test_popcount_255() {
      let r: int = popcount(255);
      scoreboard_set("#bits_popcount", #sc8_result, r);
    }

    fn test_bit_set_idempotent() {
      let r: int = bit_set(5, 0);
      scoreboard_set("#bits_set_idempotent", #sc8_result, r);
    }

    fn test_bit_clear_missing_bit() {
      let r: int = bit_clear(2, 0);
      scoreboard_set("#bits_clear_missing", #sc8_result, r);
    }
  `, 'stdlib_bits8_test', [BITS_SRC])

  await mc.reload()
}, 120_000)

describe('stdlib coverage 8 — queue', () => {
  test('queue_push grows queue size', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_queue8_test:test_queue_push_and_size', '#queue_size')
    expect(r).toBeGreaterThanOrEqual(2)
    expect(r).toBeLessThanOrEqual(2)
  }, 30_000)

  test('queue_peek returns current front', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_queue8_test:test_queue_peek_front', '#queue_peek')
    expect(r).toBeGreaterThanOrEqual(7)
    expect(r).toBeLessThanOrEqual(7)
  }, 30_000)

  test('queue_pop returns the first pushed value', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_queue8_test:test_queue_pop_front', '#queue_pop')
    expect(r).toBeGreaterThanOrEqual(15)
    expect(r).toBeLessThanOrEqual(15)
  }, 30_000)

  test('queue_pop advances head for the next peek', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_queue8_test:test_queue_pop_advances_head', '#queue_next')
    expect(r).toBeGreaterThanOrEqual(8)
    expect(r).toBeLessThanOrEqual(8)
  }, 30_000)

  test('queue_clear resets logical size to zero', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_queue8_test:test_queue_clear_resets_size', '#queue_clear')
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeLessThanOrEqual(0)
  }, 30_000)
})

describe('stdlib coverage 8 — cooldown', () => {
  test('cooldown_start writes tick count', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_cooldown8_test:test_cooldown_start_sets_ticks', '#cooldown_ticks')
    expect(r).toBeGreaterThanOrEqual(6)
    expect(r).toBeLessThanOrEqual(6)
  }, 30_000)

  test('cooldown_ready is false immediately after start', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_cooldown8_test:test_cooldown_ready_after_start', '#cooldown_ready_start')
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeLessThanOrEqual(0)
  }, 30_000)

  test('cooldown_tick decrements remaining ticks', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_cooldown8_test:test_cooldown_tick_decrements', '#cooldown_after_tick')
    expect(r).toBeGreaterThanOrEqual(2)
    expect(r).toBeLessThanOrEqual(2)
  }, 30_000)

  test('cooldown_ready becomes true after expiry', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_cooldown8_test:test_cooldown_expires_after_tick', '#cooldown_expired')
    expect(r).toBeGreaterThanOrEqual(1)
    expect(r).toBeLessThanOrEqual(1)
  }, 30_000)

  test('inactive cooldown remains ready', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_cooldown8_test:test_cooldown_inactive_stays_ready', '#cooldown_inactive')
    expect(r).toBeGreaterThanOrEqual(1)
    expect(r).toBeLessThanOrEqual(1)
  }, 30_000)
})

describe('stdlib coverage 8 — timer', () => {
  test('Timer.elapsed reflects completed ticks', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_timer8_test:test_timer_elapsed_after_ticks', '#timer_elapsed')
    expect(r).toBeGreaterThanOrEqual(2)
    expect(r).toBeLessThanOrEqual(2)
  }, 30_000)

  test('Timer.remaining decreases as time advances', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_timer8_test:test_timer_remaining_after_ticks', '#timer_remaining')
    expect(r).toBeGreaterThanOrEqual(1)
    expect(r).toBeLessThanOrEqual(1)
  }, 30_000)

  test('Timer.pause stops further progress', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_timer8_test:test_timer_pause_stops_progress', '#timer_pause')
    expect(r).toBeGreaterThanOrEqual(1)
    expect(r).toBeLessThanOrEqual(1)
  }, 30_000)

  test('Timer.reset clears elapsed ticks', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_timer8_test:test_timer_reset_clears_elapsed', '#timer_reset')
    expect(r).toBeGreaterThanOrEqual(0)
    expect(r).toBeLessThanOrEqual(0)
  }, 30_000)

  test('Timer.done returns true after full duration', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_timer8_test:test_timer_done_after_full_duration', '#timer_done')
    expect(r).toBeGreaterThanOrEqual(1)
    expect(r).toBeLessThanOrEqual(1)
  }, 30_000)
})

describe('stdlib coverage 8 — bits', () => {
  test('bit_toggle flips an unset bit on', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_bits8_test:test_bit_toggle', '#bits_toggle')
    expect(r).toBeGreaterThanOrEqual(7)
    expect(r).toBeLessThanOrEqual(7)
  }, 30_000)

  test('bit_not(0) fills all 31 non-sign bits', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_bits8_test:test_bit_not_zero', '#bits_not')
    expect(r).toBeGreaterThanOrEqual(2147483647)
    expect(r).toBeLessThanOrEqual(2147483647)
  }, 30_000)

  test('popcount counts set bits', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_bits8_test:test_popcount_255', '#bits_popcount')
    expect(r).toBeGreaterThanOrEqual(8)
    expect(r).toBeLessThanOrEqual(8)
  }, 30_000)

  test('bit_set is idempotent for an already-set bit', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_bits8_test:test_bit_set_idempotent', '#bits_set_idempotent')
    expect(r).toBeGreaterThanOrEqual(5)
    expect(r).toBeLessThanOrEqual(5)
  }, 30_000)

  test('bit_clear leaves a missing bit unchanged', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }
    const r = await runAndRead('stdlib_bits8_test:test_bit_clear_missing_bit', '#bits_clear_missing')
    expect(r).toBeGreaterThanOrEqual(2)
    expect(r).toBeLessThanOrEqual(2)
  }, 30_000)
})
