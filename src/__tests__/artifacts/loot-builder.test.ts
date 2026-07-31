import { McVersion } from '../../types/mc-version'
import { createDatapackArtifactGraph, generatedDatapackArtifacts } from '../../artifacts/graph'
import { createItemModifierResourceArtifact, createLootTableResourceArtifact } from '../../artifacts/loot-builder'
import type { DatapackArtifact, DatapackArtifactProvenance } from '../../artifacts/model'

const provenance: DatapackArtifactProvenance = Object.freeze({ kind: 'generated', stage: 'loot-builder-test' })

function pack(): DatapackArtifact {
  return generatedDatapackArtifacts([{ path: 'pack.mcmeta', content: '{}\n' }], McVersion.v26_2)[0]
}

function table(id: string, nested?: string) {
  return createLootTableResourceArtifact({
    id,
    lootTable: {
      type: 'minecraft:chest',
      pools: [{
        rolls: 1,
        entries: nested
          ? [{ kind: 'loot_table', name: nested }]
          : [
            { kind: 'item', name: 'minecraft:apple', weight: 2, quality: -2 },
            { kind: 'tag', name: 'demo:rare_foods', expand: true },
            { kind: 'empty', weight: 1 },
          ],
        conditions: nested ? undefined : [{ kind: 'reference', name: 'demo:allowed' }],
        functions: nested ? undefined : [{ function: 'minecraft:reference', fields: { name: 'demo:decorate' } }],
      }],
    },
    provenance,
    minecraftVersion: McVersion.v26_2,
  })
}

describe('typed loot-table and item-modifier builders', () => {
  test('lowers selected loot pools and records graph-owned references', () => {
    const artifact = table('demo:chest')
    expect(artifact.outputPath).toBe('data/demo/loot_table/chest.json')
    expect(JSON.parse(artifact.content.toString('utf8'))).toMatchObject({
      type: 'minecraft:chest',
      pools: [{
        rolls: 1,
        entries: [
          { type: 'minecraft:item', name: 'minecraft:apple', weight: 2, quality: -2 },
          { type: 'minecraft:tag', name: 'demo:rare_foods', expand: true },
          { type: 'minecraft:empty', weight: 1 },
        ],
      }],
    })
    expect(artifact.references).toEqual([
      { kind: 'item_tag', id: 'demo:rare_foods' },
      { kind: 'predicate', id: 'demo:allowed' },
      { kind: 'item_modifier', id: 'demo:decorate' },
    ])
  })

  test('builds one or many item modifier steps and tracks references', () => {
    const artifact = createItemModifierResourceArtifact({
      id: 'demo:decorate',
      modifier: [
        { function: 'minecraft:set_count', fields: { count: 2 } },
        { function: 'minecraft:reference', fields: { name: 'demo:base_modifier' } },
      ],
      provenance,
      minecraftVersion: McVersion.v26_2,
    })
    expect(artifact.outputPath).toBe('data/demo/item_modifier/decorate.json')
    expect(artifact.references).toEqual([
      { kind: 'item_modifier', id: 'demo:base_modifier' },
    ])
  })

  test('rejects empty pools, invalid weights, and reserved field overrides', () => {
    expect(() => createLootTableResourceArtifact({
      id: 'demo:empty',
      lootTable: { pools: [{ rolls: 1, entries: [] }] },
      provenance,
      minecraftVersion: McVersion.v26_2,
    })).toThrow(/at least one entry/i)
    expect(() => createLootTableResourceArtifact({
      id: 'demo:weight',
      lootTable: { pools: [{ rolls: 1, entries: [{ kind: 'item', name: 'minecraft:apple', weight: 0 }] }] },
      provenance,
      minecraftVersion: McVersion.v26_2,
    })).toThrow(/weight.*positive integer/i)
    expect(() => createLootTableResourceArtifact({
      id: 'demo:quality',
      lootTable: { pools: [{ rolls: 1, entries: [{ kind: 'item', name: 'minecraft:apple', quality: 0.5 }] }] },
      provenance,
      minecraftVersion: McVersion.v26_2,
    })).toThrow(/quality.*integer/i)
    expect(() => createItemModifierResourceArtifact({
      id: 'demo:override',
      modifier: { function: 'minecraft:set_count', fields: { function: 'minecraft:reference' } },
      provenance,
      minecraftVersion: McVersion.v26_2,
    })).toThrow(/reserved field 'function'/i)
  })

  test('rejects local nested loot-table cycles deterministically', () => {
    expect(() => createDatapackArtifactGraph([
      pack(),
      table('demo:a', 'demo:b'),
      table('demo:b', 'demo:a'),
    ], {
      minecraftVersion: McVersion.v26_2,
      localNamespaces: ['demo'],
    })).toThrow(/loot_table reference cycle.*demo:a.*demo:b.*demo:a/i)
  })
})
