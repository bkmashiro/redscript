/**
 * Coverage boost for src/mir/lower.ts (part 8)
 *
 * Targets uncovered branches:
 * - Timer methods: pause, reset, tick, done, elapsed, remaining, unknown (lines 2617-2750)
 * - lowerStringExprToPath: assign branch (line 2829-2874)
 * - selectorToString with complex range filters (line 2897)
 * - formatBuiltinCall: title, subtitle, actionbar, announce, tell, tellraw with f-string
 * - exprToCommandArg: byte_lit, short_lit, long_lit, double_lit, bool_lit variants
 * - lowerFunction with double param (line 325)
 * - lowerFunction with struct param in static impl method
 * - let with option type (via struct assignment branch)
 * - let with string/assign in lowerStringExprToPath
 * - lowerExpr: binary short-circuit && and || paths
 * - lowerExpr: type_cast to double
 * - double arithmetic: binary with double args
 * - foreach stmt
 */

import { compile } from '../../emit/compile'
import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { lowerToHIR } from '../../hir/lower'
import { lowerToMIR } from '../../mir/lower'
import { verifyMIR } from '../../mir/verify'
import type { MIRModule } from '../../mir/types'

function compileMIR(source: string): MIRModule {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  const hir = lowerToHIR(ast)
  return lowerToMIR(hir)
}

const TIMER_STUB = `
struct Timer { _id: int, _duration: int }
impl Timer {
  fn new(duration: int) -> Timer { return { _id: 0, _duration: duration }; }
  fn start(self) {}
  fn pause(self) {}
  fn reset(self) {}
  fn tick(self) {}
  fn done(self) -> int { return 0; }
  fn elapsed(self) -> int { return 0; }
  fn remaining(self) -> int { return 0; }
}
`

// ── Timer methods: pause, reset, tick, done, elapsed, remaining ────────────

describe('MIR lower — Timer methods', () => {
  test('Timer pause method compiles', () => {
    expect(() => compile(TIMER_STUB + `
      fn f(): int {
        let t: Timer = Timer::new(100);
        t.start();
        t.pause();
        return 0;
      }
    `, { namespace: 'timerpause' })).not.toThrow()
  })

  test('Timer reset method compiles', () => {
    expect(() => compile(TIMER_STUB + `
      fn f(): int {
        let t: Timer = Timer::new(200);
        t.start();
        t.reset();
        return 0;
      }
    `, { namespace: 'timerreset' })).not.toThrow()
  })

  test('Timer tick method compiles', () => {
    expect(() => compile(TIMER_STUB + `
      fn f(): int {
        let t: Timer = Timer::new(50);
        t.start();
        t.tick();
        return 0;
      }
    `, { namespace: 'timertick' })).not.toThrow()
  })

  test('Timer done method compiles', () => {
    expect(() => compile(TIMER_STUB + `
      fn f(): int {
        let t: Timer = Timer::new(100);
        t.start();
        return t.done();
      }
    `, { namespace: 'timerdone' })).not.toThrow()
  })

  test('Timer elapsed method compiles', () => {
    expect(() => compile(TIMER_STUB + `
      fn f(): int {
        let t: Timer = Timer::new(100);
        t.start();
        return t.elapsed();
      }
    `, { namespace: 'timerelapsed' })).not.toThrow()
  })

  test('Timer remaining method compiles', () => {
    expect(() => compile(TIMER_STUB + `
      fn f(): int {
        let t: Timer = Timer::new(100);
        t.start();
        return t.remaining();
      }
    `, { namespace: 'timerremaining' })).not.toThrow()
  })

  test('Timer tick via invoke (invoke path)', () => {
    expect(() => compile(TIMER_STUB + `
      fn f(): int {
        let t: Timer = Timer::new(60);
        t.start();
        t.tick();
        if (t.done() == 1) {
          t.reset();
        }
        return t.elapsed();
      }
    `, { namespace: 'timerall' })).not.toThrow()
  })
})

// ── Timer methods via invoke (callee is member) ────────────────────────────

describe('MIR lower — Timer methods via method call syntax', () => {
  test('Timer start/pause/reset/tick via method chaining compiles', () => {
    expect(() => compile(TIMER_STUB + `
      fn update_timer(): int {
        let t: Timer = Timer::new(20);
        t.start();
        t.tick();
        t.pause();
        t.reset();
        return t.elapsed();
      }
    `, { namespace: 'timerchain' })).not.toThrow()
  })
})

// ── lowerStringExprToPath: assign branch ──────────────────────────────────

describe('MIR lower — string assign lowering', () => {
  test('string variable assignment via let compiles', () => {
    expect(() => compile(`
      fn f(): int {
        let s: string = "hello";
        let s2: string = s;
        tell(@s, s2);
        return 0;
      }
    `, { namespace: 'strassign' })).not.toThrow()
  })
})

// ── selectorToString with range filters ───────────────────────────────────

describe('MIR lower — selectorToString with range filters', () => {
  test('selector with x_rotation range compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute as @a[x_rotation=-90..90] run {
          tell(@s, "looking forward");
        }
        return 0;
      }
    `, { namespace: 'selrotrange' })).not.toThrow()
  })

  test('selector with distance range compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute as @a[distance=..10] run {
          tell(@s, "nearby");
        }
        return 0;
      }
    `, { namespace: 'seldist' })).not.toThrow()
  })

  test('selector with min-only distance range compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute as @a[distance=5..] run {
          tell(@s, "far");
        }
        return 0;
      }
    `, { namespace: 'seldistmin' })).not.toThrow()
  })
})

// ── formatBuiltinCall: title/subtitle/actionbar/announce with str ──────────

describe('MIR lower — builtin text commands', () => {
  test('title with plain string compiles', () => {
    expect(() => compile(`
      fn f(): int {
        title(@s, "Welcome!");
        return 0;
      }
    `, { namespace: 'titlestr' })).not.toThrow()
  })

  test('subtitle with plain string compiles', () => {
    expect(() => compile(`
      fn f(): int {
        subtitle(@s, "Subtitle here");
        return 0;
      }
    `, { namespace: 'subtitlestr' })).not.toThrow()
  })

  test('actionbar with plain string compiles', () => {
    expect(() => compile(`
      fn f(): int {
        actionbar(@s, "Action bar!");
        return 0;
      }
    `, { namespace: 'actionbarstr' })).not.toThrow()
  })

  test('announce with plain string compiles', () => {
    expect(() => compile(`
      fn f(): int {
        announce("Server message");
        return 0;
      }
    `, { namespace: 'announcestr2' })).not.toThrow()
  })

  test('tellraw with plain string compiles', () => {
    expect(() => compile(`
      fn f(): int {
        tellraw(@s, "Hello world");
        return 0;
      }
    `, { namespace: 'tellrawstr' })).not.toThrow()
  })

  test('tell with plain string compiles', () => {
    expect(() => compile(`
      fn f(): int {
        tell(@s, "Direct message");
        return 0;
      }
    `, { namespace: 'tellstr' })).not.toThrow()
  })
})

// ── exprToCommandArg: various literal types ────────────────────────────────

describe('MIR lower — exprToCommandArg: literal types', () => {
  test('float_lit in command arg compiles', () => {
    // Using particle with float offsets
    expect(() => compile(`
      fn f(): int {
        particle("minecraft:dust", "~", "~", "~", "0.5", "1.0", "0.5", "0.1");
        return 0;
      }
    `, { namespace: 'argfloat' })).not.toThrow()
  })
})

// ── short-circuit && and || ───────────────────────────────────────────────

describe('MIR lower — short-circuit && and ||', () => {
  test('short-circuit && with two conditions compiles', () => {
    expect(() => compile(`
      fn f(a: int, b: int): int {
        if (a > 0 && b > 0) {
          return 1;
        }
        return 0;
      }
    `, { namespace: 'scand' })).not.toThrow()
  })

  test('short-circuit || with two conditions compiles', () => {
    expect(() => compile(`
      fn f(a: int, b: int): int {
        if (a > 0 || b > 0) {
          return 1;
        }
        return 0;
      }
    `, { namespace: 'scor' })).not.toThrow()
  })

  test('nested short-circuit compiles', () => {
    expect(() => compile(`
      fn f(a: int, b: int, c: int): int {
        if (a > 0 && (b > 0 || c > 0)) {
          return 1;
        }
        return 0;
      }
    `, { namespace: 'scnested' })).not.toThrow()
  })
})

// ── type_cast: expr as double ──────────────────────────────────────────────

describe('MIR lower — type_cast to double', () => {
  test('int to double cast compiles', () => {
    expect(() => compile(`
      fn f(x: int): int {
        let d: double = x as double;
        return 0;
      }
    `, { namespace: 'inttodouble' })).not.toThrow()
  })
})

// ── double arithmetic ──────────────────────────────────────────────────────

describe('MIR lower — double arithmetic', () => {
  test('double * double compiles', () => {
    expect(() => compile(`
      fn f(a: double, b: double): int {
        let c: double = a * b;
        return 0;
      }
    `, { namespace: 'doublemul' })).not.toThrow()
  })

  test('double - double compiles', () => {
    expect(() => compile(`
      fn f(a: double, b: double): int {
        let c: double = a - b;
        return 0;
      }
    `, { namespace: 'doublesub' })).not.toThrow()
  })

  test('double comparison compiles', () => {
    expect(() => compile(`
      fn f(a: double, b: double): int {
        if (a > b) { return 1; }
        return 0;
      }
    `, { namespace: 'doublecmp' })).not.toThrow()
  })
})

// ── foreach stmt ──────────────────────────────────────────────────────────

describe('MIR lower — foreach stmt', () => {
  test('foreach over selector compiles', () => {
    expect(() => compile(`
      fn f(): int {
        foreach (e in @e) {
          kill(e);
        }
        return 0;
      }
    `, { namespace: 'foreach1' })).not.toThrow()
  })

  test('foreach with at @s compiles', () => {
    expect(() => compile(`
      fn f(): int {
        foreach (player in @a) {
          tell(player, "Hello!");
        }
        return 0;
      }
    `, { namespace: 'foreachat' })).not.toThrow()
  })
})

// ── lowerImplMethod: static method with struct param ─────────────────────

describe('MIR lower — impl static method with struct param', () => {
  test('static method that takes a struct param compiles', () => {
    expect(() => compile(`
      struct Vec2 { x: int, y: int }
      impl Vec2 {
        fn dot(a: Vec2, b: Vec2): int {
          return a.x * b.x + a.y * b.y;
        }
      }
      fn f(): int {
        let a: Vec2 = Vec2 { x: 1, y: 2 };
        let b: Vec2 = Vec2 { x: 3, y: 4 };
        return Vec2::dot(a, b);
      }
    `, { namespace: 'staticstruct' })).not.toThrow()
  })
})

// ── lowerFunction with struct params ─────────────────────────────────────

describe('MIR lower — function with struct param', () => {
  test('function taking a struct param compiles', () => {
    expect(() => compile(`
      struct Point { x: int, y: int }
      fn distance(p: Point): int {
        return p.x + p.y;
      }
      fn f(): int {
        let p: Point = Point { x: 3, y: 4 };
        return distance(p);
      }
    `, { namespace: 'fstruct' })).not.toThrow()
  })
})

// ── do-while / repeat loops ───────────────────────────────────────────────

describe('MIR lower — do-while loop', () => {
  test('do-while loop compiles', () => {
    expect(() => compile(`
      fn f(): int {
        let i: int = 0;
        do {
          i = i + 1;
        } while (i < 5);
        return i;
      }
    `, { namespace: 'dowhile' })).not.toThrow()
  })
})

describe('MIR lower — repeat loop', () => {
  test('repeat loop compiles', () => {
    expect(() => compile(`
      fn f(): int {
        let i: int = 0;
        repeat 5 {
          i = i + 1;
        }
        return i;
      }
    `, { namespace: 'repeatloop' })).not.toThrow()
  })
})

// ── for loop with range ───────────────────────────────────────────────────

describe('MIR lower — for loop with range', () => {
  test('for loop compiles', () => {
    expect(() => compile(`
      fn f(): int {
        let sum: int = 0;
        for i in 0..10 {
          sum = sum + i;
        }
        return sum;
      }
    `, { namespace: 'forloop' })).not.toThrow()
  })
})

// ── binary with double return ─────────────────────────────────────────────

describe('MIR lower — double return from function', () => {
  test('function returning double from arithmetic compiles', () => {
    expect(() => compile(`
      fn average(a: double, b: double): double {
        return (a + b) / 2.0d;
      }
      fn f(): int {
        let x: double = 1.0d;
        let y: double = 3.0d;
        let avg: double = average(x, y);
        return 0;
      }
    `, { namespace: 'doubleret' })).not.toThrow()
  })
})

// ── let with option from function call result ─────────────────────────────

describe('MIR lower — let option from call (option type annotation)', () => {
  test('let x: Option<int> from function call uses __rf_ slots', () => {
    expect(() => compile(`
      fn get_opt(n: int): Option<int> {
        if (n > 0) { return Some(n); }
        return None;
      }
      fn f(): int {
        let opt: Option<int> = get_opt(5);
        if (opt.has == 1) { return opt.val; }
        return 0;
      }
    `, { namespace: 'letoptrf' })).not.toThrow()
  })
})

// ── lowerStringExprToPath: assign with string var ─────────────────────────

describe('MIR lower — string assign path', () => {
  test('string variable reassignment via assign expression compiles', () => {
    expect(() => compile(`
      fn choose(flag: int): string {
        if (flag == 1) { return "yes"; }
        return "no";
      }
      fn f(flag: int): int {
        let s: string = choose(flag);
        tell(@s, s);
        return 0;
      }
    `, { namespace: 'strassign2' })).not.toThrow()
  })
})

// ── @watch decorator ──────────────────────────────────────────────────────

describe('MIR lower — @watch decorator', () => {
  test('@watch decorated function compiles', () => {
    expect(() => compile(`
      @watch("rs.score_value")
      fn on_score_change(): int {
        tell(@s, "score changed");
        return 0;
      }
    `, { namespace: 'watchfn' })).not.toThrow()
  })
})

// ── @config decorator ─────────────────────────────────────────────────────

describe('MIR lower — @load decorator', () => {
  test('@load decorated function compiles', () => {
    expect(() => compile(`
      @load
      fn setup(): int {
        gamerule("keepInventory", "true");
        return 0;
      }
    `, { namespace: 'loadfn' })).not.toThrow()
  })
})

// ── macro function call ───────────────────────────────────────────────────

describe('MIR lower — macro function call', () => {
  test('@macro decorated function with call compiles', () => {
    expect(() => compile(`
      @macro
      fn tp_to(x: int, z: int): int {
        tp(@s, "$(x) 64 $(z)");
        return 0;
      }
      fn f(): int {
        tp_to(100, 200);
        return 0;
      }
    `, { namespace: 'macrofn' })).not.toThrow()
  })
})

// ── binary with &&/|| in different contexts ───────────────────────────────

describe('MIR lower — binary short-circuit in various contexts', () => {
  test('&& used in while condition compiles', () => {
    expect(() => compile(`
      fn f(a: int): int {
        let i: int = 0;
        while (i < 10 && a > 0) {
          i = i + 1;
        }
        return i;
      }
    `, { namespace: 'whileand' })).not.toThrow()
  })

  test('|| used in if condition compiles', () => {
    expect(() => compile(`
      fn f(a: int, b: int): int {
        if (a == 0 || b == 0) {
          return 0;
        }
        return a + b;
      }
    `, { namespace: 'ifor' })).not.toThrow()
  })
})

// ── static_call on non-singleton (plain static method call) ───────────────

describe('MIR lower — static_call regular method', () => {
  test('static method call on regular struct compiles', () => {
    expect(() => compile(`
      struct Counter { value: int }
      impl Counter {
        fn create(start: int): Counter {
          return Counter { value: start };
        }
      }
      fn f(): int {
        let c: Counter = Counter::create(10);
        return c.value;
      }
    `, { namespace: 'staticcall' })).not.toThrow()
  })
})

// ── invoke with dynamic array len ─────────────────────────────────────────

describe('MIR lower — invoke array.len() dynamic', () => {
  test('dynamic array len() via nbt compiles', () => {
    expect(() => compile(`
      fn count(arr: int[]): int {
        return arr.len();
      }
      fn f(): int {
        let a: int[] = [1, 2, 3, 4, 5];
        return count(a);
      }
    `, { namespace: 'dynlen' })).not.toThrow()
  })
})

// ── tuple_lit returned from function ─────────────────────────────────────

describe('MIR lower — tuple destructuring from function call via ident', () => {
  test('let (a, b) = ident works when ident is tracked tuple var', () => {
    expect(() => compile(`
      fn make(): (int, int) {
        return (10, 20);
      }
      fn f(): int {
        let (x, y) = make();
        let (a, b) = make();
        return x + a + y + b;
      }
    `, { namespace: 'tupident' })).not.toThrow()
  })
})

// ── lowerExpr path_expr and enum_construct ────────────────────────────────

describe('MIR lower — enum_construct with fields', () => {
  test('enum variant construction with float field compiles', () => {
    expect(() => compile(`
      enum Particle {
        Dust,
        Smoke,
      }
      fn f(): int {
        let p = Particle::Dust;
        return p;
      }
    `, { namespace: 'enumconst' })).not.toThrow()
  })
})

// ── scoreboard_get with macro param player ────────────────────────────────

describe('MIR lower — scoreboard_get with player arg', () => {
  test('scoreboard_get with string player param compiles', () => {
    expect(() => compile(`
      fn get_score(player: string): int {
        return scoreboard_get(player, "kills");
      }
    `, { namespace: 'sgparam' })).not.toThrow()
  })
})

// ── Timer via invoke path (not call path) ────────────────────────────────

describe('MIR lower — Timer via invoke method syntax', () => {
  test('Timer accessed via v.tick() invoke syntax compiles', () => {
    expect(() => compile(TIMER_STUB + `
      fn f(): int {
        let t: Timer = Timer::new(10);
        t.start();
        t.tick();
        let done: int = t.done();
        let elapsed: int = t.elapsed();
        let remaining: int = t.remaining();
        t.pause();
        t.reset();
        return done + elapsed + remaining;
      }
    `, { namespace: 'timerall2' })).not.toThrow()
  })
})

// ── string comparison in if ───────────────────────────────────────────────

describe('MIR lower — string comparison', () => {
  test('string comparison via scoreboard compiles', () => {
    expect(() => compile(`
      fn f(s: string): int {
        match (s) {
          "alpha" => { return 1; }
          "beta" => { return 2; }
          _ => { return 0; }
        }
        return 0;
      }
    `, { namespace: 'strcmp' })).not.toThrow()
  })
})
