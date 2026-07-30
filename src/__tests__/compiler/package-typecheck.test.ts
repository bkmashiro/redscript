import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { loadProject } from '../../project/manifest'
import { loadPackageGraph } from '../../project/package-loader'
import { resolvePackageSymbols } from '../../resolver/package-symbols'
import { typecheckResolvedPackageProgram } from '../../index'

function makeProject(argumentList: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'redscript-package-typecheck-'))
  writeFileSync(path.join(root, 'redscript.toml'), `
[project]
name = "app"
module = "example.com/app"
namespace = "app"
source-roots = ["src"]
mc-version = "26.2"

[target.build]
kind = "commands"
entry = "example.com/app/cmd::main"
out = "build"
`)
  mkdirSync(path.join(root, 'src/cmd'), { recursive: true })
  mkdirSync(path.join(root, 'src/lib'), { recursive: true })
  writeFileSync(path.join(root, 'src/cmd/main.mcrs'), `
package cmd;
import "example.com/app/lib" as lib;
export fn main(): void { lib::twice(${argumentList}); }
`)
  writeFileSync(path.join(root, 'src/lib/math.mcrs'), `
package lib;
export fn twice(value: int): int { return value * 2; }
`)
  return root
}

describe('linked package typecheck stage', () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
  })

  test('checks cross-package calls against exported signatures without mutating linked ASTs', () => {
    const root = makeProject('1, 2')
    roots.push(root)
    const project = loadProject(root)!
    const linked = resolvePackageSymbols(loadPackageGraph(project, project.targets.build))
    const before = JSON.stringify([...linked.graph.packages.values()].map(pkg => pkg.programs))

    const result = typecheckResolvedPackageProgram(linked)

    expect(result.errors.map(error => error.message)).toContain(
      "Function 'example.com/app/lib::twice' expects 1 arguments, got 2",
    )
    expect(result.errors[0].location.file).toMatch(/src\/cmd\/main\.mcrs$/)
    expect(JSON.stringify([...linked.graph.packages.values()].map(pkg => pkg.programs))).toBe(before)
  })

  test('accepts a valid cross-package call', () => {
    const root = makeProject('1')
    roots.push(root)
    const project = loadProject(root)!
    const linked = resolvePackageSymbols(loadPackageGraph(project, project.targets.build))

    expect(typecheckResolvedPackageProgram(linked).errors).toEqual([])
  })

  test('does not typecheck an unimported local dependency package', () => {
    const workspace = mkdtempSync(path.join(tmpdir(), 'redscript-package-typecheck-unused-'))
    roots.push(workspace)
    const app = path.join(workspace, 'app')
    const shared = path.join(workspace, 'shared')
    mkdirSync(path.join(app, 'src/cmd'), { recursive: true })
    mkdirSync(path.join(shared, 'src/lib'), { recursive: true })
    writeFileSync(path.join(app, 'redscript.toml'), `
[project]
name = "app"
module = "example.com/app"
namespace = "app"
source-roots = ["src"]

[dependencies]
"example.com/shared" = { path = "../shared" }

[target.build]
kind = "datapack"
entry = "example.com/app/cmd::main"
out = "build"
`)
    writeFileSync(path.join(app, 'src/cmd/main.mcrs'), `
package cmd;
export fn main(): void {}
`)
    writeFileSync(path.join(shared, 'redscript.toml'), `
[project]
name = "shared"
module = "example.com/shared"
namespace = "shared"
source-roots = ["src"]
`)
    writeFileSync(path.join(shared, 'src/lib/lib.mcrs'), `
package lib;
export fn broken(): int { return "wrong"; }
`)

    const project = loadProject(app)!
    const linked = resolvePackageSymbols(loadPackageGraph(project, project.targets.build))
    expect(typecheckResolvedPackageProgram(linked).errors).toEqual([])
  })
})
