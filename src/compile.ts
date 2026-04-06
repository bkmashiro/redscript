/**
 * RedScript Compile API
 *
 * Preprocessing utilities and v2 compile re-export.
 */

import * as fs from 'fs'
import * as path from 'path'

import { DiagnosticError } from './diagnostics'

// ---------------------------------------------------------------------------
// Re-export v2 compile
// ---------------------------------------------------------------------------

export { compile, CompileOptions, CompileResult } from './emit/compile'
export type { DatapackFile } from './emit/index'

// ---------------------------------------------------------------------------
// Source Range / Preprocessing
// ---------------------------------------------------------------------------

export interface SourceRange {
  startLine: number
  endLine: number
  filePath: string
}

export interface PreprocessedSource {
  source: string
  ranges: SourceRange[]
  /** Imported files that declared `module library;` — parsed separately
   *  in library mode so their functions are DCE-eligible.  Never concatenated
   *  into `source`. */
  libraryImports?: Array<{ source: string; filePath: string }>
}

/**
 * Resolve a combined-source line number back to the original file and line.
 * Returns { filePath, line } if a mapping is found, otherwise returns the input unchanged.
 */
export function resolveSourceLine(
  combinedLine: number,
  ranges: SourceRange[],
  fallbackFile?: string
): { filePath?: string; line: number } {
  for (const range of ranges) {
    if (combinedLine >= range.startLine && combinedLine <= range.endLine) {
      const localLine = combinedLine - range.startLine + 1
      return { filePath: range.filePath, line: localLine }
    }
  }
  return { filePath: fallbackFile, line: combinedLine }
}

const IMPORT_RE = /^\s*import\s+"([^"]+)"\s*;?\s*$/

/** Returns true if the source file declares `module library;` at its top
 *  (before any non-comment/non-blank lines). */
function isLibrarySource(source: string): boolean {
  for (const line of source.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//')) continue
    return /^module\s+library\s*;/.test(trimmed)
  }
  return false
}

interface PreprocessOptions {
  filePath?: string
  seen?: Set<string>
  includeDirs?: string[]
}

/** Resolve an import specifier to an absolute file path, trying multiple locations. */
function resolveImportPath(
  spec: string,
  fromFile: string,
  includeDirs: string[]
): string | null {
  const candidates = spec.endsWith('.mcrs') ? [spec] : [spec, spec + '.mcrs']

  for (const candidate of candidates) {
    // 1. Relative to the importing file
    const rel = path.resolve(path.dirname(fromFile), candidate)
    if (fs.existsSync(rel)) return rel

    // 2. stdlib directory (package root / src / stdlib)
    //    Strip leading 'stdlib/' prefix so `import "stdlib/math"` resolves to
    //    <stdlibDir>/math.mcrs rather than <stdlibDir>/stdlib/math.mcrs.
    const stdlibDir = path.resolve(__dirname, '..', 'src', 'stdlib')
    const stdlibCandidate = candidate.replace(/^stdlib\//, '')
    const stdlib = path.resolve(stdlibDir, stdlibCandidate)
    if (fs.existsSync(stdlib)) return stdlib

    // 3. Extra include dirs
    for (const dir of includeDirs) {
      const extra = path.resolve(dir, candidate)
      if (fs.existsSync(extra)) return extra
    }
  }
  return null
}

function countLines(source: string): number {
  return source === '' ? 0 : source.replace(/\r\n/g, '\n').split('\n').length
}

function offsetRanges(ranges: SourceRange[], lineOffset: number): SourceRange[] {
  return ranges.map(range => ({
    startLine: range.startLine + lineOffset,
    endLine: range.endLine + lineOffset,
    filePath: range.filePath,
  }))
}

/**
 * Preprocess RedScript source code, resolving `import "..."` statements and
 * returning the combined source together with source-range metadata.
 *
 * Preprocessing steps performed:
 * 1. Scans header-position `import "path"` directives (before any non-blank,
 *    non-comment line) and recursively resolves them relative to `filePath`,
 *    the stdlib directory, and any extra `includeDirs`.
 * 2. Files that declare `module library;` are collected separately in
 *    `libraryImports` instead of being concatenated into `source` — this
 *    keeps them eligible for dead-code elimination during compilation.
 * 3. Builds a `ranges` array mapping line numbers in the combined `source`
 *    back to their original file paths, used for accurate error reporting.
 *
 * @param source - The raw RedScript source text to preprocess.
 * @param options - Optional settings:
 *   - `filePath`: absolute path of `source` on disk; required for import resolution.
 *   - `seen`: set of already-visited absolute paths (prevents import cycles).
 *   - `includeDirs`: additional directories searched when resolving import specifiers.
 * @returns A {@link PreprocessedSource} containing the concatenated `source`,
 *   the `ranges` array for source-map lookups, and any `libraryImports`.
 * @throws {@link DiagnosticError} if an import statement is encountered without
 *   a `filePath`, or if an import specifier cannot be resolved.
 */
export function preprocessSourceWithMetadata(source: string, options: PreprocessOptions = {}): PreprocessedSource {
  const { filePath } = options
  const seen = options.seen ?? new Set<string>()
  const includeDirs = options.includeDirs ?? []

  if (filePath) {
    seen.add(path.resolve(filePath))
  }

  const lines = source.split('\n')
  const imports: PreprocessedSource[] = []
  /** Library imports: `module library;` files routed here instead of concatenated. */
  const libraryImports: Array<{ source: string; filePath: string }> = []
  const bodyLines: string[] = []
  let parsingHeader = true

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    const match = line.match(IMPORT_RE)

    if (parsingHeader && match) {
      if (!filePath) {
        throw new DiagnosticError(
          'ParseError',
          'Import statements require a file path',
          { line: i + 1, col: 1 },
          lines
        )
      }

      const importPath = resolveImportPath(match[1], filePath, includeDirs)
      if (!importPath) {
        throw new DiagnosticError(
          'ParseError',
          `Cannot import '${match[1]}'`,
          { file: filePath, line: i + 1, col: 1 },
          lines
        )
      }
      if (!seen.has(importPath)) {
        seen.add(importPath)
        const importedSource = fs.readFileSync(importPath, 'utf-8')

        if (isLibrarySource(importedSource)) {
          // Library file: parse separately so its functions are DCE-eligible.
          // Also collect any transitive library imports inside it.
          const nested = preprocessSourceWithMetadata(importedSource, { filePath: importPath, seen, includeDirs })
          libraryImports.push({ source: importedSource, filePath: importPath })
          // Propagate transitive library imports (e.g. math.mcrs imports vec.mcrs)
          if (nested.libraryImports) libraryImports.push(...nested.libraryImports)
        } else {
          imports.push(preprocessSourceWithMetadata(importedSource, { filePath: importPath, seen, includeDirs }))
        }
      }
      continue
    }

    if (parsingHeader && (trimmed === '' || trimmed.startsWith('//'))) {
      bodyLines.push(line)
      continue
    }

    parsingHeader = false
    bodyLines.push(line)
  }

  const body = bodyLines.join('\n')
  const parts = [...imports.map(entry => entry.source), body].filter(Boolean)
  const combined = parts.join('\n')

  const ranges: SourceRange[] = []
  let lineOffset = 0

  for (const entry of imports) {
    ranges.push(...offsetRanges(entry.ranges, lineOffset))
    lineOffset += countLines(entry.source)
  }

  if (filePath && body) {
    ranges.push({
      startLine: lineOffset + 1,
      endLine: lineOffset + countLines(body),
      filePath: path.resolve(filePath),
    })
  }

  return {
    source: combined,
    ranges,
    libraryImports: libraryImports.length > 0 ? libraryImports : undefined,
  }
}

/**
 * Preprocess RedScript source code and return only the combined source string.
 *
 * Convenience wrapper around {@link preprocessSourceWithMetadata} for callers
 * that do not need the source-range or library-import metadata.
 *
 * @param source - The raw RedScript source text to preprocess.
 * @param options - Same options as {@link preprocessSourceWithMetadata}.
 * @returns The concatenated source string with all imports inlined.
 */
export function preprocessSource(source: string, options: PreprocessOptions = {}): string {
  return preprocessSourceWithMetadata(source, options).source
}
