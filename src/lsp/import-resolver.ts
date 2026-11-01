import { fileURLToPath } from 'url'
import * as fs from 'fs'
import * as path from 'path'
import { Lexer } from '../lexer'
import { Parser } from '../parser'
import type { FnDecl, Program } from '../ast/types'
import { resolveSourceImport, type SourceImportLocation } from '../compiler/source-imports'
import { loadSourceGraph } from '../compiler/source-graph'

export type ImportKind = 'module' | 'path'

export interface ImportedProgram {
  moduleName: string
  symbol?: string
  filePath: string
  kind: ImportKind
  prog: Program
  source: string
  visibleFunctions?: FnDecl[]
}

const importedCache = new Map<string, { prog: Program; source: string; mtimeMs: number }>()

/** Resolve a relative import path to an absolute file path, or null when unknown. */
function importLocation(fromUri: string): SourceImportLocation {
  let fromFile: string | undefined
  const includeDirs: string[] = []
  try {
    fromFile = fileURLToPath(fromUri)
    let dir = path.dirname(fromFile)
    for (let depth = 0; depth < 10; depth++) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        includeDirs.push(path.join(dir, 'src'), dir)
        break
      }
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  } catch { /* Unsaved non-file documents can still resolve compiler stdlib. */ }
  return { fromFile, includeDirs }
}

export function resolveImportPath(importStr: string, fromUri: string): string | null {
  return resolveSourceImport(importStr, importLocation(fromUri))
}

function parseImportedProgram(filePath: string): { prog: Program; source: string } | null {
  try {
    const stat = fs.statSync(filePath)
    const cached = importedCache.get(filePath)
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached

    const source = fs.readFileSync(filePath, 'utf-8')
    const tokens = new Lexer(source).tokenize()
    const prog = new Parser(tokens).parse(path.basename(filePath, '.mcrs'))
    const parsed = { prog, source, mtimeMs: stat.mtimeMs }
    importedCache.set(filePath, parsed)
    return parsed
  } catch { /* ignore */ }
  return null
}

/**
 * Resolve import declarations and parse imported files for LSP use.
 *
 * - Path imports: import "foo" style
 * - Module imports: import api, import api::foo, import api::*
 */
function getFallbackImportedPrograms(
  source: string,
  fromUri: string,
  parsedProgram: Program | null,
): ImportedProgram[] {
  const result: ImportedProgram[] = []
  const seen = new Set<string>()
  const add = (
    moduleName: string,
    filePath: string,
    symbol: string | undefined,
    kind: ImportKind,
  ): void => {
    const key = `${kind}:${filePath}:${symbol ?? ''}`
    if (seen.has(key)) return
    seen.add(key)
    const parsed = parseImportedProgram(filePath)
    if (!parsed) return
    result.push({
      moduleName,
      symbol,
      filePath,
      kind,
      prog: parsed.prog,
      source: parsed.source,
    })
  }

  // 1) Path imports: import "..."
  const FILE_IMPORT_RE = /^import\s+"([^"]+)"/gm
  let m: RegExpExecArray | null
  while ((m = FILE_IMPORT_RE.exec(source)) !== null) {
    const resolved = resolveImportPath(m[1], fromUri)
    if (!resolved || !fs.existsSync(resolved)) continue
    add(m[1], resolved, undefined, 'path')
  }

  // 2) Module imports from parser AST: import api; / import api::*; / import api::foo;
  for (const imp of parsedProgram?.imports ?? []) {
    const resolved = resolveImportPath(imp.packagePath ?? imp.moduleName, fromUri)
    if (!resolved || !fs.existsSync(resolved)) continue
    add(imp.moduleName, resolved, imp.symbol, 'module')
  }

  return result
}

/** Editor imports use the same discovered source graph as standalone compilation.
 * Incomplete lexical input retains the old header index until lexer recovery can
 * supply a partial graph; this fallback is not used to compile or bind programs.
 */
export function getImportedPrograms(source: string, fromUri: string, parsedProgram: Program | null): ImportedProgram[] {
  try {
    const location = importLocation(fromUri)
    const graph = loadSourceGraph({ filePath: location.fromFile, uri: fromUri, source, includeDirs: location.includeDirs, allowDiagnostics: true })
    const normalized = graph.entry.programs[0].imports
    const result: ImportedProgram[] = []
    for (let index = 0; index < graph.entryImports.length; index++) {
      const syntax = graph.entryImports[index]
      const imported = normalized[index]
      const loaded = imported.packagePath ? graph.packages.get(imported.packagePath) : undefined
      if (!loaded || loaded.id.path === graph.entry.id.path || !loaded.sourceFiles?.[0]) continue
      const candidates = loaded.programs.flatMap(program => [...program.declarations, ...(program.declaredFunctions ?? [])])
        .filter(fn => fn.isExported)
      result.push({
        moduleName: imported.alias ?? imported.moduleName, symbol: syntax.symbol,
        kind: syntax.packagePath ? 'path' : 'module',
        // URI presentation follows the user's workspace spelling, while the
        // source graph keeps the canonical physical identity for deduplication.
        filePath: resolveImportPath(syntax.packagePath ?? syntax.moduleName, fromUri) ?? loaded.sourceFiles[0].absolutePath,
        prog: loaded.programs[0], source: loaded.sourceFiles[0].text,
        visibleFunctions: syntax.symbol && syntax.symbol !== '*' ? candidates.filter(fn => fn.name === syntax.symbol) : candidates,
      })
    }
    return result
  } catch {
    return getFallbackImportedPrograms(source, fromUri, parsedProgram)
  }
}

/** Pick all callable symbols that should be visible from an imported module entry. */
export function getImportedFunctions(imported: ImportedProgram): FnDecl[] {
  if (imported.visibleFunctions) return imported.visibleFunctions
  if (imported.kind === 'module' && imported.symbol) {
    if (imported.symbol === '*') {
      return [...imported.prog.declarations, ...(imported.prog.declaredFunctions ?? [])]
    }
    return (imported.prog.declaredFunctions ?? []).filter(fn => fn.name === imported.symbol)
  }

  return [
    ...imported.prog.declarations,
    ...(imported.prog.declaredFunctions ?? []),
  ]
}

export function getImportedFunctionByName(imported: ImportedProgram, name: string): FnDecl | undefined {
  return getImportedFunctions(imported).find(fn => fn.name === name)
}

export function shouldImportStructsAndTypes(imported: ImportedProgram): boolean {
  return imported.kind === 'path' || imported.symbol === undefined
}
