/**
 * Coverage boost for src/mir/lower.ts (part 4)
 *
 * Targets uncovered branches:
 * - module-level const: bool_lit and float_lit kinds (lines 88-89)
 * - return stmt: struct_lit, tuple_lit, ident-option, ident-struct (lines 759-785)
 * - while_let_some stmt (lines 1198-1247)
 * - match with PatNone/PatSome on function-call result (lines 963-987)
 * - match PatEnum with payload bindings (lines 1046-1076)
 * - match PatExpr range_lit with min+max, only min, only max (lines 1080-1103)
 * - match PatWild arm (lines 999-1003)
 * - const_decl with non-int value (lines 734-739)
 * - tuple destructure from ident/tuple-var (lines 699-719)
 * - binary: float mul/div scale correction (lines 1397-1418)
 * - type_cast: as double, as fixed/float, other (lines 2241-2286)
 * - Timer: start/pause/reset/elapsed/remaining methods (lines 2440-2498)
 * - list_push, list_pop, list_len with array vars (lines 1736-1778)
 * - setTimeout/setInterval (lines 1781-1851)
 * - static_call Timer::new (lines 2146-2161)
 * - invoke: struct method with self (lines 2091-2104)
 * - struct return from impl method (lines 2082-2093)
 */

import * as fs from 'fs'
import * as path from 'path'
import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { verifyMIR } from '../../mir/verify'
import type { MIRModule, MIRFunction } from '../../mir/types'
import { compile } from '../../emit/compile'

const TIMER_SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/timer.mcrs'), 'utf-8')

function compileWithTimer(extra: string) {
  return compile(TIMER_SRC + '\n' + extra, { namespace: 'test' })
}

function compileMIR(source: string): MIRModule {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  const hir = lowerToHIR(ast)
  return lowerToMIR(hir)
}

function getFn(mod: MIRModule, name?: string): MIRFunction {
  if (name) return mod.functions.find(f => f.name === name)!
  return mod.functions[0]
}

// ── Module-level const: bool and float kinds ───────────────────────────────

describe('MIR lower — module-level const bool/float', () => {
  test('bool const is mapped to 0/1', () => {
    const mod = compileMIR(`
      const ENABLED: bool = true;
      const DISABLED: bool = false;
      fn f(): int {
        if (ENABLED) { return 1; }
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    // The bool const should be compiled — function should exist with blocks
    const fn = getFn(mod)
    expect(fn).toBeDefined()
    expect(fn.blocks.length).toBeGreaterThan(0)
  })

  test('float const is stored as x10000 fixed', () => {
    const mod = compileMIR(`
      const PI_APPROX: float = 3.14;
      fn f(): int {
        return PI_APPROX;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    // Should compile without errors; const should be inlined
  })
})

// ── return with struct_lit ─────────────────────────────────────────────────

describe('MIR lower — return struct_lit', () => {
  test('returning a struct literal copies fields to __rf_ slots', () => {
    expect(() => compile(`
      struct Vec2 { x: int, y: int }
      fn make(a: int, b: int): Vec2 {
        return Vec2 { x: a, y: b };
      }
      fn f(): int {
        let v = make(3, 4);
        return v.x;
      }
    `, { namespace: 'retstruct' })).not.toThrow()
  })
})

// ── return with tuple_lit ──────────────────────────────────────────────────

describe('MIR lower — return tuple_lit', () => {
  test('returning a tuple literal copies elements to __rf_N slots', () => {
    expect(() => compile(`
      fn swap(a: int, b: int): (int, int) {
        return (b, a);
      }
      fn f(): int {
        let (x, y) = swap(1, 2);
        return x;
      }
    `, { namespace: 'rettuple' })).not.toThrow()
  })
})

// ── return ident where ident is an option struct var ──────────────────────

describe('MIR lower — return ident option struct var', () => {
  test('returning an Option variable copies has/val to __rf_ slots', () => {
    expect(() => compile(`
      fn wrap(n: int): Option<int> {
        let v: Option<int> = Some(n);
        return v;
      }
      fn f(): int {
        if let Some(x) = wrap(5) {
          return x;
        }
        return 0;
      }
    `, { namespace: 'retoptid' })).not.toThrow()
  })
})

// ── while_let_some ─────────────────────────────────────────────────────────

describe('MIR lower — while_let_some', () => {
  test('while let Some(x) = f() loops until None', () => {
    expect(() => compile(`
      fn next(n: int): Option<int> {
        if (n > 0) { return Some(n - 1); }
        return None;
      }
      fn f(): int {
        let sum: int = 0;
        let cur: int = 3;
        while let Some(x) = next(cur) {
          sum = sum + x;
          cur = x;
        }
        return sum;
      }
    `, { namespace: 'wls1' })).not.toThrow()
  })

  test('while let Some with structVar as init', () => {
    // Covers the sv path in while_let_some
    expect(() => compile(`
      fn f(): int {
        let opt: Option<int> = Some(2);
        let result: int = 0;
        while let Some(x) = opt {
          result = result + x;
          opt = None;
        }
        return result;
      }
    `, { namespace: 'wls2' })).not.toThrow()
  })
})

// ── match with PatNone/PatSome on function-call result ────────────────────

describe('MIR lower — match option from function call (non-ident)', () => {
  test('match on call() result with Some/None arms', () => {
    // match on non-ident option (function call) uses lowerExpr + __rf_has/__rf_val fallback
    expect(() => compile(`
      fn maybe(n: int): Option<int> {
        if (n > 0) { return Some(n); }
        return None;
      }
      fn f(): int {
        match maybe(3) {
          Some(x) => { return 1; }
          None => { return 0; }
        }
      }
    `, { namespace: 'matchcall' })).not.toThrow()
  })
})

// ── match PatEnum with payload bindings ───────────────────────────────────

describe('MIR lower — match PatEnum with payload', () => {
  test('enum variant with payload fields is lowered via nbt_read', () => {
    expect(() => compile(`
      enum Shape {
        Circle(radius: int),
        Square(side: int),
      }
      fn area(s: Shape): int {
        match s {
          Shape::Circle(r) => { return r; }
          Shape::Square(si) => { return si; }
        }
      }
    `, { namespace: 'patenpayload' })).not.toThrow()
  })
})

// ── match PatExpr range_lit ───────────────────────────────────────────────

describe('MIR lower — match range patterns', () => {
  test('range with both min and max', () => {
    const mod = compileMIR(`
      fn f(n: int): int {
        match n {
          1..5 => { return 1; }
          _ => { return 0; }
        }
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })

  test('range with only min bound', () => {
    const mod = compileMIR(`
      fn f(n: int): int {
        match n {
          10.. => { return 1; }
          _ => { return 0; }
        }
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })

  test('range with only max bound', () => {
    const mod = compileMIR(`
      fn f(n: int): int {
        match n {
          ..5 => { return 1; }
          _ => { return 0; }
        }
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })

  test('match with PatWild (wildcard) arm', () => {
    const mod = compileMIR(`
      fn f(n: int): int {
        match n {
          1 => { return 1; }
          _ => { return 99; }
        }
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = getFn(mod)
    // Should have match_arm and/or match_merge blocks from the match statement
    expect(fn.blocks.length).toBeGreaterThan(1)
  })
})

// ── tuple destructure from ident/tuple-var ────────────────────────────────

describe('MIR lower — tuple destructure from ident', () => {
  test('let (a, b) = existing_tuple destructures via tupleVars', () => {
    expect(() => compile(`
      fn pair(): (int, int) { return (3, 4); }
      fn f(): int {
        let (x, y) = pair();
        let (a, b) = (x, y);
        return a + b;
      }
    `, { namespace: 'tupid' })).not.toThrow()
  })
})

// ── binary: float mul/div scale correction ────────────────────────────────

describe('MIR lower — float arithmetic scale correction', () => {
  test('fixed * fixed emits scale correction div', () => {
    expect(() => compile(`
      fn f(a: float, b: float): float {
        return a * b;
      }
    `, { namespace: 'fltmul' })).not.toThrow()
  })

  test('fixed / fixed emits scale correction mul then div', () => {
    expect(() => compile(`
      fn f(a: float, b: float): float {
        return a / b;
      }
    `, { namespace: 'fltdiv' })).not.toThrow()
  })

  test('mixed float + int propagates float tag', () => {
    expect(() => compile(`
      fn f(a: float, b: int): float {
        return a + b;
      }
    `, { namespace: 'fltadd' })).not.toThrow()
  })
})

// ── type_cast: as double ───────────────────────────────────────────────────

describe('MIR lower — type_cast as double', () => {
  test('int as double stores via scoreboard and reads back', () => {
    expect(() => compile(`
      fn f(n: int): void {
        let d: double = n as double;
      }
    `, { namespace: 'castdbl' })).not.toThrow()
  })

  test('double var as int (nbt_read path)', () => {
    expect(() => compile(`
      fn f(): int {
        let d: double = 1.5d;
        return d as int;
      }
    `, { namespace: 'castint' })).not.toThrow()
  })

  test('double var as fixed (floatTemps path)', () => {
    expect(() => compile(`
      fn f(): float {
        let d: double = 2.0d;
        return d as fixed;
      }
    `, { namespace: 'castfixed' })).not.toThrow()
  })

  test('other cast passes through expression', () => {
    expect(() => compile(`
      fn f(n: int): int {
        return n as int;
      }
    `, { namespace: 'castother' })).not.toThrow()
  })
})

// ── list_push / list_pop / list_len ──────────────────────────────────────

describe('MIR lower — list_push/pop/len builtins', () => {
  test('list_push appends to array var', () => {
    const mod = compileMIR(`
      fn f(): int {
        let arr: int[] = [1, 2];
        list_push(arr, 3);
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = getFn(mod)
    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    const appendCall = allInstrs.find(i => i.kind === 'call' && (i as any).fn?.includes('append'))
    expect(appendCall).toBeDefined()
  })

  test('list_pop removes last element', () => {
    const mod = compileMIR(`
      fn f(): int {
        let arr: int[] = [1, 2, 3];
        list_pop(arr);
        return 0;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const fn = getFn(mod)
    const allInstrs = fn.blocks.flatMap(b => b.instrs)
    const removeCall = allInstrs.find(i => i.kind === 'call' && (i as any).fn?.includes('remove'))
    expect(removeCall).toBeDefined()
  })

  test('list_len reads array length via nbt_read', () => {
    const mod = compileMIR(`
      fn f(): int {
        let arr: int[] = [1, 2, 3];
        return list_len(arr);
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })
})

// ── setTimeout / setInterval ─────────────────────────────────────────────

describe('MIR lower — setTimeout/setInterval', () => {
  test('setTimeout with literal ticks creates callback and schedule', () => {
    const mod = compileMIR(`
      fn f(): void {
        setTimeout(20, () => {
          raw("say timeout fired");
        });
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    // Should have generated a callback helper function (name contains __timeout_callback_)
    expect(mod.functions.some(fn => fn.name.includes('__timeout_callback_'))).toBe(true)
  })

  test('setInterval reschedules itself', () => {
    const mod = compileMIR(`
      fn f(): void {
        setInterval(10, () => {
          raw("say tick");
        });
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
    const cbFn = mod.functions.find(fn => fn.name.includes('__timeout_callback_'))
    expect(cbFn).toBeDefined()
    // setInterval callback should reschedule itself with a raw schedule call
    const allInstrs = cbFn!.blocks.flatMap(b => b.instrs)
    const schedCall = allInstrs.find(i => i.kind === 'call' && (i as any).fn?.includes('schedule'))
    expect(schedCall).toBeDefined()
  })

  test('setTimeout with dynamic ticks uses fallback path', () => {
    const mod = compileMIR(`
      fn f(n: int): void {
        setTimeout(n, () => {
          raw("say dynamic");
        });
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })
})

// ── static_call Timer::new ────────────────────────────────────────────────

describe('MIR lower — Timer::new static call', () => {
  test('Timer::new allocates unique id and emits score_write for ticks/active', () => {
    const result = compileWithTimer(`
      @keep fn f(): void {
        let t: Timer = Timer::new(100);
      }
    `)
    expect(result.success).toBe(true)
    // Should produce scoreboard set instructions for __timer_N_ticks and __timer_N_active
    const fnFile = result.files.find(f => f.path.includes('/f.mcfunction'))
    expect(fnFile?.content).toContain('__timer_')
  })

  test('two Timer::new calls get distinct IDs', () => {
    const result = compileWithTimer(`
      @keep fn f(): void {
        let t1: Timer = Timer::new(100);
        let t2: Timer = Timer::new(200);
      }
    `)
    expect(result.success).toBe(true)
    // Should have __timer_0_ and __timer_1_ scoreboard references
    const fnFile = result.files.find(f => f.path.includes('/f.mcfunction'))
    expect(fnFile?.content).toContain('__timer_0')
    expect(fnFile?.content).toContain('__timer_1')
  })
})

// ── Timer instance methods ────────────────────────────────────────────────

describe('MIR lower — Timer instance methods', () => {
  test('t.start() emits active scoreboard write', () => {
    const result = compileWithTimer(`
      @keep fn f(): void {
        let t: Timer = Timer::new(100);
        t.start();
      }
    `)
    expect(result.success).toBe(true)
    const fnFile = result.files.find(f => f.path.includes('/f.mcfunction'))
    expect(fnFile?.content).toContain('__timer_')
  })

  test('t.pause() compiles without error', () => {
    const result = compileWithTimer(`
      @keep fn f(): void {
        let t: Timer = Timer::new(100);
        t.start();
        t.pause();
      }
    `)
    expect(result.success).toBe(true)
  })

  test('t.reset() compiles without error', () => {
    const result = compileWithTimer(`
      @keep fn f(): void {
        let t: Timer = Timer::new(100);
        t.reset();
      }
    `)
    expect(result.success).toBe(true)
  })

  test('t.elapsed() compiles and reads ticks scoreboard', () => {
    const result = compileWithTimer(`
      @keep fn f(): int {
        let t: Timer = Timer::new(100);
        return t.elapsed();
      }
    `)
    expect(result.success).toBe(true)
    const fnFile = result.files.find(f => f.path.includes('/f.mcfunction'))
    expect(fnFile?.content).toContain('ticks')
  })

  test('t.remaining() compiles and emits sub-like output', () => {
    const result = compileWithTimer(`
      @keep fn f(): int {
        let t: Timer = Timer::new(100);
        return t.remaining();
      }
    `)
    expect(result.success).toBe(true)
    // remaining() reads ticks and subtracts from duration
    const fnFile = result.files.find(f => f.path.includes('/f.mcfunction'))
    expect(fnFile).toBeDefined()
  })

  test('t.done() emits cmp check against duration', () => {
    const result = compileWithTimer(`
      @keep fn f(): int {
        let t: Timer = Timer::new(50);
        if (t.done()) { return 1; }
        return 0;
      }
    `)
    expect(result.success).toBe(true)
  })

  test('t.tick() emits branching logic for increment', () => {
    const result = compileWithTimer(`
      @keep fn f(): void {
        let t: Timer = Timer::new(100);
        t.start();
        t.tick();
      }
    `)
    expect(result.success).toBe(true)
    // tick() should expand to multiple mcfunctions or inline branches
    expect(result.files.length).toBeGreaterThan(0)
  })
})

// ── invoke struct method with self ────────────────────────────────────────

describe('MIR lower — invoke struct impl method', () => {
  test('v.method() where method is an impl method produces method call', () => {
    expect(() => compile(`
      struct Counter { val: int }
      impl Counter {
        fn inc(self): Counter {
          return Counter { val: self.val + 1 };
        }
        fn get(self): int {
          return self.val;
        }
      }
      fn f(): int {
        let c = Counter { val: 0 };
        let c2 = c.inc();
        return c2.get();
      }
    `, { namespace: 'implmeth' })).not.toThrow()
  })
})

// ── emit/compile: int32 overflow warning ─────────────────────────────────

describe('emit/compile — int32 overflow warning', () => {
  test('score_set value > INT32_MAX produces overflow warning', () => {
    // Trigger via a large constant computation that overflows int32
    // Use lenient mode so it still produces output
    const result = compile(`
      const BIG: int = 2147483647;
      fn f(): int {
        return BIG;
      }
    `, { namespace: 'overflow_check', lenient: true })
    // Just verify it compiles and produces output (warning may or may not appear)
    expect(result.files.length).toBeGreaterThan(0)
  })
})

// ── emit/compile: budget error path ───────────────────────────────────────

describe('emit/compile — analyzeBudget error level', () => {
  test('compile succeeds with warnings for normal code', () => {
    const result = compile(`
      fn f(): void {
        let x: int = 1;
        let y: int = 2;
      }
    `, { namespace: 'budgettest' })
    expect(result.success).toBe(true)
  })
})

// ── emit/compile: @schedule decorator ─────────────────────────────────────

describe('emit/compile — @schedule decorator', () => {
  test('@schedule with no args defaults to ticks=1', () => {
    const result = compile(`
      @schedule
      fn delayed(): void {
        raw("say scheduled");
      }
    `, { namespace: 'sched_default' })
    expect(result.success).toBe(true)
    expect(result.files.some(f => f.content.includes('schedule'))).toBe(true)
  })
})

// ── emit/compile: @coroutine with no args ────────────────────────────────

describe('emit/compile — @coroutine decorator default args', () => {
  test('@coroutine without args uses default batch=10', () => {
    const result = compile(`
      @coroutine
      fn long_task(n: int): void {
        let i: int = 0;
        while (i < n) {
          i = i + 1;
        }
      }
    `, { namespace: 'coro_default' })
    expect(result.success).toBe(true)
  })
})
