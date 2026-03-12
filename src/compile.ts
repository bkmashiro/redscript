/**
 * RedScript Compile API
 *
 * Main compile function with proper error handling and diagnostics.
 */

import { Lexer } from './lexer'
import { Parser } from './parser'
import { Lowering } from './lowering'
import { optimize } from './optimizer/passes'
import { generateDatapack, DatapackFile } from './codegen/mcfunction'
import { DiagnosticError, parseErrorMessage } from './diagnostics'
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
  ast?: Program
  ir?: IRModule
  error?: DiagnosticError
}

// ---------------------------------------------------------------------------
// Main Compile Function
// ---------------------------------------------------------------------------

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const { namespace = 'redscript', filePath, optimize: shouldOptimize = true } = options
  const sourceLines = source.split('\n')

  try {
    // Lexing
    const tokens = new Lexer(source, filePath).tokenize()

    // Parsing
    const ast = new Parser(tokens, source, filePath).parse(namespace)

    // Lowering
    const ir = new Lowering(namespace).lower(ast)

    // Optimization
    const optimized: IRModule = shouldOptimize
      ? { ...ir, functions: ir.functions.map(fn => optimize(fn)) }
      : ir

    // Code generation
    const files = generateDatapack(optimized)

    return { success: true, files, ast, ir: optimized }
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
    return result.error.format()
  }
  return 'Unknown error'
}
