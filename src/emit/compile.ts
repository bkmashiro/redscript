/**
 * Top-level compile function for the v2 pipeline.
 *
 * Pipeline: source → Lexer → Parser → TypeCheck → HIR → MIR → optimize → LIR → emit
 */

import * as fs from 'fs'
import * as path from 'path'
import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { preprocessSourceWithMetadata, type PreprocessedSource, type SourceRange } from '../compile'
import { CheckFailedError, DiagnosticBundleError, DiagnosticError, parseErrorMessage } from '../diagnostics'

function extractErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  return message.trim() || 'unknown error'
}
import { lowerToHIR } from '../hir/lower'
import { monomorphize } from '../hir/monomorphize'
import { checkDeprecatedCalls } from '../hir/deprecated'
import { lowerToMIR } from '../mir/lower'
import { optimizeModule } from '../optimizer/pipeline'
import { lowerToLIR } from '../lir/lower'
import { lirOptimizeModule } from '../optimizer/lir/pipeline'
import { emit, type DatapackFile, type EmitOptions } from './index'
import { coroutineTransform, type CoroutineInfo } from '../optimizer/coroutine'
import { analyzeBudget } from '../lir/budget'
import type { LIRModule, LIRInstr } from '../lir/types'
import type { MIRModule } from '../mir/types'
import { McVersion, DEFAULT_MC_VERSION } from '../types/mc-version'
import { TypeChecker } from '../typechecker'
import { isEventTypeName } from '../events/types'
import type { Program } from '../ast/types'
import type { HIRModule, HIRStruct, HIRFunction, HIRStmt, HIRExpr } from '../hir/types'
import { EVENT_RUNTIME_MANIFESTS, getAllEventRuntimeAssets, type EventRuntimeManifest } from '../events/manifest'

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
  /** Optional selected stage names to snapshot when `stageSnapshots` is provided. */
  snapshotStages?: CompileStageName[]
  /** Optional caller-owned sink for deterministic compile stage summaries. */
  stageSnapshots?: CompileStageSnapshot[]
}

export interface CompileResult {
  files: DatapackFile[]
  warnings: string[]
  /** Always true — v1 compat shim (compile() throws on error) */
  readonly success: true
}

export type CompileStageName =
  | 'preprocess'
  | 'parse'
  | 'typecheck'
  | 'runtimeAssets'
  | 'lowerToHIR'
  | 'runtimeMetadata'
  | 'lowerAndOptimize'
  | 'finalizeRuntimeLIR'
  | 'emitDatapack'

export interface CompileStageSnapshot {
  stage: CompileStageName
  summary: Record<string, unknown>
}

export interface PreprocessSourceStageResult {
  processedSource: string
  ranges: SourceRange[]
  libraryImports?: PreprocessedSource['libraryImports']
}

export function preprocessSourceStage(
  source: string,
  options: { filePath?: string; includeDirs?: string[] } = {},
): PreprocessSourceStageResult {
  const preprocessed = preprocessSourceWithMetadata(source, options)
  return {
    processedSource: preprocessed.source,
    ranges: preprocessed.ranges,
    libraryImports: preprocessed.libraryImports,
  }
}

function resolveRuntimeAssetPathWithCandidateRoots(
  assetPath: string,
  sourceLines: string[],
  filePath?: string,
  options: { candidateRoots?: string[]; existsSync?: (path: string) => boolean } = {},
): string {
  const existsSync = options.existsSync ?? fs.existsSync
  const candidateRoots = options.candidateRoots ?? [
    // Prefer the package/repo that owns this compiler before falling back to the
    // caller's cwd; otherwise a user project with a matching src/stdlib path
    // could shadow compiler-owned runtime assets.
    path.resolve(__dirname, '../..'),
    path.resolve(__dirname, '../../..'),
    process.cwd(),
  ]

  const candidates = [
    ...candidateRoots,
  ]

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate, assetPath)
    if (existsSync(resolved)) {
      return resolved
    }
  }

  throw new DiagnosticError(
    'LoweringError',
    `Event runtime asset '${assetPath}' does not exist. Runtime assets declared in event manifests must be present before compiling @on handlers.`,
    { file: filePath, line: 1, col: 1 },
    sourceLines,
  )
}

function collectEventRuntimeTypesFromProgram(program: Program): string[] {
  const eventTypes = new Set<string>()

  for (const fn of program.declarations) {
    for (const dec of fn.decorators) {
      if (dec.name === 'on' && typeof dec.args?.eventType === 'string') {
        eventTypes.add(dec.args.eventType)
      }
    }
  }

  for (const impl of program.implBlocks) {
    for (const method of impl.methods) {
      for (const dec of method.decorators) {
        if (dec.name === 'on' && typeof dec.args?.eventType === 'string') {
          eventTypes.add(dec.args.eventType)
        }
      }
    }
  }

  return [...eventTypes]
}

function mergeParsedLibrarySource(
  ast: Program,
  source: string,
  warnings: string[],
  options: { filePath?: string; namespace: string; stopAfterCheck?: boolean; dedupeDeclarations: boolean },
): void {
  const libParsed = parseSourceStage(source, options.namespace, {
    filePath: options.filePath,
    stopAfterCheck: options.stopAfterCheck,
  })
  const libAst = libParsed.ast
  warnings.push(...libParsed.warnings)

  const existingFnNames = new Set(ast.declarations.map(fn => fn.name))
  if (!ast.declaredFunctions) ast.declaredFunctions = []
  const existingDeclaredFnNames = new Set(ast.declaredFunctions.map(fn => fn.name))

  for (const fn of libAst.declarations) {
    if (options.dedupeDeclarations && existingFnNames.has(fn.name)) {
      continue
    }
    fn.isLibraryFn = true
    ast.declarations.push(fn)
    existingFnNames.add(fn.name)
  }

  for (const fn of libAst.declaredFunctions ?? []) {
    if (existingFnNames.has(fn.name) || existingDeclaredFnNames.has(fn.name)) {
      continue
    }
    ast.declaredFunctions.push(fn)
    existingDeclaredFnNames.add(fn.name)
  }

  ast.structs.push(...libAst.structs)
  ast.implBlocks.push(...libAst.implBlocks)
  ast.enums.push(...libAst.enums)
  ast.consts.push(...libAst.consts)
  ast.globals.push(...libAst.globals)
}

function hasLibraryRuntimeRootDecorator(fn: HIRFunction): boolean {
  return fn.decorators.some(dec =>
    dec.name === 'load' ||
    dec.name === 'tick' ||
    dec.name === 'schedule' ||
    dec.name === 'on' ||
    dec.name === 'function_tag' ||
    dec.name === 'watch' ||
    dec.name === 'keep' ||
    dec.name === 'coroutine' ||
    dec.name === 'profile' ||
    dec.name === 'benchmark' ||
    dec.name === 'throttle' ||
    dec.name === 'retry' ||
    dec.name === 'memoize'
  )
}

function getRequireOnLoadTargets(fn: HIRFunction): string[] {
  const targets: string[] = []
  for (const dec of fn.decorators) {
    if (dec.name !== 'require_on_load') continue
    for (const arg of dec.rawArgs ?? []) {
      if (arg.kind === 'string') targets.push(arg.value)
    }
  }
  return targets
}

function collectRawFunctionReferences(cmd: string): string[] {
  const refs: string[] = []
  const functionRefPattern = /\bfunction\s+(?:(?:[A-Za-z0-9_.-]+|__NS__):)?([A-Za-z0-9_./-]+)/g
  for (const match of cmd.matchAll(functionRefPattern)) {
    const target = match[1]
    if (target) refs.push(target.replace(/\//g, '_'))
  }
  return refs
}

function collectHIRFunctionCalls(fn: HIRFunction): Set<string> {
  const calls = new Set<string>()
  const visitBlock = (block: HIRStmt[]): void => {
    for (const stmt of block) visitStmt(stmt)
  }
  const visitExpr = (expr: HIRExpr): void => {
    switch (expr.kind) {
      case 'call':
        calls.add(expr.fn)
        expr.args.forEach(visitExpr)
        break
      case 'invoke':
        visitExpr(expr.callee)
        expr.args.forEach(visitExpr)
        break
      case 'static_call':
        calls.add(`${expr.type}::${expr.method}`)
        expr.args.forEach(visitExpr)
        break
      case 'binary':
        visitExpr(expr.left)
        visitExpr(expr.right)
        break
      case 'unary':
        visitExpr(expr.operand)
        break
      case 'is_check':
      case 'type_cast':
        visitExpr(expr.expr)
        break
      case 'some_lit':
        visitExpr(expr.value)
        break
      case 'assign':
        visitExpr(expr.value)
        break
      case 'member_assign':
      case 'index_assign':
        visitExpr(expr.obj)
        if ('index' in expr) visitExpr(expr.index)
        visitExpr(expr.value)
        break
      case 'member':
        visitExpr(expr.obj)
        break
      case 'index':
        visitExpr(expr.obj)
        visitExpr(expr.index)
        break
      case 'array_lit':
      case 'tuple_lit':
        expr.elements.forEach(visitExpr)
        break
      case 'struct_lit':
        expr.fields.forEach(field => visitExpr(field.value))
        break
      case 'str_interp':
        expr.parts.forEach(part => { if (typeof part !== 'string') visitExpr(part) })
        break
      case 'f_string':
        expr.parts.forEach(part => { if (part.kind === 'expr') visitExpr(part.expr) })
        break
      case 'enum_construct':
        expr.args.forEach(arg => visitExpr(arg.value))
        break
      case 'lambda':
        if (Array.isArray(expr.body)) visitBlock(expr.body)
        else visitExpr(expr.body)
        break
      case 'unwrap_or':
        visitExpr(expr.opt)
        visitExpr(expr.default_)
        break
      case 'int_lit':
      case 'float_lit':
      case 'byte_lit':
      case 'short_lit':
      case 'long_lit':
      case 'double_lit':
      case 'bool_lit':
      case 'str_lit':
      case 'range_lit':
      case 'rel_coord':
      case 'local_coord':
      case 'mc_name':
      case 'blockpos':
      case 'selector':
      case 'ident':
      case 'path_expr':
      case 'none_lit':
        break
    }
  }
  const visitStmt = (stmt: HIRStmt): void => {
    switch (stmt.kind) {
      case 'let':
      case 'let_destruct':
        visitExpr(stmt.init)
        break
      case 'const_decl':
        visitExpr(stmt.value)
        break
      case 'expr':
        visitExpr(stmt.expr)
        break
      case 'return':
        if (stmt.value) visitExpr(stmt.value)
        break
      case 'labeled_loop':
        visitStmt(stmt.body)
        break
      case 'if':
        visitExpr(stmt.cond)
        visitBlock(stmt.then)
        if (stmt.else_) visitBlock(stmt.else_)
        break
      case 'while':
        visitExpr(stmt.cond)
        visitBlock(stmt.body)
        if (stmt.step) visitBlock(stmt.step)
        break
      case 'foreach':
        visitExpr(stmt.iterable)
        visitBlock(stmt.body)
        break
      case 'match':
        visitExpr(stmt.expr)
        for (const arm of stmt.arms) {
          if (arm.pattern.kind === 'PatExpr') visitExpr(arm.pattern.expr)
          visitBlock(arm.body)
        }
        break
      case 'execute':
        visitBlock(stmt.body)
        break
      case 'if_let_some':
        visitExpr(stmt.init)
        visitBlock(stmt.then)
        if (stmt.else_) visitBlock(stmt.else_)
        break
      case 'while_let_some':
        visitExpr(stmt.init)
        visitBlock(stmt.body)
        break
      case 'break':
      case 'continue':
      case 'break_label':
      case 'continue_label':
        break
      case 'raw':
        collectRawFunctionReferences(stmt.cmd).forEach(ref => calls.add(ref))
        break
    }
  }

  if (!Array.isArray(fn.body)) return calls
  visitBlock(fn.body)
  return calls
}

function pruneUnreachableLibraryHIR(hir: HIRModule): HIRModule {
  const functionsByName = new Map(hir.functions.map(fn => [fn.name, fn]))
  const reachable = new Set<string>()
  const queue: string[] = []
  const enqueue = (name: string): void => {
    if (!functionsByName.has(name) || reachable.has(name)) return
    reachable.add(name)
    queue.push(name)
  }

  for (const fn of hir.functions) {
    if (!fn.isLibraryFn || hasLibraryRuntimeRootDecorator(fn)) enqueue(fn.name)
  }

  while (queue.length > 0) {
    const fn = functionsByName.get(queue.shift()!)
    if (!fn) continue
    for (const callee of collectHIRFunctionCalls(fn)) enqueue(callee)
    for (const target of getRequireOnLoadTargets(fn)) enqueue(target)
  }

  return {
    ...hir,
    functions: hir.functions.filter(fn => !fn.isLibraryFn || reachable.has(fn.name)),
  }
}

export interface LowerToHIRStageResult {
  hir: HIRModule
  libraryFilePaths: Set<string>
  warnings: string[]
}

export function lowerToHIRStage(
  ast: Program,
  namespace: string,
  options: { pruneInjectedLibraries?: boolean } = { pruneInjectedLibraries: true },
): LowerToHIRStageResult {
  const hirRaw = lowerToHIR(ast)
  const hirMonomorphized = monomorphize(hirRaw)
  const hir = options.pruneInjectedLibraries
    ? pruneUnreachableLibraryHIR(hirMonomorphized)
    : hirMonomorphized

  const libraryFilePaths = new Set(
    options.pruneInjectedLibraries
      ? hir.functions
        .filter(fn => fn.isLibraryFn && !hasLibraryRuntimeRootDecorator(fn))
        .map(fn => `data/${namespace}/function/${fn.name}.mcfunction`)
      : [],
  )

  return {
    hir,
    libraryFilePaths,
    warnings: checkDeprecatedCalls(hir),
  }
}

export interface ParseSourceStageResult {
  ast: Program
  warnings: string[]
}

export function parseSourceStage(
  source: string,
  namespace: string,
  options: { filePath?: string; stopAfterCheck?: boolean } = {},
): ParseSourceStageResult {
  const lexer = new Lexer(source, options.filePath)
  const tokens = lexer.tokenize()
  const parser = new Parser(tokens, source, options.filePath)
  const ast = parser.parse(namespace)
  annotateFunctionSourceFiles(ast, options.filePath)
  if (parser.parseErrors.length > 0) {
    throw options.stopAfterCheck ? new DiagnosticBundleError(parser.parseErrors) : parser.parseErrors[0]
  }
  return { ast, warnings: [...parser.warnings] }
}

export interface RunTypecheckStageResult {
  warnings: string[]
}

export interface RuntimeAssetPlan {
  runtimeEventTypes: string[]
  runtimeAssetPaths: string[]
}

export interface MergeRuntimeAssetsStageOptions {
  filePath?: string
  namespace: string
  sourceLines: string[]
  stopAfterCheck?: boolean
  manifests?: readonly EventRuntimeManifest[]
  resolveRuntimeAssetPath?: (assetPath: string, sourceLines: string[], filePath?: string) => string
  readRuntimeAssetFile?: (filePath: string, encoding: BufferEncoding) => string
}

export interface MergeRuntimeAssetsStageResult {
  warnings: string[]
  runtimeAssetPaths: string[]
  runtimeEventTypes: string[]
}

export function planEventRuntimeAssets(
  program: Program,
  options: { manifests?: MergeRuntimeAssetsStageOptions['manifests'] } = {},
): RuntimeAssetPlan {
  const runtimeEventTypes = collectEventRuntimeTypesFromProgram(program)
  const runtimeAssetPaths = [...getAllEventRuntimeAssets(
    options.manifests ?? EVENT_RUNTIME_MANIFESTS,
    {},
    runtimeEventTypes,
  )].sort()

  return {
    runtimeEventTypes: [...runtimeEventTypes].sort(),
    runtimeAssetPaths,
  }
}

export function mergeRuntimeAssetsStage(
  ast: Program,
  options: MergeRuntimeAssetsStageOptions,
): MergeRuntimeAssetsStageResult {
  const {
    filePath,
    namespace,
    sourceLines,
    stopAfterCheck,
    manifests = EVENT_RUNTIME_MANIFESTS,
    resolveRuntimeAssetPath = (assetPath, resolveSourceLines, resolveFilePath) =>
      resolveRuntimeAssetPathWithCandidateRoots(assetPath, resolveSourceLines, resolveFilePath),
    readRuntimeAssetFile = fs.readFileSync,
  } = options

  const warnings: string[] = []
  const { runtimeEventTypes, runtimeAssetPaths } = planEventRuntimeAssets(ast, { manifests })

  for (const assetPath of runtimeAssetPaths) {
    const resolvedAssetPath = resolveRuntimeAssetPath(assetPath, sourceLines, filePath)
    const assetSource = readRuntimeAssetFile(resolvedAssetPath, 'utf-8')
    mergeParsedLibrarySource(ast, assetSource, warnings, {
      filePath: resolvedAssetPath,
      namespace,
      stopAfterCheck,
      dedupeDeclarations: true,
    })
  }

  return {
    warnings,
    runtimeAssetPaths,
    runtimeEventTypes,
  }
}

export interface CollectRuntimeMetadataStageResult {
  tickFunctions: string[]
  loadFunctions: string[]
  watchFunctions: Array<{ name: string; objective: string }>
  inlineFunctions: Set<string>
  noInlineFunctions: Set<string>
  coroutineInfos: CoroutineInfo[]
  scheduleFunctions: Array<{ name: string; ticks: number }>
  profiledFunctions: string[]
  benchmarkFunctions: string[]
  throttleFunctions: Array<{ name: string; ticks: number }>
  retryFunctions: Array<{ name: string; max: number }>
  memoizeFunctions: string[]
  eventHandlers: Map<string, string[]>
  functionTags: Map<string, string[]>
}

function functionFilePath(namespace: string, fnName: string): string {
  return `data/${namespace}/function/${fnName}.mcfunction`
}

function functionNameFromFilePath(filePath: string): string | null {
  const match = filePath.match(/^data\/[^/]+\/function\/(.+)\.mcfunction$/)
  return match?.[1] ?? null
}

function isDerivedFunctionName(fnName: string, rootNames: ReadonlySet<string>): boolean {
  for (const rootName of rootNames) {
    if (fnName.startsWith(`${rootName}__`)) return true
  }
  return false
}

function addDerivedLibraryFunctionPaths(
  lir: LIRModule,
  namespace: string,
  libraryFilePaths: Set<string>,
  userRootNames: ReadonlySet<string>,
): void {
  const prunableLibraryRootNames = new Set<string>()
  for (const libraryPath of libraryFilePaths) {
    const fnName = functionNameFromFilePath(libraryPath)
    if (fnName) prunableLibraryRootNames.add(fnName)
  }

  if (prunableLibraryRootNames.size === 0) return

  for (const fn of lir.functions) {
    if (userRootNames.has(fn.name)) continue
    if (isDerivedFunctionName(fn.name, userRootNames)) continue
    if (isDerivedFunctionName(fn.name, prunableLibraryRootNames)) {
      libraryFilePaths.add(functionFilePath(namespace, fn.name))
    }
  }
}

function findReachableLibraryFunctions(
  mod: MIRModule,
  namespace: string,
  libraryFilePaths: ReadonlySet<string>,
): Set<string> {
  if (libraryFilePaths.size === 0) return new Set()

  const functionNames = new Set(mod.functions.map(fn => fn.name))
  const libraryNames = new Set<string>()
  for (const fn of mod.functions) {
    if (libraryFilePaths.has(`data/${namespace}/function/${fn.name}.mcfunction`)) {
      libraryNames.add(fn.name)
    }
  }

  const edges = new Map<string, Set<string>>()
  for (const fn of mod.functions) {
    const callees = new Set<string>()
    for (const block of fn.blocks) {
      for (const instr of block.instrs) {
        if (
          (instr.kind === 'call' || instr.kind === 'call_macro' || instr.kind === 'call_context') &&
          functionNames.has(instr.fn)
        ) {
          callees.add(instr.fn)
        }
      }
    }
    edges.set(fn.name, callees)
  }

  const reachable = new Set<string>()
  const queue: string[] = []
  for (const fn of mod.functions) {
    if (!libraryNames.has(fn.name)) {
      queue.push(fn.name)
      reachable.add(fn.name)
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    for (const callee of edges.get(current) ?? []) {
      if (!reachable.has(callee)) {
        reachable.add(callee)
        queue.push(callee)
      }
    }
  }

  return new Set([...reachable].filter(fnName => libraryNames.has(fnName)))
}

export interface LowerAndOptimizeStagesOptions {
  namespace: string
  filePath?: string
  libraryFilePaths: ReadonlySet<string>
  inlineFunctions: ReadonlySet<string>
  noInlineFunctions: ReadonlySet<string>
  coroutineInfos: readonly CoroutineInfo[]
}

export interface LowerAndOptimizeStagesResult {
  hir: HIRModule
  lirOpt: LIRModule
  libraryFilePaths: Set<string>
  generatedTickFunctions: string[]
  warnings: string[]
}

export function lowerAndOptimizeStages(
  hir: HIRModule,
  options: LowerAndOptimizeStagesOptions,
): LowerAndOptimizeStagesResult {
  const {
    namespace,
    filePath,
    libraryFilePaths: incomingLibraryFilePaths,
    inlineFunctions,
    noInlineFunctions,
    coroutineInfos,
  } = options

  const warnings: string[] = []

  const mir = lowerToMIR(hir, filePath)
  const userRootNames = new Set(
    mir.functions
      .filter(fn => !incomingLibraryFilePaths.has(functionFilePath(namespace, fn.name)))
      .map(fn => fn.name),
  )
  const reachableLibraryFns = findReachableLibraryFunctions(mir, namespace, incomingLibraryFilePaths)
  if (inlineFunctions.size > 0) {
    mir.inlineFunctions = new Set(inlineFunctions)
  }
  if (noInlineFunctions.size > 0) {
    mir.noInlineFunctions = new Set(noInlineFunctions)
  }

  const mirOpt = optimizeModule(mir)

  const libraryFilePaths = new Set(incomingLibraryFilePaths)
  if (mirOpt.keepInOutput && mirOpt.keepInOutput.size > 0) {
    for (const fnName of mirOpt.keepInOutput) {
      const filePath = `data/${namespace}/function/${fnName}.mcfunction`
      if (!incomingLibraryFilePaths.has(filePath) || reachableLibraryFns.has(fnName)) {
        libraryFilePaths.delete(filePath)
      }
    }
  }

  const coroResult = coroutineTransform(mirOpt, Array.from(coroutineInfos))
  warnings.push(...coroResult.warnings)
  const mirFinal = coroResult.module

  const lir = lowerToLIR(mirFinal)
  const lirOpt = lirOptimizeModule(lir)
  addDerivedLibraryFunctionPaths(lirOpt, namespace, libraryFilePaths, userRootNames)

  return {
    hir,
    lirOpt,
    libraryFilePaths,
    generatedTickFunctions: [...coroResult.generatedTickFunctions],
    warnings,
  }
}

export interface FinalizeRuntimeLIRStageOptions {
  singletonStructs?: readonly HIRStruct[]
  memoizeFunctions?: readonly string[]
  benchmarkFunctions?: readonly string[]
  coroutineInfos?: readonly CoroutineInfo[]
  filePath?: string
}

export interface FinalizeRuntimeLIRStageResult {
  lir: LIRModule
  singletonObjectives: string[]
  warnings: string[]
}

export interface EmitDatapackStageOptions extends EmitOptions {
  libraryFilePaths: ReadonlySet<string>
}

export interface EmitDatapackStageResult {
  files: DatapackFile[]
}

export function emitDatapackStage(
  finalizedLIR: LIRModule,
  options: EmitDatapackStageOptions,
): EmitDatapackStageResult {
  const { libraryFilePaths, ...emitOptions } = options
  const prunableLibraryPaths = new Set(libraryFilePaths)
  const protectFunction = (fnName: string): void => {
    const normalized = fnName.includes(':') ? fnName.split(':').slice(1).join(':') : fnName
    prunableLibraryPaths.delete(functionFilePath(options.namespace, normalized))
  }
  for (const fn of options.loadFunctions ?? []) protectFunction(fn)
  for (const fn of options.tickFunctions ?? []) protectFunction(fn)
  for (const schedule of options.scheduleFunctions ?? []) protectFunction(schedule.name)
  for (const watch of options.watchFunctions ?? []) protectFunction(watch.name)
  for (const fns of options.eventHandlers?.values() ?? []) {
    for (const fn of fns) protectFunction(fn)
  }
  for (const fns of options.functionTags?.values() ?? []) {
    for (const fn of fns) protectFunction(fn)
  }
  const files = emit(finalizedLIR, emitOptions)
  return { files: pruneLibraryFunctionFiles(files, prunableLibraryPaths) }
}

export function finalizeRuntimeLIRStage(
  lir: LIRModule,
  options: FinalizeRuntimeLIRStageOptions = {},
): FinalizeRuntimeLIRStageResult {
  const {
    singletonStructs = [],
    memoizeFunctions = [],
    benchmarkFunctions = [],
    coroutineInfos = [],
    filePath,
  } = options

  const warnings: string[] = []

  const finalizedLIR: LIRModule = {
    ...lir,
    functions: lir.functions.map(fn => ({
      ...fn,
      instructions: fn.instructions.map(instr => ({ ...instr })),
    })),
  }

  // Stage 6: LIR optimization results are already in `lir`.
  // Stage 6a: Static tick budget analysis
  const coroutineNames = new Set(coroutineInfos.map(c => c.fnName))
  const budgetDiags = analyzeBudget(finalizedLIR, coroutineNames)
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

  // Stage 6b: Validate LIR score_set values are in MC int32 range
  const INT32_MAX = 2147483647
  const INT32_MIN = -2147483648
  for (const fn of finalizedLIR.functions) {
    for (const instr of fn.instructions) {
      if (instr.kind === 'score_set' && (instr.value > INT32_MAX || instr.value < INT32_MIN)) {
        warnings.push(
          `[ConstantOverflow] function '${fn.name}': ` +
            `scoreboard immediate ${instr.value} is outside MC int32 range [${INT32_MIN}, ${INT32_MAX}]. ` +
            `This indicates a constant-folding overflow bug — please report this.`,
        )
      }
    }
  }

  // Stage 6.9: Inject synthetic LIR functions for @singleton structs
  const singletonObjectives: string[] = []
  for (const s of singletonStructs) {
    if (!s.isSingleton) continue
    const structName = s.name
    const objective = finalizedLIR.objective

    // Build _get function: reads each field from its own scoreboard objective
    // and returns struct fields via __rf_<field> slots in the main objective.
    const getInstrs: LIRInstr[] = []
    for (const field of s.fields) {
      const fieldObj = singletonObjectiveName(structName, field.name)
      if (!singletonObjectives.includes(fieldObj)) {
        singletonObjectives.push(fieldObj)
      }
      getInstrs.push({
        kind: 'score_copy',
        dst: { player: `$__rf_${field.name}`, obj: objective },
        src: { player: `__sng`, obj: fieldObj },
      })
    }
    getInstrs.push({ kind: 'score_set', dst: { player: '$ret', obj: objective }, value: 0 })

    finalizedLIR.functions.push({
      name: `${structName}::get`,
      instructions: getInstrs,
      isMacro: false,
      macroParams: [],
    })

    // Build _set function: writes each field back to its scoreboard objective.
    const setInstrs: LIRInstr[] = []
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

    finalizedLIR.functions.push({
      name: `${structName}::set`,
      instructions: setInstrs,
      isMacro: false,
      macroParams: [],
    })
  }

  const renameToImpl = (fnName: string): void => {
    const lirFn = finalizedLIR.functions.find(f => f.name === fnName)
    if (!lirFn) return
    const implName = `${fnName}_impl`
    lirFn.name = implName

    // Rewrite recursive self-calls for wrapper wiring.
    for (const instr of lirFn.instructions) {
      if ('fn' in instr && instr.fn === fnName) {
        ;(instr as { fn: string }).fn = implName
      }
    }
  }

  // Stage 6.95: Rename @memoize functions to <fn>_impl in LIR.
  for (const fnName of memoizeFunctions) {
    renameToImpl(fnName)
  }

  // Stage 6.96: Rename @benchmark functions to <fn>_impl in LIR.
  for (const fnName of benchmarkFunctions) {
    renameToImpl(fnName)
  }

  return { lir: finalizedLIR, singletonObjectives, warnings }
}

export function collectRuntimeMetadataStage(
  hir: HIRModule,
  namespace: string,
): CollectRuntimeMetadataStageResult {
  const tickFunctions: string[] = []
  const loadFunctions: string[] = []
  const watchFunctions: Array<{ name: string; objective: string }> = []
  const inlineFunctions = new Set<string>()
  const noInlineFunctions = new Set<string>()
  const coroutineInfos: CoroutineInfo[] = []
  const scheduleFunctions: Array<{ name: string; ticks: number }> = []
  const profiledFunctions: string[] = []
  const benchmarkFunctions: string[] = []
  const throttleFunctions: Array<{ name: string; ticks: number }> = []
  const retryFunctions: Array<{ name: string; max: number }> = []
  const memoizeFunctions: string[] = []
  const eventHandlers = new Map<string, string[]>()
  const functionTags = new Map<string, string[]>()

  for (const fn of hir.functions) {
    if (fn.watchObjective) {
      watchFunctions.push({ name: fn.name, objective: fn.watchObjective })
    } else {
      // Fallback: extract from decorator if watchObjective not propagated.
      const watchDec = fn.decorators?.find(d => d.name === 'watch' && d.args?.objective)
      if (watchDec?.args?.objective) {
        watchFunctions.push({ name: fn.name, objective: watchDec.args.objective })
      }
    }

    for (const dec of fn.decorators) {
      if (dec.name === 'tick') tickFunctions.push(fn.name)
      if (dec.name === 'load') loadFunctions.push(fn.name)
      if (dec.name === 'inline') inlineFunctions.add(fn.name)
      if (dec.name === 'no-inline') noInlineFunctions.add(fn.name)
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
      if (dec.name === 'benchmark') {
        benchmarkFunctions.push(fn.name)
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
      if (dec.name === 'require_on_load') {
        loadFunctions.push(...getRequireOnLoadTargets(fn))
      }
      if (dec.name === 'on' && dec.args?.eventType) {
        const evType = dec.args.eventType as string
        if (isEventTypeName(evType)) {
          if (!eventHandlers.has(evType)) eventHandlers.set(evType, [])
          eventHandlers.get(evType)!.push(`${namespace}:${fn.name}`)
        }
      }
      if (dec.name === 'function_tag' && dec.args?.functionTag) {
        const tagId = dec.args.functionTag
        if (!functionTags.has(tagId)) functionTags.set(tagId, [])
        functionTags.get(tagId)!.push(`${namespace}:${fn.name}`)
      }
    }
  }

  return {
    tickFunctions,
    loadFunctions,
    watchFunctions,
    inlineFunctions,
    noInlineFunctions,
    coroutineInfos,
    scheduleFunctions,
    profiledFunctions,
    benchmarkFunctions,
    throttleFunctions,
    retryFunctions,
    memoizeFunctions,
    eventHandlers,
    functionTags,
  }
}

export function runTypecheckStage(
  ast: Program,
  source: string,
  options: { filePath?: string; lenient?: boolean; stopAfterCheck?: boolean } = {},
): RunTypecheckStageResult {
  const checker = new TypeChecker(source, options.filePath)
  const typeErrors = checker.check(ast)
  const warnings = [...checker.getWarnings()]
  if (typeErrors.length > 0) {
    if (options.lenient) {
      for (const e of typeErrors) {
        warnings.push(`[TypeError] line ${e.location.line}, col ${e.location.col}: ${e.message}`)
      }
    } else {
      throw options.stopAfterCheck ? new DiagnosticBundleError(typeErrors) : typeErrors[0]
    }
  }
  return { warnings }
}

function recordStageSnapshot(
  options: Pick<CompileOptions, 'snapshotStages' | 'stageSnapshots'>,
  stage: CompileStageName,
  summarize: () => Record<string, unknown>,
): void {
  if (!options.stageSnapshots) return
  if (options.snapshotStages && !options.snapshotStages.includes(stage)) return
  options.stageSnapshots.push({ stage, summary: summarize() })
}

function mapToObject(map: Map<string, string[]>): Record<string, string[]> {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

function summarizePreprocessStage(stage: PreprocessSourceStageResult): Record<string, unknown> {
  return {
    processedLength: stage.processedSource.length,
    ranges: stage.ranges.length,
    libraryImports: stage.libraryImports?.map(imp => imp.filePath) ?? [],
  }
}

function summarizeParseStage(stage: ParseSourceStageResult): Record<string, unknown> {
  return {
    namespace: stage.ast.namespace,
    functions: stage.ast.declarations.map(fn => fn.name),
    structs: stage.ast.structs.map(s => s.name),
    imports: stage.ast.imports.length,
    warnings: stage.warnings.length,
  }
}

function summarizeTypecheckStage(stage: RunTypecheckStageResult): Record<string, unknown> {
  return {
    warnings: stage.warnings.length,
  }
}

function summarizeRuntimeAssetsStage(stage: MergeRuntimeAssetsStageResult): Record<string, unknown> {
  return {
    runtimeEventTypes: stage.runtimeEventTypes,
    runtimeAssetPaths: stage.runtimeAssetPaths,
    warnings: stage.warnings.length,
  }
}

function summarizeRuntimeMetadataStage(stage: CollectRuntimeMetadataStageResult): Record<string, unknown> {
  return {
    tickFunctions: stage.tickFunctions,
    loadFunctions: stage.loadFunctions,
    watchFunctions: stage.watchFunctions,
    inlineFunctions: [...stage.inlineFunctions],
    noInlineFunctions: [...stage.noInlineFunctions],
    coroutineFunctions: stage.coroutineInfos.map(info => info.fnName),
    scheduleFunctions: stage.scheduleFunctions,
    profiledFunctions: stage.profiledFunctions,
    benchmarkFunctions: stage.benchmarkFunctions,
    throttleFunctions: stage.throttleFunctions,
    retryFunctions: stage.retryFunctions,
    memoizeFunctions: stage.memoizeFunctions,
    eventHandlers: mapToObject(stage.eventHandlers),
    functionTags: mapToObject(stage.functionTags),
  }
}

function summarizeLowerToHIRStage(stage: LowerToHIRStageResult): Record<string, unknown> {
  return {
    namespace: stage.hir.namespace,
    functions: stage.hir.functions.map(fn => fn.name),
    structs: stage.hir.structs.map(s => s.name),
    libraryFilePaths: [...stage.libraryFilePaths].sort(),
    warnings: stage.warnings.length,
  }
}

function summarizeLowerAndOptimizeStages(stage: LowerAndOptimizeStagesResult): Record<string, unknown> {
  return {
    namespace: stage.lirOpt.namespace,
    functions: stage.lirOpt.functions.map(fn => fn.name),
    libraryFilePaths: [...stage.libraryFilePaths].sort(),
    generatedTickFunctions: stage.generatedTickFunctions,
    warnings: stage.warnings.length,
  }
}

function summarizeFinalizeRuntimeLIRStage(stage: FinalizeRuntimeLIRStageResult): Record<string, unknown> {
  return {
    namespace: stage.lir.namespace,
    functions: stage.lir.functions.map(fn => fn.name),
    singletonObjectives: stage.singletonObjectives,
    warnings: stage.warnings.length,
  }
}

function summarizeEmitDatapackStage(stage: EmitDatapackStageResult): Record<string, unknown> {
  return {
    files: stage.files.length,
    paths: stage.files.map(file => file.path).sort(),
  }
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
  const preprocessed = preprocessSourceStage(source, { filePath, includeDirs })
  recordStageSnapshot(options, 'preprocess', () => summarizePreprocessStage(preprocessed))
  const processedSource = preprocessed.processedSource

  try {
    // Stage 1: Lex + Parse → AST
    const parsed = parseSourceStage(processedSource, namespace, { filePath, stopAfterCheck })
    recordStageSnapshot(options, 'parse', () => summarizeParseStage(parsed))
    const ast = parsed.ast
    warnings.push(...parsed.warnings)

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

    let hasInjectedLibraries = false

    function mergeWholeModuleImport(modFilePath: string): void {
      hasInjectedLibraries = true
      if (seenModuleImports.has(modFilePath)) return
      seenModuleImports.add(modFilePath)
      const modSource = fs.readFileSync(modFilePath, 'utf-8')
      const modPreprocessed = preprocessSourceWithMetadata(modSource, { filePath: modFilePath, includeDirs })
      const modParsed = parseSourceStage(modPreprocessed.source, namespace, { filePath: modFilePath, stopAfterCheck })
      const modAst = modParsed.ast
      warnings.push(...modParsed.warnings)
      if (!ast.declaredFunctions) ast.declaredFunctions = []
      const existingFnNames = new Set(ast.declarations.map(fn => fn.name))
      const existingDeclaredFnNames = new Set(ast.declaredFunctions.map(fn => fn.name))
      for (const fn of modAst.declarations) fn.isLibraryFn = true
      ast.declarations.push(...modAst.declarations)
      for (const fn of modAst.declarations) {
        existingFnNames.add(fn.name)
      }
      for (const fn of modAst.declaredFunctions ?? []) {
        if (existingFnNames.has(fn.name) || existingDeclaredFnNames.has(fn.name)) {
          continue
        }
        ast.declaredFunctions.push(fn)
        existingDeclaredFnNames.add(fn.name)
      }
      for (const imp of modAst.imports) {
        if (imp.symbol !== undefined) continue
        const nestedPath = resolveModuleFilePath(imp.moduleName, modFilePath)
        if (!nestedPath) {
          warnings.push(`[ImportWarning] Module '${imp.moduleName}' not found (imported in ${modFilePath})`)
          continue
        }
        mergeWholeModuleImport(nestedPath)
      }
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
      hasInjectedLibraries = true
      mergeParsedLibrarySource(ast, li.source, warnings, {
        filePath: li.filePath,
        namespace,
        stopAfterCheck,
        dedupeDeclarations: false,
      })
    }

    if (options.librarySources) {
      hasInjectedLibraries = true
      for (const libSrc of options.librarySources) {
        mergeParsedLibrarySource(ast, libSrc, warnings, {
          namespace,
          stopAfterCheck,
          dedupeDeclarations: false,
        })
      }
    }

    {
      const plannedRuntimeAssets = mergeRuntimeAssetsStage(ast, {
        namespace,
        sourceLines: processedSource.split('\n'),
        filePath,
        stopAfterCheck,
      })
      warnings.push(...plannedRuntimeAssets.warnings)
      recordStageSnapshot(options, 'runtimeAssets', () => summarizeRuntimeAssetsStage(plannedRuntimeAssets))
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
      const typechecked = runTypecheckStage(ast, processedSource, { filePath, lenient, stopAfterCheck })
      recordStageSnapshot(options, 'typecheck', () => summarizeTypecheckStage(typechecked))
      warnings.push(...typechecked.warnings)
    }

    const hirStage = lowerToHIRStage(ast, namespace, { pruneInjectedLibraries: hasInjectedLibraries })
    recordStageSnapshot(options, 'lowerToHIR', () => summarizeLowerToHIRStage(hirStage))
    warnings.push(...hirStage.warnings)

    if (stopAfterCheck) {
      return { files: [], warnings, success: true as const }
    }

    // Extract decorator/runtime metadata before HIR lowering discards it.
    const runtimeMetadata = collectRuntimeMetadataStage(hirStage.hir, namespace)
    recordStageSnapshot(options, 'runtimeMetadata', () => summarizeRuntimeMetadataStage(runtimeMetadata))
    const {
      tickFunctions,
      loadFunctions,
      watchFunctions,
      inlineFunctions,
      noInlineFunctions,
      coroutineInfos,
      scheduleFunctions,
      profiledFunctions,
      benchmarkFunctions,
      throttleFunctions,
      retryFunctions,
      memoizeFunctions,
      eventHandlers,
      functionTags,
    } = runtimeMetadata

    const lowered = lowerAndOptimizeStages(hirStage.hir, {
      namespace,
      filePath,
      libraryFilePaths: hirStage.libraryFilePaths,
      inlineFunctions,
      noInlineFunctions,
      coroutineInfos,
    })
    recordStageSnapshot(options, 'lowerAndOptimize', () => summarizeLowerAndOptimizeStages(lowered))
    const lirOpt = lowered.lirOpt
    const libraryFilePaths = lowered.libraryFilePaths
    tickFunctions.push(...lowered.generatedTickFunctions)
    warnings.push(...lowered.warnings)

    const lirRuntime = finalizeRuntimeLIRStage(lirOpt, {
      singletonStructs: hirStage.hir.structs,
      memoizeFunctions,
      benchmarkFunctions,
      coroutineInfos,
      filePath,
    })
    recordStageSnapshot(options, 'finalizeRuntimeLIR', () => summarizeFinalizeRuntimeLIRStage(lirRuntime))
    const finalizedLIR = lirRuntime.lir
    const singletonObjectives = lirRuntime.singletonObjectives
    warnings.push(...lirRuntime.warnings)

    // Stage 7: LIR → .mcfunction
    const emitted = emitDatapackStage(finalizedLIR, {
      namespace,
      tickFunctions,
      loadFunctions,
      watchFunctions,
      scheduleFunctions,
      generateSourceMap,
      mcVersion,
      eventHandlers,
      functionTags,
      singletonObjectives,
      profiledFunctions,
      benchmarkFunctions,
      enableProfiling: debug,
      throttleFunctions,
      retryFunctions,
      memoizeFunctions,
      libraryFilePaths,
    })
    recordStageSnapshot(options, 'emitDatapack', () => summarizeEmitDatapackStage(emitted))

    return { files: emitted.files, warnings, success: true as const }
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
        [parseErrorMessage('LoweringError', extractErrorMessage(err), sourceLines, filePath)],
        warnings,
      )
    }
    if (err instanceof DiagnosticError) throw err
    const sourceLines = processedSource.split('\n')
    throw parseErrorMessage('LoweringError', extractErrorMessage(err), sourceLines, filePath)
  }
}

/**
 * Compute a scoreboard objective name for a @singleton struct field.
 * Format: _s_<struct>_<field>, truncated so total length ≤ 16 chars.
 * MC scoreboard objective names are limited to 16 characters.
 * The prefix "_s_" (3 chars) and separator "_" (1 char) consume 4 chars,
 * leaving 12 chars for struct + field combined.
 * If struct+field exceeds that budget: use first 4 chars of struct, first 8 of field.
 */
export function singletonObjectiveName(structName: string, fieldName: string): string {
  const PREFIX = '_s_'
  const SEP = '_'
  const MC_LIMIT = 16
  const maxNameLength = MC_LIMIT - PREFIX.length - SEP.length
  if (structName.length + fieldName.length <= maxNameLength) {
    return `${PREFIX}${structName}${SEP}${fieldName}`
  }
  return `${PREFIX}${structName.slice(0, 4)}${SEP}${fieldName.slice(0, 8)}`
}
