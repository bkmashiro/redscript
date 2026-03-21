/**
 * Coverage for src/events/types.ts
 */

import {
  isEventTypeName,
  getEventParamSpecs,
  EVENT_TYPES,
} from '../events/types'

describe('events/types — isEventTypeName', () => {
  test('returns true for known event types', () => {
    expect(isEventTypeName('PlayerDeath')).toBe(true)
    expect(isEventTypeName('PlayerJoin')).toBe(true)
    expect(isEventTypeName('BlockBreak')).toBe(true)
    expect(isEventTypeName('EntityKill')).toBe(true)
    expect(isEventTypeName('ItemUse')).toBe(true)
  })

  test('returns false for unknown strings', () => {
    expect(isEventTypeName('Unknown')).toBe(false)
    expect(isEventTypeName('')).toBe(false)
    expect(isEventTypeName('playerdeath')).toBe(false)
  })
})

describe('events/types — getEventParamSpecs', () => {
  test('PlayerDeath returns player param of entity type', () => {
    const specs = getEventParamSpecs('PlayerDeath')
    expect(specs).toHaveLength(1)
    expect(specs[0].name).toBe('player')
    expect(specs[0].type.kind).toBe('entity')
  })

  test('PlayerJoin returns player param', () => {
    const specs = getEventParamSpecs('PlayerJoin')
    expect(specs).toHaveLength(1)
    expect(specs[0].name).toBe('player')
  })

  test('BlockBreak returns player param', () => {
    const specs = getEventParamSpecs('BlockBreak')
    expect(specs).toHaveLength(1)
    expect(specs[0].name).toBe('player')
  })

  test('EntityKill returns player param', () => {
    const specs = getEventParamSpecs('EntityKill')
    expect(specs).toHaveLength(1)
    expect(specs[0].name).toBe('player')
  })

  test('ItemUse returns player param', () => {
    const specs = getEventParamSpecs('ItemUse')
    expect(specs).toHaveLength(1)
    expect(specs[0].name).toBe('player')
  })

  test('all event types have tag, params, detection', () => {
    for (const [name, info] of Object.entries(EVENT_TYPES)) {
      expect(info.tag).toBeTruthy()
      expect(Array.isArray(info.params)).toBe(true)
      expect(info.detection).toBeTruthy()
    }
  })
})
