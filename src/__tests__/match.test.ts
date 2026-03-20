/**
 * Tests for match expression: Option and int pattern matching
 *
 * Covers:
 * - Parsing `match expr { ... }` (no-parens syntax)
 * - Parsing `match (expr) { ... }` (legacy parens syntax)
 * - PatSome(x), PatNone, PatInt, PatWild patterns
 * - MIR/mcfunction code generation for Option match and int match
 */

import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { compile } from '../emit/compile'
import type { Program } from '../ast/types'

function parse(source: string, namespace = 'test'): Program {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens).parse(namespace)
}

function getFile(result: ReturnType<typeof compile>, pathSubstr: string): string | undefined {
  const files = result.files
  const exact = files.find(f => f.path.endsWith(`function/${pathSubstr}.mcfunction`))
  if (exact) return exact.content
  const f = files.find(f => f.path.includes(pathSubstr))
  return f?.content
}

/** Get all generated files that include pathSubstr (for checking arm sub-functions). */
function getFiles(result: ReturnType<typeof compile>, pathSubstr: string): string[] {
  return result.files
    .filter(f => f.path.includes(pathSubstr))
    .map(f => f.content)
}

// ---------------------------------------------------------------------------
// Parser tests
// ---------------------------------------------------------------------------

describe('match: Parser', () => {
  it('parses match without parens (new syntax)', () => {
    const prog = parse('fn f(n: int): void { match n { 1 => { } _ => { } } }')
    const stmt = prog.declarations[0].body[0]
    expect(stmt.kind).toBe('match')
    if (stmt.kind === 'match') {
      expect(stmt.expr).toEqual({ kind: 'ident', name: 'n' })
      expect(stmt.arms).toHaveLength(2)
      expect(stmt.arms[0].pattern).toEqual({ kind: 'PatInt', value: 1 })
      expect(stmt.arms[1].pattern).toEqual({ kind: 'PatWild' })
    }
  })

  it('parses match with parens (legacy syntax)', () => {
    const prog = parse('fn f(n: int): void { match (n) { 2 => { } _ => { } } }')
    const stmt = prog.declarations[0].body[0]
    expect(stmt.kind).toBe('match')
    if (stmt.kind === 'match') {
      expect(stmt.expr).toEqual({ kind: 'ident', name: 'n' })
      expect(stmt.arms[0].pattern).toEqual({ kind: 'PatInt', value: 2 })
    }
  })

  it('parses PatSome pattern', () => {
    const prog = parse('fn f(opt: Option<int>): void { match opt { Some(x) => { } None => { } } }')
    const stmt = prog.declarations[0].body[0]
    expect(stmt.kind).toBe('match')
    if (stmt.kind === 'match') {
      expect(stmt.arms[0].pattern).toEqual({ kind: 'PatSome', binding: 'x' })
      expect(stmt.arms[1].pattern).toEqual({ kind: 'PatNone' })
    }
  })

  it('parses PatNone pattern', () => {
    const prog = parse('fn f(opt: Option<int>): void { match opt { None => { } Some(v) => { } } }')
    const stmt = prog.declarations[0].body[0]
    expect(stmt.kind).toBe('match')
    if (stmt.kind === 'match') {
      expect(stmt.arms[0].pattern).toEqual({ kind: 'PatNone' })
      expect(stmt.arms[1].pattern).toEqual({ kind: 'PatSome', binding: 'v' })
    }
  })

  it('parses trailing comma after arm', () => {
    const prog = parse('fn f(n: int): void { match n { 1 => { }, _ => { }, } }')
    const stmt = prog.declarations[0].body[0]
    expect(stmt.kind).toBe('match')
    if (stmt.kind === 'match') {
      expect(stmt.arms).toHaveLength(2)
    }
  })
})

// ---------------------------------------------------------------------------
// Code generation tests — int match
// ---------------------------------------------------------------------------

describe('match: Int code generation', () => {
  it('generates scoreboard conditions for int arms', () => {
    const src = `
      fn test_int(n: int): void {
        match n {
          1 => { tell(@s, "one") }
          2 => { tell(@s, "two") }
          _ => { tell(@s, "other") }
        }
      }
    `
    const result = compile(src, { namespace: 'test' })
    const fn = getFile(result, 'test_int')
    expect(fn).toBeDefined()
    // Entry function uses execute if score
    expect(fn).toMatch(/execute if score/)
    // All generated content should contain const 1 and const 2 comparisons
    const allContent = result.files.map(f => f.content).join('\n')
    expect(allContent).toMatch(/\$__const_1 __test/)
    expect(allContent).toMatch(/\$__const_2 __test/)
  })

  it('wildcard arm: generates dispatch structure with correct const', () => {
    const src = `
      fn test_wild(n: int): void {
        match n {
          99 => { tell(@s, "ninety-nine") }
          _ => { tell(@s, "other") }
        }
      }
    `
    const result = compile(src, { namespace: 'test' })
    const fn = getFile(result, 'test_wild')
    expect(fn).toBeDefined()
    // const 99 should appear for the arm comparison
    expect(fn).toMatch(/99/)
    // Wildcard arm: main function dispatches to arm sub-functions
    expect(fn).toMatch(/execute if score/)
  })

  it('wildcard arm sub-function contains the body', () => {
    const src = `
      fn test_wildarm(n: int): void {
        match n {
          5 => { tell(@s, "five") }
          _ => { tell(@s, "default") }
        }
      }
    `
    const result = compile(src, { namespace: 'test' })
    // The "default" arm body goes in a sub-function
    const allContent = result.files.map(f => f.content).join('\n')
    expect(allContent).toContain('default')
  })
})

// ---------------------------------------------------------------------------
// Code generation tests — Option match
// ---------------------------------------------------------------------------

describe('match: Option code generation', () => {
  it('generates scoreboard conditional dispatch for Option arms', () => {
    const src = `
      fn test_opt(opt: Option<int>): void {
        match opt {
          Some(x) => { tell(@s, "got it") }
          None    => { tell(@s, "empty") }
        }
      }
    `
    const result = compile(src, { namespace: 'test' })
    const fn = getFile(result, 'test_opt')
    expect(fn).toBeDefined()
    // Option has-slot: scoreboard branch checking has==1 or has==0
    expect(fn).toMatch(/execute if score/)
    // Const 1 and/or 0 should appear
    expect(fn).toMatch(/\$__const_[01] __test/)
  })

  it('Some arm body appears in generated sub-function', () => {
    const src = `
      fn test_bind(opt: Option<int>): void {
        match opt {
          Some(v) => { tell(@s, "value") }
          None    => { tell(@s, "none") }
        }
      }
    `
    const result = compile(src, { namespace: 'test' })
    // The arm bodies are in sub-functions; check all generated content
    const allContent = result.files.map(f => f.content).join('\n')
    expect(allContent).toMatch(/value/)
    expect(allContent).toMatch(/none/)
    // tellraw should appear in at least one of the arm sub-functions
    expect(allContent).toMatch(/tellraw/)
  })

  it('None arm runs when option is empty: correct has==0 check', () => {
    const src = `
      fn test_none(opt: Option<int>): void {
        match opt {
          Some(x) => { tell(@s, "has") }
          None    => { tell(@s, "none") }
        }
      }
    `
    const result = compile(src, { namespace: 'test' })
    const fn = getFile(result, 'test_none')
    expect(fn).toBeDefined()
    // Has-slot comparison generates an execute if score branch
    expect(fn).toMatch(/execute if score/)
    // The const_0 and const_1 are used for None/Some checks
    const allContent = result.files.map(f => f.content).join('\n')
    expect(allContent).toMatch(/\$__const_[01] __test/)
  })
})
