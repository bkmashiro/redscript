/**
 * RedScript MC Integration Probe — display transformation decomposition
 *
 * Probes how Minecraft decomposes Display entity transformation matrices.
 *
 * Run (with server):
 *   MC_LIVE_PROBES=true MC_HOST=localhost MC_PORT=25561 MC_SERVER_DIR=~/mc-test-server \
 *   npx jest display-decomposition-probe --testTimeout=120000
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../compile'
import { MCTestClient } from '../../mc-test/client'

const MC_HOST = process.env.MC_HOST ?? 'localhost'
const MC_PORT = parseInt(process.env.MC_PORT ?? '25561', 10)
const MC_SERVER_DIR = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')
const DATAPACK_DIR = path.join(MC_SERVER_DIR, 'world', 'datapacks', 'redscript-test')

const NS = 'display_decomp_probe'
const SCORE_OBJ = 'rs_display_decomp'
const RUN_LIVE_PROBE = process.env.MC_LIVE_PROBES === 'true' && process.env.MC_OFFLINE !== 'true'
const describeLive = RUN_LIVE_PROBE ? describe : describe.skip

if (!RUN_LIVE_PROBE) {
  console.warn('[display_decomp_probe] live probe skipped; set MC_LIVE_PROBES=true with a TestHarness server to run it')
}

let serverOnline = false
let mc: MCTestClient

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

function sortScales(values: number[]): number[] {
  return [...values].sort((a, b) => b - a)
}

function assertClose(actual: number, expected: number, tol: number, label: string): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol)
}

function assertScales(actual: number[], expected: number[], tol: number, label: string): void {
  expect(actual).toHaveLength(expected.length)
  const a = sortScales(actual)
  const e = sortScales(expected)
  for (let i = 0; i < e.length; i++) {
    assertClose(a[i], e[i], tol, `${label}[${i}]`)
  }
}

describeLive('Display transformation decomposition — lane 2 probe', () => {
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
      throw new Error('[display_decomp_probe] MC_LIVE_PROBES=true but MC server is offline; unset MC_LIVE_PROBES or set MC_OFFLINE=true to skip live probes')
    }

  writeFixture(`
    fn probe_reset_entity() {
      raw('kill @e[tag=rs_disp_probe_entity]')
      raw('summon minecraft:block_display 0 70 0 {Tags:["rs_disp_probe_entity"]}')
    }

    @keep fn probe_diag() {
      probe_reset_entity()
      raw('data modify entity @e[tag=rs_disp_probe_entity,limit=1] transformation set value [2f, 0f, 0f, 0f, 0f, 3f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f]')
      raw('execute store result score #diag_scale_x rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[0] 10000')
      raw('execute store result score #diag_scale_y rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[1] 10000')
      raw('execute store result score #diag_scale_z rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[2] 10000')
      raw('scoreboard players set #diag_case_ready rs_display_decomp 1')
    }

    @keep fn probe_diag_next() {
      raw('execute store result score #diag_scale_x_next rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[0] 10000')
      raw('execute store result score #diag_scale_y_next rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[1] 10000')
      raw('execute store result score #diag_scale_z_next rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[2] 10000')
    }

    @keep fn probe_complex_hypot() {
      probe_reset_entity()
      raw('data modify entity @e[tag=rs_disp_probe_entity,limit=1] transformation set value [3f, -4f, 0f, 0f, 4f, 3f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f]')
      raw('execute store result score #complex_scale_x rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[0] 10000')
      raw('execute store result score #complex_scale_y rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[1] 10000')
      raw('execute store result score #complex_scale_z rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[2] 10000')
      raw('scoreboard players set #complex_case_ready rs_display_decomp 1')
    }

    @keep fn probe_complex_hypot_next() {
      raw('execute store result score #complex_scale_x_next rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[0] 10000')
      raw('execute store result score #complex_scale_y_next rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[1] 10000')
      raw('execute store result score #complex_scale_z_next rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[2] 10000')
    }

    @keep fn probe_scaled_rotation() {
      probe_reset_entity()
      raw('data modify entity @e[tag=rs_disp_probe_entity,limit=1] transformation set value [0f, -2f, 0f, 0f, 2f, 0f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f]')
      raw('execute store result score #rot_scale_x rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[0] 10000')
      raw('execute store result score #rot_scale_y rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[1] 10000')
      raw('execute store result score #rot_scale_z rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[2] 10000')
    }

    @keep fn probe_psd_eigs() {
      probe_reset_entity()
      raw('data modify entity @e[tag=rs_disp_probe_entity,limit=1] transformation set value [5f, 2f, 0f, 0f, 2f, 5f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f]')
      raw('execute store result score #psd_scale_x rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[0] 10000')
      raw('execute store result score #psd_scale_y rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[1] 10000')
      raw('execute store result score #psd_scale_z rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[2] 10000')
    }

    @keep fn probe_rank_deficient() {
      probe_reset_entity()
      raw('data modify entity @e[tag=rs_disp_probe_entity,limit=1] transformation set value [1f, 2f, 0f, 0f, 2f, 4f, 0f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 0f, 1f]')
      raw('execute store result score #rank_scale_x rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[0] 10000')
      raw('execute store result score #rank_scale_y rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[1] 10000')
      raw('execute store result score #rank_scale_z rs_display_decomp run data get entity @e[tag=rs_disp_probe_entity,limit=1] transformation.scale[2] 10000')
    }
  `, NS)

  await mc.command(`/scoreboard objectives add ${SCORE_OBJ} dummy`).catch(() => {})
  await mc.reload()
  await mc.ticks(10)
  }, 60_000)

  async function readScales(players: [string, string, string]): Promise<number[]> {
  const [x, y, z] = await Promise.all(
    players.map(player => mc.scoreboard(player, SCORE_OBJ))
  )
  return [x, y, z].map(v => Math.round(v)).sort((a, b) => b - a)
}

  const EXPECTED_SCALAR = 10_000

  test('diagonal baseline yields expected singular scale components', async () => {

    await mc.command(`/function ${NS}:probe_diag`)
    const scales = await readScales(['#diag_scale_x', '#diag_scale_y', '#diag_scale_z'])

    assertScales(scales, [2 * EXPECTED_SCALAR, 3 * EXPECTED_SCALAR, 1 * EXPECTED_SCALAR], 3_000, 'diagonal')
    console.log(`  diagonal scales = ${scales.join(',')} (expect [20000, 30000, 10000])`)
  }, 20_000)

  test('complex hypot matrix [[3,-4],[4,3]] shows singular scale near 5', async () => {

    await mc.command(`/function ${NS}:probe_complex_hypot`)
    const scales = await readScales(['#complex_scale_x', '#complex_scale_y', '#complex_scale_z'])

    assertScales(scales, [5 * EXPECTED_SCALAR, 5 * EXPECTED_SCALAR, 1 * EXPECTED_SCALAR], 2_000, 'complex_hypot')
    console.log(`  complex-hypot scales = ${scales.join(',')} (expect [50000, 50000, 10000])`)
  }, 20_000)

  test('scaled rotation case is decomposition-consistent', async () => {

    await mc.command(`/function ${NS}:probe_scaled_rotation`)
    const scales = await readScales(['#rot_scale_x', '#rot_scale_y', '#rot_scale_z'])

    assertScales(scales, [2 * EXPECTED_SCALAR, 2 * EXPECTED_SCALAR, 1 * EXPECTED_SCALAR], 2_000, 'scaled_rotation')
    console.log(`  scaled-rotation scales = ${scales.join(',')} (expect [20000, 20000, 10000])`)
  }, 20_000)

  test('symmetric PSD/eigenvalue toy matrix decomposes to expected scales', async () => {

    await mc.command(`/function ${NS}:probe_psd_eigs`)
    const scales = await readScales(['#psd_scale_x', '#psd_scale_y', '#psd_scale_z'])

    assertScales(scales, [7 * EXPECTED_SCALAR, 3 * EXPECTED_SCALAR, 1 * EXPECTED_SCALAR], 3_000, 'psd')
    console.log(`  psd matrix scales = ${scales.join(',')} (expect [70000, 30000, 10000])`)
  }, 20_000)

  test('rank-deficient matrix shows near-zero singular scale', async () => {

    await mc.command(`/function ${NS}:probe_rank_deficient`)
    const scales = await readScales(['#rank_scale_x', '#rank_scale_y', '#rank_scale_z'])

    const sorted = sortScales(scales)
    expect(sorted[0]).toBeGreaterThanOrEqual(4 * EXPECTED_SCALAR)
    expect(sorted[1]).toBeLessThanOrEqual(12_000)
    expect(sorted[1]).toBeGreaterThanOrEqual(8_000)
    expect(sorted[2]).toBeLessThanOrEqual(500)

    console.log(`  rank-deficient scales = ${sorted.join(',')} (expect [~50000, ~10000, 0])`)
  }, 20_000)

  test('same-tick read vs next-tick read are consistent when stepping ticks', async () => {

    await mc.withTickControl(async step => {
      await mc.command(`/function ${NS}:probe_complex_hypot`)
      const same = await readScales(['#complex_scale_x', '#complex_scale_y', '#complex_scale_z'])

      await step(1)
      await mc.command(`/function ${NS}:probe_complex_hypot_next`)
      const next = await readScales(['#complex_scale_x_next', '#complex_scale_y_next', '#complex_scale_z_next'])

      assertScales(same, [5 * EXPECTED_SCALAR, 5 * EXPECTED_SCALAR, 1 * EXPECTED_SCALAR], 2_000, 'same-tick complex')
      assertScales(next, [5 * EXPECTED_SCALAR, 5 * EXPECTED_SCALAR, 1 * EXPECTED_SCALAR], 2_000, 'next-tick complex')
      expect(sortScales(same)[0]).toBe(sortScales(next)[0])
      expect(sortScales(same)[1]).toBe(sortScales(next)[1])
      expect(sortScales(same)[2]).toBe(sortScales(next)[2])
    })
  }, 30_000)
})
