/**
 * Tests for DiagnosticError propagation in string match lowering.
 *
 * Covers the two error paths in the 'match' case of lowerStmt:
 *   1. Subject expression is not a string literal or tracked string variable.
 *   2. A pattern in a string-match arm is not PatWild or PatExpr+str_lit.
 *
 * Both paths now throw DiagnosticError with source location rather than a
 * plain Error, so tests assert on the error kind, message, and location fields.
 */

import { lowerToMIR } from '../../mir/lower'
import { DiagnosticError } from '../../diagnostics'
import type { HIRModule, HIRFunction } from '../../hir/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModule(fn: HIRFunction): HIRModule {
  return {
    namespace: 'test',
    globals: [],
    functions: [fn],
    structs: [],
    implBlocks: [],
    enums: [],
    consts: [],
  }
}

function makeVoidFn(name: string, body: HIRFunction['body'], span?: { line: number; col: number }): HIRFunction {
  return {
    name,
    params: [],
    returnType: { kind: 'named', name: 'void' },
    decorators: [],
    body,
    span,
  }
}

// ---------------------------------------------------------------------------
// Error path 1: subject is not a string/tracked-string
//   match (42) { "a" => {} }
//   The subject is an int_lit, so lowerStringExprToPath returns null.
// ---------------------------------------------------------------------------

describe('string match: non-string subject throws DiagnosticError', () => {
  test('integer literal subject with string pattern arm', () => {
    const hir = makeModule(makeVoidFn('f', [
      {
        kind: 'match',
        expr: { kind: 'int_lit', value: 42 },
        arms: [
          {
            pattern: { kind: 'PatExpr', expr: { kind: 'str_lit', value: 'a' } },
            body: [],
          },
        ],
      },
    ]))

    expect(() => lowerToMIR(hir)).toThrow(DiagnosticError)
  })

  test('thrown DiagnosticError has kind LoweringError', () => {
    const hir = makeModule(makeVoidFn('f', [
      {
        kind: 'match',
        expr: { kind: 'int_lit', value: 0 },
        arms: [
          {
            pattern: { kind: 'PatExpr', expr: { kind: 'str_lit', value: 'x' } },
            body: [],
          },
        ],
      },
    ]))

    let caught: unknown
    try {
      lowerToMIR(hir)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(DiagnosticError)
    const err = caught as DiagnosticError
    expect(err.kind).toBe('LoweringError')
    expect(err.message).toMatch(/string match/i)
  })

  test('error location falls back to line 1 col 1 when span is absent', () => {
    // No span on the match statement → fallback location
    const hir = makeModule(makeVoidFn('f', [
      {
        kind: 'match',
        expr: { kind: 'float_lit', value: 1.5 },
        arms: [
          {
            pattern: { kind: 'PatExpr', expr: { kind: 'str_lit', value: 'y' } },
            body: [],
          },
        ],
      },
    ]))

    let caught: unknown
    try {
      lowerToMIR(hir)
    } catch (e) {
      caught = e
    }
    const err = caught as DiagnosticError
    expect(err.location.line).toBe(1)
    expect(err.location.col).toBe(1)
  })

  test('error location uses stmt.span when present', () => {
    const span = { line: 7, col: 3 }
    const hir = makeModule(makeVoidFn('f', [
      {
        kind: 'match',
        expr: { kind: 'int_lit', value: 0 },
        arms: [
          {
            pattern: { kind: 'PatExpr', expr: { kind: 'str_lit', value: 'z' } },
            body: [],
          },
        ],
        span,
      },
    ]))

    let caught: unknown
    try {
      lowerToMIR(hir, 'src/foo.rs')
    } catch (e) {
      caught = e
    }
    const err = caught as DiagnosticError
    expect(err.location.line).toBe(7)
    expect(err.location.col).toBe(3)
    expect(err.location.file).toBe('src/foo.rs')
  })
})

// ---------------------------------------------------------------------------
// Error path 2: unsupported pattern kind in a string match
//   The subject IS a string literal (so path 1 passes), but an arm has a
//   PatInt pattern — which is not a valid string-match pattern.
// ---------------------------------------------------------------------------

describe('string match: unsupported arm pattern throws DiagnosticError', () => {
  test('PatInt in a string match arm throws', () => {
    const hir = makeModule(makeVoidFn('f', [
      {
        kind: 'match',
        expr: { kind: 'str_lit', value: 'hello' },
        arms: [
          // one valid string arm so hasStringPats is true
          {
            pattern: { kind: 'PatExpr', expr: { kind: 'str_lit', value: 'hello' } },
            body: [],
          },
          // invalid arm: PatInt is not supported in a string match
          {
            pattern: { kind: 'PatInt', value: 1 },
            body: [],
          },
        ],
      },
    ]))

    expect(() => lowerToMIR(hir)).toThrow(DiagnosticError)
  })

  test('thrown DiagnosticError names the unsupported pattern kind', () => {
    const hir = makeModule(makeVoidFn('f', [
      {
        kind: 'match',
        expr: { kind: 'str_lit', value: 'a' },
        arms: [
          {
            pattern: { kind: 'PatExpr', expr: { kind: 'str_lit', value: 'a' } },
            body: [],
          },
          {
            pattern: { kind: 'PatInt', value: 2 },
            body: [],
          },
        ],
      },
    ]))

    let caught: unknown
    try {
      lowerToMIR(hir)
    } catch (e) {
      caught = e
    }
    const err = caught as DiagnosticError
    expect(err.kind).toBe('LoweringError')
    expect(err.message).toMatch(/PatInt/)
  })

  test('error location falls back to line 1 col 1 when span absent', () => {
    const hir = makeModule(makeVoidFn('f', [
      {
        kind: 'match',
        expr: { kind: 'str_lit', value: 'b' },
        arms: [
          {
            pattern: { kind: 'PatExpr', expr: { kind: 'str_lit', value: 'b' } },
            body: [],
          },
          {
            pattern: { kind: 'PatInt', value: 0 },
            body: [],
          },
        ],
      },
    ]))

    let caught: unknown
    try {
      lowerToMIR(hir)
    } catch (e) {
      caught = e
    }
    const err = caught as DiagnosticError
    expect(err.location.line).toBe(1)
    expect(err.location.col).toBe(1)
  })

  test('error location uses stmt.span when present', () => {
    const span = { line: 12, col: 5 }
    const hir = makeModule(makeVoidFn('f', [
      {
        kind: 'match',
        expr: { kind: 'str_lit', value: 'c' },
        arms: [
          {
            pattern: { kind: 'PatExpr', expr: { kind: 'str_lit', value: 'c' } },
            body: [],
          },
          {
            pattern: { kind: 'PatInt', value: 99 },
            body: [],
          },
        ],
        span,
      },
    ]))

    let caught: unknown
    try {
      lowerToMIR(hir, 'src/bar.rs')
    } catch (e) {
      caught = e
    }
    const err = caught as DiagnosticError
    expect(err.location.line).toBe(12)
    expect(err.location.col).toBe(5)
    expect(err.location.file).toBe('src/bar.rs')
  })

  test('PatEnum in a string match arm also throws DiagnosticError', () => {
    const hir = makeModule(makeVoidFn('f', [
      {
        kind: 'match',
        expr: { kind: 'str_lit', value: 'd' },
        arms: [
          {
            pattern: { kind: 'PatExpr', expr: { kind: 'str_lit', value: 'd' } },
            body: [],
          },
          {
            pattern: { kind: 'PatEnum', enumName: 'Color', variant: 'Red', bindings: [] },
            body: [],
          },
        ],
      },
    ]))

    expect(() => lowerToMIR(hir)).toThrow(DiagnosticError)
  })
})

// ---------------------------------------------------------------------------
// Happy path: valid string matches should NOT throw
// ---------------------------------------------------------------------------

describe('string match: valid patterns compile without errors', () => {
  test('string literal subject with one string arm and wildcard', () => {
    const hir = makeModule(makeVoidFn('f', [
      {
        kind: 'match',
        expr: { kind: 'str_lit', value: 'hello' },
        arms: [
          {
            pattern: { kind: 'PatExpr', expr: { kind: 'str_lit', value: 'hello' } },
            body: [],
          },
          {
            pattern: { kind: 'PatWild' },
            body: [],
          },
        ],
      },
      { kind: 'return' },
    ]))

    expect(() => lowerToMIR(hir)).not.toThrow()
  })

  test('multiple string arms compile without errors', () => {
    const hir = makeModule(makeVoidFn('f', [
      {
        kind: 'match',
        expr: { kind: 'str_lit', value: 'x' },
        arms: [
          {
            pattern: { kind: 'PatExpr', expr: { kind: 'str_lit', value: 'a' } },
            body: [],
          },
          {
            pattern: { kind: 'PatExpr', expr: { kind: 'str_lit', value: 'b' } },
            body: [],
          },
          {
            pattern: { kind: 'PatWild' },
            body: [],
          },
        ],
      },
      { kind: 'return' },
    ]))

    expect(() => lowerToMIR(hir)).not.toThrow()
  })
})
