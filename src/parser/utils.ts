/**
 * Parser utilities — base class with token navigation, error handling,
 * and shared constants used by all sub-parsers.
 */

import { Lexer, type Token, type TokenKind } from '../lexer'
import type { Span } from '../ast/types'
import { DiagnosticError } from '../diagnostics'

// ---------------------------------------------------------------------------
// Operator Precedence (higher = binds tighter)
// ---------------------------------------------------------------------------

export const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3, '!=': 3,
  '<': 4, '<=': 4, '>': 4, '>=': 4, 'is': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6,
}

export const BINARY_OPS = new Set(['||', '&&', '==', '!=', '<', '<=', '>', '>=', 'is', '+', '-', '*', '/', '%'])

export type { Lexer }

// ---------------------------------------------------------------------------
// ParserBase — token navigation, error reporting, span attachment
// ---------------------------------------------------------------------------

export class ParserBase {
  protected tokens: Token[]
  protected pos: number = 0
  protected sourceLines: string[]
  protected filePath?: string
  /** Set to true once `module library;` is seen. */
  protected inLibraryMode: boolean = false
  /** Warnings accumulated during parsing (e.g. deprecated keyword usage). */
  readonly warnings: string[] = []
  /** Parse errors collected during error-recovery mode. */
  readonly parseErrors: DiagnosticError[] = []

  constructor(tokens: Token[], source?: string, filePath?: string) {
    this.tokens = tokens
    this.sourceLines = source?.split('\n') ?? []
    this.filePath = filePath
  }

  // -------------------------------------------------------------------------
  // Token navigation
  // -------------------------------------------------------------------------

  peek(offset = 0): Token {
    const idx = this.pos + offset
    if (idx >= this.tokens.length) {
      return this.tokens[this.tokens.length - 1] // eof
    }
    return this.tokens[idx]
  }

  advance(): Token {
    const token = this.tokens[this.pos]
    if (token.kind !== 'eof') this.pos++
    return token
  }

  check(kind: TokenKind): boolean {
    return this.peek().kind === kind
  }

  match(...kinds: TokenKind[]): boolean {
    for (const kind of kinds) {
      if (this.check(kind)) {
        this.advance()
        return true
      }
    }
    return false
  }

  expect(kind: TokenKind): Token {
    const token = this.peek()
    if (token.kind !== kind) {
      throw new DiagnosticError(
        'ParseError',
        `Expected '${kind}' but got '${token.kind}'`,
        { file: this.filePath, line: token.line, col: token.col },
        this.sourceLines
      )
    }
    return this.advance()
  }

  error(message: string): never {
    const token = this.peek()
    throw new DiagnosticError(
      'ParseError',
      message,
      { file: this.filePath, line: token.line, col: token.col },
      this.sourceLines
    )
  }

  withLoc<T extends object>(node: T, token: Token): T {
    const span: Span = { line: token.line, col: token.col }
    Object.defineProperty(node, 'span', {
      value: span,
      enumerable: false,
      configurable: true,
      writable: true,
    })
    return node
  }

  getLocToken(node: object): Token | null {
    const span = (node as { span?: Span }).span
    if (!span) {
      return null
    }
    return { kind: 'eof', value: '', line: span.line, col: span.col }
  }

  checkIdent(value: string): boolean {
    return this.check('ident') && this.peek().value === value
  }

  // -------------------------------------------------------------------------
  // Error Recovery
  // -------------------------------------------------------------------------

  syncToNextDecl(): void {
    const TOP_LEVEL_KEYWORDS = new Set([
      'fn', 'struct', 'impl', 'enum', 'const', 'let', 'export', 'declare', 'import', 'namespace', 'module'
    ])
    while (!this.check('eof')) {
      const kind = this.peek().kind
      if (kind === '}') {
        this.advance()
        return
      }
      if (TOP_LEVEL_KEYWORDS.has(kind)) {
        return
      }
      if (kind === 'ident' && this.peek().value === 'import') {
        return
      }
      this.advance()
    }
  }

  syncToNextStmt(): void {
    while (!this.check('eof')) {
      const kind = this.peek().kind
      if (kind === ';') {
        this.advance()
        return
      }
      if (kind === '}') {
        return
      }
      this.advance()
    }
  }

  // -------------------------------------------------------------------------
  // Sub-parser helper (used by string interpolation)
  // -------------------------------------------------------------------------

  protected makeSubParser(source: string): ParserBase {
    const tokens = new Lexer(source, this.filePath).tokenize()
    return new ParserBase(tokens, source, this.filePath)
  }
}
