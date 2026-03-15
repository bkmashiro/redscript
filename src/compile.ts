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

export { compile, CompileOptions, CompileResult } from '../src2/emit/compile'
export type { DatapackFile } from '../src2/emit/index'

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
}

function countLines(source: string): number {
  return source === '' ? 0 : source.split('\n').length
}

function offsetRanges(ranges: SourceRange[], lineOffset: number): SourceRange[] {
  return ranges.map(range => ({
    startLine: range.startLine + lineOffset,
    endLine: range.endLine + lineOffset,
    filePath: range.filePath,
  }))
}

export function preprocessSourceWithMetadata(source: string, options: PreprocessOptions = {}): PreprocessedSource {
  const { filePath } = options
  const seen = options.seen ?? new Set<string>()

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

      const importPath = path.resolve(path.dirname(filePath), match[1])
      if (!seen.has(importPath)) {
        seen.add(importPath)
        let importedSource: string

        try {
          importedSource = fs.readFileSync(importPath, 'utf-8')
        } catch {
          throw new DiagnosticError(
            'ParseError',
            `Cannot import '${match[1]}'`,
            { file: filePath, line: i + 1, col: 1 },
            lines
          )
        }

        if (isLibrarySource(importedSource)) {
          // Library file: parse separately so its functions are DCE-eligible.
          // Also collect any transitive library imports inside it.
          const nested = preprocessSourceWithMetadata(importedSource, { filePath: importPath, seen })
          libraryImports.push({ source: importedSource, filePath: importPath })
          // Propagate transitive library imports (e.g. math.mcrs imports vec.mcrs)
          if (nested.libraryImports) libraryImports.push(...nested.libraryImports)
        } else {
          imports.push(preprocessSourceWithMetadata(importedSource, { filePath: importPath, seen }))
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

export function preprocessSource(source: string, options: PreprocessOptions = {}): string {
  return preprocessSourceWithMetadata(source, options).source
}
