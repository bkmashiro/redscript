/**
 * RedScript Compiler
 *
 * Main entry point for programmatic usage.
 */

// Read version from package.json to avoid hardcoding
import pkg from '../package.json'
export const version = pkg.version

import { compile } from './emit/compile'
import { CheckFailedError, DiagnosticError, parseErrorMessage } from './diagnostics'

// Re-export v2 compile API
export { compile, CompileOptions, CompileResult } from './emit/compile'
export { compileModules } from './emit/modules'
export type { ModuleInput, CompileModulesOptions, CompileModulesResult } from './emit/modules'
export { McVersion, parseMcVersion, compareMcVersion, DEFAULT_MC_VERSION } from './types/mc-version'
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

export interface DetailedCheckResult {
  errors: DiagnosticError[]
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
  const result = checkDetailed(source, namespace, filePath)
  return { error: result.errors[0] ?? null, warnings: result.warnings }
}

export function checkDetailed(source: string, namespace = 'redscript', filePath?: string): DetailedCheckResult {
  try {
    const result = compile(source, { namespace, filePath, stopAfterCheck: true })
    return { errors: [], warnings: result.warnings }
  } catch (err) {
    if (err instanceof CheckFailedError) {
      return { errors: err.diagnostics, warnings: err.warnings }
    }
    if (err instanceof DiagnosticError) {
      return { errors: [err], warnings: [] }
    }
    return {
      errors: [parseErrorMessage('LoweringError', (err as Error).message, source.split('\n'), filePath)],
      warnings: [],
    }
  }
}
