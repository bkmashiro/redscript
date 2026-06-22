import { fileURLToPath } from 'url'
import * as fs from 'fs'
import * as path from 'path'
import { Lexer } from '../lexer'
import { Parser } from '../parser'
import type { FnDecl, Program } from '../ast/types'

export type ImportKind = 'module' | 'path'

export interface ImportedProgram {
  moduleName: string
  symbol?: string
  filePath: string
  kind: ImportKind
  prog: Program
  source: string
}

const importedCache = new Map<string, { prog: Program; source: string; mtimeMs: number }>()

/** Resolve a relative import path to an absolute file path, or null when unknown. */
export function resolveImportPath(importStr: string, fromUri: string): string | null {
  try {
    const fromFile = fileURLToPath(fromUri)
    const fromDir = path.dirname(fromFile)

    const directCandidate = (candidateBase: string): string | null => {
      const base = path.resolve(fromDir, candidateBase)
      if (fs.existsSync(base)) return base
      if (!base.endsWith('.mcrs') && fs.existsSync(base + '.mcrs')) return base + '.mcrs'
      return null
    }

    if (importStr.startsWith('.')) {
      const resolved = path.resolve(fromDir, importStr)
      if (fs.existsSync(resolved)) return resolved
      if (!resolved.endsWith('.mcrs') && fs.existsSync(resolved + '.mcrs')) return resolved + '.mcrs'
    } else {
      const direct = directCandidate(importStr) || directCandidate(`${importStr}.mcrs`)
      if (direct) return direct

      let dir = fromDir
      for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, 'package.json'))) {
          const candidate = path.join(dir, 'src', importStr)
          if (fs.existsSync(candidate)) return candidate
          if (fs.existsSync(candidate + '.mcrs')) return candidate + '.mcrs'

          const candidate2 = path.join(dir, importStr)
          if (fs.existsSync(candidate2)) return candidate2
          if (fs.existsSync(candidate2 + '.mcrs')) return candidate2 + '.mcrs'

          const candidate3 = path.join(dir, 'src', `${importStr}.mcrs`)
          if (fs.existsSync(candidate3)) return candidate3
          const candidate4 = path.join(dir, `${importStr}.mcrs`)
          if (fs.existsSync(candidate4)) return candidate4
          break
        }
        dir = path.dirname(dir)
      }
    }
  } catch { /* ignore */ }
  return null
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
export function getImportedPrograms(
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
    const resolved = resolveImportPath(imp.moduleName, fromUri)
    if (!resolved || !fs.existsSync(resolved)) continue
    add(imp.moduleName, resolved, imp.symbol, 'module')
  }

  return result
}

/** Pick all callable symbols that should be visible from an imported module entry. */
export function getImportedFunctions(imported: ImportedProgram): FnDecl[] {
  if (imported.kind === 'module' && imported.symbol) {
    if (imported.symbol === '*') {
      return imported.prog.declaredFunctions ?? []
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
