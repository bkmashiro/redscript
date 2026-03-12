/**
 * RedScript Lexer
 *
 * Tokenizes RedScript source code into a stream of tokens.
 * Handles special cases like entity selectors vs decorators,
 * range literals, and raw commands.
 */

import { DiagnosticError } from '../diagnostics'

// ---------------------------------------------------------------------------
// Token Types
// ---------------------------------------------------------------------------

export type TokenKind =
  // Keywords
  | 'fn' | 'let' | 'const' | 'if' | 'else' | 'while' | 'for' | 'foreach' | 'match'
  | 'return' | 'as' | 'at' | 'in' | 'struct' | 'enum' | 'trigger' | 'namespace'
  | 'execute' | 'run' | 'unless'
  // Types
  | 'int' | 'bool' | 'float' | 'string' | 'void'
  | 'BlockPos'
  // Boolean literals
  | 'true' | 'false'
  // Entity selector
  | 'selector'      // @a @e @s @p @r @n (with optional [...] params)
  // Decorator
  | 'decorator'     // @tick @on_trigger @tick(rate=N)
  // Literals
  | 'int_lit'       // 42
  | 'float_lit'     // 3.14
  | 'byte_lit'      // 20b
  | 'short_lit'     // 100s
  | 'long_lit'      // 1000L
  | 'double_lit'    // 3.14d
  | 'string_lit'    // "hello"
  | 'range_lit'     // ..5  1..  1..10
  // Operators
  | '+' | '-' | '*' | '/' | '%'
  | '~' | '^'
  | '==' | '!=' | '<' | '<=' | '>' | '>='
  | '&&' | '||' | '!'
  | '=' | '+=' | '-=' | '*=' | '/=' | '%='
  // Delimiters
  | '{' | '}' | '(' | ')' | '[' | ']'
  | ',' | ';' | ':' | '::' | '->' | '=>' | '.'
  // Special
  | 'ident'         // Variable/function names
  | 'mc_name'       // #objective, #tag, #team — unquoted MC identifier
  | 'raw_cmd'       // raw("...") content
  | 'eof'

export interface Token {
  kind: TokenKind
  value: string     // Original text
  line: number
  col: number
}

// ---------------------------------------------------------------------------
// Keywords Map
// ---------------------------------------------------------------------------

const KEYWORDS: Record<string, TokenKind> = {
  fn: 'fn',
  let: 'let',
  const: 'const',
  if: 'if',
  else: 'else',
  while: 'while',
  for: 'for',
  foreach: 'foreach',
  match: 'match',
  return: 'return',
  as: 'as',
  at: 'at',
  in: 'in',
  struct: 'struct',
  enum: 'enum',
  trigger: 'trigger',
  namespace: 'namespace',
  execute: 'execute',
  run: 'run',
  unless: 'unless',
  int: 'int',
  bool: 'bool',
  float: 'float',
  string: 'string',
  void: 'void',
  BlockPos: 'BlockPos',
  true: 'true',
  false: 'false',
}

// Entity selector base characters
const SELECTOR_CHARS = new Set(['a', 'e', 's', 'p', 'r', 'n'])

// ---------------------------------------------------------------------------
// Lexer Class
// ---------------------------------------------------------------------------

export class Lexer {
  private source: string
  private sourceLines: string[]
  private pos: number = 0
  private line: number = 1
  private col: number = 1
  private tokens: Token[] = []
  private filePath?: string

  constructor(source: string, filePath?: string) {
    this.source = source
    this.sourceLines = source.split('\n')
    this.filePath = filePath
  }

  private error(message: string, line?: number, col?: number): never {
    throw new DiagnosticError(
      'LexError',
      message,
      { file: this.filePath, line: line ?? this.line, col: col ?? this.col },
      this.sourceLines
    )
  }

  tokenize(): Token[] {
    while (!this.isAtEnd()) {
      this.scanToken()
    }
    this.tokens.push({ kind: 'eof', value: '', line: this.line, col: this.col })
    return this.tokens
  }

  private isAtEnd(): boolean {
    return this.pos >= this.source.length
  }

  private peek(offset = 0): string {
    const idx = this.pos + offset
    if (idx >= this.source.length) return '\0'
    return this.source[idx]
  }

  private advance(): string {
    const char = this.source[this.pos++]
    if (char === '\n') {
      this.line++
      this.col = 1
    } else {
      this.col++
    }
    return char
  }

  private addToken(kind: TokenKind, value: string, line: number, col: number): void {
    this.tokens.push({ kind, value, line, col })
  }

  private scanToken(): void {
    const startLine = this.line
    const startCol = this.col

    const char = this.advance()

    // Whitespace
    if (/\s/.test(char)) return

    // Comments
    if (char === '/' && this.peek() === '/') {
      // Skip to end of line
      while (!this.isAtEnd() && this.peek() !== '\n') {
        this.advance()
      }
      return
    }

    // Block comments: /* ... */ and /** ... */
    if (char === '/' && this.peek() === '*') {
      this.advance() // consume '*'
      while (!this.isAtEnd()) {
        if (this.peek() === '*' && this.peek(1) === '/') {
          this.advance() // consume '*'
          this.advance() // consume '/'
          break
        }
        this.advance()
      }
      return
    }

    // Two-character operators
    if (char === '-' && this.peek() === '>') {
      this.advance()
      this.addToken('->', '->', startLine, startCol)
      return
    }
    if (char === '=' && this.peek() === '>') {
      this.advance()
      this.addToken('=>', '=>', startLine, startCol)
      return
    }
    if (char === '=' && this.peek() === '=') {
      this.advance()
      this.addToken('==', '==', startLine, startCol)
      return
    }
    if (char === '!' && this.peek() === '=') {
      this.advance()
      this.addToken('!=', '!=', startLine, startCol)
      return
    }
    if (char === '<' && this.peek() === '=') {
      this.advance()
      this.addToken('<=', '<=', startLine, startCol)
      return
    }
    if (char === '>' && this.peek() === '=') {
      this.advance()
      this.addToken('>=', '>=', startLine, startCol)
      return
    }
    if (char === '&' && this.peek() === '&') {
      this.advance()
      this.addToken('&&', '&&', startLine, startCol)
      return
    }
    if (char === '|' && this.peek() === '|') {
      this.advance()
      this.addToken('||', '||', startLine, startCol)
      return
    }
    if (char === '+' && this.peek() === '=') {
      this.advance()
      this.addToken('+=', '+=', startLine, startCol)
      return
    }
    if (char === '-' && this.peek() === '=') {
      this.advance()
      this.addToken('-=', '-=', startLine, startCol)
      return
    }
    if (char === '*' && this.peek() === '=') {
      this.advance()
      this.addToken('*=', '*=', startLine, startCol)
      return
    }
    if (char === '/' && this.peek() === '=') {
      this.advance()
      this.addToken('/=', '/=', startLine, startCol)
      return
    }
    if (char === '%' && this.peek() === '=') {
      this.advance()
      this.addToken('%=', '%=', startLine, startCol)
      return
    }

    // Double colon ::
    if (char === ':' && this.peek() === ':') {
      this.advance()
      this.addToken('::', '::', startLine, startCol)
      return
    }

    // Range literal starting with ..
    if (char === '.' && this.peek() === '.') {
      this.advance() // consume second .
      let value = '..'
      while (/[0-9]/.test(this.peek())) {
        value += this.advance()
      }
      this.addToken('range_lit', value, startLine, startCol)
      return
    }

    // Single-character operators and delimiters
    const singleChar: TokenKind[] = ['+', '-', '*', '/', '%', '~', '^', '<', '>', '!', '=',
      '{', '}', '(', ')', '[', ']', ',', ';', ':', '.']
    if (singleChar.includes(char as TokenKind)) {
      this.addToken(char as TokenKind, char, startLine, startCol)
      return
    }

    // @ - selector or decorator
    if (char === '@') {
      this.scanAtToken(startLine, startCol)
      return
    }

    // String literal
    if (char === '"') {
      this.scanString(startLine, startCol)
      return
    }

    // MC name literal: #ident (e.g. #health, #red, #hasKey)
    if (char === '#') {
      const nextChar = this.peek()
      if (/[a-zA-Z_]/.test(nextChar)) {
        let name = '#'
        while (/[a-zA-Z0-9_]/.test(this.peek())) {
          name += this.advance()
        }
        this.addToken('mc_name', name, startLine, startCol)
        return
      }
      // Lone # (not followed by ident) — treat as unknown char error
      this.error(`Unexpected character '#'`, startLine, startCol)
      return
    }

    // Number (int or float) or range literal starting with number
    if (/[0-9]/.test(char)) {
      this.scanNumber(char, startLine, startCol)
      return
    }

    // Identifier or keyword
    if (/[a-zA-Z_]/.test(char)) {
      this.scanIdentifier(char, startLine, startCol)
      return
    }

    this.error(`Unexpected character '${char}'`, startLine, startCol)
  }

  private scanAtToken(startLine: number, startCol: number): void {
    // Check if it's a selector (@a, @e, @s, @p, @r, @n)
    const nextChar = this.peek()
    const afterNext = this.peek(1)

    // Selector: @a/@e/@s/@p/@r/@n followed by non-letter (or end, or [)
    if (SELECTOR_CHARS.has(nextChar) && !/[a-zA-Z_0-9]/.test(afterNext)) {
      const selectorChar = this.advance() // consume a/e/s/p/r/n
      let value = '@' + selectorChar

      // Check for [...] parameters
      if (this.peek() === '[') {
        value += this.scanSelectorParams()
      }

      this.addToken('selector', value, startLine, startCol)
      return
    }

    // Otherwise it's a decorator (@tick, @on_trigger, etc.)
    let value = '@'
    while (/[a-zA-Z_0-9]/.test(this.peek())) {
      value += this.advance()
    }

    // Check for decorator arguments (rate=N)
    if (this.peek() === '(') {
      value += this.advance() // (
      let parenDepth = 1
      while (!this.isAtEnd() && parenDepth > 0) {
        const c = this.advance()
        value += c
        if (c === '(') parenDepth++
        if (c === ')') parenDepth--
      }
    }

    this.addToken('decorator', value, startLine, startCol)
  }

  private scanSelectorParams(): string {
    let result = this.advance() // consume [
    let depth = 1
    let braceDepth = 0

    while (!this.isAtEnd() && depth > 0) {
      const c = this.advance()
      result += c

      if (c === '{') braceDepth++
      else if (c === '}') braceDepth--
      else if (c === '[' && braceDepth === 0) depth++
      else if (c === ']' && braceDepth === 0) depth--
    }

    return result
  }

  private scanString(startLine: number, startCol: number): void {
    let value = ''
    let interpolationDepth = 0
    let interpolationString = false

    while (!this.isAtEnd()) {
      if (interpolationDepth === 0 && this.peek() === '"') {
        break
      }

      if (this.peek() === '\\' && this.peek(1) === '"') {
        this.advance() // skip backslash
        value += this.advance() // add escaped quote
        continue
      }

      if (interpolationDepth === 0 && this.peek() === '$' && this.peek(1) === '{') {
        value += this.advance()
        value += this.advance()
        interpolationDepth = 1
        interpolationString = false
        continue
      }

      const char = this.advance()
      value += char

      if (interpolationDepth === 0) continue

      if (char === '"') {
        interpolationString = !interpolationString
        continue
      }

      if (interpolationString) continue

      if (char === '{') interpolationDepth++
      if (char === '}') interpolationDepth--
    }

    if (this.isAtEnd()) {
      this.error(`Unterminated string`, startLine, startCol)
    }

    this.advance() // closing quote
    this.addToken('string_lit', value, startLine, startCol)
  }

  private scanNumber(firstChar: string, startLine: number, startCol: number): void {
    let value = firstChar

    // Consume integer part
    while (/[0-9]/.test(this.peek())) {
      value += this.advance()
    }

    // Check for range literal (e.g., 1.., 1..10)
    if (this.peek() === '.' && this.peek(1) === '.') {
      value += this.advance() // first .
      value += this.advance() // second .
      // Optional max value
      while (/[0-9]/.test(this.peek())) {
        value += this.advance()
      }
      this.addToken('range_lit', value, startLine, startCol)
      return
    }

    // Check for float
    if (this.peek() === '.' && /[0-9]/.test(this.peek(1))) {
      value += this.advance() // .
      while (/[0-9]/.test(this.peek())) {
        value += this.advance()
      }
      // Check for NBT float/double suffix
      const floatSuffix = this.peek().toLowerCase()
      if (floatSuffix === 'f') {
        value += this.advance()
        this.addToken('float_lit', value, startLine, startCol)
        return
      }
      if (floatSuffix === 'd') {
        value += this.advance()
        this.addToken('double_lit', value, startLine, startCol)
        return
      }
      this.addToken('float_lit', value, startLine, startCol)
      return
    }

    // Check for NBT integer suffix (b, s, L/l, f, d)
    const intSuffix = this.peek().toLowerCase()
    if (intSuffix === 'b' && !/[a-zA-Z_0-9]/.test(this.peek(1))) {
      value += this.advance()
      this.addToken('byte_lit', value, startLine, startCol)
      return
    }
    if (intSuffix === 's' && !/[a-zA-Z_0-9]/.test(this.peek(1))) {
      value += this.advance()
      this.addToken('short_lit', value, startLine, startCol)
      return
    }
    if (intSuffix === 'l' && !/[a-zA-Z_0-9]/.test(this.peek(1))) {
      value += this.advance()
      this.addToken('long_lit', value, startLine, startCol)
      return
    }
    if (intSuffix === 'f' && !/[a-zA-Z_0-9]/.test(this.peek(1))) {
      value += this.advance()
      this.addToken('float_lit', value, startLine, startCol)
      return
    }
    if (intSuffix === 'd' && !/[a-zA-Z_0-9]/.test(this.peek(1))) {
      value += this.advance()
      this.addToken('double_lit', value, startLine, startCol)
      return
    }

    this.addToken('int_lit', value, startLine, startCol)
  }

  private scanIdentifier(firstChar: string, startLine: number, startCol: number): void {
    let value = firstChar

    while (/[a-zA-Z_0-9]/.test(this.peek())) {
      value += this.advance()
    }

    // Check for raw command
    if (value === 'raw' && this.peek() === '(') {
      this.advance() // consume (
      // Skip whitespace
      while (/\s/.test(this.peek())) {
        this.advance()
      }
      // Expect string
      if (this.peek() === '"') {
        this.advance() // consume opening quote
        let rawContent = ''
        while (!this.isAtEnd() && this.peek() !== '"') {
          if (this.peek() === '\\' && this.peek(1) === '"') {
            this.advance()
            rawContent += this.advance()
          } else {
            rawContent += this.advance()
          }
        }
        if (this.peek() === '"') {
          this.advance() // closing quote
        }
        // Skip whitespace and closing paren
        while (/\s/.test(this.peek())) {
          this.advance()
        }
        if (this.peek() === ')') {
          this.advance() // closing paren
        }
        this.addToken('raw_cmd', rawContent, startLine, startCol)
        return
      }
    }

    // Check for keyword
    const keyword = KEYWORDS[value]
    if (keyword) {
      this.addToken(keyword, value, startLine, startCol)
    } else {
      this.addToken('ident', value, startLine, startCol)
    }
  }
}
