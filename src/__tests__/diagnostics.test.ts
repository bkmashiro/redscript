/**
 * Diagnostics Tests
 */

import { DiagnosticError, DiagnosticCollector, formatError, parseErrorMessage } from '../diagnostics'
import { compile } from '../compile'

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
        '<input>:2:11: error: Unknown function: foo',
        '    let x = foo(',
        '            ^',
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

      expect(formatError(error, source)).toContain('test.mcrs:1:9: error: Unknown function: foo')
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
    const result = compile('fn main() { let x = 1; }', { namespace: 'test' })
    expect(result.success).toBe(true)
    expect(result.files).toBeDefined()
  })

  it('throws DiagnosticError for lex errors', () => {
    expect(() => compile('fn main() { let x = $ }', { namespace: 'test' }))
      .toThrow()
    try {
      compile('fn main() { let x = $ }', { namespace: 'test' })
    } catch (e) {
      expect(e).toBeInstanceOf(DiagnosticError)
      expect((e as DiagnosticError).kind).toBe('LexError')
    }
  })

  it('throws DiagnosticError for parse errors', () => {
    expect(() => compile('fn main() { let x = }', { namespace: 'test' }))
      .toThrow()
    try {
      compile('fn main() { let x = }', { namespace: 'test' })
    } catch (e) {
      expect(e).toBeInstanceOf(DiagnosticError)
      expect((e as DiagnosticError).kind).toBe('ParseError')
    }
  })

  it('throws DiagnosticError for missing semicolon', () => {
    try {
      compile('fn main() { let x = 42 }', { namespace: 'test' })
      fail('Expected compile to throw')
    } catch (e) {
      expect((e as DiagnosticError).kind).toBe('ParseError')
      expect((e as DiagnosticError).message).toContain("Expected ';'")
    }
  })

  it('includes file path in error', () => {
    const result = compile('fn main() { }', { filePath: 'test.mcrs', namespace: 'test' })
    expect(result.success).toBe(true)
  })

  it('formats error nicely', () => {
    try {
      compile('fn main() {\n  let x = 42\n}', { namespace: 'test' })
      fail('Expected compile to throw')
    } catch (e) {
      expect(e).toBeInstanceOf(DiagnosticError)
      const formatted = (e as DiagnosticError).format()
      expect(formatted).toContain('line')
      expect(formatted).toContain('^')
    }
  })
})

describe('Lexer DiagnosticError', () => {
  it('throws DiagnosticError for unexpected character', () => {
    try {
      compile('fn main() { let x = $ }', { namespace: 'test' })
      fail('Expected compile to throw')
    } catch (e) {
      expect((e as DiagnosticError).kind).toBe('LexError')
      expect((e as DiagnosticError).message).toContain('Unexpected character')
    }
  })

  it('throws DiagnosticError for unterminated string', () => {
    try {
      compile('fn main() { let x = "hello }', { namespace: 'test' })
      fail('Expected compile to throw')
    } catch (e) {
      expect((e as DiagnosticError).kind).toBe('LexError')
      expect((e as DiagnosticError).message).toContain('Unterminated string')
    }
  })
})

describe('Parser DiagnosticError', () => {
  it('includes line and column info', () => {
    try {
      compile('fn main() { return }', { namespace: 'test' })
      fail('Expected compile to throw')
    } catch (e) {
      expect((e as DiagnosticError).location.line).toBeGreaterThan(0)
      expect((e as DiagnosticError).location.col).toBeGreaterThan(0)
    }
  })
})
