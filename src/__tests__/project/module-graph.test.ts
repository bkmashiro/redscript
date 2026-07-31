import { mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { loadProjectModuleGraph } from '../../index'
import { loadProject, ProjectManifestError } from '../../project/manifest'

function write(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content)
}

function moduleManifest(modulePath: string, dependencies = ''): string {
  return `
[project]
name = "${modulePath.split('/').pop()}"
module = "${modulePath}"
namespace = "test"
source-roots = ["src"]
${dependencies}
`
}

describe('local project module graph', () => {
  let workspace: string

  beforeEach(() => {
    workspace = mkdtempSync(path.join(tmpdir(), 'redscript-modules-'))
  })

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true })
  })

  test('parses strict local dependency specs relative to the declaring manifest', () => {
    const shared = path.join(workspace, 'shared')
    const app = path.join(workspace, 'app')
    mkdirSync(shared)
    mkdirSync(app)
    write(shared, 'redscript.toml', moduleManifest('example.com/shared'))
    write(app, 'redscript.toml', `${moduleManifest('example.com/app')}
[dependencies]
"example.com/shared" = { path = "../shared" }
`)

    const project = loadProject(app)!
    expect([...project.dependencies.keys()]).toEqual(['example.com/shared'])
    expect(project.dependencies.get('example.com/shared')).toEqual({
      modulePath: 'example.com/shared',
      rootDir: realpathSync(shared),
      manifestPath: realpathSync(path.join(shared, 'redscript.toml')),
    })
  })

  test('rejects malformed dependency entries, remote-only fields on local paths, and missing roots', () => {
    const malformed = path.join(workspace, 'malformed')
    const unknown = path.join(workspace, 'unknown')
    const missing = path.join(workspace, 'missing')
    for (const root of [malformed, unknown, missing]) mkdirSync(root)
    write(malformed, 'redscript.toml', `${moduleManifest('example.com/malformed')}
[dependencies]
shared = "../shared"
`)
    write(unknown, 'redscript.toml', `${moduleManifest('example.com/unknown')}
[dependencies]
shared = { path = "../shared", version = "1.0.0" }
`)
    write(missing, 'redscript.toml', `${moduleManifest('example.com/missing')}
[dependencies]
shared = { path = "../does-not-exist" }
`)

    expect(() => loadProject(malformed)).toThrow(/dependencies\.shared.*TOML table/i)
    expect(() => loadProject(unknown)).toThrow(/dependencies\.shared\.version.*only valid for Git/i)
    expect(() => loadProject(missing)).toThrow(/dependencies\.shared\.path.*does not exist/i)
  })

  test('loads dependencies before importers and validates declared module identity', () => {
    const shared = path.join(workspace, 'shared')
    const app = path.join(workspace, 'app')
    mkdirSync(shared)
    mkdirSync(app)
    write(shared, 'redscript.toml', moduleManifest('example.com/shared'))
    write(shared, 'src/math/math.mcrs', 'package math; export fn one(): int { return 1; }')
    write(app, 'redscript.toml', `${moduleManifest('example.com/app')}
[dependencies]
"example.com/shared" = { path = "../shared" }
`)
    write(app, 'src/main/main.mcrs', 'package main; export fn main(): void {}')

    const graph = loadProjectModuleGraph(loadProject(app)!)
    expect(graph.rootModulePath).toBe('example.com/app')
    expect(graph.topologicalOrder).toEqual(['example.com/shared', 'example.com/app'])
    expect([...graph.modules.keys()].sort()).toEqual(['example.com/app', 'example.com/shared'])
    expect(graph.modules.get('example.com/shared')?.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(graph.dependencyHash).toMatch(/^[a-f0-9]{64}$/)
  })

  test('uses a canonical path tie-breaker for unrelated ready modules', () => {
    const app = path.join(workspace, 'app')
    const beta = path.join(workspace, 'beta')
    const charlie = path.join(workspace, 'charlie')
    const zeta = path.join(workspace, 'zeta')
    for (const root of [app, beta, charlie, zeta]) mkdirSync(root)
    write(zeta, 'redscript.toml', moduleManifest('example.com/zeta'))
    write(beta, 'redscript.toml', `${moduleManifest('example.com/beta')}
[dependencies]
"example.com/zeta" = { path = "../zeta" }
`)
    write(charlie, 'redscript.toml', moduleManifest('example.com/charlie'))
    write(app, 'redscript.toml', `${moduleManifest('example.com/app')}
[dependencies]
"example.com/beta" = { path = "../beta" }
"example.com/charlie" = { path = "../charlie" }
`)

    const graph = loadProjectModuleGraph(loadProject(app)!)
    expect(graph.topologicalOrder).toEqual([
      'example.com/charlie',
      'example.com/zeta',
      'example.com/beta',
      'example.com/app',
    ])
  })

  test('rejects dependency identity mismatch at the declaring manifest', () => {
    const shared = path.join(workspace, 'shared')
    const app = path.join(workspace, 'app')
    mkdirSync(shared)
    mkdirSync(app)
    write(shared, 'redscript.toml', moduleManifest('example.com/not-shared'))
    write(app, 'redscript.toml', `${moduleManifest('example.com/app')}
[dependencies]
"example.com/shared" = { path = "../shared" }
`)

    expect(() => loadProjectModuleGraph(loadProject(app)!)).toThrow(
      /declares module 'example\.com\/not-shared'.*expected 'example\.com\/shared'/i,
    )
  })

  test('revalidates source-root containment inside every dependency project', () => {
    const outside = path.join(workspace, 'outside')
    const shared = path.join(workspace, 'shared')
    const app = path.join(workspace, 'app')
    for (const root of [outside, shared, app]) mkdirSync(root)
    write(shared, 'redscript.toml', `
[project]
name = "shared"
module = "example.com/shared"
namespace = "shared"
source-roots = ["linked"]
`)
    symlinkSync(outside, path.join(shared, 'linked'))
    write(app, 'redscript.toml', `${moduleManifest('example.com/app')}
[dependencies]
"example.com/shared" = { path = "../shared" }
`)

    expect(() => loadProjectModuleGraph(loadProject(app)!)).toThrow(
      /project\.source-roots.*escapes project root/i,
    )
  })

  test('reports a complete deterministic local module dependency cycle', () => {
    const app = path.join(workspace, 'app')
    const shared = path.join(workspace, 'shared')
    mkdirSync(app)
    mkdirSync(shared)
    write(app, 'redscript.toml', `${moduleManifest('example.com/app')}
[dependencies]
"example.com/shared" = { path = "../shared" }
`)
    write(shared, 'redscript.toml', `${moduleManifest('example.com/shared')}
[dependencies]
"example.com/app" = { path = "../app" }
`)

    expect(() => loadProjectModuleGraph(loadProject(app)!)).toThrow(ProjectManifestError)
    expect(() => loadProjectModuleGraph(loadProject(app)!)).toThrow(
      /example\.com\/app → example\.com\/shared → example\.com\/app/,
    )
  })
})
