/**
 * Top-level compile function for the v2 pipeline.
 *
 * Pipeline: source → Lexer → Parser → TypeCheck → HIR → MIR → optimize → LIR → emit
 */

import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { preprocessSourceWithMetadata } from '../compile'
import { DiagnosticError, parseErrorMessage } from '../diagnostics'
import { lowerToHIR } from '../hir/lower'
import { monomorphize } from '../hir/monomorphize'
import { lowerToMIR } from '../mir/lower'
import { optimizeModule } from '../optimizer/pipeline'
import { lowerToLIR } from '../lir/lower'
import { lirOptimizeModule } from '../optimizer/lir/pipeline'
import { emit, type DatapackFile } from './index'
import { coroutineTransform, type CoroutineInfo } from '../optimizer/coroutine'
import { analyzeBudget } from '../lir/budget'
import { McVersion, DEFAULT_MC_VERSION } from '../types/mc-version'
import { TypeChecker } from '../typechecker'

export interface CompileOptions {
  namespace?: string
  filePath?: string
  /** v1 compat: inline library sources (treated as `module library;` imports) */
  librarySources?: string[]
  /** When true, generate .sourcemap.json files alongside .mcfunction output */
  generateSourceMap?: boolean
  /** Target Minecraft version (default: 1.21). Affects which MC features are used. */
  mcVersion?: McVersion
  /**
   * When true, type errors are reported as warnings instead of blocking compilation.
   * Use for gradual migration or testing with existing codebases that have type errors.
   */
  lenient?: boolean
  /** Extra directories to search when resolving imports (in addition to relative and stdlib). */
  includeDirs?: string[]
}

export interface CompileResult {
  files: DatapackFile[]
  warnings: string[]
  /** Always true — v1 compat shim (compile() throws on error) */
  readonly success: true
}

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const { namespace = 'redscript', filePath, generateSourceMap = false, mcVersion = DEFAULT_MC_VERSION, lenient = false, includeDirs } = options
  const warnings: string[] = []

  // Preprocess: resolve import directives, merge imported sources
  const preprocessed = preprocessSourceWithMetadata(source, { filePath, includeDirs })
  const processedSource = preprocessed.source

  // Stage 1: Lex + Parse → AST
  const lexer = new Lexer(processedSource)
  const tokens = lexer.tokenize()
  const parser = new Parser(tokens, processedSource, filePath)
  const ast = parser.parse(namespace)

  // Merge library imports (files with `module library;`) into AST
  for (const li of preprocessed.libraryImports ?? []) {
    const libPreprocessed = preprocessSourceWithMetadata(li.source, { filePath: li.filePath })
    const libTokens = new Lexer(libPreprocessed.source, li.filePath).tokenize()
    const libAst = new Parser(libTokens, libPreprocessed.source, li.filePath).parse(namespace)
    for (const fn of libAst.declarations) fn.isLibraryFn = true
    ast.declarations.push(...libAst.declarations)
    ast.structs.push(...libAst.structs)
    ast.implBlocks.push(...libAst.implBlocks)
    ast.enums.push(...libAst.enums)
    ast.consts.push(...libAst.consts)
    ast.globals.push(...libAst.globals)
  }

  // Merge librarySources (v1 compat: inline library strings) before HIR
  if (options.librarySources) {
    for (const libSrc of options.librarySources) {
      const libTokens = new Lexer(libSrc).tokenize()
      const libAst = new Parser(libTokens, libSrc).parse(namespace)
      for (const fn of libAst.declarations) fn.isLibraryFn = true
      ast.declarations.push(...libAst.declarations)
      ast.structs.push(...libAst.structs)
      ast.implBlocks.push(...libAst.implBlocks)
      ast.enums.push(...libAst.enums)
      ast.consts.push(...libAst.consts)
      ast.globals.push(...libAst.globals)
    }
  }

  // Stage 1b: Type checking
  // Run TypeChecker on the merged AST. In error-mode (default), throw on first type error.
  // In lenient mode, demote type errors to warnings.
  {
    const checker = new TypeChecker(processedSource, filePath)
    const typeErrors = checker.check(ast)
    if (typeErrors.length > 0) {
      if (lenient) {
        for (const e of typeErrors) {
          warnings.push(`[TypeError] line ${e.location.line}, col ${e.location.col}: ${e.message}`)
        }
      } else {
        throw typeErrors[0]
      }
    }
  }

  // Stage 2–7: lower, optimize, emit
  // Wrap non-DiagnosticError from later stages so CLI always gets structured errors.
  try {
    // Stage 2: AST → HIR
    const hirRaw = lowerToHIR(ast)

    // Stage 2b: Monomorphize generic functions
    const hir = monomorphize(hirRaw)

    // Extract @tick, @load, @coroutine, and @schedule functions from HIR (before decorator info is lost)
    const tickFunctions: string[] = []
    const loadFunctions: string[] = []
    const coroutineInfos: CoroutineInfo[] = []
    const scheduleFunctions: Array<{ name: string; ticks: number }> = []
    for (const fn of hir.functions) {
      for (const dec of fn.decorators) {
        if (dec.name === 'tick') tickFunctions.push(fn.name)
        if (dec.name === 'load') loadFunctions.push(fn.name)
        if (dec.name === 'coroutine') {
          coroutineInfos.push({
            fnName: fn.name,
            batch: dec.args?.batch ?? 10,
            onDone: dec.args?.onDone,
          })
        }
        if (dec.name === 'schedule') {
          scheduleFunctions.push({ name: fn.name, ticks: dec.args?.ticks ?? 1 })
        }
      }
    }

    // Stage 3: HIR → MIR
    const mir = lowerToMIR(hir, filePath)

    // Stage 4: MIR optimization
    const mirOpt = optimizeModule(mir)

    // Stage 4b: Coroutine transform (opt-in, only for @coroutine functions)
    const coroResult = coroutineTransform(mirOpt, coroutineInfos)
    const mirFinal = coroResult.module
    tickFunctions.push(...coroResult.generatedTickFunctions)
    warnings.push(...coroResult.warnings)

    // Stage 5: MIR → LIR
    const lir = lowerToLIR(mirFinal)

    // Stage 6: LIR optimization
    const lirOpt = lirOptimizeModule(lir)

    // Static tick budget analysis
    const coroutineNames = new Set(coroutineInfos.map(c => c.fnName))
    const budgetDiags = analyzeBudget(lirOpt, coroutineNames)
    for (const diag of budgetDiags) {
      if (diag.level === 'error') {
        throw new DiagnosticError(
          'LoweringError',
          diag.message,
          { line: 1, col: 1, file: filePath },
        )
      }
      warnings.push(diag.message)
    }

    // Stage 6.5: Validate LIR score_set values are in MC int32 range
    const INT32_MAX = 2147483647
    const INT32_MIN = -2147483648
    for (const fn of lirOpt.functions) {
      for (const instr of fn.instructions) {
        if (instr.kind === 'score_set' && (instr.value > INT32_MAX || instr.value < INT32_MIN)) {
          warnings.push(
            `[ConstantOverflow] function '${fn.name}': ` +
            `scoreboard immediate ${instr.value} is outside MC int32 range [${INT32_MIN}, ${INT32_MAX}]. ` +
            `This indicates a constant-folding overflow bug — please report this.`
          )
        }
      }
    }

    // Stage 7: LIR → .mcfunction
    const files = emit(lirOpt, { namespace, tickFunctions, loadFunctions, scheduleFunctions, generateSourceMap, mcVersion })

    return { files, warnings, success: true as const }
  } catch (err) {
    if (err instanceof DiagnosticError) throw err
    const sourceLines = processedSource.split('\n')
    throw parseErrorMessage('LoweringError', (err as Error).message, sourceLines, filePath)
  }
}
