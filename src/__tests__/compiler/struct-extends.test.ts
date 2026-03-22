import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { compile } from '../../emit/compile'
import { TypeChecker } from '../../typechecker'

function parse(source: string) {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens, source).parse('test')
}

function typeCheck(source: string) {
  const program = parse(source)
  return new TypeChecker(source).check(program)
}

describe('struct-extends: parser', () => {
  test('parses extends clause on struct declarations', () => {
    const program = parse(`
      struct Animal { name: string, hp: int }
      struct Dog extends Animal { breed: string }
    `)

    expect(program.structs).toHaveLength(2)
    expect(program.structs[1].name).toBe('Dog')
    expect(program.structs[1].extends).toBe('Animal')
    expect(program.structs[1].fields.map(field => field.name)).toEqual(['breed'])
  })
})

describe('struct-extends: HIR lowering', () => {
  test('expands inherited fields before child fields', () => {
    const hir = lowerToHIR(parse(`
      struct Animal { name: string, hp: int }
      struct Dog extends Animal { breed: string }
    `))

    expect(hir.structs[1].fields.map(field => field.name)).toEqual(['name', 'hp', 'breed'])
  })

  test('expands multi-level inheritance transitively', () => {
    const hir = lowerToHIR(parse(`
      struct Base { id: int }
      struct Animal extends Base { hp: int }
      struct Dog extends Animal { breed: string }
    `))

    expect(hir.structs[2].fields.map(field => field.name)).toEqual(['id', 'hp', 'breed'])
  })
})

describe('struct-extends: typechecker', () => {
  test('accepts inherited fields in struct literals', () => {
    const errors = typeCheck(`
      struct Animal { name: string, hp: int }
      struct Dog extends Animal { breed: string }
      fn make(): Dog {
        return Dog { name: "Rex", hp: 10, breed: "Corgi" }
      }
    `)

    expect(errors).toHaveLength(0)
  })

  test('accepts multi-level inherited field access', () => {
    const errors = typeCheck(`
      struct Base { id: int }
      struct Animal extends Base { hp: int }
      struct Dog extends Animal { breed: string }
      fn id_of(d: Dog): int {
        return d.id
      }
    `)

    expect(errors).toHaveLength(0)
  })

  test('reports overriding an inherited field', () => {
    const errors = typeCheck(`
      struct Animal { name: string, hp: int }
      struct Dog extends Animal { hp: int, breed: string }
    `)

    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain("Struct 'Dog' cannot override inherited field 'hp'")
  })

  test('reports unknown parent struct', () => {
    const errors = typeCheck(`
      struct Dog extends Animal { breed: string }
    `)

    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain("Struct 'Dog' extends unknown struct 'Animal'")
  })
})

describe('struct-extends: compile', () => {
  test('compiles inherited structs as flattened plain structs', () => {
    expect(() => compile(`
      struct Animal { name: string, hp: int }
      struct Dog extends Animal { breed: string }
      @keep fn main(): void {
        let dog: Dog = Dog { name: "Rex", hp: 10, breed: "Corgi" }
        let hp: int = dog.hp
      }
    `, { namespace: 'test' })).not.toThrow()
  })
})
