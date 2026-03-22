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
