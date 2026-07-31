import { createHash } from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import type { GitDependencySource } from './dependency-source'

export const DEFAULT_DEPENDENCY_MAX_BYTES = 32 * 1024 * 1024
export const DEFAULT_DEPENDENCY_MAX_FILES = 10_000

export interface DependencyTreeLimits {
  readonly maxBytes?: number
  readonly maxFiles?: number
}

export interface DependencyTreeHash {
  readonly contentHash: string
  readonly totalBytes: number
  readonly fileCount: number
}

export class DependencyCacheError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DependencyCacheError'
  }
}

export function defaultDependencyCacheDir(): string {
  const configured = process.env.REDSCRIPT_DEPENDENCY_CACHE
  if (configured) {
    if (!path.isAbsolute(configured)) {
      throw new DependencyCacheError(
        `REDSCRIPT_DEPENDENCY_CACHE must be an absolute path: ${configured}`,
      )
    }
    return path.resolve(configured)
  }
  return path.join(os.homedir(), '.cache', 'redscript', 'dependencies')
}

function assertPositiveLimit(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DependencyCacheError(`${label} must be a positive safe integer`)
  }
}

function canonicalRelativePath(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).split(path.sep).join('/')
}

export function hashDependencyTree(
  rootDir: string,
  limits: DependencyTreeLimits = {},
): DependencyTreeHash {
  const root = path.resolve(rootDir)
  const rootStat = fs.lstatSync(root)
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new DependencyCacheError(`Dependency source root '${root}' must be a real directory`)
  }
  const maxBytes = limits.maxBytes ?? DEFAULT_DEPENDENCY_MAX_BYTES
  const maxFiles = limits.maxFiles ?? DEFAULT_DEPENDENCY_MAX_FILES
  assertPositiveLimit(maxBytes, 'Dependency byte limit')
  assertPositiveLimit(maxFiles, 'Dependency file count limit')

  const files: string[] = []
  const visit = (directory: string): void => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
    for (const entry of entries) {
      if (directory === root && entry.name === '.git') continue
      const absolutePath = path.join(directory, entry.name)
      const stat = fs.lstatSync(absolutePath)
      const relativePath = canonicalRelativePath(root, absolutePath)
      if (stat.isSymbolicLink()) {
        throw new DependencyCacheError(`Remote dependency trees must not contain symbolic links: ${relativePath}`)
      }
      if (stat.isDirectory()) {
        visit(absolutePath)
        continue
      }
      if (!stat.isFile()) {
        throw new DependencyCacheError(`Remote dependency trees must contain only regular files: ${relativePath}`)
      }
      if (relativePath === '.gitmodules') {
        throw new DependencyCacheError('Remote dependency Git submodules are not supported')
      }
      files.push(absolutePath)
      if (files.length > maxFiles) {
        throw new DependencyCacheError(
          `Remote dependency file count exceeds limit ${maxFiles}`,
        )
      }
    }
  }
  visit(root)

  const hash = createHash('sha256')
  let totalBytes = 0
  for (const absolutePath of files) {
    const relativePath = canonicalRelativePath(root, absolutePath)
    const content = fs.readFileSync(absolutePath)
    totalBytes += content.byteLength
    if (totalBytes > maxBytes) {
      throw new DependencyCacheError(`Remote dependency byte size exceeds limit ${maxBytes}`)
    }
    hash.update('file\0')
    hash.update(relativePath)
    hash.update('\0')
    hash.update(String(content.byteLength))
    hash.update('\0')
    hash.update(content)
    hash.update('\0')
  }

  return Object.freeze({
    contentHash: `sha256:${hash.digest('hex')}`,
    totalBytes,
    fileCount: files.length,
  })
}

export function dependencyCacheEntryPath(
  cacheDir: string,
  source: GitDependencySource,
  revision: string,
): string {
  if (!path.isAbsolute(cacheDir)) {
    throw new DependencyCacheError(`Dependency cache path must be absolute: ${cacheDir}`)
  }
  const identity = createHash('sha256')
    .update(`git\0${source.url}\0${revision}\0`)
    .digest('hex')
  return path.join(path.resolve(cacheDir), identity)
}

export function validateDependencyCacheEntry(
  cacheDir: string,
  source: GitDependencySource,
  revision: string,
): string {
  const entryPath = dependencyCacheEntryPath(cacheDir, source, revision)
  const sourceRoot = path.join(entryPath, 'source')
  if (!fs.existsSync(sourceRoot)) {
    throw new DependencyCacheError(
      `Locked dependency cache entry is missing for ${source.url}@${revision}; run 'redscript resolve'`,
    )
  }
  const entryStat = fs.lstatSync(entryPath)
  if (entryStat.isSymbolicLink() || !entryStat.isDirectory()) {
    throw new DependencyCacheError(`Locked dependency cache entry is not a real directory: ${entryPath}`)
  }
  const canonicalCache = fs.realpathSync(path.resolve(cacheDir))
  const canonicalEntry = fs.realpathSync(entryPath)
  const relativeEntry = path.relative(canonicalCache, canonicalEntry)
  if (relativeEntry === '..' || relativeEntry.startsWith(`..${path.sep}`) || path.isAbsolute(relativeEntry)) {
    throw new DependencyCacheError(`Locked dependency cache entry resolves outside the cache: ${entryPath}`)
  }
  const stat = fs.lstatSync(sourceRoot)
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new DependencyCacheError(`Locked dependency cache source is not a real directory: ${sourceRoot}`)
  }
  return sourceRoot
}

export function verifyCachedDependency(
  cacheDir: string,
  source: GitDependencySource,
  revision: string,
  expectedContentHash: string,
  limits: DependencyTreeLimits = {},
): string {
  const sourceRoot = validateDependencyCacheEntry(cacheDir, source, revision)
  const actual = hashDependencyTree(sourceRoot, limits).contentHash
  if (actual !== expectedContentHash) {
    throw new DependencyCacheError(
      `Locked dependency content hash mismatch for ${source.url}@${revision}: expected ${expectedContentHash}, got ${actual}`,
    )
  }
  return sourceRoot
}
