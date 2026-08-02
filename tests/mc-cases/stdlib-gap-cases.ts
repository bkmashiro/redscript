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
    featureIds: ['stdlib.advanced.fib'],
    librarySourcePaths: [stdlib('math'), stdlib('advanced')],
    scoreboardAssertions: [{ player: '#advanced', obj: 'gap_result', value: 55 }],
  },
  {
    ...base('expr', 'gap_expr'),
    featureIds: ['stdlib.expr.expr-eval'],
    librarySourcePaths: [stdlib('math'), stdlib('expr')],
    scoreboardAssertions: [{ player: '#expr', obj: 'gap_result', value: 40000 }],
  },
  {
    ...base('linalg', 'gap_linalg'),
    featureIds: ['stdlib.linalg.vec2d-dot'],
    librarySourcePaths: [stdlib('math_hp'), stdlib('linalg')],
    scoreboardAssertions: [{ player: '#linalg', obj: 'gap_result', value: 110000 }],
  },
  {
    ...base('result', 'gap_result_ns'),
    featureIds: ['stdlib.result.divide-value'],
    librarySourcePaths: [stdlib('result')],
    scoreboardAssertions: [{ player: '#result', obj: 'gap_result', value: 5 }],
  },
  {
    ...base('state', 'gap_state'),
    featureIds: ['stdlib.state.set-is-state'],
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
