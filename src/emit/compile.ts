/**
 * Top-level compile function for the v2 pipeline.
 *
 * Pipeline: source → Lexer → Parser → TypeCheck → HIR → MIR → optimize → LIR → emit
 */

import * as fs from 'fs'
import * as path from 'path'
import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { preprocessSourceWithMetadata } from '../compile'
import { CheckFailedError, DiagnosticBundleError, DiagnosticError, parseErrorMessage } from '../diagnostics'
import { lowerToHIR } from '../hir/lower'
import { monomorphize } from '../hir/monomorphize'
import { checkDeprecatedCalls } from '../hir/deprecated'
import { lowerToMIR } from '../mir/lower'
import { optimizeModule } from '../optimizer/pipeline'
import { lowerToLIR } from '../lir/lower'
import { lirOptimizeModule } from '../optimizer/lir/pipeline'
import { emit, type DatapackFile } from './index'
import { coroutineTransform, type CoroutineInfo } from '../optimizer/coroutine'
import { analyzeBudget } from '../lir/budget'
import { McVersion, DEFAULT_MC_VERSION } from '../types/mc-version'
import { TypeChecker } from '../typechecker'
import { isEventTypeName } from '../events/types'

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
  /**
   * Compile-time configuration values injected via @config decorator.
   * Values provided here override the @config default values.
   * e.g. { max_players: 10, difficulty: 3 }
   */
  config?: Record<string, number>
  /** Internal: stop after parse + typecheck + HIR checks. */
  stopAfterCheck?: boolean
  /** When true, enable debug-only helpers such as @profile instrumentation. */
  debug?: boolean
}

export interface CompileResult {
  files: DatapackFile[]
  warnings: string[]
  /** Always true — v1 compat shim (compile() throws on error) */
  readonly success: true
}

function annotateFunctionSourceFiles(
  program: {
    declarations: Array<{ sourceFile?: string }>
    implBlocks: Array<{ methods: Array<{ sourceFile?: string }> }>
  },
  sourceFile?: string,
): void {
  if (!sourceFile) return
  for (const fn of program.declarations) fn.sourceFile = sourceFile
  for (const impl of program.implBlocks) {
    for (const method of impl.methods) method.sourceFile = sourceFile
  }
}

function pruneLibraryFunctionFiles(
  files: DatapackFile[],
  libraryPaths: Set<string>,
): DatapackFile[] {
  if (libraryPaths.size === 0) return files

  const fnPathToFilePath = new Map<string, string>()
  for (const file of files) {
    const match = file.path.match(/^data\/([^/]+)\/function\/(.+)\.mcfunction$/)
    if (match) {
      fnPathToFilePath.set(`${match[1]}:${match[2]}`, file.path)
    }
  }

  const callGraph = new Map<string, Set<string>>()
  const callPattern = /\bfunction\s+([\w\-]+:[\w\-./]+)/g
  for (const file of files) {
    if (!file.path.endsWith('.mcfunction')) continue
    const called = new Set<string>()
    let match: RegExpExecArray | null
    callPattern.lastIndex = 0
    while ((match = callPattern.exec(file.content)) !== null) {
      called.add(match[1])
    }
    callGraph.set(file.path, called)
  }

  const reachableFiles = new Set<string>()
  const queue: string[] = []
  for (const file of files) {
    if (!file.path.endsWith('.mcfunction')) continue
    if (libraryPaths.has(file.path)) continue
    queue.push(file.path)
    reachableFiles.add(file.path)
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    const called = callGraph.get(current) ?? new Set<string>()
    for (const fnPath of called) {
      const filePath = fnPathToFilePath.get(fnPath)
      if (filePath && !reachableFiles.has(filePath)) {
        reachableFiles.add(filePath)
        queue.push(filePath)
      }
    }
  }

  return files.filter(file => !libraryPaths.has(file.path) || reachableFiles.has(file.path))
}

export function compile(source: string, options: CompileOptions = {}): CompileResult {
  const {
    namespace = 'redscript',
    filePath,
    generateSourceMap = false,
    mcVersion = DEFAULT_MC_VERSION,
    lenient = false,
    includeDirs,
    stopAfterCheck = false,
    debug = false,
  } = options
  const warnings: string[] = []

  // Preprocess: resolve import directives, merge imported sources
  const preprocessed = preprocessSourceWithMetadata(source, { filePath, includeDirs })
  const processedSource = preprocessed.source

  try {
    // Stage 1: Lex + Parse → AST
    const lexer = new Lexer(processedSource)
    const tokens = lexer.tokenize()
    const parser = new Parser(tokens, processedSource, filePath)
    const ast = parser.parse(namespace)
    annotateFunctionSourceFiles(ast, filePath)
    warnings.push(...parser.warnings)
    if (parser.parseErrors.length > 0) {
      throw stopAfterCheck ? new DiagnosticBundleError(parser.parseErrors) : parser.parseErrors[0]
    }

    // Resolve whole-module file imports: `import player_utils;` (no `::` symbol)
    const seenModuleImports = new Set<string>()
    function resolveModuleFilePath(modName: string, fromFile?: string): string | null {
      const candidates = [`${modName}.mcrs`, modName]
      const stdlibDir = path.resolve(__dirname, '..', 'src', 'stdlib')
      for (const candidate of candidates) {
        if (fromFile) {
          const rel = path.resolve(path.dirname(fromFile), candidate)
          if (fs.existsSync(rel)) return rel
        }
        const stdlib = path.resolve(stdlibDir, candidate)
        if (fs.existsSync(stdlib)) return stdlib
        for (const dir of includeDirs ?? []) {
          const extra = path.resolve(dir, candidate)
          if (fs.existsSync(extra)) return extra
        }
      }
      return null
    }

    function mergeWholeModuleImport(modFilePath: string): void {
      if (seenModuleImports.has(modFilePath)) return
      seenModuleImports.add(modFilePath)
      const modSource = fs.readFileSync(modFilePath, 'utf-8')
      const modPreprocessed = preprocessSourceWithMetadata(modSource, { filePath: modFilePath, includeDirs })
      const modTokens = new Lexer(modPreprocessed.source, modFilePath).tokenize()
      const modParser = new Parser(modTokens, modPreprocessed.source, modFilePath)
      const modAst = modParser.parse(namespace)
      annotateFunctionSourceFiles(modAst, modFilePath)
      warnings.push(...modParser.warnings)
      if (modParser.parseErrors.length > 0) {
        throw stopAfterCheck ? new DiagnosticBundleError(modParser.parseErrors) : modParser.parseErrors[0]
      }
      for (const fn of modAst.declarations) fn.isLibraryFn = true
      for (const imp of modAst.imports) {
        if (imp.symbol !== undefined) continue
        const nestedPath = resolveModuleFilePath(imp.moduleName, modFilePath)
        if (!nestedPath) {
          warnings.push(`[ImportWarning] Module '${imp.moduleName}' not found (imported in ${modFilePath})`)
          continue
        }
        mergeWholeModuleImport(nestedPath)
      }
      ast.declarations.push(...modAst.declarations)
      ast.structs.push(...modAst.structs)
      ast.implBlocks.push(...modAst.implBlocks)
      ast.enums.push(...modAst.enums)
      ast.consts.push(...modAst.consts)
      ast.globals.push(...modAst.globals)
    }

    for (const imp of ast.imports) {
      if (imp.symbol !== undefined) continue
      const resolved = resolveModuleFilePath(imp.moduleName, filePath)
      if (!resolved) {
        throw new DiagnosticError(
          'ParseError',
          `Module '${imp.moduleName}' not found. Make sure '${imp.moduleName}.mcrs' exists relative to this file or in the stdlib.`,
          imp.span ?? { line: 1, col: 1 },
        )
      }
      mergeWholeModuleImport(resolved)
    }

    for (const li of preprocessed.libraryImports ?? []) {
      const libPreprocessed = preprocessSourceWithMetadata(li.source, { filePath: li.filePath })
      const libTokens = new Lexer(libPreprocessed.source, li.filePath).tokenize()
      const libParser = new Parser(libTokens, libPreprocessed.source, li.filePath)
      const libAst = libParser.parse(namespace)
      annotateFunctionSourceFiles(libAst, li.filePath)
      warnings.push(...libParser.warnings)
      if (libParser.parseErrors.length > 0) {
        throw stopAfterCheck ? new DiagnosticBundleError(libParser.parseErrors) : libParser.parseErrors[0]
      }
      for (const fn of libAst.declarations) fn.isLibraryFn = true
      ast.declarations.push(...libAst.declarations)
      ast.structs.push(...libAst.structs)
      ast.implBlocks.push(...libAst.implBlocks)
      ast.enums.push(...libAst.enums)
      ast.consts.push(...libAst.consts)
      ast.globals.push(...libAst.globals)
    }

    if (options.librarySources) {
      for (const libSrc of options.librarySources) {
        const libTokens = new Lexer(libSrc).tokenize()
        const libParser = new Parser(libTokens, libSrc)
        const libAst = libParser.parse(namespace)
        warnings.push(...libParser.warnings)
        if (libParser.parseErrors.length > 0) {
          throw stopAfterCheck ? new DiagnosticBundleError(libParser.parseErrors) : libParser.parseErrors[0]
        }
        for (const fn of libAst.declarations) fn.isLibraryFn = true
        ast.declarations.push(...libAst.declarations)
        ast.structs.push(...libAst.structs)
        ast.implBlocks.push(...libAst.implBlocks)
        ast.enums.push(...libAst.enums)
        ast.consts.push(...libAst.consts)
        ast.globals.push(...libAst.globals)
      }
    }

    {
      const configValues = options.config ?? {}
      const configGlobalNames = new Set<string>()
      for (const g of ast.globals) {
        if (g.configKey !== undefined) {
          const resolvedValue = Object.prototype.hasOwnProperty.call(configValues, g.configKey)
            ? configValues[g.configKey]
            : (g.configDefault ?? 0)
          const intValue = Math.round(resolvedValue)
          ast.consts.push({
            name: g.name,
            type: { kind: 'named', name: 'int' },
            value: { kind: 'int_lit', value: intValue },
            span: g.span,
          })
          configGlobalNames.add(g.name)
        }
      }
      if (configGlobalNames.size > 0) {
        ast.globals = ast.globals.filter(g => !configGlobalNames.has(g.name))
      }
    }

    {
      const checker = new TypeChecker(processedSource, filePath)
      const typeErrors = checker.check(ast)
      warnings.push(...checker.getWarnings())
      if (typeErrors.length > 0) {
        if (lenient) {
          for (const e of typeErrors) {
            warnings.push(`[TypeError] line ${e.location.line}, col ${e.location.col}: ${e.message}`)
          }
        } else {
          throw stopAfterCheck ? new DiagnosticBundleError(typeErrors) : typeErrors[0]
        }
      }
    }

    // Stage 2: AST → HIR
    const hirRaw = lowerToHIR(ast)

    // Stage 2b: Monomorphize generic functions
    const hir = monomorphize(hirRaw)

    const libraryFilePaths = new Set(
      hir.functions
        .filter(fn => fn.isLibraryFn && fn.decorators.length === 0)
        .map(fn => `data/${namespace}/function/${fn.name}.mcfunction`)
    )

    // Stage 2c: Deprecated usage check — emit warnings for calls to @deprecated functions
    warnings.push(...checkDeprecatedCalls(hir))

    if (stopAfterCheck) {
      return { files: [], warnings, success: true as const }
    }

    // Extract @tick, @load, @watch, @inline, @coroutine, @schedule, @on, and @memoize handlers from HIR (before decorator info is lost)
    const tickFunctions: string[] = []
    const loadFunctions: string[] = []
    const watchFunctions: Array<{ name: string; objective: string }> = []
    const inlineFunctions = new Set<string>()
    const coroutineInfos: CoroutineInfo[] = []
    const scheduleFunctions: Array<{ name: string; ticks: number }> = []
    const profiledFunctions: string[] = []
    const throttleFunctions: Array<{ name: string; ticks: number }> = []
    const retryFunctions: Array<{ name: string; max: number }> = []
    const memoizeFunctions: string[] = []
    const eventHandlers = new Map<string, string[]>()
    for (const fn of hir.functions) {
      if (fn.watchObjective) {
        watchFunctions.push({ name: fn.name, objective: fn.watchObjective })
      } else {
        // Fallback: extract from decorator if watchObjective not propagated
        const watchDec = fn.decorators?.find(d => d.name === 'watch' && d.args?.objective)
        if (watchDec?.args?.objective) {
          watchFunctions.push({ name: fn.name, objective: watchDec.args.objective })
        }
      }
      for (const dec of fn.decorators) {
        if (dec.name === 'tick') tickFunctions.push(fn.name)
        if (dec.name === 'load') loadFunctions.push(fn.name)
        if (dec.name === 'inline') inlineFunctions.add(fn.name)
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
        if (dec.name === 'profile') {
          profiledFunctions.push(fn.name)
        }
        if (dec.name === 'throttle' && dec.args?.ticks) {
          throttleFunctions.push({ name: fn.name, ticks: dec.args.ticks })
        }
        if (dec.name === 'retry' && dec.args?.max) {
          retryFunctions.push({ name: fn.name, max: dec.args.max })
        }
        if (dec.name === 'memoize') {
          memoizeFunctions.push(fn.name)
        }
        if (dec.name === 'on' && dec.args?.eventType) {
          const evType = dec.args.eventType as string
          if (isEventTypeName(evType)) {
            if (!eventHandlers.has(evType)) eventHandlers.set(evType, [])
            eventHandlers.get(evType)!.push(`${namespace}:${fn.name}`)
          }
        }
      }
    }

    // Stage 3: HIR → MIR
    const mir = lowerToMIR(hir, filePath)
    if (inlineFunctions.size > 0) {
      mir.inlineFunctions = inlineFunctions
    }

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

    // Stage 6.9: Inject synthetic LIR functions for @singleton structs
    // Each @singleton struct gets:
    //   - A "<StructName>_get" function that reads all fields from scoreboard
    //   - A "<StructName>_set" function that writes all fields back to scoreboard
    // Fields are stored in scoreboard objectives named "_sng_<StructName>_<fieldName>"
    // (max 16 chars for objective name — truncated with hash suffix if needed)
    const singletonObjectives: string[] = []
    for (const s of hir.structs) {
      if (!s.isSingleton) continue
      const structName = s.name
      const objective = lirOpt.objective  // the main ns objective for return values

      // Build _get function: reads each field from its own scoreboard objective
      // Return struct fields via __rf_<field> slots in the main objective
      const getInstrs: import('../lir/types').LIRInstr[] = []
      for (const field of s.fields) {
        const fieldObj = singletonObjectiveName(structName, field.name)
        if (!singletonObjectives.includes(fieldObj)) {
          singletonObjectives.push(fieldObj)
        }
        // copy: scoreboard players operation $__rf_<field> <obj> = __sng_<S>_<f> <fieldObj>
        getInstrs.push({
          kind: 'score_copy',
          dst: { player: `$__rf_${field.name}`, obj: objective },
          src: { player: `__sng`, obj: fieldObj },
        })
      }
      // Return value placeholder
      getInstrs.push({ kind: 'score_set', dst: { player: '$ret', obj: objective }, value: 0 })

      // Use `::` naming so it matches how static_call `GameState::get` is qualified
      // fnNameToPath converts `GameState::get` → `data/<ns>/function/gamestate/get.mcfunction`
      lirOpt.functions.push({
        name: `${structName}::get`,
        instructions: getInstrs,
        isMacro: false,
        macroParams: [],
      })

      // Build _set function: writes each field back to its scoreboard objective
      // Parameters come in via $p0..$pN slots (one per field)
      const setInstrs: import('../lir/types').LIRInstr[] = []
      for (let i = 0; i < s.fields.length; i++) {
        const field = s.fields[i]
        const fieldObj = singletonObjectiveName(structName, field.name)
        setInstrs.push({
          kind: 'score_copy',
          dst: { player: `__sng`, obj: fieldObj },
          src: { player: `$p${i}`, obj: objective },
        })
      }
      setInstrs.push({ kind: 'score_set', dst: { player: '$ret', obj: objective }, value: 0 })

      lirOpt.functions.push({
        name: `${structName}::set`,
        instructions: setInstrs,
        isMacro: false,
        macroParams: [],
      })
    }

    // Stage 6.95: Rename @memoize functions to <fn>_impl in LIR,
    // rewriting recursive self-calls so the wrapper becomes the public entry point.
    for (const fnName of memoizeFunctions) {
      const lirFn = lirOpt.functions.find(f => f.name === fnName)
      if (!lirFn) continue
      const implName = `${fnName}_impl`
      lirFn.name = implName
      // Rewrite recursive calls: any call to fnName inside this function → implName
      for (const instr of lirFn.instructions) {
        if ('fn' in instr && instr.fn === fnName) {
          ;(instr as { fn: string }).fn = implName
        }
      }
    }

    // Stage 7: LIR → .mcfunction
    const files = emit(lirOpt, {
      namespace,
      tickFunctions,
      loadFunctions,
      watchFunctions,
      scheduleFunctions,
      generateSourceMap,
      mcVersion,
      eventHandlers,
      singletonObjectives,
      profiledFunctions,
      enableProfiling: debug,
      throttleFunctions,
      retryFunctions,
      memoizeFunctions,
    })
    const prunedFiles = pruneLibraryFunctionFiles(files, libraryFilePaths)

    return { files: prunedFiles, warnings, success: true as const }
  } catch (err) {
    if (stopAfterCheck) {
      if (err instanceof CheckFailedError) throw err
      if (err instanceof DiagnosticBundleError) {
        throw new CheckFailedError(err.diagnostics, warnings)
      }
      if (err instanceof DiagnosticError) {
        throw new CheckFailedError([err], warnings)
      }
      const sourceLines = processedSource.split('\n')
      throw new CheckFailedError(
        [parseErrorMessage('LoweringError', (err as Error).message, sourceLines, filePath)],
        warnings,
      )
    }
    if (err instanceof DiagnosticError) throw err
    const sourceLines = processedSource.split('\n')
    throw parseErrorMessage('LoweringError', (err as Error).message, sourceLines, filePath)
  }
}

/**
 * Compute a scoreboard objective name for a @singleton struct field.
 * Format: _s_<struct>_<field>, truncated so total length ≤ 16 chars.
 * If struct+field combined (with _s_ and _) exceeds 16:
 *   use first 4 chars of struct, first 8 chars of field.
 */
function singletonObjectiveName(structName: string, fieldName: string): string {
  const overhead = 5 // "_s_" (3) + "_" (1) = 4, +1 for safety  -- actually "_s_" + "_" = 4
  // Budget: 16 - 4 = 12 chars for struct + field combined
  if (structName.length + fieldName.length <= 12) {
    return `_s_${structName}_${fieldName}`
  }
  return `_s_${structName.slice(0, 4)}_${fieldName.slice(0, 8)}`
}
