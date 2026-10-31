import * as path from 'path'
import type { McCoreCaseDescriptor } from '../../src/mc-test/case-runner'

export const SCORE_EFFECTS_SOURCE_PATH = path.resolve(__dirname, 'scoreboard-call-effects.mcrs')
export const SCORE_EFFECTS_NAMESPACE = 'score_effects_mc'

const scenarios: Array<{
  name: string
  entry: string
  input?: number
  expected: number
  commands?: string[]
}> = [
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

export const SCORE_EFFECTS_CASES: McCoreCaseDescriptor[] = scenarios.map(scenario => ({
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
}))
