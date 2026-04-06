import type { Block, Expr, Program, Stmt } from './ast/types'
import { DiagnosticError } from './diagnostics'
import { Lexer, type Token } from './lexer'
import { lintSource } from './lint/index'
import { Parser } from './parser'
import { lowerToHIR } from './hir/lower'

export interface CheckFixSummary {
  removedUnusedImports: number
  removedDeadBranches: number
  annotatedMagicNumbers: number
}

interface TextEdit {
  start: number
  end: number
  replacement: string
}

interface StatementRange {
  start: number
  end: number
  endTokenIndex: number
  thenBraceStart: number
  thenBraceEnd: number
  elseToken?: number
  elseBranchStart?: number
  elseBranchEnd?: number
  elseIsIf?: boolean
}

export function applyCheckFixes(source: string, filePath: string, namespace = 'redscript'): {
  source: string
  summary: CheckFixSummary
} {
  const firstPass = parseSource(source, namespace, filePath)
  const structuralEdits: TextEdit[] = []

  for (const warning of firstPass.warnings) {
    if (warning.rule !== 'unused-import' || warning.line == null) continue
    const lineRange = getFullLineRange(source, warning.line)
    structuralEdits.push({ start: lineRange.start, end: lineRange.end, replacement: '' })
  }

  const branchEdits = collectDeadBranchEdits(source, firstPass.program, firstPass.tokens)
  structuralEdits.push(...branchEdits)

  const filteredEdits = filterOverlappingEdits(structuralEdits)
  const structurallyFixed = applyEdits(source, filteredEdits)

  const secondPass = parseSource(structurallyFixed, namespace, filePath)
  const annotated = annotateMagicNumbers(structurallyFixed, secondPass.warnings)

  return {
    source: annotated.source,
    summary: {
      removedUnusedImports: firstPass.warnings.filter(w => w.rule === 'unused-import').length,
      removedDeadBranches: branchEdits.length,
      annotatedMagicNumbers: annotated.count,
    },
  }
}

function parseSource(source: string, namespace: string, filePath: string): {
  program: Program
  tokens: Token[]
  warnings: ReturnType<typeof lintSource>
} {
  const lexer = new Lexer(source, filePath)
  const tokens = lexer.tokenize()
  const parser = new Parser(tokens, source, filePath)
  const program = parser.parse(namespace)
  const hir = lowerToHIR(program)
  const warnings = lintSource(source, program.imports, hir, { filePath })
  return { program, tokens, warnings }
}

function collectDeadBranchEdits(source: string, program: Program, tokens: Token[]): TextEdit[] {
  const edits: TextEdit[] = []
  const pushFromBlock = (block: Block): void => {
    for (const stmt of block) {
      pushFromStmt(stmt)
    }
  }
  const pushFromStmt = (stmt: Stmt): void => {
    if (stmt.kind === 'if') {
      const constResult = evaluateConstBool(stmt.cond)
      if (constResult !== null && stmt.span) {
        const range = findStatementRange(source, tokens, stmt.span.line, stmt.span.col)
        const replacement = constResult
          ? extractBlockReplacement(source, tokens[range.thenBraceStart], tokens[range.thenBraceEnd], getLineIndent(source, stmt.span.line))
          : extractElseReplacement(source, tokens, range, getLineIndent(source, stmt.span.line))
        edits.push({ start: range.start, end: range.end, replacement })
      }
      pushFromBlock(stmt.then)
      if (stmt.else_) pushFromBlock(stmt.else_)
      return
    }

    switch (stmt.kind) {
      case 'while':
      case 'do_while':
      case 'repeat':
      case 'foreach':
      case 'for_range':
      case 'for_in_array':
      case 'for_each':
      case 'as_block':
      case 'at_block':
      case 'execute':
      case 'while_let_some':
        pushFromBlock(stmt.body)
        break
      case 'for':
        pushFromBlock(stmt.body)
        break
      case 'match':
        for (const arm of stmt.arms) pushFromBlock(arm.body)
        break
      case 'if_let_some':
        pushFromBlock(stmt.then)
        if (stmt.else_) pushFromBlock(stmt.else_)
        break
      case 'labeled_loop':
        pushFromStmt(stmt.body)
        break
      default:
        break
    }
  }

  for (const fn of program.declarations) pushFromBlock(fn.body)
  for (const impl of program.implBlocks) {
    for (const method of impl.methods) pushFromBlock(method.body)
  }

  return filterOverlappingEdits(edits)
}

function evaluateConstBool(expr: Expr): boolean | null {
  if (expr.kind === 'bool_lit') return expr.value

  if (expr.kind === 'binary') {
    const leftNum = evaluateConstNumber(expr.left)
    const rightNum = evaluateConstNumber(expr.right)
    if (leftNum !== null && rightNum !== null) {
      switch (expr.op) {
        case '==': return leftNum === rightNum
        case '!=': return leftNum !== rightNum
        case '<': return leftNum < rightNum
        case '<=': return leftNum <= rightNum
        case '>': return leftNum > rightNum
        case '>=': return leftNum >= rightNum
      }
    }

    const leftBool = evaluateConstBool(expr.left)
    const rightBool = evaluateConstBool(expr.right)
    if (leftBool !== null && rightBool !== null) {
      if (expr.op === '==') return leftBool === rightBool
      if (expr.op === '!=') return leftBool !== rightBool
    }
  }

  return null
}

function evaluateConstNumber(expr: Expr): number | null {
  switch (expr.kind) {
    case 'int_lit':
    case 'float_lit':
    case 'byte_lit':
    case 'short_lit':
    case 'long_lit':
    case 'double_lit':
      return expr.value
    default:
      return null
  }
}

function findStatementRange(source: string, tokens: Token[], line: number, col: number): StatementRange {
  const startTokenIndex = tokens.findIndex(token => token.line === line && token.col === col && token.kind === 'if')
  if (startTokenIndex === -1) {
    throw new DiagnosticError('LoweringError', `Could not locate if statement`, { line, col })
  }

  const thenBraceStart = findThenBraceStart(tokens, startTokenIndex)
  const thenBraceEnd = findMatchingBrace(tokens, thenBraceStart)
  const afterThen = thenBraceEnd + 1
  const statementStart = getLineStartOffset(source, line)

  if (tokens[afterThen]?.kind === 'else') {
    if (tokens[afterThen + 1]?.kind === 'if') {
      const nested = findStatementRange(source, tokens, tokens[afterThen + 1].line, tokens[afterThen + 1].col)
      return {
        start: statementStart,
        end: getLineEndOffset(source, tokens[nested.endTokenIndex].line),
        endTokenIndex: nested.endTokenIndex,
        thenBraceStart,
        thenBraceEnd,
        elseToken: afterThen,
        elseBranchStart: afterThen + 1,
        elseBranchEnd: nested.endTokenIndex,
        elseIsIf: true,
      }
    }

    const elseBraceStart = afterThen + 1
    const elseBraceEnd = findMatchingBrace(tokens, elseBraceStart)
    return {
      start: statementStart,
      end: getLineEndOffset(source, tokens[elseBraceEnd].line),
      endTokenIndex: elseBraceEnd,
      thenBraceStart,
      thenBraceEnd,
      elseToken: afterThen,
      elseBranchStart: elseBraceStart,
      elseBranchEnd: elseBraceEnd,
      elseIsIf: false,
    }
  }

  return {
    start: statementStart,
    end: getLineEndOffset(source, tokens[thenBraceEnd].line),
    endTokenIndex: thenBraceEnd,
    thenBraceStart,
    thenBraceEnd,
  }
}

function findThenBraceStart(tokens: Token[], startIndex: number): number {
  let parenDepth = 0
  for (let i = startIndex + 1; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.kind === '(') {
      parenDepth++
    } else if (token.kind === ')') {
      parenDepth--
    } else if (token.kind === '{' && parenDepth === 0) {
      return i
    }
  }
  throw new DiagnosticError('LoweringError', `Could not locate block for if statement`, { line: tokens[startIndex].line, col: tokens[startIndex].col })
}

function findMatchingBrace(tokens: Token[], openBraceIndex: number): number {
  let depth = 0
  for (let i = openBraceIndex; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.kind === '{') depth++
    if (token.kind === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  throw new DiagnosticError('LoweringError', `Unmatched '{'`, { line: tokens[openBraceIndex].line, col: tokens[openBraceIndex].col })
}

function extractElseReplacement(source: string, tokens: Token[], range: StatementRange, baseIndent: string): string {
  if (range.elseBranchStart == null || range.elseBranchEnd == null) {
    return ''
  }

  if (range.elseIsIf && range.elseToken != null) {
    const startToken = tokens[range.elseToken]
    const endToken = tokens[range.elseBranchEnd]
    const text = source.slice(offsetFromLineCol(source, startToken.line, startToken.col), getLineEndOffset(source, endToken.line))
    return normalizeElseIfSnippet(text, baseIndent)
  }

  return extractBlockReplacement(source, tokens[range.elseBranchStart], tokens[range.elseBranchEnd], baseIndent)
}

function extractBlockReplacement(source: string, openBrace: Token, closeBrace: Token, baseIndent: string): string {
  const openOffset = offsetFromLineCol(source, openBrace.line, openBrace.col) + openBrace.value.length
  const closeOffset = offsetFromLineCol(source, closeBrace.line, closeBrace.col)
  const blockBody = source.slice(openOffset, closeOffset)
  const normalized = normalizeBlockBody(blockBody, baseIndent)
  return normalized.length > 0 ? `${normalized}\n` : ''
}

function normalizeBlockBody(blockBody: string, baseIndent: string): string {
  const lines = blockBody.split('\n')
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length === 0) return ''

  const nonEmpty = lines.filter(line => line.trim().length > 0)
  const commonIndent = nonEmpty.reduce((current, line) => {
    const indent = line.match(/^\s*/)?.[0] ?? ''
    if (current === null) return indent
    return indent.length < current.length ? indent : current
  }, null as string | null) ?? ''

  return lines
    .map(line => {
      if (line.trim().length === 0) return ''
      const stripped = commonIndent && line.startsWith(commonIndent) ? line.slice(commonIndent.length) : line.trimStart()
      return `${baseIndent}${stripped}`
    })
    .join('\n')
}

function reindentSnippet(text: string, baseIndent: string): string {
  const lines = text.split('\n')
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length === 0) return ''

  const nonEmpty = lines.filter(line => line.trim().length > 0)
  const commonIndent = nonEmpty.reduce((current, line) => {
    const indent = line.match(/^\s*/)?.[0] ?? ''
    if (current === null) return indent
    return indent.length < current.length ? indent : current
  }, null as string | null) ?? ''

  return `${lines
    .map(line => {
      if (line.trim().length === 0) return ''
      const stripped = commonIndent && line.startsWith(commonIndent) ? line.slice(commonIndent.length) : line.trimStart()
      return `${baseIndent}${stripped}`
    })
    .join('\n')}\n`
}

function normalizeElseIfSnippet(text: string, baseIndent: string): string {
  const lines = text.split('\n')
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  if (lines.length === 0) return ''

  const firstLine = `${baseIndent}${lines[0].replace(/^else\s+/, '')}`
  const rest = lines.slice(1)
  const nonEmptyRest = rest.filter(line => line.trim().length > 0)
  const commonIndent = nonEmptyRest.reduce((current, line) => {
    const indent = line.match(/^\s*/)?.[0] ?? ''
    if (current === null) return indent
    return indent.length < current.length ? indent : current
  }, null as string | null) ?? ''

  const normalizedRest = rest.map(line => {
    if (line.trim().length === 0) return ''
    const stripped = commonIndent && line.startsWith(commonIndent) ? line.slice(commonIndent.length) : line.trimStart()
    return `${baseIndent}${stripped}`
  })

  return `${[firstLine, ...normalizedRest].join('\n')}\n`
}

function annotateMagicNumbers(source: string, warnings: ReturnType<typeof lintSource>): { source: string; count: number } {
  const lines = source.split('\n')
  const targetLines = Array.from(new Set(
    warnings
      .filter(w => w.rule === 'magic-number' && w.line != null)
      .map(w => w.line as number)
  )).sort((a, b) => a - b)

  let count = 0
  for (const lineNumber of targetLines) {
    const index = lineNumber - 1
    if (index < 0 || index >= lines.length) continue
    if (lines[index].includes('FIXME: consider const')) continue
    lines[index] = `${lines[index]} // FIXME: consider const`
    count++
  }

  return { source: lines.join('\n'), count }
}

function filterOverlappingEdits(edits: TextEdit[]): TextEdit[] {
  const sorted = [...edits].sort((a, b) => a.start - b.start || b.end - a.end)
  const filtered: TextEdit[] = []

  for (const edit of sorted) {
    const last = filtered[filtered.length - 1]
    if (last && edit.start < last.end) continue
    filtered.push(edit)
  }

  return filtered
}

function applyEdits(source: string, edits: TextEdit[]): string {
  return [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce((current, edit) => current.slice(0, edit.start) + edit.replacement + current.slice(edit.end), source)
}

function getFullLineRange(source: string, line: number): { start: number; end: number } {
  return {
    start: getLineStartOffset(source, line),
    end: getLineEndOffset(source, line),
  }
}

function getLineStartOffset(source: string, line: number): number {
  return offsetFromLineCol(source, line, 1)
}

function getLineEndOffset(source: string, line: number): number {
  const lines = source.split('\n')
  let offset = 0
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    offset += lines[i].length + 1
  }
  if (line - 1 < lines.length) {
    offset += lines[line - 1].length
    if (line < lines.length) offset += 1
  }
  return offset
}

function offsetFromLineCol(source: string, line: number, col: number): number {
  const lines = source.split('\n')
  let offset = 0
  for (let i = 0; i < line - 1 && i < lines.length; i++) {
    offset += lines[i].length + 1
  }
  return offset + col - 1
}

function getLineIndent(source: string, line: number): string {
  const content = source.split('\n')[line - 1] ?? ''
  return content.match(/^\s*/)?.[0] ?? ''
}
