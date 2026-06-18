import { fnNameToPath, humanFunctionName, qualifiedFunctionRef } from '../../emit/paths'

describe('emit path helpers', () => {
  test('normalizes LIR function names to datapack paths and refs', () => {
    expect(fnNameToPath('Player::Heal', 'game')).toBe('data/game/function/player/heal.mcfunction')
    expect(qualifiedFunctionRef('Player::Heal', 'game')).toBe('game:player/heal')
  })

  test('uses source snippet for human function names when available', () => {
    expect(humanFunctionName({
      name: 'Player::Heal',
      sourceSnippet: 'fn heal(self: Player): void {',
    })).toBe('heal')
    expect(humanFunctionName({ name: 'Player::Heal' })).toBe('Heal')
  })
})
