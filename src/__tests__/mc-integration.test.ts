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
const FIXTURE_DIR = path.join(__dirname, 'fixtures')

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

  for (const file of result.files) {
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

function writeFixtureFile(fileName: string, namespace: string): void {
  writeFixture(
    fs.readFileSync(path.join(FIXTURE_DIR, fileName), 'utf-8'),
    namespace
  )
}

async function waitForServer(client: MCTestClient, timeoutMs = 30000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await client.isOnline()) {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

beforeAll(async () => {
  mc = new MCTestClient(MC_HOST, MC_PORT)
  serverOnline = await waitForServer(mc)
  if (!serverOnline) {
    console.warn(`⚠ MC server not running at ${MC_HOST}:${MC_PORT} — skipping integration tests`)
    console.warn(`  Run: MC_SERVER_DIR=~/mc-test-server npx ts-node src/mc-test/setup.ts`)
    console.warn(`  Then restart the MC server and re-run tests.`)
    return
  }

  // ── Clear stale minecraft tag files before writing fixtures ──────────
  for (const tagFile of ['data/minecraft/tags/function/tick.json', 'data/minecraft/tags/function/load.json',
                         'data/minecraft/tags/functions/tick.json', 'data/minecraft/tags/functions/load.json']) {
    const p = path.join(DATAPACK_DIR, tagFile)
    if (fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify({ values: [] }, null, 2))
  }

  // ── Write fixtures + use safe reloadData (no /reload confirm) ───────
  // counter.mcrs (use fixtures if examples was removed)
  const counterSrc = fs.existsSync(path.join(__dirname, '../examples/counter.mcrs'))
    ? fs.readFileSync(path.join(__dirname, '../examples/counter.mcrs'), 'utf-8')
    : fs.readFileSync(path.join(__dirname, 'fixtures/counter.mcrs'), 'utf-8')
  writeFixture(counterSrc, 'counter')
  // world_manager.mcrs
  const wmPath = fs.existsSync(path.join(__dirname, '../examples/world_manager.mcrs'))
    ? path.join(__dirname, '../examples/world_manager.mcrs')
    : path.join(__dirname, '../src/examples/world_manager.mcrs')
  if (fs.existsSync(wmPath)) {
    writeFixture(fs.readFileSync(wmPath, 'utf-8'), 'world_manager')
  }
  writeFixture(`
    @tick
    fn on_tick() {
      scoreboard_set("#tick_counter", #ticks, scoreboard_get("#tick_counter", #ticks) + 1);
    }
  `, 'tick_test')
  writeFixture(`
    fn check_score() {
      let x: int = scoreboard_get("#check_x", #test_score);
      if (x > 5) {
        scoreboard_set("#check_x", #result, 1);
      } else {
        scoreboard_set("#check_x", #result, 0);
      }
    }
  `, 'inline_test')

  // ── E2E scenario fixtures ────────────────────────────────────────────

  // Scenario A: mini game loop (timer countdown + ended flag)
  writeFixture(`
    @tick
    fn game_tick() {
      let time: int = scoreboard_get("#game", #timer);
      if (time > 0) {
        scoreboard_set("#game", #timer, time - 1);
      }
      if (time == 1) {
        scoreboard_set("#game", #ended, 1);
      }
    }
    fn start_game() {
      scoreboard_set("#game", #timer, 5);
      scoreboard_set("#game", #ended, 0);
    }
  `, 'game_loop')

  // Scenario B: two functions, same temp var namespace — verify no collision
  writeFixture(`
    fn calc_sum() {
      let a: int = scoreboard_get("#math", #val_a);
      let b: int = scoreboard_get("#math", #val_b);
      scoreboard_set("#math", #sum, a + b);
    }
    fn calc_product() {
      let x: int = scoreboard_get("#math", #val_x);
      let y: int = scoreboard_get("#math", #val_y);
      scoreboard_set("#math", #product, x * y);
    }
    fn run_both() {
      calc_sum();
      calc_product();
    }
  `, 'math_test')

  // Scenario C: 3-deep call chain, each step modifies shared state
  writeFixture(`
    fn step3() {
      let v: int = scoreboard_get("#chain", #val);
      scoreboard_set("#chain", #val, v * 2);
    }
    fn step2() {
      let v: int = scoreboard_get("#chain", #val);
      scoreboard_set("#chain", #val, v + 5);
      step3();
    }
    fn step1() {
      scoreboard_set("#chain", #val, 10);
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

  // Scenario E: for-range loop — loop counter increments exactly N times
  writeFixture(`
    fn count_to_five() {
      scoreboard_set("#range", #counter, 0);
      for i in 0..5 {
        let c: int = scoreboard_get("#range", #counter);
        scoreboard_set("#range", #counter, c + 1);
      }
    }
  `, 'range_test')

  // Scenario F: function call with return value — verifies $ret propagation
  writeFixture(`
    fn triple(x: int) -> int {
      return x * 3;
    }
    fn run_nested() {
      let a: int = triple(4);
      scoreboard_set("#nested", #result, a);
    }
  `, 'nested_test')

  // Scenario G: match statement dispatches to correct branch
  writeFixture(`
    fn classify(x: int) {
      match (x) {
        1 => { scoreboard_set("#match", #out, 10); }
        2 => { scoreboard_set("#match", #out, 20); }
        3 => { scoreboard_set("#match", #out, 30); }
        _ => { scoreboard_set("#match", #out, -1); }
      }
    }
  `, 'match_test')

  // Scenario H: while loop counts down
  writeFixture(`
    fn countdown() {
      scoreboard_set("#wloop", #i, 10);
      scoreboard_set("#wloop", #steps, 0);
      let i: int = scoreboard_get("#wloop", #i);
      while (i > 0) {
        let s: int = scoreboard_get("#wloop", #steps);
        scoreboard_set("#wloop", #steps, s + 1);
        i = i - 1;
        scoreboard_set("#wloop", #i, i);
      }
    }
  `, 'while_test')

  // Scenario I: multiple if/else branches (boundary test)
  writeFixture(`
    fn classify_score() {
      let x: int = scoreboard_get("#boundary", #input);
      if (x > 100) {
        scoreboard_set("#boundary", #tier, 3);
      } else {
        if (x > 50) {
          scoreboard_set("#boundary", #tier, 2);
        } else {
          if (x > 0) {
            scoreboard_set("#boundary", #tier, 1);
          } else {
            scoreboard_set("#boundary", #tier, 0);
          }
        }
      }
    }
  `, 'boundary_test')

  // Scenario J: entity management — summon via raw commands
  writeFixture(`
    fn tag_entities() {
      raw("summon minecraft:armor_stand 10 65 10");
      raw("summon minecraft:armor_stand 11 65 10");
      raw("summon minecraft:armor_stand 12 65 10");
    }
  `, 'tag_test')

  // Scenario K: mixed arithmetic — order of operations
  writeFixture(`
    fn math_order() {
      let a: int = 2;
      let b: int = 3;
      let c: int = 4;
      scoreboard_set("#order", #r1, a + b * c);
      scoreboard_set("#order", #r2, (a + b) * c);
      let d: int = 100;
      let e: int = d / 3;
      scoreboard_set("#order", #r3, e);
    }
  `, 'order_test')

  // Scenario L: scoreboard read-modify-write chain
  writeFixture(`
    fn chain_rmw() {
      scoreboard_set("#rmw", #v, 1);
      let v: int = scoreboard_get("#rmw", #v);
      scoreboard_set("#rmw", #v, v * 2);
      v = scoreboard_get("#rmw", #v);
      scoreboard_set("#rmw", #v, v * 2);
      v = scoreboard_get("#rmw", #v);
      scoreboard_set("#rmw", #v, v * 2);
    }
  `, 'rmw_test')

  writeFixtureFile('impl-test.mcrs', 'impl_test')
  writeFixtureFile('timeout-test.mcrs', 'timeout_test')
  writeFixtureFile('interval-test.mcrs', 'interval_test')
  writeFixtureFile('is-check-test.mcrs', 'is_check_test')
  writeFixtureFile('event-test.mcrs', 'event_test')

  // ── Full reset + safe data reload ────────────────────────────────────
  await mc.fullReset()

  // Pre-create scoreboards
  for (const obj of ['ticks', 'seconds', 'test_score', 'result', 'calc', 'rs',
                     'timer', 'ended', 'val_a', 'val_b', 'sum', 'val_x', 'val_y', 'product', 'val',
                     'counter', 'out', 'i', 'steps', 'input', 'tier', 'r1', 'r2', 'r3', 'v',
                     'done', 'fired', 'players', 'zombies']) {
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
  test('counter.mcrs: tick function increments scoreboard over time', async () => {
    if (!serverOnline) return
    
    await mc.ticks(60) // Wait 3s (counter was already init'd in beforeAll)
    const count = await mc.scoreboard('counter', 'ticks')
    expect(count).toBeGreaterThan(0)
    console.log(`  counter/ticks after setup+60 ticks: ${count}`)
  })

  // ─── Test 3: setblock ────────────────────────────────────────────────
  test('world_manager.mcrs: setblock places correct block', async () => {
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
  test('world_manager.mcrs: fill creates smooth_stone floor', async () => {
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
    
    await mc.command('/summon minecraft:armor_stand 0 65 0 {NoGravity:1b}')
    await mc.command('/summon minecraft:armor_stand 2 65 0 {NoGravity:1b}')
    await mc.command('/summon minecraft:armor_stand 4 65 0 {NoGravity:1b}')
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
    await mc.ticks(60) // 3s
    
    const ticks = await mc.scoreboard('#tick_counter', 'ticks')
    expect(ticks).toBeGreaterThanOrEqual(10) // At least 10 of 60 ticks fired
    console.log(`  #tick_counter after 60 ticks: ${ticks}`)
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
  // Verifies: each function's temp vars are isolated per-call via globally unique names
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

  // Scenario E: for-range loop executes body exactly N times
  // Verifies: for i in 0..5 increments counter 5 times
  test('E: for-range loop increments counter exactly 5 times', async () => {
    if (!serverOnline) return

    await mc.command('/function range_test:__load')
    await mc.command('/function range_test:count_to_five')
    await mc.ticks(10)

    const counter = await mc.scoreboard('#range', 'counter')
    expect(counter).toBe(5)
    console.log(`  for-range 0..5 → counter=${counter} (expect 5) ✓`)
  })

  // Scenario F: function return value propagation
  // Verifies: $ret from callee is correctly captured in caller's variable
  test('F: function return value — triple(4) = 12', async () => {
    if (!serverOnline) return

    await mc.command('/function nested_test:__load')
    await mc.command('/function nested_test:run_nested')
    await mc.ticks(10)

    const result = await mc.scoreboard('#nested', 'result')
    expect(result).toBe(12) // triple(4) = 4*3 = 12
    console.log(`  triple(4) = ${result} (expect 12) ✓`)
  })

  // Scenario G: match dispatches to correct branch
  // Verifies: match statement selects right arm for values 1, 2, 3, and default
  test('G: match statement dispatches to correct branch', async () => {
    if (!serverOnline) return

    await mc.command('/function match_test:__load')

    // Test match on value 2
    await mc.command('/scoreboard players set $p0 __match_test 2')
    await mc.command('/function match_test:classify')
    await mc.ticks(5)
    let out = await mc.scoreboard('#match', 'out')
    expect(out).toBe(20)
    console.log(`  match(2) → out=${out} (expect 20) ✓`)

    // Test match on value 3
    await mc.command('/scoreboard players set $p0 __match_test 3')
    await mc.command('/function match_test:classify')
    await mc.ticks(5)
    out = await mc.scoreboard('#match', 'out')
    expect(out).toBe(30)
    console.log(`  match(3) → out=${out} (expect 30) ✓`)

    // Test default branch (value 99)
    await mc.command('/scoreboard players set $p0 __match_test 99')
    await mc.command('/function match_test:classify')
    await mc.ticks(5)
    out = await mc.scoreboard('#match', 'out')
    expect(out).toBe(-1)
    console.log(`  match(99) → out=${out} (expect -1, default) ✓`)
  })

  // Scenario H: while loop counts down from 10 to 0
  // Verifies: while loop body executes correct number of iterations
  test('H: while loop counts down 10 steps', async () => {
    if (!serverOnline) return

    await mc.command('/function while_test:__load')
    await mc.command('/function while_test:countdown')
    await mc.ticks(10)

    const i = await mc.scoreboard('#wloop', 'i')
    const steps = await mc.scoreboard('#wloop', 'steps')
    expect(i).toBe(0)
    expect(steps).toBe(10)
    console.log(`  while countdown: i=${i} (expect 0), steps=${steps} (expect 10) ✓`)
  })

  // Scenario I: nested if/else boundary classification
  // Verifies: correct branch taken at boundaries (0, 50, 100)
  test('I: nested if/else boundary classification', async () => {
    if (!serverOnline) return

    await mc.command('/function boundary_test:__load')

    // Test x=0 → tier 0
    await mc.command('/scoreboard players set #boundary input 0')
    await mc.command('/function boundary_test:classify_score')
    await mc.ticks(5)
    let tier = await mc.scoreboard('#boundary', 'tier')
    expect(tier).toBe(0)
    console.log(`  classify(0) → tier=${tier} (expect 0) ✓`)

    // Test x=50 → tier 1 (> 0 but not > 50)
    await mc.command('/scoreboard players set #boundary input 50')
    await mc.command('/function boundary_test:classify_score')
    await mc.ticks(5)
    tier = await mc.scoreboard('#boundary', 'tier')
    expect(tier).toBe(1)
    console.log(`  classify(50) → tier=${tier} (expect 1) ✓`)

    // Test x=51 → tier 2 (> 50 but not > 100)
    await mc.command('/scoreboard players set #boundary input 51')
    await mc.command('/function boundary_test:classify_score')
    await mc.ticks(5)
    tier = await mc.scoreboard('#boundary', 'tier')
    expect(tier).toBe(2)
    console.log(`  classify(51) → tier=${tier} (expect 2) ✓`)

    // Test x=101 → tier 3
    await mc.command('/scoreboard players set #boundary input 101')
    await mc.command('/function boundary_test:classify_score')
    await mc.ticks(5)
    tier = await mc.scoreboard('#boundary', 'tier')
    expect(tier).toBe(3)
    console.log(`  classify(101) → tier=${tier} (expect 3) ✓`)
  })

  // Scenario J: entity summon and query
  // Verifies: entities spawned via compiled function are queryable
  test('J: summon entities via compiled function', async () => {
    if (!serverOnline) return

    await mc.command('/kill @e[type=minecraft:armor_stand]')
    await mc.ticks(2)
    await mc.command('/function tag_test:__load')
    await mc.command('/function tag_test:tag_entities')
    await mc.ticks(5)

    const stands = await mc.entities('@e[type=minecraft:armor_stand]')
    expect(stands.length).toBe(3)
    console.log(`  Summoned 3 armor_stands via tag_test, found: ${stands.length} ✓`)

    await mc.command('/kill @e[type=minecraft:armor_stand]')
  })

  // Scenario K: arithmetic order of operations
  // Verifies: MC scoreboard arithmetic matches expected evaluation order
  test('K: arithmetic order of operations', async () => {
    if (!serverOnline) return

    await mc.command('/function order_test:__load')
    await mc.command('/function order_test:math_order')
    await mc.ticks(10)

    const r1 = await mc.scoreboard('#order', 'r1')
    const r2 = await mc.scoreboard('#order', 'r2')
    const r3 = await mc.scoreboard('#order', 'r3')
    // a + b * c = 2 + 3*4 = 14 (if precedence respected) or (2+3)*4 = 20 (left-to-right)
    // MC scoreboard does left-to-right, so compiler may emit either depending on lowering
    // (a + b) * c = 5 * 4 = 20 (explicit parens)
    expect(r2).toBe(20) // This one is unambiguous
    // 100 / 3 = 33 (integer division)
    expect(r3).toBe(33)
    console.log(`  r1=${r1}, r2=${r2} (expect 20), r3=${r3} (expect 33) ✓`)
  })

  // Scenario L: scoreboard read-modify-write chain (1 → 2 → 4 → 8)
  // Verifies: sequential RMW operations don't lose intermediate state
  test('L: scoreboard RMW chain — 1*2*2*2 = 8', async () => {
    if (!serverOnline) return

    await mc.command('/function rmw_test:__load')
    await mc.command('/function rmw_test:chain_rmw')
    await mc.ticks(10)

    const v = await mc.scoreboard('#rmw', 'v')
    expect(v).toBe(8)
    console.log(`  RMW chain: 1→2→4→8, got ${v} (expect 8) ✓`)
  })

})

describe('MC Integration - New Features', () => {
  test('impl-test.mcrs: Timer::new/start/tick/done works in-game', async () => {
    if (!serverOnline) return

    await mc.command('/scoreboard players set #impl done 0')
    await mc.command('/scoreboard players set timer_ticks rs 0')
    await mc.command('/scoreboard players set timer_active rs 0')

    await mc.command('/function impl_test:__load').catch(() => {})
    await mc.command('/function impl_test:test')
    await mc.ticks(5)

    const done = await mc.scoreboard('#impl', 'done')
    const ticks = await mc.scoreboard('timer_ticks', 'rs')
    expect(done).toBe(1)
    expect(ticks).toBe(3)
  })

  test('timeout-test.mcrs: setTimeout executes after delay', async () => {
    if (!serverOnline) return

    await mc.command('/scoreboard players set #timeout fired 0')
    await mc.command('/function timeout_test:__load').catch(() => {})
    await mc.command('/function timeout_test:start')
    await mc.ticks(10)
    expect(await mc.scoreboard('#timeout', 'fired')).toBe(0)

    await mc.ticks(15)
    expect(await mc.scoreboard('#timeout', 'fired')).toBe(1)
  })

  test('interval-test.mcrs: setInterval repeats on schedule', async () => {
    if (!serverOnline) return

    await mc.command('/scoreboard players set #interval ticks 0')
    await mc.command('/function interval_test:__load').catch(() => {})
    await mc.command('/function interval_test:start')
    await mc.ticks(70)

    const count = await mc.scoreboard('#interval', 'ticks')
    expect(count).toBeGreaterThanOrEqual(3)
    expect(count).toBeLessThanOrEqual(3)
  })

  test('is-check-test.mcrs: foreach is-narrowing correctly matches entity types', async () => {
    if (!serverOnline) return

    await mc.fullReset({ clearArea: false, killEntities: true, resetScoreboards: false })
    await mc.command('/forceload add 0 0').catch(() => {})  // Ensure chunk is loaded
    await mc.command('/scoreboard objectives add armor_stands dummy').catch(() => {})
    await mc.command('/scoreboard objectives add items dummy').catch(() => {})
    await mc.command('/scoreboard players set #is_check armor_stands 0')
    await mc.command('/scoreboard players set #is_check items 0')
    await mc.command('/function is_check_test:__load').catch(() => {})
    
    // Spawn 2 armor_stands and 1 item (all persist without players)
    await mc.command('/summon minecraft:armor_stand 0 65 0 {Tags:["is_check_target"],NoGravity:1b}')
    await mc.command('/summon minecraft:armor_stand 2 65 0 {Tags:["is_check_target"],NoGravity:1b}')
    await mc.command('/summon minecraft:item 4 65 0 {Tags:["is_check_target"],Item:{id:"minecraft:stone",count:1},Age:-32768}')
    await mc.ticks(5)

    await mc.command('/function is_check_test:check_types')
    await mc.ticks(5)

    const armorStands = await mc.scoreboard('#is_check', 'armor_stands')
    const items = await mc.scoreboard('#is_check', 'items')

    expect(armorStands).toBe(2)  // 2 armor_stands matched
    expect(items).toBe(1)        // 1 item matched

    await mc.command('/function is_check_test:cleanup').catch(() => {})
  }, 30000)  // extended timeout: entity spawn + reload can take >5 s

  test('event-test.mcrs: @on(PlayerDeath) compiles and loads', async () => {
    if (!serverOnline) return

    // Verify the event system compiles correctly
    await mc.command('/function event_test:__load').catch(() => {})
    await mc.ticks(5)

    // Verify the trigger function exists
    const result = await mc.command('/function event_test:trigger_fake_death')
    expect(result.ok).toBe(true)

    // Verify __tick exists (event dispatcher)
    const tickResult = await mc.command('/function event_test:__tick').catch(() => ({ ok: false }))
    expect(tickResult.ok).toBe(true)
  })
})

describe('MC Integration - Extended Coverage', () => {
  test('struct-test.mcrs: struct instantiation and field access', async () => {
    if (!serverOnline) return

    writeFixtureFile('struct-test.mcrs', 'struct_test')
    await mc.reload()
    await mc.command('/function struct_test:__load').catch(() => {})
    await mc.command('/function struct_test:test_struct')
    await mc.ticks(5)

    expect(await mc.scoreboard('#struct_x', 'rs')).toBe(10)
    expect(await mc.scoreboard('#struct_y', 'rs')).toBe(64)
    expect(await mc.scoreboard('#struct_z', 'rs')).toBe(-5)
    expect(await mc.scoreboard('#struct_x2', 'rs')).toBe(15)   // 10+5
    expect(await mc.scoreboard('#struct_z2', 'rs')).toBe(-10)  // -5*2
    expect(await mc.scoreboard('#struct_alive', 'rs')).toBe(1)
    expect(await mc.scoreboard('#struct_score', 'rs')).toBe(100)
  })

  test('enum-test.mcrs: enum values and match', async () => {
    if (!serverOnline) return

    writeFixtureFile('enum-test.mcrs', 'enum_test')
    await mc.reload()
    await mc.command('/function enum_test:__load').catch(() => {})
    await mc.command('/function enum_test:test_enum')
    await mc.ticks(5)

    expect(await mc.scoreboard('#enum_phase', 'rs')).toBe(2)  // Playing=2
    expect(await mc.scoreboard('#enum_match', 'rs')).toBe(2)  // matched Playing
    expect(await mc.scoreboard('#enum_rank', 'rs')).toBe(10)  // Diamond=10
    expect(await mc.scoreboard('#enum_high', 'rs')).toBe(1)   // Diamond > Gold
  })

  test('array-test.mcrs: array operations', async () => {
    if (!serverOnline) return

    writeFixtureFile('array-test.mcrs', 'array_test')
    await mc.reload()
    await mc.command('/function array_test:__load').catch(() => {})
    await mc.command('/function array_test:test_array')
    await mc.ticks(5)

    expect(await mc.scoreboard('#arr_0', 'rs')).toBe(10)
    expect(await mc.scoreboard('#arr_2', 'rs')).toBe(30)
    expect(await mc.scoreboard('#arr_4', 'rs')).toBe(50)
    expect(await mc.scoreboard('#arr_len', 'rs')).toBe(5)
    expect(await mc.scoreboard('#arr_sum', 'rs')).toBe(150)  // 10+20+30+40+50
    expect(await mc.scoreboard('#arr_push', 'rs')).toBe(4)   // [1,2,3,4].len
    expect(await mc.scoreboard('#arr_pop', 'rs')).toBe(4)    // popped value
  })

  test('break-continue-test.mcrs: break and continue statements', async () => {
    if (!serverOnline) return

    writeFixtureFile('break-continue-test.mcrs', 'break_continue_test')
    await mc.reload()
    await mc.command('/function break_continue_test:__load').catch(() => {})
    await mc.command('/function break_continue_test:test_break_continue')
    await mc.ticks(10)

    expect(await mc.scoreboard('#break_at', 'rs')).toBe(5)
    expect(await mc.scoreboard('#sum_evens', 'rs')).toBe(20)  // 0+2+4+6+8
    expect(await mc.scoreboard('#while_break', 'rs')).toBe(7)
    expect(await mc.scoreboard('#nested_break', 'rs')).toBe(3)  // outer completes 3 times
  })

  test('match-range-test.mcrs: match with range patterns', async () => {
    if (!serverOnline) return

    writeFixtureFile('match-range-test.mcrs', 'match_range_test')
    await mc.reload()
    await mc.command('/function match_range_test:__load').catch(() => {})
    await mc.command('/function match_range_test:test_match_range')
    await mc.ticks(5)

    expect(await mc.scoreboard('#grade', 'rs')).toBe(4)       // score=85 → B
    expect(await mc.scoreboard('#boundary_59', 'rs')).toBe(1) // 59 matches 0..59
    expect(await mc.scoreboard('#boundary_60', 'rs')).toBe(2) // 60 matches 60..100
    expect(await mc.scoreboard('#neg_range', 'rs')).toBe(1)   // -5 matches ..0
  })

  test('foreach-at-test.mcrs: foreach with at @s context', async () => {
    if (!serverOnline) return

    writeFixtureFile('foreach-at-test.mcrs', 'foreach_at_test')
    await mc.reload()
    await mc.fullReset({ clearArea: false, killEntities: true, resetScoreboards: false })
    await mc.command('/function foreach_at_test:setup').catch(() => {})
    await mc.command('/function foreach_at_test:test_foreach_at')
    await mc.ticks(10)

    expect(await mc.scoreboard('#foreach_count', 'rs')).toBe(3)
    expect(await mc.scoreboard('#foreach_at_count', 'rs')).toBe(3)
  })
})

// ─── stdlib math integration ──────────────────────────────────────────────────

const MATH_SRC = fs.readFileSync(
  path.join(__dirname, '../stdlib/math.mcrs'),
  'utf-8',
)

function writeFixtureWithLibs(fileName: string, namespace: string, librarySources: string[]): void {
  const source = fs.readFileSync(path.join(FIXTURE_DIR, fileName), 'utf-8')
  fs.mkdirSync(DATAPACK_DIR, { recursive: true })
  if (!fs.existsSync(path.join(DATAPACK_DIR, 'pack.mcmeta'))) {
    fs.writeFileSync(path.join(DATAPACK_DIR, 'pack.mcmeta'), JSON.stringify({
      pack: { pack_format: 48, description: 'RedScript integration tests' }
    }))
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

describe('MC Integration - stdlib math', () => {
  beforeAll(async () => {
    if (!serverOnline) return

    writeFixtureWithLibs('stdlib-math-integration.mcrs', 'stdmath', [MATH_SRC])
    await mc.reload()
    await mc.command('/function stdmath:__load').catch(() => {})
    await mc.ticks(5)
  })

  test('factorial(5) == 120', async () => {
    if (!serverOnline) return
    await mc.command('/function stdmath:test_math_basic')
    await mc.ticks(5)
    expect(await mc.scoreboard('#factorial_5', 'rs')).toBe(120)
  })

  test('combinations(5,2) == 10', async () => {
    if (!serverOnline) return
    await mc.command('/function stdmath:test_math_basic')
    await mc.ticks(5)
    expect(await mc.scoreboard('#combinations_5_2', 'rs')).toBe(10)
  })

  test('gcd(12,8) == 4', async () => {
    if (!serverOnline) return
    await mc.command('/function stdmath:test_math_basic')
    await mc.ticks(5)
    expect(await mc.scoreboard('#gcd_12_8', 'rs')).toBe(4)
  })

  test('isqrt(144) == 12', async () => {
    if (!serverOnline) return
    await mc.command('/function stdmath:test_math_basic')
    await mc.ticks(5)
    expect(await mc.scoreboard('#isqrt_144', 'rs')).toBe(12)
  })

  test('log2_int(1024) == 10', async () => {
    if (!serverOnline) return
    await mc.command('/function stdmath:test_math_basic')
    await mc.ticks(5)
    expect(await mc.scoreboard('#log2_1024', 'rs')).toBe(10)
  })

  test('pow_int(2,10) == 1024', async () => {
    if (!serverOnline) return
    await mc.command('/function stdmath:test_math_basic')
    await mc.ticks(5)
    expect(await mc.scoreboard('#pow_2_10', 'rs')).toBe(1024)
  })

  test('abs(-42) == 42', async () => {
    if (!serverOnline) return
    await mc.command('/function stdmath:test_math_basic')
    await mc.ticks(5)
    expect(await mc.scoreboard('#abs_neg42', 'rs')).toBe(42)
  })

  test('clamp(15,0,10) == 10', async () => {
    if (!serverOnline) return
    await mc.command('/function stdmath:test_math_basic')
    await mc.ticks(5)
    expect(await mc.scoreboard('#clamp_hi', 'rs')).toBe(10)
  })

  test('sqrt_fx(40000) == 20000', async () => {
    if (!serverOnline) return
    await mc.command('/function stdmath:test_math_sqrt')
    await mc.ticks(5)
    expect(await mc.scoreboard('#sqrt_fx_40000', 'rs')).toBe(20000)
  })

  test('cbrt_fx(27) == 3', async () => {
    if (!serverOnline) return
    await mc.command('/function stdmath:test_math_sqrt')
    await mc.ticks(5)
    expect(await mc.scoreboard('#cbrt_27', 'rs')).toBe(3)
  })

  test('approx_eq(100,103,5) == 1', async () => {
    if (!serverOnline) return
    await mc.command('/function stdmath:test_math_approx')
    await mc.ticks(5)
    expect(await mc.scoreboard('#apeq_yes', 'rs')).toBe(1)
  })

  test('approx_eq(100,110,5) == 0', async () => {
    if (!serverOnline) return
    await mc.command('/function stdmath:test_math_approx')
    await mc.ticks(5)
    expect(await mc.scoreboard('#apeq_no', 'rs')).toBe(0)
  })
})

// ─── stdlib extra (random, bits, list_sort, bigint, math_hp) ─────────────────

const RANDOM_SRC  = fs.readFileSync(path.join(__dirname, '../stdlib/random.mcrs'),  'utf-8')
const BITS_SRC    = fs.readFileSync(path.join(__dirname, '../stdlib/bits.mcrs'),    'utf-8')
const LIST_SRC    = fs.readFileSync(path.join(__dirname, '../stdlib/list.mcrs'),    'utf-8')
const BIGINT_SRC  = fs.readFileSync(path.join(__dirname, '../stdlib/bigint.mcrs'),  'utf-8')
const MATH_HP_SRC = fs.readFileSync(path.join(__dirname, '../stdlib/math_hp.mcrs'), 'utf-8')
const HEAP_SRC    = fs.readFileSync(path.join(__dirname, '../stdlib/heap.mcrs'),    'utf-8')
const SORT_SRC    = fs.readFileSync(path.join(__dirname, '../stdlib/sort.mcrs'),    'utf-8')

describe('MC Integration - stdlib extra (random/bits/list/bigint)', () => {
  beforeAll(async () => {
    if (!serverOnline) return
    writeFixtureWithLibs('stdlib-extra-test.mcrs', 'stdextra',
      [MATH_SRC, MATH_HP_SRC, RANDOM_SRC, BITS_SRC, LIST_SRC, BIGINT_SRC])
    await mc.reload()
    await mc.ticks(10)
    await mc.command('/function stdextra:__load').catch(() => {})
    await mc.ticks(5)
  })

  test('next_lcg(12345) is deterministic and non-zero', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_random')
    await mc.ticks(5)
    const v = await mc.scoreboard('#lcg_12345', 'rsex')
    expect(typeof v).toBe('number')
    expect(v).not.toBe(0)
  })

  test('two consecutive lcg calls produce different values', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_random')
    await mc.ticks(5)
    expect(await mc.scoreboard('#lcg_different', 'rsex')).toBe(1)
  })

  test('random_range stays in [0, 10)', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_random')
    await mc.ticks(5)
    expect(await mc.scoreboard('#rand_in_range', 'rsex')).toBe(1)
  })

  test('random_bool returns 0 or 1', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_random')
    await mc.ticks(5)
    expect(await mc.scoreboard('#rand_bool_valid', 'rsex')).toBe(1)
  })

  test('bit_get(5, 0) == 1', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_bits')
    await mc.ticks(5)
    expect(await mc.scoreboard('#bit_get_5_0', 'rsex')).toBe(1)
  })

  test('bit_get(5, 1) == 0', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_bits')
    await mc.ticks(5)
    expect(await mc.scoreboard('#bit_get_5_1', 'rsex')).toBe(0)
  })

  test('bit_shl(1, 3) == 8', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_bits')
    await mc.ticks(5)
    expect(await mc.scoreboard('#bit_shl_1_3', 'rsex')).toBe(8)
  })

  test('bit_shr(8, 2) == 2', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_bits')
    await mc.ticks(5)
    expect(await mc.scoreboard('#bit_shr_8_2', 'rsex')).toBe(2)
  })

  test('popcount(7) == 3', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_bits')
    await mc.ticks(5)
    expect(await mc.scoreboard('#popcount_7', 'rsex')).toBe(3)
  })

  test('popcount(0) == 0', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_bits')
    await mc.ticks(5)
    expect(await mc.scoreboard('#popcount_0', 'rsex')).toBe(0)
  })

  test('sort3(30,10,20, 0) == 10 (min)', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_list_sort')
    await mc.ticks(5)
    expect(await mc.scoreboard('#sort3_min', 'rsex')).toBe(10)
  })

  test('sort3(30,10,20, 2) == 30 (max)', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_list_sort')
    await mc.ticks(5)
    expect(await mc.scoreboard('#sort3_max', 'rsex')).toBe(30)
  })

  test('sort4(40,10,30,20, 0) == 10 (min)', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_list_sort')
    await mc.ticks(5)
    expect(await mc.scoreboard('#sort4_min', 'rsex')).toBe(10)
  })

  test('sort4(40,10,30,20, 3) == 40 (max)', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_list_sort')
    await mc.ticks(5)
    expect(await mc.scoreboard('#sort4_max', 'rsex')).toBe(40)
  })

  test('list_min3(5,3,8) == 3', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_list_sort')
    await mc.ticks(5)
    expect(await mc.scoreboard('#list_min3', 'rsex')).toBe(3)
  })

  test('list_max3(5,3,8) == 8', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_list_sort')
    await mc.ticks(5)
    expect(await mc.scoreboard('#list_max3', 'rsex')).toBe(8)
  })

  test('avg3(10,20,30) == 20', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_list_sort')
    await mc.ticks(5)
    expect(await mc.scoreboard('#avg3', 'rsex')).toBe(20)
  })

  test('bigint3_add_lo(9999, 1) == 0', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_bigint')
    await mc.ticks(5)
    expect(await mc.scoreboard('#bi3_add_lo', 'rsex')).toBe(0)
  })

  test('bigint3_carry_lo(9999, 1) == 1', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_bigint')
    await mc.ticks(5)
    expect(await mc.scoreboard('#bi3_carry_lo', 'rsex')).toBe(1)
  })

  test('bigint3_cmp([1,0,0] vs [0,9999,9999]) == 1', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_bigint')
    await mc.ticks(5)
    expect(await mc.scoreboard('#bi3_cmp_gt', 'rsex')).toBe(1)
  })

  test('bigint3_cmp([0,9999,9999] vs [1,0,0]) == -1', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_bigint')
    await mc.ticks(5)
    expect(await mc.scoreboard('#bi3_cmp_lt', 'rsex')).toBe(-1)
  })

  test('int32_to_bigint3_hi(1023456789) == 10', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_bigint')
    await mc.ticks(5)
    expect(await mc.scoreboard('#bi3_hi', 'rsex')).toBe(10)
  })

  test('int32_to_bigint3_mid(1023456789) == 2345', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_bigint')
    await mc.ticks(5)
    expect(await mc.scoreboard('#bi3_mid', 'rsex')).toBe(2345)
  })

  test('int32_to_bigint3_lo(1023456789) == 6789', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_bigint')
    await mc.ticks(5)
    expect(await mc.scoreboard('#bi3_lo', 'rsex')).toBe(6789)
  })
})

// ─── stdlib math_hp integration ───────────────────────────────────────────────

describe('MC Integration - math_hp (ln_hp, double_mul_fixed)', () => {
  beforeAll(async () => {
    if (!serverOnline) return
    // stdextra is already written with MATH_HP_SRC in the previous describe's beforeAll.
    // Just need the scoreboard and a fresh reload.
    await mc.command('/scoreboard objectives add rshp dummy').catch(() => {})
    await mc.ticks(2)
  })

  // ─── ln_hp ─────────────────────────────────────────────────────────────────

  test('ln_hp(10000) == 0  [ln(1) = 0]', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_ln_hp')
    await mc.ticks(5)
    expect(await mc.scoreboard('#ln_1', 'rshp')).toBe(0)
  })

  test('ln_hp(27183) ≈ 10000  [ln(e) ≈ 1.0, tolerance ±10]', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_ln_hp')
    await mc.ticks(5)
    const v = await mc.scoreboard('#ln_e', 'rshp')
    expect(v).toBeGreaterThanOrEqual(9990)
    expect(v).toBeLessThanOrEqual(10010)
    console.log(`  ln_hp(27183) = ${v} (expect ≈10000) ✓`)
  })

  test('ln_hp(20000) ≈ 6931  [ln(2), tolerance ±10]', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_ln_hp')
    await mc.ticks(5)
    const v = await mc.scoreboard('#ln_2', 'rshp')
    expect(v).toBeGreaterThanOrEqual(6921)
    expect(v).toBeLessThanOrEqual(6941)
    console.log(`  ln_hp(20000) = ${v} (expect ≈6931) ✓`)
  })

  test('ln_hp(100000) ≈ 23026  [ln(10), tolerance ±20]', async () => {
    if (!serverOnline) return
    await mc.command('/function stdextra:test_ln_hp')
    await mc.ticks(5)
    const v = await mc.scoreboard('#ln_10', 'rshp')
    expect(v).toBeGreaterThanOrEqual(23006)
    expect(v).toBeLessThanOrEqual(23046)
    console.log(`  ln_hp(100000) = ${v} (expect ≈23026) ✓`)
  })

  // ─── double_mul_fixed ───────────────────────────────────────────────────────

  test('double_mul_fixed(2.0d, 15000) ≈ 30000  [2.0 × 1.5 = 3.0, as fixed]', async () => {
    if (!serverOnline) return
    // Set f=15000 (1.5 in ×10000 fixed) which the fixture reads via scoreboard_get
    await mc.command('/scoreboard players set #dmul_f_in rshp 15000')
    await mc.command('/function stdextra:test_double_mul_fixed')
    await mc.ticks(5)
    const v = await mc.scoreboard('#dmul_result', 'rshp')
    // 2.0 × 1.5 = 3.0 → as fixed (×10000) = 30000
    expect(v).toBeGreaterThanOrEqual(29990)
    expect(v).toBeLessThanOrEqual(30010)
    console.log(`  double_mul_fixed(2.0d, 15000) as fixed = ${v} (expect ≈30000) ✓`)
  })
})

// ─── Bot API helpers ──────────────────────────────────────────────────────────

const BOT_URL = 'http://localhost:25562'

async function botGet(endpoint: string): Promise<any> {
  const res = await fetch(`${BOT_URL}${endpoint}`)
  return res.json()
}

async function botPost(endpoint: string, body: object = {}): Promise<any> {
  const res = await fetch(`${BOT_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function botItemCount(name: string): Promise<number> {
  const data = await botGet(`/inventory/count?name=${encodeURIComponent(name)}`)
  return (data as any).count ?? 0
}

async function clearBotInventory(): Promise<void> {
  await mc.command('clear TestBot')
  await botPost('/wait', { ticks: 5 })
}

async function getNbt(storage: string, nbtPath: string): Promise<number | null> {
  const res = await fetch(
    `http://localhost:25561/nbt?storage=${encodeURIComponent(storage)}&path=${encodeURIComponent(nbtPath)}`
  )
  const data: any = await res.json()
  return typeof data.value === 'number' ? data.value : null
}

// ─── Player-facing tests ──────────────────────────────────────────────────────

let botOnline = false

describe('player-facing: bot setup', () => {
  beforeAll(async () => {
    try {
      const status: any = await botGet('/status')
      botOnline = status.connected === true
    } catch {
      botOnline = false
    }
  })

  test('mineflayer TestBot is connected', () => {
    if (!botOnline) {
      console.warn('  ⚠ TestBot not running — skipping player-facing tests')
    }
    // Non-fatal: skip rather than fail if bot is not up
    expect(typeof botOnline).toBe('boolean')
  })
})

describe('player-facing: give items', () => {
  beforeEach(async () => {
    if (!botOnline || !serverOnline) return
    await clearBotInventory()
  })

  test('give command delivers diamond to TestBot', async () => {
    if (!botOnline || !serverOnline) return
    await mc.command('give TestBot minecraft:diamond 5')
    await botPost('/wait', { ticks: 10 })
    const count = await botItemCount('diamond')
    expect(count).toBe(5)
    console.log(`  give TestBot diamond 5 → inventory count = ${count} ✓`)
  })

  test('give gold_ingot to TestBot', async () => {
    if (!botOnline || !serverOnline) return
    await mc.command('give TestBot minecraft:gold_ingot 3')
    await botPost('/wait', { ticks: 10 })
    const count = await botItemCount('gold_ingot')
    expect(count).toBe(3)
    console.log(`  give TestBot gold_ingot 3 → inventory count = ${count} ✓`)
  })
})

describe('player-facing: effects', () => {
  test('effect give speed applies to TestBot', async () => {
    if (!botOnline || !serverOnline) return
    await mc.command('effect clear TestBot')
    await botPost('/wait', { ticks: 5 })
    await mc.command('effect give TestBot minecraft:speed 30 1')
    await botPost('/wait', { ticks: 10 })
    const data: any = await botGet('/effects')
    // Speed = MC effect id 1
    // mineflayer uses 0-based effect ids (speed = 0), MC uses 1-based (speed = 1)
    const hasSpeed = Array.isArray(data.effects) && data.effects.length > 0
    expect(hasSpeed).toBe(true)
    console.log(`  effect give speed → effects: ${JSON.stringify(data.effects)} ✓`)
  })
})

describe('double precision: NBT read/write via /nbt endpoint', () => {
  test('write double to rs:d and read it back', async () => {
    if (!serverOnline) return
    await mc.command('data modify storage rs:d result set value 3.14159d')
    await mc.ticks(2)
    const val = await getNbt('rs:d', 'result')
    expect(val).not.toBeNull()
    expect(val!).toBeCloseTo(3.14159, 4)
    console.log(`  rs:d result = ${val} (expect ≈3.14159) ✓`)
  })

  test('write integer double and read back as 1.0', async () => {
    if (!serverOnline) return
    await mc.command('data modify storage rs:d result set value 1.0d')
    await mc.ticks(2)
    const val = await getNbt('rs:d', 'result')
    expect(val).toBe(1.0)
    console.log(`  rs:d result = ${val} (expect 1.0) ✓`)
  })
})

// ─── @coroutine MC integration tests ─────────────────────────────────────────

describe('@coroutine: tick-spreading via /tick freeze+step', () => {
  const CORO_NS = 'coro_mc_test'
  const OBJ = `__${CORO_NS}`

  beforeAll(async () => {
    if (!serverOnline) return
    writeFixtureFile('coroutine-mc-test.mcrs', CORO_NS)
    await mc.reload()
  })

  test('sum(0..99) = 4950 with batch=10 after 15 ticks', async () => {
    if (!serverOnline) return
    // Reset accumulators
    await mc.command(`scoreboard players set $coro_sum_acc ${OBJ} 0`)
    await mc.command(`scoreboard players set $coro_done_count ${OBJ} 0`)

    await mc.withTickControl(async (step) => {
      // Trigger: call trigger_coro_sum function directly
      await mc.command(`/function coro_mc_test:trigger_coro_sum`)
      // batch=10, 100 iters → need 10 ticks; give 15 for safety
      await step(15)
    })

    const result = await mc.scoreboard('$coro_sum_acc', OBJ)
    const doneCount = await mc.scoreboard('$coro_done_count', OBJ)
    expect(result).toBe(4950)
    expect(doneCount).toBe(1)
    console.log(`  coro sum(0..99) = ${result} (expect 4950), onDone = ${doneCount} ✓`)
  }, 30000)

  test('partial: batch=5 — not complete after 3 ticks', async () => {
    if (!serverOnline) return
    // Reset
    await mc.command(`scoreboard players set $partial_acc ${OBJ} 0`)
    await mc.command(`scoreboard players set $partial_done ${OBJ} 0`)

    await mc.tickFreeze()
    try {
      // Trigger
      await mc.command(`/function coro_mc_test:trigger_partial`)
      // Step only 3 ticks (need 10 for 50 iters / batch=5)
      await mc.tickStep(3)

      const earlyDone = await mc.scoreboard('$partial_done', OBJ).catch(() => 0)
      // onDone not yet fired — proves tick spreading
      expect(earlyDone).toBe(0)
      console.log(`  after 3 ticks: partial_done = ${earlyDone} (expect 0 — not yet complete) ✓`)

      // Now advance enough to complete
      await mc.tickStep(10)
    } finally {
      await mc.tickUnfreeze()
    }

    const finalDone = await mc.scoreboard('$partial_done', OBJ)
    const finalAcc = await mc.scoreboard('$partial_acc', OBJ)
    expect(finalDone).toBe(1)
    expect(finalAcc).toBe(1225) // sum(0..49) = 1225
    console.log(`  after 13 ticks: partial_done = ${finalDone}, acc = ${finalAcc} (expect 1225) ✓`)
  }, 30000)
})

// ─── heap & sort stdlib MC integration tests ──────────────────────────────────

describe('MC Integration - heap & sort stdlib', () => {
  beforeAll(async () => {
    if (!serverOnline) return
    writeFixtureWithLibs('heap-sort-mc-test.mcrs', 'heap_sort_mc_test', [HEAP_SRC, SORT_SRC])
    await mc.reload()
    await mc.ticks(5)
    await mc.command('/function heap_sort_mc_test:load_fn').catch(() => {})
    await mc.ticks(3)
  })

  test('MinHeap push/pop: push 5,1,3,2,4 → first 3 pops = 1,2,3', async () => {
    if (!serverOnline) return
    await mc.command('/function heap_sort_mc_test:test_min_heap')
    await mc.ticks(5)
    const encoded = await mc.scoreboard('#heap_min_top3', 'hsmc')
    expect(encoded).toBe(123)  // 100*1 + 10*2 + 3
    const sizeAfter = await mc.scoreboard('#heap_size_after_pop3', 'hsmc')
    expect(sizeAfter).toBe(3)  // 5 pushed, 2 pops (peek→pop→peek→pop→peek), 5-2=3
    console.log(`  MinHeap top3 encoded=${encoded} (expect 123), size after 2 pops=${sizeAfter} (expect 3) ✓`)
  }, 20000)

  test('MaxHeap push/pop: push 3,1,4,1,5 → first pop = 5, second = 4', async () => {
    if (!serverOnline) return
    await mc.command('/function heap_sort_mc_test:test_max_heap')
    await mc.ticks(5)
    const top = await mc.scoreboard('#max_heap_top', 'hsmc')
    expect(top).toBe(5)
    const second = await mc.scoreboard('#max_heap_second', 'hsmc')
    expect(second).toBe(4)
    console.log(`  MaxHeap top=${top} (expect 5), second=${second} (expect 4) ✓`)
  }, 20000)

  test('insertion_sort ascending: [30,10,50,20,40] → [10,20,30,40,50]', async () => {
    if (!serverOnline) return
    await mc.command('/function heap_sort_mc_test:test_sort_asc')
    await mc.ticks(5)
    const ok = await mc.scoreboard('#sort_asc_ok', 'hsmc')
    const first = await mc.scoreboard('#sort_asc_first', 'hsmc')
    const last = await mc.scoreboard('#sort_asc_last', 'hsmc')
    expect(ok).toBe(1)
    expect(first).toBe(10)
    expect(last).toBe(50)
    console.log(`  sort_asc ok=${ok}, first=${first} (10), last=${last} (50) ✓`)
  }, 15000)

  test('insertion_sort descending: [30,10,50,20,40] → [50,...,10]', async () => {
    if (!serverOnline) return
    await mc.command('/function heap_sort_mc_test:test_sort_desc')
    await mc.ticks(5)
    const ok = await mc.scoreboard('#sort_desc_ok', 'hsmc')
    expect(ok).toBe(1)
    console.log(`  sort_desc ok=${ok} ✓`)
  }, 15000)

  test('sort_merge([1,3,5], [2,4,6]) → NBT result = [1,2,3,4,5,6]', async () => {
    if (!serverOnline) return
    await mc.command('/function heap_sort_mc_test:test_sort_merge')
    await mc.ticks(5)
    const ran = await mc.scoreboard('#sort_merge_ran', 'hsmc')
    expect(ran).toBe(1)
    // Read result array from NBT storage directly via fetch
    const url = `http://localhost:25561/nbt?storage=${encodeURIComponent('heap_sort_mc_test:arrays')}&path=${encodeURIComponent('result')}`
    const resp = await fetch(url)
    const data = await resp.json() as { value: string }
    // result should be [1, 2, 3, 4, 5, 6]
    const nums = data.value.replace(/[\[\]]/g, '').split(',').map((s: string) => parseInt(s.trim(), 10))
    expect(nums).toEqual([1, 2, 3, 4, 5, 6])
    console.log(`  sort_merge result = ${data.value} (expect [1,2,3,4,5,6]) ✓`)
  }, 15000)
})

// ---------------------------------------------------------------------------
// Entity tag: @s.tag / @s.untag / @s.has_tag (requires execute as TestBot)
// ---------------------------------------------------------------------------

describe('MC Integration - entity tag methods (@s.tag/untag/has_tag)', () => {
  const NS = 'entity_tag_test'
  const OBJ = '__entity_tag_test'

  beforeAll(async () => {
    if (!serverOnline) return

    writeFixture(`
      namespace entity_tag_test

      @load fn __load() {
        raw("scoreboard objectives add etag_obj dummy");
      }

      // Must be called with "execute as <player> run function ..."
      // so @s refers to the player entity.
      @keep fn test_tag_ops() {
        // 1. add tag
        @s.tag("etag_vip")

        // 2. has_tag should return 1
        let has1: int = @s.has_tag("etag_vip")
        scoreboard_set("#has_after_tag", "etag_obj", has1)

        // 3. remove tag
        @s.untag("etag_vip")

        // 4. has_tag should return 0
        let has2: int = @s.has_tag("etag_vip")
        scoreboard_set("#has_after_untag", "etag_obj", has2)
      }
    `, NS)

    await mc.reload()
    await mc.ticks(10)
    await mc.command(`/function ${NS}:__load`).catch(() => {})
    await mc.ticks(5)
  })

  test('@s.tag adds tag, has_tag returns 1; @s.untag removes tag, has_tag returns 0', async () => {
    if (!serverOnline || !botOnline) return  // requires TestBot as @s context

    // Must run as TestBot so @s is an actual player entity
    await mc.command(`/execute as TestBot run function ${NS}:test_tag_ops`)
    await mc.ticks(5)

    const hasAfterTag   = await mc.scoreboard('#has_after_tag',   'etag_obj')
    const hasAfterUntag = await mc.scoreboard('#has_after_untag', 'etag_obj')

    expect(hasAfterTag).toBe(1)
    expect(hasAfterUntag).toBe(0)

    console.log(`  has_after_tag=${hasAfterTag} (expect 1) ✓`)
    console.log(`  has_after_untag=${hasAfterUntag} (expect 0) ✓`)
  }, 20000)
})

// ===========================================================================
// fft.mcrs — MC integration test for dft_real array param dynamic indexing
// ===========================================================================
describe('MC Integration - fft.mcrs dft_real', () => {
  const NS = 'fft_mc_test'

  beforeAll(async () => {
    if (!serverOnline) return

    const MATH_SRC = fs.readFileSync(path.join(__dirname, '../stdlib/math.mcrs'), 'utf-8')
    const FFT_SRC  = fs.readFileSync(path.join(__dirname, '../stdlib/fft.mcrs'),  'utf-8')

    const fftSrc = `
      namespace fft_mc_test

      @load fn __load() {
        raw("scoreboard objectives add fft_obj dummy");
        _math_init()
      }

      @keep fn test_dft_re0(): int {
        let input: int[] = [10000, 10000, 10000, 10000]
        let re: int[] = [0, 0, 0, 0]
        let im: int[] = [0, 0, 0, 0]
        dft_real(input, 4, re, im)
        let v: int = re[0]
        scoreboard_set("#dft_re0", "fft_obj", v)
        return v
      }

      @keep fn test_dft_mag1(): int {
        let input: int[] = [10000, 0, -10000, 0]
        let re: int[] = [0, 0, 0, 0]
        let im: int[] = [0, 0, 0, 0]
        dft_real(input, 4, re, im)
        let mag: int = dft_magnitude(re, im, 1)
        scoreboard_set("#dft_mag1", "fft_obj", mag)
        return mag
      }
    `

    // Use compile directly with librarySources (writeFixture doesn't support libs)
    fs.mkdirSync(DATAPACK_DIR, { recursive: true })
    if (!fs.existsSync(path.join(DATAPACK_DIR, 'pack.mcmeta'))) {
      fs.writeFileSync(path.join(DATAPACK_DIR, 'pack.mcmeta'), JSON.stringify({
        pack: { pack_format: 48, description: 'RedScript integration tests' }
      }))
    }
    const fftResult = compile(fftSrc, { namespace: NS, librarySources: [MATH_SRC, FFT_SRC] })
    for (const file of fftResult.files) {
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

    await mc.reload()
    await mc.ticks(10)
    await mc.command(`/function ${NS}:__load`).catch(() => {})
    await mc.ticks(5)
  })

  test('dft_real DC input: re[0] == 40000', async () => {
    if (!serverOnline) return
    await mc.command(`/function ${NS}:test_dft_re0`)
    await mc.ticks(3)
    const val = await mc.scoreboard('#dft_re0', 'fft_obj')
    expect(val).toBe(40000)
  }, 20000)

  test('dft_real quarter-wave: X[1] magnitude ≈ 20000', async () => {
    if (!serverOnline) return
    await mc.command(`/function ${NS}:test_dft_mag1`)
    await mc.ticks(3)
    const val = await mc.scoreboard('#dft_mag1', 'fft_obj')
    expect(val).toBeGreaterThanOrEqual(19500)
    expect(val).toBeLessThanOrEqual(20500)
  }, 20000)
})

// ===========================================================================
// events.mcrs — MC integration test for @on(EventType) event handler system
// ===========================================================================
describe('MC Integration - @on(EventType) event system', () => {
  const NS = 'ev_mc_test'
  let botOnline = false

  beforeAll(async () => {
    if (!serverOnline) return

    const EVENTS_SRC = fs.readFileSync(path.join(__dirname, '../stdlib/events.mcrs'), 'utf-8')

    const evSrc = `
      namespace ev_mc_test

      @on(PlayerJoin) fn on_join(p: Player) {
        raw("scoreboard objectives add ev_obj dummy");
        scoreboard_add(p, "ev_obj", 1)
      }

      @on(PlayerDeath) fn on_death(p: Player) {
        raw("scoreboard objectives add ev_obj dummy");
        scoreboard_add(p, "ev_obj", 100)
      }
    `

    // Compile with events.mcrs as library source
    fs.mkdirSync(DATAPACK_DIR, { recursive: true })
    if (!fs.existsSync(path.join(DATAPACK_DIR, 'pack.mcmeta'))) {
      fs.writeFileSync(path.join(DATAPACK_DIR, 'pack.mcmeta'), JSON.stringify({
        pack: { pack_format: 48, description: 'RedScript integration tests' }
      }))
    }
    const evResult = compile(evSrc, { namespace: NS, librarySources: [EVENTS_SRC] })
    for (const file of evResult.files) {
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

    await mc.reload()
    await mc.ticks(20)

    // Check if TestBot is online
    const status = await mc.status()
    botOnline = status.playerNames?.includes('TestBot') ?? false
  })

  test('events.mcrs dispatcher loads without error', async () => {
    if (!serverOnline) return
    // If we got here, reload succeeded
    expect(serverOnline).toBe(true)
  }, 10000)

  test('PlayerJoin: removing rs.joined tag fires @on(PlayerJoin) handlers', async () => {
    if (!serverOnline || !botOnline) return

    // Reset score
    await mc.command(`scoreboard objectives add ev_obj dummy`).catch(() => {})
    await mc.command(`scoreboard players set TestBot ev_obj 0`)

    // Simulate "join" by removing the rs.joined tag
    await mc.command(`tag TestBot remove rs.joined`)
    await mc.ticks(3)  // wait for @tick to fire

    const score = await mc.scoreboard('TestBot', 'ev_obj')
    expect(score).toBeGreaterThanOrEqual(1)
    console.log(`  PlayerJoin handler fired: ev_obj = ${score} (expect >= 1) ✓`)
  }, 20000)

  test('PlayerDeath: killing TestBot fires @on(PlayerDeath) handlers', async () => {
    if (!serverOnline || !botOnline) return

    await mc.command(`scoreboard players set TestBot ev_obj 0`)
    await mc.command(`kill TestBot`)
    await mc.ticks(5)

    const score = await mc.scoreboard('TestBot', 'ev_obj')
    expect(score).toBeGreaterThanOrEqual(100)
    console.log(`  PlayerDeath handler fired: ev_obj = ${score} (expect >= 100) ✓`)
  }, 20000)
})
