import { format } from '../formatter'

describe('formatter', () => {
  it('normalizes indentation to 2 spaces', () => {
    const input = 'fn main() {\n  let x: int = 1;\n}'
    const result = format(input)
    expect(result).toBe('fn main() {\n  let x: int = 1;\n}\n')
  })

  it('handles nested blocks', () => {
    const input = 'fn main() {\nif true {\nlet x: int = 1;\n}\n}'
    const result = format(input)
    expect(result).toBe(
      'fn main() {\n  if true {\n    let x: int = 1;\n  }\n}\n'
    )
  })

  it('trims trailing whitespace', () => {
    const input = 'fn main() {   \n    let x: int = 1;   \n}   '
    const result = format(input)
    expect(result).toBe('fn main() {\n  let x: int = 1;\n}\n')
  })

  it('ensures single newline at end of file', () => {
    const input = 'fn main() {\n}\n\n\n'
    const result = format(input)
    expect(result).toBe('fn main() {\n}\n')
  })

  it('preserves blank lines', () => {
    const input = 'fn a() {\n}\n\nfn b() {\n}'
    const result = format(input)
    expect(result).toBe('fn a() {\n}\n\nfn b() {\n}\n')
  })

  it('handles already formatted code', () => {
    const input = 'fn main() {\n  let x: int = 1;\n}\n'
    const result = format(input)
    expect(result).toBe(input)
  })

  it('handles empty input', () => {
    expect(format('')).toBe('\n')
    expect(format('\n\n')).toBe('\n')
  })

  it('moves opening braces onto the same line', () => {
    const input = 'fn main()\n{\nlet x: int = 1;\n}'
    expect(format(input)).toBe('fn main() {\n  let x: int = 1;\n}\n')
  })

  it('compresses blank lines to at most two', () => {
    const input = 'fn a() {\n}\n\n\n\nfn b() {\n}\n'
    expect(format(input)).toBe('fn a() {\n}\n\n\nfn b() {\n}\n')
  })
})
