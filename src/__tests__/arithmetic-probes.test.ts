import {
  ARITHMETIC_PROBES,
  runArithmeticProbeReport,
  summarizeCommandCategories,
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
  })

  it('categorizes macro, execute, storage, selector, and teleport commands', () => {
    const summary = summarizeCommandCategories([
      {
        path: 'data/test/function/probe.mcfunction',
        content: [
          'scoreboard players operation $a obj += $b obj',
          'execute as @e[tag=rs_div,limit=1] run tp @s ^ ^ ^1',
          '$execute store result storage rs:d __dp0 double $(scale) run data get storage rs:d __dp0 10000',
          'function test:helper with storage rs:math_hp args',
          'summon marker 0 0 0 {Tags:["rs_trig"]}',
        ].join('\n'),
      },
    ])

    expect(summary.total).toBe(5)
    expect(summary.scoreboard).toBe(1)
    expect(summary.execute).toBe(2)
    expect(summary.data).toBe(1)
    expect(summary.functionCall).toBe(1)
    expect(summary.storage).toBe(2)
    expect(summary.selector).toBe(1)
    expect(summary.teleport).toBe(1)
    expect(summary.macro).toBe(1)
    expect(summary.summon).toBe(1)
  })
})
