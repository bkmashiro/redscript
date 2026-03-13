/**
 * Entity Type Hierarchy
 *
 * Closed inheritance tree mapping to Minecraft's entity registry.
 * Used for type narrowing (is checks), selector<T> annotations,
 * and W_IMPOSSIBLE_AS warnings.
 */

export interface EntityTypeNode {
  name: string
  mcId: string | null   // null for abstract types
  abstract: boolean
  parent: string | null  // null for root "Entity"
}

export const ENTITY_TYPES: EntityTypeNode[] = [
  // Root
  { name: 'Entity',       mcId: null,                          abstract: true,  parent: null },

  // Direct children of Entity
  { name: 'Player',       mcId: 'minecraft:player',            abstract: false, parent: 'Entity' },
  { name: 'ArmorStand',   mcId: 'minecraft:armor_stand',       abstract: false, parent: 'Entity' },
  { name: 'Item',         mcId: 'minecraft:item',              abstract: false, parent: 'Entity' },
  { name: 'Arrow',        mcId: 'minecraft:arrow',             abstract: false, parent: 'Entity' },

  // Mob hierarchy
  { name: 'Mob',          mcId: null,                          abstract: true,  parent: 'Entity' },

  // Hostile mobs
  { name: 'HostileMob',      mcId: null,                          abstract: true,  parent: 'Mob' },
  { name: 'Zombie',          mcId: 'minecraft:zombie',            abstract: false, parent: 'HostileMob' },
  { name: 'Skeleton',        mcId: 'minecraft:skeleton',          abstract: false, parent: 'HostileMob' },
  { name: 'Creeper',         mcId: 'minecraft:creeper',           abstract: false, parent: 'HostileMob' },
  { name: 'Spider',          mcId: 'minecraft:spider',            abstract: false, parent: 'HostileMob' },
  { name: 'Enderman',        mcId: 'minecraft:enderman',          abstract: false, parent: 'HostileMob' },
  { name: 'Blaze',           mcId: 'minecraft:blaze',             abstract: false, parent: 'HostileMob' },
  { name: 'Witch',           mcId: 'minecraft:witch',             abstract: false, parent: 'HostileMob' },
  { name: 'Slime',           mcId: 'minecraft:slime',             abstract: false, parent: 'HostileMob' },
  { name: 'ZombieVillager',  mcId: 'minecraft:zombie_villager',   abstract: false, parent: 'HostileMob' },
  { name: 'Husk',            mcId: 'minecraft:husk',              abstract: false, parent: 'HostileMob' },
  { name: 'Drowned',         mcId: 'minecraft:drowned',           abstract: false, parent: 'HostileMob' },
  { name: 'Stray',           mcId: 'minecraft:stray',             abstract: false, parent: 'HostileMob' },
  { name: 'WitherSkeleton',  mcId: 'minecraft:wither_skeleton',   abstract: false, parent: 'HostileMob' },
  { name: 'CaveSpider',      mcId: 'minecraft:cave_spider',       abstract: false, parent: 'HostileMob' },

  // Passive mobs
  { name: 'PassiveMob',      mcId: null,                          abstract: true,  parent: 'Mob' },
  { name: 'Pig',             mcId: 'minecraft:pig',               abstract: false, parent: 'PassiveMob' },
  { name: 'Cow',             mcId: 'minecraft:cow',               abstract: false, parent: 'PassiveMob' },
  { name: 'Sheep',           mcId: 'minecraft:sheep',             abstract: false, parent: 'PassiveMob' },
  { name: 'Chicken',         mcId: 'minecraft:chicken',           abstract: false, parent: 'PassiveMob' },
  { name: 'Villager',        mcId: 'minecraft:villager',          abstract: false, parent: 'PassiveMob' },
  { name: 'WanderingTrader', mcId: 'minecraft:wandering_trader',  abstract: false, parent: 'PassiveMob' },
]

/** Map from lowercase name → EntityTypeNode */
export const ENTITY_TYPE_MAP: Map<string, EntityTypeNode> = new Map(
  ENTITY_TYPES.map(t => [t.name.toLowerCase(), t])
)

/** Map from mcId (without namespace) → EntityTypeNode */
export const ENTITY_TYPE_BY_MCID: Map<string, EntityTypeNode> = new Map(
  ENTITY_TYPES
    .filter(t => t.mcId !== null)
    .map(t => [t.mcId!.replace('minecraft:', ''), t])
)

/** Check if typeA is a subtype of typeB (recursive ancestry) */
export function isSubtype(typeA: string, typeB: string): boolean {
  if (typeA === typeB) return true
  const node = ENTITY_TYPE_MAP.get(typeA.toLowerCase())
  if (!node || !node.parent) return false
  return isSubtype(node.parent, typeB)
}

/** True if one type is a subtype of the other (in either direction) */
export function areCompatibleTypes(outerType: string, innerType: string): boolean {
  return isSubtype(outerType, innerType) || isSubtype(innerType, outerType)
}

/** Get all non-abstract leaf types under a given node */
export function getConcreteSubtypes(typeName: string): EntityTypeNode[] {
  const results: EntityTypeNode[] = []
  for (const node of ENTITY_TYPES) {
    if (!node.abstract && isSubtype(node.name, typeName)) {
      results.push(node)
    }
  }
  return results
}

/** Parse "type=zombie" from a selector string, return the entity type name or null */
export function getSelectorEntityType(selector: string): string | null {
  const match = selector.match(/type=(?:minecraft:)?([a-z_]+)/)
  if (!match) return null
  const mcId = match[1]
  const node = ENTITY_TYPE_BY_MCID.get(mcId)
  return node ? node.name : null
}

/** Determine the base entity type from a selector kind:
 *  @a/@p/@r → "Player", @e → "Entity" or from type filter, @s → null */
export function getBaseSelectorType(selector: string): string | null {
  const trimmed = selector.trim()

  // Check for type filter first (works for any selector)
  const typeFromFilter = getSelectorEntityType(trimmed)

  if (trimmed.startsWith('@a') || trimmed.startsWith('@p') || trimmed.startsWith('@r')) {
    return typeFromFilter ?? 'Player'
  }
  if (trimmed.startsWith('@e')) {
    return typeFromFilter ?? 'Entity'
  }
  // @s — context-dependent, we don't know unless there's a type filter
  if (trimmed.startsWith('@s')) {
    return typeFromFilter ?? null
  }
  return null
}
