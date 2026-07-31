import type { McVersion } from '../types/mc-version'
import {
  assertResourceId,
  createTypedJsonArtifact,
  mergeFields,
  type JsonObject,
  type JsonValue,
} from './builder-utils'
import { ArtifactGraphError, type DatapackArtifact, type DatapackArtifactProvenance } from './model'

export interface PredicateLeaf {
  readonly kind: 'leaf'
  readonly condition: string
  readonly fields?: JsonObject
}

export interface PredicateReference {
  readonly kind: 'reference'
  readonly name: string
}

export interface PredicateAllOf {
  readonly kind: 'all_of'
  readonly terms: readonly PredicateCondition[]
}

export interface PredicateAnyOf {
  readonly kind: 'any_of'
  readonly terms: readonly PredicateCondition[]
}

export interface PredicateInverted {
  readonly kind: 'inverted'
  readonly term: PredicateCondition
}

export type PredicateCondition =
  | PredicateLeaf
  | PredicateReference
  | PredicateAllOf
  | PredicateAnyOf
  | PredicateInverted

export type TypedPredicate = PredicateCondition | readonly PredicateCondition[]

export interface CreatePredicateResourceArtifactInput {
  readonly id: string
  readonly predicate: TypedPredicate
  readonly provenance: DatapackArtifactProvenance
  readonly minecraftVersion: McVersion | number
}

export function predicateConditionJson(
  value: PredicateCondition,
  depth = 0,
  seen = new Set<object>(),
): JsonObject {
  if (depth > 64) throw new ArtifactGraphError('Typed predicate exceeds maximum nesting depth 64')
  if (seen.has(value)) throw new ArtifactGraphError('Typed predicate contains a cycle')
  seen.add(value)
  let output: JsonObject
  switch (value.kind) {
    case 'leaf':
      assertResourceId(value.condition, 'predicate condition')
      output = mergeFields({ condition: value.condition }, value.fields, ['condition'], 'Predicate fields')
      break
    case 'reference':
      assertResourceId(value.name, 'predicate reference')
      output = { condition: 'minecraft:reference', name: value.name }
      break
    case 'all_of':
    case 'any_of':
      if (value.terms.length === 0) throw new ArtifactGraphError(`Predicate ${value.kind} requires at least one term`)
      output = {
        condition: `minecraft:${value.kind}`,
        terms: value.terms.map(term => predicateConditionJson(term, depth + 1, seen)),
      }
      break
    case 'inverted':
      output = {
        condition: 'minecraft:inverted',
        term: predicateConditionJson(value.term, depth + 1, seen),
      }
      break
  }
  seen.delete(value)
  return output
}

export function createPredicateResourceArtifact(input: CreatePredicateResourceArtifactInput): DatapackArtifact {
  const value: JsonValue = Array.isArray(input.predicate)
    ? input.predicate.map(condition => predicateConditionJson(condition))
    : predicateConditionJson(input.predicate as PredicateCondition)
  if (Array.isArray(value) && value.length === 0) {
    throw new ArtifactGraphError('Typed predicate array requires at least one condition')
  }
  return createTypedJsonArtifact({
    kind: 'predicate',
    id: input.id,
    value,
    provenance: input.provenance,
    minecraftVersion: input.minecraftVersion,
  })
}
