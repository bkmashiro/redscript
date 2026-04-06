/**
 * FileCache — content-hash-based compilation cache for incremental builds.
 *
 * Stores per-file content hashes and optional cached output payloads.
 * Persists to `.redscript-cache/cache.json`.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import type { HIRModule } from '../hir/types'
import type { DatapackFile } from '../emit'

export interface CachedOutputFile extends DatapackFile {}

export interface CacheEntry {
  hash: string
  mtime: number
  hir?: HIRModule
  compiledFunctions?: string[]
  outputFiles?: CachedOutputFile[]
  dependencies?: string[]
}

interface SerializedCache {
  version: 2
  entries: Record<
    string,
    {
      hash: string
      mtime: number
      compiledFunctions?: string[]
      outputFiles?: CachedOutputFile[]
      dependencies?: string[]
    }
  >
}

export class FileCache {
  private entries = new Map<string, CacheEntry>()
  private cacheDir: string

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir
  }

  /** Get cached entry for a file (by absolute path). */
  get(filePath: string): CacheEntry | undefined {
    return this.entries.get(path.resolve(filePath))
  }

  /** Set cache entry for a file. */
  set(filePath: string, entry: CacheEntry): void {
    this.entries.set(path.resolve(filePath), entry)
  }

  /** Check if a file's content has changed since last cache. */
  hasChanged(filePath: string): boolean {
    const absPath = path.resolve(filePath)
    const cached = this.entries.get(absPath)
    if (!cached) return true

    // Quick mtime check first
    try {
      const stat = fs.statSync(absPath)
      if (stat.mtimeMs === cached.mtime) return false
    } catch (err) {
      console.warn(`[cache] stat failed for ${absPath}: ${(err as Error).message}`)
      return true
    }

    // mtime changed — compare content hash
    const currentHash = hashFile(absPath)
    return currentHash !== cached.hash
  }

  /** Update the cache entry for a file from disk. Returns true if content changed. */
  update(filePath: string, hir?: HIRModule): boolean {
    const absPath = path.resolve(filePath)
    const changed = this.hasChanged(absPath)

    if (changed) {
      try {
        const stat = fs.statSync(absPath)
        this.entries.set(absPath, {
          hash: hashFile(absPath),
          mtime: stat.mtimeMs,
          hir,
        })
      } catch {
        this.entries.delete(absPath)
      }
    } else if (hir) {
      // Update HIR even if hash didn't change
      const entry = this.entries.get(absPath)
      if (entry) entry.hir = hir
    }

    return changed
  }

  /** Remove a file from the cache. */
  delete(filePath: string): void {
    this.entries.delete(path.resolve(filePath))
  }

  /** Clear all cache entries. */
  clear(): void {
    this.entries.clear()
  }

  /** Number of cached entries. */
  get size(): number {
    return this.entries.size
  }

  /** Persist cache to disk (`.redscript-cache/cache.json`). */
  save(): void {
    fs.mkdirSync(this.cacheDir, { recursive: true })
    const serialized: SerializedCache = {
      version: 2,
      entries: {},
    }
    for (const [filePath, entry] of this.entries) {
      // Don't persist HIR — it contains non-serializable references
      serialized.entries[filePath] = {
        hash: entry.hash,
        mtime: entry.mtime,
        compiledFunctions: entry.compiledFunctions,
        outputFiles: entry.outputFiles,
        dependencies: entry.dependencies,
      }
    }
    const cachePath = path.join(this.cacheDir, 'cache.json')
    fs.writeFileSync(cachePath, JSON.stringify(serialized, null, 2))
  }

  /** Load cache from disk. */
  load(): void {
    const cachePath = path.join(this.cacheDir, 'cache.json')
    try {
      const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as SerializedCache
      if (data.version !== 2) return
      for (const [filePath, entry] of Object.entries(data.entries)) {
        this.entries.set(filePath, {
          hash: entry.hash,
          mtime: entry.mtime,
          compiledFunctions: entry.compiledFunctions,
          outputFiles: entry.outputFiles,
          dependencies: entry.dependencies,
        })
      }
    } catch (err) {
      // No cache or corrupt — start fresh
      console.warn(`[cache] failed to load cache from ${cachePath}: ${(err as Error).message}`)
    }
  }
}

/** SHA-256 hash of a file's content. */
export function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(content).digest('hex')
}
