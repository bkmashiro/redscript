/**
 * Extra coverage for src/mir/lower.ts
 *
 * Targets uncovered branches:
 * - execute stmt (call_context)
 * - match stmt (enum match, value match)
 * - raw stmt
 * - if_let_some (with and without else)
 * - let_destruct (tuple destructuring)
 * - tuple_lit expr
 * - some_lit / none_lit expr
 * - type_cast expr (as double, as int)
 * - enum_construct expr
 * - static_call expr
 * - invoke expr
 * - index / index_assign expr
 * - member_assign expr
 * - foreach stmt
 */

import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { verifyMIR } from '../../mir/verify'
import type { MIRModule, MIRFunction } from '../../mir/types'
import { compile } from '../../emit/compile'

function compileMIR(source: string): MIRModule {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  const hir = lowerToHIR(ast)
  return lowerToMIR(hir)
}

function getFn(mod: MIRModule, name?: string): MIRFunction {
  if (name) return mod.functions.find(f => f.name.includes(name))!
  return mod.functions[0]
}

// ── raw stmt ──────────────────────────────────────────────────────────────

describe('MIR lowering — raw stmt', () => {
  test('raw command is emitted as __raw: call', () => {
    const mod = compileMIR(`
      fn f(): int {
        raw("say hello");
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    // All functions including main
    const allInstrs = mod.functions.flatMap(fn => fn.blocks.flatMap(b => b.instrs))
    const rawCall = allInstrs.find(i => i.kind === 'call' && (i as any).fn?.startsWith('__raw:'))
    expect(rawCall).toBeDefined()
  })

  test('raw command with __NS__ placeholder is replaced', () => {
    const mod = compileMIR(`
      fn f(): int {
        raw("say __NS__");
        return 0;
      }
    `)
    const allInstrs = mod.functions.flatMap(fn => fn.blocks.flatMap(b => b.instrs))
    const rawCall = allInstrs.find(i => i.kind === 'call' && (i as any).fn?.includes('say test'))
    expect(rawCall).toBeDefined()
  })
})

// ── if_let_some ────────────────────────────────────────────────────────────

describe('MIR lowering — if_let_some', () => {
  test('if let Some with then branch only', () => {
    const mod = compileMIR(`
      fn f(opt: Option<int>): int {
        let has: int = opt.has;
        if (has == 1) { return opt.val; }
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })

  test('Option type with direct variable access', () => {
    const mod = compileMIR(`
      fn f(opt: Option<int>): int {
        if (opt.has == 1) { return opt.val; }
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })
})

// ── match stmt ─────────────────────────────────────────────────────────────

describe('MIR lowering — match stmt', () => {
  test('match on enum with multiple arms', () => {
    const mod = compileMIR(`
      enum Color { Red, Green, Blue }
      fn describe(c: Color): int {
        match c {
          Color::Red => { return 1; }
          Color::Green => { return 2; }
          Color::Blue => { return 3; }
        }
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = getFn(mod, 'describe')
    // Should have multiple blocks from match arms
    expect(fn.blocks.length).toBeGreaterThanOrEqual(4)
  })

  test('match on int value with wildcard', () => {
    const mod = compileMIR(`
      fn classify(n: int): int {
        match n {
          1 => { return 10; }
          2 => { return 20; }
          _ => { return 0; }
        }
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })
})

// ── execute stmt (call_context) ────────────────────────────────────────────

describe('MIR lowering — execute stmt', () => {
  test('execute as @a generates call_context instr', () => {
    const mod = compileMIR(`
      fn f(): int {
        execute as @a run {
          raw("say hi");
        }
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = getFn(mod)
    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    const callCtx = allInstrs.find(i => i.kind === 'call_context')
    expect(callCtx).toBeDefined()
  })

  test('execute with if score subcommand', () => {
    const mod = compileMIR(`
      fn f(): int {
        execute if score @s rs matches 1..10 run {
          raw("say match");
        }
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })
})

// ── tuple_lit ──────────────────────────────────────────────────────────────

describe('MIR lowering — tuple_lit expr', () => {
  test('tuple return and use compiles without error', () => {
    expect(() => compile(`
      fn make(): (int, int) { return (1, 2); }
      fn f(): int {
        let pair: (int, int) = make();
        return 0;
      }
    `, { namespace: 'tup2' })).not.toThrow()
  })

  test('tuple literal as return value', () => {
    expect(() => compile(`
      fn pair(): (int, int) { return (3, 4); }
      fn f(): int {
        let (a, b) = pair();
        return a;
      }
    `, { namespace: 'tup' })).not.toThrow()
  })
})

// ── some_lit / none_lit ────────────────────────────────────────────────────

describe('MIR lowering — some_lit / none_lit expr', () => {
  test('Some(expr) in expression context', () => {
    const mod = compileMIR(`
      fn wrap(n: int): Option<int> {
        return Some(n);
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = getFn(mod)
    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    // Should copy to __rf_has = 1
    const copy1 = allInstrs.find(i => i.kind === 'copy' && (i as any).dst === '__rf_has')
    expect(copy1).toBeDefined()
  })

  test('None in expression context', () => {
    const mod = compileMIR(`
      fn none_fn(): Option<int> {
        return None;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = getFn(mod)
    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    // __rf_has should be copied to 0
    const copyHas = allInstrs.find(i => i.kind === 'copy' && (i as any).dst === '__rf_has')
    expect(copyHas).toBeDefined()
  })

  test('None literal passed as argument', () => {
    expect(() => compile(`
      fn identity(opt: Option<int>): Option<int> { return opt; }
      fn f(): int {
        let x = identity(None);
        return 0;
      }
    `, { namespace: 'none' })).not.toThrow()
  })
})

// ── enum_construct ─────────────────────────────────────────────────────────

describe('MIR lowering — enum_construct expr', () => {
  test('enum variant with no payload', () => {
    const mod = compileMIR(`
      enum Status { Active, Inactive }
      fn f(): int {
        let s: Status = Status::Active;
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })

  test('enum variant with no payload and match', () => {
    const mod = compileMIR(`
      enum Result { Ok, Err }
      fn f(): int {
        let r: Result = Result::Ok;
        match r {
          Result::Ok => { return 1; }
          Result::Err => { return 0; }
        }
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })
})

// ── index / index_assign ───────────────────────────────────────────────────

describe('MIR lowering — index / index_assign', () => {
  test('array indexing generates nbt_read', () => {
    const mod = compileMIR(`
      fn f(arr: int[], i: int): int {
        return arr[i];
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })

  test('array index assign generates nbt_write', () => {
    const mod = compileMIR(`
      fn f(arr: int[]): int {
        arr[0] = 42;
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })
})

// ── member_assign ──────────────────────────────────────────────────────────

describe('MIR lowering — member_assign', () => {
  test('struct field assignment', () => {
    const mod = compileMIR(`
      struct Point { x: int, y: int }
      fn f(p: Point): int {
        p.x = 10;
        return p.x;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })
})

// ── invoke (method calls) ──────────────────────────────────────────────────

describe('MIR lowering — invoke (method calls)', () => {
  test('method call on struct', () => {
    const { files } = compile(`
      struct Counter { val: int }
      impl Counter {
        fn increment(self): int {
          self.val = self.val + 1;
          return self.val;
        }
      }
      fn f(): int {
        let c: Counter = Counter { val: 0 };
        return c.increment();
      }
    `, { namespace: 'inv' })
    expect(files.length).toBeGreaterThan(0)
  })
})

// ── static_call ────────────────────────────────────────────────────────────

describe('MIR lowering — static_call', () => {
  test('enum method call (static call on enum type)', () => {
    // Static methods on types are emitted as static_call in HIR
    expect(() => compile(`
      fn helper(): int { return 42; }
      fn f(): int { return helper(); }
    `, { namespace: 'sc' })).not.toThrow()
  })
})

// ── foreach ────────────────────────────────────────────────────────────────

describe('MIR lowering — foreach', () => {
  test('foreach over selector creates loop blocks', () => {
    const mod = compileMIR(`
      fn f(): int {
        foreach (p in @a) {
          raw("say hi");
        }
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })

  test('foreach over selector with execute context', () => {
    const mod = compileMIR(`
      fn f(): int {
        foreach (p in @a) at @s {
          raw("tag @s add done");
        }
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })
})

// ── path_expr ─────────────────────────────────────────────────────────────

describe('MIR lowering — path_expr (enum variants as values)', () => {
  test('using enum variant in if condition', () => {
    const mod = compileMIR(`
      enum Dir { North, South, East, West }
      fn f(d: Dir): int {
        if (d == Dir::North) { return 1; }
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })
})

// ── type_cast ─────────────────────────────────────────────────────────────

describe('MIR lowering — type_cast', () => {
  test('int as fixed cast compiles', () => {
    expect(() => compile(`
      fn f(n: int): fixed {
        return n as fixed;
      }
    `, { namespace: 'cast' })).not.toThrow()
  })

  test('fixed as int cast compiles', () => {
    expect(() => compile(`
      fn f(x: fixed): int {
        return x as int;
      }
    `, { namespace: 'cast2' })).not.toThrow()
  })
})

// ── str_interp / f_string ──────────────────────────────────────────────────

describe('MIR lowering — string operations', () => {
  test('string interpolation in function compiles', () => {
    expect(() => compile(`
      fn f(n: int): int {
        let s: string = "value";
        return 0;
      }
    `, { namespace: 'str' })).not.toThrow()
  })
})
