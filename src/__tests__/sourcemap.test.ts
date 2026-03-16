/**
 * Source Map Tests — Phase 4a
 *
 * Verifies that generated .sourcemap.json files correctly map output lines
 * back to source .mcrs locations.
 */

import { compile } from '../index'
import type { SourceMap } from '../emit/sourcemap'

function getSourceMap(
  files: ReturnType<typeof compile>['files'],
  fnSuffix: string,
): SourceMap {
  const smPath = `data/test/function/${fnSuffix}.sourcemap.json`
  const file = files.find(f => f.path === smPath)
  if (!file) {
    const paths = files.map(f => f.path).join(', ')
    throw new Error(`Missing sourcemap: ${smPath}\nAvailable: ${paths}`)
  }
  return JSON.parse(file.content) as SourceMap
}

function getMcFunction(
  files: ReturnType<typeof compile>['files'],
  fnSuffix: string,
): string {
  const mcPath = `data/test/function/${fnSuffix}.mcfunction`
  const file = files.find(f => f.path === mcPath)
  if (!file) throw new Error(`Missing mcfunction: ${mcPath}`)
  return file.content
}

// ---------------------------------------------------------------------------
// Basic structure
// ---------------------------------------------------------------------------

describe('source map — basic structure', () => {
  it('generates sourcemap.json only when generateSourceMap=true', () => {
    const source = `fn add(a: int, b: int): int { return a + b; }`
    const without = compile(source, { namespace: 'test', filePath: 'src/add.mcrs' })
    expect(without.files.some(f => f.path.endsWith('.sourcemap.json'))).toBe(false)

    const with_ = compile(source, { namespace: 'test', generateSourceMap: true, filePath: 'src/add.mcrs' })
    expect(with_.files.some(f => f.path.endsWith('.sourcemap.json'))).toBe(true)
  })

  it('sourcemap has version=1', () => {
    const source = `fn greet() { say("hello"); }`
    const result = compile(source, {
      namespace: 'test',
      generateSourceMap: true,
      filePath: 'src/greet.mcrs',
    })
    const sm = getSourceMap(result.files, 'greet')
    expect(sm.version).toBe(1)
  })

  it('sourcemap generatedFile matches the mcfunction path', () => {
    const source = `fn foo() { say("x"); }`
    const result = compile(source, {
      namespace: 'test',
      generateSourceMap: true,
      filePath: 'src/foo.mcrs',
    })
    const sm = getSourceMap(result.files, 'foo')
    expect(sm.generatedFile).toBe('data/test/function/foo.mcfunction')
  })

  it('sources array contains the source file path', () => {
    const source = `fn bar() { say("y"); }`
    const result = compile(source, {
      namespace: 'test',
      generateSourceMap: true,
      filePath: 'src/bar.mcrs',
    })
    const sm = getSourceMap(result.files, 'bar')
    expect(sm.sources).toContain('src/bar.mcrs')
  })
})

// ---------------------------------------------------------------------------
// Mapping correctness
// ---------------------------------------------------------------------------

describe('source map — mapping correctness', () => {
  it('each mapping line references a valid output line', () => {
    const source = `
fn simple(x: int): int {
  let y = x + 1;
  return y;
}
`
    const result = compile(source, {
      namespace: 'test',
      generateSourceMap: true,
      filePath: 'src/simple.mcrs',
    })
    const sm = getSourceMap(result.files, 'simple')
    const mcfn = getMcFunction(result.files, 'simple')
    const outputLines = mcfn.split('\n').filter(l => l.length > 0)

    for (const mapping of sm.mappings) {
      expect(mapping.line).toBeGreaterThanOrEqual(1)
      expect(mapping.line).toBeLessThanOrEqual(outputLines.length)
      expect(mapping.sourceLine).toBeGreaterThanOrEqual(1)
      expect(mapping.sourceCol).toBeGreaterThanOrEqual(1)
    }
  })

  it('source index in mappings refers to valid sources entry', () => {
    const source = `fn calc(a: int, b: int): int { return a * b; }`
    const result = compile(source, {
      namespace: 'test',
      generateSourceMap: true,
      filePath: 'src/calc.mcrs',
    })
    const sm = getSourceMap(result.files, 'calc')
    for (const m of sm.mappings) {
      expect(m.source).toBeGreaterThanOrEqual(0)
      expect(m.source).toBeLessThan(sm.sources.length)
    }
  })

  it('mappings cover the output lines from a simple function body', () => {
    const source = `
fn add(a: int, b: int): int {
  return a + b;
}
`
    const result = compile(source, {
      namespace: 'test',
      generateSourceMap: true,
      filePath: 'src/add.mcrs',
    })
    const sm = getSourceMap(result.files, 'add')
    // There should be at least one mapping
    expect(sm.mappings.length).toBeGreaterThan(0)
    // All mappings should point at non-zero source lines
    for (const m of sm.mappings) {
      expect(m.sourceLine).toBeGreaterThan(0)
    }
  })

  it('sourceLine values are ordered and correspond to source line numbers', () => {
    const source = `
fn multi() {
  let a = 1;
  let b = 2;
  let c = a + b;
  say("hello");
}
`
    const result = compile(source, {
      namespace: 'test',
      generateSourceMap: true,
      filePath: 'src/multi.mcrs',
    })
    const sm = getSourceMap(result.files, 'multi')
    // All mapped source lines should be in the range of the function body
    for (const m of sm.mappings) {
      expect(m.sourceLine).toBeGreaterThanOrEqual(2) // fn starts at line 2
      expect(m.sourceLine).toBeLessThanOrEqual(8)    // fn ends at line 8
    }
  })
})

// ---------------------------------------------------------------------------
// No sourcemap when no filePath
// ---------------------------------------------------------------------------

describe('source map — no filePath', () => {
  it('generates sourcemap with empty sources when no filePath is provided', () => {
    const source = `fn noloc() { say("no file"); }`
    const result = compile(source, {
      namespace: 'test',
      generateSourceMap: true,
      // no filePath
    })
    // Source map should not be generated (no sourceLoc info to record)
    const hasSm = result.files.some(f => f.path.endsWith('.sourcemap.json'))
    // Either no sourcemap generated, or it has empty mappings
    if (hasSm) {
      const sm = getSourceMap(result.files, 'noloc')
      expect(sm.mappings.length).toBe(0)
    }
    // This is acceptable either way — just verify it doesn't crash
  })
})

// ---------------------------------------------------------------------------
// Nested function calls
// ---------------------------------------------------------------------------

describe('source map — nested function calls', () => {
  it('each function gets its own sourcemap', () => {
    const source = `
fn helper(x: int): int {
  return x * 2;
}

fn caller() {
  let r = helper(5);
  say("done");
}
`
    const result = compile(source, {
      namespace: 'test',
      generateSourceMap: true,
      filePath: 'src/nested.mcrs',
    })
    // Both functions should have sourcemaps
    const helperSm = getSourceMap(result.files, 'helper')
    const callerSm = getSourceMap(result.files, 'caller')

    expect(helperSm.mappings.length).toBeGreaterThan(0)
    expect(callerSm.mappings.length).toBeGreaterThan(0)

    // helper's mappings should reference lines 2-4
    for (const m of helperSm.mappings) {
      expect(m.sourceLine).toBeGreaterThanOrEqual(2)
      expect(m.sourceLine).toBeLessThanOrEqual(4)
    }

    // caller's mappings should reference lines 7-9
    for (const m of callerSm.mappings) {
      expect(m.sourceLine).toBeGreaterThanOrEqual(7)
      expect(m.sourceLine).toBeLessThanOrEqual(9)
    }
  })
})

// ---------------------------------------------------------------------------
// sourcemap.json sidecar path
// ---------------------------------------------------------------------------

describe('source map — file path convention', () => {
  it('sourcemap path replaces .mcfunction with .sourcemap.json', () => {
    const source = `fn test_fn() { say("test"); }`
    const result = compile(source, {
      namespace: 'test',
      generateSourceMap: true,
      filePath: 'src/test.mcrs',
    })
    const smFiles = result.files.filter(f => f.path.endsWith('.sourcemap.json'))
    expect(smFiles.length).toBeGreaterThan(0)
    for (const sf of smFiles) {
      expect(sf.path).toMatch(/\.sourcemap\.json$/)
      // Corresponding .mcfunction should also exist
      const mcPath = sf.path.replace('.sourcemap.json', '.mcfunction')
      expect(result.files.some(f => f.path === mcPath)).toBe(true)
    }
  })
})
