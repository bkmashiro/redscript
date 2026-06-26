import {
  ARITHMETIC_PROBES,
  VIR_ARITHMETIC_DECISION_THRESHOLDS,
  buildVirArithmeticDecisionDashboard,
  summarizeDeltaSeries,
  mergeRejectionCategoryTotals,
  type ArithmeticProbeResult,
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
    caseName?: string
    coverageCategory?: 'controlled' | 'broad'
  },
): ArithmeticProbeResult {
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
      total: 0,
      currentlyOptimized: 0,
      safeCandidate: 0,
      blockedByBarrier: 0,
      unknown: 0,
      topOpportunities: [],
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
    }))
    expect(dashboard.readinessChecklist.find(item => item.id === 'allocation-check-closeout')?.status).toBe('fail')
    expect(dashboard.nextSafeGoals).toEqual(expect.arrayContaining([
      expect.stringContaining('allocation-check'),
    ]))
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
