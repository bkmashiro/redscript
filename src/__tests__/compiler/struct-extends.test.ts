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

  test('returns a local struct variable through __rf field slots', () => {
    expect(() => compile(`
      struct FighterState { health: int, eliminations: int, alive: int }

      fn snapshot_fighter() -> FighterState {
        let health: int = 20
        let eliminations: int = 2
        let alive: int = 1
        let state: FighterState = { health: health, eliminations: eliminations, alive: alive }
        return state
      }

      fn read_health(): int {
        let state = snapshot_fighter()
        return state.health
      }
    `, { namespace: 'test' })).not.toThrow()
  })

  test('tracks unannotated locals initialized from struct-returning functions', () => {
    expect(() => compile(`
      struct Vec2 { x: int, y: int }

      fn make_vec() -> Vec2 {
        return { x: 3, y: 4 }
      }

      fn sum(): int {
        let v = make_vec()
        v.x = 9
        return v.x + v.y
      }
    `, { namespace: 'test' })).not.toThrow()
  })
})
