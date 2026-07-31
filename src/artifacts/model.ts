export type DatapackArtifactMediaType =
  | 'text/x-mcfunction'
  | 'application/json'
  | 'application/nbt'
  | 'application/octet-stream'

export type DatapackArtifactLifecycle = 'build' | 'reload' | 'restart' | 'world_reopen'

export type DatapackArtifactKind =
  | 'pack_meta'
  | 'function'
  | 'function_tag'
  | 'recipe'
  | 'advancement'
  | 'predicate'
  | 'loot_table'
  | 'item_modifier'
  | 'structure'
  | 'item_tag'
  | 'block_tag'
  | 'entity_type_tag'
  | 'fluid_tag'
  | 'game_event_tag'
  | 'opaque'

export interface DatapackArtifactIdentity {
  readonly kind: DatapackArtifactKind
  readonly id: string
  readonly namespace?: string
  readonly path?: string
}

export interface GeneratedArtifactProvenance {
  readonly kind: 'generated'
  readonly stage: string
  readonly sourceFile?: string
  readonly line?: number
  readonly col?: number
}

export interface SourceArtifactProvenance {
  readonly kind: 'source'
  readonly modulePath: string
  readonly packagePath: string
  readonly sourceFile: string
  readonly line: number
  readonly col: number
}

export type DatapackArtifactProvenance = GeneratedArtifactProvenance | SourceArtifactProvenance

export interface DatapackArtifactReference {
  readonly kind: DatapackArtifactKind
  readonly id: string
  /** False for Minecraft tag entries declared with `required: false`; defaults to true. */
  readonly required?: boolean
}

export interface DatapackArtifact {
  readonly identity: DatapackArtifactIdentity
  readonly outputPath: string
  readonly mediaType: DatapackArtifactMediaType
  readonly lifecycle: DatapackArtifactLifecycle
  readonly content: Buffer
  readonly provenance: DatapackArtifactProvenance
  readonly sourcePath?: string
  readonly references: readonly DatapackArtifactReference[]
}

export interface DatapackArtifactGraph {
  readonly minecraftVersion: number
  readonly artifacts: readonly DatapackArtifact[]
  readonly byPath: ReadonlyMap<string, DatapackArtifact>
  readonly byIdentity: ReadonlyMap<string, DatapackArtifact>
}

export class ArtifactGraphError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArtifactGraphError'
  }
}
