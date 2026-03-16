/**
 * DependencyGraph — tracks import relationships between .mcrs files.
 *
 * Builds a forward dependency map (file → files it imports) and supports
 * reverse lookups (file → files that depend on it) for change propagation.
 */

import * as fs from 'fs'
import * as path from 'path'

const IMPORT_RE = /^\s*import\s+"([^"]+)"\s*;?\s*$/

/**
 * Parse import statements from a source file's content.
 * Returns absolute paths of imported files.
 */
export function parseImports(filePath: string, source?: string): string[] {
  const absPath = path.resolve(filePath)
  const content = source ?? fs.readFileSync(absPath, 'utf-8')
  const dir = path.dirname(absPath)
  const imports: string[] = []

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    // Stop at first non-comment, non-blank, non-import line
    if (!trimmed || trimmed.startsWith('//')) continue
    const match = trimmed.match(IMPORT_RE)
    if (match) {
      imports.push(path.resolve(dir, match[1]))
    } else {
      // Past the import header
      break
    }
  }

  return imports
}

export class DependencyGraph {
  /** Forward edges: file → set of files it imports */
  private deps = new Map<string, Set<string>>()

  /** Add a file and its direct imports to the graph. */
  addFile(filePath: string, source?: string): void {
    const absPath = path.resolve(filePath)
    const imports = parseImports(absPath, source)
    this.deps.set(absPath, new Set(imports))
  }

  /** Remove a file from the graph. */
  removeFile(filePath: string): void {
    this.deps.delete(path.resolve(filePath))
  }

  /** Get direct imports of a file. */
  getDirectDeps(filePath: string): Set<string> {
    return this.deps.get(path.resolve(filePath)) ?? new Set()
  }

  /**
   * Get transitive dependencies of a file (all files it depends on,
   * directly or indirectly).
   */
  getTransitiveDeps(filePath: string): Set<string> {
    const absPath = path.resolve(filePath)
    const result = new Set<string>()
    const stack = [absPath]

    while (stack.length > 0) {
      const current = stack.pop()!
      const directDeps = this.deps.get(current)
      if (!directDeps) continue
      for (const dep of directDeps) {
        if (!result.has(dep)) {
          result.add(dep)
          stack.push(dep)
        }
      }
    }

    return result
  }

  /**
   * Get reverse dependents: all files that (transitively) depend on the
   * given file. Used for change propagation — when `filePath` changes,
   * all returned files need recompilation.
   */
  getDependents(filePath: string): Set<string> {
    const absPath = path.resolve(filePath)
    const result = new Set<string>()
    const stack = [absPath]

    while (stack.length > 0) {
      const current = stack.pop()!
      for (const [file, deps] of this.deps) {
        if (deps.has(current) && !result.has(file)) {
          result.add(file)
          stack.push(file)
        }
      }
    }

    return result
  }

  /**
   * Given a set of changed files, compute the full set of dirty files
   * (changed files + all their reverse dependents).
   */
  computeDirtySet(changedFiles: Set<string>): Set<string> {
    const dirty = new Set<string>()
    for (const file of changedFiles) {
      const absFile = path.resolve(file)
      dirty.add(absFile)
      for (const dep of this.getDependents(absFile)) {
        dirty.add(dep)
      }
    }
    return dirty
  }

  /** Get all tracked files. */
  getAllFiles(): string[] {
    return [...this.deps.keys()]
  }

  /** Clear the graph. */
  clear(): void {
    this.deps.clear()
  }
}
