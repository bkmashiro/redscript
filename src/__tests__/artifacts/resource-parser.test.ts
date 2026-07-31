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

  test('parses a typed tag builder with explicit policy and ordered entries', () => {
    const declaration = parse(`
resource item_tag demo:foods {
  policy replace;
  value minecraft:apple;
  optional value minecraft:golden_apple;
  tag demo:base_foods;
  optional tag demo:seasonal_foods;
}
`).resourceDeclarations![0]

    expect(declaration).toMatchObject({
      registry: 'item_tag',
      id: 'demo:foods',
      sourcePath: undefined,
      builder: {
        kind: 'tag',
        policy: 'replace',
        values: [
          { kind: 'value', id: 'minecraft:apple', required: true },
          { kind: 'value', id: 'minecraft:golden_apple', required: false },
          { kind: 'tag', id: 'demo:base_foods', required: true },
          { kind: 'tag', id: 'demo:seasonal_foods', required: false },
        ],
      },
    })
  })

  test('defaults typed tags to merge policy and permits empty tags', () => {
    expect(parse('resource block_tag demo:empty {}').resourceDeclarations![0]).toMatchObject({
      builder: { kind: 'tag', policy: 'merge', values: [] },
    })
  })

  test.each([
    ['absolute path', 'resource recipe demo:x from "/tmp/x.json";', /canonical relative asset path/i],
    ['parent traversal', 'resource recipe demo:x from "../x.json";', /canonical relative asset path/i],
    ['backslash', 'resource recipe demo:x from "recipes\\x.json";', /canonical relative asset path/i],
    ['missing source', 'resource recipe demo:x from;', /Expected 'string_lit'/],
    ['non-tag builder', 'resource recipe demo:x { value minecraft:stone; }', /typed tag builder.*tag resource kind/i],
    ['mixed contribution forms', 'resource item_tag demo:x from "tags/x.json" {}', /cannot combine.*from-file.*typed builder/i],
    ['duplicate policy', 'resource item_tag demo:x { policy merge; policy replace; }', /policy.*more than once/i],
    ['unknown entry', 'resource item_tag demo:x { ingredient minecraft:stone; }', /expected.*policy.*value.*tag/i],
    ['invalid nested id', 'resource item_tag demo:x { tag Demo:UPPER; }', /invalid tag resource id/i],
  ])('rejects an invalid %s', (_label, source, expected) => {
    expect(() => parse(source)).toThrow(expected)
  })
})
