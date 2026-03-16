/**
 * RedScript Compiler
 *
 * Main entry point for programmatic usage.
 */

export const version = '2.0.0'

import { compile } from './emit/compile'

// Re-export v2 compile API
export { compile, CompileOptions, CompileResult } from './emit/compile'
export type { DatapackFile } from './emit/index'

// Re-export utilities
export { Lexer } from './lexer'
export { Parser } from './parser'
export { preprocessSource, preprocessSourceWithMetadata } from './compile'
export { MCCommandValidator } from './mc-validator'
export type { Program, FnDecl, Expr, Stmt, Span } from './ast/types'
export type { DiagnosticError } from './diagnostics'

// Incremental compilation
export { FileCache, hashFile } from './cache/index'
export { DependencyGraph, parseImports } from './cache/deps'
export { compileIncremental, resetCompileCache } from './cache/incremental'
export type { IncrementalOptions, IncrementalResult } from './cache/incremental'

export interface CheckResult {
  error: Error | null
  warnings: string[]
}

/**
 * Check RedScript source code for errors without generating output.
 * Runs the full compile pipeline (lex → parse → HIR → MIR → LIR → emit)
 * to catch type-level and lowering errors, not just parse errors.
 *
 * @param source - The RedScript source code
 * @param namespace - Optional namespace
 * @returns null if no errors, or an error object
 */
export function check(source: string, namespace = 'redscript', filePath?: string): Error | null {
  return checkWithWarnings(source, namespace, filePath).error
}

/**
 * Like check(), but also returns warnings (e.g., tick budget analysis).
 */
export function checkWithWarnings(source: string, namespace = 'redscript', filePath?: string): CheckResult {
  try {
    const result = compile(source, { namespace, filePath })
    return { error: null, warnings: result.warnings }
  } catch (err) {
    return { error: err as Error, warnings: [] }
  }
}
