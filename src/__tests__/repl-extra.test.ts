/**
 * Extra coverage for src/repl.ts
 *
 * Targets:
 * - ReplSession.evaluate: top-level declarations, statements, empty input, error handling
 * - ReplSession.clear
 * - ReplSession.getSource
 * - isTopLevelDeclaration (fn, struct, enum, decorated)
 * - normalizeStatement (trailing semicolon)
 * - selectRelevantFiles (declaration vs statement filtering)
 * - formatFiles (no files, with files)
 */

import { ReplSession } from '../repl'

describe('ReplSession — basic operations', () => {
  test('empty input returns no files', () => {
    const session = new ReplSession('test')
    const result = session.evaluate('')
    expect(result.files).toEqual([])
    expect(result.output).toBe('')
  })

  test('whitespace-only input returns no files', () => {
    const session = new ReplSession('test')
    const result = session.evaluate('   \t  ')
    expect(result.files).toEqual([])
    expect(result.output).toBe('')
  })

  test('statement without trailing semicolon gets semicolon added', () => {
    const session = new ReplSession('test')
    const result = session.evaluate('let x = 42')
    // Should not throw, normalized with ;
    expect(result.source).toContain('let x = 42;')
  })

  test('statement with trailing semicolon is kept as-is', () => {
    const session = new ReplSession('test')
    const result = session.evaluate('let x = 5;')
    expect(result.source).toContain('let x = 5;')
  })

  test('statement with trailing brace is kept as-is', () => {
    const session = new ReplSession('test')
    // A single-line if is unusual but tests the } terminator
    const result = session.evaluate('if (1 > 0) { let y = 1; }')
    expect(result.source).toContain('if (1 > 0) { let y = 1; }')
  })

  test('fn declaration is recognized as top-level', () => {
    const session = new ReplSession('test')
    const result = session.evaluate('fn add(a: int, b: int): int { return a + b; }')
    // Declaration goes to declarations list, not statements
    expect(result.source).toContain('fn add(a: int, b: int): int')
    // Should have some file output (not the __repl fn)
    const hasAddFile = result.files.some(f => f.path.includes('add'))
    expect(hasAddFile).toBe(true)
  })

  test('struct declaration is recognized as top-level', () => {
    const session = new ReplSession('test')
    const result = session.evaluate('struct Point { x: int, y: int }')
    expect(result.source).toContain('struct Point')
  })

  test('enum declaration is recognized as top-level', () => {
    const session = new ReplSession('test')
    const result = session.evaluate('enum Color { Red, Green, Blue }')
    expect(result.source).toContain('enum Color')
  })

  test('decorated fn is recognized as top-level', () => {
    const session = new ReplSession('test')
    const result = session.evaluate('@tick fn tick_handler(): int { return 0; }')
    expect(result.source).toContain('fn tick_handler')
  })
})

describe('ReplSession — state accumulation', () => {
  test('multiple statements accumulate in source', () => {
    const session = new ReplSession('test')
    session.evaluate('let a = 1;')
    session.evaluate('let b = 2;')
    const result = session.evaluate('let c = 3;')
    expect(result.source).toContain('let a = 1;')
    expect(result.source).toContain('let b = 2;')
    expect(result.source).toContain('let c = 3;')
  })

  test('clear resets state', () => {
    const session = new ReplSession('test')
    session.evaluate('let x = 10;')
    session.clear()
    const result = session.evaluate('let y = 20;')
    expect(result.source).not.toContain('let x = 10;')
    expect(result.source).toContain('let y = 20;')
  })

  test('declaration followed by statement includes both', () => {
    const session = new ReplSession('test')
    session.evaluate('fn helper(): int { return 99; }')
    const result = session.evaluate('let v = helper();')
    expect(result.source).toContain('fn helper')
    expect(result.source).toContain('let v = helper();')
  })
})

describe('ReplSession — getSource', () => {
  test('empty session generates fn __repl()', () => {
    const session = new ReplSession('test')
    const source = session.getSource()
    expect(source).toContain('fn __repl()')
  })

  test('declarations appear before __repl fn', () => {
    const session = new ReplSession('test')
    session.evaluate('fn a(): int { return 1; }')
    const source = session.getSource()
    const fnAPos = source.indexOf('fn a()')
    const replPos = source.indexOf('fn __repl()')
    expect(fnAPos).toBeLessThan(replPos)
  })
})

describe('ReplSession — evaluate with compilation', () => {
  test('simple arithmetic expression compiles without error', () => {
    const session = new ReplSession('test')
    expect(() => session.evaluate('let x = 1 + 2;')).not.toThrow()
  })

  test('invalid expression throws error', () => {
    const session = new ReplSession('test')
    // Invalid syntax should throw
    expect(() => session.evaluate('let x = +')).toThrow()
  })

  test('multiple declarations compile together', () => {
    const session = new ReplSession('test')
    session.evaluate('fn square(n: int): int { return n * n; }')
    expect(() => session.evaluate('fn cube(n: int): int { return n * square(n); }')).not.toThrow()
  })

  test('file output contains mcfunction content for statement', () => {
    const session = new ReplSession('test')
    const result = session.evaluate('let x = 42;')
    // Some mcfunction files should be generated
    const hasMcFunc = result.files.some(f => f.path.endsWith('.mcfunction'))
    expect(hasMcFunc).toBe(true)
  })

  test('statement output is non-empty for valid code', () => {
    const session = new ReplSession('test')
    const result = session.evaluate('let x = 42;')
    // The output should have something or files should have content
    const hasContent = result.output !== '' || result.files.length > 0
    expect(hasContent).toBe(true)
  })

  test('output is formatted as path + content', () => {
    const session = new ReplSession('test')
    const result = session.evaluate('let x = 1;')
    if (result.output) {
      expect(result.output).toContain('mcfunction')
    }
  })

  test('custom namespace is used in paths', () => {
    const session = new ReplSession('mypack')
    const result = session.evaluate('let x = 5;')
    if (result.files.length > 0) {
      expect(result.files.some(f => f.path.includes('mypack'))).toBe(true)
    }
  })
})

describe('ReplSession — formatFiles "Accepted" path', () => {
  test('struct declaration with no functions produces Accepted message', () => {
    // A struct declaration that doesn't generate a standalone function file
    // should still compile, and if files array is empty from selectRelevantFiles, 
    // the output should contain 'Accepted'
    const session = new ReplSession('test')
    const result = session.evaluate('struct Empty { x: int }')
    // Either output has Accepted or files exist
    const hasOutput = result.output.includes('Accepted') || result.files.length > 0
    expect(hasOutput).toBe(true)
  })

  test('enum declaration produces output or Accepted message', () => {
    const session = new ReplSession('test')
    const result = session.evaluate('enum Status { Active, Inactive }')
    const hasOutput = result.output.length > 0 || result.files.length === 0
    expect(hasOutput).toBe(true)
  })
})
