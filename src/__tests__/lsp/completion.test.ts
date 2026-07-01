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
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { pathToFileURL } from 'url'
import { BUILTIN_METADATA } from '../../builtins/metadata'
import {
  getResourceCompletions,
  getResourceDiagnosticHints,
  getResourceHover,
  BUILTIN_RESOURCE_REGISTRY,
} from '../../lsp/resource-completions'
import { getImportedFunctions, getImportedPrograms } from '../../lsp/import-resolver'
import { getObjectiveHover } from '../../lsp/objective-hover'
import { getBuiltinHover } from '../../lsp/builtin-hover'
import { getDecoratorHover } from '../../lsp/decorator-hover'
import { getSelectorTokenHover, getSelectorTypeResourceHover } from '../../lsp/selector-hover'
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

function formatDeclaredFnSignature(fn: FnDecl): string {
  return `declare fn ${fn.name}${fn.typeParams?.length ? `<${fn.typeParams.join(', ')}>` : ''}(${fn.params.map(
    p => `${p.name}: ${typeToString(p.type)}`,
  ).join(', ')}): ${typeToString(fn.returnType)}`
}

function importedFunctionItems(source: string, program: Program, uri: string): CompletionItem[] {
  const importedPrograms = getImportedPrograms(source, uri, program)
  const seen = new Set<string>()
  const items: CompletionItem[] = []

  for (const imported of importedPrograms) {
    for (const fn of getImportedFunctions(imported)) {
      if (seen.has(fn.name)) continue
      seen.add(fn.name)
      items.push({
        label: fn.name,
        kind: CompletionItemKind.Function,
        detail: fn.isDeclareOnly
          ? formatDeclaredFnSignature(fn)
          : `(${fn.params.map(p => `${p.name}: ${typeToString(p.type)}`).join(', ')}) → ${typeToString(fn.returnType)}`,
      })
    }
  }

  return items
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
  { label: '@function_tag', insertText: 'function_tag', kind: CompletionItemKind.Event },
  { label: '@on', insertText: 'on', kind: CompletionItemKind.Event },
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
declare fn ext(x: int): int;
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

  it('includes same-file declare fn in completion', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const userFnItems: CompletionItem[] = [
      ...program!.declarations.map(fn => ({
        label: fn.name,
        kind: CompletionItemKind.Function,
      })),
      ...(program!.declaredFunctions ?? []).map(fn => ({
        label: fn.name,
        kind: CompletionItemKind.Function,
        detail: formatDeclaredFnSignature(fn),
      })),
    ]

    const labels = userFnItems.map(i => i.label)
    expect(labels).toContain('ext')
    expect(labels.filter(label => label.startsWith('e'))).toContain('ext')
  })

  it('declared fn completion item includes declare signature detail', () => {
    const { program } = parseSource(source)
    expect(program).toBeTruthy()

    const declaredItems: CompletionItem[] = (program!.declaredFunctions ?? []).map(fn => ({
      label: fn.name,
      kind: CompletionItemKind.Function,
      detail: formatDeclaredFnSignature(fn),
    }))

    const extItem = declaredItems.find(i => i.label === 'ext')
    expect(extItem).toBeDefined()
    expect(extItem!.detail).toBe('declare fn ext(x: int): int')
  })

  it('deduplicates fn and declare fn with same name and prefers executable detail', () => {
    const sourceWithDuplicate = `
fn ext(x: int): int { return x; }
declare fn ext(x: int): int;
`
    const { program } = parseSource(sourceWithDuplicate)
    expect(program).toBeTruthy()

    const declaredNames = new Set(program!.declarations.map(fn => fn.name))
    const items: CompletionItem[] = [
      ...program!.declarations.map(fn => ({
        label: fn.name,
        kind: CompletionItemKind.Function,
        detail: formatFnSignature(fn),
      })),
      ...(program!.declaredFunctions ?? [])
        .filter(fn => !declaredNames.has(fn.name))
        .map(fn => ({
          label: fn.name,
          kind: CompletionItemKind.Function,
          detail: formatDeclaredFnSignature(fn),
        })),
    ]

    const extItems = items.filter(item => item.label === 'ext')
    expect(extItems).toHaveLength(1)
    expect(extItems[0]).toBeDefined()
    expect(extItems[0]!.detail).toBe('fn ext(x: int): int')
    expect(extItems[0]!.detail).not.toContain('declare fn')
  })

  it('includes imported declaration from import api::ext in completion', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-lsp-completion-import-symbol-'))
    const apiFile = path.join(tmpDir, 'api.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')
    const mainSource = [
      'import api::ext;',
      'fn main(): int {',
      '  return ext(1, 2);',
      '}',
    ].join('\n')

    fs.writeFileSync(apiFile, 'module api;\ndeclare fn ext(x: int, y: int): int;\n')
    fs.writeFileSync(mainFile, mainSource)

    try {
      const { program } = parseSource(mainSource)
      const importedItems = importedFunctionItems(mainSource, program!, pathToFileURL(mainFile).toString())
      const extItem = importedItems.find(i => i.label === 'ext')

      expect(extItem).toBeDefined()
      expect(extItem!.detail).toBe('declare fn ext(x: int, y: int): int')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('includes imported declarations from import api::* in completion', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-lsp-completion-import-wildcard-'))
    const apiFile = path.join(tmpDir, 'api.mcrs')
    const mainFile = path.join(tmpDir, 'main.mcrs')
    const mainSource = [
      'import api::*;',
      'fn main(): int {',
      '  return ext(1, 2);',
      '}',
    ].join('\n')

    fs.writeFileSync(apiFile, 'module api;\ndeclare fn ext(x: int, y: int): int;\ndeclare fn add(a: int, b: int): int;\n')
    fs.writeFileSync(mainFile, mainSource)

    try {
      const { program } = parseSource(mainSource)
      const importedItems = importedFunctionItems(mainSource, program!, pathToFileURL(mainFile).toString())
      const labels = importedItems.map(i => i.label)

      expect(labels).toContain('ext')
      expect(labels).toContain('add')
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('does not include declarations for unresolved symbol imports', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-lsp-completion-import-miss-'))
    const mainFile = path.join(tmpDir, 'main.mcrs')
    const mainSource = [
      'import missing_api::ext;',
      'fn main(): int {',
      '  return 1;',
      '}',
    ].join('\n')

    fs.writeFileSync(mainFile, mainSource)

    try {
      const { program } = parseSource(mainSource)
      const importedItems = importedFunctionItems(mainSource, program!, pathToFileURL(mainFile).toString())
      const labels = importedItems.map(i => i.label)

      expect(labels).not.toContain('ext')
      expect(importedItems).toHaveLength(0)
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
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
    expect(labels).toContain('@function_tag')
    expect(labels).toContain('@on')
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
// Tests: Completion — resource strings
// ---------------------------------------------------------------------------

describe('LSP completion — resource strings', () => {
  const labelsFor = (line: string, cursor: number): string[] =>
    getResourceCompletions(line, cursor).map(item => item.label as string)

  it('completes particle IDs in particle("...")', () => {
    const line = 'particle("f'
    const cursor = line.indexOf('"') + 1
    const labels = labelsFor(line, cursor)
    expect(labels).toEqual(BUILTIN_RESOURCE_REGISTRY.particles)
    expect(labels).toHaveLength(BUILTIN_RESOURCE_REGISTRY.particles.length)
  })

  it('completes effects in effect(target, "...")', () => {
    const line = 'effect(@s, "s'
    const cursor = line.indexOf('"') + 1
    const labels = labelsFor(line, cursor)
    expect(labels).toEqual(BUILTIN_RESOURCE_REGISTRY.effects)
    expect(labels).toHaveLength(BUILTIN_RESOURCE_REGISTRY.effects.length)
  })

  it('completes effects in effect_clear(target, "...")', () => {
    const line = 'effect_clear(@a, "s'
    const cursor = line.indexOf('"') + 1
    const labels = labelsFor(line, cursor)
    expect(labels).toEqual(BUILTIN_RESOURCE_REGISTRY.effects)
    expect(labels).toHaveLength(BUILTIN_RESOURCE_REGISTRY.effects.length)
  })

  it('completes sounds in playsound("...")', () => {
    const line = 'playsound("e'
    const cursor = line.indexOf('"') + 1
    const labels = labelsFor(line, cursor)
    expect(labels).toEqual(BUILTIN_RESOURCE_REGISTRY.sounds)
    expect(labels).toHaveLength(BUILTIN_RESOURCE_REGISTRY.sounds.length)
  })

  it('completes items in give(target, "...")', () => {
    const line = 'give(@a, "d'
    const cursor = line.indexOf('"') + 1
    const labels = labelsFor(line, cursor)
    expect(labels).toEqual(BUILTIN_RESOURCE_REGISTRY.items)
    expect(labels).toHaveLength(BUILTIN_RESOURCE_REGISTRY.items.length)
  })

  it('completes items in clear(target, "...")', () => {
    const line = 'clear(@a, "i'
    const cursor = line.indexOf('"') + 1
    const labels = labelsFor(line, cursor)
    expect(labels).toEqual(BUILTIN_RESOURCE_REGISTRY.items)
    expect(labels).toHaveLength(BUILTIN_RESOURCE_REGISTRY.items.length)
  })

  it('completes blocks in setblock(pos, "...")', () => {
    const line = 'setblock(pos, "s'
    const cursor = line.indexOf('"') + 1
    const labels = labelsFor(line, cursor)
    expect(labels).toEqual(BUILTIN_RESOURCE_REGISTRY.blocks)
    expect(labels).toHaveLength(BUILTIN_RESOURCE_REGISTRY.blocks.length)
  })

  it('completes blocks in setblock((0, 64, 0), "...")', () => {
    const line = 'setblock((0, 64, 0), "s'
    const cursor = line.indexOf('"') + 1
    const labels = labelsFor(line, cursor)
    expect(labels).toEqual(BUILTIN_RESOURCE_REGISTRY.blocks)
    expect(labels).toHaveLength(BUILTIN_RESOURCE_REGISTRY.blocks.length)
  })

  it('completes blocks in fill(from, to, "...")', () => {
    const line = 'fill(from, to, "g'
    const cursor = line.indexOf('"') + 1
    const labels = labelsFor(line, cursor)
    expect(labels).toEqual(BUILTIN_RESOURCE_REGISTRY.blocks)
    expect(labels).toHaveLength(BUILTIN_RESOURCE_REGISTRY.blocks.length)
  })

  it('completes blocks in fill((0, 64, 0), (1, 64, 1), "...")', () => {
    const line = 'fill((0, 64, 0), (1, 64, 1), "g'
    const cursor = line.indexOf('"') + 1
    const labels = labelsFor(line, cursor)
    expect(labels).toEqual(BUILTIN_RESOURCE_REGISTRY.blocks)
    expect(labels).toHaveLength(BUILTIN_RESOURCE_REGISTRY.blocks.length)
  })

  it('completes entities in summon("...")', () => {
    const line = 'summon("m'
    const cursor = line.indexOf('"') + 1
    const labels = labelsFor(line, cursor)
    expect(labels).toEqual(BUILTIN_RESOURCE_REGISTRY.entities)
    expect(labels).toHaveLength(BUILTIN_RESOURCE_REGISTRY.entities.length)
  })

  it('completes entities for @e[type=...] selectors', () => {
    const line = 'let zombies = @e[type='
    const cursor = line.length
    const labels = labelsFor(line, cursor)
    expect(labels).toEqual(BUILTIN_RESOURCE_REGISTRY.entities)
    expect(labels).toHaveLength(BUILTIN_RESOURCE_REGISTRY.entities.length)
  })

  it('completes entities for selector type completion after a partially typed namespace prefix', () => {
    const line = 'let creepers = @e[type=minecraft:cr'
    const cursor = line.length
    const labels = labelsFor(line, cursor)

    expect(labels).toEqual(BUILTIN_RESOURCE_REGISTRY.entities)
    expect(labels).toHaveLength(BUILTIN_RESOURCE_REGISTRY.entities.length)
  })

  it('completes effects at unquoted resource positions in effect(@s, ...)', () => {
    const line = 'effect(@s, minecraft:'
    const cursor = line.length
    const labels = labelsFor(line, cursor)

    expect(labels).toEqual(BUILTIN_RESOURCE_REGISTRY.effects)
    expect(labels).toHaveLength(BUILTIN_RESOURCE_REGISTRY.effects.length)
  })

  it('does not offer selector entity completions inside ordinary strings', () => {
    const line = 'say("@e[type="'
    const cursor = line.indexOf('="') + 1
    const labels = labelsFor(line, cursor)
    expect(labels).toHaveLength(0)
  })

  it('does not offer resource completions at ordinary string start positions', () => {
    const line = 'say("'
    const cursor = line.length
    const labels = labelsFor(line, cursor)
    expect(labels).toHaveLength(0)
  })

  it('returns category-aware static/editor metadata for particle completion items', () => {
    const line = 'particle("f'
    const cursor = line.indexOf('"') + 1
    const items = getResourceCompletions(line, cursor)
    const label = BUILTIN_RESOURCE_REGISTRY.particles[0]
    const item = items.find(item => item.label === label)

    expect(item).toBeDefined()
    expect(item!.detail).toBe('resource<particle> (editor suggestion)')
    const documentation = item!.documentation as string
    expect(documentation).toContain('Static catalog suggestion')
    expect(documentation).toContain('resource<particle>')
    expect(documentation).toContain('Open registry')
    expect(documentation).not.toContain('Paper')
    expect(documentation).not.toContain('live')
  })

  it('returns category-aware static/editor metadata for effect completion items', () => {
    const line = 'effect(@s, "s'
    const cursor = line.indexOf('"') + 1
    const items = getResourceCompletions(line, cursor)
    const label = BUILTIN_RESOURCE_REGISTRY.effects[0]
    const item = items.find(item => item.label === label)

    expect(item).toBeDefined()
    expect(item!.detail).toBe('resource<effect> (editor suggestion)')
    const documentation = item!.documentation as string
    expect(documentation).toContain('Static catalog suggestion')
    expect(documentation).toContain('resource<effect>')
    expect(documentation).toContain('Open registry')
  })

  it('returns category-aware static/editor metadata for entity completion items', () => {
    const line = 'summon("m'
    const cursor = line.indexOf('"') + 1
    const items = getResourceCompletions(line, cursor)
    const label = BUILTIN_RESOURCE_REGISTRY.entities[0]
    const item = items.find(item => item.label === label)

    expect(item).toBeDefined()
    expect(item!.detail).toBe('resource<entity> (editor suggestion)')
    const documentation = item!.documentation as string
    expect(documentation).toContain('Static catalog suggestion')
    expect(documentation).toContain('resource<entity>')
    expect(documentation).toContain('Open registry')
  })

  it('does not offer resource completion for the wrong argument position', () => {
    const line = 'effect("s'
    const cursor = line.indexOf('"') + 1
    const labels = labelsFor(line, cursor)
    expect(labels).toHaveLength(0)
  })

  it('does not offer resource completion for non-registered string calls', () => {
    const line = 'say("h'
    const cursor = line.indexOf('"') + 1
    const labels = labelsFor(line, cursor)
    expect(labels).toHaveLength(0)
  })

  it('does not offer resource completion when not inside a string', () => {
    const line = 'effect(@s, speed'
    const cursor = line.indexOf('speed') + 1
    const labels = labelsFor(line, cursor)
    expect(labels).toHaveLength(0)
  })

  it('completes unquoted resource literals in typed builtin resource positions', () => {
    const line = 'particle(minecraft:'
    const cursor = line.length
    const labels = labelsFor(line, cursor)
    expect(labels).toEqual(BUILTIN_RESOURCE_REGISTRY.particles)
  })

  it('does not complete unquoted resource literals in non-resource positions', () => {
    const line = 'say(minecraft:'
    const cursor = line.length
    expect(labelsFor(line, cursor)).toHaveLength(0)
  })

  it('returns hover metadata for unquoted known resource literals', () => {
    const line = 'particle(minecraft:flame, 0, 64, 0)'
    const hover = getResourceHover(line, line.indexOf('flame'))
    expect(hover).toMatchObject({
      category: 'particles',
      value: 'minecraft:flame',
      known: true,
    })
    expect(hover!.markdown).toContain('resource<particle>')
    expect(hover!.markdown).toContain('static/editor catalog')
    expect(hover!.markdown).toContain('static')
    expect(hover!.markdown).toContain('not a live validation signal')
  })

  it('returns hover metadata for unquoted open datapack resource literals', () => {
    const line = 'particle(mypack:blue_spark, 0, 64, 0)'
    const hover = getResourceHover(line, line.indexOf('blue_spark'))
    expect(hover).toMatchObject({
      category: 'particles',
      value: 'mypack:blue_spark',
      known: false,
    })
    expect(hover!.markdown).toContain('resource<particle>')
    expect(hover!.markdown).toContain('Open-registry')
    expect(hover!.markdown).toContain('datapacks')
    expect(hover!.markdown).toContain('static/editor catalog')
    expect(hover!.markdown).not.toContain('Paper')
    expect(hover!.markdown).not.toContain('live server')
  })

  it('reports advisory hints for unknown string resource IDs', () => {
    const source = 'fn main(): void { particle("minecraft:not_a_particle", @s.pos); }'
    const hints = getResourceDiagnosticHints(source)

    expect(hints).toHaveLength(1)
    expect(hints[0]).toMatchObject({
      category: 'particles',
      value: 'minecraft:not_a_particle',
      message: expect.stringContaining('Unknown Minecraft particle'),
    })
  })

  it('does not report advisory hints for known string resource IDs', () => {
    const source = 'fn main(): void { particle("minecraft:flame", @s.pos); }'
    expect(getResourceDiagnosticHints(source)).toHaveLength(0)
  })

  it('reports advisory hints for unknown selector type IDs', () => {
    const source = 'fn main(): void { let mobs = @e[type=minecraft:not_a_mob]; }'
    const hints = getResourceDiagnosticHints(source)

    expect(hints).toHaveLength(1)
    expect(hints[0]).toMatchObject({
      category: 'entities',
      value: 'minecraft:not_a_mob',
      message: expect.stringContaining('Unknown Minecraft entity'),
    })
  })

  it('allows user or package catalog extensions without changing the built-in catalog', () => {
    const line = 'particle("m'
    const cursor = line.indexOf('"') + 1
    const items = getResourceCompletions(line, cursor, {
      particles: ['mypack:blue_spark'],
    })
    const labels = items.map(item => item.label as string)

    expect(labels).toContain('minecraft:flame')
    expect(labels).toContain('mypack:blue_spark')
    expect(BUILTIN_RESOURCE_REGISTRY.particles).not.toContain('mypack:blue_spark')
  })
})

// ---------------------------------------------------------------------------
// Tests: Hover — scoreboard objective literals
// ---------------------------------------------------------------------------

describe('LSP hover — scoreboard objective literals', () => {
  it('explains #coins as a scoreboard objective token', () => {
    const line = 'scoreboard_set(@s, #coins, 5)'
    const cursor = line.indexOf('#coins') + 1
    const hover = getObjectiveHover(line, cursor)

    expect(hover).not.toBeNull()
    expect(hover!.token).toBe('#coins')
    expect(hover!.markdown).toContain('scoreboard objective token')
    expect(hover!.markdown).toContain('Static/editor documentation only')
    expect(hover!.markdown).toContain('live Paper/server')
  })

  it('explains #score and marks static/editor semantics', () => {
    const line = 'scoreboard_players_set(@s, #score, 1)'
    const cursor = line.indexOf('#score') + 2
    const hover = getObjectiveHover(line, cursor)

    expect(hover).not.toBeNull()
    expect(hover!.token).toBe('#score')
    expect(hover!.markdown).toContain('#name')
    expect(hover!.markdown).toContain('does not confirm objective existence')
  })

  it('does not show objective hover in string literals', () => {
    const line = 'say("#coins")'
    const cursor = line.indexOf('#coins') + 1
    const hover = getObjectiveHover(line, cursor)

    expect(hover).toBeNull()
  })

  it('does not show objective hover in line comments', () => {
    const line = 'let x = 1; // #coins is a note'
    const cursor = line.indexOf('#coins') + 1
    const hover = getObjectiveHover(line, cursor)

    expect(hover).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: Hover — builtin functions
// ---------------------------------------------------------------------------

describe('LSP hover — builtin function signatures', () => {
  it('returns metadata-derived markdown hover for say builtin', () => {
    const hover = getBuiltinHover('say', BUILTIN_METADATA)

    expect(hover).not.toBeNull()
    expect(hover!.markdown).toContain('```redscript')
    expect(hover!.markdown).toContain('fn say')
    expect(hover!.markdown).toContain(BUILTIN_METADATA.say.doc)
    expect(hover!.markdown).toContain('Static/editor builtin metadata')
    expect(hover!.markdown).toContain('does not validate runtime behavior against a live server')
  })

  it('returns metadata-derived markdown hover for actionbar including parameters', () => {
    const hover = getBuiltinHover('actionbar', BUILTIN_METADATA)

    expect(hover).not.toBeNull()
    expect(hover!.markdown).toContain('fn actionbar')
    expect(hover!.markdown).toContain('**Parameters:**')
    expect(hover!.markdown).toContain('target')
    expect(hover!.markdown).toContain('message')
  })

  it('hover response matches LSP Hover protocol shape', () => {
    const hover = buildHoverResponse('**test** content')
    expect(hover).toHaveProperty('contents')
    expect((hover.contents as MarkupContent)).toHaveProperty('kind', MarkupKind.Markdown)
    expect((hover.contents as MarkupContent)).toHaveProperty('value')
  })
})

// ---------------------------------------------------------------------------
// Tests: Hover — decorators and selectors
// ---------------------------------------------------------------------------

describe('LSP hover — decorator metadata', () => {
  it('explains @tick as a runtime lifecycle decorator', () => {
    const line = '@tick(rate=20) fn every_second() {}'
    const hover = getDecoratorHover(line, line.indexOf('@tick') + 1)

    expect(hover).not.toBeNull()
    expect(hover!.name).toBe('tick')
    expect(hover!.markdown).toContain('Runtime decorator')
    expect(hover!.markdown).toContain('@tick(rate=N)')
    expect(hover!.markdown).toContain('Static/editor decorator metadata')
  })

  it('explains parameterized retry/throttle decorators without live-proof claims', () => {
    const retryLine = '@retry(max=3) fn unstable() {}'
    const throttleLine = '@throttle(ticks=20) fn limited() {}'

    const retry = getDecoratorHover(retryLine, retryLine.indexOf('@retry') + 2)
    const throttle = getDecoratorHover(throttleLine, throttleLine.indexOf('@throttle') + 2)

    expect(retry).not.toBeNull()
    expect(retry!.markdown).toContain('@retry(max=N)')
    expect(retry!.markdown).toContain('not a live Paper/server validation')
    expect(throttle).not.toBeNull()
    expect(throttle!.markdown).toContain('@throttle(ticks=N)')
  })

  it('does not show decorator hover inside strings or comments', () => {
    expect(getDecoratorHover('say("@tick")', 6)).toBeNull()
    expect(getDecoratorHover('let x = 1 // @tick', 15)).toBeNull()
  })
})

describe('LSP hover — selector semantics', () => {
  it('explains @s and @e selector tokens', () => {
    const selfLine = 'tell(@s, "hi")'
    const entityLine = 'effect(@e[type=minecraft:zombie], minecraft:speed, 20, 1)'

    const self = getSelectorTokenHover(selfLine, selfLine.indexOf('@s') + 1)
    const entities = getSelectorTokenHover(entityLine, entityLine.indexOf('@e') + 1)

    expect(self).not.toBeNull()
    expect(self!.markdown).toContain('currently executing')
    expect(self!.markdown).toContain('Static/editor selector semantics')
    expect(entities).not.toBeNull()
    expect(entities!.markdown).toContain('all entities')
  })

  it('explains selector type resource arguments as static editor metadata', () => {
    const line = 'effect(@e[type=minecraft:zombie], minecraft:speed, 20, 1)'
    const hover = getSelectorTypeResourceHover(line, line.indexOf('zombie'))

    expect(hover).not.toBeNull()
    expect(hover!.category).toBe('entities')
    expect(hover!.value).toBe('minecraft:zombie')
    expect(hover!.known).toBe(true)
    expect(hover!.markdown).toContain('resource<entity>')
    expect(hover!.markdown).toContain('static/editor')
    expect(hover!.markdown).toContain('does not claim live runtime')
  })

  it('does not show selector hover inside ordinary strings or comments', () => {
    expect(getSelectorTokenHover('say("@s")', 6)).toBeNull()
    expect(getSelectorTokenHover('let x = 1 // @e', 15)).toBeNull()
    expect(getSelectorTypeResourceHover('say("@e[type=minecraft:zombie]")', 20)).toBeNull()
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
