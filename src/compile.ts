/**
 * RedScript Compile API
 *
 * Main compile function with proper error handling and diagnostics.
 */

import * as fs from 'fs'
import * as path from 'path'

import { Lexer } from './lexer'
import { Parser } from './parser'
import { Lowering } from './lowering'
import { optimize } from './optimizer/passes'
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

const IMPORT_RE = /^\s*import\s+"([^"]+)"\s*;?\s*$/

interface PreprocessOptions {
  filePath?: string
  seen?: Set<string>
}

export function preprocessSource(source: string, options: PreprocessOptions = {}): string {
  const { filePath } = options
  const seen = options.seen ?? new Set<string>()

  if (filePath) {
    seen.add(path.resolve(filePath))
  }

  const lines = source.split('\n')
  const imports: string[] = []
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

        imports.push(preprocessSource(importedSource, { filePath: importPath, seen }))
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

  return [...imports, bodyLines.join('\n')].filter(Boolean).join('\n')
}

// ---------------------------------------------------------------------------
// Main Compile Function
// ---------------------------------------------------------------------------

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const { namespace = 'redscript', filePath, optimize: shouldOptimize = true } = options
  let sourceLines = source.split('\n')

  try {
    const preprocessedSource = preprocessSource(source, { filePath })
    sourceLines = preprocessedSource.split('\n')

    // Lexing
    const tokens = new Lexer(preprocessedSource, filePath).tokenize()

    // Parsing
    const ast = new Parser(tokens, preprocessedSource, filePath).parse(namespace)

    // Lowering
    const ir = new Lowering(namespace).lower(ast)

    // Optimization
    const optimized: IRModule = shouldOptimize
      ? { ...ir, functions: ir.functions.map(fn => optimize(fn)) }
      : ir

    // Code generation
    const generated = generateDatapackWithStats(optimized)

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
