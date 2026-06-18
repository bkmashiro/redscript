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
const CORE_PLAYERS = [
  '#arith_input',
  '#arith_sum',
  '#arith_product',
  '#branch_input',
  '#branch_result',
  '#branch_loop_input',
  '#branch_loop_result',
  '#chain_input',
  '#call_stage_a',
  '#call_chain',
  '#macro_result',
  '#macro_loop_result',
  '#loop_return_input',
  '#loop_return',
  '#nested_loop_rows',
  '#nested_loop_cols',
  '#nested_loop_result',
  '#if_loop_result',
  '#execute_ctx_total',
  '#objective_player_isolation_result',
  '#storage_nbt_after_fn_result',
  '#tick_control_result',
  '#storage_nbt_rw_result',
  '#foreach_is_check',
  '#tick_marker',
  '#load_marker',
]

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

fn _triangular_sum(limit: int): int {
  let acc: int = 0
  for i in 0..limit {
    acc = acc + i
  }
  return acc
}

fn test_loop_with_function_return() {
  let limit: int = scoreboard_get("#loop_return_input", "${CORE_OBJ}")
  let total: int = _triangular_sum(limit)
  scoreboard_set("#loop_return", "${CORE_OBJ}", total)
}

fn _nested_tmp_sum(rows: int, cols: int): int {
  let grand_total: int = 0
  for row in 0..rows {
    let row_total: int = 0
    for col in 0..cols {
      let cell: int = row * 10 + col
      row_total = row_total + cell
    }
    grand_total = grand_total + row_total
  }
  return grand_total
}

fn test_nested_loop_temp_isolation() {
  let rows: int = scoreboard_get("#nested_loop_rows", "${CORE_OBJ}")
  let cols: int = scoreboard_get("#nested_loop_cols", "${CORE_OBJ}")
  let total: int = _nested_tmp_sum(rows, cols)
  scoreboard_set("#nested_loop_result", "${CORE_OBJ}", total)
}

fn test_if_inside_loop_mutable_scoreboard() {
  scoreboard_set("#if_loop_result", "${CORE_OBJ}", 0)
  for i in 0..5 {
    let cur: int = scoreboard_get("#if_loop_result", "${CORE_OBJ}")
    if (i % 2 == 0) {
      scoreboard_set("#if_loop_result", "${CORE_OBJ}", cur + i)
    } else {
      scoreboard_set("#if_loop_result", "${CORE_OBJ}", cur - i)
    }
  }
}

fn _execute_ctx_count_marked() {
  let observer: int = scoreboard_get("#execute_ctx_total", "${CORE_OBJ}")
  let source: int = scoreboard_get("@s", "${CORE_OBJ}")
  scoreboard_set("#execute_ctx_total", "${CORE_OBJ}", observer + source)
}

fn test_execute_context_and_helper() {
  raw("kill @e[type=armor_stand,tag=core_oracle_exec_ctx_a]")
  raw("kill @e[type=armor_stand,tag=core_oracle_exec_ctx_b]")

  raw("summon minecraft:armor_stand 8 65 0 {Tags:['core_oracle_exec_ctx_a'],NoGravity:1b}")
  raw("summon minecraft:armor_stand 10 65 0 {Tags:['core_oracle_exec_ctx_b'],NoGravity:1b}")
  raw("scoreboard players set @e[type=armor_stand,tag=core_oracle_exec_ctx_a] ${CORE_OBJ} 3")
  raw("scoreboard players set @e[type=armor_stand,tag=core_oracle_exec_ctx_b] ${CORE_OBJ} 4")
  raw("scoreboard players set #execute_ctx_total ${CORE_OBJ} 0")

  as @e[type=armor_stand,tag=core_oracle_exec_ctx_a] at @s {
    _execute_ctx_count_marked()
  }
  as @e[type=armor_stand,tag=core_oracle_exec_ctx_b] at @s {
    _execute_ctx_count_marked()
  }

  raw("kill @e[type=armor_stand,tag=core_oracle_exec_ctx_a]")
  raw("kill @e[type=armor_stand,tag=core_oracle_exec_ctx_b]")
}

fn _branch_loop_term(i: int): int {
  if (i % 2 == 0) {
    return 1
  }
  return -1
}

fn _branch_loop_fold(limit: int): int {
  let out: int = 0
  for i in 0..limit {
    if (i > 0) {
      let sign: int = _branch_loop_term(i)
      if (sign > 0) {
        out = out + i
      } else {
        out = out - i
      }
    }
  }
  return out
}

fn test_branch_loop_function_return() {
  let limit: int = scoreboard_get("#branch_loop_input", "${CORE_OBJ}")
  let computed: int = _branch_loop_fold(limit)
  scoreboard_set("#branch_loop_result", "${CORE_OBJ}", computed)
}

fn _storage_nbt_after_call(seed: int): int {
  if (seed == 0) {
    storage_set_array("rs:core_oracle", "nbt_after_call", "[1, 2, 3]")
  }
  if (seed == 1) {
    storage_set_array("rs:core_oracle", "nbt_after_call", "[4, 5, 6]")
  }
  return storage_get_int("rs:core_oracle", "nbt_after_call", 1)
}

fn test_storage_nbt_read_after_call() {
  storage_set_array("rs:core_oracle", "nbt_after_call", "[0, 0, 0]")
  let first: int = _storage_nbt_after_call(0)
  let second: int = _storage_nbt_after_call(1)
  scoreboard_set("#storage_nbt_after_fn_result", "${CORE_OBJ}", first + second)
}

fn test_scoreboard_objective_player_isolation() {
  let p1a: int = scoreboard_get("#iso_p1", "iso_obj_a")
  let p1b: int = scoreboard_get("#iso_p1", "iso_obj_b")
  let p2a: int = scoreboard_get("#iso_p2", "iso_obj_a")
  let p2b: int = scoreboard_get("#iso_p2", "iso_obj_b")

  scoreboard_set("#objective_player_isolation_result", "${CORE_OBJ}", p1a + p1b + p2a + p2b)
  scoreboard_set("#iso_p1", "iso_obj_a", p1a + 1)
}

@keep
fn __macro_apply() {
  raw("$scoreboard players set #macro_result ${CORE_OBJ} $(value)")
}

fn test_macro_with_storage() {
  raw("data modify storage rs:core_oracle value set value 77")
  raw("function __NS__:__macro_apply with storage rs:core_oracle")
}

fn test_macro_with_storage_in_loop() {
  raw("scoreboard players set #macro_loop_result ${CORE_OBJ} 0")
  for i in 0..3 {
    if (i == 0) {
      raw("data modify storage rs:core_oracle value set value 1")
    }
    if (i == 1) {
      raw("data modify storage rs:core_oracle value set value 3")
    }
    if (i == 2) {
      raw("data modify storage rs:core_oracle value set value 5")
    }

    raw("function ${CORE_NS}:__macro_apply with storage rs:core_oracle")
    let delta: int = scoreboard_get("#macro_loop_result", "${CORE_OBJ}")
    scoreboard_set("#macro_loop_result", "${CORE_OBJ}", delta + 1)
  }
}

fn test_storage_nbt_rw_in_loop() {
  storage_set_array("rs:core_oracle", "nbt_rw", "[1, 2, 3]")
  scoreboard_set("#storage_nbt_rw_result", "${CORE_OBJ}", 0)

  for i in 0..3 {
    if (i == 0) {
      storage_set_array("rs:core_oracle", "nbt_rw", "[1, 3, 5]")
    }
    if (i == 1) {
      storage_set_array("rs:core_oracle", "nbt_rw", "[2, 4, 6]")
    }
    if (i == 2) {
      storage_set_array("rs:core_oracle", "nbt_rw", "[3, 6, 9]")
    }

    let current: int = storage_get_int("rs:core_oracle", "nbt_rw", i)
    let total: int = scoreboard_get("#storage_nbt_rw_result", "${CORE_OBJ}")
    scoreboard_set("#storage_nbt_rw_result", "${CORE_OBJ}", total + current)
  }
}

fn test_foreach_is_check_scores() {
  raw("kill @e[type=armor_stand,tag=core_oracle_foreach]")
  raw("summon minecraft:armor_stand 0 65 0 {Tags:['core_oracle_foreach'],NoGravity:1b}")
  raw("summon minecraft:armor_stand 3 65 0 {Tags:['core_oracle_foreach'],NoGravity:1b}")
  raw("summon minecraft:armor_stand 6 65 0 {Tags:['core_oracle_foreach'],NoGravity:1b}")

  scoreboard_set("#foreach_is_check", "${CORE_OBJ}", 0)
  foreach (ent in @e[type=armor_stand,tag=core_oracle_foreach]) {
    if (ent is ArmorStand) {
      let current: int = scoreboard_get("#foreach_is_check", "${CORE_OBJ}")
      scoreboard_set("#foreach_is_check", "${CORE_OBJ}", current + 1)
    }
  }

  raw("kill @e[type=armor_stand,tag=core_oracle_foreach]")
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

  const sourcePath = path.join(DATAPACK_DIR, `${namespace}.mcrs`)
  const result = compile(source, { namespace, filePath: sourcePath })

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
    return
  }

  serverOnline = await waitForServer()
  if (!serverOnline) {
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
    for (const player of CORE_PLAYERS) {
      await mc.command(`/scoreboard players set ${player} ${CORE_OBJ} 0`)
    }
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

  test('execute as/at/@s context with helper is deterministic', async () => {
    if (!serverOnline) return

    await mc.command(`/function ${CORE_NS}:test_execute_context_and_helper`)
    await mc.ticks(4)
    expect(await mc.scoreboard('#execute_ctx_total', CORE_OBJ)).toBe(7)

    console.log('  execute context helper case: as/at over two tagged entities gives 7 ✓')
  }, 20_000)

  test('branch + loop + function return composes stable output', async () => {
    if (!serverOnline) return

    await mc.command(`/scoreboard players set #branch_loop_input ${CORE_OBJ} 5`)
    await mc.command(`/function ${CORE_NS}:test_branch_loop_function_return`)
    await mc.ticks(3)
    expect(await mc.scoreboard('#branch_loop_result', CORE_OBJ)).toBe(2)

    console.log('  branch+loop+return case: 0..5 alternating sum = 2 ✓')
  }, 20_000)

  test('scoreboard player/objective isolation is preserved', async () => {
    if (!serverOnline) return

    await mc.command('/scoreboard objectives add iso_obj_a dummy').catch(() => {})
    await mc.command('/scoreboard objectives add iso_obj_b dummy').catch(() => {})
    await mc.command('/scoreboard players set #iso_p1 iso_obj_a 10')
    await mc.command('/scoreboard players set #iso_p1 iso_obj_b 100')
    await mc.command('/scoreboard players set #iso_p2 iso_obj_a 200')
    await mc.command('/scoreboard players set #iso_p2 iso_obj_b 50')
    await mc.command(`/scoreboard players set #objective_player_isolation_result ${CORE_OBJ} 0`)

    await mc.command(`/function ${CORE_NS}:test_scoreboard_objective_player_isolation`)
    await mc.ticks(4)
    expect(await mc.scoreboard('#objective_player_isolation_result', CORE_OBJ)).toBe(360)
    expect(await mc.scoreboard('#iso_p1', 'iso_obj_a')).toBe(11)
    expect(await mc.scoreboard('#iso_p1', 'iso_obj_b')).toBe(100)
    expect(await mc.scoreboard('#iso_p2', 'iso_obj_a')).toBe(200)
    expect(await mc.scoreboard('#iso_p2', 'iso_obj_b')).toBe(50)

    console.log('  isolation case: player/objective reads stay separated and only iso_obj_a/#iso_p1 mutates ✓')
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

  test('loop + function return path is stable', async () => {
    if (!serverOnline) return

    await mc.command(`/scoreboard players set #loop_return_input ${CORE_OBJ} 5`)
    await mc.command(`/function ${CORE_NS}:test_loop_with_function_return`)
    await mc.ticks(4)

    expect(await mc.scoreboard('#loop_return', CORE_OBJ)).toBe(10)
    console.log('  loop+return case: triangular sum for 0..5 is 10 ✓')
  }, 20_000)

  test('nested loop temporary variables remain isolated', async () => {
    if (!serverOnline) return

    await mc.command(`/scoreboard players set #nested_loop_rows ${CORE_OBJ} 2`)
    await mc.command(`/scoreboard players set #nested_loop_cols ${CORE_OBJ} 3`)
    await mc.command(`/function ${CORE_NS}:test_nested_loop_temp_isolation`)
    await mc.ticks(4)

    expect(await mc.scoreboard('#nested_loop_result', CORE_OBJ)).toBe(36)
    console.log('  nested loop case: 2x3 accumulation is 36 ✓')
  }, 20_000)

  test('if inside loop mutates mutable scoreboard state', async () => {
    if (!serverOnline) return

    await mc.command(`/function ${CORE_NS}:test_if_inside_loop_mutable_scoreboard`)
    await mc.ticks(4)

    expect(await mc.scoreboard('#if_loop_result', CORE_OBJ)).toBe(2)
    console.log('  loop+if case: scoreboard read/write accumulator result is 2 ✓')
  }, 20_000)

  test('macro with storage works when executed in a loop', async () => {
    if (!serverOnline) return

    await mc.command(`/function ${CORE_NS}:test_macro_with_storage_in_loop`)
    await mc.ticks(6)

    expect(await mc.scoreboard('#macro_loop_result', CORE_OBJ)).toBe(3)
    expect(await mc.scoreboard('#macro_result', CORE_OBJ)).toBe(5)
    console.log('  macro-in-loop case: repeated with storage writes is stable ✓')
  }, 20_000)

  test('storage nbt read-write loop is consistent', async () => {
    if (!serverOnline) return

    await mc.command(`/function ${CORE_NS}:test_storage_nbt_rw_in_loop`)
    await mc.ticks(8)

    expect(await mc.scoreboard('#storage_nbt_rw_result', CORE_OBJ)).toBe(14)
    console.log('  storage/NBT case: looped read/write accumulation is 14 ✓')
  }, 20_000)

  test('storage read after function-call mutation is deterministic', async () => {
    if (!serverOnline) return

    await mc.command(`/function ${CORE_NS}:test_storage_nbt_read_after_call`)
    await mc.ticks(5)

    expect(await mc.scoreboard('#storage_nbt_after_fn_result', CORE_OBJ)).toBe(7)
    console.log('  storage-after-call case: [1,2,3] then [4,5,6] second index total is 7 ✓')
  }, 20_000)

  test('foreach + is-check counts matching entities', async () => {
    if (!serverOnline) return

    await mc.command(`/function ${CORE_NS}:test_foreach_is_check_scores`)
    await mc.ticks(6)

    expect(await mc.scoreboard('#foreach_is_check', CORE_OBJ)).toBe(3)
    console.log('  foreach+is-check case: 3 armor_stand entities counted ✓')
  }, 20_000)

  test('macro function with storage substitutes runtime argument', async () => {
    if (!serverOnline) return

    await mc.command(`/function ${CORE_NS}:test_macro_with_storage`)
    await mc.ticks(3)

    expect(await mc.scoreboard('#macro_result', CORE_OBJ)).toBe(77)
    console.log('  baseline macro case: function ... with storage substituted $(value) ✓')
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

  test('tick lifecycle can be controlled with freeze + step', async () => {
    if (!serverOnline) return

    await mc.command(`/scoreboard players set #tick_marker ${CORE_OBJ} 0`)

    await mc.withTickControl(async step => {
      await step(5)
    })

    const stepped = await mc.scoreboard('#tick_marker', CORE_OBJ)
    await mc.command(`/scoreboard players set #tick_control_result ${CORE_OBJ} ${stepped}`)
    expect(stepped).toBeGreaterThanOrEqual(5)
    expect(await mc.scoreboard('#tick_control_result', CORE_OBJ)).toBe(stepped)

    console.log(`  controlled lifecycle case: step(5) yields tick_marker=${stepped} ✓`)
  }, 20_000)

  test('compile() supports core constructs used in this suite', () => {
    expect(() =>
      compile(`
        fn compile_smoke(): int {
          let seed: int = 3
          let acc: int = 0
          for i in 0..seed {
            if (i > 1) {
              acc = acc + i
            }
          }
          return acc
        }
      `, { namespace: 'core_oracle_smoke' })
    ).not.toThrow()
  })
})
