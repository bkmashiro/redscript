import { McVersion } from '../types/mc-version'
import {
  assertNonEmpty,
  assertNonNegativeFinite,
  assertPositiveInteger,
  assertResourceId,
  createTypedJsonArtifact,
  type JsonObject,
  type JsonValue,
} from './builder-utils'
import { ArtifactGraphError, type DatapackArtifact, type DatapackArtifactProvenance } from './model'

export type RecipeIngredient =
  | { readonly item: string; readonly tag?: never }
  | { readonly tag: string; readonly item?: never }

export interface RecipeResult {
  readonly id: string
  readonly count?: number
}

interface RecipeCommon {
  readonly group?: string
}

export type CraftingRecipeCategory = 'building' | 'redstone' | 'equipment' | 'misc'
export type CookingRecipeCategory = 'food' | 'blocks' | 'misc'

interface CraftingRecipeCommon extends RecipeCommon {
  readonly category?: CraftingRecipeCategory
}

export interface ShapedRecipe extends CraftingRecipeCommon {
  readonly kind: 'shaped'
  readonly pattern: readonly string[]
  readonly key: Readonly<Record<string, RecipeIngredient>>
  readonly result: RecipeResult
}

export interface ShapelessRecipe extends CraftingRecipeCommon {
  readonly kind: 'shapeless'
  readonly ingredients: readonly RecipeIngredient[]
  readonly result: RecipeResult
}

export interface CookingRecipe extends RecipeCommon {
  readonly kind: 'cooking'
  readonly category?: CookingRecipeCategory
  readonly method: 'smelting' | 'blasting' | 'smoking' | 'campfire_cooking'
  readonly ingredient: RecipeIngredient
  readonly result: string
  readonly experience?: number
  readonly cookingTime?: number
}

export interface StonecuttingRecipe extends RecipeCommon {
  readonly kind: 'stonecutting'
  readonly ingredient: RecipeIngredient
  readonly result: RecipeResult
}

export interface SmithingTransformRecipe {
  readonly kind: 'smithing_transform'
  readonly template: RecipeIngredient
  readonly base: RecipeIngredient
  readonly addition: RecipeIngredient
  readonly result: RecipeResult
}

export type TypedRecipe =
  | ShapedRecipe
  | ShapelessRecipe
  | CookingRecipe
  | StonecuttingRecipe
  | SmithingTransformRecipe

export interface CreateRecipeResourceArtifactInput {
  readonly id: string
  readonly recipe: TypedRecipe
  readonly provenance: DatapackArtifactProvenance
  readonly minecraftVersion: McVersion | number
}

function ingredient(value: RecipeIngredient, label: string, simplified: boolean): JsonValue {
  const item = value.item
  const tag = value.tag
  if ((item == null) === (tag == null)) {
    throw new ArtifactGraphError(`${label} must declare exactly one item or tag`)
  }
  if (item != null) {
    assertResourceId(item, `${label} item`)
    return simplified ? item : { item }
  }
  assertResourceId(tag!, `${label} tag`)
  return simplified ? `#${tag!}` : { tag: tag! }
}

function result(value: RecipeResult, label: string, modern: boolean): JsonObject {
  assertResourceId(value.id, `${label} id`)
  assertPositiveInteger(value.count, `${label} count`)
  const idField = modern ? 'id' : 'item'
  return value.count == null
    ? { [idField]: value.id }
    : { [idField]: value.id, count: value.count }
}

function common(
  value: RecipeCommon & { readonly category?: string },
  allowedCategories: readonly string[] = [],
): Record<string, JsonValue> {
  const output: Record<string, JsonValue> = {}
  if (value.category != null) {
    assertNonEmpty(value.category, 'Recipe category')
    if (!allowedCategories.includes(value.category)) {
      throw new ArtifactGraphError(`Recipe category '${value.category}' is not valid for this recipe family`)
    }
    output.category = value.category
  }
  if (value.group != null) {
    assertNonEmpty(value.group, 'Recipe group')
    output.group = value.group
  }
  return output
}

function shapedRecipe(recipe: ShapedRecipe, modernResult: boolean, simplifiedIngredients: boolean): JsonObject {
  if (recipe.pattern.length === 0 || recipe.pattern.length > 3) {
    throw new ArtifactGraphError('Shaped recipe pattern must contain 1 to 3 rows')
  }
  const width = recipe.pattern[0].length
  if (width === 0 || width > 3 || recipe.pattern.some(row => row.length !== width)) {
    throw new ArtifactGraphError('Shaped recipe pattern rows must have the same width between 1 and 3')
  }
  const key: Record<string, JsonValue> = {}
  for (const [symbol, value] of Object.entries(recipe.key)) {
    if (symbol.length !== 1 || symbol === ' ') {
      throw new ArtifactGraphError(`Shaped recipe key '${symbol}' must be one non-space character`)
    }
    key[symbol] = ingredient(value, `Shaped recipe key '${symbol}'`, simplifiedIngredients)
  }
  for (const symbol of new Set(recipe.pattern.join('').replace(/ /g, ''))) {
    if (!Object.prototype.hasOwnProperty.call(key, symbol)) {
      throw new ArtifactGraphError(`Shaped recipe pattern symbol '${symbol}' has no key ingredient`)
    }
  }
  return {
    type: 'minecraft:crafting_shaped',
    ...common(recipe, ['building', 'redstone', 'equipment', 'misc']),
    pattern: [...recipe.pattern],
    key,
    result: result(recipe.result, 'Shaped recipe result', modernResult),
  }
}

function recipeJson(recipe: TypedRecipe, minecraftVersion: McVersion | number): JsonObject {
  const modernResult = minecraftVersion >= McVersion.v1_21
  const simplifiedIngredients = minecraftVersion >= McVersion.v1_21_4
  if ('category' in recipe && recipe.category != null && minecraftVersion < McVersion.v1_20) {
    throw new ArtifactGraphError('Recipe categories require the represented Minecraft 1.20+ profile')
  }
  if (recipe.kind === 'smithing_transform' && minecraftVersion < McVersion.v1_20) {
    throw new ArtifactGraphError('Smithing transform recipes require Minecraft 1.20 or newer')
  }
  switch (recipe.kind) {
    case 'shaped': return shapedRecipe(recipe, modernResult, simplifiedIngredients)
    case 'shapeless':
      if (recipe.ingredients.length === 0 || recipe.ingredients.length > 9) {
        throw new ArtifactGraphError('Shapeless recipe requires at least one ingredient and at most nine')
      }
      return {
        type: 'minecraft:crafting_shapeless',
        ...common(recipe, ['building', 'redstone', 'equipment', 'misc']),
        ingredients: recipe.ingredients.map((value, index) => ingredient(value, `Ingredient ${index}`, simplifiedIngredients)),
        result: result(recipe.result, 'Shapeless recipe result', modernResult),
      }
    case 'cooking':
      if (!['smelting', 'blasting', 'smoking', 'campfire_cooking'].includes(recipe.method)) {
        throw new ArtifactGraphError(`Unsupported cooking recipe method '${String(recipe.method)}'`)
      }
      assertResourceId(recipe.result, 'Cooking recipe result')
      assertNonNegativeFinite(recipe.experience, 'Cooking recipe experience')
      assertPositiveInteger(recipe.cookingTime, 'Cooking recipe time')
      return {
        type: `minecraft:${recipe.method}`,
        ...common(recipe, ['food', 'blocks', 'misc']),
        ingredient: ingredient(recipe.ingredient, 'Cooking recipe ingredient', simplifiedIngredients),
        result: modernResult ? result({ id: recipe.result }, 'Cooking recipe result', true) : recipe.result,
        ...(recipe.experience == null ? {} : { experience: recipe.experience }),
        ...(recipe.cookingTime == null ? {} : { cookingtime: recipe.cookingTime }),
      }
    case 'stonecutting': {
      const stonecutting: Record<string, JsonValue> = {
        type: 'minecraft:stonecutting',
        ...common(recipe),
        ingredient: ingredient(recipe.ingredient, 'Stonecutting ingredient', simplifiedIngredients),
        result: modernResult
          ? result(recipe.result, 'Stonecutting result', true)
          : recipe.result.id,
      }
      assertResourceId(recipe.result.id, 'Stonecutting result id')
      assertPositiveInteger(recipe.result.count, 'Stonecutting result count')
      if (!modernResult && recipe.result.count != null) stonecutting.count = recipe.result.count
      return stonecutting
    }
    case 'smithing_transform':
      return {
        type: 'minecraft:smithing_transform',
        template: ingredient(recipe.template, 'Smithing template', simplifiedIngredients),
        base: ingredient(recipe.base, 'Smithing base', simplifiedIngredients),
        addition: ingredient(recipe.addition, 'Smithing addition', simplifiedIngredients),
        result: result(recipe.result, 'Smithing result', modernResult),
      }
  }
}

export function createRecipeResourceArtifact(input: CreateRecipeResourceArtifactInput): DatapackArtifact {
  return createTypedJsonArtifact({
    kind: 'recipe',
    id: input.id,
    value: recipeJson(input.recipe, input.minecraftVersion),
    provenance: input.provenance,
    minecraftVersion: input.minecraftVersion,
  })
}
