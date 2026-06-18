import type { EntitySelector, EntityTypeName } from '../ast/types'

// Entity type hierarchy for subtype checking.
export const ENTITY_HIERARCHY: Record<EntityTypeName, EntityTypeName | null> = {
  entity: null,
  Player: 'entity',
  Mob: 'entity',
  HostileMob: 'Mob',
  PassiveMob: 'Mob',
  Zombie: 'HostileMob',
  Skeleton: 'HostileMob',
  Creeper: 'HostileMob',
  Spider: 'HostileMob',
  Enderman: 'HostileMob',
  Blaze: 'HostileMob',
  Witch: 'HostileMob',
  Slime: 'HostileMob',
  ZombieVillager: 'HostileMob',
  Husk: 'HostileMob',
  Drowned: 'HostileMob',
  Stray: 'HostileMob',
  WitherSkeleton: 'HostileMob',
  CaveSpider: 'HostileMob',
  Pig: 'PassiveMob',
  Cow: 'PassiveMob',
  Sheep: 'PassiveMob',
  Chicken: 'PassiveMob',
  Villager: 'PassiveMob',
  WanderingTrader: 'PassiveMob',
  ArmorStand: 'entity',
  Item: 'entity',
  Arrow: 'entity',
}

// Map Minecraft type names to RedScript entity types.
export const MC_TYPE_TO_ENTITY: Record<string, EntityTypeName> = {
  zombie: 'Zombie',
  'minecraft:zombie': 'Zombie',
  skeleton: 'Skeleton',
  'minecraft:skeleton': 'Skeleton',
  creeper: 'Creeper',
  'minecraft:creeper': 'Creeper',
  spider: 'Spider',
  'minecraft:spider': 'Spider',
  enderman: 'Enderman',
  'minecraft:enderman': 'Enderman',
  blaze: 'Blaze',
  'minecraft:blaze': 'Blaze',
  witch: 'Witch',
  'minecraft:witch': 'Witch',
  slime: 'Slime',
  'minecraft:slime': 'Slime',
  zombie_villager: 'ZombieVillager',
  'minecraft:zombie_villager': 'ZombieVillager',
  husk: 'Husk',
  'minecraft:husk': 'Husk',
  drowned: 'Drowned',
  'minecraft:drowned': 'Drowned',
  stray: 'Stray',
  'minecraft:stray': 'Stray',
  wither_skeleton: 'WitherSkeleton',
  'minecraft:wither_skeleton': 'WitherSkeleton',
  cave_spider: 'CaveSpider',
  'minecraft:cave_spider': 'CaveSpider',
  pig: 'Pig',
  'minecraft:pig': 'Pig',
  cow: 'Cow',
  'minecraft:cow': 'Cow',
  sheep: 'Sheep',
  'minecraft:sheep': 'Sheep',
  chicken: 'Chicken',
  'minecraft:chicken': 'Chicken',
  villager: 'Villager',
  'minecraft:villager': 'Villager',
  wandering_trader: 'WanderingTrader',
  'minecraft:wandering_trader': 'WanderingTrader',
  armor_stand: 'ArmorStand',
  'minecraft:armor_stand': 'ArmorStand',
  item: 'Item',
  'minecraft:item': 'Item',
  arrow: 'Arrow',
  'minecraft:arrow': 'Arrow',
}

export function entityTypeFromMinecraftType(mcType: string): EntityTypeName | undefined {
  return MC_TYPE_TO_ENTITY[mcType]
}

export function inferEntityTypeFromSelector(selector: EntitySelector, currentSelfType: EntityTypeName = 'entity'): EntityTypeName {
  if (selector.kind === '@s') return currentSelfType
  if (selector.kind === '@a' || selector.kind === '@p' || selector.kind === '@r') return 'Player'
  if (selector.filters?.type) {
    return entityTypeFromMinecraftType(selector.filters.type) ?? 'entity'
  }
  return 'entity'
}

export function isEntitySubtype(childType: EntityTypeName, parentType: EntityTypeName): boolean {
  if (childType === parentType) return true

  let current: EntityTypeName | null = childType
  while (current !== null) {
    if (current === parentType) return true
    current = ENTITY_HIERARCHY[current]
  }
  return false
}

export function isKnownEntityType(entityType: string): entityType is EntityTypeName {
  return entityType in ENTITY_HIERARCHY
}
