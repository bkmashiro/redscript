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

  test('expands struct to_string() into tellraw text without generating impl function', () => {
    const src = `
      struct Vec2 { x: int, y: int }
      impl Display for Vec2 {
        fn to_string(self): string {
          return f"Vec2({self.x}, {self.y})"
        }
      }
      @keep fn demo(): void {
        let v: Vec2 = Vec2 { x: 3, y: 4 }
        announce(f"Position: {v.to_string()}")
      }
    `
    const result = compile(src, { namespace: 'test' })
    const allContent = result.files.map(f => f.content).join('\n')
    const allPaths = result.files.map(f => f.path).join('\n')

    // Should expand to_string() inline — no generated Vec2::to_string impl function
    expect(allPaths).not.toMatch(/Vec2.*to_string|to_string.*Vec2/)

    // The tellraw output should contain the f-string structure for Vec2 inline:
    // "Vec2(" text + x score + ", " text + y score + ")" text
    expect(allContent).toMatch(/tellraw @a/)
    expect(allContent).toMatch(/Vec2\(/)
    expect(allContent).toMatch(/score/)
  })
})
