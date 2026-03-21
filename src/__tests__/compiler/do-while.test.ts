import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { verifyMIR } from '../../mir/verify'
import type { MIRFunction } from '../../mir/types'
import { compile } from '../../emit/compile'

const DO_WHILE_SOURCE = `
  fn test_do_while() {
    let i: int = 0
    do {
      i = i + 1
    } while i < 5
  }
`

const REPEAT_SOURCE = `
  fn test_repeat() {
    let count: int = 0
    repeat 5 {
      count = count + 1
    }
  }
`

function parse(source: string) {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens, source).parse('test')
}

function lowerFn(source: string, fnName: string): MIRFunction {
  const ast = parse(source)
  const hir = lowerToHIR(ast)
  const mir = lowerToMIR(hir)
  expect(verifyMIR(mir)).toEqual([])
  return mir.functions.find(fn => fn.name === fnName)!
}

// ---------------------------------------------------------------------------
// do-while tests
// ---------------------------------------------------------------------------

describe('do-while statement', () => {
  test('parser recognizes do_while AST node', () => {
    const ast = parse(DO_WHILE_SOURCE)
    const fn = ast.declarations[0]
    // let i + do_while
    const doWhile = fn.body[1]
    expect(doWhile.kind).toBe('do_while')
    if (doWhile.kind !== 'do_while') throw new Error('expected do_while')
    expect(doWhile.cond).toBeDefined()
    expect(doWhile.body.length).toBeGreaterThan(0)
  })

  test('HIR lowering desugars do_while to body + while', () => {
    const ast = parse(DO_WHILE_SOURCE)
    const hir = lowerToHIR(ast)
    const fn = hir.functions[0]
    // HIR should have: let i, <body stmts>, while
    const stmts = fn.body
    const whileStmt = stmts[stmts.length - 1]
    expect(whileStmt.kind).toBe('while')
  })

  test('MIR has a loop_header block (condition check)', () => {
    const fn = lowerFn(DO_WHILE_SOURCE, 'test_do_while')
    const headerBlock = fn.blocks.find(b => b.id.startsWith('loop_header'))
    expect(headerBlock).toBeDefined()
  })

  test('end-to-end compile accepts do-while program', () => {
    expect(() => compile(DO_WHILE_SOURCE, { namespace: 'test' })).not.toThrow()
  })

  test('do-while body runs at least once (parse + HIR sanity)', () => {
    // The body statements appear before the while node in HIR
    const ast = parse(DO_WHILE_SOURCE)
    const hir = lowerToHIR(ast)
    const fn = hir.functions[0]
    // stmts: let i=0, body[0] (i = i+1), while(i<5) { body[0] }
    // There should be at least 3 statements (let, unconditional body, while)
    expect(fn.body.length).toBeGreaterThanOrEqual(3)
  })
})

// ---------------------------------------------------------------------------
// repeat N tests
// ---------------------------------------------------------------------------

describe('repeat N statement', () => {
  test('parser recognizes repeat AST node with correct count', () => {
    const ast = parse(REPEAT_SOURCE)
    const fn = ast.declarations[0]
    // let count + repeat
    const repeatStmt = fn.body[1]
    expect(repeatStmt.kind).toBe('repeat')
    if (repeatStmt.kind !== 'repeat') throw new Error('expected repeat')
    expect(repeatStmt.count).toBe(5)
    expect(repeatStmt.body.length).toBeGreaterThan(0)
  })

  test('HIR lowering desugars repeat to let counter + while', () => {
    const ast = parse(REPEAT_SOURCE)
    const hir = lowerToHIR(ast)
    const fn = hir.functions[0]
    // stmts: let count, let __repeat_i_N, while(...)
    const whileStmt = fn.body[fn.body.length - 1]
    expect(whileStmt.kind).toBe('while')
    if (whileStmt.kind !== 'while') throw new Error('expected while in HIR')
    // condition: __repeat_i_N < 5
    expect(whileStmt.cond.kind).toBe('binary')
    if (whileStmt.cond.kind === 'binary') {
      expect(whileStmt.cond.op).toBe('<')
      expect(whileStmt.cond.right).toMatchObject({ kind: 'int_lit', value: 5 })
    }
  })

  test('MIR has loop blocks for repeat', () => {
    const fn = lowerFn(REPEAT_SOURCE, 'test_repeat')
    const headerBlock = fn.blocks.find(b => b.id.startsWith('loop_header'))
    expect(headerBlock).toBeDefined()
    const exitBlock = fn.blocks.find(b => b.id.startsWith('loop_exit'))
    expect(exitBlock).toBeDefined()
  })

  test('end-to-end compile accepts repeat program', () => {
    expect(() => compile(REPEAT_SOURCE, { namespace: 'test' })).not.toThrow()
  })
})
