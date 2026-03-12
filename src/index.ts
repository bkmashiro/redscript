/**
 * RedScript Compiler
 * 
 * Main entry point for programmatic usage.
 */

import { Lexer } from './lexer'
import { Parser } from './parser'
import { Lowering } from './lowering'
import { optimize } from './optimizer/passes'
import { generateDatapack, DatapackFile } from './codegen/mcfunction'
import type { IRModule } from './ir/types'
import type { Program } from './ast/types'

export interface CompileOptions {
  namespace?: string
  optimize?: boolean
}

export interface CompileResult {
  files: DatapackFile[]
  ast: Program
  ir: IRModule
}

/**
 * Compile RedScript source code to a Minecraft datapack.
 * 
 * @param source - The RedScript source code
 * @param options - Compilation options
 * @returns Compiled datapack files
 */
export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const namespace = options.namespace ?? 'redscript'
  const shouldOptimize = options.optimize ?? true

  // Lexing
  const tokens = new Lexer(source).tokenize()

  // Parsing
  const ast = new Parser(tokens).parse(namespace)

  // Lowering to IR
  const ir = new Lowering(namespace).lower(ast)

  // Optimization
  const optimizedIR: IRModule = shouldOptimize
    ? { ...ir, functions: ir.functions.map(fn => optimize(fn)) }
    : ir

  // Code generation
  const files = generateDatapack(optimizedIR)

  return { files, ast, ir: optimizedIR }
}

/**
 * Check RedScript source code for errors without generating output.
 * 
 * @param source - The RedScript source code
 * @param namespace - Optional namespace
 * @returns null if no errors, or an error object
 */
export function check(source: string, namespace = 'redscript'): Error | null {
  try {
    const tokens = new Lexer(source).tokenize()
    new Parser(tokens).parse(namespace)
    return null
  } catch (err) {
    return err as Error
  }
}

// Re-export types and classes for advanced usage
export { Lexer } from './lexer'
export { Parser } from './parser'
export { Lowering } from './lowering'
export { optimize } from './optimizer/passes'
export { generateDatapack } from './codegen/mcfunction'
export type { DatapackFile } from './codegen/mcfunction'
export type { IRModule, IRFunction } from './ir/types'
export type { Program, FnDecl, Expr, Stmt } from './ast/types'
