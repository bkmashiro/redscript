import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { loadProject } from '../../project/manifest'
import { loadPackageGraph } from '../../project/package-loader'

function makeProject(files: Record<string, string>, entry = 'example.com/castle/cmd/pack::main'): string {
  const root = mkdtempSync(path.join(tmpdir(), 'redscript-packages-'))
  writeFileSync(path.join(root, 'redscript.toml'), `
[project]
name = "castle"
module = "example.com/castle"
namespace = "castle"
source-roots = ["src"]

[target.pack]
kind = "datapack"
entry = "${entry}"
out = "build"
`)
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath)
    mkdirSync(path.dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, content)
  }
  return root
}

describe('project package loader', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  test('groups files by directory package and orders dependencies before importers', () => {
    const root = makeProject({
      'src/combat/combat.mcrs': 'package combat; export fn start_round(): void {}',
      'src/combat/damage.mcrs': 'package combat; export fn damage(): int { return 1; }',
      'src/cmd/pack/main.mcrs': `
package pack;
import "example.com/castle/combat" as combat;
export fn main(): void { combat::start_round(); }
`,
    })
    roots.push(root)

    const project = loadProject(root)!
    const graph = loadPackageGraph(project, project.defaultTarget)
    const combat = graph.packages.get('example.com/castle/combat')

    expect(combat?.name).toBe('combat')
    expect(combat?.sourceFiles.map(file => path.basename(file.absolutePath))).toEqual([
      'combat.mcrs',
      'damage.mcrs',
    ])
    expect(combat?.programs.map(program => program.packageName)).toEqual(['combat', 'combat'])
    expect(graph.rootPackages.map(id => id.path)).toEqual(['example.com/castle/cmd/pack'])
    expect(graph.topologicalOrder.map(id => id.path)).toEqual([
      'example.com/castle/combat',
      'example.com/castle/cmd/pack',
    ])
    expect(combat?.programs[1].declarations[0].span?.file).toBe(
      realpathSync(path.join(root, 'src/combat/damage.mcrs')),
    )
  })

  test('rejects files with different package names in the same directory', () => {
    const root = makeProject({
      'src/cmd/pack/a.mcrs': 'package pack; export fn main(): void {}',
      'src/cmd/pack/b.mcrs': 'package other; fn helper(): void {}',
    })
    roots.push(root)

    expect(() => loadPackageGraph(loadProject(root)!)).toThrow(
      /package 'other'.*same directory.*package 'pack'/i,
    )
  })

  test('requires package declarations and rejects legacy/relative imports in strict project mode', () => {
    const missing = makeProject({
      'src/cmd/pack/main.mcrs': 'export fn main(): void {}',
    })
    roots.push(missing)
    expect(() => loadPackageGraph(loadProject(missing)!)).toThrow(/must declare package/i)

    const legacy = makeProject({
      'src/cmd/pack/main.mcrs': `
package pack;
import helper;
export fn main(): void {}
`,
      'src/cmd/pack/helper.mcrs': 'package pack; fn helper(): void {}',
    })
    roots.push(legacy)
    expect(() => loadPackageGraph(loadProject(legacy)!)).toThrow(/canonical package path/i)
  })

  test('rejects overlapping source roots because they make canonical package identity ambiguous', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'redscript-package-loader-'))
    roots.push(root)
    const sourceFile = path.join(root, 'src/generated/cmd/pack/main.mcrs')
    mkdirSync(path.dirname(sourceFile), { recursive: true })
    writeFileSync(sourceFile, 'package pack; export fn main(): void {}')
    writeFileSync(path.join(root, 'redscript.toml'), `
[project]
name = "castle"
module = "example.com/castle"
namespace = "castle"
source-roots = ["src", "src/generated"]

[target.pack]
kind = "datapack"
entry = "example.com/castle/cmd/pack::main"
out = "build"
default = true
`)

    expect(() => loadPackageGraph(loadProject(root)!)).toThrow(/overlapping source roots.*ambiguous/i)
  })

  test('allows equal package names at distinct canonical package paths', () => {
    const root = makeProject({
      'src/a/util/util.mcrs': 'package util; export fn a(): void {}',
      'src/b/util/util.mcrs': 'package util; export fn b(): void {}',
      'src/cmd/pack/main.mcrs': 'package pack; export fn main(): void {}',
    })
    roots.push(root)

    const graph = loadPackageGraph(loadProject(root)!)
    expect(graph.packages.get('example.com/castle/a/util')?.name).toBe('util')
    expect(graph.packages.get('example.com/castle/b/util')?.name).toBe('util')
  })
})
