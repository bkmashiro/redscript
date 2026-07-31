import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { pathToFileURL } from 'url'

import { createCompilerSession } from '../../emit/compile'
import { hashDependencyTree } from '../../project/dependency-cache'
import { resolveProjectDependencies } from '../../project/dependency-resolver'
import { loadProject } from '../../project/manifest'
import { parseProjectLock, serializeProjectLock, type ProjectLock } from '../../project/lockfile'
import { loadPackageGraph } from '../../project/package-loader'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function write(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

function createFixture(workspace: string): { app: string; origin: string; cacheDir: string } {
  const origin = path.join(workspace, 'shared-origin')
  const app = path.join(workspace, 'app')
  const cacheDir = path.join(workspace, 'cache')
  fs.mkdirSync(origin)
  fs.mkdirSync(app)
  git(origin, 'init', '-b', 'main')
  git(origin, 'config', 'user.name', 'RedScript Test')
  git(origin, 'config', 'user.email', 'redscript@example.invalid')
  write(origin, 'redscript.toml', `
[project]
name = "shared"
module = "example.com/shared"
namespace = "shared"
license = "MIT"
source-roots = ["src"]
`)
  write(origin, 'src/math/math.mcrs', `
package math;
export fn one(): int { return 1; }
`)
  git(origin, 'add', '-A')
  git(origin, 'commit', '-m', 'v1.0.0')
  git(origin, 'tag', 'v1.0.0')

  write(app, 'redscript.toml', `
[project]
name = "app"
module = "example.com/app"
namespace = "app"
source-roots = ["src"]
mc-version = "1.21.4"

[dependencies]
"example.com/shared" = { git = "${pathToFileURL(origin).href}", version = "^1.0.0" }

[target.pack]
kind = "datapack"
entry = "example.com/app/cmd/pack::main"
out = "build"
`)
  write(app, 'src/cmd/pack/main.mcrs', `
package pack;
import "example.com/shared/math" as math;
export fn main(): void { let value: int = math::one(); }
`)
  return { app, origin, cacheDir }
}

function rewriteLock(lockfilePath: string, mutate: (lock: ProjectLock) => ProjectLock): void {
  const lock = parseProjectLock(fs.readFileSync(lockfilePath, 'utf8'), lockfilePath)
  fs.writeFileSync(lockfilePath, serializeProjectLock(mutate(lock)))
}

describe('locked remote dependencies in ordinary builds', () => {
  let workspace: string

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-locked-build-'))
  })

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true })
  })

  test('compiles from lock plus warm cache after the Git origin is removed', async () => {
    const fixture = createFixture(workspace)
    const resolution = await resolveProjectDependencies(fixture.app, { cacheDir: fixture.cacheDir })
    fs.rmSync(fixture.origin, { recursive: true, force: true })

    const project = loadProject(fixture.app, { dependencyCacheDir: fixture.cacheDir })!
    const dependency = project.dependencies.get('example.com/shared')
    expect(dependency).toMatchObject({
      rootDir: resolution.dependencies[0].rootDir,
      remote: {
        version: '1.0.0',
        revision: resolution.lock.dependencies[0].revision,
        contentHash: resolution.lock.dependencies[0].contentHash,
        license: {
          declared: 'MIT',
          source: 'redscript.toml#project.license',
        },
      },
    })

    const graph = loadPackageGraph(project)
    expect(graph.moduleGraph.topologicalOrder).toEqual([
      'example.com/shared',
      'example.com/app',
    ])
    const compiled = createCompilerSession({ project, target: project.targets.pack }).compileProject()
    expect(compiled.kind).toBe('datapack')
    expect(compiled.files.map(file => file.path)).toContain(
      'data/app/function/_deps/example.com/shared/math/one.mcfunction',
    )
  })

  test('fails closed on a missing cache entry without consulting the origin', async () => {
    const fixture = createFixture(workspace)
    const resolution = await resolveProjectDependencies(fixture.app, { cacheDir: fixture.cacheDir })
    fs.rmSync(fixture.origin, { recursive: true, force: true })
    fs.rmSync(path.dirname(resolution.dependencies[0].rootDir), { recursive: true, force: true })

    expect(() => loadProject(fixture.app, { dependencyCacheDir: fixture.cacheDir })).toThrow(
      /cache entry is missing.*redscript resolve/i,
    )
  })

  test('rejects cache tampering before parsing dependency packages', async () => {
    const fixture = createFixture(workspace)
    const resolution = await resolveProjectDependencies(fixture.app, { cacheDir: fixture.cacheDir })
    write(resolution.dependencies[0].rootDir, 'src/math/math.mcrs', 'this is not valid source\n')

    expect(() => loadProject(fixture.app, { dependencyCacheDir: fixture.cacheDir })).toThrow(
      /content hash mismatch/i,
    )
  })

  test('rejects a lock whose source does not match the manifest declaration', async () => {
    const fixture = createFixture(workspace)
    const resolution = await resolveProjectDependencies(fixture.app, { cacheDir: fixture.cacheDir })
    rewriteLock(resolution.lockfilePath, lock => ({
      ...lock,
      dependencies: lock.dependencies.map(dependency => ({
        ...dependency,
        source: { kind: 'git', url: 'https://example.com/different.git' },
      })),
    }))

    expect(() => loadProject(fixture.app, { dependencyCacheDir: fixture.cacheDir })).toThrow(
      /locked source.*does not match.*manifest/i,
    )
  })

  test('rejects missing and stale locked constraints even when the version still satisfies them', async () => {
    const fixture = createFixture(workspace)
    const resolution = await resolveProjectDependencies(fixture.app, { cacheDir: fixture.cacheDir })
    rewriteLock(resolution.lockfilePath, lock => ({
      ...lock,
      dependencies: lock.dependencies.map(dependency => ({
        ...dependency,
        constraints: ['*'],
      })),
    }))
    expect(() => loadProject(fixture.app, { dependencyCacheDir: fixture.cacheDir })).toThrow(
      /locked constraints.*do not record manifest constraint/i,
    )

    rewriteLock(resolution.lockfilePath, lock => ({
      ...lock,
      dependencies: lock.dependencies.map(dependency => ({
        ...dependency,
        constraints: ['*', '^1.0.0'],
      })),
    }))
    const project = loadProject(fixture.app, { dependencyCacheDir: fixture.cacheDir })!
    expect(() => loadPackageGraph(project)).toThrow(
      /locked constraints.*do not match.*manifest declarations/i,
    )
  })

  test('checks locked license provenance and module identity when loading the graph', async () => {
    const fixture = createFixture(workspace)
    const resolution = await resolveProjectDependencies(fixture.app, { cacheDir: fixture.cacheDir })
    rewriteLock(resolution.lockfilePath, lock => ({
      ...lock,
      dependencies: lock.dependencies.map(dependency => ({
        ...dependency,
        license: {
          declared: 'GPL-3.0-only',
          source: 'redscript.toml#project.license',
        },
      })),
    }))

    const project = loadProject(fixture.app, { dependencyCacheDir: fixture.cacheDir })!
    expect(() => loadPackageGraph(project)).toThrow(/license provenance mismatch.*MIT.*GPL-3\.0-only/i)

    rewriteLock(resolution.lockfilePath, lock => ({
      ...lock,
      dependencies: lock.dependencies.map(dependency => ({
        ...dependency,
        license: {
          declared: 'MIT',
          source: 'redscript.toml#project.license',
        },
      })),
    }))
    write(resolution.dependencies[0].rootDir, 'redscript.toml', fs.readFileSync(
      path.join(resolution.dependencies[0].rootDir, 'redscript.toml'),
      'utf8',
    ).replace('example.com/shared', 'example.com/impostor'))
    const changedHash = hashDependencyTree(resolution.dependencies[0].rootDir).contentHash
    rewriteLock(resolution.lockfilePath, lock => ({
      ...lock,
      dependencies: lock.dependencies.map(dependency => ({ ...dependency, contentHash: changedHash })),
    }))
    const identityProject = loadProject(fixture.app, { dependencyCacheDir: fixture.cacheDir })!
    expect(() => loadPackageGraph(identityProject)).toThrow(
      /identity mismatch.*example\.com\/shared.*example\.com\/impostor/i,
    )
  })
})
