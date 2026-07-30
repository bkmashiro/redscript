import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { spawnSync } from 'child_process'

import { createCompilerSession } from '../../emit/compile'
import { loadProject } from '../../project/manifest'
import { loadPackageGraph } from '../../project/package-loader'
import { validateDatapackArtifact } from '../../testing/datapack-artifact-validator'

function write(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content)
}

function runCli(args: string[], cwd: string) {
  return spawnSync(
    process.execPath,
    [
      '-r',
      require.resolve('ts-node/register/transpile-only'),
      path.resolve(__dirname, '..', '..', 'cli.ts'),
      ...args,
    ],
    {
      cwd,
      encoding: 'utf8',
      env: {
        ...process.env,
        REDSCRIPT_NO_UPDATE_CHECK: '1',
        TS_NODE_PROJECT: path.resolve(__dirname, '..', '..', '..', 'tsconfig.json'),
      },
    },
  )
}

function libraryManifest(modulePath: string, dependencies = ''): string {
  return `
[project]
name = "${modulePath.split('/').pop()}"
module = "${modulePath}"
namespace = "library"
source-roots = ["src"]
${dependencies}
`
}

function appManifest(dependencies = ''): string {
  return `
[project]
name = "app"
module = "example.com/app"
namespace = "app"
source-roots = ["src"]
mc-version = "1.21.4"

${dependencies}

[target.pack]
kind = "datapack"
entry = "example.com/app/cmd/pack::main"
out = "build"
`
}

describe('local module package dependencies', () => {
  let workspace: string

  beforeEach(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'redscript-local-deps-'))
  })

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  test('resolves and compiles an explicitly declared local module from any cwd', () => {
    const shared = path.join(workspace, 'shared')
    const app = path.join(workspace, 'app')
    mkdirSync(shared)
    mkdirSync(app)
    write(shared, 'redscript.toml', libraryManifest('example.com/shared'))
    write(shared, 'src/math/math.mcrs', `
package math;
export fn one(): int { return 1; }
`)
    write(app, 'redscript.toml', appManifest(`
[dependencies]
"example.com/shared" = { path = "../shared" }
`))
    write(app, 'src/cmd/pack/main.mcrs', `
package pack;
import "example.com/shared/math" as math;
export fn main(): void { let value: int = math::one(); }
`)

    const project = loadProject(path.join(app, 'src', 'cmd', 'pack'))!
    const graph = loadPackageGraph(project)
    expect(graph.packages.get('example.com/shared/math')?.id).toMatchObject({
      modulePath: 'example.com/shared',
      packagePath: 'math',
    })
    expect(graph.packages.get('example.com/app/cmd/pack')?.imports[0]).toMatchObject({
      path: 'example.com/shared/math',
      modulePath: 'example.com/shared',
    })
    expect(graph.topologicalOrder.map(id => id.path)).toEqual([
      'example.com/shared/math',
      'example.com/app/cmd/pack',
    ])

    const session = createCompilerSession({ project, target: project.targets.pack })
    const result = session.compileProject()
    const validation = validateDatapackArtifact(result.files)
    expect(validation.errors).toEqual([])
    expect(validation.valid).toBe(true)
    expect(result.files.map(file => file.path)).toContain(
      'data/app/function/_deps/example.com/shared/math/one.mcfunction',
    )
    const main = result.files.find(file => file.path.endsWith('/cmd/pack/main.mcfunction'))
    expect(main?.content).toContain('function app:_deps/example.com/shared/math/one')

    const cliResult = runCli([
      'compile',
      path.join(app, 'src/cmd/pack/main.mcrs'),
      '--target',
      'pack',
    ], workspace)
    if (cliResult.status !== 0) {
      throw new Error(`CLI failed (${cliResult.status}):\n${cliResult.stdout}\n${cliResult.stderr}`)
    }
    const emittedMain = path.join(app, 'build/data/app/function/cmd/pack/main.mcfunction')
    expect(existsSync(emittedMain)).toBe(true)
    expect(readFileSync(emittedMain, 'utf8')).toContain(
      'function app:_deps/example.com/shared/math/one',
    )

    const inspectResult = runCli(['project', path.join(app, 'src'), '--format', 'json'], workspace)
    if (inspectResult.status !== 0) {
      throw new Error(`Project inspection failed (${inspectResult.status}):\n${inspectResult.stderr}`)
    }
    const inspection = JSON.parse(inspectResult.stdout)
    expect(inspection.dependencies).toEqual([{
      modulePath: 'example.com/shared',
      rootDir: realpathSync(shared),
      manifestPath: realpathSync(path.join(shared, 'redscript.toml')),
    }])
    expect(inspection.modules.map((module: { modulePath: string }) => module.modulePath)).toEqual([
      'example.com/shared',
      'example.com/app',
    ])
    expect(inspection.dependencyHash).toBe(graph.dependencyHash)
  })

  test('rejects undeclared sibling and transitive module imports', () => {
    const transitive = path.join(workspace, 'transitive')
    const shared = path.join(workspace, 'shared')
    const app = path.join(workspace, 'app')
    for (const root of [transitive, shared, app]) mkdirSync(root)
    write(transitive, 'redscript.toml', libraryManifest('example.com/transitive'))
    write(transitive, 'src/util/util.mcrs', 'package util; export fn value(): int { return 1; }')
    write(shared, 'redscript.toml', libraryManifest('example.com/shared', `
[dependencies]
"example.com/transitive" = { path = "../transitive" }
`))
    write(shared, 'src/math/math.mcrs', 'package math; export fn value(): int { return 1; }')
    write(app, 'redscript.toml', appManifest(`
[dependencies]
"example.com/shared" = { path = "../shared" }
`))
    write(app, 'src/cmd/pack/main.mcrs', `
package pack;
import "example.com/transitive/util" as util;
export fn main(): void { let value: int = util::value(); }
`)

    expect(() => loadPackageGraph(loadProject(app)!)).toThrow(
      /Import 'example\.com\/transitive\/util'.*undeclared module dependency.*example\.com\/app/i,
    )
  })

  test('uses the longest declared module prefix for import ownership', () => {
    const shared = path.join(workspace, 'shared')
    const extra = path.join(workspace, 'extra')
    const app = path.join(workspace, 'app')
    for (const root of [shared, extra, app]) mkdirSync(root)
    write(shared, 'redscript.toml', libraryManifest('example.com/shared'))
    write(shared, 'src/base/base.mcrs', 'package base; export fn base(): void {}')
    write(extra, 'redscript.toml', libraryManifest('example.com/shared/extra'))
    write(extra, 'src/tool/tool.mcrs', 'package tool; export fn tool(): void {}')
    write(app, 'redscript.toml', appManifest(`
[dependencies]
"example.com/shared" = { path = "../shared" }
"example.com/shared/extra" = { path = "../extra" }
`))
    write(app, 'src/cmd/pack/main.mcrs', `
package pack;
import "example.com/shared/extra/tool" as tool;
export fn main(): void { tool::tool(); }
`)

    const graph = loadPackageGraph(loadProject(app)!)
    expect(graph.packages.get('example.com/app/cmd/pack')?.imports[0].modulePath).toBe(
      'example.com/shared/extra',
    )
  })

  test('keeps equal package names in different dependency modules isolated', () => {
    const alpha = path.join(workspace, 'alpha')
    const beta = path.join(workspace, 'beta')
    const app = path.join(workspace, 'app')
    for (const root of [alpha, beta, app]) mkdirSync(root)
    write(alpha, 'redscript.toml', libraryManifest('example.com/alpha'))
    write(alpha, 'src/util/util.mcrs', 'package util; export fn alpha(): void {}')
    write(beta, 'redscript.toml', libraryManifest('example.com/beta'))
    write(beta, 'src/util/util.mcrs', 'package util; export fn beta(): void {}')
    write(app, 'redscript.toml', appManifest(`
[dependencies]
"example.com/alpha" = { path = "../alpha" }
"example.com/beta" = { path = "../beta" }
`))
    write(app, 'src/cmd/pack/main.mcrs', `
package pack;
import "example.com/alpha/util" as alpha;
import "example.com/beta/util" as beta;
export fn main(): void { alpha::alpha(); beta::beta(); }
`)

    const project = loadProject(app)!
    const result = createCompilerSession({ project, target: project.targets.pack }).compileProject()
    expect(result.files.map(file => file.path)).toEqual(expect.arrayContaining([
      'data/app/function/_deps/example.com/alpha/util/alpha.mcfunction',
      'data/app/function/_deps/example.com/beta/util/beta.mcfunction',
    ]))
    const main = result.files.find(file => file.path.endsWith('/cmd/pack/main.mcfunction'))
    expect(main?.content).toContain('function app:_deps/example.com/alpha/util/alpha')
    expect(main?.content).toContain('function app:_deps/example.com/beta/util/beta')
  })

  test('changes the deterministic dependency hash when dependency sources change', () => {
    const shared = path.join(workspace, 'shared')
    const app = path.join(workspace, 'app')
    mkdirSync(shared)
    mkdirSync(app)
    write(shared, 'redscript.toml', libraryManifest('example.com/shared'))
    const sourcePath = 'src/math/math.mcrs'
    write(shared, sourcePath, 'package math; export fn value(): int { return 1; }')
    write(app, 'redscript.toml', appManifest(`
[dependencies]
"example.com/shared" = { path = "../shared" }
`))
    write(app, 'src/cmd/pack/main.mcrs', 'package pack; export fn main(): void {}')

    const before = loadPackageGraph(loadProject(app)!).dependencyHash
    const repeated = loadPackageGraph(loadProject(path.join(app, 'src'))!).dependencyHash
    expect(repeated).toBe(before)

    write(shared, sourcePath, 'package math; export fn value(): int { return 2; }')
    const after = loadPackageGraph(loadProject(app)!).dependencyHash
    expect(after).not.toBe(before)
  })
})
