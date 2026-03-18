import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { lowerToHIR } from '../hir/lower'
import type { HIRStmt, HIRExpr } from '../hir/types'
import { compile } from '../emit/compile'

function parseHIR(source: string) {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  return lowerToHIR(ast)
}

function getBody(source: string): HIRStmt[] {
  return parseHIR(source).functions[0].body
}

describe('for-range: lexer', () => {
  test('lexes 0..10 as range_lit', () => {
    const tokens = new Lexer('0..10').tokenize()
    expect(tokens[0].kind).toBe('range_lit')
    expect(tokens[0].value).toBe('0..10')
  })

  test('lexes 0..=9 as range_lit', () => {
    const tokens = new Lexer('0..=9').tokenize()
    expect(tokens[0].kind).toBe('range_lit')
    expect(tokens[0].value).toBe('0..=9')
  })

  test('lexes ..=5 as range_lit', () => {
    const tokens = new Lexer('..=5').tokenize()
    expect(tokens[0].kind).toBe('range_lit')
    expect(tokens[0].value).toBe('..=5')
  })

  test('lexes 0.. as range_lit (open-ended)', () => {
    const tokens = new Lexer('0..').tokenize()
    expect(tokens[0].kind).toBe('range_lit')
    expect(tokens[0].value).toBe('0..')
  })
})

describe('for-range: parser', () => {
  test('for i in 0..10 parses to for_range', () => {
    const program = new Parser(new Lexer('fn f() { for i in 0..10 { } }').tokenize()).parse('test')
    const stmt = program.declarations[0].body[0]
    expect(stmt.kind).toBe('for_range')
    if (stmt.kind === 'for_range') {
      expect(stmt.varName).toBe('i')
      expect(stmt.inclusive).toBeFalsy()
      expect((stmt.start as any).value).toBe(0)
      expect((stmt.end as any).value).toBe(10)
    }
  })

  test('for i in 0..=9 parses to for_range with inclusive=true', () => {
    const program = new Parser(new Lexer('fn f() { for i in 0..=9 { } }').tokenize()).parse('test')
    const stmt = program.declarations[0].body[0]
    expect(stmt.kind).toBe('for_range')
    if (stmt.kind === 'for_range') {
      expect(stmt.varName).toBe('i')
      expect(stmt.inclusive).toBe(true)
      expect((stmt.start as any).value).toBe(0)
      expect((stmt.end as any).value).toBe(9)
    }
  })

  test('for i in 0..n parses to for_range with dynamic end', () => {
    const program = new Parser(new Lexer('fn f(n: int) { for i in 0..n { } }').tokenize()).parse('test')
    const stmt = program.declarations[0].body[0]
    expect(stmt.kind).toBe('for_range')
    if (stmt.kind === 'for_range') {
      expect(stmt.varName).toBe('i')
      expect(stmt.inclusive).toBeFalsy()
      expect((stmt.start as any).value).toBe(0)
      expect((stmt.end as any).kind).toBe('ident')
      expect((stmt.end as any).name).toBe('n')
    }
  })
})

describe('for-range: HIR lowering', () => {
  test('for i in 0..10 → let i=0; while(i<10){body;i=i+1}', () => {
    const body = getBody('fn f() { for i in 0..10 { } }')
    expect(body).toHaveLength(2)
    expect(body[0].kind).toBe('let')
    expect(body[1].kind).toBe('while')
    const w = body[1] as Extract<HIRStmt, { kind: 'while' }>
    const cond = w.cond as Extract<HIRExpr, { kind: 'binary' }>
    expect(cond.op).toBe('<')
  })

  test('for i in 0..=9 uses <= in while condition', () => {
    const body = getBody('fn f() { for i in 0..=9 { } }')
    expect(body).toHaveLength(2)
    const w = body[1] as Extract<HIRStmt, { kind: 'while' }>
    const cond = w.cond as Extract<HIRExpr, { kind: 'binary' }>
    expect(cond.op).toBe('<=')
    expect((cond.right as any).value).toBe(9)
  })

  test('for i in 0..n uses ident as end expr', () => {
    const body = getBody('fn f(n: int) { for i in 0..n { } }')
    expect(body).toHaveLength(2)
    const w = body[1] as Extract<HIRStmt, { kind: 'while' }>
    const cond = w.cond as Extract<HIRExpr, { kind: 'binary' }>
    expect(cond.op).toBe('<')
    expect((cond.right as any).kind).toBe('ident')
    expect((cond.right as any).name).toBe('n')
  })
})

describe('for-range: compile', () => {
  test('for i in 0..n compiles end-to-end', () => {
    const src = `
      @keep fn test(n: int): void {
        let sum: int = 0
        for i in 0..n {
          sum = sum + i
        }
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })

  test('for i in 0..=9 compiles end-to-end', () => {
    const src = `
      @keep fn test(): void {
        let sum: int = 0
        for i in 0..=9 {
          sum = sum + i
        }
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })

  test('for i in 0..5 compiles end-to-end (literal)', () => {
    const src = `
      @keep fn test(): void {
        let sum: int = 0
        for i in 0..5 {
          sum = sum + i
        }
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })
})
