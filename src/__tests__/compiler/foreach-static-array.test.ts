import { compile } from '../../emit/compile'

describe('foreach over static int arrays', () => {
  test('binds each literal element so match/branch lowering can use the foreach variable', () => {
    expect(() => compile(`
      enum Lane { North, South, East, West }

      fn spawn_enemy_wave() {
        let lanes: int[] = [0, 1, 2, 3]

        foreach (lane in lanes) {
          match (lane) {
            Lane.North => { summon("minecraft:zombie", (0, 65, -10)) }
            Lane.South => { summon("minecraft:zombie", (0, 65, 10)) }
            Lane.East => { summon("minecraft:zombie", (10, 65, 0)) }
            _ => { summon("minecraft:zombie", (-10, 65, 0)) }
          }
        }
      }
    `, { namespace: 'foreach_static_array' })).not.toThrow()
  })
})
