/**
 * RedScript Language Server
 *
 * Implements LSP (Language Server Protocol) over stdio.
 * Features:
 *   - Diagnostics (type errors, parse errors)
 *   - Hover (type information)
 *   - Go-to-definition (functions, variables)
 *   - Completion (keywords, functions, builtins)
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  Diagnostic,
  DiagnosticSeverity,
  Hover,
  MarkupContent,
  MarkupKind,
  CompletionItem,
  CompletionItemKind,
  Location,
  Position,
  TextDocumentPositionParams,
} from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'

import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { TypeChecker } from '../typechecker'
import { DiagnosticError } from '../diagnostics'
import type { Program, FnDecl, Span, TypeNode } from '../ast/types'

// ---------------------------------------------------------------------------
// Connection and document manager
// ---------------------------------------------------------------------------

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

// ---------------------------------------------------------------------------
// Per-document parse cache
// ---------------------------------------------------------------------------

interface ParsedDoc {
  program: Program | null
  /** Errors collected from lex/parse/typecheck */
  errors: DiagnosticError[]
  source: string
}

const parsedDocs = new Map<string, ParsedDoc>()

// ---------------------------------------------------------------------------
// Helpers
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
  }
}

/** Parse and type-check a document, caching the result. */
function parseDocument(uri: string, source: string): ParsedDoc {
  const errors: DiagnosticError[] = []
  let program: Program | null = null

  try {
    const lexer = new Lexer(source)
    const tokens = lexer.tokenize()
    const parser = new Parser(tokens, source, uri)
    program = parser.parse('redscript')

    // Type-check (warn mode — collects errors but doesn't throw)
    const checker = new TypeChecker(source, uri)
    const typeErrors = checker.check(program)
    errors.push(...typeErrors)
  } catch (err) {
    if (err instanceof DiagnosticError) {
      errors.push(err)
    } else if (err instanceof Error) {
      // Wrap parse errors that aren't DiagnosticError
      errors.push(new DiagnosticError(
        'ParseError',
        err.message,
        { line: 1, col: 1, file: uri },
      ))
    }
  }

  const doc: ParsedDoc = { program, errors, source }
  parsedDocs.set(uri, doc)
  return doc
}

/** Convert a DiagnosticError to an LSP Diagnostic. */
function toDiagnostic(err: DiagnosticError): Diagnostic {
  const line = Math.max(0, (err.location?.line ?? 1) - 1)
  const col  = Math.max(0, (err.location?.col  ?? 1) - 1)
  return {
    severity: DiagnosticSeverity.Error,
    range: {
      start: { line, character: col },
      end:   { line, character: col + 80 },
    },
    message: err.message,
    source: 'redscript',
  }
}

// ---------------------------------------------------------------------------
// Hover helpers
// ---------------------------------------------------------------------------

/** Find the word at a position in a text. */
function wordAt(source: string, position: Position): string {
  const lines = source.split('\n')
  const line = lines[position.line] ?? ''
  const ch = position.character
  // Expand left
  let start = ch
  while (start > 0 && /\w/.test(line[start - 1])) start--
  // Expand right
  let end = ch
  while (end < line.length && /\w/.test(line[end])) end++
  return line.slice(start, end)
}

/** Find a function declaration by name in a parsed program. */
function findFunction(program: Program, name: string): FnDecl | undefined {
  // Top-level functions
  const fn = program.declarations.find(f => f.name === name)
  if (fn) return fn
  // Impl methods
  for (const impl of program.implBlocks ?? []) {
    const m = impl.methods.find(f => f.name === name)
    if (m) return m
  }
  return undefined
}

/** Format a function signature for hover. */
function formatFnSignature(fn: FnDecl): string {
  const params = fn.params.map(p => `${p.name}: ${typeToString(p.type)}`).join(', ')
  const ret = typeToString(fn.returnType)
  const typeParams = fn.typeParams?.length ? `<${fn.typeParams.join(', ')}>` : ''
  return `fn ${fn.name}${typeParams}(${params}): ${ret}`
}

// ---------------------------------------------------------------------------
// Go-to-definition helpers
// ---------------------------------------------------------------------------

/** Build a mapping from identifier name → definition location. */
function buildDefinitionMap(program: Program, source: string): Map<string, Span> {
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

// ---------------------------------------------------------------------------
// Completion items
// ---------------------------------------------------------------------------

const KEYWORD_COMPLETIONS: CompletionItem[] = [
  'fn', 'let', 'if', 'else', 'while', 'for', 'foreach', 'return',
  'break', 'continue', 'as', 'at', 'match', 'struct', 'enum', 'impl',
  'const', 'global', 'true', 'false', 'module', 'import',
].map(kw => ({
  label: kw,
  kind: CompletionItemKind.Keyword,
}))

const TYPE_COMPLETIONS: CompletionItem[] = [
  'int', 'bool', 'float', 'string', 'void', 'BlockPos', 'byte', 'short', 'long', 'double',
  'entity', 'Player', 'Mob', 'HostileMob', 'PassiveMob',
  'Zombie', 'Skeleton', 'Creeper', 'Spider', 'Enderman',
].map(t => ({
  label: t,
  kind: CompletionItemKind.TypeParameter,
}))

const DECORATOR_COMPLETIONS: CompletionItem[] = [
  '@tick', '@load', '@on', '@coroutine', '@keep',
].map(d => ({
  label: d,
  kind: CompletionItemKind.Event,
}))

const BUILTIN_FN_COMPLETIONS: CompletionItem[] = [
  'say', 'tell', 'give', 'kill', 'teleport', 'summon', 'setblock',
  'fill', 'clone', 'effect', 'enchant', 'experience', 'gamemode',
  'gamerule', 'particle', 'playsound', 'stopsound', 'scoreboard',
  'tag', 'title', 'subtitle', 'actionbar', 'tellraw', 'announce',
  'setTimeout', 'setInterval', 'clearInterval',
].map(fn => ({
  label: fn,
  kind: CompletionItemKind.Function,
}))

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

connection.onInitialize((_params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      hoverProvider: true,
      definitionProvider: true,
      completionProvider: {
        triggerCharacters: ['.', '@'],
        resolveProvider: false,
      },
    },
    serverInfo: {
      name: 'redscript-lsp',
      version: '1.0.0',
    },
  }
})

connection.onInitialized(() => {
  connection.console.log('RedScript LSP server ready')
})

// ---------------------------------------------------------------------------
// Document sync → diagnostics
// ---------------------------------------------------------------------------

function validateAndPublish(doc: TextDocument): void {
  const source = doc.getText()
  const parsed = parseDocument(doc.uri, source)
  const diagnostics: Diagnostic[] = parsed.errors.map(toDiagnostic)
  connection.sendDiagnostics({ uri: doc.uri, diagnostics })
}

documents.onDidOpen(e => validateAndPublish(e.document))
documents.onDidChangeContent(e => validateAndPublish(e.document))
documents.onDidClose(e => {
  parsedDocs.delete(e.document.uri)
  connection.sendDiagnostics({ uri: e.document.uri, diagnostics: [] })
})

// ---------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------

connection.onHover((params: TextDocumentPositionParams): Hover | null => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return null

  const source = doc.getText()
  const cached = parsedDocs.get(params.textDocument.uri)
  const program = cached?.program ?? null
  if (!program) return null

  const word = wordAt(source, params.position)
  if (!word) return null

  // Check if it's a known function
  const fn = findFunction(program, word)
  if (fn) {
    const sig = formatFnSignature(fn)
    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: `\`\`\`redscript\n${sig}\n\`\`\``,
    }
    return { contents: content }
  }

  // Check structs
  const struct = program.structs?.find(s => s.name === word)
  if (struct) {
    const fields = struct.fields.map(f => `  ${f.name}: ${typeToString(f.type)}`).join('\n')
    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: `\`\`\`redscript\nstruct ${struct.name} {\n${fields}\n}\n\`\`\``,
    }
    return { contents: content }
  }

  // Check enums
  const enumDecl = program.enums?.find(e => e.name === word)
  if (enumDecl) {
    const variants = enumDecl.variants.map(v => `  ${v.name}`).join('\n')
    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: `\`\`\`redscript\nenum ${enumDecl.name} {\n${variants}\n}\n\`\`\``,
    }
    return { contents: content }
  }

  // Check consts
  const constDecl = program.consts?.find(c => c.name === word)
  if (constDecl) {
    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: `\`\`\`redscript\nconst ${constDecl.name}: ${typeToString(constDecl.type)}\n\`\`\``,
    }
    return { contents: content }
  }

  return null
})

// ---------------------------------------------------------------------------
// Go-to-definition
// ---------------------------------------------------------------------------

connection.onDefinition((params: TextDocumentPositionParams): Location | null => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return null

  const source = doc.getText()
  const cached = parsedDocs.get(params.textDocument.uri)
  const program = cached?.program ?? null
  if (!program) return null

  const word = wordAt(source, params.position)
  if (!word) return null

  const defMap = buildDefinitionMap(program, source)
  const span = defMap.get(word)
  if (!span) return null

  const line = Math.max(0, span.line - 1)
  const col  = Math.max(0, span.col  - 1)
  return {
    uri: params.textDocument.uri,
    range: {
      start: { line, character: col },
      end:   { line, character: col + word.length },
    },
  }
})

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const doc = documents.get(params.textDocument.uri)
  const items: CompletionItem[] = [
    ...KEYWORD_COMPLETIONS,
    ...TYPE_COMPLETIONS,
    ...BUILTIN_FN_COMPLETIONS,
    ...DECORATOR_COMPLETIONS,
  ]

  if (!doc) return items

  // Add user-defined functions from the parsed doc
  const cached = parsedDocs.get(params.textDocument.uri)
  const program = cached?.program ?? null
  if (program) {
    for (const fn of program.declarations) {
      items.push({ label: fn.name, kind: CompletionItemKind.Function })
    }
    for (const s of program.structs ?? []) {
      items.push({ label: s.name, kind: CompletionItemKind.Struct })
    }
    for (const e of program.enums ?? []) {
      items.push({ label: e.name, kind: CompletionItemKind.Enum })
    }
    for (const c of program.consts ?? []) {
      items.push({ label: c.name, kind: CompletionItemKind.Constant })
    }
  }

  return items
})

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

documents.listen(connection)
connection.listen()
