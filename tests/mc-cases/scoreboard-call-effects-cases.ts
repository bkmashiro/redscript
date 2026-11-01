import * as path from 'path'
import type { McCoreCaseDescriptor } from '../../src/mc-test/case-runner'
import { COOLDOWN_CASES } from './runtime-boundary-cases'
import { INTEGER_FLOOR_CASES } from './integer-floor-cases'
import { GEOMETRY_FLOOR_CASES } from './geometry-floor-cases'

export const SCORE_EFFECTS_SOURCE_PATH = path.resolve(__dirname, 'scoreboard-call-effects.mcrs')
export const SCORE_EFFECTS_NAMESPACE = 'score_effects_mc'

const scenarios: Array<{
  name: string
  entry: string
  input?: number
  expected: number
  commands?: string[]
}> = [
  { name: 'partial identity helper', entry: 'test_partial_identity', input: -7, expected: -7 },
  { name: 'partial affine helper', entry: 'test_partial_affine', input: 5, expected: 22 },
  { name: 'partial argument order', entry: 'test_partial_order', input: 5, expected: 22 },
  { name: 'constant i32 product', entry: 'test_i32_product', expected: 1 },
  { name: 'readonly transitive helper', entry: 'test_readonly', input: 5, expected: 21 },
  { name: 'readonly helper with negative score', entry: 'test_readonly', input: -7, expected: -27 },
  { name: 'readonly helper with missing score', entry: 'test_readonly', expected: 1 },
  { name: 'explicit mutation remains visible', entry: 'test_mutating', input: 5, expected: 23 },
  { name: 'raw mutation remains visible', entry: 'test_raw', input: 5, expected: 25 },
  {
    name: 'context mutation remains visible', entry: 'test_context_write', input: 5, expected: 12,
    commands: ['summon minecraft:marker 0 64 0 {Tags:["effect_probe"]}'],
  },
]

export const SCORE_EFFECTS_CASES: McCoreCaseDescriptor[] = scenarios.map<McCoreCaseDescriptor>(scenario => ({
  id: `score-effects-${scenario.name.replace(/ /g, '-')}`,
  name: scenario.name,
  namespace: SCORE_EFFECTS_NAMESPACE,
  sourcePath: SCORE_EFFECTS_SOURCE_PATH,
  setupCommands: [
    'kill @e[type=minecraft:marker,tag=effect_probe]',
    'scoreboard players set #result effect_outputs -999',
    // Ensure the missing-score scenario removes an existing entry.
    'scoreboard players set #cooldown effect_inputs 5',
    scenario.input === undefined
      ? 'scoreboard players reset #cooldown effect_inputs'
      : `scoreboard players set #cooldown effect_inputs ${scenario.input}`,
    ...(scenario.commands ?? []),
  ],
  entrypoints: [{ kind: 'function', target: scenario.entry }],
  scoreboardAssertions: [{ player: '#result', obj: 'effect_outputs', value: scenario.expected }],
})).concat(COOLDOWN_CASES, INTEGER_FLOOR_CASES, GEOMETRY_FLOOR_CASES)
