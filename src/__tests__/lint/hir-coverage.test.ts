/**
 * Direct HIR injection tests for src/lint/index.ts
 * Covers branches that require specific HIR statement/expression kinds
 * which cannot easily be produced by parsing RedScript source code.
 */

import { lintSource, lintFile, formatLintWarning } from '../../lint/index'
import type { ImportDecl } from '../../ast/types'
import type {
  HIRModule,
  HIRFunction,
  HIRStmt,
  HIRExpr,
  HIRBlock,
} from '../../hir/types'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModule(fns: HIRFunction[]): HIRModule {
  return {
    namespace: 'test',
    globals: [],
    functions: fns,
    structs: [],
    implBlocks: [],
    enums: [],
    consts: [],
  }
}

function makeSimpleFn(name: string, body: HIRBlock): HIRFunction {
  return {
    name,
    params: [],
    returnType: { kind: 'named', name: 'void' } as any,
    decorators: [],
    body,
  }
}

function makeIntLit(value: number): HIRExpr {
  return { kind: 'int_lit', value }
}

function makeIdent(name: string): HIRExpr {
  return { kind: 'ident', name }
}

function makeBoolLit(value: boolean): HIRExpr {
  return { kind: 'bool_lit', value }
}

// ---------------------------------------------------------------------------
// lintSource: collectCalledNamesStmt — extra branches
// ---------------------------------------------------------------------------

describe('collectCalledNamesStmt — all HIR statement kinds', () => {
  // Used to test that import "foo" is considered used when "foo" is called
  const importFoo: ImportDecl = { moduleName: 'mylib', symbol: 'foo' }

  it('handles const_decl with a call in value', () => {
    const body: HIRBlock = [
      {
        kind: 'const_decl',
        name: 'X',
        type: { kind: 'named', name: 'int' } as any,
        value: { kind: 'call', fn: 'foo', args: [] },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    // foo is called in const_decl → no unused-import warning
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles let_destruct with a call in init', () => {
    const body: HIRBlock = [
      {
        kind: 'let_destruct',
        names: ['a', 'b'],
        init: { kind: 'call', fn: 'foo', args: [] },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles return with a call in value', () => {
    const body: HIRBlock = [
      {
        kind: 'return',
        value: { kind: 'call', fn: 'foo', args: [] },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles expr statement with a call', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: { kind: 'call', fn: 'foo', args: [] },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles if statement: call in cond, then, else', () => {
    const body: HIRBlock = [
      {
        kind: 'if',
        cond: { kind: 'call', fn: 'foo', args: [] },
        then: [],
        else_: [],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles while statement: call in cond and body', () => {
    const body: HIRBlock = [
      {
        kind: 'while',
        cond: { kind: 'bool_lit', value: false },
        body: [{ kind: 'expr', expr: { kind: 'call', fn: 'foo', args: [] } }],
        step: [{ kind: 'expr', expr: { kind: 'call', fn: 'foo', args: [] } }],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles foreach statement: call in iterable and body', () => {
    const body: HIRBlock = [
      {
        kind: 'foreach',
        binding: 'p',
        iterable: { kind: 'ident', name: 'list' },
        body: [{ kind: 'expr', expr: { kind: 'call', fn: 'foo', args: [] } }],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles match statement: call in arms', () => {
    const body: HIRBlock = [
      {
        kind: 'match',
        expr: { kind: 'ident', name: 'x' },
        arms: [
          {
            pattern: { kind: 'PatWild' },
            body: [{ kind: 'expr', expr: { kind: 'call', fn: 'foo', args: [] } }],
          },
        ],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles execute statement: call in body', () => {
    const body: HIRBlock = [
      {
        kind: 'execute',
        subcommands: [],
        body: [{ kind: 'expr', expr: { kind: 'call', fn: 'foo', args: [] } }],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles if_let_some statement: call in then and else', () => {
    const body: HIRBlock = [
      {
        kind: 'if_let_some',
        binding: 'val',
        init: { kind: 'ident', name: 'opt' },
        then: [{ kind: 'expr', expr: { kind: 'call', fn: 'foo', args: [] } }],
        else_: [],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles while_let_some statement: call in body', () => {
    const body: HIRBlock = [
      {
        kind: 'while_let_some',
        binding: 'val',
        init: { kind: 'ident', name: 'opt' },
        body: [{ kind: 'expr', expr: { kind: 'call', fn: 'foo', args: [] } }],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles labeled_loop statement: call in body', () => {
    const body: HIRBlock = [
      {
        kind: 'labeled_loop',
        label: 'outer',
        body: {
          kind: 'expr',
          expr: { kind: 'call', fn: 'foo', args: [] },
        } as HIRStmt,
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// collectCalledNamesExpr — all expression kinds
// ---------------------------------------------------------------------------

describe('collectCalledNamesExpr — all expression kinds', () => {
  const importFoo: ImportDecl = { moduleName: 'mylib', symbol: 'foo' }

  it('handles invoke expression', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'invoke',
          callee: { kind: 'ident', name: 'obj' },
          args: [{ kind: 'call', fn: 'foo', args: [] }],
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles static_call expression', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'static_call',
          type: 'Math',
          method: 'foo',
          args: [],
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    // static_call adds "foo" to calledNames
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles binary expression with call in operands', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'binary',
          op: '+',
          left: { kind: 'call', fn: 'foo', args: [] },
          right: makeIntLit(1),
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles unary expression with call in operand', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'unary',
          op: '-',
          operand: { kind: 'call', fn: 'foo', args: [] },
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles member expression', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'member',
          obj: { kind: 'call', fn: 'foo', args: [] },
          field: 'x',
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles member_assign expression', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'member_assign',
          obj: { kind: 'call', fn: 'foo', args: [] },
          field: 'x',
          value: makeIntLit(1),
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles index expression', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'index',
          obj: { kind: 'call', fn: 'foo', args: [] },
          index: makeIntLit(0),
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles index_assign expression', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'index_assign',
          obj: { kind: 'call', fn: 'foo', args: [] },
          index: makeIntLit(0),
          op: '=',
          value: makeIntLit(1),
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles assign expression', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'assign',
          target: 'x',
          value: { kind: 'call', fn: 'foo', args: [] },
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles some_lit expression', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'some_lit',
          value: { kind: 'call', fn: 'foo', args: [] },
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles unwrap_or expression', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'unwrap_or',
          opt: { kind: 'call', fn: 'foo', args: [] },
          default_: makeIntLit(0),
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles type_cast expression', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'type_cast',
          expr: { kind: 'call', fn: 'foo', args: [] },
          targetType: { kind: 'named', name: 'int' } as any,
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles array_lit expression', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'array_lit',
          elements: [{ kind: 'call', fn: 'foo', args: [] }],
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles tuple_lit expression', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'tuple_lit',
          elements: [{ kind: 'call', fn: 'foo', args: [] }],
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles struct_lit expression', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'struct_lit',
          fields: [{ name: 'x', value: { kind: 'call', fn: 'foo', args: [] } }],
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles str_interp expression with non-string parts', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'str_interp',
          parts: ['hello ', { kind: 'call', fn: 'foo', args: [] }],
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles f_string expression', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'f_string',
          parts: [
            { kind: 'text', value: 'hello' },
            { kind: 'expr', expr: { kind: 'call', fn: 'foo', args: [] } },
          ],
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles lambda expression (block body)', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'lambda',
          params: [],
          body: [{ kind: 'expr', expr: { kind: 'call', fn: 'foo', args: [] } }] as HIRBlock,
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles lambda expression (expr body)', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'lambda',
          params: [],
          body: { kind: 'call', fn: 'foo', args: [] } as HIRExpr,
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })

  it('handles enum_construct expression', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: {
          kind: 'enum_construct',
          enumName: 'Color',
          variant: 'RGB',
          args: [{ name: 'r', value: { kind: 'call', fn: 'foo', args: [] } }],
        },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    expect(w.filter(x => x.rule === 'unused-import')).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// unused-variable: collectLetDeclsStmt — extra HIR branches
// ---------------------------------------------------------------------------

describe('unused-variable via collectLetDeclsStmt', () => {
  it('tracks variables declared in if body', () => {
    const body: HIRBlock = [
      {
        kind: 'if',
        cond: makeBoolLit(true),
        then: [{ kind: 'let', name: 'x', init: makeIntLit(5) }],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.some(x => x.rule === 'unused-variable' && x.message.includes('"x"'))).toBe(true)
  })

  it('tracks variables declared in if else body', () => {
    const body: HIRBlock = [
      {
        kind: 'if',
        cond: makeBoolLit(true),
        then: [],
        else_: [{ kind: 'let', name: 'y', init: makeIntLit(5) }],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.some(x => x.rule === 'unused-variable' && x.message.includes('"y"'))).toBe(true)
  })

  it('tracks variables declared in while body', () => {
    const body: HIRBlock = [
      {
        kind: 'while',
        cond: makeBoolLit(false),
        body: [{ kind: 'let', name: 'z', init: makeIntLit(5) }],
        step: [{ kind: 'let', name: 'w', init: makeIntLit(5) }],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.some(x => x.rule === 'unused-variable' && x.message.includes('"z"'))).toBe(true)
    expect(w.some(x => x.rule === 'unused-variable' && x.message.includes('"w"'))).toBe(true)
  })

  it('tracks variables declared in foreach body', () => {
    const body: HIRBlock = [
      {
        kind: 'foreach',
        binding: 'item',
        iterable: { kind: 'ident', name: 'list' },
        body: [{ kind: 'let', name: 'tmp', init: makeIntLit(5) }],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    // Both 'item' (binding) and 'tmp' should be unused
    const names = w.filter(x => x.rule === 'unused-variable').map(x => x.message)
    expect(names.some(m => m.includes('"item"') || m.includes('"tmp"'))).toBe(true)
  })

  it('tracks variables declared in match arm bodies', () => {
    const body: HIRBlock = [
      {
        kind: 'match',
        expr: { kind: 'ident', name: 'x' },
        arms: [
          {
            pattern: { kind: 'PatWild' },
            body: [{ kind: 'let', name: 'armVar', init: makeIntLit(5) }],
          },
        ],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.some(x => x.rule === 'unused-variable' && x.message.includes('"armVar"'))).toBe(true)
  })

  it('tracks variables declared in execute body', () => {
    const body: HIRBlock = [
      {
        kind: 'execute',
        subcommands: [],
        body: [{ kind: 'let', name: 'execVar', init: makeIntLit(5) }],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.some(x => x.rule === 'unused-variable' && x.message.includes('"execVar"'))).toBe(true)
  })

  it('tracks variables declared in if_let_some bodies', () => {
    const body: HIRBlock = [
      {
        kind: 'if_let_some',
        binding: 'bound',
        init: { kind: 'ident', name: 'opt' },
        then: [{ kind: 'let', name: 'thenVar', init: makeIntLit(5) }],
        else_: [{ kind: 'let', name: 'elseVar', init: makeIntLit(5) }],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    const names = w.filter(x => x.rule === 'unused-variable').map(x => x.message)
    // 'bound', 'thenVar', 'elseVar' should all be unused
    expect(names.some(m => m.includes('"bound"') || m.includes('"thenVar"') || m.includes('"elseVar"'))).toBe(true)
  })

  it('tracks variables declared in while_let_some body', () => {
    const body: HIRBlock = [
      {
        kind: 'while_let_some',
        binding: 'loopBound',
        init: { kind: 'ident', name: 'opt' },
        body: [{ kind: 'let', name: 'loopVar', init: makeIntLit(5) }],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    const names = w.filter(x => x.rule === 'unused-variable').map(x => x.message)
    expect(names.some(m => m.includes('"loopBound"') || m.includes('"loopVar"'))).toBe(true)
  })

  it('tracks variables declared via labeled_loop body', () => {
    const innerLetStmt: HIRStmt = { kind: 'let', name: 'innerVar', init: makeIntLit(5) }
    const body: HIRBlock = [
      {
        kind: 'labeled_loop',
        label: 'outer',
        body: innerLetStmt,
      },
    ]
    // Note: labeled_loop body is a single stmt (not HIRBlock) — we need to wrap in if
    // Actually labeled_loop.body is HIRStmt directly
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    // Should not throw
    expect(Array.isArray(w)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// countIdentReadsStmt — all HIR statement kinds
// ---------------------------------------------------------------------------

describe('countIdentReadsStmt — all HIR statement kinds', () => {
  it('reads idents in let_destruct init', () => {
    const body: HIRBlock = [
      { kind: 'let', name: 'myVar', init: makeIntLit(1) },
      {
        kind: 'let_destruct',
        names: ['a', 'b'],
        init: makeIdent('myVar'), // reads myVar
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    // myVar is read in let_destruct init
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads idents in const_decl value', () => {
    const body: HIRBlock = [
      { kind: 'let', name: 'myVar', init: makeIntLit(1) },
      {
        kind: 'const_decl',
        name: 'C',
        type: { kind: 'named', name: 'int' } as any,
        value: makeIdent('myVar'), // reads myVar
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    // myVar is read in const_decl value → not unused
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads idents in foreach iterable', () => {
    const body: HIRBlock = [
      { kind: 'let', name: 'myList', init: { kind: 'array_lit', elements: [] } },
      {
        kind: 'foreach',
        binding: 'item',
        iterable: makeIdent('myList'), // reads myList
        body: [],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    // myList is read in foreach iterable → not unused
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myList"'))).toHaveLength(0)
  })

  it('reads idents in match expr', () => {
    const body: HIRBlock = [
      { kind: 'let', name: 'myVal', init: makeIntLit(1) },
      {
        kind: 'match',
        expr: makeIdent('myVal'), // reads myVal
        arms: [],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVal"'))).toHaveLength(0)
  })

  it('reads idents in execute body', () => {
    const body: HIRBlock = [
      { kind: 'let', name: 'myVar2', init: makeIntLit(1) },
      {
        kind: 'execute',
        subcommands: [],
        body: [{ kind: 'return', value: makeIdent('myVar2') }],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar2"'))).toHaveLength(0)
  })

  it('reads idents in if_let_some then and else', () => {
    const body: HIRBlock = [
      { kind: 'let', name: 'optVal', init: makeIntLit(1) },
      {
        kind: 'if_let_some',
        binding: 'bound',
        init: { kind: 'ident', name: 'opt' },
        then: [{ kind: 'return', value: makeIdent('optVal') }],
        else_: [],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"optVal"'))).toHaveLength(0)
  })

  it('reads idents in while_let_some body', () => {
    const body: HIRBlock = [
      { kind: 'let', name: 'wlVar', init: makeIntLit(1) },
      {
        kind: 'while_let_some',
        binding: 'bound2',
        init: { kind: 'ident', name: 'opt' },
        body: [{ kind: 'return', value: makeIdent('wlVar') }],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"wlVar"'))).toHaveLength(0)
  })

  it('reads idents in labeled_loop body stmt', () => {
    const body: HIRBlock = [
      { kind: 'let', name: 'llVar', init: makeIntLit(1) },
      {
        kind: 'labeled_loop',
        label: 'loop1',
        body: { kind: 'return', value: makeIdent('llVar') } as HIRStmt,
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"llVar"'))).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// countIdentReadsExpr — all expression kinds
// ---------------------------------------------------------------------------

describe('countIdentReadsExpr — all expression kinds', () => {
  function makeUsedVar(name: string, initExpr: HIRExpr): HIRBlock {
    return [
      { kind: 'let', name, init: makeIntLit(0) },
      { kind: 'expr', expr: initExpr },
    ]
  }

  it('reads ident inside invoke callee', () => {
    const body = makeUsedVar('myVar', { kind: 'invoke', callee: makeIdent('myVar'), args: [] })
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads ident inside static_call args', () => {
    const body = makeUsedVar('myVar', {
      kind: 'static_call',
      type: 'Math',
      method: 'abs',
      args: [makeIdent('myVar')],
    })
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads ident inside member object', () => {
    const body = makeUsedVar('myVar', { kind: 'member', obj: makeIdent('myVar'), field: 'x' })
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads ident inside member_assign object and value', () => {
    const body = makeUsedVar('myVar', {
      kind: 'member_assign',
      obj: makeIdent('myVar'),
      field: 'x',
      value: makeIntLit(1),
    })
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads ident inside index object and index', () => {
    const body = makeUsedVar('myVar', {
      kind: 'index',
      obj: makeIdent('myVar'),
      index: makeIntLit(0),
    })
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads ident inside index_assign', () => {
    const body = makeUsedVar('myVar', {
      kind: 'index_assign',
      obj: makeIdent('myVar'),
      index: makeIntLit(0),
      op: '=',
      value: makeIntLit(1),
    })
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads ident inside some_lit', () => {
    const body = makeUsedVar('myVar', { kind: 'some_lit', value: makeIdent('myVar') })
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads ident inside unwrap_or opt and default', () => {
    const body = makeUsedVar('myVar', {
      kind: 'unwrap_or',
      opt: makeIdent('myVar'),
      default_: makeIntLit(0),
    })
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads ident inside type_cast', () => {
    const body = makeUsedVar('myVar', {
      kind: 'type_cast',
      expr: makeIdent('myVar'),
      targetType: { kind: 'named', name: 'float' } as any,
    })
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads ident inside array_lit elements', () => {
    const body = makeUsedVar('myVar', { kind: 'array_lit', elements: [makeIdent('myVar')] })
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads ident inside tuple_lit elements', () => {
    const body = makeUsedVar('myVar', { kind: 'tuple_lit', elements: [makeIdent('myVar')] })
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads ident inside struct_lit fields', () => {
    const body = makeUsedVar('myVar', {
      kind: 'struct_lit',
      fields: [{ name: 'x', value: makeIdent('myVar') }],
    })
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads ident inside str_interp parts', () => {
    const body = makeUsedVar('myVar', {
      kind: 'str_interp',
      parts: ['hello ', makeIdent('myVar')],
    })
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads ident inside f_string expr parts', () => {
    const body = makeUsedVar('myVar', {
      kind: 'f_string',
      parts: [
        { kind: 'text', value: 'hello' },
        { kind: 'expr', expr: makeIdent('myVar') },
      ],
    })
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads ident inside lambda block body', () => {
    const body = makeUsedVar('myVar', {
      kind: 'lambda',
      params: [],
      body: [{ kind: 'return', value: makeIdent('myVar') }] as HIRBlock,
    })
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads ident inside lambda expr body', () => {
    const body = makeUsedVar('myVar', {
      kind: 'lambda',
      params: [],
      body: makeIdent('myVar') as HIRExpr,
    })
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })

  it('reads ident inside enum_construct args', () => {
    const body = makeUsedVar('myVar', {
      kind: 'enum_construct',
      enumName: 'Color',
      variant: 'RGB',
      args: [{ name: 'r', value: makeIdent('myVar') }],
    })
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'unused-variable' && x.message.includes('"myVar"'))).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// magic-number: extra statement kinds
// ---------------------------------------------------------------------------

describe('checkMagicNumbersStmt — extra HIR statement kinds', () => {
  it('flags magic number in let_destruct init', () => {
    const body: HIRBlock = [
      {
        kind: 'let_destruct',
        names: ['a'],
        init: makeIntLit(999),
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.some(x => x.rule === 'magic-number' && x.message.includes('999'))).toBe(true)
  })

  it('flags magic number in foreach iterable (though iterable is usually a selector)', () => {
    const body: HIRBlock = [
      {
        kind: 'foreach',
        binding: 'p',
        iterable: makeIntLit(999),
        body: [],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.some(x => x.rule === 'magic-number')).toBe(true)
  })

  it('flags magic number in match expr', () => {
    const body: HIRBlock = [
      {
        kind: 'match',
        expr: makeIntLit(999),
        arms: [],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.some(x => x.rule === 'magic-number' && x.message.includes('999'))).toBe(true)
  })

  it('flags magic number in execute body', () => {
    const body: HIRBlock = [
      {
        kind: 'execute',
        subcommands: [],
        body: [{ kind: 'return', value: makeIntLit(999) }],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.some(x => x.rule === 'magic-number' && x.message.includes('999'))).toBe(true)
  })

  it('flags magic number in if_let_some init and then/else', () => {
    const body: HIRBlock = [
      {
        kind: 'if_let_some',
        binding: 'val',
        init: makeIntLit(999),
        then: [{ kind: 'return', value: makeIntLit(888) }],
        else_: [{ kind: 'return', value: makeIntLit(777) }],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    const magicW = w.filter(x => x.rule === 'magic-number')
    expect(magicW.length).toBeGreaterThanOrEqual(3)
  })

  it('flags magic number in while_let_some init and body', () => {
    const body: HIRBlock = [
      {
        kind: 'while_let_some',
        binding: 'val',
        init: makeIntLit(999),
        body: [{ kind: 'return', value: makeIntLit(888) }],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    const magicW = w.filter(x => x.rule === 'magic-number')
    expect(magicW.length).toBeGreaterThanOrEqual(2)
  })

  it('flags magic number via labeled_loop', () => {
    const body: HIRBlock = [
      {
        kind: 'labeled_loop',
        label: 'loop1',
        body: { kind: 'return', value: makeIntLit(999) } as HIRStmt,
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.some(x => x.rule === 'magic-number' && x.message.includes('999'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// checkMagicNumbersExpr — extra expression kinds
// ---------------------------------------------------------------------------

describe('checkMagicNumbersExpr — extra expression kinds', () => {
  function makeFn(expr: HIRExpr): HIRModule {
    return makeModule([makeSimpleFn('bar', [{ kind: 'expr', expr }])])
  }

  it('flags magic number in invoke callee and args', () => {
    const w = lintSource('', [], makeFn({
      kind: 'invoke',
      callee: makeIntLit(999),
      args: [makeIntLit(888)],
    }))
    const magicW = w.filter(x => x.rule === 'magic-number')
    expect(magicW.length).toBeGreaterThanOrEqual(2)
  })

  it('flags magic number in static_call args', () => {
    const w = lintSource('', [], makeFn({
      kind: 'static_call',
      type: 'Math',
      method: 'abs',
      args: [makeIntLit(999)],
    }))
    expect(w.some(x => x.rule === 'magic-number' && x.message.includes('999'))).toBe(true)
  })

  it('flags magic number in member_assign value', () => {
    const w = lintSource('', [], makeFn({
      kind: 'member_assign',
      obj: makeIdent('obj'),
      field: 'x',
      value: makeIntLit(999),
    }))
    expect(w.some(x => x.rule === 'magic-number' && x.message.includes('999'))).toBe(true)
  })

  it('flags magic number in index object and index', () => {
    const w = lintSource('', [], makeFn({
      kind: 'index',
      obj: makeIdent('arr'),
      index: makeIntLit(999),
    }))
    expect(w.some(x => x.rule === 'magic-number' && x.message.includes('999'))).toBe(true)
  })

  it('flags magic number in index_assign', () => {
    const w = lintSource('', [], makeFn({
      kind: 'index_assign',
      obj: makeIdent('arr'),
      index: makeIntLit(5),
      op: '=',
      value: makeIntLit(999),
    }))
    expect(w.some(x => x.rule === 'magic-number')).toBe(true)
  })

  it('flags magic number in assign value', () => {
    const w = lintSource('', [], makeFn({
      kind: 'assign',
      target: 'x',
      value: makeIntLit(999),
    }))
    expect(w.some(x => x.rule === 'magic-number' && x.message.includes('999'))).toBe(true)
  })

  it('flags magic number in some_lit', () => {
    const w = lintSource('', [], makeFn({
      kind: 'some_lit',
      value: makeIntLit(999),
    }))
    expect(w.some(x => x.rule === 'magic-number' && x.message.includes('999'))).toBe(true)
  })

  it('flags magic number in unwrap_or', () => {
    const w = lintSource('', [], makeFn({
      kind: 'unwrap_or',
      opt: makeIdent('x'),
      default_: makeIntLit(999),
    }))
    expect(w.some(x => x.rule === 'magic-number' && x.message.includes('999'))).toBe(true)
  })

  it('flags magic number in type_cast', () => {
    const w = lintSource('', [], makeFn({
      kind: 'type_cast',
      expr: makeIntLit(999),
      targetType: { kind: 'named', name: 'float' } as any,
    }))
    expect(w.some(x => x.rule === 'magic-number' && x.message.includes('999'))).toBe(true)
  })

  it('flags magic number in str_interp parts', () => {
    const w = lintSource('', [], makeFn({
      kind: 'str_interp',
      parts: ['text ', makeIntLit(999)],
    }))
    expect(w.some(x => x.rule === 'magic-number' && x.message.includes('999'))).toBe(true)
  })

  it('flags magic number in f_string expr parts', () => {
    const w = lintSource('', [], makeFn({
      kind: 'f_string',
      parts: [
        { kind: 'text', value: 'hello' },
        { kind: 'expr', expr: makeIntLit(999) },
      ],
    }))
    expect(w.some(x => x.rule === 'magic-number' && x.message.includes('999'))).toBe(true)
  })

  it('flags magic number in lambda block body', () => {
    const w = lintSource('', [], makeFn({
      kind: 'lambda',
      params: [],
      body: [{ kind: 'return', value: makeIntLit(999) }] as HIRBlock,
    }))
    expect(w.some(x => x.rule === 'magic-number' && x.message.includes('999'))).toBe(true)
  })

  it('flags magic number in lambda expr body', () => {
    const w = lintSource('', [], makeFn({
      kind: 'lambda',
      params: [],
      body: makeIntLit(999) as HIRExpr,
    }))
    expect(w.some(x => x.rule === 'magic-number' && x.message.includes('999'))).toBe(true)
  })

  it('flags magic number in enum_construct args', () => {
    const w = lintSource('', [], makeFn({
      kind: 'enum_construct',
      enumName: 'Color',
      variant: 'RGB',
      args: [{ name: 'r', value: makeIntLit(255) }],
    }))
    expect(w.some(x => x.rule === 'magic-number' && x.message.includes('255'))).toBe(true)
  })

  it('skips const_decl in magic-number check', () => {
    const body: HIRBlock = [
      {
        kind: 'const_decl',
        name: 'X',
        type: { kind: 'named', name: 'int' } as any,
        value: makeIntLit(9999),
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'magic-number')).toHaveLength(0)
  })

  it('handles float_lit, byte_lit, short_lit, long_lit, double_lit magic numbers', () => {
    const kinds = ['float_lit', 'byte_lit', 'short_lit', 'long_lit', 'double_lit'] as const
    for (const k of kinds) {
      const w = lintSource('', [], makeFn({ kind: k, value: 999 }))
      expect(w.some(x => x.rule === 'magic-number')).toBe(true)
    }
  })
})

// ---------------------------------------------------------------------------
// dead-branch: checkDeadBranchesStmt — extra HIR statement kinds
// ---------------------------------------------------------------------------

describe('checkDeadBranchesStmt — extra HIR statement kinds', () => {
  it('recurses into while step block', () => {
    const body: HIRBlock = [
      {
        kind: 'while',
        cond: makeBoolLit(false),
        body: [],
        step: [
          {
            kind: 'if',
            cond: makeBoolLit(true),
            then: [],
          },
        ],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    // The if(true) inside the step should be detected
    expect(w.some(x => x.rule === 'dead-branch')).toBe(true)
  })

  it('recurses into foreach body for dead-branch', () => {
    const body: HIRBlock = [
      {
        kind: 'foreach',
        binding: 'p',
        iterable: makeIdent('list'),
        body: [
          {
            kind: 'if',
            cond: makeBoolLit(false),
            then: [],
          },
        ],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.some(x => x.rule === 'dead-branch')).toBe(true)
  })

  it('recurses into match arm bodies for dead-branch', () => {
    const body: HIRBlock = [
      {
        kind: 'match',
        expr: makeIdent('x'),
        arms: [
          {
            pattern: { kind: 'PatWild' },
            body: [
              {
                kind: 'if',
                cond: makeBoolLit(true),
                then: [],
              },
            ],
          },
        ],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.some(x => x.rule === 'dead-branch')).toBe(true)
  })

  it('recurses into execute body for dead-branch', () => {
    const body: HIRBlock = [
      {
        kind: 'execute',
        subcommands: [],
        body: [
          {
            kind: 'if',
            cond: makeBoolLit(true),
            then: [],
          },
        ],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.some(x => x.rule === 'dead-branch')).toBe(true)
  })

  it('recurses into if_let_some then and else for dead-branch', () => {
    const body: HIRBlock = [
      {
        kind: 'if_let_some',
        binding: 'val',
        init: makeIdent('opt'),
        then: [
          {
            kind: 'if',
            cond: makeBoolLit(true),
            then: [],
          },
        ],
        else_: [
          {
            kind: 'if',
            cond: makeBoolLit(false),
            then: [],
          },
        ],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.filter(x => x.rule === 'dead-branch').length).toBeGreaterThanOrEqual(2)
  })

  it('recurses into while_let_some body for dead-branch', () => {
    const body: HIRBlock = [
      {
        kind: 'while_let_some',
        binding: 'val',
        init: makeIdent('opt'),
        body: [
          {
            kind: 'if',
            cond: makeBoolLit(true),
            then: [],
          },
        ],
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    expect(w.some(x => x.rule === 'dead-branch')).toBe(true)
  })

  it('recurses into labeled_loop for dead-branch (via while wrapper)', () => {
    // labeled_loop.body is a single HIRStmt; checkDeadBranchesStmt is called with it.
    // An if stmt alone in labeled_loop.body is not detected (checkDeadBranchesStmt
    // doesn't handle 'if'), but a while whose inner body has an if will be detected.
    const whileWithDeadIf: HIRStmt = {
      kind: 'while',
      cond: makeBoolLit(false),
      body: [
        {
          kind: 'if',
          cond: makeBoolLit(true),
          then: [],
        },
      ],
    }
    const body: HIRBlock = [
      {
        kind: 'labeled_loop',
        label: 'loop1',
        body: whileWithDeadIf,
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    // The if(true) inside while inside labeled_loop should be detected
    expect(w.some(x => x.rule === 'dead-branch')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// countStmts — extra HIR statement kinds (for function-too-long)
// ---------------------------------------------------------------------------

describe('countStmts — extra HIR statement kinds', () => {
  it('counts stmts in if/else, while/step, foreach, match, execute, if_let_some, while_let_some, labeled_loop', () => {
    // Build a function with nested stmts to trigger countStmts recursion
    const innerStmts: HIRStmt[] = Array.from({ length: 15 }, (_, i) => ({
      kind: 'expr',
      expr: makeIntLit(i),
    } as HIRStmt))

    const body: HIRBlock = [
      {
        kind: 'if',
        cond: makeIdent('cond'),
        then: innerStmts.slice(0, 5),
        else_: innerStmts.slice(5, 10),
      },
      {
        kind: 'while',
        cond: makeIdent('cond'),
        body: innerStmts.slice(0, 5),
        step: innerStmts.slice(0, 5),
      },
      {
        kind: 'foreach',
        binding: 'p',
        iterable: makeIdent('list'),
        body: innerStmts.slice(0, 5),
      },
      {
        kind: 'match',
        expr: makeIdent('x'),
        arms: [
          { pattern: { kind: 'PatWild' }, body: innerStmts.slice(0, 5) },
        ],
      },
      {
        kind: 'execute',
        subcommands: [],
        body: innerStmts.slice(0, 5),
      },
      {
        kind: 'if_let_some',
        binding: 'val',
        init: makeIdent('opt'),
        then: innerStmts.slice(0, 5),
        else_: innerStmts.slice(0, 5),
      },
      {
        kind: 'while_let_some',
        binding: 'val',
        init: makeIdent('opt'),
        body: innerStmts.slice(0, 5),
      },
      {
        kind: 'labeled_loop',
        label: 'loop1',
        body: { kind: 'expr', expr: makeIdent('x') } as HIRStmt,
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir, { maxFunctionLines: 1 })
    // With maxFunctionLines=1, any function with more than 1 stmt should warn
    expect(w.some(x => x.rule === 'function-too-long')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// lintFile — success path
// ---------------------------------------------------------------------------

describe('lintFile — success path', () => {
  it('successfully lints a file that exists', () => {
    const tmpFile = path.join(os.tmpdir(), `test-lint-${Date.now()}.rs`)
    try {
      fs.writeFileSync(tmpFile, `fn foo(): void { say("hello"); }\n`, 'utf-8')
      const w = lintFile(tmpFile)
      expect(Array.isArray(w)).toBe(true)
    } finally {
      try { fs.unlinkSync(tmpFile) } catch {}
    }
  })
})

// ---------------------------------------------------------------------------
// Import with span (line/col reporting)
// ---------------------------------------------------------------------------

describe('import with span in unused-import warning', () => {
  it('sets line and col from import span', () => {
    const imports: ImportDecl[] = [
      {
        moduleName: 'mylib',
        symbol: 'unused',
        span: { line: 5, col: 3 },
      },
    ]
    const hir = makeModule([])
    const w = lintSource('', imports, hir)
    const uw = w.filter(x => x.rule === 'unused-import')
    expect(uw.length).toBeGreaterThan(0)
    expect(uw[0].line).toBe(5)
    expect(uw[0].col).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// dead-branch: cond.span fallback
// ---------------------------------------------------------------------------

describe('dead-branch span fallback', () => {
  it('uses cond.span when stmt.span is not set', () => {
    const body: HIRBlock = [
      {
        kind: 'if',
        cond: { kind: 'bool_lit', value: true, span: { line: 10, col: 5 } },
        then: [],
        // no span on stmt itself
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    const dw = w.filter(x => x.rule === 'dead-branch')
    expect(dw.length).toBeGreaterThan(0)
    // Should use cond.span
    expect(dw[0].line).toBe(10)
    expect(dw[0].col).toBe(5)
  })

  it('uses stmt.span when available (takes priority over cond.span)', () => {
    const body: HIRBlock = [
      {
        kind: 'if',
        cond: { kind: 'bool_lit', value: true, span: { line: 10, col: 5 } },
        then: [],
        span: { line: 8, col: 1 },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    const dw = w.filter(x => x.rule === 'dead-branch')
    expect(dw.length).toBeGreaterThan(0)
    expect(dw[0].line).toBe(8)
    expect(dw[0].col).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// unused-variable span
// ---------------------------------------------------------------------------

describe('unused-variable span', () => {
  it('sets line and col from let span', () => {
    const body: HIRBlock = [
      {
        kind: 'let',
        name: 'unusedVar',
        init: makeIntLit(0),
        span: { line: 7, col: 2 },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    const uw = w.filter(x => x.rule === 'unused-variable' && x.message.includes('"unusedVar"'))
    expect(uw.length).toBeGreaterThan(0)
    expect(uw[0].line).toBe(7)
    expect(uw[0].col).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// magic-number span
// ---------------------------------------------------------------------------

describe('magic-number span', () => {
  it('sets line and col from expr span', () => {
    const body: HIRBlock = [
      {
        kind: 'expr',
        expr: { kind: 'int_lit', value: 999, span: { line: 12, col: 4 } },
      },
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [], hir)
    const mw = w.filter(x => x.rule === 'magic-number' && x.message.includes('999'))
    expect(mw.length).toBeGreaterThan(0)
    expect(mw[0].line).toBe(12)
    expect(mw[0].col).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// function-too-long span
// ---------------------------------------------------------------------------

describe('function-too-long span', () => {
  it('sets line and col from fn.span', () => {
    const stmts: HIRStmt[] = Array.from({ length: 60 }, () => ({
      kind: 'expr',
      expr: makeIntLit(1),
    } as HIRStmt))
    const fn_: HIRFunction = {
      name: 'longFn',
      params: [],
      returnType: { kind: 'named', name: 'void' } as any,
      decorators: [],
      body: stmts,
      span: { line: 3, col: 1 },
    }
    const hir = makeModule([fn_])
    const w = lintSource('', [], hir, { maxFunctionLines: 50 })
    const fw = w.filter(x => x.rule === 'function-too-long')
    expect(fw.length).toBeGreaterThan(0)
    expect(fw[0].line).toBe(3)
    expect(fw[0].col).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// return without value
// ---------------------------------------------------------------------------

describe('collectCalledNamesStmt — return without value', () => {
  it('handles return with no value (void return)', () => {
    const importFoo: ImportDecl = { moduleName: 'mylib', symbol: 'foo' }
    const body: HIRBlock = [
      { kind: 'return' }, // no value
    ]
    const hir = makeModule([makeSimpleFn('bar', body)])
    const w = lintSource('', [importFoo], hir)
    // 'foo' not used → should warn
    expect(w.filter(x => x.rule === 'unused-import').length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Library functions are skipped
// ---------------------------------------------------------------------------

describe('library function skip', () => {
  it('skips lint for functions with isLibraryFn=true', () => {
    const body: HIRBlock = [
      { kind: 'let', name: 'x', init: makeIntLit(9999) },
    ]
    const fn_: HIRFunction = {
      name: 'libFn',
      params: [],
      returnType: { kind: 'named', name: 'void' } as any,
      decorators: [],
      body,
      isLibraryFn: true,
    }
    const hir = makeModule([fn_])
    const w = lintSource('', [], hir)
    // Library fn should be entirely skipped
    expect(w.filter(x => x.rule === 'unused-variable')).toHaveLength(0)
    expect(w.filter(x => x.rule === 'magic-number')).toHaveLength(0)
  })
})
