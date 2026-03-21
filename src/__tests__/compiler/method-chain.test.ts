/**
 * Tests for struct method chaining (method chaining pattern).
 * Verifies that impl method calls can be chained: v.scale(2).add(other).len_sq()
 */

import { compile } from '../../emit/compile'

const VEC2_SRC = `
  struct Vec2 { x: int, y: int }

  impl Vec2 {
    fn scale(self, factor: int): Vec2 {
      return Vec2 { x: self.x * factor, y: self.y * factor }
    }
    fn add(self, other: Vec2): Vec2 {
      return Vec2 { x: self.x + other.x, y: self.y + other.y }
    }
    fn len_sq(self): int {
      return self.x * self.x + self.y * self.y
    }
  }
`

describe('method chaining: compile', () => {
  test('simple two-step chain compiles without error', () => {
    const src = `
      ${VEC2_SRC}
      @keep fn test(): void {
        let v: Vec2 = Vec2 { x: 3, y: 4 }
        let v2: Vec2 = v.scale(2)
        let result: Vec2 = v2.add(Vec2 { x: 1, y: 0 })
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })

  test('two-method chain v.scale(2).add(...) compiles without error', () => {
    const src = `
      ${VEC2_SRC}
      @keep fn test(): void {
        let v: Vec2 = Vec2 { x: 3, y: 4 }
        let result: Vec2 = v.scale(2).add(Vec2 { x: 1, y: 0 })
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })

  test('three-method chain v.scale(2).add(...).len_sq() compiles without error', () => {
    const src = `
      ${VEC2_SRC}
      @keep fn test(): void {
        let v: Vec2 = Vec2 { x: 3, y: 4 }
        let result: int = v.scale(2).add(Vec2 { x: 1, y: 0 }).len_sq()
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })

  test('two-method chain emits call to scale and add functions', () => {
    const src = `
      ${VEC2_SRC}
      @keep fn test(): void {
        let v: Vec2 = Vec2 { x: 3, y: 4 }
        let result: Vec2 = v.scale(2).add(Vec2 { x: 1, y: 0 })
      }
    `
    const result = compile(src, { namespace: 'test' })
    const allContent = result.files.map(f => f.content).join('\n')
    // scale and add should be emitted as functions
    const allPaths = result.files.map(f => f.path).join('\n')
    expect(allPaths).toMatch(/scale/)
    expect(allPaths).toMatch(/add/)
  })

  test('three-method chain emits scale, add, and len_sq functions', () => {
    const src = `
      ${VEC2_SRC}
      @keep fn test(): void {
        let v: Vec2 = Vec2 { x: 3, y: 4 }
        let result: int = v.scale(2).add(Vec2 { x: 1, y: 0 }).len_sq()
      }
    `
    const result = compile(src, { namespace: 'test' })
    const allPaths = result.files.map(f => f.path).join('\n')
    expect(allPaths).toMatch(/scale/)
    expect(allPaths).toMatch(/add/)
    expect(allPaths).toMatch(/len_sq/)
  })

  test('chained method result as function argument compiles', () => {
    const src = `
      ${VEC2_SRC}
      @keep fn use_len(n: int): void {}
      @keep fn test(): void {
        let v: Vec2 = Vec2 { x: 1, y: 2 }
        use_len(v.scale(3).len_sq())
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })

  test('Counter increment chain: c.increment().increment() compiles', () => {
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
      @keep fn test(): void {
        let c: Counter = Counter { value: 0 }
        let c3: Counter = c.increment().increment()
        let v: int = c3.get()
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })
})
