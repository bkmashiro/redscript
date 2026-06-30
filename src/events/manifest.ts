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

export interface RuntimeAssetValidationOptions {
  /**
   * Optional file-existence predicate. When provided, validation checks each
   * normalized asset path via this predicate.
   */
  fileExists?: (path: string) => boolean
  /**
   * Optional root directory used to resolve relative runtime assets for existence checks.
   */
  rootPath?: string
}

const STDLIB_RUNTIME_ASSET_PREFIX = 'src/stdlib/'

function isAbsoluteRuntimeAssetPath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:/i.test(value) || value.startsWith('~/')
}

function resolveRuntimeAssetPath(rootPath: string | undefined, normalized: string): string {
  if (!rootPath) return normalized
  const root = rootPath.replace(/\\/g, '/').replace(/\/+$/, '')
  return `${root}/${normalized}`
}

function validateRuntimeAssetPath(value: string, options: RuntimeAssetValidationOptions = {}): string {
  if (value.includes('\\')) {
    throw new Error(`Invalid runtime asset path '${value}': backslashes are not allowed`)
  }

  if (value === '') {
    throw new Error('Invalid runtime asset path: empty path is not allowed')
  }

  if (isAbsoluteRuntimeAssetPath(value)) {
    throw new Error(`Invalid runtime asset path '${value}': absolute paths are not allowed`)
  }

  const normalized = value
  const segments = normalized.split('/')
  if (segments.includes('..')) {
    throw new Error(`Invalid runtime asset path '${value}': traversal segment '..' is not allowed`)
  }

  if (!segments.every(segment => segment.length > 0 && segment !== '.')) {
    throw new Error(`Invalid runtime asset path '${value}': empty or '.' segments are not allowed`)
  }

  if (!normalized.startsWith(STDLIB_RUNTIME_ASSET_PREFIX)) {
    throw new Error(
      `Invalid runtime asset path '${value}': runtime assets must be under '${STDLIB_RUNTIME_ASSET_PREFIX}'`
    )
  }

  const resolved = resolveRuntimeAssetPath(options.rootPath, normalized)
  const fileExists = options.fileExists
  if (fileExists && !fileExists(resolved)) {
    throw new Error(`Invalid runtime asset path '${value}': file does not exist at ${resolved}`)
  }

  return normalized
}

export function getEventRuntimeAssets(
  manifest: EventRuntimeManifest,
  options: RuntimeAssetValidationOptions = {},
): readonly string[] {
  const assets = manifest.runtimeAssets ?? []
  const normalized = new Set<string>()

  for (const asset of assets) {
    normalized.add(validateRuntimeAssetPath(asset, options))
  }

  return [...normalized]
}

export function getAllEventRuntimeAssets(
  manifests: readonly EventRuntimeManifest[],
  options: RuntimeAssetValidationOptions = {},
  eventTypeNames?: readonly string[],
): readonly string[] {
  const wanted = eventTypeNames ? new Set(eventTypeNames) : null
  const normalized = new Set<string>()

  for (const manifest of manifests) {
    if (wanted && !wanted.has(manifest.name)) continue
    for (const runtimeAsset of getEventRuntimeAssets(manifest, options)) {
      normalized.add(runtimeAsset)
    }
  }

  return [...normalized]
}

export const EVENT_RUNTIME_MANIFESTS = [
  {
    name: 'PlayerDeath',
    tag: 'rs.just_died',
    handlerTag: 'rs:on_player_death',
    params: ['player: Player'],
    detection: 'scoreboard',
    executorContext: { kind: 'entity', entityType: 'Player' },
    runtimeAssets: ['src/stdlib/events.mcrs'],
  },
  {
    name: 'PlayerJoin',
    tag: 'rs.just_joined',
    handlerTag: 'rs:on_player_join',
    params: ['player: Player'],
    detection: 'tag',
    executorContext: { kind: 'entity', entityType: 'Player' },
    runtimeAssets: ['src/stdlib/events.mcrs'],
  },
  {
    name: 'EntityKill',
    tag: 'rs.just_killed',
    handlerTag: 'rs:on_entity_kill',
    params: ['player: Player'],
    detection: 'scoreboard',
    executorContext: { kind: 'entity', entityType: 'Player' },
    runtimeAssets: ['src/stdlib/events.mcrs'],
  },
  {
    name: 'ItemUse',
    tag: 'rs.just_used_item',
    handlerTag: 'rs:on_item_use',
    params: ['player: Player'],
    detection: 'scoreboard',
    executorContext: { kind: 'entity', entityType: 'Player' },
    runtimeAssets: ['src/stdlib/events.mcrs'],
  },
] as const

export function eventTypeFromManifest(manifest: EventRuntimeManifest): EventRuntimeSpec {
  return {
    tag: manifest.tag,
    handlerTag: manifest.handlerTag,
    params: manifest.params,
    detection: manifest.detection,
    executorContext: manifest.executorContext,
    runtimeAssets: getEventRuntimeAssets(manifest),
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
