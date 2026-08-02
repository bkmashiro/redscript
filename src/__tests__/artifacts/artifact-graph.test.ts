import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  ArtifactGraphError,
  createDatapackArtifactGraph,
  createResourceArtifact,
  generatedDatapackArtifacts,
  projectLegacyDatapackFiles,
  resolveResourceDescriptor,
  writeArtifactDirectoryAtomically,
  writeArtifactZipAtomically,
} from '../../artifacts'
import { McVersion } from '../../types/mc-version'

const provenance = {
  kind: 'source' as const,
  modulePath: 'example.com/demo',
  packagePath: 'example.com/demo/cmd/pack',
  sourceFile: '/project/src/cmd/pack/main.mcrs',
  line: 2,
  col: 1,
}

describe('typed datapack artifact graph', () => {
  test('round-trips legacy generated text artifacts byte-for-byte in canonical path order', () => {
    const files = [
      { path: 'data/demo/function/main.mcfunction', content: 'say hi\n' },
      { path: 'pack.mcmeta', content: '{"pack":{"pack_format":107.1}}\n' },
      { path: 'data/minecraft/tags/function/load.json', content: '{"values":["demo:main"]}\n' },
    ]

    const graph = createDatapackArtifactGraph(
      generatedDatapackArtifacts(files, McVersion.v26_2),
      { minecraftVersion: McVersion.v26_2, localNamespaces: ['demo'] },
    )

    expect(projectLegacyDatapackFiles(graph)).toEqual([...files].sort((a, b) => a.path.localeCompare(b.path)))
    expect(graph.artifacts.map(artifact => artifact.identity.kind)).toEqual([
      'function',
      'function_tag',
      'pack_meta',
    ])
  })

  test('uses versioned registry descriptors for JSON, tags, and structure NBT', () => {
    expect(resolveResourceDescriptor('recipe', McVersion.v1_20_4).directory).toBe('recipes')
    expect(resolveResourceDescriptor('recipe', McVersion.v26_2).directory).toBe('recipe')
    expect(resolveResourceDescriptor('item_tag', McVersion.v26_2)).toMatchObject({
      directory: 'tags/item',
      mediaType: 'application/json',
      lifecycle: 'reload',
    })
    expect(resolveResourceDescriptor('structure', McVersion.v26_2)).toMatchObject({
      directory: 'structure',
      mediaType: 'application/nbt',
      lifecycle: 'reload',
    })
    expect(resolveResourceDescriptor('dimension', McVersion.v1_21_4)).toMatchObject({
      directory: 'dimension',
      mediaType: 'application/json',
      lifecycle: 'world_reopen',
    })
    expect(resolveResourceDescriptor('dimension_type', McVersion.v1_21_4)).toMatchObject({
      directory: 'dimension_type',
      mediaType: 'application/json',
      lifecycle: 'world_reopen',
    })
  })

  test('canonicalizes JSON resources and preserves binary NBT', () => {
    const recipe = createResourceArtifact({
      kind: 'recipe',
      id: 'demo:toast',
      sourcePath: '/project/assets/recipes/toast.json',
      content: '{"result":{"id":"minecraft:bread"},"type":"minecraft:crafting_shapeless","ingredients":[]}',
      provenance,
      minecraftVersion: McVersion.v26_2,
    })
    const structureBytes = Buffer.from([10, 0, 0, 0])
    const structure = createResourceArtifact({
      kind: 'structure',
      id: 'demo:hut',
      sourcePath: '/project/assets/structures/hut.nbt',
      content: structureBytes,
      provenance,
      minecraftVersion: McVersion.v26_2,
    })

    const graph = createDatapackArtifactGraph([recipe, structure], {
      minecraftVersion: McVersion.v26_2,
      localNamespaces: ['demo'],
      requirePackMeta: false,
    })

    expect(graph.artifacts.map(artifact => artifact.outputPath)).toEqual([
      'data/demo/recipe/toast.json',
      'data/demo/structure/hut.nbt',
    ])
    expect(graph.artifacts[0].content.toString('utf8')).toBe(
      '{\n  "ingredients": [],\n  "result": {\n    "id": "minecraft:bread"\n  },\n  "type": "minecraft:crafting_shapeless"\n}\n',
    )
    expect(graph.artifacts[1].content).toEqual(structureBytes)
    expect(projectLegacyDatapackFiles(graph).map(file => file.path)).toEqual([
      'data/demo/recipe/toast.json',
    ])
  })

  test('validates known recipe result fields without closing special or modded serializers', () => {
    const recipe = (id: string, content: string) => createResourceArtifact({
      kind: 'recipe',
      id: `demo:${id}`,
      sourcePath: `/project/assets/${id}.json`,
      content,
      provenance,
      minecraftVersion: McVersion.v26_2,
    })

    expect(() => recipe('special', '{"type":"minecraft:crafting_special_armordye"}')).not.toThrow()
    expect(() => recipe('modded', '{"type":"mod:machine_recipe"}')).not.toThrow()
    expect(() => recipe('broken', '{"type":"minecraft:crafting_shaped"}')).toThrow(/result/i)
  })

  test.each([
    ['malformed JSON', () => createResourceArtifact({
      kind: 'recipe',
      id: 'demo:bad',
      sourcePath: '/project/assets/bad.json',
      content: '{',
      provenance,
      minecraftVersion: McVersion.v26_2,
    }), /invalid JSON/i],
    ['malformed NBT', () => createResourceArtifact({
      kind: 'structure',
      id: 'demo:bad',
      sourcePath: '/project/assets/bad.nbt',
      content: Buffer.from([10, 0, 0]),
      provenance,
      minecraftVersion: McVersion.v26_2,
    }), /invalid NBT/i],
    ['invalid resource id', () => createResourceArtifact({
      kind: 'recipe',
      id: '../bad',
      sourcePath: '/project/assets/bad.json',
      content: '{}',
      provenance,
      minecraftVersion: McVersion.v26_2,
    }), /resource id/i],
  ])('rejects %s before graph projection', (_label, build, expected) => {
    expect(build).toThrow(expected)
  })

  test('preserves prototype-named JSON keys without mutating object prototypes', () => {
    const artifact = createResourceArtifact({
      kind: 'recipe',
      id: 'demo:safe',
      sourcePath: '/project/assets/safe.json',
      content: '{"type":"minecraft:crafting_shapeless","ingredients":[],"result":{"id":"minecraft:stone"},"__proto__":{"polluted":true}}',
      provenance,
      minecraftVersion: McVersion.v26_2,
    })
    const parsed = JSON.parse(artifact.content.toString('utf8'))

    expect(Object.prototype.hasOwnProperty.call(parsed, '__proto__')).toBe(true)
    expect(parsed.__proto__).toEqual({ polluted: true })
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined()
  })

  test('rejects duplicate physical paths even when bytes match and reports both provenances', () => {
    const first = createResourceArtifact({
      kind: 'recipe',
      id: 'demo:same',
      sourcePath: '/project/assets/one.json',
      content: '{"type":"minecraft:crafting_shapeless","ingredients":[],"result":{"id":"minecraft:stone"}}',
      provenance,
      minecraftVersion: McVersion.v26_2,
    })
    const second = createResourceArtifact({
      kind: 'recipe',
      id: 'demo:same',
      sourcePath: '/project/assets/two.json',
      content: '{"type":"minecraft:crafting_shapeless","ingredients":[],"result":{"id":"minecraft:stone"}}',
      provenance: { ...provenance, sourceFile: '/project/src/other.mcrs' },
      minecraftVersion: McVersion.v26_2,
    })

    expect(() => createDatapackArtifactGraph([first, second], {
      minecraftVersion: McVersion.v26_2,
      localNamespaces: ['demo'],
      requirePackMeta: false,
    })).toThrow(/collision.*one\.json.*other\.mcrs/i)
  })

  test('rejects missing local tag references and descriptor lifecycle drift', () => {
    const tag = createResourceArtifact({
      kind: 'item_tag',
      id: 'demo:foods',
      sourcePath: '/project/assets/tags/foods.json',
      content: '{"values":["#demo:missing"]}',
      provenance,
      minecraftVersion: McVersion.v26_2,
    })
    expect(() => createDatapackArtifactGraph([tag], {
      minecraftVersion: McVersion.v26_2,
      localNamespaces: ['demo'],
      requirePackMeta: false,
    })).toThrow(/missing local resource.*demo:missing/i)

    const invalidLifecycle = { ...tag, references: [], lifecycle: 'restart' as const }
    expect(() => createDatapackArtifactGraph([invalidLifecycle], {
      minecraftVersion: McVersion.v26_2,
      localNamespaces: ['demo'],
      requirePackMeta: false,
    })).toThrow(/lifecycle.*reload/i)
  })
})

describe('deterministic artifact projections', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-artifacts-'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  function graph() {
    return createDatapackArtifactGraph(generatedDatapackArtifacts([
      { path: 'pack.mcmeta', content: '{"pack":{"pack_format":107.1}}\n' },
      { path: 'data/demo/function/main.mcfunction', content: 'say deterministic\n' },
    ], McVersion.v26_2), {
      minecraftVersion: McVersion.v26_2,
      localNamespaces: ['demo'],
    })
  }

  test('atomically replaces a directory and removes stale output only after validation', () => {
    const output = path.join(root, 'dist')
    fs.mkdirSync(output)
    fs.writeFileSync(path.join(output, 'stale.txt'), 'stale')

    writeArtifactDirectoryAtomically(graph(), output)

    expect(fs.existsSync(path.join(output, 'stale.txt'))).toBe(false)
    expect(fs.readFileSync(path.join(output, 'data/demo/function/main.mcfunction'), 'utf8')).toBe('say deterministic\n')
  })

  test('writes byte-identical zip archives from the same graph', async () => {
    const first = path.join(root, 'first.zip')
    const second = path.join(root, 'second.zip')

    await writeArtifactZipAtomically(graph(), first)
    await writeArtifactZipAtomically(graph(), second)

    expect(fs.readFileSync(first)).toEqual(fs.readFileSync(second))
  })

  test('does not mutate an existing output when graph construction fails', () => {
    const output = path.join(root, 'dist')
    fs.mkdirSync(output)
    fs.writeFileSync(path.join(output, 'sentinel.txt'), 'keep')

    expect(() => createDatapackArtifactGraph([
      ...graph().artifacts,
      { ...graph().artifacts[0], outputPath: '../escape' },
    ], {
      minecraftVersion: McVersion.v26_2,
      localNamespaces: ['demo'],
    })).toThrow(ArtifactGraphError)
    expect(fs.readFileSync(path.join(output, 'sentinel.txt'), 'utf8')).toBe('keep')
  })
})
