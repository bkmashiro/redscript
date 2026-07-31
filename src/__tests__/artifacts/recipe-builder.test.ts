import { McVersion } from '../../types/mc-version'
import { createDatapackArtifactGraph, createResourceArtifact, generatedDatapackArtifacts } from '../../artifacts/graph'
import { createRecipeResourceArtifact } from '../../artifacts/recipe-builder'
import type { DatapackArtifactProvenance } from '../../artifacts/model'

const provenance: DatapackArtifactProvenance = Object.freeze({ kind: 'generated', stage: 'recipe-builder-test' })

function shaped() {
  return createRecipeResourceArtifact({
    id: 'demo:table',
    recipe: {
      kind: 'shaped',
      category: 'building',
      group: 'demo_tables',
      pattern: ['PP', 'SS'],
      key: {
        P: { tag: 'demo:planks' },
        S: { item: 'minecraft:stick' },
      },
      result: { id: 'minecraft:crafting_table', count: 2 },
    },
    provenance,
    minecraftVersion: McVersion.v26_2,
  })
}

describe('typed recipe resource builder', () => {
  test('lowers a shaped recipe to canonical JSON and the registry path', () => {
    const artifact = shaped()
    expect(artifact.outputPath).toBe('data/demo/recipe/table.json')
    expect(JSON.parse(artifact.content.toString('utf8'))).toEqual({
      type: 'minecraft:crafting_shaped',
      category: 'building',
      group: 'demo_tables',
      pattern: ['PP', 'SS'],
      key: {
        P: '#demo:planks',
        S: 'minecraft:stick',
      },
      result: { id: 'minecraft:crafting_table', count: 2 },
    })
    expect(artifact.references).toEqual([
      { kind: 'item_tag', id: 'demo:planks' },
    ])
  })

  test('is byte-identical to equivalent strict JSON and uses legacy paths', () => {
    const typed = shaped()
    const strict = createResourceArtifact({
      kind: 'recipe',
      id: 'demo:table',
      sourcePath: 'recipes/table.json',
      content: JSON.stringify(JSON.parse(typed.content.toString('utf8'))),
      provenance,
      minecraftVersion: McVersion.v26_2,
    })
    expect(typed.content.equals(strict.content)).toBe(true)
    const legacy = createRecipeResourceArtifact({
      id: 'demo:table',
      recipe: { kind: 'shapeless', ingredients: [{ item: 'minecraft:stick' }], result: { id: 'minecraft:stick' } },
      provenance,
      minecraftVersion: McVersion.v1_20,
    })
    expect(legacy.outputPath).toBe('data/demo/recipes/table.json')
    expect(JSON.parse(legacy.content.toString('utf8'))).toMatchObject({
      ingredients: [{ item: 'minecraft:stick' }],
      result: { item: 'minecraft:stick' },
    })
  })

  test('supports selected shapeless, cooking, stonecutting, and smithing forms', () => {
    const definitions = [
      { kind: 'shapeless', ingredients: [{ item: 'minecraft:wheat' }], result: { id: 'minecraft:bread' } },
      { kind: 'cooking', method: 'smelting', ingredient: { item: 'minecraft:iron_ore' }, result: 'minecraft:iron_ingot', experience: 0.7, cookingTime: 200 },
      { kind: 'stonecutting', ingredient: { item: 'minecraft:stone' }, result: { id: 'minecraft:stone_slab', count: 2 } },
      { kind: 'smithing_transform', template: { item: 'minecraft:netherite_upgrade_smithing_template' }, base: { item: 'minecraft:diamond_sword' }, addition: { item: 'minecraft:netherite_ingot' }, result: { id: 'minecraft:netherite_sword' } },
    ] as const
    for (const [index, recipe] of definitions.entries()) {
      expect(() => createRecipeResourceArtifact({
        id: `demo:r${index}`,
        recipe,
        provenance,
        minecraftVersion: McVersion.v26_2,
      })).not.toThrow()
    }
  })

  test('validates local ingredient tags through the P7 graph', () => {
    const pack = generatedDatapackArtifacts([{ path: 'pack.mcmeta', content: '{}\n' }], McVersion.v26_2)[0]
    expect(() => createDatapackArtifactGraph([pack, shaped()], {
      minecraftVersion: McVersion.v26_2,
      localNamespaces: ['demo'],
    })).toThrow(/missing local resource 'item_tag demo:planks'/i)
  })

  test('uses fail-closed represented-version boundaries for payload schema changes', () => {
    const base = { id: 'demo:profiled', provenance }
    const recipe = {
      kind: 'shapeless' as const,
      ingredients: [{ tag: 'demo:planks' }],
      result: { id: 'minecraft:stick' },
    }
    const v121 = createRecipeResourceArtifact({ ...base, recipe, minecraftVersion: McVersion.v1_21 })
    const v1214 = createRecipeResourceArtifact({ ...base, recipe, minecraftVersion: McVersion.v1_21_4 })
    expect(JSON.parse(v121.content.toString('utf8')).ingredients).toEqual([{ tag: 'demo:planks' }])
    expect(JSON.parse(v1214.content.toString('utf8')).ingredients).toEqual(['#demo:planks'])
    expect(() => createRecipeResourceArtifact({
      ...base,
      recipe: { ...recipe, category: 'misc' as const },
      minecraftVersion: McVersion.v1_19,
    })).toThrow(/categor(?:y|ies).*1\.20/i)
    expect(() => createRecipeResourceArtifact({
      ...base,
      recipe: {
        kind: 'smithing_transform',
        template: { item: 'minecraft:stick' },
        base: { item: 'minecraft:stick' },
        addition: { item: 'minecraft:stick' },
        result: { id: 'minecraft:stick' },
      },
      minecraftVersion: McVersion.v1_19,
    })).toThrow(/smithing transform.*1\.20/i)
  })

  test('rejects unsafe selected-form shapes at the builder boundary', () => {
    expect(() => createRecipeResourceArtifact({
      id: 'demo:bad',
      recipe: { kind: 'shaped', pattern: ['AA', 'A'], key: { A: { item: 'minecraft:stone' } }, result: { id: 'minecraft:stone' } },
      provenance,
      minecraftVersion: McVersion.v26_2,
    })).toThrow(/pattern rows.*same width/i)
    expect(() => createRecipeResourceArtifact({
      id: 'demo:bad_count',
      recipe: { kind: 'shapeless', ingredients: [], result: { id: 'minecraft:stone', count: 0 } },
      provenance,
      minecraftVersion: McVersion.v26_2,
    })).toThrow(/at least one ingredient|positive integer/i)
  })
})
