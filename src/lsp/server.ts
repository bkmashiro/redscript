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
  SignatureHelp,
  SignatureInformation,
  ParameterInformation,
  SignatureHelpParams,
  ReferenceParams,
  RenameParams,
  WorkspaceEdit,
  InlayHint,
  InlayHintKind,
} from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath, pathToFileURL } from 'url'

import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { TypeChecker } from '../typechecker'
import { DiagnosticError } from '../diagnostics'
import type { Program, FnDecl, Span, TypeNode, Stmt, Block } from '../ast/types'
import { BUILTIN_METADATA } from '../builtins/metadata'
import type { BuiltinDef } from '../builtins/metadata'

// ---------------------------------------------------------------------------
// Connection and document manager
// ---------------------------------------------------------------------------

const connection = createConnection(ProposedFeatures.all)
const documents = new TextDocuments(TextDocument)

// ---------------------------------------------------------------------------
// Builtin metadata: augment BUILTIN_METADATA from builtins.d.mcrs if present
// ---------------------------------------------------------------------------

/**
 * Parse builtins.d.mcrs for `declare fn` entries and extract doc/param info.
 * This ensures LSP hover covers every declared builtin even if metadata.ts
 * is not yet updated.
 */
function loadBuiltinsFromDeclFile(): Record<string, BuiltinDef> {
  const extra: Record<string, BuiltinDef> = {}
  // Candidate paths: next to server.ts (dev), or next to the package root
  const candidates = [
    path.resolve(__dirname, '../../builtins.d.mcrs'),
    path.resolve(__dirname, '../../../builtins.d.mcrs'),
    path.resolve(__dirname, '../../../../builtins.d.mcrs'),
  ]
  let src = ''
  for (const p of candidates) {
    if (fs.existsSync(p)) { src = fs.readFileSync(p, 'utf-8'); break }
  }
  if (!src) return extra

  const lines = src.split('\n')
  let docLines: string[] = []
  let paramDocs: Record<string, string> = {}

  for (const line of lines) {
    const tripleDoc = line.match(/^\/\/\/\s?(.*)$/)
    if (tripleDoc) {
      const content = tripleDoc[1]
      const paramMatch = content.match(/^@param\s+(\w+)\s+(.+)$/)
      if (paramMatch) {
        paramDocs[paramMatch[1]] = paramMatch[2]
      } else if (!content.startsWith('@example')) {
        docLines.push(content)
      }
      continue
    }

    const declMatch = line.match(/^declare fn (\w+)\(([^)]*)\):\s*(\w+);?$/)
    if (declMatch) {
      const [, fnName, paramsStr, retType] = declMatch
      // Only add if not already in BUILTIN_METADATA
      if (!ALL_BUILTINS[fnName]) {
        const params = paramsStr.trim()
          ? paramsStr.split(',').map(p => {
              const [pname, ptype] = p.trim().split(':').map(s => s.trim())
              return {
                name: pname ?? '',
                type: ptype ?? 'string',
                required: true,
                doc: paramDocs[pname ?? ''] ?? '',
                docZh: '',
              }
            })
          : []
        extra[fnName] = {
          name: fnName,
          params,
          returns: (retType === 'void' || retType === 'int' || retType === 'bool' || retType === 'string')
            ? retType : 'void',
          doc: docLines.join(' ').trim(),
          docZh: '',
          examples: [],
          category: 'builtin',
        }
      }
      docLines = []
      paramDocs = {}
      continue
    }

    // Non-comment, non-declare line resets doc accumulator
    if (line.trim() && !line.startsWith('//')) {
      docLines = []
      paramDocs = {}
    }
  }
  return extra
}

const EXTRA_BUILTINS = loadBuiltinsFromDeclFile()
/** Combined lookup: metadata.ts entries + anything declared in builtins.d.mcrs */
const ALL_BUILTINS: Record<string, BuiltinDef> = { ...EXTRA_BUILTINS, ...BUILTIN_METADATA }

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
    default:
      return 'unknown'
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
// Decorator hover docs
// ---------------------------------------------------------------------------

const DECORATOR_DOCS: Record<string, string> = {
  tick:         'Runs every MC game tick (~20 Hz). No arguments.',
  load:         'Runs on `/reload`. Use for initialization logic.',
  coroutine:    'Splits loops into tick-spread continuations. Arg: `batch=N` (steps per tick, default 1).',
  schedule:     'Schedules the function to run after N ticks. Arg: `ticks=N`.',
  on_trigger:   'Runs when a trigger scoreboard objective is set by a player. Arg: trigger name.',
  keep:         'Prevents the compiler from dead-code-eliminating this function.',
  on:           'Generic event handler decorator.',
  on_advancement: 'Runs when a player earns an advancement. Arg: advancement id.',
  on_craft:     'Runs when a player crafts an item. Arg: item id.',
  on_death:     'Runs when a player dies.',
  on_join_team: 'Runs when a player joins a team. Arg: team name.',
  on_login:     'Runs when a player logs in.',
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
  'int', 'bool', 'fixed', 'float', 'string', 'void', 'BlockPos', 'byte', 'short', 'long', 'double',
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
      signatureHelpProvider: {
        triggerCharacters: ['(', ','],
      },
      referencesProvider: true,
      renameProvider: true,
      inlayHintProvider: true,
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

  // ── Decorator hover: works even if program is null (parse errors elsewhere) ──
  const lines = source.split('\n')
  const lineText = lines[params.position.line] ?? ''
  const ch = params.position.character
  // Find all @xxx on this line and check if cursor is inside one
  const decorRe = /@([a-zA-Z_][a-zA-Z0-9_]*)/g
  let dm: RegExpExecArray | null
  while ((dm = decorRe.exec(lineText)) !== null) {
    const atIdx = dm.index
    const decorEnd = atIdx + dm[0].length
    if (ch >= atIdx && ch <= decorEnd) {
      const decoratorName = dm[1]
      const decoratorDoc = DECORATOR_DOCS[decoratorName]
      if (decoratorDoc) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `**@${decoratorName}** — ${decoratorDoc}`,
          } as MarkupContent,
        }
      }
    }
  }

  const cached = parsedDocs.get(params.textDocument.uri)
  const program = cached?.program ?? null
  if (!program) return null

  const word = wordAt(source, params.position)
  if (!word) return null

  // Check builtins
  const builtin = ALL_BUILTINS[word]
  if (builtin) {
    const paramStr = builtin.params
      .map(p => `${p.name}: ${p.type}${p.required ? '' : '?'}`)
      .join(', ')
    const sig = `fn ${builtin.name}(${paramStr}): ${builtin.returns}`
    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: `\`\`\`redscript\n${sig}\n\`\`\`\n${builtin.doc}`,
    }
    return { contents: content }
  }

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

/** Resolve a relative or stdlib import path to an absolute file path. */
function resolveImportPath(importStr: string, fromUri: string): string | null {
  try {
    const fromFile = fileURLToPath(fromUri)
    const fromDir  = path.dirname(fromFile)

    if (importStr.startsWith('.')) {
      // Relative path: import "../stdlib/math.mcrs"
      const resolved = path.resolve(fromDir, importStr)
      if (fs.existsSync(resolved)) return resolved
      // Try adding .mcrs extension
      if (!resolved.endsWith('.mcrs') && fs.existsSync(resolved + '.mcrs')) return resolved + '.mcrs'
    } else {
      // stdlib path: import "stdlib/math" or "stdlib/math.mcrs"
      // Walk up to find package root (contains package.json)
      let dir = fromDir
      for (let i = 0; i < 10; i++) {
        if (fs.existsSync(path.join(dir, 'package.json'))) {
          const candidate = path.join(dir, 'src', importStr)
          if (fs.existsSync(candidate)) return candidate
          if (fs.existsSync(candidate + '.mcrs')) return candidate + '.mcrs'
          // also try without 'src/'
          const candidate2 = path.join(dir, importStr)
          if (fs.existsSync(candidate2)) return candidate2
          if (fs.existsSync(candidate2 + '.mcrs')) return candidate2 + '.mcrs'
          break
        }
        dir = path.dirname(dir)
      }
    }
  } catch { /* ignore */ }
  return null
}

connection.onDefinition((params: TextDocumentPositionParams): Location | null => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return null

  const source = doc.getText()
  const lines  = source.split('\n')
  const lineText = lines[params.position.line] ?? ''
  const ch = params.position.character

  // ── import "path/to/file.mcrs" ─────────────────────────────────────────────
  // Cursor is anywhere on the line that starts with `import "..."`
  const fileImportMatch = lineText.match(/^import\s+"([^"]+)"/)
  if (fileImportMatch) {
    const importStr = fileImportMatch[1]
    const resolved  = resolveImportPath(importStr, params.textDocument.uri)
    if (resolved) {
      return {
        uri: pathToFileURL(resolved).toString(),
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      }
    }
  }

  const cached = parsedDocs.get(params.textDocument.uri)
  const program = cached?.program ?? null
  if (!program) return null

  const word = wordAt(source, params.position)
  if (!word) return null

  // ── import module::symbol — jump to the symbol in the imported module ───────
  // Check if word is a known import symbol; try to resolve its module file
  const importDecl = program.imports?.find(im => im.symbol === word || im.symbol === '*')
  if (importDecl) {
    const resolved = resolveImportPath(importDecl.moduleName, params.textDocument.uri)
      ?? resolveImportPath(importDecl.moduleName + '.mcrs', params.textDocument.uri)
    if (resolved) {
      // Open file at start; could later search for the symbol definition
      return {
        uri: pathToFileURL(resolved).toString(),
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      }
    }
  }

  // ── Normal in-file definition ──────────────────────────────────────────────
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
// Completion helpers
// ---------------------------------------------------------------------------

/** int[] built-in methods */
const ARRAY_METHOD_COMPLETIONS: CompletionItem[] = [
  { label: 'push',   kind: CompletionItemKind.Method, detail: '(value: int): void',  documentation: 'Append an element to the array.' },
  { label: 'pop',    kind: CompletionItemKind.Method, detail: '(): int',              documentation: 'Remove and return the last element.' },
  { label: 'length', kind: CompletionItemKind.Property, detail: 'int',               documentation: 'Number of elements in the array.' },
]

/** Collect (name → TypeNode) for all let bindings visible in the function body at offset. */
function collectLocals(body: Block): Map<string, TypeNode> {
  const map = new Map<string, TypeNode>()
  function walk(stmts: Block): void {
    for (const s of stmts) {
      if (s.kind === 'let' && s.type) {
        map.set(s.name, s.type)
      } else if (s.kind === 'let_destruct') {
        // no type info per-binding easily; skip
      }
      // Recurse into sub-blocks
      const sub = (s as Record<string, unknown>)
      if (Array.isArray(sub['body'])) walk(sub['body'] as Block)
      if (Array.isArray(sub['then'])) walk(sub['then'] as Block)
      if (Array.isArray(sub['else_'])) walk(sub['else_'] as Block)
    }
  }
  walk(body)
  return map
}

/** Determine if line at cursor is a dot-access context: `<expr>.` */
function getDotReceiver(lineText: string, charPos: number): string | null {
  // Check that the character just before cursor is '.'
  if (lineText[charPos - 1] !== '.') return null
  // Scan left to collect the identifier before '.'
  let end = charPos - 2
  while (end >= 0 && /\s/.test(lineText[end])) end--
  if (end < 0) return null
  let start = end
  while (start > 0 && /[a-zA-Z0-9_]/.test(lineText[start - 1])) start--
  return lineText.slice(start, end + 1) || null
}

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

connection.onCompletion((params: TextDocumentPositionParams): CompletionItem[] => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) {
    return [...KEYWORD_COMPLETIONS, ...TYPE_COMPLETIONS, ...BUILTIN_FN_COMPLETIONS, ...DECORATOR_COMPLETIONS]
  }

  const source = doc.getText()
  const lines = source.split('\n')
  const lineText = lines[params.position.line] ?? ''
  const charPos  = params.position.character

  const cached = parsedDocs.get(params.textDocument.uri)
  const program = cached?.program ?? null

  // ── Dot-access completion ──────────────────────────────────────────────────
  const dotReceiver = getDotReceiver(lineText, charPos)
  if (dotReceiver !== null) {
    const items: CompletionItem[] = []

    if (program) {
      // Find which function body contains this line (by span)
      const curLine = params.position.line + 1 // spans are 1-based
      let locals: Map<string, TypeNode> | null = null
      for (const fn of program.declarations) {
        if (fn.body && fn.span) {
          if (curLine >= fn.span.line && curLine <= (fn.span.endLine ?? Infinity)) {
            locals = collectLocals(fn.body as Block)
            break
          }
        }
      }

      // Determine type of receiver
      const receiverType: TypeNode | undefined = locals?.get(dotReceiver)
        ?? program.consts?.find(c => c.name === dotReceiver)?.type
        ?? program.globals?.find(g => g.name === dotReceiver)?.type

      if (receiverType) {
        if (receiverType.kind === 'array') {
          // int[] → push / pop / length
          items.push(...ARRAY_METHOD_COMPLETIONS)
        } else if (receiverType.kind === 'named' || receiverType.kind === 'struct') {
          const typeName = (receiverType as { name: string }).name
          // Struct fields
          const structDecl = program.structs?.find(s => s.name === typeName)
          if (structDecl) {
            for (const f of structDecl.fields) {
              items.push({
                label: f.name,
                kind: CompletionItemKind.Field,
                detail: typeToString(f.type),
              })
            }
          }
          // Impl methods
          const implBlock = program.implBlocks?.find(ib => ib.typeName === typeName)
          if (implBlock) {
            for (const m of implBlock.methods) {
              const params_ = m.params.map(p => `${p.name}: ${typeToString(p.type)}`).join(', ')
              items.push({
                label: m.name,
                kind: CompletionItemKind.Method,
                detail: `(${params_}): ${typeToString(m.returnType)}`,
              })
            }
          }
        }
      } else {
        // Unknown type — offer all struct fields + impl methods as fallback
        for (const ib of program.implBlocks ?? []) {
          for (const m of ib.methods) {
            items.push({ label: m.name, kind: CompletionItemKind.Method })
          }
        }
        items.push(...ARRAY_METHOD_COMPLETIONS)
      }
    }

    return items
  }

  // ── Global / normal completion ─────────────────────────────────────────────
  const items: CompletionItem[] = [
    ...KEYWORD_COMPLETIONS,
    ...TYPE_COMPLETIONS,
    ...BUILTIN_FN_COMPLETIONS,
    ...DECORATOR_COMPLETIONS,
  ]

  if (program) {
    // User-defined top-level symbols
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
    for (const g of program.globals ?? []) {
      items.push({ label: g.name, kind: CompletionItemKind.Variable })
    }

    // Locals from the enclosing function
    const curLine = params.position.line + 1
    for (const fn of program.declarations) {
      if (fn.body && fn.span) {
        if (curLine >= fn.span.line && curLine <= (fn.span.endLine ?? Infinity)) {
          for (const [name, typ] of collectLocals(fn.body as Block)) {
            items.push({
              label: name,
              kind: CompletionItemKind.Variable,
              detail: typeToString(typ),
            })
          }
          break
        }
      }
    }
  }

  return items
})

// ---------------------------------------------------------------------------
// Helpers for word-at-position (used by references and rename)
// ---------------------------------------------------------------------------

function getWordRangeAtPosition(
  doc: import('vscode-languageserver-textdocument').TextDocument,
  position: Position,
): { start: Position; end: Position } | null {
  const text = doc.getText()
  const offset = doc.offsetAt(position)
  let start = offset
  let end = offset
  while (start > 0 && /[a-zA-Z0-9_]/.test(text[start - 1])) start--
  while (end < text.length && /[a-zA-Z0-9_]/.test(text[end])) end++
  if (start === end) return null
  return { start: doc.positionAt(start), end: doc.positionAt(end) }
}

// ---------------------------------------------------------------------------
// Signature Help
// ---------------------------------------------------------------------------

connection.onSignatureHelp((params: SignatureHelpParams): SignatureHelp | null => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return null

  const parsed = parsedDocs.get(params.textDocument.uri)
  if (!parsed?.program) return null

  const text = doc.getText()
  const offset = doc.offsetAt(params.position)

  // Walk backwards to find the opening '(' and count active parameter
  let depth = 0
  let i = offset - 1
  let activeParam = 0

  while (i >= 0) {
    const ch = text[i]
    if (ch === ')') depth++
    else if (ch === '(') {
      if (depth === 0) break
      depth--
    } else if (ch === ',' && depth === 0) activeParam++
    i--
  }

  if (i < 0) return null

  // Extract function name before '('
  let nameEnd = i - 1
  while (nameEnd >= 0 && /\s/.test(text[nameEnd])) nameEnd--
  let nameStart = nameEnd
  while (nameStart > 0 && /[a-zA-Z0-9_]/.test(text[nameStart - 1])) nameStart--
  const fnName = text.slice(nameStart, nameEnd + 1)

  if (!fnName) return null

  // Find function declaration in parsed program
  const fn = parsed.program.declarations.find(s => s.name === fnName)

  // Also check builtins (BUILTIN_METADATA is a Record<string, BuiltinDef>)
  const builtin = ALL_BUILTINS[fnName]

  if (!fn && !builtin) return null

  let label: string
  let paramsList: string[]

  if (fn) {
    paramsList = fn.params.map(p => `${p.name}: ${typeToString(p.type)}`)
    label = `fn ${fn.name}(${paramsList.join(', ')}): ${typeToString(fn.returnType)}`
  } else {
    paramsList = builtin.params?.map(p => `${p.name}: ${p.type}`) ?? []
    label = `${builtin.name}(${paramsList.join(', ')}): ${builtin.returns ?? 'void'}`
  }

  const paramInfos: ParameterInformation[] = paramsList.map(p => ({ label: p }))

  return {
    signatures: [
      {
        label,
        parameters: paramInfos,
        activeParameter: Math.min(activeParam, Math.max(0, paramInfos.length - 1)),
      } as SignatureInformation,
    ],
    activeSignature: 0,
    activeParameter: Math.min(activeParam, Math.max(0, paramInfos.length - 1)),
  }
})

// ---------------------------------------------------------------------------
// Inlay Hints
// ---------------------------------------------------------------------------

connection.onRequest(
  'textDocument/inlayHint',
  (params: { textDocument: { uri: string }; range: unknown }): InlayHint[] => {
    const parsed = parsedDocs.get(params.textDocument.uri)
    if (!parsed?.program) return []
    const doc = documents.get(params.textDocument.uri)
    if (!doc) return []

    const hints: InlayHint[] = []

    // Walk all let declarations with no explicit type annotation
    // (where the type was inferred by the type checker)
    function walkStmt(stmt: Record<string, unknown>): void {
      if (
        stmt['kind'] === 'let_decl' &&
        !stmt['typeAnnotation'] &&
        stmt['inferredType']
      ) {
        const spanVal = stmt['span'] as { end?: number } | undefined
        const pos = doc!.positionAt(spanVal?.end ?? 0)
        hints.push({
          position: { line: pos.line, character: pos.character },
          label: `: ${typeToString(stmt['inferredType'] as import('../ast/types').TypeNode)}`,
          kind: InlayHintKind.Type,
          paddingLeft: true,
        })
      }
      // Recurse into blocks, if/else bodies, etc.
      const body = stmt['body'] as Record<string, unknown>[] | undefined
      if (Array.isArray(body)) body.forEach(walkStmt)
      const then_ = stmt['then'] as Record<string, unknown>[] | undefined
      if (Array.isArray(then_)) then_.forEach(walkStmt)
      const else_ = stmt['else_'] as Record<string, unknown>[] | undefined
      if (Array.isArray(else_)) else_.forEach(walkStmt)
    }

    parsed.program.declarations.forEach(top => {
      if (top.body) {
        (top.body as Record<string, unknown>[]).forEach(walkStmt)
      }
    })

    return hints
  },
)

// ---------------------------------------------------------------------------
// Find References
// ---------------------------------------------------------------------------

connection.onReferences((params: ReferenceParams): Location[] => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return []

  const parsed = parsedDocs.get(params.textDocument.uri)
  if (!parsed?.program) return []

  const wordRange = getWordRangeAtPosition(doc, params.position)
  if (!wordRange) return []
  const word = doc.getText(wordRange)
  if (!word) return []

  const text = doc.getText()
  const locations: Location[] = []
  const regex = new RegExp(`\\b${word}\\b`, 'g')
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const start = doc.positionAt(match.index)
    const end = doc.positionAt(match.index + word.length)
    locations.push({
      uri: params.textDocument.uri,
      range: { start, end },
    })
  }

  return locations
})

// ---------------------------------------------------------------------------
// Rename Symbol
// ---------------------------------------------------------------------------

connection.onRenameRequest((params: RenameParams): WorkspaceEdit | null => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return null

  const wordRange = getWordRangeAtPosition(doc, params.position)
  if (!wordRange) return null
  const word = doc.getText(wordRange)
  if (!word) return null

  const text = doc.getText()
  const edits: import('vscode-languageserver/node').TextEdit[] = []
  const regex = new RegExp(`\\b${word}\\b`, 'g')
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    const start = doc.positionAt(match.index)
    const end = doc.positionAt(match.index + word.length)
    edits.push({ range: { start, end }, newText: params.newName })
  }

  return { changes: { [params.textDocument.uri]: edits } }
})

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

documents.listen(connection)
connection.listen()
