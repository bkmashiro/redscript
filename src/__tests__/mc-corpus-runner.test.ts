import { parseJestSummary, resolveSourceRevision } from '../mc-test/corpus-runner'

describe('managed corpus report parsing', () => {
  it('extracts Jest suite and test totals without treating startup text as proof', () => {
    const summary = parseJestSummary(`Done (8.638s)!\nTest Suites: 1 passed, 1 total\nTests: 26 passed, 26 total\n`)
    expect(summary).toEqual({ suites: '1 passed, 1 total', tests: '26 passed, 26 total' })
  })

  it('leaves missing totals absent', () => {
    expect(parseJestSummary('Done (8.638s)!')).toEqual({ suites: undefined, tests: undefined })
  })

  it('binds CI evidence to GITHUB_SHA when present', () => {
    const previous = process.env.GITHUB_SHA
    process.env.GITHUB_SHA = '0123456789abcdef'
    try {
      expect(resolveSourceRevision()).toBe('0123456789abcdef')
    } finally {
      if (previous == null) delete process.env.GITHUB_SHA
      else process.env.GITHUB_SHA = previous
    }
  })
})
