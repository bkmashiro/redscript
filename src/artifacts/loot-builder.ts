import type { McVersion } from '../types/mc-version'
import {
  assertInteger,
  assertNonNegativeFinite,
  assertPositiveInteger,
  assertResourceId,
  createTypedJsonArtifact,
  mergeFields,
  type JsonObject,
  type JsonValue,
} from './builder-utils'
import { ArtifactGraphError, type DatapackArtifact, type DatapackArtifactProvenance } from './model'
import { predicateConditionJson, type PredicateCondition } from './predicate-builder'

export interface LootFunction {
  readonly function: string
  readonly fields?: JsonObject
  readonly conditions?: readonly PredicateCondition[]
}

interface LootEntryBase {
  readonly weight?: number
  readonly quality?: number
  readonly conditions?: readonly PredicateCondition[]
  readonly functions?: readonly LootFunction[]
  readonly fields?: JsonObject
}

export interface LootItemEntry extends LootEntryBase {
  readonly kind: 'item'
  readonly name: string
}

export interface LootTagEntry extends LootEntryBase {
  readonly kind: 'tag'
  readonly name: string
  readonly expand?: boolean
}

export interface NestedLootTableEntry extends LootEntryBase {
  readonly kind: 'loot_table'
  readonly name: string
}

export interface EmptyLootEntry extends LootEntryBase {
  readonly kind: 'empty'
}

export interface CompoundLootEntry extends LootEntryBase {
  readonly kind: 'alternatives' | 'group' | 'sequence'
  readonly children: readonly LootEntry[]
}

export type LootEntry = LootItemEntry | LootTagEntry | NestedLootTableEntry | EmptyLootEntry | CompoundLootEntry

export interface LootPool {
  readonly rolls: number | JsonObject
  readonly bonusRolls?: number | JsonObject
  readonly entries: readonly LootEntry[]
  readonly conditions?: readonly PredicateCondition[]
  readonly functions?: readonly LootFunction[]
}

export interface LootTableDefinition {
  readonly type?: string
  readonly randomSequence?: string
  readonly pools: readonly LootPool[]
}

export interface CreateLootTableResourceArtifactInput {
  readonly id: string
  readonly lootTable: LootTableDefinition
  readonly provenance: DatapackArtifactProvenance
  readonly minecraftVersion: McVersion | number
}

export interface CreateItemModifierResourceArtifactInput {
  readonly id: string
  readonly modifier: LootFunction | readonly LootFunction[]
  readonly provenance: DatapackArtifactProvenance
  readonly minecraftVersion: McVersion | number
}

function conditions(values: readonly PredicateCondition[] | undefined): JsonValue | undefined {
  if (values == null) return undefined
  if (values.length === 0) throw new ArtifactGraphError('Loot conditions must not be empty')
  return values.map(value => predicateConditionJson(value))
}

function lootFunctionJson(value: LootFunction): JsonObject {
  assertResourceId(value.function, 'loot function')
  const output = mergeFields(
    { function: value.function },
    value.fields,
    ['function', 'conditions'],
    'Loot function fields',
  )
  const compiledConditions = conditions(value.conditions)
  if (compiledConditions != null) output.conditions = compiledConditions
  return output
}

function commonEntry(value: LootEntryBase): Record<string, JsonValue> {
  assertPositiveInteger(value.weight, 'Loot entry weight')
  assertInteger(value.quality, 'Loot entry quality')
  const output: Record<string, JsonValue> = {}
  if (value.weight != null) output.weight = value.weight
  if (value.quality != null) output.quality = value.quality
  const compiledConditions = conditions(value.conditions)
  if (compiledConditions != null) output.conditions = compiledConditions
  if (value.functions != null) {
    if (value.functions.length === 0) throw new ArtifactGraphError('Loot entry functions must not be empty')
    output.functions = value.functions.map(lootFunctionJson)
  }
  return output
}

function lootEntryJson(value: LootEntry, depth = 0, seen = new Set<object>()): JsonObject {
  if (depth > 64) throw new ArtifactGraphError('Typed loot entry exceeds maximum nesting depth 64')
  if (seen.has(value)) throw new ArtifactGraphError('Typed loot entry contains a cycle')
  seen.add(value)
  const base = commonEntry(value)
  let output: Record<string, JsonValue>
  switch (value.kind) {
    case 'item':
      assertResourceId(value.name, 'loot item')
      output = { type: 'minecraft:item', name: value.name, ...base }
      break
    case 'tag':
      assertResourceId(value.name, 'loot item tag')
      output = { type: 'minecraft:tag', name: value.name, ...base }
      if (value.expand != null) {
        if (typeof value.expand !== 'boolean') throw new ArtifactGraphError('Loot tag expand must be a boolean')
        output.expand = value.expand
      }
      break
    case 'loot_table':
      assertResourceId(value.name, 'nested loot table')
      output = { type: 'minecraft:loot_table', name: value.name, ...base }
      break
    case 'empty':
      output = { type: 'minecraft:empty', ...base }
      break
    case 'alternatives':
    case 'group':
    case 'sequence':
      if (value.children.length === 0) throw new ArtifactGraphError(`Loot ${value.kind} requires at least one child`)
      output = {
        type: `minecraft:${value.kind}`,
        children: value.children.map(child => lootEntryJson(child, depth + 1, seen)),
        ...base,
      }
      break
  }
  output = mergeFields(output, value.fields, ['type', 'name', 'children', 'weight', 'quality', 'conditions', 'functions', 'expand'], 'Loot entry fields')
  seen.delete(value)
  return output
}

function lootPoolJson(value: LootPool): JsonObject {
  if (typeof value.rolls === 'number') assertNonNegativeFinite(value.rolls, 'Loot pool rolls')
  if (typeof value.bonusRolls === 'number') assertNonNegativeFinite(value.bonusRolls, 'Loot pool bonus rolls')
  if (value.entries.length === 0) throw new ArtifactGraphError('Loot pool requires at least one entry')
  const output: Record<string, JsonValue> = {
    rolls: value.rolls,
    entries: value.entries.map(entry => lootEntryJson(entry)),
  }
  if (value.bonusRolls != null) output.bonus_rolls = value.bonusRolls
  const compiledConditions = conditions(value.conditions)
  if (compiledConditions != null) output.conditions = compiledConditions
  if (value.functions != null) {
    if (value.functions.length === 0) throw new ArtifactGraphError('Loot pool functions must not be empty')
    output.functions = value.functions.map(lootFunctionJson)
  }
  return output
}

export function createLootTableResourceArtifact(input: CreateLootTableResourceArtifactInput): DatapackArtifact {
  if (input.lootTable.type != null) assertResourceId(input.lootTable.type, 'loot table type')
  if (input.lootTable.randomSequence != null) assertResourceId(input.lootTable.randomSequence, 'loot table random sequence')
  const value: Record<string, JsonValue> = { pools: input.lootTable.pools.map(lootPoolJson) }
  if (input.lootTable.type != null) value.type = input.lootTable.type
  if (input.lootTable.randomSequence != null) value.random_sequence = input.lootTable.randomSequence
  return createTypedJsonArtifact({
    kind: 'loot_table',
    id: input.id,
    value,
    provenance: input.provenance,
    minecraftVersion: input.minecraftVersion,
  })
}

export function createItemModifierResourceArtifact(
  input: CreateItemModifierResourceArtifactInput,
): DatapackArtifact {
  const value: JsonValue = Array.isArray(input.modifier)
    ? input.modifier.map(lootFunctionJson)
    : lootFunctionJson(input.modifier as LootFunction)
  if (Array.isArray(value) && value.length === 0) {
    throw new ArtifactGraphError('Typed item modifier requires at least one function')
  }
  return createTypedJsonArtifact({
    kind: 'item_modifier',
    id: input.id,
    value,
    provenance: input.provenance,
    minecraftVersion: input.minecraftVersion,
  })
}
