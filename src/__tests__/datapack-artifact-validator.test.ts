import * as fs from 'fs'
import * as path from 'path'

import { compile, type DatapackFile } from '../compile'
import { validateDatapackArtifact } from '../testing/datapack-artifact-validator'

const FIXTURE_DIR = path.join(__dirname, 'fixtures')

function compileFixture(fileName: string, namespace: string): DatapackFile[] {
  const source = fs.readFileSync(path.join(FIXTURE_DIR, fileName), 'utf-8')
  const result = compile(source, { namespace })
  expect(result.success).toBe(true)
  expect(result.files).toBeDefined()
  return result.files ?? []
}

function baseFiles(extra: DatapackFile[]): DatapackFile[] {
  return [
    {
      path: 'pack.mcmeta',
      content: JSON.stringify({ pack: { pack_format: 61, description: 'artifact validator test' } }),
    },
    ...extra,
  ]
}

describe('datapack artifact validator', () => {
  test.each([
    ['counter.mcrs', 'counter'],
    ['macro-test.mcrs', 'macro_test'],
    ['match-range-test.mcrs', 'match_range_test'],
    ['for-range.mcrs', 'for_range'],
  ])('accepts compiled fixture artifact: %s', (fileName, namespace) => {
    const files = compileFixture(fileName, namespace)
    const result = validateDatapackArtifact(files)

    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  test('rejects unresolved local function references in mcfunction commands', () => {
    const result = validateDatapackArtifact(baseFiles([
      {
        path: 'data/test/function/main.mcfunction',
        content: 'function test:missing\n',
      },
    ]))

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'data/test/function/main.mcfunction',
        line: 1,
        message: expect.stringContaining("Unresolved local function reference 'test:missing'"),
      }),
    ]))
  })

  test('rejects unresolved local function references from minecraft tags', () => {
    const result = validateDatapackArtifact(baseFiles([
      {
        path: 'data/test/function/load.mcfunction',
        content: 'say ok\n',
      },
      {
        path: 'data/minecraft/tags/function/load.json',
        content: JSON.stringify({ values: ['test:missing'] }),
      },
    ]))

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'data/minecraft/tags/function/load.json',
        message: expect.stringContaining("references missing local function 'test:missing'"),
      }),
    ]))
  })

  test('rejects unsafe datapack file paths', () => {
    const result = validateDatapackArtifact(baseFiles([
      { path: '../escape.mcfunction', content: '' },
      { path: '/absolute.mcfunction', content: '' },
      { path: 'data\\test\\function\\main.mcfunction', content: '' },
    ]))

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: '../escape.mcfunction' }),
      expect.objectContaining({ file: '/absolute.mcfunction' }),
      expect.objectContaining({ file: 'data\\test\\function\\main.mcfunction' }),
    ]))
  })

  test('accepts function with storage when the local function target exists', () => {
    const result = validateDatapackArtifact(baseFiles([
      {
        path: 'data/test/function/main.mcfunction',
        content: 'function test:target with storage test:macro_args\n',
      },
      {
        path: 'data/test/function/target.mcfunction',
        content: '$say $(message)\n',
      },
    ]))

    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  test('rejects function with storage when the local function target is missing', () => {
    const result = validateDatapackArtifact(baseFiles([
      {
        path: 'data/test/function/main.mcfunction',
        content: 'execute if score #x obj matches 1 run function test:target with storage test:macro_args\n',
      },
    ]))

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        file: 'data/test/function/main.mcfunction',
        line: 1,
        message: expect.stringContaining("Unresolved local function reference 'test:target'"),
      }),
    ]))
  })

  test('requires pack.mcmeta with numeric pack_format', () => {
    const missing = validateDatapackArtifact([
      { path: 'data/test/function/main.mcfunction', content: 'say ok\n' },
    ])
    expect(missing.valid).toBe(false)
    expect(missing.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: expect.stringContaining('Missing required file: pack.mcmeta') }),
    ]))

    const badFormat = validateDatapackArtifact([
      { path: 'pack.mcmeta', content: JSON.stringify({ pack: { pack_format: '61' } }) },
      { path: 'data/test/function/main.mcfunction', content: 'say ok\n' },
    ])
    expect(badFormat.valid).toBe(false)
    expect(badFormat.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ message: 'pack.mcmeta.pack.pack_format must be a number' }),
    ]))
  })
})
