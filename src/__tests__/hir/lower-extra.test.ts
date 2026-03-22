/**
 * Extra coverage tests for src/hir/lower.ts
 *
 * Targets uncovered branches:
 *  - line 171: for-init that lowers to an array (Array.isArray branch = true)
 *  - line 673: `invoke` expression (calling a lambda variable)
 *  - line 713: lambda with single-expression body (not a block array)
 */

import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import type { HIRStmt, HIRExpr, HIRModule } from '../../hir/types'
import type { Program } from '../../ast/types'

function parse(source: string): HIRModule {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  return lowerToHIR(ast)
}

function getBody(source: string): HIRStmt[] {
  const mod = parse(source)
  return mod.functions[0].body
}

// ---------------------------------------------------------------------------
// Invoke expression (line 673)
// ---------------------------------------------------------------------------

describe('HIR lowering — invoke expression', () => {
  test('calling an array-indexed expression produces invoke node', () => {
    // fns[0](1, 2) — callee is index_access (not ident/member) → AST 'invoke' node
    const body = getBody(`
      fn outer() {
        let fns: int[] = [];
        fns[0](1, 2);
      }
    `)
    // body[0] = let fns, body[1] = expr(invoke)
    const exprStmt = body[1] as Extract<HIRStmt, { kind: 'expr' }>
    expect(exprStmt.kind).toBe('expr')
    const invoke = exprStmt.expr as Extract<HIRExpr, { kind: 'invoke' }>
    expect(invoke.kind).toBe('invoke')
    expect(invoke.args).toHaveLength(2)
  })

  test('invoke preserves all args', () => {
    const body = getBody(`
      fn g() {
        let callbacks: int[] = [];
        callbacks[0](10, 20, 30);
      }
    `)
    const exprStmt = body[1] as Extract<HIRStmt, { kind: 'expr' }>
    const invoke = exprStmt.expr as Extract<HIRExpr, { kind: 'invoke' }>
    expect(invoke.kind).toBe('invoke')
    expect(invoke.args).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// Lambda with single-expression body (line 713, branch[1])
// ---------------------------------------------------------------------------

describe('HIR lowering — lambda single-expression body', () => {
  test('(x: int) => x + 1 produces lambda with expr body', () => {
    const body = getBody(`
      fn h() {
        let add1: int = (x: int) => x + 1;
      }
    `)
    const letStmt = body[0] as Extract<HIRStmt, { kind: 'let' }>
    expect(letStmt.kind).toBe('let')
    const lambda = letStmt.init as Extract<HIRExpr, { kind: 'lambda' }>
    expect(lambda.kind).toBe('lambda')
    expect(lambda.params).toHaveLength(1)
    expect(lambda.params[0].name).toBe('x')
    // Single-expr body (not a block array)
    expect(Array.isArray(lambda.body)).toBe(false)
    const bodyExpr = lambda.body as HIRExpr
    expect(bodyExpr.kind).toBe('binary')
  })

  test('lambda with block body produces array body', () => {
    const body = getBody(`
      fn h2() {
        let add1: int = (x: int) => { return x + 1; };
      }
    `)
    const letStmt = body[0] as Extract<HIRStmt, { kind: 'let' }>
    const lambda = letStmt.init as Extract<HIRExpr, { kind: 'lambda' }>
    expect(lambda.kind).toBe('lambda')
    // Block body is an array
    expect(Array.isArray(lambda.body)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// for-init lowering to array (line 171, Array.isArray branch = true)
// ---------------------------------------------------------------------------

describe('HIR lowering — for-init that lowers to array', () => {
  test('for with for_range init: Array.isArray(init) branch is hit', () => {
    // Construct a Program directly: a `for` statement whose init is a `for_range`
    // (for_range lowers to [let, while] — an array), exercising line 171 branch[0]
    const program: Program = {
      namespace: 'test',
      globals: [],
      declarations: [
        {
          name: 'testFn',
          params: [],
          returnType: { kind: 'named', name: 'void' },
          decorators: [],
          body: [
            {
              kind: 'for',
              // init is a for_range stmt → lowerStmt returns HIRStmt[] (array)
              init: {
                kind: 'for_range',
                varName: 'i',
                start: { kind: 'int_lit', value: 0 },
                end: { kind: 'int_lit', value: 3 },
                body: [],
              },
              cond: { kind: 'bool_lit', value: true },
              step: { kind: 'int_lit', value: 0 },
              body: [],
            },
          ],
        },
      ],
      structs: [],
      implBlocks: [],
      enums: [],
      consts: [],
      imports: [],
      interfaces: [],
    }

    const hir = lowerToHIR(program)
    const body = hir.functions[0].body
    // The for_range init desugars to [let i = 0, while(i < 3){...}]
    // then the outer for also produces a while, so we get multiple stmts
    expect(body.length).toBeGreaterThan(1)
    // First stmts come from the flattened for_range array init
    expect(body[0].kind).toBe('let')
    expect((body[0] as Extract<HIRStmt, { kind: 'let' }>).name).toBe('i')
  })
})
