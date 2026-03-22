/**
 * LSP Hover Doc Comment Tests
 *
 * Verifies that hovering over a function name returns its /// doc comments
 * formatted as Markdown (description + @param + @returns sections).
 *
 * Tests use helper logic mirrored from lsp/server.ts so they run without
 * spawning a full stdio LSP server.
 */

import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import type { Program, FnDecl, TypeNode } from '../../ast/types'
import type { Position } from 'vscode-languageserver/node'
import { MarkupKind } from 'vscode-languageserver/node'

// ---------------------------------------------------------------------------
// Mirrored helpers (subset of server.ts)
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
    default: return 'unknown'
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

function findFunction(program: Program, name: string): FnDecl | undefined {
  const fn = program.declarations.find(f => f.name === name)
  if (fn) return fn
  for (const impl of program.implBlocks ?? []) {
    const m = impl.methods.find(f => f.name === name)
    if (m) return m
  }
  return undefined
}

function extractDocComment(source: string, fn: FnDecl): string | null {
  if (!fn.span) return null
  const lines = source.split('\n')
  let endLine = fn.span.line - 2
  if (endLine < 0) return null
  while (endLine >= 0 && lines[endLine].trim() === '') endLine--
  if (endLine < 0) return null

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

interface ParsedDocComment {
  description: string
  params: Array<{ name: string; doc: string }>
  returns: string | null
}

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
    if (/^@\w+/.test(line.trim())) continue
    descLines.push(line)
  }
  result.description = descLines.join('\n').trim()
  return result
}

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

/** Simulate hover for a given word/position in source. Returns markdown string or null. */
function simulateHover(source: string, position: Position): string | null {
  const tokens = new Lexer(source).tokenize()
  const program = new Parser(tokens, source, 'test').parse('test')

  const word = wordAt(source, position)
  if (!word) return null

  const fn = findFunction(program, word)
  if (!fn) return null

  const sig = formatFnSignature(fn)
  const rawDoc = extractDocComment(source, fn)
  let docSection = ''
  if (rawDoc) {
    const parsed = parseDocCommentText(rawDoc)
    const md = formatDocCommentMarkdown(parsed)
    if (md) docSection = `\n\n${md}`
  }
  return `\`\`\`redscript\n${sig}\n\`\`\`${docSection}`
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LSP hover: /// doc comments', () => {
  test('hover on function without docs shows signature only', () => {
    const source = `fn add(a: int, b: int): int { return a + b }`
    const result = simulateHover(source, { line: 0, character: 3 })
    expect(result).not.toBeNull()
    expect(result).toContain('fn add(a: int, b: int): int')
    expect(result).not.toContain('**Parameters:**')
  })

  test('hover shows description from /// comment', () => {
    const source = [
      '/// Adds two integers together.',
      'fn add(a: int, b: int): int { return a + b }',
    ].join('\n')
    const result = simulateHover(source, { line: 1, character: 3 })
    expect(result).not.toBeNull()
    expect(result).toContain('Adds two integers together.')
  })

  test('hover shows @param annotations', () => {
    const source = [
      '/// Multiply two numbers.',
      '/// @param x The first factor',
      '/// @param y The second factor',
      'fn multiply(x: int, y: int): int { return x }',
    ].join('\n')
    const result = simulateHover(source, { line: 3, character: 3 })
    expect(result).not.toBeNull()
    expect(result).toContain('**Parameters:**')
    expect(result).toContain('`x` — The first factor')
    expect(result).toContain('`y` — The second factor')
  })

  test('hover shows @returns annotation', () => {
    const source = [
      '/// Compute the maximum of two values.',
      '/// @param a First value',
      '/// @param b Second value',
      '/// @returns The larger of a and b',
      'fn max_val(a: int, b: int): int { return a }',
    ].join('\n')
    const result = simulateHover(source, { line: 4, character: 3 })
    expect(result).not.toBeNull()
    expect(result).toContain('**Returns:** The larger of a and b')
  })

  test('hover on function call site also shows docs', () => {
    const source = [
      '/// Greet a player.',
      '/// @param name The player name',
      'fn greet(name: string): void {}',
      'fn main(): void { greet("Alice") }',
    ].join('\n')
    // Hover over 'greet' on the call site (line 3)
    const result = simulateHover(source, { line: 3, character: 18 })
    expect(result).not.toBeNull()
    expect(result).toContain('Greet a player.')
    expect(result).toContain('`name` — The player name')
  })
})
