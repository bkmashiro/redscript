/**
 * Phase 5b — Multi-Module Compilation
 *
 * Compiles multiple .mcrs files that use `module <name>;` / `import <mod>::<sym>;`
 * into a single datapack with namespace-isolated scoreboards and correct cross-module
 * function paths.
 *
 * Design:
 * - Each module gets its own scoreboard objective: `__${namespace}_${moduleName}`
 * - Cross-module function calls are emitted as `${namespace}:${moduleName}/${fnName}`
 * - DCE: exported-but-never-imported functions are stripped from the output
 * - Circular imports are detected and rejected
 */

import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { DiagnosticError } from '../diagnostics'
import { lowerToHIR } from '../hir/lower'
import { monomorphize } from '../hir/monomorphize'
import { lowerFunctionValues } from '../hir/function-values'
import { lowerToMIR } from '../mir/lower'
import { optimizeModule } from '../optimizer/pipeline'
import { lowerToLIR } from '../lir/lower'
import type { LIRModule } from '../lir/types'
import { lirOptimizeModule, type LIROptimizeOptions } from '../optimizer/lir/pipeline'
import { emit, type DatapackFile } from './index'
import { qualifiedFunctionRef } from './paths'
import { coroutineTransform, type CoroutineInfo } from '../optimizer/coroutine'
import type { HIRModule, HIRFunction, HIRExpr, HIRStmt, HIRBlock } from '../hir/types'
import type { Program, FnDecl, Expr, Stmt, Block } from '../ast/types'
import { TypeChecker } from '../typechecker'
import { getTickRate, INVALID_TICK_RATE_MESSAGE } from '../typechecker/decorators'
import { buildCallABI, type CallABIRegistry } from '../compiler/call-abi'
import { visitScopedExpressions } from '../resolver/scoped-expressions'
import type { McVersion } from '../types/mc-version'

type ExportKind = 'function' | 'declaration'

interface ImportedSymbolInfo {
  kind: ExportKind
  sourceFn: FnDecl
}

function cloneAstValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => cloneAstValue(item)) as T
  if (value === null || typeof value !== 'object') return value

  const clone = Object.create(Object.getPrototypeOf(value)) as object
  for (const key of Reflect.ownKeys(value as object)) {
    const descriptor = Object.getOwnPropertyDescriptor(value as object, key)!
    if ('value' in descriptor) descriptor.value = cloneAstValue(descriptor.value)
    Object.defineProperty(clone, key, descriptor)
  }
  return clone as T
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ModuleInput {
  /** Module name (must match the `module <name>;` declaration in source, or be inferred) */
  name: string
  source: string
  filePath?: string
  /** Pre-parsed compatibility input. The compiler clones it before legacy rewrites. */
  program?: Program
  /** Explicit physical scoreboard objective selected by the target layout adapter. */
  objective?: string
}

export interface CompileModulesOptions {
  /** Datapack namespace (e.g. "mypack") */
  namespace?: string
  /** Experimental opt-in LIR local-copy/RMW rewrites. Defaults off. */
  experimentalLirLocalCopyRewrite?: boolean
  mcVersion?: McVersion
  /** Qualified backend entry functions that must not be considered removable library exports. */
  entryFunctions?: string[]
}

export interface CompileModulesLIROptions extends CompileModulesOptions {
  /** Internal target adapter hook: lower to LIR without constructing datapack artifacts. */
  emitArtifacts?: boolean
}

export interface CompileModulesResult {
  files: DatapackFile[]
  warnings: string[]
}

export interface CompileModulesLIRResult extends CompileModulesResult {
  /** Deeply frozen snapshot after the normal MIR/LIR optimization pipeline. */
  lirModules: readonly LIRModule[]
}

export function compileModules(
  modules: ModuleInput[],
  options: CompileModulesOptions = {},
): CompileModulesResult {
  const { files, warnings } = compileModulesWithLIR(modules, { ...options, emitArtifacts: true })
  return { files, warnings }
}

export function compileModulesWithLIR(
  modules: ModuleInput[],
  options: CompileModulesLIROptions = {},
): CompileModulesLIRResult {
  const namespace = options.namespace ?? 'redscript'
  const lirOptimizeOptions: LIROptimizeOptions = {
    experimentalLocalCopyRewrite: options.experimentalLirLocalCopyRewrite === true,
  }
  const warnings: string[] = []

  if (modules.length === 0) {
    throw new DiagnosticError('LoweringError', 'No modules provided', { line: 1, col: 1 })
  }

  // -------------------------------------------------------------------------
  // Step 1: Parse all modules
  // -------------------------------------------------------------------------

  const parsedModules = new Map<string, Program>() // moduleName → AST
  const parsedModuleSources = new Map<string, string>() // moduleName → original source

  for (const mod of modules) {
    let ast: Program
    if (mod.program) {
      ast = cloneAstValue(mod.program)
    } else {
      const lexer = new Lexer(mod.source, mod.filePath)
      const tokens = lexer.tokenize()
      const parser = new Parser(tokens, mod.source, mod.filePath)
      ast = parser.parse(namespace)
      if (parser.parseErrors.length > 0) throw parser.parseErrors[0]
    }

    // Verify declared module name matches provided name
    const declaredName = ast.moduleName
    if (declaredName && declaredName !== mod.name) {
      throw new DiagnosticError(
        'LoweringError',
        `Module declares name '${declaredName}' but was registered as '${mod.name}'`,
        { file: mod.filePath, line: 1, col: 1 },
      )
    }

    parsedModules.set(mod.name, ast)
    parsedModuleSources.set(mod.name, mod.source)
  }

  // -------------------------------------------------------------------------
  // Step 2: Build export tables and validate imports
  // -------------------------------------------------------------------------

  // moduleName → symbol → export metadata
  const exportTable = new Map<string, Map<string, ImportedSymbolInfo>>()
  // moduleName → exported executable function names (for DCE/bookkeeping)
  const executableExportTable = new Map<string, Set<string>>()
  for (const [modName, ast] of parsedModules) {
    const exports = new Map<string, ImportedSymbolInfo>()
    const executableExports = new Set<string>()

    for (const fn of ast.declarations) {
      if (fn.isExported) {
        exports.set(fn.name, { kind: 'function', sourceFn: fn })
        executableExports.add(fn.name)
      }
    }

    for (const fn of ast.declaredFunctions ?? []) {
      if (exports.has(fn.name)) continue
      exports.set(fn.name, { kind: 'declaration', sourceFn: fn })
    }
    exportTable.set(modName, exports)
    executableExportTable.set(modName, executableExports)
  }

  // -------------------------------------------------------------------------
  // Step 3: Circular import detection
  // -------------------------------------------------------------------------

  detectCircularImports(parsedModules)

  // -------------------------------------------------------------------------
  // Step 4: Build import resolution table per module
  // importMap: moduleName → { symbolName → qualifiedName (e.g. "math/sin") }
  // -------------------------------------------------------------------------

  const importMap = new Map<string, Map<string, string>>()
  // importer module → qualified symbol name → declaration-only signature clone
  const importedDeclarations = new Map<string, Map<string, FnDecl>>()

  for (const [modName, ast] of parsedModules) {
    const resolved = new Map<string, string>()

    const getDeclaredImportMap = (): Map<string, FnDecl> => {
      let decls = importedDeclarations.get(modName)
      if (!decls) {
        decls = new Map()
        importedDeclarations.set(modName, decls)
      }
      return decls
    }

    for (const imp of ast.imports) {
      const sourceExports = exportTable.get(imp.moduleName)
      if (!sourceExports) {
        throw new DiagnosticError(
          'LoweringError',
          `Module '${imp.moduleName}' not found (imported in '${modName}')`,
          { file: ast.namespace, line: 1, col: 1 },
        )
      }

      if (imp.symbol === undefined) {
        // Whole-module file import (`import player_utils;`) — not a symbol import;
        // this is resolved by the file-level compile() function, not compileModules.
        // Skip here to avoid treating it as a cross-module symbol reference.
        continue
      } else if (imp.symbol === '*') {
        // Wildcard: import all exports
        for (const [sym, info] of sourceExports) {
          const qualified = `${imp.moduleName}/${sym}`
          resolved.set(sym, qualified)
          getDeclaredImportMap().set(
            qualified,
            cloneDeclaredFunctionForModuleImport(info.sourceFn, qualified),
          )
        }
      } else {
        const sourceSymbol = sourceExports.get(imp.symbol)
        if (!sourceSymbol) {
          throw new DiagnosticError(
            'LoweringError',
            `Module '${imp.moduleName}' does not export '${imp.symbol}'`,
            { line: 1, col: 1 },
          )
        }
        const qualified = `${imp.moduleName}/${imp.symbol}`
        resolved.set(imp.symbol, qualified)
        getDeclaredImportMap().set(
          qualified,
          cloneDeclaredFunctionForModuleImport(sourceSymbol.sourceFn, qualified),
        )
      }
    }
    importMap.set(modName, resolved)
  }

  // -------------------------------------------------------------------------
  // Step 5: Compute which exported symbols are actually used (for cross-module DCE)
  // usedExports: moduleName → set of exported fn names that are imported somewhere
  // -------------------------------------------------------------------------

  const usedExports = new Map<string, Set<string>>()
  for (const modName of parsedModules.keys()) {
    usedExports.set(modName, new Set())
  }

  for (const ast of parsedModules.values()) {
    for (const imp of ast.imports) {
      if (imp.symbol === undefined) continue // whole-module file import, skip
      const used = usedExports.get(imp.moduleName)
      if (!used) continue
      if (imp.symbol === '*') {
        const exports = executableExportTable.get(imp.moduleName)
        if (exports) for (const s of exports) used.add(s)
      } else {
        used.add(imp.symbol)
      }
    }
  }

  // -------------------------------------------------------------------------
  // Step 6: Compile each module
  // -------------------------------------------------------------------------

  const allFiles: DatapackFile[] = []
  const lirModules: LIRModule[] = []
  // Track library-eligible file paths for cross-module DCE
  const libraryFilePaths = new Set<string>()
  let packMetaEmitted = false
  const prepared: Array<{ mod: ModuleInput; hir: HIRModule; objective: string; moduleName?: string; unusedExportedFns: Set<string> }> = []

  for (const mod of modules) {
    const ast = parsedModules.get(mod.name)!
    const symbolMap = importMap.get(mod.name) ?? new Map()
    const isNamed = !!ast.moduleName

    // Rewrite call sites in AST: imported symbol names → qualified names
    if (symbolMap.size > 0) {
      rewriteCallsInProgram(ast, symbolMap)
    }

    // Inject declaration-only signatures for imported symbols.
    // This keeps call sites typecheckable without emitting executable definitions.
    const declImports = importedDeclarations.get(mod.name)
    if (declImports) {
      if (!ast.declaredFunctions) ast.declaredFunctions = []

      const knownNames = new Set<string>()
      for (const fn of ast.declarations) knownNames.add(fn.name)
      for (const fn of ast.declaredFunctions) knownNames.add(fn.name)

      for (const decl of declImports.values()) {
        if (!knownNames.has(decl.name)) {
          ast.declaredFunctions.push(decl)
          knownNames.add(decl.name)
        }
      }
    }

    // For named modules: prefix all function definitions with `${moduleName}/`
    // so they emit to `${namespace}:${moduleName}/${fnName}.mcfunction`
    // Track which exported functions are not imported anywhere (for cross-module DCE)
    const unusedExportedFns = new Set<string>()
    const entryFunctions = new Set(options.entryFunctions ?? [])
    if (isNamed) {
      const used = usedExports.get(mod.name) ?? new Set()
      const localSymbols = new Map(
        ast.declarations.map(fn => [fn.name, `${mod.name}/${fn.name}`]),
      )
      rewriteCallsInProgram(ast, localSymbols)
      for (const fn of ast.declarations) {
        const baseName = fn.name
        // Prefix function name
        fn.name = `${mod.name}/${fn.name}`

        // Functions not imported by anyone are library-eligible (DCE)
        if (fn.isExported && !used.has(baseName) && !entryFunctions.has(fn.name)) {
          unusedExportedFns.add(fn.name)
        }
      }
    }

    // Determine scoreboard objective
    // Named module: `__${namespace}_${moduleName}`, anonymous: `__${namespace}`
    const objective = mod.objective ?? (isNamed ? `__${namespace}_${mod.name}` : `__${namespace}`)

    // Resolve and typecheck every unit before constructing call conventions.
    const modSource = parsedModuleSources.get(mod.name) ?? mod.filePath ?? ''
    const checker = new TypeChecker(modSource, mod.filePath)
    const errors = checker.check(ast)
    warnings.push(...checker.getWarnings())
    if (errors.length > 0) throw errors[0]
    const hir = monomorphize(lowerToHIR(ast))
    prepared.push({ mod, hir, objective, moduleName: isNamed ? mod.name : undefined, unusedExportedFns })
  }

  const callableUnits = lowerFunctionValues(prepared.map(unit => ({ hir: unit.hir, prefix: unit.moduleName ?? '' })))
  for (let index = 0; index < prepared.length; index++) prepared[index].hir = callableUnits[index]
  const callABI = buildCallABI(prepared)
  for (const { mod, hir, objective, moduleName, unusedExportedFns } of prepared) {
    const modFiles = compileSingleModule(
      hir,
      namespace,
      objective,
      moduleName,
      mod.filePath,
      lirOptimizeOptions,
      options.mcVersion,
      options.emitArtifacts !== false,
      callABI,
    )
    warnings.push(...modFiles.warnings)
    lirModules.push(modFiles.lirModule)

    // Record library-eligible file paths (only if there are multiple modules — single module = library author)
    if (modules.length > 1) {
      for (const fnName of unusedExportedFns) {
        // fnName is like "math/unused" → file path "data/<ns>/function/math/unused.mcfunction"
        libraryFilePaths.add(`data/${namespace}/function/${fnName}.mcfunction`)
      }
    }

    // Merge files, emitting pack.mcmeta only once
    for (const file of modFiles.files) {
      if (file.path === 'pack.mcmeta') {
        if (!packMetaEmitted) {
          allFiles.push(file)
          packMetaEmitted = true
        }
        continue
      }
      // Merge all function tags contributed by independent package modules.
      if (/^data\/[^/]+\/tags\/function\/.+\.json$/.test(file.path)) {
        mergeTagFile(allFiles, file)
        continue
      }
      allFiles.push(file)
    }
  }

  // -------------------------------------------------------------------------
  // Step 7: Cross-module DCE — remove unreachable library-eligible functions
  // -------------------------------------------------------------------------
  const finalFiles = crossModuleDCE(allFiles, libraryFilePaths, namespace)

  return {
    files: finalFiles,
    warnings,
    lirModules: deepFreeze(lirModules),
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value
  for (const key of Reflect.ownKeys(value as object)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key])
  }
  return Object.freeze(value)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scopeNamedLIRFunctions(lir: LIRModule, moduleName: string, namespace: string): void {
  const qualifiedRefs = new Map<string, string>()
  const rawRefs = new Map<string, string>()

  for (const fn of lir.functions) {
    if (fn.name.startsWith(`${moduleName}/`)) continue
    const originalName = fn.name
    const scopedName = `${moduleName}/${originalName}`
    qualifiedRefs.set(
      qualifiedFunctionRef(originalName, namespace),
      qualifiedFunctionRef(scopedName, namespace),
    )
    rawRefs.set(originalName, scopedName)
    fn.name = scopedName
  }

  if (qualifiedRefs.size === 0) return
  const rewriteInstruction = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(rewriteInstruction); return }
    if (!value || typeof value !== 'object') return
    const instr = value as Record<string, unknown>
    if (typeof instr.fn === 'string') instr.fn = qualifiedRefs.get(instr.fn) ?? rawRefs.get(instr.fn) ?? instr.fn
    if (typeof instr.cmd === 'string') {
      for (const [original, scoped] of qualifiedRefs) instr.cmd = (instr.cmd as string).split(original).join(scoped)
    }
    for (const child of Object.values(instr)) {
      if (child && typeof child === 'object') rewriteInstruction(child)
    }
  }
  for (const fn of lir.functions) rewriteInstruction(fn.instructions)
}

interface SingleModuleResult {
  files: DatapackFile[]
  warnings: string[]
  lirModule: LIRModule
}

/**
 * File-level cross-module DCE.
 *
 * After all module files are emitted, prune .mcfunction files that:
 * 1. Correspond to exported-but-unimported functions (tracked in `libraryPaths`)
 * 2. Are not reachable (directly or transitively) from any non-library entry file
 *
 * The reachability is computed by scanning `function <ns>:<path>` calls in
 * every .mcfunction file.
 */
function crossModuleDCE(
  files: DatapackFile[],
  libraryPaths: Set<string>,  // file paths (e.g. "data/ns/function/math/unused.mcfunction")
  namespace: string,
): DatapackFile[] {
  if (libraryPaths.size === 0) return files

  // Build a map: fnPath (e.g. "ns:math/add") → file path
  const fnPathToFilePath = new Map<string, string>()
  for (const file of files) {
    const m = file.path.match(/^data\/([^/]+)\/function\/(.+)\.mcfunction$/)
    if (m) {
      fnPathToFilePath.set(`${m[1]}:${m[2]}`, file.path)
    }
  }

  // Build call graph: filePath → set of called fnPaths (namespace:path)
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

  // BFS from non-library entry files
  const reachableFiles = new Set<string>()
  const queue: string[] = []
  for (const file of files) {
    if (!file.path.endsWith('.mcfunction')) continue
    if (!libraryPaths.has(file.path)) {
      // Non-library file: it's an entry point
      queue.push(file.path)
      reachableFiles.add(file.path)
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    const called = callGraph.get(current) ?? new Set()
    for (const fnPath of called) {
      const filePath = fnPathToFilePath.get(fnPath)
      if (filePath && !reachableFiles.has(filePath)) {
        reachableFiles.add(filePath)
        queue.push(filePath)
      }
    }
  }

  // Filter out unreachable library files
  return files.filter(file => {
    if (!libraryPaths.has(file.path)) return true // non-library: always keep
    return reachableFiles.has(file.path) // library: keep only if reachable
  })
}

function compileSingleModule(
  hir: HIRModule,
  namespace: string,
  objective: string,
  moduleName: string | undefined,
  filePath: string | undefined,
  lirOptimizeOptions: LIROptimizeOptions,
  mcVersion: McVersion | undefined,
  emitArtifacts: boolean,
  callABI: CallABIRegistry,
): SingleModuleResult {
  const warnings: string[] = []

  try {

    // Extract decorator metadata
    const tickFunctions: string[] = []
    const tickRateFunctions: Array<{ name: string; rate: number }> = []
    const loadFunctions: string[] = []
    const watchFunctions: Array<{ name: string; objective: string }> = []
    const coroutineInfos: CoroutineInfo[] = []
    const scheduleFunctions: Array<{ name: string; ticks: number }> = []
    const functionTags = new Map<string, string[]>()
    for (const fn of hir.functions) {
      for (const dec of fn.decorators) {
        if (dec.name === 'tick') {
          const rate = getTickRate(dec)
          if (rate === undefined) throw new DiagnosticError('TypeError', INVALID_TICK_RATE_MESSAGE, fn.span ?? { line: 1, col: 1 })
          tickFunctions.push(fn.name)
          if (rate > 1) tickRateFunctions.push({ name: fn.name, rate })
        }
        if (dec.name === 'load') loadFunctions.push(fn.name)
        if (dec.name === 'require_on_load') {
          for (const argument of dec.rawArgs ?? []) {
            if (argument.kind === 'string' && !loadFunctions.includes(argument.value)) loadFunctions.push(argument.value)
          }
        }
        if (dec.name === 'watch' && dec.args?.objective) {
          watchFunctions.push({ name: fn.name, objective: dec.args.objective })
        }
        if (dec.name === 'coroutine') {
          coroutineInfos.push({ fnName: fn.name, batch: dec.args?.batch ?? 10, onDone: dec.args?.onDone })
        }
        if (dec.name === 'schedule') {
          scheduleFunctions.push({ name: fn.name, ticks: dec.args?.ticks ?? 1 })
        }
        if (dec.name === 'function_tag' && dec.args?.functionTag) {
          const tagId = dec.args.functionTag
          const handlers = functionTags.get(tagId) ?? []
          handlers.push(`${namespace}:${fn.name}`)
          functionTags.set(tagId, handlers)
        }
      }
    }

    // Patch the MIR module objective (lowerToMIR computes `__${namespace}` by default)
    const mir = lowerToMIR(hir, filePath, callABI)
    mir.objective = objective
    const safeHints = new Set(['inline', 'no-inline', 'deprecated'])
    const runtimeBoundaries = new Set(hir.functions.filter(fn =>
      fn.decorators.some(decorator => !safeHints.has(decorator.name))).map(fn => fn.name))
    mir.specializationBarriers = runtimeBoundaries
    mir.noInlineFunctions = new Set([...runtimeBoundaries, ...hir.functions.filter(fn =>
      fn.decorators.some(decorator => decorator.name === 'no-inline')).map(fn => fn.name)])
    mir.inlineFunctions = new Set(hir.functions.filter(fn => !runtimeBoundaries.has(fn.name) &&
      fn.decorators.some(decorator => decorator.name === 'inline')).map(fn => fn.name))

    const mirOpt = optimizeModule(mir)
    const coroResult = coroutineTransform(mirOpt, coroutineInfos)
    const mirFinal = coroResult.module
    tickFunctions.push(...coroResult.generatedTickFunctions)

    const lir = lowerToLIR(mirFinal, { callABI })
    if (moduleName) scopeNamedLIRFunctions(lir, moduleName, namespace)
    lir.objective = objective
    const lirOpt = lirOptimizeModule(lir, lirOptimizeOptions)

    const files = emitArtifacts
      ? emit(lirOpt, {
          namespace,
          tickFunctions,
          tickRateFunctions,
          loadFunctions,
          watchFunctions,
          scheduleFunctions,
          functionTags,
          mcVersion,
        })
      : []

    // For named modules: rename the load.mcfunction to avoid path collision.
    // Rename `data/${ns}/function/load.mcfunction` → `data/${ns}/function/${modName}/_load.mcfunction`
    // and update the load tag reference accordingly.
    if (moduleName && emitArtifacts) {
      const loadPath = `data/${namespace}/function/load.mcfunction`
      const newLoadPath = `data/${namespace}/function/${moduleName}/_load.mcfunction`
      const loadTagPath = 'data/minecraft/tags/function/load.json'

      for (const file of files) {
        if (file.path === loadPath) {
          file.path = newLoadPath
        } else if (file.path === loadTagPath) {
          let tag: { values: string[] }
          try {
            tag = JSON.parse(file.content) as { values: string[] }
          } catch (err) {
            throw new Error(`Failed to parse tag file at ${file.path}: ${(err as Error).message}`)
          }
          tag.values = tag.values.map(v =>
            v === `${namespace}:load` ? `${namespace}:${moduleName}/_load` : v
          )
          file.content = JSON.stringify(tag, null, 2) + '\n'
        }
      }
    }

    return { files, warnings, lirModule: lirOpt }
  } catch (err) {
    if (err instanceof DiagnosticError) throw err
    throw err
  }
}

/** Merge one generated function-tag file into the aggregate datapack. */
function mergeTagFile(files: DatapackFile[], newFile: DatapackFile): void {
  const existing = files.find(f => f.path === newFile.path)
  if (!existing) {
    files.push(newFile)
    return
  }
  let existingJson: { values: string[] }
  let newJson: { values: string[] }
  try {
    existingJson = JSON.parse(existing.content) as { values: string[] }
  } catch (err) {
    throw new Error(`Failed to parse tag file at ${existing.path}: ${(err as Error).message}`)
  }
  try {
    newJson = JSON.parse(newFile.content) as { values: string[] }
  } catch (err) {
    throw new Error(`Failed to parse tag file at ${newFile.path}: ${(err as Error).message}`)
  }
  existingJson.values.push(...newJson.values)
  existing.content = JSON.stringify(existingJson, null, 2) + '\n'
}

/** Detect circular imports using DFS. Throws if a cycle is found. */
function detectCircularImports(parsedModules: Map<string, Program>): void {
  const visited = new Set<string>()
  const inStack = new Set<string>()

  function dfs(modName: string, stack: string[]): void {
    if (inStack.has(modName)) {
      const cycle = [...stack.slice(stack.indexOf(modName)), modName]
      throw new DiagnosticError(
        'LoweringError',
        `Circular import detected: ${cycle.join(' → ')}`,
        { line: 1, col: 1 },
      )
    }
    if (visited.has(modName)) return
    visited.add(modName)
    inStack.add(modName)
    const ast = parsedModules.get(modName)
    if (ast) {
      for (const imp of ast.imports) {
        dfs(imp.moduleName, [...stack, modName])
      }
    }
    inStack.delete(modName)
  }

  for (const modName of parsedModules.keys()) {
    dfs(modName, [])
  }
}

// ---------------------------------------------------------------------------
// AST rewriting: remap imported symbol calls to qualified names
// ---------------------------------------------------------------------------

/** Rewrite call expressions in the program AST.
 *  symbolMap: localName → qualifiedName (e.g. "sin" → "math/sin") */
function rewriteCallsInProgram(program: Program, symbolMap: Map<string, string>): void {
  for (const fn of [...program.declarations, ...program.implBlocks.flatMap(block => block.methods)]) {
    for (const decorator of fn.decorators) {
      if (decorator.name === 'require_on_load') {
        for (const argument of decorator.rawArgs ?? []) {
          if (argument.kind === 'string' && symbolMap.has(argument.value)) argument.value = symbolMap.get(argument.value)!
        }
      }
      if (decorator.name === 'coroutine' && decorator.args?.onDone && symbolMap.has(decorator.args.onDone)) {
        decorator.args = { ...decorator.args, onDone: symbolMap.get(decorator.args.onDone)! }
      }
    }
  }
  const values = new Set([...program.globals, ...program.consts].map(value => value.name))
  visitScopedExpressions(program, (expression, scope) => {
    if (expression.kind === 'call' && !expression.methodName && !scope.has(expression.fn)) {
      expression.fn = symbolMap.get(expression.fn) ?? expression.fn
    } else if (expression.kind === 'ident' && !scope.has(expression.name)) {
      expression.name = symbolMap.get(expression.name) ?? expression.name
    } else if (expression.kind === 'static_call') {
      const callee = symbolMap.get(`${expression.type}::${expression.method}`)
      if (callee) {
        Object.assign(expression, { kind: 'call', fn: callee })
        delete (expression as unknown as Record<string, unknown>).type
        delete (expression as unknown as Record<string, unknown>).method
      }
    }
  }, values)
}

function cloneDeclaredFunctionForModuleImport(fn: FnDecl, qualifiedName: string): FnDecl {
  return {
    ...fn,
    name: qualifiedName,
    isDeclareOnly: true,
    decorators: [...fn.decorators],
    params: [...fn.params],
    body: [...fn.body],
  }
}
