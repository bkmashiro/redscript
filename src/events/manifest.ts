import type { TypeNode } from '../ast/types'

export interface EventRuntimeManifest {
  readonly name: string
  readonly tag: string
  readonly handlerTag: string
  readonly params: readonly string[]
  readonly detection: string
  readonly executorContext: TypeNode
  readonly runtimeAssets?: readonly string[]
}

export interface EventRuntimeSpec {
  readonly tag: string
  readonly handlerTag: string
  readonly params: readonly string[]
  readonly detection: string
  readonly executorContext: TypeNode
  readonly runtimeAssets: readonly string[]
}

export const EVENT_RUNTIME_MANIFESTS = [
  {
    name: 'PlayerDeath',
    tag: 'rs.just_died',
    handlerTag: 'rs:on_player_death',
    params: ['player: Player'],
    detection: 'scoreboard',
    executorContext: { kind: 'entity', entityType: 'Player' },
  },
  {
    name: 'PlayerJoin',
    tag: 'rs.just_joined',
    handlerTag: 'rs:on_player_join',
    params: ['player: Player'],
    detection: 'tag',
    executorContext: { kind: 'entity', entityType: 'Player' },
  },
  {
    name: 'EntityKill',
    tag: 'rs.just_killed',
    handlerTag: 'rs:on_entity_kill',
    params: ['player: Player'],
    detection: 'scoreboard',
    executorContext: { kind: 'entity', entityType: 'Player' },
  },
  {
    name: 'ItemUse',
    tag: 'rs.just_used_item',
    handlerTag: 'rs:on_item_use',
    params: ['player: Player'],
    detection: 'scoreboard',
    executorContext: { kind: 'entity', entityType: 'Player' },
  },
] as const

export function eventTypeFromManifest(manifest: EventRuntimeManifest): EventRuntimeSpec {
  return {
    tag: manifest.tag,
    handlerTag: manifest.handlerTag,
    params: manifest.params,
    detection: manifest.detection,
    executorContext: manifest.executorContext,
    runtimeAssets: manifest.runtimeAssets ?? [],
  }
}

export function eventTypesFromManifests<const T extends readonly EventRuntimeManifest[]>(
  manifests: T,
): {
  [K in T[number] as K['name']]: EventRuntimeSpec
} {
  const entries = manifests.map(manifest => [manifest.name, eventTypeFromManifest(manifest)] as const)

  return Object.fromEntries(entries) as {
    [K in T[number] as K['name']]: EventRuntimeSpec
  }
}
