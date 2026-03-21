import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import type { Program } from '../../ast/types'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { verifyMIR } from '../../mir/verify'
import type { MIRFunction, MIRInstr, MIRModule } from '../../mir/types'
import { compile } from '../../emit/compile'

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
