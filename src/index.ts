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
import {
  constantFoldingWithStats,
  copyPropagation,
  deadCodeEliminationWithStats,
} from './optimizer/passes'
import {
  countMcfunctionCommands,
  generateDatapackWithStats,
  DatapackFile,
} from './codegen/mcfunction'
import { preprocessSource } from './compile'
import type { IRModule } from './ir/types'
import type { Program } from './ast/types'
import type { DiagnosticError } from './diagnostics'
import { createEmptyOptimizationStats, type OptimizationStats } from './optimizer/commands'

export interface CompileOptions {
  namespace?: string
  optimize?: boolean
  typeCheck?: boolean
  filePath?: string
}

export interface CompileResult {
  files: DatapackFile[]
  advancements: DatapackFile[]
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

  let optimizedIR: IRModule = ir
  let generated = generateDatapackWithStats(ir, { optimizeCommands: shouldOptimize })
  let optimizationStats: OptimizationStats | undefined

  if (shouldOptimize) {
    const stats = createEmptyOptimizationStats()
    const copyPropagatedFunctions = []
    const deadCodeEliminatedFunctions = []

    for (const fn of ir.functions) {
      const folded = constantFoldingWithStats(fn)
      stats.constantFolds += folded.stats.constantFolds ?? 0

      const propagated = copyPropagation(folded.fn)
      copyPropagatedFunctions.push(propagated)

      const dce = deadCodeEliminationWithStats(propagated)
      deadCodeEliminatedFunctions.push(dce.fn)
    }

    const copyPropagatedIR: IRModule = { ...ir, functions: copyPropagatedFunctions }
    optimizedIR = { ...ir, functions: deadCodeEliminatedFunctions }

    const baselineGenerated = generateDatapackWithStats(ir, { optimizeCommands: false })
    const beforeDceGenerated = generateDatapackWithStats(copyPropagatedIR, { optimizeCommands: false })
    const afterDceGenerated = generateDatapackWithStats(optimizedIR, { optimizeCommands: false })
    generated = generateDatapackWithStats(optimizedIR, { optimizeCommands: true })

    stats.deadCodeRemoved =
      countMcfunctionCommands(beforeDceGenerated.files) - countMcfunctionCommands(afterDceGenerated.files)
    stats.licmHoists = generated.stats.licmHoists
    stats.licmLoopBodies = generated.stats.licmLoopBodies
    stats.cseRedundantReads = generated.stats.cseRedundantReads
    stats.cseArithmetic = generated.stats.cseArithmetic
    stats.setblockMergedCommands = generated.stats.setblockMergedCommands
    stats.setblockFillCommands = generated.stats.setblockFillCommands
    stats.setblockSavedCommands = generated.stats.setblockSavedCommands
    stats.totalCommandsBefore = countMcfunctionCommands(baselineGenerated.files)
    stats.totalCommandsAfter = countMcfunctionCommands(generated.files)
    optimizationStats = stats
  } else {
    optimizedIR = ir
    generated = generateDatapackWithStats(ir, { optimizeCommands: false })
  }

  return {
    files: [...generated.files, ...generated.advancements],
    advancements: generated.advancements,
    ast,
    ir: optimizedIR,
    typeErrors,
    warnings: lowering.warnings,
    stats: optimizationStats,
  }
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
export type { Program, FnDecl, Expr, Stmt, Span } from './ast/types'
export type { DiagnosticError } from './diagnostics'
