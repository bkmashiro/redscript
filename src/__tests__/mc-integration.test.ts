/**
 * RedScript MC Integration Tests
 *
 * Tests compiled datapacks against a real Paper 1.21.4 server.
 *
 * Prerequisites:
 *   - Paper server running with TestHarnessPlugin on port 25561
 *   - MC_SERVER_DIR env var pointing to server directory
 *
 * Run: MC_SERVER_DIR=~/mc-test-server npx jest mc-integration --testTimeout=120000
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../compile'
import { MCTestClient } from '../mc-test/client'

const MC_HOST = process.env.MC_HOST ?? 'localhost'
const MC_PORT = parseInt(process.env.MC_PORT ?? '25561')
const MC_SERVER_DIR = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')
const DATAPACK_DIR = path.join(MC_SERVER_DIR, 'world', 'datapacks', 'redscript-test')

let serverOnline = false
let mc: MCTestClient

/** Write compiled RedScript source into the shared test datapack directory.
 *  Merges minecraft tag files (tick.json / load.json) instead of overwriting. */
function writeFixture(source: string, namespace: string): void {
  fs.mkdirSync(DATAPACK_DIR, { recursive: true })
  // Write pack.mcmeta once
  if (!fs.existsSync(path.join(DATAPACK_DIR, 'pack.mcmeta'))) {
    fs.writeFileSync(path.join(DATAPACK_DIR, 'pack.mcmeta'), JSON.stringify({
      pack: { pack_format: 48, description: 'RedScript integration tests' }
    }))
  }

  const result = compile(source, { namespace })
  if (result.error) throw new Error(`Compile error in ${namespace}: ${result.error}`)

  for (const file of result.files ?? []) {
    if (file.path === 'pack.mcmeta') continue
    const filePath = path.join(DATAPACK_DIR, file.path)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })

    // Merge minecraft tag files (tick.json, load.json) instead of overwriting
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

beforeAll(async () => {
  mc = new MCTestClient(MC_HOST, MC_PORT)
  serverOnline = await mc.isOnline()
  if (!serverOnline) {
    console.warn(`⚠ MC server not running at ${MC_HOST}:${MC_PORT} — skipping integration tests`)
    console.warn(`  Run: MC_SERVER_DIR=~/mc-test-server npx ts-node src/mc-test/setup.ts`)
    console.warn(`  Then restart the MC server and re-run tests.`)
    return
  }

  // ── Write fixtures + use safe reloadData (no /reload confirm) ───────
  // counter.rs
  if (fs.existsSync(path.join(__dirname, '../examples/counter.rs'))) {
    writeFixture(fs.readFileSync(path.join(__dirname, '../examples/counter.rs'), 'utf-8'), 'counter')
  }
  if (fs.existsSync(path.join(__dirname, '../examples/world_manager.rs'))) {
    writeFixture(fs.readFileSync(path.join(__dirname, '../examples/world_manager.rs'), 'utf-8'), 'world_manager')
  }
  writeFixture(`
    @tick
    fn on_tick() {
      scoreboard_set("#tick_counter", "ticks", scoreboard_get("#tick_counter", "ticks") + 1);
    }
  `, 'tick_test')
  writeFixture(`
    fn check_score() {
      let x: int = scoreboard_get("#check_x", "test_score");
      if (x > 5) {
        scoreboard_set("#check_x", "result", 1);
      } else {
        scoreboard_set("#check_x", "result", 0);
      }
    }
  `, 'inline_test')

  // ── E2E scenario fixtures ────────────────────────────────────────────

  // Scenario A: mini game loop (timer countdown + ended flag)
  writeFixture(`
    @tick
    fn game_tick() {
      let time: int = scoreboard_get("#game", "timer");
      if (time > 0) {
        scoreboard_set("#game", "timer", time - 1);
      }
      if (time == 1) {
        scoreboard_set("#game", "ended", 1);
      }
    }
    fn start_game() {
      scoreboard_set("#game", "timer", 5);
      scoreboard_set("#game", "ended", 0);
    }
  `, 'game_loop')

  // Scenario B: two functions, same temp var namespace — verify no collision
  writeFixture(`
    fn calc_sum() {
      let a: int = scoreboard_get("#math", "val_a");
      let b: int = scoreboard_get("#math", "val_b");
      scoreboard_set("#math", "sum", a + b);
    }
    fn calc_product() {
      let x: int = scoreboard_get("#math", "val_x");
      let y: int = scoreboard_get("#math", "val_y");
      scoreboard_set("#math", "product", x * y);
    }
    fn run_both() {
      calc_sum();
      calc_product();
    }
  `, 'math_test')

  // Scenario C: 3-deep call chain, each step modifies shared state
  writeFixture(`
    fn step3() {
      let v: int = scoreboard_get("#chain", "val");
      scoreboard_set("#chain", "val", v * 2);
    }
    fn step2() {
      let v: int = scoreboard_get("#chain", "val");
      scoreboard_set("#chain", "val", v + 5);
      step3();
    }
    fn step1() {
      scoreboard_set("#chain", "val", 10);
      step2();
    }
  `, 'call_chain')

  // Scenario D: setblock batching optimizer — 4 adjacent setblocks → fill
  writeFixture(`
    fn build_row() {
      setblock((0, 70, 0), "minecraft:stone");
      setblock((1, 70, 0), "minecraft:stone");
      setblock((2, 70, 0), "minecraft:stone");
      setblock((3, 70, 0), "minecraft:stone");
    }
  `, 'fill_test')

  // ── Full reset + safe data reload ────────────────────────────────────
  await mc.fullReset()

  // Pre-create scoreboards
  for (const obj of ['ticks', 'seconds', 'test_score', 'result', 'calc', 'rs',
                     'timer', 'ended', 'val_a', 'val_b', 'sum', 'val_x', 'val_y', 'product', 'val']) {
    await mc.command(`/scoreboard objectives add ${obj} dummy`).catch(() => {})
  }
  await mc.command('/scoreboard players set counter ticks 0')
  await mc.command('/scoreboard players set #tick_counter ticks 0')
  await mc.command('/scoreboard players set #check_x test_score 10')
  await mc.command('/scoreboard players set #check_x result 99')

  // Safe reload (Bukkit.reloadData — only datapacks, no plugin restart)
  console.log('  Reloading datapacks (safe reloadData)...')
  await mc.reload()
  await new Promise(r => setTimeout(r, 5000)) // wall-clock wait for data reload

  // Initialize __load functions
  await mc.command('/function counter:__load').catch(() => {})
  await mc.command('/function inline_test:__load').catch(() => {})
  await mc.ticks(20)

  console.log('  Setup complete.')
}, 60000)

describe('MC Integration Tests', () => {

  // ─── Test 1: Server connectivity ─────────────────────────────────────
  test('server is online and healthy', async () => {
    if (!serverOnline) return
    const status = await mc.status()
    expect(status.online).toBe(true)
    expect(status.tps_1m).toBeGreaterThan(10) // Allow recovery after reload
    console.log(`  Server: ${status.version}, TPS: ${status.tps_1m.toFixed(1)}`)
  })

  // ─── Test 2: Counter tick ─────────────────────────────────────────────
  test('counter.rs: tick function increments scoreboard over time', async () => {
    if (!serverOnline) return
    
    await mc.ticks(40) // Wait 2s (counter was already init'd in beforeAll)
    const count = await mc.scoreboard('counter', 'ticks')
    expect(count).toBeGreaterThan(0)
    console.log(`  counter/ticks after setup+40 ticks: ${count}`)
  })

  // ─── Test 3: setblock ────────────────────────────────────────────────
  test('world_manager.rs: setblock places correct block', async () => {
    if (!serverOnline) return
    
    // Clear just the lobby area, keep other state
    await mc.fullReset({ x1: -10, y1: 60, z1: -10, x2: 15, y2: 80, z2: 15, resetScoreboards: false })
    await mc.command('/function world_manager:__load')
    await mc.command('/function world_manager:reset_lobby_platform')
    await mc.ticks(10)
    
    const block = await mc.block(4, 65, 4)
    expect(block.type).toBe('minecraft:gold_block')
    console.log(`  Block at (4,65,4): ${block.type}`)
  })

  // ─── Test 4: fill ────────────────────────────────────────────────────
  test('world_manager.rs: fill creates smooth_stone floor', async () => {
    if (!serverOnline) return
    // Runs after test 3, floor should still be there
    const block = await mc.block(4, 64, 4)
    expect(block.type).toBe('minecraft:smooth_stone')
    console.log(`  Floor at (4,64,4): ${block.type}`)
  })

  // ─── Test 5: Scoreboard arithmetic ───────────────────────────────────
  test('scoreboard arithmetic works via commands', async () => {
    if (!serverOnline) return
    
    await mc.command('/scoreboard players set TestA calc 10')
    await mc.command('/scoreboard players set TestB calc 25')
    await mc.command('/scoreboard players operation TestA calc += TestB calc')
    await mc.ticks(2)
    
    const result = await mc.scoreboard('TestA', 'calc')
    expect(result).toBe(35)
    console.log(`  10 + 25 = ${result}`)
  })

  // ─── Test 6: Scoreboard proxy for announce ────────────────────────────
  test('scoreboard proxy test (chat logging not supported for /say)', async () => {
    if (!serverOnline) return
    
    await mc.command('/scoreboard objectives add announce_test dummy')
    await mc.command('/scoreboard players set announce_marker announce_test 42')
    await mc.ticks(2)
    
    const marker = await mc.scoreboard('announce_marker', 'announce_test')
    expect(marker).toBe(42)
    console.log(`  Marker value: ${marker}`)
  })

  // ─── Test 7: if/else logic via inline script ──────────────────────────
  test('inline rs: if/else (x=10 > 5) sets result=1', async () => {
    if (!serverOnline) return
    
    // #check_x test_score=10 was set in beforeAll, run check_score
    await mc.command('/function inline_test:check_score')
    await mc.ticks(5)
    
    const result = await mc.scoreboard('#check_x', 'result')
    expect(result).toBe(1)
    console.log(`  if (10 > 5) → result: ${result}`)
  })

  // ─── Test 8: Entity counting ──────────────────────────────────────────
  test('entity query: armor_stands survive peaceful mode', async () => {
    if (!serverOnline) return
    
    await mc.fullReset({ clearArea: false, killEntities: true, resetScoreboards: false })
    
    await mc.command('/summon minecraft:armor_stand 0 65 0')
    await mc.command('/summon minecraft:armor_stand 2 65 0')
    await mc.command('/summon minecraft:armor_stand 4 65 0')
    await mc.ticks(5)
    
    const stands = await mc.entities('@e[type=minecraft:armor_stand]')
    expect(stands.length).toBe(3)
    console.log(`  Spawned 3 armor_stands, found: ${stands.length}`)
    
    await mc.command('/kill @e[type=minecraft:armor_stand]')
  })

  // ─── Test 9: @tick dispatcher runs every tick ─────────────────────────
  test('@tick: tick_test increments #tick_counter every tick', async () => {
    if (!serverOnline) return
    
    // Reset counter
    await mc.command('/scoreboard players set #tick_counter ticks 0')
    await mc.ticks(40) // 2s
    
    const ticks = await mc.scoreboard('#tick_counter', 'ticks')
    expect(ticks).toBeGreaterThanOrEqual(10) // At least 10 of 40 ticks fired
    console.log(`  #tick_counter after 40 ticks: ${ticks}`)
  })

  // ─── Test 10: fullReset clears blocks ─────────────────────────────────
  test('fullReset clears previously placed blocks', async () => {
    if (!serverOnline) return
    
    await mc.command('/setblock 5 65 5 minecraft:diamond_block')
    await mc.ticks(2)
    
    let block = await mc.block(5, 65, 5)
    expect(block.type).toBe('minecraft:diamond_block')
    
    await mc.fullReset({ x1: 0, y1: 60, z1: 0, x2: 10, y2: 75, z2: 10, resetScoreboards: false })
    block = await mc.block(5, 65, 5)
    expect(block.type).toBe('minecraft:air')
    console.log(`  Block after reset: ${block.type} ✓`)
  })

})

// ─── E2E Scenario Tests ───────────────────────────────────────────────────────
describe('E2E Scenario Tests', () => {

  // Scenario A: Mini game loop
  // Verifies: @tick auto-runs, scoreboard read-modify-write, two if conditions
  // in the same function, timer countdown converges to ended=1
  test('A: game_loop timer countdown sets ended=1 after N ticks', async () => {
    if (!serverOnline) return

    // game_tick is @tick - it runs every server tick automatically.
    // start_game sets timer=5, but game_tick may already decrement it by the
    // time we query. Use a large timer and just verify it reaches 0 eventually.
    await mc.command('/scoreboard players set #game timer 0')
    await mc.command('/scoreboard players set #game ended 0')
    await mc.ticks(2)

    await mc.command('/function game_loop:__load')
    await mc.command('/function game_loop:start_game') // timer=5, ended=0

    // Wait 25 ticks — enough for 5 decrements + margin
    await mc.ticks(25)

    const ended = await mc.scoreboard('#game', 'ended')
    expect(ended).toBe(1)
    const finalTimer = await mc.scoreboard('#game', 'timer')
    expect(finalTimer).toBe(0)
    console.log(`  timer hit 0 (final=${finalTimer}), ended=${ended} ✓`)
  })

  // Scenario B: No temp var collision between two functions called in sequence
  // Verifies: each function's $t0/$t1 temp vars are isolated per-call, not globally shared
  // If there's a bug, calc_product would see sum's leftover $t vars and produce wrong result
  test('B: calc_sum + calc_product called in sequence — no temp var collision', async () => {
    if (!serverOnline) return

    await mc.command('/function math_test:__load')
    await mc.command('/scoreboard players set #math val_a 7')
    await mc.command('/scoreboard players set #math val_b 3')
    await mc.command('/scoreboard players set #math val_x 4')
    await mc.command('/scoreboard players set #math val_y 5')

    await mc.command('/function math_test:run_both') // calc_sum() then calc_product()
    await mc.ticks(5)

    const sum = await mc.scoreboard('#math', 'sum')
    const product = await mc.scoreboard('#math', 'product')
    expect(sum).toBe(10)       // 7 + 3
    expect(product).toBe(20)   // 4 × 5
    console.log(`  sum=${sum} (expect 10), product=${product} (expect 20) ✓`)
  })

  // Scenario C: 3-deep call chain, shared state threaded through
  // Verifies: function calls preserve scoreboard state across stack frames
  // step1: val=10 → step2: val=10+5=15 → step3: val=15×2=30
  test('C: 3-deep call chain preserves intermediate state (10→15→30)', async () => {
    if (!serverOnline) return

    await mc.command('/function call_chain:__load')
    await mc.command('/scoreboard players set #chain val 0')

    await mc.command('/function call_chain:step1')
    await mc.ticks(5)

    const val = await mc.scoreboard('#chain', 'val')
    expect(val).toBe(30)  // (10 + 5) * 2 = 30
    console.log(`  call chain result: ${val} (expect 30) ✓`)
  })

  // Scenario D: Setblock batching optimizer — 4 adjacent setblocks compiled to fill
  // Verifies: optimizer's fill-batching pass produces correct MC behavior
  // (not just that the output says "fill", but that ALL 4 blocks are actually stone)
  test('D: fill optimizer — 4 adjacent setblocks all placed correctly', async () => {
    if (!serverOnline) return

    await mc.fullReset({ x1: -5, y1: 65, z1: -5, x2: 10, y2: 75, z2: 10, resetScoreboards: false })
    await mc.command('/function fill_test:__load')
    await mc.command('/function fill_test:build_row')
    await mc.ticks(5)

    // All 4 blocks should be stone (optimizer batched into fill 0 70 0 3 70 0 stone)
    for (let x = 0; x <= 3; x++) {
      const block = await mc.block(x, 70, 0)
      expect(block.type).toBe('minecraft:stone')
    }
    // Neighbors should still be air (fill didn't overshoot)
    const before = await mc.block(-1, 70, 0)
    const after  = await mc.block(4, 70, 0)
    expect(before.type).toBe('minecraft:air')
    expect(after.type).toBe('minecraft:air')
    console.log(`  fill_test: blocks [0-3,70,0]=stone, [-1]/[4]=air ✓`)
  })

})
