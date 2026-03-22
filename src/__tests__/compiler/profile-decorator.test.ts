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

function parseDecorators(source: string): string[] {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  return ast.declarations[0]?.decorators.map(decorator => decorator.name) ?? []
}

function typeCheck(source: string): DiagnosticError[] {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  return new TypeChecker(source).check(ast)
}

describe('@profile decorator', () => {
  test('parser records @profile on the function', () => {
    expect(parseDecorators(`
      @profile
      fn expensive_calculation() {}
    `)).toContain('profile')
  })

  test('typechecker rejects duplicate @profile decorators', () => {
    const errors = typeCheck(`
      @profile
      @profile
      fn expensive_calculation() {}
    `)

    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('multiple @profile decorators')
  })

  test('emits profiler instrumentation and helper functions only in debug mode', () => {
    const source = `
      @profile
      fn expensive_calculation() {
        let value: int = 42;
        say("done");
      }
    `

    const debugResult = compile(source, { namespace: 'profile_test', debug: true })
    const regularResult = compile(source, { namespace: 'profile_test' })

    const main = getFile(debugResult.files, 'data/profile_test/function/expensive_calculation.mcfunction')
    const load = getFile(debugResult.files, 'data/profile_test/function/load.mcfunction')
    const reset = getFile(debugResult.files, 'data/profile_test/function/__profiler_reset.mcfunction')
    const report = getFile(debugResult.files, 'data/profile_test/function/__profiler_report.mcfunction')

    expect(main).toContain('# __profiler_start_expensive_calculation')
    expect(main).toContain('execute store result score #prof_start_expensive_calculation __time run time query gametime')
    expect(main).toContain('# __profiler_end_expensive_calculation')
    expect(main).toContain('scoreboard players operation #prof_total_expensive_calculation __profile += #prof_delta_expensive_calculation __time')
    expect(main).toContain('scoreboard players add #prof_count_expensive_calculation __profile 1')

    expect(load).toContain('scoreboard objectives add __time dummy')
    expect(load).toContain('scoreboard objectives add __profile dummy')
    expect(reset).toContain('scoreboard players set #prof_total_expensive_calculation __profile 0')
    expect(reset).toContain('scoreboard players set #prof_count_expensive_calculation __profile 0')
    expect(report).toContain('"text":"[profile] expensive_calculation: total="')
    expect(report).toContain('"name":"#prof_total_expensive_calculation"')

    expect(regularResult.files.find(file => file.path === 'data/profile_test/function/__profiler_reset.mcfunction')).toBeUndefined()
    expect(getFile(regularResult.files, 'data/profile_test/function/expensive_calculation.mcfunction')).not.toContain('__profiler_start_expensive_calculation')
  })
})
