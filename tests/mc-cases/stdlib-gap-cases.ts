import * as path from 'path'

import type { McCoreCaseDescriptor } from '../../src/mc-test/case-runner'

const fixture = (name: string): string => path.resolve(__dirname, `stdlib-gap-${name}.mcrs.fixture`)
const stdlib = (name: string): string => path.resolve(__dirname, '..', '..', 'src', 'stdlib', `${name}.mcrs`)
const base = (id: string, namespace: string): Pick<McCoreCaseDescriptor, 'id' | 'name' | 'namespace' | 'sourcePath' | 'entrypoints' | 'waitTicks'> => ({
  id: `stdlib-gap.${id}`,
  name: `${id} representative semantic oracle`,
  namespace,
  sourcePath: fixture(id),
  entrypoints: [{ kind: 'function', target: 'test_gap' }],
  waitTicks: 2,
})

export const STDLIB_GAP_CASES: McCoreCaseDescriptor[] = [
  {
    ...base('advanced', 'gap_advanced'),
    featureIds: ['stdlib.advanced.function.fib'],
    librarySourcePaths: [stdlib('math'), stdlib('advanced')],
    scoreboardAssertions: [{ player: '#advanced', obj: 'gap_result', value: 55 }],
  },
  {
    ...base('bits', 'gap_bits'),
    featureIds: [
      'stdlib.bits.function.bit_and',
      'stdlib.bits.function.bit_clear',
      'stdlib.bits.function.bit_get',
      'stdlib.bits.function.bit_not',
      'stdlib.bits.function.bit_or',
      'stdlib.bits.function.bit_set',
      'stdlib.bits.function.bit_shl',
      'stdlib.bits.function.bit_shr',
      'stdlib.bits.function.bit_toggle',
      'stdlib.bits.function.bit_xor',
      'stdlib.bits.function.popcount',
    ],
    librarySourcePaths: [stdlib('bits')],
    scoreboardAssertions: [
      { player: '#bit_and', obj: 'gap_result', value: 8 },
      { player: '#bit_or', obj: 'gap_result', value: 14 },
      { player: '#bit_xor', obj: 'gap_result', value: 6 },
      { player: '#bit_not', obj: 'gap_result', value: 2147483647 },
      { player: '#bit_shl', obj: 'gap_result', value: 16 },
      { player: '#bit_shr', obj: 'gap_result', value: 4 },
      { player: '#bit_get', obj: 'gap_result', value: 1 },
      { player: '#bit_set', obj: 'gap_result', value: 4 },
      { player: '#bit_clear', obj: 'gap_result', value: 0 },
      { player: '#bit_toggle', obj: 'gap_result', value: 7 },
      { player: '#popcount', obj: 'gap_result', value: 8 },
    ],
  },
  {
    ...base('expr', 'gap_expr'),
    featureIds: ['stdlib.expr.function.expr_eval'],
    librarySourcePaths: [stdlib('math'), stdlib('expr')],
    scoreboardAssertions: [{ player: '#expr', obj: 'gap_result', value: 40000 }],
  },
  {
    ...base('linalg', 'gap_linalg'),
    featureIds: ['stdlib.linalg.function.vec2d_dot'],
    librarySourcePaths: [stdlib('math_hp'), stdlib('linalg')],
    scoreboardAssertions: [
      { player: '#linalg_mul1', obj: 'gap_result', op: 'gte', value: 29999 },
      { player: '#linalg_mul1', obj: 'gap_result', op: 'lte', value: 30001 },
      { player: '#linalg_mul2', obj: 'gap_result', op: 'gte', value: 79999 },
      { player: '#linalg_mul2', obj: 'gap_result', op: 'lte', value: 80001 },
      { player: '#linalg', obj: 'gap_result', op: 'gte', value: 109999 },
      { player: '#linalg', obj: 'gap_result', op: 'lte', value: 110001 },
    ],
  },
  {
    ...base('sets', 'gap_sets'),
    featureIds: [
      'stdlib.sets.function.set_new',
      'stdlib.sets.function.set_add',
      'stdlib.sets.function.set_contains',
      'stdlib.sets.function.set_remove',
      'stdlib.sets.function.set_clear',
    ],
    librarySourcePaths: [stdlib('sets')],
    scoreboardAssertions: [
      { player: '#sets_duplicate', obj: 'gap_result', value: 1 },
      { player: '#sets_removed', obj: 'gap_result', value: 0 },
      { player: '#sets_cleared', obj: 'gap_result', value: 0 },
      { player: '#sets_second', obj: 'gap_result', value: 1 },
      { player: '#sets_isolated', obj: 'gap_result', value: 0 },
    ],
  },
  {
    ...base('result', 'gap_result_ns'),
    featureIds: [
      'stdlib.result.function.result_divide',
      'stdlib.result.function.result_value',
    ],
    librarySourcePaths: [stdlib('result')],
    scoreboardAssertions: [{ player: '#result', obj: 'gap_result', value: 5 }],
  },
  {
    ...base('state', 'gap_state'),
    featureIds: [
      'stdlib.state.function.set_state',
      'stdlib.state.function.is_state',
    ],
    librarySourcePaths: [stdlib('state')],
    setupCommands: [
      'kill @e[tag=gap_state_target]',
      'summon armor_stand 0 64 0 {Tags:["gap_state_target"],Invisible:1b}',
      'scoreboard objectives add rs.state dummy',
    ],
    entrypoints: [{ kind: 'function', target: 'test_gap', executeAs: '@e[tag=gap_state_target,limit=1]' }],
    scoreboardAssertions: [{ player: '#state', obj: 'gap_result', value: 1 }],
  },
]
