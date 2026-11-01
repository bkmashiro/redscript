/**
 * DependencyGraph — tracks import relationships between .mcrs files.
 *
 * Builds a forward dependency map (file → files it imports) and supports
 * reverse lookups (file → files that depend on it) for change propagation.
 */

import * as fs from 'fs'
import * as path from 'path'
import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { resolveSourceImport } from '../compiler/source-imports'

/** Track imports accepted by the real parser, including module/symbol imports,
 * aliases and imports after declarations. Unresolved paths remain dependencies
 * so deletion/recreation can invalidate a previously compiled entry.
 */
export function parseImports(filePath: string, source?: string, options: { includeDirs?: readonly string[] } = {}): string[] {
  const absolutePath = path.resolve(filePath)
  const content = source ?? fs.readFileSync(absolutePath, 'utf-8')
  const parser = new Parser(new Lexer(content, absolutePath).tokenize(), content, absolutePath)
  const program = parser.parse('dependencies')
  return program.imports.map(imported => {
    const specifier = imported.packagePath ?? imported.moduleName
    return resolveSourceImport(specifier, { fromFile: absolutePath, includeDirs: options.includeDirs })
      ?? path.resolve(path.dirname(absolutePath), specifier)
  })
}

/**
 * Tracks inter-file import relationships for incremental compilation.
 *
 * Maintains a forward dependency map (`file → set of files it imports`) built
 * from each file's `import` header via {@link parseImports}. Supports:
 *
 * - **Direct lookups** – {@link getDirectDeps} returns the immediate imports of
 *   a file.
 * - **Transitive closure** – {@link getTransitiveDeps} computes the full set of
 *   files a given file depends on (directly or indirectly), cycle-safe.
 * - **Reverse lookups** – {@link getDependents} returns all files that
 *   (transitively) depend on a given file, enabling change propagation.
 * - **Dirty-set computation** – {@link computeDirtySet} expands a set of
 *   changed files to every file that needs recompilation.
 */
export class DependencyGraph {
  /** Forward edges: file → set of files it imports */
  private deps = new Map<string, Set<string>>()

  /** Add a file and its direct imports to the graph. */
  addFile(filePath: string, source?: string, options: { includeDirs?: readonly string[] } = {}): void {
    const absPath = path.resolve(filePath)
    const imports = parseImports(absPath, source, options)
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
