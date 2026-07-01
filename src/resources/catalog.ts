export const BUILTIN_RESOURCE_REGISTRY = {
  particles: ['minecraft:flame', 'minecraft:smoke', 'minecraft:dust'],
  effects: ['minecraft:speed', 'minecraft:strength', 'minecraft:regeneration', 'minecraft:slowness'],
  entities: ['minecraft:zombie', 'minecraft:skeleton', 'minecraft:creeper', 'minecraft:item'],
  items: ['minecraft:diamond', 'minecraft:apple', 'minecraft:stone', 'minecraft:stick'],
  sounds: ['minecraft:entity.experience_orb.pickup', 'minecraft:ui.toast.challenge_complete'],
  blocks: ['minecraft:stone', 'minecraft:air', 'minecraft:grass_block', 'minecraft:bedrock'],
} as const

export type BuiltinResourceCategory = keyof typeof BUILTIN_RESOURCE_REGISTRY
export type ResourceCatalogExtension = Partial<Record<BuiltinResourceCategory, readonly string[]>>

export const RESOURCE_CATEGORY_NAME: Record<BuiltinResourceCategory, string> = {
  particles: 'particle',
  effects: 'effect',
  entities: 'entity',
  items: 'item',
  sounds: 'sound',
  blocks: 'block',
}

const TYPE_REGISTRY_TO_CATALOG_CATEGORY: Record<string, BuiltinResourceCategory> = {
  particle: 'particles',
  effect: 'effects',
  entity: 'entities',
  entity_type: 'entities',
  item: 'items',
  sound: 'sounds',
  block: 'blocks',
}

export function catalogCategoryForResourceType(registry: string): BuiltinResourceCategory | undefined {
  return TYPE_REGISTRY_TO_CATALOG_CATEGORY[registry]
}

export function builtinCategoriesForResourceId(id: string): BuiltinResourceCategory[] {
  return (Object.keys(BUILTIN_RESOURCE_REGISTRY) as BuiltinResourceCategory[])
    .filter(category => (BUILTIN_RESOURCE_REGISTRY[category] as readonly string[]).includes(id))
}
