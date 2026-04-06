import { TextDocument } from 'vscode-languageserver-textdocument'
import type { Position, TextEdit } from 'vscode-languageserver/node'

import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import type { Program } from '../../ast/types'
import { buildRenameWorkspaceEdit, findRenameRanges } from '../../lsp/rename'

function parseProgram(source: string): Program {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens, source, 'file:///test.mcrs').parse('test')
}

function positionOf(source: string, needle: string, occurrence = 0): Position {
  const lines = source.split('\n')
  let seen = 0
  for (let line = 0; line < lines.length; line++) {
    let col = lines[line].indexOf(needle)
    while (col !== -1) {
      if (seen === occurrence) return { line, character: col + Math.floor(needle.length / 2) }
      seen++
      col = lines[line].indexOf(needle, col + 1)
    }
  }
  throw new Error(`Missing "${needle}" occurrence ${occurrence}`)
}

function applyEdits(source: string, edits: TextEdit[]): string {
  const doc = TextDocument.create('file:///test.mcrs', 'redscript', 1, source)
  const sorted = edits
    .slice()
    .sort((a, b) => doc.offsetAt(b.range.start) - doc.offsetAt(a.range.start))
  let next = source
  for (const edit of sorted) {
    const start = doc.offsetAt(edit.range.start)
    const end = doc.offsetAt(edit.range.end)
    next = next.slice(0, start) + edit.newText + next.slice(end)
  }
  return next
}

function rename(source: string, position: Position, newName: string): string {
  const program = parseProgram(source)
  const doc = TextDocument.create('file:///test.mcrs', 'redscript', 1, source)
  const edit = buildRenameWorkspaceEdit(doc, program, position, newName)
  expect(edit).not.toBeNull()
  return applyEdits(source, edit!.changes![doc.uri]!)
}

describe('LSP rename symbol', () => {
  test('renames a local variable declaration and all same-scope references', () => {
    const source = `fn main(): void {
  let count: int = 1;
  let total: int = count + count;
}
`
    const next = rename(source, positionOf(source, 'count', 0), 'score')
    expect(next).toContain('let score: int = 1;')
    expect(next).toContain('let total: int = score + score;')
  })

  test('renames a local variable from a reference position', () => {
    const source = `fn main(): void {
  let count: int = 1;
  let total: int = count + count;
}
`
    const next = rename(source, positionOf(source, 'count', 1), 'value')
    expect(next).toContain('let value: int = 1;')
    expect(next).toContain('let total: int = value + value;')
  })

  test('renames a function declaration and same-file call sites', () => {
    const source = `fn greet(name: string): void {}
fn main(): void {
  greet("Steve");
  greet("Alex");
}
`
    const next = rename(source, positionOf(source, 'greet', 0), 'hello')
    expect(next).toContain('fn hello(name: string): void {}')
    expect(next).toContain('  hello("Steve");')
    expect(next).toContain('  hello("Alex");')
  })

  test('renames a function from a call site', () => {
    const source = `fn add(a: int, b: int): int { return a + b; }
fn main(): void {
  let x: int = add(1, 2);
}
`
    const next = rename(source, positionOf(source, 'add', 1), 'sum')
    expect(next).toContain('fn sum(a: int, b: int): int')
    expect(next).toContain('let x: int = sum(1, 2);')
  })

  test('renames a struct field declaration and member accesses', () => {
    const source = `struct Point {
  x: int,
  y: int,
}

fn move(point: Point): int {
  point.x = 1;
  return point.x;
}
`
    const next = rename(source, positionOf(source, 'x', 0), 'posX')
    expect(next).toContain('  posX: int,')
    expect(next).toContain('  point.posX = 1;')
    expect(next).toContain('  return point.posX;')
  })

  test('renames struct literal field keys when the target struct is known', () => {
    const source = `struct Point {
  x: int,
  y: int,
}

fn make_point(): Point {
  return Point { x: 1, y: 2 };
}
`
    const next = rename(source, positionOf(source, 'x', 0), 'axisX')
    expect(next).toContain('  axisX: int,')
    expect(next).toContain('return Point { axisX: 1, y: 2 };')
  })

  test('does not rename same-name locals in a nested scope', () => {
    const source = `fn main(): void {
  let value: int = 1;
  if true {
    let value: int = 2;
    let inner: int = value;
  }
  let outer: int = value;
}
`
    const next = rename(source, positionOf(source, 'value', 0), 'total')
    expect(next).toContain('let total: int = 1;')
    expect(next).toContain('let outer: int = total;')
    expect(next).toContain('let value: int = 2;')
    expect(next).toContain('let inner: int = value;')
  })

  test('findRenameRanges returns only outer-scope matches for shadowed names', () => {
    const source = `fn main(): void {
  let value: int = 1;
  if true {
    let value: int = 2;
    let inner: int = value;
  }
  let outer: int = value;
}
`
    const ranges = findRenameRanges(source, parseProgram(source), positionOf(source, 'value', 0))
    expect(ranges).toHaveLength(2)
    expect(ranges[0].start.line).toBe(1)
    expect(ranges[1].start.line).toBe(6)
  })
})

describe('LSP rename — struct field member access', () => {
  test('renames field at declaration and all member-access sites', () => {
    const source = `struct Player {
  health: int,
  mana: int,
}

fn damage(p: Player, amount: int): void {
  p.health = p.health - amount;
}

fn heal(p: Player, amount: int): void {
  p.health = p.health + amount;
}
`
    const next = rename(source, positionOf(source, 'health', 0), 'hp')
    expect(next).toContain('  hp: int,')
    expect(next).toContain('p.hp = p.hp - amount;')
    expect(next).toContain('p.hp = p.hp + amount;')
    expect(next).not.toContain('health')
  })

  test('does not rename a same-named field on a different struct', () => {
    const source = `struct A {
  value: int,
}

struct B {
  value: int,
}

fn read_a(a: A): int {
  return a.value;
}

fn read_b(b: B): int {
  return b.value;
}
`
    const next = rename(source, positionOf(source, 'value', 0), 'data')
    expect(next).toContain('struct A {\n  data: int,\n}')
    expect(next).toContain('return a.data;')
    // B.value must be untouched
    expect(next).toContain('struct B {\n  value: int,\n}')
    expect(next).toContain('return b.value;')
  })

  test('renames a field accessed via chained member expressions', () => {
    const source = `struct Inner {
  score: int,
}

struct Outer {
  inner: Inner,
}

fn get(o: Outer): int {
  return o.inner.score;
}
`
    const next = rename(source, positionOf(source, 'score', 0), 'points')
    expect(next).toContain('  points: int,')
    expect(next).toContain('return o.inner.points;')
  })

  test('renames field in struct literal initializer', () => {
    const source = `struct Vec2 {
  x: float,
  y: float,
}

fn zero(): Vec2 {
  return Vec2 { x: 0.0, y: 0.0 };
}
`
    const next = rename(source, positionOf(source, 'x', 0), 'horizontal')
    expect(next).toContain('  horizontal: float,')
    expect(next).toContain('Vec2 { horizontal: 0.0, y: 0.0 }')
  })
})

describe('LSP rename — shadowing and scope isolation', () => {
  test('renaming the inner shadow does not affect the outer binding', () => {
    const source = `fn main(): void {
  let count: int = 10;
  if true {
    let count: int = 99;
    let doubled: int = count * 2;
  }
  let result: int = count;
}
`
    // Rename the inner 'count' (second occurrence in the declaration position)
    const next = rename(source, positionOf(source, 'count', 1), 'inner')
    expect(next).toContain('let count: int = 10;')
    expect(next).toContain('let inner: int = 99;')
    expect(next).toContain('let doubled: int = inner * 2;')
    expect(next).toContain('let result: int = count;')
  })

  test('renaming outer does not bleed into nested block that redeclares the name', () => {
    const source = `fn main(): void {
  let x: int = 1;
  if true {
    let x: int = 2;
  }
  let y: int = x;
}
`
    const next = rename(source, positionOf(source, 'x', 0), 'z')
    expect(next).toContain('let z: int = 1;')
    expect(next).toContain('let x: int = 2;')
    expect(next).toContain('let y: int = z;')
  })

  test('findRenameRanges for inner shadow returns only inner-scope occurrences', () => {
    const source = `fn main(): void {
  let value: int = 1;
  if true {
    let value: int = 2;
    let inner: int = value;
  }
  let outer: int = value;
}
`
    // Target the declaration on line 3 (0-indexed) — the inner shadow
    const ranges = findRenameRanges(source, parseProgram(source), positionOf(source, 'value', 1))
    expect(ranges).toHaveLength(2)
    expect(ranges[0].start.line).toBe(3)
    expect(ranges[1].start.line).toBe(4)
  })
})

describe('LSP rename — keyword and non-renameable positions', () => {
  test('returns null when position is not on any symbol', () => {
    const source = `fn main(): void {
  let x: int = 1;
}
`
    const program = parseProgram(source)
    const doc = TextDocument.create('file:///test.mcrs', 'redscript', 1, source)
    // Position on whitespace / the type annotation 'int' — not a user-defined symbol
    const result = buildRenameWorkspaceEdit(doc, program, { line: 1, character: 12 }, 'renamed')
    expect(result).toBeNull()
  })

  test('findRenameRanges returns empty array for literal value position', () => {
    const source = `fn main(): void {
  let x: int = 42;
}
`
    // Position on '42'
    const ranges = findRenameRanges(source, parseProgram(source), { line: 1, character: 16 })
    expect(ranges).toHaveLength(0)
  })

  test('returns null when position is past end of file', () => {
    const source = `fn main(): void {}\n`
    const program = parseProgram(source)
    const doc = TextDocument.create('file:///test.mcrs', 'redscript', 1, source)
    const result = buildRenameWorkspaceEdit(doc, program, { line: 999, character: 0 }, 'x')
    expect(result).toBeNull()
  })
})

describe('LSP rename — function parameters', () => {
  test('renames a parameter declaration and all uses in the function body', () => {
    const source = `fn square(num: int): int {
  return num * num;
}
`
    const next = rename(source, positionOf(source, 'num', 0), 'value')
    expect(next).toContain('fn square(value: int): int {')
    expect(next).toContain('return value * value;')
  })

  test('parameter rename is isolated to its own function', () => {
    const source = `fn inc(arg: int): int {
  return arg + 1;
}

fn dec(arg: int): int {
  return arg - 1;
}
`
    // positionOf finds first 'arg' — the param in inc()
    const next = rename(source, positionOf(source, 'arg', 0), 'value')
    expect(next).toContain('fn inc(value: int): int {')
    expect(next).toContain('return value + 1;')
    // dec's parameter must be untouched — it is a different symbol
    expect(next).toContain('fn dec(arg: int): int {')
    expect(next).toContain('return arg - 1;')
  })
})

describe('LSP rename — for/foreach loop bindings', () => {
  test('renames a for-range loop variable inside its scope', () => {
    const source = `fn sum(nn: int): int {
  let total: int = 0;
  for idx in 0 .. nn {
    total = total + idx;
  }
  return total;
}
`
    const next = rename(source, positionOf(source, 'idx', 0), 'counter')
    expect(next).toContain('for counter in 0 .. nn {')
    expect(next).toContain('total = total + counter;')
  })
})

describe('LSP rename — multiple functions referencing same function', () => {
  test('renames function call sites across all callers', () => {
    const source = `fn compute(): int { return 1; }

fn a(): int {
  return compute();
}

fn b(): int {
  return compute() + compute();
}
`
    const next = rename(source, positionOf(source, 'compute', 0), 'calculate')
    expect(next).toContain('fn calculate(): int {')
    expect(next).toContain('return calculate();')
    expect(next).toContain('return calculate() + calculate();')
    expect(next).not.toContain('compute')
  })
})
