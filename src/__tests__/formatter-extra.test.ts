/**
 * Additional coverage for src/formatter/index.ts
 *
 * Targets uncovered branches: string handling, long line wrapping,
 * comment preservation, CRLF normalization, multiple blank line collapsing.
 */

import { format } from '../formatter'

describe('formatter — string literal preservation', () => {
  it('does not reindent content inside string literals', () => {
    const input = 'fn test(): void {\nlet s: string = "{ not a block }";\n}'
    const result = format(input)
    expect(result).toContain('"{ not a block }"')
  })

  it('handles multiline strings spanning multiple lines', () => {
    // A string that contains a newline escape
    const input = 'fn test(): void {\nlet s: string = "line1\\nline2";\n}'
    const result = format(input)
    expect(result).toContain('"line1\\nline2"')
  })

  it('handles escaped quotes inside strings', () => {
    const input = 'fn test(): void {\nlet s: string = "say \\"hello\\"";\n}'
    const result = format(input)
    expect(result).toContain('"say \\"hello\\""')
  })

  it('handles string with braces that should not affect indentation', () => {
    const input = 'fn test(): void {\nlet s: string = "{{{}}} more";\nlet x: int = 1;\n}'
    const result = format(input)
    // x should be indented at 1 level (inside fn), not affected by string braces
    expect(result).toMatch(/^ {2}let x: int = 1;$/m)
  })
})

describe('formatter — comment handling', () => {
  it('preserves inline comments', () => {
    const input = 'fn test(): void {\nlet x: int = 1; // important\n}'
    const result = format(input)
    expect(result).toContain('// important')
  })

  it('does not treat braces in comments as code', () => {
    const input = 'fn test(): void {\n// { this is a comment\nlet x: int = 1;\n}'
    const result = format(input)
    expect(result).toMatch(/^ {2}let x: int = 1;$/m)
  })
})

describe('formatter — CRLF normalization', () => {
  it('normalizes CRLF to LF', () => {
    const input = 'fn test(): void {\r\nlet x: int = 1;\r\n}'
    const result = format(input)
    expect(result).not.toContain('\r')
    expect(result).toBe('fn test(): void {\n  let x: int = 1;\n}\n')
  })
})

describe('formatter — blank line collapsing', () => {
  it('collapses more than 2 consecutive blank lines', () => {
    const input = 'fn a(): void {\n}\n\n\n\n\nfn b(): void {\n}'
    const result = format(input)
    // Should have at most 2 blank lines between functions
    expect(result).not.toMatch(/\n\n\n\n/)
  })

  it('strips leading blank lines', () => {
    const input = '\n\n\nfn test(): void {\n}'
    const result = format(input)
    expect(result).toMatch(/^fn test/)
  })
})

describe('formatter — long line wrapping', () => {
  it('wraps function calls longer than 80 characters', () => {
    const inner = 'fn test(): void {\n  some_function(argument_one, argument_two, argument_three, argument_four, argument_five);\n}'
    const result = format(inner)
    // Should be wrapped since the line is > 80 chars
    const lines = result.split('\n')
    // After wrapping, should produce more lines than original 3
    expect(lines.length).toBeGreaterThan(3)
  })

  it('does not wrap short function calls', () => {
    const input = 'fn test(): void {\n  foo(a, b);\n}'
    const result = format(input)
    expect(result).toContain('foo(a, b)')
  })

  it('does not wrap lines with comments even if long', () => {
    const longComment = 'fn test(): void {\n  let x: int = 1; // this is a very long comment that makes the line exceed 80 characters easily\n}'
    const result = format(longComment)
    // Should keep comment line as-is (no wrapping)
    expect(result).toContain('// this is a very long comment')
  })
})

describe('formatter — brace collapsing', () => {
  it('puts opening brace on same line as preceding statement', () => {
    const input = 'if true\n{\nlet x: int = 1;\n}'
    const result = format(input)
    expect(result).toContain('if true {')
  })

  it('handles else brace normalization', () => {
    const input = 'fn test(): void {\nif true {\nlet x: int = 1;\n}else{\nlet y: int = 2;\n}\n}'
    const result = format(input)
    expect(result).toContain('} else {')
  })
})

describe('formatter — deeply nested code', () => {
  it('indents 3 levels deep correctly', () => {
    const input = 'fn test(): void {\nif true {\nif false {\nlet x: int = 1;\n}\n}\n}'
    const result = format(input)
    expect(result).toMatch(/^ {6}let x: int = 1;$/m)
  })
})

describe('formatter — edge cases', () => {
  it('handles single line code', () => {
    const result = format('let x: int = 1;')
    expect(result).toBe('let x: int = 1;\n')
  })

  it('handles code with only braces', () => {
    const result = format('{}')
    expect(result).toContain('{')
    expect(result).toContain('}')
  })

  it('handles closing brace followed by opening brace', () => {
    const input = 'fn a(): void {\n}\nfn b(): void {\n}'
    const result = format(input)
    expect(result).toContain('fn a(): void {\n}\nfn b(): void {\n}\n')
  })
})
