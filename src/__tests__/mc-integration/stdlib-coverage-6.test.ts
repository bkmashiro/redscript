/**
 * RedScript MC Integration Tests — stdlib coverage 6
 *
 * Completes real-MC coverage for interactions / inventory / world /
 * particles / spawn stdlib modules against a Paper 1.21.4 server with
 * TestHarnessPlugin. Player-dependent cases use TestBot when available.
 *
 * Run: MC_SERVER_DIR=~/mc-test-server npx jest stdlib-coverage-6 --testTimeout=120000
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../compile'
import { MCTestClient } from '../../mc-test/client'

const MC_HOST = process.env.MC_HOST ?? 'localhost'
const MC_PORT = parseInt(process.env.MC_PORT ?? '25561')
const MC_SERVER_DIR = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')
const DATAPACK_DIR = path.join(MC_SERVER_DIR, 'world', 'datapacks', 'redscript-test6')
const STDLIB_DIR = path.join(__dirname, '../../stdlib')

const BOT_URL = 'http://localhost:25562'
const BOT_NAME = 'TestBot'

let serverOnline = false
let botOnline = false
let mc: MCTestClient

function writeFixture(source: string, namespace: string, librarySources: string[] = []): void {
  fs.mkdirSync(DATAPACK_DIR, { recursive: true })
  if (!fs.existsSync(path.join(DATAPACK_DIR, 'pack.mcmeta'))) {
    fs.writeFileSync(
      path.join(DATAPACK_DIR, 'pack.mcmeta'),
      JSON.stringify({ pack: { pack_format: 48, description: 'RedScript integration tests 6' } })
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
  if (!serverOnline || !botOnline) return
  await mc.command(`clear ${BOT_NAME}`)
  await botPost('/wait', { ticks: 5 })
}

async function getSingleEntity(selector: string) {
  const entities = await mc.entities(selector)
  expect(entities.length).toBe(1)
  return entities[0]
}

beforeAll(async () => {
  if (process.env.MC_OFFLINE === 'true') {
    console.warn('⚠ MC_OFFLINE=true — skipping stdlib coverage 6 integration tests')
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
    console.warn(`⚠ MC server not running at ${MC_HOST}:${MC_PORT} — skipping stdlib coverage 6 tests`)
    return
  }

  try {
    const status: any = await botGet('/status')
    botOnline = status.connected === true
  } catch {
    botOnline = false
  }

  if (!botOnline) {
    console.warn('⚠ TestBot not running — player-dependent coverage 6 tests will be skipped')
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

  await mc.command('/scoreboard objectives add sc6_result dummy').catch(() => {})
  await mc.command('/scoreboard objectives add rs.last_sneak dummy').catch(() => {})
  await mc.command('/scoreboard objectives add rs.tick dummy').catch(() => {})

  const MATH_SRC = readStdlib('math.mcrs')
  const INTERACTIONS_SRC = readStdlib('interactions.mcrs')
  const INVENTORY_SRC = readStdlib('inventory.mcrs')
  const WORLD_SRC = readStdlib('world.mcrs')
  const PARTICLES_SRC = readStdlib('particles.mcrs')
  const SPAWN_SRC = readStdlib('spawn.mcrs')

  writeFixture(`
    namespace stdlib_interactions6_test

    fn test_interactions_init() {
      interactions_init();
      scoreboard_set("#inter_init_done", #sc6_result, 1);
    }

    fn test_example_right_click() {
      raw("scoreboard players set ${BOT_NAME} rs.click 1");
      example_right_click();
      scoreboard_set("#inter_example_click", #sc6_result, 1);
    }

    fn test_is_sneaking() {
      raw("scoreboard players set ${BOT_NAME} rs.sneak 5");
      let r: int = is_sneaking(@a[name=${BOT_NAME}]);
      scoreboard_set("#inter_is_sneaking", #sc6_result, r);
    }

    fn test_on_sneak_start() {
      raw("scoreboard players set ${BOT_NAME} rs.sneak 1");
      on_sneak_start();
      scoreboard_set("#inter_sneak_start_done", #sc6_result, 1);
    }

    fn test_check_look_up() {
      check_look_up();
      scoreboard_set("#inter_look_up_done", #sc6_result, 1);
    }

    fn test_check_look_down() {
      check_look_down();
      scoreboard_set("#inter_look_down_done", #sc6_result, 1);
    }

    fn test_check_look_straight() {
      check_look_straight();
      scoreboard_set("#inter_look_straight_done", #sc6_result, 1);
    }

    fn test_check_holding_item() {
      check_holding_item("diamond_sword");
      scoreboard_set("#inter_holding_done", #sc6_result, 1);
    }

    fn test_on_right_click() {
      raw("scoreboard players set ${BOT_NAME} rs.click 2");
      on_right_click("ignored");
      scoreboard_set("#inter_right_click_done", #sc6_result, 1);
    }

    fn test_on_sneak_click_combo() {
      raw("scoreboard players set ${BOT_NAME} rs.click 1");
      raw("scoreboard players set ${BOT_NAME} rs.sneak 3");
      on_sneak_click();
      scoreboard_set("#inter_sneak_click_done", #sc6_result, 1);
    }

    fn test_on_sneak_click_normal() {
      raw("scoreboard players set ${BOT_NAME} rs.click 1");
      raw("scoreboard players set ${BOT_NAME} rs.sneak 0");
      on_sneak_click();
      scoreboard_set("#inter_click_only_done", #sc6_result, 1);
    }

    fn test_on_double_sneak() {
      raw("scoreboard players set ${BOT_NAME} rs.sneak 1");
      raw("scoreboard players set ${BOT_NAME} rs.last_sneak 100");
      raw("scoreboard players set ${BOT_NAME} rs.tick 105");
      on_double_sneak();
      scoreboard_set("#inter_double_sneak_done", #sc6_result, 1);
    }
  `, 'stdlib_interactions6_test', [INTERACTIONS_SRC])

  writeFixture(`
    namespace stdlib_inventory6_test

    fn test_clear_inventory() {
      clear_inventory(@a[name=${BOT_NAME}]);
      scoreboard_set("#inventory_clear_done", #sc6_result, 1);
    }

    fn test_give_kit_warrior() {
      give_kit_warrior(@a[name=${BOT_NAME}]);
      scoreboard_set("#inventory_warrior_done", #sc6_result, 1);
    }

    fn test_give_kit_archer() {
      give_kit_archer(@a[name=${BOT_NAME}]);
      scoreboard_set("#inventory_archer_done", #sc6_result, 1);
    }

    fn test_give_kit_mage() {
      give_kit_mage(@a[name=${BOT_NAME}]);
      scoreboard_set("#inventory_mage_done", #sc6_result, 1);
    }

    fn test_remove_item() {
      remove_item(@a[name=${BOT_NAME}], "minecraft:arrow");
      scoreboard_set("#inventory_remove_done", #sc6_result, 1);
    }
  `, 'stdlib_inventory6_test', [INVENTORY_SRC])

  writeFixture(`
    namespace stdlib_world6_test

    fn test_set_noon() {
      set_noon();
      raw("execute store result score #world_time_noon sc6_result run time query daytime");
    }

    fn test_set_midnight() {
      set_midnight();
      raw("execute store result score #world_time_midnight sc6_result run time query daytime");
    }

    fn test_weather_rain() {
      weather_rain();
      scoreboard_set("#weather_rain_done", #sc6_result, 1);
    }

    fn test_weather_thunder() {
      weather_thunder();
      scoreboard_set("#weather_thunder_done", #sc6_result, 1);
    }

    fn test_disable_mob_griefing() {
      disable_mob_griefing();
      scoreboard_set("#mob_griefing_done", #sc6_result, 1);
    }

    fn test_disable_fire_spread() {
      disable_fire_spread();
      scoreboard_set("#fire_tick_done", #sc6_result, 1);
    }

    fn test_barrier_wall() {
      barrier_wall(0, 70, 0, 1, 71, 1);
      scoreboard_set("#barrier_done", #sc6_result, 1);
    }

    fn test_clear_area() {
      clear_area(0, 70, 0, 1, 71, 1);
      scoreboard_set("#clear_area_done", #sc6_result, 1);
    }

    fn test_glass_box() {
      glass_box(0, 70, 0, 2, 72, 2);
      scoreboard_set("#glass_box_done", #sc6_result, 1);
    }

    fn test_sun_altitude_midnight() {
      let alt: int = sun_altitude(18000);
      scoreboard_set("#sun_alt_midnight", #sc6_result, alt);
    }
  `, 'stdlib_world6_test', [WORLD_SRC, MATH_SRC])

  writeFixture(`
    namespace stdlib_particles6_test

    fn test_smoke() {
      smoke(0, 70, 0);
      scoreboard_set("#particles_smoke_done", #sc6_result, 1);
    }

    fn test_angry_happy() {
      angry_at(0, 70, 0);
      happy_at(1, 70, 0);
      scoreboard_set("#particles_angry_happy_done", #sc6_result, 1);
    }

    fn test_totem_end() {
      totem_at(0, 70, 0);
      end_sparkles_at(1, 70, 0);
      scoreboard_set("#particles_totem_end_done", #sc6_result, 1);
    }

    fn test_particle_at_fx() {
      particle_at_fx(125, 7050, -75, "minecraft:flame");
      scoreboard_set("#particles_fx_done", #sc6_result, 1);
    }

    fn test_draw_line_2d() {
      draw_line_2d(0, 7000, 200, 7200, 4, 0, "minecraft:flame");
      scoreboard_set("#particles_line_done", #sc6_result, 1);
    }

    fn test_draw_circle() {
      draw_circle(0, 70, 0, 200, 8, "minecraft:heart");
      scoreboard_set("#particles_circle_done", #sc6_result, 1);
    }

    fn test_draw_helix() {
      draw_helix(0, 70, 0, 2, 4, 2, 8, "minecraft:portal");
      scoreboard_set("#particles_helix_done", #sc6_result, 1);
    }

    fn test_particle_dot() {
      particle_dot(0, 70, 0, "minecraft:happy_villager");
      scoreboard_set("#particles_dot_done", #sc6_result, 1);
    }
  `, 'stdlib_particles6_test', [PARTICLES_SRC, MATH_SRC])

  writeFixture(`
    namespace stdlib_spawn6_test

    fn test_teleport_to_entity() {
      teleport_to_entity(@e[tag=sc6_spawn_src,limit=1], @e[tag=sc6_spawn_dst,limit=1]);
      scoreboard_set("#spawn_tp_entity_done", #sc6_result, 1);
    }

    fn test_spread_players() {
      spread_players(0, 0, 10);
      scoreboard_set("#spawn_spread_done", #sc6_result, 1);
    }

    fn test_launch_up() {
      launch_up(@e[tag=sc6_launch_target,limit=1], 5);
      scoreboard_set("#spawn_launch_done", #sc6_result, 1);
    }
  `, 'stdlib_spawn6_test', [SPAWN_SRC])

  await mc.reload()
  await mc.ticks(20)
  console.log('  stdlib-coverage-6 setup complete.')
}, 60_000)

describe('stdlib coverage 6 — interactions', () => {
  test('interactions_init creates scoreboard objectives', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set #inter_init_done sc6_result 0')
    await mc.command('/function stdlib_interactions6_test:test_interactions_init')
    await mc.ticks(3)

    const ran = await mc.scoreboard('#inter_init_done', 'sc6_result')
    await mc.command('/scoreboard players set #probe_click rs.click 7')
    await mc.command('/scoreboard players set #probe_sneak rs.sneak 8')
    await mc.command('/scoreboard players set #probe_attack rs.attack 9')

    expect(ran).toBe(1)
    expect(await mc.scoreboard('#probe_click', 'rs.click')).toBe(7)
    expect(await mc.scoreboard('#probe_sneak', 'rs.sneak')).toBe(8)
    expect(await mc.scoreboard('#probe_attack', 'rs.attack')).toBe(9)
  }, 30_000)

  test('example_right_click consumes click and emits chat', async () => {
    if (!serverOnline || !botOnline) { console.warn('  SKIP: server or TestBot offline'); return }

    await mc.reset()
    await mc.command(`/scoreboard players set ${BOT_NAME} rs.click 0`)
    await mc.command('/function stdlib_interactions6_test:test_example_right_click')
    await mc.ticks(3)

    const remaining = await mc.scoreboard(BOT_NAME, 'rs.click')
    const chat = await mc.chatLast(10)
    expect(remaining).toBe(0)
    expect(chat.some(msg => msg.message.includes('Player right clicked!'))).toBe(true)
  }, 30_000)

  test('is_sneaking returns 1 when rs.sneak > 0', async () => {
    if (!serverOnline || !botOnline) { console.warn('  SKIP: server or TestBot offline'); return }

    await mc.command('/scoreboard players set #inter_is_sneaking sc6_result 0')
    await mc.command('/function stdlib_interactions6_test:test_is_sneaking')
    await mc.ticks(3)

    const result = await mc.scoreboard('#inter_is_sneaking', 'sc6_result')
    expect(result).toBe(1)
  }, 30_000)

  test('on_sneak_start tags only fresh sneakers', async () => {
    if (!serverOnline || !botOnline) { console.warn('  SKIP: server or TestBot offline'); return }

    await mc.command(`tag ${BOT_NAME} remove rs.sneak_start`).catch(() => {})
    await mc.command('/function stdlib_interactions6_test:test_on_sneak_start')
    await mc.ticks(3)

    const bot = await getSingleEntity(`@a[name=${BOT_NAME}]`)
    expect(bot.tags).toContain('rs.sneak_start')
  }, 30_000)

  test('check_look_up/down/straight set tags from player pitch', async () => {
    if (!serverOnline || !botOnline) { console.warn('  SKIP: server or TestBot offline'); return }

    await mc.command(`tag ${BOT_NAME} remove rs.look_up`).catch(() => {})
    await mc.command(`tag ${BOT_NAME} remove rs.look_down`).catch(() => {})
    await mc.command(`tag ${BOT_NAME} remove rs.look_straight`).catch(() => {})

    await mc.command(`tp ${BOT_NAME} 0 64 0 0 -60`)
    await mc.command('/function stdlib_interactions6_test:test_check_look_up')
    await mc.ticks(2)
    let bot = await getSingleEntity(`@a[name=${BOT_NAME}]`)
    expect(bot.tags).toContain('rs.look_up')

    await mc.command(`tp ${BOT_NAME} 0 64 0 0 60`)
    await mc.command('/function stdlib_interactions6_test:test_check_look_down')
    await mc.ticks(2)
    bot = await getSingleEntity(`@a[name=${BOT_NAME}]`)
    expect(bot.tags).toContain('rs.look_down')

    await mc.command(`tp ${BOT_NAME} 0 64 0 0 0`)
    await mc.command('/function stdlib_interactions6_test:test_check_look_straight')
    await mc.ticks(2)
    bot = await getSingleEntity(`@a[name=${BOT_NAME}]`)
    expect(bot.tags).toContain('rs.look_straight')
  }, 30_000)

  test('check_holding_item advertises manual execute-if-data path', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.reset()
    await mc.command('/function stdlib_interactions6_test:test_check_holding_item')
    await mc.ticks(2)

    const chat = await mc.chatLast(10)
    expect(chat.some(msg => msg.message.includes('Use execute if data for item checks'))).toBe(true)
  }, 30_000)

  test('on_right_click resets rs.click and tags player', async () => {
    if (!serverOnline || !botOnline) { console.warn('  SKIP: server or TestBot offline'); return }

    await mc.command(`tag ${BOT_NAME} remove rs.clicked`).catch(() => {})
    await mc.command(`/scoreboard players set ${BOT_NAME} rs.click 0`)
    await mc.command('/function stdlib_interactions6_test:test_on_right_click')
    await mc.ticks(3)

    const bot = await getSingleEntity(`@a[name=${BOT_NAME}]`)
    const remaining = await mc.scoreboard(BOT_NAME, 'rs.click')
    expect(bot.tags).toContain('rs.clicked')
    expect(remaining).toBe(0)
  }, 30_000)

  test('on_sneak_click tags combo users and normal clickers separately', async () => {
    if (!serverOnline || !botOnline) { console.warn('  SKIP: server or TestBot offline'); return }

    await mc.command(`tag ${BOT_NAME} remove rs.sneak_click`).catch(() => {})
    await mc.command(`tag ${BOT_NAME} remove rs.clicked`).catch(() => {})
    await mc.command('/function stdlib_interactions6_test:test_on_sneak_click_combo')
    await mc.ticks(3)

    let bot = await getSingleEntity(`@a[name=${BOT_NAME}]`)
    expect(bot.tags).toContain('rs.sneak_click')

    await mc.command(`tag ${BOT_NAME} remove rs.sneak_click`).catch(() => {})
    await mc.command(`tag ${BOT_NAME} remove rs.clicked`).catch(() => {})
    await mc.command('/function stdlib_interactions6_test:test_on_sneak_click_normal')
    await mc.ticks(3)

    bot = await getSingleEntity(`@a[name=${BOT_NAME}]`)
    expect(bot.tags).toContain('rs.clicked')
    expect(bot.tags).not.toContain('rs.sneak_click')
  }, 30_000)

  test('on_double_sneak tags player when within the double-tap window', async () => {
    if (!serverOnline || !botOnline) { console.warn('  SKIP: server or TestBot offline'); return }

    await mc.command(`tag ${BOT_NAME} remove rs.double_sneak`).catch(() => {})
    await mc.command('/function stdlib_interactions6_test:test_on_double_sneak')
    await mc.ticks(3)

    const bot = await getSingleEntity(`@a[name=${BOT_NAME}]`)
    expect(bot.tags).toContain('rs.double_sneak')
  }, 30_000)
})

describe('stdlib coverage 6 — inventory', () => {
  beforeEach(async () => {
    if (!serverOnline || !botOnline) return
    await clearBotInventory()
  })

  test('clear_inventory removes items from TestBot', async () => {
    if (!serverOnline || !botOnline) { console.warn('  SKIP: server or TestBot offline'); return }

    await mc.command(`give ${BOT_NAME} minecraft:diamond 4`)
    await botPost('/wait', { ticks: 10 })
    expect(await botItemCount('diamond')).toBe(4)

    await mc.command('/function stdlib_inventory6_test:test_clear_inventory')
    await botPost('/wait', { ticks: 10 })

    expect(await botItemCount('diamond')).toBe(0)
  }, 30_000)

  test('give_kit_warrior gives sword, armor, shield, and food', async () => {
    if (!serverOnline || !botOnline) { console.warn('  SKIP: server or TestBot offline'); return }

    await mc.command('/function stdlib_inventory6_test:test_give_kit_warrior')
    await botPost('/wait', { ticks: 10 })

    expect(await botItemCount('iron_sword')).toBe(1)
    expect(await botItemCount('iron_chestplate')).toBe(1)
    expect(await botItemCount('iron_leggings')).toBe(1)
    expect(await botItemCount('iron_boots')).toBe(1)
    expect(await botItemCount('shield')).toBe(1)
    expect(await botItemCount('cooked_beef')).toBe(16)
  }, 30_000)

  test('give_kit_archer gives bow, arrows, armor, and food', async () => {
    if (!serverOnline || !botOnline) { console.warn('  SKIP: server or TestBot offline'); return }

    await mc.command('/function stdlib_inventory6_test:test_give_kit_archer')
    await botPost('/wait', { ticks: 10 })

    expect(await botItemCount('bow')).toBe(1)
    expect(await botItemCount('arrow')).toBe(64)
    expect(await botItemCount('leather_chestplate')).toBe(1)
    expect(await botItemCount('leather_leggings')).toBe(1)
    expect(await botItemCount('leather_boots')).toBe(1)
    expect(await botItemCount('cooked_beef')).toBe(16)
  }, 30_000)

  test('give_kit_mage gives sword, pearls, apples, potion, and food', async () => {
    if (!serverOnline || !botOnline) { console.warn('  SKIP: server or TestBot offline'); return }

    await mc.command('/function stdlib_inventory6_test:test_give_kit_mage')
    await botPost('/wait', { ticks: 10 })

    expect(await botItemCount('wooden_sword')).toBe(1)
    expect(await botItemCount('golden_apple')).toBe(8)
    expect(await botItemCount('ender_pearl')).toBe(16)
    expect(await botItemCount('splash_potion')).toBe(8)
    expect(await botItemCount('cooked_beef')).toBe(16)
  }, 30_000)

  test('remove_item clears a specific item while leaving others', async () => {
    if (!serverOnline || !botOnline) { console.warn('  SKIP: server or TestBot offline'); return }

    await mc.command('/function stdlib_inventory6_test:test_give_kit_archer')
    await botPost('/wait', { ticks: 10 })
    expect(await botItemCount('arrow')).toBe(64)
    expect(await botItemCount('bow')).toBe(1)

    await mc.command('/function stdlib_inventory6_test:test_remove_item')
    await botPost('/wait', { ticks: 10 })

    expect(await botItemCount('arrow')).toBe(0)
    expect(await botItemCount('bow')).toBe(1)
  }, 30_000)
})

describe('stdlib coverage 6 — world', () => {
  beforeEach(async () => {
    if (!serverOnline) return
    await mc.command('/fill -2 69 -2 4 74 4 minecraft:air').catch(() => {})
  })

  test('set_noon sets daytime to 6000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set #world_time_noon sc6_result 0')
    await mc.command('/function stdlib_world6_test:test_set_noon')
    await mc.ticks(3)

    const time = await mc.scoreboard('#world_time_noon', 'sc6_result')
    expect(time).toBe(6000)
  }, 30_000)

  test('set_midnight sets daytime to 18000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set #world_time_midnight sc6_result 0')
    await mc.command('/function stdlib_world6_test:test_set_midnight')
    await mc.ticks(3)

    const time = await mc.scoreboard('#world_time_midnight', 'sc6_result')
    expect(time).toBe(18000)
  }, 30_000)

  test('weather_rain, weather_thunder, and gamerule toggles execute cleanly', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    for (const player of ['#weather_rain_done', '#weather_thunder_done', '#mob_griefing_done', '#fire_tick_done']) {
      await mc.command(`/scoreboard players set ${player} sc6_result 0`)
    }

    await mc.command('/function stdlib_world6_test:test_weather_rain')
    await mc.command('/function stdlib_world6_test:test_weather_thunder')
    await mc.command('/function stdlib_world6_test:test_disable_mob_griefing')
    await mc.command('/function stdlib_world6_test:test_disable_fire_spread')
    await mc.ticks(3)

    expect(await mc.scoreboard('#weather_rain_done', 'sc6_result')).toBe(1)
    expect(await mc.scoreboard('#weather_thunder_done', 'sc6_result')).toBe(1)
    expect(await mc.scoreboard('#mob_griefing_done', 'sc6_result')).toBe(1)
    expect(await mc.scoreboard('#fire_tick_done', 'sc6_result')).toBe(1)
  }, 30_000)

  test('barrier_wall fills the requested cuboid with barriers', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/function stdlib_world6_test:test_barrier_wall')
    await mc.ticks(3)

    expect((await mc.block(0, 70, 0)).type).toBe('minecraft:barrier')
    expect((await mc.block(1, 71, 1)).type).toBe('minecraft:barrier')
  }, 30_000)

  test('clear_area replaces blocks with air', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/fill 0 70 0 1 71 1 minecraft:stone')
    await mc.command('/function stdlib_world6_test:test_clear_area')
    await mc.ticks(3)

    expect((await mc.block(0, 70, 0)).type).toBe('minecraft:air')
    expect((await mc.block(1, 71, 1)).type).toBe('minecraft:air')
  }, 30_000)

  test('glass_box leaves a hollow air interior', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/function stdlib_world6_test:test_glass_box')
    await mc.ticks(3)

    expect((await mc.block(0, 70, 0)).type).toBe('minecraft:glass')
    expect((await mc.block(2, 72, 2)).type).toBe('minecraft:glass')
    expect((await mc.block(1, 71, 1)).type).toBe('minecraft:air')
  }, 30_000)

  test('sun_altitude at midnight is -900000', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/scoreboard players set #sun_alt_midnight sc6_result 0')
    await mc.command('/function stdlib_world6_test:test_sun_altitude_midnight')
    await mc.ticks(3)

    const result = await mc.scoreboard('#sun_alt_midnight', 'sc6_result')
    expect(result).toBe(-900000)
  }, 30_000)
})

describe('stdlib coverage 6 — particles', () => {
  const particleCases = [
    ['smoke', '#particles_smoke_done', '/function stdlib_particles6_test:test_smoke'],
    ['angry_happy', '#particles_angry_happy_done', '/function stdlib_particles6_test:test_angry_happy'],
    ['totem_end', '#particles_totem_end_done', '/function stdlib_particles6_test:test_totem_end'],
    ['particle_at_fx', '#particles_fx_done', '/function stdlib_particles6_test:test_particle_at_fx'],
    ['draw_line_2d', '#particles_line_done', '/function stdlib_particles6_test:test_draw_line_2d'],
    ['draw_circle', '#particles_circle_done', '/function stdlib_particles6_test:test_draw_circle'],
    ['draw_helix', '#particles_helix_done', '/function stdlib_particles6_test:test_draw_helix'],
    ['particle_dot', '#particles_dot_done', '/function stdlib_particles6_test:test_particle_dot'],
  ] as const

  test.each(particleCases)('%s executes without runtime errors on a live server', async (_label, player, command) => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command(`/scoreboard players set ${player} sc6_result 0`)
    await mc.command(command)
    await mc.ticks(3)

    expect(await mc.scoreboard(player, 'sc6_result')).toBe(1)
  }, 30_000)
})

describe('stdlib coverage 6 — spawn', () => {
  beforeEach(async () => {
    if (!serverOnline) return
    await mc.command('/kill @e[tag=sc6_spawn_src]').catch(() => {})
    await mc.command('/kill @e[tag=sc6_spawn_dst]').catch(() => {})
    await mc.command('/kill @e[tag=sc6_launch_target]').catch(() => {})
  })

  test('teleport_to_entity moves the source entity onto the destination', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/summon minecraft:armor_stand 1 64 1 {NoGravity:1b,Tags:["sc6_spawn_src"]}')
    await mc.command('/summon minecraft:armor_stand 7 70 9 {NoGravity:1b,Tags:["sc6_spawn_dst"]}')
    await mc.command('/scoreboard players set #spawn_tp_entity_done sc6_result 0')
    await mc.command('/function stdlib_spawn6_test:test_teleport_to_entity')
    await mc.ticks(3)

    const src = await getSingleEntity('@e[tag=sc6_spawn_src]')
    expect(await mc.scoreboard('#spawn_tp_entity_done', 'sc6_result')).toBe(1)
    expect(Math.round(src.x)).toBe(7)
    expect(Math.round(src.y)).toBe(70)
    expect(Math.round(src.z)).toBe(9)
  }, 30_000)

  test('spread_players emits its placeholder chat message', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.reset()
    await mc.command('/scoreboard players set #spawn_spread_done sc6_result 0')
    await mc.command('/function stdlib_spawn6_test:test_spread_players')
    await mc.ticks(3)

    const chat = await mc.chatLast(10)
    expect(await mc.scoreboard('#spawn_spread_done', 'sc6_result')).toBe(1)
    expect(chat.some(msg => msg.message.includes('Spreading players...'))).toBe(true)
  }, 30_000)

  test('launch_up moves the target upward by the requested relative height', async () => {
    if (!serverOnline) { console.warn('  SKIP: server offline'); return }

    await mc.command('/summon minecraft:armor_stand 3 64 3 {NoGravity:1b,Tags:["sc6_launch_target"]}')
    await mc.command('/scoreboard players set #spawn_launch_done sc6_result 0')
    await mc.command('/function stdlib_spawn6_test:test_launch_up')
    await mc.ticks(3)

    const target = await getSingleEntity('@e[tag=sc6_launch_target]')
    expect(await mc.scoreboard('#spawn_launch_done', 'sc6_result')).toBe(1)
    expect(Math.round(target.y)).toBe(69)
  }, 30_000)
})
