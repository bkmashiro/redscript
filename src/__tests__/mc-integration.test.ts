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

  // ── Full reset + safe data reload ────────────────────────────────────
  await mc.fullReset()

  // Pre-create scoreboards
  for (const obj of ['ticks', 'seconds', 'test_score', 'result', 'calc', 'rs']) {
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
