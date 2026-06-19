/**
 * RedScript MC Integration Probe — enchantment Level-Based Value ALU
 *
 * Lane 4 live-only probe for bounded unary ALU possibilities via custom-enchantment
 * level-based values:
 *  - lookup for small bounded level input;
 *  - levels_squared sum of squares;
 *  - fraction reciprocal;
 *  - exponent (sqrt/reciprocal) if version allows it;
 *  - level 0 / absent enchantment edge case.
 *
 * IMPORTANT:
 *  - This probe is schema-fragile; enchantment and level-based value formats
 *    differ across MC versions and datapack packs.
 *  - Run as a live probe only when this is verified:
 *      MC_LIVE_PROBES=true MC_OFFLINE=false
 *
 * Run:
 *  MC_LIVE_PROBES=true MC_SERVER_DIR=~/mc-test-server npx jest enchantment-level-based-alu-probe --runInBand --testTimeout=120000
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../compile'
import { MCTestClient } from '../../mc-test/client'

const MC_HOST = process.env.MC_HOST ?? 'localhost'
const MC_PORT = parseInt(process.env.MC_PORT ?? '25561', 10)
const MC_SERVER_DIR = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')
const DATAPACK_DIR = path.join(MC_SERVER_DIR, 'world', 'datapacks', 'redscript-test')

const NS = 'lane4_ench_alu'
const SCORE_OBJ = 'rs_lane4_ench_alu'
const MODIFIER_NAMESPACE = NS
const BASE_ATTR_VALUE = 0
const PROBE_SCALE = 1000

const RUN_LIVE_PROBE = process.env.MC_LIVE_PROBES === 'true' && process.env.MC_OFFLINE !== 'true'
const describeLive = RUN_LIVE_PROBE ? describe : describe.skip

if (!RUN_LIVE_PROBE) {
  console.warn('[lane4_ench_alu] live probe skipped; set MC_LIVE_PROBES=true with a TestHarness server to run it')
}

interface McVersion {
  major: number
  minor: number
  patch: number
}

type EnchSchema = 'legacy-legacy' | 'legacy-modern'

let mc: MCTestClient
let serverOnline = false
let mcVersion: McVersion | null = null
let supportsExponent = false
let enchSchema: EnchSchema = 'legacy-legacy'

const PROBE_SOURCE = `
  namespace ${NS}

  @keep fn probe_pack_meta() {
    raw('scoreboard objectives add ${SCORE_OBJ} dummy')
    raw('scoreboard players set #lookup_out ${SCORE_OBJ} 0')
    raw('scoreboard players set #squared_out ${SCORE_OBJ} 0')
    raw('scoreboard players set #fraction_out ${SCORE_OBJ} 0')
    raw('scoreboard players set #exponent_out ${SCORE_OBJ} 0')
    raw('scoreboard players set #zero_out ${SCORE_OBJ} 0')
  }

  @keep fn probe_spawn_core() {
    raw('summon minecraft:zombie 0 70 0 {Tags:["rs_lane4_ench_core"],NoAI:1b,NoGravity:1b,Invulnerable:1b,Silent:1b,PersistenceRequired:1b}')
    raw('item replace entity @e[tag=rs_lane4_ench_core,limit=1] weapon.mainhand with minecraft:diamond_sword')
    raw('attribute @e[tag=rs_lane4_ench_core,limit=1] minecraft:generic.attack_damage base set ${BASE_ATTR_VALUE}')
  }

  @keep fn probe_reset() {
    raw('kill @e[tag=rs_lane4_ench_core]')
    raw('scoreboard players set #lookup_out ${SCORE_OBJ} 0')
    raw('scoreboard players set #squared_out ${SCORE_OBJ} 0')
    raw('scoreboard players set #fraction_out ${SCORE_OBJ} 0')
    raw('scoreboard players set #exponent_out ${SCORE_OBJ} 0')
    raw('scoreboard players set #zero_out ${SCORE_OBJ} 0')
  }

  @keep fn probe_apply_lookup() {
    item modify entity @e[tag=rs_lane4_ench_core,limit=1] weapon.mainhand ${MODIFIER_NAMESPACE}:lookup
    execute store result score #lookup_out ${SCORE_OBJ} run attribute @e[tag=rs_lane4_ench_core,limit=1] minecraft:generic.attack_damage get ${PROBE_SCALE}
  }

  @keep fn probe_apply_levels_squared() {
    item modify entity @e[tag=rs_lane4_ench_core,limit=1] weapon.mainhand ${MODIFIER_NAMESPACE}:levels_squared
    execute store result score #squared_out ${SCORE_OBJ} run attribute @e[tag=rs_lane4_ench_core,limit=1] minecraft:generic.attack_damage get ${PROBE_SCALE}
  }

  @keep fn probe_apply_fraction() {
    item modify entity @e[tag=rs_lane4_ench_core,limit=1] weapon.mainhand ${MODIFIER_NAMESPACE}:fraction
    execute store result score #fraction_out ${SCORE_OBJ} run attribute @e[tag=rs_lane4_ench_core,limit=1] minecraft:generic.attack_damage get ${PROBE_SCALE}
  }

  @keep fn probe_apply_exponent_sqrt16() {
    item modify entity @e[tag=rs_lane4_ench_core,limit=1] weapon.mainhand ${MODIFIER_NAMESPACE}:exponent
    execute store result score #exponent_out ${SCORE_OBJ} run attribute @e[tag=rs_lane4_ench_core,limit=1] minecraft:generic.attack_damage get ${PROBE_SCALE}
  }

  @keep fn probe_read_no_enchant() {
    item modify entity @e[tag=rs_lane4_ench_core,limit=1] weapon.mainhand ${MODIFIER_NAMESPACE}:no_enchant
    execute store result score #zero_out ${SCORE_OBJ} run attribute @e[tag=rs_lane4_ench_core,limit=1] minecraft:generic.attack_damage get ${PROBE_SCALE}
  }
`

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

function writeResourceJson(namespace: string, subdir: string, name: string, payload: object): void {
  const filePath = path.join(DATAPACK_DIR, 'data', namespace, subdir, `${name}.json`)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2))
}

function parseVersion(raw: string | undefined): McVersion | null {
  if (!raw) return null
  const m = raw.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  const [, major, minor, patch] = m
  return {
    major: parseInt(major, 10),
    minor: parseInt(minor, 10),
    patch: parseInt(patch, 10),
  }
}

function compareVersion(a: McVersion, b: McVersion): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  return a.patch - b.patch
}

function approxEq(actual: number, expected: number, tolerance: number, label: string): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
  console.log(`  ${label}: ${actual} (expected ${expected}±${tolerance})`)
}

function writeEnchantmentArtifacts(variant: EnchSchema, namespace: string): void {
  // Assumption notes:
  //  - 1.21+ changed data-driven enchantment representation and may also alter
  //    level-based value key names/containers.
  //  - The payloads below are representative scaffolds and must be validated in target MC.

  const lookupBase = {
    description: `lane4 lookup probe (${variant})`,
    supported_items: '#minecraft:enchantable/weapon',
    weight: 1,
    max_level: 8,
    min_cost: { base: 1, per_level_above_first: 1 },
    max_cost: { base: 1, per_level_above_first: 1 },
    anvil_cost: { base: 1, per_level_above_first: 1 },
    effects:
      variant === 'legacy-modern'
        ? [
            {
              type: 'minecraft:attribute_modifier',
              id: `${namespace}:lookup`,
              uuid: '00000000-0000-0000-0000-000000000001',
              attribute: 'minecraft:generic.attack_damage',
              operation: 'add_value',
              slot: 'mainhand',
              amount: {
                type: 'minecraft:lookup',
                scale: 1,
                values: [0, 10, 20, 40, 80, 160, 320],
              },
            },
          ]
        : [
            {
              type: 'minecraft:attribute',
              id: `${namespace}:lookup`,
              attribute: 'minecraft:generic.attack_damage',
              operation: 'add_value',
              slot: 'mainhand',
              amount: {
                type: 'minecraft:lookup',
                scale: 1,
                values: [0, 10, 20, 40, 80, 160, 320],
              },
            },
          ],
  }

  const levelsSquared = {
    description: `lane4 levels_squared probe (${variant})`,
    supported_items: '#minecraft:enchantable/weapon',
    weight: 1,
    max_level: 15,
    min_cost: { base: 1, per_level_above_first: 1 },
    max_cost: { base: 1, per_level_above_first: 1 },
    anvil_cost: { base: 1, per_level_above_first: 1 },
    effects:
      variant === 'legacy-modern'
        ? [
            {
              type: 'minecraft:attribute_modifier',
              id: `${namespace}:levels_squared`,
              uuid: '00000000-0000-0000-0000-000000000002',
              attribute: 'minecraft:generic.attack_damage',
              operation: 'add_value',
              slot: 'mainhand',
              amount: { type: 'minecraft:levels_squared' },
            },
          ]
        : [
            {
              type: 'minecraft:attribute',
              id: `${namespace}:levels_squared`,
              attribute: 'minecraft:generic.attack_damage',
              operation: 'add_value',
              slot: 'mainhand',
              amount: { type: 'minecraft:levels_squared' },
            },
          ],
  }

  const levelsSquaredVariant = (suffix: string): object => {
    const payload = JSON.parse(JSON.stringify(levelsSquared))
    payload.description = `lane4 levels_squared_${suffix} probe (${variant})`
    for (const effect of payload.effects ?? []) {
      effect.id = `${namespace}:levels_squared_${suffix}`
    }
    return payload
  }

  const fraction = {
    description: `lane4 fraction probe (${variant})`,
    supported_items: '#minecraft:enchantable/weapon',
    weight: 1,
    max_level: 10,
    min_cost: { base: 1, per_level_above_first: 1 },
    max_cost: { base: 1, per_level_above_first: 1 },
    anvil_cost: { base: 1, per_level_above_first: 1 },
    effects:
      variant === 'legacy-modern'
        ? [
            {
              type: 'minecraft:attribute_modifier',
              id: `${namespace}:fraction`,
              uuid: '00000000-0000-0000-0000-000000000003',
              attribute: 'minecraft:generic.attack_damage',
              operation: 'add_value',
              slot: 'mainhand',
              amount: {
                type: 'minecraft:fraction',
                numerator: { type: 'minecraft:fixed', value: 1000 },
                denominator: { type: 'minecraft:fixed', value: 4 },
              },
            },
          ]
        : [
            {
              type: 'minecraft:attribute',
              id: `${namespace}:fraction`,
              attribute: 'minecraft:generic.attack_damage',
              operation: 'add_value',
              slot: 'mainhand',
              amount: {
                type: 'minecraft:fraction',
                numerator: { type: 'minecraft:fixed', value: 1000 },
                denominator: { type: 'minecraft:fixed', value: 4 },
              },
            },
          ],
  }

  const exponent = {
    description: `lane4 exponent probe (${variant})`,
    supported_items: '#minecraft:enchantable/weapon',
    weight: 1,
    max_level: 12,
    min_cost: { base: 1, per_level_above_first: 1 },
    max_cost: { base: 1, per_level_above_first: 1 },
    anvil_cost: { base: 1, per_level_above_first: 1 },
    effects:
      variant === 'legacy-modern'
        ? [
            {
              type: 'minecraft:attribute_modifier',
              id: `${namespace}:exponent`,
              uuid: '00000000-0000-0000-0000-000000000004',
              attribute: 'minecraft:generic.attack_damage',
              operation: 'add_value',
              slot: 'mainhand',
              amount: {
                type: 'minecraft:exponent',
                base: { type: 'minecraft:fixed', value: 16 },
                power: { type: 'minecraft:fixed', value: 500 },
              },
            },
          ]
        : [
            {
              type: 'minecraft:attribute',
              id: `${namespace}:exponent`,
              attribute: 'minecraft:generic.attack_damage',
              operation: 'add_value',
              slot: 'mainhand',
              amount: {
                type: 'minecraft:exponent',
                base: { type: 'minecraft:fixed', value: 16 },
                power: { type: 'minecraft:fixed', value: 500 },
              },
            },
          ],
  }

  const noEnchant = {
    description: `lane4 no enchantment control (${variant})`,
    supported_items: '#minecraft:enchantable/weapon',
    weight: 1,
    max_level: 1,
    effects: [],
  }

  const toWrite = [
    { name: `${namespace}:lookup`, payload: lookupBase },
    { name: `${namespace}:levels_squared`, payload: levelsSquared },
    { name: `${namespace}:levels_squared_a`, payload: levelsSquaredVariant('a') },
    { name: `${namespace}:levels_squared_b`, payload: levelsSquaredVariant('b') },
    { name: `${namespace}:levels_squared_c`, payload: levelsSquaredVariant('c') },
    { name: `${namespace}:fraction`, payload: fraction },
    { name: `${namespace}:exponent`, payload: exponent },
    { name: `${namespace}:no_enchant`, payload: noEnchant },
  ]

  // Write both likely registry directory shapes to reduce version-surface brittleness.
  for (const { name, payload } of toWrite) {
    const key = name.includes(':') ? name.split(':')[1] : name

    const legacyPath = path.join(DATAPACK_DIR, 'data', namespace, 'enchantment', `${key}.json`)
    const modernPath = path.join(DATAPACK_DIR, 'data', namespace, 'enchantments', `${key}.json`)

    fs.mkdirSync(path.dirname(legacyPath), { recursive: true })
    fs.mkdirSync(path.dirname(modernPath), { recursive: true })
    fs.writeFileSync(legacyPath, JSON.stringify(payload, null, 2))
    fs.writeFileSync(modernPath, JSON.stringify(payload, null, 2))
  }

  const itemModifiers: [string, object][] = [
    [
      'lookup',
      {
        function: 'minecraft:set_enchantments',
        replace: true,
        add: [
          {
            id: `${namespace}:lookup`,
            level: 4,
          },
        ],
      },
    ],
    [
      'levels_squared',
      {
        function: 'minecraft:set_enchantments',
        replace: true,
        add: [
          { id: `${namespace}:levels_squared_a`, level: 3 },
          { id: `${namespace}:levels_squared_b`, level: 4 },
          { id: `${namespace}:levels_squared_c`, level: 12 },
        ],
      },
    ],
    [
      'fraction',
      {
        function: 'minecraft:set_enchantments',
        replace: true,
        add: [{ id: `${namespace}:fraction`, level: 4 }],
      },
    ],
    [
      'exponent',
      {
        function: 'minecraft:set_enchantments',
        replace: true,
        add: [{ id: `${namespace}:exponent`, level: 1 }],
      },
    ],
    [
      'no_enchant',
      {
        function: 'minecraft:set_enchantments',
        replace: true,
        remove: [
          `${namespace}:lookup`,
          `${namespace}:levels_squared`,
          `${namespace}:levels_squared_a`,
          `${namespace}:levels_squared_b`,
          `${namespace}:levels_squared_c`,
          `${namespace}:fraction`,
          `${namespace}:exponent`,
        ],
      },
    ],
  ]

  for (const [name, def] of itemModifiers) {
    writeResourceJson(MODIFIER_NAMESPACE, 'item_modifiers', name, def)
  }
}

describeLive('Lane 4 — enchantment Level-Based Value ALU probe', () => {
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
        '[lane4_ench_alu] MC_LIVE_PROBES=true but MC server is offline; unset MC_LIVE_PROBES or set MC_OFFLINE=true to skip live probes'
      )
    }

    try {
      const status = await mc.status()
      mcVersion = parseVersion(status.version)
    } catch {
      mcVersion = null
    }

    supportsExponent =
      mcVersion !== null &&
      compareVersion(mcVersion, { major: 1, minor: 21, patch: 11 }) >= 0

    // Keep default on unknown/older versions conservative to avoid accidental false-positive
    // assumptions about level-based schema shape.
    enchSchema = supportsExponent ? 'legacy-modern' : 'legacy-legacy'

    writeFixture(PROBE_SOURCE, NS)
    writeEnchantmentArtifacts(enchSchema, NS)

    await mc.reload()
    await mc.ticks(20)
    await mc.command(`/scoreboard objectives add ${SCORE_OBJ} dummy`).catch(() => {})
    await mc.command(`/function ${NS}:probe_pack_meta`)
    await mc.ticks(2)

    console.log(`[lane4_ench_alu] version=${mcVersion ? `${mcVersion.major}.${mcVersion.minor}.${mcVersion.patch}` : 'unknown'} schema=${enchSchema} exponent=${supportsExponent}`)
  }, 60_000)

  test('lookup probe maps small bounded input domain', async () => {
    await mc.command(`/function ${NS}:probe_reset`)
    await mc.command(`/function ${NS}:probe_spawn_core`)
    await mc.command(`/function ${NS}:probe_apply_lookup`)

    const v = await mc.scoreboard('#lookup_out', SCORE_OBJ)
    // Assumption: lookup table entry for level 4 is 40 (scaled x10 from source schema) in this scaffold.
    approxEq(v, 40 * PROBE_SCALE / 10, 500, 'lookup@lvl4')
    expect(v).toBeGreaterThan(0)
  }, 30_000)

  test('levels_squared sums three enchantment levels as x^2', async () => {
    await mc.command(`/function ${NS}:probe_reset`)
    await mc.command(`/function ${NS}:probe_spawn_core`)
    await mc.command(`/function ${NS}:probe_apply_levels_squared`)

    const v = await mc.scoreboard('#squared_out', SCORE_OBJ)
    // (3² + 4² + 12²) = 169 in the intended schema.
    approxEq(v, 169 * PROBE_SCALE, 1_000, 'levels_squared fused sum-of-squares')
    expect(v).toBeGreaterThan(0)
  }, 30_000)

  test('fraction path carries reciprocal behavior for bounded input', async () => {
    await mc.command(`/function ${NS}:probe_reset`)
    await mc.command(`/function ${NS}:probe_spawn_core`)
    await mc.command(`/function ${NS}:probe_apply_fraction`)

    const v = await mc.scoreboard('#fraction_out', SCORE_OBJ)
    // Assumption from scaffold: expected 1/4, so about 250 when sampled at scale=1000.
    approxEq(v, 250, 25, 'fraction reciprocal(4)')
    expect(v).toBeGreaterThan(0)
  }, 30_000)

  test('exponent path (sqrt/reciprocal-style) when version supports it', async () => {
    if (!supportsExponent) {
      console.warn('[lane4_ench_alu] exponent skipped: target server <1.21.11 or version parse unavailable')
      return
    }

    await mc.command(`/function ${NS}:probe_reset`)
    await mc.command(`/function ${NS}:probe_spawn_core`)
    await mc.command(`/function ${NS}:probe_apply_exponent_sqrt16`)

    const v = await mc.scoreboard('#exponent_out', SCORE_OBJ)
    // Assumption: scaffold payload expresses 16^0.5 as 4 through the level-based value expression.
    approxEq(v, 4_000, 300, 'exponent sqrt(16)')
    expect(v).toBeGreaterThan(0)
  }, 30_000)

  test('level 0 / absent-enchant edge behaves as zero effect in this scaffold', async () => {
    await mc.command(`/function ${NS}:probe_reset`)
    await mc.command(`/function ${NS}:probe_spawn_core`)
    await mc.command(`/function ${NS}:probe_read_no_enchant`)

    const v = await mc.scoreboard('#zero_out', SCORE_OBJ)
    approxEq(v, 0, 50, 'no-enchant baseline')
  }, 30_000)
})
