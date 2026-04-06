import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { verifyMIR } from '../../mir/verify'
import type { MIRFunction, MIRInstr } from '../../mir/types'
import { compile } from '../../emit/compile'
import { DiagnosticError } from '../../diagnostics'
import type { HIRModule, HIRFunction as HIRFn } from '../../hir/types'

const SOURCE = `
  fn test_break() {
    let i: int = 0
    while i < 10 {
      if i == 5 { break }
      i = i + 1
    }
    // i should be 5
  }
`

function parse(source: string) {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens, source).parse('test')
}

function lowerFn(source: string): MIRFunction {
  const ast = parse(source)
  const hir = lowerToHIR(ast)
  const mir = lowerToMIR(hir)
  expect(verifyMIR(mir)).toEqual([])
  return mir.functions.find(fn => fn.name === 'test_break')!
}

function makeModule(fn: HIRFn): HIRModule {
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

function makeVoidFn(name: string, body: HIRFn['body'], span?: { line: number; col: number }): HIRFn {
  return {
    name,
    params: [],
    returnType: { kind: 'named', name: 'void' },
    decorators: [],
    body,
    span,
  }
}

describe('break statement', () => {
  test('parser recognizes break inside while', () => {
    const ast = parse(SOURCE)
    const whileStmt = ast.declarations[0].body[1]
    expect(whileStmt.kind).toBe('while')
    if (whileStmt.kind !== 'while') throw new Error('expected while statement')

    const ifStmt = whileStmt.body[0]
    expect(ifStmt.kind).toBe('if')
    if (ifStmt.kind !== 'if') throw new Error('expected if statement')

    expect(ifStmt.then[0]).toMatchObject({ kind: 'break' })
  })

  test('MIR lowering turns break into jump to loop exit block', () => {
    const fn = lowerFn(SOURCE)
    const exitBlock = fn.blocks.find(block => block.id.startsWith('loop_exit'))
    expect(exitBlock).toBeDefined()

    const breakJump = fn.blocks.find(block =>
      block.term.kind === 'jump' &&
      (block.term as Extract<MIRInstr, { kind: 'jump' }>).target === exitBlock!.id &&
      !block.id.startsWith('loop_header') &&
      !block.id.startsWith('loop_exit') &&
      !block.id.startsWith('entry')
    )

    expect(breakJump).toBeDefined()
  })

  test('end-to-end compile accepts while break program', () => {
    expect(() => compile(SOURCE, { namespace: 'test' })).not.toThrow()
  })
})

describe('break outside loop throws DiagnosticError', () => {
  test('bare break at function top-level throws DiagnosticError', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'break' }]))
    expect(() => lowerToMIR(hir)).toThrow(DiagnosticError)
  })

  test('thrown error has kind LoweringError and mentions break', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'break' }]))
    let caught: unknown
    try { lowerToMIR(hir) } catch (e) { caught = e }
    const err = caught as DiagnosticError
    expect(err.kind).toBe('LoweringError')
    expect(err.message).toMatch(/break outside loop/)
  })

  test('error location falls back to line 1 col 1 when span is absent', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'break' }]))
    let caught: unknown
    try { lowerToMIR(hir) } catch (e) { caught = e }
    const err = caught as DiagnosticError
    expect(err.location.line).toBe(1)
    expect(err.location.col).toBe(1)
  })

  test('error location uses stmt.span when present', () => {
    const span = { line: 4, col: 7 }
    const hir = makeModule(makeVoidFn('f', [{ kind: 'break', span }]))
    let caught: unknown
    try { lowerToMIR(hir, 'src/foo.mcrs') } catch (e) { caught = e }
    const err = caught as DiagnosticError
    expect(err.location.line).toBe(4)
    expect(err.location.col).toBe(7)
    expect(err.location.file).toBe('src/foo.mcrs')
  })
})

describe('break with unknown label throws DiagnosticError', () => {
  test('break_label with non-existent label throws DiagnosticError', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'break_label', label: 'missing' }]))
    expect(() => lowerToMIR(hir)).toThrow(DiagnosticError)
  })

  test('thrown error names the missing label', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'break_label', label: 'outer' }]))
    let caught: unknown
    try { lowerToMIR(hir) } catch (e) { caught = e }
    const err = caught as DiagnosticError
    expect(err.kind).toBe('LoweringError')
    expect(err.message).toMatch(/outer/)
  })

  test('error location uses stmt.span when present', () => {
    const span = { line: 10, col: 3 }
    const hir = makeModule(makeVoidFn('f', [{ kind: 'break_label', label: 'loop1', span }]))
    let caught: unknown
    try { lowerToMIR(hir, 'src/bar.mcrs') } catch (e) { caught = e }
    const err = caught as DiagnosticError
    expect(err.location.line).toBe(10)
    expect(err.location.col).toBe(3)
    expect(err.location.file).toBe('src/bar.mcrs')
  })
})
