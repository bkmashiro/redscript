import * as fs from 'fs'
import * as path from 'path'

import { compile } from '../compile'
import { canonicalizeDatapackFiles } from '../emit'

describe('emitter physical artifact paths', () => {
  it('returns each physical path exactly once for the core runtime oracle corpus', () => {
    const sourcePath = path.resolve(process.cwd(), 'tests', 'mc-cases', 'core-oracle.mcrs')
    const result = compile(fs.readFileSync(sourcePath, 'utf8'), {
      namespace: 'core_oracle_mc',
      filePath: sourcePath,
    })
    const paths = result.files.map(file => file.path)

    expect(new Set(paths).size).toBe(paths.length)
  })

  it('deduplicates identical bytes but rejects conflicting bytes for one physical path', () => {
    expect(canonicalizeDatapackFiles([
      { path: 'data/x/function/a.mcfunction', content: 'say one\n' },
      { path: 'data/x/function/a.mcfunction', content: 'say one\n' },
    ])).toEqual([
      { path: 'data/x/function/a.mcfunction', content: 'say one\n' },
    ])

    expect(() => canonicalizeDatapackFiles([
      { path: 'data/x/function/a.mcfunction', content: 'say one\n' },
      { path: 'data/x/function/a.mcfunction', content: 'say two\n' },
    ])).toThrow(/different content/)
  })
})
