import { Lexer, Token, TokenKind } from '../lexer'

function tokenize(source: string): Token[] {
  return new Lexer(source).tokenize()
}

function kinds(tokens: Token[]): TokenKind[] {
  return tokens.map(t => t.kind)
}

describe('Lexer', () => {
  describe('keywords', () => {
    it('recognizes all keywords', () => {
      const tokens = tokenize('fn let const if else while for foreach match return as at in struct enum trigger namespace')
      expect(kinds(tokens)).toEqual([
        'fn', 'let', 'const', 'if', 'else', 'while', 'for', 'foreach', 'match',
        'return', 'as', 'at', 'in', 'struct', 'enum', 'trigger', 'namespace', 'eof'
      ])
    })

    it('recognizes type keywords', () => {
      const tokens = tokenize('int bool float string void BlockPos')
      expect(kinds(tokens)).toEqual(['int', 'bool', 'float', 'string', 'void', 'BlockPos', 'eof'])
    })

    it('recognizes boolean literals', () => {
      const tokens = tokenize('true false')
      expect(kinds(tokens)).toEqual(['true', 'false', 'eof'])
    })
  })

  describe('identifiers', () => {
    it('tokenizes simple identifiers', () => {
      const tokens = tokenize('foo bar_baz _private x1')
      expect(tokens.map(t => [t.kind, t.value])).toEqual([
        ['ident', 'foo'],
        ['ident', 'bar_baz'],
        ['ident', '_private'],
        ['ident', 'x1'],
        ['eof', ''],
      ])
    })
  })

  describe('literals', () => {
    it('tokenizes integer literals', () => {
      const tokens = tokenize('42 0 123')
      expect(tokens.map(t => [t.kind, t.value])).toEqual([
        ['int_lit', '42'],
        ['int_lit', '0'],
        ['int_lit', '123'],
        ['eof', ''],
      ])
    })

    it('tokenizes float literals', () => {
      const tokens = tokenize('3.14 0.5 10.0')
      expect(tokens.map(t => [t.kind, t.value])).toEqual([
        ['float_lit', '3.14'],
        ['float_lit', '0.5'],
        ['float_lit', '10.0'],
        ['eof', ''],
      ])
    })

    it('tokenizes string literals', () => {
      const tokens = tokenize('"hello" "world" "with \\"quotes\\""')
      expect(tokens.map(t => [t.kind, t.value])).toEqual([
        ['string_lit', 'hello'],
        ['string_lit', 'world'],
        ['string_lit', 'with "quotes"'],
        ['eof', ''],
      ])
    })

    it('tokenizes interpolated strings as a single string token', () => {
      const tokens = tokenize('"hello ${name + 1}"')
      expect(tokens.map(t => [t.kind, t.value])).toEqual([
        ['string_lit', 'hello ${name + 1}'],
        ['eof', ''],
      ])
    })

    it('tokenizes byte literals (b suffix)', () => {
      const tokens = tokenize('20b 0B 127b')
      expect(tokens.map(t => [t.kind, t.value])).toEqual([
        ['byte_lit', '20b'],
        ['byte_lit', '0B'],
        ['byte_lit', '127b'],
        ['eof', ''],
      ])
    })

    it('tokenizes short literals (s suffix)', () => {
      const tokens = tokenize('100s 0S 32767s')
      expect(tokens.map(t => [t.kind, t.value])).toEqual([
        ['short_lit', '100s'],
        ['short_lit', '0S'],
        ['short_lit', '32767s'],
        ['eof', ''],
      ])
    })

    it('tokenizes long literals (L suffix)', () => {
      const tokens = tokenize('1000L 0l 999999L')
      expect(tokens.map(t => [t.kind, t.value])).toEqual([
        ['long_lit', '1000L'],
        ['long_lit', '0l'],
        ['long_lit', '999999L'],
        ['eof', ''],
      ])
    })

    it('tokenizes float literals with f suffix', () => {
      const tokens = tokenize('3.14f 0.5F 10.0f')
      expect(tokens.map(t => [t.kind, t.value])).toEqual([
        ['float_lit', '3.14f'],
        ['float_lit', '0.5F'],
        ['float_lit', '10.0f'],
        ['eof', ''],
      ])
    })

    it('tokenizes double literals (d suffix)', () => {
      const tokens = tokenize('3.14d 0.5D 10.0d')
      expect(tokens.map(t => [t.kind, t.value])).toEqual([
        ['double_lit', '3.14d'],
        ['double_lit', '0.5D'],
        ['double_lit', '10.0d'],
        ['eof', ''],
      ])
    })

    it('tokenizes integer with f/d suffix as float/double', () => {
      const tokens = tokenize('5f 10d')
      expect(tokens.map(t => [t.kind, t.value])).toEqual([
        ['float_lit', '5f'],
        ['double_lit', '10d'],
        ['eof', ''],
      ])
    })

    it('does not treat suffix-like letters in identifiers as NBT suffixes', () => {
      // 1b2 should not be byte_lit — the 'b' is followed by a digit
      const tokens = tokenize('1b2')
      expect(tokens.map(t => [t.kind, t.value])).toEqual([
        ['int_lit', '1'],
        ['ident', 'b2'],
        ['eof', ''],
      ])
    })

    it('tokenizes range literals', () => {
      const tokens = tokenize('..5 1.. 1..10')
      expect(tokens.map(t => [t.kind, t.value])).toEqual([
        ['range_lit', '..5'],
        ['range_lit', '1..'],
        ['range_lit', '1..10'],
        ['eof', ''],
      ])
    })
  })

  describe('operators', () => {
    it('tokenizes arithmetic operators', () => {
      const tokens = tokenize('+ - * / % ~ ^')
      expect(kinds(tokens)).toEqual(['+', '-', '*', '/', '%', '~', '^', 'eof'])
    })

    it('tokenizes comparison operators', () => {
      const tokens = tokenize('== != < <= > >=')
      expect(kinds(tokens)).toEqual(['==', '!=', '<', '<=', '>', '>=', 'eof'])
    })

    it('tokenizes logical operators', () => {
      const tokens = tokenize('&& || !')
      expect(kinds(tokens)).toEqual(['&&', '||', '!', 'eof'])
    })

    it('tokenizes assignment operators', () => {
      const tokens = tokenize('= += -= *= /= %=')
      expect(kinds(tokens)).toEqual(['=', '+=', '-=', '*=', '/=', '%=', 'eof'])
    })

    it('tokenizes arrow operator', () => {
      const tokens = tokenize('->')
      expect(kinds(tokens)).toEqual(['->', 'eof'])
    })

    it('tokenizes fat arrow operator', () => {
      const tokens = tokenize('=>')
      expect(kinds(tokens)).toEqual(['=>', 'eof'])
    })
  })

  describe('delimiters', () => {
    it('tokenizes all delimiters', () => {
      const tokens = tokenize('{ } ( ) [ ] , ; : .')
      expect(kinds(tokens)).toEqual(['{', '}', '(', ')', '[', ']', ',', ';', ':', '.', 'eof'])
    })
  })

  describe('selectors', () => {
    it('tokenizes simple selectors', () => {
      const tokens = tokenize('@a @e @s @p @r @n')
      expect(tokens.filter(t => t.kind !== 'eof').map(t => [t.kind, t.value])).toEqual([
        ['selector', '@a'],
        ['selector', '@e'],
        ['selector', '@s'],
        ['selector', '@p'],
        ['selector', '@r'],
        ['selector', '@n'],
      ])
    })

    it('tokenizes selectors with parameters', () => {
      const tokens = tokenize('@e[type=zombie] @a[distance=..5]')
      expect(tokens.filter(t => t.kind !== 'eof').map(t => [t.kind, t.value])).toEqual([
        ['selector', '@e[type=zombie]'],
        ['selector', '@a[distance=..5]'],
      ])
    })

    it('tokenizes selectors with complex NBT', () => {
      const tokens = tokenize('@e[type=zombie, nbt={NoAI:1b}]')
      expect(tokens.filter(t => t.kind !== 'eof').map(t => [t.kind, t.value])).toEqual([
        ['selector', '@e[type=zombie, nbt={NoAI:1b}]'],
      ])
    })

    it('handles nested braces in selector NBT', () => {
      const tokens = tokenize('@e[nbt={Items:[{id:"stone"}]}]')
      expect(tokens.filter(t => t.kind !== 'eof').map(t => [t.kind, t.value])).toEqual([
        ['selector', '@e[nbt={Items:[{id:"stone"}]}]'],
      ])
    })
  })

  describe('decorators', () => {
    it('tokenizes simple decorators', () => {
      const tokens = tokenize('@tick @on_trigger')
      expect(tokens.filter(t => t.kind !== 'eof').map(t => [t.kind, t.value])).toEqual([
        ['decorator', '@tick'],
        ['decorator', '@on_trigger'],
      ])
    })

    it('tokenizes decorators with arguments', () => {
      const tokens = tokenize('@tick(rate=20)')
      expect(tokens.filter(t => t.kind !== 'eof').map(t => [t.kind, t.value])).toEqual([
        ['decorator', '@tick(rate=20)'],
      ])
    })
  })

  describe('raw commands', () => {
    it('tokenizes raw command', () => {
      const tokens = tokenize('raw("say hello")')
      expect(tokens.filter(t => t.kind !== 'eof').map(t => [t.kind, t.value])).toEqual([
        ['raw_cmd', 'say hello'],
      ])
    })
  })

  describe('comments', () => {
    it('skips line comments', () => {
      const tokens = tokenize('let x = 5 // this is a comment\nlet y = 10')
      expect(kinds(tokens)).toEqual(['let', 'ident', '=', 'int_lit', 'let', 'ident', '=', 'int_lit', 'eof'])
    })
  })

  describe('complex expressions', () => {
    it('tokenizes function declaration', () => {
      const source = 'fn add(a: int, b: int) -> int { return a + b; }'
      const tokens = tokenize(source)
      expect(kinds(tokens)).toEqual([
        'fn', 'ident', '(', 'ident', ':', 'int', ',', 'ident', ':', 'int', ')',
        '->', 'int', '{', 'return', 'ident', '+', 'ident', ';', '}', 'eof'
      ])
    })

    it('tokenizes foreach statement', () => {
      const source = 'foreach (z in @e[type=zombie]) { kill(z); }'
      const tokens = tokenize(source)
      expect(kinds(tokens)).toEqual([
        'foreach', '(', 'ident', 'in', 'selector', ')', '{', 'ident', '(', 'ident', ')', ';', '}', 'eof'
      ])
    })

    it('tokenizes decorated function', () => {
      const source = '@tick(rate=20)\nfn heartbeat() { say("alive"); }'
      const tokens = tokenize(source)
      expect(kinds(tokens)).toEqual([
        'decorator', 'fn', 'ident', '(', ')', '{', 'ident', '(', 'string_lit', ')', ';', '}', 'eof'
      ])
    })
  })

  describe('line/column tracking', () => {
    it('tracks line and column correctly', () => {
      const source = 'let x\nlet y'
      const tokens = tokenize(source)
      expect(tokens[0]).toMatchObject({ kind: 'let', line: 1, col: 1 })
      expect(tokens[1]).toMatchObject({ kind: 'ident', value: 'x', line: 1, col: 5 })
      expect(tokens[2]).toMatchObject({ kind: 'let', line: 2, col: 1 })
      expect(tokens[3]).toMatchObject({ kind: 'ident', value: 'y', line: 2, col: 5 })
    })
  })

  describe('edge cases', () => {
    it('handles empty input', () => {
      const tokens = tokenize('')
      expect(kinds(tokens)).toEqual(['eof'])
    })

    it('handles whitespace only', () => {
      const tokens = tokenize('   \n\t  ')
      expect(kinds(tokens)).toEqual(['eof'])
    })

    it('distinguishes selector from decorator', () => {
      // @a is selector (single char followed by non-letter)
      // @aa would be decorator
      const tokens = tokenize('@a @aa')
      expect(tokens.filter(t => t.kind !== 'eof').map(t => [t.kind, t.value])).toEqual([
        ['selector', '@a'],
        ['decorator', '@aa'],
      ])
    })
  })
})

describe('Block comments', () => {
  it('skips single-line block comment', () => {
    const src = `/* comment */ fn test() {}`
    const tokens = tokenize(src)
    expect(tokens.map(t => t.kind)).not.toContain('/')
    expect(tokens.find(t => t.kind === 'fn')).toBeDefined()
  })

  it('skips multi-line block comment', () => {
    const src = `/**
 * JSDoc comment
 */
fn test() {}`
    const tokens = tokenize(src)
    expect(tokens.map(t => t.kind)).not.toContain('/')
    expect(tokens.find(t => t.kind === 'fn')).toBeDefined()
  })

  it('handles block comment with asterisks', () => {
    const src = `/*** stars ***/fn x(){}`
    const tokens = tokenize(src)
    expect(tokens.find(t => t.kind === 'fn')).toBeDefined()
  })
})
