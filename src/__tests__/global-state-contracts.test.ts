import { compile } from '../compile'
import { MCRuntime } from '../runtime'

function run(source: string): number {
  const result = compile(source, { namespace: 'global_state' })
  const runtime = new MCRuntime('global_state')
  for (const file of result.files) {
    const match = file.path.match(/^data\/([^/]+)\/function\/(.+)\.mcfunction$/)
    if (match) runtime.loadFunction(`${match[1]}:${match[2]}`, file.content.split('\n'))
  }
  const loadTag = result.files.find(file => file.path === 'data/minecraft/tags/function/load.json')!
  for (const name of JSON.parse(loadTag.content).values) runtime.execFunction(name)
  runtime.execFunction('global_state:main')
  return runtime.getScore('$ret', '__global_state')
}

test('compiler-intrinsic Timer globals fail instead of executing stdlib stub methods', () => {
  expect(() => compile('import timer; let t: Timer = Timer::new(5); fn main(): void { t.start(); }')).toThrow(/global.*Timer|Timer.*global/i)
})

test('scalar globals initialize once on load and retain writes between calls', () => {
  expect(run('let count: int = 7; fn inc(): int { count = count + 1; return count; } fn main(): int { return inc() * 10 + inc(); }')).toBe(89)
})

test('global reads observe calls and scalar shadow assignments stay local', () => {
  expect(run('let count: int = 7; fn change(): void { count = 8; } fn main(): int { let before: int = count; change(); return before * 100 + count * 10 + count; }')).toBe(788)
  expect(run('let count: int = 7; fn local(): int { let count: int = 1; count = count + 1; return count; } fn main(): int { return local() * 10 + count; }')).toBe(27)
})

const counter = `struct Counter { value: int }
impl Counter {
  fn bump(self): int { self.value = self.value + 1; return self.value; }
  fn reset(self): void { self.value = 0; }
}
let first: Counter = { value: 5 };
let second: Counter = { value: 8 };`

test('global field interpolation uses valid macro capture identifiers', () => {
  const result = compile(`${counter} fn main(): void { say(f"value={first.value}, converted={int_to_str(second.value)}"); }`, { namespace: 'global_state' })
  const commands = result.files.map(file => file.content).join('\n')
  expect(commands).not.toMatch(/\$\([^)]*\.[^)]*\)/)
  expect(commands).toContain('first.value')
})

test('global struct methods persist state, preserve return values and isolate instances', () => {
  expect(run(`${counter}
fn main(): int {
  let a: int = first.bump();
  let b: int = first.bump();
  let c: int = second.bump();
  first.reset();
  return a * 1000 + b * 100 + c * 10 + first.value;
}`)).toBe(6790)
})

test('local receiver shadowing does not mutate a same-name global instance', () => {
  expect(run(`${counter}
fn read_first(): int { return first.value; }
fn main(): int { let first: Counter = Counter { value: 1 }; return first.bump() * 10 + read_first(); }`)).toBe(25)
})

test('ordinary struct arguments preserve literal and factory values', () => {
  expect(run(`struct Counter { value: int }
fn read(c: Counter): int { return c.value; }
fn make(): Counter { return { value: 7 }; }
fn main(): int { return read(Counter { value: 5 }) * 10 + read(make()); }`)).toBe(57)
})

test('global struct constructors and whole-value assignment preserve fields', () => {
  expect(run(`struct Counter { value: int }
fn make(): Counter { return { value: 4 }; }
let state: Counter = { value: 3 };
fn main(): int { let before: int = state.value; state = make(); let middle: int = state.value; state = Counter { value: 9 }; return before * 100 + middle * 10 + state.value; }`)).toBe(349)
})

test('global self-method calls retain the same receiver address', () => {
  expect(run(`struct Counter { value: int }
impl Counter {
  fn bump(self): int { self.value = self.value + 1; return self.value; }
  fn twice(self): int { return self.bump() + self.bump(); }
}
let state: Counter = { value: 5 };
fn main(): int { return state.twice() * 100 + state.twice(); }`)).toBe(1317)
})
