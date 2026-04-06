import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import type { Program } from '../../ast/types'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { verifyMIR } from '../../mir/verify'
import type { MIRFunction, MIRInstr, MIRModule } from '../../mir/types'
import { compile } from '../../emit/compile'
import { DiagnosticError } from '../../diagnostics'
import type { HIRModule, HIRFunction as HIRFn } from '../../hir/types'

const SOURCE = `
  fn test_continue() {
    let sum: int = 0
    let i: int = 0
    while (i < 10) {
      i = i + 1
      if (i % 2 == 0) { continue }
      sum = sum + i
    }
  }
`

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

function parse(source: string, namespace = 'test'): Program {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens).parse(namespace)
}

function compileMIR(source: string): MIRModule {
  const ast = parse(source)
  const hir = lowerToHIR(ast)
  return lowerToMIR(hir)
}

function getFn(mod: MIRModule, name?: string): MIRFunction {
  if (name) return mod.functions.find(f => f.name === name)!
  return mod.functions[0]
}

describe('continue statement', () => {
  test('parser builds continue AST node inside while body', () => {
    const program = parse(SOURCE)
    const whileStmt = program.declarations[0].body[2]

    expect(whileStmt.kind).toBe('while')
    if (whileStmt.kind !== 'while') {
      throw new Error('expected while statement')
    }

    const ifStmt = whileStmt.body[1]
    expect(ifStmt.kind).toBe('if')
    if (ifStmt.kind !== 'if') {
      throw new Error('expected if statement')
    }

    expect(ifStmt.then[0]).toMatchObject({ kind: 'continue' })
  })

  test('MIR lowers continue to a jump back to loop header', () => {
    const mod = compileMIR(SOURCE)
    expect(verifyMIR(mod)).toEqual([])

    const fn = getFn(mod, 'test_continue')
    const headerBlock = fn.blocks.find(b => b.id.startsWith('loop_header'))
    expect(headerBlock).toBeDefined()

    const continueBlock = fn.blocks.find(b =>
      b.term.kind === 'jump' &&
      (b.term as Extract<MIRInstr, { kind: 'jump' }>).target === headerBlock!.id &&
      !b.id.startsWith('loop_header') &&
      !b.id.startsWith('entry')
    )

    expect(continueBlock).toBeDefined()
  })

  test('full compiler pipeline accepts while + continue program', () => {
    const result = compile(SOURCE, { namespace: 'test' })

    expect(result.files.length).toBeGreaterThan(0)
    expect(result.files.some(f => f.path.endsWith('function/test_continue.mcfunction'))).toBe(true)
  })
})

describe('continue outside loop throws DiagnosticError', () => {
  test('bare continue at function top-level throws DiagnosticError', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'continue' }]))
    expect(() => lowerToMIR(hir)).toThrow(DiagnosticError)
  })

  test('thrown error has kind LoweringError and mentions continue', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'continue' }]))
    let caught: unknown
    try { lowerToMIR(hir) } catch (e) { caught = e }
    const err = caught as DiagnosticError
    expect(err.kind).toBe('LoweringError')
    expect(err.message).toMatch(/continue outside loop/)
  })

  test('error location falls back to line 1 col 1 when span is absent', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'continue' }]))
    let caught: unknown
    try { lowerToMIR(hir) } catch (e) { caught = e }
    const err = caught as DiagnosticError
    expect(err.location.line).toBe(1)
    expect(err.location.col).toBe(1)
  })

  test('error location uses stmt.span when present', () => {
    const span = { line: 6, col: 5 }
    const hir = makeModule(makeVoidFn('f', [{ kind: 'continue', span }]))
    let caught: unknown
    try { lowerToMIR(hir, 'src/foo.mcrs') } catch (e) { caught = e }
    const err = caught as DiagnosticError
    expect(err.location.line).toBe(6)
    expect(err.location.col).toBe(5)
    expect(err.location.file).toBe('src/foo.mcrs')
  })
})

describe('continue with unknown label throws DiagnosticError', () => {
  test('continue_label with non-existent label throws DiagnosticError', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'continue_label', label: 'missing' }]))
    expect(() => lowerToMIR(hir)).toThrow(DiagnosticError)
  })

  test('thrown error names the missing label', () => {
    const hir = makeModule(makeVoidFn('f', [{ kind: 'continue_label', label: 'outer' }]))
    let caught: unknown
    try { lowerToMIR(hir) } catch (e) { caught = e }
    const err = caught as DiagnosticError
    expect(err.kind).toBe('LoweringError')
    expect(err.message).toMatch(/outer/)
  })

  test('error location uses stmt.span when present', () => {
    const span = { line: 8, col: 2 }
    const hir = makeModule(makeVoidFn('f', [{ kind: 'continue_label', label: 'loop1', span }]))
    let caught: unknown
    try { lowerToMIR(hir, 'src/bar.mcrs') } catch (e) { caught = e }
    const err = caught as DiagnosticError
    expect(err.location.line).toBe(8)
    expect(err.location.col).toBe(2)
    expect(err.location.file).toBe('src/bar.mcrs')
  })
})
