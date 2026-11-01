import { compile } from '../compile'
import { MCRuntime } from '../runtime'
import { compileModules } from '../emit/modules'

function run(source: string): number {
  const result = compile(source, { namespace: 'fn_values' })
  const runtime = new MCRuntime('fn_values')
  for (const file of result.files) {
    const match = file.path.match(/^data\/([^/]+)\/function\/(.+)\.mcfunction$/)
    if (match) runtime.loadFunction(`${match[1]}:${match[2]}`, file.content.split('\n'))
  }
  const loads = JSON.parse(result.files.find(file => file.path === 'data/minecraft/tags/function/load.json')!.content).values
  for (const name of loads) runtime.execFunction(name)
  runtime.execFunction('fn_values:main')
  return runtime.getScore('$ret', '__fn_values')
}

test('function handles cross module objectives and input order without changing identity', () => {
  const modules = [
    { name: 'app', source: 'module app; import lib::apply; export fn main(): int { return apply((x: int) => x * 2, 7); }' },
    { name: 'lib', source: 'module lib; export fn apply(f: (int) -> int, x: int): int { return f(x); }' },
  ]
  for (const inputs of [modules, [...modules].reverse()]) {
    const result = compileModules(inputs, { namespace: 'fv', entryFunctions: ['app/main'] })
    const runtime = new MCRuntime('fv')
    for (const file of result.files) {
      const match = file.path.match(/^data\/([^/]+)\/function\/(.+)\.mcfunction$/)
      if (match) runtime.loadFunction(`${match[1]}:${match[2]}`, file.content.split('\n'))
    }
    runtime.execFunction('fv:app/main')
    expect(runtime.getScore('$ret', '__fv_app')).toBe(14)
  }
})

test('function handles cannot be forged by an integer cast', () => {
  expect(() => run('fn main(): int { let f: (int) -> int = 1 as (int) -> int; return f(2); }')).toThrow(/Function values cannot be cast/)
})

test('capture-free lambdas pass through typed higher-order parameters', () => {
  expect(run('fn apply(f: (int) -> int, x: int): int { return f(x); } fn main(): int { let twice: (int) -> int = (x: int) => x * 2; let square: (int) -> int = (x: int) => x * x; return apply(twice, 7) * 100 + apply(square, 9); }')).toBe(1481)
})
test('runtime selection and copied function values dispatch the chosen target', () => {
  expect(run('fn main(): int { let f: (int) -> int = (x: int) => x + 1; if (scoreboard_get("#choice", "input") == 0) { f = (x: int) => x * 3; } let alias: (int) -> int = f; return alias(7); }')).toBe(21)
})
test('named source functions can be values', () => {
  expect(run('fn plus(x: int): int { return x + 3; } fn main(): int { let f: (int) -> int = plus; return f(4); }')).toBe(7)
})
test('function results and expression invocation retain their callable type', () => {
  expect(run('fn make(): (int) -> int { return (x: int) => x * 3; } fn main(): int { return make()(14); }')).toBe(42)
})
test('function parameters shadow same-name declarations', () => {
  expect(run('fn adjust(x: int): int { return x + 100; } fn apply(adjust: (int) -> int): int { return adjust(4); } fn main(): int { return apply((x: int) => x * 2); }')).toBe(8)
})
test('capturing lambdas are diagnosed instead of reading an absent lifted local', () => {
  expect(() => run('fn main(): int { let offset: int = 3; let f: (int) -> int = (x: int) => x + offset; return f(2); }')).toThrow(/captur.*offset/i)
})
