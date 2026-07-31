import type { McVersion } from '../types/mc-version'
import {
  assertNonEmpty,
  assertNonNegativeFinite,
  assertResourceId,
  createTypedJsonArtifact,
  type JsonObject,
  type JsonValue,
} from './builder-utils'
import { ArtifactGraphError, type DatapackArtifact, type DatapackArtifactProvenance } from './model'

export interface AdvancementCriterion {
  readonly trigger: string
  readonly conditions?: JsonObject
}

export interface AdvancementRewards {
  readonly experience?: number
  readonly function?: string
  readonly loot?: readonly string[]
  readonly recipes?: readonly string[]
}

export interface AdvancementDefinition {
  readonly parent?: string
  readonly display?: JsonObject
  readonly criteria: Readonly<Record<string, AdvancementCriterion>>
  readonly requirements?: readonly (readonly string[])[]
  readonly rewards?: AdvancementRewards
  readonly sendsTelemetryEvent?: boolean
}

export interface CreateAdvancementResourceArtifactInput {
  readonly id: string
  readonly advancement: AdvancementDefinition
  readonly provenance: DatapackArtifactProvenance
  readonly minecraftVersion: McVersion | number
}

function rewards(value: AdvancementRewards): JsonObject {
  const output: Record<string, JsonValue> = {}
  if (value.experience != null) {
    assertNonNegativeFinite(value.experience, 'Advancement reward experience')
    if (!Number.isInteger(value.experience)) {
      throw new ArtifactGraphError('Advancement reward experience must be an integer')
    }
    output.experience = value.experience
  }
  if (value.function != null) {
    assertResourceId(value.function, 'advancement reward function')
    output.function = value.function
  }
  for (const [field, ids] of [['loot', value.loot], ['recipes', value.recipes]] as const) {
    if (ids == null) continue
    if (ids.length === 0) throw new ArtifactGraphError(`Advancement reward ${field} must not be empty`)
    ids.forEach(id => assertResourceId(id, `advancement reward ${field}`))
    output[field] = [...ids]
  }
  return output
}

function advancementJson(value: AdvancementDefinition): JsonObject {
  const criterionEntries = Object.entries(value.criteria)
  if (criterionEntries.length === 0) throw new ArtifactGraphError('Advancement requires at least one criterion')
  const criteria: Record<string, JsonValue> = {}
  for (const [name, criterion] of criterionEntries) {
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
      throw new ArtifactGraphError(`Invalid advancement criterion name '${name}'`)
    }
    assertResourceId(criterion.trigger, `advancement criterion '${name}' trigger`)
    criteria[name] = {
      trigger: criterion.trigger,
      ...(criterion.conditions == null ? {} : { conditions: criterion.conditions }),
    }
  }

  if (value.parent != null) assertResourceId(value.parent, 'advancement parent')
  if (value.requirements != null) {
    if (value.requirements.length === 0) throw new ArtifactGraphError('Advancement requirements must not be empty')
    for (const group of value.requirements) {
      if (group.length === 0) throw new ArtifactGraphError('Advancement requirement groups must not be empty')
      for (const name of group) {
        if (!Object.prototype.hasOwnProperty.call(value.criteria, name)) {
          throw new ArtifactGraphError(`Advancement requirement '${name}' names a missing criterion`)
        }
      }
    }
  }

  const output: Record<string, JsonValue> = { criteria }
  if (value.parent != null) output.parent = value.parent
  if (value.display != null) output.display = value.display
  if (value.requirements != null) output.requirements = value.requirements.map(group => [...group])
  if (value.rewards != null) output.rewards = rewards(value.rewards)
  if (value.sendsTelemetryEvent != null) {
    if (typeof value.sendsTelemetryEvent !== 'boolean') {
      throw new ArtifactGraphError('Advancement sendsTelemetryEvent must be a boolean')
    }
    output.sends_telemetry_event = value.sendsTelemetryEvent
  }
  return output
}

export function createAdvancementResourceArtifact(
  input: CreateAdvancementResourceArtifactInput,
): DatapackArtifact {
  assertNonEmpty(input.id, 'Advancement id')
  return createTypedJsonArtifact({
    kind: 'advancement',
    id: input.id,
    value: advancementJson(input.advancement),
    provenance: input.provenance,
    minecraftVersion: input.minecraftVersion,
  })
}
