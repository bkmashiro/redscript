import {
  ARITHMETIC_PROBES,
  buildLirOpportunitySummary,
  summarizeRewriteOpportunitiesWithProvenance,
  VIR_ARITHMETIC_DECISION_THRESHOLDS,
  buildVirArithmeticDecisionDashboard,
  summarizeDeltaSeries,
  mergeRejectionCategoryTotals,
  evaluateExperimentalLocalCopyRewriteNoRegressionGate,
  summarizeOfflineRewriteEquivalencePack,
  parseProbeCliArgs,
  type ArithmeticProbeResult,
  type ArithmeticProbeExperimentalLocalCopyRewriteComparison,
  type OfflineRewriteEquivalencePackSummary,
  type RewriteProvenanceSummary,
  type RewriteProofMissLirAdjacentWindowBreakdownKind,
  type RewriteProofMissLirAdjacentWindowSummary,
  type RewriteProofMissLirLocalTempProofGapReadinessSummary,
  type RewriteProofMissLirLocalTempProofWindowSummary,
  type RewriteProofMissSourceKind,
  type VirUnsupportedMirCallTarget,
  type VirUnsupportedMirCallTargetFamilyBreakdownEntry,
  type VirAllocationCheckCloseout,
  type VirDecisionModeTotals,
  type VirDecisionRejectionCategory,
  evaluateVirDecisionGoNoGoStatus,
  runArithmeticProbeReport,
  summarizeCommandCategories,
  summarizeCommandCosts,
} from '../../benchmarks/arithmetic-probes'
import { type VirUnsupportedReasonTag } from '../../src/optimizer/vir/lower/unsupported-tags'

const ZERO_REJECTION_CATEGORY_TOTALS = {
  planned_unsupported: 0,
  allocation_check_failed: 0,
  higher_cost: 0,
  direct_unsupported: 0,
  unsupported_both: 0,
}

function makeAdjacentWindowDiagnosticCase(options: {
  caseName: string
  totalCopies: number
  sourceKind?: RewriteProofMissSourceKind
  localTempProofGapReadinessSummary?: RewriteProofMissLirLocalTempProofGapReadinessSummary
  needsLivenessWindowCount?: number
  insufficientContextCount?: number
  localTempExactProofGapCases?: number
  protectedBoundaryBlockedCases?: number
  adjacentWindowMissingOrIncompleteCases?: number
  candidateShapeNotSatisfyingLirLocalProofCases?: number
  unknownUnparsedCommandCases?: number
  shortWindowProofSummary?: RewriteProofMissLirLocalTempProofWindowSummary
  family?: string
  byFamilySourceKind?: RewriteProofMissSourceKind
}): ArithmeticProbeResult {
  const family = options.family ?? 'arithmetic-copy-feeds-const-or-add-imm'
  const caseName = options.caseName
  const totalCopies = options.totalCopies
  const sourceKind = options.sourceKind ?? 'local-temp-only'
  const byFamilySourceKind = options.byFamilySourceKind ?? sourceKind
  const needsLivenessWindowCount = options.needsLivenessWindowCount ?? 0
  const insufficientContextCount = options.insufficientContextCount ?? 0
  const localTempExactProofGapCases = options.localTempExactProofGapCases ?? 0
  const protectedBoundaryBlockedCases = options.protectedBoundaryBlockedCases ?? 0
  const adjacentWindowMissingOrIncompleteCases = options.adjacentWindowMissingOrIncompleteCases ?? 0
  const candidateShapeNotSatisfyingLirLocalProofCases = options.candidateShapeNotSatisfyingLirLocalProofCases ?? 0
  const unknownUnparsedCommandCases = options.unknownUnparsedCommandCases ?? 0
  const totalCandidateLike = totalCopies
  const localTempProofGapReadinessSummary = options.localTempProofGapReadinessSummary
    ?? {
      byReadiness: localTempExactProofGapCases > 0
        ? [
          {
            readiness: 'unknown-local-temp-proof-gap',
            count: localTempExactProofGapCases,
            caseNames: [caseName],
            examples: [`${caseName}:1`],
          },
        ]
        : [],
      candidateCaseNames: localTempExactProofGapCases > 0 && sourceKind === 'local-temp-only' && byFamilySourceKind === 'local-temp-only'
        ? [caseName]
        : [],
      blockedOrUnknownCaseNames: localTempExactProofGapCases > 0 ? [caseName] : [],
      totalCandidateLike: localTempExactProofGapCases,
      candidateCount: 0,
      blockedOrUnknownCount: localTempExactProofGapCases,
      nextSafeDiagnosticGoals: ['Keep collecting structured adjacent-window evidence before enabling rewrite-test expansion.'],
    }
  const shortWindowProofSummary = options.shortWindowProofSummary
  const proofMissAdjacentWindowBreakdown = [] as RewriteProofMissLirAdjacentWindowSummary['proofMissAdjacentWindowBreakdown']
  if (localTempExactProofGapCases > 0) {
    proofMissAdjacentWindowBreakdown.push({
      kind: 'local-temp-exact-proof-gap',
      count: localTempExactProofGapCases,
      caseNames: [caseName],
      examples: [`${caseName}:1`],
    })
  }
  if (protectedBoundaryBlockedCases > 0) {
    proofMissAdjacentWindowBreakdown.push({
      kind: 'protected-boundary-blocked',
      count: protectedBoundaryBlockedCases,
      caseNames: [caseName],
      examples: [`${caseName}:2`],
    })
  }
  if (adjacentWindowMissingOrIncompleteCases > 0) {
    proofMissAdjacentWindowBreakdown.push({
      kind: 'adjacent-window-missing-or-incomplete',
      count: adjacentWindowMissingOrIncompleteCases,
      caseNames: [caseName],
      examples: [`${caseName}:3`],
    })
  }
  if (candidateShapeNotSatisfyingLirLocalProofCases > 0) {
    proofMissAdjacentWindowBreakdown.push({
      kind: 'candidate-shape-not-satisfying-lir-local-proof',
      count: candidateShapeNotSatisfyingLirLocalProofCases,
      caseNames: [caseName],
      examples: [`${caseName}:4`],
    })
  }
  if (unknownUnparsedCommandCases > 0) {
    proofMissAdjacentWindowBreakdown.push({
      kind: 'unknown-unparsed-command',
      count: unknownUnparsedCommandCases,
      caseNames: [caseName],
      examples: [`${caseName}:5`],
    })
  }

  if (proofMissAdjacentWindowBreakdown.length === 0) {
    proofMissAdjacentWindowBreakdown.push({
      kind: 'unknown-unparsed-command',
      count: 1,
      caseNames: [caseName],
      examples: [`${caseName}:1`],
    })
  }

  return makeSyntheticProbeResult('ok', {
    directCommandCount: totalCopies,
    plannedCommandCount: Math.max(totalCopies - 1, 0),
    directScoreCopyCount: totalCopies,
    plannedScoreCopyCount: Math.max(totalCopies - 1, 0),
    caseName,
    rewriteOpportunities: {
      total: totalCopies,
      currentlyOptimized: 0,
      safeCandidate: 0,
      blockedByBarrier: 0,
      unknown: totalCopies,
      topOpportunities: [
        {
          status: 'unknown',
          pattern: `${family} -> arithmetic-chain`,
          count: totalCopies,
          examples: [`${caseName}:1`],
        },
      ],
    },
    rewriteProvenanceSummary: {
      total: totalCopies,
      byReason: [
        {
          reason: 'blocked-by-pattern-not-exact-adjacent-score-copy-arith',
          count: totalCopies,
          caseNames: [caseName],
          examples: [`${caseName}:1`],
        },
      ],
      safeAdjacentScoreCopyArithCount: 0,
      blockedCount: totalCopies,
      insufficientInfoCount: 0,
      unknownCount: 0,
      requiresLirLevelAnalysis: true,
      shapeFamilySummary: {
        totalPatternNotExactCount: totalCopies,
        families: [
          {
            family,
            count: totalCopies,
            caseNames: [caseName],
            examples: [`${caseName}:1`],
            likelyNextAction: 'local-canonicalization',
            requiresLirLevelAnalysis: false,
          },
        ],
        topRecoverableFamilies: [family],
        recommendation: 'synthetic-adjacent-window-case',
        proofMissSummary: {
          total: totalCopies,
          byFamily: [
            {
              family,
              total: totalCopies,
              caseNames: [caseName],
              byReason: [
                {
                  reason: 'no-exact-lir-local-proof',
                  count: Math.min(totalCopies, localTempExactProofGapCases + candidateShapeNotSatisfyingLirLocalProofCases + 1),
                  caseNames: [caseName],
                  examples: [`${caseName}:1`],
                },
              ],
              suggestedNextAction: 'lir-safety-analysis',
            },
          ],
          topActionableFamilies: [family],
          recommendation: 'synthetic adjacent-window focus',
          slotProvenanceSummary: {
            total: totalCopies,
            byFamily: [
              {
                family,
                total: totalCopies,
                slotRoles: [
                  {
                    role: 'local-temp',
                    count: totalCopies,
                    examples: [`${caseName}:1`],
                    caseNames: [],
                  },
                ],
                sourceKinds: [
                  {
                    sourceKind: byFamilySourceKind,
                    count: totalCopies,
                    examples: [`${caseName}:1`],
                    caseNames: [],
                  },
                ],
                recommendation: 'collect structured-window context',
              },
            ],
            dominantBlockers: [
              {
                blocker: byFamilySourceKind,
                count: totalCopies,
              },
            ],
            recommendation: 'collect structured-window context',
            localProofEvidenceSummary: {
              totalLocalTempOnly: Math.min(totalCopies, localTempExactProofGapCases + adjacentWindowMissingOrIncompleteCases),
              byFamily: [
                {
                  family,
                  totalLocalTempOnly: Math.min(totalCopies, localTempExactProofGapCases + adjacentWindowMissingOrIncompleteCases),
                  evidenceKinds: [
                    {
                      evidenceKind: 'adjacent-arith-source-reused',
                      count: Math.min(totalCopies, localTempExactProofGapCases + adjacentWindowMissingOrIncompleteCases),
                      caseNames: [caseName],
                      examples: [`${caseName}:1`],
                    },
                  ],
                  proofReadiness: 'candidate-after-liveness-window',
                    recommendation: 'collect structured-window context',
                    candidateCount: Math.min(totalCopies, localTempExactProofGapCases + adjacentWindowMissingOrIncompleteCases),
                    needsLivenessWindowCount,
                    insufficientContextCount,
                    lirAdjacentWindowSummary: {
                      proofMissAdjacentWindowBreakdown,
                    unknownUnparsedCommandCases: unknownUnparsedCommandCases,
                    localTempExactProofGapCases: localTempExactProofGapCases,
                    protectedBoundaryBlockedCases: protectedBoundaryBlockedCases,
                    adjacentWindowMissingOrIncompleteCases: adjacentWindowMissingOrIncompleteCases,
                        candidateShapeNotSatisfyingLirLocalProofCases: candidateShapeNotSatisfyingLirLocalProofCases,
                        totalCandidateLike,
                        localTempProofGapReadinessSummary,
                        proofReadiness: 'unknown',
                        nextSafeDiagnosticGoals: [],
                        recommendation: 'synthetic adjacent-window probe',
                        shortWindowProofSummary,
                      },
                    },
              ],
              candidateCount: totalCopies,
              needsLivenessWindowCount,
              insufficientContextCount,
              recommendation: 'collect structured-window context',
            },
          },
        },
      },
    },
  })
}

  function makeSyntheticProbeResult(
  status: 'ok' | 'unsupported',
 values: {
    directCommandCount: number
    plannedCommandCount: number
    directScoreCopyCount: number
    plannedScoreCopyCount: number
    acceptedFunctionCount?: number
    rejectedFunctionCount?: number
    unsupportedFunctionCount?: number
    rejectionCategoryCounts?: Partial<typeof ZERO_REJECTION_CATEGORY_TOTALS>
    semanticProofStatus?: 'proven' | 'unproven' | 'unsupported'
  rejectionCategory?: VirDecisionRejectionCategory
  modeTotals?: VirDecisionModeTotals
  unsupportedMirOpKinds?: string[]
  unsupportedMirCallTargets?: VirUnsupportedMirCallTarget[]
  unsupportedReasonTags?: VirUnsupportedReasonTag[]
  unsupportedReason?: string
  rewriteOpportunities?: Partial<ArithmeticProbeResult['rewriteOpportunities']>
  rewriteProvenanceSummary?: RewriteProvenanceSummary
  caseName?: string
  coverageCategory?: 'controlled' | 'broad'
  },
): ArithmeticProbeResult {
  const rewrite = values.rewriteOpportunities ?? {}
  const modeTotals = values.modeTotals ?? {
    acceptedPlanned: status === 'ok' ? 1 : 0,
    acceptedDirect: status === 'ok' ? 0 : 0,
    rejectedDirect: 0,
  }

  return {
    case: values.caseName ?? 'synthetic',
    description: 'synthetic',
    optLevel: 'O1',
    stdlibModules: [],
    coverageCategory: values.coverageCategory ?? 'broad',
    timingsMs: {
      parse: 0,
      hir: 0,
      mir: 0,
      emit: 0,
      total: 0,
    },
    files: {
      fileCount: 1,
      mcfunctionFileCount: 1,
      instructionCount: 0,
      totalBytes: 0,
      mcfunctionBytes: 0,
    },
    commands: {
      total: 0,
      scoreboard: 0,
      scoreCopy: 0,
      execute: 0,
      data: 0,
      functionCall: 0,
      storage: 0,
      selector: 0,
      summon: 0,
      teleport: 0,
      macro: 0,
      rawCommandLike: 0,
    },
    estimatedCost: {
      forks: {
        executeAs: 0,
        executeAsEntity: 0,
        executeAsPlayer: 0,
        executeAsBroad: 0,
        runFunctionInsideExecuteAs: 0,
        estimatedForkUnits: 0,
      },
      selector: {
        mentions: 0,
        broadMentions: 0,
        broadRiskRatio: 0,
        broadRiskLevel: 'none',
      },
      nbt: {
        scalarReads: 0,
        wholeListCopies: 0,
      },
      macro: {
        commandCount: 0,
        withStorageCalls: 0,
      },
      setupHints: {
        entitySetupCommands: 0,
        displaySetupCommands: 0,
        entityTypes: [],
        entityTags: [],
        hasTransformationReads: false,
      },
      note: 'static-estimate',
    },
    copyOrigins: {
      twoAddressMaterialization: 0,
      callArg: 0,
      callResultPreservation: 0,
      returnMaterialization: 0,
      edgeOrWrapper: 0,
      opaqueBarrier: 0,
      unknown: 0,
    },
    scoreCopyPatterns: {
      total: 0,
      topPatterns: [],
    },
    rewriteOpportunities: {
      total: rewrite.total ?? 0,
      currentlyOptimized: rewrite.currentlyOptimized ?? 0,
      safeCandidate: rewrite.safeCandidate ?? 0,
      blockedByBarrier: rewrite.blockedByBarrier ?? 0,
      unknown: rewrite.unknown ?? 0,
      topOpportunities: rewrite.topOpportunities ?? [],
      provenanceSummary: values.rewriteProvenanceSummary,
    },
    virDecision: {
      status,
      selectedMode: 'direct',
      directCommandCount: values.directCommandCount,
      plannedCommandCount: values.plannedCommandCount,
      directScoreCopyCount: values.directScoreCopyCount,
      plannedScoreCopyCount: values.plannedScoreCopyCount,
      acceptedFunctionCount: values.acceptedFunctionCount ?? 0,
      rejectedFunctionCount: values.rejectedFunctionCount ?? 0,
      unsupportedFunctionCount: values.unsupportedFunctionCount ?? 0,
      rejectionCategoryCounts: {
        ...ZERO_REJECTION_CATEGORY_TOTALS,
        ...(values.rejectionCategoryCounts ?? {}),
      },
      semanticProofStatus: values.semanticProofStatus ?? (status === 'ok' ? 'unproven' : 'unsupported'),
      rejectionCategory: values.rejectionCategory,
      modeTotals,
      unsupportedReason: values.unsupportedReason ?? (status === 'unsupported' ? 'synthetic unsupported' : undefined),
      unsupportedMirOpKinds: values.unsupportedMirOpKinds,
      commandDelta: values.plannedCommandCount - values.directCommandCount,
      scoreCopyDelta: values.plannedScoreCopyCount - values.directScoreCopyCount,
      unsupportedReasonTags: values.unsupportedReasonTags ?? [],
      unsupportedMirCallTargets: values.unsupportedMirCallTargets,
    },
    warnings: [],
  } as ArithmeticProbeResult
}

function makeOfflineRewriteEquivalencePackSummary(
  overrides: Partial<OfflineRewriteEquivalencePackSummary> = {},
): OfflineRewriteEquivalencePackSummary {
  return {
    status: 'pass',
    totalFixtures: 2,
    equivalentFixtures: 2,
    counterexampleFixtures: 0,
    unsupportedFixtures: 0,
    failedFixtures: 0,
    familySummaries: [
      {
        family: 'local-copy-forwarding',
        totalFixtures: 2,
        equivalentFixtures: 2,
        counterexampleFixtures: 0,
        unsupportedFixtures: 0,
        failedFixtures: 0,
      },
    ],
    evidenceStatus: 'bounded-offline-evidence-only',
    ...overrides,
  }
}

const SYNTHETIC_NO_REGRESSION_COMPARISON: ArithmeticProbeExperimentalLocalCopyRewriteComparison = {
  mode: 'experimental-local-copy-rewrite',
  status: 'experimental',
  enabled: true,
  off: { caseCount: 2, commandTotal: 20, scoreCopyTotal: 8 },
  on: { caseCount: 2, commandTotal: 16, scoreCopyTotal: 4 },
  commandDelta: -4,
  scoreCopyDelta: -4,
  commandDeltaSummary: {
    min: 0,
    max: 0,
    total: -4,
    average: -2,
    improvedCount: 2,
    regressedCount: 0,
    unchangedCount: 0,
  },
  scoreCopyDeltaSummary: {
    min: 0,
    max: 0,
    total: -4,
    average: -2,
    improvedCount: 2,
    regressedCount: 0,
    unchangedCount: 0,
  },
  perCaseDeltas: [
    {
      caseName: 'case-a',
      optLevel: 'O1',
      offCommandsTotal: 10,
      onCommandsTotal: 8,
      commandDelta: -2,
      offScoreCopyTotal: 4,
      onScoreCopyTotal: 2,
      scoreCopyDelta: -2,
    },
    {
      caseName: 'case-b',
      optLevel: 'O1',
      offCommandsTotal: 10,
      onCommandsTotal: 8,
      commandDelta: -2,
      offScoreCopyTotal: 4,
      onScoreCopyTotal: 2,
      scoreCopyDelta: -2,
    },
  ],
}

describe('arithmetic probe benchmark tooling', () => {
  it('lists stable named arithmetic probes', () => {
    const names = ARITHMETIC_PROBES.map(probe => probe.name)
    expect(names).toContain('int_arithmetic')
    expect(names).toContain('int_add_sub_mul')
    expect(names).toContain('int_div_mod_mix')
    expect(names).toContain('int_const_var_mix')
    expect(names).toContain('int_temp_heavy')
    expect(names).toContain('branched_arithmetic')
    expect(names).toContain('fixed_mul_div')
    expect(names).toContain('double_div')
    expect(names).toContain('sin_cos_hp_separate')
  })

  it('keeps benchmark mode flag-off by default', () => {
    const report = runArithmeticProbeReport('int_arithmetic', [1])
    expect(report.experimentalLocalCopyRewriteComparison).toBeUndefined()
  })

  it('requires explicit experimental local-copy rewrite flag to use the no-regression gate', () => {
    expect(() => parseProbeCliArgs([
      '--require-experimental-lir-local-copy-no-regressions',
      '--case',
      'int_arithmetic',
    ])).toThrow(/requires --experimental-lir-local-copy-rewrite/)
  })

  it('fails when the no-regression gate is missing the experimental comparison', () => {
    const gate = evaluateExperimentalLocalCopyRewriteNoRegressionGate(undefined)
    expect(gate.status).toBe('fail')
    expect(gate.failReasons).toEqual([
      'Missing experimentalLocalCopyRewriteComparison',
    ])
  })

  it('summarizes offline rewrite equivalence pack fixtures with deterministic family order', () => {
    const packSummary = summarizeOfflineRewriteEquivalencePack({
      totals: {
        total: 4,
        equivalent: 2,
        counterexample: 1,
        unsupported: 1,
        failed: 0,
      },
      familySummaries: [
        {
          family: 'copy-feeds-copy-chain',
          total: 2,
          equivalent: 2,
          counterexample: 0,
          unsupported: 0,
          failed: 0,
        },
        {
          family: 'local-copy-forwarding',
          total: 2,
          equivalent: 0,
          counterexample: 1,
          unsupported: 1,
          failed: 0,
        },
      ],
      failedFixtureNames: ['counterexample-failed'],
    })

    expect(packSummary.status).toBe('pass')
    expect(packSummary.totalFixtures).toBe(4)
    expect(packSummary.failedFixtures).toBe(0)
    expect(packSummary.evidenceStatus).toBe('bounded-offline-evidence-only')
    expect(packSummary.familySummaries.map(item => item.family)).toEqual([
      'copy-feeds-copy-chain',
      'local-copy-forwarding',
    ])
  })

  it('caps failed offline rewrite equivalence fixture names deterministically', () => {
    const packSummary = summarizeOfflineRewriteEquivalencePack({
      totals: {
        total: 6,
        equivalent: 0,
        counterexample: 0,
        unsupported: 0,
        failed: 6,
      },
      familySummaries: [
        {
          family: 'local-copy-forwarding',
          total: 6,
          equivalent: 0,
          counterexample: 0,
          unsupported: 0,
          failed: 6,
        },
      ],
      failedFixtureNames: [
        'fixture-1',
        'fixture-2',
        'fixture-3',
        'fixture-4',
        'fixture-5',
        'fixture-6',
      ],
    })

    expect(packSummary.status).toBe('fail')
    expect(packSummary.failedFixtureNames).toEqual([
      'fixture-1',
      'fixture-2',
      'fixture-3',
      'fixture-4',
      'fixture-5',
    ])
  })

  it('fails the no-regression gate when offline rewrite equivalence pack fails', () => {
    const failingOfflinePackSummary = makeOfflineRewriteEquivalencePackSummary({
      totalFixtures: 2,
      equivalentFixtures: 0,
      counterexampleFixtures: 0,
      unsupportedFixtures: 0,
      failedFixtures: 1,
      failedFixtureNames: ['equiv_fail:counterexample-shape'],
      familySummaries: [
        {
          family: 'local-copy-forwarding',
          totalFixtures: 2,
          equivalentFixtures: 0,
          counterexampleFixtures: 0,
          unsupportedFixtures: 0,
          failedFixtures: 1,
        },
      ],
      status: 'fail',
    })
    const gate = evaluateExperimentalLocalCopyRewriteNoRegressionGate(
      SYNTHETIC_NO_REGRESSION_COMPARISON,
      failingOfflinePackSummary,
    )
    expect(gate.status).toBe('fail')
    expect(gate.failReasons).toEqual([
      'offline rewrite equivalence pack did not pass: status=fail, failedFixtures=1',
      'offline rewrite equivalence pack failed fixture names: equiv_fail:counterexample-shape',
    ])
  })

  it('passes explicit no-regression gate for a synthetic non-regressing comparison', () => {
    const gate = evaluateExperimentalLocalCopyRewriteNoRegressionGate(
      SYNTHETIC_NO_REGRESSION_COMPARISON,
      makeOfflineRewriteEquivalencePackSummary(),
    )
    expect(gate.status).toBe('pass')
    expect(gate.failReasons).toHaveLength(0)
    expect(gate.mode).toBe('experimental-no-regression-evidence-only')
    expect(gate.rationale).toBe('benchmark-evidence-only-no-production')
  })

  it('detects command and scoreCopy regressions in the no-regression gate', () => {
    const commandRegressionComparison: ArithmeticProbeExperimentalLocalCopyRewriteComparison = {
      mode: 'experimental-local-copy-rewrite',
      status: 'experimental',
      enabled: true,
      off: { caseCount: 1, commandTotal: 5, scoreCopyTotal: 3 },
      on: { caseCount: 1, commandTotal: 7, scoreCopyTotal: 4 },
      commandDelta: 2,
      scoreCopyDelta: 1,
      commandDeltaSummary: {
        min: 2,
        max: 2,
        total: 2,
        average: 2,
        improvedCount: 0,
        regressedCount: 1,
        unchangedCount: 0,
      },
      scoreCopyDeltaSummary: {
        min: 1,
        max: 1,
        total: 1,
        average: 1,
        improvedCount: 0,
        regressedCount: 1,
        unchangedCount: 0,
      },
      perCaseDeltas: [
        {
          caseName: 'case-a',
          optLevel: 'O1',
          offCommandsTotal: 5,
          onCommandsTotal: 7,
          commandDelta: 2,
          offScoreCopyTotal: 3,
          onScoreCopyTotal: 4,
          scoreCopyDelta: 1,
        },
      ],
    }

    const commandGate = evaluateExperimentalLocalCopyRewriteNoRegressionGate(
      commandRegressionComparison,
      makeOfflineRewriteEquivalencePackSummary(),
    )
    expect(commandGate.status).toBe('fail')
    expect(commandGate.failReasons).toEqual([
      'command regressions detected in summary: 1',
      'scoreCopy regressions detected in summary: 1',
      'command regressions detected in per-case deltas: 1',
      'scoreCopy regressions detected in per-case deltas: 1',
      'aggregate command delta regression: 2',
      'aggregate scoreCopy delta regression: 1',
    ])

    const perCaseOnlyRegressionComparison: ArithmeticProbeExperimentalLocalCopyRewriteComparison = {
      ...commandRegressionComparison,
      commandDelta: 0,
      scoreCopyDelta: 0,
      commandDeltaSummary: {
        ...commandRegressionComparison.commandDeltaSummary,
        regressedCount: 0,
      },
      scoreCopyDeltaSummary: {
        ...commandRegressionComparison.scoreCopyDeltaSummary,
        regressedCount: 0,
      },
    }
    const perCaseGate = evaluateExperimentalLocalCopyRewriteNoRegressionGate(
      perCaseOnlyRegressionComparison,
      makeOfflineRewriteEquivalencePackSummary(),
    )
    expect(perCaseGate.status).toBe('fail')
    expect(perCaseGate.failReasons).toEqual([
      'command regressions detected in per-case deltas: 1',
      'scoreCopy regressions detected in per-case deltas: 1',
    ])

    const caseMismatchComparison: ArithmeticProbeExperimentalLocalCopyRewriteComparison = {
      ...commandRegressionComparison,
      on: { ...commandRegressionComparison.on, caseCount: 2 },
    }
    const mismatchGate = evaluateExperimentalLocalCopyRewriteNoRegressionGate(
      caseMismatchComparison,
      makeOfflineRewriteEquivalencePackSummary(),
    )
    expect(mismatchGate.status).toBe('fail')
    expect(mismatchGate.failReasons).toContain('off/on case count mismatch: off=1, on=2')
  })

  it('adds deterministic offline rewrite equivalence pack summary to experimental local-copy reports', () => {
    const report = runArithmeticProbeReport('int_arithmetic', [1], true)
    const summary = report.offlineRewriteEquivalencePackSummary

    expect(summary).toBeDefined()
    expect(summary?.status).toBe('pass')
    expect(summary?.failedFixtures).toBe(0)
    expect(summary?.totalFixtures).toBe(29)
    expect(summary?.evidenceStatus).toBe('bounded-offline-evidence-only')
    expect(summary?.familySummaries.map(item => item.family)).toEqual([
      'local-copy-forwarding',
      'observed-temp-counterexample',
      'observed-temp-safety',
      'predecessor-arithmetic',
      'read-write-window',
      'return-path',
      'unsupported-boundary',
      'score-swap-window',
      'score-set-overwrite-window',
      'unsupported-typed-boundary',
    ])
  })

  it('runs experimental local-copy rewrite probes deterministically with explicit comparison totals', () => {
    const off = runArithmeticProbeReport('int_arithmetic', [1], false)
    const on = runArithmeticProbeReport('int_arithmetic', [1], true)
    const comparison = on.experimentalLocalCopyRewriteComparison
    expect(comparison).toBeDefined()
    expect(comparison?.mode).toBe('experimental-local-copy-rewrite')
    expect(comparison?.status).toBe('experimental')
    expect(comparison?.enabled).toBe(true)
    expect(comparison?.off.caseCount).toBe(1)
    expect(comparison?.on.caseCount).toBe(1)
    expect(comparison?.perCaseDeltas).toHaveLength(1)

    const delta = comparison?.perCaseDeltas[0]
    const [offCase] = off.cases
    const [onCase] = on.cases
    expect(delta?.caseName).toBe(onCase.case)
    expect(delta?.optLevel).toBe(onCase.optLevel)
    expect(delta?.offCommandsTotal).toBe(offCase.commands.total)
    expect(delta?.onCommandsTotal).toBe(onCase.commands.total)
    expect(delta?.offScoreCopyTotal).toBe(offCase.commands.scoreCopy)
    expect(delta?.onScoreCopyTotal).toBe(onCase.commands.scoreCopy)
    expect(delta?.commandDelta).toBe(onCase.commands.total - offCase.commands.total)
    expect(delta?.scoreCopyDelta).toBe(onCase.commands.scoreCopy - offCase.commands.scoreCopy)
    expect(comparison?.commandDelta).toBe(delta?.commandDelta ?? 0)
    expect(comparison?.scoreCopyDelta).toBe(delta?.scoreCopyDelta ?? 0)
    expect(comparison?.off.caseCount).toBe(1)
    expect(comparison?.on.caseCount).toBe(1)
    expect(comparison?.off.commandTotal).toBe(offCase.commands.total)
    expect(comparison?.on.commandTotal).toBe(onCase.commands.total)
  })

  it('preserves requested optimization levels in experimental comparison mode', () => {
    const probe = ARITHMETIC_PROBES.find(item => item.name === 'int_add_sub_mul')
    if (!probe) throw new Error('Missing int_add_sub_mul probe fixture')
    const report = runArithmeticProbeReport(probe.name, [0, 1, 2], true)
    expect(report.cases.map(item => item.optLevel)).toEqual(['O0', 'O1', 'O2'])
    expect(report.experimentalLocalCopyRewriteComparison?.perCaseDeltas.map(item => item.optLevel)).toEqual(['O0', 'O1', 'O2'])
    expect(report.experimentalLocalCopyRewriteComparison?.off.caseCount).toBe(3)
    expect(report.experimentalLocalCopyRewriteComparison?.on.caseCount).toBe(3)
  })

  it('tracks controlled corpus coverage in dashboard metadata', () => {
    const report = runArithmeticProbeReport('all', [1])
    const summary = report.virDecisionDashboard.corpusCoverageSummary
    expect(summary.totalCaseCount).toBe(report.cases.length)
    expect(summary.controlledCaseCount).toBeGreaterThan(0)
    expect(summary.broadCaseCount).toBeGreaterThan(0)
    expect(summary.controlledProbeNames).toEqual(expect.arrayContaining([
      'int_add_sub_mul',
      'int_div_mod_mix',
      'int_const_var_mix',
      'int_temp_heavy',
      'branched_arithmetic',
    ]))
    expect(summary.broadProbeNames).toContain('double_div')
  })

  it('compiles a selected probe and reports command categories', () => {
    const report = runArithmeticProbeReport('int_arithmetic', [1])
    expect(report.benchmark).toBe('arithmetic-probes')
    expect(report.cases).toHaveLength(1)
    const [result] = report.cases
    expect(result.case).toBe('int_arithmetic')
    expect(result.optLevel).toBe('O1')
    expect(result.files.mcfunctionFileCount).toBeGreaterThan(0)
    expect(result.commands.total).toBeGreaterThan(0)
    expect(result.commands.scoreboard).toBe(result.commands.total)
    expect(result.commands.execute).toBe(0)
    expect(result.estimatedCost.forks.estimatedForkUnits).toBeGreaterThanOrEqual(0)
    expect(result.estimatedCost.selector.broadRiskLevel).toBe('none')
  })

  it('categorizes macro, execute, storage, selector, and teleport commands', () => {
    const summary = summarizeCommandCategories([
      {
        path: 'data/test/function/probe.mcfunction',
        content: [
          'scoreboard players operation $tmp obj = $src obj',
          'scoreboard players operation $a obj += $b obj',
          'execute as @e[tag=rs_div,limit=1] run tp @s ^ ^ ^1',
          '$execute store result storage rs:d __dp0 double $(scale) run data get storage rs:d __dp0 10000',
          'function test:helper with storage rs:math args',
          'summon marker 0 0 0 {Tags:["rs_trig"]}',
        ].join('\n'),
      },
    ])

    expect(summary.total).toBe(6)
    expect(summary.scoreboard).toBe(2)
    expect(summary.scoreCopy).toBe(1)
    expect(summary.execute).toBe(2)
    expect(summary.data).toBe(1)
    expect(summary.functionCall).toBe(1)
    expect(summary.storage).toBe(2)
    expect(summary.selector).toBe(1)
    expect(summary.teleport).toBe(1)
    expect(summary.macro).toBe(1)
    expect(summary.summon).toBe(1)
  })

  it('summarizes adjacent score copy patterns for optimizer triage', () => {
    const report = runArithmeticProbeReport('int_arithmetic', [1])
    const [result] = report.cases

    expect(result.scoreCopyPatterns.total).toBe(result.commands.scoreCopy)
    expect(report.scoreCopyPatterns.total).toBe(result.commands.scoreCopy)
    expect(result.scoreCopyPatterns.topPatterns.length).toBeGreaterThan(0)
    expect(result.scoreCopyPatterns.topPatterns[0]).toEqual(
      expect.objectContaining({
        pattern: expect.any(String),
        count: expect.any(Number),
        examples: expect.any(Array),
      }),
    )
  })

  it('reports copy origins buckets that account for every score-copy command', () => {
    const result = runArithmeticProbeReport('int_arithmetic', [1])
    const [probeResult] = result.cases

    const originTotal = Object.values(probeResult.copyOrigins).reduce((sum, value) => sum + value, 0)
    expect(originTotal).toBe(probeResult.commands.scoreCopy)
    for (const value of Object.values(probeResult.copyOrigins)) {
      expect(value).toBeGreaterThanOrEqual(0)
    }
  })

  it('aggregates copy-origin summaries across probe cases', () => {
    const report = runArithmeticProbeReport('all', [1])
    const caseTotal = report.cases.reduce((sum, result) => sum + result.commands.scoreCopy, 0)
    const originTotal = report.copyOrigins
      ? Object.values(report.copyOrigins).reduce((sum, value) => sum + value, 0)
      : 0

    expect(originTotal).toBe(caseTotal)
  })

  it('aggregates score copy pattern totals across probe cases', () => {
    const report = runArithmeticProbeReport('all', [1])
    const caseTotal = report.cases.reduce((sum, result) => sum + result.scoreCopyPatterns.total, 0)
    const commandTotal = report.cases.reduce((sum, result) => sum + result.commands.scoreCopy, 0)

    expect(report.scoreCopyPatterns.total).toBe(caseTotal)
    expect(report.scoreCopyPatterns.total).toBe(commandTotal)
    for (const pattern of report.scoreCopyPatterns.topPatterns) {
      expect(pattern.examples.length).toBeLessThanOrEqual(3)
    }
  })

  it('reports per-case rewrite-opportunity statuses that cover all score-copy commands', () => {
    const result = runArithmeticProbeReport('int_arithmetic', [1])
    const [probeResult] = result.cases

    expect(probeResult.rewriteOpportunities.total).toBe(probeResult.commands.scoreCopy)
    expect(probeResult.rewriteOpportunities.currentlyOptimized).toBeGreaterThanOrEqual(0)
    expect(probeResult.rewriteOpportunities.safeCandidate).toBeGreaterThanOrEqual(0)
    expect(probeResult.rewriteOpportunities.blockedByBarrier).toBeGreaterThanOrEqual(0)
    expect(probeResult.rewriteOpportunities.unknown).toBeGreaterThanOrEqual(0)

    const opportunitiesTotal = probeResult.rewriteOpportunities.currentlyOptimized
      + probeResult.rewriteOpportunities.safeCandidate
      + probeResult.rewriteOpportunities.blockedByBarrier
      + probeResult.rewriteOpportunities.unknown
    expect(opportunitiesTotal).toBe(probeResult.rewriteOpportunities.total)
    expect(probeResult.rewriteOpportunities.topOpportunities.length).toBeGreaterThan(0)
  })

  it('aggregates rewrite-opportunity statuses across all cases', () => {
    const report = runArithmeticProbeReport('all', [1])
    const caseTotal = report.cases.reduce((sum, result) => sum + result.rewriteOpportunities.total, 0)
    const opportunitiesTotal = report.rewriteOpportunities
      ? report.rewriteOpportunities.currentlyOptimized
      + report.rewriteOpportunities.safeCandidate
      + report.rewriteOpportunities.blockedByBarrier
      + report.rewriteOpportunities.unknown
      : 0

    expect(caseTotal).toBe(opportunitiesTotal)
    expect(report.rewriteOpportunities.topOpportunities.length).toBeGreaterThan(0)
  })

  it('builds a deterministic aggregate LIR opportunity summary across cases', () => {
    const report = runArithmeticProbeReport('all', [1])
    const summary = report.lirOpportunitySummary
    const byCaseRewriteTotal = report.cases.reduce((sum, result) => sum + result.rewriteOpportunities.total, 0)
    const byCaseScoreCopyTotal = report.cases.reduce((sum, result) => sum + result.commands.scoreCopy, 0)
    const summaryStatusTotal = summary!.byStatus.currentlyOptimized
      + summary!.byStatus.safeCandidate
      + summary!.byStatus.blockedByBarrier
      + summary!.byStatus.unknown

    expect(summary).toBeDefined()
    expect(summary!.totalScoreCopyCount).toBe(byCaseRewriteTotal)
    expect(summary!.totalScoreCopyCount).toBe(byCaseScoreCopyTotal)
    expect(summary!.byStatus.currentlyOptimized).toBe(report.rewriteOpportunities.currentlyOptimized)
    expect(summary!.byStatus.safeCandidate).toBe(report.rewriteOpportunities.safeCandidate)
    expect(summary!.byStatus.blockedByBarrier).toBe(report.rewriteOpportunities.blockedByBarrier)
    expect(summary!.byStatus.unknown).toBe(report.rewriteOpportunities.unknown)
    expect(summaryStatusTotal).toBe(summary!.totalScoreCopyCount)
    for (const pattern of summary!.topPatterns) {
      expect(pattern.caseNames).toEqual([...pattern.caseNames].sort())
      expect(pattern.examples.length).toBeLessThanOrEqual(3)
    }
    expect(summary!.recommendation).toMatch(/^(diagnose-first|safe-local-rewrite-candidate|no-action)$/)
    expect(summary!.notes).toEqual(expect.any(String))
  })

  it('adds stable provenance buckets to aggregate LIR summaries', () => {
    const summary = runArithmeticProbeReport('all', [1]).lirOpportunitySummary
    expect(summary).toBeDefined()
    expect(summary!.provenanceSummary.total).toBe(summary!.totalScoreCopyCount)
    expect(summary!.provenanceSummary.byReason.length).toBeGreaterThan(0)
    expect(summary!.provenanceSummary.byReason).toEqual([
      ...summary!.provenanceSummary.byReason,
    ].sort(
      (left, right) => right.count - left.count || left.reason.localeCompare(right.reason),
    ))
    for (const entry of summary!.provenanceSummary.byReason) {
      expect(entry.caseNames).toEqual([...entry.caseNames].sort())
      expect(entry.examples.length).toBeLessThanOrEqual(3)
      expect(entry.count).toBeGreaterThan(0)
    }

    const provenanceTotal = summary!.provenanceSummary.safeAdjacentScoreCopyArithCount
      + summary!.provenanceSummary.blockedCount
      + summary!.provenanceSummary.unknownCount
    expect(provenanceTotal).toBe(summary!.provenanceSummary.total)
    expect(summary!.provenanceSummary.insufficientInfoCount).toBeLessThanOrEqual(
      summary!.provenanceSummary.unknownCount,
    )
  })

  it('adds targeted proof-miss family summaries for command-level diagnosis', () => {
    const summary = runArithmeticProbeReport('all', [1]).lirOpportunitySummary
    expect(summary).toBeDefined()
    expect(summary!.provenanceSummary.shapeFamilySummary?.proofMissSummary).toBeDefined()

    const proofMissSummary = summary!.provenanceSummary.shapeFamilySummary!.proofMissSummary
    if (!proofMissSummary) return

    const familiesOfInterest = ['arithmetic-copy-feeds-const-or-add-imm', 'copy-feeds-copy-chain']
    const proofMissFamiliesOfInterest = proofMissSummary.byFamily.filter(entry => familiesOfInterest.includes(entry.family))
    const totalOfInterest = proofMissFamiliesOfInterest.reduce((sum, family) => sum + family.total, 0)

    expect(proofMissSummary.total).toBe(totalOfInterest)
    expect(familiesOfInterest).toEqual(expect.arrayContaining(proofMissSummary.byFamily.map(item => item.family)))
    expect(proofMissSummary.byFamily).toEqual([...proofMissSummary.byFamily].sort(
      (left, right) => right.total - left.total || left.family.localeCompare(right.family),
    ))
    expect(proofMissSummary.topActionableFamilies.length).toBeLessThanOrEqual(3)

    const familyNames = proofMissSummary.byFamily.map(entry => entry.family)
    for (const family of familiesOfInterest) {
      expect(familyNames.includes(family)).toBe(true)
    }
  })

  it('tracks blocked-provenance buckets independently from safe-adjacent rewrite candidates', () => {
    const summary = buildLirOpportunitySummary([
      makeSyntheticProbeResult('ok', {
        directCommandCount: 5,
        plannedCommandCount: 3,
        directScoreCopyCount: 5,
        plannedScoreCopyCount: 3,
        caseName: 'safe_blocked_mix',
        rewriteOpportunities: {
          total: 5,
          currentlyOptimized: 1,
          safeCandidate: 2,
          blockedByBarrier: 1,
          unknown: 1,
          topOpportunities: [
            { status: 'currentlyOptimized', pattern: 'copy -> copy', count: 1, examples: ['safe_blocked_mix:1:copy'] },
            { status: 'safeCandidate', pattern: 'copy -> arithmetic', count: 2, examples: ['safe_blocked_mix:2:arith'] },
            { status: 'blockedByBarrier', pattern: 'barrier', count: 1, examples: ['safe_blocked_mix:3:barrier'] },
            { status: 'unknown', pattern: 'other', count: 1, examples: ['safe_blocked_mix:4:other'] },
          ],
        },
        rewriteProvenanceSummary: {
          total: 5,
          byReason: [
            {
              reason: 'safe-adjacent-score-copy-arith',
              count: 2,
              caseNames: ['safe_blocked_mix'],
              examples: ['safe_blocked_mix:2:arith'],
            },
            {
              reason: 'blocked-by-protected-slot',
              count: 1,
              caseNames: ['safe_blocked_mix'],
              examples: ['safe_blocked_mix:5:$__const_ protected'],
            },
            {
              reason: 'blocked-by-barrier-or-non-adjacent-shape',
              count: 1,
              caseNames: ['safe_blocked_mix'],
              examples: ['safe_blocked_mix:3:barrier'],
            },
            {
              reason: 'insufficient-command-level-information',
              count: 1,
              caseNames: ['safe_blocked_mix'],
              examples: ['safe_blocked_mix:4:other'],
            },
          ],
          safeAdjacentScoreCopyArithCount: 2,
          blockedCount: 2,
          insufficientInfoCount: 1,
          unknownCount: 1,
          requiresLirLevelAnalysis: true,
        },
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 4,
        plannedCommandCount: 2,
        directScoreCopyCount: 4,
        plannedScoreCopyCount: 2,
        caseName: 'alias_and_dead',
        rewriteOpportunities: {
          total: 4,
          currentlyOptimized: 0,
          safeCandidate: 0,
          blockedByBarrier: 0,
          unknown: 4,
          topOpportunities: [
            { status: 'unknown', pattern: 'alias', count: 2, examples: ['alias_and_dead:1'] },
            { status: 'unknown', pattern: 'not-dead', count: 1, examples: ['alias_and_dead:2'] },
            { status: 'unknown', pattern: 'cross-fn', count: 1, examples: ['alias_and_dead:3'] },
          ],
        },
        rewriteProvenanceSummary: {
          total: 4,
          byReason: [
            {
              reason: 'blocked-by-alias-safety',
              count: 2,
              caseNames: ['alias_and_dead'],
              examples: ['alias_and_dead:1'],
            },
            {
              reason: 'blocked-by-temp-not-dead-after-consuming-op',
              count: 1,
              caseNames: ['alias_and_dead'],
              examples: ['alias_and_dead:2'],
            },
            {
              reason: 'blocked-by-cross-function-module-external-mention',
              count: 1,
              caseNames: ['alias_and_dead'],
              examples: ['alias_and_dead:3'],
            },
          ],
          safeAdjacentScoreCopyArithCount: 0,
          blockedCount: 3,
          insufficientInfoCount: 0,
          unknownCount: 0,
          requiresLirLevelAnalysis: true,
        },
      }),
    ])

    expect(summary.provenanceSummary.total).toBe(9)
    expect(summary.provenanceSummary.safeAdjacentScoreCopyArithCount).toBe(2)
    expect(summary.provenanceSummary.blockedCount).toBe(5)
    expect(summary.provenanceSummary.unknownCount).toBe(1)

    const aliasReason = summary.provenanceSummary.byReason.find(item => item.reason === 'blocked-by-alias-safety')
    const deadReason = summary.provenanceSummary.byReason.find(item => item.reason === 'blocked-by-temp-not-dead-after-consuming-op')
    const protectedReason = summary.provenanceSummary.byReason.find(item => item.reason === 'blocked-by-protected-slot')
    expect(aliasReason?.count).toBe(2)
    expect(deadReason?.count).toBe(1)
    expect(protectedReason?.count).toBe(1)
    expect(aliasReason?.caseNames).toEqual(['alias_and_dead'])
    expect(summary.provenanceSummary.unknownCount).toBe(1)
    expect(summary.provenanceSummary.byReason.find(item => item.reason === 'insufficient-command-level-information')?.count).toBe(1)
    expect(summary.provenanceSummary.blockedCount).toBe(5)
  })

  it('merges proof-miss summaries deterministically across synthetic cases', () => {
    const summary = buildLirOpportunitySummary([
      makeSyntheticProbeResult('ok', {
        directCommandCount: 6,
        plannedCommandCount: 4,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 2,
        caseName: 'proof_case_alpha',
        rewriteOpportunities: {
          total: 3,
          currentlyOptimized: 0,
          safeCandidate: 0,
          blockedByBarrier: 0,
          unknown: 3,
          topOpportunities: [],
        },
        rewriteProvenanceSummary: {
          total: 3,
          byReason: [
            {
              reason: 'blocked-by-pattern-not-exact-adjacent-score-copy-arith',
              count: 2,
              caseNames: ['proof_case_alpha'],
              examples: ['proof_case_alpha:1'],
            },
            {
              reason: 'blocked-by-protected-slot',
              count: 1,
              caseNames: ['proof_case_alpha'],
              examples: ['proof_case_alpha:2'],
            },
          ],
          safeAdjacentScoreCopyArithCount: 0,
          blockedCount: 3,
          insufficientInfoCount: 0,
          unknownCount: 0,
          requiresLirLevelAnalysis: true,
          shapeFamilySummary: {
            totalPatternNotExactCount: 3,
            families: [
              {
                family: 'arithmetic-copy-feeds-const-or-add-imm',
                count: 2,
                caseNames: ['proof_case_alpha'],
                examples: ['proof_case_alpha:1'],
                likelyNextAction: 'local-canonicalization',
                requiresLirLevelAnalysis: false,
              },
            ],
            topRecoverableFamilies: ['arithmetic-copy-feeds-const-or-add-imm'],
            recommendation: 'test-only',
            proofMissSummary: {
              total: 2,
              byFamily: [
                {
                  family: 'arithmetic-copy-feeds-const-or-add-imm',
                  total: 2,
                  caseNames: ['proof_case_alpha'],
                  byReason: [
                    {
                      reason: 'no-exact-lir-local-proof',
                      count: 2,
                      caseNames: ['proof_case_alpha'],
                      examples: ['proof_case_alpha:1'],
                    },
                  ],
                  suggestedNextAction: 'rewrite-test-candidate',
                },
              ],
              topActionableFamilies: ['arithmetic-copy-feeds-const-or-add-imm'],
              recommendation: 'proof case',
            },
          },
        },
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 4,
        plannedCommandCount: 2,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 2,
        caseName: 'proof_case_beta',
        rewriteOpportunities: {
          total: 3,
          currentlyOptimized: 0,
          safeCandidate: 0,
          blockedByBarrier: 0,
          unknown: 3,
          topOpportunities: [],
        },
        rewriteProvenanceSummary: {
          total: 3,
          byReason: [
            {
              reason: 'blocked-by-pattern-not-exact-adjacent-score-copy-arith',
              count: 1,
              caseNames: ['proof_case_beta'],
              examples: ['proof_case_beta:1'],
            },
            {
              reason: 'blocked-by-barrier-or-non-adjacent-shape',
              count: 2,
              caseNames: ['proof_case_beta'],
              examples: ['proof_case_beta:2', 'proof_case_beta:3'],
            },
          ],
          safeAdjacentScoreCopyArithCount: 0,
          blockedCount: 3,
          insufficientInfoCount: 0,
          unknownCount: 0,
          requiresLirLevelAnalysis: true,
          shapeFamilySummary: {
            totalPatternNotExactCount: 3,
            families: [
              {
                family: 'copy-feeds-copy-chain',
                count: 1,
                caseNames: ['proof_case_beta'],
                examples: ['proof_case_beta:1'],
                likelyNextAction: 'local-canonicalization',
                requiresLirLevelAnalysis: false,
              },
              {
                family: 'arithmetic-copy-feeds-const-or-add-imm',
                count: 2,
                caseNames: ['proof_case_beta'],
                examples: ['proof_case_beta:2'],
                likelyNextAction: 'local-canonicalization',
                requiresLirLevelAnalysis: false,
              },
            ],
            topRecoverableFamilies: ['copy-feeds-copy-chain', 'arithmetic-copy-feeds-const-or-add-imm'],
            recommendation: 'test-only',
            proofMissSummary: {
              total: 3,
              byFamily: [
                {
                  family: 'copy-feeds-copy-chain',
                  total: 1,
                  caseNames: ['proof_case_beta'],
                  byReason: [
                    {
                      reason: 'barrier-or-non-adjacent',
                      count: 1,
                      caseNames: ['proof_case_beta'],
                      examples: ['proof_case_beta:1'],
                    },
                  ],
                  suggestedNextAction: 'focused-probe',
                },
                {
                  family: 'arithmetic-copy-feeds-const-or-add-imm',
                  total: 2,
                  caseNames: ['proof_case_beta'],
                  byReason: [
                    {
                      reason: 'no-exact-lir-local-proof',
                      count: 1,
                      caseNames: ['proof_case_beta'],
                      examples: ['proof_case_beta:2'],
                    },
                    {
                      reason: 'external-or-protected-slot',
                      count: 1,
                      caseNames: ['proof_case_beta'],
                      examples: ['proof_case_beta:3'],
                    },
                  ],
                  suggestedNextAction: 'rewrite-test-candidate',
                },
              ],
              topActionableFamilies: ['copy-feeds-copy-chain', 'arithmetic-copy-feeds-const-or-add-imm'],
              recommendation: 'proof case',
            },
          },
        },
      }),
    ])

    const proofMissSummary = summary.provenanceSummary.shapeFamilySummary?.proofMissSummary
    expect(proofMissSummary).toBeDefined()
    if (!proofMissSummary) return

    expect(proofMissSummary.total).toBe(5)
    expect(proofMissSummary.byFamily).toEqual([
        {
          family: 'arithmetic-copy-feeds-const-or-add-imm',
          total: 4,
          caseNames: ['proof_case_alpha', 'proof_case_beta'],
          byReason: [
            {
              reason: 'no-exact-lir-local-proof',
              count: 3,
              caseNames: ['proof_case_alpha', 'proof_case_beta'],
              examples: ['proof_case_alpha:1', 'proof_case_beta:2'],
            },
            {
              reason: 'external-or-protected-slot',
              count: 1,
              caseNames: ['proof_case_beta'],
              examples: ['proof_case_beta:3'],
            },
          ],
          suggestedNextAction: 'lir-safety-analysis',
        },
      {
        family: 'copy-feeds-copy-chain',
        total: 1,
        caseNames: ['proof_case_beta'],
        byReason: [
          {
            reason: 'barrier-or-non-adjacent',
            count: 1,
            caseNames: ['proof_case_beta'],
            examples: ['proof_case_beta:1'],
          },
        ],
        suggestedNextAction: 'focused-probe',
      },
    ])
    expect(proofMissSummary.topActionableFamilies).toEqual([
      'copy-feeds-copy-chain',
    ])
    expect(proofMissSummary.byFamily[0].byReason).toEqual([...proofMissSummary.byFamily[0].byReason].sort(
      (left, right) => right.count - left.count || left.reason.localeCompare(right.reason),
    ))
  })

  it('adds deterministic slot-provenance summaries when merging synthetic proof-miss cases', () => {
    const summary = buildLirOpportunitySummary([
      makeSyntheticProbeResult('ok', {
        directCommandCount: 5,
        plannedCommandCount: 2,
        directScoreCopyCount: 4,
        plannedScoreCopyCount: 2,
        caseName: 'slot_case_alpha',
        rewriteOpportunities: {
          total: 4,
          currentlyOptimized: 0,
          safeCandidate: 0,
          blockedByBarrier: 0,
          unknown: 4,
          topOpportunities: [],
        },
        rewriteProvenanceSummary: {
          total: 4,
          byReason: [
            {
              reason: 'blocked-by-pattern-not-exact-adjacent-score-copy-arith',
              count: 3,
              caseNames: ['slot_case_alpha'],
              examples: ['slot_case_alpha:1'],
            },
            {
              reason: 'insufficient-command-level-information',
              count: 1,
              caseNames: ['slot_case_alpha'],
              examples: ['slot_case_alpha:2'],
            },
          ],
          safeAdjacentScoreCopyArithCount: 0,
          blockedCount: 4,
          insufficientInfoCount: 1,
          unknownCount: 0,
          requiresLirLevelAnalysis: true,
          shapeFamilySummary: {
            totalPatternNotExactCount: 4,
            families: [
              {
                family: 'arithmetic-copy-feeds-const-or-add-imm',
                count: 4,
                caseNames: ['slot_case_alpha'],
                examples: ['slot_case_alpha:1'],
                likelyNextAction: 'local-canonicalization',
                requiresLirLevelAnalysis: false,
              },
            ],
            topRecoverableFamilies: ['arithmetic-copy-feeds-const-or-add-imm'],
            recommendation: 'slot-role synthetic case',
            proofMissSummary: {
              total: 4,
              byFamily: [
                {
                  family: 'arithmetic-copy-feeds-const-or-add-imm',
                  total: 4,
                  caseNames: ['slot_case_alpha'],
                  byReason: [
                    {
                      reason: 'no-exact-lir-local-proof',
                      count: 2,
                      caseNames: ['slot_case_alpha'],
                      examples: ['slot_case_alpha:1'],
                    },
                    {
                      reason: 'insufficient-command-context',
                      count: 2,
                      caseNames: ['slot_case_alpha'],
                      examples: ['slot_case_alpha:2'],
                    },
                  ],
                  suggestedNextAction: 'lir-safety-analysis',
                },
              ],
              topActionableFamilies: [],
              recommendation: 'slot-role synthetic case',
              slotProvenanceSummary: {
                total: 4,
                byFamily: [
                  {
                    family: 'arithmetic-copy-feeds-const-or-add-imm',
                    total: 4,
                    slotRoles: [
                      { role: 'return', count: 1, caseNames: ['slot_case_alpha'], examples: ['slot_case_alpha:1: $ret'] },
                      { role: 'const', count: 1, caseNames: ['slot_case_alpha'], examples: ['slot_case_alpha:1: $__const_keep'] },
                      { role: 'runtime-framework', count: 1, caseNames: ['slot_case_alpha'], examples: ['slot_case_alpha:1: __rf_tmp'] },
                      { role: 'local-temp', count: 1, caseNames: ['slot_case_alpha'], examples: ['slot_case_alpha:1: $tmp_t0'] },
                    ],
                    sourceKinds: [
                      { sourceKind: 'command-pattern', count: 1, caseNames: ['slot_case_alpha'], examples: ['slot_case_alpha:1'] },
                      { sourceKind: 'insufficient-context', count: 2, caseNames: ['slot_case_alpha'], examples: ['slot_case_alpha:2'] },
                      { sourceKind: 'local-temp-only', count: 1, caseNames: ['slot_case_alpha'], examples: ['slot_case_alpha:3'] },
                    ],
                    recommendation: 'collect local-temp and command-pattern evidence',
                  },
                ],
                dominantBlockers: [
                  { blocker: 'insufficient-context', count: 2 },
                  { blocker: 'local-temp-only', count: 1 },
                  { blocker: 'command-pattern', count: 1 },
                ],
                recommendation: 'slot-role dominant blocker tracking synthetic alpha',
              },
            },
          },
        },
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 6,
        plannedCommandCount: 4,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 2,
        caseName: 'slot_case_beta',
        rewriteOpportunities: {
          total: 3,
          currentlyOptimized: 0,
          safeCandidate: 0,
          blockedByBarrier: 0,
          unknown: 3,
          topOpportunities: [],
        },
        rewriteProvenanceSummary: {
          total: 2,
          byReason: [
            {
              reason: 'blocked-by-pattern-not-exact-adjacent-score-copy-arith',
              count: 1,
              caseNames: ['slot_case_beta'],
              examples: ['slot_case_beta:1'],
            },
            {
              reason: 'blocked-by-protected-slot',
              count: 1,
              caseNames: ['slot_case_beta'],
              examples: ['slot_case_beta:2'],
            },
          ],
          safeAdjacentScoreCopyArithCount: 0,
          blockedCount: 2,
          insufficientInfoCount: 0,
          unknownCount: 0,
          requiresLirLevelAnalysis: true,
          shapeFamilySummary: {
            totalPatternNotExactCount: 2,
            families: [
              {
                family: 'copy-feeds-copy-chain',
                count: 2,
                caseNames: ['slot_case_beta'],
                examples: ['slot_case_beta:1'],
                likelyNextAction: 'local-canonicalization',
                requiresLirLevelAnalysis: false,
              },
            ],
            topRecoverableFamilies: ['copy-feeds-copy-chain'],
            recommendation: 'slot-role synthetic beta',
            proofMissSummary: {
              total: 2,
              byFamily: [
                {
                  family: 'copy-feeds-copy-chain',
                  total: 2,
                  caseNames: ['slot_case_beta'],
                  byReason: [
                    {
                      reason: 'no-exact-lir-local-proof',
                      count: 1,
                      caseNames: ['slot_case_beta'],
                      examples: ['slot_case_beta:1'],
                    },
                    {
                      reason: 'external-or-protected-slot',
                      count: 1,
                      caseNames: ['slot_case_beta'],
                      examples: ['slot_case_beta:2'],
                    },
                  ],
                  suggestedNextAction: 'lir-safety-analysis',
                },
              ],
              topActionableFamilies: ['copy-feeds-copy-chain'],
              recommendation: 'slot-role synthetic beta',
              slotProvenanceSummary: {
                total: 2,
                byFamily: [
                  {
                    family: 'copy-feeds-copy-chain',
                    total: 2,
                    slotRoles: [
                      { role: 'parameter', count: 1, caseNames: ['slot_case_beta'], examples: ['slot_case_beta:1: $p0'] },
                      { role: 'runtime-framework', count: 1, caseNames: ['slot_case_beta'], examples: ['slot_case_beta:2: __rf_tmp'] },
                    ],
                    sourceKinds: [
                      { sourceKind: 'external-mention', count: 1, caseNames: ['slot_case_beta'], examples: ['slot_case_beta:1'] },
                      { sourceKind: 'protected-slot', count: 1, caseNames: ['slot_case_beta'], examples: ['slot_case_beta:2'] },
                    ],
                    recommendation: 'delay rewrite while external/protected are dominant',
                  },
                ],
                dominantBlockers: [
                  { blocker: 'external-mention', count: 1 },
                  { blocker: 'protected-slot', count: 1 },
                ],
                recommendation: 'slot-role dominant blockers synthetic beta',
              },
            },
          },
        },
      }),
    ])

    const proofMissSummary = summary.provenanceSummary.shapeFamilySummary?.proofMissSummary
    const slotProvenanceSummary = proofMissSummary?.slotProvenanceSummary
    expect(proofMissSummary).toBeDefined()
    expect(slotProvenanceSummary).toBeDefined()
    if (!proofMissSummary || !slotProvenanceSummary) return

    expect(slotProvenanceSummary.total).toBe(proofMissSummary.total)
    expect(slotProvenanceSummary.total).toBe(6)

    const arithmetic = slotProvenanceSummary.byFamily.find(family => family.family === 'arithmetic-copy-feeds-const-or-add-imm')
    expect(arithmetic).toBeDefined()
    if (!arithmetic) return
    expect(arithmetic.total).toBe(4)
    expect(arithmetic.slotRoles.map(item => item.role).sort()).toEqual(['const', 'local-temp', 'return', 'runtime-framework'].sort())
    expect(arithmetic.slotRoles.find(item => item.role === 'const')?.count).toBe(1)
    expect(arithmetic.slotRoles.find(item => item.role === 'local-temp')?.count).toBe(1)
    expect(arithmetic.slotRoles.find(item => item.role === 'return')?.count).toBe(1)
    expect(arithmetic.slotRoles.find(item => item.role === 'runtime-framework')?.count).toBe(1)

    expect(arithmetic.sourceKinds.map(item => item.sourceKind)).toContain('insufficient-context')
    expect(arithmetic.sourceKinds.find(item => item.sourceKind === 'insufficient-context')?.count).toBe(2)
    expect(arithmetic.sourceKinds.find(item => item.sourceKind === 'local-temp-only')?.count).toBe(1)
    expect(arithmetic.sourceKinds.find(item => item.sourceKind === 'command-pattern')?.count).toBe(1)

    expect(arithmetic.slotRoles).toEqual([...arithmetic.slotRoles].sort((left, right) => (
      right.count - left.count || left.role.localeCompare(right.role)
    )))
    expect(arithmetic.sourceKinds).toEqual([...arithmetic.sourceKinds].sort((left, right) => (
      right.count - left.count || left.sourceKind.localeCompare(right.sourceKind)
    )))


    const copyChain = slotProvenanceSummary.byFamily.find(family => family.family === 'copy-feeds-copy-chain')
    expect(copyChain).toBeDefined()
    if (!copyChain) return
    expect(copyChain.total).toBe(2)
    expect(copyChain.slotRoles.map(item => item.role).sort()).toEqual(['parameter', 'runtime-framework'].sort())
    expect(copyChain.sourceKinds.map(item => item.sourceKind).sort()).toEqual(['external-mention', 'protected-slot'].sort())
    expect(copyChain.recommendation).toContain('dominant')
    expect(copyChain.sourceKinds.find(item => item.sourceKind === 'external-mention')?.count).toBe(1)
    expect(copyChain.sourceKinds.find(item => item.sourceKind === 'protected-slot')?.count).toBe(1)

    expect(slotProvenanceSummary.dominantBlockers.length).toBeGreaterThan(0)
    expect(slotProvenanceSummary.byFamily).toEqual([...slotProvenanceSummary.byFamily].sort(
      (left, right) => right.total - left.total || left.family.localeCompare(right.family),
    ))
    expect(slotProvenanceSummary.dominantBlockers).toEqual([...slotProvenanceSummary.dominantBlockers].sort(
      (left, right) => right.count - left.count || left.blocker.localeCompare(right.blocker),
    ))
  })

  it('captures local proof-evidence summaries for slot provenance', () => {
    const summary = runArithmeticProbeReport('all', [1]).lirOpportunitySummary
    const proofMissSummary = summary?.provenanceSummary.shapeFamilySummary?.proofMissSummary
    const slotSummary = proofMissSummary?.slotProvenanceSummary
    expect(proofMissSummary).toBeDefined()
    expect(slotSummary).toBeDefined()
    if (!proofMissSummary || !slotSummary) return

    const localProofEvidenceSummary = slotSummary.localProofEvidenceSummary
    expect(localProofEvidenceSummary).toBeDefined()
    if (!localProofEvidenceSummary) return

    const expectedLocalProofTotal = slotSummary.byFamily.reduce((sum, family) => {
      const localTempOnly = family.sourceKinds.find(item => item.sourceKind === 'local-temp-only')?.count ?? 0
      const insufficientContext = family.sourceKinds.find(item => item.sourceKind === 'insufficient-context')?.count ?? 0
      return sum + localTempOnly + insufficientContext
    }, 0)
    expect(localProofEvidenceSummary.totalLocalTempOnly).toBe(expectedLocalProofTotal)
    expect(localProofEvidenceSummary.byFamily.length).toBeGreaterThan(0)

    expect(localProofEvidenceSummary.byFamily).toEqual([...localProofEvidenceSummary.byFamily].sort(
      (left, right) => right.totalLocalTempOnly - left.totalLocalTempOnly || left.family.localeCompare(right.family),
    ))
    expect(localProofEvidenceSummary.livenessWindowSummary).toBeDefined()
    const localLivenessWindowSummary = localProofEvidenceSummary.livenessWindowSummary
    expect(localLivenessWindowSummary).toBeDefined()
    if (!localLivenessWindowSummary) return
    expect(localLivenessWindowSummary.byFamily).toEqual([...localLivenessWindowSummary.byFamily].sort(
      (left, right) => (
        right.totalCandidateLike - left.totalCandidateLike || left.family.localeCompare(right.family)
      ),
    ))
    expect(localLivenessWindowSummary.totalCandidateLike).toBe(
      localProofEvidenceSummary.byFamily.reduce((sum, family) => sum + family.candidateCount, 0),
    )
    for (const family of localLivenessWindowSummary.byFamily) {
      expect(family.windowKinds).toEqual([...family.windowKinds].sort(
        (left, right) => right.count - left.count || left.windowKind.localeCompare(right.windowKind),
      ))
      const windowCandidateCount = family.windowKinds.reduce((sum, item) => sum + item.count, 0)
      expect(family.totalCandidateLike).toBe(windowCandidateCount)
      expect(family.locallySafeCandidateCount + family.blockedCandidateCount + family.unknownCandidateCount)
        .toBe(family.totalCandidateLike)
      expect(family.proofReadiness).toMatch(/^(locally-safe-but-diagnostics-only|blocked|unknown)$/)
    }
    expect(localLivenessWindowSummary.proofReadiness).toMatch(/^(locally-safe-but-diagnostics-only|blocked|unknown)$/)
    expect(localLivenessWindowSummary.recommendation).toEqual(expect.any(String))

    const candidateEvidenceCount = localProofEvidenceSummary.byFamily.reduce((sum, family) => (
      sum + family.evidenceKinds
        .filter(item => item.evidenceKind === 'adjacent-arith-source-reused' || item.evidenceKind === 'copy-chain-local-temp')
        .reduce((familySum, evidence) => familySum + evidence.count, 0)
    ), 0)
    expect(localLivenessWindowSummary.totalCandidateLike).toBe(candidateEvidenceCount)
    for (const family of localProofEvidenceSummary.byFamily) {
      expect(family.evidenceKinds).toEqual([...family.evidenceKinds].sort(
        (left, right) => right.count - left.count || left.evidenceKind.localeCompare(right.evidenceKind),
      ))
      const evidenceTotal = family.evidenceKinds.reduce((sum, evidence) => sum + evidence.count, 0)
      expect(family.totalLocalTempOnly).toBe(evidenceTotal)
      expect(family.proofReadiness).toMatch(/^(candidate-after-liveness-window|needs-more-context|blocked)$/)
      if (family.insufficientContextCount > 0) {
        const insufficientBucket = family.evidenceKinds.find(item => item.evidenceKind === 'insufficient-context')
        expect(insufficientBucket?.count).toBe(family.insufficientContextCount)
      }
    }

    expect(localProofEvidenceSummary.candidateCount)
      .toBe(localProofEvidenceSummary.byFamily.reduce((sum, family) => sum + family.candidateCount, 0))
    expect(localProofEvidenceSummary.needsLivenessWindowCount)
      .toBe(localProofEvidenceSummary.byFamily.reduce((sum, family) => sum + family.needsLivenessWindowCount, 0))
    expect(localProofEvidenceSummary.insufficientContextCount)
      .toBe(localProofEvidenceSummary.byFamily.reduce((sum, family) => sum + family.insufficientContextCount, 0))
    expect(localProofEvidenceSummary.recommendation).toEqual(expect.any(String))
  })

  it('builds structured adjacent-window buckets from real per-line provenance', () => {
    const lines = [
      { path: 'data/test/function/probe.mcfunction', line: 1, content: 'scoreboard players operation $prev0 o = $seed o' },
      { path: 'data/test/function/probe.mcfunction', line: 2, content: 'scoreboard players operation $tmp_t1 o = $tmp_t0 o' },
      { path: 'data/test/function/probe.mcfunction', line: 3, content: 'scoreboard players operation $sink o = $other o' },
      { path: 'data/test/function/probe.mcfunction', line: 4, content: 'scoreboard players operation $prev1 o = $seed2 o' },
      { path: 'data/test/function/probe.mcfunction', line: 5, content: 'scoreboard players operation $__const_keep o = $tmp_t3 o' },
      { path: 'data/test/function/probe.mcfunction', line: 6, content: 'scoreboard players operation $sink2 o = $other2 o' },
    ]

    const summary = summarizeRewriteOpportunitiesWithProvenance(lines).provenanceSummary
    const proofMissSummary = summary.shapeFamilySummary?.proofMissSummary
    const slotSummary = proofMissSummary?.slotProvenanceSummary
    const localProofEvidenceSummary = slotSummary?.localProofEvidenceSummary

    expect(proofMissSummary).toBeDefined()
    expect(slotSummary).toBeDefined()
    expect(localProofEvidenceSummary).toBeDefined()
    if (!localProofEvidenceSummary) return

    const adjacentWindowSummary = localProofEvidenceSummary.lirAdjacentWindowSummary
    expect(adjacentWindowSummary).toBeDefined()
    if (!adjacentWindowSummary) return

    const breakdownKinds = adjacentWindowSummary.proofMissAdjacentWindowBreakdown.map(item => item.kind)
    expect(breakdownKinds).toEqual(expect.arrayContaining([
      'local-temp-exact-proof-gap',
      'protected-boundary-blocked',
    ]))
    expect(adjacentWindowSummary.totalCandidateLike).toBeGreaterThan(0)
    expect(adjacentWindowSummary.localTempExactProofGapCases).toBeGreaterThanOrEqual(1)
    expect(adjacentWindowSummary.protectedBoundaryBlockedCases).toBeGreaterThanOrEqual(1)
    expect(adjacentWindowSummary.proofMissAdjacentWindowBreakdown).toEqual([...adjacentWindowSummary.proofMissAdjacentWindowBreakdown].sort(
      (left, right) => right.count - left.count || left.kind.localeCompare(right.kind),
    ))
    for (const item of adjacentWindowSummary.proofMissAdjacentWindowBreakdown) {
      expect(item.caseNames).toEqual([...item.caseNames].sort())
      expect(item.examples.length).toBeLessThanOrEqual(3)
    }
  })

  it('classifies local-temp exact proof gaps into deterministic readiness buckets', () => {
    const lines = [
      { path: 'data/test/function/probe.mcfunction', line: 1, content: 'scoreboard players operation $prev0 o = $seed o' },
      { path: 'data/test/function/probe.mcfunction', line: 2, content: 'scoreboard players operation $tmp_t1 o = $tmp_t0 o' },
      { path: 'data/test/function/probe.mcfunction', line: 3, content: 'scoreboard players operation $sink o = $other o' },
      { path: 'data/test/function/probe.mcfunction', line: 4, content: 'scoreboard players operation $prev1 o = $seed2 o' },
      { path: 'data/test/function/probe.mcfunction', line: 5, content: 'scoreboard players operation $__const_keep o = $tmp_t3 o' },
      { path: 'data/test/function/probe.mcfunction', line: 6, content: 'scoreboard players operation $sink2 o = $other2 o' },
    ]

    const summary = summarizeRewriteOpportunitiesWithProvenance(lines).provenanceSummary
    const proofMissSummary = summary.shapeFamilySummary?.proofMissSummary
    const slotSummary = proofMissSummary?.slotProvenanceSummary
    const localProofEvidenceSummary = slotSummary?.localProofEvidenceSummary
    const adjacentWindowSummary = localProofEvidenceSummary?.lirAdjacentWindowSummary

    expect(localProofEvidenceSummary).toBeDefined()
    expect(adjacentWindowSummary).toBeDefined()
    if (!adjacentWindowSummary) return

    const readinessSummary = adjacentWindowSummary.localTempProofGapReadinessSummary
    expect(readinessSummary).toBeDefined()
    expect(readinessSummary.totalCandidateLike).toBe(adjacentWindowSummary.localTempExactProofGapCases)
    expect(readinessSummary.candidateCount + readinessSummary.blockedOrUnknownCount).toBe(readinessSummary.totalCandidateLike)
    expect(adjacentWindowSummary.localTempProofGapReadinessSummary.byReadiness).toEqual([...adjacentWindowSummary.localTempProofGapReadinessSummary.byReadiness].sort(
      (left, right) => right.count - left.count || left.readiness.localeCompare(right.readiness),
    ))
    for (const bucket of readinessSummary.byReadiness) {
      expect(bucket.readiness).toMatch(
        /^(rewrite-test-candidate-local-window|needs-predecessor-window-proof|needs-successor-window-proof|needs-cross-function-boundary-proof|unknown-local-temp-proof-gap)$/,
      )
    }
    expect(readinessSummary.totalCandidateLike).toBeGreaterThanOrEqual(0)
    expect(readinessSummary.candidateCaseNames.sort()).toEqual(Array.from(new Set(readinessSummary.candidateCaseNames)).sort())
    expect(readinessSummary.blockedOrUnknownCaseNames.sort())
      .toEqual(Array.from(new Set(readinessSummary.blockedOrUnknownCaseNames)).sort())
  })

  it('classifies short-window proof kinds from real adjacent-window context', () => {
    const lines = [
      { path: 'data/test/function/probe.mcfunction', line: 1, content: 'scoreboard players operation $tmp_t1 o = $seed o' },
      { path: 'data/test/function/probe.mcfunction', line: 2, content: 'scoreboard players operation $tmp_t2 o = $tmp_t1 o' },
      { path: 'data/test/function/probe.mcfunction', line: 3, content: 'scoreboard players operation $tmp_t3 o = $tmp_t4 o' },
      { path: 'data/test/function/probe.mcfunction', line: 5, content: 'scoreboard players operation $tmp_t4 o = $tmp_t5 o' },
      { path: 'data/test/function/probe.mcfunction', line: 6, content: 'scoreboard players operation $tmp_t5 o = $tmp_t4 o' },
      { path: 'data/test/function/probe.mcfunction', line: 7, content: 'scoreboard players operation $tmp_t6 o = $tmp_t5 o' },
    ]

    const summary = summarizeRewriteOpportunitiesWithProvenance(lines).provenanceSummary
    const proofMissSummary = summary.shapeFamilySummary?.proofMissSummary
    const slotSummary = proofMissSummary?.slotProvenanceSummary
    const localProofEvidenceSummary = slotSummary?.localProofEvidenceSummary
    const adjacentWindowSummary = localProofEvidenceSummary?.lirAdjacentWindowSummary
    const shortWindowProofSummary = adjacentWindowSummary?.shortWindowProofSummary
    expect(shortWindowProofSummary).toBeDefined()
    if (!shortWindowProofSummary) return

    const sorted = [...shortWindowProofSummary.byProofWindowKind].sort(
      (left, right) => right.count - left.count || left.proofWindowKind.localeCompare(right.proofWindowKind),
    )
    expect(shortWindowProofSummary.byProofWindowKind).toEqual(sorted)

    const shortKinds = shortWindowProofSummary.byProofWindowKind.map(entry => entry.proofWindowKind)
    expect(shortKinds).toContain('single-predecessor-copy-into-local-temp')
    expect(shortKinds).toContain('opaque-or-unparsed-window')

    for (const bucket of shortWindowProofSummary.byProofWindowKind) {
      expect(bucket.count).toBeGreaterThan(0)
      expect(bucket.caseNames).toEqual([...bucket.caseNames].sort())
      expect([...new Set(bucket.caseNames)]).toEqual(bucket.caseNames)
      expect(bucket.examples.length).toBeLessThanOrEqual(3)
    }
    expect(shortWindowProofSummary.futureRewriteTestCandidateCaseNames).toEqual(['data/test/function/probe.mcfunction'])
    expect(shortWindowProofSummary.needsWiderWindowCaseNames).toEqual(['data/test/function/probe.mcfunction'])
    expect(shortWindowProofSummary.totalCandidateLike)
      .toBe(adjacentWindowSummary.localTempExactProofGapCases)
    expect(shortWindowProofSummary.byProofWindowKind.reduce((sum, bucket) => sum + bucket.count, 0))
      .toBe(shortWindowProofSummary.totalCandidateLike)
  })

  it('merges short-window proof-kind summaries deterministically with dedupe', () => {
    const summary = buildLirOpportunitySummary([
      makeAdjacentWindowDiagnosticCase({
        caseName: 'short_window_merge_case',
        totalCopies: 4,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        localTempExactProofGapCases: 2,
        shortWindowProofSummary: {
          totalCandidateLike: 2,
          byProofWindowKind: [
            {
              proofWindowKind: 'single-predecessor-copy-into-local-temp',
              count: 1,
              caseNames: ['short_window_merge_case'],
              examples: ['short_window_merge_case:1'],
            },
            {
              proofWindowKind: 'predecessor-arith-feeds-local-temp',
              count: 1,
              caseNames: ['short_window_merge_case'],
              examples: ['short_window_merge_case:2'],
            },
          ],
          futureRewriteTestCandidateCaseNames: ['short_window_merge_case', 'short_window_merge_case'],
          needsWiderWindowCaseNames: ['short_window_merge_case'],
        },
      }),
      makeAdjacentWindowDiagnosticCase({
        caseName: 'short_window_merge_case',
        totalCopies: 3,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        localTempExactProofGapCases: 2,
        shortWindowProofSummary: {
          totalCandidateLike: 2,
          byProofWindowKind: [
            {
              proofWindowKind: 'copy-chain-needs-wider-window',
              count: 2,
              caseNames: ['short_window_merge_case'],
              examples: ['short_window_merge_case:3'],
            },
          ],
          futureRewriteTestCandidateCaseNames: [],
          needsWiderWindowCaseNames: ['short_window_merge_case'],
        },
      }),
    ])

    const shortWindowProofSummary = summary.provenanceSummary.shapeFamilySummary
      ?.proofMissSummary?.slotProvenanceSummary?.localProofEvidenceSummary?.lirAdjacentWindowSummary?.shortWindowProofSummary
    expect(shortWindowProofSummary).toBeDefined()
    if (!shortWindowProofSummary) return

    const expectedBuckets = [...shortWindowProofSummary.byProofWindowKind]
      .sort((left, right) => right.count - left.count || left.proofWindowKind.localeCompare(right.proofWindowKind))
    expect(shortWindowProofSummary.byProofWindowKind).toEqual(expectedBuckets)
    expect(shortWindowProofSummary.totalCandidateLike).toBe(4)
    expect(shortWindowProofSummary.byProofWindowKind.map(entry => entry.count).reduce((sum, count) => sum + count, 0))
      .toBe(shortWindowProofSummary.totalCandidateLike)
    expect(shortWindowProofSummary.byProofWindowKind.map(item => item.proofWindowKind)).toEqual([
      'copy-chain-needs-wider-window',
      'predecessor-arith-feeds-local-temp',
      'single-predecessor-copy-into-local-temp',
    ])
    for (const item of shortWindowProofSummary.byProofWindowKind) {
      expect(item.caseNames).toEqual([...new Set(item.caseNames)].sort())
      expect(item.examples.length).toBeLessThanOrEqual(3)
    }
    expect(shortWindowProofSummary.futureRewriteTestCandidateCaseNames).toEqual(['short_window_merge_case'])
    expect(shortWindowProofSummary.needsWiderWindowCaseNames).toEqual(['short_window_merge_case'])
    expect(shortWindowProofSummary.futureRewriteTestCandidateCaseNames)
      .toEqual([...new Set(shortWindowProofSummary.futureRewriteTestCandidateCaseNames)].sort())
    expect(shortWindowProofSummary.needsWiderWindowCaseNames)
      .toEqual([...new Set(shortWindowProofSummary.needsWiderWindowCaseNames)].sort())
  })

  it('adds deterministic fixture-selection entries with per-bucket caps for short-window buckets', () => {
    const summary = buildLirOpportunitySummary([
      makeAdjacentWindowDiagnosticCase({
        caseName: 'case-alpha',
        totalCopies: 1,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        localTempExactProofGapCases: 1,
        shortWindowProofSummary: {
          totalCandidateLike: 1,
          byProofWindowKind: [
            {
              proofWindowKind: 'single-predecessor-copy-into-local-temp',
              count: 1,
              caseNames: ['case-alpha'],
              examples: ['case-alpha:4'],
            },
            {
              proofWindowKind: 'copy-chain-needs-wider-window',
              count: 1,
              caseNames: ['case-alpha'],
              examples: ['case-alpha:5'],
            },
          ],
          futureRewriteTestCandidateCaseNames: ['case-alpha'],
          needsWiderWindowCaseNames: ['case-alpha'],
        },
      }),
      makeAdjacentWindowDiagnosticCase({
        caseName: 'case-beta',
        totalCopies: 1,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        localTempExactProofGapCases: 1,
        shortWindowProofSummary: {
          totalCandidateLike: 1,
          byProofWindowKind: [
            {
              proofWindowKind: 'predecessor-arith-feeds-local-temp',
              count: 1,
              caseNames: ['case-beta'],
              examples: ['case-beta:1'],
            },
            {
              proofWindowKind: 'copy-chain-needs-wider-window',
              count: 1,
              caseNames: ['case-beta'],
              examples: ['case-beta:2'],
            },
            {
              proofWindowKind: 'opaque-or-unparsed-window',
              count: 1,
              caseNames: ['case-beta'],
              examples: ['case-beta:3'],
            },
          ],
          futureRewriteTestCandidateCaseNames: ['case-beta'],
          needsWiderWindowCaseNames: ['case-beta'],
        },
      }),
      makeAdjacentWindowDiagnosticCase({
        caseName: 'case-delta',
        totalCopies: 1,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        localTempExactProofGapCases: 1,
        shortWindowProofSummary: {
          totalCandidateLike: 1,
          byProofWindowKind: [
            {
              proofWindowKind: 'predecessor-arith-feeds-local-temp',
              count: 1,
              caseNames: ['case-delta'],
              examples: ['case-delta:1'],
            },
          ],
          futureRewriteTestCandidateCaseNames: ['case-delta'],
          needsWiderWindowCaseNames: ['case-delta'],
        },
      }),
      makeAdjacentWindowDiagnosticCase({
        caseName: 'case-epsilon',
        totalCopies: 1,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        localTempExactProofGapCases: 1,
        shortWindowProofSummary: {
          totalCandidateLike: 1,
          byProofWindowKind: [
            {
              proofWindowKind: 'single-predecessor-copy-into-local-temp',
              count: 1,
              caseNames: ['case-epsilon'],
              examples: ['case-epsilon:2'],
            },
            {
              proofWindowKind: 'cross-function-or-boundary-window',
              count: 1,
              caseNames: ['case-epsilon'],
              examples: ['case-epsilon:6'],
            },
          ],
          futureRewriteTestCandidateCaseNames: ['case-epsilon'],
          needsWiderWindowCaseNames: ['case-epsilon'],
        },
      }),
      makeAdjacentWindowDiagnosticCase({
        caseName: 'case-zeta',
        totalCopies: 1,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        localTempExactProofGapCases: 1,
        shortWindowProofSummary: {
          totalCandidateLike: 1,
          byProofWindowKind: [
            {
              proofWindowKind: 'single-predecessor-copy-into-local-temp',
              count: 1,
              caseNames: ['case-zeta'],
              examples: ['case-zeta:3'],
            },
          ],
          futureRewriteTestCandidateCaseNames: ['case-zeta'],
          needsWiderWindowCaseNames: ['case-zeta'],
        },
      }),
      makeAdjacentWindowDiagnosticCase({
        caseName: 'case-eta',
        totalCopies: 1,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        localTempExactProofGapCases: 1,
        shortWindowProofSummary: {
          totalCandidateLike: 1,
          byProofWindowKind: [
            {
              proofWindowKind: 'single-predecessor-copy-into-local-temp',
              count: 1,
              caseNames: ['case-eta'],
              examples: ['case-eta:7'],
            },
            {
              proofWindowKind: 'cross-function-or-boundary-window',
              count: 1,
              caseNames: ['case-eta'],
              examples: ['case-eta:8'],
            },
          ],
          futureRewriteTestCandidateCaseNames: ['case-eta'],
          needsWiderWindowCaseNames: ['case-eta'],
        },
      }),
    ])

    const fixtureSelectionSummary = summary.provenanceSummary.shapeFamilySummary?.proofMissSummary?.slotProvenanceSummary
      ?.localProofEvidenceSummary?.lirAdjacentWindowSummary?.shortWindowProofSummary?.fixtureSelectionSummary
    expect(fixtureSelectionSummary).toBeDefined()
    if (!fixtureSelectionSummary) return

    expect(fixtureSelectionSummary.rewriteEnablementStatus).toBe('disabled-diagnostics-only')
    expect(fixtureSelectionSummary.candidateFixtures).toEqual([
      {
        bucket: 'predecessor-arith-feeds-local-temp',
        caseName: 'case-beta',
        example: 'case-beta:1',
        reason: 'Gather one-adjacent arithmetic predecessor evidence for a short-window rewrite-test candidate.',
        recommendedTestKind: 'short-window-local-copy-fixture',
      },
      {
        bucket: 'predecessor-arith-feeds-local-temp',
        caseName: 'case-delta',
        example: 'case-delta:1',
        reason: 'Gather one-adjacent arithmetic predecessor evidence for a short-window rewrite-test candidate.',
        recommendedTestKind: 'short-window-local-copy-fixture',
      },
      {
        bucket: 'single-predecessor-copy-into-local-temp',
        caseName: 'case-alpha',
        example: 'case-alpha:4',
        reason: 'Gather exact predecessor-copy traces for a short-window rewrite-test candidate.',
        recommendedTestKind: 'short-window-local-copy-fixture',
      },
      {
        bucket: 'single-predecessor-copy-into-local-temp',
        caseName: 'case-epsilon',
        example: 'case-epsilon:2',
        reason: 'Gather exact predecessor-copy traces for a short-window rewrite-test candidate.',
        recommendedTestKind: 'short-window-local-copy-fixture',
      },
      {
        bucket: 'single-predecessor-copy-into-local-temp',
        caseName: 'case-zeta',
        example: 'case-zeta:3',
        reason: 'Gather exact predecessor-copy traces for a short-window rewrite-test candidate.',
        recommendedTestKind: 'short-window-local-copy-fixture',
      },
    ])
    expect(fixtureSelectionSummary.candidateFixtures.filter(item => item.bucket === 'predecessor-arith-feeds-local-temp')).toHaveLength(2)
    expect(fixtureSelectionSummary.candidateFixtures.filter(item => item.bucket === 'single-predecessor-copy-into-local-temp')).toHaveLength(3)

    expect(fixtureSelectionSummary.blockedFixtureFamilies).toEqual([
      {
        bucket: 'copy-chain-needs-wider-window',
        count: 2,
        caseNames: ['case-alpha', 'case-beta'],
        examples: ['case-alpha:5', 'case-beta:2'],
        reason: 'Collect wider-window evidence for copy-chain structures before rewrite-test expansion.',
      },
      {
        bucket: 'cross-function-or-boundary-window',
        count: 2,
        caseNames: ['case-epsilon', 'case-eta'],
        examples: ['case-epsilon:6', 'case-eta:8'],
        reason: 'Keep collecting safe boundary-aware evidence before candidate rewrite tests.',
      },
      {
        bucket: 'opaque-or-unparsed-window',
        count: 1,
        caseNames: ['case-beta'],
        examples: ['case-beta:3'],
        reason: 'Collect parse-complete neighboring command evidence before rewrite-test expansion.',
      },
    ])

    for (const bucket of ['predecessor-arith-feeds-local-temp', 'single-predecessor-copy-into-local-temp']) {
      const bucketCount = fixtureSelectionSummary.candidateFixtures.filter(item => item.bucket === bucket).length
      expect(bucketCount).toBeLessThanOrEqual(3)
    }

    expect(fixtureSelectionSummary.nextSafeDiagnosticGoals).toEqual([
      'Collect wider-window evidence for copy-chain structures before rewrite-test expansion.',
      'Keep collecting safe boundary-aware evidence before candidate rewrite tests.',
      'Collect parse-complete neighboring command evidence before rewrite-test expansion.',
      'Gather one-adjacent arithmetic predecessor evidence for a short-window rewrite-test candidate.',
      'Gather exact predecessor-copy traces for a short-window rewrite-test candidate.',
    ])
  })

  it('reports non-empty short-window proof buckets for full real arithmetic bench output', () => {
    const summary = runArithmeticProbeReport('all', [1]).lirOpportunitySummary
    const localProofEvidenceSummary = summary?.provenanceSummary?.shapeFamilySummary?.proofMissSummary
      ?.slotProvenanceSummary?.localProofEvidenceSummary
    expect(localProofEvidenceSummary).toBeDefined()
    if (!localProofEvidenceSummary) return
    const adjacentWindowSummary = localProofEvidenceSummary.lirAdjacentWindowSummary
    expect(adjacentWindowSummary).toBeDefined()
    if (!adjacentWindowSummary) return
    const shortWindowProofSummary = adjacentWindowSummary.shortWindowProofSummary
    expect(shortWindowProofSummary).toBeDefined()
    if (!shortWindowProofSummary) return

    expect(adjacentWindowSummary.localTempExactProofGapCases).toBeGreaterThan(0)
    expect(shortWindowProofSummary.byProofWindowKind.length).toBeGreaterThan(0)
    expect(shortWindowProofSummary.totalCandidateLike).toBeGreaterThan(0)
    expect(shortWindowProofSummary.totalCandidateLike)
      .toBe(adjacentWindowSummary.localTempExactProofGapCases)
    expect(shortWindowProofSummary.byProofWindowKind).toEqual(
      [...shortWindowProofSummary.byProofWindowKind].sort(
        (left, right) => right.count - left.count || left.proofWindowKind.localeCompare(right.proofWindowKind),
      ),
    )
    for (const bucket of shortWindowProofSummary.byProofWindowKind) {
      expect(bucket.caseNames).toEqual([...bucket.caseNames].sort())
      expect([...new Set(bucket.caseNames)]).toEqual(bucket.caseNames)
      expect(bucket.examples.length).toBeLessThanOrEqual(3)
    }
    const fixtureSelectionSummary = shortWindowProofSummary.fixtureSelectionSummary
    expect(fixtureSelectionSummary).toBeDefined()
    if (!fixtureSelectionSummary) return
    expect(fixtureSelectionSummary.rewriteEnablementStatus).toBe('disabled-diagnostics-only')
    expect(fixtureSelectionSummary.candidateFixtures.length).toBeGreaterThan(0)
    expect(fixtureSelectionSummary.nextSafeDiagnosticGoals.length).toBeGreaterThan(0)
    expect(fixtureSelectionSummary.blockedFixtureFamilies.length).toBeGreaterThan(0)

    const candidateBuckets = new Set(fixtureSelectionSummary.candidateFixtures.map(item => item.bucket))
    const blockedBuckets = new Set(fixtureSelectionSummary.blockedFixtureFamilies.map(item => item.bucket))
    for (const bucket of shortWindowProofSummary.byProofWindowKind.filter(item => item.count > 0)) {
      expect(candidateBuckets.has(bucket.proofWindowKind) || blockedBuckets.has(bucket.proofWindowKind)).toBe(true)
    }
    for (const fixture of fixtureSelectionSummary.candidateFixtures) {
      const fixtureCaseName = fixture.example.includes(':') ? fixture.example.split(':')[0] : fixture.example
      expect(fixture.caseName).toBe(fixtureCaseName)
    }
    for (const bucket of fixtureSelectionSummary.blockedFixtureFamilies) {
      expect(bucket.caseNames).toEqual([...bucket.caseNames].sort())
      expect([...new Set(bucket.caseNames)]).toEqual(bucket.caseNames)
      expect(bucket.examples).toEqual([...bucket.examples].sort())
      expect(bucket.examples.length).toBeLessThanOrEqual(3)
    }
    for (const bucket of ['single-predecessor-copy-into-local-temp', 'predecessor-arith-feeds-local-temp', 'copy-chain-needs-wider-window', 'cross-function-or-boundary-window', 'opaque-or-unparsed-window']) {
      const fixtureCount = fixtureSelectionSummary.candidateFixtures.filter(item => item.bucket === bucket).length
      expect(fixtureCount).toBeLessThanOrEqual(3)
    }
  })

  it('builds a deterministic future rewrite fixture export summary from local-temp proof diagnostics', () => {
    const summary = buildLirOpportunitySummary([
      makeAdjacentWindowDiagnosticCase({
        caseName: 'future_fixture_candidate_case',
        totalCopies: 3,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        localTempExactProofGapCases: 1,
        shortWindowProofSummary: {
          totalCandidateLike: 1,
          byProofWindowKind: [
            {
              proofWindowKind: 'single-predecessor-copy-into-local-temp',
              count: 1,
              caseNames: ['future_fixture_candidate_case'],
              examples: ['future_fixture_candidate_case:1'],
            },
          ],
          futureRewriteTestCandidateCaseNames: ['future_fixture_candidate_case'],
          needsWiderWindowCaseNames: [],
        },
        localTempProofGapReadinessSummary: {
          byReadiness: [
            {
              readiness: 'rewrite-test-candidate-local-window',
              count: 1,
              caseNames: ['future_fixture_candidate_case'],
              examples: ['future_fixture_candidate_case:1'],
            },
          ],
          totalCandidateLike: 1,
          candidateCount: 1,
          blockedOrUnknownCount: 0,
          candidateCaseNames: ['future_fixture_candidate_case'],
          blockedOrUnknownCaseNames: [],
          nextSafeDiagnosticGoals: ['Reduce immediate predecessor uncertainty for future fixture candidates.'],
        },
      }),
      makeAdjacentWindowDiagnosticCase({
        caseName: 'future_fixture_insufficient_case',
        totalCopies: 2,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        localTempExactProofGapCases: 1,
        shortWindowProofSummary: {
          totalCandidateLike: 1,
          byProofWindowKind: [
            {
              proofWindowKind: 'copy-chain-needs-wider-window',
              count: 1,
              caseNames: ['future_fixture_insufficient_case'],
              examples: ['future_fixture_insufficient_case:1'],
            },
          ],
          futureRewriteTestCandidateCaseNames: [],
          needsWiderWindowCaseNames: ['future_fixture_insufficient_case'],
        },
        localTempProofGapReadinessSummary: {
          byReadiness: [
            {
              readiness: 'needs-predecessor-window-proof',
              count: 1,
              caseNames: ['future_fixture_insufficient_case'],
              examples: ['future_fixture_insufficient_case:2'],
            },
          ],
          totalCandidateLike: 1,
          candidateCount: 0,
          blockedOrUnknownCount: 1,
          candidateCaseNames: [],
          blockedOrUnknownCaseNames: ['future_fixture_insufficient_case'],
          nextSafeDiagnosticGoals: ['Capture a wider producer/consumer proof window.'],
        },
      }),
      makeAdjacentWindowDiagnosticCase({
        caseName: 'future_fixture_boundary_case',
        totalCopies: 2,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'external-mention',
        localTempExactProofGapCases: 1,
        shortWindowProofSummary: {
          totalCandidateLike: 1,
          byProofWindowKind: [
            {
              proofWindowKind: 'cross-function-or-boundary-window',
              count: 1,
              caseNames: ['future_fixture_boundary_case'],
              examples: ['future_fixture_boundary_case:1'],
            },
          ],
          futureRewriteTestCandidateCaseNames: [],
          needsWiderWindowCaseNames: ['future_fixture_boundary_case'],
        },
        localTempProofGapReadinessSummary: {
          byReadiness: [
            {
              readiness: 'needs-cross-function-boundary-proof',
              count: 1,
              caseNames: ['future_fixture_boundary_case'],
              examples: ['future_fixture_boundary_case:2'],
            },
          ],
          totalCandidateLike: 1,
          candidateCount: 0,
          blockedOrUnknownCount: 1,
          candidateCaseNames: [],
          blockedOrUnknownCaseNames: ['future_fixture_boundary_case'],
          nextSafeDiagnosticGoals: ['Add explicit cross-function proof evidence before boundary fixtures.'],
        },
      }),
      makeAdjacentWindowDiagnosticCase({
        caseName: 'future_fixture_opaque_case',
        totalCopies: 1,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        localTempExactProofGapCases: 1,
        unknownUnparsedCommandCases: 1,
        shortWindowProofSummary: {
          totalCandidateLike: 1,
          byProofWindowKind: [
            {
              proofWindowKind: 'opaque-or-unparsed-window',
              count: 1,
              caseNames: ['future_fixture_opaque_case'],
              examples: ['future_fixture_opaque_case:1'],
            },
          ],
          futureRewriteTestCandidateCaseNames: [],
          needsWiderWindowCaseNames: ['future_fixture_opaque_case'],
        },
        localTempProofGapReadinessSummary: {
          byReadiness: [
            {
              readiness: 'needs-successor-window-proof',
              count: 1,
              caseNames: ['future_fixture_opaque_case'],
              examples: ['future_fixture_opaque_case:3'],
            },
          ],
          totalCandidateLike: 1,
          candidateCount: 0,
          blockedOrUnknownCount: 1,
          candidateCaseNames: [],
          blockedOrUnknownCaseNames: ['future_fixture_opaque_case'],
          nextSafeDiagnosticGoals: ['Resolve opaque-window parse fragments before fixture capture.'],
        },
      }),
      makeAdjacentWindowDiagnosticCase({
        caseName: 'future_fixture_boundary_blocked_case',
        totalCopies: 2,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'protected-slot',
        protectedBoundaryBlockedCases: 1,
        localTempProofGapReadinessSummary: {
          byReadiness: [
            {
              readiness: 'needs-cross-function-boundary-proof',
              count: 1,
              caseNames: ['future_fixture_boundary_blocked_case'],
              examples: ['future_fixture_boundary_blocked_case:1'],
            },
            {
              readiness: 'needs-predecessor-window-proof',
              count: 1,
              caseNames: ['future_fixture_boundary_blocked_case'],
              examples: ['future_fixture_boundary_blocked_case:2'],
            },
          ],
          totalCandidateLike: 2,
          candidateCount: 0,
          blockedOrUnknownCount: 2,
          candidateCaseNames: [],
          blockedOrUnknownCaseNames: ['future_fixture_boundary_blocked_case'],
          nextSafeDiagnosticGoals: ['Consolidate protected-boundary evidence before fixture reuse.'],
        },
        shortWindowProofSummary: {
          totalCandidateLike: 1,
          byProofWindowKind: [
            {
              proofWindowKind: 'copy-chain-needs-wider-window',
              count: 1,
              caseNames: ['future_fixture_boundary_blocked_case'],
              examples: ['future_fixture_boundary_blocked_case:1'],
            },
          ],
          futureRewriteTestCandidateCaseNames: [],
          needsWiderWindowCaseNames: ['future_fixture_boundary_blocked_case'],
        },
      }),
    ])

    const futureRewriteFixtureExportSummary = summary.futureRewriteFixtureExportSummary
    expect(futureRewriteFixtureExportSummary).toBeDefined()
    if (!futureRewriteFixtureExportSummary) return

    expect(futureRewriteFixtureExportSummary.rewriteEnablementStatus).toBe('disabled-diagnostics-only')
    expect(futureRewriteFixtureExportSummary.exportedFixtureCount).toBe(futureRewriteFixtureExportSummary.candidateFixtureNames.length)
    expect(futureRewriteFixtureExportSummary.blockedFixtureCount).toBe(futureRewriteFixtureExportSummary.blockedFixtureNames.length)
    expect(futureRewriteFixtureExportSummary.candidateFixtureNames).toEqual(
      [...futureRewriteFixtureExportSummary.candidateFixtureNames].sort(),
    )
    expect(futureRewriteFixtureExportSummary.blockedFixtureNames).toEqual(
      [...futureRewriteFixtureExportSummary.blockedFixtureNames].sort(),
    )
    expect(futureRewriteFixtureExportSummary.byFixtureFamily).toEqual(
      [...futureRewriteFixtureExportSummary.byFixtureFamily].sort((left, right) => left.family.localeCompare(right.family)),
    )
    expect(futureRewriteFixtureExportSummary.byFixtureFamily.map(family => family)).toEqual(
      [...futureRewriteFixtureExportSummary.byFixtureFamily].map(family => ({
        ...family,
        caseNames: [...family.caseNames],
      })),
    )
    expect(futureRewriteFixtureExportSummary.byFixtureFamily.length).toBeGreaterThan(0)
    expect(
      futureRewriteFixtureExportSummary.byFixtureFamily.some(item => item.candidateCount > 0),
    ).toBe(true)
    expect(
      futureRewriteFixtureExportSummary.byFixtureFamily.some(item => item.blockedCount > 0),
    ).toBe(true)
    expect(futureRewriteFixtureExportSummary.byBlockerKind.length).toBeGreaterThan(0)
    expect(futureRewriteFixtureExportSummary.byBlockerKind.map(item => item.blockerKind))
      .toEqual(
        [...futureRewriteFixtureExportSummary.byBlockerKind]
          .sort((left, right) => {
            const order: string[] = [
              'insufficient-window',
              'opaque-or-unparsed-window',
              'missing-predecessor-evidence',
              'missing-successor-evidence',
              'boundary-or-cross-function',
              'protected-boundary-blocked',
              'unknown-other',
            ]
            const leftIndex = order.indexOf(left.blockerKind)
            const rightIndex = order.indexOf(right.blockerKind)
            if (leftIndex !== rightIndex) return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex)
            return right.count - left.count || left.blockerKind.localeCompare(right.blockerKind)
          })
          .map(item => item.blockerKind),
      )
    for (const family of futureRewriteFixtureExportSummary.byFixtureFamily) {
      expect(family.caseNames).toEqual([...family.caseNames].sort())
      expect(family.candidateCount + family.blockedCount).toBeGreaterThan(0)
    }
    for (const blocker of futureRewriteFixtureExportSummary.byBlockerKind) {
      expect(blocker.caseNames).toEqual([...blocker.caseNames].sort())
      expect(blocker.count).toBe(blocker.caseNames.length)
    }
    expect(futureRewriteFixtureExportSummary.nextRequiredEvidence).toEqual(
      [...futureRewriteFixtureExportSummary.nextRequiredEvidence].sort(),
    )
    expect(futureRewriteFixtureExportSummary.byBlockerKind.some(item => item.blockerKind === 'insufficient-window')).toBe(true)
    expect(futureRewriteFixtureExportSummary.byBlockerKind.some(item => item.blockerKind === 'boundary-or-cross-function')).toBe(true)
    expect(futureRewriteFixtureExportSummary.byBlockerKind.some(item => item.blockerKind === 'opaque-or-unparsed-window')).toBe(true)
    expect(futureRewriteFixtureExportSummary.byBlockerKind.some(item => item.blockerKind === 'protected-boundary-blocked')).toBe(true)
  })

  it('splits unknown-like rewrite misses into deterministic cause buckets', () => {
    const summary = buildLirOpportunitySummary([
      makeAdjacentWindowDiagnosticCase({
        caseName: 'unknown_unparsed_case',
        totalCopies: 2,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        unknownUnparsedCommandCases: 2,
        localTempExactProofGapCases: 1,
        shortWindowProofSummary: {
          totalCandidateLike: 1,
          byProofWindowKind: [],
          futureRewriteTestCandidateCaseNames: [],
          needsWiderWindowCaseNames: [],
        },
        localTempProofGapReadinessSummary: {
          byReadiness: [
            {
              readiness: 'unknown-local-temp-proof-gap',
              count: 1,
              caseNames: ['unknown_unparsed_case'],
              examples: ['unknown_unparsed_case:1'],
            },
          ],
          totalCandidateLike: 1,
          candidateCount: 0,
          blockedOrUnknownCount: 1,
          candidateCaseNames: [],
          blockedOrUnknownCaseNames: ['unknown_unparsed_case'],
          nextSafeDiagnosticGoals: ['Unparsed command windows need parser evidence.'],
        },
      }),
      makeAdjacentWindowDiagnosticCase({
        caseName: 'unknown_insufficient_case',
        totalCopies: 1,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        localTempExactProofGapCases: 1,
        shortWindowProofSummary: {
          totalCandidateLike: 1,
          byProofWindowKind: [
            {
              proofWindowKind: 'copy-chain-needs-wider-window',
              count: 1,
              caseNames: ['unknown_insufficient_case'],
              examples: ['unknown_insufficient_case:1'],
            },
          ],
          futureRewriteTestCandidateCaseNames: [],
          needsWiderWindowCaseNames: ['unknown_insufficient_case'],
        },
        localTempProofGapReadinessSummary: {
          byReadiness: [
            {
              readiness: 'needs-predecessor-window-proof',
              count: 1,
              caseNames: ['unknown_insufficient_case'],
              examples: ['unknown_insufficient_case:2'],
            },
          ],
          totalCandidateLike: 1,
          candidateCount: 0,
          blockedOrUnknownCount: 1,
          candidateCaseNames: [],
          blockedOrUnknownCaseNames: ['unknown_insufficient_case'],
          nextSafeDiagnosticGoals: ['Capture wider local window for predecessor chain cases.'],
        },
      }),
      makeAdjacentWindowDiagnosticCase({
        caseName: 'unknown_boundary_case',
        totalCopies: 1,
        sourceKind: 'external-mention',
        byFamilySourceKind: 'external-mention',
        localTempExactProofGapCases: 1,
        shortWindowProofSummary: {
          totalCandidateLike: 1,
          byProofWindowKind: [
            {
              proofWindowKind: 'cross-function-or-boundary-window',
              count: 1,
              caseNames: ['unknown_boundary_case'],
              examples: ['unknown_boundary_case:1'],
            },
          ],
          futureRewriteTestCandidateCaseNames: [],
          needsWiderWindowCaseNames: ['unknown_boundary_case'],
        },
        localTempProofGapReadinessSummary: {
          byReadiness: [
            {
              readiness: 'needs-cross-function-boundary-proof',
              count: 1,
              caseNames: ['unknown_boundary_case'],
              examples: ['unknown_boundary_case:2'],
            },
          ],
          totalCandidateLike: 1,
          candidateCount: 0,
          blockedOrUnknownCount: 1,
          candidateCaseNames: [],
          blockedOrUnknownCaseNames: ['unknown_boundary_case'],
          nextSafeDiagnosticGoals: ['Resolve cross-function proof context before fixture planning.'],
        },
      }),
      makeAdjacentWindowDiagnosticCase({
        caseName: 'unknown_successor_case',
        totalCopies: 1,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        localTempExactProofGapCases: 1,
        shortWindowProofSummary: {
          totalCandidateLike: 1,
          byProofWindowKind: [
            {
              proofWindowKind: 'successor-arith-consumes-local-temp',
              count: 1,
              caseNames: ['unknown_successor_case'],
              examples: ['unknown_successor_case:1'],
            },
          ],
          futureRewriteTestCandidateCaseNames: ['unknown_successor_case'],
          needsWiderWindowCaseNames: [],
        },
        localTempProofGapReadinessSummary: {
          byReadiness: [
            {
              readiness: 'needs-successor-window-proof',
              count: 1,
              caseNames: ['unknown_successor_case'],
              examples: ['unknown_successor_case:2'],
            },
          ],
          totalCandidateLike: 1,
          candidateCount: 0,
          blockedOrUnknownCount: 1,
          candidateCaseNames: [],
          blockedOrUnknownCaseNames: ['unknown_successor_case'],
          nextSafeDiagnosticGoals: ['Resolve successor arithmetic chain before candidate selection.'],
        },
      }),
    ])

    const unknownCauseSplitSummary = summary.unknownCauseSplitSummary
    expect(unknownCauseSplitSummary).toBeDefined()
    if (!unknownCauseSplitSummary) return

    expect(unknownCauseSplitSummary.totalUnknownLike).toBeGreaterThan(0)
    expect(unknownCauseSplitSummary.byUnknownCause).toEqual(
      [...unknownCauseSplitSummary.byUnknownCause].sort((left, right) => left.cause.localeCompare(right.cause)),
    )
    const groupedSum = unknownCauseSplitSummary.byUnknownCause.reduce((sum, item) => sum + item.count, 0)
    expect(unknownCauseSplitSummary.totalUnknownLike).toBe(groupedSum)
    expect(unknownCauseSplitSummary.byUnknownCause.every(item => item.caseNames.length > 0)).toBe(true)
    for (const item of unknownCauseSplitSummary.byUnknownCause) {
      expect(item.caseNames).toEqual([...item.caseNames].sort())
    }

    const causes = unknownCauseSplitSummary.byUnknownCause.map(item => item.cause)
    expect(causes).toEqual([...causes].sort())
    expect(causes).toEqual(expect.arrayContaining([
      'unparsed-command',
      'insufficient-window',
      'boundary-or-cross-function',
      'missing-successor-evidence',
    ]))
    const byCauseLookup = new Map(unknownCauseSplitSummary.byUnknownCause.map(item => [item.cause, item.caseNames]))
    expect(byCauseLookup.get('unparsed-command')).toEqual(expect.arrayContaining(['unknown_unparsed_case']))
    expect(byCauseLookup.get('insufficient-window')).toEqual(expect.arrayContaining(['unknown_insufficient_case']))
    expect(byCauseLookup.get('boundary-or-cross-function')).toEqual(expect.arrayContaining(['unknown_boundary_case']))
    expect(byCauseLookup.get('missing-successor-evidence')).toEqual(expect.arrayContaining(['unknown_successor_case']))

    expect(unknownCauseSplitSummary.examples).toHaveLength(Math.min(3, unknownCauseSplitSummary.totalUnknownLike))
    expect(unknownCauseSplitSummary.examples).toEqual(
      [...unknownCauseSplitSummary.examples].filter((_, index, all) => all.findIndex(item => item.caseName === unknownCauseSplitSummary.examples[index]!.caseName) === index),
    )
  })

  it('exports offline rewrite-test harness metadata without enabling production rewrites', () => {
    const report = runArithmeticProbeReport('all', [1])
    const futureRewriteFixtureExportSummary = report.futureRewriteFixtureExportSummary
    const unknownCauseSplitSummary = report.unknownCauseSplitSummary
    const offlineHarnessSummary = report.offlineRewriteTestHarnessSummary

    expect(futureRewriteFixtureExportSummary).toBeDefined()
    expect(unknownCauseSplitSummary).toBeDefined()
    expect(offlineHarnessSummary).toBeDefined()
    if (!futureRewriteFixtureExportSummary || !unknownCauseSplitSummary || !offlineHarnessSummary) return

    expect(futureRewriteFixtureExportSummary.rewriteEnablementStatus).toBe('disabled-diagnostics-only')
    expect(unknownCauseSplitSummary.totalUnknownLike).toBe(
      unknownCauseSplitSummary.byUnknownCause.reduce((sum, entry) => sum + entry.count, 0),
    )
    expect(offlineHarnessSummary.rewriteEnablementStatus).toBe('disabled-diagnostics-only')
    expect(offlineHarnessSummary.harnessStatus).toMatch(/^(fixture-selection-only|no-candidates|blocked-by-unknown-evidence)$/)
    expect(offlineHarnessSummary.candidateFixtureCount).toBe(futureRewriteFixtureExportSummary.exportedFixtureCount)
    expect(offlineHarnessSummary.blockedFixtureCount).toBe(futureRewriteFixtureExportSummary.blockedFixtureCount)
    expect(offlineHarnessSummary.requiredBeforeRewriteEnablement.length).toBeGreaterThan(0)
    expect(offlineHarnessSummary.supportedTestKinds).toEqual([...offlineHarnessSummary.supportedTestKinds].sort())

    expect(report.lirOpportunitySummary?.futureRewriteFixtureExportSummary).toEqual(futureRewriteFixtureExportSummary)
    expect(report.lirOpportunitySummary?.unknownCauseSplitSummary).toEqual(unknownCauseSplitSummary)
    expect(report.lirOpportunitySummary?.offlineRewriteTestHarnessSummary).toEqual(offlineHarnessSummary)
    const adjacentWindowSummary = report.lirOpportunitySummary?.provenanceSummary
      ?.shapeFamilySummary?.proofMissSummary?.slotProvenanceSummary?.localProofEvidenceSummary?.lirAdjacentWindowSummary
    expect(adjacentWindowSummary).toBeDefined()
    if (!adjacentWindowSummary) return
    expect(adjacentWindowSummary).toHaveProperty('unknownUnparsedCommandCases')
    expect(adjacentWindowSummary).toHaveProperty('localTempProofGapReadinessSummary')
    expect(adjacentWindowSummary.proofMissAdjacentWindowBreakdown).toEqual(
      [...adjacentWindowSummary.proofMissAdjacentWindowBreakdown].sort(
        (left, right) => right.count - left.count || left.kind.localeCompare(right.kind),
      ),
    )
    expect(adjacentWindowSummary.localTempProofGapReadinessSummary).toBeDefined()
  })

  it('emits structured adjacent-window buckets for proof misses instead of generic unknown', () => {
    const summary = buildLirOpportunitySummary([
      makeAdjacentWindowDiagnosticCase({
        caseName: 'proof_gap_case',
        totalCopies: 3,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        localTempExactProofGapCases: 2,
        candidateShapeNotSatisfyingLirLocalProofCases: 1,
        needsLivenessWindowCount: 0,
        insufficientContextCount: 0,
        unknownUnparsedCommandCases: 0,
      }),
      makeAdjacentWindowDiagnosticCase({
        caseName: 'protected_case',
        totalCopies: 2,
        sourceKind: 'protected-slot',
        byFamilySourceKind: 'protected-slot',
        protectedBoundaryBlockedCases: 2,
        unknownUnparsedCommandCases: 0,
        needsLivenessWindowCount: 0,
        insufficientContextCount: 0,
      }),
    ])

    const localProofEvidenceSummary = summary.provenanceSummary.shapeFamilySummary?.proofMissSummary?.slotProvenanceSummary
      ?.localProofEvidenceSummary
    expect(localProofEvidenceSummary).toBeDefined()
    if (!localProofEvidenceSummary) return

    const adjacentWindowSummary = localProofEvidenceSummary.lirAdjacentWindowSummary
    expect(adjacentWindowSummary).toBeDefined()
    if (!adjacentWindowSummary) return

    expect(adjacentWindowSummary.proofMissAdjacentWindowBreakdown.length).toBeGreaterThan(1)
    expect(adjacentWindowSummary.proofMissAdjacentWindowBreakdown.map(entry => entry.kind)).toEqual(expect.arrayContaining([
      'local-temp-exact-proof-gap',
      'protected-boundary-blocked',
      'candidate-shape-not-satisfying-lir-local-proof',
    ]))
    expect(adjacentWindowSummary.localTempExactProofGapCases).toBeGreaterThan(0)
    expect(adjacentWindowSummary.protectedBoundaryBlockedCases).toBeGreaterThan(0)
    expect(adjacentWindowSummary.proofMissAdjacentWindowBreakdown[0]!.count)
      .toBeGreaterThanOrEqual(adjacentWindowSummary.proofMissAdjacentWindowBreakdown[1]!.count)
  })

  it('keeps unknown-unparsed-command misses separated when adjacent-window context is incomplete', () => {
    const summary = buildLirOpportunitySummary([
      makeAdjacentWindowDiagnosticCase({
        caseName: 'parse_gap_case',
        totalCopies: 4,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        unknownUnparsedCommandCases: 4,
        needsLivenessWindowCount: 0,
        insufficientContextCount: 0,
      }),
    ])

    const adjacentWindowSummary = summary.provenanceSummary.shapeFamilySummary?.proofMissSummary?.slotProvenanceSummary
      ?.localProofEvidenceSummary?.lirAdjacentWindowSummary

    expect(adjacentWindowSummary).toBeDefined()
    if (!adjacentWindowSummary) return

    expect(adjacentWindowSummary.unknownUnparsedCommandCases).toBe(4)
    expect(adjacentWindowSummary.localTempExactProofGapCases).toBe(0)
    expect(adjacentWindowSummary.proofMissAdjacentWindowBreakdown).toEqual([
      {
        kind: 'unknown-unparsed-command',
        count: 4,
        caseNames: ['parse_gap_case'],
        examples: ['parse_gap_case:5'],
      },
    ])
  })

  it('keeps protected/parameter boundary blocker buckets separate from local-temp exact proof gaps', () => {
    const summary = buildLirOpportunitySummary([
      makeAdjacentWindowDiagnosticCase({
        caseName: 'boundary_case',
        totalCopies: 5,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'external-mention',
        protectedBoundaryBlockedCases: 3,
        unknownUnparsedCommandCases: 2,
        needsLivenessWindowCount: 0,
        insufficientContextCount: 0,
      }),
    ])

    const adjacentWindowSummary = summary.provenanceSummary.shapeFamilySummary?.proofMissSummary?.slotProvenanceSummary
      ?.localProofEvidenceSummary?.lirAdjacentWindowSummary
    expect(adjacentWindowSummary).toBeDefined()
    if (!adjacentWindowSummary) return

    expect(adjacentWindowSummary.protectedBoundaryBlockedCases).toBe(3)
    expect(adjacentWindowSummary.localTempExactProofGapCases).toBe(0)
    expect(adjacentWindowSummary.proofMissAdjacentWindowBreakdown.some(item => item.kind === 'protected-boundary-blocked')).toBe(true)
    expect(adjacentWindowSummary.proofMissAdjacentWindowBreakdown.some(item => item.kind === 'unknown-unparsed-command')).toBe(true)
    expect(adjacentWindowSummary.candidateShapeNotSatisfyingLirLocalProofCases).toBe(0)
  })

  it('sorts adjacent-window proof buckets deterministically by count and kind', () => {
    const summary = buildLirOpportunitySummary([
      makeAdjacentWindowDiagnosticCase({
        caseName: 'sort_case_alpha',
        totalCopies: 2,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        localTempExactProofGapCases: 2,
        unknownUnparsedCommandCases: 1,
        needsLivenessWindowCount: 0,
        insufficientContextCount: 0,
      }),
      makeAdjacentWindowDiagnosticCase({
        caseName: 'sort_case_beta',
        totalCopies: 2,
        sourceKind: 'local-temp-only',
        byFamilySourceKind: 'local-temp-only',
        protectedBoundaryBlockedCases: 2,
        candidateShapeNotSatisfyingLirLocalProofCases: 1,
        unknownUnparsedCommandCases: 1,
        needsLivenessWindowCount: 0,
        insufficientContextCount: 0,
      }),
    ])

    const adjacentWindowSummary = summary.provenanceSummary.shapeFamilySummary?.proofMissSummary?.slotProvenanceSummary
      ?.localProofEvidenceSummary?.lirAdjacentWindowSummary
    expect(adjacentWindowSummary).toBeDefined()
    if (!adjacentWindowSummary) return

    const expected = [...adjacentWindowSummary.proofMissAdjacentWindowBreakdown]
      .sort((left, right) => right.count - left.count || left.kind.localeCompare(right.kind))
    expect(adjacentWindowSummary.proofMissAdjacentWindowBreakdown).toEqual(expected)

    for (const item of adjacentWindowSummary.proofMissAdjacentWindowBreakdown) {
      expect(item.caseNames).toEqual([...item.caseNames].sort())
      expect(item.examples.length).toBeLessThanOrEqual(3)
    }
  })

  it('captures slot-provenance summaries for the full arithmetic proof-miss aggregate', () => {
    const summary = runArithmeticProbeReport('all', [1]).lirOpportunitySummary
    const proofMissSummary = summary?.provenanceSummary.shapeFamilySummary?.proofMissSummary
    const slotSummary = proofMissSummary?.slotProvenanceSummary
    expect(proofMissSummary).toBeDefined()
    expect(slotSummary).toBeDefined()
    if (!proofMissSummary || !slotSummary) return

    expect(slotSummary.total).toBe(proofMissSummary.total)
    expect(slotSummary.total).toBeGreaterThan(0)
    expect(slotSummary.total).toBeLessThan(summary!.provenanceSummary.total)

    expect(slotSummary.byFamily).toEqual([...slotSummary.byFamily].sort(
      (left, right) => right.total - left.total || left.family.localeCompare(right.family),
    ))
    expect(slotSummary.byFamily.length).toBeGreaterThan(0)

    const familiesOfInterest = ['arithmetic-copy-feeds-const-or-add-imm', 'copy-feeds-copy-chain']
    expect(familiesOfInterest).toEqual(expect.arrayContaining(slotSummary.byFamily.map(item => item.family)))

    for (const family of slotSummary.byFamily) {
      expect(family.slotRoles).toEqual([...family.slotRoles].sort(
        (left, right) => right.count - left.count || left.role.localeCompare(right.role),
      ))
      expect(family.sourceKinds).toEqual([...family.sourceKinds].sort(
        (left, right) => right.count - left.count || left.sourceKind.localeCompare(right.sourceKind),
      ))
      expect(family.recommendation).toEqual(expect.any(String))
      expect(family.total).toBeGreaterThan(0)
      for (const slotRole of family.slotRoles) {
        expect(slotRole.count).toBeGreaterThan(0)
        expect(slotRole.examples.length).toBeLessThanOrEqual(3)
      }
      for (const sourceKind of family.sourceKinds) {
        expect(sourceKind.count).toBeGreaterThan(0)
        expect(sourceKind.examples.length).toBeLessThanOrEqual(3)
      }
    }

    expect(slotSummary.dominantBlockers).toEqual([...slotSummary.dominantBlockers].sort(
      (left, right) => right.count - left.count || left.blocker.localeCompare(right.blocker),
    ))
    expect(slotSummary.recommendation).toEqual(expect.any(String))
  })

  it('does not promote rewrite-test candidates when slot-source blockers are dominant', () => {
    const summary = runArithmeticProbeReport('all', [1]).lirOpportunitySummary
    const proofMissSummary = summary?.provenanceSummary.shapeFamilySummary?.proofMissSummary
    const slotProvenanceSummary = proofMissSummary?.slotProvenanceSummary
    expect(proofMissSummary).toBeDefined()
    expect(slotProvenanceSummary).toBeDefined()
    if (!proofMissSummary || !slotProvenanceSummary) return

    expect(slotProvenanceSummary.total).toBeLessThan(summary!.provenanceSummary.total)

    for (const family of slotProvenanceSummary.byFamily) {
      const topSourceKind = family.sourceKinds[0]?.sourceKind
      if (topSourceKind === 'external-mention' || topSourceKind === 'protected-slot' || topSourceKind === 'insufficient-context') {
        expect(proofMissSummary.byFamily.find(item => item.family === family.family)?.suggestedNextAction).not.toBe(
          'rewrite-test-candidate',
        )
        expect(family.recommendation).toContain('Do not promote')
      }
    }
  })

  it('merges local proof-evidence summaries deterministically across synthetic cases', () => {
    const summary = buildLirOpportunitySummary([
      makeSyntheticProbeResult('ok', {
        directCommandCount: 4,
        plannedCommandCount: 2,
        directScoreCopyCount: 4,
        plannedScoreCopyCount: 2,
        caseName: 'local_merge_alpha',
        rewriteOpportunities: {
          total: 4,
          currentlyOptimized: 0,
          safeCandidate: 0,
          blockedByBarrier: 0,
          unknown: 4,
          topOpportunities: [],
        },
        rewriteProvenanceSummary: {
          total: 4,
          byReason: [
            {
              reason: 'blocked-by-pattern-not-exact-adjacent-score-copy-arith',
              count: 2,
              caseNames: ['local_merge_alpha'],
              examples: ['local_merge_alpha:1'],
            },
            {
              reason: 'insufficient-command-level-information',
              count: 1,
              caseNames: ['local_merge_alpha'],
              examples: ['local_merge_alpha:2'],
            },
            {
              reason: 'blocked-by-protected-slot',
              count: 1,
              caseNames: ['local_merge_alpha'],
              examples: ['local_merge_alpha:3'],
            },
          ],
          safeAdjacentScoreCopyArithCount: 0,
          blockedCount: 3,
          insufficientInfoCount: 1,
          unknownCount: 1,
          requiresLirLevelAnalysis: true,
          shapeFamilySummary: {
            totalPatternNotExactCount: 3,
            families: [
              {
                family: 'arithmetic-copy-feeds-const-or-add-imm',
                count: 3,
                caseNames: ['local_merge_alpha'],
                examples: ['local_merge_alpha:1'],
                likelyNextAction: 'local-canonicalization',
                requiresLirLevelAnalysis: false,
              },
            ],
            topRecoverableFamilies: ['arithmetic-copy-feeds-const-or-add-imm'],
            recommendation: 'local merge alpha',
            proofMissSummary: {
              total: 3,
              byFamily: [
                {
                  family: 'arithmetic-copy-feeds-const-or-add-imm',
                  total: 3,
                  caseNames: ['local_merge_alpha'],
                  byReason: [
                    {
                      reason: 'no-exact-lir-local-proof',
                      count: 3,
                      caseNames: ['local_merge_alpha'],
                      examples: ['local_merge_alpha:1'],
                    },
                  ],
                  suggestedNextAction: 'rewrite-test-candidate',
                },
              ],
              topActionableFamilies: ['arithmetic-copy-feeds-const-or-add-imm'],
              recommendation: 'local merge alpha',
              slotProvenanceSummary: {
                total: 3,
                byFamily: [
                  {
                    family: 'arithmetic-copy-feeds-const-or-add-imm',
                    total: 3,
                    slotRoles: [
                      { role: 'local-temp', count: 2, caseNames: ['local_merge_alpha'], examples: ['local_merge_alpha:1'] },
                      { role: 'const', count: 1, caseNames: ['local_merge_alpha'], examples: ['local_merge_alpha:2'] },
                    ],
                    sourceKinds: [
                      { sourceKind: 'local-temp-only', count: 2, caseNames: ['local_merge_alpha'], examples: ['local_merge_alpha:1'] },
                      { sourceKind: 'insufficient-context', count: 1, caseNames: ['local_merge_alpha'], examples: ['local_merge_alpha:2'] },
                    ],
                    recommendation: 'local merge alpha',
                  },
                ],
                dominantBlockers: [
                  { blocker: 'local-temp-only', count: 2 },
                  { blocker: 'insufficient-context', count: 1 },
                ],
                recommendation: 'local merge alpha',
                localProofEvidenceSummary: {
                  totalLocalTempOnly: 2,
                  byFamily: [
                    {
                      family: 'arithmetic-copy-feeds-const-or-add-imm',
                      totalLocalTempOnly: 2,
                      evidenceKinds: [
                        {
                          evidenceKind: 'adjacent-arith-source-reused',
                          count: 2,
                          caseNames: ['local_merge_alpha'],
                          examples: ['local_merge_alpha:1', 'local_merge_alpha:2', 'local_merge_alpha:3'],
                        },
                        {
                          evidenceKind: 'insufficient-context',
                          count: 1,
                          caseNames: ['local_merge_alpha'],
                          examples: ['local_merge_alpha:2'],
                        },
                      ],
                      proofReadiness: 'candidate-after-liveness-window',
                      recommendation: 'local merge alpha',
                      candidateCount: 2,
                      needsLivenessWindowCount: 0,
                      insufficientContextCount: 1,
                      livenessWindowSummary: {
                        family: 'arithmetic-copy-feeds-const-or-add-imm',
                        totalCandidateLike: 2,
                        locallySafeCandidateCount: 1,
                        blockedCandidateCount: 1,
                        unknownCandidateCount: 0,
                        windowKinds: [
                          {
                            windowKind: 'single-adjacent-arith-no-reuse',
                            count: 1,
                            caseNames: ['local_merge_alpha'],
                            examples: ['local_merge_alpha:1'],
                          },
                          {
                            windowKind: 'blocked-src-overwritten-before-use',
                            count: 1,
                            caseNames: ['local_merge_alpha'],
                            examples: ['local_merge_alpha:3'],
                          },
                        ],
                        proofReadiness: 'blocked',
                        recommendation: 'local merge alpha split by local window evidence.',
                      },
                    },
                  ],
                  candidateCount: 2,
                  needsLivenessWindowCount: 0,
                  insufficientContextCount: 1,
                  livenessWindowSummary: {
                    byFamily: [
                      {
                        family: 'arithmetic-copy-feeds-const-or-add-imm',
                        totalCandidateLike: 2,
                        locallySafeCandidateCount: 1,
                        blockedCandidateCount: 1,
                        unknownCandidateCount: 0,
                        windowKinds: [
                          {
                            windowKind: 'single-adjacent-arith-no-reuse',
                            count: 1,
                            caseNames: ['local_merge_alpha'],
                            examples: ['local_merge_alpha:1'],
                          },
                          {
                            windowKind: 'blocked-src-overwritten-before-use',
                            count: 1,
                            caseNames: ['local_merge_alpha'],
                            examples: ['local_merge_alpha:3'],
                          },
                        ],
                        proofReadiness: 'blocked',
                        recommendation: 'local merge alpha split by local window evidence.',
                      },
                    ],
                    totalCandidateLike: 2,
                    locallySafeCandidateCount: 1,
                    blockedCandidateCount: 1,
                    unknownCandidateCount: 0,
                    proofReadiness: 'blocked',
                    recommendation: 'local merge alpha split by local window evidence.',
                  },
                  recommendation: 'local merge alpha',
                },
              },
            },
          },
        },
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 6,
        plannedCommandCount: 4,
        directScoreCopyCount: 4,
        plannedScoreCopyCount: 3,
        caseName: 'local_merge_beta',
        rewriteOpportunities: {
          total: 3,
          currentlyOptimized: 0,
          safeCandidate: 0,
          blockedByBarrier: 0,
          unknown: 3,
          topOpportunities: [],
        },
        rewriteProvenanceSummary: {
          total: 3,
          byReason: [
            {
              reason: 'blocked-by-pattern-not-exact-adjacent-score-copy-arith',
              count: 1,
              caseNames: ['local_merge_beta'],
              examples: ['local_merge_beta:1'],
            },
            {
              reason: 'blocked-by-cross-function-module-external-mention',
              count: 1,
              caseNames: ['local_merge_beta'],
              examples: ['local_merge_beta:2'],
            },
            {
              reason: 'blocked-by-alias-safety',
              count: 1,
              caseNames: ['local_merge_beta'],
              examples: ['local_merge_beta:3'],
            },
          ],
          safeAdjacentScoreCopyArithCount: 0,
          blockedCount: 3,
          insufficientInfoCount: 0,
          unknownCount: 0,
          requiresLirLevelAnalysis: true,
          shapeFamilySummary: {
            totalPatternNotExactCount: 2,
            families: [
              {
                family: 'arithmetic-copy-feeds-const-or-add-imm',
                count: 2,
                caseNames: ['local_merge_beta'],
                examples: ['local_merge_beta:1'],
                likelyNextAction: 'local-canonicalization',
                requiresLirLevelAnalysis: false,
              },
              {
                family: 'copy-feeds-copy-chain',
                count: 1,
                caseNames: ['local_merge_beta'],
                examples: ['local_merge_beta:1'],
                likelyNextAction: 'local-canonicalization',
                requiresLirLevelAnalysis: false,
              },
            ],
            topRecoverableFamilies: ['copy-feeds-copy-chain', 'arithmetic-copy-feeds-const-or-add-imm'],
            recommendation: 'local merge beta',
            proofMissSummary: {
              total: 2,
              byFamily: [
                {
                  family: 'arithmetic-copy-feeds-const-or-add-imm',
                  total: 1,
                  caseNames: ['local_merge_beta'],
                  byReason: [
                    {
                      reason: 'no-exact-lir-local-proof',
                      count: 1,
                      caseNames: ['local_merge_beta'],
                      examples: ['local_merge_beta:1'],
                    },
                  ],
                  suggestedNextAction: 'rewrite-test-candidate',
                },
                {
                  family: 'copy-feeds-copy-chain',
                  total: 1,
                  caseNames: ['local_merge_beta'],
                  byReason: [
                    {
                      reason: 'command-level-only-artifact',
                      count: 1,
                      caseNames: ['local_merge_beta'],
                      examples: ['local_merge_beta:2'],
                    },
                  ],
                  suggestedNextAction: 'leave-blocked',
                },
              ],
              topActionableFamilies: [],
              recommendation: 'local merge beta',
              slotProvenanceSummary: {
                total: 2,
                byFamily: [
                  {
                    family: 'arithmetic-copy-feeds-const-or-add-imm',
                    total: 1,
                    slotRoles: [
                      { role: 'local-temp', count: 1, caseNames: ['local_merge_beta'], examples: ['local_merge_beta:1'] },
                    ],
                    sourceKinds: [
                      { sourceKind: 'local-temp-only', count: 1, caseNames: ['local_merge_beta'], examples: ['local_merge_beta:1'] },
                    ],
                    recommendation: 'local merge beta arithmetic',
                  },
                  {
                    family: 'copy-feeds-copy-chain',
                    total: 1,
                    slotRoles: [
                      { role: 'parameter', count: 1, caseNames: ['local_merge_beta'], examples: ['local_merge_beta:2'] },
                    ],
                    sourceKinds: [
                      { sourceKind: 'external-mention', count: 1, caseNames: ['local_merge_beta'], examples: ['local_merge_beta:2'] },
                    ],
                    recommendation: 'local merge beta copy-chain',
                  },
                ],
                dominantBlockers: [
                  { blocker: 'local-temp-only', count: 1 },
                  { blocker: 'external-mention', count: 1 },
                ],
                recommendation: 'local merge beta',
                localProofEvidenceSummary: {
                  totalLocalTempOnly: 1,
                  byFamily: [
                    {
                      family: 'arithmetic-copy-feeds-const-or-add-imm',
                      totalLocalTempOnly: 1,
                      evidenceKinds: [
                        {
                          evidenceKind: 'copy-chain-local-temp',
                          count: 1,
                          caseNames: ['local_merge_beta'],
                          examples: ['local_merge_beta:1', 'local_merge_beta:2', 'local_merge_beta:3', 'local_merge_beta:4'],
                        },
                      ],
                      proofReadiness: 'candidate-after-liveness-window',
                      recommendation: 'local merge beta',
                      candidateCount: 1,
                      needsLivenessWindowCount: 0,
                      insufficientContextCount: 0,
                      livenessWindowSummary: {
                        family: 'arithmetic-copy-feeds-const-or-add-imm',
                        totalCandidateLike: 1,
                        locallySafeCandidateCount: 0,
                        blockedCandidateCount: 0,
                        unknownCandidateCount: 1,
                        windowKinds: [
                          {
                            windowKind: 'unknown-unparsed-command',
                            count: 1,
                            caseNames: ['local_merge_beta'],
                            examples: ['local_merge_beta:1'],
                          },
                        ],
                        proofReadiness: 'unknown',
                        recommendation: 'local merge beta split by local window evidence.',
                      },
                    },
                  ],
                  candidateCount: 1,
                  needsLivenessWindowCount: 0,
                  insufficientContextCount: 0,
                  livenessWindowSummary: {
                    byFamily: [
                      {
                        family: 'arithmetic-copy-feeds-const-or-add-imm',
                        totalCandidateLike: 1,
                        locallySafeCandidateCount: 0,
                        blockedCandidateCount: 0,
                        unknownCandidateCount: 1,
                        windowKinds: [
                          {
                            windowKind: 'unknown-unparsed-command',
                            count: 1,
                            caseNames: ['local_merge_beta'],
                            examples: ['local_merge_beta:1'],
                          },
                        ],
                        proofReadiness: 'unknown',
                        recommendation: 'local merge beta split by local window evidence.',
                      },
                    ],
                    totalCandidateLike: 1,
                    locallySafeCandidateCount: 0,
                    blockedCandidateCount: 0,
                    unknownCandidateCount: 1,
                    proofReadiness: 'unknown',
                    recommendation: 'local merge beta split by local window evidence.',
                  },
                  recommendation: 'local merge beta',
                },
              },
            },
          },
        },
      }),
    ])

    const localProofEvidenceSummary = summary.provenanceSummary.shapeFamilySummary?.proofMissSummary?.slotProvenanceSummary?.localProofEvidenceSummary
    expect(localProofEvidenceSummary).toBeDefined()
    if (!localProofEvidenceSummary) return

    expect(localProofEvidenceSummary.byFamily).toEqual([...localProofEvidenceSummary.byFamily].sort(
      (left, right) => right.totalLocalTempOnly - left.totalLocalTempOnly || left.family.localeCompare(right.family),
    ))

    const arithmeticFamily = localProofEvidenceSummary.byFamily.find(
      family => family.family === 'arithmetic-copy-feeds-const-or-add-imm',
    )
    const copyChainFamily = localProofEvidenceSummary.byFamily.find(
      family => family.family === 'copy-feeds-copy-chain',
    )
    expect(arithmeticFamily).toBeDefined()
    expect(copyChainFamily).toBeUndefined()
    if (!arithmeticFamily) return

    expect(arithmeticFamily.totalLocalTempOnly).toBe(4)
    expect(arithmeticFamily.candidateCount).toBe(3)
    expect(arithmeticFamily.insufficientContextCount).toBe(1)
    expect(arithmeticFamily.needsLivenessWindowCount).toBe(0)
    expect(arithmeticFamily.proofReadiness).toBe('candidate-after-liveness-window')
    expect(arithmeticFamily.evidenceKinds[0]?.evidenceKind).toBe('adjacent-arith-source-reused')
    expect(arithmeticFamily.evidenceKinds[0]?.examples.length).toBeLessThanOrEqual(3)

    expect(localProofEvidenceSummary.totalLocalTempOnly).toBe(4)
    expect(localProofEvidenceSummary.candidateCount).toBe(3)
    expect(localProofEvidenceSummary.needsLivenessWindowCount).toBe(0)
    expect(localProofEvidenceSummary.insufficientContextCount).toBe(1)

    expect(localProofEvidenceSummary.livenessWindowSummary).toBeDefined()
    if (!localProofEvidenceSummary.livenessWindowSummary) return
    expect(localProofEvidenceSummary.livenessWindowSummary.totalCandidateLike).toBe(3)
    expect(localProofEvidenceSummary.livenessWindowSummary.byFamily).toEqual([...localProofEvidenceSummary.livenessWindowSummary.byFamily].sort(
      (left, right) => right.totalCandidateLike - left.totalCandidateLike || left.family.localeCompare(right.family),
    ))
    expect(localProofEvidenceSummary.livenessWindowSummary.locallySafeCandidateCount).toBe(1)
    expect(localProofEvidenceSummary.livenessWindowSummary.blockedCandidateCount).toBe(1)
    expect(localProofEvidenceSummary.livenessWindowSummary.unknownCandidateCount).toBe(1)
    expect(localProofEvidenceSummary.livenessWindowSummary.locallySafeCandidateCount
      + localProofEvidenceSummary.livenessWindowSummary.blockedCandidateCount
      + localProofEvidenceSummary.livenessWindowSummary.unknownCandidateCount)
      .toBe(localProofEvidenceSummary.livenessWindowSummary.totalCandidateLike)

    const mergedArithmeticWindowFamily = localProofEvidenceSummary.livenessWindowSummary.byFamily.find(
      family => family.family === 'arithmetic-copy-feeds-const-or-add-imm',
    )
    expect(mergedArithmeticWindowFamily).toBeDefined()
    expect(mergedArithmeticWindowFamily?.proofReadiness).toMatch(/^(locally-safe-but-diagnostics-only|blocked|unknown)$/)
  })

  it('does not classify external/protected proof misses as rewrite-test candidates', () => {
    const summary = runArithmeticProbeReport('all', [1]).lirOpportunitySummary
    const proofMissSummary = summary?.provenanceSummary.shapeFamilySummary?.proofMissSummary
    expect(proofMissSummary).toBeDefined()
    if (!proofMissSummary) return

    for (const family of proofMissSummary.byFamily) {
      if (family.byReason.some(item => item.reason === 'external-or-protected-slot')) {
        expect(family.suggestedNextAction).not.toBe('rewrite-test-candidate')
      }
    }
  })

  it('keeps command-level-only-miss buckets conservative and sorted', () => {
    const summary = runArithmeticProbeReport('all', [1]).lirOpportunitySummary
    const proofMissSummary = summary?.provenanceSummary.shapeFamilySummary?.proofMissSummary
    expect(proofMissSummary).toBeDefined()
    if (!proofMissSummary) return

    for (const family of proofMissSummary.byFamily) {
      expect(family.caseNames).toEqual([...family.caseNames].sort())
      for (const reason of family.byReason) {
        expect(reason.caseNames).toEqual([...reason.caseNames].sort())
        expect(reason.examples.length).toBeLessThanOrEqual(3)
      }
    }
  })

  it('derives deterministic provenance reasons from emitted command sequences', () => {
    const lines = [
      { path: 'data/test/function/probe.mcfunction', line: 1, content: 'scoreboard players operation $tmp1 o = $a o' },
      { path: 'data/test/function/probe.mcfunction', line: 2, content: 'scoreboard players operation $b o += $tmp1 o' },
      { path: 'data/test/function/probe.mcfunction', line: 3, content: 'scoreboard players operation $tmp2 o = $c o' },
      { path: 'data/test/function/probe.mcfunction', line: 4, content: 'scoreboard players operation $d o -= $tmp2 o' },
      { path: 'data/test/function/probe.mcfunction', line: 5, content: 'scoreboard players operation $tmp3 o = $e o' },
      { path: 'data/test/function/probe.mcfunction', line: 6, content: 'scoreboard players operation $f o += $tmp3 o' },
      { path: 'data/test/function/probe.mcfunction', line: 7, content: 'scoreboard players operation $tmp3 o += $g o' },
      { path: 'data/test/function/probe.mcfunction', line: 8, content: 'scoreboard players operation $__const_keep o = $h o' },
      { path: 'data/test/function/probe.mcfunction', line: 9, content: 'scoreboard players operation $i o += $__const_keep o' },
      { path: 'data/test/function/probe.mcfunction', line: 10, content: 'scoreboard players operation $p0 o = $j o' },
      { path: 'data/test/function/probe.mcfunction', line: 11, content: 'scoreboard players operation $k o += $p0 o' },
    ]

    const summary = summarizeRewriteOpportunitiesWithProvenance(lines).provenanceSummary

    expect(summary.total).toBe(5)
    expect(summary.safeAdjacentScoreCopyArithCount).toBe(2)
    expect(summary.blockedCount).toBe(3)
    expect(summary.unknownCount).toBe(0)
    expect(summary.byReason.find(item => item.reason === 'safe-adjacent-score-copy-arith')?.count).toBe(2)
    expect(summary.byReason.find(item => item.reason === 'blocked-by-alias-safety')).toBeUndefined()
    expect(summary.byReason.find(item => item.reason === 'blocked-by-temp-not-dead-after-consuming-op')?.count).toBe(1)
    expect(summary.byReason.find(item => item.reason === 'blocked-by-protected-slot')?.count).toBe(1)
    expect(summary.byReason.find(item => item.reason === 'blocked-by-cross-function-module-external-mention')?.count).toBe(1)
    expect(summary.insufficientInfoCount).toBe(0)
  })

  it('derives deterministic LIR recommendations for synthetic empty/safe/unknown inputs', () => {
    const safeSummary = buildLirOpportunitySummary([
      makeSyntheticProbeResult('ok', {
        directCommandCount: 4,
        plannedCommandCount: 3,
        directScoreCopyCount: 2,
        plannedScoreCopyCount: 2,
        caseName: 'safe_case',
        rewriteOpportunities: {
          total: 2,
          currentlyOptimized: 0,
          safeCandidate: 2,
          blockedByBarrier: 0,
          unknown: 0,
          topOpportunities: [
            {
              status: 'safeCandidate',
              pattern: 'copy -> arithmetic',
              count: 2,
              examples: ['safe_case:1:scoreboard players operation $tmp o = $x o', 'safe_case:2:scoreboard players operation $y o += $tmp o'],
            },
          ],
        },
      }),
    ])
    expect(safeSummary.recommendation).toBe('safe-local-rewrite-candidate')
    expect(safeSummary.topPatterns).toEqual([
      expect.objectContaining({
        pattern: 'copy -> arithmetic',
        caseNames: ['safe_case'],
      }),
    ])

    const unknownSummary = buildLirOpportunitySummary([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 4,
        plannedCommandCount: 3,
        directScoreCopyCount: 2,
        plannedScoreCopyCount: 2,
        caseName: 'unknown_case',
        rewriteOpportunities: {
          total: 1,
          currentlyOptimized: 0,
          safeCandidate: 0,
          blockedByBarrier: 0,
          unknown: 1,
          topOpportunities: [
            {
              status: 'unknown',
              pattern: 'copy -> unknown',
              count: 1,
              examples: ['unknown_case:1:scoreboard players operation $tmp o = $x o'],
            },
          ],
        },
      }),
    ])
    expect(unknownSummary.recommendation).toBe('diagnose-first')

    const emptySummary = buildLirOpportunitySummary([])
    expect(emptySummary.recommendation).toBe('no-action')
    expect(emptySummary.totalScoreCopyCount).toBe(0)
    expect(emptySummary.topPatterns).toEqual([])
  })

  it('adds deterministic shape-family summaries for blocked non-exact pattern cases', () => {
    const summary = runArithmeticProbeReport('all', [1]).lirOpportunitySummary
    expect(summary).toBeDefined()
    const provenanceSummary = summary!.provenanceSummary
    const shapeFamilySummary = provenanceSummary.shapeFamilySummary
    expect(shapeFamilySummary).toBeDefined()
    const blockedPatternReason = provenanceSummary.byReason.find(
      item => item.reason === 'blocked-by-pattern-not-exact-adjacent-score-copy-arith',
    )

    expect(blockedPatternReason).toBeDefined()
    expect(shapeFamilySummary!.totalPatternNotExactCount).toBe(blockedPatternReason!.count)
    expect(shapeFamilySummary!.families.reduce((sum, family) => sum + family.count, 0)).toBe(shapeFamilySummary!.totalPatternNotExactCount)

    expect(shapeFamilySummary!.families).toEqual([...shapeFamilySummary!.families].sort(
      (left, right) => right.count - left.count || left.family.localeCompare(right.family),
    ))

    for (const family of shapeFamilySummary!.families) {
      expect(family.count).toBeGreaterThan(0)
      expect(family.caseNames).toEqual([...family.caseNames].sort())
      expect(family.examples.length).toBeLessThanOrEqual(3)
      expect(family.likelyNextAction).toMatch(/^(local-canonicalization|slot-scope-analysis|protected-slot-policy|liveness-analysis|leave-blocked)$/)
      expect(family.requiresLirLevelAnalysis).toBe(family.likelyNextAction !== 'local-canonicalization')
    }

    const localFamilies = shapeFamilySummary!.families.filter(
      family => family.likelyNextAction === 'local-canonicalization' && !family.requiresLirLevelAnalysis,
    )
    const expectedLocalFamilies = [
      'copy-chain-feeds-arithmetic',
      'arithmetic-copy-feeds-arithmetic',
      'copy-feeds-copy-chain',
      'arithmetic-copy-feeds-const-or-add-imm',
    ]
    expect(localFamilies.length).toBeGreaterThan(0)
    expect(shapeFamilySummary!.topRecoverableFamilies).toEqual(
      shapeFamilySummary!.families
        .filter(item => !item.requiresLirLevelAnalysis && item.likelyNextAction === 'local-canonicalization')
        .slice(0, 3)
        .map(item => item.family),
    )

    expect(shapeFamilySummary!.topRecoverableFamilies).toEqual(
      localFamilies
        .slice(0, 3)
        .map(item => item.family),
    )
    expect(localFamilies[0]).toBeDefined()
    expect(expectedLocalFamilies).toContain(localFamilies[0]!.family)
    for (const family of localFamilies) {
      expect(expectedLocalFamilies).toContain(family.family)
      expect(family.requiresLirLevelAnalysis).toBe(false)
    }

    expect(shapeFamilySummary!.recommendation).toEqual(expect.any(String))

    expect(provenanceSummary.byReason.find(item => item.reason === 'insufficient-command-level-information')?.count ?? 0).toBeGreaterThanOrEqual(0)
    expect(shapeFamilySummary!.topRecoverableFamilies.every(familyName => familyName !== 'other-pattern-not-exact')).toBe(true)
  })

  it('merges shape-family summaries across cases with deterministic families and caps', () => {
    const summary = buildLirOpportunitySummary([
      makeSyntheticProbeResult('ok', {
        directCommandCount: 6,
        plannedCommandCount: 4,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 2,
        caseName: 'shape_case_alpha',
        rewriteOpportunities: {
          total: 3,
          currentlyOptimized: 0,
          safeCandidate: 0,
          blockedByBarrier: 0,
          unknown: 0,
          topOpportunities: [],
        },
        rewriteProvenanceSummary: {
          total: 3,
          byReason: [
            {
              reason: 'blocked-by-pattern-not-exact-adjacent-score-copy-arith',
              count: 2,
            caseNames: ['shape_case_alpha'],
            examples: ['shape_case_alpha:1:copy'],
            },
            {
              reason: 'insufficient-command-level-information',
              count: 1,
              caseNames: ['shape_case_alpha'],
              examples: ['shape_case_alpha:2:copy'],
            },
            ],
            safeAdjacentScoreCopyArithCount: 0,
            blockedCount: 2,
            insufficientInfoCount: 1,
            unknownCount: 0,
            requiresLirLevelAnalysis: false,
            shapeFamilySummary: {
              totalPatternNotExactCount: 2,
              families: [
                {
                family: 'copy-chain-feeds-arithmetic',
                count: 2,
                caseNames: ['shape_case_alpha'],
                examples: ['shape_case_alpha:1:copy', 'shape_case_alpha:2:copy'],
                likelyNextAction: 'local-canonicalization',
                requiresLirLevelAnalysis: false,
              },
              {
                family: 'other-pattern-not-exact',
                count: 1,
                caseNames: ['shape_case_alpha'],
                examples: ['shape_case_alpha:3:copy'],
                likelyNextAction: 'leave-blocked',
                requiresLirLevelAnalysis: true,
              },
            ],
            topRecoverableFamilies: ['copy-chain-feeds-arithmetic'],
            recommendation: 'local family first',
          },
        },
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 6,
        plannedCommandCount: 4,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 2,
        caseName: 'shape_case_beta',
        rewriteOpportunities: {
          total: 3,
          currentlyOptimized: 0,
          safeCandidate: 0,
          blockedByBarrier: 0,
          unknown: 0,
          topOpportunities: [],
        },
        rewriteProvenanceSummary: {
          total: 3,
          byReason: [
              {
                reason: 'blocked-by-pattern-not-exact-adjacent-score-copy-arith',
                count: 3,
                caseNames: ['shape_case_beta'],
                examples: ['shape_case_beta:1:copy'],
            },
            {
              reason: 'blocked-by-protected-slot',
              count: 1,
              caseNames: ['shape_case_beta'],
              examples: ['shape_case_beta:2:copy'],
            },
            ],
            safeAdjacentScoreCopyArithCount: 0,
            blockedCount: 4,
            insufficientInfoCount: 0,
            unknownCount: 0,
            requiresLirLevelAnalysis: true,
            shapeFamilySummary: {
            totalPatternNotExactCount: 3,
            families: [
              {
                family: 'copy-chain-feeds-arithmetic',
                count: 1,
                caseNames: ['shape_case_beta'],
                examples: ['shape_case_beta:1:copy', 'shape_case_beta:4:copy'],
                likelyNextAction: 'local-canonicalization',
                requiresLirLevelAnalysis: false,
              },
              {
                family: 'return-materialization',
                count: 2,
                caseNames: ['shape_case_beta'],
                examples: ['shape_case_beta:2:copy', 'shape_case_beta:3:copy'],
                likelyNextAction: 'protected-slot-policy',
                requiresLirLevelAnalysis: true,
              },
            ],
            topRecoverableFamilies: ['copy-chain-feeds-arithmetic'],
            recommendation: 'protected-slot policy first',
          },
        },
      }),
    ])

    const shapeFamilySummary = summary.provenanceSummary.shapeFamilySummary
    expect(shapeFamilySummary).toBeDefined()
    expect(shapeFamilySummary!.totalPatternNotExactCount).toBe(5)

    const blockedPatternCount = summary.provenanceSummary.byReason.find(
      item => item.reason === 'blocked-by-pattern-not-exact-adjacent-score-copy-arith',
    )?.count
    expect(shapeFamilySummary!.totalPatternNotExactCount).toBe(blockedPatternCount)

    const copyChainFamily = shapeFamilySummary!.families.find(item => item.family === 'copy-chain-feeds-arithmetic')
    expect(copyChainFamily?.count).toBe(3)
    expect(copyChainFamily?.caseNames).toEqual(['shape_case_alpha', 'shape_case_beta'])
    expect(copyChainFamily?.examples.length).toBeLessThanOrEqual(3)
    expect(copyChainFamily?.likelyNextAction).toBe('local-canonicalization')
    expect(copyChainFamily?.requiresLirLevelAnalysis).toBe(false)

    const otherFamily = shapeFamilySummary!.families.find(item => item.family === 'other-pattern-not-exact')
    expect(otherFamily).toBeDefined()
    expect(shapeFamilySummary!.topRecoverableFamilies).toEqual(['copy-chain-feeds-arithmetic'])
    expect(shapeFamilySummary!.families).toEqual([...shapeFamilySummary!.families].sort(
      (left, right) => right.count - left.count || left.family.localeCompare(right.family),
    ))
    expect(shapeFamilySummary!.recommendation).toBe('Prioritize local canonicalization for copy-chain-feeds-arithmetic first, then rerun LIR provenance.')
  })

  it('merges LIR opportunity pattern case names deterministically and caps examples', () => {
    const summary = buildLirOpportunitySummary([
      makeSyntheticProbeResult('ok', {
        directCommandCount: 6,
        plannedCommandCount: 5,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 3,
        caseName: 'beta_case',
        rewriteOpportunities: {
          total: 3,
          currentlyOptimized: 0,
          safeCandidate: 2,
          blockedByBarrier: 1,
          unknown: 0,
          topOpportunities: [
            {
              status: 'safeCandidate',
              pattern: 'copy -> arithmetic',
              count: 2,
              examples: ['beta_case:1:x', 'beta_case:2:y', 'beta_case:3:z', 'beta_case:4:w'],
            },
            {
              status: 'blockedByBarrier',
              pattern: 'copy -> barrier -> arith',
              count: 1,
              examples: ['beta_case:5:w'],
            },
          ],
        },
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 6,
        plannedCommandCount: 5,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 3,
        caseName: 'alpha_case',
        rewriteOpportunities: {
          total: 3,
          currentlyOptimized: 0,
          safeCandidate: 1,
          blockedByBarrier: 2,
          unknown: 0,
          topOpportunities: [
            {
              status: 'safeCandidate',
              pattern: 'copy -> arithmetic',
              count: 1,
              examples: ['alpha_case:1:x', 'alpha_case:2:y'],
            },
            {
              status: 'blockedByBarrier',
              pattern: 'copy -> barrier -> arith',
              count: 2,
              examples: ['alpha_case:3:x'],
            },
          ],
        },
      }),
    ])

    const safePattern = summary.topPatterns.find(item => item.pattern === 'copy -> arithmetic')
    const blockedPattern = summary.topPatterns.find(item => item.pattern === 'copy -> barrier -> arith')

    expect(safePattern?.caseNames).toEqual(['alpha_case', 'beta_case'])
    expect(blockedPattern?.caseNames).toEqual(['alpha_case', 'beta_case'])
    expect(safePattern?.examples.length).toBeLessThanOrEqual(3)
  })

  it('keeps rewrite-opportunity examples and status fields stable', () => {
    const result = runArithmeticProbeReport('double_div', [1]).cases[0]

    for (const opportunity of result.rewriteOpportunities.topOpportunities) {
      expect(opportunity.pattern).toEqual(expect.any(String))
      expect(opportunity.count).toBeGreaterThan(0)
      expect(opportunity.status).toMatch(
        /^(currentlyOptimized|safeCandidate|blockedByBarrier|unknown)$/,
      )
      expect(opportunity.examples.length).toBeLessThanOrEqual(3)
    }
  })

  it('builds a VIR decision aggregate dashboard for all selected cases', () => {
    const report = runArithmeticProbeReport('all', [1])
    const dashboard = report.virDecisionDashboard

    expect(dashboard.totalCaseCount).toBe(report.cases.length)
    expect(dashboard.consideredCases).toBe(report.cases.length)
    expect(dashboard.consideredFunctions).toBeGreaterThanOrEqual(dashboard.unsupportedFunctionCount)
    expect(dashboard.supportedCases + dashboard.unsupportedCases).toBe(dashboard.consideredCases)
    expect(dashboard.acceptedPlannedCases).toBeGreaterThanOrEqual(0)
    expect(dashboard.selectedDirectCases).toBeGreaterThanOrEqual(0)
    expect(dashboard.rejectedDirectCases).toBeGreaterThanOrEqual(0)

    expect(dashboard.status).toMatch(/^(continue|pause|stay-experimental)$/)
    expect(dashboard.statusReason).toEqual(expect.any(String))
    expect(dashboard.recommendationReason).toEqual(expect.any(String))
    expect(dashboard.commandDeltaSummary).toEqual(expect.objectContaining({
      min: expect.any(Number),
      max: expect.any(Number),
      total: expect.any(Number),
      average: expect.any(Number),
      improvedCount: expect.any(Number),
      regressedCount: expect.any(Number),
      unchangedCount: expect.any(Number),
    }))
    expect(dashboard.scoreCopyDeltaSummary).toEqual(expect.objectContaining({
      min: expect.any(Number),
      max: expect.any(Number),
      total: expect.any(Number),
      average: expect.any(Number),
      improvedCount: expect.any(Number),
      regressedCount: expect.any(Number),
      unchangedCount: expect.any(Number),
    }))
    expect(dashboard.semanticProofSummary).toEqual(expect.objectContaining({
      provenEquivalentCount: expect.any(Number),
      unsupportedCount: expect.any(Number),
      missingProofCount: expect.any(Number),
      unprovenCount: expect.any(Number),
    }))
    expect(dashboard.blockers).toEqual(expect.any(Array))
    expect(dashboard.nextSafeGoals.length).toBeLessThanOrEqual(3)
    expect(dashboard.topRejectionCategories.length).toBeLessThanOrEqual(5)
    expect(dashboard.topUnsupportedReasons).toEqual(expect.any(Array))
    expect(dashboard.blockerTagTotals).toEqual(expect.any(Object))
    expect(dashboard.supportedProbeNames).toEqual(expect.any(Array))
    expect(dashboard.unsupportedProbeNames).toEqual(expect.any(Array))

    const functionCount = report.cases.reduce((total, result) => {
      const decision = result.virDecision
      if (!decision) return total
      return total + decision.acceptedFunctionCount + decision.rejectedFunctionCount + decision.unsupportedFunctionCount
    }, 0)
    expect(dashboard.totalFunctionCount).toBe(functionCount)

    expect(dashboard.rejectionCategoryTotals).toEqual(expect.objectContaining({
      planned_unsupported: expect.any(Number),
      allocation_check_failed: expect.any(Number),
      higher_cost: expect.any(Number),
      direct_unsupported: expect.any(Number),
      unsupported_both: expect.any(Number),
    }))
    expect(dashboard.goNoGoStatus).toMatch(/^(continue|pause|stay-experimental)$/)
  })

  it('adds deterministic blocker drilldown fields to the VIR decision dashboard', () => {
    const dashboard = runArithmeticProbeReport('all', [1]).virDecisionDashboard

    expect(dashboard.unsupportedReasonBreakdown).toEqual(expect.any(Array))
    expect(dashboard.unsupportedMirOpKindBreakdown).toEqual(expect.any(Array))
    expect(dashboard.unsupportedMirCallTargetFamilyBreakdown).toEqual(expect.any(Array))
    expect(dashboard.caseBlockerMatrix).toEqual(expect.any(Array))
    expect(dashboard.readinessChecklist).toEqual(expect.any(Array))
    expect(dashboard.unknownReasonCaseNames).toEqual(expect.any(Array))

    if (dashboard.unsupportedReasonBreakdown.length > 0) {
      expect(dashboard.unsupportedReasonBreakdown[0]).toEqual(expect.objectContaining({
        reason: expect.any(String),
        count: expect.any(Number),
        caseNames: expect.any(Array),
        controlledCaseNames: expect.any(Array),
        broadCaseNames: expect.any(Array),
      }))
    }

    expect(dashboard.caseBlockerMatrix.every(entry => entry.caseName && entry.status)).toBe(true)
    expect(dashboard.readinessChecklist.every(item =>
      item.id.length > 0 && ['pass', 'warn', 'fail'].includes(item.status) && item.detail.length > 0,
    )).toBe(true)
  })

  it('summarizes unsupported MIR opcode breakdown deterministically with dedupe/sort', () => {
    const dashboard = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 10,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'gamma',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedReason: "unsupported instruction 'arith.mul' in 'probe_mir'",
        unsupportedMirOpKinds: ['arith.mul'],
        coverageCategory: 'controlled',
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 11,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'alpha',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedReason: "unsupported instruction 'arith.add' in 'probe_mir'",
        coverageCategory: 'controlled',
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 12,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'delta',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedReason: "unsupported instruction 'arith.mul' in 'probe_mir'",
        coverageCategory: 'broad',
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 13,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'beta',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedReason: "unsupported instruction 'arith.add' in 'probe_mir'",
        coverageCategory: 'controlled',
      }),
    ])

    expect(dashboard.unsupportedMirOpKindBreakdown).toEqual([
      {
        opKind: 'arith.add',
        count: 2,
        caseNames: ['alpha', 'beta'],
        controlledCaseNames: ['alpha', 'beta'],
        broadCaseNames: [],
      },
      {
        opKind: 'arith.mul',
        count: 2,
        caseNames: ['delta', 'gamma'],
        controlledCaseNames: ['gamma'],
        broadCaseNames: ['delta'],
      },
    ])
    expect(dashboard.nextSafeGoals).toEqual(expect.arrayContaining([
      expect.stringContaining('eliminate or isolate blocker MIR opcode kind: arith.add'),
    ]))
  })

  it('summarizes unsupported MIR call target breakdown with deterministic dedupe/sort and shape hints', () => {
    const dashboard = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 10,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'case_double',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedReason: "unsupported instruction 'call' in 'probe_math'; fn='double_div' args=3 hasResult=true",
        unsupportedMirOpKinds: ['call'],
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 11,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'case_sqrt',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedReason: "unsupported instruction 'call' in 'probe_math'; fn='sqrt_fx' args=1 hasResult=true",
        unsupportedMirOpKinds: ['call'],
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 12,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'case_div',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedReason: "unsupported instruction 'call' in 'probe_math'; fn='double_div' args=1 hasResult=true",
        unsupportedMirOpKinds: ['call'],
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 9,
        plannedCommandCount: 0,
        directScoreCopyCount: 2,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'case_const',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedReason: "unsupported instruction 'call' in 'probe_math'; fn='sqrt_fx' args=2 hasResult=false",
        unsupportedMirOpKinds: ['call'],
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 15,
        plannedCommandCount: 0,
        directScoreCopyCount: 4,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'call_unsupported',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedReason: "unsupported instruction 'call' in 'probe_math'; fn='sin_hp' args=5 hasResult=true",
        unsupportedMirOpKinds: ['call'],
        unsupportedMirCallTargets: [{ fn: 'sin_hp', argCount: 4, hasResult: true }],
      }),
    ])

    expect(dashboard.unsupportedMirCallTargetBreakdown).toEqual([
      {
        fn: 'double_div',
        count: 2,
        caseNames: ['case_div', 'case_double'],
        controlledCaseNames: [],
        broadCaseNames: ['case_div', 'case_double'],
        argCounts: [1, 3],
        hasResultCount: 2,
        noResultCount: 0,
      },
      {
        fn: 'sqrt_fx',
        count: 2,
        caseNames: ['case_const', 'case_sqrt'],
        controlledCaseNames: [],
        broadCaseNames: ['case_const', 'case_sqrt'],
        argCounts: [1, 2],
        hasResultCount: 1,
        noResultCount: 1,
      },
      {
        fn: 'sin_hp',
        count: 1,
        caseNames: ['call_unsupported'],
        controlledCaseNames: [],
        broadCaseNames: ['call_unsupported'],
        argCounts: [4],
        hasResultCount: 1,
        noResultCount: 0,
      },
    ])

    expect(dashboard.nextSafeGoals).toEqual(expect.arrayContaining([
      expect.stringContaining('isolate unsupported MIR call target family: function:double_div'),
    ]))
  })

  it('summarizes unsupported MIR call target families with deterministic dedupe, function/raw separation, and examples', () => {
    const rawMarkerSetup = "__raw:execute unless entity @e[tag=rs_trig,limit=1] run summon minecraft:marker ~ 0 ~ {Tags:[\"rs_trig\"]}"

    const dashboard = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 10,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'marker_case_broad',
        coverageCategory: 'broad',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedReason: "unsupported instruction 'call' in 'probe_math'; fn='double_div' args=1 hasResult=true",
        unsupportedMirOpKinds: ['call'],
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 11,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'raw_marker_first',
        coverageCategory: 'broad',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedReason: `unsupported instruction 'call' in 'probe_math'; fn='${rawMarkerSetup}' args=0 hasResult=false`,
        unsupportedMirOpKinds: ['call'],
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 12,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'raw_marker_controlled',
        coverageCategory: 'controlled',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedMirCallTargets: [{ fn: rawMarkerSetup, argCount: 0, hasResult: false }],
        unsupportedMirOpKinds: ['call'],
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 15,
        plannedCommandCount: 0,
        directScoreCopyCount: 4,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'raw_execute_other',
        coverageCategory: 'broad',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedMirCallTargets: [{ fn: '__raw:execute if score @s value matches 1..', argCount: 0, hasResult: false }],
        unsupportedMirOpKinds: ['call'],
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 13,
        plannedCommandCount: 0,
        directScoreCopyCount: 2,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'function_call',
        coverageCategory: 'controlled',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedMirCallTargets: [{ fn: 'sin_hp', argCount: 4, hasResult: true }],
        unsupportedMirOpKinds: ['call'],
      }),
    ])

    expect(dashboard.unsupportedMirCallTargetFamilyBreakdown).toEqual([
      {
        family: 'raw:summon-marker-setup',
        count: 2,
        targetKinds: ['raw-command'],
        rawCommandKinds: ['summon-marker-setup'],
        caseNames: ['raw_marker_controlled', 'raw_marker_first'],
        controlledCaseNames: ['raw_marker_controlled'],
        broadCaseNames: ['raw_marker_first'],
        exampleTargets: [rawMarkerSetup],
      },
      {
        family: 'function:double_div',
        count: 1,
        targetKinds: ['function'],
        rawCommandKinds: [],
        caseNames: ['marker_case_broad'],
        controlledCaseNames: [],
        broadCaseNames: ['marker_case_broad'],
        exampleTargets: ['double_div'],
      },
      {
        family: 'function:sin_hp',
        count: 1,
        targetKinds: ['function'],
        rawCommandKinds: [],
        caseNames: ['function_call'],
        controlledCaseNames: ['function_call'],
        broadCaseNames: [],
        exampleTargets: ['sin_hp'],
      },
      {
        family: 'raw:execute-raw',
        count: 1,
        targetKinds: ['raw-command'],
        rawCommandKinds: ['execute-raw'],
        caseNames: ['raw_execute_other'],
        controlledCaseNames: [],
        broadCaseNames: ['raw_execute_other'],
        exampleTargets: ['__raw:execute if score @s value matches 1..'],
      },
    ])

    const firstFamily = dashboard.unsupportedMirCallTargetFamilyBreakdown[0]
    expect(firstFamily?.exampleTargets[0]).toBe(rawMarkerSetup)
    expect(dashboard.unsupportedMirCallTargetFamilyBreakdown.every(
      (entry: VirUnsupportedMirCallTargetFamilyBreakdownEntry) => entry.exampleTargets.length <= 3,
    )).toBe(true)
    expect(firstFamily?.family).toBe('raw:summon-marker-setup')
    expect(dashboard.nextSafeGoals).toEqual(expect.arrayContaining([
      'isolate unsupported MIR call target family: raw:summon-marker-setup',
    ]))
    expect(dashboard.fixtureBoundarySummary).toBeDefined()
    expect(dashboard.fixtureBoundarySummary).toEqual(expect.objectContaining({
      setupOnlyCaseNames: ['raw_marker_controlled', 'raw_marker_first'],
      setupOnlyUnsupportedCount: 2,
      trueArithmeticUnsupportedCaseNames: ['function_call', 'marker_case_broad', 'raw_execute_other'],
      trueArithmeticUnsupportedCount: 3,
      mixedOrUnknownCaseNames: [],
      mixedOrUnknownCount: 0,
    }))
    expect(dashboard.fixtureBoundarySummary!.dominantFixtureFamilies).toEqual([
      {
        family: 'raw:summon-marker-setup',
        count: 2,
        caseNames: ['raw_marker_controlled', 'raw_marker_first'],
      },
    ])
    expect(dashboard.rawSummonMarkerSetupIsolation).toEqual(expect.objectContaining({
      status: 'mixed',
      caseCount: 2,
      broadCaseNames: ['raw_marker_first'],
      controlledCaseNames: ['raw_marker_controlled'],
      caseNames: ['raw_marker_controlled', 'raw_marker_first'],
    }))
    expect(dashboard.semanticProofCloseout).toEqual(expect.objectContaining({
      status: 'fail',
    }))
  })

  it('classifies raw summon marker setup isolation with deterministic synthetic categories', () => {
    const rawMarkerSetup = "__raw:execute unless entity @e[tag=rs_trig,limit=1] run summon minecraft:marker ~ 0 ~ {Tags:[\"rs_trig\"]}"
    const rawOnly = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 10,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'raw_broad',
        coverageCategory: 'broad',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedMirOpKinds: ['call'],
        unsupportedMirCallTargets: [{ fn: rawMarkerSetup, argCount: 0, hasResult: false }],
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 12,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'raw_none',
        coverageCategory: 'broad',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedMirOpKinds: ['call'],
        unsupportedMirCallTargets: [{ fn: rawMarkerSetup, argCount: 1, hasResult: false }],
      }),
    ])

    expect(rawOnly.rawSummonMarkerSetupIsolation).toEqual(expect.objectContaining({
      status: 'isolated-structural-setup',
      caseCount: 2,
      controlledCaseNames: [],
      broadCaseNames: ['raw_broad', 'raw_none'],
      semanticProofStatus: 'unsupported',
    }))
    expect(rawOnly.semanticProofCloseout.unsupportedCaseNames).toEqual(['raw_broad', 'raw_none'])
    expect(rawOnly.fixtureBoundarySummary).toBeDefined()
    expect(rawOnly.fixtureBoundarySummary).toEqual(expect.objectContaining({
      setupOnlyCaseNames: ['raw_broad', 'raw_none'],
      setupOnlyUnsupportedCount: 2,
      trueArithmeticUnsupportedCaseNames: [],
      trueArithmeticUnsupportedCount: 0,
      mixedOrUnknownCaseNames: [],
      mixedOrUnknownCount: 0,
    }))
    expect(rawOnly.fixtureBoundarySummary!.dominantFixtureFamilies).toEqual([
      {
        family: 'raw:summon-marker-setup',
        count: 2,
        caseNames: ['raw_broad', 'raw_none'],
      },
    ])

    const rawMixed = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 10,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'raw_controlled',
        coverageCategory: 'controlled',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedMirOpKinds: ['call'],
        unsupportedMirCallTargets: [{ fn: rawMarkerSetup, argCount: 0, hasResult: false }],
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 12,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'raw_broad_other',
        coverageCategory: 'broad',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedMirOpKinds: ['call'],
        unsupportedMirCallTargets: [{ fn: rawMarkerSetup, argCount: 1, hasResult: true }],
      }),
    ])

    expect(rawMixed.rawSummonMarkerSetupIsolation).toEqual(expect.objectContaining({
      status: 'mixed',
      caseCount: 2,
      controlledCaseNames: ['raw_controlled'],
      broadCaseNames: ['raw_broad_other'],
    }))
    expect(rawMixed.fixtureBoundarySummary).toBeDefined()
    expect(rawMixed.fixtureBoundarySummary).toEqual(expect.objectContaining({
      setupOnlyCaseNames: ['raw_broad_other', 'raw_controlled'],
      setupOnlyUnsupportedCount: 2,
      trueArithmeticUnsupportedCaseNames: [],
      trueArithmeticUnsupportedCount: 0,
      mixedOrUnknownCaseNames: [],
      mixedOrUnknownCount: 0,
    }))
    expect(rawMixed.fixtureBoundarySummary!.dominantFixtureFamilies).toEqual([
      {
        family: 'raw:summon-marker-setup',
        count: 2,
        caseNames: ['raw_broad_other', 'raw_controlled'],
      },
    ])

    const noRawSummon = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 13,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'non_raw_case',
        coverageCategory: 'broad',
        unsupportedReasonTags: ['unsupported-operand-shape'],
      }),
    ])
    expect(noRawSummon.rawSummonMarkerSetupIsolation.status).toBe('none')
    expect(noRawSummon.rawSummonMarkerSetupIsolation.caseNames).toEqual([])
    expect(noRawSummon.fixtureBoundarySummary).toBeDefined()
    expect(noRawSummon.fixtureBoundarySummary).toEqual(expect.objectContaining({
      setupOnlyCaseNames: [],
      setupOnlyUnsupportedCount: 0,
      trueArithmeticUnsupportedCaseNames: [],
      trueArithmeticUnsupportedCount: 0,
      mixedOrUnknownCaseNames: ['non_raw_case'],
      mixedOrUnknownCount: 1,
      dominantFixtureFamilies: [],
    }))
  })

  it('supports explicit fixture-boundary split when true arithmetic and setup-only blockers coexist', () => {
    const rawMarkerSetup = "__raw:execute unless entity @e[tag=rs_trig,limit=1] run summon minecraft:marker ~ 0 ~ {Tags:[\"rs_trig\"]}"
    const dashboard = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 20,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'setup_only_case',
        coverageCategory: 'broad',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedMirCallTargets: [{ fn: rawMarkerSetup, argCount: 0, hasResult: false }],
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 16,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'true_arithmetic_case',
        coverageCategory: 'controlled',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedMirOpKinds: ['call'],
        unsupportedReason: "unsupported instruction 'call' in 'probe_math'; fn='double_div' args=1 hasResult=true",
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 14,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'mixed_case',
        coverageCategory: 'broad',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedMirOpKinds: ['call'],
        unsupportedMirCallTargets: [
          { fn: rawMarkerSetup, argCount: 0, hasResult: false },
          { fn: 'double_div', argCount: 1, hasResult: true },
        ],
      }),
    ])

    expect(dashboard.fixtureBoundarySummary).toBeDefined()
    expect(dashboard.fixtureBoundarySummary).toEqual(expect.objectContaining({
      setupOnlyCaseNames: ['setup_only_case'],
      setupOnlyUnsupportedCount: 1,
      trueArithmeticUnsupportedCaseNames: ['true_arithmetic_case'],
      trueArithmeticUnsupportedCount: 1,
      mixedOrUnknownCaseNames: ['mixed_case'],
      mixedOrUnknownCount: 1,
    }))
    expect(dashboard.fixtureBoundarySummary!.dominantFixtureFamilies).toEqual([
      {
        family: 'raw:summon-marker-setup',
        count: 2,
        caseNames: ['mixed_case', 'setup_only_case'],
      },
    ])
    expect(dashboard.status).toBe('stay-experimental')
  })

  it('setup-only unsupported cases do not satisfy semantic proof or go/no-go conditions', () => {
    const rawMarkerSetup = "__raw:execute unless entity @e[tag=rs_trig,limit=1] run summon minecraft:marker ~ 0 ~ {Tags:[\"rs_trig\"]}"
    const dashboard = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 20,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'setup_only_case',
        coverageCategory: 'broad',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedMirCallTargets: [{ fn: rawMarkerSetup, argCount: 0, hasResult: false }],
      }),
    ])

    expect(dashboard.semanticProofSummary.unsupportedCount).toBe(1)
    expect(dashboard.semanticProofCloseout.unsupportedCaseNames).toEqual(['setup_only_case'])
    expect(dashboard.blockers).toEqual(expect.arrayContaining(['semantic-proof-gap']))
    expect(dashboard.goNoGoStatus).toBe('stay-experimental')
    expect(dashboard.rawSummonMarkerSetupIsolation.status).toBe('isolated-structural-setup')
  })

  it('proves one controlled arithmetic probe via a deterministic offline witness and keeps others unproven', () => {
    const proven = runArithmeticProbeReport('int_arithmetic', [1]).cases[0]
    const unprovenControl = runArithmeticProbeReport('int_const_var_mix', [1]).cases[0]
    const unsupported = runArithmeticProbeReport('branched_arithmetic', [1]).cases[0]

    expect(proven.virDecision?.status).toBe('ok')
    expect(proven.virDecision?.semanticProofStatus).toBe('proven')
    expect(proven.virDecision?.semanticProofDetails).toEqual(expect.objectContaining({
      status: 'proven',
      method: 'fixture-expected-output',
      reason: expect.stringContaining('witness'),
    }))

    expect(unprovenControl.virDecision?.status).toBe('ok')
    expect(unprovenControl.virDecision?.semanticProofStatus).toBe('unproven')
    expect(unprovenControl.virDecision?.semanticProofDetails?.status).toBe('unproven')
    expect(unprovenControl.virDecision?.semanticProofDetails?.method).toBe('none')

    expect(unsupported.virDecision?.status).toBe('unsupported')
    expect(unsupported.virDecision?.semanticProofStatus).toBe('unsupported')
    expect(unsupported.virDecision?.semanticProofDetails?.status).toBe('unsupported')
  })

  it('keeps deterministic semantic proof aggregates conservative with mixed supported/unproven/unsupported cases', () => {
    const dashboard = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('ok', {
        directCommandCount: 30,
        plannedCommandCount: 24,
        directScoreCopyCount: 10,
        plannedScoreCopyCount: 8,
        acceptedFunctionCount: 1,
        caseName: 'probe_proven',
        coverageCategory: 'controlled',
        semanticProofStatus: 'proven',
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 25,
        plannedCommandCount: 24,
        directScoreCopyCount: 9,
        plannedScoreCopyCount: 8,
        acceptedFunctionCount: 1,
        caseName: 'probe_unproven',
        coverageCategory: 'controlled',
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 30,
        plannedCommandCount: 0,
        directScoreCopyCount: 10,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'probe_unsupported',
        coverageCategory: 'broad',
      }),
    ])

    expect(dashboard.semanticProofSummary).toEqual(expect.objectContaining({
      provenEquivalentCount: 1,
      unsupportedCount: 1,
      missingProofCount: 1,
      unprovenCount: 1,
    }))

    expect(dashboard.semanticProofCloseout).toEqual(expect.objectContaining({
      status: 'fail',
      provenSupportedCount: 1,
      supportedButUnprovenCount: 1,
      unsupportedCount: 1,
      provenSupportedCaseNames: ['probe_proven'],
      supportedButUnprovenCaseNames: ['probe_unproven'],
      unsupportedCaseNames: ['probe_unsupported'],
    }))

    expect(dashboard.goNoGoStatus).toBe('stay-experimental')
  })

  it('preserves per-case MIR op kind drilldown and avoids synthetic details for non-MIR blockers', () => {
    const dashboard = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 12,
        plannedCommandCount: 0,
        directScoreCopyCount: 4,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'control_flow',
        coverageCategory: 'controlled',
        unsupportedReasonTags: ['unsupported-control-flow-shape'],
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 22,
        plannedCommandCount: 0,
        directScoreCopyCount: 6,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'mir_only',
        coverageCategory: 'broad',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedReason: "unsupported instruction 'arith.div' in 'probe_mir'",
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 15,
        plannedCommandCount: 13,
        directScoreCopyCount: 5,
        plannedScoreCopyCount: 4,
        acceptedFunctionCount: 1,
        caseName: 'ok_case',
        coverageCategory: 'controlled',
        unsupportedReasonTags: [],
      }),
    ])

    const nonMirEntry = dashboard.caseBlockerMatrix.find(entry => entry.caseName === 'control_flow')
    expect(nonMirEntry?.unsupportedMirOpKinds).toBeUndefined()
    expect(nonMirEntry?.unsupportedMirCallTargets).toBeUndefined()

    const mirEntry = dashboard.caseBlockerMatrix.find(entry => entry.caseName === 'mir_only')
    expect(mirEntry?.unsupportedMirOpKinds).toEqual(['arith.div'])
    expect(mirEntry?.unsupportedMirCallTargets).toBeUndefined()
  })

  it('does not fabricate call-target drilldown for non-call blockers', () => {
    const dashboard = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 12,
        plannedCommandCount: 0,
        directScoreCopyCount: 4,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'control_flow',
        coverageCategory: 'controlled',
        unsupportedReasonTags: ['unsupported-control-flow-shape'],
        unsupportedReason: 'unsupported multi-block function',
        unsupportedMirOpKinds: ['branch'],
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 16,
        plannedCommandCount: 0,
        directScoreCopyCount: 4,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'arith_only',
        coverageCategory: 'broad',
        unsupportedReasonTags: ['unsupported-mir-op-kind'],
        unsupportedReason: "unsupported instruction 'arith.mul' in 'probe_mir'",
        unsupportedMirOpKinds: ['arith.mul'],
      }),
    ])

    const warnings = dashboard.readinessChecklist.find(item => item.id === 'unknown-call-target-details')
    expect(warnings?.status).toBe('pass')
    expect(dashboard.unsupportedMirCallTargetBreakdown).toEqual([])
    expect(dashboard.unsupportedMirCallTargetFamilyBreakdown).toEqual([])
    expect(dashboard.caseBlockerMatrix.every(entry => entry.unsupportedMirCallTargets === undefined)).toBe(true)
  })

  it('summarizes unsupported reason breakdown deterministically by count then reason', () => {
    const dashboard = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('ok', {
        directCommandCount: 42,
        plannedCommandCount: 31,
        directScoreCopyCount: 10,
        plannedScoreCopyCount: 9,
        acceptedFunctionCount: 1,
        caseName: 'control_alpha',
        coverageCategory: 'controlled',
        unsupportedReasonTags: ['unsupported-operand-shape', 'unsupported-control-flow-shape'],
        semanticProofStatus: 'proven',
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 50,
        plannedCommandCount: 30,
        directScoreCopyCount: 12,
        plannedScoreCopyCount: 10,
        acceptedFunctionCount: 1,
        caseName: 'controlled_beta',
        coverageCategory: 'controlled',
        unsupportedReasonTags: ['unsupported-operand-shape'],
        semanticProofStatus: 'proven',
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 60,
        plannedCommandCount: 30,
        directScoreCopyCount: 15,
        plannedScoreCopyCount: 12,
        acceptedFunctionCount: 1,
        caseName: 'broad_gamma',
        coverageCategory: 'broad',
        unsupportedReasonTags: ['unsupported-call-boundary'],
        semanticProofStatus: 'proven',
      }),
    ])

    expect(dashboard.unsupportedReasonBreakdown).toEqual([
      {
        reason: 'unsupported-operand-shape',
        count: 2,
        caseNames: ['control_alpha', 'controlled_beta'],
        controlledCaseNames: ['control_alpha', 'controlled_beta'],
        broadCaseNames: [],
      },
      {
        reason: 'unsupported-call-boundary',
        count: 1,
        caseNames: ['broad_gamma'],
        controlledCaseNames: [],
        broadCaseNames: ['broad_gamma'],
      },
      {
        reason: 'unsupported-control-flow-shape',
        count: 1,
        caseNames: ['control_alpha'],
        controlledCaseNames: ['control_alpha'],
        broadCaseNames: [],
      },
    ])
  })

  it('builds a deterministic per-case blocker matrix and preserves unsupported/proof-gap status', () => {
    const dashboard = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 12,
        plannedCommandCount: 0,
        directScoreCopyCount: 4,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'zeta_probe',
        coverageCategory: 'controlled',
        unsupportedReasonTags: ['unsupported-control-flow-shape'],
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 18,
        plannedCommandCount: 15,
        directScoreCopyCount: 6,
        plannedScoreCopyCount: 4,
        acceptedFunctionCount: 1,
        semanticProofStatus: 'proven',
        caseName: 'alpha_probe',
        coverageCategory: 'broad',
        unsupportedReasonTags: ['unsupported-operand-shape'],
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 20,
        plannedCommandCount: 16,
        directScoreCopyCount: 6,
        plannedScoreCopyCount: 3,
        acceptedFunctionCount: 1,
        caseName: 'mid_probe',
        coverageCategory: 'controlled',
      }),
    ])

    const names = dashboard.caseBlockerMatrix.map(entry => entry.caseName)
    expect(names).toEqual(['alpha_probe', 'mid_probe', 'zeta_probe'])

    const unsupportedEntry = dashboard.caseBlockerMatrix.find(entry => entry.caseName === 'zeta_probe')
    expect(unsupportedEntry).toEqual(expect.objectContaining({
      status: 'unsupported',
      coverageCategory: 'controlled',
      blockerTags: expect.arrayContaining(['case-unsupported', 'proof-gap']),
    }))

    const unprovenEntry = dashboard.caseBlockerMatrix.find(entry => entry.caseName === 'mid_probe')
    expect(unprovenEntry).toEqual(expect.objectContaining({
      status: 'ok',
      semanticProofStatus: 'unproven',
      blockerTags: expect.arrayContaining(['proof-gap']),
    }))
    expect(unprovenEntry?.commandDelta).toBe(-4)
    expect(unprovenEntry?.scoreCopyDelta).toBe(-3)
  })

  it('generates deterministic readiness checklist pass/warn/fail cases for synthetic inputs', () => {
    const pass = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('ok', {
        directCommandCount: 120,
        plannedCommandCount: 90,
        directScoreCopyCount: 50,
        plannedScoreCopyCount: 34,
        acceptedFunctionCount: 1,
        semanticProofStatus: 'proven',
        unsupportedReasonTags: [],
        caseName: 'probe-a',
        modeTotals: {
          acceptedPlanned: 1,
          acceptedDirect: 0,
          rejectedDirect: 0,
        },
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 110,
        plannedCommandCount: 80,
        directScoreCopyCount: 45,
        plannedScoreCopyCount: 32,
        acceptedFunctionCount: 1,
        semanticProofStatus: 'proven',
        unsupportedReasonTags: [],
        caseName: 'probe-b',
        modeTotals: {
          acceptedPlanned: 1,
          acceptedDirect: 0,
          rejectedDirect: 0,
        },
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 100,
        plannedCommandCount: 70,
        directScoreCopyCount: 40,
        plannedScoreCopyCount: 30,
        acceptedFunctionCount: 1,
        semanticProofStatus: 'proven',
        unsupportedReasonTags: [],
        caseName: 'probe-c',
        modeTotals: {
          acceptedPlanned: 1,
          acceptedDirect: 0,
          rejectedDirect: 0,
        },
      }),
    ])

    expect(pass.status).toBe('continue')
    expect(pass.readinessChecklist.every(item => item.status === 'pass')).toBe(true)

    const fail = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 50,
        plannedCommandCount: 40,
        directScoreCopyCount: 10,
        plannedScoreCopyCount: 8,
        unsupportedFunctionCount: 1,
        caseName: 'fail_case',
        unsupportedReason: "unsupported macro function 'legacy'",
        unsupportedReasonTags: [],
      }),
    ])
    expect(fail.status).toBe('stay-experimental')
    const unsupportedCaseCheck = fail.readinessChecklist.find(item => item.id === 'unsupported-case-coverage')
    expect(unsupportedCaseCheck).toEqual(expect.objectContaining({ status: 'fail' }))

    const warn = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('ok', {
        directCommandCount: 18,
        plannedCommandCount: 20,
        directScoreCopyCount: 20,
        plannedScoreCopyCount: 14,
        acceptedFunctionCount: 1,
        semanticProofStatus: 'proven',
        coverageCategory: 'controlled',
        modeTotals: {
          acceptedPlanned: 1,
          acceptedDirect: 0,
          rejectedDirect: 0,
        },
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 16,
        plannedCommandCount: 18,
        directScoreCopyCount: 18,
        plannedScoreCopyCount: 12,
        acceptedFunctionCount: 1,
        semanticProofStatus: 'proven',
        coverageCategory: 'controlled',
        modeTotals: {
          acceptedPlanned: 1,
          acceptedDirect: 0,
          rejectedDirect: 0,
        },
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 22,
        plannedCommandCount: 24,
        directScoreCopyCount: 25,
        plannedScoreCopyCount: 17,
        acceptedFunctionCount: 1,
        semanticProofStatus: 'proven',
        coverageCategory: 'controlled',
        modeTotals: {
          acceptedPlanned: 1,
          acceptedDirect: 0,
          rejectedDirect: 0,
        },
      }),
    ])
    expect(warn.status).toBe('pause')
    const commandRegressionCheck = warn.readinessChecklist.find(item => item.id === 'command-regressions')
    expect(commandRegressionCheck?.status).toBe('warn')
    expect(warn.readinessChecklist.filter(item => item.status === 'fail').length).toBe(0)
  })

  it('tracks unknown reason case names deterministically and keeps unknowns from counting as passable', () => {
    const dashboard = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 20,
        plannedCommandCount: 0,
        directScoreCopyCount: 4,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'zeta_unknown',
        unsupportedReason: 'this reason is not structured',
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 24,
        plannedCommandCount: 0,
        directScoreCopyCount: 4,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'alpha_unknown',
        unsupportedReason: 'another old reason path',
      }),
    ])

    expect(dashboard.unknownReasonCaseNames).toEqual(['alpha_unknown', 'zeta_unknown'])
    const unknownReasonCheck = dashboard.readinessChecklist.find(item => item.id === 'unknown-reason-cases')
    expect(unknownReasonCheck?.status).toBe('warn')
    expect(dashboard.unsupportedReasonTotals).toHaveProperty('unsupported-unknown')
    expect(dashboard.unsupportedReasonBreakdown[0]).toEqual(expect.objectContaining({
      reason: 'unsupported-unknown',
      caseNames: ['alpha_unknown', 'zeta_unknown'],
    }))
  })

  it('merges rejection-category totals deterministically across all cases', () => {
    const report = runArithmeticProbeReport('all', [1])
    const merged = {
      planned_unsupported: 0,
      allocation_check_failed: 0,
      higher_cost: 0,
      direct_unsupported: 0,
      unsupported_both: 0,
    }

    for (const result of report.cases) {
      if (!result.virDecision) continue
      merged.planned_unsupported += result.virDecision.rejectionCategoryCounts.planned_unsupported
      merged.allocation_check_failed += result.virDecision.rejectionCategoryCounts.allocation_check_failed
      merged.higher_cost += result.virDecision.rejectionCategoryCounts.higher_cost
      merged.direct_unsupported += result.virDecision.rejectionCategoryCounts.direct_unsupported
      merged.unsupported_both += result.virDecision.rejectionCategoryCounts.unsupported_both
    }

    expect(report.virDecisionDashboard.rejectionCategoryTotals).toEqual(merged)
  })

  it('merges unsupported reason totals and blocker tags deterministically with synthetic inputs', () => {
    const dashboard = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 90,
        plannedCommandCount: 80,
        directScoreCopyCount: 40,
        plannedScoreCopyCount: 38,
        unsupportedFunctionCount: 1,
        unsupportedReasonTags: ['unsupported-operand-shape', 'unsupported-call-boundary', 'unsupported-unknown'],
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 20,
        plannedCommandCount: 18,
        directScoreCopyCount: 9,
        plannedScoreCopyCount: 8,
        unsupportedFunctionCount: 1,
        unsupportedReasonTags: ['unsupported-control-flow-shape', 'unsupported-operand-shape'],
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 12,
        plannedCommandCount: 10,
        directScoreCopyCount: 4,
        plannedScoreCopyCount: 2,
        acceptedFunctionCount: 1,
        unsupportedReasonTags: ['unsupported-operand-shape'],
      }),
    ])

    expect(dashboard.unsupportedReasonTotals).toEqual({
      'unsupported-operand-shape': 3,
      'unsupported-call-boundary': 1,
      'unsupported-unknown': 1,
      'unsupported-control-flow-shape': 1,
    })
    expect(dashboard.topUnsupportedReasons).toEqual([
      { reason: 'unsupported-operand-shape', count: 3 },
      { reason: 'unsupported-call-boundary', count: 1 },
      { reason: 'unsupported-control-flow-shape', count: 1 },
      { reason: 'unsupported-unknown', count: 1 },
    ])
    expect(dashboard.blockerTagTotals).toEqual(expect.objectContaining({
      'case-unsupported': 2,
      'proof-gap': 3,
      'reason:unsupported-operand-shape': 3,
      'reason:unsupported-call-boundary': 1,
      'reason:unsupported-unknown': 1,
      'reason:unsupported-control-flow-shape': 1,
    }))
    const sortedTags = Object.keys(dashboard.blockerTagTotals).sort()
    expect(Object.keys(dashboard.blockerTagTotals)).toEqual(sortedTags)
  })

  it('falls back to deterministic text mapping when unsupported reason tags are missing', () => {
    const dashboard = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 15,
        plannedCommandCount: 12,
        directScoreCopyCount: 6,
        plannedScoreCopyCount: 4,
        unsupportedFunctionCount: 1,
        unsupportedReason: "unsupported macro function 'legacy_fn'",
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 22,
        plannedCommandCount: 16,
        directScoreCopyCount: 10,
        plannedScoreCopyCount: 6,
        unsupportedFunctionCount: 1,
        unsupportedReason: 'unsupported multi-block function',
      }),
    ])

    expect(dashboard.unsupportedReasonTotals).toEqual({
      'unsupported-call-boundary': 1,
      'unsupported-control-flow-shape': 1,
    })
    expect(dashboard.topUnsupportedReasons).toEqual([
      { reason: 'unsupported-call-boundary', count: 1 },
      { reason: 'unsupported-control-flow-shape', count: 1 },
    ])
  })

  it('prefers structured tags from run-time probe results over legacy text tags when present', () => {
    const dashboard = runArithmeticProbeReport('branched_arithmetic', [1])
    const [result] = dashboard.cases

    expect(result.virDecision?.status).toBe('unsupported')
    expect(result.virDecision?.unsupportedReasonTags).toEqual(expect.arrayContaining([
      'unsupported-control-flow-shape',
    ]))
    expect(result.virDecision?.unsupportedReasonTags).not.toContain('unsupported-unknown')
  })

  it('merges rejection-category totals deterministically with partial or unknown input', () => {
    const merged = {
      planned_unsupported: 0,
      allocation_check_failed: 0,
      higher_cost: 0,
      direct_unsupported: 0,
      unsupported_both: 0,
    }

    mergeRejectionCategoryTotals(merged, {
      planned_unsupported: 2,
      allocation_check_failed: 1,
      // @ts-expect-error test intentionally sends unknown keys
      unknownCategory: 9,
    })
    mergeRejectionCategoryTotals(merged, {
      direct_unsupported: 4,
    })

    expect(merged.planned_unsupported).toBe(2)
    expect(merged.allocation_check_failed).toBe(1)
    expect(merged.direct_unsupported).toBe(4)
    expect(merged.higher_cost).toBe(0)
    expect(merged.unsupported_both).toBe(0)
  })

  it('computes direct/planned command and score_copy deltas at aggregate level', () => {
    const report = runArithmeticProbeReport('all', [1])
    const dashboard = report.virDecisionDashboard

    const totalDirectCommands = report.cases.reduce(
      (sum, result) => sum + (result.virDecision?.directCommandCount ?? 0),
      0,
    )
    const totalPlannedCommands = report.cases.reduce(
      (sum, result) => sum + (result.virDecision?.plannedCommandCount ?? 0),
      0,
    )
    const totalDirectScoreCopies = report.cases.reduce(
      (sum, result) => sum + (result.virDecision?.directScoreCopyCount ?? 0),
      0,
    )
    const totalPlannedScoreCopies = report.cases.reduce(
      (sum, result) => sum + (result.virDecision?.plannedScoreCopyCount ?? 0),
      0,
    )

    expect(dashboard.directCommandCount).toBe(totalDirectCommands)
    expect(dashboard.plannedCommandCount).toBe(totalPlannedCommands)
    expect(dashboard.directScoreCopyCount).toBe(totalDirectScoreCopies)
    expect(dashboard.plannedScoreCopyCount).toBe(totalPlannedScoreCopies)
    expect(dashboard.directVsPlannedCommandDelta).toBe(totalPlannedCommands - totalDirectCommands)
    expect(dashboard.directVsPlannedScoreCopyDelta).toBe(totalPlannedScoreCopies - totalDirectScoreCopies)
  })

  it('computes deterministic command/score-copy delta summaries with unsupported and empty subsets', () => {
    const supportedOnly = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('ok', {
        directCommandCount: 30,
        plannedCommandCount: 24,
        directScoreCopyCount: 10,
        plannedScoreCopyCount: 8,
        acceptedFunctionCount: 1,
      }),
      makeSyntheticProbeResult('ok', {
        directCommandCount: 10,
        plannedCommandCount: 12,
        directScoreCopyCount: 4,
        plannedScoreCopyCount: 2,
        acceptedFunctionCount: 1,
      }),
    ])

    expect(supportedOnly.commandDeltaSummary).toEqual(expect.objectContaining({
      min: -6,
      max: 2,
      total: -4,
      average: -2,
      improvedCount: 1,
      regressedCount: 1,
      unchangedCount: 0,
    }))
    expect(supportedOnly.scoreCopyDeltaSummary).toEqual(expect.objectContaining({
      min: -2,
      max: -2,
      total: -4,
      average: -2,
      improvedCount: 2,
      regressedCount: 0,
      unchangedCount: 0,
    }))

    const mixedWithUnsupported = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 100,
        plannedCommandCount: 90,
        directScoreCopyCount: 40,
        plannedScoreCopyCount: 30,
        unsupportedFunctionCount: 1,
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 4,
        plannedCommandCount: 3,
        directScoreCopyCount: 2,
        plannedScoreCopyCount: 1,
        unsupportedFunctionCount: 2,
      }),
    ])

    expect(mixedWithUnsupported.commandDeltaSummary).toEqual(
      expect.objectContaining({
        min: 0,
        max: 0,
        total: 0,
        average: 0,
        improvedCount: 0,
        regressedCount: 0,
        unchangedCount: 0,
      }),
    )
    expect(mixedWithUnsupported.scoreCopyDeltaSummary).toEqual(
      expect.objectContaining({
        min: 0,
        max: 0,
        total: 0,
        average: 0,
      }),
    )
    expect(mixedWithUnsupported.unsupportedCases).toBe(2)
    expect(mixedWithUnsupported.supportedCases).toBe(0)
  })

  it('reports estimated static cost dimensions for execute, selectors, NBT, macros, and setup hints', () => {
    const summary = summarizeCommandCosts([
      {
        path: 'data/test/function/probe.mcfunction',
        content: [
          'execute as @e[tag=rs_div] run function math:step',
          'execute as @a run tp @s ~ ~ ~',
          'execute as @e[tag=foo,limit=1] run data get storage rs:math_hp scale',
          'data get entity @e[tag=foo,limit=1] Pos[2] 10000.0',
          'data modify storage rs:math_hp div_mat set from storage rs:math_hp matrix',
          'data modify storage rs:math_hp scale set from storage rs:math_hp root.leaf[0]',
          'function __NS__:__ddiv_set_mat with storage rs:d args',
          'summon minecraft:block_display ~ 0 ~ {Tags:["rs_div"]}',
          'tp @e[tag=rs_div,limit=1] 0 0 0',
          '$execute as @e[tag=rs_div,limit=1] run function math:step',
        ].join('\n'),
      },
    ])

    expect(summary.forks.executeAs).toBe(4)
    expect(summary.forks.executeAsEntity).toBe(3)
    expect(summary.forks.executeAsPlayer).toBe(1)
    expect(summary.forks.executeAsBroad).toBe(2)
    expect(summary.forks.runFunctionInsideExecuteAs).toBe(2)
    expect(summary.forks.estimatedForkUnits).toBe(148)

    expect(summary.selector.mentions).toBe(7)
    expect(summary.selector.broadMentions).toBe(2)
    expect(summary.selector.broadRiskLevel).toBe('medium')

    expect(summary.nbt.scalarReads).toBe(2)
    expect(summary.nbt.wholeListCopies).toBe(2)

    expect(summary.macro.commandCount).toBe(1)
    expect(summary.macro.withStorageCalls).toBe(1)

    expect(summary.setupHints.entitySetupCommands).toBe(3)
    expect(summary.setupHints.displaySetupCommands).toBe(1)
    expect(summary.setupHints.entityTypes).toContain('minecraft:block_display')
    expect(summary.setupHints.entityTags).toContain('rs_div')
    expect(summary.setupHints.hasTransformationReads).toBe(false)
  })

  it('includes VIR direct/planned decision fields with rejection categories', () => {
    const report = runArithmeticProbeReport('int_arithmetic', [1])
    const [result] = report.cases

    expect(result.virDecision).toBeDefined()
    expect(result.virDecision?.directCommandCount).toBeGreaterThan(0)
    expect(result.virDecision?.plannedCommandCount).toBeGreaterThanOrEqual(0)
    expect(result.virDecision?.selectedMode).toBeDefined()
    expect(result.virDecision?.status === 'ok' || result.virDecision?.status === 'unsupported').toBe(true)
    expect(result.virDecision?.rejectionCategoryCounts).toEqual(expect.objectContaining({
      planned_unsupported: expect.any(Number),
      allocation_check_failed: expect.any(Number),
      higher_cost: expect.any(Number),
      direct_unsupported: expect.any(Number),
      unsupported_both: expect.any(Number),
    }))
    expect(result.virDecision?.modeTotals).toBeDefined()
  })

  it('merges VIR decision payload while keeping probe output stable', () => {
    const report = runArithmeticProbeReport('all', [1])
    expect(report.cases.length).toBeGreaterThan(0)
    for (const result of report.cases) {
      expect(result.virDecision).toBeDefined()
      if (result.virDecision?.status === 'unsupported') {
        expect(result.virDecision.unsupportedReason).toBeDefined()
      }
    }
  })

  const ZERO_DELTA_SUMMARY = {
    min: 0,
    max: 0,
    total: 0,
    average: 0,
    improvedCount: 0,
    regressedCount: 0,
    unchangedCount: 0,
  }

  it('evaluates VIR go/no-go states deterministically for synthetic inputs', () => {
    const base = {
      totalCaseCount: 3,
      consideredCases: 3,
      consideredFunctions: 3,
      totalFunctionCount: 3,
      supportedCases: 3,
      unsupportedCases: 0,
      plannedAcceptedFunctionCount: 3,
      directAcceptedFunctionCount: 0,
      directRejectedFunctionCount: 0,
      directSelectedFunctionCount: 0,
      plannedSelectedFunctionCount: 3,
      acceptedPlannedCases: 3,
      selectedDirectCases: 0,
      rejectedDirectCases: 0,
      unsupportedFunctionCount: 0,
      unsupportedCaseCount: 0,
      rejectionCategoryTotals: ZERO_REJECTION_CATEGORY_TOTALS,
      directCommandCount: 150,
      plannedCommandCount: 120,
      directScoreCopyCount: 90,
      plannedScoreCopyCount: 70,
      directVsPlannedCommandDelta: -30,
      directVsPlannedScoreCopyDelta: -20,
      directToPlannedScoreCopyReductionPercent: 22.2,
      commandDeltaSummary: summarizeDeltaSeries([-30]),
      scoreCopyDeltaSummary: summarizeDeltaSeries([-20]),
      semanticProofSummary: {
        provenEquivalentCount: 3,
        unsupportedCount: 0,
        missingProofCount: 0,
        unprovenCount: 0,
      },
    }

    expect(evaluateVirDecisionGoNoGoStatus(base)).toBe('continue')

    expect(evaluateVirDecisionGoNoGoStatus({
      ...base,
      unsupportedCases: 1,
      unsupportedCaseCount: 1,
      supportedCases: 2,
    })).toBe('stay-experimental')

    expect(evaluateVirDecisionGoNoGoStatus({
      ...base,
      commandDeltaSummary: summarizeDeltaSeries([1]),
    }, {
      ...VIR_ARITHMETIC_DECISION_THRESHOLDS,
      maxRegressedScoreCopyCaseCount: 0,
      maxRegressedCommandCaseCount: 0,
    })).toBe('pause')

    expect(evaluateVirDecisionGoNoGoStatus({
      totalCaseCount: 10,
      consideredCases: 10,
      consideredFunctions: 10,
      totalFunctionCount: 10,
      supportedCases: 10,
      rejectedDirectCases: 8,
      plannedAcceptedFunctionCount: 10,
      directAcceptedFunctionCount: 0,
      directRejectedFunctionCount: 0,
      directSelectedFunctionCount: 0,
      plannedSelectedFunctionCount: 10,
      acceptedPlannedCases: 10,
      selectedDirectCases: 0,
      unsupportedFunctionCount: 0,
      unsupportedCaseCount: 0,
      unsupportedCases: 0,
      rejectionCategoryTotals: ZERO_REJECTION_CATEGORY_TOTALS,
      directCommandCount: 20,
      plannedCommandCount: 10,
      directScoreCopyCount: 10,
      plannedScoreCopyCount: 5,
      directVsPlannedCommandDelta: -10,
      directVsPlannedScoreCopyDelta: -5,
      directToPlannedScoreCopyReductionPercent: 50,
      commandDeltaSummary: summarizeDeltaSeries([-1, -1, -1, -1, -1, -1, -1, -1, -1, -1]),
      scoreCopyDeltaSummary: summarizeDeltaSeries([-1, -1, -1, -1, -1, -1, -1, -1, -1, -1]),
      semanticProofSummary: {
        provenEquivalentCount: 10,
        unsupportedCount: 0,
        missingProofCount: 0,
        unprovenCount: 0,
      },
    })).toBe('stay-experimental')

    expect(evaluateVirDecisionGoNoGoStatus({
      totalCaseCount: 2,
      consideredCases: 2,
      consideredFunctions: 2,
      totalFunctionCount: 2,
      supportedCases: 0,
      unsupportedCases: 2,
      plannedAcceptedFunctionCount: 0,
      directAcceptedFunctionCount: 0,
      directRejectedFunctionCount: 0,
      directSelectedFunctionCount: 0,
      plannedSelectedFunctionCount: 0,
      acceptedPlannedCases: 0,
      selectedDirectCases: 0,
      rejectedDirectCases: 0,
      unsupportedFunctionCount: 2,
      unsupportedCaseCount: 2,
      rejectionCategoryTotals: ZERO_REJECTION_CATEGORY_TOTALS,
      directCommandCount: 12,
      plannedCommandCount: 20,
      directScoreCopyCount: 10,
      plannedScoreCopyCount: 6,
      directVsPlannedCommandDelta: 8,
      directVsPlannedScoreCopyDelta: -4,
      directToPlannedScoreCopyReductionPercent: 40,
      commandDeltaSummary: ZERO_DELTA_SUMMARY,
      scoreCopyDeltaSummary: ZERO_DELTA_SUMMARY,
      semanticProofSummary: {
        provenEquivalentCount: 0,
        unsupportedCount: 2,
        missingProofCount: 0,
        unprovenCount: 0,
      },
    })).toBe('stay-experimental')
  })

  it('does not treat unsupported proof as success and keeps proof-gap blockers visible', () => {
    const dashboard = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('ok', {
        directCommandCount: 10,
        plannedCommandCount: 8,
        directScoreCopyCount: 4,
        plannedScoreCopyCount: 2,
        acceptedFunctionCount: 1,
        caseName: 'probeA',
        semanticProofStatus: 'proven',
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 4,
        plannedCommandCount: 0,
        directScoreCopyCount: 3,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'probeB',
      }),
    ])

    expect(dashboard.semanticProofSummary.provenEquivalentCount).toBe(1)
    expect(dashboard.semanticProofSummary.unsupportedCount).toBe(1)
    expect(dashboard.semanticProofSummary.missingProofCount).toBe(0)
    expect(dashboard.unsupportedCaseCount).toBe(1)
    expect(dashboard.blockers.join(',')).toContain('semantic-proof-gap')
    if (dashboard.blockers.length > 0) {
      expect(dashboard.blockers).toContain('unsupported-case-coverage')
      expect(dashboard.blockers).toContain('semantic-proof-gap')
    }

    expect(dashboard.semanticProofCloseout).toEqual(expect.objectContaining({
      status: 'fail',
      provenSupportedCount: 1,
      unsupportedCount: 1,
      supportedButUnprovenCount: 0,
      provenSupportedCaseNames: ['probeA'],
      supportedButUnprovenCaseNames: [],
      unsupportedCaseNames: ['probeB'],
    }))
    expect(dashboard.semanticProofCloseout.unsupportedCaseNames).not.toContain('probeA')
  })

  it('summarizes allocation-check closeout deterministically with affected cases and limitation note', () => {
    const dashboard = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 9,
        plannedCommandCount: 0,
        directScoreCopyCount: 4,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'alloc_case_one',
        coverageCategory: 'broad',
        unsupportedReasonTags: ['allocation-check-failure'],
        rejectionCategoryCounts: {
          allocation_check_failed: 1,
          planned_unsupported: 0,
          higher_cost: 0,
          direct_unsupported: 0,
          unsupported_both: 0,
        },
        unsupportedReason: "planned allocation check failed for 'probe': binary write to $v1 __arith in op 1 clobbers live root 4",
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 7,
        plannedCommandCount: 0,
        directScoreCopyCount: 4,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'alloc_case_two',
        coverageCategory: 'controlled',
        unsupportedReasonTags: ['unsupported-operand-shape'],
        rejectionCategoryCounts: {
          allocation_check_failed: 0,
          planned_unsupported: 0,
          higher_cost: 0,
          direct_unsupported: 1,
          unsupported_both: 0,
        },
      }),
    ])

    expect(dashboard.allocationCheckCloseout).toEqual(expect.objectContaining({
      status: 'fail',
      allocationCheckFailureCount: 1,
      affectedCaseCount: 1,
      affectedFunctionCount: 1,
      affectedCaseNames: ['alloc_case_one'],
      functionNamesAvailable: false,
      allocationFailureBreakdown: expect.arrayContaining([
        {
          category: 'dead-lhs-affinity-conflict',
          count: 1,
          caseNames: ['alloc_case_one'],
          examples: expect.arrayContaining([
            expect.stringContaining("planned allocation check failed for 'probe': binary write to $v1"),
          ]),
        },
      ]),
    }))
    expect(dashboard.readinessChecklist.find(item => item.id === 'allocation-check-closeout')?.status).toBe('fail')
    expect(dashboard.nextSafeGoals).toEqual(expect.arrayContaining([
      expect.stringContaining('allocation-check'),
    ]))
  })

  it('classifies synthetic allocation failure reasons into deterministic buckets', () => {
    const dashboard = buildVirArithmeticDecisionDashboard([
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 1,
        plannedCommandCount: 0,
        directScoreCopyCount: 0,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'case_cycle',
        coverageCategory: 'controlled',
        unsupportedReasonTags: ['allocation-check-failure'],
        unsupportedReason: 'planned allocation check failed for \'probe\': parallel copy cycle requires scratch slot',
        rejectionCategoryCounts: {
          allocation_check_failed: 1,
          planned_unsupported: 0,
          higher_cost: 0,
          direct_unsupported: 0,
          unsupported_both: 0,
        },
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 1,
        plannedCommandCount: 0,
        directScoreCopyCount: 0,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'case_ret',
        coverageCategory: 'controlled',
        unsupportedReasonTags: ['allocation-check-failure'],
        unsupportedReason: 'planned allocation check failed for \'probe\': return slot missing for probe',
        rejectionCategoryCounts: {
          allocation_check_failed: 1,
          planned_unsupported: 0,
          higher_cost: 0,
          direct_unsupported: 0,
          unsupported_both: 0,
        },
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 1,
        plannedCommandCount: 0,
        directScoreCopyCount: 0,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'case_dead',
        coverageCategory: 'controlled',
        unsupportedReasonTags: ['allocation-check-failure'],
        unsupportedReason: 'planned allocation check failed for \'probe\': binary write to $v1 in op 1 clobbers live root 4',
        rejectionCategoryCounts: {
          allocation_check_failed: 1,
          planned_unsupported: 0,
          higher_cost: 0,
          direct_unsupported: 0,
          unsupported_both: 0,
        },
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 1,
        plannedCommandCount: 0,
        directScoreCopyCount: 0,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'case_dead',
        coverageCategory: 'controlled',
        unsupportedReasonTags: ['allocation-check-failure'],
        unsupportedReason: 'planned allocation check failed for \'probe_2\': binary write to $v2 in op 2 clobbers live root 5',
        rejectionCategoryCounts: {
          allocation_check_failed: 1,
          planned_unsupported: 0,
          higher_cost: 0,
          direct_unsupported: 0,
          unsupported_both: 0,
        },
      }),
      makeSyntheticProbeResult('unsupported', {
        directCommandCount: 1,
        plannedCommandCount: 0,
        directScoreCopyCount: 0,
        plannedScoreCopyCount: 0,
        unsupportedFunctionCount: 1,
        caseName: 'case_unknown',
        coverageCategory: 'broad',
        unsupportedReasonTags: ['allocation-check-failure'],
        unsupportedReason: 'planned allocation check failed for \'probe\': allocation checker rejected',
        rejectionCategoryCounts: {
          allocation_check_failed: 1,
          planned_unsupported: 0,
          higher_cost: 0,
          direct_unsupported: 0,
          unsupported_both: 0,
        },
      }),
    ])

    expect(dashboard.allocationCheckCloseout.allocationFailureBreakdown).toEqual([
      {
        category: 'parallel-copy-cycle',
        count: 1,
        caseNames: ['case_cycle'],
        examples: ['planned allocation check failed for \'probe\': parallel copy cycle requires scratch slot'],
      },
      {
        category: 'ret-precolor-conflict',
        count: 1,
        caseNames: ['case_ret'],
        examples: ['planned allocation check failed for \'probe\': return slot missing for probe'],
      },
      {
        category: 'dead-lhs-affinity-conflict',
        count: 2,
        caseNames: ['case_dead'],
        examples: [
          'planned allocation check failed for \'probe\': binary write to $v1 in op 1 clobbers live root 4',
          'planned allocation check failed for \'probe_2\': binary write to $v2 in op 2 clobbers live root 5',
        ],
      },
      {
        category: 'unknown',
        count: 1,
        caseNames: ['case_unknown'],
        examples: ['planned allocation check failed for \'probe\': allocation checker rejected'],
      },
    ])
  })

  it('does not treat unsupported probe cases as pass-like go/no-go state', () => {
    const report = runArithmeticProbeReport('all', [1])
    const dashboard = report.virDecisionDashboard

    if (dashboard.unsupportedCaseCount > 0) {
      expect(dashboard.goNoGoStatus).toBe('stay-experimental')
    }
  })

  it('reports stable top rejection categories with deterministic sort order', () => {
    const report = runArithmeticProbeReport('all', [1])
    const categories = report.virDecisionDashboard.topRejectionCategories

    const sorted = [...categories].sort((left, right) =>
      right.count - left.count || left.category.localeCompare(right.category),
    )
    expect(categories).toEqual(sorted)
  })
})
