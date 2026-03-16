/**
 * Incremental compilation — only recompile files whose content (or
 * dependencies) has changed since the last build.
 */

import * as path from 'path'
import { compile, type CompileOptions, type CompileResult } from '../emit/compile'
import * as fs from 'fs'
import { FileCache } from './index'
import { DependencyGraph } from './deps'

export interface IncrementalOptions {
  namespace?: string
  /** Output directory for compiled files. */
  output: string
}

export interface IncrementalResult {
  /** Number of files that were recompiled. */
  recompiled: number
  /** Number of files that used the cache (skipped). */
  cached: number
  /** Files that had errors (path → error message). */
  errors: Map<string, string>
  /** Per-file compile results (only for recompiled files). */
  results: Map<string, CompileResult>
}

/** Cached compilation output per entry file. */
interface CompileCacheEntry {
  result: CompileResult
  /** Content hashes of entry file + all its transitive deps at compile time. */
  depHashes: Map<string, string>
}

const compiledCache = new Map<string, CompileCacheEntry>()

/**
 * Compile a set of entry files incrementally.
 *
 * For each file:
 * - Compute content hash of the file and all its transitive imports
 * - If all hashes match the previous build → skip (cache hit)
 * - If any hash changed → recompile from scratch
 */
export function compileIncremental(
  files: string[],
  cache: FileCache,
  depGraph: DependencyGraph,
  options: IncrementalOptions,
): IncrementalResult {
  const result: IncrementalResult = {
    recompiled: 0,
    cached: 0,
    errors: new Map(),
    results: new Map(),
  }

  // Phase 1: Update dependency graph for all files
  for (const file of files) {
    const absFile = path.resolve(file)
    try {
      const source = fs.readFileSync(absFile, 'utf-8')
      depGraph.addFile(absFile, source)
    } catch {
      // File might have been deleted
      depGraph.removeFile(absFile)
    }
  }

  // Phase 2: Detect all changed source files BEFORE recompiling anything.
  // This prevents cache.update() during one file's recompile from hiding
  // changes needed by another file that shares the same dependency.
  const changedSourceFiles = new Set<string>()
  const allSourceFiles = new Set<string>()

  for (const file of files) {
    const absFile = path.resolve(file)
    const allDeps = depGraph.getTransitiveDeps(absFile)
    allSourceFiles.add(absFile)
    for (const dep of allDeps) allSourceFiles.add(dep)
  }

  for (const sourceFile of allSourceFiles) {
    if (cache.hasChanged(sourceFile)) {
      changedSourceFiles.add(sourceFile)
    }
  }

  // Phase 3: For each entry file, check if it or any dep changed → recompile
  for (const file of files) {
    const absFile = path.resolve(file)

    // Collect all files in this compilation unit (entry + transitive deps)
    const allDeps = depGraph.getTransitiveDeps(absFile)
    const unitFiles = [absFile, ...allDeps]

    // Check if any file in the unit has changed
    let needsRecompile = false
    const prevEntry = compiledCache.get(absFile)

    if (!prevEntry) {
      needsRecompile = true
    } else {
      for (const unitFile of unitFiles) {
        if (changedSourceFiles.has(unitFile)) {
          needsRecompile = true
          break
        }
      }
      // Also check if the set of dependencies changed
      if (!needsRecompile && prevEntry.depHashes.size !== unitFiles.length) {
        needsRecompile = true
      }
    }

    if (!needsRecompile) {
      // Cache hit — write cached result to output
      const cached = compiledCache.get(absFile)!
      writeBuildOutput(cached.result, options.output)
      result.cached++
      continue
    }

    // Cache miss — recompile
    try {
      const source = fs.readFileSync(absFile, 'utf-8')
      const ns = options.namespace ?? deriveNamespace(absFile)
      const compileResult = compile(source, { namespace: ns, filePath: absFile })

      // Update caches
      const depHashes = new Map<string, string>()
      for (const unitFile of unitFiles) {
        cache.update(unitFile)
        const entry = cache.get(unitFile)
        if (entry) depHashes.set(unitFile, entry.hash)
      }

      compiledCache.set(absFile, { result: compileResult, depHashes })
      writeBuildOutput(compileResult, options.output)

      result.recompiled++
      result.results.set(absFile, compileResult)
    } catch (err) {
      result.errors.set(absFile, (err as Error).message)
    }
  }

  return result
}

/** Write compile output files to the output directory. */
function writeBuildOutput(compileResult: CompileResult, output: string): void {
  fs.mkdirSync(output, { recursive: true })
  for (const dataFile of compileResult.files) {
    const filePath = path.join(output, dataFile.path)
    const dir = path.dirname(filePath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, dataFile.content)
  }
}

function deriveNamespace(filePath: string): string {
  const basename = path.basename(filePath, path.extname(filePath))
  return basename.toLowerCase().replace(/[^a-z0-9]/g, '_')
}

/**
 * Reset the in-memory compile cache. Useful for testing.
 */
export function resetCompileCache(): void {
  compiledCache.clear()
}
