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
import { lowerToMIR } from '../mir/lower'
import { optimizeModule } from '../optimizer/pipeline'
import { lowerToLIR } from '../lir/lower'
import { lirOptimizeModule } from '../optimizer/lir/pipeline'
import { emit, type DatapackFile } from './index'
import { coroutineTransform, type CoroutineInfo } from '../optimizer/coroutine'
import type { HIRModule, HIRFunction, HIRExpr, HIRStmt, HIRBlock } from '../hir/types'
import type { Program, FnDecl, Expr, Stmt, Block } from '../ast/types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ModuleInput {
  /** Module name (must match the `module <name>;` declaration in source, or be inferred) */
  name: string
  source: string
  filePath?: string
}

export interface CompileModulesOptions {
  /** Datapack namespace (e.g. "mypack") */
  namespace?: string
}

export interface CompileModulesResult {
  files: DatapackFile[]
  warnings: string[]
}

export function compileModules(
  modules: ModuleInput[],
  options: CompileModulesOptions = {},
): CompileModulesResult {
  const namespace = options.namespace ?? 'redscript'
  const warnings: string[] = []

  if (modules.length === 0) {
    throw new DiagnosticError('LoweringError', 'No modules provided', { line: 1, col: 1 })
  }

  // -------------------------------------------------------------------------
  // Step 1: Parse all modules
  // -------------------------------------------------------------------------

  const parsedModules = new Map<string, Program>() // moduleName → AST

  for (const mod of modules) {
    const lexer = new Lexer(mod.source, mod.filePath)
    const tokens = lexer.tokenize()
    const parser = new Parser(tokens, mod.source, mod.filePath)
    const ast = parser.parse(namespace)
    if (parser.parseErrors.length > 0) {
      throw parser.parseErrors[0]
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
  }

  // -------------------------------------------------------------------------
  // Step 2: Build export tables and validate imports
  // -------------------------------------------------------------------------

  // moduleName → set of exported function names
  const exportTable = new Map<string, Set<string>>()
  for (const [modName, ast] of parsedModules) {
    const exports = new Set<string>()
    for (const fn of ast.declarations) {
      if (fn.isExported) exports.add(fn.name)
    }
    exportTable.set(modName, exports)
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

  for (const [modName, ast] of parsedModules) {
    const resolved = new Map<string, string>()
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
        for (const sym of sourceExports) {
          resolved.set(sym, `${imp.moduleName}/${sym}`)
        }
      } else {
        if (!sourceExports.has(imp.symbol)) {
          throw new DiagnosticError(
            'LoweringError',
            `Module '${imp.moduleName}' does not export '${imp.symbol}'`,
            { line: 1, col: 1 },
          )
        }
        resolved.set(imp.symbol, `${imp.moduleName}/${imp.symbol}`)
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
        const exports = exportTable.get(imp.moduleName)
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
  // Track library-eligible file paths for cross-module DCE
  const libraryFilePaths = new Set<string>()
  let packMetaEmitted = false

  for (const mod of modules) {
    const ast = parsedModules.get(mod.name)!
    const symbolMap = importMap.get(mod.name) ?? new Map()
    const isNamed = !!ast.moduleName

    // Rewrite call sites in AST: imported symbol names → qualified names
    if (symbolMap.size > 0) {
      rewriteCallsInProgram(ast, symbolMap)
    }

    // For named modules: prefix all function definitions with `${moduleName}/`
    // so they emit to `${namespace}:${moduleName}/${fnName}.mcfunction`
    // Track which exported functions are not imported anywhere (for cross-module DCE)
    const unusedExportedFns = new Set<string>()
    if (isNamed) {
      const used = usedExports.get(mod.name) ?? new Set()
      for (const fn of ast.declarations) {
        // Prefix function name
        fn.name = `${mod.name}/${fn.name}`

        // Functions not imported by anyone are library-eligible (DCE)
        const baseName = fn.name.split('/').pop()!
        if (fn.isExported && !used.has(baseName)) {
          unusedExportedFns.add(fn.name)
        }
      }
    }

    // Determine scoreboard objective
    // Named module: `__${namespace}_${moduleName}`, anonymous: `__${namespace}`
    const objective = isNamed ? `__${namespace}_${mod.name}` : `__${namespace}`

    // Run the pipeline
    const modFiles = compileSingleModule(ast, namespace, objective, isNamed ? mod.name : undefined, mod.filePath)
    warnings.push(...modFiles.warnings)

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
      // Merge load.json tag values
      if (file.path === 'data/minecraft/tags/function/load.json') {
        mergeTagFile(allFiles, file)
        continue
      }
      // Merge tick.json tag values
      if (file.path === 'data/minecraft/tags/function/tick.json') {
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

  return { files: finalFiles, warnings }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface SingleModuleResult {
  files: DatapackFile[]
  warnings: string[]
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
  ast: Program,
  namespace: string,
  objective: string,
  moduleName: string | undefined,
  filePath?: string,
): SingleModuleResult {
  const warnings: string[] = []

  try {
    const hirRaw = lowerToHIR(ast)
    const hir = monomorphize(hirRaw)



    // Extract decorator metadata
    const tickFunctions: string[] = []
    const loadFunctions: string[] = []
    const watchFunctions: Array<{ name: string; objective: string }> = []
    const coroutineInfos: CoroutineInfo[] = []
    const scheduleFunctions: Array<{ name: string; ticks: number }> = []
    for (const fn of hir.functions) {
      for (const dec of fn.decorators) {
        if (dec.name === 'tick') tickFunctions.push(fn.name)
        if (dec.name === 'load') loadFunctions.push(fn.name)
        if (dec.name === 'watch' && dec.args?.objective) {
          watchFunctions.push({ name: fn.name, objective: dec.args.objective })
        }
        if (dec.name === 'coroutine') {
          coroutineInfos.push({ fnName: fn.name, batch: dec.args?.batch ?? 10, onDone: dec.args?.onDone })
        }
        if (dec.name === 'schedule') {
          scheduleFunctions.push({ name: fn.name, ticks: dec.args?.ticks ?? 1 })
        }
      }
    }

    // Patch the MIR module objective (lowerToMIR computes `__${namespace}` by default)
    const mir = lowerToMIR(hir, filePath)
    mir.objective = objective

    const mirOpt = optimizeModule(mir)
    const coroResult = coroutineTransform(mirOpt, coroutineInfos)
    const mirFinal = coroResult.module
    tickFunctions.push(...coroResult.generatedTickFunctions)

    const lir = lowerToLIR(mirFinal)
    lir.objective = objective
    const lirOpt = lirOptimizeModule(lir)

    const files = emit(lirOpt, { namespace, tickFunctions, loadFunctions, watchFunctions, scheduleFunctions })

    // For named modules: rename the load.mcfunction to avoid path collision.
    // Rename `data/${ns}/function/load.mcfunction` → `data/${ns}/function/${modName}/_load.mcfunction`
    // and update the load tag reference accordingly.
    if (moduleName) {
      const loadPath = `data/${namespace}/function/load.mcfunction`
      const newLoadPath = `data/${namespace}/function/${moduleName}/_load.mcfunction`
      const loadTagPath = 'data/minecraft/tags/function/load.json'

      for (const file of files) {
        if (file.path === loadPath) {
          file.path = newLoadPath
        } else if (file.path === loadTagPath) {
          const tag = JSON.parse(file.content) as { values: string[] }
          tag.values = tag.values.map(v =>
            v === `${namespace}:load` ? `${namespace}:${moduleName}/_load` : v
          )
          file.content = JSON.stringify(tag, null, 2) + '\n'
        }
      }
    }

    return { files, warnings }
  } catch (err) {
    if (err instanceof DiagnosticError) throw err
    throw err
  }
}

/** Merge a tag file (load.json / tick.json) values into existing files array. */
function mergeTagFile(files: DatapackFile[], newFile: DatapackFile): void {
  const existing = files.find(f => f.path === newFile.path)
  if (!existing) {
    files.push(newFile)
    return
  }
  const existingJson = JSON.parse(existing.content) as { values: string[] }
  const newJson = JSON.parse(newFile.content) as { values: string[] }
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
  for (const fn of program.declarations) {
    rewriteBlock(fn.body, symbolMap)
  }
  for (const ib of program.implBlocks) {
    for (const m of ib.methods) {
      rewriteBlock(m.body, symbolMap)
    }
  }
}

function rewriteBlock(block: Block, symbolMap: Map<string, string>): void {
  for (const stmt of block) {
    rewriteStmt(stmt, symbolMap)
  }
}

function rewriteStmt(stmt: Stmt, symbolMap: Map<string, string>): void {
  switch (stmt.kind) {
    case 'let':
    case 'expr':
      rewriteExpr(stmt.kind === 'let' ? stmt.init : stmt.expr, symbolMap)
      break
    case 'return':
      if (stmt.value) rewriteExpr(stmt.value, symbolMap)
      break
    case 'if':
      rewriteExpr(stmt.cond, symbolMap)
      rewriteBlock(stmt.then, symbolMap)
      if (stmt.else_) rewriteBlock(stmt.else_, symbolMap)
      break
    case 'while':
      rewriteExpr(stmt.cond, symbolMap)
      rewriteBlock(stmt.body, symbolMap)
      break
    case 'for':
      if (stmt.init) rewriteStmt(stmt.init, symbolMap)
      rewriteExpr(stmt.cond, symbolMap)
      rewriteExpr(stmt.step, symbolMap)
      rewriteBlock(stmt.body, symbolMap)
      break
    case 'for_range':
      rewriteExpr(stmt.start, symbolMap)
      rewriteExpr(stmt.end, symbolMap)
      rewriteBlock(stmt.body, symbolMap)
      break
    case 'foreach':
      rewriteExpr(stmt.iterable, symbolMap)
      rewriteBlock(stmt.body, symbolMap)
      break
    case 'match':
      rewriteExpr(stmt.expr, symbolMap)
      for (const arm of stmt.arms) {
        // PatExpr wraps a legacy Expr that may contain symbol refs
        if (arm.pattern.kind === 'PatExpr') rewriteExpr(arm.pattern.expr, symbolMap)
        rewriteBlock(arm.body, symbolMap)
      }
      break
    case 'as_block':
    case 'at_block':
      rewriteBlock(stmt.body, symbolMap)
      break
    case 'as_at':
      rewriteBlock(stmt.body, symbolMap)
      break
    case 'execute':
      rewriteBlock(stmt.body, symbolMap)
      break
    case 'let_destruct':
      rewriteExpr(stmt.init, symbolMap)
      break
    case 'labeled_loop':
      rewriteStmt(stmt.body, symbolMap)
      break
    // break, continue, break_label, continue_label, raw: nothing to rewrite
  }
}

function rewriteExpr(expr: Expr, symbolMap: Map<string, string>): void {
  switch (expr.kind) {
    case 'call': {
      // Remap the function name if it's an imported symbol
      const remapped = symbolMap.get(expr.fn)
      if (remapped) {
        ; (expr as { fn: string }).fn = remapped
      }
      for (const arg of expr.args) rewriteExpr(arg, symbolMap)
      break
    }
    case 'assign':
      rewriteExpr(expr.value, symbolMap)
      break
    case 'binary':
      rewriteExpr(expr.left, symbolMap)
      rewriteExpr(expr.right, symbolMap)
      break
    case 'unary':
      rewriteExpr(expr.operand, symbolMap)
      break
    case 'member':
      rewriteExpr(expr.obj, symbolMap)
      break
    case 'member_assign':
      rewriteExpr(expr.obj, symbolMap)
      rewriteExpr(expr.value, symbolMap)
      break
    case 'index':
      rewriteExpr(expr.obj, symbolMap)
      rewriteExpr(expr.index, symbolMap)
      break
    case 'index_assign':
      rewriteExpr(expr.obj, symbolMap)
      rewriteExpr(expr.index, symbolMap)
      rewriteExpr(expr.value, symbolMap)
      break
    case 'array_lit':
      for (const el of expr.elements) rewriteExpr(el, symbolMap)
      break
    case 'struct_lit':
      for (const f of expr.fields) rewriteExpr(f.value, symbolMap)
      break
    case 'invoke':
      rewriteExpr(expr.callee, symbolMap)
      for (const arg of expr.args) rewriteExpr(arg, symbolMap)
      break
    case 'tuple_lit':
      for (const el of expr.elements) rewriteExpr(el, symbolMap)
      break
    case 'static_call':
      for (const arg of expr.args) rewriteExpr(arg, symbolMap)
      break
    // Literals, ident, selector, path_expr, f_string, etc: nothing to rewrite
  }
}
