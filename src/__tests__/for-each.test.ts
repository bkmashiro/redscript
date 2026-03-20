import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { lowerToHIR } from '../hir/lower'
import type { HIRStmt, HIRExpr } from '../hir/types'
import { compile } from '../emit/compile'

function parseHIR(source: string) {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  return lowerToHIR(ast)
}

function getBody(source: string): HIRStmt[] {
  return parseHIR(source).functions[0].body
}

describe('for-each: parser', () => {
  test('for item in arr parses to for_each', () => {
    const program = new Parser(new Lexer('fn f(arr: int[]) { for item in arr { } }').tokenize()).parse('test')
    const stmt = program.declarations[0].body[0]
    expect(stmt.kind).toBe('for_each')
    if (stmt.kind === 'for_each') {
      expect(stmt.binding).toBe('item')
      expect((stmt.array as any).kind).toBe('ident')
      expect((stmt.array as any).name).toBe('arr')
    }
  })

  test('for n in nums parses to for_each', () => {
    const program = new Parser(new Lexer('fn f(nums: int[]) { for n in nums { } }').tokenize()).parse('test')
    const stmt = program.declarations[0].body[0]
    expect(stmt.kind).toBe('for_each')
    if (stmt.kind === 'for_each') {
      expect(stmt.binding).toBe('n')
    }
  })
})

describe('for-each: HIR lowering', () => {
  test('for item in arr → [let __foreach_len, let __foreach_i, while]', () => {
    const body = getBody('fn f(arr: int[]) { for item in arr { } }')
    // Expect: let __foreach_len, let __foreach_i, while
    expect(body).toHaveLength(3)
    expect(body[0].kind).toBe('let')
    expect(body[1].kind).toBe('let')
    expect(body[2].kind).toBe('while')
  })

  test('while condition uses idx < len', () => {
    const body = getBody('fn f(arr: int[]) { for item in arr { } }')
    const w = body[2] as Extract<HIRStmt, { kind: 'while' }>
    const cond = w.cond as Extract<HIRExpr, { kind: 'binary' }>
    expect(cond.op).toBe('<')
    expect((cond.left as any).kind).toBe('ident')
    expect((cond.right as any).kind).toBe('ident')
  })

  test('while body starts with let item = arr[idx]', () => {
    const body = getBody('fn f(arr: int[]) { for item in arr { } }')
    const w = body[2] as Extract<HIRStmt, { kind: 'while' }>
    const firstBodyStmt = w.body[0] as Extract<HIRStmt, { kind: 'let' }>
    expect(firstBodyStmt.kind).toBe('let')
    expect(firstBodyStmt.name).toBe('item')
    expect((firstBodyStmt.init as any).kind).toBe('index')
  })

  test('nested for-each generates unique variable names', () => {
    const body = getBody('fn f(arr: int[], brr: int[]) { for x in arr { for y in brr { } } }')
    // outer: let len_N, let i_N, while
    expect(body).toHaveLength(3)
    const outerLen = (body[0] as any).name as string
    const outerIdx = (body[1] as any).name as string
    const w = body[2] as Extract<HIRStmt, { kind: 'while' }>
    // inner while is nested inside outer while body
    const innerBody = w.body
    // Find inner let len and idx
    const innerLenStmt = innerBody.find((s: HIRStmt) => s.kind === 'let' && (s as any).name.startsWith('__foreach_len_'))
    const innerIdxStmt = innerBody.find((s: HIRStmt) => s.kind === 'let' && (s as any).name.startsWith('__foreach_i_'))
    expect(innerLenStmt).toBeDefined()
    expect(innerIdxStmt).toBeDefined()
    // Names must differ from outer
    expect((innerLenStmt as any).name).not.toBe(outerLen)
    expect((innerIdxStmt as any).name).not.toBe(outerIdx)
  })
})

describe('for-each: compile', () => {
  test('basic element iteration compiles end-to-end', () => {
    const src = `
      @keep fn test(arr: int[]): void {
        for item in arr {
          let x: int = item
        }
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })

  test('accumulate sum compiles end-to-end', () => {
    const src = `
      @keep fn sum_all(items: int[]): int {
        let total: int = 0
        for x in items {
          total = total + x
        }
        return total
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })

  test('nested for-each compiles end-to-end', () => {
    const src = `
      @keep fn nested(arr: int[], brr: int[]): void {
        for x in arr {
          for y in brr {
            let z: int = x + y
          }
        }
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })

  test('for-each with function parameter compiles end-to-end', () => {
    const src = `
      @keep fn process(items: int[]): void {
        for n in items {
          let doubled: int = n + n
        }
      }
    `
    expect(() => compile(src, { namespace: 'test' })).not.toThrow()
  })
})
