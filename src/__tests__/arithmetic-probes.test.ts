import {
  ARITHMETIC_PROBES,
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
})
