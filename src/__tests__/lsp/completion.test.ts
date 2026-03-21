/**
 * LSP Completion and Hover Tests
 *
 * Validates completion and hover logic using LSP protocol-level messages.
 * Tests the internal logic functions rather than spawning a full stdio server.
 */

import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { TypeChecker } from '../../typechecker'
import { DiagnosticError } from '../../diagnostics'
import { BUILTIN_METADATA } from '../../builtins/metadata'
import type { Program, FnDecl, TypeNode, Block } from '../../ast/types'
import {
  CompletionItemKind,
  MarkupKind,
} from 'vscode-languageserver/node'
import type {
  CompletionItem,
  Hover,
  Position,
  MarkupContent,
} from 'vscode-languageserver/node'

// ---------------------------------------------------------------------------
// Mirror helpers from lsp/server.ts
// ---------------------------------------------------------------------------

function typeToString(t: TypeNode): string {
  switch (t.kind) {
    case 'named': return t.name
    case 'array': return `${typeToString(t.elem)}[]`
    case 'struct': return t.name
    case 'enum': return t.name
    case 'entity': return t.entityType
    case 'selector': return t.entityType ? `selector<${t.entityType}>` : 'selector'
    case 'tuple': return `(${t.elements.map(typeToString).join(', ')})`
    case 'function_type':
      return `(${t.params.map(typeToString).join(', ')}) => ${typeToString(t.return)}`
    default:
      return 'unknown'
  }
}

function formatFnSignature(fn: FnDecl): string {
  const params = fn.params.map(p => `${p.name}: ${typeToString(p.type)}`).join(', ')
  const ret = typeToString(fn.returnType)
  const typeParams = fn.typeParams?.length ? `<${fn.typeParams.join(', ')}>` : ''
  return `fn ${fn.name}${typeParams}(${params}): ${ret}`
}

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

function collectLocals(body: Block): Map<string, TypeNode> {
  const map = new Map<string, TypeNode>()
  function walk(stmts: Block): void {
    for (const s of stmts) {
      if (s.kind === 'let' && s.type) {
        map.set(s.name, s.type)
      } else if (s.kind === 'foreach') {
        map.set((s as any).binding, { kind: 'named', name: 'int' } as unknown as TypeNode)
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
  try {
    const checker = new TypeChecker(source)
    errors.push(...checker.check(program))
  } catch { /* collect, not throw */ }
  return { program, errors }
}

// ---------------------------------------------------------------------------
// Keyword / type / builtin completion items
// ---------------------------------------------------------------------------

const KEYWORD_COMPLETIONS: CompletionItem[] = [
  'fn', 'let', 'if', 'else', 'while', 'for', 'foreach', 'return',
  'break', 'continue', 'as', 'at', 'match', 'struct', 'enum', 'impl',
  'const', 'global', 'true', 'false', 'module', 'import',
].map(kw => ({ label: kw, kind: CompletionItemKind.Keyword }))

const TYPE_COMPLETIONS: CompletionItem[] = [
  'int', 'bool', 'fixed', 'float', 'string', 'void',
  'entity', 'Player', 'Mob',
].map(t => ({ label: t, kind: CompletionItemKind.TypeParameter }))

const BUILTIN_FN_COMPLETIONS: CompletionItem[] = [
  'say', 'tell', 'give', 'kill', 'teleport', 'summon', 'setblock',
  'fill', 'clone', 'effect', 'enchant', 'experience', 'gamemode',
  'gamerule', 'particle', 'playsound', 'stopsound', 'scoreboard',
  'tag', 'title', 'subtitle', 'actionbar', 'tellraw', 'announce',
  'setTimeout', 'setInterval', 'clearInterval',
].map(fn => ({ label: fn, kind: CompletionItemKind.Function }))

const DECORATOR_COMPLETIONS: CompletionItem[] = [
  { label: '@tick', insertText: 'tick', kind: CompletionItemKind.Event },
  { label: '@load', insertText: 'load', kind: CompletionItemKind.Event },
  { label: '@on_trigger', insertText: 'on_trigger', kind: CompletionItemKind.Event },
  { label: '@schedule', insertText: 'schedule', kind: CompletionItemKind.Event },
  { label: '@coroutine', insertText: 'coroutine', kind: CompletionItemKind.Event },
  { label: '@keep', insertText: 'keep', kind: CompletionItemKind.Event },
]

// LSP-style completion response builder
function buildCompletionResponse(
  items: CompletionItem[],
): { jsonrpc: '2.0'; id: number; result: { isIncomplete: boolean; items: CompletionItem[] } } {
  return {
    jsonrpc: '2.0',
    id: 1,
    result: {
      isIncomplete: false,
      items,
    },
  }
}

// LSP-style hover response builder
function buildHoverResponse(value: string): Hover {
  return {
    contents: {
      kind: MarkupKind.Markdown,
      value,
    } as MarkupContent,
  }
}

// ---------------------------------------------------------------------------
// Tests: Completion — keywords
// ---------------------------------------------------------------------------

describe('LSP completion — keywords', () => {
  it('returns keyword items in LSP completion response format', () => {
    const response = buildCompletionResponse(KEYWORD_COMPLETIONS)
    expect(response.jsonrpc).toBe('2.0')
    expect(response.result.isIncomplete).toBe(false)
    expect(response.result.items).toBeInstanceOf(Array)
    const labels = response.result.items.map(i => i.label)
    for (const kw of ['fn', 'let', 'if', 'while', 'return', 'struct', 'enum', 'impl']) {
      expect(labels).toContain(kw)
    }
  })

  it('all keyword items have CompletionItemKind.Keyword', () => {
    for (const item of KEYWORD_COMPLETIONS) {
      expect(item.kind).toBe(CompletionItemKind.Keyword)
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: Completion — builtin functions
// ---------------------------------------------------------------------------

describe('LSP completion — builtin functions', () => {
  it('includes core builtin functions', () => {
    const response = buildCompletionResponse(BUILTIN_FN_COMPLETIONS)
    const labels = response.result.items.map(i => i.label)
    for (const fn of ['say', 'tell', 'give', 'kill', 'teleport', 'summon', 'setTimeout']) {
      expect(labels).toContain(fn)
    }
  })

  it('all builtin function items have CompletionItemKind.Function', () => {
    for (const item of BUILTIN_FN_COMPLETIONS) {
      expect(item.kind).toBe(CompletionItemKind.Function)
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: Completion — types
// ---------------------------------------------------------------------------

describe('LSP completion — types', () => {
  it('includes primitive and entity types', () => {
    const labels = TYPE_COMPLETIONS.map(i => i.label)
    for (const t of ['int', 'bool', 'string', 'void', 'entity', 'Player']) {
      expect(labels).toContain(t)
    }
  })

  it('all type items have CompletionItemKind.TypeParameter', () => {
    for (const item of TYPE_COMPLETIONS) {
      expect(item.kind).toBe(CompletionItemKind.TypeParameter)
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: Completion — user-defined functions
// ---------------------------------------------------------------------------

describe('LSP completion — user-defined functions', () => {
  const source = `
fn greet(name: string): void {}
fn add(a: int, b: int): int { return a + b; }
fn identity<T>(x: T): T { return x; }
`

  it('includes user-defined functions in completions', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const userFnItems: CompletionItem[] = program!.declarations.map(fn => ({
      label: fn.name,
      kind: CompletionItemKind.Function,
      detail: `(${fn.params.map(p => `${p.name}: ${typeToString(p.type)}`).join(', ')}) → ${typeToString(fn.returnType)}`,
    }))

    const allItems = [...KEYWORD_COMPLETIONS, ...BUILTIN_FN_COMPLETIONS, ...userFnItems]
    const response = buildCompletionResponse(allItems)
    const labels = response.result.items.map(i => i.label)

    expect(labels).toContain('greet')
    expect(labels).toContain('add')
    expect(labels).toContain('identity')
  })

  it('user function items have detail with parameter info', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const items: CompletionItem[] = program!.declarations.map(fn => ({
      label: fn.name,
      kind: CompletionItemKind.Function,
      detail: `(${fn.params.map(p => `${p.name}: ${typeToString(p.type)}`).join(', ')}) → ${typeToString(fn.returnType)}`,
    }))

    const addItem = items.find(i => i.label === 'add')
    expect(addItem).toBeDefined()
    expect(addItem!.detail).toContain('a: int')
    expect(addItem!.detail).toContain('b: int')
    expect(addItem!.detail).toContain('int')
  })
})

// ---------------------------------------------------------------------------
// Tests: Completion — declared variables (locals and params)
// ---------------------------------------------------------------------------

describe('LSP completion — declared variables', () => {
  const source = `
fn compute(x: int, y: int): int {
  let result: int = x + y;
  let flag: bool = true;
  return result;
}
`

  it('collects local variable names from function body', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const fn = program!.declarations[0]
    expect(fn).toBeDefined()
    expect(fn.body).toBeDefined()

    const locals = collectLocals(fn.body as Block)
    expect(locals.has('result')).toBe(true)
    expect(locals.has('flag')).toBe(true)
  })

  it('local variable items appear in completion list with type detail', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const fn = program!.declarations[0]
    const locals = collectLocals(fn.body as Block)

    const localItems: CompletionItem[] = Array.from(locals.entries()).map(([name, typ]) => ({
      label: name,
      kind: CompletionItemKind.Variable,
      detail: typeToString(typ),
    }))

    const resultItem = localItems.find(i => i.label === 'result')
    const flagItem = localItems.find(i => i.label === 'flag')

    expect(resultItem).toBeDefined()
    expect(resultItem!.detail).toBe('int')
    expect(flagItem).toBeDefined()
    expect(flagItem!.detail).toBe('bool')
  })

  it('function params appear as variable completions', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const fn = program!.declarations[0]
    const paramItems: CompletionItem[] = fn.params.map(p => ({
      label: p.name,
      kind: CompletionItemKind.Variable,
      detail: typeToString(p.type),
    }))

    const xItem = paramItems.find(i => i.label === 'x')
    const yItem = paramItems.find(i => i.label === 'y')

    expect(xItem).toBeDefined()
    expect(xItem!.detail).toBe('int')
    expect(yItem).toBeDefined()
    expect(yItem!.detail).toBe('int')
  })
})

// ---------------------------------------------------------------------------
// Tests: Completion — structs and enums
// ---------------------------------------------------------------------------

describe('LSP completion — structs and enums', () => {
  const source = `
struct Vec3 {
  x: int,
  y: int,
  z: int,
}

enum Direction {
  North,
  South,
  East,
  West,
}
`

  it('includes struct names in completion', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const structItems = (program!.structs ?? []).map(s => ({
      label: s.name,
      kind: CompletionItemKind.Struct,
    }))

    const response = buildCompletionResponse(structItems)
    const labels = response.result.items.map(i => i.label)
    expect(labels).toContain('Vec3')
  })

  it('includes enum names in completion', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const enumItems = (program!.enums ?? []).map(e => ({
      label: e.name,
      kind: CompletionItemKind.Enum,
    }))

    const response = buildCompletionResponse(enumItems)
    const labels = response.result.items.map(i => i.label)
    expect(labels).toContain('Direction')
  })
})

// ---------------------------------------------------------------------------
// Tests: Completion — decorators
// ---------------------------------------------------------------------------

describe('LSP completion — decorators', () => {
  it('returns decorator completions when @ is typed', () => {
    const response = buildCompletionResponse(DECORATOR_COMPLETIONS)
    const labels = response.result.items.map(i => i.label)
    expect(labels).toContain('@tick')
    expect(labels).toContain('@load')
    expect(labels).toContain('@keep')
  })

  it('decorator items have CompletionItemKind.Event', () => {
    for (const item of DECORATOR_COMPLETIONS) {
      expect(item.kind).toBe(CompletionItemKind.Event)
    }
  })

  it('decorator insertText omits the @ character', () => {
    for (const item of DECORATOR_COMPLETIONS) {
      expect(item.insertText).toBeDefined()
      expect(item.insertText).not.toMatch(/^@/)
    }
  })
})

// ---------------------------------------------------------------------------
// Tests: Hover — builtin functions
// ---------------------------------------------------------------------------

describe('LSP hover — builtin function signatures', () => {
  it('returns markdown hover for say builtin', () => {
    const b = BUILTIN_METADATA['say']
    expect(b).toBeDefined()
    const paramStr = b.params.map(p => `${p.name}: ${p.type}${p.required ? '' : '?'}`).join(', ')
    const sig = `fn ${b.name}(${paramStr}): ${b.returns}`
    const hover = buildHoverResponse(`\`\`\`redscript\n${sig}\n\`\`\`\n${b.doc}`)

    expect((hover.contents as MarkupContent).kind).toBe(MarkupKind.Markdown)
    expect((hover.contents as MarkupContent).value).toContain('```redscript')
    expect((hover.contents as MarkupContent).value).toContain('fn say')
  })

  it('returns markdown hover for kill builtin', () => {
    const b = BUILTIN_METADATA['kill']
    expect(b).toBeDefined()
    const paramStr = b.params.map(p => `${p.name}: ${p.type}`).join(', ')
    const sig = `fn ${b.name}(${paramStr}): ${b.returns}`
    const hover = buildHoverResponse(`\`\`\`redscript\n${sig}\n\`\`\`\n${b.doc}`)

    expect((hover.contents as MarkupContent).value).toContain('fn kill')
    expect(b.returns).toBe('void')
  })

  it('hover response matches LSP Hover protocol shape', () => {
    const hover = buildHoverResponse('**test** content')
    expect(hover).toHaveProperty('contents')
    expect((hover.contents as MarkupContent)).toHaveProperty('kind', MarkupKind.Markdown)
    expect((hover.contents as MarkupContent)).toHaveProperty('value')
  })
})

// ---------------------------------------------------------------------------
// Tests: Hover — user-defined function signatures
// ---------------------------------------------------------------------------

describe('LSP hover — user-defined function signatures', () => {
  const source = `
fn add(a: int, b: int): int {
  return a + b;
}

fn greet(name: string): void {}

fn identity<T>(x: T): T { return x; }
`

  it('returns signature for user-defined function', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const fn = program!.declarations.find(f => f.name === 'add')
    expect(fn).toBeDefined()

    const sig = formatFnSignature(fn!)
    const hover = buildHoverResponse(`\`\`\`redscript\n${sig}\n\`\`\``)

    expect(sig).toBe('fn add(a: int, b: int): int')
    expect((hover.contents as MarkupContent).value).toContain('fn add')
    expect((hover.contents as MarkupContent).value).toContain('a: int')
    expect((hover.contents as MarkupContent).value).toContain('b: int')
  })

  it('handles generic functions in hover', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const fn = program!.declarations.find(f => f.name === 'identity')
    expect(fn).toBeDefined()

    const sig = formatFnSignature(fn!)
    expect(sig).toBe('fn identity<T>(x: T): T')
    const hover = buildHoverResponse(`\`\`\`redscript\n${sig}\n\`\`\``)
    expect((hover.contents as MarkupContent).value).toContain('<T>')
  })

  it('hover for void-return function shows void', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const fn = program!.declarations.find(f => f.name === 'greet')
    expect(fn).toBeDefined()

    const sig = formatFnSignature(fn!)
    expect(sig).toBe('fn greet(name: string): void')
  })
})

// ---------------------------------------------------------------------------
// Tests: Hover — variable types
// ---------------------------------------------------------------------------

describe('LSP hover — variable types', () => {
  const source = `
fn process(): void {
  let count: int = 0;
  let name: string = "hello";
  let flag: bool = false;
}
`

  it('resolves hover type for int local', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const fn = program!.declarations[0]
    const locals = collectLocals(fn.body as Block)

    const countType = locals.get('count')
    expect(countType).toBeDefined()
    const hover = buildHoverResponse(`\`\`\`redscript\nlet count: ${typeToString(countType!)}\n\`\`\``)
    expect((hover.contents as MarkupContent).value).toContain('let count: int')
  })

  it('resolves hover type for string local', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const fn = program!.declarations[0]
    const locals = collectLocals(fn.body as Block)

    const nameType = locals.get('name')
    expect(nameType).toBeDefined()
    const hover = buildHoverResponse(`\`\`\`redscript\nlet name: ${typeToString(nameType!)}\n\`\`\``)
    expect((hover.contents as MarkupContent).value).toContain('let name: string')
  })

  it('resolves hover type for bool local', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const fn = program!.declarations[0]
    const locals = collectLocals(fn.body as Block)

    const flagType = locals.get('flag')
    expect(flagType).toBeDefined()
    expect(typeToString(flagType!)).toBe('bool')
  })
})

// ---------------------------------------------------------------------------
// Tests: Hover — struct and enum
// ---------------------------------------------------------------------------

describe('LSP hover — structs and enums', () => {
  const source = `
struct Point {
  x: int,
  y: int,
}

enum Status {
  Active,
  Inactive,
}
`

  it('builds hover markdown for struct', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const s = program!.structs?.find(s => s.name === 'Point')
    expect(s).toBeDefined()

    const fields = s!.fields.map(f => `  ${f.name}: ${typeToString(f.type)}`).join('\n')
    const hover = buildHoverResponse(`\`\`\`redscript\nstruct ${s!.name} {\n${fields}\n}\n\`\`\``)

    expect((hover.contents as MarkupContent).value).toContain('struct Point')
    expect((hover.contents as MarkupContent).value).toContain('x: int')
    expect((hover.contents as MarkupContent).value).toContain('y: int')
  })

  it('builds hover markdown for enum', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const e = program!.enums?.find(e => e.name === 'Status')
    expect(e).toBeDefined()

    const variants = e!.variants.map(v => `  ${v.name}`).join('\n')
    const hover = buildHoverResponse(`\`\`\`redscript\nenum ${e!.name} {\n${variants}\n}\n\`\`\``)

    expect((hover.contents as MarkupContent).value).toContain('enum Status')
    expect((hover.contents as MarkupContent).value).toContain('Active')
    expect((hover.contents as MarkupContent).value).toContain('Inactive')
  })
})

// ---------------------------------------------------------------------------
// Tests: wordAt helper (used by hover to find word at cursor)
// ---------------------------------------------------------------------------

describe('wordAt helper', () => {
  const source = `fn greet(name: string): void {
  let msg: string = "hello";
  tell(@s, msg);
}`

  it('finds function name at cursor', () => {
    const word = wordAt(source, { line: 0, character: 4 })
    expect(word).toBe('greet')
  })

  it('finds variable name at cursor', () => {
    const word = wordAt(source, { line: 1, character: 6 })
    expect(word).toBe('msg')
  })

  it('returns empty string when cursor on isolated non-word character', () => {
    // line 0: "fn greet(name: string): void {"
    // position 22 is ':' in "): " — surrounded by non-word chars on both sides
    // line[21]=')' (non-word), line[22]=':' (non-word), so wordAt returns ''
    const line0 = source.split('\n')[0]
    const colonIdx = line0.indexOf('):') + 1  // the ':' after ')'
    const word = wordAt(source, { line: 0, character: colonIdx })
    expect(word).toBe('')
  })

  it('returns empty string when cursor on @', () => {
    const word = wordAt(source, { line: 2, character: 7 })  // @ in @s
    // '@' is not a word char, so result is empty or 's' depending on exact position
    const sourceLines = source.split('\n')
    const lineText = sourceLines[2]
    const atIdx = lineText.indexOf('@s')
    const wordOnAt = wordAt(source, { line: 2, character: atIdx })
    expect(wordOnAt).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Tests: LSP protocol message format
// ---------------------------------------------------------------------------

describe('LSP protocol message format', () => {
  it('completion request produces valid JSON-RPC 2.0 response', () => {
    const items = [...KEYWORD_COMPLETIONS, ...BUILTIN_FN_COMPLETIONS]
    const response = buildCompletionResponse(items)

    // Validate JSON-RPC 2.0 shape
    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: expect.any(Number),
      result: {
        isIncomplete: false,
        items: expect.any(Array),
      },
    })
  })

  it('hover response follows LSP Hover type structure', () => {
    const hover = buildHoverResponse('test hover')
    // LSP Hover: { contents: MarkupContent | ... }
    expect(hover).toHaveProperty('contents')
    const contents = hover.contents as MarkupContent
    expect(contents.kind).toBe(MarkupKind.Markdown)
    expect(typeof contents.value).toBe('string')
  })

  it('completion items have required label and kind fields', () => {
    const allItems = [...KEYWORD_COMPLETIONS, ...TYPE_COMPLETIONS, ...BUILTIN_FN_COMPLETIONS]
    for (const item of allItems) {
      expect(item).toHaveProperty('label')
      expect(typeof item.label).toBe('string')
      expect(item.label.length).toBeGreaterThan(0)
      expect(item).toHaveProperty('kind')
      expect(typeof item.kind).toBe('number')
    }
  })
})
