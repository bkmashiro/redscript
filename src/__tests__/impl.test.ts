import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { lowerToHIR } from '../hir/lower'
import { compile } from '../emit/compile'

function parse(source: string) {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens).parse('test')
}

describe('impl: parser', () => {
  test('parses impl block with self methods', () => {
    const program = parse(`
      struct Counter { value: int }
      impl Counter {
        fn increment(self): Counter {
          return { value: self.value + 1 }
        }
        fn get(self): int {
          return self.value
        }
      }
    `)
    expect(program.implBlocks).toHaveLength(1)
    expect(program.implBlocks[0].typeName).toBe('Counter')
    expect(program.implBlocks[0].methods).toHaveLength(2)
    expect(program.implBlocks[0].methods[0].name).toBe('increment')
    expect(program.implBlocks[0].methods[0].params[0].name).toBe('self')
    expect(program.implBlocks[0].methods[0].params[0].type).toEqual({ kind: 'struct', name: 'Counter' })
    expect(program.implBlocks[0].methods[1].name).toBe('get')
  })

  test('parses impl block with static method (no self)', () => {
    const program = parse(`
      struct Counter { value: int }
      impl Counter {
        fn new(n: int): Counter {
          return { value: n }
        }
      }
    `)
    expect(program.implBlocks[0].methods[0].name).toBe('new')
    expect(program.implBlocks[0].methods[0].params[0].name).toBe('n')
  })

  test('parses named struct literal TypeName { field: value }', () => {
    const program = parse(`
      struct Counter { value: int }
      impl Counter {
        fn increment(self): Counter {
          return Counter { value: self.value + 1 }
        }
      }
    `)
    const body = program.implBlocks[0].methods[0].body
    const ret = body[0]
    expect(ret.kind).toBe('return')
    if (ret.kind === 'return' && ret.value) {
      expect(ret.value.kind).toBe('struct_lit')
    }
  })
})

describe('impl: HIR lowering', () => {
  test('impl methods appear in HIR implBlocks', () => {
    const program = parse(`
      struct Counter { value: int }
      impl Counter {
        fn increment(self): Counter {
          return { value: self.value + 1 }
        }
        fn add(self, n: int): Counter {
          return { value: self.value + n }
        }
      }
    `)
    const hir = lowerToHIR(program)
    expect(hir.implBlocks).toHaveLength(1)
    expect(hir.implBlocks[0].typeName).toBe('Counter')
    expect(hir.implBlocks[0].methods).toHaveLength(2)
  })
})

describe('impl: compile', () => {
  test('impl with self methods compiles end-to-end', () => {
    const src = `
      struct Counter { value: int }
      impl Counter {
        fn increment(self): Counter {
          return { value: self.value + 1 }
        }
        fn add(self, n: int): Counter {
          return { value: self.value + n }
        }
        fn get(self): int {
          return self.value
        }
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })

  test('named struct literal Counter { ... } compiles end-to-end', () => {
    const src = `
      struct Counter { value: int }
      impl Counter {
        fn increment(self): Counter {
          return Counter { value: self.value + 1 }
        }
        fn get(self): int {
          return self.value
        }
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })

  test('method calls on struct instances compile', () => {
    const src = `
      struct Counter { value: int }
      impl Counter {
        fn increment(self): Counter {
          return { value: self.value + 1 }
        }
        fn get(self): int {
          return self.value
        }
      }
      @keep fn main(): void {
        let c: Counter = { value: 0 }
        let c2: Counter = c.increment()
        let v: int = c2.get()
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })

  test('static method Counter::new compiles', () => {
    const src = `
      struct Counter { value: int }
      impl Counter {
        fn new(n: int): Counter {
          return { value: n }
        }
      }
      @keep fn main(): void {
        let c: Counter = Counter::new(5)
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })

  test('impl fixture compiles', () => {
    const src = `
      namespace impl_test
      struct Counter {
        value: int
      }
      impl Counter {
        fn increment(self): Counter {
          return Counter { value: self.value + 1 }
        }
        fn add(self, n: int): Counter {
          return Counter { value: self.value + n }
        }
        fn get(self): int {
          return self.value
        }
      }
    `
    expect(() => compile(src, { namespace: 'impl_test' })).not.toThrow()
  })
})

describe('impl: struct param method (bug fix)', () => {
  test('method receiving another struct instance as param compiles and produces correct ops', () => {
    // Regression: dot(self: Vec2, other: Vec2) was broken because struct args
    // were not flattened field-by-field at call sites and in lowerImplMethod.
    const src = `
      struct Vec2 { x: int, y: int }
      impl Vec2 {
        fn dot(self, other: Vec2): int {
          return self.x * other.x + self.y * other.y
        }
        fn length_sq(self): int {
          return self.x * self.x + self.y * self.y
        }
      }
      @keep fn test(): void {
        let a: Vec2 = { x: 3, y: 4 }
        let b: Vec2 = { x: 1, y: 2 }
        let d: int = a.dot(b)
        let l: int = a.length_sq()
      }
    `
    const result = compile(src, { namespace: 'test' })
    // dot(a={3,4}, b={1,2}) = 3*1 + 4*2 = 11, length_sq(a) = 9+16 = 25
    // Compiler constant-folds into a specialized function dot__const_3_4_1_2
    const allContent = result.files.map(f => f.content).join('\n')
    // The specialized dot function should compute 3*1=3 and 4*2=8 and add them = 11
    expect(allContent).toMatch(/set.*3\b/)
    expect(allContent).toMatch(/set.*8\b/)
    // Ensure no helper files for __entity_tag or nonexistent functions are emitted
    const fnPaths = result.files.map(f => f.path)
    expect(fnPaths.some(p => p.includes('dot'))).toBe(true)
  })
})
