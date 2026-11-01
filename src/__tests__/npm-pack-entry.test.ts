import { describe, expect, test } from '@jest/globals'
const { readPackEntry, assertPackFilePolicy } = require('../../scripts/npm-pack-entry')

describe('npm pack output compatibility', () => {
  test.each(['.hermes/plans/private.md', 'src/.claude/settings.json', 'src/__tests__/sample.ts', 'dist/tests/case.js', 'AGENTS.md', 'src/.env.local'])('rejects unsafe package path %s', path => {
    expect(() => assertPackFilePolicy({ files: [{ path }] })).toThrow('Unsafe package paths')
  })
  test('rejects a package without its runtime data', () => {
    expect(() => assertPackFilePolicy({ files: [] })).toThrow('Missing package runtime file')
  })
  const record = { filename: 'redscript-mc-4.0.0.tgz', files: [] }
  test.each([{ parsed: [record] }, { parsed: record }, { parsed: { 'redscript-mc': record } }])('accepts one array/object/keyed package record: %j', ({ parsed }) => {
    expect(readPackEntry(parsed)).toBe(record)
  })
  test.each([[], {}, null, true, [{ filename: 'one.tgz' }, { filename: 'two.tgz' }]].map(parsed => ({ parsed })))('fails closed on empty or ambiguous output: %j', ({ parsed }) => {
    expect(() => readPackEntry(parsed)).toThrow()
  })
})
