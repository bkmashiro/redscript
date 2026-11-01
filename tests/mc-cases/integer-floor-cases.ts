import * as path from 'path'
import type { McCoreCaseDescriptor } from '../../src/mc-test/case-runner'

const sourcePath = path.resolve(__dirname, 'integer-floor.mcrs')
const namespace = 'integer_floor_mc'
const vectors: Array<[string, number, number, number, number, number, number]> = [
  ['negative-dividend', -7, 3, -3, 2, -2, -1],
  ['negative-divisor', 7, -3, -3, -2, -2, 1],
  ['both-negative', -7, -3, 2, -1, 2, -1],
  ['overflow', -2147483648, -1, -2147483648, 0, -2147483648, 0],
]
export const INTEGER_FLOOR_CASES: McCoreCaseDescriptor[] = [
  ...vectors.map<McCoreCaseDescriptor>(([name, a, b, quotient, remainder, truncQ, truncR]) => ({
    id: `score-floor-${name}`, name: `compiled floor and trunc helpers: ${name}`,
    namespace, sourcePath,
    featureIds: ['stdlib.math.function.div_trunc', 'stdlib.math.function.mod_trunc'],
    setupCommands: [`scoreboard players set #a effect_inputs ${a}`, `scoreboard players set #b effect_inputs ${b}`],
    entrypoints: [{ kind: 'function', target: 'test_floor_dynamic' }],
    scoreboardAssertions: [
      { player: '#quotient', obj: 'effect_outputs', value: quotient },
      { player: '#remainder', obj: 'effect_outputs', value: remainder },
      { player: '#trunc_q', obj: 'effect_outputs', value: truncQ },
      { player: '#trunc_r', obj: 'effect_outputs', value: truncR },
    ],
  })),
  {
    id: 'score-floor-literal', name: 'literal floor agrees with dynamic lowering', namespace, sourcePath,
    featureIds: ['stdlib.math.function.div_trunc', 'stdlib.math.function.mod_trunc'],
    entrypoints: [{ kind: 'function', target: 'test_floor_literal' }],
    scoreboardAssertions: [
      { player: '#quotient', obj: 'effect_outputs', value: -3 },
      { player: '#remainder', obj: 'effect_outputs', value: 2 },
      { player: '#trunc_q', obj: 'effect_outputs', value: -2 },
      { player: '#trunc_r', obj: 'effect_outputs', value: -1 },
    ],
  },
]
