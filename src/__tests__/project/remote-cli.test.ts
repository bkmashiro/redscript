import { execFileSync, spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { pathToFileURL } from 'url'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function write(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

function runCli(args: string[], cwd: string, cacheDir: string) {
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
        REDSCRIPT_DEPENDENCY_CACHE: cacheDir,
        TS_NODE_PROJECT: path.resolve(__dirname, '..', '..', '..', 'tsconfig.json'),
      },
    },
  )
}

describe('remote dependency CLI workflow', () => {
  let workspace: string
  let app: string
  let origin: string
  let cacheDir: string

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-resolve-cli-'))
    app = path.join(workspace, 'app')
    origin = path.join(workspace, 'origin')
    cacheDir = path.join(workspace, 'cache')
    fs.mkdirSync(app)
    fs.mkdirSync(origin)
    git(origin, 'init', '-b', 'main')
    git(origin, 'config', 'user.name', 'RedScript Test')
    git(origin, 'config', 'user.email', 'redscript@example.invalid')
    write(origin, 'redscript.toml', `
[project]
name = "shared"
module = "example.com/shared"
namespace = "shared"
license = "BSD-3-Clause"
source-roots = ["src"]
`)
    write(origin, 'src/math/math.mcrs', 'package math; export fn one(): int { return 1; }\n')
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
"example.com/shared" = { git = "${pathToFileURL(origin).href}", version = "1.x" }

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
  })

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true })
  })

  test('writes an empty lock without requiring the cache directory to exist', () => {
    const emptyApp = path.join(workspace, 'empty-app')
    const emptyCache = path.join(workspace, 'empty-cache')
    fs.mkdirSync(emptyApp)
    write(emptyApp, 'redscript.toml', `
[project]
name = "empty"
module = "example.com/empty"
namespace = "empty"
source-roots = ["src"]
`)

    const resolved = runCli(['resolve', emptyApp, '--format', 'json'], workspace, emptyCache)
    expect(resolved.status).toBe(0)
    expect(JSON.parse(resolved.stdout)).toMatchObject({
      projectRoot: fs.realpathSync(emptyApp),
      lockfilePath: path.join(fs.realpathSync(emptyApp), 'redscript.lock'),
      schemaVersion: 1,
      cacheDir: path.resolve(emptyCache),
      dependencies: [],
    })
    expect(fs.existsSync(path.join(emptyApp, 'redscript.lock'))).toBe(true)
    expect(fs.existsSync(emptyCache)).toBe(false)
  })

  test('resolves explicitly, inspects provenance, then compiles offline', () => {
    const before = runCli(['project', app, '--format', 'json'], workspace, cacheDir)
    expect(before.status).toBe(2)
    expect(before.stderr).toMatch(/redscript resolve/i)
    expect(fs.existsSync(path.join(app, 'redscript.lock'))).toBe(false)

    const resolved = runCli(['resolve', app, '--format', 'json'], workspace, cacheDir)
    if (resolved.status !== 0) {
      throw new Error(`resolve failed (${resolved.status}):\n${resolved.stdout}\n${resolved.stderr}`)
    }
    const resolution = JSON.parse(resolved.stdout)
    expect(resolution).toMatchObject({
      projectRoot: fs.realpathSync(app),
      lockfilePath: path.join(fs.realpathSync(app), 'redscript.lock'),
      schemaVersion: 1,
      cacheDir: fs.realpathSync(cacheDir),
      dependencies: [{
        modulePath: 'example.com/shared',
        version: '1.0.0',
        license: {
          declared: 'BSD-3-Clause',
          source: 'redscript.toml#project.license',
        },
      }],
    })

    fs.rmSync(origin, { recursive: true, force: true })
    const inspected = runCli(['project', app, '--format', 'json'], workspace, cacheDir)
    if (inspected.status !== 0) {
      throw new Error(`project failed (${inspected.status}):\n${inspected.stdout}\n${inspected.stderr}`)
    }
    const inspection = JSON.parse(inspected.stdout)
    expect(inspection.lockfile).toMatchObject({
      path: path.join(fs.realpathSync(app), 'redscript.lock'),
      schemaVersion: 1,
    })
    expect(inspection.dependencies[0].remote).toMatchObject({
      version: '1.0.0',
      license: { declared: 'BSD-3-Clause' },
    })

    const compiled = runCli([
      'compile',
      path.join(app, 'src', 'cmd', 'pack', 'main.mcrs'),
      '--target',
      'pack',
    ], workspace, cacheDir)
    if (compiled.status !== 0) {
      throw new Error(`compile failed (${compiled.status}):\n${compiled.stdout}\n${compiled.stderr}`)
    }
    expect(fs.existsSync(path.join(
      app,
      'build',
      'data',
      'app',
      'function',
      '_deps',
      'example.com',
      'shared',
      'math',
      'one.mcfunction',
    ))).toBe(true)
  })
})
