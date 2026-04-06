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
import { lintString } from '../lint'
import type { LintWarning } from '../lint'
import { buildRenameWorkspaceEdit } from './rename'

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
    // Strip path-based imports ("import "stdlib/xxx.mcrs"") before parsing,
    // since the Parser only understands import module::symbol syntax.
    // These are handled at compile time by pre-processing, not by the parser.
    const strippedSource = source.replace(/^import\s+"[^"]*"\s*;?\s*$/gm, '// (import stripped for LSP)')
    const lexer = new Lexer(strippedSource)
    const tokens = lexer.tokenize()
    const parser = new Parser(tokens, strippedSource, uri)
    program = parser.parse('redscript')

    // Type-check (warn mode — collects errors but doesn't throw)
    try {
      const checker = new TypeChecker(source, uri)
      const typeErrors = checker.check(program)
      errors.push(...typeErrors)
    } catch { /* type errors are non-fatal; keep the parsed program */ }
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

/** Severity mapping for lint rules. */
const LINT_SEVERITY_MAP: Record<string, DiagnosticSeverity> = {
  'unused-variable':   DiagnosticSeverity.Information,
  'magic-number':      DiagnosticSeverity.Hint,
  'dead-branch':       DiagnosticSeverity.Warning,
  'unused-import':     DiagnosticSeverity.Information,
  'function-too-long': DiagnosticSeverity.Warning,
}

/** Convert a LintWarning to an LSP Diagnostic. */
function lintWarningToDiagnostic(w: LintWarning): Diagnostic {
  const line = Math.max(0, (w.line ?? 1) - 1)
  const col  = Math.max(0, (w.col  ?? 1) - 1)
  const severity = LINT_SEVERITY_MAP[w.rule] ?? DiagnosticSeverity.Warning
  return {
    severity,
    range: {
      start: { line, character: col },
      end:   { line, character: col + 80 },
    },
    message: w.message,
    source: 'redscript-lint',
    code: w.rule,
  }
}

// ---------------------------------------------------------------------------
// Decorator hover docs
// ---------------------------------------------------------------------------

const DECORATOR_DOCS: Record<string, string> = {
  tick:         'Runs every game tick.\n\n**Optional args:** `rate=N` (every N ticks, e.g. `@tick(rate=20)` = once per second)\n\nExample: `@tick fn every_tick() {}` or `@tick(rate=20) fn every_second() {}`',
  load:         'Runs once on `/reload`. Use for initialization.\n\nExample: `@load fn init() { scoreboard_create(...) }`',
  watch:        'Runs when a scoreboard objective changes for a player.\n\n**Required arg:** objective name.\n\nExample: `@watch("rs.kills") fn on_kill_change() {}`',
  coroutine:    'Wraps a loop to spread execution across multiple ticks.\n\n**Required arg:** `batch=N` — iterations per tick.\n\nExample: `@coroutine(batch=10) fn scan_blocks() { for i in 0..1000 { ... } }`',
  schedule:     'Schedules the function to run after a delay.\n\n**Required arg:** `ticks=N`\n\nExample: `@schedule(ticks=100) fn delayed() {}`',
  on_trigger:   'Runs when a player executes `/trigger <name>`.\n\n**Required arg:** trigger objective name.\n\nExample: `@on_trigger("shop") fn open_shop() {}`',
  keep:         'Prevents dead-code elimination. Use for exported entry points not referenced in the same file.\n\nExample: `@keep fn public_api() {}`',
  on:           'Generic event handler. Arg: event name.\n\nExample: `@on("custom:event") fn handler() {}`',
  on_advancement: 'Runs when a player earns an advancement.\n\n**Arg:** advancement id (e.g. `"story/mine_diamond"`).\n\nExample: `@on_advancement("story/mine_diamond") fn reward() {}`',
  on_craft:     'Runs when a player crafts an item.\n\n**Arg:** item id (e.g. `"minecraft:diamond_sword"`).\n\nExample: `@on_craft("minecraft:diamond_sword") fn on_craft_sword() {}`',
  on_death:     'Runs when a player dies.\n\nExample: `@on_death fn on_player_death() {}`',
  on_join_team: 'Runs when a player joins a team.\n\n**Arg:** team name.\n\nExample: `@on_join_team("red") fn joined_red() {}`',
  on_login:     'Runs when a player logs into the server.\n\nExample: `@on_login fn welcome() { tell(@s, f"Welcome back!") }`',
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
// ---------------------------------------------------------------------------
// Doc comment parsing helpers
// ---------------------------------------------------------------------------

interface ParsedDocComment {
  description: string
  params: Array<{ name: string; doc: string }>
  returns: string | null
}

/**
 * Parse a raw triple-slash or block comment into structured sections.
 * Supports @param name desc and @returns desc.
 */
function parseDocCommentText(raw: string): ParsedDocComment {
  const result: ParsedDocComment = { description: '', params: [], returns: null }
  const descLines: string[] = []
  for (const line of raw.split('\n')) {
    const paramMatch = line.match(/^@param\s+(\w+)\s+(.+)$/)
    if (paramMatch) {
      result.params.push({ name: paramMatch[1], doc: paramMatch[2].trim() })
      continue
    }
    const retMatch = line.match(/^@returns?\s+(.+)$/)
    if (retMatch) {
      result.returns = retMatch[1].trim()
      continue
    }
    // Skip @since / @example etc
    if (/^@\w+/.test(line.trim())) continue
    descLines.push(line)
  }
  result.description = descLines.join('\n').trim()
  return result
}

/**
 * Format a ParsedDocComment into Markdown for LSP hover.
 */
function formatDocCommentMarkdown(doc: ParsedDocComment): string {
  const parts: string[] = []
  if (doc.description) parts.push(doc.description)
  if (doc.params.length > 0) {
    parts.push('\n**Parameters:**')
    for (const p of doc.params) {
      parts.push(`- \`${p.name}\` — ${p.doc}`)
    }
  }
  if (doc.returns) {
    parts.push(`\n**Returns:** ${doc.returns}`)
  }
  return parts.join('\n')
}

/**
 * Extract the leading doc comment (/** ... *\/) immediately before a function
 * declaration, returning it as plain text (tags stripped).
 */
function extractDocComment(source: string, fn: FnDecl): string | null {
  if (!fn.span) return null
  const lines = source.split('\n')
  // fn.span.line is 1-based; scan upward from fn declaration line
  let endLine = fn.span.line - 2  // 0-based index of line before fn
  if (endLine < 0) return null
  // Skip blank lines
  while (endLine >= 0 && lines[endLine].trim() === '') endLine--
  if (endLine < 0) return null

  // Case 1: /** ... */ block comment
  if (lines[endLine].trim().endsWith('*/')) {
    let startLine = endLine
    while (startLine >= 0 && !lines[startLine].trim().startsWith('/**')) startLine--
    if (startLine < 0) return null
    const commentLines = lines.slice(startLine, endLine + 1)
    return commentLines
      .map(l => l.replace(/^\s*\/\*\*\s?/, '').replace(/^\s*\*\/\s?$/, '').replace(/^\s*\*\s?/, '').trimEnd())
      .filter(l => l.length > 0)
      .join('\n') || null
  }

  // Case 2: consecutive // or /// line comments
  if (lines[endLine].trim().startsWith('//')) {
    let startLine = endLine
    while (startLine > 0 && lines[startLine - 1].trim().startsWith('//')) startLine--
    return lines.slice(startLine, endLine + 1)
      .map(l => l.replace(/^\s*\/\/\/?\/?\s?/, '').trimEnd())
      .filter(l => l.length > 0)
      .join('\n') || null
  }

  return null
}

/**
 * Find which function declaration contains the given 1-based line number.
 * Uses the next fn's start line as the implicit end when span.endLine is missing.
 */
function findEnclosingFn(program: Program, curLine: number): import('../ast/types').FnDecl | null {
  const fns = program.declarations.filter((f): f is typeof f & { span: NonNullable<typeof f.span> } => f.span != null)
  for (let i = 0; i < fns.length; i++) {
    const fn = fns[i]
    const startLine = fn.span.line
    const nextSpanLine = fns[i + 1]?.span.line
    const endLine = fn.span.endLine ?? (nextSpanLine != null ? nextSpanLine - 1 : Infinity)
    if (curLine >= startLine && curLine <= endLine) return fn
  }
  return null
}

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

// Decorator completions — triggered when '@' is typed at line start context.
// insertText is the full token WITHOUT '@' because '@' is already on screen.
// VSCode will keep the completion open as user types more letters (filter by label).
const DECORATOR_COMPLETIONS: CompletionItem[] = [
  { label: '@tick',           detail: 'Run every game tick (~20 Hz)',          insertText: 'tick' },
  { label: '@watch',          detail: 'Run when a scoreboard objective changes', insertText: 'watch' },
  { label: '@load',           detail: 'Run on /reload (initialization)',        insertText: 'load' },
  { label: '@on_trigger',     detail: 'Run when a player uses /trigger',        insertText: 'on_trigger' },
  { label: '@schedule',       detail: 'Schedule function after N ticks',        insertText: 'schedule' },
  { label: '@coroutine',      detail: 'Spread loop across ticks (batch=N)',      insertText: 'coroutine' },
  { label: '@keep',           detail: 'Prevent dead-code elimination',          insertText: 'keep' },
  { label: '@on',             detail: 'Generic event handler',                  insertText: 'on' },
  { label: '@on_advancement', detail: 'Run on advancement earned',              insertText: 'on_advancement' },
  { label: '@on_craft',       detail: 'Run on item craft',                      insertText: 'on_craft' },
  { label: '@on_death',       detail: 'Run on player death',                    insertText: 'on_death' },
  { label: '@on_join_team',   detail: 'Run on team join',                       insertText: 'on_join_team' },
  { label: '@on_login',       detail: 'Run on player login',                    insertText: 'on_login' },
  { label: '@require_on_load',detail: 'Ensure a fn runs on load (stdlib)',       insertText: 'require_on_load' },
].map(d => ({ ...d, kind: CompletionItemKind.Event }))

/** Entity selector completions triggered by @ inside expressions.
 *  insertText is without '@' (already typed). label has '@' for display. */
const SELECTOR_COMPLETIONS: CompletionItem[] = [
  { label: '@a', insertText: 'a', kind: CompletionItemKind.Value, detail: 'All players',        documentation: 'Targets all online players.' },
  { label: '@p', insertText: 'p', kind: CompletionItemKind.Value, detail: 'Nearest player',     documentation: 'Targets the nearest player to the command source.' },
  { label: '@s', insertText: 's', kind: CompletionItemKind.Value, detail: 'Executing entity',   documentation: 'Targets the entity currently executing the command.' },
  { label: '@e', insertText: 'e', kind: CompletionItemKind.Value, detail: 'All entities',       documentation: 'Targets all entities (use [type=...] to filter).' },
  { label: '@r', insertText: 'r', kind: CompletionItemKind.Value, detail: 'Random player',      documentation: 'Targets a random online player.' },
  { label: '@n', insertText: 'n', kind: CompletionItemKind.Value, detail: 'Nearest entity',     documentation: 'Targets the nearest entity (any type).' },
]

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

  // Also run lint rules and push them as lower-severity diagnostics
  try {
    const filePath = (() => { try { return fileURLToPath(doc.uri) } catch { return doc.uri } })()
    const lintWarnings = lintString(source, filePath)
    diagnostics.push(...lintWarnings.map(lintWarningToDiagnostic))
  } catch { /* lint is best-effort; don't block diagnostics */ }

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

  // ── Selector hover: @a, @p, @s etc ─────────────────────────────────────────
  const SELECTOR_DOCS: Record<string, string> = {
    '@a': 'All online players',
    '@p': 'Nearest player to the command source',
    '@s': 'The entity currently executing the command (self)',
    '@e': 'All entities (use [type=...] to filter)',
    '@r': 'A random online player',
    '@n': 'The nearest entity of any type',
  }
  // Match @x or @x[...] token at cursor
  const selRe = /@([a-zA-Z])/g
  let sm: RegExpExecArray | null
  while ((sm = selRe.exec(lineText)) !== null) {
    const selStart = sm.index
    const selEnd = selStart + sm[0].length
    if (ch >= selStart && ch <= selEnd) {
      const selKey = sm[0] // e.g. '@a'
      const selDoc = SELECTOR_DOCS[selKey]
      if (selDoc) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `**${selKey}** — ${selDoc}`,
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

  // If cursor is on a selector like @s/@a/@p, the word is just 's'/'a'/'p'.
  // Detect this by checking the character before the word start.
  const hovLines = source.split('\n')
  const hovLine = hovLines[params.position.line] ?? ''
  const hovCh = params.position.character
  // Find start of current word
  let hovWordStart = hovCh
  while (hovWordStart > 0 && /\w/.test(hovLine[hovWordStart - 1])) hovWordStart--
  if (hovWordStart > 0 && hovLine[hovWordStart - 1] === '@') return null  // It's a selector, no hover

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
    const rawDoc = extractDocComment(source, fn)
    let docSection = ''
    if (rawDoc) {
      const parsed = parseDocCommentText(rawDoc)
      const md = formatDocCommentMarkdown(parsed)
      if (md) docSection = `\n\n${md}`
    }
    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: `\`\`\`redscript\n${sig}\n\`\`\`${docSection}`,
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

  // Check globals
  const globalDecl = program.globals?.find(g => g.name === word)
  if (globalDecl) {
    const content: MarkupContent = {
      kind: MarkupKind.Markdown,
      value: `\`\`\`redscript\nlet ${globalDecl.name}: ${typeToString(globalDecl.type)}\n\`\`\`\n*global variable*`,
    }
    return { contents: content }
  }

  // Check locals and params in the enclosing function
  {
    const curLine = params.position.line + 1
    const fn = findEnclosingFn(program, curLine)
    if (fn) {
      // Check params
      const param = fn.params.find(p => p.name === word)
      if (param) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `\`\`\`redscript\n(param) ${param.name}: ${typeToString(param.type)}\n\`\`\``,
          } as MarkupContent,
        }
      }
      // Check locals
      if (fn.body) {
        const locals = collectLocals(fn.body as import('../ast/types').Block)
        const localType = locals.get(word)
        if (localType) {
          return {
            contents: {
              kind: MarkupKind.Markdown,
              value: `\`\`\`redscript\nlet ${word}: ${typeToString(localType)}\n\`\`\``,
            } as MarkupContent,
          }
        }
      }
    }
  }

  // ── Check imported files (import "stdlib/xxx.mcrs" and import xxx::*) ──────
  try {
    const importedPrograms = getImportedPrograms(source, params.textDocument.uri)
    for (const { prog, filePath } of importedPrograms) {
      const importedFn = findFunction(prog, word)
      if (importedFn) {
        const sig = formatFnSignature(importedFn)
        // Extract leading /** ... */ comment from the source file
        const docComment = extractDocComment(fs.readFileSync(filePath, 'utf-8'), importedFn)
        const docLine = docComment ? `\n\n${docComment}` : ''
        const content: MarkupContent = {
          kind: MarkupKind.Markdown,
          value: `\`\`\`redscript\n${sig}\n\`\`\`${docLine}\n\n*from ${path.basename(filePath)}*`,
        }
        return { contents: content }
      }
      const importedStruct = prog.structs?.find(s => s.name === word)
      if (importedStruct) {
        const fields = importedStruct.fields.map(f => `  ${f.name}: ${typeToString(f.type)}`).join('\n')
        const content: MarkupContent = {
          kind: MarkupKind.Markdown,
          value: `\`\`\`redscript\nstruct ${importedStruct.name} {\n${fields}\n}\n\`\`\`\n\n*from ${path.basename(filePath)}*`,
        }
        return { contents: content }
      }
    }
  } catch { /* ignore */ }

  return null
})

// ---------------------------------------------------------------------------
// Go-to-definition
// ---------------------------------------------------------------------------

/**
 * Parse all import declarations in `source` (both path-based and module::*
 * forms) and return parsed Program objects for each resolved file.
 */
function getImportedPrograms(source: string, fromUri: string): Array<{ prog: import('../ast/types').Program; filePath: string }> {
  const result: Array<{ prog: import('../ast/types').Program; filePath: string }> = []
  // 1. Path-based: import "stdlib/math.mcrs"
  const FILE_IMPORT_RE = /^import\s+"([^"]+)"/gm
  let m: RegExpExecArray | null
  while ((m = FILE_IMPORT_RE.exec(source)) !== null) {
    const resolved = resolveImportPath(m[1], fromUri)
    if (!resolved || !fs.existsSync(resolved)) continue
    try {
      const src = fs.readFileSync(resolved, 'utf-8')
      const tokens = new Lexer(src).tokenize()
      const prog = new Parser(tokens).parse(path.basename(resolved, '.mcrs'))
      result.push({ prog, filePath: resolved })
    } catch { /* skip */ }
  }
  // 2. Module-star: import random::* or import random::fn_name
  const MOD_IMPORT_RE = /^import\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*::/gm
  while ((m = MOD_IMPORT_RE.exec(source)) !== null) {
    const modName = m[1]
    // Try to resolve as stdlib/modName.mcrs
    const resolved = resolveImportPath(`stdlib/${modName}.mcrs`, fromUri)
    if (!resolved || !fs.existsSync(resolved)) continue
    // Avoid duplicates if already resolved above
    if (result.some(r => r.filePath === resolved)) continue
    try {
      const src = fs.readFileSync(resolved, 'utf-8')
      const tokens = new Lexer(src).tokenize()
      const prog = new Parser(tokens).parse(modName)
      result.push({ prog, filePath: resolved })
    } catch { /* skip */ }
  }
  return result
}

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

  // If cursor is on a selector like @s/@a, the word is 's'/'a' — no F12.
  let defWordStart = params.position.character
  while (defWordStart > 0 && /\w/.test(lineText[defWordStart - 1])) defWordStart--
  if (defWordStart > 0 && lineText[defWordStart - 1] === '@') return null

  // ── Normal in-file definition (top-level fn/struct/const/global) ────────────
  const defMap = buildDefinitionMap(program, source)
  const span = defMap.get(word)
  if (span) {
    const line = Math.max(0, span.line - 1)
    const col  = Math.max(0, span.col  - 1)
    return {
      uri: params.textDocument.uri,
      range: {
        start: { line, character: col },
        end:   { line, character: col + word.length },
      },
    }
  }

  // ── If word is a local/param in the enclosing fn, don't fall through to imports ──
  const defCurLine = params.position.line + 1 // 1-based
  const enclosingFn = findEnclosingFn(program, defCurLine)
  if (enclosingFn) {
    if (enclosingFn.params.some(p => p.name === word)) return null
    if (enclosingFn.body) {
      const locals = collectLocals(enclosingFn.body as import('../ast/types').Block)
      if (locals.has(word)) return null
    }
  }
  // Struct fields — clicking on .phase, .active etc. should not jump to stdlib
  for (const s of program.structs ?? []) {
    if (s.fields.some(f => f.name === word)) return null
  }

  // ── Imported symbol F12 — jump to definition inside the imported file ────────
  // Only reached if word is not a local. Avoids false matches for short names like 'p', 'k'.
  try {
    const importedPrograms = getImportedPrograms(source, params.textDocument.uri)
    for (const { prog, filePath } of importedPrograms) {
      const importedDefMap = buildDefinitionMap(prog, fs.readFileSync(filePath, 'utf-8'))
      const importedSpan = importedDefMap.get(word)
      if (importedSpan) {
        const line = Math.max(0, importedSpan.line - 1)
        const col  = Math.max(0, importedSpan.col  - 1)
        return {
          uri: pathToFileURL(filePath).toString(),
          range: {
            start: { line, character: col },
            end:   { line, character: col + word.length },
          },
        }
      }
    }
  } catch { /* ignore */ }

  // ── import module::symbol (legacy AST imports) — open module file ONLY for explicit symbols ──
  // NOTE: do NOT match im.symbol === '*' — that would cause any word to jump to the first import!
  const importDecl = program.imports?.find(im => im.symbol === word)
  if (importDecl) {
    const resolved = resolveImportPath(`stdlib/${importDecl.moduleName}.mcrs`, params.textDocument.uri)
      ?? resolveImportPath(importDecl.moduleName, params.textDocument.uri)
      ?? resolveImportPath(importDecl.moduleName + '.mcrs', params.textDocument.uri)
    if (resolved) {
      return {
        uri: pathToFileURL(resolved).toString(),
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      }
    }
  }

  return null
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
  // Sentinel type for variables whose type is unknown (e.g. foreach bindings)
  const ENTITY_TYPE: TypeNode = { kind: 'named', name: 'int' } // placeholder for entity/selector binding
  function walk(stmts: Block): void {
    for (const s of stmts) {
      if (s.kind === 'let' && s.type) {
        map.set(s.name, s.type)
      } else if (s.kind === 'foreach') {
        // foreach binding is an entity/selector variable
        map.set((s as any).binding, ENTITY_TYPE)
        if (Array.isArray((s as any).body)) walk((s as any).body as Block)
        continue
      } else if (s.kind === 'for') {
        // for i in range — binding is int
        if ((s as any).binding) map.set((s as any).binding, { kind: 'named', name: 'int' })
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

  // ── @ trigger: selector (@a/@p/@s/@e/@r/@n) vs decorator (@tick etc) ────────
  // Only fires when the character just typed is '@' (triggerCharacter).
  // insertText includes the full @xxx so VSCode replaces the '@' already on screen.
  const prevChar = lineText[charPos - 1]
  if (prevChar === '@') {
    const before = lineText.slice(0, charPos - 1).trim()
    const isExprContext = before.length > 0 && !/^(fn|let|if|while|for|return|@)/.test(before.split(/\s+/).pop() ?? '')
    if (isExprContext) {
      return SELECTOR_COMPLETIONS
    }
    return DECORATOR_COMPLETIONS
  }

  // ── Dot-access completion ──────────────────────────────────────────────────
  const dotReceiver = getDotReceiver(lineText, charPos)
  if (dotReceiver !== null) {
    const items: CompletionItem[] = []

    if (program) {
      // Find which function body contains this line (by span)
      const curLine = params.position.line + 1 // spans are 1-based
      const encFn = findEnclosingFn(program, curLine)
      const locals: Map<string, TypeNode> | null = encFn?.body
        ? collectLocals(encFn.body as Block)
        : null

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
    const curLine2 = params.position.line + 1
    const encFn2 = findEnclosingFn(program, curLine2)
    if (encFn2?.body) {
      for (const [name, typ] of collectLocals(encFn2.body as Block)) {
        items.push({
          label: name,
          kind: CompletionItemKind.Variable,
          detail: typeToString(typ),
        })
      }
    }
  }

  // ── Functions from imported files (both "path" and module::* forms) ────────
  try {
    const importedPrograms = getImportedPrograms(source, params.textDocument.uri)
    for (const { prog, filePath } of importedPrograms) {
      for (const fn of prog.declarations) {
        const paramList = fn.params.map(p => `${p.name}: ${typeToString(p.type)}`).join(', ')
        items.push({
          label: fn.name,
          kind: CompletionItemKind.Function,
          detail: `(${paramList}) → ${typeToString(fn.returnType ?? { kind: 'named', name: 'void' })}`,
          documentation: `from ${path.basename(filePath)}`,
        })
      }
      for (const s of prog.structs ?? []) {
        items.push({ label: s.name, kind: CompletionItemKind.Struct, documentation: `from ${path.basename(filePath)}` })
      }
    }
  } catch { /* ignore import completion errors */ }

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

    // Walk all let declarations with no explicit type annotation and emit inlay hints.
    // Since TypeChecker doesn't attach inferredType to AST nodes, we use collectLocals
    // which already infers types from init expressions.
    function walkBlock(stmts: import('../ast/types').Stmt[]): void {
      // Build a locals map for this block (includes inferred types)
      const locals = collectLocals(stmts as import('../ast/types').Block)

      for (const stmt of stmts) {
        if (stmt.kind === 'let' && !stmt.type) {
          // No explicit type annotation — show inferred type as inlay hint
          const inferredType = locals.get(stmt.name)
          if (!inferredType) continue
          const spanVal = (stmt as { span?: { line: number; col: number } }).span
          if (!spanVal) continue
          // Position hint after the variable name: line is 1-based in span, col is 1-based
          const line = Math.max(0, spanVal.line - 1)
          // Find the position after the variable name on that line
          const lineText = source.split('\n')[line] ?? ''
          const nameEnd = lineText.indexOf(stmt.name) + stmt.name.length
          hints.push({
            position: { line, character: nameEnd },
            label: `: ${typeToString(inferredType)}`,
            kind: InlayHintKind.Type,
            paddingLeft: false,
          })
        }
        // Recurse into nested blocks — use discriminated union narrowing (no casts needed)
        if (stmt.kind === 'if' || stmt.kind === 'if_let_some') {
          walkBlock(stmt.then)
          if (stmt.else_) walkBlock(stmt.else_)
        } else if (
          stmt.kind === 'while' ||
          stmt.kind === 'do_while' ||
          stmt.kind === 'repeat' ||
          stmt.kind === 'for' ||
          stmt.kind === 'foreach' ||
          stmt.kind === 'for_range' ||
          stmt.kind === 'for_in_array' ||
          stmt.kind === 'for_each' ||
          stmt.kind === 'while_let_some' ||
          stmt.kind === 'as_block' ||
          stmt.kind === 'at_block' ||
          stmt.kind === 'as_at' ||
          stmt.kind === 'execute'
        ) {
          walkBlock(stmt.body)
        } else if (stmt.kind === 'labeled_loop') {
          // labeled_loop wraps a single Stmt, not a Block — recurse via a one-element array
          walkBlock([stmt.body])
        } else if (stmt.kind === 'match') {
          for (const arm of stmt.arms) walkBlock(arm.body)
        }
      }
    }

    const source = doc.getText()
    parsed.program.declarations.forEach(top => {
      if (top.body) walkBlock(top.body as import('../ast/types').Stmt[])
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
  const parsed = parsedDocs.get(params.textDocument.uri)
  if (!parsed?.program) return null
  return buildRenameWorkspaceEdit(doc, parsed.program, params.position, params.newName)
})

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

documents.listen(connection)
connection.listen()
