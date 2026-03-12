import { format } from '../formatter'

describe('formatter', () => {
  it('normalizes indentation to 4 spaces', () => {
    const input = 'fn main() {\n  let x: int = 1;\n}'
    const result = format(input)
    expect(result).toBe('fn main() {\n    let x: int = 1;\n}\n')
  })

  it('handles nested blocks', () => {
    const input = 'fn main() {\nif true {\nlet x: int = 1;\n}\n}'
    const result = format(input)
    expect(result).toBe(
      'fn main() {\n    if true {\n        let x: int = 1;\n    }\n}\n'
    )
  })

  it('trims trailing whitespace', () => {
    const input = 'fn main() {   \n    let x: int = 1;   \n}   '
    const result = format(input)
    expect(result).toBe('fn main() {\n    let x: int = 1;\n}\n')
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
    const input = 'fn main() {\n    let x: int = 1;\n}\n'
    const result = format(input)
    expect(result).toBe(input)
  })

  it('handles empty input', () => {
    expect(format('')).toBe('\n')
    expect(format('\n\n')).toBe('\n')
  })
})
