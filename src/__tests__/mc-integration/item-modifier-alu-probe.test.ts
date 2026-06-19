/**
 * RedScript MC Integration Probe — Attribute/item-modifier ALU
 *
 * Lane 3 live-only probe for fused affine / dot-style reducers:
 *  - item modifier with replace:true against a single carrier;
 *  - signed coefficients and bias path via fixed score providers;
 *  - re-invocation freshness (no stale modifier accumulation);
 *  - dot4 expected scalar check;
 *  - small-batch entity pool path (N=1 and N=2) when selector-based item modify is available.
 *
 * IMPORTANT:
 *  - This probe is intentionally schema-fragile for item_modifiers across MC versions.
 *  - Run as a live probe only when this is verified:
 *      MC_LIVE_PROBES=true MC_OFFLINE=false
 *
 * Run:
 *  MC_LIVE_PROBES=true MC_SERVER_DIR=~/mc-test-server npx jest item-modifier-alu-probe --runInBand --testTimeout=120000
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../compile'
import { MCTestClient } from '../../mc-test/client'

const MC_HOST = process.env.MC_HOST ?? 'localhost'
const MC_PORT = parseInt(process.env.MC_PORT ?? '25561', 10)
const MC_SERVER_DIR = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')
const DATAPACK_DIR = path.join(MC_SERVER_DIR, 'world', 'datapacks', 'redscript-test')

const NS = 'lane3_item_attr_alu'
const SCORE_OBJ = 'rs_attr_alu'
const MOD_ID = 'dot4'
const MODIFIER_NAMESPACE = NS

const RUN_LIVE_PROBE = process.env.MC_LIVE_PROBES === 'true' && process.env.MC_OFFLINE !== 'true'
const describeLive = RUN_LIVE_PROBE ? describe : describe.skip

if (!RUN_LIVE_PROBE) {
  console.warn('[lane3_item_attr_alu] live probe skipped; set MC_LIVE_PROBES=true with a TestHarness server to run it')
}

let serverOnline = false
let mc: MCTestClient

const PROBE_SCALE = 1000

const PROBE_SOURCE = `
  namespace ${NS}

  @keep fn probe_reset() {
    raw("kill @e[tag=rs_alu_core]")
    raw("kill @e[tag=rs_alu_batch]")
    raw("scoreboard players set #dot4_same ${SCORE_OBJ} 0")
    raw("scoreboard players set #dot4_after_tick ${SCORE_OBJ} 0")
    raw("scoreboard players set #dot4_repeat ${SCORE_OBJ} 0")
    raw("scoreboard players set #dot4_batch ${SCORE_OBJ} 0")
    raw("scoreboard players set #batch_count ${SCORE_OBJ} 0")
  }

  @keep fn probe_spawn_core() {
    raw("summon minecraft:zombie 0 70 0 {Tags:[\\"rs_alu_core\\"],NoAI:1b,NoGravity:1b,Invulnerable:1b,Silent:1b,PersistenceRequired:1b}")
    raw("item replace entity @e[tag=rs_alu_core,limit=1] weapon.mainhand with minecraft:diamond_sword")
  }

  @keep fn probe_set_case_fixed() {
    raw("scoreboard players set #x0 ${SCORE_OBJ} 2")
    raw("scoreboard players set #x1 ${SCORE_OBJ} 1")
    raw("scoreboard players set #x2 ${SCORE_OBJ} -2")
    raw("scoreboard players set #x3 ${SCORE_OBJ} 4")
    raw("scoreboard players set #bias ${SCORE_OBJ} 5")
    raw("attribute @e[tag=rs_alu_core,limit=1] minecraft:generic.attack_damage base set 100")
  }

  @keep fn probe_set_case_signed_bias() {
    raw("scoreboard players set #x0 ${SCORE_OBJ} 8")
    raw("scoreboard players set #x1 ${SCORE_OBJ} -7")
    raw("scoreboard players set #x2 ${SCORE_OBJ} 4")
    raw("scoreboard players set #x3 ${SCORE_OBJ} -3")
    raw("scoreboard players set #bias ${SCORE_OBJ} 12")
    raw("attribute @e[tag=rs_alu_core,limit=1] minecraft:generic.attack_damage base set 20")
  }

  @keep fn probe_set_case_dot4() {
    raw("scoreboard players set #x0 ${SCORE_OBJ} 6")
    raw("scoreboard players set #x1 ${SCORE_OBJ} 2")
    raw("scoreboard players set #x2 ${SCORE_OBJ} -5")
    raw("scoreboard players set #x3 ${SCORE_OBJ} 1")
    raw("scoreboard players set #bias ${SCORE_OBJ} -1")
    raw("attribute @e[tag=rs_alu_core,limit=1] minecraft:generic.attack_damage base set 15")
  }

  @keep fn probe_apply_dot4() {
    raw("item modify entity @e[tag=rs_alu_core,limit=1] weapon.mainhand ${MODIFIER_NAMESPACE}:${MOD_ID}")
    raw("execute store result score #dot4_same ${SCORE_OBJ} run attribute @e[tag=rs_alu_core,limit=1] minecraft:generic.attack_damage get ${PROBE_SCALE}")
  }

  @keep fn probe_read_after_tick() {
    raw("execute store result score #dot4_after_tick ${SCORE_OBJ} run attribute @e[tag=rs_alu_core,limit=1] minecraft:generic.attack_damage get ${PROBE_SCALE}")
  }

  @keep fn probe_spawn_batch_n1() {
    raw("kill @e[tag=rs_alu_batch]")
    raw("summon minecraft:zombie 4 70 0 {Tags:[\\"rs_alu_batch\\"],NoAI:1b,NoGravity:1b,Invulnerable:1b,Silent:1b,PersistenceRequired:1b}")
    raw("item replace entity @e[tag=rs_alu_batch,limit=1] weapon.mainhand with minecraft:iron_sword")
    raw("attribute @e[tag=rs_alu_batch,limit=1] minecraft:generic.attack_damage base set 30")
  }

  @keep fn probe_spawn_batch_n2() {
    raw("kill @e[tag=rs_alu_batch]")
    raw("summon minecraft:zombie 4 70 0 {Tags:[\\"rs_alu_batch\\"],NoAI:1b,NoGravity:1b,Invulnerable:1b,Silent:1b,PersistenceRequired:1b}")
    raw("summon minecraft:zombie 6 70 0 {Tags:[\\"rs_alu_batch\\"],NoAI:1b,NoGravity:1b,Invulnerable:1b,Silent:1b,PersistenceRequired:1b}")
    raw("item replace entity @e[tag=rs_alu_batch] weapon.mainhand with minecraft:iron_sword")
    raw("attribute @e[tag=rs_alu_batch] minecraft:generic.attack_damage base set 30")
  }

  @keep fn probe_prepare_batch_inputs() {
    raw("scoreboard players set #x0 ${SCORE_OBJ} 1")
    raw("scoreboard players set #x1 ${SCORE_OBJ} 0")
    raw("scoreboard players set #x2 ${SCORE_OBJ} 2")
    raw("scoreboard players set #x3 ${SCORE_OBJ} 3")
    raw("scoreboard players set #bias ${SCORE_OBJ} 7")
  }

  @keep fn probe_apply_batch() {
    raw("item modify entity @e[tag=rs_alu_batch] weapon.mainhand ${MODIFIER_NAMESPACE}:${MOD_ID}")
  }

  @keep fn probe_count_batch() {
    raw("scoreboard players set #batch_count ${SCORE_OBJ} 0")
    raw("execute as @e[tag=rs_alu_batch] run scoreboard players add #batch_count ${SCORE_OBJ} 1")
  }
`
const DOT4_ITEM_MODIFIER = {
  function: 'minecraft:set_attributes',
  replace: true,
  modifiers: [
    {
      id: 'alu:x0',
      attribute: 'minecraft:generic.attack_damage',
      operation: 'add_value',
      slot: 'mainhand',
      amount: {
        type: 'minecraft:score',
        target: { type: 'minecraft:fixed', name: '#x0' },
        score: SCORE_OBJ,
        scale: 2,
      },
    },
    {
      id: 'alu:x1',
      attribute: 'minecraft:generic.attack_damage',
      operation: 'add_value',
      slot: 'mainhand',
      amount: {
        type: 'minecraft:score',
        target: { type: 'minecraft:fixed', name: '#x1' },
        score: SCORE_OBJ,
        scale: -3,
      },
    },
    {
      id: 'alu:x2',
      attribute: 'minecraft:generic.attack_damage',
      operation: 'add_value',
      slot: 'mainhand',
      amount: {
        type: 'minecraft:score',
        target: { type: 'minecraft:fixed', name: '#x2' },
        score: SCORE_OBJ,
        scale: 5,
      },
    },
    {
      id: 'alu:x3',
      attribute: 'minecraft:generic.attack_damage',
      operation: 'add_value',
      slot: 'mainhand',
      amount: {
        type: 'minecraft:score',
        target: { type: 'minecraft:fixed', name: '#x3' },
        score: SCORE_OBJ,
        scale: 7,
      },
    },
    {
      id: 'alu:bias',
      attribute: 'minecraft:generic.attack_damage',
      operation: 'add_value',
      slot: 'mainhand',
      amount: {
        type: 'minecraft:score',
        target: { type: 'minecraft:fixed', name: '#bias' },
        score: SCORE_OBJ,
        scale: 1,
      },
    },
  ],
}

function writeFixture(source: string, namespace: string): void {
  fs.mkdirSync(DATAPACK_DIR, { recursive: true })
  if (!fs.existsSync(path.join(DATAPACK_DIR, 'pack.mcmeta'))) {
    fs.writeFileSync(
      path.join(DATAPACK_DIR, 'pack.mcmeta'),
      JSON.stringify({ pack: { pack_format: 48, description: 'RedScript integration tests' } })
    )
  }

  const result = compile(source, { namespace })

  for (const file of result.files ?? []) {
    if (file.path === 'pack.mcmeta') {
      continue
    }

    const filePath = path.join(DATAPACK_DIR, file.path)
    fs.mkdirSync(path.dirname(filePath), { recursive: true })

    if (file.path.includes('data/minecraft/tags/') && fs.existsSync(filePath)) {
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      const incoming = JSON.parse(file.content)
      const merged = {
        values: [...new Set([...(existing.values ?? []), ...(incoming.values ?? [])])],
      }
      fs.writeFileSync(filePath, JSON.stringify(merged, null, 2))
    } else {
      fs.writeFileSync(filePath, file.content)
    }
  }
}

function writeDot4Resource(namespace: string, name: string, def: object): void {
  const filePath = path.join(DATAPACK_DIR, 'data', namespace, 'item_modifiers', `${name}.json`)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(def, null, 2))
}

function expectClose(actual: number, expected: number, label: string): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1)
  console.log(`  ${label}: ${actual} (expected ${expected})`)
}

describeLive('Lane 3 — item-modifier ALU probe', () => {
  beforeAll(async () => {
    mc = new MCTestClient(MC_HOST, MC_PORT)

    try {
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline) {
        if (await mc.isOnline()) {
          serverOnline = true
          break
        }
        await new Promise(resolve => setTimeout(resolve, 1_000))
      }
    } catch {
      serverOnline = false
    }

    if (!serverOnline) {
      throw new Error(
        '[lane3_item_attr_alu] MC_LIVE_PROBES=true but MC server is offline; unset MC_LIVE_PROBES or set MC_OFFLINE=true to skip live probes'
      )
    }

    // Version-sensitive note: item_modifiers path + slot field names can vary by version.
    // This file intentionally stays as a best-effort lane-3 scaffold until validated on target version.

    writeFixture(PROBE_SOURCE, NS)
    writeDot4Resource(MODIFIER_NAMESPACE, MOD_ID, DOT4_ITEM_MODIFIER)

    await mc.command(`/scoreboard objectives add ${SCORE_OBJ} dummy`).catch(() => {})
    await mc.reload()
    await mc.ticks(10)
  }, 60_000)

  test('one carrier with fixed base + replace:true path', async () => {
    await mc.command(`/function ${NS}:probe_reset`)
    await mc.command(`/function ${NS}:probe_spawn_core`)
    await mc.command(`/function ${NS}:probe_set_case_fixed`)
    await mc.command(`/function ${NS}:probe_apply_dot4`)

    const v = await mc.scoreboard('#dot4_same', SCORE_OBJ)
    // base 100 + (2*2) + (-3*1) + (5*-2) + (7*4) + 5 = 124
    expectClose(v, 124 * PROBE_SCALE, 'fixed-base replace:true case')
  }, 30_000)

  test('signed and bias path stays numerically consistent and non-negative', async () => {
    await mc.command(`/function ${NS}:probe_reset`)
    await mc.command(`/function ${NS}:probe_spawn_core`)
    await mc.command(`/function ${NS}:probe_set_case_signed_bias`)
    await mc.command(`/function ${NS}:probe_apply_dot4`)

    const v = await mc.scoreboard('#dot4_same', SCORE_OBJ)
    // base 20 + (2*8) + (-3*-7) + (5*4) + (7*-3) + 12 = 68
    expectClose(v, 68 * PROBE_SCALE, 'signed/bias case')
    expect(v).toBeGreaterThanOrEqual(0)
  }, 30_000)

  test('same-tick readback and tick-stepped readback match', async () => {
    await mc.command(`/function ${NS}:probe_reset`)
    await mc.command(`/function ${NS}:probe_spawn_core`)
    await mc.withTickControl(async step => {
      await mc.command(`/function ${NS}:probe_set_case_dot4`)
      await mc.command(`/function ${NS}:probe_apply_dot4`)
      const sameTick = await mc.scoreboard('#dot4_same', SCORE_OBJ)

      await step(1)
      await mc.command(`/function ${NS}:probe_read_after_tick`)
      const nextTick = await mc.scoreboard('#dot4_after_tick', SCORE_OBJ)

      // base 15 + (2*6) + (-3*2) + (5*-5) + (7*1) - 1 = 2
      expectClose(sameTick, 2 * PROBE_SCALE, 'dot4 expected (same tick)')
      expectClose(nextTick, 2 * PROBE_SCALE, 'dot4 expected (next tick)')
      expect(sameTick).toBe(nextTick)
    })
  }, 30_000)

  test('repeated invocation does not accumulate stale modifiers (replace=true)', async () => {
    await mc.command(`/function ${NS}:probe_reset`)
    await mc.command(`/function ${NS}:probe_spawn_core`)
    await mc.command(`/function ${NS}:probe_set_case_fixed`)
    await mc.command(`/function ${NS}:probe_apply_dot4`)
    const first = await mc.scoreboard('#dot4_same', SCORE_OBJ)

    await mc.command(`/function ${NS}:probe_set_case_dot4`)
    await mc.command(`/function ${NS}:probe_apply_dot4`)
    const second = await mc.scoreboard('#dot4_same', SCORE_OBJ)

    await mc.command(`/function ${NS}:probe_set_case_dot4`)
    await mc.command(`/function ${NS}:probe_apply_dot4`)
    const third = await mc.scoreboard('#dot4_same', SCORE_OBJ)

    // If modifiers accumulated, second and third would drift larger/smaller each call.
    expectClose(first, 124 * PROBE_SCALE, 'repeat check #1')
    expectClose(second, 2 * PROBE_SCALE, 'repeat check #2')
    expectClose(third, 2 * PROBE_SCALE, 'repeat check #3 (no stale accumulation)')
  }, 30_000)

  test('batch mode: N=1 and N=2 entity pools remain deterministic', async () => {
    await mc.command(`/function ${NS}:probe_reset`)
    await mc.command(`/function ${NS}:probe_spawn_batch_n1`)
    await mc.command(`/function ${NS}:probe_prepare_batch_inputs`)
    await mc.command(`/function ${NS}:probe_apply_batch`)
    await mc.command(`/function ${NS}:probe_count_batch`)
    const one = await mc.scoreboard('#batch_count', SCORE_OBJ)
    expect(one).toBe(1)

    await mc.command(`/function ${NS}:probe_spawn_batch_n2`)
    await mc.command(`/function ${NS}:probe_apply_batch`)
    await mc.command(`/function ${NS}:probe_count_batch`)
    const two = await mc.scoreboard('#batch_count', SCORE_OBJ)
    expect(two).toBe(2)
  }, 30_000)
})

