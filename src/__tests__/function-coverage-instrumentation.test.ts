import {
  FUNCTION_COVERAGE_OBJECTIVE,
  instrumentFunctionArtifacts,
  observeFunctionCoverage,
} from '../mc-test/function-coverage-instrumentation'

describe('test-only function coverage instrumentation', () => {
  it('instruments emitted function artifacts deterministically without mutating input', () => {
    const input = [
      { path: 'data/zeta/function/z.mcfunction', content: 'say z\n' },
      { path: 'pack.mcmeta', content: '{}' },
      { path: 'data/alpha/function/a.mcfunction', content: 'say a\n' },
    ]
    const snapshot = JSON.stringify(input)

    const first = instrumentFunctionArtifacts(input)
    const second = instrumentFunctionArtifacts(input)

    expect(JSON.stringify(input)).toBe(snapshot)
    expect(second).toEqual(first)
    expect(first.files[1]).toEqual(input[1])
    expect(first.probes.map(probe => probe.artifactPath)).toEqual([
      'data/alpha/function/a.mcfunction',
      'data/zeta/function/z.mcfunction',
    ])
    for (const probe of first.probes) {
      const file = first.files.find(candidate => candidate.path === probe.artifactPath)!
      expect(file.content).toMatch(
        new RegExp(`^scoreboard players set ${probe.marker} ${FUNCTION_COVERAGE_OBJECTIVE} 1\\n`),
      )
      expect(probe.marker.length).toBeLessThanOrEqual(40)
    }
  })

  it('rejects duplicate artifact paths instead of producing ambiguous probes', () => {
    expect(() => instrumentFunctionArtifacts([
      { path: 'data/a/function/f.mcfunction', content: 'say one' },
      { path: 'data/a/function/f.mcfunction', content: 'say two' },
    ])).toThrow(/duplicate artifact path/)
  })

  it('reads server-side probe values and distinguishes executed functions', async () => {
    const { probes } = instrumentFunctionArtifacts([
      { path: 'data/a/function/f.mcfunction', content: 'say one' },
      { path: 'data/a/function/g.mcfunction', content: 'say two' },
    ])
    const values = new Map([
      [probes[0].marker, 1],
      [probes[1].marker, 0],
    ])

    await expect(observeFunctionCoverage(
      probes,
      async player => values.get(player) ?? 0,
    )).resolves.toEqual([
      expect.objectContaining({ artifactPath: probes[0].artifactPath, executed: true }),
      expect.objectContaining({ artifactPath: probes[1].artifactPath, executed: false }),
    ])
  })
})
