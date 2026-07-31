import { spawn } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { randomBytes } from 'crypto'
import { valid } from 'semver'

import {
  DEFAULT_DEPENDENCY_MAX_BYTES,
  DEFAULT_DEPENDENCY_MAX_FILES,
  dependencyCacheEntryPath,
  hashDependencyTree,
  validateDependencyCacheEntry,
  type DependencyTreeHash,
  type DependencyTreeLimits,
} from './dependency-cache'
import type { GitDependencySource } from './dependency-source'

export const DEFAULT_GIT_TIMEOUT_MS = 30_000
export const DEFAULT_GIT_OUTPUT_BYTES = 2 * 1024 * 1024
export const DEFAULT_GIT_DOWNLOAD_BYTES = 64 * 1024 * 1024

export interface GitFetchLimits extends DependencyTreeLimits {
  readonly timeoutMs?: number
  readonly maxOutputBytes?: number
  readonly maxDownloadBytes?: number
}

export interface GitSemanticVersion {
  readonly version: string
  readonly revision: string
  readonly tag: string
}

export interface MaterializedGitDependency extends DependencyTreeHash {
  readonly rootDir: string
}

export class DependencyFetchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DependencyFetchError'
  }
}

class InvalidCachedGitCheckoutError extends DependencyFetchError {}

function directoryBytes(root: string, byteLimit: number, entryLimit: number): number {
  if (!fs.existsSync(root)) return 0
  let total = 0
  let entries = 0
  const visit = (directory: string): void => {
    let directoryEntries: fs.Dirent[]
    try {
      directoryEntries = fs.readdirSync(directory, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    for (const entry of directoryEntries) {
      entries += 1
      if (entries > entryLimit) {
        throw new DependencyFetchError(`Git download file count exceeds limit ${entryLimit}`)
      }
      const absolutePath = path.join(directory, entry.name)
      let stat: fs.Stats
      try {
        stat = fs.lstatSync(absolutePath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      if (stat.isDirectory()) visit(absolutePath)
      else if (stat.isFile()) total += stat.size
      if (total > byteLimit) return
    }
  }
  visit(root)
  return total
}

function isolatedGitEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_')) delete env[key]
  }
  env.GIT_CONFIG_GLOBAL = os.devNull
  env.GIT_CONFIG_SYSTEM = os.devNull
  env.GIT_CONFIG_NOSYSTEM = '1'
  env.GIT_TERMINAL_PROMPT = '0'
  delete env.GIT_ASKPASS
  delete env.SSH_ASKPASS
  return env
}

function assertPositiveLimit(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DependencyFetchError(`${label} must be a positive safe integer`)
  }
}

async function runGit(
  args: readonly string[],
  options: {
    cwd?: string
    monitorRoot?: string
    limits?: GitFetchLimits
  } = {},
): Promise<string> {
  const limits = options.limits ?? {}
  const timeoutMs = limits.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS
  const maxOutputBytes = limits.maxOutputBytes ?? DEFAULT_GIT_OUTPUT_BYTES
  const maxDownloadBytes = limits.maxDownloadBytes ?? DEFAULT_GIT_DOWNLOAD_BYTES
  const maxSourceBytes = limits.maxBytes ?? DEFAULT_DEPENDENCY_MAX_BYTES
  const maxSourceFiles = limits.maxFiles ?? DEFAULT_DEPENDENCY_MAX_FILES
  assertPositiveLimit(timeoutMs, 'Git timeout')
  assertPositiveLimit(maxOutputBytes, 'Git output byte limit')
  assertPositiveLimit(maxDownloadBytes, 'Git download byte limit')
  assertPositiveLimit(maxSourceBytes, 'Dependency byte limit')
  assertPositiveLimit(maxSourceFiles, 'Dependency file count limit')
  const monitorEntryLimit = Math.min(Number.MAX_SAFE_INTEGER, maxSourceFiles + 4096)

  return new Promise((resolve, reject) => {
    const child = spawn('git', [
      '-c', 'protocol.file.allow=always',
      '-c', `core.hooksPath=${os.devNull}`,
      ...args,
    ], {
      cwd: options.cwd,
      env: isolatedGitEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let outputBytes = 0
    let failure: Error | undefined

    const stop = (error: Error): void => {
      if (failure) return
      failure = error
      child.kill('SIGKILL')
    }
    const capture = (target: Buffer[], chunk: Buffer): void => {
      outputBytes += chunk.byteLength
      if (outputBytes > maxOutputBytes) {
        stop(new DependencyFetchError(`Git output exceeds limit ${maxOutputBytes}`))
        return
      }
      target.push(chunk)
    }
    child.stdout.on('data', chunk => capture(stdout, Buffer.from(chunk)))
    child.stderr.on('data', chunk => capture(stderr, Buffer.from(chunk)))
    child.on('error', error => stop(new DependencyFetchError(`Unable to start Git: ${error.message}`)))

    const timeout = setTimeout(() => {
      stop(new DependencyFetchError(`Git command timed out after ${timeoutMs}ms`))
    }, timeoutMs)
    const monitor = options.monitorRoot
      ? setInterval(() => {
          try {
            if (directoryBytes(
              options.monitorRoot!,
              maxDownloadBytes,
              monitorEntryLimit,
            ) > maxDownloadBytes) {
              stop(new DependencyFetchError(`Git download byte size exceeds limit ${maxDownloadBytes}`))
            }
          } catch (error) {
            stop(new DependencyFetchError(`Unable to measure Git download: ${(error as Error).message}`))
          }
        }, 25)
      : undefined

    child.on('close', code => {
      clearTimeout(timeout)
      if (monitor) clearInterval(monitor)
      if (failure) {
        reject(failure)
        return
      }
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString('utf8').trim()
        reject(new DependencyFetchError(`Git command failed (${code}): ${detail || args[0]}`))
        return
      }
      resolve(Buffer.concat(stdout).toString('utf8'))
    })
  })
}

export async function listGitSemanticVersions(
  source: GitDependencySource,
  limits: GitFetchLimits = {},
): Promise<readonly GitSemanticVersion[]> {
  const output = await runGit(['ls-remote', '--tags', source.url], { limits })
  const tags = new Map<string, { direct?: string; peeled?: string }>()
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue
    const match = /^([a-f0-9]{40}|[a-f0-9]{64})\s+refs\/tags\/(.+)$/.exec(line.trim())
    if (!match) continue
    const peeled = match[2].endsWith('^{}')
    const tag = peeled ? match[2].slice(0, -3) : match[2]
    const revisions = tags.get(tag) ?? {}
    if (peeled) revisions.peeled = match[1]
    else revisions.direct = match[1]
    tags.set(tag, revisions)
  }

  const versions = new Map<string, GitSemanticVersion>()
  for (const [tag, revisions] of [...tags.entries()].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  )) {
    const version = valid(tag.startsWith('v') ? tag.slice(1) : tag)
    if (!version) continue
    const revision = revisions.peeled ?? revisions.direct
    if (!revision) continue
    const existing = versions.get(version)
    if (existing && existing.revision !== revision) {
      throw new DependencyFetchError(
        `Git source '${source.url}' has conflicting tags for semantic version ${version}: '${existing.tag}' and '${tag}'`,
      )
    }
    if (!existing || (!tag.startsWith('v') && existing.tag.startsWith('v'))) {
      versions.set(version, Object.freeze({ version, revision, tag }))
    }
  }
  return Object.freeze([...versions.values()])
}

async function verifyGitCheckout(
  sourceRoot: string,
  revision: string,
  limits: GitFetchLimits,
): Promise<DependencyTreeHash> {
  const actualRevision = (await runGit(['rev-parse', 'HEAD'], { cwd: sourceRoot, limits })).trim()
  if (actualRevision !== revision) {
    throw new InvalidCachedGitCheckoutError(
      `Cached Git revision mismatch: expected ${revision}, got ${actualRevision}`,
    )
  }
  const status = await runGit(['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: sourceRoot,
    limits,
  })
  if (status.trim()) {
    throw new InvalidCachedGitCheckoutError(
      'Cached Git dependency checkout contains modified or untracked files',
    )
  }
  return hashDependencyTree(sourceRoot, {
    maxBytes: limits.maxBytes ?? DEFAULT_DEPENDENCY_MAX_BYTES,
    maxFiles: limits.maxFiles ?? DEFAULT_DEPENDENCY_MAX_FILES,
  })
}

export async function materializeGitDependency(
  cacheDir: string,
  source: GitDependencySource,
  revision: string,
  limits: GitFetchLimits = {},
): Promise<MaterializedGitDependency> {
  const entryPath = dependencyCacheEntryPath(cacheDir, source, revision)
  const sourceRoot = path.join(entryPath, 'source')
  if (fs.existsSync(sourceRoot)) {
    let validatedRoot: string | undefined
    try {
      validatedRoot = validateDependencyCacheEntry(cacheDir, source, revision)
    } catch {
      fs.rmSync(entryPath, { recursive: true, force: true })
    }
    if (validatedRoot) {
      try {
        const hashed = await verifyGitCheckout(validatedRoot, revision, limits)
        return Object.freeze({ rootDir: fs.realpathSync(validatedRoot), ...hashed })
      } catch (error) {
        if (!(error instanceof InvalidCachedGitCheckoutError)) throw error
        fs.rmSync(entryPath, { recursive: true, force: true })
      }
    }
  }

  fs.mkdirSync(cacheDir, { recursive: true })
  const tempEntry = path.join(
    cacheDir,
    `.tmp-${process.pid}-${Date.now()}-${randomBytes(6).toString('hex')}`,
  )
  const tempSource = path.join(tempEntry, 'source')
  fs.mkdirSync(tempSource, { recursive: true })
  try {
    await runGit(['init', '--quiet'], { cwd: tempSource, monitorRoot: tempEntry, limits })
    await runGit(['remote', 'add', 'origin', source.url], {
      cwd: tempSource,
      monitorRoot: tempEntry,
      limits,
    })
    await runGit(['fetch', '--quiet', '--depth=1', '--filter=blob:none', 'origin', revision], {
      cwd: tempSource,
      monitorRoot: tempEntry,
      limits,
    })
    await runGit(['checkout', '--quiet', '--detach', 'FETCH_HEAD'], {
      cwd: tempSource,
      monitorRoot: tempEntry,
      limits,
    })
    const hashed = await verifyGitCheckout(tempSource, revision, limits)

    if (fs.existsSync(entryPath)) {
      fs.rmSync(tempEntry, { recursive: true, force: true })
      const validatedRoot = validateDependencyCacheEntry(cacheDir, source, revision)
      const existing = await verifyGitCheckout(validatedRoot, revision, limits)
      return Object.freeze({ rootDir: fs.realpathSync(validatedRoot), ...existing })
    }
    fs.renameSync(tempEntry, entryPath)
    return Object.freeze({ rootDir: fs.realpathSync(sourceRoot), ...hashed })
  } catch (error) {
    fs.rmSync(tempEntry, { recursive: true, force: true })
    throw error
  }
}
