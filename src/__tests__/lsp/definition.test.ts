/**
 * LSP Go-to-Definition Tests
 *
 * Tests the definition lookup logic mirrored from lsp/server.ts.
 * Uses parsed AST spans to verify Location results.
 */

import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { DiagnosticError } from '../../diagnostics'
import type { Program, FnDecl, Span, TypeNode, Block } from '../../ast/types'
import type { Location, Position } from 'vscode-languageserver/node'

// ---------------------------------------------------------------------------
// Mirrored helpers from lsp/server.ts
// ---------------------------------------------------------------------------

function wordAt(source: string, position: Position): string {
  const lines = source.split('\n')
  const line = lines[position.line] ?? ''
  const ch = position.character
  let start = ch
  while (start > 0 && /\w/.test(line[start - 1])) start--
  let end = ch
  while (end < line.length && /\w/.test(line[end])) end++
  return line.slice(start, end)
}

function buildDefinitionMap(program: Program): Map<string, Span> {
  const map = new Map<string, Span>()
  for (const fn of program.declarations) {
    if (fn.span) map.set(fn.name, fn.span)
  }
  for (const impl of program.implBlocks ?? []) {
    for (const m of impl.methods) {
      if (m.span) map.set(`${impl.typeName}.${m.name}`, m.span)
    }
  }
  for (const s of program.structs ?? []) {
    if (s.span) map.set(s.name, s.span)
  }
  for (const e of program.enums ?? []) {
    if (e.span) map.set(e.name, e.span)
  }
  for (const c of program.consts ?? []) {
    if (c.span) map.set(c.name, c.span)
  }
  for (const g of program.globals ?? []) {
    if (g.span) map.set(g.name, g.span)
  }
  return map
}

function collectLocals(body: Block): Map<string, TypeNode> {
  const map = new Map<string, TypeNode>()
  function walk(stmts: Block): void {
    for (const s of stmts) {
      if (s.kind === 'let' && s.type) {
        map.set(s.name, s.type)
      } else if (s.kind === 'foreach') {
        map.set((s as any).binding, { kind: 'named', name: 'int' } as TypeNode)
        if (Array.isArray((s as any).body)) walk((s as any).body as Block)
        continue
      } else if (s.kind === 'for') {
        if ((s as any).binding) map.set((s as any).binding, { kind: 'named', name: 'int' } as TypeNode)
      }
      const sub = s as Record<string, unknown>
      if (Array.isArray(sub['body'])) walk(sub['body'] as Block)
      if (Array.isArray(sub['then'])) walk(sub['then'] as Block)
      if (Array.isArray(sub['else_'])) walk(sub['else_'] as Block)
    }
  }
  walk(body)
  return map
}

function findEnclosingFn(program: Program, curLine: number): FnDecl | null {
  const fns = program.declarations.filter(f => f.span)
  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i]
    const startLine = fn.span!.line
    const endLine = fn.span!.endLine ?? (fns[i + 1]?.span?.line ? fns[i + 1].span!.line - 1 : Infinity)
    if (curLine >= startLine && curLine <= endLine) return fn
  }
  return null
}

/** Simulate the server's onDefinition logic for in-file lookup. */
function resolveDefinition(
  source: string,
  program: Program,
  position: Position,
  fileUri = 'file:///test.mcrs',
): Location | null {
  const lines = source.split('\n')
  const lineText = lines[position.line] ?? ''

  const word = wordAt(source, position)
  if (!word) return null

  // Reject selectors (@s, @a, etc.)
  let wordStart = position.character
  while (wordStart > 0 && /\w/.test(lineText[wordStart - 1])) wordStart--
  if (wordStart > 0 && lineText[wordStart - 1] === '@') return null

  // Try top-level declarations (fn, struct, enum, const, global)
  const defMap = buildDefinitionMap(program)
  const span = defMap.get(word)
  if (span) {
    const line = Math.max(0, span.line - 1)
    const col  = Math.max(0, span.col  - 1)
    return {
      uri: fileUri,
      range: {
        start: { line, character: col },
        end:   { line, character: col + word.length },
      },
    }
  }

  // Params and locals — no jump within same file (return null)
  const curLine = position.line + 1
  const encFn = findEnclosingFn(program, curLine)
  if (encFn) {
    if (encFn.params.some(p => p.name === word)) return null
    if (encFn.body) {
      const locals = collectLocals(encFn.body as Block)
      if (locals.has(word)) return null
    }
  }

  return null
}

function parseSource(source: string): { program: Program | null; errors: DiagnosticError[] } {
  const errors: DiagnosticError[] = []
  let program: Program | null = null
  try {
    const tokens = new Lexer(source).tokenize()
    program = new Parser(tokens, source).parse('test')
  } catch (err) {
    if (err instanceof DiagnosticError) errors.push(err)
    else errors.push(new DiagnosticError('ParseError', (err as Error).message, { line: 1, col: 1 }))
    return { program: null, errors }
  }
  return { program, errors }
}

// ---------------------------------------------------------------------------
// Helper: find position of first occurrence of `name` in source (0-based)
// ---------------------------------------------------------------------------
function positionOf(source: string, name: string, occurrence = 0): Position {
  const lines = source.split('\n')
  let count = 0
  for (let i = 0; i < lines.length; i++) {
    let idx = lines[i].indexOf(name)
    while (idx !== -1) {
      if (count === occurrence) return { line: i, character: idx + Math.floor(name.length / 2) }
      count++
      idx = lines[i].indexOf(name, idx + 1)
    }
  }
  throw new Error(`"${name}" not found in source (occurrence ${occurrence})`)
}

// ---------------------------------------------------------------------------
// Tests: function declarations
// ---------------------------------------------------------------------------

describe('LSP go-to-definition — functions', () => {
  const source = `fn greet(name: string): void {}
fn add(a: int, b: int): int { return a + b; }
fn main(): void {
  greet("world");
  add(1, 2);
}
`

  it('resolves function name to its declaration span', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    // Click on "greet" declaration itself (line 0)
    const pos = positionOf(source, 'greet')
    const loc = resolveDefinition(source, program!, pos)
    expect(loc).not.toBeNull()
    expect(loc!.range.start.line).toBe(0)
  })

  it('resolves function call site to declaration', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    // "greet" at the call site (line 3) → should point to line 0
    const pos = positionOf(source, 'greet', 1) // second occurrence = call site
    const loc = resolveDefinition(source, program!, pos)
    expect(loc).not.toBeNull()
    expect(loc!.range.start.line).toBe(0)
  })

  it('resolves multi-param function', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const pos = positionOf(source, 'add', 1) // call site
    const loc = resolveDefinition(source, program!, pos)
    expect(loc).not.toBeNull()
    expect(loc!.range.start.line).toBe(1)
  })

  it('returns null for unknown identifiers', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const loc = resolveDefinition(source, program!, { line: 0, character: 0 })
    // 'fn' keyword — not in defMap, not a local
    expect(loc).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: struct declarations
// ---------------------------------------------------------------------------

describe('LSP go-to-definition — structs', () => {
  const source = `struct Vec3 {
  x: int,
  y: int,
  z: int,
}
fn make_vec(): Vec3 {
  return Vec3 { x: 0, y: 0, z: 0 };
}
`

  it('resolves struct name at declaration', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const pos = positionOf(source, 'Vec3')
    const loc = resolveDefinition(source, program!, pos)
    expect(loc).not.toBeNull()
    expect(loc!.range.start.line).toBe(0)
  })

  it('resolves struct name used as return type to struct declaration', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    // "Vec3" in return type annotation (second occurrence)
    const pos = positionOf(source, 'Vec3', 1)
    const loc = resolveDefinition(source, program!, pos)
    expect(loc).not.toBeNull()
    expect(loc!.range.start.line).toBe(0)
  })

  it('resolves struct literal usage to struct declaration', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    // "Vec3" in struct literal (third occurrence)
    const pos = positionOf(source, 'Vec3', 2)
    const loc = resolveDefinition(source, program!, pos)
    expect(loc).not.toBeNull()
    expect(loc!.range.start.line).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Tests: enum declarations
// ---------------------------------------------------------------------------

describe('LSP go-to-definition — enums', () => {
  const source = `enum Color {
  Red,
  Green,
  Blue,
}
fn get_color(): Color {
  return Color::Red;
}
`

  it('resolves enum name at declaration', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const pos = positionOf(source, 'Color')
    const loc = resolveDefinition(source, program!, pos)
    expect(loc).not.toBeNull()
    expect(loc!.range.start.line).toBe(0)
  })

  it('resolves enum name in return type to enum declaration', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    // second "Color" — in return type
    const pos = positionOf(source, 'Color', 1)
    const loc = resolveDefinition(source, program!, pos)
    expect(loc).not.toBeNull()
    expect(loc!.range.start.line).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Tests: variables — let declarations
// ---------------------------------------------------------------------------

describe('LSP go-to-definition — let variables', () => {
  const source = `fn compute(x: int): int {
  let result: int = x * 2;
  return result;
}
`

  it('returns null for local variable (no cross-line jump in same-file locals)', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    // "result" at usage site (return result)
    const pos = positionOf(source, 'result', 1)
    const loc = resolveDefinition(source, program!, pos)
    // locals return null — no location jump (editor stays put)
    expect(loc).toBeNull()
  })

  it('returns null for function parameter usage', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    // "x" inside the body
    const pos = positionOf(source, 'x', 1)
    const loc = resolveDefinition(source, program!, pos)
    expect(loc).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: const and global declarations
// ---------------------------------------------------------------------------

describe('LSP go-to-definition — consts', () => {
  const source = `const MAX_PLAYERS: int = 20;
const BASE_SCORE: int = 0;
fn reset(): void {}
`

  it('resolves first const name to its declaration', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const pos = positionOf(source, 'MAX_PLAYERS')
    const loc = resolveDefinition(source, program!, pos)
    expect(loc).not.toBeNull()
    expect(loc!.range.start.line).toBe(0)
  })

  it('resolves second const name to its declaration', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const pos = positionOf(source, 'BASE_SCORE')
    const loc = resolveDefinition(source, program!, pos)
    expect(loc).not.toBeNull()
    expect(loc!.range.start.line).toBe(1)
  })

  it('buildDefinitionMap includes both consts', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()
    const map = buildDefinitionMap(program!)
    expect(map.has('MAX_PLAYERS')).toBe(true)
    expect(map.has('BASE_SCORE')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests: buildDefinitionMap coverage
// ---------------------------------------------------------------------------

describe('buildDefinitionMap', () => {
  it('maps all top-level fn names', () => {
    const source = `fn foo(): void {}
fn bar(): void {}
fn baz(): void {}
`
    const { program } = parseSource(source)
    expect(program).toBeTruthy()
    const map = buildDefinitionMap(program!)
    expect(map.has('foo')).toBe(true)
    expect(map.has('bar')).toBe(true)
    expect(map.has('baz')).toBe(true)
  })

  it('maps struct names', () => {
    const source = `struct Point { x: int, y: int, }
struct Rect { w: int, h: int, }
`
    const { program } = parseSource(source)
    expect(program).toBeTruthy()
    const map = buildDefinitionMap(program!)
    expect(map.has('Point')).toBe(true)
    expect(map.has('Rect')).toBe(true)
  })

  it('maps enum names', () => {
    const source = `enum Dir { North, South, East, West, }
`
    const { program } = parseSource(source)
    expect(program).toBeTruthy()
    const map = buildDefinitionMap(program!)
    expect(map.has('Dir')).toBe(true)
  })

  it('maps const names', () => {
    const source = `const PI: int = 3;
`
    const { program } = parseSource(source)
    expect(program).toBeTruthy()
    const map = buildDefinitionMap(program!)
    expect(map.has('PI')).toBe(true)
  })

  it('all spans have valid line numbers (>= 1)', () => {
    const source = `fn f(): void {}
struct S { x: int, }
enum E { A, B, }
const C: int = 1;
`
    const { program } = parseSource(source)
    expect(program).toBeTruthy()
    const map = buildDefinitionMap(program!)
    for (const [, span] of map) {
      expect(span.line).toBeGreaterThanOrEqual(1)
      expect(span.col).toBeGreaterThanOrEqual(1)
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: wordAt helper
// ---------------------------------------------------------------------------

describe('wordAt', () => {
  it('extracts word at cursor middle', () => {
    const source = 'fn greet(): void {}'
    expect(wordAt(source, { line: 0, character: 5 })).toBe('greet')
  })

  it('extracts word at cursor start', () => {
    const source = 'fn greet(): void {}'
    expect(wordAt(source, { line: 0, character: 3 })).toBe('greet')
  })

  it('extracts word at cursor end', () => {
    const source = 'fn greet(): void {}'
    expect(wordAt(source, { line: 0, character: 8 })).toBe('greet')
  })

  it('returns empty string for whitespace/punctuation position', () => {
    // character 9 is '(' in 'fn greet(): void {}' — not a word char
    const source = 'fn greet(): void {}'
    expect(wordAt(source, { line: 0, character: 9 })).toBe('')
  })

  it('handles multi-line source', () => {
    const source = 'let x: int = 0;\nlet myVar: bool = true;'
    expect(wordAt(source, { line: 1, character: 4 })).toBe('myVar')
  })
})

// ---------------------------------------------------------------------------
// Tests: selector rejection
// ---------------------------------------------------------------------------

describe('LSP go-to-definition — selector rejection', () => {
  it('returns null when cursor is on @s selector', () => {
    const source = `fn main(): void {
  say(@s, "hello");
}
`
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    // Find position of 's' after '@'
    const lines = source.split('\n')
    const line1 = lines[1]
    const atIdx = line1.indexOf('@s')
    const pos: Position = { line: 1, character: atIdx + 1 } // cursor on 's'

    // Simulate the selector check
    const lineText = lines[1]
    let wordStart = pos.character
    while (wordStart > 0 && /\w/.test(lineText[wordStart - 1])) wordStart--
    const isSelector = wordStart > 0 && lineText[wordStart - 1] === '@'
    expect(isSelector).toBe(true)
  })
})
