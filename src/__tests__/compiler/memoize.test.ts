import { compile } from '../../emit/compile'
import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { TypeChecker } from '../../typechecker'
import type { DiagnosticError } from '../../diagnostics'

function getFile(files: Array<{ path: string; content: string }>, path: string): string {
  const file = files.find(entry => entry.path === path)
  if (!file) {
    throw new Error(`Missing file: ${path}\nFiles:\n${files.map(entry => entry.path).join('\n')}`)
  }
  return file.content
}

function parseDecorators(source: string): Array<{ name: string; args?: Record<string, unknown> }> {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  return ast.declarations[0]?.decorators ?? []
}

function typeCheck(source: string): DiagnosticError[] {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  return new TypeChecker(source).check(ast)
}

// ---------------------------------------------------------------------------
// @memoize tests
// ---------------------------------------------------------------------------

describe('@memoize decorator', () => {
  test('parser records @memoize decorator with no args', () => {
    const decorators = parseDecorators(`
      @memoize
      fn fib(n: int): int { 0 }
    `)
    expect(decorators).toHaveLength(1)
    expect(decorators[0].name).toBe('memoize')
  })

  test('typechecker accepts valid @memoize on single int param function', () => {
    const errors = typeCheck(`
      @memoize
      fn fib(n: int): int { 0 }
    `)
    expect(errors).toHaveLength(0)
  })

  test('typechecker rejects @memoize on function with no parameters', () => {
    const errors = typeCheck(`
      @memoize
      fn get_value(): int { 0 }
    `)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('@memoize')
    expect(errors[0].message).toContain('exactly one parameter')
  })

  test('typechecker rejects @memoize on function with non-int parameter', () => {
    const errors = typeCheck(`
      @memoize
      fn compute(x: fixed): int { 0 }
    `)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('@memoize')
    expect(errors[0].message).toContain('int')
  })

  test('typechecker rejects duplicate @memoize decorators', () => {
    const errors = typeCheck(`
      @memoize
      @memoize
      fn fib(n: int): int { 0 }
    `)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('multiple @memoize')
  })

  test('emits __memo scoreboard objective in load.mcfunction', () => {
    const result = compile(`
      @memoize
      fn fib(n: int): int {
        if n <= 1 { return n; }
        return fib(n - 1) + fib(n - 2);
      }
    `, { namespace: 'memo_test' })

    const load = getFile(result.files, 'data/memo_test/function/load.mcfunction')
    expect(load).toContain('scoreboard objectives add __memo dummy')
  })

  test('emits memoize wrapper mcfunction with cache-check and cache-store logic', () => {
    const result = compile(`
      @memoize
      fn fib(n: int): int {
        if n <= 1 { return n; }
        return fib(n - 1) + fib(n - 2);
      }
    `, { namespace: 'memo_test' })

    const wrapper = getFile(result.files, 'data/memo_test/function/fib.mcfunction')
    // Cache hit branch: check valid flag and key match, copy cached value, return early
    expect(wrapper).toContain('__memo_fib_hit')
    expect(wrapper).toContain('__memo_fib_key')
    expect(wrapper).toContain('__memo_fib_val')
    expect(wrapper).toContain('return 0')
    // Cache miss branch: call implementation
    expect(wrapper).toContain('function memo_test:fib_impl')
    // Store result
    expect(wrapper).toContain('scoreboard players set __memo_fib_hit __memo 1')
  })

  test('emits fib_impl function (renamed original body)', () => {
    const result = compile(`
      @memoize
      fn fib(n: int): int {
        if n <= 1 { return n; }
        return fib(n - 1) + fib(n - 2);
      }
    `, { namespace: 'memo_test' })

    // The original compiled body should be available as fib_impl
    const implExists = result.files.some(f => f.path === 'data/memo_test/function/fib_impl.mcfunction')
    expect(implExists).toBe(true)
  })
})
