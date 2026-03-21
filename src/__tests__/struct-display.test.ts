import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { lowerToHIR } from '../hir/lower'
import { compile } from '../emit/compile'

function parse(source: string) {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens).parse('test')
}

describe('struct Display trait', () => {
  test('parses impl Display for struct', () => {
    const program = parse(`
      struct Vec2 { x: int, y: int }
      impl Display for Vec2 {
        fn to_string(self): string {
          return f"Vec2({self.x}, {self.y})"
        }
      }
    `)

    expect(program.implBlocks).toHaveLength(1)
    expect(program.implBlocks[0].traitName).toBe('Display')
    expect(program.implBlocks[0].typeName).toBe('Vec2')
    expect(program.implBlocks[0].methods.map(method => method.name)).toEqual(['to_string'])
  })

  test('preserves Display impl in HIR', () => {
    const hir = lowerToHIR(parse(`
      struct Vec2 { x: int, y: int }
      impl Display for Vec2 {
        fn to_string(self): string {
          return f"Vec2({self.x}, {self.y})"
        }
      }
    `))

    expect(hir.implBlocks).toHaveLength(1)
    expect(hir.implBlocks[0].traitName).toBe('Display')
    expect(hir.implBlocks[0].typeName).toBe('Vec2')
  })

  it.todo('expands struct to_string() into tellraw text without generating impl function')
})
