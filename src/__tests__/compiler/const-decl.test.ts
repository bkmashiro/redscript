import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { verifyMIR } from '../../mir/verify'
import { compile } from '../../emit/compile'

function parse(source: string) {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens, source).parse('test')
}

// ---------------------------------------------------------------------------
// Top-level const declarations
// ---------------------------------------------------------------------------

const TOP_LEVEL_CONST_SOURCE = `
  const MAX_HEALTH: int = 20
  const PI_APPROX: int = 31416

  fn test() {
    let h = MAX_HEALTH
    let pi = PI_APPROX
  }
`

describe('top-level const declarations', () => {
  test('parser collects consts into program.consts', () => {
    const ast = parse(TOP_LEVEL_CONST_SOURCE)
    expect(ast.consts).toHaveLength(2)
    expect(ast.consts[0].name).toBe('MAX_HEALTH')
    expect(ast.consts[0].value).toMatchObject({ kind: 'int_lit', value: 20 })
    expect(ast.consts[1].name).toBe('PI_APPROX')
    expect(ast.consts[1].value).toMatchObject({ kind: 'int_lit', value: 31416 })
  })

  test('HIR preserves consts array', () => {
    const ast = parse(TOP_LEVEL_CONST_SOURCE)
    const hir = lowerToHIR(ast)
    expect(hir.consts).toHaveLength(2)
    expect(hir.consts[0].name).toBe('MAX_HEALTH')
  })

  test('MIR inlines constants at use sites — copy src is a const operand', () => {
    const ast = parse(TOP_LEVEL_CONST_SOURCE)
    const hir = lowerToHIR(ast)
    const mir = lowerToMIR(hir)
    expect(verifyMIR(mir)).toEqual([])

    const fn = mir.functions.find(f => f.name === 'test')!
    expect(fn).toBeDefined()

    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    // When MAX_HEALTH / PI_APPROX are referenced, a copy instr is emitted with a const operand src
    const copyConstSrcs = allInstrs
      .filter(i => i.kind === 'copy' && (i as any).src.kind === 'const')
      .map(i => (i as any).src.value as number)
    expect(copyConstSrcs).toContain(20)
    expect(copyConstSrcs).toContain(31416)
  })

  test('end-to-end compile accepts const declarations', () => {
    expect(() => compile(TOP_LEVEL_CONST_SOURCE, { namespace: 'test' })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Local (function-body) const declarations
// ---------------------------------------------------------------------------

const LOCAL_CONST_SOURCE = `
  fn compute() {
    const FACTOR: int = 100
    let result = FACTOR
  }
`

describe('local const declarations (inside function)', () => {
  test('parser produces const_decl stmt in function body', () => {
    const ast = parse(LOCAL_CONST_SOURCE)
    const fn = ast.declarations[0]
    expect(fn.body[0]).toMatchObject({ kind: 'const_decl', name: 'FACTOR' })
  })

  test('HIR preserves const_decl stmt', () => {
    const ast = parse(LOCAL_CONST_SOURCE)
    const hir = lowerToHIR(ast)
    const fn = hir.functions[0]
    expect(fn.body[0]).toMatchObject({ kind: 'const_decl', name: 'FACTOR' })
  })

  test('MIR inlines local constant at use sites', () => {
    const ast = parse(LOCAL_CONST_SOURCE)
    const hir = lowerToHIR(ast)
    const mir = lowerToMIR(hir)
    expect(verifyMIR(mir)).toEqual([])

    const fn = mir.functions.find(f => f.name === 'compute')!
    expect(fn).toBeDefined()

    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    // FACTOR=100 is inlined at the use site as a const operand in a copy instruction
    const copyConstSrcs = allInstrs
      .filter(i => i.kind === 'copy' && (i as any).src.kind === 'const')
      .map(i => (i as any).src.value as number)
    expect(copyConstSrcs).toContain(100)
  })

  test('end-to-end compile accepts local const', () => {
    expect(() => compile(LOCAL_CONST_SOURCE, { namespace: 'test' })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Bool const
// ---------------------------------------------------------------------------

const BOOL_CONST_SOURCE = `
  const FLAG: bool = true

  fn check() {
    let f = FLAG
  }
`

describe('bool const declarations', () => {
  test('bool const is inlined as 1', () => {
    const ast = parse(BOOL_CONST_SOURCE)
    const hir = lowerToHIR(ast)
    const mir = lowerToMIR(hir)
    expect(verifyMIR(mir)).toEqual([])

    const fn = mir.functions.find(f => f.name === 'check')!
    expect(fn).toBeDefined()
    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    const copyConstSrcs = allInstrs
      .filter(i => i.kind === 'copy' && (i as any).src.kind === 'const')
      .map(i => (i as any).src.value as number)
    expect(copyConstSrcs).toContain(1)
  })
})
