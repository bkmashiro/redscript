import * as fs from 'fs'
import * as path from 'path'

import {
  benchmarkMeta,
  OptimizationLevel,
  parseCliArgs,
  runPipeline,
  summarizeFiles,
  writeJsonReport,
} from './_shared'
import type { Slot } from '../src/lir/types'
import { isProtectedSlot, sameSlot } from '../src/optimizer/lir/analysis'

export interface ArithmeticProbeCase {
  name: string
  description: string
  stdlibModules?: string[]
  source: string
}

export interface CommandCategorySummary {
  total: number
  scoreboard: number
  scoreCopy: number
  execute: number
  data: number
  functionCall: number
  storage: number
  selector: number
  summon: number
  teleport: number
  macro: number
  rawCommandLike: number
}

export interface CopyOriginSummary {
  twoAddressMaterialization: number
  callArg: number
  callResultPreservation: number
  returnMaterialization: number
  edgeOrWrapper: number
  opaqueBarrier: number
  unknown: number
}

export type CopyRewriteStatus = 'currentlyOptimized' | 'safeCandidate' | 'blockedByBarrier' | 'unknown'

export interface CopyRewriteOpportunityEntry {
  status: CopyRewriteStatus
  pattern: string
  count: number
  examples: string[]
}

export interface CopyRewriteOpportunitySummary {
  total: number
  currentlyOptimized: number
  safeCandidate: number
  blockedByBarrier: number
  unknown: number
  topOpportunities: CopyRewriteOpportunityEntry[]
}

export interface ForkEstimate {
  executeAs: number
  executeAsEntity: number
  executeAsPlayer: number
  executeAsBroad: number
  runFunctionInsideExecuteAs: number
  estimatedForkUnits: number
}

export interface SelectorEstimate {
  mentions: number
  broadMentions: number
  broadRiskRatio: number
  broadRiskLevel: 'none' | 'low' | 'medium' | 'high'
}

export interface NbtEstimate {
  scalarReads: number
  wholeListCopies: number
}

export interface MacroEstimate {
  commandCount: number
  withStorageCalls: number
}

export interface SetupHintEstimate {
  entitySetupCommands: number
  displaySetupCommands: number
  entityTypes: string[]
  entityTags: string[]
  hasTransformationReads: boolean
}

export interface ArithmeticCostEstimate {
  forks: ForkEstimate
  selector: SelectorEstimate
  nbt: NbtEstimate
  macro: MacroEstimate
  setupHints: SetupHintEstimate
  copyOrigins?: CopyOriginSummary
  note: 'static-estimate'
}

export interface ScoreCopyPatternEntry {
  pattern: string
  count: number
  examples: string[]
}

export interface ScoreCopyPatternSummary {
  total: number
  topPatterns: ScoreCopyPatternEntry[]
}

export interface ArithmeticProbeResult {
  case: string
  description: string
  optLevel: `O${OptimizationLevel}`
  stdlibModules: string[]
  timingsMs: { parse: number; hir: number; mir: number; emit: number; total: number }
  files: ReturnType<typeof summarizeFiles>
  commands: CommandCategorySummary
  estimatedCost: ArithmeticCostEstimate
  copyOrigins: CopyOriginSummary
  scoreCopyPatterns: ScoreCopyPatternSummary
  rewriteOpportunities: CopyRewriteOpportunitySummary
  warnings: string[]
}

export interface ArithmeticProbeReport {
  benchmark: string
  generatedAt: string
  host: ReturnType<typeof benchmarkMeta>['host']
  cases: ArithmeticProbeResult[]
  scoreCopyPatterns: ScoreCopyPatternSummary
  copyOrigins?: CopyOriginSummary
  rewriteOpportunities: CopyRewriteOpportunitySummary
}

type ProbeCliArgs = ReturnType<typeof parseCliArgs> & {
  caseName: string
  optLevels: OptimizationLevel[]
  list: boolean
}

const STDLIB_DIR = path.resolve(__dirname, '..', 'src', 'stdlib')

function stdlibSource(moduleName: string): string {
  const normalized = moduleName.endsWith('.mcrs') ? moduleName : `${moduleName}.mcrs`
  return fs.readFileSync(path.join(STDLIB_DIR, normalized), 'utf8')
}

function buildSource(probe: ArithmeticProbeCase): string {
  const stdlib = (probe.stdlibModules ?? [])
    .map(moduleName => stdlibSource(moduleName))
    .join('\n\n')
  return [stdlib, probe.source].filter(Boolean).join('\n\n')
}

export const ARITHMETIC_PROBES: ArithmeticProbeCase[] = [
  {
    name: 'int_arithmetic',
    description: 'Native scoreboard integer arithmetic baseline.',
    source: `
      @keep fn probe(a: int, b: int): int {
        let x: int = a + b;
        let y: int = x * 3;
        let z: int = y / 2;
        return z - a;
      }
    `,
  },
  {
    name: 'fixed_mul_div',
    description: 'Language fixed ×10000 multiplication/division lowering baseline.',
    source: `
      @keep fn probe(a: fixed, b: fixed): fixed {
        let x: fixed = a * b;
        let y: fixed = x / b;
        return y;
      }
    `,
  },
  {
    name: 'sqrt_fx1000',
    description: 'Legacy explicit ×1000 sqrt helper from stdlib/math.',
    stdlibModules: ['math'],
    source: `
      @keep fn probe(x: int): int {
        return sqrt_fx1000(x);
      }
    `,
  },
  {
    name: 'sqrt_fx10000',
    description: 'High precision ×10000 sqrt helper from stdlib/math_hp.',
    stdlibModules: ['math_hp'],
    source: `
      @keep fn probe(x: int): int {
        return sqrt_fx(x);
      }
    `,
  },
  {
    name: 'sin_hp',
    description: 'Entity rotation/local-coordinate high precision sine helper.',
    stdlibModules: ['math_hp'],
    source: `
      @load fn setup() { init_trig(); }
      @keep fn probe(angle: int): int {
        return sin_hp(angle);
      }
    `,
  },
  {
    name: 'sin_cos_hp_separate',
    description: 'Cost baseline for separate sin_hp + cos_hp calls before a combined sincos_hp helper.',
    stdlibModules: ['math_hp'],
    source: `
      @load fn setup() { init_trig(); }
      @keep fn probe(angle: int): int {
        let s: int = sin_hp(angle);
        let c: int = cos_hp(angle);
        return s + c;
      }
    `,
  },
  {
    name: 'double_mul',
    description: 'Macro-scale double multiplication helper.',
    stdlibModules: ['math_hp'],
    source: `
      @keep fn probe(a: double, b: double): double {
        return double_mul(a, b);
      }
    `,
  },
  {
    name: 'double_div',
    description: 'Display entity SVD-backed double division helper.',
    stdlibModules: ['math_hp'],
    source: `
      @load fn setup() { init_div(); }
      @keep fn probe(a: double, b: double): double {
        return double_div(a, b);
      }
    `,
  },
  {
    name: 'div3_hp',
    description: 'Display entity SVD-backed three-numerator shared-denominator division.',
    stdlibModules: ['math_hp'],
    source: `
      @load fn setup() { init_div(); }
      @keep fn probe(a: int, b: int, c: int, d: int): int {
        let x: int = div3_hp(a, b, c, d);
        let y: int = scoreboard_get("$div3_y", "__rs_math_hp");
        let z: int = scoreboard_get("$div3_z", "__rs_math_hp");
        return x + y + z;
      }
    `,
  },
]

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function extractSelectors(line: string): Array<{ type: string; token: string }> {
  const matches = Array.from(line.matchAll(/@([a-z])(?:\[[^\]]*\])?/g))
  return matches
    .map(match => ({
      type: match[1],
      token: match[0],
    }))
    .filter(selector => ['a', 'e', 'p', 'r', 's'].includes(selector.type))
}

function isBroadSelector(selector: { type: string; token: string }): boolean {
  if (selector.type !== 'e' && selector.type !== 'a') return false
  return !/\[[^\]]*\]/.test(selector.token) || !/\blimit\s*=\s*1\b/.test(selector.token)
}

function broadRiskLevelFromRatio(ratio: number): 'none' | 'low' | 'medium' | 'high' {
  if (ratio <= 0) return 'none'
  if (ratio < 0.25) return 'low'
  if (ratio < 0.6) return 'medium'
  return 'high'
}

function isNumericToken(token: string): boolean {
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:[dDfF])?$/.test(token)
}

function isScalarNbtPath(path: string): boolean {
  return /(?:\[[0-9]+\]|\.[A-Za-z0-9_]+)$/.test(path)
}

function extractExecuteSelectors(line: string): { count: number; entities: number; players: number; broad: number } {
  const matches = Array.from(line.matchAll(/\bas\s+(@[a-z](?:\[[^\]]*\])?)/g))

  return {
    count: matches.length,
    entities: matches.filter(match => match[1].startsWith('@e')).length,
    players: matches.filter(match => match[1].startsWith('@a')).length,
    broad: matches
      .map(match => ({ type: match[1][1], token: match[1] as `@${string}` }))
      .filter(selector => isBroadSelector(selector)).length,
  }
}

function summarizeEstimatedNbtReads(lines: string[]): NbtEstimate {
  let scalarReads = 0
  let wholeListCopies = 0

  for (const line of lines) {
    const tokens = line.split(/\s+/)
    const getIndex = tokens.indexOf('get')
    const modifyIndex = tokens.indexOf('modify')

    if (getIndex >= 0 && tokens[getIndex - 1] === 'data') {
      const source = tokens[getIndex + 1]
      if (source === 'entity' || source === 'storage' || source === 'block') {
        const path = tokens[getIndex + 3]
        if (!path || isNumericToken(path) || !isScalarNbtPath(path)) {
          wholeListCopies++
        } else {
          scalarReads++
        }
      }
      continue
    }

    if (modifyIndex >= 0 && tokens[modifyIndex - 1] === 'data') {
      const setIndex = tokens.indexOf('set', modifyIndex)
      const fromIndex = setIndex >= 0 ? tokens.indexOf('from', setIndex) : -1
      if (fromIndex >= 0) {
        const source = tokens[fromIndex + 1]
        if (source === 'storage' || source === 'entity' || source === 'block') {
          const path = tokens[fromIndex + 3]
          if (!path || isNumericToken(path) || !isScalarNbtPath(path)) {
            wholeListCopies++
          } else {
            scalarReads++
          }
        }
      }
    }
  }

  return {
    scalarReads,
    wholeListCopies,
  }
}

function summarizeCommandCostEstimateFromLines(lines: string[]): ArithmeticCostEstimate {
  const selectorStats = lines.flatMap(line => extractSelectors(line))
  const broadSelectors = selectorStats.filter(selector => isBroadSelector(selector))
  const selectorRiskRatio = selectorStats.length === 0 ? 0 : broadSelectors.length / selectorStats.length

  const executeLines = lines.filter(line => line.startsWith('execute ') || line.startsWith('$execute '))
  const executeForkStats = executeLines.map(extractExecuteSelectors)
  const executeAs = executeForkStats.reduce((sum, stat) => sum + stat.count, 0)
  const executeAsEntity = executeForkStats.reduce((sum, stat) => sum + stat.entities, 0)
  const executeAsPlayer = executeForkStats.reduce((sum, stat) => sum + stat.players, 0)
  const executeAsBroad = executeForkStats.reduce((sum, stat) => sum + stat.broad, 0)
  const runFunctionInsideExecuteAs = executeLines.filter(
    line => /\bas\b/.test(line) && /\brun\s+function\b/.test(line),
  ).length

  const nbt = summarizeEstimatedNbtReads(lines)
  const macroCount = lines.filter(line => line.startsWith('$') || line.includes('$(')).length
  const withStorageCalls = lines.filter(line => /\bfunction\b\s+[^\s]+\s+with\s+storage\b/.test(line)).length

  const entityTypeSet = new Set<string>()
  const tagSet = new Set<string>()
  const setupEntityHintLines = lines.filter(
    line => /\b(?:summon|tp|teleport)\b/.test(line) || /\brun\s+(?:summon|tp|teleport)\b/.test(line),
  )
  const displaySetupCommandLines = lines.filter(line => line.includes('block_display'))
  const transformationLines = lines.filter(line => line.includes('transformation'))

  for (const line of lines) {
    const summonMatch = line.match(/\bsummon\s+((?:minecraft:)?[a-zA-Z0-9_]+)/)
    if (summonMatch) entityTypeSet.add(summonMatch[1])

    const selectorTagMatch = /tag=([a-zA-Z0-9_]+)/g
    for (const [, tag] of line.matchAll(selectorTagMatch)) {
      tagSet.add(tag)
    }

    for (const tag of line.matchAll(/Tags:\[(.*?)\]/g)) {
      const payload = tag[1]
      for (const item of payload.split(',').map(value => value.trim().replace(/^\"|\"$/g, ''))) {
        if (item.length > 0 && item !== '"') {
          tagSet.add(item)
        }
      }
    }
  }

  const broadForkPenalty = executeAsBroad * 64
  const runFunctionPenalty = runFunctionInsideExecuteAs * 8

  return {
    forks: {
      executeAs,
      executeAsEntity,
      executeAsPlayer,
      executeAsBroad,
      runFunctionInsideExecuteAs,
      estimatedForkUnits: executeAs + broadForkPenalty + runFunctionPenalty,
    },
    selector: {
      mentions: selectorStats.length,
      broadMentions: broadSelectors.length,
      broadRiskRatio: Math.round(selectorRiskRatio * 1000) / 1000,
      broadRiskLevel: broadRiskLevelFromRatio(selectorRiskRatio),
    },
    nbt,
    macro: {
      commandCount: macroCount,
      withStorageCalls,
    },
    setupHints: {
      entitySetupCommands: setupEntityHintLines.length,
      displaySetupCommands: displaySetupCommandLines.length,
      entityTypes: [...entityTypeSet].sort(),
      entityTags: [...tagSet].sort(),
      hasTransformationReads: transformationLines.length > 0,
    },
    note: 'static-estimate',
  }
}

export function summarizeCommandCosts(files: Array<{ path: string; content: string }>): ArithmeticCostEstimate {
  return summarizeCommandCostEstimateFromLines(commandLines(files))
}

function commandLines(files: Array<{ path: string; content: string }>): string[] {
  return commandLinesWithLocations(files).map(line => line.content)
}

function commandLinesWithLocations(files: Array<{ path: string; content: string }>): Array<{ path: string; line: number; content: string }> {
  return files
    .filter(file => file.path.endsWith('.mcfunction'))
    .flatMap(file => file.content.split('\n').map((line, index) => ({
      path: file.path,
      line: index + 1,
      content: line.trim(),
    })))
    .filter(line => line.content.length > 0)
}

function isScoreCopy(line: string): boolean {
  return /^scoreboard players operation \S+ \S+ = \S+ \S+$/.test(line)
}

interface ScoreArithmetic {
  dst: Slot
  src: Slot
}

function parseScoreArithmetic(line: string): ScoreArithmetic | null {
  const match = /^scoreboard players operation (\S+) (\S+) (?:[+\-*/%]=|[<>]=) (\S+) (\S+)$/.exec(line)
  if (!match) return null
  return {
    dst: { player: match[1], obj: match[2] },
    src: { player: match[3], obj: match[4] },
  }
}

function parseScoreCopy(line: string): { dst: Slot; src: Slot } | null {
  const match = /^scoreboard players operation (\S+) (\S+) = (\S+) (\S+)$/.exec(line)
  if (!match) return null
  return {
    dst: { player: match[1], obj: match[2] },
    src: { player: match[3], obj: match[4] },
  }
}

function isBarrierLine(line: string): boolean {
  return line.startsWith('$')
    || line.includes(' run function ')
    || line.startsWith('function ')
    || line.includes(' function ')
}

function parseReturnValueSlot(line: string): Slot | null {
  const returnScoreMatch = /^return run scoreboard players get (\S+) (\S+)$/.exec(line)
  if (returnScoreMatch) return { player: returnScoreMatch[1], obj: returnScoreMatch[2] }
  const returnValueMatch = /^return (?:scoreboard players get )?(\S+) (\S+)$/.exec(line)
  return returnValueMatch ? { player: returnValueMatch[1], obj: returnValueMatch[2] } : null
}

function classifyCopyOrigin(
  line: string,
  previousLine: string | undefined,
  nextLine: string | undefined,
): keyof CopyOriginSummary {
  const parsed = parseScoreCopy(line)
  if (!parsed) return 'unknown'

  if (parsed.dst.player === '$ret' || parsed.src.player === '$ret' || parsed.dst.player.startsWith('$ret_')) {
    return 'returnMaterialization'
  }

  if (/^\$p\d+$/.test(parsed.dst.player) || /^\$p\d+$/.test(parsed.src.player)) {
    return 'callArg'
  }

  if (parsed.dst.player.includes('__rf_') || parsed.src.player.includes('__rf_')) {
    return 'callResultPreservation'
  }

  const previous = previousLine ? parseScoreCopy(previousLine) : null
  const next = nextLine ? parseScoreCopy(nextLine) : null
  const previousArithmetic = previousLine ? parseScoreArithmetic(previousLine) : null
  const nextArithmetic = nextLine ? parseScoreArithmetic(nextLine) : null
  if (
    (previous && (sameSlot(previous.dst, parsed.dst) || sameSlot(previous.src, parsed.dst))) ||
    (next && (sameSlot(next.dst, parsed.dst) || sameSlot(next.src, parsed.dst))) ||
    (previousArithmetic && (sameSlot(previousArithmetic.dst, parsed.src) || sameSlot(previousArithmetic.dst, parsed.dst) || sameSlot(previousArithmetic.src, parsed.dst))) ||
    (nextArithmetic && (sameSlot(nextArithmetic.dst, parsed.src) || sameSlot(nextArithmetic.dst, parsed.dst) || sameSlot(nextArithmetic.src, parsed.dst)))
  ) {
    return 'twoAddressMaterialization'
  }

  if (parsed.dst.player.includes('edge') || parsed.src.player.includes('edge') ||
    parsed.dst.player.includes('wrapper') || parsed.src.player.includes('wrapper')) {
    return 'edgeOrWrapper'
  }

  if ((previousLine && isBarrierLine(previousLine)) || (nextLine && isBarrierLine(nextLine))) {
    return 'opaqueBarrier'
  }

  return 'unknown'
}

function describeCopyRewritePattern(previous: string | undefined, current: string, next: string | undefined): string {
  return `${commandShape(previous)} -> score_copy -> ${commandShape(next)}`
}

function classifyCopyRewriteOpportunity(
  currentLine: string,
  previousLine: string | undefined,
  nextLine: string | undefined,
  nextNextLine: string | undefined,
): { status: CopyRewriteStatus; pattern: string } | null {
  const parsed = parseScoreCopy(currentLine)
  if (!parsed) return null

  const pattern = describeCopyRewritePattern(previousLine, currentLine, nextLine)
  if (sameSlot(parsed.src, parsed.dst)) {
    return { status: 'currentlyOptimized', pattern }
  }

  if (isProtectedSlot(parsed.src) || isProtectedSlot(parsed.dst)) {
    return { status: 'unknown', pattern }
  }

  const nextCopy = nextLine ? parseScoreCopy(nextLine) : null
  const nextArithmetic = nextLine ? parseScoreArithmetic(nextLine) : null
  const nextReturn = nextLine ? parseReturnValueSlot(nextLine) : null
  const nextNextCopy = nextNextLine ? parseScoreCopy(nextNextLine) : null
  const nextNextArithmetic = nextNextLine ? parseScoreArithmetic(nextNextLine) : null
  const nextNextReturn = nextNextLine ? parseReturnValueSlot(nextNextLine) : null

  const blockedByBarrier =
    isBarrierLine(nextLine ?? '')
    && (
      (nextNextCopy && sameSlot(nextNextCopy.src, parsed.dst)) ||
      (nextNextArithmetic && sameSlot(nextNextArithmetic.dst, parsed.dst)) ||
      (nextNextReturn && sameSlot(nextNextReturn, parsed.dst))
    )

  if (nextCopy && sameSlot(nextCopy.src, parsed.dst)) {
    if (blockedByBarrier) return { status: 'blockedByBarrier', pattern: `${commandShape(currentLine)} -> ${commandShape(nextLine)} -> ${commandShape(nextNextLine)}` }
    return { status: 'currentlyOptimized', pattern: 'copy -> copy'}
  }

  if (nextArithmetic && sameSlot(nextArithmetic.dst, parsed.dst)) {
    if (isBarrierLine(nextLine ?? '')) return { status: 'blockedByBarrier', pattern }
    return { status: 'safeCandidate', pattern: `${commandShape(currentLine)} -> score_arith` }
  }

  if (nextReturn && sameSlot(nextReturn, parsed.dst)) {
    if (isBarrierLine(nextLine ?? '')) return { status: 'blockedByBarrier', pattern }
    if (nextNextCopy && sameSlot(nextNextCopy.src, parsed.dst)) return { status: 'safeCandidate', pattern }
    return { status: 'currentlyOptimized', pattern: 'copy -> return' }
  }

  if (nextNextCopy && sameSlot(nextNextCopy.src, parsed.dst) && isBarrierLine(nextLine ?? '')) {
    return { status: 'blockedByBarrier', pattern: `${commandShape(currentLine)} -> barrier -> ${commandShape(nextNextLine)}` }
  }

  if (
    (nextNextArithmetic && sameSlot(nextNextArithmetic.dst, parsed.dst) && isBarrierLine(nextLine ?? ''))
    || (nextNextReturn && sameSlot(nextNextReturn, parsed.dst) && isBarrierLine(nextLine ?? ''))
  ) {
    return { status: 'blockedByBarrier', pattern: `${commandShape(currentLine)} -> barrier -> ${commandShape(nextNextLine)}` }
  }

  if (
    (nextNextCopy && sameSlot(nextNextCopy.src, parsed.dst))
    || (nextNextArithmetic && sameSlot(nextNextArithmetic.dst, parsed.dst))
    || (nextNextReturn && sameSlot(nextNextReturn, parsed.dst))
  ) {
    return { status: 'safeCandidate', pattern }
  }

  return { status: 'unknown', pattern }
}

function summarizeRewriteOpportunities(lines: Array<{ path: string; line: number; content: string }>): CopyRewriteOpportunitySummary {
  const totals: CopyRewriteOpportunitySummary = {
    total: 0,
    currentlyOptimized: 0,
    safeCandidate: 0,
    blockedByBarrier: 0,
    unknown: 0,
    topOpportunities: [],
  }

  const buckets = new Map<string, CopyRewriteOpportunityEntry>()

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i]
    if (!isScoreCopy(current.content)) continue

    const entry = classifyCopyRewriteOpportunity(
      current.content,
      i > 0 && lines[i - 1].path === current.path ? lines[i - 1].content : undefined,
      i + 1 < lines.length && lines[i + 1].path === current.path ? lines[i + 1].content : undefined,
      i + 2 < lines.length && lines[i + 2].path === current.path ? lines[i + 2].content : undefined,
    )
    if (!entry) continue

    totals.total += 1
    if (entry.status === 'currentlyOptimized') totals.currentlyOptimized += 1
    if (entry.status === 'safeCandidate') totals.safeCandidate += 1
    if (entry.status === 'blockedByBarrier') totals.blockedByBarrier += 1
    if (entry.status === 'unknown') totals.unknown += 1

    const key = `${entry.status}|${entry.pattern}`
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        status: entry.status,
        pattern: entry.pattern,
        count: 0,
        examples: [],
      }
      buckets.set(key, bucket)
    }
    bucket.count += 1
    if (bucket.examples.length < 3) bucket.examples.push(`${current.path}:${current.line}: ${current.content}`)
  }

  const sorted = [...buckets.values()].sort((a, b) =>
    b.count - a.count || a.pattern.localeCompare(b.pattern) || a.status.localeCompare(b.status))

  totals.topOpportunities = sorted

  return totals
}

function mergeRewriteOpportunities(summaries: CopyRewriteOpportunitySummary[]): CopyRewriteOpportunitySummary {
  const totals: CopyRewriteOpportunitySummary = {
    total: 0,
    currentlyOptimized: 0,
    safeCandidate: 0,
    blockedByBarrier: 0,
    unknown: 0,
    topOpportunities: [],
  }

  const merged = new Map<string, CopyRewriteOpportunityEntry>()

  for (const summary of summaries) {
    totals.total += summary.total
    totals.currentlyOptimized += summary.currentlyOptimized
    totals.safeCandidate += summary.safeCandidate
    totals.blockedByBarrier += summary.blockedByBarrier
    totals.unknown += summary.unknown
    for (const item of summary.topOpportunities) {
      const key = `${item.status}|${item.pattern}`
      let entry = merged.get(key)
      if (!entry) {
        entry = {
          status: item.status,
          pattern: item.pattern,
          count: 0,
          examples: [],
        }
        merged.set(key, entry)
      }
      entry.count += item.count
      for (const example of item.examples) {
        if (entry.examples.length >= 3) break
        entry.examples.push(example)
      }
    }
  }

  totals.topOpportunities = [...merged.values()].sort((a, b) =>
    b.count - a.count || a.pattern.localeCompare(b.pattern) || a.status.localeCompare(b.status))
  return totals
}

function summarizeCopyOrigins(lines: Array<{ path: string; line: number; content: string }>): CopyOriginSummary {
  const totals: CopyOriginSummary = {
    twoAddressMaterialization: 0,
    callArg: 0,
    callResultPreservation: 0,
    returnMaterialization: 0,
    edgeOrWrapper: 0,
    opaqueBarrier: 0,
    unknown: 0,
  }

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i]
    if (!isScoreCopy(current.content)) continue
    const origin = classifyCopyOrigin(
      current.content,
      i > 0 && lines[i - 1].path === current.path ? lines[i - 1].content : undefined,
      i + 1 < lines.length && lines[i + 1].path === current.path ? lines[i + 1].content : undefined,
    )
    totals[origin]++
  }

  return totals
}

function commandShape(line: string | undefined): string {
  if (!line) return 'boundary'
  if (isScoreCopy(line)) return 'score_copy'
  if (/^scoreboard players set \S+ \S+ -?\d+$/.test(line)) return 'score_set_const'
  if (/^scoreboard players operation \S+ \S+ [+\-*/%]= \S+ \S+$/.test(line)) return 'score_arith'
  if (/^scoreboard players (add|remove) \S+ \S+ -?\d+$/.test(line)) return 'score_add_imm'
  if (/^return run scoreboard players get \S+ \S+$/.test(line)) return 'return_score'
  if (line.startsWith('return ')) return 'return'
  if (line.startsWith('function ') || line.includes(' run function ')) return 'function_call'
  if (line.startsWith('execute ') || line.startsWith('$execute ')) return 'execute'
  if (line.startsWith('data ') || line.includes(' run data ')) return 'data'
  if (line.startsWith('$') || line.includes('$(')) return 'macro'
  if (line.startsWith('scoreboard ')) return 'scoreboard_other'
  return 'other'
}

export function summarizeScoreCopyPatterns(files: Array<{ path: string; content: string }>): ScoreCopyPatternSummary {
  const lines = commandLinesWithLocations(files)
  const patterns = new Map<string, ScoreCopyPatternEntry>()
  let total = 0

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i]
    if (!isScoreCopy(current.content)) continue
    total++

    const previous = i > 0 && lines[i - 1].path === current.path ? lines[i - 1].content : undefined
    const next = i + 1 < lines.length && lines[i + 1].path === current.path ? lines[i + 1].content : undefined
    const pattern = `${commandShape(previous)} -> score_copy -> ${commandShape(next)}`
    let entry = patterns.get(pattern)
    if (!entry) {
      entry = { pattern, count: 0, examples: [] }
      patterns.set(pattern, entry)
    }
    entry.count++
    if (entry.examples.length < 3) {
      entry.examples.push(`${current.path}:${current.line}: ${current.content}`)
    }
  }

  return scoreCopyPatternSummaryFromMap(total, patterns)
}

function scoreCopyPatternSummaryFromMap(total: number, patterns: Map<string, ScoreCopyPatternEntry>): ScoreCopyPatternSummary {
  return {
    total,
    topPatterns: [...patterns.values()].sort((a, b) => b.count - a.count || a.pattern.localeCompare(b.pattern)),
  }
}

function mergeScoreCopyPatterns(summaries: ScoreCopyPatternSummary[]): ScoreCopyPatternSummary {
  const patterns = new Map<string, ScoreCopyPatternEntry>()
  let total = 0

  for (const summary of summaries) {
    total += summary.total
    for (const item of summary.topPatterns) {
      let entry = patterns.get(item.pattern)
      if (!entry) {
        entry = { pattern: item.pattern, count: 0, examples: [] }
        patterns.set(item.pattern, entry)
      }
      entry.count += item.count
      for (const example of item.examples) {
        if (entry.examples.length >= 3) break
        entry.examples.push(example)
      }
    }
  }

  return scoreCopyPatternSummaryFromMap(total, patterns)
}

function mergeCopyOrigins(summaries: CopyOriginSummary[]): CopyOriginSummary {
  const totals: CopyOriginSummary = {
    twoAddressMaterialization: 0,
    callArg: 0,
    callResultPreservation: 0,
    returnMaterialization: 0,
    edgeOrWrapper: 0,
    opaqueBarrier: 0,
    unknown: 0,
  }

  for (const summary of summaries) {
    totals.twoAddressMaterialization += summary.twoAddressMaterialization
    totals.callArg += summary.callArg
    totals.callResultPreservation += summary.callResultPreservation
    totals.returnMaterialization += summary.returnMaterialization
    totals.edgeOrWrapper += summary.edgeOrWrapper
    totals.opaqueBarrier += summary.opaqueBarrier
    totals.unknown += summary.unknown
  }
  return totals
}

export function summarizeCommandCategories(files: Array<{ path: string; content: string }>): CommandCategorySummary {
  const lines = commandLines(files)
  const count = (predicate: (line: string) => boolean): number => lines.filter(predicate).length
  return {
    total: lines.length,
    scoreboard: count(line => line.startsWith('scoreboard ')),
    scoreCopy: count(line => /^scoreboard players operation \S+ \S+ = \S+ \S+$/.test(line)),
    execute: count(line => line.startsWith('execute ') || line.startsWith('$execute ')),
    data: count(line => line.startsWith('data ') || line.includes(' run data ')),
    functionCall: count(line => line.startsWith('function ') || line.includes(' run function ')),
    storage: count(line => line.includes(' storage ')),
    selector: count(line => /@[pares]\b/.test(line)),
    summon: count(line => line.startsWith('summon ') || line.includes(' run summon ')),
    teleport: count(line => line.startsWith('tp ') || line.includes(' run tp ') || line.startsWith('teleport ') || line.includes(' run teleport ')),
    macro: count(line => line.startsWith('$') || line.includes('$(')),
    rawCommandLike: count(line => !line.startsWith('scoreboard ') && !line.startsWith('execute ') && !line.startsWith('$execute ') && !line.startsWith('data ') && !line.startsWith('function ')),
  }
}

export function runArithmeticProbe(probe: ArithmeticProbeCase, optLevel: OptimizationLevel): ArithmeticProbeResult {
  const result = runPipeline(buildSource(probe), {
    namespace: `arith_${probe.name}`,
    optimizationLevel: optLevel,
  })
  const lines = commandLinesWithLocations(result.files)
  return {
    case: probe.name,
    description: probe.description,
    optLevel: `O${optLevel}`,
    stdlibModules: probe.stdlibModules ?? [],
    timingsMs: {
      parse: round(result.timings.parseMs),
      hir: round(result.timings.hirMs),
      mir: round(result.timings.mirMs),
      emit: round(result.timings.emitMs),
      total: round(result.timings.totalMs),
    },
    files: summarizeFiles(result.files),
    commands: summarizeCommandCategories(result.files),
    estimatedCost: summarizeCommandCosts(result.files),
    copyOrigins: summarizeCopyOrigins(lines),
    scoreCopyPatterns: summarizeScoreCopyPatterns(result.files),
    rewriteOpportunities: summarizeRewriteOpportunities(lines),
    warnings: result.warnings,
  }
}

export function runArithmeticProbeReport(caseName = 'all', optLevels: OptimizationLevel[] = [1]): ArithmeticProbeReport {
  const selected = caseName === 'all'
    ? ARITHMETIC_PROBES
    : ARITHMETIC_PROBES.filter(probe => probe.name === caseName)
  if (selected.length === 0) {
    throw new Error(`Unknown arithmetic probe case '${caseName}'. Use --list to see available cases.`)
  }
  const meta = benchmarkMeta('arithmetic-probes')
  const cases = selected.flatMap(probe => optLevels.map(level => runArithmeticProbe(probe, level)))
  return {
    ...meta,
    cases,
    scoreCopyPatterns: mergeScoreCopyPatterns(cases.map(result => result.scoreCopyPatterns)),
    copyOrigins: mergeCopyOrigins(cases.map(result => result.copyOrigins)),
    rewriteOpportunities: mergeRewriteOpportunities(cases.map(result => result.rewriteOpportunities)),
  }
}

function parseProbeCliArgs(argv: string[]): ProbeCliArgs {
  const base = parseCliArgs(argv)
  let caseName = 'all'
  let optLevels: OptimizationLevel[] = [1]
  let list = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--case' && argv[i + 1]) {
      caseName = argv[++i]
      continue
    }
    if (arg === '--opt' && argv[i + 1]) {
      const value = argv[++i]
      if (value === 'all') {
        optLevels = [0, 1, 2]
      } else {
        const parsed = Number(value)
        if (![0, 1, 2].includes(parsed)) {
          throw new Error(`Invalid --opt value '${value}'. Expected 0, 1, 2, or all.`)
        }
        optLevels = [parsed as OptimizationLevel]
      }
      continue
    }
    if (arg === '--list') list = true
  }

  return { ...base, caseName, optLevels, list }
}

function main(): void {
  const args = parseProbeCliArgs(process.argv.slice(2))
  if (args.list) {
    for (const probe of ARITHMETIC_PROBES) {
      process.stdout.write(`${probe.name}\t${probe.description}\n`)
    }
    return
  }
  writeJsonReport(runArithmeticProbeReport(args.caseName, args.optLevels), args.output)
}

if (require.main === module) {
  main()
}
