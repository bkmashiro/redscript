import { entityTypeFromMinecraftType, isEntitySubtype, isKnownEntityType } from '../../typechecker/entities'

describe('typechecker entity helpers', () => {
  test('recognizes known entity types and subtype hierarchy', () => {
    expect(isKnownEntityType('Player')).toBe(true)
    expect(isKnownEntityType('BlockBreak')).toBe(false)
    expect(isEntitySubtype('Zombie', 'HostileMob')).toBe(true)
    expect(isEntitySubtype('Zombie', 'Mob')).toBe(true)
    expect(isEntitySubtype('Zombie', 'Player')).toBe(false)
  })

  test('maps minecraft entity ids to RedScript entity types', () => {
    expect(entityTypeFromMinecraftType('minecraft:zombie')).toBe('Zombie')
    expect(entityTypeFromMinecraftType('armor_stand')).toBe('ArmorStand')
    expect(entityTypeFromMinecraftType('minecraft:unknown')).toBeUndefined()
  })
})
