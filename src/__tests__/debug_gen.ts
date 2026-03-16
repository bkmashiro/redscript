import { Lexer } from '../lexer'
import { Parser } from '../parser'

test('parser handles generic functions with typeParams', () => {
  const source = `
  fn max<T>(a: T, b: T): T {
    if (a > b) { return a; }
    return b;
  }
  fn use_max(): int {
    return max(3, 5);
  }
`
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  expect(ast.declarations).toHaveLength(2)
  const [maxFn, useMaxFn] = ast.declarations as any[]
  expect(maxFn.name).toBe('max')
  expect(maxFn.typeParams).toHaveLength(1)
  expect(useMaxFn.name).toBe('use_max')
})
