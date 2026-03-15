/**
 * RedScript Compiler
 *
 * Main entry point for programmatic usage.
 */

export const version = '2.0.0'

import { Lexer } from './lexer'
import { Parser } from './parser'
import { preprocessSource } from './compile'

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

/**
 * Check RedScript source code for errors without generating output.
 *
 * @param source - The RedScript source code
 * @param namespace - Optional namespace
 * @returns null if no errors, or an error object
 */
export function check(source: string, namespace = 'redscript', filePath?: string): Error | null {
  try {
    const preprocessedSource = preprocessSource(source, { filePath })
    const tokens = new Lexer(preprocessedSource, filePath).tokenize()
    new Parser(tokens, preprocessedSource, filePath).parse(namespace)
    return null
  } catch (err) {
    return err as Error
  }
}
