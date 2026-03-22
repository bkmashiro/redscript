/**
 * Incremental compilation — only recompile files whose content, imports,
 * or reverse dependents changed since the last build.
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile, type CompileOptions, type CompileResult } from '../emit/compile'
import type { DatapackFile } from '../emit'
import { FileCache } from './index'
import { DependencyGraph, parseImports } from './deps'

export interface IncrementalOptions {
  namespace?: string
  /** Output directory for compiled files. */
  output: string
  generateSourceMap?: boolean
  mcVersion?: CompileOptions['mcVersion']
  lenient?: boolean
  includeDirs?: string[]
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
  /** Files skipped due to cache hit. */
  skippedFiles: string[]
  /** Files rebuilt in this run. */
  rebuiltFiles: string[]
  /** Elapsed wall time for this run. */
  elapsedMs: number
}

export function compileIncremental(
  files: string[],
  cache: FileCache,
  depGraph: DependencyGraph,
  options: IncrementalOptions,
): IncrementalResult {
  const start = Date.now()
  const normalizedEntries = [...new Set(files.map(file => path.resolve(file)))]
  const result: IncrementalResult = {
    recompiled: 0,
    cached: 0,
    errors: new Map(),
    results: new Map(),
    skippedFiles: [],
    rebuiltFiles: [],
    elapsedMs: 0,
  }

  if (normalizedEntries.length === 0) {
    result.elapsedMs = Date.now() - start
    return result
  }

  depGraph.clear()
  const discoveredFiles = discoverDependencyGraph(normalizedEntries, depGraph)
  const changedFiles = new Set<string>()

  for (const file of discoveredFiles) {
    if (cache.hasChanged(file)) changedFiles.add(file)
  }

  const dirtyFiles = depGraph.computeDirtySet(changedFiles)
  for (const entry of normalizedEntries) {
    if (!discoveredFiles.has(entry)) dirtyFiles.add(entry)
  }

  for (const entryFile of normalizedEntries) {
    const entryDeps = depGraph.getTransitiveDeps(entryFile)
    const entryUnit = new Set([entryFile, ...entryDeps])
    const cachedEntry = cache.get(entryFile)
    const cachedDepList = new Set(cachedEntry?.dependencies ?? [])

    const hasDependencyDrift =
      cachedDepList.size !== entryUnit.size ||
      [...entryUnit].some(file => !cachedDepList.has(file))

    const canUseCache =
      !dirtyFiles.has(entryFile) &&
      !hasDependencyDrift &&
      !!cachedEntry?.outputFiles &&
      cachedEntry.outputFiles.length > 0

    if (canUseCache) {
      writeBuildOutput(cachedEntry.outputFiles!, options.output)
      result.cached++
      result.skippedFiles.push(entryFile)
      continue
    }

    try {
      const source = fs.readFileSync(entryFile, 'utf-8')
      const ns = options.namespace ?? deriveNamespace(entryFile)
      const compileResult = compile(source, {
        namespace: ns,
        filePath: entryFile,
        generateSourceMap: options.generateSourceMap,
        mcVersion: options.mcVersion,
        lenient: options.lenient,
        includeDirs: options.includeDirs,
      })
      const outputFiles = cloneFiles(compileResult.files)
      const compiledFunctions = outputFiles
        .filter(file => file.path.endsWith('.mcfunction'))
        .map(file => file.path)

      removeStaleOutputs(cachedEntry?.outputFiles ?? [], outputFiles, options.output)

      for (const file of entryUnit) {
        cache.update(file)
      }

      const entryRecord = cache.get(entryFile)
      if (entryRecord) {
        entryRecord.compiledFunctions = compiledFunctions
        entryRecord.outputFiles = outputFiles
        entryRecord.dependencies = [...entryUnit].sort()
      }

      writeBuildOutput(outputFiles, options.output)

      result.recompiled++
      result.results.set(entryFile, compileResult)
      result.rebuiltFiles.push(entryFile)
    } catch (err) {
      result.errors.set(entryFile, (err as Error).message)
    }
  }

  cache.save()
  result.elapsedMs = Date.now() - start
  return result
}

function discoverDependencyGraph(entries: string[], depGraph: DependencyGraph): Set<string> {
  const visited = new Set<string>()
  const queue = [...entries]

  while (queue.length > 0) {
    const current = path.resolve(queue.shift()!)
    if (visited.has(current)) continue
    visited.add(current)

    try {
      const source = fs.readFileSync(current, 'utf-8')
      depGraph.addFile(current, source)
      const imports = parseImports(current, source)
      for (const imported of imports) {
        if (!visited.has(imported)) queue.push(imported)
      }
    } catch {
      depGraph.removeFile(current)
    }
  }

  return visited
}

function cloneFiles(files: DatapackFile[]): DatapackFile[] {
  return files.map(file => ({ path: file.path, content: file.content }))
}

/** Write compile output files to the output directory. */
function writeBuildOutput(files: DatapackFile[], output: string): void {
  fs.mkdirSync(output, { recursive: true })
  for (const dataFile of files) {
    const filePath = path.join(output, dataFile.path)
    const dir = path.dirname(filePath)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, dataFile.content)
  }
}

function removeStaleOutputs(
  previousFiles: DatapackFile[],
  nextFiles: DatapackFile[],
  output: string,
): void {
  if (previousFiles.length === 0) return
  const nextPaths = new Set(nextFiles.map(file => file.path))

  for (const oldFile of previousFiles) {
    if (nextPaths.has(oldFile.path)) continue
    const targetPath = path.join(output, oldFile.path)
    if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true })
  }
}

function deriveNamespace(filePath: string): string {
  const basename = path.basename(filePath, path.extname(filePath))
  return basename.toLowerCase().replace(/[^a-z0-9]/g, '_')
}

export function resetCompileCache(): void {}
