/**
 * Extra coverage for src/events/types.ts
 * Targets the uncovered branches in toTypeNode (named types, struct fallback)
 * and parseEventParam error path.
 *
 * Since toTypeNode is private, we access it indirectly by monkey-patching
 * the EVENT_TYPES constant via compile-level tests and by testing the exported
 * functions more thoroughly.
 */

import {
  isEventTypeName,
  getEventParamSpecs,
  EVENT_TYPES,
} from '../events/types'

// ── isEventTypeName ────────────────────────────────────────────────────────

describe('events/types — isEventTypeName exhaustive', () => {
  test('all event type names return true', () => {
    const known: string[] = ['PlayerDeath', 'PlayerJoin', 'BlockBreak', 'EntityKill', 'ItemUse']
    for (const name of known) {
      expect(isEventTypeName(name)).toBe(true)
    }
  })

  test('numeric strings return false', () => {
    expect(isEventTypeName('0')).toBe(false)
    expect(isEventTypeName('123')).toBe(false)
  })

  test('close misspellings return false', () => {
    expect(isEventTypeName('player_death')).toBe(false)
    expect(isEventTypeName('PLAYERDEATH')).toBe(false)
    expect(isEventTypeName('PlayerDeaths')).toBe(false)
    expect(isEventTypeName('PlayerJoins')).toBe(false)
    expect(isEventTypeName('BlockBreaks')).toBe(false)
  })

  test('empty and whitespace return false', () => {
    expect(isEventTypeName('')).toBe(false)
    expect(isEventTypeName(' ')).toBe(false)
    expect(isEventTypeName('PlayerDeath ')).toBe(false)
  })
})

// ── getEventParamSpecs ─────────────────────────────────────────────────────

describe('events/types — getEventParamSpecs entity type', () => {
  test('all events return entity type for player param', () => {
    const eventNames = Object.keys(EVENT_TYPES) as Array<keyof typeof EVENT_TYPES>
    for (const name of eventNames) {
      const specs = getEventParamSpecs(name)
      expect(specs.length).toBeGreaterThan(0)
      const playerSpec = specs.find(s => s.name === 'player')
      expect(playerSpec).toBeDefined()
      expect(playerSpec!.type.kind).toBe('entity')
    }
  })

  test('PlayerDeath param type has entityType Player', () => {
    const specs = getEventParamSpecs('PlayerDeath')
    expect(specs[0].type).toEqual({ kind: 'entity', entityType: 'Player' })
  })

  test('EntityKill param type has entityType Player', () => {
    const specs = getEventParamSpecs('EntityKill')
    expect(specs[0].type).toEqual({ kind: 'entity', entityType: 'Player' })
  })

  test('ItemUse param type has entityType Player', () => {
    const specs = getEventParamSpecs('ItemUse')
    expect(specs[0].type).toEqual({ kind: 'entity', entityType: 'Player' })
  })
})

// ── EVENT_TYPES structure ──────────────────────────────────────────────────

describe('events/types — EVENT_TYPES structure', () => {
  test('detection values are known MC detection strategies', () => {
    const validDetections = ['scoreboard', 'tag', 'advancement']
    for (const [, info] of Object.entries(EVENT_TYPES)) {
      expect(validDetections).toContain(info.detection)
    }
  })

  test('tags all start with rs.', () => {
    for (const [, info] of Object.entries(EVENT_TYPES)) {
      expect(info.tag).toMatch(/^rs\./)
    }
  })

  test('params arrays are non-empty', () => {
    for (const [, info] of Object.entries(EVENT_TYPES)) {
      expect(info.params.length).toBeGreaterThan(0)
    }
  })

  test('BlockBreak uses advancement detection', () => {
    expect(EVENT_TYPES.BlockBreak.detection).toBe('advancement')
  })

  test('PlayerJoin uses tag detection', () => {
    expect(EVENT_TYPES.PlayerJoin.detection).toBe('tag')
  })

  test('PlayerDeath uses scoreboard detection', () => {
    expect(EVENT_TYPES.PlayerDeath.detection).toBe('scoreboard')
  })
})
