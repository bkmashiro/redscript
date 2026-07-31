import type { DatapackFile } from '../emit'
import type { McVersion } from '../types/mc-version'
import {
  ArtifactGraphError,
  type DatapackArtifact,
  type DatapackArtifactGraph,
  type DatapackArtifactIdentity,
  type DatapackArtifactKind,
  type DatapackArtifactProvenance,
  type DatapackArtifactReference,
} from './model'
import { validateNbt } from './nbt'
import {
  isResourceArtifactKind,
  resolveResourceDescriptor,
  resourceOutputPath,
  type ResourceArtifactKind,
} from './registry'

const RESOURCE_ID_RE = /^([a-z0-9_.-]+):([a-z0-9_./-]+)$/
const RECIPE_TYPES_WITH_STATIC_RESULT = new Set([
  'minecraft:crafting_shaped',
  'minecraft:crafting_shapeless',
  'minecraft:crafting_transmute',
  'minecraft:smelting',
  'minecraft:blasting',
  'minecraft:smoking',
  'minecraft:campfire_cooking',
  'minecraft:stonecutting',
  'minecraft:smithing_transform',
])

function stableJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableJson(child)]),
  )
}

function parseJson(content: string | Buffer, label: string): unknown {
  try {
    return JSON.parse(Buffer.isBuffer(content) ? content.toString('utf8') : content)
  } catch (error) {
    throw new ArtifactGraphError(`Invalid JSON in ${label}: ${(error as Error).message}`)
  }
}

function canonicalJson(content: string | Buffer, label: string): { value: unknown; bytes: Buffer } {
  const value = parseJson(content, label)
  return { value, bytes: Buffer.from(`${JSON.stringify(stableJson(value), null, 2)}\n`, 'utf8') }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function reference(kind: DatapackArtifactKind, id: unknown): DatapackArtifactReference | null {
  if (typeof id !== 'string') return null
  const normalized = id.startsWith('#') ? id.slice(1) : id
  return RESOURCE_ID_RE.test(normalized) ? Object.freeze({ kind, id: normalized }) : null
}

function tagReferences(kind: ResourceArtifactKind, value: unknown): DatapackArtifactReference[] {
  if (!isRecord(value) || !Array.isArray(value.values)) {
    throw new ArtifactGraphError(`Invalid JSON schema for ${kind}: expected an object with a values array`)
  }
  const refs: DatapackArtifactReference[] = []
  for (const entry of value.values) {
    const id = typeof entry === 'string' ? entry : isRecord(entry) ? entry.id : undefined
    if (typeof id !== 'string') {
      throw new ArtifactGraphError(`Invalid JSON schema for ${kind}: tag values must be strings or { id } objects`)
    }
    if (id.startsWith('#')) {
      const parsed = reference(kind, id)
      if (!parsed) throw new ArtifactGraphError(`Invalid JSON schema for ${kind}: invalid tag reference '${id}'`)
      refs.push(parsed)
    }
  }
  return refs
}

function validateJsonResource(kind: ResourceArtifactKind, value: unknown): DatapackArtifactReference[] {
  if (kind.endsWith('_tag') || kind === 'function_tag') return tagReferences(kind, value)
  if (kind === 'recipe') {
    if (!isRecord(value) || typeof value.type !== 'string') {
      throw new ArtifactGraphError('Invalid JSON schema for recipe: expected an object with a type field')
    }
    if (RECIPE_TYPES_WITH_STATIC_RESULT.has(value.type) && !('result' in value)) {
      throw new ArtifactGraphError(`Invalid JSON schema for recipe type '${value.type}': expected a result field`)
    }
    return []
  }
  if (kind === 'advancement') {
    if (!isRecord(value)) throw new ArtifactGraphError('Invalid JSON schema for advancement: expected an object')
    return [
      reference('advancement', value.parent),
      reference('function', isRecord(value.rewards) ? value.rewards.function : undefined),
    ].filter((item): item is DatapackArtifactReference => item != null)
  }
  if (kind === 'predicate') {
    if (!isRecord(value) && !Array.isArray(value)) {
      throw new ArtifactGraphError('Invalid JSON schema for predicate: expected an object or array')
    }
    return []
  }
  if (!isRecord(value) && !Array.isArray(value)) {
    throw new ArtifactGraphError(`Invalid JSON schema for ${kind}: expected an object or array`)
  }
  return []
}

function identityKey(identity: DatapackArtifactIdentity): string {
  return `${identity.kind}\0${identity.id}`
}

function provenanceLabel(artifact: DatapackArtifact): string {
  const declaration = artifact.provenance.sourceFile
    ? ` declared at ${artifact.provenance.sourceFile}`
    : ''
  if (artifact.sourcePath) return `${artifact.sourcePath}${declaration}`
  if (artifact.provenance.sourceFile) return artifact.provenance.sourceFile
  return `${artifact.provenance.kind}:${artifact.identity.id}`
}

function validateOutputPath(outputPath: string): void {
  if (
    !outputPath ||
    outputPath.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(outputPath) ||
    outputPath.includes('\\') ||
    outputPath.split('/').some(segment => !segment || segment === '.' || segment === '..')
  ) {
    throw new ArtifactGraphError(`Invalid datapack artifact output path '${outputPath}'`)
  }
}

function generatedIdentity(filePath: string): {
  identity: DatapackArtifactIdentity
  mediaType: DatapackArtifact['mediaType']
  lifecycle: DatapackArtifact['lifecycle']
} {
  if (filePath === 'pack.mcmeta') {
    return {
      identity: Object.freeze({ kind: 'pack_meta', id: 'pack.mcmeta' }),
      mediaType: 'application/json',
      lifecycle: 'reload',
    }
  }
  const functionMatch = filePath.match(/^data\/([a-z0-9_.-]+)\/functions?\/(.+)\.mcfunction$/)
  if (functionMatch) {
    const id = `${functionMatch[1]}:${functionMatch[2]}`
    return {
      identity: Object.freeze({ kind: 'function', id, namespace: functionMatch[1], path: functionMatch[2] }),
      mediaType: 'text/x-mcfunction',
      lifecycle: 'reload',
    }
  }
  const functionTagMatch = filePath.match(/^data\/([a-z0-9_.-]+)\/tags\/functions?\/(.+)\.json$/)
  if (functionTagMatch) {
    const id = `${functionTagMatch[1]}:${functionTagMatch[2]}`
    return {
      identity: Object.freeze({ kind: 'function_tag', id, namespace: functionTagMatch[1], path: functionTagMatch[2] }),
      mediaType: 'application/json',
      lifecycle: 'reload',
    }
  }
  return {
    identity: Object.freeze({ kind: 'opaque', id: filePath }),
    mediaType: filePath.endsWith('.json') ? 'application/json' : 'application/octet-stream',
    lifecycle: 'build',
  }
}

export function generatedDatapackArtifacts(
  files: readonly DatapackFile[],
  _minecraftVersion: McVersion | number,
): DatapackArtifact[] {
  return files.map((file, index) => {
    const inferred = generatedIdentity(file.path)
    const content = Buffer.from(file.content, 'utf8')
    return Object.freeze({
      ...inferred,
      outputPath: file.path,
      content,
      provenance: Object.freeze({ kind: 'generated' as const, stage: 'legacy-emitter', line: index + 1 }),
      references: Object.freeze([]),
    })
  })
}

export interface CreateResourceArtifactInput {
  readonly kind: string
  readonly id: string
  readonly sourcePath: string
  readonly content: string | Buffer
  readonly provenance: DatapackArtifactProvenance
  readonly minecraftVersion: McVersion | number
}

export function createResourceArtifact(input: CreateResourceArtifactInput): DatapackArtifact {
  const mapped = resourceOutputPath(input.kind, input.id, input.minecraftVersion)
  const descriptor = mapped.descriptor
  if (!input.sourcePath.endsWith(descriptor.extension)) {
    throw new ArtifactGraphError(
      `Resource ${input.kind} ${input.id} requires a ${descriptor.extension} source, found '${input.sourcePath}'`,
    )
  }

  let content: Buffer
  let references: readonly DatapackArtifactReference[] = []
  if (descriptor.mediaType === 'application/json') {
    const canonical = canonicalJson(input.content, input.sourcePath)
    content = canonical.bytes
    references = Object.freeze(validateJsonResource(descriptor.kind, canonical.value))
  } else {
    content = validateNbt(Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content))
  }

  return Object.freeze({
    identity: Object.freeze({
      kind: descriptor.kind,
      id: input.id,
      namespace: mapped.namespace,
      path: mapped.path,
    }),
    outputPath: mapped.outputPath,
    mediaType: descriptor.mediaType,
    lifecycle: descriptor.lifecycle,
    content,
    provenance: Object.freeze({ ...input.provenance }),
    sourcePath: input.sourcePath,
    references,
  })
}

export interface CreateArtifactGraphOptions {
  readonly minecraftVersion: McVersion | number
  readonly localNamespaces: readonly string[]
  readonly requirePackMeta?: boolean
}

export function createDatapackArtifactGraph(
  candidates: readonly DatapackArtifact[],
  options: CreateArtifactGraphOptions,
): DatapackArtifactGraph {
  const byPath = new Map<string, DatapackArtifact>()
  const byIdentity = new Map<string, DatapackArtifact>()
  const localNamespaces = new Set(options.localNamespaces)

  for (const artifact of candidates) {
    validateOutputPath(artifact.outputPath)
    if (!Buffer.isBuffer(artifact.content)) {
      throw new ArtifactGraphError(`Artifact '${artifact.identity.id}' content must be a Buffer`)
    }
    if (isResourceArtifactKind(artifact.identity.kind)) {
      const descriptor = resolveResourceDescriptor(artifact.identity.kind, options.minecraftVersion)
      if (artifact.mediaType !== descriptor.mediaType) {
        throw new ArtifactGraphError(
          `Artifact '${artifact.identity.id}' media type '${artifact.mediaType}' does not match '${descriptor.mediaType}'`,
        )
      }
      if (artifact.lifecycle !== descriptor.lifecycle) {
        throw new ArtifactGraphError(
          `Artifact '${artifact.identity.id}' lifecycle '${artifact.lifecycle}' does not match '${descriptor.lifecycle}'`,
        )
      }
      if (artifact.provenance.kind === 'source') {
        const expected = resourceOutputPath(artifact.identity.kind, artifact.identity.id, options.minecraftVersion).outputPath
        if (artifact.outputPath !== expected) {
          throw new ArtifactGraphError(
            `Artifact '${artifact.identity.id}' output '${artifact.outputPath}' does not match registry path '${expected}'`,
          )
        }
      }
    }
    const previousPath = byPath.get(artifact.outputPath)
    if (previousPath) {
      throw new ArtifactGraphError(
        `Datapack artifact collision at '${artifact.outputPath}' between '${provenanceLabel(previousPath)}' and '${provenanceLabel(artifact)}'`,
      )
    }
    const key = identityKey(artifact.identity)
    const previousIdentity = byIdentity.get(key)
    if (previousIdentity) {
      throw new ArtifactGraphError(
        `Datapack artifact identity collision for '${artifact.identity.kind} ${artifact.identity.id}' between '${provenanceLabel(previousIdentity)}' and '${provenanceLabel(artifact)}'`,
      )
    }
    byPath.set(artifact.outputPath, artifact)
    byIdentity.set(key, artifact)
  }

  if (options.requirePackMeta !== false && !byPath.has('pack.mcmeta')) {
    throw new ArtifactGraphError("Datapack artifact graph is missing required 'pack.mcmeta'")
  }

  for (const artifact of byPath.values()) {
    for (const ref of artifact.references) {
      const namespace = RESOURCE_ID_RE.exec(ref.id)?.[1]
      if (!namespace || !localNamespaces.has(namespace)) continue
      if (!byIdentity.has(identityKey({ kind: ref.kind, id: ref.id }))) {
        throw new ArtifactGraphError(
          `Artifact '${artifact.identity.id}' references missing local resource '${ref.kind} ${ref.id}'`,
        )
      }
    }
  }

  const artifacts = Object.freeze([...byPath.values()].sort((left, right) =>
    left.outputPath.localeCompare(right.outputPath),
  ))
  return Object.freeze({
    minecraftVersion: options.minecraftVersion,
    artifacts,
    byPath: new Map(artifacts.map(artifact => [artifact.outputPath, artifact])),
    byIdentity: new Map(artifacts.map(artifact => [identityKey(artifact.identity), artifact])),
  })
}

export function projectLegacyDatapackFiles(graph: DatapackArtifactGraph): DatapackFile[] {
  return graph.artifacts
    .filter(artifact => artifact.mediaType !== 'application/nbt' && artifact.mediaType !== 'application/octet-stream')
    .map(artifact => ({ path: artifact.outputPath, content: artifact.content.toString('utf8') }))
}

/** Return a revalidated graph with only the pack description changed. */
export function withPackDescription(
  graph: DatapackArtifactGraph,
  description: string,
): DatapackArtifactGraph {
  const packMeta = graph.byPath.get('pack.mcmeta')
  if (!packMeta) throw new ArtifactGraphError("Cannot set a description without 'pack.mcmeta'")
  const parsed = parseJson(packMeta.content, 'pack.mcmeta')
  if (!isRecord(parsed) || !isRecord(parsed.pack)) {
    throw new ArtifactGraphError("Invalid JSON schema for pack.mcmeta: expected a 'pack' object")
  }
  const canonical = canonicalJson(
    JSON.stringify({ ...parsed, pack: { ...parsed.pack, description } }),
    'pack.mcmeta',
  )
  const artifacts = graph.artifacts.map(artifact => artifact === packMeta
    ? Object.freeze({ ...artifact, content: canonical.bytes })
    : artifact)
  const localNamespaces = new Set(
    artifacts.map(artifact => artifact.identity.namespace).filter((value): value is string => value != null),
  )
  return createDatapackArtifactGraph(artifacts, {
    minecraftVersion: graph.minecraftVersion,
    localNamespaces: [...localNamespaces],
  })
}
