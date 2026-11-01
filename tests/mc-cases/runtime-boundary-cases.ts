import * as path from 'path'
import type { McCoreCaseDescriptor } from '../../src/mc-test/case-runner'

const sourcePath = path.resolve(__dirname, 'runtime-boundary.mcrs')
const namespace = 'runtime_boundary_mc'

export const COOLDOWN_CASES: McCoreCaseDescriptor[] = [
  ...[false, true].map<McCoreCaseDescriptor>(elapsed => ({
    id: elapsed ? 'score-effects-cooldown-expiry' : 'score-effects-runtime-boundary',
    name: elapsed ? 'explicit cooldown fires at its deadline' : 'explicit cooldown blocks repeated calls',
    namespace, sourcePath,
    featureIds: ['stdlib.cooldown.function.cooldown_start', 'stdlib.cooldown.function.cooldown_ready'],
    setupCommands: [
      'scoreboard players set #calls effect_outputs 0',
      `scoreboard players set #now effect_inputs ${elapsed ? 105 : 100}`,
      `scoreboard players set #deadline effect_outputs ${elapsed ? 105 : 0}`,
    ],
    entrypoints: [{ kind: 'function', target: 'test_runtime_boundary' }],
    scoreboardAssertions: [
      { player: '#result', obj: 'effect_outputs', value: 1 },
      { player: '#deadline', obj: 'effect_outputs', value: elapsed ? 110 : 105 },
    ],
  })),
  {
    id: 'score-effects-independent-cooldowns', name: 'independent deadlines and duration boundaries',
    namespace, sourcePath,
    entrypoints: [{ kind: 'function', target: 'test_independent_deadlines' }],
    featureIds: ['stdlib.cooldown.function.cooldown_start', 'stdlib.cooldown.function.cooldown_ready', 'stdlib.cooldown.function.cooldown_remaining'],
    scoreboardAssertions: Object.entries({
      '#sword': 140, '#bow': 110, '#remaining': 30, '#bow_ready': 1, '#sword_ready': 0,
      '#zero': 100, '#negative': 100, '#saturated': 2147483647,
    }).map(([player, value]) => ({ player, obj: 'effect_outputs', value })),
  },
]
