/**
 * RedScript Compiler
 * 
 * Main entry point for programmatic usage.
 */

import { Lexer } from './lexer'
import { Parser } from './parser'
import { TypeChecker } from './typechecker'
import { Lowering } from './lowering'
import type { Warning } from './lowering'
import { optimizeWithStats } from './optimizer/passes'
import { generateDatapackWithStats, DatapackFile } from './codegen/mcfunction'
import { preprocessSource } from './compile'
import type { IRModule } from './ir/types'
import type { Program } from './ast/types'
import type { DiagnosticError } from './diagnostics'
import { createEmptyOptimizationStats, mergeOptimizationStats, type OptimizationStats } from './optimizer/commands'

export interface CompileOptions {
  namespace?: string
  optimize?: boolean
  typeCheck?: boolean
  filePath?: string
}

export interface CompileResult {
  files: DatapackFile[]
  ast: Program
  ir: IRModule
  typeErrors?: DiagnosticError[]
  warnings?: Warning[]
  stats?: OptimizationStats
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
  const shouldTypeCheck = options.typeCheck ?? true
  const filePath = options.filePath
  const preprocessedSource = preprocessSource(source, { filePath })

  // Lexing
  const tokens = new Lexer(preprocessedSource, filePath).tokenize()

  // Parsing
  const ast = new Parser(tokens, preprocessedSource, filePath).parse(namespace)

  // Type checking (warn mode - collect errors but don't block)
  let typeErrors: DiagnosticError[] | undefined
  if (shouldTypeCheck) {
    const checker = new TypeChecker(preprocessedSource, filePath)
    typeErrors = checker.check(ast)
  }

  // Lowering to IR
  const lowering = new Lowering(namespace)
  const ir = lowering.lower(ast)

  // Optimization
  const optimizationStats = createEmptyOptimizationStats()
  const optimizedFunctions = shouldOptimize
    ? ir.functions.map(fn => {
      const optimized = optimizeWithStats(fn)
      mergeOptimizationStats(optimizationStats, optimized.stats)
      return optimized.fn
    })
    : ir.functions
  const optimizedIR: IRModule = { ...ir, functions: optimizedFunctions }

  // Code generation
  const generated = generateDatapackWithStats(optimizedIR)
  mergeOptimizationStats(optimizationStats, generated.stats)

  return { files: generated.files, ast, ir: optimizedIR, typeErrors, warnings: lowering.warnings, stats: optimizationStats }
}

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

// Re-export types and classes for advanced usage
export { Lexer } from './lexer'
export { Parser } from './parser'
export { TypeChecker } from './typechecker'
export { Lowering } from './lowering'
export { optimize } from './optimizer/passes'
export { generateDatapack } from './codegen/mcfunction'
export { MCCommandValidator } from './mc-validator'
export type { DatapackFile } from './codegen/mcfunction'
export type { IRModule, IRFunction } from './ir/types'
export type { Program, FnDecl, Expr, Stmt } from './ast/types'
export type { DiagnosticError } from './diagnostics'
