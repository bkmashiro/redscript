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

describe('@benchmark decorator', () => {
  test('parser records @benchmark on the function', () => {
    const decorators = parseDecorators(`
      @benchmark
      fn expensive_pathfind() {}
    `)

    expect(decorators).toHaveLength(1)
    expect(decorators[0].name).toBe('benchmark')
  })

  test('typechecker rejects duplicate @benchmark decorators', () => {
    const errors = typeCheck(`
      @benchmark
      @benchmark
      fn expensive_pathfind() {}
    `)

    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('multiple @benchmark decorators')
  })

  test('compile rejects @benchmark arguments', () => {
    expect(() => compile(`
      @benchmark(label=1)
      fn expensive_pathfind() {}
    `, { namespace: 'bench_test' })).toThrow('@benchmark decorator does not accept arguments')
  })

  test('typechecker accepts valid @benchmark decorator', () => {
    const errors = typeCheck(`
      @benchmark
      fn expensive_pathfind(): int { 1 }
    `)

    expect(errors).toHaveLength(0)
  })

  test('emits benchmark objective in load.mcfunction', () => {
    const result = compile(`
      @benchmark
      fn expensive_pathfind(): int {
        return 42;
      }
    `, { namespace: 'bench_test' })

    const load = getFile(result.files, 'data/bench_test/function/load.mcfunction')
    expect(load).toContain('scoreboard objectives add __bench dummy')
  })

  test('emits benchmark wrapper with __bench_<name> filename', () => {
    const result = compile(`
      @benchmark
      fn expensive_pathfind(): int {
        return 42;
      }
    `, { namespace: 'bench_test' })

    const wrapper = getFile(result.files, 'data/bench_test/function/__bench_expensive_pathfind.mcfunction')
    expect(wrapper).toContain('function bench_test:expensive_pathfind_impl')
    expect(wrapper).toContain('execute store result score #bench_start_expensive_pathfind __bench run time query gametime')
    expect(wrapper).toContain('scoreboard players operation #bench_delta_expensive_pathfind __bench -= #bench_start_expensive_pathfind __bench')
  })

  test('emits impl function and keeps public function path', () => {
    const result = compile(`
      @benchmark
      fn expensive_pathfind(): int {
        return 42;
      }
    `, { namespace: 'bench_test' })

    const impl = getFile(result.files, 'data/bench_test/function/expensive_pathfind_impl.mcfunction')
    const entry = getFile(result.files, 'data/bench_test/function/expensive_pathfind.mcfunction')
    expect(impl.length).toBeGreaterThan(0)
    expect(entry).toContain('function bench_test:expensive_pathfind_impl')
  })

  test('emits tellraw output with function name and tick cost', () => {
    const result = compile(`
      @benchmark
      fn expensive_pathfind(): int {
        return 42;
      }
    `, { namespace: 'bench_test' })

    const wrapper = getFile(result.files, 'data/bench_test/function/__bench_expensive_pathfind.mcfunction')
    expect(wrapper).toContain('tellraw @a [{"text":"[benchmark] expensive_pathfind: "}')
    expect(wrapper).toContain('"objective":"__bench"')
    expect(wrapper).toContain('"text":" ticks"}')
  })
})
