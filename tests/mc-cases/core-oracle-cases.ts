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

export const CORE_ORACLE_CASES: McCoreCaseDescriptor[] = [
  {
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
]
