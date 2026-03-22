/**
 * Coverage boost tests for src/hir/lower.ts
 *
 * Targets the two remaining uncovered default exhaustive branches:
 *  - line 514-515: lowerStmt default branch — unknown stmt.kind
 *  - line 750-751: lowerExpr default branch — unknown expr.kind
 *
 * Since these are TypeScript `never` exhaustive guards, we must inject
 * unknown kinds at runtime using `as any` casts.
 */

import { lowerToHIR } from '../../hir/lower'
import type { Program, Stmt, Expr } from '../../ast/types'

// ---------------------------------------------------------------------------
// Minimal valid Program skeleton
// ---------------------------------------------------------------------------

function makeProgram(overrides?: Partial<Program>): Program {
  return {
    namespace: 'test',
    declarations: [],
    structs: [],
    implBlocks: [],
    enums: [],
    globals: [],
    consts: [],
    imports: [],
    interfaces: [],
    isLibrary: false,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// lowerStmt exhaustive default branch (line 514-515)
// ---------------------------------------------------------------------------

describe('HIR lowering — lowerStmt exhaustive default', () => {
  test('throws on unknown stmt kind', () => {
    const unknownStmt = { kind: '__unknown_stmt_kind__', span: { line: 1, col: 1 } } as unknown as Stmt

    const prog = makeProgram({
      declarations: [
        {
          name: 'testFn',
          params: [],
          returnType: { kind: 'named', name: 'void' },
          decorators: [],
          body: [unknownStmt],
        },
      ],
    })

    expect(() => lowerToHIR(prog)).toThrow('Unknown statement kind: __unknown_stmt_kind__')
  })
})

// ---------------------------------------------------------------------------
// lowerExpr exhaustive default branch (line 750-751)
// ---------------------------------------------------------------------------

describe('HIR lowering — lowerExpr exhaustive default', () => {
  test('throws on unknown expr kind', () => {
    const unknownExpr = { kind: '__unknown_expr_kind__', span: { line: 1, col: 1 } } as unknown as Expr

    // Trigger lowerExpr via a let stmt: let x = <unknown_expr>
    const letStmt: Stmt = {
      kind: 'let',
      name: 'x',
      type: { kind: 'named', name: 'int' },
      init: unknownExpr,
      span: { line: 1, col: 1 },
    }

    const prog = makeProgram({
      declarations: [
        {
          name: 'testFn',
          params: [],
          returnType: { kind: 'named', name: 'void' },
          decorators: [],
          body: [letStmt],
        },
      ],
    })

    expect(() => lowerToHIR(prog)).toThrow('Unknown expression kind: __unknown_expr_kind__')
  })
})
