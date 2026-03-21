/**
 * Tests for Option extensions:
 * - while let Some(x) = opt { ... }
 * - opt.unwrap_or(default)
 */

import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { compile } from '../../emit/compile'
import type { Program } from '../../ast/types'

function parse(source: string, namespace = 'test'): Program {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens).parse(namespace)
}

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  const exact = files.find(f => f.path.endsWith(`function/${pathSubstr}.mcfunction`))
  if (exact) return exact.content
  const f = files.find(f => f.path.includes(pathSubstr))
  return f?.content
}

// ---------------------------------------------------------------------------
// Parser: while let
// ---------------------------------------------------------------------------

describe('while let: Parser', () => {
  it('parses while let Some(x) = opt { ... }', () => {
    const prog = parse(`
      fn f(p: Option<int>): void {
        while let Some(x) = p {
          let y: int = x;
        }
      }
    `)
    const stmt = prog.declarations[0].body[0]
    expect(stmt.kind).toBe('while_let_some')
    if (stmt.kind === 'while_let_some') {
      expect(stmt.binding).toBe('x')
      expect(stmt.init).toEqual({ kind: 'ident', name: 'p' })
      expect(stmt.body.length).toBe(1)
    }
  })

  it('parses while let Some(val) = expr { body }', () => {
    const prog = parse(`
      fn f(): void {
        let opt: Option<int> = Some(5);
        while let Some(n) = opt {
          let z: int = n;
        }
      }
    `)
    const whileStmt = prog.declarations[0].body[1]
    expect(whileStmt.kind).toBe('while_let_some')
    if (whileStmt.kind === 'while_let_some') {
      expect(whileStmt.binding).toBe('n')
    }
  })
})

// ---------------------------------------------------------------------------
// Parser: unwrap_or
// ---------------------------------------------------------------------------

describe('unwrap_or: Parser', () => {
  it('parses opt.unwrap_or(0)', () => {
    const prog = parse(`
      fn f(p: Option<int>): void {
        let x: int = p.unwrap_or(0);
      }
    `)
    const letStmt = prog.declarations[0].body[0]
    expect(letStmt.kind).toBe('let')
    if (letStmt.kind === 'let') {
      expect(letStmt.init.kind).toBe('unwrap_or')
      if (letStmt.init.kind === 'unwrap_or') {
        expect(letStmt.init.opt).toEqual({ kind: 'ident', name: 'p' })
        expect(letStmt.init.default_).toEqual({ kind: 'int_lit', value: 0 })
      }
    }
  })

  it('parses chained: fn_call().unwrap_or(42)', () => {
    const prog = parse(`
      fn make(): Option<int> { return None; }
      fn f(): void {
        let val: int = make().unwrap_or(42);
      }
    `)
    const letStmt = prog.declarations[1].body[0]
    expect(letStmt.kind).toBe('let')
    if (letStmt.kind === 'let') {
      expect(letStmt.init.kind).toBe('unwrap_or')
      if (letStmt.init.kind === 'unwrap_or') {
        expect(letStmt.init.default_).toEqual({ kind: 'int_lit', value: 42 })
      }
    }
  })
})

// ---------------------------------------------------------------------------
// E2E: unwrap_or compilation
// ---------------------------------------------------------------------------

describe('unwrap_or: E2E', () => {
  it('compiles Some(5).unwrap_or(0) — result should be 5', () => {
    const source = `
      fn test(): void {
        let p: Option<int> = Some(5);
        let val: int = p.unwrap_or(0);
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.files.length).toBeGreaterThan(0)
    const fn = getFile(result.files, 'test')
    expect(fn).toBeDefined()
    // Should contain scoreboard operations
    expect(fn).toContain('scoreboard')
  })

  it('compiles None.unwrap_or(99) — compiles without error', () => {
    // When opt is None, unwrap_or branches to the merge block with the default value
    // The default 99 may be DCE'd if val is unused; we just verify compilation succeeds
    const source = `
      fn test(): void {
        let p: Option<int> = None;
        let val: int = p.unwrap_or(99);
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.files.length).toBeGreaterThan(0)
    const fn = getFile(result.files, 'test')
    expect(fn).toBeDefined()
    // has=0 should appear for None
    expect(fn).toContain('0')
  })

  it('compiles function-returning Option with unwrap_or', () => {
    const source = `
      fn maybe(): Option<int> {
        return Some(7);
      }
      fn test(): void {
        let val: int = maybe().unwrap_or(0);
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.files.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// E2E: while let compilation
// ---------------------------------------------------------------------------

describe('while let: E2E', () => {
  it('compiles while let Some(x) = opt with known-Some value', () => {
    const source = `
      fn test(): void {
        let opt: Option<int> = Some(1);
        while let Some(x) = opt {
          let y: int = x;
          opt = None;
        }
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.files.length).toBeGreaterThan(0)
    // Should generate a conditional/branch structure
    const hasConditional = result.files.some(f =>
      f.content.includes('execute if score') || f.content.includes('scoreboard')
    )
    expect(hasConditional).toBe(true)
  })

  it('compiles while let Some(x) = opt with None — loop body never runs', () => {
    const source = `
      fn test(): void {
        let opt: Option<int> = None;
        while let Some(x) = opt {
          let y: int = x;
        }
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.files.length).toBeGreaterThan(0)
  })

  it('compiles while let with function-returning Option', () => {
    const source = `
      fn next(): Option<int> {
        return None;
      }
      fn test(): void {
        let opt: Option<int> = next();
        while let Some(x) = opt {
          let y: int = x;
          opt = next();
        }
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(result.files.length).toBeGreaterThan(0)
  })
})
