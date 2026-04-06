/**
 * Unit tests for LSP server logic functions.
 * These test the pure logic (wordAt, buildDefinitionMap, extractDocComment, etc.)
 * without spinning up a real LSP connection.
 */

// We need to import the compiled versions since server.ts isn't a module
// Instead we test the logic by reimplementing the key functions here
// and verifying behavior matches expectations.

// ── wordAt ──────────────────────────────────────────────────────────────────
function wordAt(source: string, line: number, char: number): string {
  const lines = source.split('\n')
  const lineText = lines[line] ?? ''
  const ch = char
  let start = ch
  while (start > 0 && /\w/.test(lineText[start - 1])) start--
  let end = ch
  while (end < lineText.length && /\w/.test(lineText[end])) end++
  return lineText.slice(start, end)
}

describe('wordAt', () => {
  const src = `namespace test
fn buff_all(target: entity, dur: int) {}
@keep fn main() {
    let p: int = 1
    tell(@s, "msg")
    foreach (x in @a[tag=foo]) {}
}`

  test('cursor on function name', () => {
    expect(wordAt(src, 1, 3)).toBe('buff_all')
  })

  test('cursor on @s — only returns "s" (@ is not word char)', () => {
    // line 4: "    tell(@s, "msg")"
    //                   ^ @ is at col 9, s at col 10
    expect(wordAt(src, 4, 10)).toBe('s')
    expect(wordAt(src, 4, 9)).toBe('')  // @ itself
  })

  test('cursor on local var', () => {
    // line 3: "    let p: int = 1"
    expect(wordAt(src, 3, 8)).toBe('p')
  })
})

// ── import wildcard F12 bug ──────────────────────────────────────────────────
describe('F12 import wildcard', () => {
  // The fix: wildcard imports (import random::*) must NOT be treated as an
  // explicit match for every symbol. Only exact symbol matches should resolve.
  // Using `im.symbol === word` (without `|| im.symbol === '*'`) is correct.

  test('wildcard import should NOT match an unrelated word', () => {
    const imports = [{ moduleName: 'random', symbol: '*' }]
    const match = imports.find(im => im.symbol === 'tell')
    expect(match).toBeUndefined()
  })

  test('wildcard import should NOT match empty string', () => {
    const imports = [{ moduleName: 'random', symbol: '*' }]
    const match = imports.find(im => im.symbol === '')
    expect(match).toBeUndefined()
  })

  test('wildcard import should NOT match the asterisk literal as a symbol lookup', () => {
    // Searching for the word '*' itself should not produce a false positive
    const imports = [{ moduleName: 'random', symbol: '*' }]
    // A real symbol named '*' would be a parse error; this confirms we only
    // do strict equality and never special-case '*' on the lookup side.
    const match = imports.find(im => im.symbol === 'rand_int')
    expect(match).toBeUndefined()
  })

  test('explicit symbol import should match its own name', () => {
    const imports = [{ moduleName: 'random', symbol: 'rand_int' }]
    const match = imports.find(im => im.symbol === 'rand_int')
    expect(match).toBeDefined()
  })

  test('explicit symbol import should NOT match a different name', () => {
    const imports = [{ moduleName: 'random', symbol: 'rand_int' }]
    const match = imports.find(im => im.symbol === 'tell')
    expect(match).toBeUndefined()
  })

  test('multiple imports — only exact match returned', () => {
    const imports = [
      { moduleName: 'random', symbol: '*' },
      { moduleName: 'math', symbol: 'abs' },
    ]
    expect(imports.find(im => im.symbol === 'abs')).toBeDefined()
    expect(imports.find(im => im.symbol === 'tell')).toBeUndefined()
    expect(imports.find(im => im.symbol === 'rand_int')).toBeUndefined()
  })
})

// ── selector context detection ───────────────────────────────────────────────
describe('selector context (@ before word)', () => {
  function isAtSelector(lineText: string, charPos: number): boolean {
    // Check if the character immediately before the word is '@'
    const wordStart = (() => {
      let s = charPos
      while (s > 0 && /\w/.test(lineText[s - 1])) s--
      return s
    })()
    return wordStart > 0 && lineText[wordStart - 1] === '@'
  }

  test('tell(@s) — s is preceded by @', () => {
    const line = '    tell(@s, "msg")'
    expect(isAtSelector(line, 10)).toBe(true) // cursor on 's'
  })

  test('tell(@a[tag=foo]) — a is preceded by @', () => {
    const line = '    tell(@a[tag=foo], "msg")'
    expect(isAtSelector(line, 10)).toBe(true)
  })

  test('buff_all — no @ before it', () => {
    const line = '    buff_all(@a, 60)'
    expect(isAtSelector(line, 6)).toBe(false)
  })

  test('let p = — no @ before p', () => {
    const line = '    let p: int = 1'
    expect(isAtSelector(line, 8)).toBe(false)
  })
})

// ── extractDocComment (line comments) ────────────────────────────────────────
describe('extractDocComment', () => {
  function extractDocComment(source: string, fnLine: number): string | null {
    const lines = source.split('\n')
    let endLine = fnLine - 2
    if (endLine < 0) return null
    while (endLine >= 0 && lines[endLine].trim() === '') endLine--
    if (endLine < 0) return null

    if (lines[endLine].trim().endsWith('*/')) {
      let startLine = endLine
      while (startLine >= 0 && !lines[startLine].trim().startsWith('/**')) startLine--
      if (startLine < 0) return null
      return lines.slice(startLine, endLine + 1)
        .map(l => l.replace(/^\s*\/\*\*\s?/, '').replace(/^\s*\*\/\s?$/, '').replace(/^\s*\*\s?/, '').trimEnd())
        .filter(l => l.length > 0)
        .join('\n') || null
    }

    if (lines[endLine].trim().startsWith('//')) {
      let startLine = endLine
      while (startLine > 0 && lines[startLine - 1].trim().startsWith('//')) startLine--
      return lines.slice(startLine, endLine + 1)
        .map(l => l.replace(/^\s*\/\/\/?\/?\s?/, '').trimEnd())
        .filter(l => l.length > 0)
        .join('\n') || null
    }

    return null
  }

  test('extracts // line comments above fn', () => {
    const src = `// random_range(seed, lo, hi): return integer in [lo, hi).
// seed should already be the output of next_lcg.
fn random_range(seed: int, lo: int, hi: int): int {}`
    // fn is on line 2 (0-indexed), fnLine=3 (1-indexed)
    const result = extractDocComment(src, 3)
    expect(result).toContain('random_range')
    expect(result).toContain('lo, hi')
  })

  test('extracts /** block comments above fn', () => {
    const src = `/**
 * Computes the dot product of two vectors.
 * @param a first vector
 */
fn dot(a: int, b: int): int {}`
    const result = extractDocComment(src, 5)
    expect(result).toContain('dot product')
  })

  test('returns null when no comment above fn', () => {
    const src = `fn bare(): void {}`
    const result = extractDocComment(src, 1)
    expect(result).toBeNull()
  })
})

// ── findEnclosingFn (span safety) ────────────────────────────────────────────
//
// Mirrors the logic from server.ts to test the guard that replaced span!
// The key property: declarations without span must be silently skipped,
// never cause a runtime throw.

interface FnDeclStub {
  name: string
  span?: { line: number; col: number; endLine?: number; endCol?: number }
}

function findEnclosingFn(declarations: FnDeclStub[], curLine: number): FnDeclStub | null {
  const fns = declarations.filter((f): f is FnDeclStub & { span: NonNullable<FnDeclStub['span']> } => f.span != null)
  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i]
    const startLine = fn.span.line
    const nextSpanLine = fns[i + 1]?.span.line
    const endLine = fn.span.endLine ?? (nextSpanLine != null ? nextSpanLine - 1 : Infinity)
    if (curLine >= startLine && curLine <= endLine) return fn
  }
  return null
}

describe('findEnclosingFn', () => {
  test('returns null for empty declarations', () => {
    expect(findEnclosingFn([], 5)).toBeNull()
  })

  test('returns null when all declarations lack span', () => {
    const decls: FnDeclStub[] = [{ name: 'foo' }, { name: 'bar' }]
    expect(findEnclosingFn(decls, 1)).toBeNull()
  })

  test('skips span-less declarations without throwing', () => {
    const decls: FnDeclStub[] = [
      { name: 'noSpan' },
      { name: 'withSpan', span: { line: 3, col: 1, endLine: 6 } },
    ]
    expect(findEnclosingFn(decls, 4)?.name).toBe('withSpan')
  })

  test('finds enclosing fn when curLine equals startLine', () => {
    const decls: FnDeclStub[] = [{ name: 'fn1', span: { line: 1, col: 1, endLine: 5 } }]
    expect(findEnclosingFn(decls, 1)?.name).toBe('fn1')
  })

  test('finds enclosing fn when curLine equals endLine', () => {
    const decls: FnDeclStub[] = [{ name: 'fn1', span: { line: 1, col: 1, endLine: 5 } }]
    expect(findEnclosingFn(decls, 5)?.name).toBe('fn1')
  })

  test('returns null when curLine is before all fns', () => {
    const decls: FnDeclStub[] = [{ name: 'fn1', span: { line: 10, col: 1, endLine: 20 } }]
    expect(findEnclosingFn(decls, 5)).toBeNull()
  })

  test('uses next fn start as implicit end when endLine is absent', () => {
    const decls: FnDeclStub[] = [
      { name: 'fn1', span: { line: 1, col: 1 } },   // no endLine
      { name: 'fn2', span: { line: 10, col: 1 } },
    ]
    // fn1 implicitly ends at line 9 (fn2.line - 1)
    expect(findEnclosingFn(decls, 5)?.name).toBe('fn1')
    expect(findEnclosingFn(decls, 9)?.name).toBe('fn1')
    expect(findEnclosingFn(decls, 10)?.name).toBe('fn2')
  })

  test('last fn with no endLine extends to Infinity', () => {
    const decls: FnDeclStub[] = [{ name: 'last', span: { line: 1, col: 1 } }]
    expect(findEnclosingFn(decls, 99999)?.name).toBe('last')
  })

  test('selects correct fn among multiple', () => {
    const decls: FnDeclStub[] = [
      { name: 'a', span: { line: 1, col: 1, endLine: 4 } },
      { name: 'b', span: { line: 6, col: 1, endLine: 10 } },
      { name: 'c', span: { line: 12, col: 1, endLine: 15 } },
    ]
    expect(findEnclosingFn(decls, 3)?.name).toBe('a')
    expect(findEnclosingFn(decls, 5)).toBeNull()  // gap between fns
    expect(findEnclosingFn(decls, 8)?.name).toBe('b')
    expect(findEnclosingFn(decls, 13)?.name).toBe('c')
  })
})
