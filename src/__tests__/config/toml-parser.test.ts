/**
 * Black-box tests for the standards-compliant TOML compatibility loader.
 *
 * The loader is exercised through the public loadProjectConfig() API using
 * temp files. This keeps tests black-box and locks strict failure semantics.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { loadProjectConfig } from '../../config/project-config'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-toml-parser-test-'))
}

function parseToml(content: string) {
  const dir = makeTmpDir()
  try {
    fs.writeFileSync(path.join(dir, 'redscript.toml'), content, 'utf-8')
    return loadProjectConfig(dir)
  } finally {
    fs.rmSync(dir, { recursive: true })
  }
}

// ---------------------------------------------------------------------------
// Basic key = value parsing
// ---------------------------------------------------------------------------

describe('basic key=value parsing', () => {
  test('parses a single string value', () => {
    const config = parseToml(`[project]\nname = "hello"`)
    expect(config?.project?.name).toBe('hello')
  })

  test('parses a key with surrounding whitespace around =', () => {
    const config = parseToml(`[project]\nname   =   "spaced"`)
    expect(config?.project?.name).toBe('spaced')
  })

  test('rejects lines without =', () => {
    const config = parseToml(`[project]\nthis line has no equals\nname = "valid"`)
    expect(config).toBeNull()
  })

  test('rejects duplicate keys', () => {
    const config = parseToml(`[project]\nname = "first"\nname = "second"`)
    expect(config).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// String type parsing
// ---------------------------------------------------------------------------

describe('string values', () => {
  test('strips double quotes', () => {
    const config = parseToml(`[project]\nname = "double-quoted"`)
    expect(config?.project?.name).toBe('double-quoted')
  })

  test('strips single quotes', () => {
    // Single-quoted strings are supported by the parser
    const config = parseToml(`[project]\nname = 'single-quoted'`)
    expect(config?.project?.name).toBe('single-quoted')
  })

  test('rejects unquoted bare strings', () => {
    const config = parseToml(`[output]\ndir = dist/`)
    expect(config).toBeNull()
  })

  test('preserves internal spaces in quoted string', () => {
    const config = parseToml(`[project]\ndescription = "hello world"`)
    expect(config?.project?.description).toBe('hello world')
  })

  test('empty double-quoted string returns empty string', () => {
    const config = parseToml(`[project]\nname = ""`)
    expect(config?.project?.name).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Number type parsing
// ---------------------------------------------------------------------------

describe('number values', () => {
  test('parses positive integer', () => {
    const config = parseToml(`[compiler]\noptimization = 2`)
    expect(config?.compiler?.optimization).toBe(2)
  })

  test('parses zero', () => {
    const config = parseToml(`[compiler]\noptimization = 0`)
    expect(config?.compiler?.optimization).toBe(0)
  })

  test('parses negative integer', () => {
    // The parser uses Number(), so negatives are valid numbers
    const raw = parseToml(`[compiler]\noptimization = -1`)
    // optimization is typed as number; confirm a number came through
    expect(typeof raw?.compiler?.optimization).toBe('number')
    expect(raw?.compiler?.optimization).toBe(-1)
  })

  test('parses floating-point number', () => {
    // The parser does not distinguish floats; Number() handles them
    const raw = parseToml(`[compiler]\noptimization = 1.5`)
    expect(raw?.compiler?.optimization).toBe(1.5)
  })
})

// ---------------------------------------------------------------------------
// Boolean type parsing
// ---------------------------------------------------------------------------

describe('boolean values', () => {
  test('parses true', () => {
    const config = parseToml(`[compiler]\nno-dce = true`)
    expect(config?.compiler?.['no-dce']).toBe(true)
  })

  test('parses false', () => {
    const config = parseToml(`[compiler]\nno-dce = false`)
    expect(config?.compiler?.['no-dce']).toBe(false)
  })

  test('rejects uppercase booleans', () => {
    const config = parseToml(`[compiler]\nno-dce = TRUE`)
    expect(config).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Array parsing
// ---------------------------------------------------------------------------

describe('array values', () => {
  test('parses array of double-quoted strings', () => {
    const config = parseToml(`[compiler]\ninclude-dirs = ["src/shared", "src/stdlib"]`)
    expect(config?.compiler?.['include-dirs']).toEqual(['src/shared', 'src/stdlib'])
  })

  test('parses array of single-quoted strings', () => {
    const config = parseToml(`[compiler]\ninclude-dirs = ['a', 'b']`)
    expect(config?.compiler?.['include-dirs']).toEqual(['a', 'b'])
  })

  test('parses empty array', () => {
    const config = parseToml(`[compiler]\ninclude-dirs = []`)
    expect(config?.compiler?.['include-dirs']).toEqual([])
  })

  test('parses single-element array', () => {
    const config = parseToml(`[compiler]\ninclude-dirs = ["only"]`)
    expect(config?.compiler?.['include-dirs']).toEqual(['only'])
  })

  test('strips whitespace around array elements', () => {
    const config = parseToml(`[compiler]\ninclude-dirs = [  "a"  ,  "b"  ]`)
    expect(config?.compiler?.['include-dirs']).toEqual(['a', 'b'])
  })

  test('mixed-quote array — each element stripped of its own quotes', () => {
    // parser strips leading/trailing quote chars per element
    const config = parseToml(`[compiler]\ninclude-dirs = ["double", 'single']`)
    expect(config?.compiler?.['include-dirs']).toEqual(['double', 'single'])
  })

  test('array with trailing comma — empty element filtered out', () => {
    // split(',') on "\"a\", \"b\", " produces an empty last token which
    // the .filter(s => s.length > 0) removes
    const config = parseToml(`[compiler]\ninclude-dirs = ["a", "b", ]`)
    expect(config?.compiler?.['include-dirs']).toEqual(['a', 'b'])
  })

  test('rejects an array missing its closing bracket', () => {
    const config = parseToml(`[compiler]\ninclude-dirs = ["unclosed"`)
    expect(config).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Section header parsing
// ---------------------------------------------------------------------------

describe('section headers', () => {
  test('switches context on [section] header', () => {
    const config = parseToml(`
[project]
name = "p"
[output]
dir = "d/"
`)
    expect(config?.project?.name).toBe('p')
    expect(config?.output?.dir).toBe('d/')
  })

  test('a key before any section header is placed in __root__ and ignored by tomlToConfig', () => {
    const config = parseToml(`orphan = "value"\n[project]\nname = "p"`)
    expect(config?.project?.name).toBe('p')
    // __root__ is not surfaced through ProjectConfig
  })

  test('unknown section is silently ignored', () => {
    const config = parseToml(`
[unknown_section]
foo = "bar"
[project]
name = "known"
`)
    expect(config?.project?.name).toBe('known')
  })
})

// ---------------------------------------------------------------------------
// Comment stripping
// ---------------------------------------------------------------------------

describe('comment stripping', () => {
  test('strips inline # comment', () => {
    const config = parseToml(`[project]\nname = "clean" # this is a comment`)
    expect(config?.project?.name).toBe('clean')
  })

  test('skips pure comment lines', () => {
    const config = parseToml(`# full-line comment\n[project]\nname = "ok"`)
    expect(config?.project?.name).toBe('ok')
  })

  test('strips comment after section header — comment stripped before section check', () => {
    // Comment is stripped first: "[project] # comment" → "[project]"
    // The trimmed line ends with ']', so it IS recognised as a section header.
    const config = parseToml(`[project] # comment\nname = "after"`)
    expect(config?.project?.name).toBe('after')
  })

  test('# inside a quoted value is preserved', () => {
    const config = parseToml(`[project]\nname = "no#hash"`)
    expect(config?.project?.name).toBe('no#hash')
  })
})

// ---------------------------------------------------------------------------
// Malformed / invalid input
// ---------------------------------------------------------------------------

describe('malformed and invalid input', () => {
  test('empty file returns empty config (not null)', () => {
    const config = parseToml('')
    expect(config).not.toBeNull()
    expect(config?.project).toBeUndefined()
    expect(config?.compiler).toBeUndefined()
    expect(config?.output).toBeUndefined()
  })

  test('only whitespace returns empty config', () => {
    const config = parseToml('   \n  \n  ')
    expect(config).not.toBeNull()
    expect(config?.project).toBeUndefined()
  })

  test('only comments returns empty config', () => {
    const config = parseToml('# comment 1\n# comment 2\n')
    expect(config).not.toBeNull()
    expect(config?.project).toBeUndefined()
  })

  test('value with = inside quoted string (key stops at first =)', () => {
    // key = 'name', valueRaw = '"a=b"' -> parseTomlValue strips quotes -> 'a=b'
    const config = parseToml(`[project]\nname = "a=b"`)
    expect(config?.project?.name).toBe('a=b')
  })

  test('completely garbled content does not throw', () => {
    expect(() => parseToml('!@#$%^&*()\n[[[garbage]]]\n??')).not.toThrow()
  })

  test('number-like string in quotes is kept as string', () => {
    // "1.21.4" should remain a string (not coerced to number)
    const config = parseToml(`[project]\nmc-version = "1.21.4"`)
    expect(config?.project?.['mc-version']).toBe('1.21.4')
    expect(typeof config?.project?.['mc-version']).toBe('string')
  })

  test('unrecognised keys in known sections are silently ignored', () => {
    const config = parseToml(`[project]\nname = "ok"\nunknown-key = "ignored"`)
    expect(config?.project?.name).toBe('ok')
  })
})
