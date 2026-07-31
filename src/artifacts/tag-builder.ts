import type { TagResourcePolicy } from '../ast/types'
import type { McVersion } from '../types/mc-version'
import { createResourceArtifact } from './graph'
import { ArtifactGraphError, type DatapackArtifact, type DatapackArtifactProvenance } from './model'
import { isTagResourceArtifactKind, type TagResourceArtifactKind } from './registry'

const RESOURCE_LOCATION_RE = /^[a-z0-9_.-]+:[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*$/

export interface TagResourceValue {
  readonly kind: 'value' | 'tag'
  readonly id: string
  /** Defaults to true. False emits Minecraft's `{ id, required: false }` form. */
  readonly required?: boolean
}

export interface CreateTagResourceArtifactInput {
  readonly kind: TagResourceArtifactKind
  readonly id: string
  readonly policy: TagResourcePolicy
  readonly values: readonly TagResourceValue[]
  readonly provenance: DatapackArtifactProvenance
  readonly minecraftVersion: McVersion | number
}

function tagEntry(value: TagResourceValue): string | { id: string; required: false } {
  if (value.kind !== 'value' && value.kind !== 'tag') {
    throw new ArtifactGraphError(`Invalid typed tag entry kind '${String(value.kind)}'`)
  }
  if (!RESOURCE_LOCATION_RE.test(value.id)) {
    throw new ArtifactGraphError(`Invalid tag value id '${value.id}'`)
  }
  if (value.required != null && typeof value.required !== 'boolean') {
    throw new ArtifactGraphError(`Typed tag entry required must be a boolean`)
  }
  const id = value.kind === 'tag' ? `#${value.id}` : value.id
  return value.required === false ? { id, required: false } : id
}

export function createTagResourceArtifact(input: CreateTagResourceArtifactInput): DatapackArtifact {
  if (!isTagResourceArtifactKind(input.kind)) {
    throw new ArtifactGraphError(`Resource kind '${String(input.kind)}' is not a tag resource kind`)
  }
  if (input.policy !== 'merge' && input.policy !== 'replace') {
    throw new ArtifactGraphError(`Invalid typed tag policy '${String(input.policy)}'`)
  }
  return createResourceArtifact({
    kind: input.kind,
    id: input.id,
    content: JSON.stringify({
      replace: input.policy === 'replace',
      values: input.values.map(tagEntry),
    }),
    provenance: input.provenance,
    minecraftVersion: input.minecraftVersion,
  })
}
