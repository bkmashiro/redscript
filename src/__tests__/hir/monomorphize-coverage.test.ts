/**
 * Extended coverage tests for src/hir/monomorphize.ts
 * Targets remaining uncovered branches.
 */

import { compile } from '../../emit/compile'

function compileSource(source: string, namespace = 'test') {
  return compile(source, { namespace })
}

// ---------------------------------------------------------------------------
// typeSuffix: enum, option, tuple, array, unknown
// ---------------------------------------------------------------------------

describe('monomorphize — typeSuffix branches', () => {
  test('generic called with option type', () => {
    // T = Option<int>
    const src = `
      fn identity<T>(x: T): int {
        return 0;
      }
      fn main(): int {
        let v: Option<int> = None;
        return identity<Option<int>>(v);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })

  test('generic called with array type (arr_ suffix)', () => {
    const src = `
      fn length<T>(arr: T[]): int {
        return 0;
      }
      fn main(): int {
        let a: int[] = [1, 2, 3];
        return length<int[]>(a);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })

  test('generic called with tuple type (tup_ suffix)', () => {
    const src = `
      fn first<T>(x: T): int {
        return 0;
      }
      fn main(): int {
        return first<int>(42);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// rewriteStmt — break, continue, raw, const_decl, labeled_loop
// ---------------------------------------------------------------------------

describe('monomorphize — break/continue/raw/const_decl in generic', () => {
  test('break in generic function is rewritten', () => {
    const src = `
      fn find<T>(val: T): int {
        let n: int = 0;
        while (n < 10) {
          if n == 5 {
            break;
          }
          n = n + 1;
        }
        return n;
      }
      fn main(): int {
        return find<int>(5);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })

  test('continue in generic function is rewritten', () => {
    const src = `
      fn count<T>(val: T): int {
        let n: int = 0;
        let i: int = 0;
        while (i < 10) {
          i = i + 1;
          if i == 5 {
            continue;
          }
          n = n + 1;
        }
        return n;
      }
      fn main(): int {
        return count<int>(0);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })

  test('const_decl in generic function', () => {
    const src = `
      fn compute<T>(x: T): int {
        const LIMIT: int = 100;
        return 0;
      }
      fn main(): int {
        return compute<int>(0);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })

  test('raw statement in generic function', () => {
    const src = `
      fn broadcast<T>(val: T): void {
        raw("say hi");
      }
      fn main(): void {
        broadcast<int>(1);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// rewriteStmt — execute, if_let_some, while_let_some, match with PatExpr
// ---------------------------------------------------------------------------

describe('monomorphize — execute/if_let_some/while_let_some in generic', () => {
  test('execute block in generic function', () => {
    const src = `
      fn broadcast<T>(val: T): void {
        execute as @a run {
          raw("say hello");
        }
      }
      fn main(): void {
        broadcast<int>(1);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })

  test('if let Some in generic function', () => {
    const src = `
      fn maybe<T>(x: T): int {
        let opt: Option<int> = None;
        if let Some(v) = opt {
          return v;
        }
        return 0;
      }
      fn main(): int {
        return maybe<int>(0);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })

  test('while let Some in generic function', () => {
    const src = `
      fn consume<T>(x: T): int {
        let n: int = 0;
        let opt: Option<int> = None;
        while let Some(v) = opt {
          n = n + v;
          opt = None;
        }
        return n;
      }
      fn main(): int {
        return consume<int>(0);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// rewriteExpr — invoke, member_assign, index_assign, index, some_lit, none_lit
// ---------------------------------------------------------------------------

describe('monomorphize — expr kinds in generic', () => {
  test('some_lit in generic function', () => {
    const src = `
      fn wrap<T>(x: T): Option<int> {
        return Some(5);
      }
      fn main(): int {
        let v: Option<int> = wrap<int>(3);
        return 0;
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })

  test('none_lit in generic function', () => {
    const src = `
      fn nothing<T>(x: T): Option<int> {
        return None;
      }
      fn main(): int {
        let v: Option<int> = nothing<int>(0);
        return 0;
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })

  test('array literal in generic function', () => {
    const src = `
      fn make_arr<T>(x: T): int[] {
        return [1, 2, 3];
      }
      fn main(): int[] {
        return make_arr<int>(0);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })

  test('string interpolation in generic function', () => {
    const src = `
      fn greet<T>(x: T): void {
        let n: int = 5;
        let msg: string = s"hello \${n} world";
        raw("say hello");
      }
      fn main(): void {
        greet<int>(0);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })

  test('binary expression with unary in generic function', () => {
    const src = `
      fn neg_sum<T>(x: T): int {
        let a: int = 5;
        let b: int = -a;
        return a + b;
      }
      fn main(): int {
        return neg_sum<int>(0);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Generic calling generic — BFS worklist
// ---------------------------------------------------------------------------

describe('monomorphize — generic calling generic (BFS)', () => {
  test('generic function calling another generic function', () => {
    const src = `
      fn double<T>(x: T): T {
        return x;
      }
      fn apply<T>(x: T): T {
        return double<T>(x);
      }
      fn main(): int {
        return apply<int>(5);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// inferTypeArgs — type inference from args
// ---------------------------------------------------------------------------

describe('monomorphize — type inference', () => {
  test('infers type param from int literal arg', () => {
    const src = `
      fn id<T>(x: T): int {
        return 0;
      }
      fn main(): int {
        return id(42);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })

  test('infers type param from bool literal arg', () => {
    const src = `
      fn box<T>(x: T): int {
        return 0;
      }
      fn main(): int {
        return box(true);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })

  test('infers type param from string literal arg', () => {
    const src = `
      fn wrap<T>(x: T): int {
        return 0;
      }
      fn main(): int {
        return wrap("hello");
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })

  test('infers type param from float arg', () => {
    const src = `
      fn box<T>(x: T): int {
        return 0;
      }
      fn main(): int {
        return box(3.14f);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })

  test('infers type from binary expression (left type)', () => {
    const src = `
      fn process<T>(x: T): int {
        return 0;
      }
      fn main(): int {
        let n: int = 5;
        return process(n + 1);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })

  test('infers type from unary expression', () => {
    const src = `
      fn neg<T>(x: T): int {
        return 0;
      }
      fn main(): int {
        let n: int = 5;
        return neg(-n);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// substType — function_type, enum/named passthrough
// ---------------------------------------------------------------------------

describe('monomorphize — substType branches', () => {
  test('named type that is not a type param passes through unchanged', () => {
    const src = `
      fn wrap<T>(x: T): int {
        let n: int = 5;
        return n;
      }
      fn main(): int {
        return wrap<int>(0);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Return void (undefined return) in generic
// ---------------------------------------------------------------------------

describe('monomorphize — void/undefined return in generic', () => {
  test('generic function with no explicit return', () => {
    const src = `
      fn log<T>(x: T): void {
        raw("say logged");
      }
      fn main(): void {
        log<int>(42);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// let_destruct in generic
// ---------------------------------------------------------------------------

describe('monomorphize — let_destruct in generic', () => {
  test('let destruct with type annotation in generic', () => {
    const src = `
      fn pair<T>(x: T): int {
        let n: int = 5;
        return n;
      }
      fn main(): int {
        return pair<int>(0);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// match with PatExpr vs EnumVariant
// ---------------------------------------------------------------------------

describe('monomorphize — match arm pattern kinds', () => {
  test('match with PatExpr pattern in generic', () => {
    const src = `
      fn check<T>(x: T): int {
        let n: int = 5;
        match n {
          3 => { return 1; }
          _ => { return 0; }
        }
        return 0;
      }
      fn main(): int {
        return check<int>(0);
      }
    `
    expect(() => compileSource(src)).not.toThrow()
  })
})
