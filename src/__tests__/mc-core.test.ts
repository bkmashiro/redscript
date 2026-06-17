/**
 * RedScript MC Core Oracle Tests
 *
 * Small, focused Paper integration tests for core command/lower-level behavior.
 *
 * Run with:
 *   MC_SERVER_DIR=~/mc-test-server npm run test:mc-core
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../compile'
import { MCTestClient } from '../mc-test/client'

const MC_HOST = process.env.MC_HOST ?? 'localhost'
const MC_PORT = parseInt(process.env.MC_PORT ?? '25561')
const MC_SERVER_DIR = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')
const DATAPACK_DIR = path.join(MC_SERVER_DIR, 'world', 'datapacks', 'redscript-core-oracle')

const CORE_NS = 'core_oracle_mc'
const CORE_OBJ = 'core_oracle'

let serverOnline = false
let mc: MCTestClient

const CORE_FIXTURE = `
@load fn __load() {
  scoreboard_set("#load_marker", "${CORE_OBJ}", 41)
}

@tick fn __tick() {
  let tickVal: int = scoreboard_get("#tick_marker", "${CORE_OBJ}")
  scoreboard_set("#tick_marker", "${CORE_OBJ}", tickVal + 1)
}

fn test_arithmetic() {
  let base: int = scoreboard_get("#arith_input", "${CORE_OBJ}")
  scoreboard_set("#arith_sum", "${CORE_OBJ}", base + 2 * 3)
  scoreboard_set("#arith_product", "${CORE_OBJ}", base * 5)
}

fn test_branch() {
  let value: int = scoreboard_get("#branch_input", "${CORE_OBJ}")
  if (value > 5) {
    scoreboard_set("#branch_result", "${CORE_OBJ}", 1)
  } else {
    scoreboard_set("#branch_result", "${CORE_OBJ}", 0)
  }
}

fn _chain_step_a(seed: int) {
  let next: int = seed + 1
  scoreboard_set("#call_stage_a", "${CORE_OBJ}", next)
}

fn _chain_step_b(seed: int) {
  _chain_step_c(seed * 2)
}

fn _chain_step_c(seed: int) {
  scoreboard_set("#call_chain", "${CORE_OBJ}", seed)
}

fn test_call_chain() {
  let base: int = scoreboard_get("#chain_input", "${CORE_OBJ}")
  _chain_step_a(base)
  let stepped: int = scoreboard_get("#call_stage_a", "${CORE_OBJ}")
  _chain_step_b(stepped)
}

@keep
fn __macro_apply() {
  raw("$scoreboard players set #macro_result ${CORE_OBJ} $(value)")
}

fn test_macro_with_storage() {
  raw("data modify storage rs:core_oracle value set value 77")
  raw("function __NS__:__macro_apply with storage rs:core_oracle")
}
`

function writeFixture(source: string, namespace: string): void {
  fs.mkdirSync(DATAPACK_DIR, { recursive: true })

  const packMeta = path.join(DATAPACK_DIR, 'pack.mcmeta')
  if (!fs.existsSync(packMeta)) {
    fs.writeFileSync(
      packMeta,
      JSON.stringify({
        pack: {
          pack_format: 48,
          description: 'RedScript MC core oracle fixtures',
        },
      }, null, 2)
    )
  }

  const result = compile(source, { namespace })

  for (const file of result.files ?? []) {
    if (file.path === 'pack.mcmeta') continue
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

function cleanDatapackDir(): void {
  fs.rmSync(DATAPACK_DIR, { recursive: true, force: true })
  fs.mkdirSync(DATAPACK_DIR, { recursive: true })
}

async function waitForServer(timeoutMs = 20000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await mc.isOnline()) return true
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

beforeAll(async () => {
  mc = new MCTestClient(MC_HOST, MC_PORT)

  if (process.env.MC_OFFLINE === 'true') {
    console.warn('⚠ MC_OFFLINE=true — skipping MC core oracle tests')
    return
  }

  serverOnline = await waitForServer()
  if (!serverOnline) {
    console.warn(`⚠ MC server not running at ${MC_HOST}:${MC_PORT} — skipping MC core oracle tests`)
    return
  }

  cleanDatapackDir()
  writeFixture(CORE_FIXTURE, CORE_NS)

  await mc.command(`/scoreboard objectives add ${CORE_OBJ} dummy`).catch(() => {})

  await mc.reload()
  await mc.ticks(5)

  console.log('  MC core oracle fixtures installed and reloaded')
}, 40000)

describe('MC Core Oracle (RedScript runtime)', () => {
  beforeEach(async () => {
    if (!serverOnline) return
    await mc.command(`/scoreboard players set #arith_input ${CORE_OBJ} 0`)
    await mc.command(`/scoreboard players set #arith_sum ${CORE_OBJ} 0`)
    await mc.command(`/scoreboard players set #arith_product ${CORE_OBJ} 0`)
    await mc.command(`/scoreboard players set #branch_input ${CORE_OBJ} 0`)
    await mc.command(`/scoreboard players set #branch_result ${CORE_OBJ} 0`)
    await mc.command(`/scoreboard players set #chain_input ${CORE_OBJ} 0`)
    await mc.command(`/scoreboard players set #call_stage_a ${CORE_OBJ} 0`)
    await mc.command(`/scoreboard players set #call_chain ${CORE_OBJ} 0`)
    await mc.command(`/scoreboard players set #macro_result ${CORE_OBJ} 0`)
    await mc.command(`/scoreboard players set #tick_marker ${CORE_OBJ} 0`)
    await mc.command(`/scoreboard players set #load_marker ${CORE_OBJ} 0`)
  })

  test('scoreboard arithmetic compiles and runs', async () => {
    if (!serverOnline) return

    await mc.command(`/scoreboard players set #arith_input ${CORE_OBJ} 10`)
    await mc.command(`/function ${CORE_NS}:test_arithmetic`)
    await mc.ticks(4)

    expect(await mc.scoreboard('#arith_sum', CORE_OBJ)).toBe(16)
    expect(await mc.scoreboard('#arith_product', CORE_OBJ)).toBe(50)
    console.log('  arithmetic case: + and * verified ✓')
  }, 20_000)

  test('execute-style branch compiles and emits correct path', async () => {
    if (!serverOnline) return

    await mc.command(`/scoreboard players set #branch_input ${CORE_OBJ} 12`)
    await mc.command(`/function ${CORE_NS}:test_branch`)
    await mc.ticks(3)
    expect(await mc.scoreboard('#branch_result', CORE_OBJ)).toBe(1)

    await mc.command(`/scoreboard players set #branch_input ${CORE_OBJ} 3`)
    await mc.command(`/function ${CORE_NS}:test_branch`)
    await mc.ticks(3)
    expect(await mc.scoreboard('#branch_result', CORE_OBJ)).toBe(0)
    console.log('  branch case: if/else path verified ✓')
  }, 20_000)

  test('function helper call chain executes through multiple helpers', async () => {
    if (!serverOnline) return

    await mc.command(`/scoreboard players set #chain_input ${CORE_OBJ} 4`)
    await mc.command(`/function ${CORE_NS}:test_call_chain`)
    await mc.ticks(3)

    expect(await mc.scoreboard('#call_stage_a', CORE_OBJ)).toBe(5)
    expect(await mc.scoreboard('#call_chain', CORE_OBJ)).toBe(10)
    console.log('  call chain case: _chain_step_a -> _chain_step_b -> _chain_step_c ✓')
  }, 20_000)

  test('macro function with storage substitutes runtime argument', async () => {
    if (!serverOnline) return

    await mc.command(`/function ${CORE_NS}:test_macro_with_storage`)
    await mc.ticks(3)

    expect(await mc.scoreboard('#macro_result', CORE_OBJ)).toBe(77)
    console.log('  macro case: function ... with storage substituted $(value) ✓')
  }, 20_000)

  test('load and tick lifecycle hooks are present and deterministic', async () => {
    if (!serverOnline) return

    await mc.command(`/function ${CORE_NS}:__load`)
    await mc.ticks(2)
    expect(await mc.scoreboard('#load_marker', CORE_OBJ)).toBe(41)

    await mc.command(`/scoreboard players set #tick_marker ${CORE_OBJ} 0`)
    await mc.ticks(6)
    const ticked = await mc.scoreboard('#tick_marker', CORE_OBJ)
    expect(ticked).toBeGreaterThanOrEqual(4)

    console.log(`  lifecycle case: load=${41}, tick=${ticked} ✓`)
  }, 20_000)

  test('compile() supports core constructs used in this suite', () => {
    expect(() =>
      compile(`
        fn compile_smoke() {
          let a: int = 2
          let b: int = 3
          if (a + b > 4) {
            a = a * b
          }
        }
      `, { namespace: 'core_oracle_smoke' })
    ).not.toThrow()
  })
})
