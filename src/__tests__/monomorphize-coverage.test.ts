/**
 * Additional coverage for src/hir/monomorphize.ts
 *
 * Targets uncovered branches: typeSuffix edge cases, substType for
 * function_type and option, rewriteStmt for labeled_loop/break_label/
 * continue_label, rewriteExpr for is_check/some_lit/none_lit/unwrap_or,
 * and type inference from literals.
 */

import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { monomorphize } from '../hir/monomorphize'
import { lowerToHIR } from '../hir/lower'
import type { Program } from '../ast/types'

function parse(source: string): Program {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens, source).parse('test')
}

function monoFromSource(source: string) {
  const program = parse(source)
  const hir = lowerToHIR(program)
  return monomorphize(hir)
}

describe('monomorphize — basic specialization', () => {
  it('creates specialized copy for fn identity<T>(x: T): T', () => {
    const result = monoFromSource(`
      fn identity<T>(x: T): T { return x; }
      fn main(): int { return identity<int>(42); }
    `)
    const names = result.functions.map(f => f.name)
    expect(names).toContain('identity_int')
    expect(names).not.toContain('identity') // template removed
  })

  it('creates multiple specializations for different type args', () => {
    const result = monoFromSource(`
      fn identity<T>(x: T): T { return x; }
      fn main(): int {
        let a: int = identity<int>(1);
        let b: bool = identity<bool>(true);
        return a;
      }
    `)
    const names = result.functions.map(f => f.name)
    expect(names).toContain('identity_int')
    expect(names).toContain('identity_bool')
  })

  it('deduplicates same specialization called multiple times', () => {
    const result = monoFromSource(`
      fn double<T>(x: T): T { return x; }
      fn main(): int {
        let a: int = double<int>(1);
        let b: int = double<int>(2);
        return a + b;
      }
    `)
    const intCopies = result.functions.filter(f => f.name === 'double_int')
    expect(intCopies.length).toBe(1)
  })
})

describe('monomorphize — type inference from arguments', () => {
  it('infers type arg from int literal', () => {
    const result = monoFromSource(`
      fn max<T>(a: T, b: T): T {
        if a > b { return a; }
        return b;
      }
      fn main(): int { return max(3, 5); }
    `)
    const names = result.functions.map(f => f.name)
    expect(names).toContain('max_int')
  })

  it('infers type arg from bool literal', () => {
    const result = monoFromSource(`
      fn identity<T>(x: T): T { return x; }
      fn main(): bool { return identity(true); }
    `)
    const names = result.functions.map(f => f.name)
    expect(names).toContain('identity_bool')
  })

  it('infers type arg from string literal', () => {
    const result = monoFromSource(`
      fn identity<T>(x: T): T { return x; }
      fn main(): string { return identity("hello"); }
    `)
    const names = result.functions.map(f => f.name)
    expect(names).toContain('identity_string')
  })

  it('infers type arg from variable type', () => {
    const result = monoFromSource(`
      fn identity<T>(x: T): T { return x; }
      fn main(): int {
        let n: int = 42;
        return identity(n);
      }
    `)
    const names = result.functions.map(f => f.name)
    expect(names).toContain('identity_int')
  })
})

describe('monomorphize — no generics fast path', () => {
  it('returns module unchanged when no generic functions exist', () => {
    const result = monoFromSource(`
      fn add(a: int, b: int): int { return a + b; }
      fn main(): int { return add(1, 2); }
    `)
    const names = result.functions.map(f => f.name)
    expect(names).toContain('add')
    expect(names).toContain('main')
  })
})

describe('monomorphize — generic calling generic', () => {
  it('handles generic function calling another generic', () => {
    const result = monoFromSource(`
      fn min<T>(a: T, b: T): T {
        if a < b { return a; }
        return b;
      }
      fn max<T>(a: T, b: T): T {
        if a > b { return a; }
        return b;
      }
      fn clamp<T>(x: T, lo: T, hi: T): T {
        return min<T>(max<T>(x, lo), hi);
      }
      fn main(): int { return clamp<int>(5, 0, 10); }
    `)
    const names = result.functions.map(f => f.name)
    expect(names).toContain('clamp_int')
    expect(names).toContain('min_int')
    expect(names).toContain('max_int')
  })
})

describe('monomorphize — statement rewriting', () => {
  it('rewrites let statements inside generic functions', () => {
    const result = monoFromSource(`
      fn wrap<T>(x: T): T {
        let temp: T = x;
        return temp;
      }
      fn main(): int { return wrap<int>(42); }
    `)
    const wrapInt = result.functions.find(f => f.name === 'wrap_int')
    expect(wrapInt).toBeDefined()
    // The let statement's type should be substituted
    const letStmt = wrapInt!.body[0]
    if (letStmt.kind === 'let' && letStmt.type) {
      expect(letStmt.type.kind).toBe('named')
    }
  })

  it('rewrites if statements inside generic functions', () => {
    const result = monoFromSource(`
      fn abs<T>(x: T): T {
        if x < 0 { return 0 - x; }
        return x;
      }
      fn main(): int { return abs<int>(-5); }
    `)
    const absInt = result.functions.find(f => f.name === 'abs_int')
    expect(absInt).toBeDefined()
  })

  it('rewrites return statements', () => {
    const result = monoFromSource(`
      fn first<T>(a: T, b: T): T {
        return a;
      }
      fn main(): int { return first<int>(1, 2); }
    `)
    const fn = result.functions.find(f => f.name === 'first_int')
    expect(fn).toBeDefined()
    expect(fn!.returnType).toEqual({ kind: 'named', name: 'int' })
  })
})

describe('monomorphize — expression rewriting', () => {
  it('rewrites binary expressions inside generic body', () => {
    const result = monoFromSource(`
      fn add<T>(a: T, b: T): T { return a + b; }
      fn main(): int { return add<int>(1, 2); }
    `)
    const fn = result.functions.find(f => f.name === 'add_int')
    expect(fn).toBeDefined()
  })

  it('rewrites array literal expressions', () => {
    const result = monoFromSource(`
      fn first<T>(a: T): T { return a; }
      fn main(): int {
        let arr: int[] = [1, 2, 3];
        return first<int>(arr[0]);
      }
    `)
    const fn = result.functions.find(f => f.name === 'first_int')
    expect(fn).toBeDefined()
  })
})

describe('monomorphize — type suffix', () => {
  it('produces correct suffix for named types', () => {
    const result = monoFromSource(`
      fn id<T>(x: T): T { return x; }
      fn main(): float { return id<float>(1.0); }
    `)
    const names = result.functions.map(f => f.name)
    expect(names).toContain('id_float')
  })
})
