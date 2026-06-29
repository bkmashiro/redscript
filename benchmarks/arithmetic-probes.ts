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
import {
  runOfflineRewriteEquivalenceFixtures,
  type OfflineRewriteFamilySummary as RunnerOfflineRewriteFamilySummary,
  type OfflineRewriteSummary as RunnerOfflineRewriteSummary,
} from '../src/optimizer/lir/rewrite_equivalence_fixtures'
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

export type RewriteProvenanceReason =
  | 'already-optimized-by-existing-pass'
  | 'safe-adjacent-score-copy-arith'
  | 'blocked-by-alias-safety'
  | 'blocked-by-temp-not-dead-after-consuming-op'
  | 'blocked-by-protected-slot'
  | 'blocked-by-cross-function-module-external-mention'
  | 'blocked-by-barrier-or-non-adjacent-shape'
  | 'blocked-by-pattern-not-exact-adjacent-score-copy-arith'
  | 'insufficient-command-level-information'

export interface RewriteProvenanceBucket {
  reason: RewriteProvenanceReason
  count: number
  caseNames: string[]
  examples: string[]
}

export type RewriteShapeFamilyNextAction =
  | 'local-canonicalization'
  | 'slot-scope-analysis'
  | 'protected-slot-policy'
  | 'liveness-analysis'
  | 'leave-blocked'

export interface RewriteShapeFamilyEntry {
  family: string
  count: number
  caseNames: string[]
  examples: string[]
  likelyNextAction: RewriteShapeFamilyNextAction
  requiresLirLevelAnalysis: boolean
}

export type RewriteProofMissReason =
  | 'no-exact-lir-local-proof'
  | 'external-or-protected-slot'
  | 'barrier-or-non-adjacent'
  | 'command-level-only-artifact'
  | 'insufficient-command-context'

export type RewriteShapeFamilyProofMissNextAction =
  | 'focused-probe'
  | 'lir-safety-analysis'
  | 'leave-blocked'
  | 'rewrite-test-candidate'

export type RewriteProofMissSlotRole =
  | 'parameter'
  | 'return'
  | 'const'
  | 'runtime-framework'
  | 'local-temp'
  | 'unknown'

export type RewriteProofMissSourceKind =
  | 'command-pattern'
  | 'external-mention'
  | 'protected-slot'
  | 'insufficient-context'
  | 'local-temp-only'

export type RewriteProofMissLocalProofEvidenceKind =
  | 'adjacent-arith-source-reused'
  | 'copy-chain-local-temp'
  | 'needs-liveness-window'
  | 'insufficient-context'
  | 'other-local-temp'

export type RewriteProofMissLivenessWindowKind =
  | 'single-adjacent-arith-no-reuse'
  | 'copy-chain-no-reuse'
  | 'blocked-dst-reused-after-window'
  | 'blocked-src-overwritten-before-use'
  | 'unknown-window-too-small'
  | 'unknown-unparsed-command'

export type RewriteProofMissLivenessWindowReadiness =
  | 'locally-safe-but-diagnostics-only'
  | 'blocked'
  | 'unknown'

export interface RewriteProofMissLivenessWindowKindSummary {
  windowKind: RewriteProofMissLivenessWindowKind
  count: number
  caseNames: string[]
  examples: string[]
}

export interface RewriteProofMissLivenessWindowFamilyEvidence {
  family: string
  totalCandidateLike: number
  locallySafeCandidateCount: number
  blockedCandidateCount: number
  unknownCandidateCount: number
  windowKinds: RewriteProofMissLivenessWindowKindSummary[]
  proofReadiness: RewriteProofMissLivenessWindowReadiness
  recommendation: string
}

export interface RewriteProofMissLivenessWindowSummary {
  totalCandidateLike: number
  locallySafeCandidateCount: number
  blockedCandidateCount: number
  unknownCandidateCount: number
  byFamily: RewriteProofMissLivenessWindowFamilyEvidence[]
  proofReadiness: RewriteProofMissLivenessWindowReadiness
  recommendation: string
}

export type RewriteProofMissLirAdjacentWindowBreakdownKind =
  | 'unknown-unparsed-command'
  | 'adjacent-window-missing-or-incomplete'
  | 'protected-boundary-blocked'
  | 'local-temp-exact-proof-gap'
  | 'candidate-shape-not-satisfying-lir-local-proof'

export interface RewriteProofMissAdjacentWindowBreakdownEntry {
  kind: RewriteProofMissLirAdjacentWindowBreakdownKind
  count: number
  caseNames: string[]
  examples: string[]
}

export type RewriteProofMissLirLocalTempProofGapReadiness =
  | 'rewrite-test-candidate-local-window'
  | 'needs-predecessor-window-proof'
  | 'needs-successor-window-proof'
  | 'needs-cross-function-boundary-proof'
  | 'unknown-local-temp-proof-gap'

export type RewriteProofMissLirLocalTempProofWindowKind =
  | 'single-predecessor-copy-into-local-temp'
  | 'predecessor-arith-feeds-local-temp'
  | 'successor-arith-consumes-local-temp'
  | 'copy-chain-needs-wider-window'
  | 'cross-function-or-boundary-window'
  | 'opaque-or-unparsed-window'

export interface RewriteProofMissLirLocalTempProofGapReadinessBucket {
  readiness: RewriteProofMissLirLocalTempProofGapReadiness
  count: number
  caseNames: string[]
  examples: string[]
}

export interface RewriteProofMissLirLocalTempProofGapReadinessSummary {
  byReadiness: RewriteProofMissLirLocalTempProofGapReadinessBucket[]
  candidateCaseNames: string[]
  blockedOrUnknownCaseNames: string[]
  totalCandidateLike: number
  candidateCount: number
  blockedOrUnknownCount: number
  nextSafeDiagnosticGoals: string[]
  shortWindowProofSummary?: RewriteProofMissLirLocalTempProofWindowSummary
}

export interface RewriteProofMissLirLocalTempProofWindowSummaryBucket {
  proofWindowKind: RewriteProofMissLirLocalTempProofWindowKind
  count: number
  caseNames: string[]
  examples: string[]
}

export type RewriteProofMissLirFixtureEnablementStatus = 'disabled-diagnostics-only' | 'enabled'

export type RewriteProofMissLirFixtureRecommendedTestKind =
  | 'short-window-local-copy-fixture'
  | 'wider-window-local-copy-fixture'
  | 'cross-function-boundary-fixture'
  | 'opaque-context-fixture'

export interface RewriteProofMissLirFixtureSelectionCandidate {
  bucket: RewriteProofMissLirLocalTempProofWindowKind
  caseName: string
  example: string
  reason: string
  recommendedTestKind: RewriteProofMissLirFixtureRecommendedTestKind
}

export interface RewriteProofMissLirBlockedFixtureFamily {
  bucket: RewriteProofMissLirLocalTempProofWindowKind
  count: number
  caseNames: string[]
  examples: string[]
  reason: string
}

export interface RewriteProofMissLirFixtureSelectionSummary {
  candidateFixtures: RewriteProofMissLirFixtureSelectionCandidate[]
  blockedFixtureFamilies: RewriteProofMissLirBlockedFixtureFamily[]
  rewriteEnablementStatus: RewriteProofMissLirFixtureEnablementStatus
  nextSafeDiagnosticGoals: string[]
}

export type RewriteProofMissUnknownCause =
  | 'unparsed-command'
  | 'insufficient-window'
  | 'opaque-window'
  | 'boundary-or-cross-function'
  | 'missing-predecessor-evidence'
  | 'missing-successor-evidence'
  | 'unknown-other'

export interface RewriteProofMissUnknownCauseSplitEntry {
  cause: RewriteProofMissUnknownCause
  count: number
  caseNames: string[]
  examples: string[]
}

export interface RewriteProofMissUnknownCauseSplitSummary {
  totalUnknownLike: number
  byUnknownCause: RewriteProofMissUnknownCauseSplitEntry[]
  examples: RewriteProofMissUnknownCauseSplitExample[]
}

export interface RewriteProofMissUnknownCauseSplitExample {
  caseName: string
  cause: RewriteProofMissUnknownCause
  evidence: string
  family?: string
}

export interface RewriteFutureFixtureFamilySummary {
  family: string
  candidateCount: number
  blockedCount: number
  caseNames: string[]
}

export interface RewriteFutureFixtureBlockerKindSummary {
  blockerKind: string
  count: number
  caseNames: string[]
}

export interface FutureRewriteFixtureExportSummary {
  rewriteEnablementStatus: RewriteProofMissLirFixtureEnablementStatus
  exportedFixtureCount: number
  blockedFixtureCount: number
  candidateFixtureNames: string[]
  blockedFixtureNames: string[]
  byFixtureFamily: RewriteFutureFixtureFamilySummary[]
  byBlockerKind: RewriteFutureFixtureBlockerKindSummary[]
  nextRequiredEvidence: string[]
}

export type RewriteTestHarnessStatus =
  | 'fixture-selection-only'
  | 'no-candidates'
  | 'blocked-by-unknown-evidence'

export interface OfflineRewriteTestHarnessSummary {
  rewriteEnablementStatus: RewriteProofMissLirFixtureEnablementStatus
  harnessStatus: RewriteTestHarnessStatus
  candidateFixtureCount: number
  blockedFixtureCount: number
  supportedTestKinds: string[]
  requiredBeforeRewriteEnablement: string[]
}

export interface OfflineRewriteEquivalencePackFamilySummary {
  family: string
  totalFixtures: number
  equivalentFixtures: number
  counterexampleFixtures: number
  unsupportedFixtures: number
  failedFixtures: number
}

export interface OfflineRewriteFamilyReadinessEntry {
  family: string
  total: number
  failed: number
  status: 'pass' | 'fail'
}

export interface OfflineRewriteFamilyReadinessSummary {
  status: 'pass' | 'fail'
  evidenceStatus: 'bounded-offline-evidence-only'
  requiredFamilies: OfflineRewriteFamilyReadinessEntry[]
  missingFamilies: string[]
  failedFamilies: string[]
  notes?: string
  gateReason?: string
}

export interface OfflineRewriteEquivalencePackSummary {
  status: 'pass' | 'fail'
  totalFixtures: number
  equivalentFixtures: number
  counterexampleFixtures: number
  unsupportedFixtures: number
  failedFixtures: number
  familySummaries: OfflineRewriteEquivalencePackFamilySummary[]
  failedFixtureNames?: string[]
  evidenceStatus: 'bounded-offline-evidence-only'
  offlineRewriteFamilyReadinessSummary: OfflineRewriteFamilyReadinessSummary
}

export interface RewriteProofMissLirLocalTempProofWindowSummary {
  totalCandidateLike: number
  byProofWindowKind: RewriteProofMissLirLocalTempProofWindowSummaryBucket[]
  futureRewriteTestCandidateCaseNames: string[]
  needsWiderWindowCaseNames: string[]
  fixtureSelectionSummary?: RewriteProofMissLirFixtureSelectionSummary
}

export interface RewriteProofMissLirAdjacentWindowSummary {
  proofMissAdjacentWindowBreakdown: RewriteProofMissAdjacentWindowBreakdownEntry[]
  unknownUnparsedCommandCases: number
  localTempExactProofGapCases: number
  protectedBoundaryBlockedCases: number
  adjacentWindowMissingOrIncompleteCases: number
  candidateShapeNotSatisfyingLirLocalProofCases: number
  localTempProofGapReadinessSummary: RewriteProofMissLirLocalTempProofGapReadinessSummary
  totalCandidateLike: number
  proofReadiness: RewriteProofMissLivenessWindowReadiness
  nextSafeDiagnosticGoals: string[]
  recommendation: string
  shortWindowProofSummary?: RewriteProofMissLirLocalTempProofWindowSummary
}

export type RewriteProofMissLocalProofReadiness =
  | 'candidate-after-liveness-window'
  | 'needs-more-context'
  | 'blocked'

export interface RewriteProofMissLocalProofEvidenceBucket {
  evidenceKind: RewriteProofMissLocalProofEvidenceKind
  count: number
  caseNames: string[]
  examples: string[]
}

export interface RewriteProofMissLocalProofFamilyEvidence {
  family: string
  totalLocalTempOnly: number
  evidenceKinds: RewriteProofMissLocalProofEvidenceBucket[]
  livenessWindowSummary?: RewriteProofMissLivenessWindowFamilyEvidence
  lirAdjacentWindowSummary?: RewriteProofMissLirAdjacentWindowSummary
  proofReadiness: RewriteProofMissLocalProofReadiness
  recommendation: string
  candidateCount: number
  needsLivenessWindowCount: number
  insufficientContextCount: number
}

export interface RewriteProofMissLocalProofEvidenceSummary {
  totalLocalTempOnly: number
  byFamily: RewriteProofMissLocalProofFamilyEvidence[]
  candidateCount: number
  needsLivenessWindowCount: number
  insufficientContextCount: number
  recommendation: string
  livenessWindowSummary?: RewriteProofMissLivenessWindowSummary
  lirAdjacentWindowSummary?: RewriteProofMissLirAdjacentWindowSummary
}

export interface RewriteProofMissSlotRoleSummary {
  role: RewriteProofMissSlotRole
  count: number
  caseNames: string[]
  examples: string[]
}

export interface RewriteProofMissSourceKindSummary {
  sourceKind: RewriteProofMissSourceKind
  count: number
  caseNames: string[]
  examples: string[]
}

export interface RewriteProofMissFamilySlotProvenance {
  family: string
  total: number
  slotRoles: RewriteProofMissSlotRoleSummary[]
  sourceKinds: RewriteProofMissSourceKindSummary[]
  recommendation: string
}

export interface RewriteProofMissDominantSlotBlocker {
  blocker: string
  count: number
}

export interface RewriteProofMissSlotProvenanceSummary {
  total: number
  byFamily: RewriteProofMissFamilySlotProvenance[]
  dominantBlockers: RewriteProofMissDominantSlotBlocker[]
  recommendation: string
  localProofEvidenceSummary?: RewriteProofMissLocalProofEvidenceSummary
}

export interface RewriteShapeFamilyProofMissByReason {
  reason: RewriteProofMissReason
  count: number
  caseNames: string[]
  examples: string[]
}

export interface RewriteShapeFamilyProofMissFamily {
  family: string
  total: number
  caseNames: string[]
  byReason: RewriteShapeFamilyProofMissByReason[]
  suggestedNextAction: RewriteShapeFamilyProofMissNextAction
}

export interface RewriteShapeFamilyProofMissSummary {
  total: number
  byFamily: RewriteShapeFamilyProofMissFamily[]
  topActionableFamilies: string[]
  recommendation: string
  slotProvenanceSummary?: RewriteProofMissSlotProvenanceSummary
}

export interface RewriteShapeFamilySummary {
  totalPatternNotExactCount: number
  families: RewriteShapeFamilyEntry[]
  topRecoverableFamilies: string[]
  recommendation: string
  proofMissSummary?: RewriteShapeFamilyProofMissSummary
}

export interface RewriteProvenanceSummary {
  total: number
  byReason: RewriteProvenanceBucket[]
  safeAdjacentScoreCopyArithCount: number
  blockedCount: number
  insufficientInfoCount: number
  unknownCount: number
  requiresLirLevelAnalysis: boolean
  shapeFamilySummary?: RewriteShapeFamilySummary
}

export type RewriteTrackZDiagnosticLabel =
  | 'rewriteable-now'
  | 'needs-window-proof'
  | 'blocked-protected-slot'
  | 'blocked-cross-function-or-module-external'
  | 'command-text-false-positive'
  | 'unknown-needs-lir-proof'

export type RewriteTrackZDiagnosticRecommendation =
  | 'prioritize-AA'
  | 'prioritize-AB'
  | 'investigate-blockers'
  | 'collect-more-data'

export interface RewriteTrackZDiagnosticBucket {
  label: RewriteTrackZDiagnosticLabel
  count: number
  caseNames: string[]
  examples: string[]
}

export interface RewriteTrackZDiagnosticCaseSummary {
  byLabel: RewriteTrackZDiagnosticBucket[]
  targetPattern: 'score_copy -> score_arith'
  totalCount: number
  recommendation: RewriteTrackZDiagnosticRecommendation
}

export interface RewriteTrackZDiagnosticAggregateSummary {
  byLabel: RewriteTrackZDiagnosticBucket[]
  targetPattern: 'score_copy -> score_arith'
  totalCount: number
  topCaseNames: string[]
  recommendation: RewriteTrackZDiagnosticRecommendation
}

export interface RewriteTrackZDiagnosticCandidateSummary {
  totalCount: number
  byLabel: RewriteTrackZDiagnosticBucket[]
}

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
  provenanceSummary?: RewriteProvenanceSummary
}

export interface LirOpportunitySummaryPatternEntry {
  status: CopyRewriteStatus
  pattern: string
  count: number
  caseNames: string[]
  examples: string[]
}

export interface LirOpportunitySummary {
  totalScoreCopyCount: number
  byStatus: {
    currentlyOptimized: number
    safeCandidate: number
    blockedByBarrier: number
    unknown: number
  }
  topPatterns: LirOpportunitySummaryPatternEntry[]
  provenanceSummary: RewriteProvenanceSummary
  recommendation: 'diagnose-first' | 'safe-local-rewrite-candidate' | 'no-action'
  notes: string
  futureRewriteFixtureExportSummary?: FutureRewriteFixtureExportSummary
  unknownCauseSplitSummary?: RewriteProofMissUnknownCauseSplitSummary
  offlineRewriteTestHarnessSummary?: OfflineRewriteTestHarnessSummary
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

export interface FixtureBoundaryFamilySummary {
  family: string
  count: number
  caseNames: string[]
}

export interface FixtureBoundarySummary {
  setupOnlyCaseNames: string[]
  setupOnlyUnsupportedCount: number
  trueArithmeticUnsupportedCaseNames: string[]
  trueArithmeticUnsupportedCount: number
  mixedOrUnknownCaseNames: string[]
  mixedOrUnknownCount: number
  dominantFixtureFamilies: FixtureBoundaryFamilySummary[]
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
  allocationFailureBreakdown?: VirAllocationFailureBreakdownEntry[]
  functionNamesAvailable: boolean
  recommendation: string
  notes: string
}

export type VirAllocationFailureCategory =
  | 'parallel-copy-cycle'
  | 'ret-precolor-conflict'
  | 'dead-lhs-affinity-conflict'
  | 'unknown'

export interface VirAllocationFailureBreakdownEntry {
  category: VirAllocationFailureCategory
  count: number
  caseNames: string[]
  examples: string[]
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

export type VirSemanticProofMethod = 'offline-arithmetic-model' | 'fixture-expected-output' | 'none'

export interface VirSemanticProofDetails {
  status: VirArithmeticSemanticProofStatus
  method: VirSemanticProofMethod
  reason?: string
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
  fixtureBoundarySummary?: FixtureBoundarySummary
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
    semanticProofDetails?: VirSemanticProofDetails
    rejectionCategory?: VirDecisionRejectionCategory
    unsupportedMirOpKinds?: string[]
    unsupportedMirCallTargets?: VirUnsupportedMirCallTarget[]
    commandDelta?: number
    scoreCopyDelta?: number
    blockerTags?: string[]
    unsupportedReasonTags?: VirUnsupportedReasonTag[]
    }
  warnings: string[]
  experimentalLocalCopyRewriteResidualSummary?: ArithmeticProbeExperimentalLocalCopyRewriteResidualCaseSummary
}

export interface ArithmeticProbeReport {
  benchmark: string
  generatedAt: string
  host: ReturnType<typeof benchmarkMeta>['host']
  cases: ArithmeticProbeResult[]
  scoreCopyPatterns: ScoreCopyPatternSummary
  copyOrigins?: CopyOriginSummary
  rewriteOpportunities: CopyRewriteOpportunitySummary
  lirOpportunitySummary?: LirOpportunitySummary
  offlineRewriteEquivalencePackSummary?: OfflineRewriteEquivalencePackSummary
  virDecisionDashboard: VirArithmeticDecisionAggregate
  futureRewriteFixtureExportSummary?: FutureRewriteFixtureExportSummary
  unknownCauseSplitSummary?: RewriteProofMissUnknownCauseSplitSummary
  offlineRewriteTestHarnessSummary?: OfflineRewriteTestHarnessSummary
  experimentalLocalCopyRewriteComparison?: ArithmeticProbeExperimentalLocalCopyRewriteComparison
  experimentalLocalCopyRewriteNoRegressionGate?: ArithmeticProbeExperimentalLocalCopyRewriteNoRegressionGate
  experimentalLocalCopyRewriteRolloutReadinessSummary?: ArithmeticProbeExperimentalLocalCopyRewriteRolloutReadinessSummary
  experimentalLocalCopyRewriteResidualSummary?: ArithmeticProbeExperimentalLocalCopyRewriteResidualSummary
}

export interface ArithmeticProbeExperimentalLocalCopyRewriteResidualByStatus {
  status: CopyRewriteStatus
  count: number
  caseNames: string[]
  examples: string[]
}

export interface ArithmeticProbeExperimentalLocalCopyRewriteResidualPatternEntry {
  status: CopyRewriteStatus
  pattern: string
  count: number
  caseNames: string[]
  examples: string[]
}

export interface ArithmeticProbeExperimentalLocalCopyRewriteResidualFamilyEntry {
  family: string
  count: number
  caseNames: string[]
  examples: string[]
}

export interface ArithmeticProbeExperimentalLocalCopyRewriteResidualCaseSummary {
  caseName: string
  optLevel: `O${OptimizationLevel}`
  residualCount: number
  residualByStatus: ArithmeticProbeExperimentalLocalCopyRewriteResidualByStatus[]
  residualByPattern: ArithmeticProbeExperimentalLocalCopyRewriteResidualPatternEntry[]
  residualByFamily: ArithmeticProbeExperimentalLocalCopyRewriteResidualFamilyEntry[]
  residualByProvenanceReason: RewriteProvenanceBucket[]
  trackZResidualDiagnostics?: RewriteTrackZDiagnosticCaseSummary
  recommendation: 'candidate-family-ready' | 'diagnose-residuals-first' | 'no-residuals'
}

export interface ArithmeticProbeExperimentalLocalCopyRewriteResidualSummary {
  mode: 'experimental-local-copy-rewrite'
  status: 'diagnostic'
  onCaseCount: number
  totalResidualCount: number
  residualByStatus: ArithmeticProbeExperimentalLocalCopyRewriteResidualByStatus[]
  residualByPattern: ArithmeticProbeExperimentalLocalCopyRewriteResidualPatternEntry[]
  residualByFamily: ArithmeticProbeExperimentalLocalCopyRewriteResidualFamilyEntry[]
  residualByProvenanceReason: RewriteProvenanceBucket[]
  trackZResidualDiagnostics?: RewriteTrackZDiagnosticAggregateSummary
  topResidualCaseNames: string[]
  recommendation: 'candidate-family-ready' | 'diagnose-residuals-first' | 'no-residuals'
  perCase: ArithmeticProbeExperimentalLocalCopyRewriteResidualCaseSummary[]
}

export interface ArithmeticProbeExperimentTotals {
  caseCount: number
  commandTotal: number
  scoreCopyTotal: number
}

export interface ArithmeticProbeExperimentalLocalCopyRewriteComparisonEntry {
  caseName: string
  optLevel: `O${OptimizationLevel}`
  offCommandsTotal: number
  onCommandsTotal: number
  commandDelta: number
  offScoreCopyTotal: number
  onScoreCopyTotal: number
  scoreCopyDelta: number
}

export interface ArithmeticProbeExperimentalLocalCopyRewriteComparison {
  mode: 'experimental-local-copy-rewrite'
  status: 'experimental'
  enabled: true
  off: ArithmeticProbeExperimentTotals
  on: ArithmeticProbeExperimentTotals
  commandDelta: number
  scoreCopyDelta: number
  commandDeltaSummary: VirDecisionDeltaSummary
  scoreCopyDeltaSummary: VirDecisionDeltaSummary
  perCaseDeltas: ArithmeticProbeExperimentalLocalCopyRewriteComparisonEntry[]
}

export interface ArithmeticProbeExperimentalLocalCopyRewriteNoRegressionGate {
  mode: 'experimental-no-regression-evidence-only'
  status: 'pass' | 'fail'
  failReasons: string[]
  rationale: 'benchmark-evidence-only-no-production'
  offlineRewriteFamilyReadinessSummary?: OfflineRewriteFamilyReadinessSummary
}

export interface ArithmeticProbeExperimentalLocalCopyRewriteRolloutReadinessSummary {
  status: 'pass' | 'fail'
  recommendation: 'manual-experimental-opt-in-only' | 'stay-experimental'
  evidenceStatus: 'benchmark-and-bounded-offline-evidence-only'
  reasons: string[]
  requiredGateStatus: 'pass' | 'fail'
  offlinePackStatus: 'pass' | 'fail'
  familyReadinessStatus: 'pass' | 'fail'
  commandDelta: number
  scoreCopyDelta: number
  commandRegressedCount: number
  scoreCopyRegressedCount: number
  improvedCaseNames: string[]
  notes: string
}

const OFFLINE_REWRITE_EQUIVALENCE_PACK_MAX_FAILED_FIXTURE_NAMES = 5
const ROLLOUT_READINESS_MAX_IMPROVED_CASE_NAMES = 5
const TRACK_Z_TARGET_PATTERN: 'score_copy -> score_arith' = 'score_copy -> score_arith'
const MAX_RESIDUAL_CASE_SUMMARY_ENTRIES = 8
const MAX_RESIDUAL_PATTERNS_PER_SUMMARY = 12
const MAX_RESIDUAL_FAMILIES_PER_SUMMARY = 12
const MAX_RESIDUAL_EXAMPLES_PER_BUCKET = 3
const OFFLINE_REWRITE_FAMILY_READINESS_REQUIRED_FAMILIES = [
  'local-copy-forwarding',
  'predecessor-arithmetic',
  'read-write-window',
  'score-swap-window',
  'score-set-overwrite-window',
  'unsupported-boundary',
  'unsupported-typed-boundary',
] as const

type ProbeCliArgs = ReturnType<typeof parseCliArgs> & {
  caseName: string
  optLevels: OptimizationLevel[]
  list: boolean
  experimentalLirLocalCopyRewrite: boolean
  requireNoRegressionInExperimentalLocalCopyRewrite: boolean
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
  op: '+' | '-' | '*' | '/' | '%'
}

const NON_COMMUTATIVE_SCORE_ARITH_OPERATORS: Set<ScoreArithmetic['op']> = new Set(['-', '/', '%'])

function parseScoreArithmetic(line: string): ScoreArithmetic | null {
  const match = /^scoreboard players operation (\S+) (\S+) ([+\-*/%])= (\S+) (\S+)$/.exec(line)
  if (!match) return null
  return {
    dst: { player: match[1], obj: match[2] },
    src: { player: match[4], obj: match[5] },
    op: match[3] as ScoreArithmetic['op'],
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

function isPotentialExternalMentionSlot(slot: Slot): boolean {
  return /^\$p\d+$/.test(slot.player) || slot.player.includes('__rf_')
}

const RUNTIME_FRAMEWORK_SLOT_PATTERNS = [
  '__rf_',
  '__rs_',
]

function isRuntimeFrameworkSlot(slot: Slot): boolean {
  return RUNTIME_FRAMEWORK_SLOT_PATTERNS.some(prefix =>
    slot.player.includes(prefix) || slot.obj.includes(prefix) || slot.player.startsWith(prefix),
  )
}

function isPotentialExternalMentionSlotInLir(slot: Slot): boolean {
  return isPotentialExternalMentionSlot(slot)
    || slot.obj.includes('$p')
    || slot.obj.includes('__rs_')
    || slot.obj.includes('__rf_')
}

function isProtectedSlotEvidence(slot: Slot): boolean {
  return isProtectedSlot(slot) || slot.player.includes('$__const_')
}

function classifySlotRole(slot: Slot): RewriteProofMissSlotRole {
  if (/^\$p\d+$/.test(slot.player)) return 'parameter'
  if (slot.player === '$ret' || slot.player.startsWith('$ret_')) return 'return'
  if (slot.player.startsWith('$__const_')) return 'const'
  if (isRuntimeFrameworkSlot(slot)) return 'runtime-framework'
  if (slot.player.startsWith('$') && /_t\d+/.test(slot.player)) return 'local-temp'
  return 'unknown'
}

function classifySlotRolesForProofMiss(parsed: { dst: Slot; src: Slot }): RewriteProofMissSlotRole[] {
  const roles = new Set<RewriteProofMissSlotRole>([
    classifySlotRole(parsed.src),
    classifySlotRole(parsed.dst),
  ])
  return [...roles].filter(role => role !== 'unknown')
}

function isLocalTempSlot(slot: Slot): boolean {
  return slot.player.startsWith('$') && /_t\d+/.test(slot.player)
}

function classifyProofMissSourceKind(
  reason: RewriteProofMissReason,
  parsed: { dst: Slot; src: Slot },
): RewriteProofMissSourceKind {
  if (reason === 'insufficient-command-context') return 'insufficient-context'
  if (isProtectedSlotEvidence(parsed.src) || isProtectedSlotEvidence(parsed.dst)) {
    return 'protected-slot'
  }
  if (isPotentialExternalMentionSlotInLir(parsed.src) || isPotentialExternalMentionSlotInLir(parsed.dst)) {
    return 'external-mention'
  }
  const sourceRoles = classifySlotRolesForProofMiss(parsed)
  if (sourceRoles.every(role => role === 'local-temp')) {
    return 'local-temp-only'
  }
  return 'command-pattern'
}

function slotTouchesArithmetic(parsed: { dst: Slot; src: Slot }, arithmetic: ScoreArithmetic | null): boolean {
  if (!arithmetic) return false
  return sameSlot(arithmetic.dst, parsed.dst)
    || sameSlot(arithmetic.dst, parsed.src)
    || sameSlot(arithmetic.src, parsed.dst)
    || sameSlot(arithmetic.src, parsed.src)
}

function parseLineReadsSlot(line: string, slot: Slot): boolean {
  const arithmetic = parseScoreArithmetic(line)
  if (arithmetic) {
    return sameSlot(arithmetic.src, slot) || sameSlot(arithmetic.dst, slot)
  }

  const copy = parseScoreCopy(line)
  return copy ? sameSlot(copy.src, slot) : false
}

function parseLineWritesSlot(line: string, slot: Slot): boolean {
  const arithmetic = parseScoreArithmetic(line)
  if (arithmetic) return sameSlot(arithmetic.dst, slot)

  const copy = parseScoreCopy(line)
  return copy ? sameSlot(copy.dst, slot) : false
}

function isCandidateLikeLivenessFamilyEvidence(kind: RewriteProofMissLocalProofEvidenceKind): boolean {
  return kind === 'adjacent-arith-source-reused' || kind === 'copy-chain-local-temp'
}

function livenessWindowKindReadiness(
  locallySafeCount: number,
  blockedCount: number,
  unknownCount: number,
): RewriteProofMissLivenessWindowReadiness {
  if (locallySafeCount > 0) return 'locally-safe-but-diagnostics-only'
  if (blockedCount > 0) return 'blocked'
  if (unknownCount > 0) return 'unknown'
  return 'unknown'
}

function classifyProofMissAdjacentWindowBreakdownKind(
  proofMissReason: RewriteProofMissReason,
  sourceKind: RewriteProofMissSourceKind,
  livenessWindowKind?: RewriteProofMissLivenessWindowKind,
): RewriteProofMissLirAdjacentWindowBreakdownKind | undefined {
  if (sourceKind === 'protected-slot' || sourceKind === 'external-mention') {
    return 'protected-boundary-blocked'
  }

  if (proofMissReason === 'no-exact-lir-local-proof') {
    return 'local-temp-exact-proof-gap'
  }

  if (proofMissReason === 'barrier-or-non-adjacent' || proofMissReason === 'command-level-only-artifact') {
    return 'candidate-shape-not-satisfying-lir-local-proof'
  }

  if (livenessWindowKind === 'unknown-window-too-small') {
    return 'adjacent-window-missing-or-incomplete'
  }

  if (livenessWindowKind === 'unknown-unparsed-command') {
    return 'unknown-unparsed-command'
  }

  return undefined
}

const LIR_ADJACENT_WINDOW_NEXT_GOALS: Record<RewriteProofMissLirAdjacentWindowBreakdownKind, string> = {
  'unknown-unparsed-command': 'Collect parse-complete adjacent command text before attempting adjacent-window liveness probes.',
  'adjacent-window-missing-or-incomplete': 'Increase command-window capture depth around copy/arithmetic pairs.',
  'protected-boundary-blocked': 'Collect evidence for protected/parameter boundary-safe rewrite candidates separately.',
  'local-temp-exact-proof-gap': 'Collect exact local-proof evidence for local-temp-only misses before rewrite-test expansion.',
  'candidate-shape-not-satisfying-lir-local-proof': 'Refine candidate-shape filtering and retry local LIR proof checks.',
}

const LOCAL_TEMP_PROOF_GAP_READINESS_GOALS: Record<
  RewriteProofMissLirLocalTempProofGapReadiness,
  string
> = {
  'rewrite-test-candidate-local-window': 'Collect deterministic command-window examples for this exact single local-temp copy shape before rewrite-test expansion.',
  'needs-predecessor-window-proof': 'Collect predecessor-window evidence to prove isolated local-temp copy consumers before rewrite-test expansion.',
  'needs-successor-window-proof': 'Collect successor-window evidence to prove isolated local-temp copy producers before rewrite-test expansion.',
  'needs-cross-function-boundary-proof': 'Resolve cross-function or protected-boundary context before attempting rewrite-test expansion.',
  'unknown-local-temp-proof-gap': 'Keep collecting structured adjacent-window evidence before enabling rewrite-test expansion.',
}

const SHORT_WINDOW_PROOF_KIND_GOALS: Record<
  RewriteProofMissLirLocalTempProofWindowKind,
  string
> = {
  'single-predecessor-copy-into-local-temp': 'Gather exact predecessor-copy traces for a short-window rewrite-test candidate.',
  'predecessor-arith-feeds-local-temp': 'Gather one-adjacent arithmetic predecessor evidence for a short-window rewrite-test candidate.',
  'successor-arith-consumes-local-temp': 'Gather one-adjacent successor arithmetic consumption evidence for a short-window rewrite-test candidate.',
  'copy-chain-needs-wider-window': 'Collect wider-window evidence for copy-chain structures before rewrite-test expansion.',
  'cross-function-or-boundary-window': 'Keep collecting safe boundary-aware evidence before candidate rewrite tests.',
  'opaque-or-unparsed-window': 'Collect parse-complete neighboring command evidence before rewrite-test expansion.',
}

const UNKNOWN_CAUSE_ORDER: RewriteProofMissUnknownCause[] = [
  'unparsed-command',
  'opaque-window',
  'insufficient-window',
  'missing-predecessor-evidence',
  'missing-successor-evidence',
  'boundary-or-cross-function',
  'unknown-other',
]

const FUTURE_FIXTURE_BLOCKER_KIND_ORDER = [
  'insufficient-window',
  'opaque-or-unparsed-window',
  'missing-predecessor-evidence',
  'missing-successor-evidence',
  'boundary-or-cross-function',
  'protected-boundary-blocked',
  'unknown-other',
]

const MAX_FIXTURE_EXAMPLES_PER_BUCKET = 3
const MAX_BLOCKED_FAMILY_CASES_PER_BUCKET = 3
const MAX_BLOCKED_FAMILY_EXAMPLES_PER_BUCKET = 3
const MAX_UNKNOWN_CAUSE_EXAMPLES_PER_BUCKET = 3
const MAX_UNKNOWN_CAUSE_CASES_PER_BUCKET = 4
const MAX_FUTURE_FIXTURE_CASES_PER_FAMILY = 4
const MAX_FUTURE_FIXTURE_BLOCKER_CASES = 4

const SHORT_WINDOW_FIXTURE_REWRITE_BUCKETS: Set<RewriteProofMissLirLocalTempProofWindowKind> = new Set([
  'single-predecessor-copy-into-local-temp',
  'predecessor-arith-feeds-local-temp',
  'successor-arith-consumes-local-temp',
])

const SHORT_WINDOW_FIXTURE_RECOMMENDED_TEST_KIND: Record<
  RewriteProofMissLirLocalTempProofWindowKind,
  RewriteProofMissLirFixtureRecommendedTestKind
> = {
  'single-predecessor-copy-into-local-temp': 'short-window-local-copy-fixture',
  'predecessor-arith-feeds-local-temp': 'short-window-local-copy-fixture',
  'successor-arith-consumes-local-temp': 'short-window-local-copy-fixture',
  'copy-chain-needs-wider-window': 'wider-window-local-copy-fixture',
  'cross-function-or-boundary-window': 'cross-function-boundary-fixture',
  'opaque-or-unparsed-window': 'opaque-context-fixture',
}

function toStableCaseName(example: string): string {
  const divider = example.indexOf(':')
  return divider >= 0 ? example.slice(0, divider) : example
}

function summarizeShortWindowFixtureSelection(
  byProofWindowKind: RewriteProofMissLirLocalTempProofWindowSummaryBucket[],
): RewriteProofMissLirFixtureSelectionSummary {
  const sortedBuckets = [...byProofWindowKind]
    .filter(entry => entry.count > 0)
    .sort((left, right) => left.proofWindowKind.localeCompare(right.proofWindowKind))

  const candidateFixtures = sortedBuckets
    .flatMap((bucket) => {
      if (!SHORT_WINDOW_FIXTURE_REWRITE_BUCKETS.has(bucket.proofWindowKind)) return []

      const exampleSeed = bucket.examples.length > 0
        ? bucket.examples
        : bucket.caseNames
          .slice(0, MAX_FIXTURE_EXAMPLES_PER_BUCKET)
          .map(caseName => `${caseName}:1`)
      const dedupe = new Set<string>()
      return exampleSeed
        .slice(0, MAX_FIXTURE_EXAMPLES_PER_BUCKET)
        .filter(example => {
          if (dedupe.has(example)) return false
          dedupe.add(example)
          return true
        })
        .map(example => ({
          bucket: bucket.proofWindowKind,
          caseName: toStableCaseName(example),
          example,
          reason: SHORT_WINDOW_PROOF_KIND_GOALS[bucket.proofWindowKind],
          recommendedTestKind: SHORT_WINDOW_FIXTURE_RECOMMENDED_TEST_KIND[bucket.proofWindowKind],
        }))
        .sort((left, right) => left.caseName.localeCompare(right.caseName) || left.example.localeCompare(right.example))
    })
    .sort((left, right) => left.bucket.localeCompare(right.bucket) || left.caseName.localeCompare(right.caseName) || left.example.localeCompare(right.example))

  const candidateBuckets = new Set(sortedBuckets
    .filter(bucket => SHORT_WINDOW_FIXTURE_REWRITE_BUCKETS.has(bucket.proofWindowKind))
    .map(item => item.proofWindowKind))
  const blockedFixtureFamilies = sortedBuckets
    .filter(bucket => !candidateBuckets.has(bucket.proofWindowKind))
    .filter(bucket => bucket.count > 0)
    .map(bucket => ({
      bucket: bucket.proofWindowKind,
      count: bucket.count,
      caseNames: [...bucket.caseNames].sort().slice(0, MAX_BLOCKED_FAMILY_CASES_PER_BUCKET),
      examples: [...bucket.examples].sort().slice(0, MAX_BLOCKED_FAMILY_EXAMPLES_PER_BUCKET),
      reason: SHORT_WINDOW_PROOF_KIND_GOALS[bucket.proofWindowKind],
    }))
    .sort((left, right) => right.count - left.count || left.bucket.localeCompare(right.bucket))

  const nextSafeDiagnosticGoals = [...new Set(sortedBuckets.map(item => SHORT_WINDOW_PROOF_KIND_GOALS[item.proofWindowKind]))]

  return {
    candidateFixtures,
    blockedFixtureFamilies,
    rewriteEnablementStatus: 'disabled-diagnostics-only',
    nextSafeDiagnosticGoals,
  }
}

function summarizeFutureRewriteFixtureExportSummary(
  localProofEvidenceSummary?: RewriteProofMissLocalProofEvidenceSummary,
): FutureRewriteFixtureExportSummary {
  const empty: FutureRewriteFixtureExportSummary = {
    rewriteEnablementStatus: 'disabled-diagnostics-only',
    exportedFixtureCount: 0,
    blockedFixtureCount: 0,
    candidateFixtureNames: [],
    blockedFixtureNames: [],
    byFixtureFamily: [],
    byBlockerKind: [],
    nextRequiredEvidence: [],
  }
  if (!localProofEvidenceSummary?.lirAdjacentWindowSummary) return empty

  const adjacentWindowSummary = localProofEvidenceSummary.lirAdjacentWindowSummary
  const shortWindowProofSummary = adjacentWindowSummary.shortWindowProofSummary
  if (!shortWindowProofSummary) return empty
  const fixtureSelectionSummary = shortWindowProofSummary.fixtureSelectionSummary

  const caseStatus = new Map<string, 'candidate' | 'blocked'>()
  const caseBlockers = new Map<string, Set<string>>()
  const blockerKindCases = new Map<string, Set<string>>()
  const setCaseAsBlocked = (caseName: string, blockerKind: string): void => {
    caseStatus.set(caseName, 'blocked')
    const blockers = caseBlockers.get(caseName) ?? new Set<string>()
    blockers.add(blockerKind)
    caseBlockers.set(caseName, blockers)
  }
  const setCaseAsCandidate = (caseName: string): void => {
    if (!caseStatus.has(caseName)) {
      caseStatus.set(caseName, 'candidate')
    }
  }
  const addBlockerCase = (blockerKind: string, caseName: string): void => {
    const blockedCases = blockerKindCases.get(blockerKind) ?? new Set<string>()
    blockedCases.add(caseName)
    blockerKindCases.set(blockerKind, blockedCases)
  }
  const classifyShortWindowBlockerKind = (
    proofWindowKind: RewriteProofMissLirLocalTempProofWindowKind,
  ): string | undefined => {
    if (proofWindowKind === 'copy-chain-needs-wider-window') return 'insufficient-window'
    if (proofWindowKind === 'cross-function-or-boundary-window') return 'boundary-or-cross-function'
    if (proofWindowKind === 'opaque-or-unparsed-window') return 'opaque-or-unparsed-window'
    return undefined
  }
  const classifyReadinessBlockerKind = (
    readiness: RewriteProofMissLirLocalTempProofGapReadiness,
  ): string | undefined => {
    if (readiness === 'needs-predecessor-window-proof') return 'missing-predecessor-evidence'
    if (readiness === 'needs-successor-window-proof') return 'missing-successor-evidence'
    if (readiness === 'needs-cross-function-boundary-proof') return 'boundary-or-cross-function'
    return undefined
  }
  const classifyAdjacentWindowBlockerKind = (
    kind: RewriteProofMissLirAdjacentWindowBreakdownKind,
  ): string | undefined => {
    if (kind === 'adjacent-window-missing-or-incomplete') return 'insufficient-window'
    if (kind === 'unknown-unparsed-command') return 'opaque-or-unparsed-window'
    if (kind === 'protected-boundary-blocked') return 'protected-boundary-blocked'
    return undefined
  }

  for (const fixtureCase of fixtureSelectionSummary?.candidateFixtures ?? []) {
    setCaseAsCandidate(fixtureCase.caseName)
  }
  for (const blockedFamily of fixtureSelectionSummary?.blockedFixtureFamilies ?? []) {
    const blockerKind = classifyShortWindowBlockerKind(blockedFamily.bucket) ?? 'unknown-other'
    for (const caseName of blockedFamily.caseNames) {
      setCaseAsBlocked(caseName, blockerKind)
      addBlockerCase(blockerKind, caseName)
    }
  }

  for (const bucket of shortWindowProofSummary.byProofWindowKind) {
    const blockerKind = classifyShortWindowBlockerKind(bucket.proofWindowKind)
    for (const caseName of bucket.caseNames) {
      if (!blockerKind) {
        setCaseAsCandidate(caseName)
        continue
      }
      setCaseAsBlocked(caseName, blockerKind)
      addBlockerCase(blockerKind, caseName)
    }
  }

  for (const entry of localProofEvidenceSummary.lirAdjacentWindowSummary.localTempProofGapReadinessSummary.byReadiness) {
    const blockerKind = classifyReadinessBlockerKind(entry.readiness)
    for (const caseName of entry.caseNames) {
      if (entry.readiness === 'rewrite-test-candidate-local-window') {
        setCaseAsCandidate(caseName)
        continue
      }
      setCaseAsBlocked(caseName, blockerKind ?? 'unknown-other')
      addBlockerCase(blockerKind ?? 'unknown-other', caseName)
    }
  }

  for (const entry of adjacentWindowSummary.proofMissAdjacentWindowBreakdown) {
    const blockerKind = classifyAdjacentWindowBlockerKind(entry.kind)
    if (!blockerKind) {
      if (entry.kind === 'candidate-shape-not-satisfying-lir-local-proof') {
        for (const caseName of entry.caseNames) {
          setCaseAsBlocked(caseName, 'opaque-or-unparsed-window')
          addBlockerCase('opaque-or-unparsed-window', caseName)
        }
      } else if (entry.kind === 'local-temp-exact-proof-gap') {
        for (const caseName of entry.caseNames) {
          setCaseAsCandidate(caseName)
        }
      }
      continue
    }
    for (const caseName of entry.caseNames) {
      setCaseAsBlocked(caseName, blockerKind)
      addBlockerCase(blockerKind, caseName)
    }
  }

  for (const familySummary of localProofEvidenceSummary.byFamily) {
    const familyCaseNames = [
      ...((familySummary as { caseNames?: string[] }).caseNames ?? []),
      ...familySummary.evidenceKinds.flatMap(entry => entry.caseNames),
    ]
    for (const caseName of [...new Set(familyCaseNames)].sort()) {
      if (!caseStatus.has(caseName)) {
        caseStatus.set(caseName, 'candidate')
      }
    }
  }

  const candidateFixtureNames = [...new Set(
    [...caseStatus.entries()].filter(([, kind]) => kind === 'candidate').map(([caseName]) => caseName),
  )].sort()
  const blockedFixtureNames = [...new Set(
    [...caseStatus.entries()].filter(([, kind]) => kind === 'blocked').map(([caseName]) => caseName),
  )].sort()

  const byFixtureFamily = localProofEvidenceSummary.byFamily
    .map((familySummary) => {
      const familyCaseNames = [...new Set([
        ...((familySummary as { caseNames?: string[] }).caseNames ?? []),
        ...familySummary.evidenceKinds.flatMap(entry => entry.caseNames),
      ])]
      const candidateCaseNames = familyCaseNames.filter((caseName) => caseStatus.get(caseName) === 'candidate')
      const blockedCaseNames = familyCaseNames.filter((caseName) => caseStatus.get(caseName) === 'blocked')
      if (candidateCaseNames.length === 0 && blockedCaseNames.length === 0) return undefined
      return {
        family: familySummary.family,
        candidateCount: candidateCaseNames.length,
        blockedCount: blockedCaseNames.length,
        caseNames: [...new Set([...candidateCaseNames, ...blockedCaseNames])].sort().slice(0, MAX_FUTURE_FIXTURE_CASES_PER_FAMILY),
      }
    })
    .filter((entry): entry is RewriteFutureFixtureFamilySummary => entry !== undefined)
    .sort((left, right) => left.family.localeCompare(right.family))

  const byBlockerKind = [...blockerKindCases.entries()]
    .map(([blockerKind, caseNames]) => ({
      blockerKind,
      count: caseNames.size,
      caseNames: [...caseNames].sort().slice(0, MAX_FUTURE_FIXTURE_BLOCKER_CASES),
    }))
    .sort((left, right) => {
      const leftIndex = FUTURE_FIXTURE_BLOCKER_KIND_ORDER.indexOf(left.blockerKind)
      const rightIndex = FUTURE_FIXTURE_BLOCKER_KIND_ORDER.indexOf(right.blockerKind)
      if (leftIndex !== rightIndex) return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex)
      return right.count - left.count || left.blockerKind.localeCompare(right.blockerKind)
    })

  const nextRequiredEvidence = [
    ...adjacentWindowSummary.nextSafeDiagnosticGoals,
    ...((shortWindowProofSummary?.byProofWindowKind ?? [])
      .filter(item => item.count > 0)
      .map(item => SHORT_WINDOW_PROOF_KIND_GOALS[item.proofWindowKind])),
    ...adjacentWindowSummary.localTempProofGapReadinessSummary.nextSafeDiagnosticGoals,
    ...fixtureSelectionSummary?.nextSafeDiagnosticGoals ?? [],
  ].filter((value, index, values) => values.indexOf(value) === index).sort()

  return {
    rewriteEnablementStatus: 'disabled-diagnostics-only',
    exportedFixtureCount: candidateFixtureNames.length,
    blockedFixtureCount: blockedFixtureNames.length,
    candidateFixtureNames,
    blockedFixtureNames,
    byFixtureFamily,
    byBlockerKind,
    nextRequiredEvidence: nextRequiredEvidence.length > 0
      ? nextRequiredEvidence
      : ['Collect deterministic adjacent-window evidence before enabling fixture-selection output.'],
  }
}

function summarizeUnknownCauseSplitSummary(
  localProofEvidenceSummary?: RewriteProofMissLocalProofEvidenceSummary,
): RewriteProofMissUnknownCauseSplitSummary {
  const empty: RewriteProofMissUnknownCauseSplitSummary = {
    totalUnknownLike: 0,
    byUnknownCause: [],
    examples: [],
  }
  if (!localProofEvidenceSummary?.lirAdjacentWindowSummary) return empty

  const adjacentWindowSummary = localProofEvidenceSummary.lirAdjacentWindowSummary
  const shortWindowProofSummary = adjacentWindowSummary.shortWindowProofSummary
  const localTempProofGapReadinessSummary = adjacentWindowSummary.localTempProofGapReadinessSummary

  const byCaseFamily = new Map<string, string[]>()
  for (const familySummary of localProofEvidenceSummary.byFamily) {
    const familyCaseNames = [
      ...((familySummary as { caseNames?: string[] }).caseNames ?? []),
      ...familySummary.evidenceKinds.flatMap(entry => entry.caseNames),
    ]
    for (const caseName of familyCaseNames) {
      byCaseFamily.set(caseName, (byCaseFamily.get(caseName) ?? []).concat(familySummary.family))
    }
  }

  const caseCauseEvidence = new Map<string, {
    evidence: string
    causes: Set<RewriteProofMissUnknownCause>
  }>()
  const shortCaseEvidence = new Map<string, string[]>()
  for (const bucket of shortWindowProofSummary?.byProofWindowKind ?? []) {
    for (const example of bucket.examples) {
      const caseName = toStableCaseName(example)
      const existing = shortCaseEvidence.get(caseName) ?? []
      if (!existing.includes(example)) {
        existing.push(example)
        shortCaseEvidence.set(caseName, existing)
      }
    }
  }
  const adjacentCaseEvidence = new Map<string, string[]>()
  for (const bucket of adjacentWindowSummary.proofMissAdjacentWindowBreakdown) {
    for (const example of bucket.examples) {
      const caseName = toStableCaseName(example)
      const existing = adjacentCaseEvidence.get(caseName) ?? []
      if (!existing.includes(example)) {
        existing.push(example)
        adjacentCaseEvidence.set(caseName, existing)
      }
    }
  }
  const readyCaseEvidence = new Map<string, string[]>()
  for (const bucket of localTempProofGapReadinessSummary.byReadiness) {
    for (const example of bucket.examples) {
      const caseName = toStableCaseName(example)
      const existing = readyCaseEvidence.get(caseName) ?? []
      if (!existing.includes(example)) {
        existing.push(example)
        readyCaseEvidence.set(caseName, existing)
      }
    }
  }

  const getCaseEvidence = (
    caseName: string,
    examplesByCase: Map<string, string[]>,
    fallbackBucket?: string[],
  ): string => {
    const examples = examplesByCase.get(caseName)
    if (examples?.length) return examples[0] ?? `${caseName}:1`
    if (fallbackBucket?.length) return `${caseName}:${fallbackBucket[0]}`
    return `${caseName}:1`
  }
  const addCaseSignal = (
    cause: RewriteProofMissUnknownCause,
    caseNames: string[],
    examplesByCase: Map<string, string[]>,
    fallbackCaseNames: string[] = caseNames,
  ): void => {
    for (const caseName of [...caseNames].sort()) {
      const entry = caseCauseEvidence.get(caseName) ?? {
        evidence: getCaseEvidence(caseName, examplesByCase, fallbackCaseNames),
        causes: new Set(),
      }
      entry.causes.add(cause)
      caseCauseEvidence.set(caseName, entry)
    }
  }
  const setUnknownOtherIfNeeded = (caseName: string): void => {
    if (!caseCauseEvidence.has(caseName)) {
      caseCauseEvidence.set(caseName, {
        evidence: getCaseEvidence(caseName, adjacentCaseEvidence),
        causes: new Set(['unknown-other']),
      })
    }
  }
  const unknownCauseEvidence = (caseName: string): string => {
    return caseCauseEvidence.get(caseName)?.evidence ?? getCaseEvidence(caseName, adjacentCaseEvidence)
  }

  const classifyAdjacentCause = (
    kind: RewriteProofMissLirAdjacentWindowBreakdownKind,
  ): RewriteProofMissUnknownCause | undefined => {
    if (kind === 'unknown-unparsed-command') return 'unparsed-command'
    if (kind === 'adjacent-window-missing-or-incomplete') return 'insufficient-window'
    if (kind === 'protected-boundary-blocked') return 'boundary-or-cross-function'
    if (kind === 'candidate-shape-not-satisfying-lir-local-proof') return 'opaque-window'
    return undefined
  }
  const classifyShortWindowCause = (
    kind: RewriteProofMissLirLocalTempProofWindowKind,
  ): RewriteProofMissUnknownCause | undefined => {
    if (kind === 'copy-chain-needs-wider-window') return 'insufficient-window'
    if (kind === 'cross-function-or-boundary-window') return 'boundary-or-cross-function'
    if (kind === 'opaque-or-unparsed-window') return 'opaque-window'
    return undefined
  }
  const classifyReadinessCause = (
    readiness: RewriteProofMissLirLocalTempProofGapReadiness,
  ): RewriteProofMissUnknownCause | undefined => {
    if (readiness === 'needs-predecessor-window-proof') return 'missing-predecessor-evidence'
    if (readiness === 'needs-successor-window-proof') return 'missing-successor-evidence'
    if (readiness === 'needs-cross-function-boundary-proof') return 'boundary-or-cross-function'
    if (readiness === 'unknown-local-temp-proof-gap') return 'unknown-other'
    return undefined
  }

  for (const entry of adjacentWindowSummary.proofMissAdjacentWindowBreakdown) {
    if (entry.count <= 0) continue
    const cause = classifyAdjacentCause(entry.kind)
    if (!cause) {
      if (entry.kind === 'local-temp-exact-proof-gap') {
        continue
      }
      if (entry.kind === 'candidate-shape-not-satisfying-lir-local-proof') {
        addCaseSignal('opaque-window', entry.caseNames, adjacentCaseEvidence, entry.examples)
      }
      continue
    }
    addCaseSignal(cause, entry.caseNames, adjacentCaseEvidence, entry.examples)
  }
  for (const entry of localTempProofGapReadinessSummary.byReadiness) {
    if (entry.count <= 0) continue
    const cause = classifyReadinessCause(entry.readiness)
    if (!cause) continue
    addCaseSignal(cause, entry.caseNames, readyCaseEvidence, entry.examples)
  }
  if (shortWindowProofSummary) {
    for (const entry of shortWindowProofSummary.byProofWindowKind) {
      if (entry.count <= 0) continue
      if (entry.proofWindowKind === 'single-predecessor-copy-into-local-temp'
        || entry.proofWindowKind === 'predecessor-arith-feeds-local-temp'
        || entry.proofWindowKind === 'successor-arith-consumes-local-temp') {
        continue
      }
      const cause = classifyShortWindowCause(entry.proofWindowKind)
      if (cause) {
        addCaseSignal(cause, entry.caseNames, shortCaseEvidence, entry.examples)
      }
    }
  }

  for (const familySummary of localProofEvidenceSummary.byFamily) {
    const familySummaryWithNames = familySummary as RewriteProofMissLocalProofFamilyEvidence & { caseNames?: string[] }
    const familyCaseNames = Array.isArray(familySummaryWithNames.caseNames)
      ? familySummaryWithNames.caseNames
      : familySummaryWithNames.evidenceKinds
        .flatMap((entry) => entry.caseNames)
        .filter((caseName, index, list) => list.indexOf(caseName) === index)
        .sort()
    for (const caseName of familyCaseNames) {
      if (caseCauseEvidence.has(caseName)) continue
      if (
        shortWindowProofSummary?.byProofWindowKind.some(
          item => item.proofWindowKind === 'copy-chain-needs-wider-window' && item.caseNames.includes(caseName),
        )
      ) {
        addCaseSignal('insufficient-window', [caseName], shortCaseEvidence, shortCaseEvidence.get(caseName))
        continue
      }
      if (
        shortWindowProofSummary?.byProofWindowKind.some(
          item => item.proofWindowKind === 'cross-function-or-boundary-window' && item.caseNames.includes(caseName),
        )
      ) {
        addCaseSignal('boundary-or-cross-function', [caseName], shortCaseEvidence, shortCaseEvidence.get(caseName))
        continue
      }
      if (
        shortWindowProofSummary?.byProofWindowKind.some(
          item => item.proofWindowKind === 'opaque-or-unparsed-window' && item.caseNames.includes(caseName),
        )
      ) {
        addCaseSignal('opaque-window', [caseName], shortCaseEvidence, shortCaseEvidence.get(caseName))
        continue
      }
      if (
        localTempProofGapReadinessSummary.byReadiness.some(
          item => item.readiness === 'unknown-local-temp-proof-gap' && item.caseNames.includes(caseName),
        )
      ) {
        setUnknownOtherIfNeeded(caseName)
        continue
      }
    }
  }

  const chooseUnknownCause = (causes: Set<RewriteProofMissUnknownCause>): RewriteProofMissUnknownCause => {
    for (const cause of UNKNOWN_CAUSE_ORDER) {
      if (causes.has(cause)) return cause
    }
    return 'unknown-other'
  }

  const byUnknownCause = new Map<RewriteProofMissUnknownCause, {
    count: number
    caseNames: Set<string>
    examples: string[]
  }>()
  for (const [caseName, evidence] of caseCauseEvidence.entries()) {
    const cause = chooseUnknownCause(evidence.causes)
    const entry = byUnknownCause.get(cause) ?? {
      count: 0,
      caseNames: new Set(),
      examples: [],
    }
    entry.caseNames.add(caseName)
    entry.count += 1
    if (entry.examples.length < MAX_UNKNOWN_CAUSE_EXAMPLES_PER_BUCKET) {
      entry.examples.push(evidence.evidence)
    }
    byUnknownCause.set(cause, entry)
  }

  const byUnknownCauseArray = UNKNOWN_CAUSE_ORDER
    .map((cause) => {
      const summary = byUnknownCause.get(cause)
      if (!summary) return undefined
      return {
        cause,
        count: summary.count,
        caseNames: [...summary.caseNames].sort().slice(0, MAX_UNKNOWN_CAUSE_CASES_PER_BUCKET),
        examples: summary.examples.slice(0, MAX_UNKNOWN_CAUSE_EXAMPLES_PER_BUCKET),
      }
    })
    .filter((entry): entry is RewriteProofMissUnknownCauseSplitEntry => entry !== undefined)
    .sort((left, right) => left.cause.localeCompare(right.cause))

  const byUnknownCauseByCount = [...byUnknownCauseArray]
    .sort((left, right) => right.count - left.count || left.cause.localeCompare(right.cause))

  const examples: RewriteProofMissUnknownCauseSplitExample[] = []
  const exampleCases = new Set<string>()
  for (const entry of byUnknownCauseByCount) {
    for (const caseName of entry.caseNames.slice(0, MAX_UNKNOWN_CAUSE_CASES_PER_BUCKET)) {
      if (exampleCases.has(caseName)) continue
      exampleCases.add(caseName)
      examples.push({
        caseName,
        cause: entry.cause,
        evidence: unknownCauseEvidence(caseName),
        family: byCaseFamily.get(caseName)?.[0],
      })
    }
  }

  return {
    totalUnknownLike: byUnknownCauseArray.reduce((sum, entry) => sum + entry.count, 0),
    byUnknownCause: byUnknownCauseArray,
    examples: examples.slice(0, MAX_UNKNOWN_CAUSE_EXAMPLES_PER_BUCKET),
  }
}

function summarizeOfflineRewriteTestHarnessSummary(
  futureFixtureExportSummary: FutureRewriteFixtureExportSummary,
  shortWindowProofSummary?: RewriteProofMissLirLocalTempProofWindowSummary,
  unknownSplitSummary?: RewriteProofMissUnknownCauseSplitSummary,
): OfflineRewriteTestHarnessSummary {
  const supportedTestKinds = new Set<string>()

  for (const bucket of shortWindowProofSummary?.byProofWindowKind ?? []) {
    supportedTestKinds.add(SHORT_WINDOW_FIXTURE_RECOMMENDED_TEST_KIND[bucket.proofWindowKind])
  }
  for (const blocked of futureFixtureExportSummary.byBlockerKind) {
    if (blocked.blockerKind === 'insufficient-window' || blocked.blockerKind === 'missing-predecessor-evidence' || blocked.blockerKind === 'missing-successor-evidence') {
      supportedTestKinds.add('wider-window-local-copy-fixture')
    } else if (blocked.blockerKind === 'boundary-or-cross-function' || blocked.blockerKind === 'protected-boundary-blocked') {
      supportedTestKinds.add('cross-function-boundary-fixture')
    } else if (blocked.blockerKind === 'opaque-or-unparsed-window') {
      supportedTestKinds.add('opaque-context-fixture')
    }
  }
  const supportedTestKindsSorted = [...supportedTestKinds].sort()
  const requiredBeforeRewriteEnablement = [
    ...futureFixtureExportSummary.nextRequiredEvidence,
    ...futureFixtureExportSummary.byBlockerKind.map(item => `Resolve ${item.blockerKind} before enabling rewrite-test fixtures.`),
    ...(unknownSplitSummary?.examples ?? []).map(item => `Conservatively review ${item.caseName} for ${item.cause} before enabling rewrites.`),
  ]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .filter((item, index, all) => all.indexOf(item) === index)
    .sort()

  let harnessStatus: RewriteTestHarnessStatus = 'no-candidates'
  if (futureFixtureExportSummary.exportedFixtureCount > 0 && futureFixtureExportSummary.blockedFixtureCount > 0) {
    harnessStatus = 'blocked-by-unknown-evidence'
  } else if (futureFixtureExportSummary.exportedFixtureCount > 0) {
    harnessStatus = 'fixture-selection-only'
  }

  return {
    rewriteEnablementStatus: 'disabled-diagnostics-only',
    harnessStatus,
    candidateFixtureCount: futureFixtureExportSummary.exportedFixtureCount,
    blockedFixtureCount: futureFixtureExportSummary.blockedFixtureCount,
    supportedTestKinds: supportedTestKindsSorted,
    requiredBeforeRewriteEnablement: requiredBeforeRewriteEnablement.length > 0
      ? requiredBeforeRewriteEnablement
      : [
        'Collect deterministic adjacent-window signals and classify blocker causes before enabling fixture harness output.',
        'Verify no rewrite proof has been claimed from these diagnostics-only fixtures.',
      ],
  }
}

function classifyLocalTempProofGapShortWindowKind(
  family: string,
  sourceKind: RewriteProofMissSourceKind,
  parsedCopy: { dst: Slot; src: Slot },
  previousLine: string | undefined,
  nextLine: string | undefined,
  nextNextLine: string | undefined,
): RewriteProofMissLirLocalTempProofWindowKind {
  if (sourceKind === 'external-mention' || sourceKind === 'protected-slot' || sourceKind === 'insufficient-context') {
    return 'cross-function-or-boundary-window'
  }

  if (!isLocalTempSlot(parsedCopy.src) || !isLocalTempSlot(parsedCopy.dst)) {
    return 'cross-function-or-boundary-window'
  }

  const previousCopy = previousLine ? parseScoreCopy(previousLine) : null
  const previousArithmetic = previousLine ? parseScoreArithmetic(previousLine) : null
  const nextCopy = nextLine ? parseScoreCopy(nextLine) : null
  const nextArithmetic = nextLine ? parseScoreArithmetic(nextLine) : null
  const nextNextCopy = nextNextLine ? parseScoreCopy(nextNextLine) : null
  const nextNextArithmetic = nextNextLine ? parseScoreArithmetic(nextNextLine) : null

  const barrierHint = [previousLine, nextLine, nextNextLine].some(line => line ? isBarrierLine(line) : false)
  if (barrierHint) {
    return 'cross-function-or-boundary-window'
  }

  if (family === 'copy-feeds-copy-chain') {
    if (previousCopy && sameSlot(previousCopy.dst, parsedCopy.src)) {
      return 'single-predecessor-copy-into-local-temp'
    }
    if (nextCopy && sameSlot(nextCopy.src, parsedCopy.dst)) {
      return 'copy-chain-needs-wider-window'
    }
    if (nextNextCopy && sameSlot(nextNextCopy.src, parsedCopy.dst)) {
      return 'copy-chain-needs-wider-window'
    }
  } else {
    if (previousArithmetic && sameSlot(previousArithmetic.dst, parsedCopy.src)) {
      return 'predecessor-arith-feeds-local-temp'
    }
    if (
      (nextArithmetic && sameSlot(nextArithmetic.src, parsedCopy.dst))
      || (nextNextArithmetic && sameSlot(nextNextArithmetic.src, parsedCopy.dst))
    ) {
      return 'successor-arith-consumes-local-temp'
    }
  }

  const seesLocalSlotsButUnparsed = [previousLine, nextLine, nextNextLine].some(line => {
    if (!line) return false
    if (parseScoreCopy(line) || parseScoreArithmetic(line)) return false
    return lineMentionsSlot(line, parsedCopy.src) || lineMentionsSlot(line, parsedCopy.dst)
  })
  if (seesLocalSlotsButUnparsed) {
    return 'opaque-or-unparsed-window'
  }

  return 'opaque-or-unparsed-window'
}

function summarizeLocalTempProofGapShortWindowSummary(
  byProofWindowKind: Map<RewriteProofMissLirLocalTempProofWindowKind, { count: number; caseNames: Set<string>; examples: string[] }>,
  totalCandidateLike: number,
): RewriteProofMissLirLocalTempProofWindowSummary {
  const byProofWindowKindEntries = [...byProofWindowKind.entries()]
    .map(([proofWindowKind, value]) => ({
      proofWindowKind,
      count: value.count,
      caseNames: [...value.caseNames].sort(),
      examples: value.examples.slice(0, 3),
    }))
    .filter(entry => entry.count > 0)
    .sort((left, right) => right.count - left.count || left.proofWindowKind.localeCompare(right.proofWindowKind))

  const accounted = byProofWindowKindEntries.reduce((sum, entry) => sum + entry.count, 0)
  const normalized = accounted >= totalCandidateLike
    ? byProofWindowKindEntries
    : [
      ...byProofWindowKindEntries,
      {
        proofWindowKind: 'opaque-or-unparsed-window' as RewriteProofMissLirLocalTempProofWindowKind,
        count: totalCandidateLike - accounted,
        caseNames: [],
        examples: [],
      },
    ].sort((left, right) => right.count - left.count || left.proofWindowKind.localeCompare(right.proofWindowKind))

  const futureRewriteTestCandidateCaseNames = new Set<string>()
  const needsWiderWindowCaseNames = new Set<string>()
  for (const bucket of normalized) {
    if (bucket.count === 0) continue
    if (bucket.proofWindowKind === 'single-predecessor-copy-into-local-temp'
      || bucket.proofWindowKind === 'predecessor-arith-feeds-local-temp'
      || bucket.proofWindowKind === 'successor-arith-consumes-local-temp'
    ) {
      for (const caseName of bucket.caseNames) {
        futureRewriteTestCandidateCaseNames.add(caseName)
      }
      continue
    }
    for (const caseName of bucket.caseNames) {
      needsWiderWindowCaseNames.add(caseName)
    }
  }

  return {
    totalCandidateLike,
    byProofWindowKind: normalized,
    futureRewriteTestCandidateCaseNames: [...futureRewriteTestCandidateCaseNames].sort(),
    needsWiderWindowCaseNames: [...needsWiderWindowCaseNames].sort(),
    fixtureSelectionSummary: summarizeShortWindowFixtureSelection(normalized),
  }
}

type RewriteProofGapWindowDirection = 'previous' | 'next' | 'both' | 'none'

function classifyLocalTempProofGapWindowDirection(
  family: string,
  parsedCopy: { dst: Slot; src: Slot },
  previousLine: string | undefined,
  nextLine: string | undefined,
): RewriteProofGapWindowDirection {
  const previousMatch = family === 'copy-feeds-copy-chain'
    ? previousLine ? parseScoreCopy(previousLine) : undefined
    : previousLine ? parseScoreArithmetic(previousLine) : undefined
  const nextMatch = family === 'copy-feeds-copy-chain'
    ? nextLine ? parseScoreCopy(nextLine) : undefined
    : nextLine ? parseScoreArithmetic(nextLine) : undefined
  const touchesArithmetic = (
    parsedArithmetic: { dst: Slot; src: Slot } | null | undefined,
  ): boolean => {
    if (!parsedArithmetic) return false
    return sameSlot(parsedArithmetic.dst, parsedCopy.dst)
      || sameSlot(parsedArithmetic.dst, parsedCopy.src)
      || sameSlot(parsedArithmetic.src, parsedCopy.dst)
      || sameSlot(parsedArithmetic.src, parsedCopy.src)
  }

  const previousTouches = family === 'copy-feeds-copy-chain' && previousMatch
    ? sameSlot(previousMatch.src, parsedCopy.dst)
    : touchesArithmetic(previousMatch)

  const nextTouches = family === 'copy-feeds-copy-chain' && nextMatch
    ? sameSlot(nextMatch.src, parsedCopy.dst)
    : touchesArithmetic(nextMatch)

  if (previousTouches && nextTouches) return 'both'
  if (previousTouches) return 'previous'
  if (nextTouches) return 'next'
  return 'none'
}

function classifyLocalTempProofGapReadiness(
  proofMissFamily: string,
  proofMissReason: RewriteProofMissReason,
  sourceKind: RewriteProofMissSourceKind,
  parsedCopy: { dst: Slot; src: Slot },
  livenessWindowKind: RewriteProofMissLivenessWindowKind | undefined,
  previousLine: string | undefined,
  nextLine: string | undefined,
): RewriteProofMissLirLocalTempProofGapReadiness {
  if (proofMissReason !== 'no-exact-lir-local-proof') return 'unknown-local-temp-proof-gap'
  if (sourceKind === 'external-mention' || sourceKind === 'protected-slot') {
    return 'needs-cross-function-boundary-proof'
  }
  if (!isLocalTempSlot(parsedCopy.src) || !isLocalTempSlot(parsedCopy.dst)) return 'unknown-local-temp-proof-gap'
  if (sourceKind !== 'local-temp-only') return 'unknown-local-temp-proof-gap'

  if (
    livenessWindowKind === 'single-adjacent-arith-no-reuse'
    || livenessWindowKind === 'copy-chain-no-reuse'
  ) {
    return 'rewrite-test-candidate-local-window'
  }

  const direction = classifyLocalTempProofGapWindowDirection(proofMissFamily, parsedCopy, previousLine, nextLine)
  if (direction === 'previous') return 'needs-predecessor-window-proof'
  if (direction === 'next') return 'needs-successor-window-proof'
  return 'unknown-local-temp-proof-gap'
}

function summarizeLocalTempProofGapReadinessSummary(
  byReadiness: Map<
    RewriteProofMissLirLocalTempProofGapReadiness,
    { count: number; caseNames: Set<string>; examples: string[] }
  >,
  totalCandidateLike: number,
): RewriteProofMissLirLocalTempProofGapReadinessSummary {
  const byReadinessEntries = [...byReadiness.entries()]
    .map(([readiness, value]) => ({
      readiness,
      count: value.count,
      caseNames: [...value.caseNames].sort(),
      examples: value.examples.slice(0, 3),
    }))
    .filter(entry => entry.count > 0)
    .sort((left, right) => right.count - left.count || left.readiness.localeCompare(right.readiness))

  let normalized = byReadinessEntries.length > 0 ? byReadinessEntries : [
    {
      readiness: 'unknown-local-temp-proof-gap' as const,
      count: totalCandidateLike,
      caseNames: [],
      examples: [],
    },
  ]

  const accounted = normalized.reduce((sum, entry) => sum + entry.count, 0)
  if (accounted < totalCandidateLike) {
    normalized = [
      ...normalized,
      {
        readiness: 'unknown-local-temp-proof-gap' as const,
        count: totalCandidateLike - accounted,
        caseNames: [],
        examples: [],
      },
    ].sort((left, right) => right.count - left.count || left.readiness.localeCompare(right.readiness))
  }

  const candidateCaseNamesSet = new Set<string>()
  const blockedOrUnknownCaseNamesSet = new Set<string>()
  for (const bucket of normalized) {
    const target = bucket.readiness === 'rewrite-test-candidate-local-window'
      ? candidateCaseNamesSet
      : blockedOrUnknownCaseNamesSet
    for (const caseName of bucket.caseNames) target.add(caseName)
  }

  const totalCandidateCount = normalized.find((entry) => entry.readiness === 'rewrite-test-candidate-local-window')?.count ?? 0
  const blockedOrUnknownCount = normalized.reduce((sum, item) => (
    item.readiness === 'rewrite-test-candidate-local-window' ? sum : sum + item.count
  ), 0)

  return {
    byReadiness: normalized,
    candidateCaseNames: [...candidateCaseNamesSet].sort(),
    blockedOrUnknownCaseNames: [...blockedOrUnknownCaseNamesSet].sort(),
    totalCandidateLike: totalCandidateLike,
    candidateCount: totalCandidateCount,
    blockedOrUnknownCount,
    nextSafeDiagnosticGoals: normalized
      .map(item => LOCAL_TEMP_PROOF_GAP_READINESS_GOALS[item.readiness])
      .filter((goal, index, goals) => goals.indexOf(goal) === index),
  }
}

function summarizeLirAdjacentWindowBreakdown(
  byKind: Map<RewriteProofMissLirAdjacentWindowBreakdownKind, {
    count: number
    caseNames: Set<string>
    examples: string[]
  }>,
  byLocalTempProofGapReadiness?: Map<
    RewriteProofMissLirLocalTempProofGapReadiness,
    { count: number; caseNames: Set<string>; examples: string[] }
  >,
  byLocalTempProofGapWindowKind?: Map<
    RewriteProofMissLirLocalTempProofWindowKind,
    { count: number; caseNames: Set<string>; examples: string[] }
  >,
): RewriteProofMissLirAdjacentWindowSummary {
  const proofMissAdjacentWindowBreakdown = [...byKind.entries()]
    .map(([kind, value]) => ({
      kind,
      count: value.count,
      caseNames: [...value.caseNames].sort(),
      examples: value.examples.slice(0, 3),
    }))
    .sort((left, right) => right.count - left.count || left.kind.localeCompare(right.kind))

  const unknownUnparsedCommandCases = byKind.get('unknown-unparsed-command')?.count ?? 0
  const adjacentWindowMissingOrIncompleteCases = byKind.get('adjacent-window-missing-or-incomplete')?.count ?? 0
  const localTempExactProofGapCases = byKind.get('local-temp-exact-proof-gap')?.count ?? 0
  const protectedBoundaryBlockedCases = byKind.get('protected-boundary-blocked')?.count ?? 0
  const candidateShapeNotSatisfyingLirLocalProofCases =
    byKind.get('candidate-shape-not-satisfying-lir-local-proof')?.count ?? 0
  const totalCandidateLike =
    proofMissAdjacentWindowBreakdown.reduce((sum, item) => sum + item.count, 0)
  const localTempExactProofGapCasesForReadiness = localTempExactProofGapCases
  const localTempProofGapReadinessSummary = summarizeLocalTempProofGapReadinessSummary(
    byLocalTempProofGapReadiness ?? new Map(),
    localTempExactProofGapCasesForReadiness,
  )
  const shortWindowProofSummary = summarizeLocalTempProofGapShortWindowSummary(
    byLocalTempProofGapWindowKind ?? new Map(),
    localTempExactProofGapCasesForReadiness,
  )
  const nextSafeDiagnosticGoals = proofMissAdjacentWindowBreakdown
    .map(item => LIR_ADJACENT_WINDOW_NEXT_GOALS[item.kind])
    .filter((goal, index, goals) => goals.indexOf(goal) === index)

  return {
    proofMissAdjacentWindowBreakdown,
    unknownUnparsedCommandCases,
    localTempExactProofGapCases,
    protectedBoundaryBlockedCases,
    adjacentWindowMissingOrIncompleteCases,
    candidateShapeNotSatisfyingLirLocalProofCases,
      localTempProofGapReadinessSummary,
      shortWindowProofSummary,
      totalCandidateLike,
      proofReadiness: livenessWindowKindReadiness(0, 0, totalCandidateLike),
      nextSafeDiagnosticGoals,
      recommendation: totalCandidateLike > 0
        ? `Focus diagnostics on ${proofMissAdjacentWindowBreakdown[0]?.kind} for deterministic adjacent-window proof misses.`
      : 'Collect adjacent-window evidence before enabling diagnostics-only rewrite candidates.',
  }
}

function summarizeLivenessWindowRecommendation(
  byFamily: RewriteProofMissLivenessWindowFamilyEvidence[],
): string {
  const readyFamily = byFamily.find(entry => entry.proofReadiness === 'locally-safe-but-diagnostics-only')
  if (readyFamily) {
    return `Use diagnostics-only liveness-window evidence for ${readyFamily.family} before rewrite-test expansion.`
  }
  const blockedFamily = byFamily.find(entry => entry.proofReadiness === 'blocked')
  if (blockedFamily) {
    return `Do not promote ${blockedFamily.family} until blocked local liveness-window evidence is resolved.`
  }
  return 'Collect additional local command-window evidence before enabling diagnostics-only rewrite candidates.'
}

function getLivenessWindowSummary(
  family: string,
  summary?: RewriteProofMissLivenessWindowFamilyEvidence,
): RewriteProofMissLivenessWindowFamilyEvidence {
  return summary ?? {
    family,
    totalCandidateLike: 0,
    locallySafeCandidateCount: 0,
    blockedCandidateCount: 0,
    unknownCandidateCount: 0,
    windowKinds: [],
    proofReadiness: 'unknown',
    recommendation: 'Collect additional local command-window evidence before enabling diagnostics-only rewrite candidates.',
  }
}

function classifyLivenessWindowKind(
  family: string,
  lines: Array<{ path: string; line: number; content: string }>,
  index: number,
  parsedCopy: { dst: Slot; src: Slot },
): RewriteProofMissLivenessWindowKind {
  const current = lines[index]
  const samePath = (value: { path: string }) => value.path === current.path

  const nextLine = index + 1 < lines.length && samePath(lines[index + 1])
    ? lines[index + 1]
    : undefined
  const previousLine = index > 0 && samePath(lines[index - 1])
    ? lines[index - 1]
    : undefined

  if (!nextLine && !previousLine) return 'unknown-window-too-small'

  const consumerCandidates: Array<{ direction: 'previous' | 'next'; index: number; content: string }> = []
  if (previousLine) {
    if (family === 'copy-feeds-copy-chain') {
      const parsed = parseScoreCopy(previousLine.content)
      if (parsed && sameSlot(parsed.src, parsedCopy.dst)) {
        consumerCandidates.push({ direction: 'previous', index: index - 1, content: previousLine.content })
      }
    } else {
      const parsed = parseScoreArithmetic(previousLine.content)
      if (parsed && sameSlot(parsed.src, parsedCopy.dst)) {
        consumerCandidates.push({ direction: 'previous', index: index - 1, content: previousLine.content })
      }
    }
  }
  if (nextLine) {
    if (family === 'copy-feeds-copy-chain') {
      const parsed = parseScoreCopy(nextLine.content)
      if (parsed && sameSlot(parsed.src, parsedCopy.dst)) {
        consumerCandidates.push({ direction: 'next', index: index + 1, content: nextLine.content })
      }
    } else {
      const parsed = parseScoreArithmetic(nextLine.content)
      if (parsed && sameSlot(parsed.src, parsedCopy.dst)) {
        consumerCandidates.push({ direction: 'next', index: index + 1, content: nextLine.content })
      }
    }
  }

  if (consumerCandidates.length !== 1) {
    return 'unknown-unparsed-command'
  }

  const consumer = consumerCandidates[0]
  const directionSafe = consumer.direction === 'next' || consumer.direction === 'previous'
  if (!directionSafe) return 'unknown-unparsed-command'

  const windowEnd = Math.min(lines.length - 1, index + 2)
  const windowStart = Math.max(0, index - 2)
  const isWithinWindow = (lineIndex: number): boolean =>
    lineIndex >= windowStart && lineIndex <= windowEnd && samePath(lines[lineIndex])

  const postWindow = consumer.index === index + 1
    ? isWithinWindow(consumer.index + 1) && lines[consumer.index + 1].path === current.path
    : isWithinWindow(consumer.index + 1) && lines[consumer.index + 1].path === current.path

  if (!postWindow) return 'unknown-window-too-small'

  const preRangeStart = Math.min(index, consumer.index) + 1
  const preRangeEnd = Math.max(index, consumer.index) - 1
  for (let i = preRangeStart; i <= preRangeEnd; i += 1) {
    if (!samePath(lines[i])) continue
    if (!parseScoreCopy(lines[i].content) && !parseScoreArithmetic(lines[i].content)) {
      if (lineMentionsSlot(lines[i].content, parsedCopy.src) || lineMentionsSlot(lines[i].content, parsedCopy.dst)) {
        return 'unknown-unparsed-command'
      }
      continue
    }
    if (parseLineWritesSlot(lines[i].content, parsedCopy.src)) return 'blocked-src-overwritten-before-use'
  }

  const postRangeEnd = Math.min(windowEnd, lines.length - 1)
  for (let i = consumer.index + 1; i <= postRangeEnd; i += 1) {
    if (!samePath(lines[i])) break
    if (!parseScoreCopy(lines[i].content) && !parseScoreArithmetic(lines[i].content)) {
      if (lineMentionsSlot(lines[i].content, parsedCopy.dst)) {
        return 'unknown-unparsed-command'
      }
      continue
    }
    if (parseLineReadsSlot(lines[i].content, parsedCopy.dst)) {
      return 'blocked-dst-reused-after-window'
    }
  }

  return family === 'copy-feeds-copy-chain'
    ? 'copy-chain-no-reuse'
    : 'single-adjacent-arith-no-reuse'
}

function classifyLocalProofEvidenceKind(
  family: string,
  sourceKind: RewriteProofMissSourceKind,
  parsedCopy: { dst: Slot; src: Slot },
  previousLine: string | undefined,
  nextLine: string | undefined,
): RewriteProofMissLocalProofEvidenceKind {
  if (sourceKind === 'insufficient-context') {
    return 'insufficient-context'
  }

  if (!isLocalTempSlot(parsedCopy.src) || !isLocalTempSlot(parsedCopy.dst)) {
    return 'other-local-temp'
  }

  if (family === 'copy-feeds-copy-chain') {
    return 'copy-chain-local-temp'
  }

  const previousArithmetic = previousLine ? parseScoreArithmetic(previousLine) : null
  const nextArithmetic = nextLine ? parseScoreArithmetic(nextLine) : null
  if (slotTouchesArithmetic(parsedCopy, previousArithmetic) || slotTouchesArithmetic(parsedCopy, nextArithmetic)) {
    return 'adjacent-arith-source-reused'
  }

  return 'needs-liveness-window'
}

const TARGET_PROOF_MISS_FAMILIES: ReadonlyArray<string> = [
  'arithmetic-copy-feeds-const-or-add-imm',
  'copy-feeds-copy-chain',
]
const TARGET_PROOF_MISS_FAMILY_SET = new Set<string>(TARGET_PROOF_MISS_FAMILIES)

function isRecoverableProofMissFamily(family: string): boolean {
  return TARGET_PROOF_MISS_FAMILY_SET.has(family)
}

function isBarrierShape(shape: string): boolean {
  return shape === 'boundary'
    || shape === 'function_call'
    || shape === 'execute'
    || shape === 'data'
    || shape === 'macro'
    || shape === 'return'
    || shape === 'return_score'
    || shape === 'other'
    || shape === 'scoreboard_other'
}

function patternContainsBarrierSignal(pattern: string): boolean {
  return pattern.split('->').some(shape => isBarrierShape(shape.trim()))
}

function classifyProofMissReason(
  reason: RewriteProvenanceReason,
  pattern: string,
  currentLine: string,
): RewriteProofMissReason {
  const parsed = parseScoreCopy(currentLine)
  if (!parsed) return 'command-level-only-artifact'

  const mentionsProtectedSlot = isProtectedSlot(parsed.src)
    || isProtectedSlot(parsed.dst)
    || parsed.src.player.includes('$__const_')
    || parsed.dst.player.includes('$__const_')
  const mentionsExternalSlot =
    isPotentialExternalMentionSlot(parsed.src)
    || isPotentialExternalMentionSlot(parsed.dst)
    || parsed.src.player.startsWith('$ret')
    || parsed.dst.player.startsWith('$ret')

  if (
    reason === 'blocked-by-cross-function-module-external-mention'
    || reason === 'blocked-by-protected-slot'
    || mentionsProtectedSlot
    || mentionsExternalSlot
  ) {
    return 'external-or-protected-slot'
  }

  if (reason === 'blocked-by-barrier-or-non-adjacent-shape' || patternContainsBarrierSignal(pattern)) {
    return 'barrier-or-non-adjacent'
  }

  if (reason === 'insufficient-command-level-information') {
    return 'insufficient-command-context'
  }

  if (reason === 'blocked-by-pattern-not-exact-adjacent-score-copy-arith') {
    const family = classifyShapeFamilyForBlockedPatternNotExact(pattern, currentLine)
    return family === 'other-pattern-not-exact'
      ? 'command-level-only-artifact'
      : 'no-exact-lir-local-proof'
  }

  return 'command-level-only-artifact'
}

function suggestProofMissNextActionFromSources(
  reasons: RewriteShapeFamilyProofMissByReason[],
  sourceKinds: RewriteProofMissSourceKindSummary[],
): RewriteShapeFamilyProofMissNextAction {
  const reasonSet = new Set(reasons.map(item => item.reason))
  if (reasonSet.has('external-or-protected-slot') || reasonSet.has('insufficient-command-context')) {
    return 'lir-safety-analysis'
  }
  if (sourceKinds.some(item => (
    item.sourceKind === 'external-mention'
    || item.sourceKind === 'protected-slot'
    || item.sourceKind === 'insufficient-context'
  ))) {
    return 'lir-safety-analysis'
  }
  if (reasonSet.has('barrier-or-non-adjacent')) return 'focused-probe'
  if (reasonSet.has('no-exact-lir-local-proof')) return 'rewrite-test-candidate'
  return 'leave-blocked'
}

function summarizeLocalProofReadiness(
  candidateCount: number,
  insufficientContextCount: number,
): RewriteProofMissLocalProofReadiness {
  if (candidateCount > 0) {
    return 'candidate-after-liveness-window'
  }
  if (insufficientContextCount > 0) {
    return 'needs-more-context'
  }
  return 'blocked'
}

function summarizeLocalProofEvidenceRecommendation(
  byFamily: RewriteProofMissLocalProofFamilyEvidence[],
): string {
  const topCandidateFamily = byFamily.find(entry => entry.proofReadiness === 'candidate-after-liveness-window')
  if (topCandidateFamily) {
    return `Prioritize local-proof liveness-window probing for ${topCandidateFamily.family} and adjacent-arith/copy-chain candidates.`
  }
  const hasNeedsOnly = byFamily.some(entry => entry.needsLivenessWindowCount > 0)
  if (hasNeedsOnly) {
    return 'Most local-temp-only misses need a local liveness-window verifier before rewrite-test expansion.'
  }
  const hasInsufficientOnly = byFamily.some(entry => entry.insufficientContextCount > 0)
  if (hasInsufficientOnly) {
    return 'Collect additional command-context evidence for insufficient-context misses before local rewrite candidates.'
  }
  return 'No local-proof evidence gaps were observed in target families.'
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function lineMentionsSlot(line: string, slot: Slot): boolean {
  const escapedPlayer = escapeRegExp(slot.player)
  const escapedObj = escapeRegExp(slot.obj)
  return new RegExp(`(?:^|\\s)${escapedPlayer}\\s+${escapedObj}(?:\\s|$)`).test(line)
}

function classifyCopyRewriteProvenanceReason(
  lines: Array<{ path: string; line: number; content: string }>,
  index: number,
  currentLine: string,
  nextLine: string | undefined,
  nextNextLine: string | undefined,
  status: CopyRewriteStatus,
): RewriteProvenanceReason {
  const parsed = parseScoreCopy(currentLine)
  if (!parsed) return 'insufficient-command-level-information'
  if (status === 'currentlyOptimized') return 'already-optimized-by-existing-pass'

  if (isPotentialExternalMentionSlot(parsed.src) || isPotentialExternalMentionSlot(parsed.dst)) {
    return 'blocked-by-cross-function-module-external-mention'
  }

  if (isProtectedSlot(parsed.src) || isProtectedSlot(parsed.dst)) {
    return 'blocked-by-protected-slot'
  }

  const next = nextLine ? parseScoreArithmetic(nextLine) : null
  if (next && sameSlot(next.src, parsed.dst)) {
    if (NON_COMMUTATIVE_SCORE_ARITH_OPERATORS.has(next.op) && sameSlot(next.dst, parsed.src)) {
      return 'blocked-by-alias-safety'
    }

    const lineOffset = index + 1
    let hasLaterRead = false
    for (let i = lineOffset + 1; i < lines.length; i += 1) {
      const candidate = lines[i]
      if (candidate.path !== lines[index].path) break
      if (lineMentionsSlot(candidate.content, parsed.dst)) {
        hasLaterRead = true
        break
      }
    }
    if (hasLaterRead) return 'blocked-by-temp-not-dead-after-consuming-op'
    return 'safe-adjacent-score-copy-arith'
  }

  if (isBarrierLine(nextLine ?? '')) return 'blocked-by-barrier-or-non-adjacent-shape'
  if (next) return 'blocked-by-pattern-not-exact-adjacent-score-copy-arith'

  const nextCopy = nextLine ? parseScoreCopy(nextLine) : null
  const nextReturn = nextLine ? parseReturnValueSlot(nextLine) : null
  const nextNextCopy = nextNextLine ? parseScoreCopy(nextNextLine) : null
  const nextNextArithmetic = nextNextLine ? parseScoreArithmetic(nextNextLine) : null
  const nextNextReturn = nextNextLine ? parseReturnValueSlot(nextNextLine) : null

  if (nextCopy || nextReturn || nextNextCopy || nextNextArithmetic || nextNextReturn) {
    return 'blocked-by-pattern-not-exact-adjacent-score-copy-arith'
  }

  return 'insufficient-command-level-information'
}

function classifyShapeFamilyForBlockedPatternNotExact(pattern: string, currentLine: string): string {
  const shapes = pattern.split('->').map(shape => shape.trim())
  if (shapes.length !== 3) return 'other-pattern-not-exact'

  const [previousShape, , nextShape] = shapes
  const parsed = parseScoreCopy(currentLine)
  const isReturnMaterialization = parsed
    && (parsed.src.player === '$ret'
      || parsed.dst.player === '$ret'
      || parsed.src.player.startsWith('$ret_')
      || parsed.dst.player.startsWith('$ret_'))

  if (nextShape === 'return' || nextShape === 'return_score' || nextShape === 'boundary' || isReturnMaterialization) {
    return 'return-materialization'
  }
  if (previousShape === 'score_copy' && nextShape === 'score_copy') {
    return 'copy-feeds-copy-chain'
  }
  if (previousShape === 'score_copy' && nextShape === 'score_arith') {
    return 'copy-chain-feeds-arithmetic'
  }
  if (previousShape === 'score_arith' && nextShape === 'score_arith') {
    return 'arithmetic-copy-feeds-arithmetic'
  }
  if (previousShape === 'score_arith' && (nextShape === 'score_set_const' || nextShape === 'score_add_imm')) {
    return 'arithmetic-copy-feeds-const-or-add-imm'
  }
  if (previousShape === 'score_set_const' || previousShape === 'boundary') {
    return 'const-or-boundary-copy'
  }

  return 'other-pattern-not-exact'
}

function inferLikelyNextActionForShapeFamily(family: string): RewriteShapeFamilyNextAction {
  if (
    family === 'copy-chain-feeds-arithmetic'
    || family === 'arithmetic-copy-feeds-arithmetic'
    || family === 'copy-feeds-copy-chain'
    || family === 'arithmetic-copy-feeds-const-or-add-imm'
  ) {
    return 'local-canonicalization'
  }
  if (family === 'return-materialization') return 'protected-slot-policy'
  if (family === 'const-or-boundary-copy') return 'liveness-analysis'
  return 'leave-blocked'
}

function summarizeProofMissByFamilyFromBuckets(
  byFamily: Map<
    string,
    {
      total: number
      examples: string[]
      byReason: Map<RewriteProofMissReason, { count: number; examples: string[] }>
      bySlotRole: Map<RewriteProofMissSlotRole, { count: number; examples: string[] }>
      bySourceKind: Map<RewriteProofMissSourceKind, { count: number; examples: string[] }>
      byLocalProofEvidenceKind: Map<RewriteProofMissLocalProofEvidenceKind, { count: number; caseNames: string[]; examples: string[] }>
      byLivenessWindowKind: Map<RewriteProofMissLivenessWindowKind, { count: number; caseNames: string[]; examples: string[] }>
      byAdjacentWindowBreakdown: Map<RewriteProofMissLirAdjacentWindowBreakdownKind, { count: number; caseNames: string[]; examples: string[] }>
      byLocalTempProofGapReadiness: Map<RewriteProofMissLirLocalTempProofGapReadiness, { count: number; caseNames: Set<string>; examples: string[] }>
      byLocalTempProofGapWindowKind: Map<
        RewriteProofMissLirLocalTempProofWindowKind,
        { count: number; caseNames: Set<string>; examples: string[] }
      >
    }
  >,
): RewriteShapeFamilyProofMissSummary | undefined {
  if (byFamily.size === 0) return undefined

  const families = [...byFamily.entries()].map(([family, summary]) => {
    const byReason = [...summary.byReason.entries()].map(([reason, bucket]) => ({
      reason,
      count: bucket.count,
      caseNames: [],
      examples: bucket.examples.slice(0, 3),
    })).sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    const sourceKinds = [...summary.bySourceKind.entries()]
      .map(([sourceKind, bucket]) => ({
        sourceKind,
        count: bucket.count,
        caseNames: [],
        examples: bucket.examples.slice(0, 3),
      }))
      .sort((left, right) => right.count - left.count || left.sourceKind.localeCompare(right.sourceKind))

    const suggestedNextAction = suggestProofMissNextActionFromSources(byReason, sourceKinds)

    return {
      family,
      total: summary.total,
      caseNames: [],
      byReason,
      suggestedNextAction,
    }
  }).sort((left, right) => right.total - left.total || left.family.localeCompare(right.family))

  const familySlotProvenance = [...byFamily.entries()].map(([family, summary]) => {
    const slotRoles = [...summary.bySlotRole.entries()]
      .map(([role, bucket]) => ({
        role,
        count: bucket.count,
        caseNames: [],
        examples: bucket.examples.slice(0, 3),
      }))
      .sort((left, right) => right.count - left.count || left.role.localeCompare(right.role))

    const sourceKinds = [...summary.bySourceKind.entries()]
      .map(([sourceKind, bucket]) => ({
        sourceKind,
        count: bucket.count,
        caseNames: [],
        examples: bucket.examples.slice(0, 3),
      }))
      .sort((left, right) => right.count - left.count || left.sourceKind.localeCompare(right.sourceKind))

    const dominantSourceKind = sourceKinds[0]?.sourceKind ?? 'command-pattern'
    const recommendation = dominantSourceKind === 'external-mention' || dominantSourceKind === 'protected-slot' || dominantSourceKind === 'insufficient-context'
      ? `Do not promote ${family} rewrite-test candidates while ${dominantSourceKind} remains dominant.`
      : dominantSourceKind === 'local-temp-only'
        ? 'Collect local-temp-only evidence and rerun local-liveness probing before rewrite-tests.'
        : 'Collect focused command-path evidence for rewrite-test candidate viability.'

    return {
      family,
      total: summary.total,
      slotRoles,
      sourceKinds,
      recommendation,
    }
  })

  const proofMissAdjacentWindowBreakdownMap = new Map<
    RewriteProofMissLirAdjacentWindowBreakdownKind,
    { count: number; caseNames: Set<string>; examples: string[] }
  >()
  const proofMissLocalTempProofGapReadinessMap = new Map<
    RewriteProofMissLirLocalTempProofGapReadiness,
    { count: number; caseNames: Set<string>; examples: string[] }
  >()
  const proofMissLocalTempProofGapWindowKindMap = new Map<
    RewriteProofMissLirLocalTempProofWindowKind,
    { count: number; caseNames: Set<string>; examples: string[] }
  >()

  const localProofEvidenceByFamily: RewriteProofMissLocalProofFamilyEvidence[] = [...byFamily.entries()].map(([family, summary]) => {
    const evidenceKinds = [...summary.byLocalProofEvidenceKind.entries()]
      .map(([evidenceKind, bucket]) => ({
        evidenceKind,
        count: bucket.count,
        caseNames: [...new Set(bucket.caseNames)].sort(),
        examples: bucket.examples.slice(0, 3),
      }))
      .sort((left, right) => right.count - left.count || left.evidenceKind.localeCompare(right.evidenceKind))
    const livenessWindowKinds = [...summary.byLivenessWindowKind.entries()]
      .map(([windowKind, bucket]) => ({
        windowKind,
        count: bucket.count,
        caseNames: [...new Set(bucket.caseNames)].sort(),
        examples: bucket.examples.slice(0, 3),
      }))
      .sort((left, right) => right.count - left.count || left.windowKind.localeCompare(right.windowKind))

    for (const [kind, bucket] of summary.byAdjacentWindowBreakdown.entries()) {
      let aggregate = proofMissAdjacentWindowBreakdownMap.get(kind)
      if (!aggregate) {
        aggregate = { count: 0, caseNames: new Set(), examples: [] }
        proofMissAdjacentWindowBreakdownMap.set(kind, aggregate)
      }
      aggregate.count += bucket.count
      for (const caseName of bucket.caseNames) {
        aggregate.caseNames.add(caseName)
      }
      for (const example of bucket.examples) {
        if (aggregate.examples.length >= 3) break
        aggregate.examples.push(example)
      }
    }
    for (const [readiness, bucket] of summary.byLocalTempProofGapReadiness.entries()) {
      let aggregate = proofMissLocalTempProofGapReadinessMap.get(readiness)
      if (!aggregate) {
        aggregate = { count: 0, caseNames: new Set(), examples: [] }
        proofMissLocalTempProofGapReadinessMap.set(readiness, aggregate)
      }
      aggregate.count += bucket.count
      for (const caseName of bucket.caseNames) {
        aggregate.caseNames.add(caseName)
      }
      for (const example of bucket.examples) {
        if (aggregate.examples.length >= 3) break
        aggregate.examples.push(example)
      }
    }
    for (const [windowKind, bucket] of summary.byLocalTempProofGapWindowKind.entries()) {
      let aggregate = proofMissLocalTempProofGapWindowKindMap.get(windowKind)
      if (!aggregate) {
        aggregate = { count: 0, caseNames: new Set(), examples: [] }
        proofMissLocalTempProofGapWindowKindMap.set(windowKind, aggregate)
      }
      aggregate.count += bucket.count
      for (const caseName of bucket.caseNames) {
        aggregate.caseNames.add(caseName)
      }
      for (const example of bucket.examples) {
        if (aggregate.examples.length >= 3) break
        aggregate.examples.push(example)
      }
    }

    const totalLocalTempOnly = evidenceKinds
      .reduce((sum, item) => sum + item.count, 0)
    const totalCandidateLike = livenessWindowKinds.reduce((sum, item) => sum + item.count, 0)
    const locallySafeCandidateCount = livenessWindowKinds
      .filter(item => item.windowKind === 'single-adjacent-arith-no-reuse' || item.windowKind === 'copy-chain-no-reuse')
      .reduce((sum, item) => sum + item.count, 0)
    const blockedCandidateCount = livenessWindowKinds
      .filter(item => item.windowKind === 'blocked-dst-reused-after-window' || item.windowKind === 'blocked-src-overwritten-before-use')
      .reduce((sum, item) => sum + item.count, 0)
    const unknownCandidateCount = livenessWindowKinds
      .filter(item => item.windowKind === 'unknown-window-too-small' || item.windowKind === 'unknown-unparsed-command')
      .reduce((sum, item) => sum + item.count, 0)
    const livenessWindowReadiness = livenessWindowKindReadiness(
      locallySafeCandidateCount,
      blockedCandidateCount,
      unknownCandidateCount,
    )
    const livenessWindowSummary: RewriteProofMissLivenessWindowFamilyEvidence = {
      family,
      totalCandidateLike,
      locallySafeCandidateCount,
      blockedCandidateCount,
      unknownCandidateCount,
      windowKinds: livenessWindowKinds,
      proofReadiness: livenessWindowReadiness,
      recommendation: summarizeLivenessWindowRecommendation([{
        family,
        totalCandidateLike,
        locallySafeCandidateCount,
        blockedCandidateCount,
        unknownCandidateCount,
        windowKinds: livenessWindowKinds,
        proofReadiness: livenessWindowReadiness,
        recommendation: '',
      }]),
    }
    const lirAdjacentWindowSummary = summarizeLirAdjacentWindowBreakdown(new Map(
      [...summary.byAdjacentWindowBreakdown.entries()].map(([kind, value]) => ([
        kind,
        {
          count: value.count,
          caseNames: new Set(value.caseNames),
          examples: value.examples,
        },
      ])),
    ), new Map(
      [...summary.byLocalTempProofGapReadiness.entries()].map(([readiness, readinessSummary]) => ([
        readiness,
        {
          count: readinessSummary.count,
          caseNames: readinessSummary.caseNames,
          examples: readinessSummary.examples,
        },
      ])),
    ), new Map(
      [...summary.byLocalTempProofGapWindowKind.entries()].map(([windowKind, windowKindSummary]) => ([
        windowKind,
        {
          count: windowKindSummary.count,
          caseNames: windowKindSummary.caseNames,
          examples: windowKindSummary.examples,
        },
      ])),
    ))
    const candidateCount = evidenceKinds
      .filter(item => item.evidenceKind === 'adjacent-arith-source-reused' || item.evidenceKind === 'copy-chain-local-temp')
      .reduce((sum, item) => sum + item.count, 0)
    const needsLivenessWindowCount = evidenceKinds
      .filter(item => item.evidenceKind === 'needs-liveness-window')
      .reduce((sum, item) => sum + item.count, 0)
    const insufficientContextCount = evidenceKinds
      .filter(item => item.evidenceKind === 'insufficient-context')
      .reduce((sum, item) => sum + item.count, 0)

    return {
      family,
      totalLocalTempOnly,
      evidenceKinds,
      livenessWindowSummary,
      proofReadiness: summarizeLocalProofReadiness(candidateCount, insufficientContextCount),
      lirAdjacentWindowSummary,
      recommendation: summarizeLocalProofEvidenceRecommendation([
        {
          family,
          totalLocalTempOnly,
          evidenceKinds,
          proofReadiness: summarizeLocalProofReadiness(candidateCount, insufficientContextCount),
          recommendation: '',
          candidateCount,
          needsLivenessWindowCount,
          insufficientContextCount,
        },
      ]),
      candidateCount,
      needsLivenessWindowCount,
      insufficientContextCount,
    }
  }).filter(family =>
    family.totalLocalTempOnly > 0
    || family.needsLivenessWindowCount > 0
    || family.candidateCount > 0
    || family.insufficientContextCount > 0,
  ).sort((left, right) => right.totalLocalTempOnly - left.totalLocalTempOnly || left.family.localeCompare(right.family))

  const topActionableFamilies = families
    .filter(item => item.suggestedNextAction === 'focused-probe' || item.suggestedNextAction === 'rewrite-test-candidate')
    .slice(0, 3)
    .map(item => item.family)

  const total = families.reduce((sum, family) => sum + family.total, 0)
  const dominantBlockers = familySlotProvenance
    .flatMap(family => family.sourceKinds)
    .reduce((acc, item) => {
      const aggregate = acc.get(item.sourceKind) ?? 0
      acc.set(item.sourceKind, aggregate + item.count)
      return acc
    }, new Map<RewriteProofMissSourceKind, number>())

  const dominantBlockersArray = [...dominantBlockers.entries()]
    .map(([blocker, count]) => ({ blocker, count }))
    .sort((left, right) => right.count - left.count || left.blocker.localeCompare(right.blocker))

  const slotProvenanceRecommendation = dominantBlockersArray.length > 0 && dominantBlockersArray[0]?.blocker
    ? `Prioritize families where ${dominantBlockersArray[0].blocker} is not dominant before rewrite-test expansion.`
    : 'No dominant slot-source blockers were observed in command-level proof-miss evidence.'

  const recommendation = topActionableFamilies.length > 0
    ? `Prioritize focused proof-miss probes for ${topActionableFamilies.join(', ')} before rewriting tests.`
    : 'No targeted proof-miss families are currently actionable from command-level evidence alone.'

  const localProofEvidenceSummary: RewriteProofMissLocalProofEvidenceSummary = {
    totalLocalTempOnly: localProofEvidenceByFamily.reduce((sum, family) => sum + family.totalLocalTempOnly, 0),
    byFamily: localProofEvidenceByFamily,
    candidateCount: localProofEvidenceByFamily.reduce((sum, family) => sum + family.candidateCount, 0),
    needsLivenessWindowCount: localProofEvidenceByFamily.reduce((sum, family) => sum + family.needsLivenessWindowCount, 0),
    insufficientContextCount: localProofEvidenceByFamily.reduce((sum, family) => sum + family.insufficientContextCount, 0),
    recommendation: summarizeLocalProofEvidenceRecommendation(localProofEvidenceByFamily),
    lirAdjacentWindowSummary: summarizeLirAdjacentWindowBreakdown(new Map(
      [...proofMissAdjacentWindowBreakdownMap.entries()].map(([kind, summary]) => [
        kind,
        {
          count: summary.count,
          caseNames: new Set(summary.caseNames),
          examples: summary.examples,
        },
      ]),
    ), proofMissLocalTempProofGapReadinessMap, proofMissLocalTempProofGapWindowKindMap),
    livenessWindowSummary: {
      byFamily: localProofEvidenceByFamily.map((family) => {
        const familyWindowSummary = getLivenessWindowSummary(family.family, family.livenessWindowSummary)
        return {
          family: family.family,
          totalCandidateLike: familyWindowSummary.totalCandidateLike,
          locallySafeCandidateCount: familyWindowSummary.locallySafeCandidateCount,
          blockedCandidateCount: familyWindowSummary.blockedCandidateCount,
          unknownCandidateCount: familyWindowSummary.unknownCandidateCount,
          windowKinds: familyWindowSummary.windowKinds,
          proofReadiness: familyWindowSummary.proofReadiness,
          recommendation: familyWindowSummary.recommendation,
        }
      }).sort((left, right) => (
        right.totalCandidateLike - left.totalCandidateLike || left.family.localeCompare(right.family)
      )),
      totalCandidateLike: localProofEvidenceByFamily
        .reduce((sum, family) => sum + (family.livenessWindowSummary?.totalCandidateLike ?? 0), 0),
      locallySafeCandidateCount: localProofEvidenceByFamily
        .reduce((sum, family) => sum + (family.livenessWindowSummary?.locallySafeCandidateCount ?? 0), 0),
      blockedCandidateCount: localProofEvidenceByFamily
        .reduce((sum, family) => sum + (family.livenessWindowSummary?.blockedCandidateCount ?? 0), 0),
      unknownCandidateCount: localProofEvidenceByFamily
        .reduce((sum, family) => sum + (family.livenessWindowSummary?.unknownCandidateCount ?? 0), 0),
      proofReadiness: livenessWindowKindReadiness(
        localProofEvidenceByFamily.reduce((sum, family) => sum + (family.livenessWindowSummary?.locallySafeCandidateCount ?? 0), 0),
        localProofEvidenceByFamily.reduce((sum, family) => sum + (family.livenessWindowSummary?.blockedCandidateCount ?? 0), 0),
        localProofEvidenceByFamily.reduce((sum, family) => sum + (family.livenessWindowSummary?.unknownCandidateCount ?? 0), 0),
      ),
      recommendation: summarizeLivenessWindowRecommendation(localProofEvidenceByFamily.map(family => {
        const familyWindowSummary = getLivenessWindowSummary(family.family, family.livenessWindowSummary)
        return {
          family: family.family,
          totalCandidateLike: familyWindowSummary.totalCandidateLike,
          locallySafeCandidateCount: familyWindowSummary.locallySafeCandidateCount,
          blockedCandidateCount: familyWindowSummary.blockedCandidateCount,
          unknownCandidateCount: familyWindowSummary.unknownCandidateCount,
          windowKinds: familyWindowSummary.windowKinds,
          proofReadiness: familyWindowSummary.proofReadiness,
          recommendation: familyWindowSummary.recommendation,
        }
      })),
    },
  }

  return {
    total,
    byFamily: families,
    topActionableFamilies,
    recommendation,
    slotProvenanceSummary: {
      total,
      byFamily: familySlotProvenance,
      dominantBlockers: dominantBlockersArray,
      recommendation: slotProvenanceRecommendation,
      localProofEvidenceSummary,
    },
  }
}

function buildShapeFamilySummaryFromBuckets(
  totalPatternNotExactCount: number,
  familyBuckets: Map<string, { count: number; examples: string[] }>,
): RewriteShapeFamilySummary {
  const families: RewriteShapeFamilySummary['families'] = [...familyBuckets.entries()].map(([family, summary]) => {
    const likelyNextAction = inferLikelyNextActionForShapeFamily(family)
    return {
      family,
      count: summary.count,
      caseNames: [],
      examples: summary.examples.slice(0, 3),
      likelyNextAction,
      requiresLirLevelAnalysis: likelyNextAction !== 'local-canonicalization',
    }
  }).sort((a, b) => (
    b.count - a.count || a.family.localeCompare(b.family)
  ))

  const topRecoverableFamilies = families
    .filter(item => !item.requiresLirLevelAnalysis && item.likelyNextAction === 'local-canonicalization')
    .slice(0, 3)
    .map(item => item.family)

  const recommendation = topRecoverableFamilies.length > 0
    ? `Prioritize local canonicalization for ${topRecoverableFamilies.join(', ')} first, then rerun LIR provenance.`
    : 'Prioritize slot-scope/protected-slot analysis before attempting these blocked pattern families.'

  return {
    totalPatternNotExactCount,
    families,
    topRecoverableFamilies,
    recommendation,
  }
}

function classifyCopyRewriteOpportunityWithProvenance(
  lines: Array<{ path: string; line: number; content: string }>,
  currentLine: string,
  previousLine: string | undefined,
  nextLine: string | undefined,
  nextNextLine: string | undefined,
  index: number,
): { status: CopyRewriteStatus; pattern: string; reason: RewriteProvenanceReason } | null {
  const entry = classifyCopyRewriteOpportunity(currentLine, previousLine, nextLine, nextNextLine)
  if (!entry) return null
  const reason = classifyCopyRewriteProvenanceReason(lines, index, currentLine, nextLine, nextNextLine, entry.status)
  return {
    status: entry.status,
    pattern: entry.pattern,
    reason,
  }
}

function classifyTrackZDiagnosticLabel(
  status: CopyRewriteStatus,
  pattern: string,
  reason: RewriteProvenanceReason,
): RewriteTrackZDiagnosticLabel | null {
  if (status !== 'safeCandidate' || pattern !== TRACK_Z_TARGET_PATTERN) return null
  if (reason === 'safe-adjacent-score-copy-arith') return 'rewriteable-now'
  if (reason === 'blocked-by-alias-safety' || reason === 'blocked-by-temp-not-dead-after-consuming-op') return 'needs-window-proof'
  if (reason === 'blocked-by-cross-function-module-external-mention') return 'blocked-cross-function-or-module-external'
  if (reason === 'blocked-by-protected-slot') return 'blocked-protected-slot'
  if (reason === 'insufficient-command-level-information') return 'command-text-false-positive'
  if (reason === 'blocked-by-pattern-not-exact-adjacent-score-copy-arith' || reason === 'blocked-by-barrier-or-non-adjacent-shape') {
    return 'unknown-needs-lir-proof'
  }
  return 'unknown-needs-lir-proof'
}

function toTrackZCandidateSummary(
  byLabel: Map<RewriteTrackZDiagnosticLabel, { count: number; examples: string[] }>,
  totalCount: number,
): RewriteTrackZDiagnosticCandidateSummary {
  return {
    totalCount,
    byLabel: [...byLabel.entries()].map(([label, value]) => ({
      label,
      count: value.count,
      caseNames: [],
      examples: value.examples,
    })),
  }
}

function makeZeroRewriteProvenanceSummary(): RewriteProvenanceSummary {
  return {
    total: 0,
    byReason: [],
    safeAdjacentScoreCopyArithCount: 0,
    blockedCount: 0,
    insufficientInfoCount: 0,
    unknownCount: 0,
    requiresLirLevelAnalysis: false,
  }
}

export function summarizeRewriteOpportunitiesWithProvenance(
  lines: Array<{ path: string; line: number; content: string }>,
): {
  opportunities: CopyRewriteOpportunitySummary
  provenanceSummary: RewriteProvenanceSummary
  trackZResidualSummary: RewriteTrackZDiagnosticCandidateSummary
} {
  const opportunities = summarizeRewriteOpportunities(lines)
  const provenanceSummary = makeZeroRewriteProvenanceSummary()
  const byReason = new Map<string, RewriteProvenanceSummary['byReason'][number]>()
  const byShapeFamily = new Map<string, { count: number; examples: string[] }>()
  const byProofMissFamily = new Map<string, {
    total: number
    examples: string[]
    byReason: Map<RewriteProofMissReason, { count: number; examples: string[] }>
    bySlotRole: Map<RewriteProofMissSlotRole, { count: number; examples: string[] }>
    bySourceKind: Map<RewriteProofMissSourceKind, { count: number; examples: string[] }>
    byLocalProofEvidenceKind: Map<RewriteProofMissLocalProofEvidenceKind, { count: number; caseNames: string[]; examples: string[] }>
    byLivenessWindowKind: Map<RewriteProofMissLivenessWindowKind, { count: number; caseNames: string[]; examples: string[] }>
    byAdjacentWindowBreakdown: Map<RewriteProofMissLirAdjacentWindowBreakdownKind, {
      count: number
      caseNames: string[]
      examples: string[]
    }>
    byLocalTempProofGapReadiness: Map<
      RewriteProofMissLirLocalTempProofGapReadiness,
      { count: number; caseNames: Set<string>; examples: string[] }
    >
    byLocalTempProofGapWindowKind: Map<
      RewriteProofMissLirLocalTempProofWindowKind,
      { count: number; caseNames: Set<string>; examples: string[] }
    >
  }>()
  const trackZByLabel = new Map<RewriteTrackZDiagnosticLabel, { count: number; examples: string[] }>()
  let trackZResidualTotalCount = 0
  let patternNotExactTotal = 0

  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i]
    if (!isScoreCopy(current.content)) continue

    const previousLine = i > 0 && lines[i - 1].path === current.path
      ? lines[i - 1].content
      : undefined
    const nextLine = i + 1 < lines.length && lines[i + 1].path === current.path
      ? lines[i + 1].content
      : undefined
    const nextNextLine = i + 2 < lines.length && lines[i + 2].path === current.path
      ? lines[i + 2].content
      : undefined

    const entry = classifyCopyRewriteOpportunityWithProvenance(
      lines,
      current.content,
      previousLine,
      nextLine,
      nextNextLine,
      i,
    )
    if (!entry) continue

    const trackZLabel = classifyTrackZDiagnosticLabel(entry.status, entry.pattern, entry.reason)
    if (trackZLabel) {
      let trackZBucket = trackZByLabel.get(trackZLabel)
      if (!trackZBucket) {
        trackZBucket = {
          count: 0,
          examples: [],
        }
        trackZByLabel.set(trackZLabel, trackZBucket)
      }
      trackZBucket.count += 1
      trackZResidualTotalCount += 1
      if (trackZBucket.examples.length < MAX_RESIDUAL_EXAMPLES_PER_BUCKET) {
        trackZBucket.examples.push(`${current.path}:${current.line}: ${current.content}`)
      }
    }

    provenanceSummary.total += 1
    if (entry.reason === 'safe-adjacent-score-copy-arith') {
      provenanceSummary.safeAdjacentScoreCopyArithCount += 1
    } else if (entry.reason === 'insufficient-command-level-information') {
      provenanceSummary.unknownCount += 1
      provenanceSummary.insufficientInfoCount += 1
    } else if (entry.reason !== 'already-optimized-by-existing-pass') {
      provenanceSummary.blockedCount += 1
    }

    if (
      entry.reason === 'blocked-by-cross-function-module-external-mention'
      || entry.reason === 'insufficient-command-level-information'
    ) {
      provenanceSummary.requiresLirLevelAnalysis = true
    }

    const key = entry.reason
    let bucket = byReason.get(key)
    if (!bucket) {
      bucket = {
        reason: key as RewriteProvenanceReason,
        count: 0,
        caseNames: [],
        examples: [],
      }
      byReason.set(key, bucket)
    }
    bucket.count += 1
    if (bucket.examples.length < 3) bucket.examples.push(`${current.path}:${current.line}: ${current.content}`)

    if (entry.reason === 'blocked-by-pattern-not-exact-adjacent-score-copy-arith') {
      patternNotExactTotal += 1
      const family = classifyShapeFamilyForBlockedPatternNotExact(entry.pattern, current.content)
      let familyEntry = byShapeFamily.get(family)
      if (!familyEntry) {
        familyEntry = { count: 0, examples: [] }
        byShapeFamily.set(family, familyEntry)
      }
      familyEntry.count += 1
      if (familyEntry.examples.length < 3) {
        familyEntry.examples.push(`${current.path}:${current.line}: ${current.content}`)
      }
    }

    const proofMissFamily = classifyShapeFamilyForBlockedPatternNotExact(entry.pattern, current.content)
    if (
      entry.reason !== 'safe-adjacent-score-copy-arith'
      && entry.reason !== 'already-optimized-by-existing-pass'
      && isRecoverableProofMissFamily(proofMissFamily)
    ) {
      const proofMissReason = classifyProofMissReason(entry.reason, entry.pattern, current.content)
      let familySummary = byProofMissFamily.get(proofMissFamily)
      if (!familySummary) {
          familySummary = {
            total: 0,
            examples: [],
            byReason: new Map(),
            bySlotRole: new Map(),
            bySourceKind: new Map(),
            byLocalProofEvidenceKind: new Map(),
            byLivenessWindowKind: new Map(),
            byAdjacentWindowBreakdown: new Map(),
            byLocalTempProofGapReadiness: new Map(),
            byLocalTempProofGapWindowKind: new Map(),
          }
        byProofMissFamily.set(proofMissFamily, familySummary)
      }

      familySummary.total += 1
      if (familySummary.examples.length < 3) {
        familySummary.examples.push(`${current.path}:${current.line}: ${current.content}`)
      }

      let reasonSummary = familySummary.byReason.get(proofMissReason)
      if (!reasonSummary) {
        reasonSummary = {
          count: 0,
          examples: [],
        }
        familySummary.byReason.set(proofMissReason, reasonSummary)
      }
      reasonSummary.count += 1
      if (reasonSummary.examples.length < 3) {
        reasonSummary.examples.push(`${current.path}:${current.line}: ${current.content}`)
      }

        const parsedCopy = parseScoreCopy(current.content)
        if (parsedCopy) {
          const sourceKind = classifyProofMissSourceKind(proofMissReason, parsedCopy)
          const adjacentWindowBreakdown = classifyProofMissAdjacentWindowBreakdownKind(proofMissReason, sourceKind)
          let localTempProofGapReadiness = proofMissReason === 'no-exact-lir-local-proof'
            ? classifyLocalTempProofGapReadiness(
            proofMissFamily,
            proofMissReason,
            sourceKind,
            parsedCopy,
            undefined,
            previousLine,
            nextLine,
          )
            : undefined
          const localTempProofGapWindowKind = proofMissReason === 'no-exact-lir-local-proof' && sourceKind === 'local-temp-only'
            ? classifyLocalTempProofGapShortWindowKind(
              proofMissFamily,
              sourceKind,
              parsedCopy,
              previousLine,
              nextLine,
              nextNextLine,
            )
            : undefined

          if (adjacentWindowBreakdown) {
          let adjacentWindowSummary = familySummary.byAdjacentWindowBreakdown.get(adjacentWindowBreakdown)
          if (!adjacentWindowSummary) {
            adjacentWindowSummary = { count: 0, caseNames: [], examples: [] }
            familySummary.byAdjacentWindowBreakdown.set(adjacentWindowBreakdown, adjacentWindowSummary)
          }
          adjacentWindowSummary.count += 1
          if (!adjacentWindowSummary.caseNames.includes(current.path)) {
            adjacentWindowSummary.caseNames.push(current.path)
          }
          if (adjacentWindowSummary.examples.length < 3) {
            adjacentWindowSummary.examples.push(`${current.path}:${current.line}: ${current.content}`)
          }
        }

        let sourceKindSummary = familySummary.bySourceKind.get(sourceKind)
        if (!sourceKindSummary) {
          sourceKindSummary = { count: 0, examples: [] }
          familySummary.bySourceKind.set(sourceKind, sourceKindSummary)
        }
        sourceKindSummary.count += 1
        if (sourceKindSummary.examples.length < 3) {
          sourceKindSummary.examples.push(`${current.path}:${current.line}: ${current.content}`)
        }

        if (sourceKind === 'local-temp-only' || sourceKind === 'insufficient-context') {
          const localProofEvidenceKind = classifyLocalProofEvidenceKind(
            proofMissFamily,
            sourceKind,
            parsedCopy,
            previousLine,
            nextLine,
          )
          let localProofEvidenceSummary = familySummary.byLocalProofEvidenceKind.get(localProofEvidenceKind)
          if (!localProofEvidenceSummary) {
            localProofEvidenceSummary = { count: 0, caseNames: [], examples: [] }
            familySummary.byLocalProofEvidenceKind.set(localProofEvidenceKind, localProofEvidenceSummary)
          }
          localProofEvidenceSummary.count += 1
          if (!localProofEvidenceSummary.caseNames.includes(current.path)) {
            localProofEvidenceSummary.caseNames.push(current.path)
          }
          if (localProofEvidenceSummary.examples.length < 3) {
            localProofEvidenceSummary.examples.push(`${current.path}:${current.line}: ${current.content}`)
          }

          if (isCandidateLikeLivenessFamilyEvidence(localProofEvidenceKind)) {
            const livenessWindowKind = classifyLivenessWindowKind(
              proofMissFamily,
              lines,
              i,
              parsedCopy,
            )
            localTempProofGapReadiness = classifyLocalTempProofGapReadiness(
              proofMissFamily,
              proofMissReason,
              sourceKind,
              parsedCopy,
              livenessWindowKind,
              previousLine,
              nextLine,
            )
            let livenessWindowSummary = familySummary.byLivenessWindowKind.get(livenessWindowKind)
            if (!livenessWindowSummary) {
              livenessWindowSummary = { count: 0, caseNames: [], examples: [] }
              familySummary.byLivenessWindowKind.set(livenessWindowKind, livenessWindowSummary)
            }
            livenessWindowSummary.count += 1
            if (!livenessWindowSummary.caseNames.includes(current.path)) {
              livenessWindowSummary.caseNames.push(current.path)
            }
            if (livenessWindowSummary.examples.length < 3) {
              livenessWindowSummary.examples.push(`${current.path}:${current.line}: ${current.content}`)
            }

            const windowBreakdown = classifyProofMissAdjacentWindowBreakdownKind(
              proofMissReason,
              sourceKind,
              livenessWindowKind,
            )
            if (windowBreakdown) {
              let windowBreakdownSummary = familySummary.byAdjacentWindowBreakdown.get(windowBreakdown)
              if (!windowBreakdownSummary) {
                windowBreakdownSummary = { count: 0, caseNames: [], examples: [] }
                familySummary.byAdjacentWindowBreakdown.set(windowBreakdown, windowBreakdownSummary)
              }
              windowBreakdownSummary.count += 1
              if (!windowBreakdownSummary.caseNames.includes(current.path)) {
                windowBreakdownSummary.caseNames.push(current.path)
              }
              if (windowBreakdownSummary.examples.length < 3) {
                windowBreakdownSummary.examples.push(`${current.path}:${current.line}: ${current.content}`)
              }
            }
          }
        }

          if (proofMissReason === 'no-exact-lir-local-proof' && localTempProofGapReadiness) {
            let localTempProofGapReadinessSummary = familySummary.byLocalTempProofGapReadiness.get(localTempProofGapReadiness)
            if (!localTempProofGapReadinessSummary) {
              localTempProofGapReadinessSummary = { count: 0, caseNames: new Set(), examples: [] }
              familySummary.byLocalTempProofGapReadiness.set(localTempProofGapReadiness, localTempProofGapReadinessSummary)
            }
            localTempProofGapReadinessSummary.count += 1
            localTempProofGapReadinessSummary.caseNames.add(current.path)
            if (localTempProofGapReadinessSummary.examples.length < 3) {
              localTempProofGapReadinessSummary.examples.push(`${current.path}:${current.line}: ${current.content}`)
            }
          }
          if (proofMissReason === 'no-exact-lir-local-proof' && localTempProofGapWindowKind) {
            let localTempProofGapWindowSummary = familySummary.byLocalTempProofGapWindowKind.get(localTempProofGapWindowKind)
            if (!localTempProofGapWindowSummary) {
              localTempProofGapWindowSummary = { count: 0, caseNames: new Set(), examples: [] }
              familySummary.byLocalTempProofGapWindowKind.set(localTempProofGapWindowKind, localTempProofGapWindowSummary)
            }
            localTempProofGapWindowSummary.count += 1
            localTempProofGapWindowSummary.caseNames.add(current.path)
            if (localTempProofGapWindowSummary.examples.length < 3) {
              localTempProofGapWindowSummary.examples.push(`${current.path}:${current.line}: ${current.content}`)
            }
          }

        for (const slotRole of classifySlotRolesForProofMiss(parsedCopy)) {
          let slotRoleSummary = familySummary.bySlotRole.get(slotRole)
          if (!slotRoleSummary) {
            slotRoleSummary = { count: 0, examples: [] }
            familySummary.bySlotRole.set(slotRole, slotRoleSummary)
          }
          slotRoleSummary.count += 1
          if (slotRoleSummary.examples.length < 3) {
            slotRoleSummary.examples.push(`${current.path}:${current.line}: ${current.content}`)
          }
        }
      }
    }
  }

  provenanceSummary.byReason = [...byReason.values()].map(entry => ({
    ...entry,
    caseNames: [],
    examples: entry.examples.slice(0, 3),
  })).sort((left, right) => (
    right.count - left.count || left.reason.localeCompare(right.reason)
  ))

  opportunities.provenanceSummary = {
    ...provenanceSummary,
    byReason: provenanceSummary.byReason,
    shapeFamilySummary: {
      ...buildShapeFamilySummaryFromBuckets(patternNotExactTotal, byShapeFamily),
      proofMissSummary: summarizeProofMissByFamilyFromBuckets(byProofMissFamily),
    },
  }

  return {
    opportunities,
    provenanceSummary: opportunities.provenanceSummary,
    trackZResidualSummary: toTrackZCandidateSummary(trackZByLabel, trackZResidualTotalCount),
  }
}

function mergeRewriteOpportunitiesProvenance(
  summaries: Array<{ caseName: string; summary?: RewriteProvenanceSummary }>,
): RewriteProvenanceSummary {
  const totals = makeZeroRewriteProvenanceSummary()
  const byReason = new Map<string, {
    count: number
    caseNames: Set<string>
    examples: string[]
  }>()
  const byShapeFamily = new Map<string, {
    count: number
    caseNames: Set<string>
    examples: string[]
  }>()
  const byProofMissFamily = new Map<string, {
    total: number
    caseNames: Set<string>
    byReason: Map<RewriteProofMissReason, {
      count: number
      caseNames: Set<string>
      examples: string[]
    }>
    bySlotRole: Map<RewriteProofMissSlotRole, {
      count: number
      caseNames: Set<string>
      examples: string[]
    }>
    bySourceKind: Map<RewriteProofMissSourceKind, {
      count: number
      caseNames: Set<string>
      examples: string[]
    }>
    byLocalProofEvidenceKind: Map<RewriteProofMissLocalProofEvidenceKind, {
      count: number
      caseNames: Set<string>
      examples: string[]
    }>
    byLivenessWindowKind: Map<RewriteProofMissLivenessWindowKind, {
      count: number
      caseNames: Set<string>
      examples: string[]
    }>
    byAdjacentWindowBreakdown: Map<RewriteProofMissLirAdjacentWindowBreakdownKind, {
      count: number
      caseNames: Set<string>
      examples: string[]
    }>
    byLocalTempProofGapReadiness: Map<
      RewriteProofMissLirLocalTempProofGapReadiness,
      { count: number; caseNames: Set<string>; examples: string[] }
    >
    byLocalTempProofGapWindowKind: Map<
      RewriteProofMissLirLocalTempProofWindowKind,
      { count: number; caseNames: Set<string>; examples: string[] }
    >
  }>()
  let patternNotExactTotal = 0
  const proofMissAdjacentWindowBreakdown = new Map<
    RewriteProofMissLirAdjacentWindowBreakdownKind,
    { count: number; caseNames: Set<string>; examples: string[] }
  >()
  const proofMissLocalTempProofGapReadiness = new Map<
    RewriteProofMissLirLocalTempProofGapReadiness,
    { count: number; caseNames: Set<string>; examples: string[] }
  >()
  const proofMissLocalTempProofGapWindowKind = new Map<
    RewriteProofMissLirLocalTempProofWindowKind,
    { count: number; caseNames: Set<string>; examples: string[] }
  >()
  const slotProvenanceByFamily = new Map<string, {
    total: number
    caseNames: Set<string>
    bySlotRole: Map<RewriteProofMissSlotRole, {
      count: number
      caseNames: Set<string>
      examples: string[]
    }>
    bySourceKind: Map<RewriteProofMissSourceKind, {
      count: number
      caseNames: Set<string>
      examples: string[]
    }>
    byLocalProofEvidenceKind: Map<RewriteProofMissLocalProofEvidenceKind, {
      count: number
      caseNames: Set<string>
      examples: string[]
    }>
    byLivenessWindowKind: Map<RewriteProofMissLivenessWindowKind, {
      count: number
      caseNames: Set<string>
      examples: string[]
    }>
    recommendation: string
  }>()

  for (const { caseName, summary } of summaries) {
    if (!summary) continue
    totals.total += summary.total
    totals.safeAdjacentScoreCopyArithCount += summary.safeAdjacentScoreCopyArithCount
    totals.blockedCount += summary.blockedCount
    totals.insufficientInfoCount += summary.insufficientInfoCount
    totals.unknownCount += summary.unknownCount
    if (summary.requiresLirLevelAnalysis) totals.requiresLirLevelAnalysis = true
    if (summary.shapeFamilySummary) {
      patternNotExactTotal += summary.shapeFamilySummary.totalPatternNotExactCount
      for (const family of summary.shapeFamilySummary.families) {
        let aggregate = byShapeFamily.get(family.family)
        if (!aggregate) {
          aggregate = {
            count: 0,
            caseNames: new Set(),
            examples: [],
          }
          byShapeFamily.set(family.family, aggregate)
        }
        aggregate.count += family.count
        aggregate.caseNames.add(caseName)
        for (const example of family.examples) {
          if (aggregate.examples.length >= 3) break
          aggregate.examples.push(example)
        }
      }
      if (summary.shapeFamilySummary.proofMissSummary) {
        for (const proofMissFamily of summary.shapeFamilySummary.proofMissSummary.byFamily) {
          let aggregate = byProofMissFamily.get(proofMissFamily.family)
          if (!aggregate) {
            aggregate = {
              total: 0,
              caseNames: new Set(),
              byReason: new Map(),
              bySlotRole: new Map(),
              bySourceKind: new Map(),
              byLocalProofEvidenceKind: new Map(),
              byLivenessWindowKind: new Map(),
              byAdjacentWindowBreakdown: new Map(),
              byLocalTempProofGapReadiness: new Map(),
              byLocalTempProofGapWindowKind: new Map(),
            }
            byProofMissFamily.set(proofMissFamily.family, aggregate)
          }

          aggregate.total += proofMissFamily.total
          aggregate.caseNames.add(caseName)

          for (const reason of proofMissFamily.byReason) {
            let reasonSummary = aggregate.byReason.get(reason.reason)
            if (!reasonSummary) {
              reasonSummary = {
                count: 0,
                caseNames: new Set(),
                examples: [],
              }
              aggregate.byReason.set(reason.reason, reasonSummary)
            }
            reasonSummary.count += reason.count
            reasonSummary.caseNames.add(caseName)
            for (const example of (reason.examples ?? [])) {
              if (reasonSummary.examples.length >= 3) break
              reasonSummary.examples.push(example)
            }
          }

          const detailedFamily = summary.shapeFamilySummary.proofMissSummary.slotProvenanceSummary
            ?.byFamily.find(item => item.family === proofMissFamily.family)
          if (detailedFamily) {
            for (const slotRole of detailedFamily.slotRoles) {
            let slotRoleSummary = aggregate.bySlotRole.get(slotRole.role)
            if (!slotRoleSummary) {
              slotRoleSummary = {
                count: 0,
                caseNames: new Set(),
                examples: [],
              }
              aggregate.bySlotRole.set(slotRole.role, slotRoleSummary)
            }
            slotRoleSummary.count += slotRole.count
            slotRoleSummary.caseNames.add(caseName)
            for (const example of slotRole.examples) {
              if (slotRoleSummary.examples.length >= 3) break
              slotRoleSummary.examples.push(example)
            }
            }

            for (const sourceKind of detailedFamily.sourceKinds) {
            let sourceKindSummary = aggregate.bySourceKind.get(sourceKind.sourceKind)
            if (!sourceKindSummary) {
              sourceKindSummary = {
                count: 0,
                caseNames: new Set(),
                examples: [],
              }
              aggregate.bySourceKind.set(sourceKind.sourceKind, sourceKindSummary)
            }
            sourceKindSummary.count += sourceKind.count
            sourceKindSummary.caseNames.add(caseName)
            for (const example of sourceKind.examples) {
              if (sourceKindSummary.examples.length >= 3) break
              sourceKindSummary.examples.push(example)
            }
          }

            const detailedLocalProofEvidence = summary.shapeFamilySummary.proofMissSummary.slotProvenanceSummary
              ?.localProofEvidenceSummary?.byFamily.find(item => item.family === proofMissFamily.family)
            if (detailedLocalProofEvidence) {
              for (const evidenceKind of detailedLocalProofEvidence.evidenceKinds) {
                let evidenceSummary = aggregate.byLocalProofEvidenceKind.get(evidenceKind.evidenceKind)
                if (!evidenceSummary) {
                  evidenceSummary = {
                    count: 0,
                    caseNames: new Set(),
                    examples: [],
                  }
                  aggregate.byLocalProofEvidenceKind.set(evidenceKind.evidenceKind, evidenceSummary)
                }
                evidenceSummary.count += evidenceKind.count
                evidenceSummary.caseNames.add(caseName)
                for (const example of evidenceKind.examples) {
                  if (evidenceSummary.examples.length >= 3) break
                  evidenceSummary.examples.push(example)
                }
              }
              const detailedLivenessWindowFamily = detailedLocalProofEvidence.livenessWindowSummary
              if (detailedLivenessWindowFamily) {
                for (const windowKind of detailedLivenessWindowFamily.windowKinds) {
                  let windowSummary = aggregate.byLivenessWindowKind.get(windowKind.windowKind)
                  if (!windowSummary) {
                    windowSummary = {
                      count: 0,
                      caseNames: new Set(),
                      examples: [],
                    }
                    aggregate.byLivenessWindowKind.set(windowKind.windowKind, windowSummary)
                  }
                  windowSummary.count += windowKind.count
                  windowSummary.caseNames.add(caseName)
                  for (const example of windowKind.examples) {
                    if (windowSummary.examples.length >= 3) break
                    windowSummary.examples.push(example)
                  }
                }
              }

              const detailedLirAdjacentWindowSummary = detailedLocalProofEvidence.lirAdjacentWindowSummary
              if (detailedLirAdjacentWindowSummary) {
                for (const window of detailedLirAdjacentWindowSummary.proofMissAdjacentWindowBreakdown) {
                  let adjacentSummary = aggregate.byAdjacentWindowBreakdown.get(window.kind)
                  if (!adjacentSummary) {
                    adjacentSummary = { count: 0, caseNames: new Set(), examples: [] }
                    aggregate.byAdjacentWindowBreakdown.set(window.kind, adjacentSummary)
                  }
                  adjacentSummary.count += window.count
                  adjacentSummary.caseNames.add(caseName)
                  for (const example of window.examples) {
                    if (adjacentSummary.examples.length >= 3) break
                    adjacentSummary.examples.push(example)
                  }

                  let globalAdjacentSummary = proofMissAdjacentWindowBreakdown.get(window.kind)
                  if (!globalAdjacentSummary) {
                    globalAdjacentSummary = { count: 0, caseNames: new Set(), examples: [] }
                    proofMissAdjacentWindowBreakdown.set(window.kind, globalAdjacentSummary)
                  }
                  globalAdjacentSummary.count += window.count
                  globalAdjacentSummary.caseNames.add(caseName)
                  for (const example of window.examples) {
                    if (globalAdjacentSummary.examples.length >= 3) break
                    globalAdjacentSummary.examples.push(example)
                  }
                }
                for (const readiness of detailedLirAdjacentWindowSummary.localTempProofGapReadinessSummary.byReadiness) {
                  let localTempReadinessSummary = aggregate.byLocalTempProofGapReadiness.get(readiness.readiness)
                  if (!localTempReadinessSummary) {
                    localTempReadinessSummary = { count: 0, caseNames: new Set(), examples: [] }
                    aggregate.byLocalTempProofGapReadiness.set(readiness.readiness, localTempReadinessSummary)
                  }
                  localTempReadinessSummary.count += readiness.count
                  localTempReadinessSummary.caseNames.add(caseName)
                  for (const example of readiness.examples) {
                    if (localTempReadinessSummary.examples.length >= 3) break
                    localTempReadinessSummary.examples.push(example)
                  }

                  let globalReadinessSummary = proofMissLocalTempProofGapReadiness.get(readiness.readiness)
                  if (!globalReadinessSummary) {
                    globalReadinessSummary = { count: 0, caseNames: new Set(), examples: [] }
                    proofMissLocalTempProofGapReadiness.set(readiness.readiness, globalReadinessSummary)
                  }
                  globalReadinessSummary.count += readiness.count
                  globalReadinessSummary.caseNames.add(caseName)
                  for (const example of readiness.examples) {
                    if (globalReadinessSummary.examples.length >= 3) break
                    globalReadinessSummary.examples.push(example)
                  }
                }
                for (const proofWindowKind of detailedLirAdjacentWindowSummary.shortWindowProofSummary?.byProofWindowKind ?? []) {
                  let localTempProofGapWindowKindSummary = aggregate.byLocalTempProofGapWindowKind.get(proofWindowKind.proofWindowKind)
                  if (!localTempProofGapWindowKindSummary) {
                    localTempProofGapWindowKindSummary = { count: 0, caseNames: new Set(), examples: [] }
                    aggregate.byLocalTempProofGapWindowKind.set(proofWindowKind.proofWindowKind, localTempProofGapWindowKindSummary)
                  }
                  localTempProofGapWindowKindSummary.count += proofWindowKind.count
                  for (const caseName of proofWindowKind.caseNames) {
                    localTempProofGapWindowKindSummary.caseNames.add(caseName)
                  }
                  for (const example of proofWindowKind.examples) {
                    if (localTempProofGapWindowKindSummary.examples.length >= 3) break
                    localTempProofGapWindowKindSummary.examples.push(example)
                  }

                  let globalWindowKindSummary = proofMissLocalTempProofGapWindowKind.get(proofWindowKind.proofWindowKind)
                  if (!globalWindowKindSummary) {
                    globalWindowKindSummary = { count: 0, caseNames: new Set(), examples: [] }
                    proofMissLocalTempProofGapWindowKind.set(proofWindowKind.proofWindowKind, globalWindowKindSummary)
                  }
                  globalWindowKindSummary.count += proofWindowKind.count
                  for (const caseName of proofWindowKind.caseNames) {
                    globalWindowKindSummary.caseNames.add(caseName)
                  }
                  for (const example of proofWindowKind.examples) {
                    if (globalWindowKindSummary.examples.length >= 3) break
                    globalWindowKindSummary.examples.push(example)
                  }
                }
              }
            }

            let familySlotProvenance = slotProvenanceByFamily.get(proofMissFamily.family)
            if (!familySlotProvenance) {
              familySlotProvenance = {
                total: 0,
                caseNames: new Set(),
                bySlotRole: new Map(),
                bySourceKind: new Map(),
                byLocalProofEvidenceKind: new Map(),
                byLivenessWindowKind: new Map(),
                recommendation: detailedFamily.recommendation,
              }
              slotProvenanceByFamily.set(proofMissFamily.family, familySlotProvenance)
            }

            familySlotProvenance.total += proofMissFamily.total
            familySlotProvenance.caseNames.add(caseName)
            for (const slotRole of detailedFamily.slotRoles) {
              let slotRoleSummary = familySlotProvenance.bySlotRole.get(slotRole.role)
              if (!slotRoleSummary) {
                slotRoleSummary = {
                  count: 0,
                  caseNames: new Set(),
                  examples: [],
                }
                familySlotProvenance.bySlotRole.set(slotRole.role, slotRoleSummary)
              }
              slotRoleSummary.count += slotRole.count
              for (const example of slotRole.examples) {
                if (slotRoleSummary.examples.length >= 3) break
                slotRoleSummary.examples.push(example)
              }
            }

              for (const sourceKind of detailedFamily.sourceKinds) {
              let sourceKindSummary = familySlotProvenance.bySourceKind.get(sourceKind.sourceKind)
              if (!sourceKindSummary) {
                sourceKindSummary = {
                  count: 0,
                  caseNames: new Set(),
                  examples: [],
                }
                familySlotProvenance.bySourceKind.set(sourceKind.sourceKind, sourceKindSummary)
              }
              sourceKindSummary.count += sourceKind.count
              for (const example of sourceKind.examples) {
                if (sourceKindSummary.examples.length >= 3) break
                sourceKindSummary.examples.push(example)
              }
            }

            if (detailedLocalProofEvidence) {
              for (const evidenceKind of detailedLocalProofEvidence.evidenceKinds) {
                let evidenceSummary = familySlotProvenance.byLocalProofEvidenceKind.get(evidenceKind.evidenceKind)
                if (!evidenceSummary) {
                  evidenceSummary = {
                    count: 0,
                    caseNames: new Set(),
                    examples: [],
                  }
                  familySlotProvenance.byLocalProofEvidenceKind.set(evidenceKind.evidenceKind, evidenceSummary)
                }
                evidenceSummary.count += evidenceKind.count
                evidenceSummary.caseNames.add(caseName)
                for (const example of evidenceKind.examples) {
                  if (evidenceSummary.examples.length >= 3) break
                  evidenceSummary.examples.push(example)
                }
              }
              const detailedLivenessWindowFamily = detailedLocalProofEvidence.livenessWindowSummary
              if (detailedLivenessWindowFamily) {
                for (const windowKind of detailedLivenessWindowFamily.windowKinds) {
                  let windowSummary = familySlotProvenance.byLivenessWindowKind.get(windowKind.windowKind)
                  if (!windowSummary) {
                    windowSummary = {
                      count: 0,
                      caseNames: new Set(),
                      examples: [],
                    }
                    familySlotProvenance.byLivenessWindowKind.set(windowKind.windowKind, windowSummary)
                  }
                  windowSummary.count += windowKind.count
                  windowSummary.caseNames.add(caseName)
                  for (const example of windowKind.examples) {
                    if (windowSummary.examples.length >= 3) break
                    windowSummary.examples.push(example)
                  }
                }
              }
            }
          }
        }
      }
    } else {
      const blockedPatternBucket = summary.byReason.find(item => item.reason === 'blocked-by-pattern-not-exact-adjacent-score-copy-arith')
      if (blockedPatternBucket) {
        patternNotExactTotal += blockedPatternBucket.count
      }
    }

    for (const bucket of summary.byReason) {
      let aggregate = byReason.get(bucket.reason)
      if (!aggregate) {
        aggregate = {
          count: 0,
          caseNames: new Set(),
          examples: [],
        }
        byReason.set(bucket.reason, aggregate)
      }
      aggregate.count += bucket.count
      aggregate.caseNames.add(caseName)
      for (const example of bucket.examples) {
        if (aggregate.examples.length >= 3) break
        aggregate.examples.push(example)
      }
    }
  }

  totals.byReason = [...byReason.entries()]
    .map(([reason, summary]) => ({
      reason: reason as RewriteProvenanceReason,
      count: summary.count,
      caseNames: [...summary.caseNames].sort(),
      examples: summary.examples.slice(0, 3),
    }))
    .sort((left, right) => (
      right.count - left.count || left.reason.localeCompare(right.reason)
    ))

  const families: RewriteShapeFamilyEntry[] = [...byShapeFamily.entries()].map(([family, summary]) => {
    const likelyNextAction = inferLikelyNextActionForShapeFamily(family)
    return {
      family,
      count: summary.count,
      caseNames: [...summary.caseNames].sort(),
      examples: summary.examples.slice(0, 3),
      likelyNextAction,
      requiresLirLevelAnalysis: likelyNextAction !== 'local-canonicalization',
    }
  }).sort((a, b) => (
    b.count - a.count || a.family.localeCompare(b.family)
  ))

  const topRecoverableFamilies = families
    .filter(item => !item.requiresLirLevelAnalysis && item.likelyNextAction === 'local-canonicalization')
    .slice(0, 3)
    .map(item => item.family)

  const recommendation = topRecoverableFamilies.length > 0
    ? `Prioritize local canonicalization for ${topRecoverableFamilies.join(', ')} first, then rerun LIR provenance.`
    : 'Prioritize slot-scope/protected-slot analysis before attempting these blocked pattern families.'

  const proofMissByFamily = [...byProofMissFamily.entries()].map(([family, summary]) => {
    const byReason = [...summary.byReason.entries()].map(([reason, reasonSummary]) => ({
      reason,
      count: reasonSummary.count,
      caseNames: [...reasonSummary.caseNames].sort(),
      examples: reasonSummary.examples.slice(0, 3),
    }))
      .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))
    const sourceKinds = [...summary.bySourceKind.entries()].map(([sourceKind, sourceKindSummary]) => ({
      sourceKind,
      count: sourceKindSummary.count,
      caseNames: [...sourceKindSummary.caseNames].sort(),
      examples: sourceKindSummary.examples.slice(0, 3),
    }))
      .sort((left, right) => right.count - left.count || left.sourceKind.localeCompare(right.sourceKind))
    const suggestedNextAction = suggestProofMissNextActionFromSources(byReason, sourceKinds)

    return {
      family,
      total: summary.total,
      caseNames: [...summary.caseNames].sort(),
      byReason,
      suggestedNextAction,
    }
  }).sort((left, right) => right.total - left.total || left.family.localeCompare(right.family))

  const localProofEvidenceByFamily = new Map<string, RewriteProofMissLocalProofFamilyEvidence>()

  const proofMissSlotProvenanceByFamily: RewriteProofMissFamilySlotProvenance[] = [...byProofMissFamily.entries()].map(([family, summary]) => {
    const familySlotProvenance = slotProvenanceByFamily.get(family)
    const slotRoles = [...(familySlotProvenance?.bySlotRole ?? summary.bySlotRole).entries()].map(([role, bucket]) => ({
      role,
      count: bucket.count,
      caseNames: [...bucket.caseNames].sort(),
      examples: bucket.examples.slice(0, 3),
    })).sort((left, right) => right.count - left.count || left.role.localeCompare(right.role))
    const sourceKinds = [...(familySlotProvenance?.bySourceKind ?? summary.bySourceKind).entries()].map(([sourceKind, bucket]) => ({
      sourceKind,
      count: bucket.count,
      caseNames: [...bucket.caseNames].sort(),
      examples: bucket.examples.slice(0, 3),
    })).sort((left, right) => right.count - left.count || left.sourceKind.localeCompare(right.sourceKind))
    const localProofEvidenceKinds = [...(familySlotProvenance?.byLocalProofEvidenceKind ?? summary.byLocalProofEvidenceKind).entries()]
      .map(([evidenceKind, bucket]) => ({
        evidenceKind,
        count: bucket.count,
        caseNames: [...bucket.caseNames].sort(),
        examples: bucket.examples.slice(0, 3),
      }))
      .sort((left, right) => right.count - left.count || left.evidenceKind.localeCompare(right.evidenceKind))
    const livenessWindowKinds = [...(familySlotProvenance?.byLivenessWindowKind ?? summary.byLivenessWindowKind).entries()]
      .map(([windowKind, bucket]) => ({
        windowKind,
        count: bucket.count,
        caseNames: [...bucket.caseNames].sort(),
        examples: bucket.examples.slice(0, 3),
      }))
      .sort((left, right) => right.count - left.count || left.windowKind.localeCompare(right.windowKind))

    const candidateCount = localProofEvidenceKinds
      .filter(item => item.evidenceKind === 'adjacent-arith-source-reused' || item.evidenceKind === 'copy-chain-local-temp')
      .reduce((sum, item) => sum + item.count, 0)
    const needsLivenessWindowCount = localProofEvidenceKinds
      .filter(item => item.evidenceKind === 'needs-liveness-window')
      .reduce((sum, item) => sum + item.count, 0)
    const insufficientContextCount = localProofEvidenceKinds
      .filter(item => item.evidenceKind === 'insufficient-context')
      .reduce((sum, item) => sum + item.count, 0)
    const proofReadiness = summarizeLocalProofReadiness(candidateCount, insufficientContextCount)
            const recommendation = familySlotProvenance?.recommendation
              ?? (sourceKinds[0]?.sourceKind === 'external-mention'
                ? 'Delay rewrite-test probes while external-slot source evidence remains dominant.'
                : sourceKinds[0]?.sourceKind === 'protected-slot' || sourceKinds[0]?.sourceKind === 'insufficient-context'
                  ? 'Delay rewrite-test probes while protected/insufficient command-context blockers remain dominant.'
                  : 'Collect focused slot-role and source-kind evidence before rewrite-test expansion.')

    const totalLocalTempOnly = localProofEvidenceKinds
      .reduce((sum, item) => sum + item.count, 0)
    const localProofLivenessCandidateLike = livenessWindowKinds.reduce((sum, item) => sum + item.count, 0)
    const locallySafeCandidateCount = livenessWindowKinds
      .filter(item => item.windowKind === 'single-adjacent-arith-no-reuse' || item.windowKind === 'copy-chain-no-reuse')
      .reduce((sum, item) => sum + item.count, 0)
    const blockedCandidateCount = livenessWindowKinds
      .filter(item => item.windowKind === 'blocked-dst-reused-after-window' || item.windowKind === 'blocked-src-overwritten-before-use')
      .reduce((sum, item) => sum + item.count, 0)
    const unknownCandidateCount = livenessWindowKinds
      .filter(item => item.windowKind === 'unknown-window-too-small' || item.windowKind === 'unknown-unparsed-command')
      .reduce((sum, item) => sum + item.count, 0)
    const livenessWindowReadiness = livenessWindowKindReadiness(
      locallySafeCandidateCount,
      blockedCandidateCount,
      unknownCandidateCount,
    )
    const livenessWindowSummary: RewriteProofMissLivenessWindowFamilyEvidence = {
      family,
      totalCandidateLike: localProofLivenessCandidateLike,
      locallySafeCandidateCount,
      blockedCandidateCount,
      unknownCandidateCount,
      windowKinds: livenessWindowKinds,
      proofReadiness: livenessWindowReadiness,
      recommendation: summarizeLivenessWindowRecommendation([{
        family,
        totalCandidateLike: localProofLivenessCandidateLike,
        locallySafeCandidateCount,
        blockedCandidateCount,
        unknownCandidateCount,
        windowKinds: livenessWindowKinds,
        proofReadiness: livenessWindowReadiness,
        recommendation: '',
      }]),
    }

    if (localProofEvidenceKinds.length > 0) {
      localProofEvidenceByFamily.set(family, {
        family,
        totalLocalTempOnly,
        livenessWindowSummary,
        evidenceKinds: localProofEvidenceKinds,
        lirAdjacentWindowSummary: summarizeLirAdjacentWindowBreakdown(
          new Map(
            [...(summary.byAdjacentWindowBreakdown).entries()].map(([kind, adjacentWindowSummary]) => ([
              kind,
              {
                count: adjacentWindowSummary.count,
                caseNames: new Set(adjacentWindowSummary.caseNames),
                examples: adjacentWindowSummary.examples,
              },
            ])),
          ),
          new Map(
            [...(summary.byLocalTempProofGapReadiness).entries()].map(([readiness, readinessSummary]) => ([
              readiness,
              {
                count: readinessSummary.count,
                caseNames: readinessSummary.caseNames,
                examples: readinessSummary.examples,
              },
            ])),
          ),
          new Map(
            [...(summary.byLocalTempProofGapWindowKind).entries()].map(([windowKind, windowKindSummary]) => ([
              windowKind,
              {
                count: windowKindSummary.count,
                caseNames: windowKindSummary.caseNames,
                examples: windowKindSummary.examples,
              },
            ])),
          ),
        ),
        proofReadiness,
        recommendation: summarizeLocalProofEvidenceRecommendation([
          {
            family,
            totalLocalTempOnly,
            evidenceKinds: localProofEvidenceKinds,
            proofReadiness,
            recommendation: '',
            candidateCount,
            needsLivenessWindowCount,
            insufficientContextCount,
          },
        ]),
        candidateCount,
        needsLivenessWindowCount,
        insufficientContextCount,
      })
    }

    return {
      family,
      total: (familySlotProvenance?.total ?? summary.total),
      slotRoles,
      sourceKinds,
      recommendation,
    }
  }).sort((left, right) => right.total - left.total || left.family.localeCompare(right.family))

  const proofMissSlotDominantBlockers = proofMissSlotProvenanceByFamily
    .flatMap(item => item.sourceKinds)
    .reduce((acc, sourceKind) => {
      const aggregate = acc.get(sourceKind.sourceKind) ?? 0
      acc.set(sourceKind.sourceKind, aggregate + sourceKind.count)
      return acc
    }, new Map<RewriteProofMissSourceKind, number>())
  const dominantBlockers = [...proofMissSlotDominantBlockers.entries()]
    .map(([blocker, count]) => ({ blocker, count }))
    .sort((left, right) => right.count - left.count || left.blocker.localeCompare(right.blocker))

  const localProofEvidenceFamilies = [...localProofEvidenceByFamily.values()]
    .filter(family =>
      family.totalLocalTempOnly > 0
      || family.needsLivenessWindowCount > 0
      || family.candidateCount > 0
      || family.insufficientContextCount > 0,
    )
    .sort((left, right) => right.totalLocalTempOnly - left.totalLocalTempOnly || left.family.localeCompare(right.family))
  const localProofEvidenceSummary: RewriteProofMissLocalProofEvidenceSummary = {
    totalLocalTempOnly: localProofEvidenceFamilies.reduce((sum, family) => sum + family.totalLocalTempOnly, 0),
    byFamily: localProofEvidenceFamilies,
    candidateCount: localProofEvidenceFamilies.reduce((sum, family) => sum + family.candidateCount, 0),
    needsLivenessWindowCount: localProofEvidenceFamilies.reduce((sum, family) => sum + family.needsLivenessWindowCount, 0),
    insufficientContextCount: localProofEvidenceFamilies.reduce((sum, family) => sum + family.insufficientContextCount, 0),
    recommendation: summarizeLocalProofEvidenceRecommendation(localProofEvidenceFamilies),
    lirAdjacentWindowSummary: summarizeLirAdjacentWindowBreakdown(
      new Map(
        [...proofMissAdjacentWindowBreakdown.entries()].map(([kind, summary]) => ([
          kind,
          {
            count: summary.count,
            caseNames: summary.caseNames,
            examples: summary.examples,
          },
        ])),
      ),
      new Map(
        [...proofMissLocalTempProofGapReadiness.entries()].map(([readiness, summary]) => ([
          readiness,
          {
            count: summary.count,
            caseNames: summary.caseNames,
            examples: summary.examples,
          },
        ])),
      ),
      new Map(
        [...proofMissLocalTempProofGapWindowKind.entries()].map(([windowKind, summary]) => ([
          windowKind,
          {
            count: summary.count,
            caseNames: summary.caseNames,
            examples: summary.examples,
          },
        ])),
      ),
    ),
    livenessWindowSummary: {
      byFamily: localProofEvidenceFamilies.map((family) => {
        const familyWindowSummary = getLivenessWindowSummary(family.family, family.livenessWindowSummary)
        return {
          family: family.family,
          totalCandidateLike: familyWindowSummary.totalCandidateLike,
          locallySafeCandidateCount: familyWindowSummary.locallySafeCandidateCount,
          blockedCandidateCount: familyWindowSummary.blockedCandidateCount,
          unknownCandidateCount: familyWindowSummary.unknownCandidateCount,
          windowKinds: familyWindowSummary.windowKinds,
          proofReadiness: familyWindowSummary.proofReadiness,
          recommendation: familyWindowSummary.recommendation,
        }
      }).sort((left, right) => right.totalCandidateLike - left.totalCandidateLike || left.family.localeCompare(right.family)),
      totalCandidateLike: localProofEvidenceFamilies
        .reduce((sum, family) => sum + (family.livenessWindowSummary?.totalCandidateLike ?? 0), 0),
      locallySafeCandidateCount: localProofEvidenceFamilies
        .reduce((sum, family) => sum + (family.livenessWindowSummary?.locallySafeCandidateCount ?? 0), 0),
      blockedCandidateCount: localProofEvidenceFamilies
        .reduce((sum, family) => sum + (family.livenessWindowSummary?.blockedCandidateCount ?? 0), 0),
      unknownCandidateCount: localProofEvidenceFamilies
        .reduce((sum, family) => sum + (family.livenessWindowSummary?.unknownCandidateCount ?? 0), 0),
      proofReadiness: livenessWindowKindReadiness(
        localProofEvidenceFamilies.reduce((sum, family) => sum + (family.livenessWindowSummary?.locallySafeCandidateCount ?? 0), 0),
        localProofEvidenceFamilies.reduce((sum, family) => sum + (family.livenessWindowSummary?.blockedCandidateCount ?? 0), 0),
        localProofEvidenceFamilies.reduce((sum, family) => sum + (family.livenessWindowSummary?.unknownCandidateCount ?? 0), 0),
      ),
      recommendation: summarizeLivenessWindowRecommendation(localProofEvidenceFamilies.map(family => {
        const familyWindowSummary = getLivenessWindowSummary(family.family, family.livenessWindowSummary)
        return {
          family: family.family,
          totalCandidateLike: familyWindowSummary.totalCandidateLike,
          locallySafeCandidateCount: familyWindowSummary.locallySafeCandidateCount,
          blockedCandidateCount: familyWindowSummary.blockedCandidateCount,
          unknownCandidateCount: familyWindowSummary.unknownCandidateCount,
          windowKinds: familyWindowSummary.windowKinds,
          proofReadiness: familyWindowSummary.proofReadiness,
          recommendation: familyWindowSummary.recommendation,
        }
      })),
    },
  }

  const slotProvenanceRecommendation = dominantBlockers.length === 0
    ? 'No dominant slot-source blockers were observed from command-level proof-miss evidence.'
    : `Prioritize families where ${dominantBlockers[0].blocker} is not dominant before rewrite-test expansion.`

  const proofMissTotal = proofMissByFamily.reduce((sum, family) => sum + family.total, 0)
  const proofMissTopActionableFamilies = proofMissByFamily
    .filter(item => item.suggestedNextAction === 'focused-probe' || item.suggestedNextAction === 'rewrite-test-candidate')
    .slice(0, 3)
    .map(item => item.family)
  const proofMissRecommendation = proofMissTopActionableFamilies.length > 0
    ? `Prioritize focused proof-miss probes for ${proofMissTopActionableFamilies.join(', ')} before rewriting tests.`
    : 'No targeted proof-miss families are currently actionable from command-level evidence alone.'

  if (families.length > 0) {
    totals.shapeFamilySummary = {
      totalPatternNotExactCount: patternNotExactTotal,
      families,
      topRecoverableFamilies,
      recommendation,
      proofMissSummary: {
        total: proofMissTotal,
        byFamily: proofMissByFamily,
        topActionableFamilies: proofMissTopActionableFamilies,
        recommendation: proofMissRecommendation,
        slotProvenanceSummary: {
          total: proofMissTotal,
          byFamily: proofMissSlotProvenanceByFamily,
          dominantBlockers,
          recommendation: slotProvenanceRecommendation,
          localProofEvidenceSummary,
        },
      },
    }
  } else {
    totals.shapeFamilySummary = {
      totalPatternNotExactCount: patternNotExactTotal,
      families: [],
      topRecoverableFamilies: [],
      recommendation,
      proofMissSummary: {
        total: proofMissTotal,
        byFamily: proofMissByFamily,
        topActionableFamilies: proofMissTopActionableFamilies,
        recommendation: proofMissRecommendation,
        slotProvenanceSummary: {
          total: proofMissTotal,
          byFamily: proofMissSlotProvenanceByFamily,
          dominantBlockers,
          recommendation: slotProvenanceRecommendation,
          localProofEvidenceSummary,
        },
      },
    }
  }

  return totals
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

function summarizeLocalCopyRewriteResidualByStatusFromTopOpportunities(
  topOpportunities: CopyRewriteOpportunitySummary['topOpportunities'],
  caseName: string,
): Map<string, ArithmeticProbeExperimentalLocalCopyRewriteResidualByStatus> {
  const byStatus = new Map<string, ArithmeticProbeExperimentalLocalCopyRewriteResidualByStatus>()
  for (const opportunity of topOpportunities) {
    if (opportunity.status === 'currentlyOptimized') continue
    let entry = byStatus.get(opportunity.status)
    if (!entry) {
      entry = {
        status: opportunity.status,
        count: 0,
        caseNames: [caseName],
        examples: [],
      }
      byStatus.set(opportunity.status, entry)
    }
    entry.count += opportunity.count
    for (const example of opportunity.examples) {
      if (entry.examples.length >= MAX_RESIDUAL_EXAMPLES_PER_BUCKET) break
      entry.examples.push(example)
    }
  }
  for (const entry of byStatus.values()) {
    entry.examples = entry.examples.slice(0, MAX_RESIDUAL_EXAMPLES_PER_BUCKET)
  }
  return byStatus
}

function summarizeLocalCopyRewriteResidualPatterns(
  topOpportunities: CopyRewriteOpportunitySummary['topOpportunities'],
  caseName: string,
): Map<string, ArithmeticProbeExperimentalLocalCopyRewriteResidualPatternEntry> {
  const byPattern = new Map<string, ArithmeticProbeExperimentalLocalCopyRewriteResidualPatternEntry>()
  for (const opportunity of topOpportunities) {
    if (opportunity.status === 'currentlyOptimized') continue
    const key = `${opportunity.status}|${opportunity.pattern}`
    let entry = byPattern.get(key)
    if (!entry) {
      entry = {
        status: opportunity.status,
        pattern: opportunity.pattern,
        count: 0,
        caseNames: [caseName],
        examples: [],
      }
      byPattern.set(key, entry)
    }
    entry.count += opportunity.count
    if (!entry.caseNames.includes(caseName)) {
      entry.caseNames.push(caseName)
    }
    for (const example of opportunity.examples) {
      if (entry.examples.length >= MAX_RESIDUAL_EXAMPLES_PER_BUCKET) break
      entry.examples.push(example)
    }
  }
  for (const entry of byPattern.values()) {
    entry.examples = entry.examples.slice(0, MAX_RESIDUAL_EXAMPLES_PER_BUCKET)
  }
  return byPattern
}

function summarizeLocalCopyRewriteResidualFamiliesFromProvenance(
  provenanceSummary: RewriteProvenanceSummary | undefined,
  caseName: string,
): Map<string, ArithmeticProbeExperimentalLocalCopyRewriteResidualFamilyEntry> {
  const families = new Map<string, ArithmeticProbeExperimentalLocalCopyRewriteResidualFamilyEntry>()
  if (!provenanceSummary?.shapeFamilySummary?.families) {
    return families
  }
  for (const family of provenanceSummary.shapeFamilySummary.families) {
    if (family.count <= 0) continue
    families.set(family.family, {
      family: family.family,
      count: family.count,
      caseNames: [caseName],
      examples: family.examples.slice(0, MAX_RESIDUAL_EXAMPLES_PER_BUCKET),
    })
  }
  return families
}

function summarizeLocalCopyRewriteResidualReasonsFromProvenance(
  provenanceSummary: RewriteProvenanceSummary | undefined,
  caseName: string,
): RewriteProvenanceBucket[] {
  return [...(provenanceSummary?.byReason ?? [])]
    .filter(item => item.reason !== 'already-optimized-by-existing-pass')
    .map(item => ({
      reason: item.reason,
      count: item.count,
      caseNames: item.count > 0 ? [caseName] : [],
      examples: item.examples.slice(0, MAX_RESIDUAL_EXAMPLES_PER_BUCKET),
    }))
}

function summarizeExperimentalLocalCopyRewriteResidualRecommendation(
  byStatus: ArithmeticProbeExperimentalLocalCopyRewriteResidualByStatus[],
  residualCount: number,
): ArithmeticProbeExperimentalLocalCopyRewriteResidualCaseSummary['recommendation'] {
  if (residualCount === 0) return 'no-residuals'
  const hasSafeCandidate = byStatus.some(item => item.status === 'safeCandidate' && item.count > 0)
  const hasBlockedByBarrier = byStatus.some(item => item.status === 'blockedByBarrier' && item.count > 0)
  const hasUnknown = byStatus.some(item => item.status === 'unknown' && item.count > 0)

  if (!hasBlockedByBarrier && !hasUnknown && hasSafeCandidate) return 'candidate-family-ready'
  return 'diagnose-residuals-first'
}

function toSortedResidualByStatus(
  byStatus: Map<string, ArithmeticProbeExperimentalLocalCopyRewriteResidualByStatus>,
): ArithmeticProbeExperimentalLocalCopyRewriteResidualByStatus[] {
  return [...byStatus.values()]
    .map(entry => ({
      ...entry,
      caseNames: [...entry.caseNames].sort(),
      examples: entry.examples.slice(0, MAX_RESIDUAL_EXAMPLES_PER_BUCKET),
    }))
    .sort((left, right) => (
      right.count - left.count || statusSortWeight(left.status) - statusSortWeight(right.status)
    ))
}

function toSortedResidualByPattern(
  byPattern: Map<string, ArithmeticProbeExperimentalLocalCopyRewriteResidualPatternEntry>,
): ArithmeticProbeExperimentalLocalCopyRewriteResidualPatternEntry[] {
  return [...byPattern.values()]
    .map(entry => ({
      ...entry,
      caseNames: [...entry.caseNames].sort(),
      examples: entry.examples.slice(0, MAX_RESIDUAL_EXAMPLES_PER_BUCKET),
    }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count
      if (statusSortWeight(left.status) !== statusSortWeight(right.status)) {
        return statusSortWeight(left.status) - statusSortWeight(right.status)
      }
      return left.pattern.localeCompare(right.pattern)
    })
}

function toSortedResidualByFamily(
  families: Map<string, ArithmeticProbeExperimentalLocalCopyRewriteResidualFamilyEntry>,
): ArithmeticProbeExperimentalLocalCopyRewriteResidualFamilyEntry[] {
  return [...families.values()]
    .map(entry => ({
      ...entry,
      caseNames: [...entry.caseNames].sort(),
      examples: entry.examples.slice(0, MAX_RESIDUAL_EXAMPLES_PER_BUCKET),
    }))
    .sort((left, right) => right.count - left.count || left.family.localeCompare(right.family))
}

function toSortedResidualTopCaseNames(
  cases: ArithmeticProbeExperimentalLocalCopyRewriteResidualCaseSummary[],
): string[] {
  return [...cases]
    .filter(item => item.residualCount > 0)
    .sort((left, right) =>
      right.residualCount - left.residualCount || left.caseName.localeCompare(right.caseName) || left.optLevel.localeCompare(right.optLevel))
    .slice(0, MAX_RESIDUAL_CASE_SUMMARY_ENTRIES)
    .map(item => item.caseName)
}

function toSortedTrackZCandidateBuckets(
  buckets: RewriteTrackZDiagnosticBucket[],
): RewriteTrackZDiagnosticBucket[] {
  return buckets
    .map(entry => ({
      ...entry,
      caseNames: [...entry.caseNames].sort(),
      examples: entry.examples.slice(0, MAX_RESIDUAL_EXAMPLES_PER_BUCKET),
    }))
    .sort((left, right) => (
      right.count - left.count || left.label.localeCompare(right.label)
    ))
}

function toTrackZCaseTopNames(
  caseTotals: Map<string, number>,
): string[] {
  return [...caseTotals.entries()]
    .filter(([, total]) => total > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, MAX_RESIDUAL_CASE_SUMMARY_ENTRIES)
    .map(([caseName]) => caseName)
}

function summarizeTrackZRecommendation(
  byLabel: RewriteTrackZDiagnosticBucket[],
  totalCount: number,
): RewriteTrackZDiagnosticRecommendation {
  if (totalCount === 0) return 'collect-more-data'
  const top = byLabel[0]
  if (!top) return 'collect-more-data'

  if (top.label === 'rewriteable-now' && top.count === totalCount) return 'prioritize-AA'
  if (top.label === 'needs-window-proof' && top.count >= totalCount) return 'prioritize-AB'
  if (top.label === 'needs-window-proof' && top.count > totalCount / 2) return 'prioritize-AB'
  if (top.label === 'rewriteable-now') return 'prioritize-AA'
  if (top.label === 'blocked-protected-slot' || top.label === 'blocked-cross-function-or-module-external') {
    return 'investigate-blockers'
  }
  if (top.label === 'command-text-false-positive' || top.label === 'unknown-needs-lir-proof') {
    return 'collect-more-data'
  }
  return 'collect-more-data'
}

function summarizeTrackZCaseSummary(
  caseName: string,
  candidateSummary: RewriteTrackZDiagnosticCandidateSummary,
): RewriteTrackZDiagnosticCaseSummary {
  const byLabel = toSortedTrackZCandidateBuckets(candidateSummary.byLabel)
    .map(entry => ({
      ...entry,
      caseNames: entry.count > 0 ? [caseName] : [],
    }))

  const recommendation = summarizeTrackZRecommendation(byLabel, candidateSummary.totalCount)
  return {
    byLabel,
    targetPattern: TRACK_Z_TARGET_PATTERN,
    totalCount: candidateSummary.totalCount,
    recommendation,
  }
}

export function summarizeExperimentalLocalCopyRewriteResidualCaseSummary(
  caseSummary: {
    caseName: string
    optLevel: `O${OptimizationLevel}`
    opportunities: CopyRewriteOpportunitySummary
    rewriteOpportunityProvenanceSummary?: RewriteProvenanceSummary
    rewriteOpportunityTrackZResidualSummary?: RewriteTrackZDiagnosticCandidateSummary
  },
): ArithmeticProbeExperimentalLocalCopyRewriteResidualCaseSummary {
  const caseName = caseSummary.caseName
  const opportunities = caseSummary.opportunities
  const residualCount = Math.max(0, opportunities.total - opportunities.currentlyOptimized)
  const byStatus = summarizeLocalCopyRewriteResidualByStatusFromTopOpportunities(
    opportunities.topOpportunities,
    caseName,
  )
  const byPattern = summarizeLocalCopyRewriteResidualPatterns(opportunities.topOpportunities, caseName)
  const provenanceSummary = caseSummary.rewriteOpportunityProvenanceSummary
  const byFamily = summarizeLocalCopyRewriteResidualFamiliesFromProvenance(provenanceSummary, caseName)
  const byProvenance = summarizeLocalCopyRewriteResidualReasonsFromProvenance(provenanceSummary, caseName)
  const trackZResidualDiagnostics = caseSummary.rewriteOpportunityTrackZResidualSummary
    ? summarizeTrackZCaseSummary(caseName, caseSummary.rewriteOpportunityTrackZResidualSummary)
    : undefined
  const residualByStatus = toSortedResidualByStatus(byStatus)
  const residualByPattern = toSortedResidualByPattern(byPattern).slice(0, MAX_RESIDUAL_PATTERNS_PER_SUMMARY)
  const residualByFamily = toSortedResidualByFamily(byFamily).slice(0, MAX_RESIDUAL_FAMILIES_PER_SUMMARY)
  const recommendation = summarizeExperimentalLocalCopyRewriteResidualRecommendation(residualByStatus, residualCount)

  return {
    caseName,
    optLevel: caseSummary.optLevel,
    residualCount,
    residualByStatus,
    residualByPattern,
    residualByFamily,
    residualByProvenanceReason: byProvenance
      .map(entry => ({
        ...entry,
        caseNames: [...entry.caseNames].sort().slice(0, 1),
      }))
      .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
    ...(trackZResidualDiagnostics ? { trackZResidualDiagnostics } : {}),
    recommendation,
  }
}

export function summarizeExperimentalLocalCopyRewriteResidualSummary(
  summaries: Array<ArithmeticProbeExperimentalLocalCopyRewriteResidualCaseSummary>,
): ArithmeticProbeExperimentalLocalCopyRewriteResidualSummary {
  const perCase = [...summaries]
    .map(item => ({
      ...item,
      residualByStatus: [...item.residualByStatus],
      residualByPattern: [...item.residualByPattern],
      residualByFamily: [...item.residualByFamily],
      residualByProvenanceReason: [...item.residualByProvenanceReason],
      ...(item.trackZResidualDiagnostics ? {
        trackZResidualDiagnostics: {
          byLabel: item.trackZResidualDiagnostics.byLabel.map(bucket => ({
            ...bucket,
            caseNames: [...bucket.caseNames],
            examples: [...bucket.examples],
          })),
          targetPattern: item.trackZResidualDiagnostics.targetPattern,
          totalCount: item.trackZResidualDiagnostics.totalCount,
          recommendation: item.trackZResidualDiagnostics.recommendation,
        },
      } : {}),
    }))
    .sort((left, right) => left.caseName.localeCompare(right.caseName) || left.optLevel.localeCompare(right.optLevel))

  const totalResidualCount = perCase.reduce((sum, current) => sum + current.residualCount, 0)
  const byStatus = new Map<string, ArithmeticProbeExperimentalLocalCopyRewriteResidualByStatus>()
  const byPattern = new Map<string, ArithmeticProbeExperimentalLocalCopyRewriteResidualPatternEntry>()
  const byFamily = new Map<string, ArithmeticProbeExperimentalLocalCopyRewriteResidualFamilyEntry>()
  const byProvenance = new Map<string, RewriteProvenanceBucket>()
  const byTrackZLabel = new Map<string, RewriteTrackZDiagnosticBucket>()
  const trackZCaseTotals = new Map<string, number>()
  let totalTrackZCount = 0

  for (const item of perCase) {
    if (item.residualCount <= 0) continue
    for (const statusEntry of item.residualByStatus) {
      let aggregate = byStatus.get(statusEntry.status)
      if (!aggregate) {
        aggregate = {
          status: statusEntry.status,
          count: 0,
          caseNames: [],
          examples: [],
        }
        byStatus.set(statusEntry.status, aggregate)
      }
      aggregate.count += statusEntry.count
      if (!aggregate.caseNames.includes(item.caseName)) {
        aggregate.caseNames.push(item.caseName)
      }
      for (const example of statusEntry.examples) {
        if (aggregate.examples.length >= MAX_RESIDUAL_EXAMPLES_PER_BUCKET) break
        aggregate.examples.push(example)
      }
    }
    for (const patternEntry of item.residualByPattern) {
      const key = `${patternEntry.status}|${patternEntry.pattern}`
      let aggregate = byPattern.get(key)
      if (!aggregate) {
        aggregate = {
          status: patternEntry.status,
          pattern: patternEntry.pattern,
          count: 0,
          caseNames: [],
          examples: [],
        }
        byPattern.set(key, aggregate)
      }
      aggregate.count += patternEntry.count
      if (!aggregate.caseNames.includes(item.caseName)) {
        aggregate.caseNames.push(item.caseName)
      }
      for (const example of patternEntry.examples) {
        if (aggregate.examples.length >= MAX_RESIDUAL_EXAMPLES_PER_BUCKET) break
        aggregate.examples.push(example)
      }
    }
    for (const familyEntry of item.residualByFamily) {
      let aggregate = byFamily.get(familyEntry.family)
      if (!aggregate) {
        aggregate = {
          family: familyEntry.family,
          count: 0,
          caseNames: [],
          examples: [],
        }
        byFamily.set(familyEntry.family, aggregate)
      }
      aggregate.count += familyEntry.count
      if (!aggregate.caseNames.includes(item.caseName)) {
        aggregate.caseNames.push(item.caseName)
      }
      for (const example of familyEntry.examples) {
        if (aggregate.examples.length >= MAX_RESIDUAL_EXAMPLES_PER_BUCKET) break
        aggregate.examples.push(example)
      }
    }
    for (const provenanceEntry of item.residualByProvenanceReason) {
      let aggregate = byProvenance.get(provenanceEntry.reason)
      if (!aggregate) {
        aggregate = {
          reason: provenanceEntry.reason,
          count: 0,
          caseNames: [],
          examples: [],
        }
        byProvenance.set(provenanceEntry.reason, aggregate)
      }
      aggregate.count += provenanceEntry.count
      for (const caseName of provenanceEntry.caseNames) {
        if (!aggregate.caseNames.includes(caseName)) {
          aggregate.caseNames.push(caseName)
        }
      }
      for (const example of provenanceEntry.examples) {
        if (aggregate.examples.length >= MAX_RESIDUAL_EXAMPLES_PER_BUCKET) break
        aggregate.examples.push(example)
      }
    }
    const trackZ = item.trackZResidualDiagnostics
    if (trackZ && trackZ.totalCount > 0) {
      totalTrackZCount += trackZ.totalCount
      trackZCaseTotals.set(item.caseName, trackZ.totalCount)
      for (const bucket of trackZ.byLabel) {
        if (bucket.count <= 0) continue
        let aggregate = byTrackZLabel.get(bucket.label)
        if (!aggregate) {
          aggregate = {
            label: bucket.label,
            count: 0,
            caseNames: [],
            examples: [],
          }
          byTrackZLabel.set(bucket.label, aggregate)
        }
        aggregate.count += bucket.count
        if (!aggregate.caseNames.includes(item.caseName)) {
          aggregate.caseNames.push(item.caseName)
        }
        for (const example of bucket.examples) {
          if (aggregate.examples.length >= MAX_RESIDUAL_EXAMPLES_PER_BUCKET) break
          aggregate.examples.push(example)
        }
      }
    }
  }

  const residualTrackZDiagnosticsByLabel = [...byTrackZLabel.values()].map(entry => ({
    ...entry,
    caseNames: [...entry.caseNames].sort(),
    examples: entry.examples.slice(0, MAX_RESIDUAL_EXAMPLES_PER_BUCKET),
  })).sort((left, right) => (
    right.count - left.count || left.label.localeCompare(right.label)
  ))
  const residualTrackZRecommendation = summarizeTrackZRecommendation(
    residualTrackZDiagnosticsByLabel,
    totalTrackZCount,
  )
  const residualTrackZTopCaseNames = toTrackZCaseTopNames(trackZCaseTotals)
  const residualTrackZResidualDiagnostics = totalTrackZCount > 0 || residualTrackZTopCaseNames.length > 0
    ? {
      byLabel: residualTrackZDiagnosticsByLabel,
      targetPattern: TRACK_Z_TARGET_PATTERN,
      totalCount: totalTrackZCount,
      topCaseNames: residualTrackZTopCaseNames,
      recommendation: residualTrackZRecommendation,
    }
    : undefined

  const byStatusArray = toSortedResidualByStatus(byStatus)
  const byPatternArray = toSortedResidualByPattern(byPattern)
    .slice(0, MAX_RESIDUAL_PATTERNS_PER_SUMMARY)
  const byFamilyArray = toSortedResidualByFamily(byFamily).slice(0, MAX_RESIDUAL_FAMILIES_PER_SUMMARY)
  const residualByProvenanceReason = [...byProvenance.values()]
    .map(entry => ({
      ...entry,
      caseNames: [...entry.caseNames].sort(),
      examples: entry.examples.slice(0, MAX_RESIDUAL_EXAMPLES_PER_BUCKET),
    }))
    .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason))

  const recommendation = summarizeExperimentalLocalCopyRewriteResidualRecommendation(
    byStatusArray,
    totalResidualCount,
  )
  const topResidualCaseNames = toSortedResidualTopCaseNames(perCase)

  return {
    mode: 'experimental-local-copy-rewrite',
    status: 'diagnostic',
    onCaseCount: perCase.length,
    totalResidualCount,
    residualByStatus: byStatusArray,
    residualByPattern: byPatternArray,
    residualByFamily: byFamilyArray,
    residualByProvenanceReason,
    ...(residualTrackZResidualDiagnostics ? { trackZResidualDiagnostics: residualTrackZResidualDiagnostics } : {}),
    topResidualCaseNames,
    recommendation,
    perCase,
  }
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

function summarizeLirOpportunityRecommendation(byStatus: LirOpportunitySummary['byStatus']): LirOpportunitySummary['recommendation'] {
  if (byStatus.currentlyOptimized === 0 && byStatus.safeCandidate === 0 && byStatus.blockedByBarrier === 0 && byStatus.unknown === 0) {
    return 'no-action'
  }

  if (byStatus.safeCandidate > byStatus.blockedByBarrier) {
    return 'safe-local-rewrite-candidate'
  }

  return 'diagnose-first'
}

function summarizeLirOpportunityNotes(
  byStatus: LirOpportunitySummary['byStatus'],
  totalScoreCopyCount: number,
): string {
  if (totalScoreCopyCount === 0) {
    return 'No score-copy commands were observed in the selected arithmetic probes.'
  }

  return `${byStatus.currentlyOptimized} currently optimized, ${byStatus.safeCandidate} safe candidates, ${byStatus.blockedByBarrier} barrier-blocked, ${byStatus.unknown} uncertain`
}

function statusSortWeight(status: CopyRewriteStatus): number {
  return status === 'currentlyOptimized' ? 0 : status === 'safeCandidate' ? 1 : status === 'blockedByBarrier' ? 2 : 3
}

export function buildLirOpportunitySummary(cases: ArithmeticProbeResult[]): LirOpportunitySummary {
  const totals: LirOpportunitySummary = {
    totalScoreCopyCount: 0,
    byStatus: {
      currentlyOptimized: 0,
      safeCandidate: 0,
      blockedByBarrier: 0,
      unknown: 0,
    },
    topPatterns: [],
    provenanceSummary: {
      total: 0,
      byReason: [],
      safeAdjacentScoreCopyArithCount: 0,
      blockedCount: 0,
      insufficientInfoCount: 0,
      unknownCount: 0,
      requiresLirLevelAnalysis: false,
    },
    recommendation: 'no-action',
    notes: '',
  }

  const merged = new Map<string, LirOpportunitySummaryPatternEntry>()

  for (const result of cases) {
    const opportunities = result.rewriteOpportunities
    totals.totalScoreCopyCount += opportunities.total
    totals.byStatus.currentlyOptimized += opportunities.currentlyOptimized
    totals.byStatus.safeCandidate += opportunities.safeCandidate
    totals.byStatus.blockedByBarrier += opportunities.blockedByBarrier
    totals.byStatus.unknown += opportunities.unknown

    for (const entry of opportunities.topOpportunities) {
      const key = `${entry.status}|${entry.pattern}`
      let aggregate = merged.get(key)
      if (!aggregate) {
        aggregate = {
          status: entry.status,
          pattern: entry.pattern,
          count: 0,
          caseNames: [],
          examples: [],
        }
        merged.set(key, aggregate)
      }
      aggregate.count += entry.count
      if (!aggregate.caseNames.includes(result.case)) {
        aggregate.caseNames.push(result.case)
      }
      for (const example of entry.examples) {
        if (aggregate.examples.length >= 3) break
        aggregate.examples.push(example)
      }
    }
  }

  totals.topPatterns = [...merged.values()].map(entry => ({
    ...entry,
    caseNames: [...entry.caseNames].sort(),
    examples: entry.examples.slice(0, 3),
  })).sort((a, b) =>
    b.count - a.count || statusSortWeight(a.status) - statusSortWeight(b.status) || a.pattern.localeCompare(b.pattern)
  )
  totals.recommendation = summarizeLirOpportunityRecommendation(totals.byStatus)
  totals.notes = summarizeLirOpportunityNotes(totals.byStatus, totals.totalScoreCopyCount)
  totals.provenanceSummary = mergeRewriteOpportunitiesProvenance(cases.map(result => ({
    caseName: result.case,
    summary: result.rewriteOpportunities.provenanceSummary,
  })))
  const localProofEvidenceSummary = totals.provenanceSummary.shapeFamilySummary
    ?.proofMissSummary?.slotProvenanceSummary?.localProofEvidenceSummary
  const futureRewriteFixtureExportSummary = summarizeFutureRewriteFixtureExportSummary(localProofEvidenceSummary)
  const unknownCauseSplitSummary = summarizeUnknownCauseSplitSummary(localProofEvidenceSummary)
  const shortWindowProofSummary = localProofEvidenceSummary?.lirAdjacentWindowSummary?.shortWindowProofSummary
  totals.futureRewriteFixtureExportSummary = futureRewriteFixtureExportSummary
  totals.unknownCauseSplitSummary = unknownCauseSplitSummary
  totals.offlineRewriteTestHarnessSummary = summarizeOfflineRewriteTestHarnessSummary(
    futureRewriteFixtureExportSummary,
    shortWindowProofSummary,
    unknownCauseSplitSummary,
  )
  return totals
}

export function summarizeOfflineRewriteEquivalencePack(options: {
  totals: RunnerOfflineRewriteSummary
  familySummaries: RunnerOfflineRewriteFamilySummary[]
  failedFixtureNames: string[]
}): OfflineRewriteEquivalencePackSummary {
  const offlineRewriteFamilyReadinessSummary = summarizeOfflineRewriteFamilyReadiness(options.familySummaries)
  const failedFixtureNames = options.failedFixtureNames.slice(0, OFFLINE_REWRITE_EQUIVALENCE_PACK_MAX_FAILED_FIXTURE_NAMES)
  return {
    status: options.totals.failed === 0 ? 'pass' : 'fail',
    totalFixtures: options.totals.total,
    equivalentFixtures: options.totals.equivalent,
    counterexampleFixtures: options.totals.counterexample,
    unsupportedFixtures: options.totals.unsupported,
    failedFixtures: options.totals.failed,
    familySummaries: options.familySummaries.map(summary => ({
      family: summary.family,
      totalFixtures: summary.total,
      equivalentFixtures: summary.equivalent,
      counterexampleFixtures: summary.counterexample,
      unsupportedFixtures: summary.unsupported,
      failedFixtures: summary.failed,
    })),
    failedFixtureNames: failedFixtureNames.length > 0 ? failedFixtureNames : undefined,
    evidenceStatus: 'bounded-offline-evidence-only',
    offlineRewriteFamilyReadinessSummary,
  }
}

function summarizeOfflineRewriteFamilyReadiness(
  familySummaries: RunnerOfflineRewriteFamilySummary[],
): OfflineRewriteFamilyReadinessSummary {
  const summaryByFamily = new Map<string, RunnerOfflineRewriteFamilySummary>()
  for (const summary of familySummaries) {
    summaryByFamily.set(summary.family, summary)
  }

  const requiredFamilies = OFFLINE_REWRITE_FAMILY_READINESS_REQUIRED_FAMILIES
    .map((family): OfflineRewriteFamilyReadinessEntry => {
      const familySummary = summaryByFamily.get(family)
      const total = familySummary?.total ?? 0
      const failed = familySummary?.failed ?? 0
      return {
        family,
        total,
        failed,
        status: total > 0 && failed === 0 ? 'pass' : 'fail',
      }
    })

  const missingFamilies = requiredFamilies
    .filter(entry => entry.total === 0)
    .map(entry => entry.family)
  const failedFamilies = requiredFamilies
    .filter(entry => entry.failed > 0)
    .map(entry => entry.family)

  return {
    status: missingFamilies.length === 0 && failedFamilies.length === 0 ? 'pass' : 'fail',
    evidenceStatus: 'bounded-offline-evidence-only',
    requiredFamilies,
    missingFamilies,
    failedFamilies,
    notes: 'Evidence-only bounded offline family readiness; this is not production correctness proof.',
    gateReason: 'bounded-offline-evidence-only readiness check for explicit local-copy gate path.',
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

interface ArithmeticProofWitness {
  status: 'proven' | 'unproven' | 'unsupported'
  method: VirSemanticProofMethod
  reason: string
  requireMode?: 'direct' | 'planned'
}

const OFFLINE_ARITHMETIC_SEMANTIC_PROOFS: Record<string, ArithmeticProofWitness> = {
  int_arithmetic: {
    status: 'proven',
    method: 'fixture-expected-output',
    requireMode: 'planned',
    reason: 'controlled pure arithmetic witness; expected outputs validated offline by fixture model',
  },
}

function inferSemanticProofDetails(
  probeName: string,
  coverageCategory: 'controlled' | 'broad',
  decision: {
    status: VirToLirDecisionReport['kind']
    selectedMode: VirToLirDecisionReport['selectedMode']
    unsupportedReasonTags: VirUnsupportedReasonTag[]
  },
): VirSemanticProofDetails {
  if (decision.status === 'unsupported') {
    return {
      status: 'unsupported',
      method: 'none',
      reason: 'unsupported lowering case',
    }
  }

  if (coverageCategory !== 'controlled') {
    return {
      status: 'unproven',
      method: 'none',
      reason: 'proof harness currently limited to controlled-only cases',
    }
  }

  const witness = OFFLINE_ARITHMETIC_SEMANTIC_PROOFS[probeName]
  if (!witness) {
    return {
      status: 'unproven',
      method: 'none',
      reason: 'no deterministic offline proof witness was registered for this case',
    }
  }

  if (witness.requireMode && witness.requireMode !== decision.selectedMode) {
    return {
      status: 'unproven',
      method: 'none',
      reason: `proof witness requires ${witness.requireMode} mode, got ${decision.selectedMode}`,
    }
  }

  if (decision.unsupportedReasonTags.length > 0) {
    return {
      status: 'unproven',
      method: 'none',
      reason: `proof witness blocked by lowering blocker tags: ${decision.unsupportedReasonTags.join(',')}`,
    }
  }

  return {
    status: witness.status,
    method: witness.method,
    reason: witness.reason,
  }
}

function makeZeroFixtureBoundarySummary(): FixtureBoundarySummary {
  return {
    setupOnlyCaseNames: [],
    setupOnlyUnsupportedCount: 0,
    trueArithmeticUnsupportedCaseNames: [],
    trueArithmeticUnsupportedCount: 0,
    mixedOrUnknownCaseNames: [],
    mixedOrUnknownCount: 0,
    dominantFixtureFamilies: [],
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
    allocationFailureBreakdown: [],
    functionNamesAvailable: false,
    recommendation: 'allocation-check failures are currently clear',
    notes: 'function-level names are not captured from existing probe outputs',
  }
}

const ALLOCATION_FAILURE_CATEGORY_ORDER: ReadonlyArray<VirAllocationFailureCategory> = [
  'parallel-copy-cycle',
  'ret-precolor-conflict',
  'dead-lhs-affinity-conflict',
  'unknown',
]

function classifyAllocationFailureCategory(reason: string): VirAllocationFailureCategory {
  const normalized = reason.toLowerCase()
  if (/(parallel copy cycle|parallel-copy|scratch slot|parallel copy)/.test(normalized)) {
    return 'parallel-copy-cycle'
  }
  if (/(return|ret).*(slot|pre.?color|precolored|pre-color)|return root|return slot/.test(normalized)) {
    return 'ret-precolor-conflict'
  }
  if (/(clobber|clobbers|dead|source is empty|return slot missing|binary write|copy destination|unsafe)/.test(normalized)) {
    return 'dead-lhs-affinity-conflict'
  }
  return 'unknown'
}

function summarizeAllocationFailureBreakdown(
  entries: Array<{ caseName: string; reason: string }>,
): VirAllocationFailureBreakdownEntry[] {
  const buckets = new Map<VirAllocationFailureCategory, {
    count: number
    caseNames: Set<string>
    examples: Set<string>
  }>()

  for (const category of ALLOCATION_FAILURE_CATEGORY_ORDER) {
    buckets.set(category, { count: 0, caseNames: new Set(), examples: new Set() })
  }

  for (const entry of entries) {
    const category = classifyAllocationFailureCategory(entry.reason)
    const bucket = buckets.get(category)
    if (!bucket) continue
    bucket.count += 1
    bucket.caseNames.add(entry.caseName)
    if (entry.reason.length > 0) {
      bucket.examples.add(entry.reason)
    }
  }

  return ALLOCATION_FAILURE_CATEGORY_ORDER
    .map(category => {
      const bucket = buckets.get(category)
      if (!bucket || bucket.count === 0) return undefined
      return {
        category,
        count: bucket.count,
        caseNames: [...bucket.caseNames].sort(),
        examples: [...bucket.examples].sort().slice(0, 3),
      }
    })
    .filter((entry): entry is VirAllocationFailureBreakdownEntry => entry !== undefined)
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

function summarizeFixtureBoundarySummary(
  entries: VirCaseBlockerMatrixEntry[],
  familyBreakdown: VirUnsupportedMirCallTargetFamilyBreakdownEntry[],
): FixtureBoundarySummary {
  const setupOnlyCaseNames = new Set<string>()
  const trueArithmeticUnsupportedCaseNames = new Set<string>()
  const mixedOrUnknownCaseNames = new Set<string>()

  for (const entry of entries) {
    if (entry.status !== 'unsupported') continue

    const families = new Set(
      (entry.unsupportedMirCallTargets ?? [])
        .map(target => classifyMirCallTarget(target).targetFamily ?? `function:${target.fn}`)
    )
    if (families.size === 0) {
      mixedOrUnknownCaseNames.add(entry.caseName)
      continue
    }

    const hasRawSummonSetup = families.has('raw:summon-marker-setup')
    const hasTrueArithmeticFamily = [...families]
      .some(family => family !== 'raw:summon-marker-setup')

    if (hasRawSummonSetup && !hasTrueArithmeticFamily) {
      setupOnlyCaseNames.add(entry.caseName)
    } else if (hasRawSummonSetup && hasTrueArithmeticFamily) {
      mixedOrUnknownCaseNames.add(entry.caseName)
    } else {
      trueArithmeticUnsupportedCaseNames.add(entry.caseName)
    }
  }

  const dominantFixtureFamilies: FixtureBoundaryFamilySummary[] = familyBreakdown
    .filter(entry => entry.family === 'raw:summon-marker-setup')
    .map(entry => ({
      family: entry.family,
      count: entry.count,
      caseNames: [...entry.caseNames].sort(),
    }))
    .sort((left, right) => right.count - left.count || left.family.localeCompare(right.family))

  const setupOnlyCaseNameList = [...setupOnlyCaseNames].sort()
  const trueArithmeticCaseNameList = [...trueArithmeticUnsupportedCaseNames].sort()
  const mixedOrUnknownCaseNameList = [...mixedOrUnknownCaseNames].sort()

  return {
    setupOnlyCaseNames: setupOnlyCaseNameList,
    setupOnlyUnsupportedCount: setupOnlyCaseNameList.length,
    trueArithmeticUnsupportedCaseNames: trueArithmeticCaseNameList,
    trueArithmeticUnsupportedCount: trueArithmeticCaseNameList.length,
    mixedOrUnknownCaseNames: mixedOrUnknownCaseNameList,
    mixedOrUnknownCount: mixedOrUnknownCaseNameList.length,
    dominantFixtureFamilies,
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
  allocationFailureBreakdown: Array<{ caseName: string; reason: string }>,
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
    allocationFailureBreakdown: summarizeAllocationFailureBreakdown(allocationFailureBreakdown),
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
    fixtureBoundarySummary: makeZeroFixtureBoundarySummary(),
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
  const allocationCheckFailureReasons: Array<{ caseName: string; reason: string }> = []

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
      const allocationFailureReason = decision.unsupportedReason ?? ''
      if (allocationFailureReason.length > 0) {
        allocationCheckFailureReasons.push({
          caseName: result.case,
          reason: allocationFailureReason,
        })
      }
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
  dashboard.fixtureBoundarySummary = summarizeFixtureBoundarySummary(
    caseBlockerMatrix,
    dashboard.unsupportedMirCallTargetFamilyBreakdown,
  )
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
    allocationCheckFailureReasons,
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

function toComparisonCaseKey(result: ArithmeticProbeResult): string {
  return `${result.case}::${result.optLevel}`
}

function buildExperimentalLocalCopyRewriteComparison(
  offCases: ArithmeticProbeResult[],
  onCases: ArithmeticProbeResult[],
): ArithmeticProbeExperimentalLocalCopyRewriteComparison {
  const offCaseByKey = new Map(offCases.map(result => [toComparisonCaseKey(result), result] as const))
  const perCaseDeltas = onCases.map(on => {
    const off = offCaseByKey.get(toComparisonCaseKey(on))
    const offCommands = off?.commands.total ?? 0
    const offScoreCopy = off?.commands.scoreCopy ?? 0
    const onCommands = on.commands.total
    const onScoreCopy = on.commands.scoreCopy
    return {
      caseName: on.case,
      optLevel: on.optLevel,
      offCommandsTotal: offCommands,
      onCommandsTotal: onCommands,
      commandDelta: onCommands - offCommands,
      offScoreCopyTotal: offScoreCopy,
      onScoreCopyTotal: onScoreCopy,
      scoreCopyDelta: onScoreCopy - offScoreCopy,
    }
  }).sort((left, right) =>
    left.caseName.localeCompare(right.caseName) || left.optLevel.localeCompare(right.optLevel),
  )

  const commandDeltas = perCaseDeltas.map(delta => delta.commandDelta)
  const scoreCopyDeltas = perCaseDeltas.map(delta => delta.scoreCopyDelta)

  return {
    mode: 'experimental-local-copy-rewrite',
    status: 'experimental',
    enabled: true,
    off: {
      caseCount: offCases.length,
      commandTotal: offCases.reduce((sum, result) => sum + result.commands.total, 0),
      scoreCopyTotal: offCases.reduce((sum, result) => sum + result.commands.scoreCopy, 0),
    },
    on: {
      caseCount: onCases.length,
      commandTotal: onCases.reduce((sum, result) => sum + result.commands.total, 0),
      scoreCopyTotal: onCases.reduce((sum, result) => sum + result.commands.scoreCopy, 0),
    },
    commandDelta: onCases.reduce((sum, result) => sum + result.commands.total, 0)
      - offCases.reduce((sum, result) => sum + result.commands.total, 0),
    scoreCopyDelta: onCases.reduce((sum, result) => sum + result.commands.scoreCopy, 0)
      - offCases.reduce((sum, result) => sum + result.commands.scoreCopy, 0),
    commandDeltaSummary: summarizeDeltaSeries(commandDeltas),
    scoreCopyDeltaSummary: summarizeDeltaSeries(scoreCopyDeltas),
    perCaseDeltas,
  }
}

export function evaluateExperimentalLocalCopyRewriteNoRegressionGate(
  comparison: ArithmeticProbeExperimentalLocalCopyRewriteComparison | undefined,
  offlineRewriteEquivalencePackSummary?: OfflineRewriteEquivalencePackSummary,
): ArithmeticProbeExperimentalLocalCopyRewriteNoRegressionGate {
  const failReasons: string[] = []

  if (!comparison) {
    failReasons.push('Missing experimentalLocalCopyRewriteComparison')
  } else {
    if (comparison.off.caseCount !== comparison.on.caseCount) {
      failReasons.push(
        `off/on case count mismatch: off=${comparison.off.caseCount}, on=${comparison.on.caseCount}`,
      )
    }
    if (comparison.commandDeltaSummary.regressedCount > 0) {
      failReasons.push(`command regressions detected in summary: ${comparison.commandDeltaSummary.regressedCount}`)
    }
    if (comparison.scoreCopyDeltaSummary.regressedCount > 0) {
      failReasons.push(`scoreCopy regressions detected in summary: ${comparison.scoreCopyDeltaSummary.regressedCount}`)
    }
    const commandRegressionCases = comparison.perCaseDeltas.filter(delta => delta.commandDelta > 0)
    if (commandRegressionCases.length > 0) {
      failReasons.push(
        `command regressions detected in per-case deltas: ${commandRegressionCases.length}`,
      )
    }
    const scoreCopyRegressionCases = comparison.perCaseDeltas.filter(delta => delta.scoreCopyDelta > 0)
    if (scoreCopyRegressionCases.length > 0) {
      failReasons.push(
        `scoreCopy regressions detected in per-case deltas: ${scoreCopyRegressionCases.length}`,
      )
    }
    if (comparison.commandDelta > 0) {
      failReasons.push(`aggregate command delta regression: ${comparison.commandDelta}`)
    }
    if (comparison.scoreCopyDelta > 0) {
      failReasons.push(`aggregate scoreCopy delta regression: ${comparison.scoreCopyDelta}`)
    }
  }

  if (comparison) {
    if (!offlineRewriteEquivalencePackSummary) {
      failReasons.push('Missing offlineRewriteEquivalencePackSummary')
    } else {
      if (offlineRewriteEquivalencePackSummary.status === 'fail') {
        failReasons.push(
          `offline rewrite equivalence pack did not pass: status=${offlineRewriteEquivalencePackSummary.status}, failedFixtures=${offlineRewriteEquivalencePackSummary.failedFixtures}`,
        )
        if (
          offlineRewriteEquivalencePackSummary.failedFixtureNames &&
          offlineRewriteEquivalencePackSummary.failedFixtureNames.length > 0
        ) {
          failReasons.push(
            `offline rewrite equivalence pack failed fixture names: ${offlineRewriteEquivalencePackSummary.failedFixtureNames.join(', ')}`,
          )
        }
      }
      if (!offlineRewriteEquivalencePackSummary.offlineRewriteFamilyReadinessSummary) {
        failReasons.push('Missing offlineRewriteFamilyReadinessSummary')
      } else {
        const readinessSummary = offlineRewriteEquivalencePackSummary.offlineRewriteFamilyReadinessSummary
        if (readinessSummary.status === 'fail') {
          failReasons.push(
            `offline rewrite family readiness did not pass: status=${readinessSummary.status}`,
          )
        }
        if (readinessSummary.missingFamilies.length > 0) {
          failReasons.push(
            `offline rewrite family readiness missing required families: ${readinessSummary.missingFamilies.join(', ')}`,
          )
        }
        if (readinessSummary.failedFamilies.length > 0) {
          failReasons.push(
            `offline rewrite family readiness failed families: ${readinessSummary.failedFamilies.join(', ')}`,
          )
        }
      }
    }
  }

  return {
    mode: 'experimental-no-regression-evidence-only',
    status: failReasons.length === 0 ? 'pass' : 'fail',
    failReasons,
    rationale: 'benchmark-evidence-only-no-production',
    offlineRewriteFamilyReadinessSummary: offlineRewriteEquivalencePackSummary?.offlineRewriteFamilyReadinessSummary,
  }
}

function summarizeRolloutImprovedCaseNames(
  perCaseDeltas: ArithmeticProbeExperimentalLocalCopyRewriteComparison['perCaseDeltas'] = [],
): string[] {
  const improved = perCaseDeltas
    .filter(delta => delta.commandDelta < 0 || delta.scoreCopyDelta < 0)
    .sort((left, right) =>
      left.caseName.localeCompare(right.caseName) || left.optLevel.localeCompare(right.optLevel),
    )

  const seenCaseNames = new Set<string>()
  const improvedCaseNames: string[] = []
  for (const delta of improved) {
    if (seenCaseNames.has(delta.caseName)) continue
    seenCaseNames.add(delta.caseName)
    improvedCaseNames.push(delta.caseName)
    if (improvedCaseNames.length >= ROLLOUT_READINESS_MAX_IMPROVED_CASE_NAMES) {
      break
    }
  }

  return improvedCaseNames
}

export function evaluateExperimentalLocalCopyRewriteRolloutReadinessSummary(
  args: {
    comparison?: ArithmeticProbeExperimentalLocalCopyRewriteComparison
    noRegressionGate?: ArithmeticProbeExperimentalLocalCopyRewriteNoRegressionGate
    offlineRewriteEquivalencePackSummary?: OfflineRewriteEquivalencePackSummary
  },
): ArithmeticProbeExperimentalLocalCopyRewriteRolloutReadinessSummary {
  const comparison = args.comparison
  const noRegressionGate = args.noRegressionGate
  const offlineRewriteEquivalencePackSummary = args.offlineRewriteEquivalencePackSummary

  const failReasons: string[] = []
  const commandDelta = comparison?.commandDelta ?? 0
  const scoreCopyDelta = comparison?.scoreCopyDelta ?? 0
  const commandRegressedCount = comparison?.commandDeltaSummary?.regressedCount ?? 0
  const scoreCopyRegressedCount = comparison?.scoreCopyDeltaSummary?.regressedCount ?? 0
  const commandRegressedCaseCount = comparison?.perCaseDeltas.filter(delta => delta.commandDelta > 0).length ?? 0
  const scoreCopyRegressedCaseCount = comparison?.perCaseDeltas.filter(delta => delta.scoreCopyDelta > 0).length ?? 0
  const requiredGateStatus = noRegressionGate?.status ?? 'fail'
  const offlinePackStatus = offlineRewriteEquivalencePackSummary?.status ?? 'fail'
  const familyReadinessStatus = offlineRewriteEquivalencePackSummary?.offlineRewriteFamilyReadinessSummary?.status ?? 'fail'

  if (!comparison) {
    failReasons.push('Missing experimentalLocalCopyRewriteComparison')
  }
  if (requiredGateStatus === 'fail') {
    failReasons.push(`required no-regression gate did not pass: status=${requiredGateStatus}`)
  }
  if (offlinePackStatus === 'fail') {
    failReasons.push(`offline rewrite equivalence pack status did not pass: status=${offlinePackStatus}`)
  }
  if (familyReadinessStatus === 'fail') {
    failReasons.push(`offline rewrite family readiness status did not pass: status=${familyReadinessStatus}`)
  }
  if (commandRegressedCount > 0) {
    failReasons.push(`command regressions detected in summary: ${commandRegressedCount}`)
  }
  if (scoreCopyRegressedCount > 0) {
    failReasons.push(`scoreCopy regressions detected in summary: ${scoreCopyRegressedCount}`)
  }
  if (commandRegressedCaseCount > 0) {
    failReasons.push(`command regressions detected in per-case deltas: ${commandRegressedCaseCount}`)
  }
  if (scoreCopyRegressedCaseCount > 0) {
    failReasons.push(`scoreCopy regressions detected in per-case deltas: ${scoreCopyRegressedCaseCount}`)
  }
  if (commandDelta > 0) {
    failReasons.push(`aggregate command delta regression: ${commandDelta}`)
  }
  if (scoreCopyDelta > 0) {
    failReasons.push(`aggregate scoreCopy delta regression: ${scoreCopyDelta}`)
  }
  if (commandDelta >= 0 && scoreCopyDelta >= 0) {
    failReasons.push(`no aggregate command/scoreCopy improvement: commandDelta=${commandDelta}, scoreCopyDelta=${scoreCopyDelta}`)
  }

  const reasons = failReasons.length > 0
    ? failReasons
    : [
      'explicit no-regression gate passed',
      'offline rewrite equivalence pack and family readiness passed',
      'bounded benchmark deltas show command/scoreCopy improvement with no regressions',
      'suitable only for manual experimental opt-in review',
    ]

  return {
    status: failReasons.length === 0 ? 'pass' : 'fail',
    recommendation: failReasons.length === 0 ? 'manual-experimental-opt-in-only' : 'stay-experimental',
    evidenceStatus: 'benchmark-and-bounded-offline-evidence-only',
    reasons,
    requiredGateStatus,
    offlinePackStatus,
    familyReadinessStatus,
    commandDelta,
    scoreCopyDelta,
    commandRegressedCount,
    scoreCopyRegressedCount,
    improvedCaseNames: summarizeRolloutImprovedCaseNames(comparison?.perCaseDeltas),
    notes: 'Benchmark-and-bounded-offline evidence only; this summary is for manual experimental opt-in review and does not authorize production default enablement.',
  }
}

export function runArithmeticProbe(
  probe: ArithmeticProbeCase,
  optLevel: OptimizationLevel,
  experimentalLirLocalCopyRewrite = false,
): ArithmeticProbeResult {
  const source = buildSource(probe)
  const namespace = `arith_${probe.name}`
  const result = runPipeline(source, {
    namespace,
    optimizationLevel: optLevel,
    experimentalLirLocalCopyRewrite,
  })
  const mirLowering = lowerMirToVir(result.mir)
  const coverageCategory = probe.coverageCategory ?? 'broad'
  const lines = commandLinesWithLocations(result.files)
  const rewriteOpportunityAnalysis = summarizeRewriteOpportunitiesWithProvenance(lines)
  const virDecision = mirLowering.kind === 'ok'
    ? (() => {
      const decision = chooseVirLoweringPlan(mirLowering.module, { runAllocationCheck: true })
      const proof = inferSemanticProofDetails(
        probe.name,
        coverageCategory,
        {
          status: decision.kind,
          selectedMode: decision.selectedMode,
          unsupportedReasonTags: summarizeDecisionUnsupportedReasonTags(decision),
        },
      )
      const firstAllocationFailureReason = decision.decisions.find(
        entry => entry.rejectionCategory === 'allocation_check_failed',
      )?.rejectionReason
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
        semanticProofStatus: proof.status,
        semanticProofDetails: proof,
        unsupportedReasonTags,
        modeTotals,
        unsupportedReason: decision.unsupportedReason ?? firstAllocationFailureReason,
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
      semanticProofDetails: {
        status: 'unsupported' as const,
        method: 'none' as const,
        reason: mirLowering.kind === 'unsupported' ? mirLowering.reason : 'unsupported MIR-to-VIR conversion',
      } as VirSemanticProofDetails,
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
    rewriteOpportunities: rewriteOpportunityAnalysis.opportunities,
    experimentalLocalCopyRewriteResidualSummary: experimentalLirLocalCopyRewrite
      ? summarizeExperimentalLocalCopyRewriteResidualCaseSummary({
        caseName: probe.name,
        optLevel: `O${optLevel}`,
        opportunities: rewriteOpportunityAnalysis.opportunities,
        rewriteOpportunityProvenanceSummary: rewriteOpportunityAnalysis.provenanceSummary,
        rewriteOpportunityTrackZResidualSummary: rewriteOpportunityAnalysis.trackZResidualSummary,
      })
      : undefined,
    virDecision,
    warnings: result.warnings,
  }
}

export function runArithmeticProbeReport(
  caseName = 'all',
  optLevels: OptimizationLevel[] = [1],
  experimentalLirLocalCopyRewrite = false,
): ArithmeticProbeReport {
  const selected = caseName === 'all'
    ? ARITHMETIC_PROBES
    : ARITHMETIC_PROBES.filter(probe => probe.name === caseName)
  if (selected.length === 0) {
    throw new Error(`Unknown arithmetic probe case '${caseName}'. Use --list to see available cases.`)
  }
  const meta = benchmarkMeta('arithmetic-probes')
  const offCases = selected.flatMap(probe => optLevels.map(level => runArithmeticProbe(probe, level)))
  const cases = experimentalLirLocalCopyRewrite
    ? selected.flatMap(probe => optLevels.map(level => runArithmeticProbe(probe, level, true))
    ) : offCases
  const experimentalLocalCopyRewriteResidualSummaries = experimentalLirLocalCopyRewrite
    ? cases
      .map(result => result.experimentalLocalCopyRewriteResidualSummary)
      .filter((summary): summary is ArithmeticProbeExperimentalLocalCopyRewriteResidualCaseSummary =>
        summary !== undefined
      )
    : []
  const lirOpportunitySummary = buildLirOpportunitySummary(cases)
  const offlineRewriteEquivalenceRun = experimentalLirLocalCopyRewrite
    ? runOfflineRewriteEquivalenceFixtures()
    : undefined
  const offlineRewriteEquivalencePackSummary = offlineRewriteEquivalenceRun
    ? summarizeOfflineRewriteEquivalencePack({
      totals: offlineRewriteEquivalenceRun.totals,
      familySummaries: offlineRewriteEquivalenceRun.summaryByFamily,
      failedFixtureNames: offlineRewriteEquivalenceRun.fixtureResults
        .filter(fixture => !fixture.passed)
        .map(fixture => fixture.name),
    })
    : undefined
  const experimentalLocalCopyRewriteComparison = experimentalLirLocalCopyRewrite
    ? buildExperimentalLocalCopyRewriteComparison(offCases, cases)
    : undefined
  const experimentalLocalCopyRewriteNoRegressionGate = experimentalLirLocalCopyRewrite
    ? evaluateExperimentalLocalCopyRewriteNoRegressionGate(
      experimentalLocalCopyRewriteComparison,
      offlineRewriteEquivalencePackSummary,
    )
    : undefined
  const experimentalLocalCopyRewriteRolloutReadinessSummary = experimentalLirLocalCopyRewrite
    ? evaluateExperimentalLocalCopyRewriteRolloutReadinessSummary({
      comparison: experimentalLocalCopyRewriteComparison,
      noRegressionGate: experimentalLocalCopyRewriteNoRegressionGate,
      offlineRewriteEquivalencePackSummary,
    })
    : undefined
  const experimentalLocalCopyRewriteResidualSummary = experimentalLirLocalCopyRewrite
    ? summarizeExperimentalLocalCopyRewriteResidualSummary(experimentalLocalCopyRewriteResidualSummaries)
    : undefined
  return {
    ...meta,
    cases,
    scoreCopyPatterns: mergeScoreCopyPatterns(cases.map(result => result.scoreCopyPatterns)),
    copyOrigins: mergeCopyOrigins(cases.map(result => result.copyOrigins)),
    rewriteOpportunities: mergeRewriteOpportunities(cases.map(result => result.rewriteOpportunities)),
    offlineRewriteEquivalencePackSummary,
    experimentalLocalCopyRewriteComparison,
    experimentalLocalCopyRewriteNoRegressionGate,
    experimentalLocalCopyRewriteRolloutReadinessSummary,
    experimentalLocalCopyRewriteResidualSummary,
    lirOpportunitySummary,
    futureRewriteFixtureExportSummary: lirOpportunitySummary?.futureRewriteFixtureExportSummary,
    unknownCauseSplitSummary: lirOpportunitySummary?.unknownCauseSplitSummary,
    offlineRewriteTestHarnessSummary: lirOpportunitySummary?.offlineRewriteTestHarnessSummary,
    virDecisionDashboard: buildVirArithmeticDecisionDashboard(cases),
  }
}

export function parseProbeCliArgs(argv: string[]): ProbeCliArgs {
  const base = parseCliArgs(argv)
  let caseName = 'all'
  let optLevels: OptimizationLevel[] = [1]
  let list = false
  let experimentalLirLocalCopyRewrite = false
  let requireNoRegressionInExperimentalLocalCopyRewrite = false

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
    if (arg === '--experimental-lir-local-copy-rewrite') {
      experimentalLirLocalCopyRewrite = true
    }
    if (arg === '--require-experimental-lir-local-copy-no-regressions') {
      requireNoRegressionInExperimentalLocalCopyRewrite = true
    }
  }

  if (requireNoRegressionInExperimentalLocalCopyRewrite && !experimentalLirLocalCopyRewrite) {
    throw new Error(
      '--require-experimental-lir-local-copy-no-regressions requires --experimental-lir-local-copy-rewrite',
    )
  }

  return {
    ...base,
    caseName,
    optLevels,
    list,
    experimentalLirLocalCopyRewrite,
    requireNoRegressionInExperimentalLocalCopyRewrite,
  }
}

function main(): void {
  const args = parseProbeCliArgs(process.argv.slice(2))
  if (args.list) {
    for (const probe of ARITHMETIC_PROBES) {
      process.stdout.write(`${probe.name}\t${probe.description}\n`)
    }
    return
  }
  const report = runArithmeticProbeReport(
    args.caseName,
    args.optLevels,
    args.experimentalLirLocalCopyRewrite,
  )

  if (args.requireNoRegressionInExperimentalLocalCopyRewrite) {
    const noRegressionGate = evaluateExperimentalLocalCopyRewriteNoRegressionGate(
      report.experimentalLocalCopyRewriteComparison,
      report.offlineRewriteEquivalencePackSummary,
    )
    report.experimentalLocalCopyRewriteNoRegressionGate = noRegressionGate
    if (noRegressionGate.status !== 'pass') {
      throw new Error(`Experimental local-copy rewrite no-regression gate failed: ${noRegressionGate.failReasons.join('; ')}`)
    }
  }

  writeJsonReport(
    report,
    args.output,
  )
}

if (require.main === module) {
  main()
}
