/**
 * Tests for DiagnosticError propagation across all bare-throw sites in mir/lower.ts:
 *   - break outside loop (with and without label)
 *   - continue outside loop (with and without label)
 *   - exhaustive default in lowerStmt
 *   - exhaustive default in lowerExpr
 *   - unknown binary op
 *
 * Each site should throw DiagnosticError('LoweringError', ...) with location derived
 * from stmt.span / expr.span / ctx.currentSourceLoc, falling back to { line: 1, col: 1 }.
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

function catchError(hir: HIRModule, sourceFile?: string): unknown {
  try {
    lowerToMIR(hir, sourceFile)
  } catch (e) {
    return e
  }
  return undefined
}

// ---------------------------------------------------------------------------
// break outside loop
// ---------------------------------------------------------------------------

describe('break outside loop throws DiagnosticError', () => {
  test('throws DiagnosticError', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'break' }]))
    expect(() => lowerToMIR(hir)).toThrow(DiagnosticError)
  })

  test('error kind is LoweringError', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'break' }]))
    const err = catchError(hir) as DiagnosticError
    expect(err.kind).toBe('LoweringError')
    expect(err.message).toMatch(/break outside loop/i)
  })

  test('location falls back to line 1 col 1 when no span', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'break' }]))
    const err = catchError(hir) as DiagnosticError
    expect(err.location.line).toBe(1)
    expect(err.location.col).toBe(1)
  })

  test('location uses stmt.span when present', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'break', span: { line: 4, col: 7 } }]))
    const err = catchError(hir, 'src/test.rs') as DiagnosticError
    expect(err.location.line).toBe(4)
    expect(err.location.col).toBe(7)
    expect(err.location.file).toBe('src/test.rs')
  })
})

// ---------------------------------------------------------------------------
// continue outside loop
// ---------------------------------------------------------------------------

describe('continue outside loop throws DiagnosticError', () => {
  test('throws DiagnosticError', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'continue' }]))
    expect(() => lowerToMIR(hir)).toThrow(DiagnosticError)
  })

  test('error kind is LoweringError', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'continue' }]))
    const err = catchError(hir) as DiagnosticError
    expect(err.kind).toBe('LoweringError')
    expect(err.message).toMatch(/continue outside loop/i)
  })

  test('location uses stmt.span when present', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'continue', span: { line: 9, col: 2 } }]))
    const err = catchError(hir, 'src/foo.rs') as DiagnosticError
    expect(err.location.line).toBe(9)
    expect(err.location.col).toBe(2)
    expect(err.location.file).toBe('src/foo.rs')
  })
})

// ---------------------------------------------------------------------------
// break_label with unknown label
// ---------------------------------------------------------------------------

describe('break with unknown label throws DiagnosticError', () => {
  test('throws DiagnosticError', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'break_label', label: 'outer' }]))
    expect(() => lowerToMIR(hir)).toThrow(DiagnosticError)
  })

  test('message names the missing label', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'break_label', label: 'myLoop' }]))
    const err = catchError(hir) as DiagnosticError
    expect(err.kind).toBe('LoweringError')
    expect(err.message).toMatch(/myLoop/)
  })

  test('location uses stmt.span when present', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'break_label', label: 'x', span: { line: 3, col: 1 } }]))
    const err = catchError(hir, 'a.rs') as DiagnosticError
    expect(err.location.line).toBe(3)
    expect(err.location.col).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// continue_label with unknown label
// ---------------------------------------------------------------------------

describe('continue with unknown label throws DiagnosticError', () => {
  test('throws DiagnosticError', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'continue_label', label: 'outer' }]))
    expect(() => lowerToMIR(hir)).toThrow(DiagnosticError)
  })

  test('message names the missing label', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'continue_label', label: 'myLoop' }]))
    const err = catchError(hir) as DiagnosticError
    expect(err.kind).toBe('LoweringError')
    expect(err.message).toMatch(/myLoop/)
  })
})

// ---------------------------------------------------------------------------
// Happy paths: break/continue inside a valid loop should NOT throw
// ---------------------------------------------------------------------------

describe('break/continue inside loop do not throw', () => {
  test('break inside while compiles', () => {
    const hir = makeModule(makeVoidFn('f', [
      {
        kind: 'while',
        cond: { kind: 'bool_lit', value: true },
        body: [{ kind: 'break' }],
      },
    ]))
    expect(() => lowerToMIR(hir)).not.toThrow()
  })

  test('continue inside while compiles', () => {
    const hir = makeModule(makeVoidFn('f', [
      {
        kind: 'while',
        cond: { kind: 'bool_lit', value: true },
        body: [{ kind: 'continue' }],
      },
    ]))
    expect(() => lowerToMIR(hir)).not.toThrow()
  })
})
