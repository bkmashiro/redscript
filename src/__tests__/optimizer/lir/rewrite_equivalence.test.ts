import {
  offlineRewriteEquivalenceFamilies,
  offlineRewriteEquivalenceFixtures,
  runOfflineRewriteEquivalenceFixtures,
} from '../../../optimizer/lir/rewrite_equivalence_fixtures'

describe('offline bounded LIR rewrite equivalence fixture pack', () => {
  test('contains the required stable family names and unique fixture names', () => {
    const actualFamilies = [
      ...new Set(offlineRewriteEquivalenceFixtures.map((fixture) => fixture.family)),
    ].sort()
    const expectedFamilies = [...offlineRewriteEquivalenceFamilies].sort()
    const fixtureNames = offlineRewriteEquivalenceFixtures.map((fixture) => fixture.name)

    expect(actualFamilies).toEqual(expectedFamilies)
    expect(new Set(fixtureNames).size).toBe(fixtureNames.length)
  })

  test('exercises every fixture with expected status and captures deterministic family summaries', () => {
    const { fixtureResults, summaryByFamily, totals } =
      runOfflineRewriteEquivalenceFixtures()
    const expectedStatuses = offlineRewriteEquivalenceFixtures.reduce<Record<string, string>>(
      (acc, fixture) => {
        acc[fixture.name] = fixture.expectedStatus
        return acc
      },
      {},
    )
    const expectedFixtureNames = offlineRewriteEquivalenceFixtures.map((fixture) => fixture.name)

    expect(fixtureResults.map((result) => result.name).sort()).toEqual(expectedFixtureNames.sort())

    for (const result of fixtureResults) {
      expect(result.expectedStatus).toBe(expectedStatuses[result.name])
      expect(result.actualStatus).toBe(result.expectedStatus)
      expect(result.passed).toBe(true)
    }

    expect(totals).toEqual({
      total: 29,
      equivalent: 16,
      counterexample: 4,
      unsupported: 9,
      failed: 0,
    })

    expect(summaryByFamily).toEqual([
      {
        family: 'local-copy-forwarding',
        total: 3,
        equivalent: 3,
        counterexample: 0,
        unsupported: 0,
        failed: 0,
      },
      {
        family: 'observed-temp-counterexample',
        total: 1,
        equivalent: 0,
        counterexample: 1,
        unsupported: 0,
        failed: 0,
      },
      {
        family: 'observed-temp-safety',
        total: 1,
        equivalent: 1,
        counterexample: 0,
        unsupported: 0,
        failed: 0,
      },
      {
        family: 'predecessor-arithmetic',
        total: 7,
        equivalent: 7,
        counterexample: 0,
        unsupported: 0,
        failed: 0,
      },
      {
        family: 'read-write-window',
        total: 2,
        equivalent: 1,
        counterexample: 1,
        unsupported: 0,
        failed: 0,
      },
      {
        family: 'return-path',
        total: 2,
        equivalent: 2,
        counterexample: 0,
        unsupported: 0,
        failed: 0,
      },
      {
        family: 'unsupported-boundary',
        total: 3,
        equivalent: 0,
        counterexample: 0,
        unsupported: 3,
        failed: 0,
      },
      {
        family: 'score-swap-window',
        total: 2,
        equivalent: 1,
        counterexample: 1,
        unsupported: 0,
        failed: 0,
      },
      {
        family: 'score-set-overwrite-window',
        total: 2,
        equivalent: 1,
        counterexample: 1,
        unsupported: 0,
        failed: 0,
      },
      {
        family: 'unsupported-typed-boundary',
        total: 6,
        equivalent: 0,
        counterexample: 0,
        unsupported: 6,
        failed: 0,
      },
    ])

    expect(fixtureResults.find((result) => result.name === 'observed-temp-counterexample'))
      .toMatchObject({
        actualStatus: 'counterexample',
        result: {
          counterexample: {
            slot: expect.stringContaining('$tmp'),
          },
        },
      })
    expect(fixtureResults.find((result) => result.name === 'division-by-zero-is-unsupported'))
      .toMatchObject({
        actualStatus: 'unsupported',
        result: {
          unsupportedReason: expect.stringContaining('division by zero'),
        },
      })
  })

  test('does not treat unsafe or unsupported fixtures as equivalent', () => {
    const { fixtureResults } = runOfflineRewriteEquivalenceFixtures()
    const unsafe = fixtureResults.filter((fixture) => fixture.expectedStatus !== 'equivalent')

    expect(unsafe.every((fixture) => fixture.actualStatus !== 'equivalent')).toBe(true)
  })

  test('marks fixture expectation mismatches as failed evidence', () => {
    const equivalentFixture = offlineRewriteEquivalenceFixtures.find(
      (fixture) => fixture.expectedStatus === 'equivalent',
    )
    expect(equivalentFixture).toBeDefined()

    const { fixtureResults, summaryByFamily, totals } = runOfflineRewriteEquivalenceFixtures([
      {
        ...equivalentFixture!,
        expectedStatus: 'counterexample',
      },
    ])

    expect(fixtureResults).toHaveLength(1)
    expect(fixtureResults[0]).toMatchObject({
      actualStatus: 'equivalent',
      expectedStatus: 'counterexample',
      passed: false,
    })
    expect(totals).toMatchObject({
      total: 1,
      equivalent: 1,
      counterexample: 0,
      unsupported: 0,
      failed: 1,
    })
    expect(summaryByFamily).toEqual([
      {
        family: equivalentFixture!.family,
        total: 1,
        equivalent: 1,
        counterexample: 0,
        unsupported: 0,
        failed: 1,
      },
    ])
  })
})
