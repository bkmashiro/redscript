import { Lexer } from '../../lexer'
import { Parser } from '../../parser'

function parse(source: string, file = '/project/src/cmd/pack/main.mcrs') {
  const parser = new Parser(new Lexer(source, file).tokenize(), source, file)
  const program = parser.parse('demo')
  if (parser.parseErrors.length > 0) throw parser.parseErrors[0]
  return program
}

describe('resource contribution declarations', () => {
  test('keeps reference-only declarations backward compatible', () => {
    expect(parse('resource item demo:wand; resource item demo:from;').resourceDeclarations).toEqual([
      expect.objectContaining({
        registry: 'item',
        id: 'demo:wand',
        namespace: 'demo',
        path: 'wand',
        sourcePath: undefined,
      }),
      expect.objectContaining({
        registry: 'item',
        id: 'demo:from',
        namespace: 'demo',
        path: 'from',
        sourcePath: undefined,
      }),
    ])
  })

  test('parses strict from-file JSON and nested resource paths with source provenance', () => {
    const declaration = parse(
      'resource item_tag demo:foods/snacks from "tags/foods.json";',
    ).resourceDeclarations![0]

    expect(declaration).toMatchObject({
      registry: 'item_tag',
      id: 'demo:foods/snacks',
      namespace: 'demo',
      path: 'foods/snacks',
      sourcePath: 'tags/foods.json',
      span: {
        file: '/project/src/cmd/pack/main.mcrs',
        line: 1,
        col: 1,
      },
    })
  })

  test.each([
    ['absolute path', 'resource recipe demo:x from "/tmp/x.json";', /canonical relative asset path/i],
    ['parent traversal', 'resource recipe demo:x from "../x.json";', /canonical relative asset path/i],
    ['backslash', 'resource recipe demo:x from "recipes\\x.json";', /canonical relative asset path/i],
    ['missing source', 'resource recipe demo:x from;', /Expected 'string_lit'/],
  ])('rejects an invalid %s', (_label, source, expected) => {
    expect(() => parse(source)).toThrow(expected)
  })
})
