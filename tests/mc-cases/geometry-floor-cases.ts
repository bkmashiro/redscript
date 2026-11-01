import * as path from 'path'
import type { McCoreCaseDescriptor } from '../../src/mc-test/case-runner'

const vectors: Array<[string, number, number]> = [
  ['positive', 250, 2], ['negative-one', -1, -1], ['negative-boundary', -100, -1],
  ['negative-past-boundary', -101, -2], ['minimum-integer', -2147483648, -21474837],
]
export const GEOMETRY_FLOOR_CASES: McCoreCaseDescriptor[] = vectors.map(([name, coord, expected]) => ({
  id: `geometry-floor-${name}`, name: `native tile floor: ${name}`,
  namespace: 'geometry_floor_mc', sourcePath: path.resolve(__dirname, 'geometry-floor.mcrs'),
  featureIds: ['stdlib.geometry.function.tile_of'],
  setupCommands: [`scoreboard players set #coord effect_inputs ${coord}`],
  entrypoints: [{ kind: 'function', target: 'test_tile_floor' }],
  scoreboardAssertions: [{ player: '#tile', obj: 'effect_outputs', value: expected }],
}))
