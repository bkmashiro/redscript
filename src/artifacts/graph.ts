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

function reference(
  kind: DatapackArtifactKind,
  id: unknown,
  required?: boolean,
): DatapackArtifactReference | null {
  if (typeof id !== 'string') return null
  const normalized = id.startsWith('#') ? id.slice(1) : id
  if (!RESOURCE_ID_RE.test(normalized)) return null
  return Object.freeze(required == null ? { kind, id: normalized } : { kind, id: normalized, required })
}

function tagReferences(kind: ResourceArtifactKind, value: unknown): DatapackArtifactReference[] {
  if (!isRecord(value) || !Array.isArray(value.values)) {
    throw new ArtifactGraphError(`Invalid JSON schema for ${kind}: expected an object with a values array`)
  }
  if ('replace' in value && typeof value.replace !== 'boolean') {
    throw new ArtifactGraphError(`Invalid JSON schema for ${kind}: replace must be a boolean`)
  }
  const refs: DatapackArtifactReference[] = []
  for (const entry of value.values) {
    const record = isRecord(entry) ? entry : undefined
    const id = typeof entry === 'string' ? entry : record?.id
    if (typeof id !== 'string') {
      throw new ArtifactGraphError(`Invalid JSON schema for ${kind}: tag values must be strings or { id } objects`)
    }
    if (record && 'required' in record && typeof record.required !== 'boolean') {
      throw new ArtifactGraphError(`Invalid JSON schema for ${kind}: tag value required must be a boolean`)
    }
    const required = record?.required !== false
    if (id.startsWith('#')) {
      const parsed = reference(kind, id, required)
      if (!parsed) throw new ArtifactGraphError(`Invalid JSON schema for ${kind}: invalid tag reference '${id}'`)
      refs.push(parsed)
    } else if (kind === 'function_tag') {
      const parsed = reference('function', id, required)
      if (!parsed) throw new ArtifactGraphError(`Invalid JSON schema for ${kind}: invalid function reference '${id}'`)
      refs.push(parsed)
    }
  }
  return refs
}

function uniqueReferences(references: readonly DatapackArtifactReference[]): DatapackArtifactReference[] {
  const seen = new Set<string>()
  return references.filter(item => {
    const key = `${item.kind}\0${item.id}\0${item.required !== false}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function recipeReferences(value: Record<string, unknown>): DatapackArtifactReference[] {
  const refs: DatapackArtifactReference[] = []
  const visitIngredient = (ingredient: unknown): void => {
    if (typeof ingredient === 'string') {
      if (ingredient.startsWith('#')) {
        const parsed = reference('item_tag', ingredient)
        if (parsed) refs.push(parsed)
      }
      return
    }
    if (Array.isArray(ingredient)) {
      ingredient.forEach(visitIngredient)
      return
    }
    if (!isRecord(ingredient)) return
    if (typeof ingredient.tag === 'string') {
      const parsed = reference('item_tag', ingredient.tag)
      if (parsed) refs.push(parsed)
    }
    Object.values(ingredient).forEach(visitIngredient)
  }
  for (const key of ['ingredient', 'ingredients', 'key', 'template', 'base', 'addition']) {
    if (key in value) visitIngredient(value[key])
  }
  return uniqueReferences(refs)
}

function predicateReferences(value: unknown): DatapackArtifactReference[] {
  const refs: DatapackArtifactReference[] = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!isRecord(node)) return
    if (node.condition === 'minecraft:reference') {
      const parsed = reference('predicate', node.name)
      if (parsed) refs.push(parsed)
    }
    if ('term' in node) visit(node.term)
    if ('terms' in node) visit(node.terms)
  }
  visit(value)
  return uniqueReferences(refs)
}

function itemModifierReferences(value: unknown): DatapackArtifactReference[] {
  const refs: DatapackArtifactReference[] = []
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!isRecord(node)) return
    if (node.function === 'minecraft:reference') {
      const parsed = reference('item_modifier', node.name)
      if (parsed) refs.push(parsed)
    }
    refs.push(...predicateReferences(node.conditions))
    if ('functions' in node) visit(node.functions)
  }
  visit(value)
  return uniqueReferences(refs)
}

function lootTableReferences(value: Record<string, unknown>): DatapackArtifactReference[] {
  const entryRefs: DatapackArtifactReference[] = []
  const predicateRefs: DatapackArtifactReference[] = []
  const modifierRefs: DatapackArtifactReference[] = []
  const visitEntry = (entry: unknown): void => {
    if (!isRecord(entry)) return
    if (entry.type === 'minecraft:tag') {
      const parsed = reference('item_tag', entry.name)
      if (parsed) entryRefs.push(parsed)
    } else if (entry.type === 'minecraft:loot_table') {
      const parsed = reference('loot_table', entry.name)
      if (parsed) entryRefs.push(parsed)
    }
    predicateRefs.push(...predicateReferences(entry.conditions))
    modifierRefs.push(...itemModifierReferences(entry.functions))
    if (Array.isArray(entry.children)) entry.children.forEach(visitEntry)
  }
  if (Array.isArray(value.pools)) {
    for (const pool of value.pools) {
      if (!isRecord(pool)) continue
      if (Array.isArray(pool.entries)) pool.entries.forEach(visitEntry)
      predicateRefs.push(...predicateReferences(pool.conditions))
      modifierRefs.push(...itemModifierReferences(pool.functions))
    }
  }
  return uniqueReferences([...entryRefs, ...predicateRefs, ...modifierRefs])
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
    return recipeReferences(value)
  }
  if (kind === 'advancement') {
    if (!isRecord(value)) throw new ArtifactGraphError('Invalid JSON schema for advancement: expected an object')
    const rewards = isRecord(value.rewards) ? value.rewards : undefined
    const refs: Array<DatapackArtifactReference | null> = [
      reference('advancement', value.parent),
      reference('function', rewards?.function),
    ]
    if (Array.isArray(rewards?.loot)) refs.push(...rewards.loot.map(id => reference('loot_table', id)))
    if (Array.isArray(rewards?.recipes)) refs.push(...rewards.recipes.map(id => reference('recipe', id)))
    return uniqueReferences(refs.filter((item): item is DatapackArtifactReference => item != null))
  }
  if (kind === 'predicate') {
    if (!isRecord(value) && !Array.isArray(value)) {
      throw new ArtifactGraphError('Invalid JSON schema for predicate: expected an object or array')
    }
    return predicateReferences(value)
  }
  if (kind === 'loot_table') {
    if (!isRecord(value)) throw new ArtifactGraphError('Invalid JSON schema for loot_table: expected an object')
    return lootTableReferences(value)
  }
  if (kind === 'item_modifier') {
    if (!isRecord(value) && !Array.isArray(value)) {
      throw new ArtifactGraphError('Invalid JSON schema for item_modifier: expected an object or array')
    }
    return itemModifierReferences(value)
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
  /** Present for P7 from-file contributions; omitted by typed builders. */
  readonly sourcePath?: string
  readonly content: string | Buffer
  readonly provenance: DatapackArtifactProvenance
  readonly minecraftVersion: McVersion | number
}

export function createResourceArtifact(input: CreateResourceArtifactInput): DatapackArtifact {
  const mapped = resourceOutputPath(input.kind, input.id, input.minecraftVersion)
  const descriptor = mapped.descriptor
  if (input.sourcePath && !input.sourcePath.endsWith(descriptor.extension)) {
    throw new ArtifactGraphError(
      `Resource ${input.kind} ${input.id} requires a ${descriptor.extension} source, found '${input.sourcePath}'`,
    )
  }
  const contentLabel = input.sourcePath ?? `typed ${input.kind} ${input.id}`

  let content: Buffer
  let references: readonly DatapackArtifactReference[] = []
  if (descriptor.mediaType === 'application/json') {
    const canonical = canonicalJson(input.content, contentLabel)
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

function participatesInReferenceCycles(kind: DatapackArtifactKind): boolean {
  return kind === 'function_tag' || kind.endsWith('_tag') || [
    'advancement',
    'predicate',
    'loot_table',
    'item_modifier',
  ].includes(kind)
}

function validateResourceReferenceCycles(byIdentity: ReadonlyMap<string, DatapackArtifact>): void {
  const state = new Map<string, 'visiting' | 'visited'>()
  const stack: string[] = []

  const visit = (key: string): void => {
    state.set(key, 'visiting')
    stack.push(key)
    const artifact = byIdentity.get(key)!
    const edges = artifact.references
      .filter(ref => ref.kind === artifact.identity.kind && byIdentity.has(identityKey(ref)))
      .map(ref => identityKey(ref))
      .sort()
    for (const edge of edges) {
      if (state.get(edge) === 'visiting') {
        const start = stack.indexOf(edge)
        const cycle = [...stack.slice(start), edge]
          .map(cycleKey => byIdentity.get(cycleKey)!.identity.id)
        const cycleKind = artifact.identity.kind.endsWith('_tag') || artifact.identity.kind === 'function_tag'
          ? 'tag'
          : artifact.identity.kind
        throw new ArtifactGraphError(`Datapack ${cycleKind} reference cycle: ${cycle.join(' -> ')}`)
      }
      if (!state.has(edge)) visit(edge)
    }
    stack.pop()
    state.set(key, 'visited')
  }

  const cycleKeys = [...byIdentity.entries()]
    .filter(([, artifact]) => participatesInReferenceCycles(artifact.identity.kind))
    .map(([key]) => key)
    .sort()
  for (const key of cycleKeys) {
    if (!state.has(key)) visit(key)
  }
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
      if (ref.required === false) continue
      const namespace = RESOURCE_ID_RE.exec(ref.id)?.[1]
      if (!namespace || !localNamespaces.has(namespace)) continue
      if (!byIdentity.has(identityKey({ kind: ref.kind, id: ref.id }))) {
        throw new ArtifactGraphError(
          `Artifact '${artifact.identity.id}' references missing local resource '${ref.kind} ${ref.id}'`,
        )
      }
    }
  }
  validateResourceReferenceCycles(byIdentity)

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
