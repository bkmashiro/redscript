import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { compile } from '../emit/compile'
import { MCRuntime } from '../runtime'

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'source-frontend-')) })
afterEach(() => fs.rmSync(root, { recursive: true, force: true }))
function write(name: string, source: string) { fs.writeFileSync(path.join(root, `${name}.mcrs`), source) }
function run(source: string, librarySources?: string[]): number {
  const result = compile(source, { namespace: 'source_front', filePath: path.join(root, 'main.mcrs'), librarySources })
  const runtime = new MCRuntime('source_front')
  for (const file of result.files) {
    const match = file.path.match(/^data\/([^/]+)\/function\/(.+)\.mcfunction$/)
    if (match) runtime.loadFunction(`${match[1]}:${match[2]}`, file.content.split('\n'))
  }
  runtime.execFunction('source_front:load')
  runtime.execFunction('source_front:main')
  return runtime.getScore('$ret', '__source_front')
}

test('selected source implementation executes its private helper', () => {
  write('lib', 'module lib; fn hidden(): int { return 7; } export fn value(): int { return hidden(); }')
  expect(run('import lib::value; fn main(): int { return value(); }')).toBe(7)
})
test('same private names in separate source modules retain their bound identities', () => {
  write('left', 'module left; fn hidden(): int { return 5; } export fn left_value(): int { return hidden(); }')
  write('right', 'module right; fn hidden(): int { return 8; } export fn right_value(): int { return hidden(); }')
  expect(run('import left::left_value; import right::right_value; fn main(): int { return left_value() + right_value(); }')).toBe(13)
})
test('an implementation import does not expose its private helper', () => {
  write('lib', 'module lib; fn hidden(): int { return 7; } export fn value(): int { return hidden(); }')
  expect(() => run('import lib::*; fn main(): int { return hidden(); }')).toThrow(/Unknown function 'hidden'/)
})
test('anonymous librarySources use the same dependency discovery and binder', () => {
  write('lib', 'module lib; export fn value(): int { return 9; }')
  expect(run('fn main(): int { return bridge(); }', ['import lib::value; fn bridge(): int { return value(); }'])).toBe(9)
})
test('generic bodies are bound before instantiation on the source API', () => {
  expect(() => run('fn unused<T>(x: T): int { return not_declared(); } fn main(): int { return 1; }')).toThrow(/Unknown function 'not_declared'/)
})

test('function references keep exported ownership without exposing private helpers', () => {
  write('lib', 'module lib; fn hidden(x: int): int { return x + 3; } export fn value(x: int): int { return hidden(x); }')
  expect(run('import lib::value; fn main(): int { let f: (int) -> int = value; return f(4); }')).toBe(7)
  expect(() => run('import lib::*; fn main(): int { let f: (int) -> int = hidden; return f(4); }')).toThrow(/Unknown function reference 'hidden'/)
})

test('a bound source function is not redispatched as a same-name intrinsic', () => {
  expect(run('fn random(low: int, high: int): int { return 99; } fn main(): int { return random(2, 5); }')).toBe(99)
  expect(run('fn random(value: bool): bool { return value; } fn main(): int { if (random(true)) { return 99; } return 0; }')).toBe(99)
})
test('a bound ordinary call with a struct argument is not a receiver method', () => {
  expect(run('struct Cell { x: int } impl Cell { fn pick(self): int { return 5; } } fn pick(c: Cell): int { return 9; } fn main(): int { let c: Cell = Cell { x: 1 }; return pick(c) * 10 + c.pick(); }')).toBe(95)
})
