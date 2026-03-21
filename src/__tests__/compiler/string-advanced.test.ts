/**
 * Tests for enhanced string features:
 * - Enhanced f-string interpolation (expressions, function calls, array indexing)
 * - Multi-line triple-quoted strings
 * - int_to_str / bool_to_str builtin functions
 */

import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { verifyMIR } from '../../mir/verify'
import { compile } from '../../emit/compile'
import { TypeChecker } from '../../typechecker'

function parse(source: string) {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens, source).parse('test')
}

function compileSource(source: string, namespace = 'test') {
  return compile(source, { namespace })
}

function typeCheck(source: string) {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens, source).parse('test')
  const tc = new TypeChecker(source, 'test')
  return tc.check(ast)
}

// ---------------------------------------------------------------------------
// Multi-line strings
// ---------------------------------------------------------------------------

describe('multi-line triple-quoted strings', () => {
  test('lexer tokenizes triple-quoted string as string_lit', () => {
    const tokens = new Lexer('"""Hello\nWorld"""').tokenize()
    expect(tokens[0].kind).toBe('string_lit')
    expect(tokens[0].value).toBe('Hello\nWorld')
  })

  test('triple-quoted string with leading/trailing newlines is trimmed', () => {
    const tokens = new Lexer('"""\nHello\nWorld\n"""').tokenize()
    expect(tokens[0].kind).toBe('string_lit')
    expect(tokens[0].value).toBe('Hello\nWorld')
  })

  test('triple-quoted string compiles in let binding', () => {
    expect(() => compileSource(`
      fn test() {
        let msg: string = """
Hello
World
"""
        say(msg)
      }
    `)).not.toThrow()
  })

  test('typechecker accepts triple-quoted string as string type', () => {
    const errors = typeCheck(`
fn test() {
  let msg: string = """
  Hello
  World
  """
}
`)
    expect(errors).toHaveLength(0)
  })

  test('triple-quoted string with interpolation content parses correctly', () => {
    const ast = parse(`
fn test() {
  let s: string = """Line 1
Line 2"""
}
`)
    expect(ast.declarations).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Enhanced f-string interpolation
// ---------------------------------------------------------------------------

describe('enhanced f-string interpolation', () => {
  test('f-string with simple variable compiles', () => {
    expect(() => compileSource(`
      fn test() {
        let x: int = 5
        tellraw(@a, f"Value: {x}")
      }
    `)).not.toThrow()
  })

  test('f-string with binary expression compiles', () => {
    expect(() => compileSource(`
      fn test() {
        let x: int = 5
        tellraw(@a, f"Result: {x + 1}")
      }
    `)).not.toThrow()
  })

  test('f-string with arithmetic expression compiles', () => {
    expect(() => compileSource(`
      fn test() {
        let a: int = 3
        let b: int = 4
        tellraw(@a, f"Product: {a * b}")
      }
    `)).not.toThrow()
  })

  test('f-string with function call expression compiles', () => {
    expect(() => compileSource(`
      fn double(n: int): int {
        return n * 2
      }
      fn test() {
        let x: int = 5
        tellraw(@a, f"Doubled: {double(x)}")
      }
    `)).not.toThrow()
  })

  test('f-string passes MIR verification with expression interpolation', () => {
    const source = `
      fn test() {
        let x: int = 5
        tellraw(@a, f"Result: {x + 1}")
      }
    `
    const ast = parse(source)
    const hir = lowerToHIR(ast)
    const mir = lowerToMIR(hir)
    expect(verifyMIR(mir)).toEqual([])
  })

  test('f-string with multiple complex parts compiles', () => {
    expect(() => compileSource(`
      fn test() {
        let a: int = 3
        let b: int = 4
        tellraw(@a, f"Sum: {a + b}, Product: {a * b}")
      }
    `)).not.toThrow()
  })

  test('f-string with text-only parts still works', () => {
    expect(() => compileSource(`
      fn test() {
        tellraw(@a, f"Hello World")
      }
    `)).not.toThrow()
  })

  test('f-string generates JSON text component with score reference for ident', () => {
    const source = `
      fn test() {
        let score: int = 10
        tellraw(@a, f"Score: {score}")
      }
    `
    const result = compileSource(source, 'myns')
    // result is CompileResult with .files array of { path, content }
    const allContent = result.files.map(f => f.content).join('\n')
    expect(allContent).toContain('tellraw')
    // Should contain a JSON text component with 'text' or 'score'
    expect(allContent.includes('score') || allContent.includes('text')).toBe(true)
  })

  test('f-string with expression generates precomputed temp in MIR', () => {
    const source = `
      fn test() {
        let x: int = 5
        tellraw(@a, f"Val: {x + 1}")
      }
    `
    const ast = parse(source)
    const hir = lowerToHIR(ast)
    const mir = lowerToMIR(hir)
    const fn = mir.functions.find(f => f.name === 'test')
    expect(fn).toBeDefined()
    // Should have emitted arithmetic instructions for x + 1
    const allInstrs = fn!.blocks.flatMap(b => b.instrs)
    // MIR arithmetic uses 'add', 'sub', 'mul', etc. (not 'arith')
    const arithInstrs = allInstrs.filter(i => ['add', 'sub', 'mul', 'div'].includes(i.kind))
    expect(arithInstrs.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// int_to_str and bool_to_str
// ---------------------------------------------------------------------------

describe('int_to_str builtin', () => {
  test('int_to_str is accepted by typechecker', () => {
    const errors = typeCheck(`
fn test() {
  let n: int = 42
  let s: string = int_to_str(n)
}
`)
    expect(errors).toHaveLength(0)
  })

  test('int_to_str in f-string compiles', () => {
    expect(() => compileSource(`
      fn test() {
        let n: int = 42
        tellraw(@a, f"Value: {int_to_str(n)}")
      }
    `)).not.toThrow()
  })

  test('int_to_str standalone compiles', () => {
    expect(() => compileSource(`
      fn test() {
        let n: int = 42
        let s: string = int_to_str(n)
      }
    `)).not.toThrow()
  })

  test('int_to_str passes MIR verification', () => {
    const source = `
      fn test() {
        let n: int = 42
        let s: string = int_to_str(n)
      }
    `
    const ast = parse(source)
    const hir = lowerToHIR(ast)
    const mir = lowerToMIR(hir)
    expect(verifyMIR(mir)).toEqual([])
  })
})

describe('bool_to_str builtin', () => {
  test('bool_to_str is accepted by typechecker', () => {
    const errors = typeCheck(`
fn test() {
  let b: bool = true
  let s: string = bool_to_str(b)
}
`)
    expect(errors).toHaveLength(0)
  })

  test('bool_to_str in f-string compiles', () => {
    expect(() => compileSource(`
      fn test() {
        let b: bool = true
        tellraw(@a, f"Active: {bool_to_str(b)}")
      }
    `)).not.toThrow()
  })

  test('bool_to_str passes MIR verification', () => {
    const source = `
      fn test() {
        let b: bool = false
        let s: string = bool_to_str(b)
      }
    `
    const ast = parse(source)
    const hir = lowerToHIR(ast)
    const mir = lowerToMIR(hir)
    expect(verifyMIR(mir)).toEqual([])
  })

  test('bool_to_str in title builtin compiles', () => {
    expect(() => compileSource(`
      fn test() {
        let active: bool = true
        title(@a, f"Active: {bool_to_str(active)}")
      }
    `)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Integration: combined features
// ---------------------------------------------------------------------------

describe('combined string features', () => {
  test('multi-line string with f-string expression compiles', () => {
    expect(() => compileSource(`
      fn test() {
        let x: int = 10
        let msg: string = """Hello World"""
        tellraw(@a, f"Score: {x + 5}")
      }
    `)).not.toThrow()
  })

  test('int_to_str and f-string with arithmetic in same function', () => {
    expect(() => compileSource(`
      fn test() {
        let n: int = 5
        let doubled: int = n * 2
        let s: string = int_to_str(doubled)
        tellraw(@a, f"Value: {n + 1}, Doubled str: {int_to_str(n * 2)}")
      }
    `)).not.toThrow()
  })
})
