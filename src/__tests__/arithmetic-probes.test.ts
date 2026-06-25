import {
  ARITHMETIC_PROBES,
  VIR_ARITHMETIC_DECISION_THRESHOLDS,
  evaluateVirDecisionGoNoGoStatus,
  runArithmeticProbeReport,
  summarizeCommandCategories,
  summarizeCommandCosts,
} from '../../benchmarks/arithmetic-probes'

describe('arithmetic probe benchmark tooling', () => {
  it('lists stable named arithmetic probes', () => {
    const names = ARITHMETIC_PROBES.map(probe => probe.name)
    expect(names).toContain('int_arithmetic')
    expect(names).toContain('fixed_mul_div')
    expect(names).toContain('double_div')
    expect(names).toContain('sin_cos_hp_separate')
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

  it('evaluates VIR go/no-go states deterministically for synthetic inputs', () => {
    const base = {
      totalCaseCount: 3,
      totalFunctionCount: 3,
      plannedAcceptedFunctionCount: 3,
      directAcceptedFunctionCount: 0,
      directRejectedFunctionCount: 0,
      directSelectedFunctionCount: 0,
      plannedSelectedFunctionCount: 3,
      unsupportedFunctionCount: 0,
      unsupportedCaseCount: 0,
      rejectionCategoryTotals: {
        planned_unsupported: 0,
        allocation_check_failed: 0,
        higher_cost: 0,
        direct_unsupported: 0,
        unsupported_both: 0,
      },
      directCommandCount: 150,
      plannedCommandCount: 120,
      directScoreCopyCount: 90,
      plannedScoreCopyCount: 70,
      directVsPlannedCommandDelta: -30,
      directVsPlannedScoreCopyDelta: -20,
      directToPlannedScoreCopyReductionPercent: 22.2,
    }

    expect(evaluateVirDecisionGoNoGoStatus(base)).toBe('continue')
    expect(evaluateVirDecisionGoNoGoStatus(base)).toBe('continue')

    expect(evaluateVirDecisionGoNoGoStatus({
      ...base,
      unsupportedCaseCount: 1,
    })).toBe('stay-experimental')

    expect(evaluateVirDecisionGoNoGoStatus({
      ...base,
      rejectionCategoryTotals: {
        ...base.rejectionCategoryTotals,
        allocation_check_failed: 1,
      },
    })).toBe('stay-experimental')

    expect(evaluateVirDecisionGoNoGoStatus({
      ...base,
      directToPlannedScoreCopyReductionPercent: 5,
      directVsPlannedScoreCopyDelta: -10,
      plannedScoreCopyCount: 86,
      directScoreCopyCount: 90,
    }, {
      ...VIR_ARITHMETIC_DECISION_THRESHOLDS,
      minScoreCopyReductionPercent: 20,
    })).toBe('pause')
  })

  it('does not treat unsupported probe cases as pass-like go/no-go state', () => {
    const report = runArithmeticProbeReport('all', [1])
    const dashboard = report.virDecisionDashboard

    if (dashboard.unsupportedCaseCount > 0) {
      expect(dashboard.goNoGoStatus).toBe('stay-experimental')
    }
  })
})
