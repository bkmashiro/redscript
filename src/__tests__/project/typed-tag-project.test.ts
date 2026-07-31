import fs from 'fs'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { createCompilerSession } from '../../emit/compile'
import { loadProject, resolveBuildTarget } from '../../project/manifest'

function makeProject(
  source: string,
  kind: 'datapack' | 'commands' = 'datapack',
  assets?: Record<string, string>,
): string {
  const root = mkdtempSync(path.join(tmpdir(), 'redscript-typed-tag-project-'))
  const sourceFile = path.join(root, 'src/cmd/pack/main.mcrs')
  mkdirSync(path.dirname(sourceFile), { recursive: true })
  writeFileSync(sourceFile, source)
  if (assets) {
    for (const [relativePath, content] of Object.entries(assets)) {
      const assetPath = path.join(root, 'assets', relativePath)
      mkdirSync(path.dirname(assetPath), { recursive: true })
      writeFileSync(assetPath, content)
    }
  }
  writeFileSync(path.join(root, 'redscript.toml'), `
[project]
name = "demo"
module = "example.com/demo"
namespace = "demo"
source-roots = ["src"]
mc-version = "26.2"
${assets ? '\n[assets]\nroots = ["assets"]\ninclude = ["**/*.json"]\n' : ''}
[target.build]
kind = "${kind}"
entry = "example.com/demo/cmd/pack::main"
out = "build"
`)
  return root
}

function compile(root: string) {
  const project = loadProject(root)!
  return createCompilerSession({
    project,
    target: resolveBuildTarget(project),
  }).compileProject()
}

describe('typed tag project contributions', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  test('lowers source-level typed tags into the P7 graph with source provenance', () => {
    const root = makeProject(`
package pack;
resource item_tag demo:base_foods {
  value minecraft:apple;
}
resource item_tag demo:foods {
  policy replace;
  tag demo:base_foods;
  optional tag demo:seasonal_foods;
  optional value minecraft:golden_apple;
}
export fn main(): void {}
`)
    roots.push(root)

    const result = compile(root)
    expect(result.kind).toBe('datapack')
    if (result.kind !== 'datapack') throw new Error('expected datapack result')
    const artifact = result.artifacts.find(candidate => candidate.identity.id === 'demo:foods')!
    expect(artifact.identity.kind).toBe('item_tag')
    expect(artifact.outputPath).toBe('data/demo/tags/item/foods.json')
    expect(JSON.parse(artifact.content.toString('utf8'))).toEqual({
      replace: true,
      values: [
        '#demo:base_foods',
        { id: '#demo:seasonal_foods', required: false },
        { id: 'minecraft:golden_apple', required: false },
      ],
    })
    expect(artifact.provenance).toMatchObject({
      kind: 'source',
      modulePath: 'example.com/demo',
      packagePath: 'example.com/demo/cmd/pack',
      sourceFile: fs.realpathSync(path.join(root, 'src/cmd/pack/main.mcrs')),
    })
  })

  test('fails a commands target before artifact emission', () => {
    const root = makeProject(`
package pack;
resource item_tag demo:foods { value minecraft:apple; }
export fn main(): void {}
`, 'commands')
    roots.push(root)

    expect(() => compile(root)).toThrow(
      /RST2003|does not support 'resource-artifacts'.*typed tag item_tag demo:foods/is,
    )
  })

  test('rejects collisions between typed and strict JSON contributions', () => {
    const root = makeProject(`
package pack;
resource item_tag demo:foods { value minecraft:apple; }
resource item_tag demo:foods from "tags/foods.json";
export fn main(): void {}
`, 'datapack', {
      'tags/foods.json': '{"replace":false,"values":["minecraft:bread"]}',
    })
    roots.push(root)

    expect(() => compile(root)).toThrow(/artifact (identity )?collision.*data\/demo\/tags\/item\/foods\.json|item_tag.*demo:foods/is)
  })
})
