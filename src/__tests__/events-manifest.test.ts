/**
 * Coverage for the new event runtime manifest seam
 */

import {
  EVENT_RUNTIME_MANIFESTS,
  eventTypeFromManifest,
  eventTypesFromManifests,
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
})
