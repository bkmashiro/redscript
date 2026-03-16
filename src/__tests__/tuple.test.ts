/**
 * Tests for Phase 2b: Multi-return values / Tuple types
 *
 * Covers:
 * - Tuple type parsing: (int, int)
 * - Tuple literal parsing: (a, b)
 * - Destructuring let: let (q, r) = ...
 * - Function return type: fn f(): (int, int)
 * - Full compilation to scoreboard commands
 */

import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { compile } from '../emit/compile'
import type { Program, Stmt, Expr } from '../ast/types'

function parse(source: string, namespace = 'test'): Program {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens).parse(namespace)
}

function parseStmt(source: string): Stmt {
  const program = parse(`fn _test() { ${source} }`)
  return program.declarations[0].body[0]
}

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  const f = files.find(f => f.path.includes(pathSubstr))
  return f?.content
}

// ---------------------------------------------------------------------------
// Parser tests
// ---------------------------------------------------------------------------

describe('Tuple: Parser', () => {
  it('parses tuple type (int, int) as return type', () => {
    const program = parse('fn f(a: int, b: int): (int, int) {}')
    const fn = program.declarations[0]
    expect(fn.returnType).toEqual({ kind: 'tuple', elements: [
      { kind: 'named', name: 'int' },
      { kind: 'named', name: 'int' },
    ]})
  })

  it('parses tuple type with 3 elements', () => {
    const program = parse('fn f(): (int, bool, int) {}')
    expect(program.declarations[0].returnType).toEqual({ kind: 'tuple', elements: [
      { kind: 'named', name: 'int' },
      { kind: 'named', name: 'bool' },
      { kind: 'named', name: 'int' },
    ]})
  })

  it('parses tuple literal expression (a, b)', () => {
    const program = parse(`fn _test(a: int, b: int): (int, int) { return (a, b); }`)
    const ret = program.declarations[0].body[0]
    expect(ret.kind).toBe('return')
    if (ret.kind === 'return' && ret.value) {
      expect(ret.value.kind).toBe('tuple_lit')
      if (ret.value.kind === 'tuple_lit') {
        expect(ret.value.elements).toHaveLength(2)
        expect(ret.value.elements[0]).toMatchObject({ kind: 'ident', name: 'a' })
        expect(ret.value.elements[1]).toMatchObject({ kind: 'ident', name: 'b' })
      }
    }
  })

  it('parses destructuring let statement', () => {
    const stmt = parseStmt('let (q, r) = divmod(10, 3);')
    expect(stmt.kind).toBe('let_destruct')
    if (stmt.kind === 'let_destruct') {
      expect(stmt.names).toEqual(['q', 'r'])
      expect(stmt.init).toMatchObject({ kind: 'call', fn: 'divmod' })
    }
  })

  it('parses destructuring with 3 bindings', () => {
    const stmt = parseStmt('let (a, b, c) = get_triple(1);')
    expect(stmt.kind).toBe('let_destruct')
    if (stmt.kind === 'let_destruct') {
      expect(stmt.names).toEqual(['a', 'b', 'c'])
    }
  })

  it('does not confuse (expr) grouped expression with tuple literal', () => {
    const program = parse(`fn _test(): int { return (1 + 2); }`)
    const ret = program.declarations[0].body[0]
    expect(ret.kind).toBe('return')
    if (ret.kind === 'return' && ret.value) {
      expect(ret.value.kind).toBe('binary')
    }
  })

  it('still parses function type (int) -> int correctly', () => {
    const program = parse('fn apply(f: (int) -> int, x: int): int {}')
    const param = program.declarations[0].params[0]
    expect(param.type).toEqual({ kind: 'function_type', params: [{ kind: 'named', name: 'int' }], return: { kind: 'named', name: 'int' } })
  })
})

// ---------------------------------------------------------------------------
// E2E compilation tests
// ---------------------------------------------------------------------------

describe('Tuple: E2E compilation', () => {
  test('basic divmod function compiles and writes $ret_0 and $ret_1', () => {
    const source = `
      fn divmod(a: int, b: int): (int, int) {
        return (a / b, a % b);
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'divmod.mcfunction')
    expect(fn).toBeDefined()
    // MIR __rf_0 → LIR $ret_0 (see lir/lower.ts slot() method)
    expect(fn).toContain('$ret_0')
    expect(fn).toContain('$ret_1')
  })

  test('destructuring let reads from $ret_ slots after call', () => {
    const source = `
      fn divmod(a: int, b: int): (int, int) {
        return (a / b, a % b);
      }
      fn use_divmod(): int {
        let (q, r) = divmod(10, 3);
        return q + r;
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'use_divmod.mcfunction')
    expect(fn).toBeDefined()
    // Should call divmod and then read from $ret_ slots
    expect(fn).toContain('divmod')
    expect(fn).toContain('$ret_0')
    expect(fn).toContain('$ret_1')
  })

  test('tuple literal assigned directly via destructuring', () => {
    const source = `
      fn make_sum(a: int, b: int): int {
        let (x, y) = (a + 1, b + 2);
        return x + y;
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'make_sum.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('scoreboard players operation')
  })

  test('tuple values used in subsequent computation', () => {
    const source = `
      fn divmod(a: int, b: int): (int, int) {
        return (a / b, a % b);
      }
      fn compute(): int {
        let (q, r) = divmod(10, 3);
        return q + r;
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'compute.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('scoreboard players operation')
  })

  test('3-tuple return and destructuring', () => {
    const source = `
      fn triple(a: int): (int, int, int) {
        return (a, a + 1, a + 2);
      }
      fn use_triple(): int {
        let (x, y, z) = triple(5);
        return x + y + z;
      }
    `
    const result = compile(source, { namespace: 'test' })
    const tripleFn = getFile(result.files, 'triple.mcfunction')
    expect(tripleFn).toBeDefined()
    expect(tripleFn).toContain('$ret_0')
    expect(tripleFn).toContain('$ret_1')
    expect(tripleFn).toContain('$ret_2')
  })

  test('enum and tuple combined: return (int, Phase)', () => {
    const source = `
      enum Phase { Idle, Running, Done }
      fn get_state(): (int, int) {
        return (42, Phase::Running);
      }
      fn use_state(): int {
        let (count, phase) = get_state();
        return count + phase;
      }
    `
    const result = compile(source, { namespace: 'test' })
    const fn = getFile(result.files, 'get_state.mcfunction')
    expect(fn).toBeDefined()
    expect(fn).toContain('$ret_0')
    expect(fn).toContain('$ret_1')
    // Phase::Running = 1
    expect(fn).toContain('1')
  })

  test('tuple return type appears in generated mcfunction with correct objective', () => {
    const source = `
      fn minmax(a: int, b: int): (int, int) {
        return (a, b);
      }
    `
    const result = compile(source, { namespace: 'ns' })
    const fn = getFile(result.files, 'minmax.mcfunction')
    expect(fn).toBeDefined()
    // MIR __rf_0 → LIR $ret_0
    expect(fn).toContain('$ret_0')
    expect(fn).toContain('__ns')
  })
})
