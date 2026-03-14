/**
 * RedScript Compile API
 *
 * Main compile function with proper error handling and diagnostics.
 */

import * as fs from 'fs'
import * as path from 'path'

import { Lexer } from './lexer'
import { Parser } from './parser'
import { Lowering, setScoreboardObjective } from './lowering'
import { optimize } from './optimizer/passes'
import { eliminateDeadCode } from './optimizer/dce'
import { generateDatapackWithStats, DatapackFile } from './codegen/mcfunction'
import { DiagnosticError, formatError, parseErrorMessage } from './diagnostics'
import type { IRModule } from './ir/types'
import type { Program } from './ast/types'

// ---------------------------------------------------------------------------
// Compile Options
// ---------------------------------------------------------------------------

export interface CompileOptions {
  namespace?: string
  filePath?: string
  optimize?: boolean
  dce?: boolean
  mangle?: boolean
  /** Scoreboard objective used for all variable slots.
   *  Defaults to 'rs'. Set to a unique value (e.g. 'mypack_rs') when loading
   *  multiple RedScript datapacks simultaneously to avoid variable collisions. */
  scoreboardObjective?: string
  /** Additional source files that should be treated as *library* code.
   *  Functions in these files are DCE-eligible: they are only compiled into
   *  the datapack when actually called from user code.  Each string is parsed
   *  independently (as if it had `module library;` at the top), so library
   *  mode never bleeds into the main `source`. */
  librarySources?: string[]
}

// ---------------------------------------------------------------------------
// Compile Result
// ---------------------------------------------------------------------------

export interface CompileResult {
  success: boolean
  files?: DatapackFile[]
  advancements?: DatapackFile[]
  ast?: Program
  ir?: IRModule
  error?: DiagnosticError
}

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

// ---------------------------------------------------------------------------
// Main Compile Function
// ---------------------------------------------------------------------------

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const { namespace = 'redscript', filePath, optimize: shouldOptimize = true } = options
  const shouldRunDce = options.dce ?? shouldOptimize
  let sourceLines = source.split('\n')

  try {
    const preprocessed = preprocessSourceWithMetadata(source, { filePath })
    const preprocessedSource = preprocessed.source
    sourceLines = preprocessedSource.split('\n')

    // Lexing
    const tokens = new Lexer(preprocessedSource, filePath).tokenize()

    // Parsing — user source
    const parsedAst = new Parser(tokens, preprocessedSource, filePath).parse(namespace)

    // Collect all library sources: explicit `librarySources` option +
    // auto-detected imports (files with `module library;` pulled out by the
    // preprocessor rather than concatenated).
    const allLibrarySources: Array<{ src: string; fp?: string }> = []
    for (const libSrc of options.librarySources ?? []) {
      allLibrarySources.push({ src: libSrc })
    }
    for (const li of preprocessed.libraryImports ?? []) {
      allLibrarySources.push({ src: li.source, fp: li.filePath })
    }

    // Parse library sources independently (fresh Parser per source) so that
    // `inLibraryMode` never bleeds into user code.  All resulting functions get
    // isLibraryFn=true (either via `module library;` in the source, or forced below).
    for (const { src, fp } of allLibrarySources) {
      const libPreprocessed = preprocessSourceWithMetadata(src, fp ? { filePath: fp } : {})
      const libTokens = new Lexer(libPreprocessed.source, fp).tokenize()
      const libAst = new Parser(libTokens, libPreprocessed.source, fp).parse(namespace)
      // Force all functions to library mode (even if source lacks `module library;`)
      for (const fn of libAst.declarations) fn.isLibraryFn = true
      // Merge into main AST
      parsedAst.declarations.push(...libAst.declarations)
      parsedAst.structs.push(...libAst.structs)
      parsedAst.implBlocks.push(...libAst.implBlocks)
      parsedAst.enums.push(...libAst.enums)
      parsedAst.consts.push(...libAst.consts)
      parsedAst.globals.push(...libAst.globals)
    }
    const dceResult = shouldRunDce ? eliminateDeadCode(parsedAst) : { program: parsedAst, warnings: [] }
    const ast = dceResult.program

    // Configure scoreboard objective for this compilation
    setScoreboardObjective(options.scoreboardObjective ?? 'rs')

    // Lowering
    const ir = new Lowering(namespace, preprocessed.ranges).lower(ast)

    // Optimization
    const optimized: IRModule = shouldOptimize
      ? { ...ir, functions: ir.functions.map(fn => optimize(fn)) }
      : ir

    // Code generation — mangle=true by default to prevent cross-function
    // scoreboard variable collisions in the global MC scoreboard namespace.
    const generated = generateDatapackWithStats(optimized, {
      mangle: options.mangle ?? true,
      scoreboardObjective: options.scoreboardObjective ?? 'rs',
    })

    return {
      success: true,
      files: [...generated.files, ...generated.advancements],
      advancements: generated.advancements,
      ast,
      ir: optimized,
    }
  } catch (err) {
    // Already a DiagnosticError
    if (err instanceof DiagnosticError) {
      return { success: false, error: err }
    }

    // Try to parse the error message for line/col info
    if (err instanceof Error) {
      const diagnostic = parseErrorMessage(
        'ParseError',
        err.message,
        sourceLines,
        filePath
      )
      return { success: false, error: diagnostic }
    }

    // Unknown error
    return {
      success: false,
      error: new DiagnosticError(
        'ParseError',
        String(err),
        { file: filePath, line: 1, col: 1 },
        sourceLines
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Format Compile Error
// ---------------------------------------------------------------------------

export function formatCompileError(result: CompileResult): string {
  if (result.success) {
    return 'Compilation successful'
  }
  if (result.error) {
    return formatError(result.error, result.error.sourceLines?.join('\n'))
  }
  return 'Unknown error'
}
