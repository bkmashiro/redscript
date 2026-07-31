import { McVersion } from '../../types/mc-version'
import { createDatapackArtifactGraph, generatedDatapackArtifacts } from '../../artifacts/graph'
import { createAdvancementResourceArtifact } from '../../artifacts/advancement-builder'
import { createPredicateResourceArtifact } from '../../artifacts/predicate-builder'
import type { DatapackArtifact, DatapackArtifactProvenance } from '../../artifacts/model'

const provenance: DatapackArtifactProvenance = Object.freeze({ kind: 'generated', stage: 'advancement-predicate-test' })

function pack(): DatapackArtifact {
  return generatedDatapackArtifacts([{ path: 'pack.mcmeta', content: '{}\n' }], McVersion.v26_2)[0]
}

function graph(resources: readonly DatapackArtifact[]) {
  return createDatapackArtifactGraph([pack(), ...resources], {
    minecraftVersion: McVersion.v26_2,
    localNamespaces: ['demo'],
  })
}

describe('typed advancement resource builder', () => {
  test('models criteria, requirements, rewards, and typed artifact references', () => {
    const artifact = createAdvancementResourceArtifact({
      id: 'demo:chapter',
      advancement: {
        parent: 'demo:root',
        criteria: {
          tick: { trigger: 'minecraft:tick' },
          impossible: { trigger: 'minecraft:impossible' },
        },
        requirements: [['tick', 'impossible']],
        rewards: {
          experience: 5,
          function: 'demo:reward',
          loot: ['demo:bonus'],
          recipes: ['demo:toast'],
        },
      },
      provenance,
      minecraftVersion: McVersion.v26_2,
    })
    expect(artifact.outputPath).toBe('data/demo/advancement/chapter.json')
    expect(artifact.references).toEqual([
      { kind: 'advancement', id: 'demo:root' },
      { kind: 'function', id: 'demo:reward' },
      { kind: 'loot_table', id: 'demo:bonus' },
      { kind: 'recipe', id: 'demo:toast' },
    ])
  })

  test('rejects requirements that name missing criteria', () => {
    expect(() => createAdvancementResourceArtifact({
      id: 'demo:bad',
      advancement: {
        criteria: { tick: { trigger: 'minecraft:tick' } },
        requirements: [['missing']],
      },
      provenance,
      minecraftVersion: McVersion.v26_2,
    })).toThrow(/requirement.*missing.*criterion/i)
  })

  test('rejects deterministic local parent cycles', () => {
    const advancement = (id: string, parent: string) => createAdvancementResourceArtifact({
      id,
      advancement: { parent, criteria: { tick: { trigger: 'minecraft:tick' } } },
      provenance,
      minecraftVersion: McVersion.v26_2,
    })
    expect(() => graph([
      advancement('demo:a', 'demo:b'),
      advancement('demo:b', 'demo:a'),
    ])).toThrow(/advancement reference cycle.*demo:a.*demo:b.*demo:a/i)
  })
})

describe('typed predicate resource builder', () => {
  test('models compositional predicates and records reference conditions', () => {
    const artifact = createPredicateResourceArtifact({
      id: 'demo:allowed',
      predicate: {
        kind: 'all_of',
        terms: [
          { kind: 'reference', name: 'demo:base' },
          { kind: 'inverted', term: { kind: 'leaf', condition: 'minecraft:weather_check', fields: { raining: true } } },
        ],
      },
      provenance,
      minecraftVersion: McVersion.v26_2,
    })
    expect(artifact.outputPath).toBe('data/demo/predicate/allowed.json')
    expect(JSON.parse(artifact.content.toString('utf8'))).toEqual({
      condition: 'minecraft:all_of',
      terms: [
        { condition: 'minecraft:reference', name: 'demo:base' },
        { condition: 'minecraft:inverted', term: { condition: 'minecraft:weather_check', raining: true } },
      ],
    })
    expect(artifact.references).toEqual([{ kind: 'predicate', id: 'demo:base' }])
  })

  test('rejects empty combinators and local predicate cycles', () => {
    expect(() => createPredicateResourceArtifact({
      id: 'demo:empty',
      predicate: { kind: 'any_of', terms: [] },
      provenance,
      minecraftVersion: McVersion.v26_2,
    })).toThrow(/at least one term/i)
    const predicate = (id: string, name: string) => createPredicateResourceArtifact({
      id,
      predicate: { kind: 'reference', name },
      provenance,
      minecraftVersion: McVersion.v26_2,
    })
    expect(() => graph([
      predicate('demo:a', 'demo:b'),
      predicate('demo:b', 'demo:a'),
    ])).toThrow(/predicate reference cycle.*demo:a.*demo:b.*demo:a/i)
  })
})
