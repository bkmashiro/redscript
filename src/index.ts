/**
 * RedScript Compiler
 * 
 * Main entry point for programmatic usage.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
export const version = '1.2.11'

import { Lexer } from './lexer'
import { Parser } from './parser'
import { TypeChecker } from './typechecker'
import { Lowering, setScoreboardObjective } from './lowering'
import type { Warning } from './lowering'
import {
  constantFoldingWithStats,
  copyPropagation,
  deadCodeEliminationWithStats,
} from './optimizer/passes'
import { eliminateDeadCode } from './optimizer/dce'
import {
  countMcfunctionCommands,
  generateDatapackWithStats,
  DatapackFile,
} from './codegen/mcfunction'
import { preprocessSource, preprocessSourceWithMetadata } from './compile'
import type { IRModule } from './ir/types'
import type { Program } from './ast/types'
import type { DiagnosticError } from './diagnostics'
import { createEmptyOptimizationStats, type OptimizationStats } from './optimizer/commands'

export interface CompileOptions {
  namespace?: string
  optimize?: boolean
  typeCheck?: boolean
  filePath?: string
  dce?: boolean
  mangle?: boolean
  /** Scoreboard objective used for all variable slots.
   *  Defaults to '__<namespace>' (e.g. '__mathshow') to avoid collisions when
   *  multiple RedScript datapacks are loaded simultaneously, without occupying
   *  the user's own namespace. Override only if you need a specific name. */
  scoreboardObjective?: string
}

export interface CompileResult {
  files: DatapackFile[]
  advancements: DatapackFile[]
  ast: Program
  ir: IRModule
  typeErrors?: DiagnosticError[]
  warnings?: Warning[]
  stats?: OptimizationStats
  sourceMap?: Record<string, string>
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
  const shouldRunDce = options.dce ?? shouldOptimize
  const mangle = options.mangle ?? false
  const filePath = options.filePath
  const preprocessed = preprocessSourceWithMetadata(source, { filePath })
  const preprocessedSource = preprocessed.source

  // Lexing
  const tokens = new Lexer(preprocessedSource, filePath).tokenize()

  // Parsing — user source
  const parsedAst = new Parser(tokens, preprocessedSource, filePath).parse(namespace)

  // Library imports: files that declared `module library;` are parsed independently
  // (fresh Parser per file) so their functions are DCE-eligible but never bleed into user code.
  const allLibrarySources: Array<{ src: string; fp?: string }> = []
  for (const li of preprocessed.libraryImports ?? []) {
    allLibrarySources.push({ src: li.source, fp: li.filePath })
  }
  for (const { src, fp } of allLibrarySources) {
    const libPreprocessed = preprocessSourceWithMetadata(src, fp ? { filePath: fp } : {})
    const libTokens = new Lexer(libPreprocessed.source, fp).tokenize()
    const libAst = new Parser(libTokens, libPreprocessed.source, fp).parse(namespace)
    for (const fn of libAst.declarations) fn.isLibraryFn = true
    parsedAst.declarations.push(...libAst.declarations)
    parsedAst.structs.push(...libAst.structs)
    parsedAst.implBlocks.push(...libAst.implBlocks)
    parsedAst.enums.push(...libAst.enums)
    parsedAst.consts.push(...libAst.consts)
    parsedAst.globals.push(...libAst.globals)
  }

  const dceResult = shouldRunDce ? eliminateDeadCode(parsedAst, preprocessed.ranges) : { program: parsedAst, warnings: [] }
  const ast = dceResult.program

  // Type checking (warn mode - collect errors but don't block)
  let typeErrors: DiagnosticError[] | undefined
  if (shouldTypeCheck) {
    const checker = new TypeChecker(preprocessedSource, filePath)
    typeErrors = checker.check(ast)
  }

  // Configure scoreboard objective for this compilation.
  // Default: use the datapack namespace so each datapack gets its own objective
  // automatically, preventing variable collisions when multiple datapacks coexist.
  const scoreboardObj = options.scoreboardObjective ?? `__${namespace}`
  setScoreboardObjective(scoreboardObj)

  // Lowering to IR
  const lowering = new Lowering(namespace, preprocessed.ranges)
  const ir = lowering.lower(ast)

  let optimizedIR: IRModule = ir
  let generated = generateDatapackWithStats(ir, { optimizeCommands: shouldOptimize, mangle, scoreboardObjective: scoreboardObj })
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

    const baselineGenerated = generateDatapackWithStats(ir, { optimizeCommands: false, mangle, scoreboardObjective: scoreboardObj })
    const beforeDceGenerated = generateDatapackWithStats(copyPropagatedIR, { optimizeCommands: false, mangle, scoreboardObjective: scoreboardObj })
    const afterDceGenerated = generateDatapackWithStats(optimizedIR, { optimizeCommands: false, mangle, scoreboardObjective: scoreboardObj })
    generated = generateDatapackWithStats(optimizedIR, { optimizeCommands: true, mangle, scoreboardObjective: scoreboardObj })

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
    generated = generateDatapackWithStats(ir, { optimizeCommands: false, mangle, scoreboardObjective: scoreboardObj })
  }

  return {
    files: [...generated.files, ...generated.advancements],
    advancements: generated.advancements,
    ast,
    ir: optimizedIR,
    typeErrors,
    warnings: [...dceResult.warnings, ...lowering.warnings],
    stats: optimizationStats,
    sourceMap: generated.sourceMap,
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
