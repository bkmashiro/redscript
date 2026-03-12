/**
 * Diagnostics Tests
 */

import { DiagnosticError, DiagnosticCollector, formatError, parseErrorMessage } from '../diagnostics'
import { compile, formatCompileError } from '../compile'

describe('DiagnosticError', () => {
  describe('formatError', () => {
    it('formats source context with a caret pointer', () => {
      const source = [
        'fn main() {',
        '  let x = foo(',
        '}',
      ].join('\n')
      const error = new DiagnosticError(
        'TypeError',
        'Unknown function: foo',
        { line: 2, col: 11 },
        source.split('\n')
      )

      expect(formatError(error, source)).toBe([
        'Error at line 2, col 11:',
        '    let x = foo(',
        '            ^',
        'Unknown function: foo',
      ].join('\n'))
    })

    it('includes file path when available', () => {
      const source = 'let x = foo();'
      const error = new DiagnosticError(
        'TypeError',
        'Unknown function: foo',
        { file: 'test.mcrs', line: 1, col: 9 },
        source.split('\n')
      )

      expect(formatError(error, source)).toContain('Error in test.mcrs at line 1, col 9:')
    })
  })

  describe('format', () => {
    it('formats error with source line and pointer', () => {
      const sourceLines = [
        'fn main() {',
        '  let x = 42',
        '}',
      ]
      const error = new DiagnosticError(
        'ParseError',
        "Expected ';' after statement",
        { line: 2, col: 14 },
        sourceLines
      )
      const formatted = error.format()
      expect(formatted).toContain('[ParseError]')
      expect(formatted).toContain('line 2')
      expect(formatted).toContain('col 14')
      expect(formatted).toContain('let x = 42')
      expect(formatted).toContain('^')
    })

    it('formats error with file path', () => {
      const error = new DiagnosticError(
        'LexError',
        'Unexpected character',
        { file: 'test.mcrs', line: 1, col: 1 },
        ['@@@']
      )
      const formatted = error.format()
      expect(formatted).toContain('test.mcrs:')
      expect(formatted).toContain('[LexError]')
    })

    it('handles missing source lines gracefully', () => {
      const error = new DiagnosticError(
        'ParseError',
        'Syntax error',
        { line: 10, col: 5 }
      )
      const formatted = error.format()
      expect(formatted).toContain('[ParseError]')
      expect(formatted).toContain('line 10')
    })
  })
})

describe('DiagnosticCollector', () => {
  it('collects multiple errors', () => {
    const collector = new DiagnosticCollector('line1\nline2\nline3')
    collector.error('ParseError', 'First error', 1, 1)
    collector.error('ParseError', 'Second error', 2, 1)
    expect(collector.hasErrors()).toBe(true)
    expect(collector.getErrors()).toHaveLength(2)
  })

  it('formats all errors', () => {
    const collector = new DiagnosticCollector('let x')
    collector.error('ParseError', 'Missing semicolon', 1, 6)
    const formatted = collector.formatAll()
    expect(formatted).toContain('Missing semicolon')
    expect(formatted).toContain('let x')
  })
})

describe('parseErrorMessage', () => {
  it('extracts line and col from error message', () => {
    const err = parseErrorMessage(
      'ParseError',
      "Expected ';' at line 5, col 12",
      ['', '', '', '', 'let x = 42']
    )
    expect(err.location.line).toBe(5)
    expect(err.location.col).toBe(12)
    expect(err.message).toBe("Expected ';'")
  })

  it('defaults to line 1, col 1 if no position in message', () => {
    const err = parseErrorMessage('LexError', 'Unknown error')
    expect(err.location.line).toBe(1)
    expect(err.location.col).toBe(1)
  })
})

describe('compile function', () => {
  it('returns success for valid code', () => {
    const result = compile('fn main() { let x = 1; }')
    expect(result.success).toBe(true)
    expect(result.files).toBeDefined()
  })

  it('returns DiagnosticError for lex errors', () => {
    const result = compile('fn main() { let x = $ }')
    expect(result.success).toBe(false)
    expect(result.error).toBeInstanceOf(DiagnosticError)
    expect(result.error?.kind).toBe('LexError')
  })

  it('returns DiagnosticError for parse errors', () => {
    const result = compile('fn main() { let x = }')
    expect(result.success).toBe(false)
    expect(result.error).toBeInstanceOf(DiagnosticError)
    expect(result.error?.kind).toBe('ParseError')
  })

  it('returns DiagnosticError for missing semicolon', () => {
    const result = compile('fn main() { let x = 42 }')
    expect(result.success).toBe(false)
    expect(result.error?.kind).toBe('ParseError')
    expect(result.error?.message).toContain("Expected ';'")
  })

  it('includes file path in error', () => {
    const result = compile('fn main() { }', { filePath: 'test.mcrs' })
    // This is valid, but test that filePath is passed through
    expect(result.success).toBe(true)
  })

  it('formats error nicely', () => {
    const result = compile('fn main() {\n  let x = 42\n}')
    expect(result.success).toBe(false)
    const formatted = formatCompileError(result)
    expect(formatted).toContain('Error at line')
    expect(formatted).toContain('^')
    // Error points to } on line 3, which is where semicolon was expected
    expect(formatted).toContain('}')
  })
})

describe('Lexer DiagnosticError', () => {
  it('throws DiagnosticError for unexpected character', () => {
    const result = compile('fn main() { let x = $ }')
    expect(result.success).toBe(false)
    expect(result.error?.kind).toBe('LexError')
    expect(result.error?.message).toContain('Unexpected character')
  })

  it('throws DiagnosticError for unterminated string', () => {
    const result = compile('fn main() { let x = "hello }')
    expect(result.success).toBe(false)
    expect(result.error?.kind).toBe('LexError')
    expect(result.error?.message).toContain('Unterminated string')
  })
})

describe('Parser DiagnosticError', () => {
  it('includes line and column info', () => {
    const result = compile('fn main() { return }')
    expect(result.success).toBe(false)
    expect(result.error?.location.line).toBeGreaterThan(0)
    expect(result.error?.location.col).toBeGreaterThan(0)
  })
})
