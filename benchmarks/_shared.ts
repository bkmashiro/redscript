import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import { Lexer } from '../src/lexer'
import { Parser } from '../src/parser'
import { preprocessSourceWithMetadata } from '../src/compile'
import { DiagnosticError, parseErrorMessage } from '../src/diagnostics'
import { lowerToHIR } from '../src/hir/lower'
import { monomorphize } from '../src/hir/monomorphize'
import { checkDeprecatedCalls } from '../src/hir/deprecated'
import type { Program } from '../src/ast/types'
import type { HIRModule } from '../src/hir/types'
import { lowerToMIR } from '../src/mir/lower'
import type { MIRModule } from '../src/mir/types'
import { optimizeModule } from '../src/optimizer/pipeline'
import { coroutineTransform, type CoroutineInfo } from '../src/optimizer/coroutine'
import { lowerToLIR } from '../src/lir/lower'
import type { LIRModule } from '../src/lir/types'
import { lirOptimizeModule } from '../src/optimizer/lir/pipeline'
import { analyzeBudget } from '../src/lir/budget'
import { emit, type DatapackFile } from '../src/emit'
import { TypeChecker } from '../src/typechecker'
import { isEventTypeName } from '../src/events/types'
import { DEFAULT_MC_VERSION } from '../src/types/mc-version'

export type OptimizationLevel = 0 | 1 | 2

export interface PipelineOptions {
  namespace?: string
  filePath?: string
  includeDirs?: string[]
  optimizationLevel?: OptimizationLevel
  lenient?: boolean
}

export interface PipelineTimings {
  parseMs: number
  hirMs: number
  mirMs: number
  emitMs: number
  totalMs: number
}

export interface PipelineResult {
  files: DatapackFile[]
  warnings: string[]
  timings: PipelineTimings
  ast: Program
  hir: HIRModule
  mir: MIRModule
  lir: LIRModule
}

const INT32_MAX = 2147483647
const INT32_MIN = -2147483648

function nowNs(): bigint {
  return process.hrtime.bigint()
}

function nsToMs(value: bigint): number {
  return Number(value) / 1_000_000
}

function measure<T>(fn: () => T): { value: T; ms: number } {
  const start = nowNs()
  const value = fn()
  return { value, ms: nsToMs(nowNs() - start) }
}

function collectDecoratorMetadata(hir: HIRModule, namespace: string): {
  tickFunctions: string[]
  loadFunctions: string[]
  coroutineInfos: CoroutineInfo[]
  scheduleFunctions: Array<{ name: string; ticks: number }>
  eventHandlers: Map<string, string[]>
} {
  const tickFunctions: string[] = []
  const loadFunctions: string[] = []
  const coroutineInfos: CoroutineInfo[] = []
  const scheduleFunctions: Array<{ name: string; ticks: number }> = []
  const eventHandlers = new Map<string, string[]>()

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
      if (dec.name === 'on' && dec.args?.eventType) {
        const eventType = dec.args.eventType as string
        if (isEventTypeName(eventType)) {
          if (!eventHandlers.has(eventType)) eventHandlers.set(eventType, [])
          eventHandlers.get(eventType)!.push(`${namespace}:${fn.name}`)
        }
      }
    }
  }

  return { tickFunctions, loadFunctions, coroutineInfos, scheduleFunctions, eventHandlers }
}

function mergeWholeModuleImports(ast: Program, filePath: string | undefined, includeDirs: string[] | undefined, namespace: string, warnings: string[]): void {
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

  function mergeModule(modFilePath: string): void {
    if (seenModuleImports.has(modFilePath)) return
    seenModuleImports.add(modFilePath)

    const modSource = fs.readFileSync(modFilePath, 'utf-8')
    const modPreprocessed = preprocessSourceWithMetadata(modSource, { filePath: modFilePath, includeDirs })
    const modTokens = new Lexer(modPreprocessed.source, modFilePath).tokenize()
    const modParser = new Parser(modTokens, modPreprocessed.source, modFilePath)
    const modAst = modParser.parse(namespace)
    warnings.push(...modParser.warnings)

    for (const fn of modAst.declarations) fn.isLibraryFn = true

    for (const imp of modAst.imports) {
      if (imp.symbol !== undefined) continue
      const nestedPath = resolveModuleFilePath(imp.moduleName, modFilePath)
      if (!nestedPath) {
        warnings.push(`[ImportWarning] Module '${imp.moduleName}' not found (imported in ${modFilePath})`)
        continue
      }
      mergeModule(nestedPath)
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
    mergeModule(resolved)
  }
}

function mergeLibraryImports(ast: Program, source: string, filePath: string | undefined, includeDirs: string[] | undefined, namespace: string, warnings: string[]): string {
  const preprocessed = preprocessSourceWithMetadata(source, { filePath, includeDirs })

  for (const li of preprocessed.libraryImports ?? []) {
    const libPreprocessed = preprocessSourceWithMetadata(li.source, { filePath: li.filePath, includeDirs })
    const libTokens = new Lexer(libPreprocessed.source, li.filePath).tokenize()
    const libParser = new Parser(libTokens, libPreprocessed.source, li.filePath)
    const libAst = libParser.parse(namespace)
    warnings.push(...libParser.warnings)
    for (const fn of libAst.declarations) fn.isLibraryFn = true
    ast.declarations.push(...libAst.declarations)
    ast.structs.push(...libAst.structs)
    ast.implBlocks.push(...libAst.implBlocks)
    ast.enums.push(...libAst.enums)
    ast.consts.push(...libAst.consts)
    ast.globals.push(...libAst.globals)
  }

  return preprocessed.source
}

export function runPipeline(source: string, options: PipelineOptions = {}): PipelineResult {
  const namespace = options.namespace ?? 'bench'
  const warnings: string[] = []
  const optimizationLevel = options.optimizationLevel ?? 1
  const includeDirs = options.includeDirs
  const totalStart = nowNs()

  let processedSource = source
  let ast!: Program
  let hir!: HIRModule
  let mir!: MIRModule
  let lir!: LIRModule
  let files: DatapackFile[] = []

  try {
    const parseStage = measure(() => {
      processedSource = preprocessSourceWithMetadata(source, { filePath: options.filePath, includeDirs }).source
      const lexer = new Lexer(processedSource, options.filePath)
      const tokens = lexer.tokenize()
      const parser = new Parser(tokens, processedSource, options.filePath)
      ast = parser.parse(namespace)
      warnings.push(...parser.warnings)

      mergeWholeModuleImports(ast, options.filePath, includeDirs, namespace, warnings)
      processedSource = mergeLibraryImports(ast, source, options.filePath, includeDirs, namespace, warnings)

      const checker = new TypeChecker(processedSource, options.filePath)
      const typeErrors = checker.check(ast)
      warnings.push(...checker.getWarnings())
      if (typeErrors.length > 0) {
        if (options.lenient) {
          for (const err of typeErrors) {
            warnings.push(`[TypeError] line ${err.location.line}, col ${err.location.col}: ${err.message}`)
          }
        } else {
          throw typeErrors[0]
        }
      }
    })

    const hirStage = measure(() => {
      const hirRaw = lowerToHIR(ast)
      hir = monomorphize(hirRaw)
      warnings.push(...checkDeprecatedCalls(hir))
    })

    const metadata = collectDecoratorMetadata(hir, namespace)

    const mirStage = measure(() => {
      let currentMir = lowerToMIR(hir, options.filePath)
      if (optimizationLevel >= 1) currentMir = optimizeModule(currentMir)

      const coroResult = coroutineTransform(currentMir, metadata.coroutineInfos)
      currentMir = coroResult.module
      metadata.tickFunctions.push(...coroResult.generatedTickFunctions)
      warnings.push(...coroResult.warnings)

      if (optimizationLevel >= 2) currentMir = optimizeModule(currentMir)
      mir = currentMir

      let currentLir = lowerToLIR(mir)
      if (optimizationLevel >= 1) currentLir = lirOptimizeModule(currentLir)
      if (optimizationLevel >= 2) currentLir = lirOptimizeModule(currentLir)
      lir = currentLir

      const coroutineNames = new Set(metadata.coroutineInfos.map(info => info.fnName))
      const budgetDiags = analyzeBudget(lir, coroutineNames)
      for (const diag of budgetDiags) {
        if (diag.level === 'error') {
          throw new DiagnosticError(
            'LoweringError',
            diag.message,
            { line: 1, col: 1, file: options.filePath },
          )
        }
        warnings.push(diag.message)
      }

      for (const fn of lir.functions) {
        for (const instr of fn.instructions) {
          if (instr.kind === 'score_set' && (instr.value > INT32_MAX || instr.value < INT32_MIN)) {
            warnings.push(
              `[ConstantOverflow] function '${fn.name}': scoreboard immediate ${instr.value} is outside MC int32 range [${INT32_MIN}, ${INT32_MAX}].`
            )
          }
        }
      }
    })

    const emitStage = measure(() => {
      files = emit(lir, {
        namespace,
        tickFunctions: metadata.tickFunctions,
        loadFunctions: metadata.loadFunctions,
        scheduleFunctions: metadata.scheduleFunctions,
        mcVersion: DEFAULT_MC_VERSION,
        eventHandlers: metadata.eventHandlers,
      })
    })

    return {
      files,
      warnings,
      ast,
      hir,
      mir,
      lir,
      timings: {
        parseMs: parseStage.ms,
        hirMs: hirStage.ms,
        mirMs: mirStage.ms,
        emitMs: emitStage.ms,
        totalMs: nsToMs(nowNs() - totalStart),
      },
    }
  } catch (err) {
    if (err instanceof DiagnosticError) throw err
    throw parseErrorMessage(
      'LoweringError',
      (err as Error).message,
      processedSource.split('\n'),
      options.filePath,
    )
  }
}

export function summarizeFiles(files: DatapackFile[]): {
  fileCount: number
  mcfunctionFileCount: number
  instructionCount: number
  totalBytes: number
  mcfunctionBytes: number
} {
  let instructionCount = 0
  let totalBytes = 0
  let mcfunctionBytes = 0
  let mcfunctionFileCount = 0

  for (const file of files) {
    const bytes = Buffer.byteLength(file.content, 'utf8')
    totalBytes += bytes
    if (file.path.endsWith('.mcfunction')) {
      mcfunctionFileCount++
      mcfunctionBytes += bytes
      instructionCount += file.content
        .split('\n')
        .filter(line => line.trim().length > 0)
        .length
    }
  }

  return {
    fileCount: files.length,
    mcfunctionFileCount,
    instructionCount,
    totalBytes,
    mcfunctionBytes,
  }
}

export function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function parseCliArgs(argv: string[]): { iterations: number; output?: string } {
  let iterations = 5
  let output: string | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if ((arg === '--iterations' || arg === '-n') && argv[i + 1]) {
      iterations = Number(argv[++i])
      continue
    }
    if ((arg === '--output' || arg === '-o') && argv[i + 1]) {
      output = argv[++i]
    }
  }

  if (!Number.isFinite(iterations) || iterations <= 0) {
    throw new Error(`Invalid iterations value: ${iterations}`)
  }

  return { iterations, output }
}

export function writeJsonReport(report: unknown, output?: string): void {
  const json = JSON.stringify(report, null, 2) + '\n'
  if (output) fs.writeFileSync(output, json, 'utf8')
  process.stdout.write(json)
}

export function benchmarkMeta(name: string): {
  benchmark: string
  generatedAt: string
  host: { platform: string; release: string; arch: string; cpuModel: string; cpuCount: number; totalMemoryMb: number }
} {
  const cpus = os.cpus()
  return {
    benchmark: name,
    generatedAt: new Date().toISOString(),
    host: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      cpuModel: cpus[0]?.model ?? 'unknown',
      cpuCount: cpus.length,
      totalMemoryMb: Math.round(os.totalmem() / (1024 * 1024)),
    },
  }
}

export function buildSyntheticProgram(targetLines: number): { source: string; actualLines: number; helperCount: number; callCount: number } {
  const lines: string[] = ['namespace bench;']

  const helperCount = Math.max(1, Math.floor(targetLines / 8))
  for (let i = 0; i < helperCount; i++) {
    lines.push(`fn helper_${i}(v: int): int {`)
    lines.push(`  let a: int = v + ${i + 1};`)
    lines.push(`  let b: int = a * 2;`)
    lines.push('  return b - a;')
    lines.push('}')
  }

  lines.push('@keep fn main(): int {')
  lines.push('  let acc: int = 0;')

  let callCount = 0
  while (lines.length + 2 < targetLines) {
    const helperIndex = callCount % helperCount
    lines.push(`  acc = acc + helper_${helperIndex}(acc);`)
    callCount++
  }

  lines.push('  return acc;')
  lines.push('}')

  while (lines.length < targetLines) {
    lines.splice(lines.length - 2, 0, '  // filler')
  }

  const source = lines.join('\n')
  return {
    source,
    actualLines: source.split('\n').length,
    helperCount,
    callCount,
  }
}

export function listStdlibModules(): string[] {
  const stdlibDir = path.resolve(__dirname, '..', 'src', 'stdlib')
  return fs.readdirSync(stdlibDir)
    .filter(name => name.endsWith('.mcrs'))
    .sort()
    .map(name => path.join(stdlibDir, name))
}
