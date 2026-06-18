/**
 * Coverage for the new event runtime manifest seam
 */

import {
  EVENT_RUNTIME_MANIFESTS,
  eventTypeFromManifest,
  eventTypesFromManifests,
  getAllEventRuntimeAssets,
  getEventRuntimeAssets,
  type EventRuntimeManifest,
} from '../events/manifest'
import { EVENT_TYPES } from '../events/types'

describe('events manifest boundary', () => {
  test('eventTypeFromManifest normalizes optional runtime assets', () => {
    const customManifest: EventRuntimeManifest = {
      name: 'SampleEvent',
      tag: 'rs.sample',
      handlerTag: 'rs:sample',
      params: ['player: Player'],
      detection: 'tag',
      executorContext: { kind: 'entity', entityType: 'Player' },
      runtimeAssets: ['src/stdlib/samples.mcrs'],
    }

    const eventSpec = eventTypeFromManifest(customManifest)
    expect(eventSpec.runtimeAssets).toEqual(['src/stdlib/samples.mcrs'])
  })

  test('eventTypesFromManifests includes runtime assets metadata', () => {
    const manifestSpec = {
      name: 'MinimalEvent',
      tag: 'rs.minimal',
      handlerTag: 'rs:on_minimal',
      params: ['player: Player'],
      detection: 'tag',
      executorContext: { kind: 'entity', entityType: 'Player' },
    } satisfies EventRuntimeManifest

    const built = eventTypesFromManifests([manifestSpec])
    expect(built.MinimalEvent.runtimeAssets).toEqual([])
  })

  test('EVENT_TYPES is derived from runtime manifests', () => {
    const manifestNames = EVENT_RUNTIME_MANIFESTS.map(manifest => manifest.name).sort()
    const registryNames = Object.keys(EVENT_TYPES).sort()
    expect(registryNames).toEqual(manifestNames)
    expect(EVENT_TYPES).toEqual(eventTypesFromManifests(EVENT_RUNTIME_MANIFESTS))
  })

  test('built-in runtime manifests declare a shared stdlib runtime asset', () => {
    const runtimeAssets = EVENT_RUNTIME_MANIFESTS.map(manifest => getEventRuntimeAssets(manifest))
    expect(runtimeAssets).toHaveLength(EVENT_RUNTIME_MANIFESTS.length)
    for (const assets of runtimeAssets) {
      expect(assets).toEqual(['src/stdlib/events.mcrs'])
    }
  })

  test('all event runtime assets dedupe across manifests', () => {
    const assets = getAllEventRuntimeAssets(EVENT_RUNTIME_MANIFESTS, {
      fileExists: () => true,
    })
    expect(assets).toEqual(['src/stdlib/events.mcrs'])
  })

  test('getEventRuntimeAssets rejects unsafe paths', () => {
    const invalidManifest: EventRuntimeManifest = {
      name: 'InvalidEvent',
      tag: 'rs.invalid',
      handlerTag: 'rs:on_invalid',
      params: ['player: Player'],
      detection: 'scoreboard',
      executorContext: { kind: 'entity', entityType: 'Player' },
      runtimeAssets: ['../src/stdlib/events.mcrs'],
    }

    expect(() => getEventRuntimeAssets(invalidManifest)).toThrow("traversal segment '..' is not allowed")
  })

  test('runtime asset path validation can enforce existence via predicate', () => {
    const invalidManifest: EventRuntimeManifest = {
      name: 'InvalidEvent',
      tag: 'rs.invalid',
      handlerTag: 'rs:on_invalid',
      params: ['player: Player'],
      detection: 'scoreboard',
      executorContext: { kind: 'entity', entityType: 'Player' },
      runtimeAssets: ['src/stdlib/missing.mcrs'],
    }

    expect(() => getEventRuntimeAssets(invalidManifest, { fileExists: () => false })).toThrow('does not exist')
  })
})
