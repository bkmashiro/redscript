import { compile } from '../index'

function getFileContent(files: ReturnType<typeof compile>['files'], suffix: string): string {
  const file = files.find(candidate => candidate.path.endsWith(suffix))
  if (!file) {
    throw new Error(`Missing file: ${suffix}`)
  }
  return file.content
}

describe('LICM', () => {
  test('hoists loop-invariant scoreboard read out of foreach', () => {
    const source = `
fn turret_tick() {
  foreach (turret in @e[tag=turret]) {
    let range: int = scoreboard_get("config", "turret_range");
    if (range > 0) {
      if (range > -1) {
        say("ready");
      }
    }
  }
}
`

    const result = compile(source, { namespace: 'test' })
    const parent = getFileContent(result.files, 'data/test/function/turret_tick.mcfunction')
    const loopBody = getFileContent(result.files, 'data/test/function/turret_tick/foreach_0.mcfunction')

    const hoistedRead = 'execute store result score $t0 rs run scoreboard players get config turret_range'
    const executeCall = 'execute as @e[tag=turret] run function test:turret_tick/foreach_0'

    expect(parent).toContain(hoistedRead)
    expect(parent.indexOf(hoistedRead)).toBeLessThan(parent.indexOf(executeCall))
    expect(loopBody).not.toContain('scoreboard players get config turret_range')
  })
})
