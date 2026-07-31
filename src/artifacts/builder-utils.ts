import type { McVersion } from '../types/mc-version'
import { createResourceArtifact } from './graph'
import { ArtifactGraphError, type DatapackArtifact, type DatapackArtifactProvenance } from './model'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[]
export interface JsonObject { readonly [key: string]: JsonValue }

const RESOURCE_LOCATION_RE = /^[a-z0-9_.-]+:[a-z0-9_.-]+(?:\/[a-z0-9_.-]+)*$/

export function assertResourceId(id: string, label: string): void {
  if (!RESOURCE_LOCATION_RE.test(id)) {
    throw new ArtifactGraphError(`Invalid ${label} '${id}'; expected lowercase namespace:path`)
  }
}

export function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new ArtifactGraphError(`${label} must not be empty`)
}

export function assertInteger(value: number | undefined, label: string): void {
  if (value != null && !Number.isInteger(value)) {
    throw new ArtifactGraphError(`${label} must be an integer`)
  }
}

export function assertPositiveInteger(value: number | undefined, label: string): void {
  if (value != null && (!Number.isInteger(value) || value <= 0)) {
    throw new ArtifactGraphError(`${label} must be a positive integer`)
  }
}

export function assertNonNegativeFinite(value: number | undefined, label: string): void {
  if (value != null && (!Number.isFinite(value) || value < 0)) {
    throw new ArtifactGraphError(`${label} must be a non-negative finite number`)
  }
}

export function mergeFields(
  base: Record<string, JsonValue>,
  fields: JsonObject | undefined,
  reserved: readonly string[],
  label: string,
): Record<string, JsonValue> {
  if (!fields) return base
  for (const key of reserved) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      throw new ArtifactGraphError(`${label} may not override reserved field '${key}'`)
    }
  }
  return { ...base, ...fields }
}

function validateJsonValue(value: unknown, label: string, depth: number, seen: Set<object>, count: { value: number }): void {
  if (depth > 64) throw new ArtifactGraphError(`${label} exceeds maximum JSON depth 64`)
  count.value++
  if (count.value > 100_000) throw new ArtifactGraphError(`${label} exceeds maximum JSON element count 100000`)
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new ArtifactGraphError(`${label} contains a non-finite number`)
    return
  }
  if (typeof value !== 'object') throw new ArtifactGraphError(`${label} contains a non-JSON value`)
  if (seen.has(value)) throw new ArtifactGraphError(`${label} contains a cyclic object`)
  seen.add(value)
  if (Array.isArray(value)) {
    for (const child of value) validateJsonValue(child, label, depth + 1, seen, count)
  } else {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ArtifactGraphError(`${label} contains a non-plain JSON object`)
    }
    for (const child of Object.values(value)) validateJsonValue(child, label, depth + 1, seen, count)
  }
  seen.delete(value)
}

export function createTypedJsonArtifact(input: {
  readonly kind: string
  readonly id: string
  readonly value: JsonValue
  readonly provenance: DatapackArtifactProvenance
  readonly minecraftVersion: McVersion | number
}): DatapackArtifact {
  validateJsonValue(input.value, `typed ${input.kind} ${input.id}`, 0, new Set(), { value: 0 })
  return createResourceArtifact({
    kind: input.kind,
    id: input.id,
    content: JSON.stringify(input.value),
    provenance: input.provenance,
    minecraftVersion: input.minecraftVersion,
  })
}
