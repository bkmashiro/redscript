import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { MCTestClient, type ServerStatus } from './client'

export const DEFAULT_HARNESS_HOST = '127.0.0.1'
export const DEFAULT_HARNESS_PORT = 25561
export const DEFAULT_SERVER_PORT = 25566

/** A missing or unusable offline fixture is skippable in optional P9 mode. */
export class ManagedPaperPrerequisiteError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'P9SkipError'
  }
}

export function findHarnessPlugin(templateDir: string): string {
  const pluginsDir = path.join(templateDir, 'plugins')
  if (!fs.existsSync(pluginsDir)) {
    throw new ManagedPaperPrerequisiteError(`missing Paper plugin directory '${pluginsDir}'`)
  }
  const candidates = fs.readdirSync(pluginsDir)
    .filter(name => /^redscript-testharness(?:-[0-9].*)?\.jar$/.test(name))
    .sort()
  if (candidates.length !== 1) {
    throw new ManagedPaperPrerequisiteError(
      `expected exactly one RedScript TestHarness jar in '${pluginsDir}', found ${candidates.length}`,
    )
  }
  return path.join(pluginsDir, candidates[0])
}

export function findJava(): { executable: string; version: string } {
  const candidates = [
    process.env.MC_JAVA_BIN,
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', 'java') : undefined,
    '/opt/homebrew/opt/openjdk/bin/java',
    'java',
  ].filter((candidate): candidate is string => candidate != null && candidate !== '')
  for (const executable of candidates) {
    const result = spawnSync(executable, ['-version'], { encoding: 'utf8' })
    if (result.status === 0) {
      const version = `${result.stdout}${result.stderr}`.split(/\r?\n/)[0].trim()
      return { executable, version }
    }
  }
  throw new ManagedPaperPrerequisiteError('no runnable Java executable found (set MC_JAVA_BIN)')
}

export function createDeterministicServerProperties(serverPort = DEFAULT_SERVER_PORT): string {
  return `server-ip=127.0.0.1
server-port=${serverPort}
online-mode=false
enforce-secure-profile=false
level-name=world
level-type=minecraft:flat
level-seed=0
generator-settings={"biome":"minecraft:the_void","layers":[{"block":"minecraft:air","height":1}],"structures":{"structures":{}}}
generate-structures=false
spawn-animals=false
spawn-monsters=false
spawn-npcs=false
allow-nether=false
spawn-protection=0
gamemode=creative
difficulty=peaceful
view-distance=2
simulation-distance=2
max-players=1
pause-when-empty-seconds=-1
enable-status=false
sync-chunk-writes=true
`
}

function write(root: string, relativePath: string, content: string | Buffer): void {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

export interface PrepareServerRootOptions {
  readonly serverPort?: number
}

/**
 * Prepare a disposable Paper root from an offline template.
 *
 * Only immutable server assets are linked/copied into the root. In particular,
 * template world directories are deliberately not copied so a live run can
 * never reuse or modify the source world's state.
 */
export function prepareServerRoot(
  templateDir: string,
  harnessPlugin: string,
  options: PrepareServerRootOptions = {},
): string {
  const paperJar = path.join(templateDir, 'paper.jar')
  const libraries = path.join(templateDir, 'libraries')
  const versions = path.join(templateDir, 'versions')
  for (const required of [paperJar, libraries, versions, harnessPlugin]) {
    if (!fs.existsSync(required)) {
      throw new ManagedPaperPrerequisiteError(`missing offline Paper prerequisite '${required}'`)
    }
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-p9-paper-'))
  try {
    fs.symlinkSync(paperJar, path.join(root, 'paper.jar'))
    fs.symlinkSync(libraries, path.join(root, 'libraries'))
    fs.symlinkSync(versions, path.join(root, 'versions'))
    write(root, 'plugins/redscript-testharness.jar', fs.readFileSync(harnessPlugin))
    write(root, 'eula.txt', 'eula=true\n')
    write(root, 'server.properties', createDeterministicServerProperties(options.serverPort))
    return root
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true })
    throw error
  }
}

export interface ManagedPaperServerOptions {
  /** Reject accidentally passing the source template as the mutable runtime root. */
  readonly sourceTemplateDir?: string
}

export interface ManagedPaperCleanupFailure {
  readonly stage: 'stop' | 'server root'
  readonly message: string
}

export interface ManagedPaperCleanupResult {
  readonly failures: ManagedPaperCleanupFailure[]
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left) === path.resolve(right)
}

export class ManagedPaperServer {
  private child?: ChildProcessWithoutNullStreams
  private output = ''
  private readonly sourceTemplateDir?: string

  constructor(
    readonly rootDir: string,
    private readonly java: string,
    readonly client: MCTestClient,
    options: ManagedPaperServerOptions = {},
  ) {
    this.sourceTemplateDir = options.sourceTemplateDir
    if (this.sourceTemplateDir && samePath(rootDir, this.sourceTemplateDir)) {
      throw new ManagedPaperPrerequisiteError(
        `source template directory '${this.sourceTemplateDir}' cannot be used as the runtime root`,
      )
    }
  }

  currentOutput(): string {
    return this.output
  }

  readLatestLog(): string {
    const latest = path.join(this.rootDir, 'logs', 'latest.log')
    return fs.existsSync(latest) ? fs.readFileSync(latest, 'utf8') : ''
  }

  async start(): Promise<{ pid: number; status: ServerStatus }> {
    if (this.child) throw new Error('Managed Paper server is already running')
    this.output = ''
    const child = spawn(this.java, ['-Xms512M', '-Xmx1G', '-jar', 'paper.jar', '--nogui'], {
      cwd: this.rootDir,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let spawnError: Error | undefined
    child.once('error', error => {
      spawnError = error
    })
    this.child = child
    child.stdout.on('data', chunk => { this.output += chunk.toString() })
    child.stderr.on('data', chunk => { this.output += chunk.toString() })

    const deadline = Date.now() + 90_000
    while (Date.now() < deadline) {
      if (spawnError) {
        this.child = undefined
        throw new Error(`Paper failed to spawn: ${spawnError.message}`)
      }
      if (child.exitCode !== null || child.signalCode !== null) {
        this.child = undefined
        throw new Error(`Paper exited during startup with ${child.exitCode ?? child.signalCode}:\n${this.output.slice(-4000)}`)
      }
      try {
        const status = await this.client.status()
        if (status.online) return { pid: child.pid!, status }
      } catch {
        // Server is still starting.
      }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    throw new Error(`Paper/TestHarness did not become ready within 90 seconds:\n${this.output.slice(-4000)}`)
  }

  async stop(): Promise<void> {
    const child = this.child
    if (!child) return
    if (child.exitCode !== null || child.signalCode !== null) {
      this.child = undefined
      if (child.exitCode != null && child.exitCode !== 0) {
        throw new Error(`Paper exited with status ${child.exitCode}`)
      }
      return
    }
    const exited = new Promise<number | null>(resolve => child.once('exit', code => resolve(code)))
    child.stdin.write('stop\n')
    const result = await Promise.race([
      exited.then(code => ({ kind: 'exit' as const, code })),
      new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), 60_000)),
    ])
    if (result.kind === 'timeout') {
      child.kill('SIGTERM')
      const terminated = await Promise.race([
        exited.then(code => ({ kind: 'exit' as const, code })),
        new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), 10_000)),
      ])
      if (terminated.kind === 'timeout') {
        child.kill('SIGKILL')
        const killed = await Promise.race([
          exited.then(code => ({ kind: 'exit' as const, code })),
          new Promise<{ kind: 'timeout' }>(resolve => setTimeout(() => resolve({ kind: 'timeout' }), 10_000)),
        ])
        if (killed.kind === 'timeout') {
          throw new Error('Paper did not terminate after SIGTERM and SIGKILL')
        }
      }
      this.child = undefined
      throw new Error('Paper did not stop gracefully within 60 seconds')
    }
    this.child = undefined
    if (result.code !== 0) throw new Error(`Paper exited with status ${String(result.code)}`)
  }

  /** Stop the child and remove the disposable root, preserving both failures for the caller. */
  async cleanup(options: { readonly removeRoot?: boolean } = {}): Promise<ManagedPaperCleanupResult> {
    const failures: ManagedPaperCleanupFailure[] = []
    try {
      await this.stop()
    } catch (error) {
      failures.push({ stage: 'stop', message: error instanceof Error ? error.message : String(error) })
    }
    if (options.removeRoot ?? true) {
      if (this.sourceTemplateDir && samePath(this.rootDir, this.sourceTemplateDir)) {
        failures.push({
          stage: 'server root',
          message: `source template directory '${this.sourceTemplateDir}' cannot be removed as a runtime root`,
        })
      } else {
        try {
          fs.rmSync(this.rootDir, { recursive: true, force: true })
        } catch (error) {
          failures.push({ stage: 'server root', message: error instanceof Error ? error.message : String(error) })
        }
      }
    }
    return { failures }
  }
}
