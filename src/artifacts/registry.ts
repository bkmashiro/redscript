import { McVersion } from '../types/mc-version'
import type {
  DatapackArtifactKind,
  DatapackArtifactLifecycle,
  DatapackArtifactMediaType,
} from './model'
import { ArtifactGraphError } from './model'

export type ResourceArtifactKind = Exclude<
  DatapackArtifactKind,
  'pack_meta' | 'function' | 'opaque'
>

export const TAG_RESOURCE_ARTIFACT_KINDS = Object.freeze([
  'function_tag',
  'item_tag',
  'block_tag',
  'entity_type_tag',
  'fluid_tag',
  'game_event_tag',
] as const satisfies readonly ResourceArtifactKind[])

export type TagResourceArtifactKind = typeof TAG_RESOURCE_ARTIFACT_KINDS[number]

const TAG_RESOURCE_ARTIFACT_KIND_SET = new Set<string>(TAG_RESOURCE_ARTIFACT_KINDS)

export function isTagResourceArtifactKind(kind: string): kind is TagResourceArtifactKind {
  return TAG_RESOURCE_ARTIFACT_KIND_SET.has(kind)
}

export interface ResourceDescriptor {
  readonly kind: ResourceArtifactKind
  readonly directory: string
  readonly mediaType: DatapackArtifactMediaType
  readonly lifecycle: DatapackArtifactLifecycle
  readonly extension: '.json' | '.nbt'
}

interface DescriptorShape {
  readonly legacyDirectory: string
  readonly modernDirectory: string
  readonly mediaType: DatapackArtifactMediaType
  readonly lifecycle: DatapackArtifactLifecycle
  readonly extension: '.json' | '.nbt'
}

const DESCRIPTORS: Readonly<Record<ResourceArtifactKind, DescriptorShape>> = Object.freeze({
  function_tag: {
    legacyDirectory: 'tags/functions',
    modernDirectory: 'tags/function',
    mediaType: 'application/json',
    lifecycle: 'reload',
    extension: '.json',
  },
  recipe: {
    legacyDirectory: 'recipes',
    modernDirectory: 'recipe',
    mediaType: 'application/json',
    lifecycle: 'reload',
    extension: '.json',
  },
  advancement: {
    legacyDirectory: 'advancements',
    modernDirectory: 'advancement',
    mediaType: 'application/json',
    lifecycle: 'reload',
    extension: '.json',
  },
  predicate: {
    legacyDirectory: 'predicates',
    modernDirectory: 'predicate',
    mediaType: 'application/json',
    lifecycle: 'reload',
    extension: '.json',
  },
  loot_table: {
    legacyDirectory: 'loot_tables',
    modernDirectory: 'loot_table',
    mediaType: 'application/json',
    lifecycle: 'reload',
    extension: '.json',
  },
  item_modifier: {
    legacyDirectory: 'item_modifiers',
    modernDirectory: 'item_modifier',
    mediaType: 'application/json',
    lifecycle: 'reload',
    extension: '.json',
  },
  structure: {
    legacyDirectory: 'structures',
    modernDirectory: 'structure',
    mediaType: 'application/nbt',
    lifecycle: 'reload',
    extension: '.nbt',
  },
  dimension: {
    legacyDirectory: 'dimension',
    modernDirectory: 'dimension',
    mediaType: 'application/json',
    lifecycle: 'world_reopen',
    extension: '.json',
  },
  dimension_type: {
    legacyDirectory: 'dimension_type',
    modernDirectory: 'dimension_type',
    mediaType: 'application/json',
    lifecycle: 'world_reopen',
    extension: '.json',
  },
  item_tag: {
    legacyDirectory: 'tags/items',
    modernDirectory: 'tags/item',
    mediaType: 'application/json',
    lifecycle: 'reload',
    extension: '.json',
  },
  block_tag: {
    legacyDirectory: 'tags/blocks',
    modernDirectory: 'tags/block',
    mediaType: 'application/json',
    lifecycle: 'reload',
    extension: '.json',
  },
  entity_type_tag: {
    legacyDirectory: 'tags/entity_types',
    modernDirectory: 'tags/entity_type',
    mediaType: 'application/json',
    lifecycle: 'reload',
    extension: '.json',
  },
  fluid_tag: {
    legacyDirectory: 'tags/fluids',
    modernDirectory: 'tags/fluid',
    mediaType: 'application/json',
    lifecycle: 'reload',
    extension: '.json',
  },
  game_event_tag: {
    legacyDirectory: 'tags/game_events',
    modernDirectory: 'tags/game_event',
    mediaType: 'application/json',
    lifecycle: 'reload',
    extension: '.json',
  },
})

export function isResourceArtifactKind(value: string): value is ResourceArtifactKind {
  return Object.prototype.hasOwnProperty.call(DESCRIPTORS, value)
}

export function resolveResourceDescriptor(kind: string, minecraftVersion: number): ResourceDescriptor {
  if (!isResourceArtifactKind(kind)) {
    throw new ArtifactGraphError(`Unknown datapack resource kind '${kind}'`)
  }
  const shape = DESCRIPTORS[kind]
  return Object.freeze({
    kind,
    directory: minecraftVersion >= McVersion.v1_21 ? shape.modernDirectory : shape.legacyDirectory,
    mediaType: shape.mediaType,
    lifecycle: shape.lifecycle,
    extension: shape.extension,
  })
}

export function resourceOutputPath(
  kind: string,
  id: string,
  minecraftVersion: number,
): { descriptor: ResourceDescriptor; namespace: string; path: string; outputPath: string } {
  const match = id.match(/^([a-z0-9_.-]+):([a-z0-9_./-]+)$/)
  if (!match || match[2].split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw new ArtifactGraphError(`Invalid resource id '${id}'; expected lowercase namespace:path`)
  }
  const descriptor = resolveResourceDescriptor(kind, minecraftVersion)
  const namespace = match[1]
  const resourcePath = match[2]
  return {
    descriptor,
    namespace,
    path: resourcePath,
    outputPath: `data/${namespace}/${descriptor.directory}/${resourcePath}${descriptor.extension}`,
  }
}
