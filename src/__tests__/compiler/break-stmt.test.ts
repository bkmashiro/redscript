import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { verifyMIR } from '../../mir/verify'
import type { MIRFunction, MIRInstr } from '../../mir/types'
import { compile } from '../../emit/compile'

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
