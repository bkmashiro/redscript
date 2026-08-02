import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  deployCorpusPack,
  ensureCorpusPackWorkspace,
  removeCorpusPack,
  resolveCorpusPackPath,
} from '../mc-test/corpus-deployer'

describe('isolated MC runtime corpus datapacks', () => {
  let root: string

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-corpus-deployer-test-'))
  })

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
  })

  test('maps distinct case ids to distinct bounded pack roots', () => {
    const first = resolveCorpusPackPath(root, 'syntax.arrays')
    const second = resolveCorpusPackPath(root, 'stdlib.bits')

    expect(first).not.toBe(second)
    expect(path.dirname(first)).toBe(path.join(root, 'world', 'datapacks'))
    expect(path.dirname(second)).toBe(path.join(root, 'world', 'datapacks'))
  })

  test.each(['../escape', '/absolute', 'UPPER', 'space id', '', '__proto__'])(
    'rejects unsafe case id %j',
    caseId => {
      expect(() => resolveCorpusPackPath(root, caseId)).toThrow(/case id/i)
    },
  )

  test('deploys each case without merging unrelated minecraft tags', () => {
    const a = deployCorpusPack(root, 'load.case-a', [
      { path: 'pack.mcmeta', content: '{"pack":{"pack_format":48,"description":"a"}}' },
      { path: 'data/minecraft/tags/function/load.json', content: '{"values":["a:load"]}' },
    ])
    const b = deployCorpusPack(root, 'load.case-b', [
      { path: 'pack.mcmeta', content: '{"pack":{"pack_format":48,"description":"b"}}' },
      { path: 'data/minecraft/tags/function/load.json', content: '{"values":["b:load"]}' },
    ])

    expect(fs.readFileSync(path.join(a.root, 'data/minecraft/tags/function/load.json'), 'utf8'))
      .toBe('{"values":["a:load"]}')
    expect(fs.readFileSync(path.join(b.root, 'data/minecraft/tags/function/load.json'), 'utf8'))
      .toBe('{"values":["b:load"]}')
  })

  test('fails closed on stale roots and duplicate artifact paths', () => {
    deployCorpusPack(root, 'syntax.arrays', [
      { path: 'pack.mcmeta', content: '{}' },
    ])

    expect(() => deployCorpusPack(root, 'syntax.arrays', [
      { path: 'pack.mcmeta', content: '{}' },
    ])).toThrow(/already exists/i)

    expect(() => deployCorpusPack(root, 'syntax.tuples', [
      { path: 'pack.mcmeta', content: '{}' },
      { path: 'pack.mcmeta', content: '{}' },
    ])).toThrow(/duplicate artifact path/i)
  })

  test('reuses only an owned legacy suite workspace and rejects stale roots', () => {
    const first = ensureCorpusPackWorkspace(root, 'legacy.suite')
    const second = ensureCorpusPackWorkspace(root, 'legacy.suite')
    expect(second).toEqual(first)

    const staleRoot = resolveCorpusPackPath(root, 'legacy.stale')
    fs.mkdirSync(staleRoot, { recursive: true })
    expect(() => ensureCorpusPackWorkspace(root, 'legacy.stale')).toThrow(/ownership marker/i)
  })

  test.each(['../outside.mcfunction', '/absolute.mcfunction', 'data/../../escape'])(
    'rejects unsafe artifact path %j before writing',
    artifactPath => {
      expect(() => deployCorpusPack(root, 'syntax.arrays', [
        { path: artifactPath, content: 'say unsafe' },
      ])).toThrow(/artifact path/i)
      expect(fs.existsSync(resolveCorpusPackPath(root, 'syntax.arrays'))).toBe(false)
    },
  )

  test('removes only a pack carrying the expected ownership marker', () => {
    const deployed = deployCorpusPack(root, 'syntax.arrays', [
      { path: 'pack.mcmeta', content: '{}' },
    ])
    removeCorpusPack(deployed.root, 'syntax.arrays')
    expect(fs.existsSync(deployed.root)).toBe(false)

    const unrelated = resolveCorpusPackPath(root, 'syntax.tuples')
    fs.mkdirSync(unrelated, { recursive: true })
    fs.writeFileSync(path.join(unrelated, 'keep.txt'), 'not owned')
    expect(() => removeCorpusPack(unrelated, 'syntax.tuples')).toThrow(/ownership marker/i)
    expect(fs.existsSync(unrelated)).toBe(true)
  })
})
