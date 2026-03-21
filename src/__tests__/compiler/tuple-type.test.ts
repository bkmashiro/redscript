/**
 * Tests for tuple types and destructuring.
 *
 * RedScript supports:
 *   - Tuple type annotations:  (int, int)
 *   - Tuple literal expressions: (a, b)
 *   - Destructuring let-bindings: let (lo, hi) = expr
 *   - Functions that return tuples: fn foo(): (int, int) { return (a, b) }
 */

import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { verifyMIR } from '../../mir/verify'
import { compile } from '../../emit/compile'
import type { MIRFunction } from '../../mir/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parse(source: string) {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens, source).parse('test')
}

function lowerFn(source: string, fnName: string): MIRFunction {
  const ast = parse(source)
  const hir = lowerToHIR(ast)
  const mir = lowerToMIR(hir)
  expect(verifyMIR(mir)).toEqual([])
  const fn = mir.functions.find(f => f.name === fnName)
  expect(fn).toBeDefined()
  return fn!
}

// ---------------------------------------------------------------------------
// 1. Parser: tuple type annotation  (int, int)
// ---------------------------------------------------------------------------

const TUPLE_TYPE_SRC = `
fn min_max(arr: int[]): (int, int) {
  let min: int = arr[0]
  let max: int = arr[0]
  return (min, max)
}
`

describe('tuple type — parser', () => {
  test('parses function return type as tuple', () => {
    const ast = parse(TUPLE_TYPE_SRC)
    const fn = ast.declarations[0]
    expect(fn.returnType).toMatchObject({ kind: 'tuple', elements: [
      { kind: 'named', name: 'int' },
      { kind: 'named', name: 'int' },
    ] })
  })

  test('return statement contains a tuple_lit expression', () => {
    const ast = parse(TUPLE_TYPE_SRC)
    const fn = ast.declarations[0]
    const ret = fn.body[fn.body.length - 1]
    expect(ret.kind).toBe('return')
    if (ret.kind !== 'return') throw new Error()
    expect(ret.value).toMatchObject({ kind: 'tuple_lit', elements: [
      { kind: 'ident', name: 'min' },
      { kind: 'ident', name: 'max' },
    ] })
  })
})

// ---------------------------------------------------------------------------
// 2. Parser: let destructuring  let (a, b) = expr
// ---------------------------------------------------------------------------

const DESTRUCT_SRC = `
fn test() {
  let (lo, hi) = (1, 2)
}
`

describe('tuple destructuring — parser', () => {
  test('parses let_destruct with two bindings', () => {
    const ast = parse(DESTRUCT_SRC)
    const fn = ast.declarations[0]
    const stmt = fn.body[0]
    expect(stmt).toMatchObject({
      kind: 'let_destruct',
      names: ['lo', 'hi'],
    })
  })

  test('initializer is a tuple_lit', () => {
    const ast = parse(DESTRUCT_SRC)
    const fn = ast.declarations[0]
    const stmt = fn.body[0] as any
    expect(stmt.init).toMatchObject({ kind: 'tuple_lit', elements: [
      { kind: 'int_lit', value: 1 },
      { kind: 'int_lit', value: 2 },
    ] })
  })
})

// ---------------------------------------------------------------------------
// 3. Parser: three-element tuple
// ---------------------------------------------------------------------------

// Note: (1, 2, 3) with three int literals is ambiguous with BlockPos literal in the parser.
// Use variable names to force tuple interpretation.
const THREE_TUPLE_SRC = `
fn triple(): (int, int, int) {
  let x: int = 1
  let y: int = 2
  let z: int = 3
  return (x, y, z)
}

fn caller() {
  let (a, b, c) = triple()
}
`

describe('three-element tuple', () => {
  test('return type has three elements', () => {
    const ast = parse(THREE_TUPLE_SRC)
    const fn = ast.declarations[0]
    expect(fn.returnType).toMatchObject({
      kind: 'tuple',
      elements: [
        { kind: 'named', name: 'int' },
        { kind: 'named', name: 'int' },
        { kind: 'named', name: 'int' },
      ],
    })
  })

  test('destructuring binds three names', () => {
    const ast = parse(THREE_TUPLE_SRC)
    const caller = ast.declarations[1]
    const stmt = caller.body[0] as any
    expect(stmt.kind).toBe('let_destruct')
    expect(stmt.names).toEqual(['a', 'b', 'c'])
  })
})

// ---------------------------------------------------------------------------
// 4. MIR: tuple return emits __rf_0 / __rf_1 copies
// ---------------------------------------------------------------------------

describe('tuple return — MIR', () => {
  test('MIR for return (a, b) emits copies to __rf_0 and __rf_1', () => {
    const fn = lowerFn(TUPLE_TYPE_SRC, 'min_max')

    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    const rf0 = allInstrs.find(i => i.kind === 'copy' && (i as any).dst === '__rf_0')
    const rf1 = allInstrs.find(i => i.kind === 'copy' && (i as any).dst === '__rf_1')
    expect(rf0).toBeDefined()
    expect(rf1).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// 5. MIR: destructuring a tuple call — reads __rf_0, __rf_1
// ---------------------------------------------------------------------------

const CALLER_SRC = `
fn min_max(arr: int[]): (int, int) {
  let min: int = arr[0]
  let max: int = arr[0]
  return (min, max)
}

fn test() {
  let arr = [3, 1, 4, 1, 5, 9]
  let (lo, hi) = min_max(arr)
}
`

describe('tuple destructuring call — MIR', () => {
  test('MIR for let (lo, hi) = call() reads __rf_0 and __rf_1', () => {
    const fn = lowerFn(CALLER_SRC, 'test')

    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    // There must be copies from __rf_0 and __rf_1 temps
    const readRf = allInstrs.filter(i =>
      i.kind === 'copy' && (i as any).src?.name?.startsWith('__rf_')
    )
    expect(readRf.length).toBeGreaterThanOrEqual(2)
  })
})

// ---------------------------------------------------------------------------
// 6. MIR: direct tuple literal destructuring  let (a, b) = (10, 20)
// ---------------------------------------------------------------------------

const DIRECT_DESTRUCT_SRC = `
fn test() {
  let (a, b) = (10, 20)
}
`

describe('direct tuple literal destructuring — MIR', () => {
  test('MIR evaluates each element into separate temps', () => {
    const fn = lowerFn(DIRECT_DESTRUCT_SRC, 'test')
    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    // Constants 10 and 20 should appear in the instr stream
    const constVals = allInstrs
      .filter(i => i.kind === 'copy' && (i as any).src?.kind === 'const')
      .map(i => (i as any).src.value as number)
    expect(constVals).toContain(10)
    expect(constVals).toContain(20)
  })
})

// ---------------------------------------------------------------------------
// Helpers for compile output
// ---------------------------------------------------------------------------

function compileOutput(source: string): string {
  const result = compile(source, { namespace: 'test' })
  // compile() returns { files: Array<{path, content}>, warnings, success }
  const files = (result as any).files as Array<{ path: string; content: string }>
  return files.map((f: { path: string; content: string }) => f.content).join('\n')
}

// ---------------------------------------------------------------------------
// 7. End-to-end compile: does not throw
// ---------------------------------------------------------------------------

describe('tuple type — end-to-end compile', () => {
  test('min_max function compiles without error', () => {
    expect(() => compile(TUPLE_TYPE_SRC, { namespace: 'test' })).not.toThrow()
  })

  test('full min_max + caller compiles without error', () => {
    expect(() => compile(CALLER_SRC, { namespace: 'test' })).not.toThrow()
  })

  test('three-element tuple compiles without error', () => {
    expect(() => compile(THREE_TUPLE_SRC, { namespace: 'test' })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// 8. Compile output: tuple return generates scoreboard operations
// ---------------------------------------------------------------------------

describe('tuple return — compiled output', () => {
  test('compiled output contains scoreboard operations for both return slots', () => {
    const allOutput = compileOutput(TUPLE_TYPE_SRC)
    // Tuple return compiles to scoreboard operations for ret_0 and ret_1 slots
    expect(allOutput).toMatch(/\$ret_0/)
    expect(allOutput).toMatch(/\$ret_1/)
  })

  test('compiled caller output references both return slots', () => {
    const allOutput = compileOutput(CALLER_SRC)
    // Caller reads from ret_0 / ret_1 (scoreboard-based return convention)
    expect(allOutput).toMatch(/\$ret_0/)
    expect(allOutput).toMatch(/\$ret_1/)
  })
})
