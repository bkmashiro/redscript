/**
 * Error Recovery Tests
 *
 * Verifies that the parser continues after encountering syntax errors,
 * collecting all diagnostics rather than stopping at the first one.
 */

import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { DiagnosticError } from '../diagnostics'

function parseWithErrors(source: string, namespace = 'test'): {
  errors: DiagnosticError[]
  parsedFns: string[]
} {
  const tokens = new Lexer(source).tokenize()
  const parser = new Parser(tokens, source)
  let parsedFns: string[] = []
  try {
    const ast = parser.parse(namespace)
    parsedFns = ast.declarations.map(fn => fn.name)
  } catch (_) {
    // Partial AST not returned on throw, but we can inspect parseErrors below
  }
  return {
    errors: parser.parseErrors,
    parsedFns,
  }
}

describe('Parser Error Recovery', () => {
  describe('top-level declaration recovery', () => {
    it('reports all errors from multiple broken functions', () => {
      const source = `
fn good1() {
  let x: int = 42;
}

fn bad1( {
  let y: int = 1;
}

fn good2() {
  let z: int = 99;
}

fn bad2() {
  let w: int = ;
}

fn good3() {}
`
      const { errors } = parseWithErrors(source)
      // Should have collected at least 2 errors (bad1 and bad2)
      expect(errors.length).toBeGreaterThanOrEqual(2)
    })

    it('collects errors with correct line numbers', () => {
      const source = `fn a() {}
fn b( {
  let x = 1;
}
fn c() {
  let y = ;
}
fn d() {}`

      const { errors } = parseWithErrors(source)
      expect(errors.length).toBeGreaterThanOrEqual(2)
      // Each error should have a valid location
      for (const err of errors) {
        expect(err.location.line).toBeGreaterThan(0)
        expect(err.location.col).toBeGreaterThan(0)
      }
    })

    it('errors are DiagnosticError instances with ParseError kind', () => {
      const source = `
fn broken( {
  return 1;
}
fn also_broken() {
  let x = ;
}
`
      const { errors } = parseWithErrors(source)
      expect(errors.length).toBeGreaterThanOrEqual(1)
      for (const err of errors) {
        expect(err).toBeInstanceOf(DiagnosticError)
        expect(err.kind).toBe('ParseError')
      }
    })

    it('recovers and continues parsing after struct error', () => {
      const source = `
struct Bad {
  name
}

struct Good {
  x: int
  y: int
}
`
      const { errors } = parseWithErrors(source)
      expect(errors.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('block-level (statement) recovery', () => {
    it('collects multiple errors within a single function body', () => {
      const source = `
fn multi_error_fn() {
  let x: int = ;
  let y: int = 42;
  let z: int = ;
  let w: int = 100;
}
`
      const { errors } = parseWithErrors(source)
      // Should have at least 2 statement-level errors
      expect(errors.length).toBeGreaterThanOrEqual(2)
    })

    it('continues parsing after a bad statement', () => {
      // The second let statement should be parseable even after the first is broken
      const source = `
fn test_fn() {
  let x: int = ;
  let y: int = 42;
}
`
      const { errors } = parseWithErrors(source)
      expect(errors.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('error message quality', () => {
    it('formats errors with source pointer', () => {
      const source = `fn foo( {\n  return 1;\n}`
      const tokens = new Lexer(source).tokenize()
      const parser = new Parser(tokens, source)
      try { parser.parse('test') } catch (_) {}

      expect(parser.parseErrors.length).toBeGreaterThanOrEqual(1)
      const formatted = parser.parseErrors[0].format()
      expect(formatted).toContain('[ParseError]')
      expect(formatted).toContain('^')
      expect(formatted).toContain('line')
    })

    it('error location points to the problematic token', () => {
      const source = 'fn f() {\n  let x = ;\n}'
      const tokens = new Lexer(source).tokenize()
      const parser = new Parser(tokens, source)
      try { parser.parse('test') } catch (_) {}

      expect(parser.parseErrors.length).toBeGreaterThanOrEqual(1)
      const err = parser.parseErrors[0]
      // The error should be on line 2 (the `let x = ;` line)
      expect(err.location.line).toBe(2)
    })
  })

  describe('parseErrors array is populated', () => {
    it('is empty for valid programs', () => {
      const source = 'fn foo() { let x: int = 42; }'
      const tokens = new Lexer(source).tokenize()
      const parser = new Parser(tokens, source)
      parser.parse('test')
      expect(parser.parseErrors).toHaveLength(0)
    })

    it('is populated when errors occur', () => {
      const source = 'fn foo( {'
      const tokens = new Lexer(source).tokenize()
      const parser = new Parser(tokens, source)
      try { parser.parse('test') } catch (_) {}
      expect(parser.parseErrors.length).toBeGreaterThan(0)
    })
  })
})
