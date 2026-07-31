import { McVersion } from '../../types/mc-version'
import {
  createDatapackArtifactGraph,
  createResourceArtifact,
  generatedDatapackArtifacts,
} from '../../artifacts/graph'
import { createTagResourceArtifact } from '../../artifacts/tag-builder'
import type { DatapackArtifact, DatapackArtifactProvenance } from '../../artifacts/model'

const provenance: DatapackArtifactProvenance = Object.freeze({
  kind: 'generated',
  stage: 'tag-builder-test',
})

function packMeta(version: McVersion = McVersion.v26_2): DatapackArtifact {
  return generatedDatapackArtifacts([{
    path: 'pack.mcmeta',
    content: '{"pack":{"pack_format":107.1,"description":"test"}}\n',
  }], version)[0]
}

function tag(
  id: string,
  values: ReadonlyArray<{
    kind: 'value' | 'tag'
    id: string
    required?: boolean
  }>,
  policy: 'merge' | 'replace' = 'merge',
  minecraftVersion: McVersion = McVersion.v26_2,
): DatapackArtifact {
  return createTagResourceArtifact({
    kind: 'item_tag',
    id,
    policy,
    values,
    provenance,
    minecraftVersion,
  })
}

function graph(resources: readonly DatapackArtifact[]) {
  return createDatapackArtifactGraph([packMeta(), ...resources], {
    minecraftVersion: McVersion.v26_2,
    localNamespaces: ['demo'],
  })
}

describe('typed tag resource builder', () => {
  test('produces byte-identical JSON to an equivalent strict from-file contribution', () => {
    const typed = tag('demo:foods', [
      { kind: 'value', id: 'minecraft:apple' },
      { kind: 'value', id: 'minecraft:golden_apple', required: false },
      { kind: 'tag', id: 'demo:base_foods' },
      { kind: 'tag', id: 'demo:seasonal_foods', required: false },
    ], 'replace')
    const strict = createResourceArtifact({
      kind: 'item_tag',
      id: 'demo:foods',
      sourcePath: 'tags/foods.json',
      content: JSON.stringify({
        replace: true,
        values: [
          'minecraft:apple',
          { id: 'minecraft:golden_apple', required: false },
          '#demo:base_foods',
          { id: '#demo:seasonal_foods', required: false },
        ],
      }),
      provenance,
      minecraftVersion: McVersion.v26_2,
    })

    expect(typed.outputPath).toBe(strict.outputPath)
    expect(typed.content.equals(strict.content)).toBe(true)
    expect(typed.references).toEqual(strict.references)
    expect(typed.sourcePath).toBeUndefined()
  })

  test('uses the registry descriptor for legacy and modern tag paths', () => {
    expect(tag('demo:foods', [], 'merge', McVersion.v1_20).outputPath)
      .toBe('data/demo/tags/items/foods.json')
    expect(tag('demo:foods', [], 'merge', McVersion.v26_2).outputPath)
      .toBe('data/demo/tags/item/foods.json')
  })

  test('records only nested tags as typed references and preserves optionality', () => {
    expect(tag('demo:foods', [
      { kind: 'value', id: 'demo:apple' },
      { kind: 'tag', id: 'demo:base' },
      { kind: 'tag', id: 'demo:seasonal', required: false },
    ]).references).toEqual([
      { kind: 'item_tag', id: 'demo:base', required: true },
      { kind: 'item_tag', id: 'demo:seasonal', required: false },
    ])
  })

  test('rejects missing required local nested tags but permits missing optional tags', () => {
    expect(() => graph([tag('demo:foods', [{ kind: 'tag', id: 'demo:missing' }])]))
      .toThrow(/missing local resource 'item_tag demo:missing'/i)
    expect(() => graph([tag('demo:foods', [
      { kind: 'tag', id: 'demo:missing', required: false },
    ])])).not.toThrow()
  })

  test('validates direct function-tag entries as functions without closing ordinary registries', () => {
    const functionTag = createTagResourceArtifact({
      kind: 'function_tag',
      id: 'demo:loaders',
      policy: 'merge',
      values: [
        { kind: 'value', id: 'demo:missing' },
        { kind: 'value', id: 'demo:optional', required: false },
      ],
      provenance,
      minecraftVersion: McVersion.v26_2,
    })
    expect(functionTag.references).toEqual([
      { kind: 'function', id: 'demo:missing', required: true },
      { kind: 'function', id: 'demo:optional', required: false },
    ])
    expect(() => graph([functionTag])).toThrow(/missing local resource 'function demo:missing'/i)
  })

  test('rejects deterministic local tag-reference cycles', () => {
    expect(() => graph([
      tag('demo:a', [{ kind: 'tag', id: 'demo:b' }]),
      tag('demo:b', [{ kind: 'tag', id: 'demo:a' }]),
    ])).toThrow(/tag reference cycle.*demo:a.*demo:b.*demo:a/i)
  })

  test('rejects null or non-boolean strict tag policy and optionality fields', () => {
    const strictTag = (content: string) => createResourceArtifact({
      kind: 'item_tag',
      id: 'demo:strict',
      sourcePath: 'tags/strict.json',
      content,
      provenance,
      minecraftVersion: McVersion.v26_2,
    })
    expect(() => strictTag('{"replace":null,"values":[]}')).toThrow(/replace must be a boolean/i)
    expect(() => strictTag('{"replace":false,"values":[{"id":"#demo:x","required":null}]}'))
      .toThrow(/required must be a boolean/i)
  })

  test('rejects non-tag kinds and invalid value identifiers at the builder boundary', () => {
    expect(() => createTagResourceArtifact({
      kind: 'recipe' as 'item_tag',
      id: 'demo:not_a_tag',
      policy: 'merge',
      values: [],
      provenance,
      minecraftVersion: McVersion.v26_2,
    })).toThrow(/not a tag resource kind/i)
    expect(() => tag('demo:bad', [{ kind: 'value', id: 'Demo:UPPER' }]))
      .toThrow(/invalid tag value id/i)
  })
})
