import * as path from 'path'
import type { McCoreCaseDescriptor } from '../../src/mc-test/case-runner'

export const CORE_ORACLE_NAMESPACE = 'core_oracle_mc'
export const CORE_ORACLE_OBJECTIVE = 'core_oracle'
export const CORE_ORACLE_SOURCE_PATH = path.resolve(
  process.cwd(),
  'tests',
  'mc-cases',
  'core-oracle.mcrs',
)

const CORE_ORACLE_CASE_DEFINITIONS: McCoreCaseDescriptor[] = [
  {
    id: 'core.scoreboard-arithmetic',
    name: 'scoreboard arithmetic',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: [
      'scoreboard players set #arith_input core_oracle 10',
      'scoreboard players set #arith_sum core_oracle 0',
      'scoreboard players set #arith_product core_oracle 0',
    ],
    entrypoints: [{ kind: 'function', target: 'test_arithmetic' }],
    waitTicks: 4,
    scoreboardAssertions: [
      { player: '#arith_sum', obj: CORE_ORACLE_OBJECTIVE, value: 16 },
      { player: '#arith_product', obj: CORE_ORACLE_OBJECTIVE, value: 50 },
    ],
  },
  {
    id: 'core.branch-true-path',
    name: 'branch true path',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: ['scoreboard players set #branch_input core_oracle 12'],
    entrypoints: [{ kind: 'function', target: 'test_branch' }],
    waitTicks: 3,
    scoreboardAssertions: [
      { player: '#branch_result', obj: CORE_ORACLE_OBJECTIVE, value: 1 },
    ],
  },
  {
    id: 'core.branch-false-path',
    name: 'branch false path',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: ['scoreboard players set #branch_input core_oracle 3'],
    entrypoints: [{ kind: 'function', target: 'test_branch' }],
    waitTicks: 3,
    scoreboardAssertions: [
      { player: '#branch_result', obj: CORE_ORACLE_OBJECTIVE, value: 0 },
    ],
  },
  {
    id: 'core.execute-context-helper',
    name: 'execute context helper',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    entrypoints: [{ kind: 'function', target: 'test_execute_context_and_helper' }],
    waitTicks: 4,
    scoreboardAssertions: [
      { player: '#execute_ctx_total', obj: CORE_ORACLE_OBJECTIVE, value: 7 },
    ],
  },
  {
    id: 'core.function-call-chain',
    name: 'function call chain',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: [
      'scoreboard players set #chain_input core_oracle 4',
      'scoreboard players set #call_stage_a core_oracle 0',
      'scoreboard players set #call_chain core_oracle 0',
    ],
    entrypoints: [{ kind: 'function', target: 'test_call_chain' }],
    waitTicks: 3,
    scoreboardAssertions: [
      { player: '#call_stage_a', obj: CORE_ORACLE_OBJECTIVE, value: 5 },
      { player: '#call_chain', obj: CORE_ORACLE_OBJECTIVE, value: 10 },
    ],
  },
  {
    id: 'core.branch-loop-function-return',
    name: 'branch loop function return',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: ['scoreboard players set #branch_loop_input core_oracle 5'],
    entrypoints: [{ kind: 'function', target: 'test_branch_loop_function_return' }],
    waitTicks: 3,
    scoreboardAssertions: [
      { player: '#branch_loop_result', obj: CORE_ORACLE_OBJECTIVE, value: 2 },
    ],
  },
  {
    id: 'core.loop-function-return',
    name: 'loop function return',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: ['scoreboard players set #loop_return_input core_oracle 5'],
    entrypoints: [{ kind: 'function', target: 'test_loop_with_function_return' }],
    waitTicks: 4,
    scoreboardAssertions: [
      { player: '#loop_return', obj: CORE_ORACLE_OBJECTIVE, value: 10 },
    ],
  },
  {
    id: 'core.nested-loop-temporary-isolation',
    name: 'nested loop temporary isolation',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: [
      'scoreboard players set #nested_loop_rows core_oracle 2',
      'scoreboard players set #nested_loop_cols core_oracle 3',
    ],
    entrypoints: [{ kind: 'function', target: 'test_nested_loop_temp_isolation' }],
    waitTicks: 4,
    scoreboardAssertions: [
      { player: '#nested_loop_result', obj: CORE_ORACLE_OBJECTIVE, value: 36 },
    ],
  },
  {
    id: 'core.if-inside-loop-mutates-scoreboard-state',
    name: 'if inside loop mutates scoreboard state',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    entrypoints: [{ kind: 'function', target: 'test_if_inside_loop_mutable_scoreboard' }],
    waitTicks: 4,
    scoreboardAssertions: [
      { player: '#if_loop_result', obj: CORE_ORACLE_OBJECTIVE, value: 2 },
    ],
  },
  {
    id: 'core.scoreboard-objective-player-isolation',
    name: 'scoreboard objective/player isolation',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: [
      'scoreboard objectives add iso_obj_a dummy',
      'scoreboard objectives add iso_obj_b dummy',
      'scoreboard players set #iso_p1 iso_obj_a 10',
      'scoreboard players set #iso_p1 iso_obj_b 100',
      'scoreboard players set #iso_p2 iso_obj_a 200',
      'scoreboard players set #iso_p2 iso_obj_b 50',
      'scoreboard players set #objective_player_isolation_result core_oracle 0',
    ],
    entrypoints: [{ kind: 'function', target: 'test_scoreboard_objective_player_isolation' }],
    waitTicks: 4,
    scoreboardAssertions: [
      { player: '#objective_player_isolation_result', obj: CORE_ORACLE_OBJECTIVE, value: 360 },
      { player: '#iso_p1', obj: 'iso_obj_a', value: 11 },
      { player: '#iso_p1', obj: 'iso_obj_b', value: 100 },
      { player: '#iso_p2', obj: 'iso_obj_a', value: 200 },
      { player: '#iso_p2', obj: 'iso_obj_b', value: 50 },
    ],
  },
  {
    id: 'core.macro-with-storage',
    name: 'macro with storage',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    entrypoints: [{ kind: 'function', target: 'test_macro_with_storage' }],
    waitTicks: 3,
    scoreboardAssertions: [
      { player: '#macro_result', obj: CORE_ORACLE_OBJECTIVE, value: 77 },
    ],
  },
  {
    id: 'core.macro-with-storage-in-loop',
    name: 'macro with storage in loop',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    entrypoints: [{ kind: 'function', target: 'test_macro_with_storage_in_loop' }],
    waitTicks: 6,
    scoreboardAssertions: [
      { player: '#macro_loop_result', obj: CORE_ORACLE_OBJECTIVE, value: 3 },
      { player: '#macro_result', obj: CORE_ORACLE_OBJECTIVE, value: 5 },
    ],
  },
  {
    id: 'core.storage-read-after-call',
    name: 'storage read-after-call',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    entrypoints: [{ kind: 'function', target: 'test_storage_nbt_read_after_call' }],
    waitTicks: 5,
    scoreboardAssertions: [
      { player: '#storage_nbt_after_fn_result', obj: CORE_ORACLE_OBJECTIVE, value: 7 },
    ],
  },
  {
    id: 'core.generated-array-macro-nested-loop',
    name: 'generated array macro nested loop',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: ['scoreboard players set #generated_macro_nested_sum core_oracle 0'],
    entrypoints: [{ kind: 'function', target: 'test_generated_array_macro_nested_loop' }],
    waitTicks: 8,
    scoreboardAssertions: [
      { player: '#generated_macro_nested_sum', obj: CORE_ORACLE_OBJECTIVE, value: 16 },
    ],
  },
  {
    id: 'core.storage-read-write-loop',
    name: 'storage read-write loop',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    entrypoints: [{ kind: 'function', target: 'test_storage_nbt_rw_in_loop' }],
    waitTicks: 8,
    scoreboardAssertions: [
      { player: '#storage_nbt_rw_result', obj: CORE_ORACLE_OBJECTIVE, value: 14 },
    ],
  },
  {
    id: 'core.foreach-is-check-counting',
    name: 'foreach is-check counting',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    entrypoints: [{ kind: 'function', target: 'test_foreach_is_check_scores' }],
    waitTicks: 6,
    scoreboardAssertions: [
      { player: '#foreach_is_check', obj: CORE_ORACLE_OBJECTIVE, value: 3 },
    ],
  },
  {
    id: 'core.direct-parameter-helper-entrypoints',
    name: 'direct parameter helper entrypoints',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: ['scoreboard players set $p0 __core_oracle_mc 5', 'scoreboard players set #call_stage_a core_oracle 0', 'scoreboard players set #call_chain core_oracle 0'],
    entrypoints: [
      { kind: 'function', target: '_chain_step_a' },
      { kind: 'function', target: '_chain_step_b' },
      { kind: 'function', target: '_chain_step_c' },
    ],
    waitTicks: 2,
    scoreboardAssertions: [
      { player: '#call_stage_a', obj: CORE_ORACLE_OBJECTIVE, value: 6 },
      { player: '#call_chain', obj: CORE_ORACLE_OBJECTIVE, value: 5 },
    ],
  },
  {
    id: 'core.load-lifecycle-hook',
    name: 'load lifecycle hook',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    entrypoints: [{ kind: 'function', target: '__load' }],
    waitTicks: 2,
    scoreboardAssertions: [
      { player: '#load_marker', obj: CORE_ORACLE_OBJECTIVE, value: 41 },
    ],
  },
  {
    id: 'core.tick-lifecycle-hook',
    name: 'tick lifecycle hook',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: ['scoreboard players set #tick_marker core_oracle 0'],
    waitTicks: 6,
    scoreboardAssertions: [
      { player: '#tick_marker', obj: CORE_ORACLE_OBJECTIVE, value: 4, op: 'gte' },
    ],
  },
  {
    id: 'core.controlled-tick-lifecycle-hook',
    name: 'controlled tick lifecycle hook',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: ['scoreboard players set #tick_marker core_oracle 0'],
    controlledTicks: 5,
    scoreboardAssertions: [
      { player: '#tick_marker', obj: CORE_ORACLE_OBJECTIVE, value: 5, op: 'gte' },
    ],
  },
  {
    id: 'core.controlled-timer-countdown-via-tick-hook',
    name: 'controlled timer countdown via tick hook',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: [
      'scoreboard players set #tick_marker core_oracle 0',
      'scoreboard players set #timer_countdown core_oracle 0',
      'scoreboard players set #timer_done core_oracle 0',
    ],
    entrypoints: [{ kind: 'function', target: 'test_controlled_timer_countdown' }],
    controlledTicks: 4,
    scoreboardAssertions: [
      { player: '#timer_countdown', obj: CORE_ORACLE_OBJECTIVE, value: 0 },
      { player: '#timer_done', obj: CORE_ORACLE_OBJECTIVE, value: 1 },
    ],
  },
  {
    id: 'core.world-setblock-smoke',
    name: 'world setblock smoke',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: ['scoreboard players set #world_block_check core_oracle 0'],
    entrypoints: [{ kind: 'function', target: 'test_world_block_smoke' }],
    waitTicks: 2,
    scoreboardAssertions: [
      { player: '#world_block_check', obj: CORE_ORACLE_OBJECTIVE, value: 1 },
    ],
  },
  {
    id: 'core.visual-command-boundary-smoke',
    name: 'visual command boundary smoke',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: [
      'scoreboard players set #visual_title_smoke core_oracle 0',
      'scoreboard players set #visual_playsound_smoke core_oracle 0',
      'scoreboard players set #visual_bossbar_smoke core_oracle 0',
    ],
    entrypoints: [{ kind: 'function', target: 'test_visual_command_boundary_smoke' }],
    waitTicks: 3,
    scoreboardAssertions: [
      { player: '#visual_title_smoke', obj: CORE_ORACLE_OBJECTIVE, value: 1 },
      { player: '#visual_playsound_smoke', obj: CORE_ORACLE_OBJECTIVE, value: 1 },
      { player: '#visual_bossbar_smoke', obj: CORE_ORACLE_OBJECTIVE, value: 1 },
    ],
  },
  {
    id: 'core.inventory-equipment-smoke',
    name: 'inventory equipment smoke',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: ['scoreboard players set #item_replace_check core_oracle 0'],
    entrypoints: [{ kind: 'function', target: 'test_inventory_equipment_smoke' }],
    waitTicks: 3,
    scoreboardAssertions: [
      { player: '#item_replace_check', obj: CORE_ORACLE_OBJECTIVE, value: 1 },
    ],
  },
  {
    id: 'core.bounded-random-range-smoke',
    name: 'bounded random range smoke',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: ['scoreboard players set #random_range_check core_oracle 0'],
    entrypoints: [{ kind: 'function', target: 'test_random_range_smoke' }],
    waitTicks: 2,
    scoreboardAssertions: [
      { player: '#random_range_check', obj: CORE_ORACLE_OBJECTIVE, value: 1 },
    ],
  },
  {
    id: 'core.spawn-entity-smoke',
    name: 'spawn entity smoke',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: [
      'kill @e[type=pig,tag=core_oracle_spawn]',
      'scoreboard players set #spawn_entity_check core_oracle 0',
    ],
    entrypoints: [{ kind: 'function', target: 'test_spawn_entity_smoke' }],
    waitTicks: 2,
    scoreboardAssertions: [
      { player: '#spawn_entity_check', obj: CORE_ORACLE_OBJECTIVE, value: 1 },
    ],
  },
  {
    id: 'core.particle-command-smoke',
    name: 'particle command smoke',
    namespace: CORE_ORACLE_NAMESPACE,
    sourcePath: CORE_ORACLE_SOURCE_PATH,
    setupCommands: ['scoreboard players set #particle_check core_oracle 0'],
    entrypoints: [{ kind: 'function', target: 'test_particle_smoke' }],
    waitTicks: 2,
    scoreboardAssertions: [
      { player: '#particle_check', obj: CORE_ORACLE_OBJECTIVE, value: 1 },
    ],
  },
]

export const CORE_ORACLE_FEATURE_IDS: Readonly<Record<string, readonly string[]>> = {
  'core.scoreboard-arithmetic': ['language.integer-arithmetic'],
  'core.branch-true-path': ['language.if-else'],
  'core.branch-false-path': ['language.if-else'],
  'core.execute-context-helper': ['backend.execute-context'],
  'core.function-call-chain': ['language.function-call'],
  'core.branch-loop-function-return': ['lowering.return.branch-loop'],
  'core.loop-function-return': ['lowering.return.loop'],
  'core.nested-loop-temporary-isolation': ['lowering.loop.temporary-isolation'],
  'core.if-inside-loop-mutates-scoreboard-state': ['lowering.if.loop-state'],
  'core.scoreboard-objective-player-isolation': ['backend.scoreboard.isolation'],
  'core.macro-with-storage': ['backend.macro.storage'],
  'core.macro-with-storage-in-loop': ['backend.macro.storage-loop'],
  'core.storage-read-after-call': ['backend.storage.call-readback'],
  'core.generated-array-macro-nested-loop': ['lowering.array.macro-nested-loop'],
  'core.storage-read-write-loop': ['backend.storage.read-write-loop'],
  'core.foreach-is-check-counting': ['language.foreach-is-check'],
  'core.direct-parameter-helper-entrypoints': ['backend.scoreboard-parameter-abi', 'language.parameterized-call'],
  'core.load-lifecycle-hook': ['decorator.load'],
  'core.tick-lifecycle-hook': ['decorator.tick'],
  'core.controlled-tick-lifecycle-hook': ['decorator.tick-controlled'],
  'core.controlled-timer-countdown-via-tick-hook': ['decorator.tick-timer'],
  'core.world-setblock-smoke': ['stdlib.world.setblock'],
  'core.visual-command-boundary-smoke': ['stdlib.message.command-boundary'],
  'core.inventory-equipment-smoke': ['stdlib.inventory.equipment'],
  'core.bounded-random-range-smoke': ['stdlib.random.bounded-range'],
  'core.spawn-entity-smoke': ['stdlib.spawn.entity'],
  'core.particle-command-smoke': ['stdlib.particles.command-boundary'],
}

export const CORE_ORACLE_CASES: McCoreCaseDescriptor[] = CORE_ORACLE_CASE_DEFINITIONS.map(definition => {
  const id = definition.id
  const featureIds = id == null ? undefined : CORE_ORACLE_FEATURE_IDS[id]
  if (id == null || featureIds == null || featureIds.length === 0) {
    throw new Error(`Missing feature mapping for core oracle case '${id ?? definition.name}'`)
  }
  return { ...definition, featureIds }
})
