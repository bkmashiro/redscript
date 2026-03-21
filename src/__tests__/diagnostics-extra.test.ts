/**
 * Extra coverage for src/diagnostics/index.ts
 * Targets uncovered branches: formatSourcePointer edge cases, formatError paths,
 * parseErrorMessage, DiagnosticCollector.
 */

import {
  DiagnosticError,
  DiagnosticCollector,
  parseErrorMessage,
  formatError,
} from '../diagnostics'

describe('DiagnosticError — format()', () => {
  test('formats without sourceLines', () => {
    const err = new DiagnosticError('ParseError', 'unexpected token', { line: 5, col: 3 })
    const formatted = err.format()
    expect(formatted).toContain('[ParseError]')
    expect(formatted).toContain('line 5')
    expect(formatted).toContain('col 3')
    expect(formatted).toContain('unexpected token')
  })

  test('formats with file path', () => {
    const err = new DiagnosticError('LexError', 'bad char', { file: 'foo.mcrs', line: 2, col: 1 })
    const formatted = err.format()
    expect(formatted).toContain('foo.mcrs')
  })

  test('formats with sourceLines and shows pointer', () => {
    const source = ['let x = 42', 'let y = @']
    const err = new DiagnosticError('ParseError', 'unexpected @', { line: 2, col: 9 }, source)
    const formatted = err.format()
    expect(formatted).toContain('let y = @')
    expect(formatted).toContain('^')
  })

  test('format with out-of-range line returns just header', () => {
    const source = ['only one line']
    const err = new DiagnosticError('ParseError', 'bad', { line: 99, col: 1 }, source)
    const formatted = err.format()
    expect(formatted).toContain('[ParseError]')
    // out-of-range line → no source pointer
    expect(formatted).not.toContain('only one line')
  })

  test('format with col beyond line length clips safely', () => {
    const source = ['abc']
    const err = new DiagnosticError('ParseError', 'bad', { line: 1, col: 100 }, source)
    const formatted = err.format()
    expect(formatted).toContain('abc')
  })

  test('toString() delegates to format()', () => {
    const err = new DiagnosticError('TypeError', 'type mismatch', { line: 1, col: 1 })
    expect(err.toString()).toBe(err.format())
  })

  test('format hint appears for "expected" messages', () => {
    const source = ['let x = 42']
    const err = new DiagnosticError('ParseError', 'expected: semicolon', { line: 1, col: 10 }, source)
    const formatted = err.format()
    expect(formatted).toContain('semicolon')
  })
})

describe('DiagnosticCollector', () => {
  test('hasErrors false initially', () => {
    const collector = new DiagnosticCollector()
    expect(collector.hasErrors()).toBe(false)
  })

  test('error() adds diagnostics', () => {
    const collector = new DiagnosticCollector('let x = @\n', 'test.mcrs')
    collector.error('ParseError', 'bad char', 1, 9)
    expect(collector.hasErrors()).toBe(true)
    expect(collector.getErrors()).toHaveLength(1)
  })

  test('formatAll() returns formatted string', () => {
    const collector = new DiagnosticCollector('let x = @\n')
    collector.error('ParseError', 'bad char', 1, 9)
    const text = collector.formatAll()
    expect(text).toContain('[ParseError]')
  })

  test('throwFirst() throws the first diagnostic', () => {
    const collector = new DiagnosticCollector()
    collector.error('TypeError', 'type mismatch', 1, 1)
    expect(() => collector.throwFirst()).toThrow(DiagnosticError)
  })

  test('throwFirst() throws generic error if no diagnostics', () => {
    const collector = new DiagnosticCollector()
    expect(() => collector.throwFirst()).toThrow('No diagnostics to throw')
  })
})

describe('parseErrorMessage', () => {
  test('extracts line/col from message', () => {
    const err = parseErrorMessage('ParseError', 'unexpected token at line 5, col 12')
    expect(err.location.line).toBe(5)
    expect(err.location.col).toBe(12)
    expect(err.message).toBe('unexpected token')
  })

  test('falls back to line 1, col 1 when no match', () => {
    const err = parseErrorMessage('LexError', 'something went wrong')
    expect(err.location.line).toBe(1)
    expect(err.location.col).toBe(1)
    expect(err.message).toBe('something went wrong')
  })

  test('passes filePath and sourceLines through', () => {
    const sourceLines = ['let x = 42']
    const err = parseErrorMessage('TypeError', 'bad at line 1, col 1', sourceLines, 'foo.mcrs')
    expect(err.location.file).toBe('foo.mcrs')
    expect(err.sourceLines).toBe(sourceLines)
  })
})

describe('formatError', () => {
  test('formats DiagnosticError with source override', () => {
    const source = 'let x = 42\n'
    const err = new DiagnosticError('ParseError', 'bad', { line: 1, col: 9 })
    const formatted = formatError(err, source, 'test.mcrs')
    expect(formatted).toContain('test.mcrs')
    expect(formatted).toContain('let x = 42')
  })

  test('formats DiagnosticError without source (uses error.sourceLines)', () => {
    const err = new DiagnosticError('ParseError', 'bad', { line: 1, col: 9 }, ['let x = 42'])
    const formatted = formatError(err)
    expect(formatted).toContain('let x = 42')
  })

  test('formats DiagnosticError without any source lines', () => {
    const err = new DiagnosticError('ParseError', 'bad', { line: 1, col: 1 })
    const formatted = formatError(err)
    expect(formatted).toContain('bad')
  })

  test('formats generic Error without source', () => {
    const err = new Error('something failed')
    const formatted = formatError(err)
    expect(formatted).toContain('something failed')
  })

  test('formats generic Error with source (falls back to parseErrorMessage)', () => {
    const err = new Error('unexpected token at line 2, col 5')
    const source = 'let x = 1\nlet y = @\n'
    const formatted = formatError(err, source, 'foo.mcrs')
    expect(formatted).toContain('foo.mcrs')
  })
})
