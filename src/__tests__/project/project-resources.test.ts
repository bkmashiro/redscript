import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { gzipSync } from 'zlib'

import { createCompilerSession } from '../../emit/compile'
import { loadProject, resolveBuildTarget } from '../../project/manifest'
import { loadProjectModuleGraph } from '../../project/module-graph'
import type { DatapackProjectCompileResult } from '../../compiler/package-backend'

function write(root: string, relativePath: string, content: string | Buffer): void {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

function manifest(kind: 'datapack' | 'commands' = 'datapack'): string {
  return `
[project]
name = "demo"
module = "example.com/demo"
namespace = "demo"
mc-version = "26.2"
source-roots = ["src"]

[assets]
roots = ["assets"]
include = ["**/*.json", "**/*.nbt"]

[target.main]
kind = "${kind}"
entry = "example.com/demo/cmd/pack::main"
out = "dist${kind === 'commands' ? '/main.commands.json' : ''}"
default = true
`
}

function source(): string {
  return `
package pack;
resource recipe demo:toast from "recipes/toast.json";
resource item_tag demo:foods from "tags/foods.json";
resource structure demo:hut from "structures/hut.nbt";
resource dimension demo:moon from "dimensions/moon.json";
resource dimension_type demo:moon from "dimensions/moon_type.json";
export fn main(): void {}
`
}

describe('project resource artifact integration', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-project-resources-'))
    write(root, 'redscript.toml', manifest())
    write(root, 'src/cmd/pack/main.mcrs', source())
    write(root, 'assets/recipes/toast.json', JSON.stringify({
      type: 'minecraft:crafting_shapeless',
      ingredients: [{ item: 'minecraft:wheat' }],
      result: { id: 'minecraft:bread' },
    }))
    write(root, 'assets/tags/foods.json', JSON.stringify({ values: ['minecraft:apple'] }))
    write(root, 'assets/structures/hut.nbt', gzipSync(Buffer.from([10, 0, 0, 0])))
    write(root, 'assets/dimensions/moon.json', JSON.stringify({ type: 'minecraft:overworld', generator: {} }))
    write(root, 'assets/dimensions/moon_type.json', JSON.stringify({ natural: false }))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  function compile(): DatapackProjectCompileResult {
    const project = loadProject(root)!
    const result = createCompilerSession({
      project,
      target: resolveBuildTarget(project),
    }).compileProject()
    expect(result.kind).toBe('datapack')
    return result as DatapackProjectCompileResult
  }

  test('builds functions, recipe JSON, item tag JSON, and compressed structure NBT into one graph', () => {
    const result = compile()
    const paths = result.artifacts.map(artifact => artifact.outputPath)

    expect(paths).toEqual([...paths].sort())
    expect(paths).toEqual(expect.arrayContaining([
      'data/demo/function/cmd/pack/main.mcfunction',
      'data/demo/recipe/toast.json',
      'data/demo/tags/item/foods.json',
      'data/demo/structure/hut.nbt',
      'data/demo/dimension/moon.json',
      'data/demo/dimension_type/moon.json',
      'pack.mcmeta',
    ]))
    expect(result.files.map(file => file.path)).toContain('data/demo/recipe/toast.json')
    expect(result.files.map(file => file.path)).not.toContain('data/demo/structure/hut.nbt')
    expect(result.artifacts.filter(artifact => artifact.lifecycle === 'world_reopen').map(artifact => artifact.outputPath)).toEqual([
      'data/demo/dimension/moon.json',
      'data/demo/dimension_type/moon.json',
    ])
    expect(result.artifacts.find(artifact => artifact.identity.kind === 'structure')?.provenance).toMatchObject({
      kind: 'source',
      modulePath: 'example.com/demo',
      packagePath: 'example.com/demo/cmd/pack',
      sourceFile: fs.realpathSync(path.join(root, 'src/cmd/pack/main.mcrs')),
    })
  })

  test('loads canonical asset roots and include patterns into the manifest model', () => {
    const project = loadProject(root)!
    expect(project.assets).toEqual({
      roots: [fs.realpathSync(path.join(root, 'assets'))],
      include: ['**/*.json', '**/*.nbt'],
    })
  })

  test('includes configured asset bytes in module provenance hashes', () => {
    const firstProject = loadProject(root)!
    const first = loadProjectModuleGraph(firstProject).modules.get('example.com/demo')!.contentHash

    write(root, 'assets/recipes/toast.json', JSON.stringify({
      type: 'minecraft:crafting_shapeless',
      ingredients: [{ item: 'minecraft:wheat' }],
      result: { id: 'minecraft:bread', count: 2 },
    }))
    const secondProject = loadProject(root)!
    const second = loadProjectModuleGraph(secondProject).modules.get('example.com/demo')!.contentHash

    expect(second).not.toBe(first)
  })

  test('rejects emitting resource declarations for commands before backend emission', () => {
    write(root, 'redscript.toml', manifest('commands'))
    const project = loadProject(root)!

    expect(() => createCompilerSession({
      project,
      target: resolveBuildTarget(project),
    }).compileProject()).toThrow(/RST2003|does not support 'resource-artifacts'.*resource recipe demo:toast/is)
  })

  test('rejects assets excluded by manifest patterns', () => {
    write(root, 'redscript.toml', manifest().replace(
      'include = ["**/*.json", "**/*.nbt"]',
      'include = ["recipes/*.json"]',
    ))

    expect(() => compile()).toThrow(/tags\/foods\.json.*not included by \[assets\]\.include/i)
  })

  test('rejects asset symlinks that escape the owning module root', () => {
    const outside = path.join(path.dirname(root), `${path.basename(root)}-outside.json`)
    fs.writeFileSync(outside, '{}')
    fs.rmSync(path.join(root, 'assets/recipes/toast.json'))
    fs.symlinkSync(outside, path.join(root, 'assets/recipes/toast.json'))

    try {
      expect(() => compile()).toThrow(/escapes.*asset root|symbolic link/i)
    } finally {
      fs.rmSync(outside, { force: true })
    }
  })

  test('rejects ambiguous source files across configured asset roots', () => {
    fs.mkdirSync(path.join(root, 'second-assets'))
    write(root, 'second-assets/recipes/toast.json', '{}')
    write(root, 'redscript.toml', manifest().replace(
      'roots = ["assets"]',
      'roots = ["assets", "second-assets"]',
    ))

    expect(() => compile()).toThrow(/ambiguous.*recipes\/toast\.json/i)
  })
})
