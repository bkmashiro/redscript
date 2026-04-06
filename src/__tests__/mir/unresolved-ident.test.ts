/**
 * Regression tests for the unresolved-identifier guard in lowerExpr (ident case).
 *
 * Before this fix, an identifier that was not in scope / constants / globals
 * silently emitted a constant 0, masking bugs in earlier compiler stages.
 * The fix throws an Error with a descriptive message instead.
 */

import { lowerToMIR } from '../../mir/lower'
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

function makeIntFn(name: string, body: HIRFunction['body']): HIRFunction {
  return {
    name,
    params: [],
    returnType: { kind: 'named', name: 'int' },
    decorators: [],
    body,
  }
}

// ---------------------------------------------------------------------------
// Error cases: unresolved identifiers must throw
// ---------------------------------------------------------------------------

describe('unresolved identifier at MIR lowering throws', () => {
  test('reading an unknown name throws with a descriptive message', () => {
    const hir = makeModule(makeIntFn('f', [
      {
        kind: 'return',
        value: { kind: 'ident', name: 'ghost' },
      },
    ]))

    expect(() => lowerToMIR(hir)).toThrow(
      "Unresolved identifier 'ghost' at MIR lowering stage — this is a compiler bug",
    )
  })

  test('error message includes the identifier name', () => {
    const hir = makeModule(makeIntFn('f', [
      {
        kind: 'return',
        value: { kind: 'ident', name: 'totally_unknown_var' },
      },
    ]))

    let caught: unknown
    try {
      lowerToMIR(hir)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('totally_unknown_var')
  })

  test('different unknown names produce distinct error messages', () => {
    const makeHir = (name: string) =>
      makeModule(makeIntFn('f', [
        { kind: 'return', value: { kind: 'ident', name } },
      ]))

    let msg1: string | undefined
    let msg2: string | undefined
    try { lowerToMIR(makeHir('alpha')) } catch (e) { msg1 = (e as Error).message }
    try { lowerToMIR(makeHir('beta')) } catch (e) { msg2 = (e as Error).message }

    expect(msg1).toContain('alpha')
    expect(msg2).toContain('beta')
    expect(msg1).not.toBe(msg2)
  })

  test('unresolved ident used in binary expression throws', () => {
    const hir = makeModule(makeIntFn('f', [
      {
        kind: 'return',
        value: {
          kind: 'binary',
          op: '+',
          left: { kind: 'int_lit', value: 1 },
          right: { kind: 'ident', name: 'missing' },
        },
      },
    ]))

    expect(() => lowerToMIR(hir)).toThrow(/missing/)
  })
})

// ---------------------------------------------------------------------------
// Happy path: resolved identifiers must NOT throw
// ---------------------------------------------------------------------------

describe('resolved identifiers do not throw', () => {
  test('function parameter is in scope and resolves without error', () => {
    const fn: HIRFunction = {
      name: 'identity',
      params: [{ name: 'x', type: { kind: 'named', name: 'int' } }],
      returnType: { kind: 'named', name: 'int' },
      decorators: [],
      body: [
        { kind: 'return', value: { kind: 'ident', name: 'x' } },
      ],
    }
    expect(() => lowerToMIR(makeModule(fn))).not.toThrow()
  })

  test('let-bound variable is in scope and resolves without error', () => {
    const hir = makeModule(makeIntFn('f', [
      {
        kind: 'let',
        name: 'y',
        init: { kind: 'int_lit', value: 42 },
      },
      {
        kind: 'return',
        value: { kind: 'ident', name: 'y' },
      },
    ]))
    expect(() => lowerToMIR(hir)).not.toThrow()
  })

  test('module-level const resolves without error', () => {
    const mod: HIRModule = {
      namespace: 'test',
      globals: [],
      functions: [
        makeIntFn('f', [
          { kind: 'return', value: { kind: 'ident', name: 'MAX' } },
        ]),
      ],
      structs: [],
      implBlocks: [],
      enums: [],
      consts: [
        {
          name: 'MAX',
          type: { kind: 'named', name: 'int' },
          value: { kind: 'int_lit', value: 100 },
        },
      ],
    }
    expect(() => lowerToMIR(mod)).not.toThrow()
  })
})
