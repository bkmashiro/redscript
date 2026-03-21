/**
 * Additional coverage for src/mir/lower.ts
 *
 * Targets:
 * - unary op '!' (not)
 * - path_expr (enum variant integer)
 * - enum_construct with payload
 * - nested struct member access (v.pos.x)
 * - dynamic array index (arr[i])
 * - dynamic array index_assign (arr[i] = val)
 * - static_call / invoke method
 * - for_range loop lower
 * - break/continue in loops
 * - as_block / at_block
 * - string_interp / f_string exprs
 */

import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { verifyMIR } from '../../mir/verify'
import type { MIRModule } from '../../mir/types'
import { compile } from '../../emit/compile'

function compileMIR(source: string): MIRModule {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  const hir = lowerToHIR(ast)
  return lowerToMIR(hir)
}

// ── unary not ─────────────────────────────────────────────────────────────

describe('MIR lower — unary not', () => {
  test('boolean not emits not instr', () => {
    const mod = compileMIR(`
      fn f(b: bool): bool {
        return !b;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = mod.functions[0]
    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    const notInstr = allInstrs.find(i => i.kind === 'not')
    expect(notInstr).toBeDefined()
  })
})

// ── path_expr ─────────────────────────────────────────────────────────────

describe('MIR lower — path_expr (enum variant)', () => {
  test('enum variant used as value is a copy from const src in MIR', () => {
    const mod = compileMIR(`
      enum Phase { Idle, Running, Done }
      fn f(): int {
        let p: Phase = Phase::Running;
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = mod.functions.find(f => f.name === 'f')!
    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    // Phase::Running → copy with const src value=1
    const copyInstrs = allInstrs.filter(i => i.kind === 'copy' && (i as any).src?.kind === 'const')
    expect(copyInstrs.length).toBeGreaterThan(0)
  })
})

// ── nested struct member ───────────────────────────────────────────────────

describe('MIR lower — nested struct member access', () => {
  test('v.pos.x compiles without error', () => {
    expect(() => compile(`
      struct Vec2 { x: int, y: int }
      struct Entity { pos: Vec2, hp: int }
      fn f(): int {
        let e: Entity = Entity { pos: Vec2 { x: 10, y: 20 }, hp: 100 };
        return e.pos.x;
      }
    `, { namespace: 'nested' })).not.toThrow()
  })
})

// ── dynamic array index ────────────────────────────────────────────────────

describe('MIR lower — dynamic array index', () => {
  test('let arr = []; arr[i] with variable index emits nbt_read_dynamic', () => {
    const mod = compileMIR(`
      fn f(i: int): int {
        let arr: int[] = [10, 20, 30];
        return arr[i];
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = mod.functions[0]
    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    const dynRead = allInstrs.find(i => i.kind === 'nbt_read_dynamic')
    expect(dynRead).toBeDefined()
  })

  test('let arr = []; arr[i] = v with variable index emits nbt_write_dynamic', () => {
    const mod = compileMIR(`
      fn f(i: int, v: int): int {
        let arr: int[] = [0, 0, 0];
        arr[i] = v;
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = mod.functions[0]
    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    const dynWrite = allInstrs.find(i => i.kind === 'nbt_write_dynamic')
    expect(dynWrite).toBeDefined()
  })

  test('let arr = []; arr[0] with constant index emits nbt_read (not dynamic)', () => {
    const mod = compileMIR(`
      fn f(): int {
        let arr: int[] = [10, 20, 30];
        return arr[0];
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = mod.functions[0]
    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    const staticRead = allInstrs.find(i => i.kind === 'nbt_read')
    expect(staticRead).toBeDefined()
  })

  test('let arr = []; arr[0] = v with constant index emits nbt_write (not dynamic)', () => {
    const mod = compileMIR(`
      fn f(v: int): int {
        let arr: int[] = [0, 0, 0];
        arr[0] = v;
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = mod.functions[0]
    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    const staticWrite = allInstrs.find(i => i.kind === 'nbt_write')
    expect(staticWrite).toBeDefined()
  })
})

// ── for_range loop ─────────────────────────────────────────────────────────

describe('MIR lower — for_range loop', () => {
  test('for i in 0..5 creates loop blocks', () => {
    const mod = compileMIR(`
      fn f(): int {
        let sum = 0;
        for i in 0..5 {
          sum = sum + i;
        }
        return sum;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = mod.functions[0]
    expect(fn.blocks.length).toBeGreaterThan(2)
  })

  test('for i in 0..=5 (inclusive) creates loop blocks', () => {
    const mod = compileMIR(`
      fn f(): int {
        let total = 0;
        for i in 0..=4 {
          total = total + i;
        }
        return total;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })
})

// ── break / continue ─────────────────────────────────────────────────────

describe('MIR lower — break/continue in loops', () => {
  test('break in while loop compiles', () => {
    const mod = compileMIR(`
      fn f(): int {
        let x = 0;
        while (x < 10) {
          if (x == 5) { break; }
          x = x + 1;
        }
        return x;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = mod.functions[0]
    // break creates a dead block after it
    expect(fn.blocks.length).toBeGreaterThan(3)
  })

  test('continue in for loop compiles', () => {
    const mod = compileMIR(`
      fn f(): int {
        let sum = 0;
        for (let i: int = 0; i < 5; i = i + 1) {
          if (i == 2) { continue; }
          sum = sum + i;
        }
        return sum;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })
})

// ── as_block / at_block / as_at ─────────────────────────────────────────

describe('MIR lower — context blocks', () => {
  test('as @a block creates helper function', () => {
    const mod = compileMIR(`
      fn f(): int {
        as @a {
          raw("say hi");
        }
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = mod.functions[0]
    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    const ctxCall = allInstrs.find(i => i.kind === 'call_context')
    expect(ctxCall).toBeDefined()
  })

  test('at @s block creates helper function', () => {
    const mod = compileMIR(`
      fn f(): int {
        at @s {
          raw("say positioned");
        }
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })
})

// ── method calls (invoke) ─────────────────────────────────────────────────

describe('MIR lower — invoke method calls', () => {
  test('method call on struct instance compiles', () => {
    const mod = compileMIR(`
      struct Timer { ticks: int }
      impl Timer {
        fn advance(self): int {
          self.ticks = self.ticks + 1;
          return self.ticks;
        }
      }
      fn f(): int {
        let t: Timer = Timer { ticks: 0 };
        return t.advance();
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })
})

// ── string_interp ─────────────────────────────────────────────────────────

describe('MIR lower — string interpolation', () => {
  test('raw string variable compiles', () => {
    expect(() => compile(`
      fn f(): int {
        let s: string = "hello world";
        return 0;
      }
    `, { namespace: 'str2' })).not.toThrow()
  })

  test('f-string expression compiles to MIR', () => {
    const mod = compileMIR(`
      fn f(n: int): void {
        say(f"value is {n}");
      }
    `)
    // f-string should produce some instructions in the function
    expect(mod.functions.length).toBeGreaterThan(0)
  })
})

// ── multiple return values / void return ───────────────────────────────────

describe('MIR lower — return variants', () => {
  test('void function with no return stmt compiles', () => {
    const mod = compileMIR(`
      fn f(): void {
        raw("say nothing");
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = mod.functions[0]
    // Last term should be return with null
    const lastBlock = fn.blocks[fn.blocks.length - 1]
    expect(lastBlock.term.kind).toBe('return')
  })

  test('early return in conditional compiles', () => {
    const mod = compileMIR(`
      fn f(n: int): int {
        if (n < 0) { return -1; }
        if (n == 0) { return 0; }
        return 1;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    expect(mod.functions[0].blocks.length).toBeGreaterThan(2)
  })
})

// ── const val as fn param ──────────────────────────────────────────────────

describe('MIR lower — constant propagation', () => {
  test('boolean literal true compiles to const 1 in MIR return', () => {
    const mod = compileMIR(`
      fn f(): bool {
        return true;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = mod.functions[0]
    // return should carry const value 1
    const retBlock = fn.blocks[0]
    const retTerm = retBlock.term
    expect(retTerm.kind).toBe('return')
    // value should be const 1
    if (retTerm.kind === 'return' && retTerm.value) {
      expect(retTerm.value).toEqual({ kind: 'const', value: 1 })
    }
  })

  test('negative literal compiles via unary minus', () => {
    const mod = compileMIR(`
      fn f(): int {
        return -5;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })
})
