import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { pathToFileURL } from 'url'

import { resolveProjectDependencies } from '../../project/dependency-resolver'
import { dependencyCacheEntryPath } from '../../project/dependency-cache'
import { materializeGitDependency } from '../../project/dependency-fetch'
import { parseProjectLock, serializeProjectLock } from '../../project/lockfile'
import { loadProjectModuleGraph } from '../../project/module-graph'
import { loadProject } from '../../project/manifest'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' },
  }).trim()
}

function write(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

function createRepository(workspace: string, name: string): string {
  const root = path.join(workspace, name)
  fs.mkdirSync(root)
  git(root, 'init', '-b', 'main')
  git(root, 'config', 'user.name', 'RedScript Test')
  git(root, 'config', 'user.email', 'redscript@example.invalid')
  return root
}

function commitAndTag(root: string, tag: string, annotated = false): string {
  git(root, 'add', '-A')
  git(root, 'commit', '-m', tag)
  if (annotated) git(root, 'tag', '-a', tag, '-m', tag)
  else git(root, 'tag', tag)
  return git(root, 'rev-parse', 'HEAD')
}

function libraryManifest(
  modulePath: string,
  license: string | undefined,
  dependencies = '',
): string {
  return `
[project]
name = "${modulePath.split('/').at(-1)}"
module = "${modulePath}"
namespace = "library"
source-roots = ["src"]
${license ? `license = "${license}"` : ''}

${dependencies}
`
}

function appManifest(modulePath: string, sourceUrl: string, constraint: string): string {
  return `
[project]
name = "app"
module = "example.com/app"
namespace = "app"
source-roots = ["src"]

[dependencies]
"${modulePath}" = { git = "${sourceUrl}", version = "${constraint}" }

[target.pack]
kind = "datapack"
entry = "example.com/app::main"
`
}

describe('explicit remote dependency resolution', () => {
  let workspace: string
  let cacheDir: string

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-resolver-'))
    cacheDir = path.join(workspace, 'cache')
  })

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true })
  })

  test('selects the highest matching semantic tag and peels an annotated tag to its commit', async () => {
    const shared = createRepository(workspace, 'shared-origin')
    write(shared, 'redscript.toml', libraryManifest('example.com/shared', 'Apache-2.0'))
    write(shared, 'src/math/math.mcrs', 'package math; export fn value(): int { return 1; }\n')
    commitAndTag(shared, 'v1.0.0')
    write(shared, 'src/math/math.mcrs', 'package math; export fn value(): int { return 2; }\n')
    const expectedRevision = commitAndTag(shared, 'v1.2.0', true)

    const app = path.join(workspace, 'app')
    fs.mkdirSync(app)
    write(app, 'redscript.toml', appManifest(
      'example.com/shared',
      pathToFileURL(shared).href,
      '^1.0.0',
    ))
    write(app, 'src/main.mcrs', 'package app; export fn main(): void {}\n')

    const result = await resolveProjectDependencies(app, { cacheDir })
    expect(result.lockfilePath).toBe(path.join(app, 'redscript.lock'))
    expect(result.lock.dependencies).toHaveLength(1)
    expect(result.lock.dependencies[0]).toMatchObject({
      modulePath: 'example.com/shared',
      constraints: ['^1.0.0'],
      version: '1.2.0',
      revision: expectedRevision,
      contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      license: {
        declared: 'Apache-2.0',
        source: 'redscript.toml#project.license',
      },
    })
    const onDisk = fs.readFileSync(result.lockfilePath, 'utf8')
    expect(onDisk).toBe(serializeProjectLock(result.lock))
    expect(parseProjectLock(onDisk, result.lockfilePath)).toEqual(result.lock)
    expect(fs.existsSync(path.join(result.dependencies[0].rootDir, 'redscript.toml'))).toBe(true)
  })

  test('resolves transitive remote constraints into one root lock in module order', async () => {
    const base = createRepository(workspace, 'base-origin')
    write(base, 'redscript.toml', libraryManifest('example.com/base', 'MIT'))
    write(base, 'src/base/base.mcrs', 'package base; export fn value(): int { return 1; }\n')
    commitAndTag(base, 'v1.0.0')
    write(base, 'src/base/base.mcrs', 'package base; export fn value(): int { return 15; }\n')
    commitAndTag(base, 'v1.5.0')

    const shared = createRepository(workspace, 'shared-origin')
    write(shared, 'redscript.toml', libraryManifest('example.com/shared', undefined, `
[dependencies]
"example.com/base" = { git = "${pathToFileURL(base).href}", version = "^1.0.0 || ^2.0.0" }
`))
    write(shared, 'src/math/math.mcrs', 'package math; export fn value(): int { return 2; }\n')
    commitAndTag(shared, 'v2.0.0')

    const app = path.join(workspace, 'app')
    fs.mkdirSync(app)
    write(app, 'redscript.toml', `
[project]
name = "app"
module = "example.com/app"
namespace = "app"
source-roots = ["src"]

[dependencies]
"example.com/base" = { git = "${pathToFileURL(base).href}", version = ">=1.0.0" }
"example.com/shared" = { git = "${pathToFileURL(shared).href}", version = "2.x" }

[target.pack]
kind = "datapack"
entry = "example.com/app::main"
`)
    write(app, 'src/main.mcrs', 'package app; export fn main(): void {}\n')

    const result = await resolveProjectDependencies(app, { cacheDir })
    expect(result.lock.dependencies.map(dependency => [
      dependency.modulePath,
      dependency.version,
      dependency.license.declared,
    ])).toEqual([
      ['example.com/base', '1.5.0', 'MIT'],
      ['example.com/shared', '2.0.0', null],
    ])
    expect(result.lock.dependencies[0].constraints).toEqual([
      '>=1.0.0',
      '^1.0.0 || ^2.0.0',
    ])

    fs.rmSync(base, { recursive: true, force: true })
    fs.rmSync(shared, { recursive: true, force: true })
    const offlineProject = loadProject(app, { dependencyCacheDir: cacheDir })!
    expect(loadProjectModuleGraph(offlineProject).topologicalOrder).toEqual([
      'example.com/base',
      'example.com/shared',
      'example.com/app',
    ])
  })

  test('requires an absolute explicit dependency cache path', async () => {
    const app = path.join(workspace, 'app')
    fs.mkdirSync(app)
    write(app, 'redscript.toml', `
[project]
name = "app"
module = "example.com/app"
namespace = "app"
source-roots = ["src"]
`)

    await expect(resolveProjectDependencies(app, { cacheDir: 'relative-cache' })).rejects.toThrow(
      /cache path must be absolute/i,
    )
  })

  test('does not let ambient Git config rewrite the canonical dependency source', async () => {
    const honest = createRepository(workspace, 'honest-origin')
    write(honest, 'redscript.toml', libraryManifest('example.com/shared', 'MIT'))
    write(honest, 'src/value.mcrs', 'package shared; export fn value(): int { return 1; }\n')
    commitAndTag(honest, 'v1.0.0')

    const substituted = createRepository(workspace, 'substituted-origin')
    write(substituted, 'redscript.toml', libraryManifest('example.com/shared', 'MIT'))
    write(substituted, 'src/value.mcrs', 'package shared; export fn value(): int { return 9; }\n')
    commitAndTag(substituted, 'v9.0.0')

    const app = path.join(workspace, 'app')
    fs.mkdirSync(app)
    write(app, 'redscript.toml', appManifest(
      'example.com/shared',
      pathToFileURL(honest).href,
      '*',
    ))
    const globalConfig = path.join(workspace, 'gitconfig')
    fs.writeFileSync(globalConfig, `[url "${pathToFileURL(substituted).href}"]\n  insteadOf = ${pathToFileURL(honest).href}\n`)
    const previous = process.env.GIT_CONFIG_GLOBAL
    process.env.GIT_CONFIG_GLOBAL = globalConfig
    try {
      const result = await resolveProjectDependencies(app, { cacheDir })
      expect(result.lock.dependencies[0].version).toBe('1.0.0')
      expect(fs.readFileSync(path.join(result.dependencies[0].rootDir, 'src', 'value.mcrs'), 'utf8'))
        .toContain('return 1')
    } finally {
      if (previous === undefined) delete process.env.GIT_CONFIG_GLOBAL
      else process.env.GIT_CONFIG_GLOBAL = previous
    }
  })

  test('replaces a symlinked pre-existing cache entry instead of trusting its checkout', async () => {
    const shared = createRepository(workspace, 'shared-origin')
    write(shared, 'redscript.toml', libraryManifest('example.com/shared', 'MIT'))
    write(shared, 'src/value.mcrs', 'package shared; export fn value(): int { return 1; }\n')
    const revision = commitAndTag(shared, 'v1.0.0')
    const source = { kind: 'git' as const, url: pathToFileURL(shared).href }

    const app = path.join(workspace, 'app')
    fs.mkdirSync(app)
    write(app, 'redscript.toml', appManifest('example.com/shared', source.url, '1.x'))

    const externalEntry = path.join(workspace, 'external-entry')
    fs.mkdirSync(externalEntry)
    execFileSync('git', ['clone', '--quiet', shared, path.join(externalEntry, 'source')])
    fs.mkdirSync(cacheDir)
    const entry = dependencyCacheEntryPath(cacheDir, source, revision)
    fs.symlinkSync(externalEntry, entry)

    const resolved = await resolveProjectDependencies(app, { cacheDir })
    expect(fs.lstatSync(entry).isSymbolicLink()).toBe(false)
    expect(fs.realpathSync(resolved.dependencies[0].rootDir).startsWith(
      `${fs.realpathSync(cacheDir)}${path.sep}`,
    )).toBe(true)
  })

  test('preserves a valid cache entry when a Git health probe hits an operational limit', async () => {
    const shared = createRepository(workspace, 'shared-origin')
    write(shared, 'redscript.toml', libraryManifest('example.com/shared', 'MIT'))
    write(shared, 'src/shared/main.mcrs', 'package shared; export fn value(): int { return 1; }\n')
    commitAndTag(shared, 'v1.0.0')

    const app = path.join(workspace, 'app')
    fs.mkdirSync(app)
    write(app, 'redscript.toml', appManifest(
      'example.com/shared',
      pathToFileURL(shared).href,
      '^1.0.0',
    ))
    write(app, 'src/cmd/pack/main.mcrs', 'package cmd/pack;\n')
    const resolved = await resolveProjectDependencies(app, { cacheDir })
    const dependency = resolved.dependencies[0]
    const entry = dependencyCacheEntryPath(cacheDir, dependency.source, dependency.revision)

    await expect(materializeGitDependency(
      cacheDir,
      dependency.source,
      dependency.revision,
      { maxOutputBytes: 1 },
    )).rejects.toThrow(/output exceeds limit/i)
    expect(fs.lstatSync(entry).isDirectory()).toBe(true)
    expect(fs.existsSync(path.join(entry, 'source', 'redscript.toml'))).toBe(true)
  })

  test('rejects module dependency cycles before writing a lock', async () => {
    const app = path.join(workspace, 'app')
    const library = path.join(workspace, 'library')
    fs.mkdirSync(app)
    fs.mkdirSync(library)
    write(app, 'redscript.toml', `
[project]
name = "app"
module = "example.com/app"
namespace = "app"
source-roots = ["src"]

[dependencies]
"example.com/library" = { path = "../library" }
`)
    write(library, 'redscript.toml', `
[project]
name = "library"
module = "example.com/library"
namespace = "library"
source-roots = ["src"]

[dependencies]
"example.com/app" = { path = "../app" }
`)

    await expect(resolveProjectDependencies(app, { cacheDir })).rejects.toThrow(
      /dependency cycle.*example\.com\/app.*example\.com\/library.*example\.com\/app/i,
    )
    expect(fs.existsSync(path.join(app, 'redscript.lock'))).toBe(false)
  })

  test('enforces source size limits and leaves an existing lock untouched on failure', async () => {
    const shared = createRepository(workspace, 'large-origin')
    write(shared, 'redscript.toml', libraryManifest('example.com/shared', 'MIT'))
    write(shared, 'src/large.mcrs', `package shared; // ${'x'.repeat(4096)}\n`)
    commitAndTag(shared, 'v1.0.0')

    const app = path.join(workspace, 'app')
    fs.mkdirSync(app)
    write(app, 'redscript.toml', appManifest(
      'example.com/shared',
      pathToFileURL(shared).href,
      '1.0.0',
    ))
    const lockPath = path.join(app, 'redscript.lock')
    fs.writeFileSync(lockPath, 'previous lock\n')

    await expect(resolveProjectDependencies(app, {
      cacheDir,
      maxBytes: 512,
    })).rejects.toThrow(/byte.*limit/i)
    expect(fs.readFileSync(lockPath, 'utf8')).toBe('previous lock\n')
  })
})
