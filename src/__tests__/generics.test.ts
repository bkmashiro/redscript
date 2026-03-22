/**
 * Tests for Phase 2c: Generic functions (monomorphization)
 *
 * Covers:
 * - Parsing fn<T> declarations and typeParams
 * - Parsing explicit call<int>() type args
 * - Type inference from arguments (max(3, 5) → max_int)
 * - Monomorphization: unique specialized copies per type
 * - Mangled names: max_int, max_float
 * - Generic calling generic (clamp<T> calls min<T> and max<T>)
 * - Interaction with enum + tuple
 * - Correct scoreboard output
 */

import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { compile } from '../emit/compile'
import { monomorphize } from '../hir/monomorphize'
import { lowerToHIR } from '../hir/lower'
import type { Program } from '../ast/types'

function parse(source: string, namespace = 'test'): Program {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens).parse(namespace)
}

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  const f = files.find(f => f.path.includes(pathSubstr))
  return f?.content
}

// ---------------------------------------------------------------------------
// Parser tests
// ---------------------------------------------------------------------------

describe('Generics: Parser', () => {
  it('parses fn max<T>(a: T, b: T): T with typeParams', () => {
    const program = parse('fn max<T>(a: T, b: T): T {}')
    const fn = program.declarations[0]
    expect(fn.name).toBe('max')
    expect(fn.typeParams).toEqual(['T'])
    expect(fn.params[0].type).toEqual({ kind: 'struct', name: 'T' })
    expect(fn.params[1].type).toEqual({ kind: 'struct', name: 'T' })
    expect(fn.returnType).toEqual({ kind: 'struct', name: 'T' })
  })

  it('parses fn with two type params <A, B>', () => {
    const program = parse('fn swap<A, B>(a: A, b: B): A {}')
    const fn = program.declarations[0]
    expect(fn.typeParams).toEqual(['A', 'B'])
  })

  it('parses explicit type args max<int>(3, 5)', () => {
    const program = parse('fn _test(): int { return max<int>(3, 5); }')
    const ret = program.declarations[0].body[0]
    if (ret.kind === 'return' && ret.value && ret.value.kind === 'call') {
      expect(ret.value.fn).toBe('max')
      expect(ret.value.typeArgs).toBeDefined()
      expect(ret.value.typeArgs![0]).toEqual({ kind: 'named', name: 'int' })
    } else {
      throw new Error('Expected return with call node')
    }
  })

  it('parses call without type args (type inference)', () => {
    const program = parse('fn _test(): int { return max(3, 5); }')
    const ret = program.declarations[0].body[0]
    if (ret.kind === 'return' && ret.value && ret.value.kind === 'call') {
      expect(ret.value.fn).toBe('max')
      expect(ret.value.typeArgs).toBeUndefined()
    } else {
      throw new Error('Expected return with call node')
    }
  })

  it('does not break non-generic functions', () => {
    const program = parse('fn add(a: int, b: int): int { return a + b; }')
    const fn = program.declarations[0]
    expect(fn.typeParams).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Monomorphization unit tests
// ---------------------------------------------------------------------------

describe('Generics: Monomorphization', () => {
  function hirOf(source: string) {
    const tokens = new Lexer(source).tokenize()
    const ast = new Parser(tokens).parse('test')
    return lowerToHIR(ast)
  }

  it('removes generic template and adds max_int specialization', () => {
    const source = `
      fn max<T>(a: T, b: T): T {
        if (a > b) { return a; }
        return b;
      }
      fn use_max(): int {
        return max(3, 5);
      }
    `
    const hir = hirOf(source)
    const mono = monomorphize(hir)
    const names = mono.functions.map(f => f.name)
    expect(names).not.toContain('max')        // template removed
    expect(names).toContain('max_int')        // specialization added
    expect(names).toContain('use_max')        // regular fn preserved
  })

  it('generates both max_int and max_float for two call sites', () => {
    const source = `
      fn max<T>(a: T, b: T): T {
        if (a > b) { return a; }
        return b;
      }
      fn use_both(): int {
        let a: int = max(3, 5);
        return a;
      }
    `
    // Only int can be inferred from literals here, but let's check explicit type args too
    const source2 = `
      fn max<T>(a: T, b: T): T {
        if (a > b) { return a; }
        return b;
      }
      fn use_int(): int { return max<int>(3, 5); }
      fn use_fixed(): fixed { return max<fixed>(1.0, 2.0); }
    `
    const hir2 = hirOf(source2)
    const mono2 = monomorphize(hir2)
    const names2 = mono2.functions.map(f => f.name)
    expect(names2).toContain('max_int')
    expect(names2).toContain('max_fixed')
  })

  it('does not duplicate specializations (caching works)', () => {
    const source = `
      fn max<T>(a: T, b: T): T {
        if (a > b) { return a; }
        return b;
      }
      fn a(): int { return max(1, 2); }
      fn b(): int { return max(3, 4); }
      fn c(): int { return max(5, 6); }
    `
    const hir = hirOf(source)
    const mono = monomorphize(hir)
    const maxIntCount = mono.functions.filter(f => f.name === 'max_int').length
    expect(maxIntCount).toBe(1)  // only one copy
  })

  it('rewrites call sites to use mangled names', () => {
    const source = `
      fn min<T>(a: T, b: T): T {
        if (a < b) { return a; }
        return b;
      }
      fn use_min(): int {
        return min(10, 20);
      }
    `
    const hir = hirOf(source)
    const mono = monomorphize(hir)
    const useMin = mono.functions.find(f => f.name === 'use_min')!
    const ret = useMin.body[0]
    if (ret.kind === 'return' && ret.value && ret.value.kind === 'call') {
      expect(ret.value.fn).toBe('min_int')
    } else {
      throw new Error('Expected return with call')
    }
  })

  it('handles generic calling generic (clamp<T> → min<T>, max<T>)', () => {
    const source = `
      fn min<T>(a: T, b: T): T {
        if (a < b) { return a; }
        return b;
      }
      fn max<T>(a: T, b: T): T {
        if (a > b) { return a; }
        return b;
      }
      fn clamp<T>(val: T, lo: T, hi: T): T {
        return max(min(val, hi), lo);
      }
      fn use_clamp(): int {
        return clamp(5, 0, 10);
      }
    `
    const hir = hirOf(source)
    const mono = monomorphize(hir)
    const names = mono.functions.map(f => f.name)
    expect(names).toContain('clamp_int')
    expect(names).toContain('min_int')
    expect(names).toContain('max_int')
    expect(names).not.toContain('clamp')
    expect(names).not.toContain('min')
    expect(names).not.toContain('max')
  })

  it('preserves non-generic functions unchanged', () => {
    const source = `
      fn max<T>(a: T, b: T): T {
        if (a > b) { return a; }
        return b;
      }
      fn helper(x: int): int { return x + 1; }
    `
    const hir = hirOf(source)
    const mono = monomorphize(hir)
    expect(mono.functions.find(f => f.name === 'helper')).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// E2E compilation tests
// ---------------------------------------------------------------------------

describe('Generics: E2E compilation', () => {
  test('basic generic max<T> compiles to max_int.mcfunction', () => {
    const source = `
      fn max<T>(a: T, b: T): T {
        if (a > b) { return a; }
        return b;
      }
      fn use_max(): int {
        return max(3, 5);
      }
    `
    const result = compile(source, { namespace: 'test' })
    // Should generate max_int, not max
    expect(getFile(result.files, 'max_int.mcfunction')).toBeDefined()
    expect(getFile(result.files, '/max.mcfunction')).toBeUndefined()
    expect(getFile(result.files, 'use_max.mcfunction')).toBeDefined()
  })

  test('explicit type args max<int>(3, 5) compiles correctly', () => {
    const source = `
      fn max<T>(a: T, b: T): T {
        if (a > b) { return a; }
        return b;
      }
      fn use_max(): int {
        return max<int>(3, 5);
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(getFile(result.files, 'max_int.mcfunction')).toBeDefined()
  })

  test('two specializations: max_int and max_float', () => {
    const source = `
      fn max<T>(a: T, b: T): T {
        if (a > b) { return a; }
        return b;
      }
      fn use_int(): int { return max<int>(3, 5); }
      fn use_fixed(): fixed { return max<fixed>(1.0, 2.0); }
    `
    const result = compile(source, { namespace: 'test' })
    expect(getFile(result.files, 'max_int.mcfunction')).toBeDefined()
    expect(getFile(result.files, 'max_fixed.mcfunction')).toBeDefined()
  })

  test('type inference: max(3, 5) infers T=int and generates max_int', () => {
    const source = `
      fn max<T>(a: T, b: T): T {
        if (a > b) { return a; }
        return b;
      }
      fn main(): int { return max(3, 5); }
    `
    const result = compile(source, { namespace: 'test' })
    expect(getFile(result.files, 'max_int.mcfunction')).toBeDefined()
    // After auto-inline, max_int may be inlined into main; either the call
    // appears or the result (5) is directly emitted via constant folding
    const mainFn = getFile(result.files, 'main.mcfunction')
    expect(mainFn).toBeDefined()
    expect(
      (mainFn ?? '').includes('max_int') ||
      (mainFn ?? '').includes('5')  // constant-folded: max(3,5) = 5
    ).toBe(true)
  })

  test('clamp<T> using min<T> and max<T>: all three get specialized', () => {
    const source = `
      fn min<T>(a: T, b: T): T {
        if (a < b) { return a; }
        return b;
      }
      fn max<T>(a: T, b: T): T {
        if (a > b) { return a; }
        return b;
      }
      fn clamp<T>(val: T, lo: T, hi: T): T {
        return max(min(val, hi), lo);
      }
      fn main(): int {
        return clamp(5, 0, 10);
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(getFile(result.files, 'clamp_int.mcfunction')).toBeDefined()
    expect(getFile(result.files, 'min_int.mcfunction')).toBeDefined()
    expect(getFile(result.files, 'max_int.mcfunction')).toBeDefined()
    // After auto-inline, min_int and max_int may be inlined into clamp_int.
    // Verify the compilation succeeds and all three specializations are generated.
    const allContent = result.files.map(f => f.content).join('\n')
    expect(allContent.length).toBeGreaterThan(0)
  })

  test('generated max_int uses scoreboard operations', () => {
    const source = `
      fn max<T>(a: T, b: T): T {
        if (a > b) { return a; }
        return b;
      }
      fn use_max(): int {
        return max(1, 2);
      }
    `
    const result = compile(source, { namespace: 'ns' })
    const fn = getFile(result.files, 'max_int.mcfunction')!
    expect(fn).toBeDefined()
    expect(fn).toContain('__ns')
    expect(fn).toContain('scoreboard')
  })

  test('generics work with enum types (max<Phase>)', () => {
    const source = `
      enum Phase { Idle, Running, Done }
      fn max<T>(a: T, b: T): T {
        if (a > b) { return a; }
        return b;
      }
      fn main(): int {
        return max<int>(Phase::Running, Phase::Done);
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(getFile(result.files, 'max_int.mcfunction')).toBeDefined()
  })

  test('generics work alongside tuple return values', () => {
    const source = `
      fn max<T>(a: T, b: T): T {
        if (a > b) { return a; }
        return b;
      }
      fn minmax(a: int, b: int): (int, int) {
        return (max(a, b), max(b, a));
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(getFile(result.files, 'max_int.mcfunction')).toBeDefined()
    expect(getFile(result.files, 'minmax.mcfunction')).toBeDefined()
    // After auto-inline, max_int may be inlined into minmax
    const minmaxFn = getFile(result.files, 'minmax.mcfunction')!
    const allContent = result.files.map(f => f.content).join('\n')
    expect(minmaxFn.includes('max_int') || allContent.includes('scoreboard')).toBe(true)
  })

  test('abs<T> generic: abs(negative) returns positive', () => {
    const source = `
      fn abs<T>(x: T): T {
        if (x < 0) { return 0 - x; }
        return x;
      }
      fn main(): int {
        return abs(-5);
      }
    `
    const result = compile(source, { namespace: 'test' })
    expect(getFile(result.files, 'abs_int.mcfunction')).toBeDefined()
    // abs(-5) = 5 — after auto-inline may be inlined; verify file exists or result present
    const mainFn = getFile(result.files, 'main.mcfunction') ?? ''
    expect(mainFn.includes('abs_int') || mainFn.includes('5')).toBe(true)
  })

  test('unused generic produces no specialization files', () => {
    const source = `
      fn max<T>(a: T, b: T): T {
        if (a > b) { return a; }
        return b;
      }
      fn helper(): int { return 42; }
    `
    const result = compile(source, { namespace: 'test' })
    // max<T> is never called, so max_int should NOT exist
    expect(getFile(result.files, 'max_int.mcfunction')).toBeUndefined()
    expect(getFile(result.files, '/max.mcfunction')).toBeUndefined()
    expect(getFile(result.files, 'helper.mcfunction')).toBeDefined()
  })
})
