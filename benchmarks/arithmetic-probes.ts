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
import {
  chooseVirLoweringPlan,
  type VirFunctionLoweringDecision,
  type VirToLirDecisionReport,
} from '../src/optimizer/vir/lower/vir-to-lir'
import { lowerMirToVir } from '../src/optimizer/vir/lower/mir-to-vir'
import type { VirUnsupportedReasonTag } from '../src/optimizer/vir/lower/unsupported-tags'
import { isProtectedSlot, sameSlot } from '../src/optimizer/lir/analysis'

export interface ArithmeticProbeCase {
  name: string
  description: string
  stdlibModules?: string[]
  coverageCategory?: 'controlled' | 'broad'
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

export type VirDecisionRejectionCategory = keyof VirToLirDecisionReport['rejectionCategoryCounts']

export type VirArithmeticDecisionStatus = 'continue' | 'pause' | 'stay-experimental'

export interface VirUnsupportedReasonRank {
  reason: string
  count: number
}

export interface VirUnsupportedMirCallTarget {
  fn: string
  argCount: number
  hasResult: boolean
  targetKind?: 'raw-command' | 'function'
  rawCommandKind?: 'summon-marker-setup' | 'execute-raw' | 'other-raw'
  displayName?: string
  targetFamily?: string
}

export interface VirCorpusCoverageSummary {
  totalCaseCount: number
  controlledCaseCount: number
  broadCaseCount: number
  controlledProbeNames: string[]
  broadProbeNames: string[]
}

export type VirReadinessChecklistStatus = 'pass' | 'fail' | 'warn'

export interface VirReadinessChecklistItem {
  id: string
  status: VirReadinessChecklistStatus
  detail: string
}

export interface VirCaseBlockerMatrixEntry {
  caseName: string
  coverageCategory: 'controlled' | 'broad'
  status: VirToLirDecisionReport['kind']
  semanticProofStatus: VirArithmeticSemanticProofStatus
  unsupportedReasonTags: VirUnsupportedReasonTag[]
  blockerTags: string[]
  rejectionCategory?: VirDecisionRejectionCategory
  commandDelta?: number
  scoreCopyDelta?: number
  unsupportedMirOpKinds?: string[]
  unsupportedMirCallTargets?: VirUnsupportedMirCallTarget[]
}

export interface VirUnsupportedReasonBreakdownEntry {
  reason: string
  count: number
  caseNames: string[]
  controlledCaseNames: string[]
  broadCaseNames: string[]
}

export interface VirUnsupportedMirOpKindBreakdownEntry {
  opKind: string
  count: number
  caseNames: string[]
  controlledCaseNames: string[]
  broadCaseNames: string[]
}

export interface VirUnsupportedMirCallTargetBreakdownEntry {
  fn: string
  count: number
  caseNames: string[]
  controlledCaseNames: string[]
  broadCaseNames: string[]
  argCounts: number[]
  hasResultCount: number
  noResultCount: number
}

export interface VirUnsupportedMirCallTargetFamilyBreakdownEntry {
  family: string
  count: number
  targetKinds: string[]
  rawCommandKinds: string[]
  caseNames: string[]
  controlledCaseNames: string[]
  broadCaseNames: string[]
  exampleTargets: string[]
}

export type VirRawSummonMarkerSetupIsolationStatus = 'isolated-structural-setup' | 'true-arithmetic-blocker' | 'mixed' | 'unknown' | 'none'

export interface VirRawSummonMarkerSetupIsolation {
  status: VirRawSummonMarkerSetupIsolationStatus
  caseCount: number
  caseNames: string[]
  broadCaseNames: string[]
  controlledCaseNames: string[]
  exampleTargets: string[]
  semanticProofStatus: 'proven' | 'unproven' | 'unsupported'
  recommendation: string
  notes: string
}

export interface VirSemanticProofCloseout {
  status: VirReadinessChecklistStatus
  provenSupportedCount: number
  supportedButUnprovenCount: number
  unsupportedCount: number
  provenSupportedCaseNames: string[]
  supportedButUnprovenCaseNames: string[]
  unsupportedCaseNames: string[]
  detail: string
}

export interface VirAllocationCheckCloseout {
  status: VirReadinessChecklistStatus
  allocationCheckFailureCount: number
  affectedCaseCount: number
  affectedFunctionCount: number
  affectedCaseNames: string[]
  functionNamesAvailable: boolean
  recommendation: string
  notes: string
}

export interface VirDecisionDeltaSummary {
  min: number
  max: number
  total: number
  average: number
  improvedCount: number
  regressedCount: number
  unchangedCount: number
}

export interface VirRejectionCategoryRank {
  category: VirDecisionRejectionCategory
  count: number
}

export type VirArithmeticSemanticProofStatus = 'proven' | 'unproven' | 'unsupported'

export interface VirSemanticProofSummary {
  provenEquivalentCount: number
  unsupportedCount: number
  missingProofCount: number
  unprovenCount: number
}

export interface VirDecisionModeTotals {
  acceptedPlanned: number
  acceptedDirect: number
  rejectedDirect: number
}

export interface VirArithmeticDecisionAggregate {
  status: VirArithmeticDecisionStatus
  statusReason: string
  recommendationReason: string
  totalCaseCount: number
  consideredCases: number
  consideredFunctions: number
  totalFunctionCount: number
  supportedCases: number
  unsupportedCases: number
  plannedAcceptedFunctionCount: number
  directAcceptedFunctionCount: number
  directRejectedFunctionCount: number
  directSelectedFunctionCount: number
  plannedSelectedFunctionCount: number
  acceptedPlannedCases: number
  selectedDirectCases: number
  rejectedDirectCases: number
  unsupportedFunctionCount: number
  unsupportedCaseCount: number
  rejectionCategoryTotals: VirToLirDecisionReport['rejectionCategoryCounts']
  topRejectionCategories: VirRejectionCategoryRank[]
  unsupportedReasonBreakdown: VirUnsupportedReasonBreakdownEntry[]
  unsupportedMirOpKindBreakdown: VirUnsupportedMirOpKindBreakdownEntry[]
  unsupportedMirCallTargetBreakdown: VirUnsupportedMirCallTargetBreakdownEntry[]
  unsupportedMirCallTargetFamilyBreakdown: VirUnsupportedMirCallTargetFamilyBreakdownEntry[]
  caseBlockerMatrix: VirCaseBlockerMatrixEntry[]
  readinessChecklist: VirReadinessChecklistItem[]
  unsupportedReasonTotals: { [tag: string]: number }
  topUnsupportedReasons: VirUnsupportedReasonRank[]
  blockerTagTotals: { [tag: string]: number }
  unknownReasonCaseNames: string[]
  unknownMirCallTargetCaseNames: string[]
  directCommandCount: number
  plannedCommandCount: number
  directScoreCopyCount: number
  plannedScoreCopyCount: number
  commandDeltaSummary: VirDecisionDeltaSummary
  scoreCopyDeltaSummary: VirDecisionDeltaSummary
  semanticProofSummary: VirSemanticProofSummary
  directVsPlannedCommandDelta: number
  directVsPlannedScoreCopyDelta: number
  directToPlannedScoreCopyReductionPercent: number
  blockers: string[]
  rawSummonMarkerSetupIsolation: VirRawSummonMarkerSetupIsolation
  semanticProofCloseout: VirSemanticProofCloseout
  allocationCheckCloseout: VirAllocationCheckCloseout
  nextSafeGoals: string[]
  goNoGoStatus: VirArithmeticDecisionStatus
  supportedProbeNames: string[]
  unsupportedProbeNames: string[]
  corpusCoverageSummary: VirCorpusCoverageSummary
}

export interface VirArithmeticDecisionThresholds {
  maxPlannedCommandDelta: number
  minScoreCopyReductionPercent: number
  maxAllocationFailureCount: number
  maxUnsupportedCaseRatio: number
  maxUnsupportedFunctionRatio: number
  maxDirectRejectionDominanceRatio: number
  maxRegressedCommandCaseCount: number
  maxRegressedScoreCopyCaseCount: number
  minSupportedCases: number
  minProvenEquivalentCases: number
  minSupportedCaseRatio: number
  minProvenEquivalentRatio: number
}

export const VIR_ARITHMETIC_DECISION_THRESHOLDS: VirArithmeticDecisionThresholds = {
  maxPlannedCommandDelta: 0,
  minScoreCopyReductionPercent: 20,
  maxAllocationFailureCount: 0,
  maxUnsupportedCaseRatio: 0,
  maxUnsupportedFunctionRatio: 0,
  maxDirectRejectionDominanceRatio: 0.45,
  maxRegressedCommandCaseCount: 0,
  maxRegressedScoreCopyCaseCount: 0,
  minSupportedCases: 3,
  minProvenEquivalentCases: 3,
  minSupportedCaseRatio: 0.5,
  minProvenEquivalentRatio: 0.5,
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
  coverageCategory: 'controlled' | 'broad'
  timingsMs: { parse: number; hir: number; mir: number; emit: number; total: number }
  files: ReturnType<typeof summarizeFiles>
  commands: CommandCategorySummary
  estimatedCost: ArithmeticCostEstimate
  copyOrigins: CopyOriginSummary
  scoreCopyPatterns: ScoreCopyPatternSummary
  rewriteOpportunities: CopyRewriteOpportunitySummary
  virDecision?: {
    status: VirToLirDecisionReport['kind']
    selectedMode: VirToLirDecisionReport['selectedMode']
    directCommandCount: number
    plannedCommandCount: number
    directScoreCopyCount: number
    plannedScoreCopyCount: number
    acceptedFunctionCount: number
    rejectedFunctionCount: number
    unsupportedFunctionCount: number
    rejectionCategoryCounts: VirToLirDecisionReport['rejectionCategoryCounts']
    unsupportedReason?: string
    modeTotals?: VirDecisionModeTotals
    semanticProofStatus?: VirArithmeticSemanticProofStatus
    rejectionCategory?: VirDecisionRejectionCategory
    unsupportedMirOpKinds?: string[]
    unsupportedMirCallTargets?: VirUnsupportedMirCallTarget[]
    commandDelta?: number
    scoreCopyDelta?: number
    blockerTags?: string[]
    unsupportedReasonTags?: VirUnsupportedReasonTag[]
    }
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
  virDecisionDashboard: VirArithmeticDecisionAggregate
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
    coverageCategory: 'controlled',
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
    name: 'int_add_sub_mul',
    description: 'Controlled pure add/sub/mul integer chain with no calls or control flow.',
    coverageCategory: 'controlled',
    source: `
      @keep fn probe(a: int, b: int, c: int, d: int): int {
        let x: int = a + b;
        let y: int = x - c;
        let z: int = y * d;
        return z + x;
      }
    `,
  },
  {
    name: 'int_div_mod_mix',
    description: 'Controlled division/modulo chain with mixed constants and variables.',
    coverageCategory: 'controlled',
    source: `
      @keep fn probe(a: int, b: int, c: int): int {
        let x: int = a / b;
        let y: int = a % b;
        let z: int = x + y + c;
        return z + 1;
      }
    `,
  },
  {
    name: 'int_const_var_mix',
    description: 'Controlled constants plus variable arithmetic with temporary values.',
    coverageCategory: 'controlled',
    source: `
      @keep fn probe(a: int, b: int): int {
        let x: int = a + 3;
        let y: int = b * 5;
        let z: int = y - 2;
        return x + z;
      }
    `,
  },
  {
    name: 'int_temp_heavy',
    description: 'Controlled branch-free temporary-heavy arithmetic chain to probe slot pressure.',
    coverageCategory: 'controlled',
    source: `
      @keep fn probe(a: int, b: int, c: int): int {
        let x: int = a + b;
        let y: int = x + c;
        let z: int = y + 1;
        let w: int = z + x;
        let u: int = w - b;
        let v: int = u * a;
        return v;
      }
    `,
  },
  {
    name: 'branched_arithmetic',
    description: 'Unsupported branch-heavy arithmetic shape for control-flow blocker isolation.',
    coverageCategory: 'controlled',
    source: `
      @keep fn probe(a: int, b: int): int {
        if (a > b) {
          return a;
        }
        return b;
      }
    `,
  },
  {
    name: 'fixed_mul_div',
    description: 'Language fixed ×10000 multiplication/division lowering baseline.',
    coverageCategory: 'broad',
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
    coverageCategory: 'broad',
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
    coverageCategory: 'broad',
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
    coverageCategory: 'broad',
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
    coverageCategory: 'broad',
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
    coverageCategory: 'broad',
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
    coverageCategory: 'broad',
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
    coverageCategory: 'broad',
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

function makeZeroRejectionCategoryTotals(): VirToLirDecisionReport['rejectionCategoryCounts'] {
  return {
    planned_unsupported: 0,
    allocation_check_failed: 0,
    higher_cost: 0,
    direct_unsupported: 0,
    unsupported_both: 0,
  }
}

function makeZeroModeTotals(): VirDecisionModeTotals {
  return {
    acceptedPlanned: 0,
    acceptedDirect: 0,
    rejectedDirect: 0,
  }
}

function makeZeroDeltaSummary(): VirDecisionDeltaSummary {
  return {
    min: 0,
    max: 0,
    total: 0,
    average: 0,
    improvedCount: 0,
    regressedCount: 0,
    unchangedCount: 0,
  }
}

function makeZeroSemanticProofSummary(): VirSemanticProofSummary {
  return {
    provenEquivalentCount: 0,
    unsupportedCount: 0,
    missingProofCount: 0,
    unprovenCount: 0,
  }
}

function makeZeroRawSummonMarkerSetupIsolation(): VirRawSummonMarkerSetupIsolation {
  return {
    status: 'none',
    caseCount: 0,
    caseNames: [],
    broadCaseNames: [],
    controlledCaseNames: [],
    exampleTargets: [],
    semanticProofStatus: 'unsupported',
    recommendation: 'retain raw summons outside the arithmetic semantic lane until isolation is proven',
    notes: 'no raw marker setup unsupported targets were observed',
  }
}

function makeZeroSemanticProofCloseout(): VirSemanticProofCloseout {
  return {
    status: 'pass',
    provenSupportedCount: 0,
    supportedButUnprovenCount: 0,
    unsupportedCount: 0,
    provenSupportedCaseNames: [],
    supportedButUnprovenCaseNames: [],
    unsupportedCaseNames: [],
    detail: 'no semantic proof cases were evaluated',
  }
}

function makeZeroAllocationCheckCloseout(): VirAllocationCheckCloseout {
  return {
    status: 'pass',
    allocationCheckFailureCount: 0,
    affectedCaseCount: 0,
    affectedFunctionCount: 0,
    affectedCaseNames: [],
    functionNamesAvailable: false,
    recommendation: 'allocation-check failures are currently clear',
    notes: 'function-level names are not captured from existing probe outputs',
  }
}

function normalizeRejectionCategoryCounts(
  source?: Partial<VirToLirDecisionReport['rejectionCategoryCounts']>,
): VirToLirDecisionReport['rejectionCategoryCounts'] {
  const totals = makeZeroRejectionCategoryTotals()
  if (!source) return totals

  for (const key of Object.keys(totals) as VirDecisionRejectionCategory[]) {
    const value = source[key]
    totals[key] = Number.isFinite(value as number) ? value as number : 0
  }
  return totals
}

function summarizeVirDecisionModeTotals(
  decision: VirToLirDecisionReport,
): VirDecisionModeTotals {
  const totals = makeZeroModeTotals()
  for (const item of decision.decisions) {
    if (item.status === 'accepted') {
      if (item.selectedMode === 'planned') totals.acceptedPlanned += 1
      else totals.acceptedDirect += 1
      continue
    }

    if (item.status === 'rejected' && item.selectedMode === 'direct') {
      totals.rejectedDirect += 1
      continue
    }
  }

  return totals
}

export function mergeRejectionCategoryTotals(
  out: VirToLirDecisionReport['rejectionCategoryCounts'],
  source?: Partial<VirToLirDecisionReport['rejectionCategoryCounts']>,
): void {
  const normalized = normalizeRejectionCategoryCounts(source)
  for (const key of Object.keys(out) as VirDecisionRejectionCategory[]) {
    out[key] += normalized[key]
  }
}

export function summarizeDeltaSeries(values: number[]): VirDecisionDeltaSummary {
  if (values.length === 0) {
    return makeZeroDeltaSummary()
  }

  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let total = 0
  let improvedCount = 0
  let regressedCount = 0
  let unchangedCount = 0

  for (const value of values) {
    min = Math.min(min, value)
    max = Math.max(max, value)
    total += value
    if (value < 0) {
      improvedCount += 1
    } else if (value > 0) {
      regressedCount += 1
    } else {
      unchangedCount += 1
    }
  }

  return {
    min,
    max,
    total,
    average: round(total / values.length),
    improvedCount,
    regressedCount,
    unchangedCount,
  }
}

function summarizeTopRejectionCategories(
  totals: VirToLirDecisionReport['rejectionCategoryCounts'],
): VirRejectionCategoryRank[] {
  return (Object.keys(totals) as VirDecisionRejectionCategory[]).map(category => ({
    category,
    count: totals[category],
  })).sort((left, right) => right.count - left.count || left.category.localeCompare(right.category))
}

function makeZeroUnsupportedReasonTotals(): { [tag: string]: number } {
  return {}
}

function mergeUnsupportedReasonTotals(
  out: { [tag: string]: number },
  values: string[],
): void {
  for (const reason of values) {
    out[reason] = (out[reason] ?? 0) + 1
  }
}

function summarizeTopUnsupportedReasons(unsupportedReasonTotals: { [tag: string]: number }): VirUnsupportedReasonRank[] {
  return Object.keys(unsupportedReasonTotals)
    .map(tag => ({
      reason: tag,
      count: unsupportedReasonTotals[tag],
    }))
    .filter(entry => entry.count > 0)
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
}

function summarizeUnsupportedReasonBreakdown(
  entries: VirCaseBlockerMatrixEntry[],
): VirUnsupportedReasonBreakdownEntry[] {
  const byReason = new Map<string, {
    count: number
    caseNames: Set<string>
    controlledCaseNames: Set<string>
    broadCaseNames: Set<string>
  }>()

  for (const entry of entries) {
    for (const reason of entry.unsupportedReasonTags) {
      const bucket = byReason.get(reason) ?? {
        count: 0,
        caseNames: new Set<string>(),
        controlledCaseNames: new Set<string>(),
        broadCaseNames: new Set<string>(),
      }
      bucket.count += 1
      bucket.caseNames.add(entry.caseName)
      if (entry.coverageCategory === 'controlled') {
        bucket.controlledCaseNames.add(entry.caseName)
      } else {
        bucket.broadCaseNames.add(entry.caseName)
      }
      byReason.set(reason, bucket)
    }
  }

  return [...byReason.entries()]
    .map(([reason, summary]) => ({
      reason,
      count: summary.count,
      caseNames: [...summary.caseNames].sort(),
      controlledCaseNames: [...summary.controlledCaseNames].sort(),
      broadCaseNames: [...summary.broadCaseNames].sort(),
    }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
}

function summarizeRawSummonMarkerSetupIsolation(
  family: VirUnsupportedMirCallTargetFamilyBreakdownEntry | undefined,
): VirRawSummonMarkerSetupIsolation {
  if (!family) {
    return makeZeroRawSummonMarkerSetupIsolation()
  }

  const broadCaseCount = family.broadCaseNames.length
  const controlledCaseCount = family.controlledCaseNames.length
  if (broadCaseCount > 0 && controlledCaseCount === 0) {
    return {
      status: 'isolated-structural-setup',
      caseCount: family.caseNames.length,
      caseNames: [...family.caseNames],
      broadCaseNames: [...family.broadCaseNames],
      controlledCaseNames: [...family.controlledCaseNames],
      exampleTargets: [...family.exampleTargets],
      semanticProofStatus: 'unsupported',
      recommendation: 'treat as fixture/setup boundary before call-lowering work',
      notes: 'all raw summon-marker-setup cases are currently broad-only',
    }
  }

  if (broadCaseCount === 0 && controlledCaseCount > 0) {
    return {
      status: 'true-arithmetic-blocker',
      caseCount: family.caseNames.length,
      caseNames: [...family.caseNames],
      broadCaseNames: [...family.broadCaseNames],
      controlledCaseNames: [...family.controlledCaseNames],
      exampleTargets: [...family.exampleTargets],
      semanticProofStatus: 'unsupported',
      recommendation: 'isolate benchmark cases that mix summon-marker setup with arithmetic control flow',
      notes: 'raw summon-marker-setup appears in controlled corpus and is not purely fixture setup',
    }
  }

  if (broadCaseCount > 0 && controlledCaseCount > 0) {
    return {
      status: 'mixed',
      caseCount: family.caseNames.length,
      caseNames: [...family.caseNames],
      broadCaseNames: [...family.broadCaseNames],
      controlledCaseNames: [...family.controlledCaseNames],
      exampleTargets: [...family.exampleTargets],
      semanticProofStatus: 'unsupported',
      recommendation: 'keep lane stopped until raw summon-marker-setup context is split into setup-only + arithmetic cases',
      notes: 'raw summon-marker-setup spans both controlled and broad cases',
    }
  }

  return {
    status: 'unknown',
    caseCount: family.caseNames.length,
    caseNames: [...family.caseNames],
    broadCaseNames: [...family.broadCaseNames],
    controlledCaseNames: [...family.controlledCaseNames],
    exampleTargets: [...family.exampleTargets],
    semanticProofStatus: 'unsupported',
    recommendation: 'do not infer fixture/semantic intent from current data',
    notes: 'case coverage was insufficient to determine raw summon-marker-setup purpose',
  }
}

function summarizeSemanticProofCloseout(
  semanticProofSummary: VirSemanticProofSummary,
  provenCaseNames: Set<string>,
  supportedButUnprovenCaseNames: Set<string>,
  unsupportedCaseNames: Set<string>,
): VirSemanticProofCloseout {
  const proven = [...provenCaseNames].sort()
  const unproven = [...supportedButUnprovenCaseNames].sort()
  const unsupported = [...unsupportedCaseNames].sort()
  const status: VirReadinessChecklistStatus = semanticProofSummary.unsupportedCount > 0
    ? 'fail'
    : semanticProofSummary.unprovenCount > 0
      ? 'warn'
      : 'pass'

  return {
    status,
    provenSupportedCount: semanticProofSummary.provenEquivalentCount,
    supportedButUnprovenCount: semanticProofSummary.unprovenCount,
    unsupportedCount: semanticProofSummary.unsupportedCount,
    provenSupportedCaseNames: proven,
    supportedButUnprovenCaseNames: unproven,
    unsupportedCaseNames: unsupported,
    detail:
      status === 'pass'
        ? 'all supported cases are proven and unsupported cases are excluded from proof counts'
        : status === 'warn'
          ? 'supported cases with unproven semantics remain open'
          : 'unsupported cases remain blockers and cannot count as semantic proof',
  }
}

function summarizeAllocationCheckCloseout(
  rejectionCategoryTotals: VirToLirDecisionReport['rejectionCategoryCounts'],
  allocationCheckCaseNames: Set<string>,
): VirAllocationCheckCloseout {
  const count = rejectionCategoryTotals.allocation_check_failed
  const status: VirReadinessChecklistStatus = count === 0 ? 'pass' : 'fail'
  const affectedCaseNames = [...allocationCheckCaseNames].sort()

  return {
    status,
    allocationCheckFailureCount: count,
    affectedCaseCount: affectedCaseNames.length,
    affectedFunctionCount: count,
    affectedCaseNames,
    functionNamesAvailable: false,
    recommendation: count === 0
      ? 'allocation-check blocker does not currently block planning evidence'
      : 'allocation-check failures remain a planner blocker until reduced or isolated',
    notes: 'function-level provenance is unavailable from current probe payload without invasive changes',
  }
}

function parseMirOpKindsFromReason(reason: string): string[] {
  const matches = Array.from(reason.matchAll(/unsupported instruction '([^']+)' in /g))
  const kinds = matches.map(match => match[1]).filter((kind): kind is string => kind.length > 0)
  return [...new Set(kinds)].sort()
}

function classifyMirCallTarget(target: VirUnsupportedMirCallTarget): VirUnsupportedMirCallTarget {
  if (target.targetKind === 'raw-command' || target.targetKind === 'function') {
    return {
      ...target,
      targetFamily: target.targetFamily
        ?? (target.targetKind === 'raw-command'
          ? (target.rawCommandKind === 'summon-marker-setup'
            ? 'raw:summon-marker-setup'
            : target.rawCommandKind === 'execute-raw'
              ? 'raw:execute-raw'
              : 'raw:other-raw')
          : `function:${target.fn}`),
      displayName: target.displayName ?? target.fn,
    }
  }

  const isRaw = target.fn.startsWith('__raw:')
  if (!isRaw) {
    return {
      ...target,
      targetKind: 'function',
      targetFamily: `function:${target.fn}`,
      displayName: target.fn,
    }
  }

  const rawCommand = target.fn.slice('__raw:'.length).trim()
  const normalizedRawCommand = rawCommand.toLowerCase()
  const isSummonMarkerSetup = normalizedRawCommand.includes('summon minecraft:marker') && normalizedRawCommand.includes('rs_trig')
  const isExecute = normalizedRawCommand.startsWith('execute ')
  const rawCommandKind: 'summon-marker-setup' | 'execute-raw' | 'other-raw' = isSummonMarkerSetup
    ? 'summon-marker-setup'
    : isExecute
      ? 'execute-raw'
      : 'other-raw'

  const family = rawCommandKind === 'summon-marker-setup'
    ? 'raw:summon-marker-setup'
    : rawCommandKind === 'execute-raw'
      ? 'raw:execute-raw'
      : 'raw:other-raw'

  return {
    ...target,
    targetKind: 'raw-command',
    rawCommandKind,
    targetFamily: family,
    displayName: rawCommand,
  }
}

function normalizeMirCallTargetList(targets: VirUnsupportedMirCallTarget[]): VirUnsupportedMirCallTarget[] {
  const dedup = new Map<string, VirUnsupportedMirCallTarget>()
  for (const target of targets) {
    const normalized = classifyMirCallTarget(target)
    const key = `${normalized.fn}|${normalized.argCount}|${normalized.hasResult ? 'yes' : 'no'}`
    if (!dedup.has(key)) {
      dedup.set(key, normalized)
    }
  }

  return [...dedup.values()].sort((left, right) => (
    left.fn.localeCompare(right.fn) || left.argCount - right.argCount || Number(right.hasResult) - Number(left.hasResult)
  ))
}

function parseMirCallTargetsFromReason(reason: string): VirUnsupportedMirCallTarget[] {
  if (!/unsupported instruction 'call'/.test(reason)) return []

  const matches = Array.from(reason.matchAll(/fn='([^']+)'[^\n]*/g))
  const targets = [] as VirUnsupportedMirCallTarget[]

  for (const match of matches) {
    const fn = (match[1] ?? '').trim()
    if (!fn) continue

    const tail = match[0] ?? ''
    const argMatch = /args=([0-9]+)/.exec(tail)
    const hasResultMatch = /hasResult=(true|false)/i.exec(tail)
    if (!argMatch || !hasResultMatch) continue

    const argCount = Number(argMatch[1])
    if (!Number.isFinite(argCount)) continue

    targets.push({
      fn,
      argCount,
      hasResult: hasResultMatch[1].toLowerCase() === 'true',
    })
  }

  const uniqueTargets = new Map<string, VirUnsupportedMirCallTarget>()
  for (const target of targets) {
    const key = `${target.fn}|${target.argCount}|${target.hasResult ? 'yes' : 'no'}`
    if (!uniqueTargets.has(key)) {
      uniqueTargets.set(key, target)
    }
  }

  return normalizeMirCallTargetList([...uniqueTargets.values()])
}

function summarizeUnsupportedMirCallTargetsFromDecision(
  decision: ArithmeticProbeResult['virDecision'],
): VirUnsupportedMirCallTarget[] {
  if (!decision) return []

  const explicit = decision.unsupportedMirCallTargets ?? []
  if (explicit.length > 0) return normalizeMirCallTargetList(explicit)

  const reason = decision.unsupportedReason ?? ''
  return parseMirCallTargetsFromReason(reason)
}

function summarizeUnsupportedMirOpKindsFromDecision(
  decision: ArithmeticProbeResult['virDecision'],
): string[] {
  if (!decision) return []

  if (Array.isArray(decision.unsupportedMirOpKinds) && decision.unsupportedMirOpKinds.length > 0) {
    return [...new Set(decision.unsupportedMirOpKinds)].sort()
  }

  const reason = decision.unsupportedReason ?? ''
  if (!/unsupported instruction '([^']+)'/.test(reason)) return []

  return parseMirOpKindsFromReason(reason)
}

function summarizeUnsupportedMirCallTargetBreakdown(
  entries: VirCaseBlockerMatrixEntry[],
): VirUnsupportedMirCallTargetBreakdownEntry[] {
  const byFn = new Map<string, {
    count: number
    caseNames: Set<string>
    controlledCaseNames: Set<string>
    broadCaseNames: Set<string>
    argCounts: Set<number>
    hasResultCount: number
    noResultCount: number
  }>()

  for (const entry of entries) {
    if (!entry.unsupportedMirCallTargets || entry.unsupportedMirCallTargets.length === 0) continue

    const seen = new Set<string>()
    for (const target of entry.unsupportedMirCallTargets) {
      const key = `${target.fn}|${target.argCount}|${target.hasResult ? 'yes' : 'no'}`
      if (seen.has(key)) continue
      seen.add(key)

      const bucket = byFn.get(target.fn) ?? {
        count: 0,
        caseNames: new Set<string>(),
        controlledCaseNames: new Set<string>(),
        broadCaseNames: new Set<string>(),
        argCounts: new Set<number>(),
        hasResultCount: 0,
        noResultCount: 0,
      }
      bucket.count += 1
      bucket.caseNames.add(entry.caseName)
      bucket.argCounts.add(target.argCount)
      if (target.hasResult) {
        bucket.hasResultCount += 1
      } else {
        bucket.noResultCount += 1
      }
      if (entry.coverageCategory === 'controlled') {
        bucket.controlledCaseNames.add(entry.caseName)
      } else {
        bucket.broadCaseNames.add(entry.caseName)
      }
      byFn.set(target.fn, bucket)
    }
  }

  return [...byFn.entries()]
    .map(([fn, summary]) => ({
      fn,
      count: summary.count,
      caseNames: [...summary.caseNames].sort(),
      controlledCaseNames: [...summary.controlledCaseNames].sort(),
      broadCaseNames: [...summary.broadCaseNames].sort(),
      argCounts: [...summary.argCounts].sort((left, right) => left - right),
      hasResultCount: summary.hasResultCount,
      noResultCount: summary.noResultCount,
    }))
    .sort((left, right) => right.count - left.count || left.fn.localeCompare(right.fn))
}

function summarizeUnsupportedMirCallTargetFamilyBreakdown(
  entries: VirCaseBlockerMatrixEntry[],
): VirUnsupportedMirCallTargetFamilyBreakdownEntry[] {
  const byFamily = new Map<string, {
    count: number
    targetKinds: Set<string>
    rawCommandKinds: Set<string>
    caseNames: Set<string>
    controlledCaseNames: Set<string>
    broadCaseNames: Set<string>
    exampleTargets: string[]
  }>()

  for (const entry of entries) {
    if (!entry.unsupportedMirCallTargets || entry.unsupportedMirCallTargets.length === 0) continue
    const seen = new Set<string>()
    for (const target of entry.unsupportedMirCallTargets) {
      const classified = classifyMirCallTarget(target)
      const family = classified.targetFamily ?? `function:${classified.fn}`
      if (seen.has(family)) continue
      seen.add(family)

      const bucket = byFamily.get(family) ?? {
        count: 0,
        targetKinds: new Set<string>(),
        rawCommandKinds: new Set<string>(),
        caseNames: new Set<string>(),
        controlledCaseNames: new Set<string>(),
        broadCaseNames: new Set<string>(),
        exampleTargets: [],
      }
      bucket.count += 1
      bucket.caseNames.add(entry.caseName)
      bucket.targetKinds.add(classified.targetKind ?? (classified.fn.startsWith('__raw:') ? 'raw-command' : 'function'))
      if (classified.targetKind === 'raw-command' && classified.rawCommandKind) {
        bucket.rawCommandKinds.add(classified.rawCommandKind)
      }
      if (entry.coverageCategory === 'controlled') {
        bucket.controlledCaseNames.add(entry.caseName)
      } else {
        bucket.broadCaseNames.add(entry.caseName)
      }
      if (bucket.exampleTargets.length < 3 && !bucket.exampleTargets.includes(classified.fn)) {
        bucket.exampleTargets.push(classified.fn)
      }
      byFamily.set(family, bucket)
    }
  }

  return [...byFamily.entries()]
    .map(([family, summary]) => ({
      family,
      count: summary.count,
      targetKinds: [...summary.targetKinds].sort(),
      rawCommandKinds: [...summary.rawCommandKinds].sort(),
      caseNames: [...summary.caseNames].sort(),
      controlledCaseNames: [...summary.controlledCaseNames].sort(),
      broadCaseNames: [...summary.broadCaseNames].sort(),
      exampleTargets: summary.exampleTargets,
    }))
    .sort((left, right) => right.count - left.count || left.family.localeCompare(right.family))
}

function summarizeUnsupportedMirOpKindBreakdown(
  entries: VirCaseBlockerMatrixEntry[],
): VirUnsupportedMirOpKindBreakdownEntry[] {
  const byOpKind = new Map<string, {
    count: number
    caseNames: Set<string>
    controlledCaseNames: Set<string>
    broadCaseNames: Set<string>
  }>()

  for (const entry of entries) {
    for (const opKind of entry.unsupportedMirOpKinds ?? []) {
      const bucket = byOpKind.get(opKind) ?? {
        count: 0,
        caseNames: new Set<string>(),
        controlledCaseNames: new Set<string>(),
        broadCaseNames: new Set<string>(),
      }
      bucket.count += 1
      bucket.caseNames.add(entry.caseName)
      if (entry.coverageCategory === 'controlled') {
        bucket.controlledCaseNames.add(entry.caseName)
      } else {
        bucket.broadCaseNames.add(entry.caseName)
      }
      byOpKind.set(opKind, bucket)
    }
  }

  return [...byOpKind.entries()]
    .map(([opKind, summary]) => ({
      opKind,
      count: summary.count,
      caseNames: [...summary.caseNames].sort(),
      controlledCaseNames: [...summary.controlledCaseNames].sort(),
      broadCaseNames: [...summary.broadCaseNames].sort(),
    }))
    .sort((left, right) => right.count - left.count || left.opKind.localeCompare(right.opKind))
}

function resolveDecisionProofStatus(decision: ArithmeticProbeResult['virDecision']): VirArithmeticSemanticProofStatus {
  if (!decision) return 'unsupported'
  if (decision.status === 'unsupported') return 'unsupported'
  if (decision.semanticProofStatus === 'proven') return 'proven'
  if (decision.semanticProofStatus === 'unsupported') return 'unsupported'
  if (decision.semanticProofStatus === 'unproven') return 'unproven'
  return 'unproven'
}

function summarizeUnsupportedReasonTagsFromText(reason: string): VirUnsupportedReasonTag[] {
  const normalized = reason.toLowerCase()
  const tags = new Set<string>()

  if (/unsupported macro function/.test(normalized) || /\bunsupported\s+call\b/.test(normalized)) {
    tags.add('unsupported-call-boundary')
  }

  if (/\bunsupported (?:mir|command|operation)\b/.test(normalized) || /unsupported instruction/.test(normalized)) {
    tags.add('unsupported-mir-op-kind')
  }

  if (/\bunsupported [^'"]*op\b/.test(normalized) || /\bunsupported [^'"]*instruction\b/.test(normalized)) {
    tags.add('unsupported-mir-op-kind')
  }

  if (/\bmissing (?:binary|source|source) operand\b/.test(normalized)
    || /uses? invalid operand/.test(normalized)
    || /invalid result/.test(normalized)
    || /unexpected result/.test(normalized)
    || /undeclared/.test(normalized)
    || /value shape/.test(normalized)
    || /mismatch/.test(normalized)) {
    tags.add('unsupported-operand-shape')
  }

  if (/multi-?block|non-return|terminator|entry block|missing entry block|does not terminate|no operations|control flow/.test(normalized)) {
    tags.add('unsupported-control-flow-shape')
  }

  if (/planned allocation check failed/.test(normalized) || /allocation-check failed/.test(normalized)) {
    tags.add('allocation-check-failure')
  }

  if (/planned slotting unsupported|planned emission failed/.test(normalized)) {
    tags.add('planned-lowering-unsupported')
  }

  if (/planned instruction estimate/.test(normalized)) {
    tags.add('direct-higher-cost')
  }

  if (tags.size === 0) {
    tags.add('unsupported-unknown')
  }

  return [...tags].sort() as VirUnsupportedReasonTag[]
}

const REJECTION_CATEGORY_TAGS: Partial<Record<VirDecisionRejectionCategory, VirUnsupportedReasonTag[]>> = {
  planned_unsupported: ['planned-lowering-unsupported'],
  allocation_check_failed: ['allocation-check-failure', 'planned-lowering-unsupported'],
  higher_cost: ['direct-higher-cost'],
  direct_unsupported: ['direct-lowering-unsupported'],
  unsupported_both: ['unsupported-both-modes'],
}

function summarizeUnsupportedReasonTagsFromPlanDecision(
  functionDecision: VirFunctionLoweringDecision,
): VirUnsupportedReasonTag[] {
  const tags = new Set<VirUnsupportedReasonTag>(functionDecision.rejectionReasonTags ?? [])
  if (functionDecision.rejectionReasonTags && functionDecision.rejectionReasonTags.length > 0) {
    for (const tag of functionDecision.rejectionReasonTags) tags.add(tag)
    return [...tags].sort()
  }

  if (!functionDecision.rejectionCategory && !functionDecision.rejectionReason) {
    return []
  }

  if (functionDecision.rejectionCategory) {
    for (const tag of REJECTION_CATEGORY_TAGS[functionDecision.rejectionCategory] ?? []) {
      tags.add(tag)
    }
  }

  if (functionDecision.rejectionReason) {
    for (const tag of summarizeUnsupportedReasonTagsFromText(functionDecision.rejectionReason)) {
      tags.add(tag)
    }
  }

  return [...tags].sort()
}

function summarizeCaseProofStatus(
  decision: ArithmeticProbeResult['virDecision'],
): VirSemanticProofSummary {
  const summary = makeZeroSemanticProofSummary()
  if (!decision) return summary
  if (decision.status === 'unsupported' || decision.semanticProofStatus === 'unsupported') {
    summary.unsupportedCount += 1
    return summary
  }
  if (decision.semanticProofStatus === 'proven') {
    summary.provenEquivalentCount += 1
    return summary
  }
  summary.unprovenCount += 1
  summary.missingProofCount += 1
  return summary
}

function pickCaseRejectionCategory(
  decision: ArithmeticProbeResult['virDecision'],
): VirDecisionRejectionCategory | undefined {
  if (!decision) return undefined
  const ranked = summarizeTopRejectionCategories(decision.rejectionCategoryCounts)
  const top = ranked.find(entry => entry.count > 0)
  return top?.category
}

function buildCaseBlockerTags(
  decision: ArithmeticProbeResult['virDecision'],
  unsupportedReasonTags: VirUnsupportedReasonTag[],
  semanticProofStatus: VirArithmeticSemanticProofStatus,
): string[] {
  const blockers: string[] = []
  if (!decision || decision.status === 'unsupported') {
    blockers.push('case-unsupported')
  }
  if (semanticProofStatus === 'unsupported' || semanticProofStatus === 'unproven') {
    blockers.push('proof-gap')
  }
  if (decision?.rejectionCategory) {
    blockers.push(`rejection:${decision.rejectionCategory}`)
  }
  for (const reasonTag of unsupportedReasonTags) {
    blockers.push(`reason:${reasonTag}`)
  }
  return blockers.sort()
}

function mergeBlockerTagTotals(
  out: { [tag: string]: number },
  tags: string[],
): void {
  for (const tag of tags) {
    out[tag] = (out[tag] ?? 0) + 1
  }
}

function summarizeCorpusCoverageSummary(cases: ArithmeticProbeResult[]): VirCorpusCoverageSummary {
  const seenCaseCategory = new Map<string, 'controlled' | 'broad'>()

  for (const result of cases) {
    if (!seenCaseCategory.has(result.case)) {
      seenCaseCategory.set(result.case, result.coverageCategory)
    }
  }

  const controlledProbeNames = [...seenCaseCategory.entries()]
    .filter(([, coverageCategory]) => coverageCategory === 'controlled')
    .map(([probeName]) => probeName)
    .sort()
  const broadProbeNames = [...seenCaseCategory.entries()]
    .filter(([, coverageCategory]) => coverageCategory === 'broad')
    .map(([probeName]) => probeName)
    .sort()

  return {
    totalCaseCount: seenCaseCategory.size,
    controlledCaseCount: controlledProbeNames.length,
    broadCaseCount: broadProbeNames.length,
    controlledProbeNames,
    broadProbeNames,
  }
}

function summarizeDecisionUnsupportedReasonTags(decision: VirToLirDecisionReport): VirUnsupportedReasonTag[] {
  const tags = new Set<VirUnsupportedReasonTag>()

  for (const functionDecision of decision.decisions) {
    const reasonTags = summarizeUnsupportedReasonTagsFromPlanDecision(functionDecision)
    for (const reasonTag of reasonTags) {
      tags.add(reasonTag)
    }
  }

  if (decision.unsupportedReason) {
    for (const reasonTag of summarizeUnsupportedReasonTagsFromText(decision.unsupportedReason)) {
      tags.add(reasonTag)
    }
  }

  return [...tags].sort()
}

function summarizeReadinessChecklist(
  totals: Omit<
  VirArithmeticDecisionAggregate,
  'goNoGoStatus' | 'status' | 'statusReason' | 'recommendationReason' | 'topRejectionCategories' | 'blockers' | 'nextSafeGoals' | 'unsupportedReasonTotals' | 'topUnsupportedReasons' | 'blockerTagTotals' | 'supportedProbeNames' | 'unsupportedProbeNames' | 'corpusCoverageSummary' | 'unsupportedReasonBreakdown' | 'unsupportedMirOpKindBreakdown' | 'unsupportedMirCallTargetBreakdown' | 'unsupportedMirCallTargetFamilyBreakdown' | 'caseBlockerMatrix' | 'readinessChecklist' | 'unknownReasonCaseNames' | 'unknownMirCallTargetCaseNames'
    | 'rawSummonMarkerSetupIsolation' | 'semanticProofCloseout' | 'allocationCheckCloseout'
  >,
  unknownReasonCaseNames: string[],
  unknownMirCallTargetCaseNames: string[],
  rawSummonMarkerSetupIsolation?: VirRawSummonMarkerSetupIsolation,
  semanticProofCloseout?: VirSemanticProofCloseout,
  allocationCheckCloseout?: VirAllocationCheckCloseout,
  thresholds: VirArithmeticDecisionThresholds = VIR_ARITHMETIC_DECISION_THRESHOLDS,
): VirReadinessChecklistItem[] {
  const check = (
    id: string,
    status: VirReadinessChecklistStatus,
    detail: string,
  ): VirReadinessChecklistItem => ({
    id,
    status,
    detail,
  })

  const consideredCases = totals.consideredCases ?? totals.totalCaseCount
  const consideredFunctions = totals.consideredFunctions ?? totals.totalFunctionCount
  const supportedCases = totals.supportedCases ?? 0
  const plannedAcceptedCases = totals.acceptedPlannedCases ?? totals.plannedAcceptedFunctionCount
  const rejectedDirectCases = totals.rejectedDirectCases ?? 0
  const unsupportedCases = totals.unsupportedCases ?? totals.unsupportedCaseCount
  const unsupportedFunctions = totals.unsupportedFunctionCount
  const unsupportedCaseRatio = consideredCases <= 0 ? 0 : unsupportedCases / consideredCases
  const unsupportedFunctionRatio = consideredFunctions <= 0 ? 0 : unsupportedFunctions / consideredFunctions
  const commandRegrCount = totals.commandDeltaSummary?.regressedCount ?? 0
  const scoreRegrCount = totals.scoreCopyDeltaSummary?.regressedCount ?? 0
  const supportedRatio = consideredCases <= 0 ? 0 : supportedCases / consideredCases
  const provenEquivalentCases = totals.semanticProofSummary?.provenEquivalentCount ?? 0
  const proofRatio = supportedCases <= 0 ? 0 : provenEquivalentCases / supportedCases
  const directRejectionDominance = supportedCases <= 0 ? 0 : rejectedDirectCases / supportedCases

  const checklist: VirReadinessChecklistItem[] = []

  if (consideredCases <= 0) {
    checklist.push(check('no-considered-cases', 'fail', 'no data points were considered'))
    return checklist
  }

  checklist.push(
    unsupportedCases > 0 || unsupportedCaseRatio > thresholds.maxUnsupportedCaseRatio
      ? check(
        'unsupported-case-coverage',
        'fail',
        `unsupported cases: ${unsupportedCases}/${consideredCases}`,
      )
      : check(
        'unsupported-case-coverage',
        'pass',
        `unsupported cases: ${unsupportedCases}/${consideredCases}`,
      ),
  )

  checklist.push(
    unsupportedFunctions > 0 || unsupportedFunctionRatio > thresholds.maxUnsupportedFunctionRatio
      ? check(
        'unsupported-function-lowering',
        'fail',
        `unsupported functions: ${unsupportedFunctions}/${consideredFunctions}`,
      )
      : check(
        'unsupported-function-lowering',
        'pass',
        `unsupported functions: ${unsupportedFunctions}/${consideredFunctions}`,
      ),
  )

  checklist.push(
    totals.rejectionCategoryTotals.allocation_check_failed > thresholds.maxAllocationFailureCount
      ? check(
        'allocation-check-failures',
        'fail',
        `allocation-check failures: ${totals.rejectionCategoryTotals.allocation_check_failed}`,
      )
      : check(
        'allocation-check-failures',
        'pass',
        `allocation-check failures: ${totals.rejectionCategoryTotals.allocation_check_failed}`,
      ),
  )

  checklist.push(
    totals.totalFunctionCount <= 0 || supportedCases <= 0
      ? check('supported-cases', 'fail', `supported cases: ${supportedCases}`)
      : check('supported-cases', 'pass', `supported cases: ${supportedCases}`),
  )

  checklist.push(
    supportedCases < thresholds.minSupportedCases
      ? check(
        'insufficient-supported-cases',
        'fail',
        `supported cases below minimum: ${supportedCases}/${thresholds.minSupportedCases}`,
      )
      : supportedRatio < thresholds.minSupportedCaseRatio
        ? check(
          'unsupported-supported-ratio',
          'fail',
          `supported ratio ${Math.round(supportedRatio * 100)}% < ${Math.round(thresholds.minSupportedCaseRatio * 100)}%`,
        )
        : check('unsupported-supported-ratio', 'pass', 'supported ratio requirement met'),
  )

  checklist.push(
    commandRegrCount > thresholds.maxRegressedCommandCaseCount
      ? check(
        'command-regressions',
        'warn',
        `command regression cases ${commandRegrCount}/${thresholds.maxRegressedCommandCaseCount}`,
      )
      : check(
        'command-regressions',
        'pass',
        `command regression cases ${commandRegrCount}/${thresholds.maxRegressedCommandCaseCount}`,
      ),
  )

  checklist.push(
    scoreRegrCount > thresholds.maxRegressedScoreCopyCaseCount
      ? check(
        'score-copy-regressions',
        'warn',
        `score-copy regression cases ${scoreRegrCount}/${thresholds.maxRegressedScoreCopyCaseCount}`,
      )
      : check(
        'score-copy-regressions',
        'pass',
        `score-copy regression cases ${scoreRegrCount}/${thresholds.maxRegressedScoreCopyCaseCount}`,
      ),
  )

  checklist.push(
    (totals.semanticProofSummary?.unsupportedCount ?? 0) > 0
      ? check('semantic-proof-gap', 'fail', `semantic proof unsupported: ${totals.semanticProofSummary.unsupportedCount}`)
      : check('semantic-proof-gap', 'pass', 'semantic proof complete for unsupported cases'),
  )

  checklist.push(
    provenEquivalentCases < thresholds.minProvenEquivalentCases
      ? check(
        'insufficient-proven-cases',
        'fail',
        `proven cases below minimum: ${provenEquivalentCases}/${thresholds.minProvenEquivalentCases}`,
      )
      : proofRatio < thresholds.minProvenEquivalentRatio
        ? check(
          'unproven-cases',
          'warn',
          `proven ratio ${Math.round(proofRatio * 100)}% < ${Math.round(thresholds.minProvenEquivalentRatio * 100)}%`,
        )
        : check('unproven-cases', 'pass', 'proof-ratio requirement met'),
  )

  checklist.push(
    directRejectionDominance > thresholds.maxDirectRejectionDominanceRatio
      ? check(
        'direct-rejection-dominance',
        'fail',
        `direct rejection dominance ${Math.round(directRejectionDominance * 100)}% > ${Math.round(thresholds.maxDirectRejectionDominanceRatio * 100)}%`,
      )
      : check(
        'direct-rejection-dominance',
        'pass',
        `direct rejection dominance ${Math.round(directRejectionDominance * 100)}% <= ${Math.round(thresholds.maxDirectRejectionDominanceRatio * 100)}%`,
      ),
  )

  checklist.push(
    plannedAcceptedCases < totals.totalCaseCount
      ? check(
        'non-planned-coverage',
        'warn',
        `planned acceptance ${plannedAcceptedCases}/${totals.totalCaseCount}`,
      )
      : check('non-planned-coverage', 'pass', `planned acceptance ${plannedAcceptedCases}/${totals.totalCaseCount}`),
  )

  checklist.push(
    unknownReasonCaseNames.length > 0
      ? check(
        'unknown-reason-cases',
        'warn',
        `unknown reason cases: ${unknownReasonCaseNames.length}/${totals.totalCaseCount}`,
      )
      : check('unknown-reason-cases', 'pass', 'no unknown reason cases'),
  )

  checklist.push(
    unknownMirCallTargetCaseNames.length > 0
      ? check(
        'unknown-call-target-details',
        'warn',
        `missing call target details for ${unknownMirCallTargetCaseNames.length}/${totals.totalCaseCount} case(s)`,
      )
      : check('unknown-call-target-details', 'pass', 'call target details captured for call blockers'),
  )

  if (rawSummonMarkerSetupIsolation) {
    const status = rawSummonMarkerSetupIsolation.status === 'none'
      || rawSummonMarkerSetupIsolation.status === 'isolated-structural-setup'
      ? 'pass'
      : rawSummonMarkerSetupIsolation.status === 'unknown'
        ? 'warn'
        : 'fail'
    const detail = rawSummonMarkerSetupIsolation.caseCount === 0
      ? 'raw summon-marker-setup call targets are not present in blocked cases'
      : rawSummonMarkerSetupIsolation.status === 'true-arithmetic-blocker'
        ? 'raw summon-marker-setup remains mixed with arithmetic-dependent unsupported cases'
        : rawSummonMarkerSetupIsolation.status === 'mixed'
          ? 'raw summon-marker-setup appears in both controlled and broad unsupported contexts'
          : rawSummonMarkerSetupIsolation.recommendation
    checklist.push(check('raw-summon-marker-setup-isolation', status, detail))
  }

  if (semanticProofCloseout) {
    checklist.push(check('semantic-proof-closeout', semanticProofCloseout.status, semanticProofCloseout.detail))
  }

  if (allocationCheckCloseout) {
    const detail = allocationCheckCloseout.allocationCheckFailureCount === 0
      ? `allocation-check closeout: ${allocationCheckCloseout.allocationCheckFailureCount}`
      : `allocation-check closeout: ${allocationCheckCloseout.allocationCheckFailureCount} across ${allocationCheckCloseout.affectedCaseCount} case(s)`
    checklist.push(check('allocation-check-closeout', allocationCheckCloseout.status, detail))
  }

  return checklist
}

function summarizeNextSafeGoals(
  gate: VirDecisionGateSummary,
  readinessChecklist: VirReadinessChecklistItem[],
  unknownReasonCaseNames: string[],
  unsupportedReasonBreakdown: VirUnsupportedReasonBreakdownEntry[],
  unsupportedMirOpKindBreakdown: VirUnsupportedMirOpKindBreakdownEntry[],
  unsupportedMirCallTargetBreakdown: VirUnsupportedMirCallTargetBreakdownEntry[],
  unsupportedMirCallTargetFamilyBreakdown: VirUnsupportedMirCallTargetFamilyBreakdownEntry[],
  rawSummonMarkerSetupIsolation?: VirRawSummonMarkerSetupIsolation,
  semanticProofCloseout?: VirSemanticProofCloseout,
  allocationCheckCloseout?: VirAllocationCheckCloseout,
): string[] {
  const failIds = readinessChecklist
    .filter(item => item.status === 'fail')
    .map(item => item.id)
  const warnIds = readinessChecklist
    .filter(item => item.status === 'warn')
    .map(item => item.id)

  if (gate.status === 'continue') {
    return [
      'add experimental semantic proof assertions on a controlled opcode family',
      'expand controlled arithmetic corpus to stress planner edge cases',
    ]
  }

  const topReason = unsupportedReasonBreakdown[0]?.reason
  const topMirOpKind = unsupportedMirOpKindBreakdown[0]?.opKind
  const topCallTargetFamily = unsupportedMirCallTargetFamilyBreakdown[0]?.family
  const topCallTarget = unsupportedMirCallTargetBreakdown[0]?.fn
  const goals: string[] = []
  if (failIds.includes('unsupported-case-coverage')) {
    const rawSummonSetupIsolated = topCallTargetFamily === 'raw:summon-marker-setup'
      && rawSummonMarkerSetupIsolation?.status === 'isolated-structural-setup'
    if (rawSummonSetupIsolated) {
      goals.push('decide whether to split setup-only raw:summon-marker-setup cases from the arithmetic VIR corpus')
    } else if (topReason === 'unsupported-mir-op-kind' && topMirOpKind === 'call' && topCallTargetFamily) {
      goals.push(`isolate unsupported MIR call target family: ${topCallTargetFamily}`)
    } else if (topReason === 'unsupported-mir-op-kind' && topMirOpKind === 'call' && topCallTarget) {
      goals.push(`isolate unsupported MIR call target: ${topCallTarget}`)
    } else if (topReason === 'unsupported-mir-op-kind' && topMirOpKind) {
      goals.push(`eliminate or isolate blocker MIR opcode kind: ${topMirOpKind}`)
    } else {
      goals.push(topReason
        ? `eliminate or isolate blocker case reason: ${topReason}`
        : 'eliminate unsupported case coverage blockers')
    }
  }
  if (failIds.includes('semantic-proof-gap')) {
    goals.push('close semantic-proof gaps for supported probes before any continuation')
  }
  if (failIds.includes('allocation-check-failures')) {
    goals.push('reduce planned allocation-check failures in planner output')
  }
  if (failIds.includes('allocation-check-closeout') || allocationCheckCloseout?.status === 'fail') {
    goals.push('reduce planned allocation-check failures in planner output')
  }
  if (failIds.includes('semantic-proof-closeout') || semanticProofCloseout?.status === 'warn' || semanticProofCloseout?.status === 'fail') {
    goals.push('close semantic-proof gaps for supported probes before any continuation')
  }
  if (failIds.includes('raw-summon-marker-setup-isolation') || rawSummonMarkerSetupIsolation?.status === 'mixed' || rawSummonMarkerSetupIsolation?.status === 'true-arithmetic-blocker') {
    goals.push('verify raw:summon-marker-setup isolation before any continuation')
  }
  if (rawSummonMarkerSetupIsolation?.status === 'unknown') {
    goals.push('split raw:summon-marker-setup evidence into deterministic controlled/broad sets')
  }
  if (failIds.includes('unsupported-function-lowering')) {
    goals.push('remove unsupported-function-lowering blockers with fallback-safe mode coverage')
  }
  if (failIds.includes('direct-rejection-dominance')) {
    goals.push('reduce direct rejection dominance by expanding planned mode coverage')
  }
  if (goals.length < 3 && unknownReasonCaseNames.length > 0 && failIds.includes('unknown-reason-cases')) {
    goals.push('replace unknown reason strings with deterministic blocker tags')
  }
  if (goals.length < 3 && warnIds.includes('command-regressions')) {
    goals.push('improve planned command regression behavior to avoid command deltas > 0')
  }
  if (goals.length < 3 && warnIds.includes('score-copy-regressions')) {
    goals.push('increase planned score-copy reduction in all supported cases')
  }
  if (goals.length < 3 && failIds.includes('allocation-check-failures')) {
    goals.push('stabilize allocation-check handling for shared scratch/copy patterns')
  }
  if (goals.length < 3 && failIds.includes('unsupported-supported-ratio')) {
    goals.push('raise supported ratio to meet minimum required threshold')
  }

  return goals.slice(0, 3)
}

interface VirDecisionGateSummary {
  status: VirArithmeticDecisionStatus
  statusReason: string
  recommendationReason: string
  blockers: string[]
  readinessChecklist: VirReadinessChecklistItem[]
}

function summarizeVirDecisionGate(
  totals: Omit<
  VirArithmeticDecisionAggregate,
    'goNoGoStatus' | 'status' | 'statusReason' | 'recommendationReason' | 'topRejectionCategories' | 'blockers' | 'nextSafeGoals' | 'unsupportedReasonTotals' | 'topUnsupportedReasons' | 'blockerTagTotals' | 'supportedProbeNames' | 'unsupportedProbeNames' | 'corpusCoverageSummary' | 'unsupportedReasonBreakdown' | 'unsupportedMirOpKindBreakdown' | 'unsupportedMirCallTargetBreakdown' | 'unsupportedMirCallTargetFamilyBreakdown' | 'caseBlockerMatrix' | 'readinessChecklist' | 'unknownReasonCaseNames' | 'unknownMirCallTargetCaseNames'
    | 'rawSummonMarkerSetupIsolation' | 'semanticProofCloseout' | 'allocationCheckCloseout'
  >,
  thresholds: VirArithmeticDecisionThresholds = VIR_ARITHMETIC_DECISION_THRESHOLDS,
  unknownReasonCaseNames: string[] = [],
  unknownMirCallTargetCaseNames: string[] = [],
  rawSummonMarkerSetupIsolation?: VirRawSummonMarkerSetupIsolation,
  semanticProofCloseout?: VirSemanticProofCloseout,
  allocationCheckCloseout?: VirAllocationCheckCloseout,
): VirDecisionGateSummary {
  const readinessChecklist = summarizeReadinessChecklist(
    totals,
    unknownReasonCaseNames,
    unknownMirCallTargetCaseNames,
    rawSummonMarkerSetupIsolation,
    semanticProofCloseout,
    allocationCheckCloseout,
    thresholds,
  )
  const blockers = readinessChecklist
    .filter(item => item.status === 'fail')
    .map(item => item.id)
  const warningReasons = readinessChecklist
    .filter(item => item.status === 'warn')
    .map(item => item.detail)
  const statusReasons = readinessChecklist
    .filter(item => item.status === 'fail')
    .map(item => item.detail)
  const status: VirArithmeticDecisionStatus = blockers.length > 0
    ? 'stay-experimental'
    : warningReasons.length > 0
      ? 'pause'
      : 'continue'
  const statusReason = status === 'continue'
    ? 'no blocking hard condition'
    : status === 'pause'
      ? warningReasons.join('; ')
      : statusReasons.join('; ')
  const recommendationReason = status === 'continue'
    ? 'continue: evidence gate passes conservative criteria'
    : status === 'pause'
      ? `pause: improve command/score-copy trend; ${warningReasons.join('; ')}`
      : `stay-experimental: ${statusReasons.join('; ')}`

  return {
    status,
    statusReason,
    recommendationReason,
    blockers: [...new Set(blockers)].sort(),
    readinessChecklist,
  }
}

export function evaluateVirDecisionGoNoGoStatus(
  totals: Omit<
  VirArithmeticDecisionAggregate,
  'goNoGoStatus' | 'status' | 'statusReason' | 'recommendationReason' | 'topRejectionCategories' | 'blockers' | 'nextSafeGoals' | 'unsupportedReasonTotals' | 'topUnsupportedReasons' | 'blockerTagTotals' | 'supportedProbeNames' | 'unsupportedProbeNames' | 'corpusCoverageSummary'
    | 'unsupportedReasonBreakdown' | 'unsupportedMirOpKindBreakdown' | 'unsupportedMirCallTargetBreakdown' | 'unsupportedMirCallTargetFamilyBreakdown' | 'caseBlockerMatrix' | 'readinessChecklist' | 'unknownReasonCaseNames' | 'unknownMirCallTargetCaseNames'
    | 'rawSummonMarkerSetupIsolation' | 'semanticProofCloseout' | 'allocationCheckCloseout'
  >,
  thresholds: VirArithmeticDecisionThresholds = VIR_ARITHMETIC_DECISION_THRESHOLDS,
): VirArithmeticDecisionStatus {
  return summarizeVirDecisionGate(totals, thresholds, [], []).status
}

export function buildVirArithmeticDecisionDashboard(cases: ArithmeticProbeResult[]): VirArithmeticDecisionAggregate {
  const dashboard: VirArithmeticDecisionAggregate = {
    status: 'pause',
    statusReason: 'pending',
    recommendationReason: 'pending',
    totalCaseCount: 0,
    consideredCases: 0,
    consideredFunctions: 0,
    totalFunctionCount: 0,
    supportedCases: 0,
    unsupportedCases: 0,
    plannedAcceptedFunctionCount: 0,
    directAcceptedFunctionCount: 0,
    directRejectedFunctionCount: 0,
    directSelectedFunctionCount: 0,
    plannedSelectedFunctionCount: 0,
    acceptedPlannedCases: 0,
    selectedDirectCases: 0,
    rejectedDirectCases: 0,
    unsupportedFunctionCount: 0,
    unsupportedCaseCount: 0,
    rejectionCategoryTotals: makeZeroRejectionCategoryTotals(),
    topRejectionCategories: [],
    unsupportedReasonTotals: makeZeroUnsupportedReasonTotals(),
    topUnsupportedReasons: [],
    blockerTagTotals: {},
    directCommandCount: 0,
    plannedCommandCount: 0,
    directScoreCopyCount: 0,
    plannedScoreCopyCount: 0,
    commandDeltaSummary: makeZeroDeltaSummary(),
    scoreCopyDeltaSummary: makeZeroDeltaSummary(),
    semanticProofSummary: makeZeroSemanticProofSummary(),
    directVsPlannedCommandDelta: 0,
    directVsPlannedScoreCopyDelta: 0,
    directToPlannedScoreCopyReductionPercent: 0,
    unsupportedReasonBreakdown: [],
    unsupportedMirOpKindBreakdown: [],
    unsupportedMirCallTargetBreakdown: [],
    unsupportedMirCallTargetFamilyBreakdown: [],
    caseBlockerMatrix: [],
    readinessChecklist: [],
    unknownReasonCaseNames: [],
    unknownMirCallTargetCaseNames: [],
    blockers: [],
    rawSummonMarkerSetupIsolation: makeZeroRawSummonMarkerSetupIsolation(),
    semanticProofCloseout: makeZeroSemanticProofCloseout(),
    allocationCheckCloseout: makeZeroAllocationCheckCloseout(),
    nextSafeGoals: [],
    goNoGoStatus: 'pause',
    supportedProbeNames: [],
    unsupportedProbeNames: [],
    corpusCoverageSummary: {
      totalCaseCount: 0,
      controlledCaseCount: 0,
      broadCaseCount: 0,
      controlledProbeNames: [],
      broadProbeNames: [],
    },
  }
  const commandDeltas: number[] = []
  const scoreDeltas: number[] = []
  const seenSupportedProbeNames = new Set<string>()
  const seenUnsupportedProbeNames = new Set<string>()
  const caseBlockerMatrix: VirCaseBlockerMatrixEntry[] = []
  const unknownReasonCaseNames = new Set<string>()
  const unknownMirCallTargetCaseNames = new Set<string>()
  const provenSupportedCaseNames = new Set<string>()
  const supportedButUnprovenCaseNames = new Set<string>()
  const unsupportedProofCaseNames = new Set<string>()
  const allocationCheckCaseNames = new Set<string>()

  for (const result of cases) {
    const decision = result.virDecision
    if (!decision) continue

    const unsupportedReasonTags = decision.unsupportedReasonTags && decision.unsupportedReasonTags.length > 0
      ? decision.unsupportedReasonTags
      : decision.status === 'unsupported'
        ? summarizeUnsupportedReasonTagsFromText(decision.unsupportedReason ?? '')
        : []
    const unsupportedMirOpKinds = summarizeUnsupportedMirOpKindsFromDecision(decision)
    const unsupportedMirCallTargets = summarizeUnsupportedMirCallTargetsFromDecision(decision)
    const isCallUnsupported = unsupportedMirOpKinds.includes('call')
    const semanticProofStatus = resolveDecisionProofStatus(decision)
    const blockerTags = buildCaseBlockerTags(decision, unsupportedReasonTags, semanticProofStatus)
    const rejectionCategory = pickCaseRejectionCategory(decision)

    if (semanticProofStatus === 'unsupported') {
      unsupportedProofCaseNames.add(result.case)
    } else if (semanticProofStatus === 'proven') {
      provenSupportedCaseNames.add(result.case)
    } else {
      supportedButUnprovenCaseNames.add(result.case)
    }

    if (
      decision.rejectionCategory === 'allocation_check_failed'
      || unsupportedReasonTags.includes('allocation-check-failure')
    ) {
      allocationCheckCaseNames.add(result.case)
    }

    dashboard.totalCaseCount += 1
    dashboard.consideredCases += 1
    dashboard.totalFunctionCount +=
      decision.acceptedFunctionCount + decision.rejectedFunctionCount + decision.unsupportedFunctionCount
    dashboard.unsupportedFunctionCount += decision.unsupportedFunctionCount
    if (decision.status === 'unsupported') {
      dashboard.unsupportedCaseCount += 1
      dashboard.unsupportedCases += 1
      if (!seenUnsupportedProbeNames.has(result.case)) {
        seenUnsupportedProbeNames.add(result.case)
      }
    } else {
      dashboard.supportedCases += 1
      if (!seenSupportedProbeNames.has(result.case)) {
        seenSupportedProbeNames.add(result.case)
      }
    }

    const caseProofSummary = summarizeCaseProofStatus(decision)
    dashboard.semanticProofSummary.provenEquivalentCount += caseProofSummary.provenEquivalentCount
    dashboard.semanticProofSummary.unsupportedCount += caseProofSummary.unsupportedCount
    dashboard.semanticProofSummary.missingProofCount += caseProofSummary.missingProofCount
    dashboard.semanticProofSummary.unprovenCount += caseProofSummary.unprovenCount

    dashboard.consideredFunctions += decision.acceptedFunctionCount + decision.rejectedFunctionCount + decision.unsupportedFunctionCount
    const modeTotals = decision.modeTotals
      ?? makeZeroModeTotals()
    dashboard.plannedAcceptedFunctionCount += modeTotals.acceptedPlanned
    dashboard.directAcceptedFunctionCount += modeTotals.acceptedDirect
    dashboard.directRejectedFunctionCount += modeTotals.rejectedDirect
    dashboard.directSelectedFunctionCount += modeTotals.acceptedDirect + modeTotals.rejectedDirect
    dashboard.plannedSelectedFunctionCount += modeTotals.acceptedPlanned
    dashboard.acceptedPlannedCases += modeTotals.acceptedPlanned
    dashboard.selectedDirectCases += modeTotals.acceptedDirect + modeTotals.rejectedDirect
    dashboard.rejectedDirectCases += modeTotals.rejectedDirect

    dashboard.directCommandCount += decision.directCommandCount
    dashboard.plannedCommandCount += decision.plannedCommandCount
    dashboard.directScoreCopyCount += decision.directScoreCopyCount
    dashboard.plannedScoreCopyCount += decision.plannedScoreCopyCount
    mergeRejectionCategoryTotals(dashboard.rejectionCategoryTotals, decision.rejectionCategoryCounts)
    mergeUnsupportedReasonTotals(dashboard.unsupportedReasonTotals, unsupportedReasonTags)
    mergeBlockerTagTotals(dashboard.blockerTagTotals, blockerTags)

    if (decision.status !== 'unsupported') {
      commandDeltas.push((decision.plannedCommandCount ?? 0) - (decision.directCommandCount ?? 0))
      scoreDeltas.push((decision.plannedScoreCopyCount ?? 0) - (decision.directScoreCopyCount ?? 0))
    }

    if (decision.semanticProofStatus === undefined) {
      decision.semanticProofStatus = semanticProofStatus
    }
    if (decision.rejectionCategory === undefined) {
      decision.rejectionCategory = rejectionCategory
    }
    decision.unsupportedReasonTags = unsupportedReasonTags
    if (unsupportedMirOpKinds.length > 0) {
      decision.unsupportedMirOpKinds = unsupportedMirOpKinds
    }
    if (unsupportedMirCallTargets.length > 0) {
      decision.unsupportedMirCallTargets = unsupportedMirCallTargets
    }
    if (decision.status === 'unsupported' && isCallUnsupported && unsupportedMirCallTargets.length === 0) {
      unknownMirCallTargetCaseNames.add(result.case)
    }
    decision.blockerTags = blockerTags

    caseBlockerMatrix.push({
      caseName: result.case,
      coverageCategory: result.coverageCategory,
      status: decision.status,
      semanticProofStatus,
      unsupportedReasonTags,
      blockerTags,
      rejectionCategory: decision.rejectionCategory,
      commandDelta: decision.commandDelta,
      scoreCopyDelta: decision.scoreCopyDelta,
      unsupportedMirOpKinds: unsupportedMirOpKinds.length > 0 ? unsupportedMirOpKinds : undefined,
      unsupportedMirCallTargets: unsupportedMirCallTargets.length > 0 ? unsupportedMirCallTargets : undefined,
    })

    if (unsupportedReasonTags.includes('unsupported-unknown')) {
      unknownReasonCaseNames.add(result.case)
    }
  }

  dashboard.directVsPlannedCommandDelta = dashboard.plannedCommandCount - dashboard.directCommandCount
  dashboard.directVsPlannedScoreCopyDelta = dashboard.plannedScoreCopyCount - dashboard.directScoreCopyCount
  dashboard.directToPlannedScoreCopyReductionPercent = dashboard.directScoreCopyCount === 0
    ? 0
    : ((dashboard.directScoreCopyCount - dashboard.plannedScoreCopyCount) / dashboard.directScoreCopyCount) * 100
  dashboard.commandDeltaSummary = summarizeDeltaSeries(commandDeltas)
  dashboard.scoreCopyDeltaSummary = summarizeDeltaSeries(scoreDeltas)
  dashboard.unsupportedReasonTotals = Object.keys(dashboard.unsupportedReasonTotals)
    .sort()
    .reduce((orderedTotals, reason) => {
      orderedTotals[reason] = dashboard.unsupportedReasonTotals[reason]
      return orderedTotals
    }, {} as { [tag: string]: number })
  dashboard.blockerTagTotals = Object.keys(dashboard.blockerTagTotals)
    .sort()
    .reduce((orderedTotals, tag) => {
      orderedTotals[tag] = dashboard.blockerTagTotals[tag]
      return orderedTotals
    }, {} as { [tag: string]: number })
  dashboard.topRejectionCategories = summarizeTopRejectionCategories(dashboard.rejectionCategoryTotals)
  dashboard.topUnsupportedReasons = summarizeTopUnsupportedReasons(dashboard.unsupportedReasonTotals)
  dashboard.unsupportedReasonBreakdown = summarizeUnsupportedReasonBreakdown(caseBlockerMatrix)
  dashboard.unsupportedMirOpKindBreakdown = summarizeUnsupportedMirOpKindBreakdown(caseBlockerMatrix)
  dashboard.unsupportedMirCallTargetBreakdown = summarizeUnsupportedMirCallTargetBreakdown(caseBlockerMatrix)
  dashboard.unsupportedMirCallTargetFamilyBreakdown = summarizeUnsupportedMirCallTargetFamilyBreakdown(caseBlockerMatrix)
  dashboard.rawSummonMarkerSetupIsolation = summarizeRawSummonMarkerSetupIsolation(
    dashboard.unsupportedMirCallTargetFamilyBreakdown.find(entry => entry.family === 'raw:summon-marker-setup'),
  )
  dashboard.semanticProofCloseout = summarizeSemanticProofCloseout(
    dashboard.semanticProofSummary,
    provenSupportedCaseNames,
    supportedButUnprovenCaseNames,
    unsupportedProofCaseNames,
  )
  dashboard.allocationCheckCloseout = summarizeAllocationCheckCloseout(
    dashboard.rejectionCategoryTotals,
    allocationCheckCaseNames,
  )
  dashboard.caseBlockerMatrix = [...caseBlockerMatrix]
    .sort((left, right) => left.caseName.localeCompare(right.caseName) || left.status.localeCompare(right.status))
  dashboard.unknownReasonCaseNames = [...unknownReasonCaseNames].sort()
  const unknownMirCallTargetCaseNamesSorted = [...unknownMirCallTargetCaseNames].sort()
  const gateSummary = summarizeVirDecisionGate(
    dashboard,
    VIR_ARITHMETIC_DECISION_THRESHOLDS,
    dashboard.unknownReasonCaseNames,
    unknownMirCallTargetCaseNamesSorted,
    dashboard.rawSummonMarkerSetupIsolation,
    dashboard.semanticProofCloseout,
    dashboard.allocationCheckCloseout,
  )
  dashboard.goNoGoStatus = gateSummary.status
  dashboard.status = gateSummary.status
  dashboard.statusReason = gateSummary.statusReason
  dashboard.recommendationReason = gateSummary.recommendationReason
  dashboard.blockers = [...new Set(gateSummary.blockers)].sort()
  dashboard.readinessChecklist = gateSummary.readinessChecklist
  dashboard.supportedProbeNames = [...seenSupportedProbeNames].sort()
  dashboard.unsupportedProbeNames = [...seenUnsupportedProbeNames].sort()
  dashboard.corpusCoverageSummary = summarizeCorpusCoverageSummary(cases)
  dashboard.nextSafeGoals = summarizeNextSafeGoals(
    gateSummary,
    dashboard.readinessChecklist,
    dashboard.unknownReasonCaseNames,
    dashboard.unsupportedReasonBreakdown,
    dashboard.unsupportedMirOpKindBreakdown,
    dashboard.unsupportedMirCallTargetBreakdown,
    dashboard.unsupportedMirCallTargetFamilyBreakdown,
    dashboard.rawSummonMarkerSetupIsolation,
    dashboard.semanticProofCloseout,
    dashboard.allocationCheckCloseout,
  )

  return dashboard
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
  const mirLowering = lowerMirToVir(result.mir)
  const coverageCategory = probe.coverageCategory ?? 'broad'
  const lines = commandLinesWithLocations(result.files)
  const virDecision = mirLowering.kind === 'ok'
    ? (() => {
      const decision = chooseVirLoweringPlan(mirLowering.module, { runAllocationCheck: true })
      const modeTotals = summarizeVirDecisionModeTotals(decision)
      const unsupportedReasonTags = summarizeDecisionUnsupportedReasonTags(decision)
      const plannedCommandCount = decision.plannedCommandCount
      const directCommandCount = decision.directCommandCount
      const plannedScoreCopyCount = decision.plannedScoreCopyCount
      const directScoreCopyCount = decision.directScoreCopyCount
      return {
        status: decision.kind,
        selectedMode: decision.selectedMode,
        directCommandCount,
        plannedCommandCount,
        directScoreCopyCount,
        plannedScoreCopyCount,
        commandDelta: plannedCommandCount - directCommandCount,
        scoreCopyDelta: plannedScoreCopyCount - directScoreCopyCount,
        acceptedFunctionCount: decision.acceptedFunctionCount,
        rejectedFunctionCount: decision.rejectedFunctionCount,
        unsupportedFunctionCount: decision.unsupportedFunctionCount,
        rejectionCategoryCounts: decision.rejectionCategoryCounts,
        semanticProofStatus: 'unproven' as const,
        unsupportedReasonTags,
        modeTotals,
        unsupportedReason: decision.unsupportedReason,
      }
    })()
    : {
      status: 'unsupported' as const,
      selectedMode: 'direct' as const,
      directCommandCount: 0,
      plannedCommandCount: 0,
      directScoreCopyCount: 0,
      plannedScoreCopyCount: 0,
      commandDelta: 0,
      scoreCopyDelta: 0,
      semanticProofStatus: 'unsupported' as const,
      acceptedFunctionCount: 0,
      rejectedFunctionCount: 0,
      unsupportedFunctionCount: 0,
      rejectionCategoryCounts: {
        planned_unsupported: 0,
        allocation_check_failed: 0,
        higher_cost: 0,
        direct_unsupported: 0,
        unsupported_both: 0,
      },
      unsupportedReasonTags: mirLowering.reasonTags && mirLowering.reasonTags.length > 0
        ? mirLowering.reasonTags
        : summarizeUnsupportedReasonTagsFromText(mirLowering.reason),
      unsupportedMirOpKinds: mirLowering.unsupportedMirOpKinds,
      unsupportedMirCallTargets: mirLowering.unsupportedMirCallTargets,
      modeTotals: {
        acceptedPlanned: 0,
        acceptedDirect: 0,
        rejectedDirect: 0,
      },
      unsupportedReason: mirLowering.kind === 'unsupported' ? mirLowering.reason : undefined,
    }

  return {
    case: probe.name,
    description: probe.description,
    optLevel: `O${optLevel}`,
    stdlibModules: probe.stdlibModules ?? [],
    coverageCategory,
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
    virDecision,
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
    virDecisionDashboard: buildVirArithmeticDecisionDashboard(cases),
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
