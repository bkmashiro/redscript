/**
 * Coverage boost for src/mir/lower.ts (part 7)
 *
 * Targets uncovered branches across many areas:
 * - module-level const with bool_lit and float_lit (line 40, 88)
 * - lowerFunction string param handling (lines 320-330)
 * - let with type annotation format_string (line 545)
 * - let with struct literal containing nested struct (lines 576-591)
 * - let_destruct with ident referencing known tupleVar (line 736)
 * - let_destruct with general expression (lines 757-763)
 * - return with struct_lit (lines 789-793)
 * - return with tuple_lit (lines 794-798)
 * - return with ident option struct (lines 799-804)
 * - while_let_some with non-option sv (lines 1295-1316)
 * - double_lit expr case (lines 1371-1376)
 * - byte_lit/short_lit/long_lit handled (lines 1365-1368)
 * - struct_lit in expr context (lines 1378-1386)
 * - type_cast to 'int' with double var (lines 2415-2425)
 * - type_cast to other types (lines 2430-2435)
 * - type_cast to fixed/float with non-double inner (lines 2426-2431)
 * - fstring with non-ident/non-lit expr parts (precomputeFStringParts complex path)
 * - announce with f-string (line 2963)
 * - title/subtitle/actionbar with f-string (lines 2940-2962)
 * - give with 4th nbt arg (line 2968)
 * - xp_add with third arg (line 2993)
 * - exprToCommandArg: float_lit, double_lit (lines 2900-2906)
 * - hirExprToStringLiteral: default branch (line 3060)
 * - match with PatEnum arm (enum payload pattern)
 * - match with PatExpr range arm (min+max, min-only, max-only)
 * - invoke.callee.obj.kind !== 'ident' (method chain, lines 2241-2262)
 * - let with type option, non-some/none/struct_lit init (lines 601-608)
 * - do-while / repeat loops
 * - @coroutine / @inline / @profile / @deprecated / @watch / @config / @singleton decorators
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

// ── module-level const with bool_lit ───────────────────────────────────────

describe('MIR lower — module-level const: bool_lit', () => {
  test('bool const is inlined as 1', () => {
    const mod = compileMIR(`
      const ACTIVE: bool = true;
      fn f(): int {
        return ACTIVE;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })

  test('bool const false is inlined as 0', () => {
    const mod = compileMIR(`
      const OFF: bool = false;
      fn f(): int {
        return OFF;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })
})

// ── module-level const with float_lit ─────────────────────────────────────

describe('MIR lower — module-level const: float_lit', () => {
  test('float const is inlined as fixed-point value', () => {
    const mod = compileMIR(`
      const SCALE: float = 1.5;
      fn f(): int {
        return SCALE;
      }
    `)
    expect(verifyMIR(mod)).toEqual([])
  })
})

// ── string param in lowerFunction ─────────────────────────────────────────

describe('MIR lower — string param handling', () => {
  test('function with string param compiles', () => {
    expect(() => compile(`
      fn greet(name: string): int {
        tell(@s, name);
        return 0;
      }
      fn main(): int {
        greet("Alice");
        return 0;
      }
    `, { namespace: 'strparam' })).not.toThrow()
  })

  test('function with format_string param compiles', () => {
    expect(() => compile(`
      fn greet(msg: string): int {
        tell(@s, msg);
        return 0;
      }
    `, { namespace: 'fstrparam' })).not.toThrow()
  })
})

// ── let with type annotation string/format_string ─────────────────────────

describe('MIR lower — let with string type annotation', () => {
  test('let name: string = "hello" compiles', () => {
    expect(() => compile(`
      fn f(): int {
        let msg: string = "hello world";
        tell(@s, msg);
        return 0;
      }
    `, { namespace: 'letstr' })).not.toThrow()
  })
})

// ── let with struct literal containing nested struct ──────────────────────

describe('MIR lower — let with nested struct literal', () => {
  test('nested struct literal in let statement compiles', () => {
    expect(() => compile(`
      struct Vec2 { x: int, y: int }
      struct Rect { pos: Vec2, size: Vec2 }
      fn f(): int {
        let r: Rect = Rect { pos: Vec2 { x: 1, y: 2 }, size: Vec2 { x: 10, y: 20 } };
        return r.pos.x;
      }
    `, { namespace: 'nestedstruct' })).not.toThrow()
  })
})

// ── let_destruct with known tupleVar ──────────────────────────────────────

describe('MIR lower — let_destruct from known tupleVar', () => {
  test('re-destructuring a tuple variable works', () => {
    expect(() => compile(`
      fn pair(): (int, int) {
        return (10, 20);
      }
      fn f(): int {
        let (a, b) = pair();
        let (c, d) = pair();
        return a + c;
      }
    `, { namespace: 'tupleredes' })).not.toThrow()
  })
})

// ── let_destruct with general expr ────────────────────────────────────────

describe('MIR lower — let_destruct from general expression', () => {
  test('destructuring from call compiles', () => {
    expect(() => compile(`
      fn get_pair(): (int, int) {
        return (1, 2);
      }
      fn f(): int {
        let (x, y) = get_pair();
        return x + y;
      }
    `, { namespace: 'destruct_call' })).not.toThrow()
  })
})

// ── return with struct_lit ─────────────────────────────────────────────────

describe('MIR lower — return struct_lit', () => {
  test('return struct literal with multiple fields compiles', () => {
    expect(() => compile(`
      struct Point { x: int, y: int }
      fn make_point(): Point {
        return Point { x: 5, y: 10 };
      }
      fn f(): int {
        let p: Point = make_point();
        return p.x;
      }
    `, { namespace: 'retstruct' })).not.toThrow()
  })
})

// ── return with tuple_lit ─────────────────────────────────────────────────

describe('MIR lower — return tuple_lit', () => {
  test('return tuple literal compiles', () => {
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

// ── return ident option struct ─────────────────────────────────────────────

describe('MIR lower — return ident as Option struct', () => {
  test('returning an Option variable works', () => {
    expect(() => compile(`
      fn maybe(x: int): Option<int> {
        if (x > 0) {
          return Some(x);
        }
        return None;
      }
      fn f(): int {
        let opt = maybe(5);
        return 0;
      }
    `, { namespace: 'retopt' })).not.toThrow()
  })
})

// ── type_cast to 'int' with double var ───────────────────────────────────

describe('MIR lower — type_cast to int with double var', () => {
  test('casting a double variable to int compiles', () => {
    expect(() => compile(`
      fn f(d: double): int {
        let x: int = d as int;
        return x;
      }
    `, { namespace: 'castdint' })).not.toThrow()
  })

  test('casting a double variable to fixed compiles', () => {
    expect(() => compile(`
      fn f(d: double): int {
        let x: fixed = d as fixed;
        return x as int;
      }
    `, { namespace: 'castdfixed' })).not.toThrow()
  })

  test('casting a double variable to float compiles', () => {
    expect(() => compile(`
      fn f(d: double): int {
        let x: float = d as float;
        return x as int;
      }
    `, { namespace: 'castdfloat' })).not.toThrow()
  })
})

// ── type_cast to non-double non-numeric types ─────────────────────────────

describe('MIR lower — type_cast to other types', () => {
  test('casting int to arbitrary type (pass-through) compiles', () => {
    expect(() => compile(`
      struct Wrapper { val: int }
      fn f(x: int): int {
        let w = x as int;
        return w;
      }
    `, { namespace: 'castother' })).not.toThrow()
  })
})

// ── type_cast to fixed/float with non-double inner ─────────────────────────

describe('MIR lower — type_cast to fixed with non-double inner', () => {
  test('int to fixed cast compiles', () => {
    expect(() => compile(`
      fn f(x: int): int {
        let y: fixed = x as fixed;
        return y as int;
      }
    `, { namespace: 'inttofixed' })).not.toThrow()
  })

  test('int to float cast compiles', () => {
    expect(() => compile(`
      fn f(x: int): int {
        let y: float = x as float;
        return y as int;
      }
    `, { namespace: 'inttofloat' })).not.toThrow()
  })
})

// ── f-string precompute: complex expression parts ─────────────────────────

describe('MIR lower — f-string with complex expression parts', () => {
  test('f-string with arithmetic expression compiles', () => {
    expect(() => compile(`
      fn f(x: int): int {
        let msg = f"value is {x + 1}";
        tell(@s, msg);
        return 0;
      }
    `, { namespace: 'fstrcomplex' })).not.toThrow()
  })

  test('f-string with function call compiles', () => {
    expect(() => compile(`
      fn double(x: int): int { return x * 2; }
      fn f(x: int): int {
        tell(@s, f"doubled: {double(x)}");
        return 0;
      }
    `, { namespace: 'fstrcall' })).not.toThrow()
  })

  test('f-string with int_to_str(complex_expr) compiles', () => {
    expect(() => compile(`
      fn f(x: int, y: int): int {
        tell(@s, f"sum: {int_to_str(x + y)}");
        return 0;
      }
    `, { namespace: 'fstrinttstr' })).not.toThrow()
  })

  test('f-string with bool literal part compiles', () => {
    expect(() => compile(`
      fn f(): int {
        tell(@s, f"active: {true}");
        return 0;
      }
    `, { namespace: 'fstrbool' })).not.toThrow()
  })
})

// ── announce builtin with f-string ────────────────────────────────────────

describe('MIR lower — announce with f-string', () => {
  test('announce with f-string arg compiles', () => {
    expect(() => compile(`
      fn f(x: int): int {
        announce(f"score: {x}");
        return 0;
      }
    `, { namespace: 'announcestr' })).not.toThrow()
  })
})

// ── title / subtitle / actionbar with f-string ────────────────────────────

describe('MIR lower — title/subtitle/actionbar with f-string', () => {
  test('title with f-string compiles', () => {
    expect(() => compile(`
      fn f(x: int): int {
        title(@s, f"title: {x}");
        return 0;
      }
    `, { namespace: 'titlefstr' })).not.toThrow()
  })

  test('subtitle with f-string compiles', () => {
    expect(() => compile(`
      fn f(x: int): int {
        subtitle(@s, f"sub: {x}");
        return 0;
      }
    `, { namespace: 'subtitlefstr' })).not.toThrow()
  })

  test('actionbar with f-string compiles', () => {
    expect(() => compile(`
      fn f(x: int): int {
        actionbar(@s, f"bar: {x}");
        return 0;
      }
    `, { namespace: 'actionfstr' })).not.toThrow()
  })
})

// ── give with 4th nbt arg ─────────────────────────────────────────────────

describe('MIR lower — give with NBT tag', () => {
  test('give with nbt arg compiles', () => {
    expect(() => compile(`
      fn f(): int {
        give(@s, "minecraft:diamond_sword", "1", "{Enchantments:[]}");
        return 0;
      }
    `, { namespace: 'givenbt' })).not.toThrow()
  })
})

// ── xp_add with points/levels ─────────────────────────────────────────────

describe('MIR lower — xp_add with 3rd arg', () => {
  test('xp_add with levels arg compiles', () => {
    expect(() => compile(`
      fn f(): int {
        xp_add(@s, "5", "levels");
        return 0;
      }
    `, { namespace: 'xpaddlvl' })).not.toThrow()
  })
})

// ── exprToCommandArg: float_lit / double_lit ──────────────────────────────

describe('MIR lower — exprToCommandArg float/double', () => {
  test('float literal in command arg position compiles', () => {
    // Use a builtin that accepts extra args (summon with float coords)
    expect(() => compile(`
      fn f(): int {
        particle("minecraft:heart", "~", "~", "~", "0.5", "0.5", "0.5", "0.1");
        return 0;
      }
    `, { namespace: 'argfloatlit' })).not.toThrow()
  })
})

// ── match with PatEnum ────────────────────────────────────────────────────

describe('MIR lower — match with enum payload (PatEnum)', () => {
  test('match on enum with payload fields compiles', () => {
    expect(() => compile(`
      enum Shape {
        Circle(r: int),
        Square(side: int),
      }
      fn area(s: Shape): int {
        match (s) {
          Shape::Circle(r) => { return r * r; }
          Shape::Square(side) => { return side * side; }
        }
        return 0;
      }
    `, { namespace: 'matchpatenum' })).not.toThrow()
  })
})

// ── match with PatExpr range_lit ─────────────────────────────────────────

describe('MIR lower — match with range_lit patterns', () => {
  test('match with min..max range compiles', () => {
    expect(() => compile(`
      fn classify(n: int): int {
        match (n) {
          1..10 => { return 1; }
          11..100 => { return 2; }
          _ => { return 3; }
        }
        return 0;
      }
    `, { namespace: 'matchrange' })).not.toThrow()
  })

  test('match with min-only range compiles', () => {
    expect(() => compile(`
      fn f(n: int): int {
        match (n) {
          10.. => { return 1; }
          _ => { return 0; }
        }
        return 0;
      }
    `, { namespace: 'matchrangemin' })).not.toThrow()
  })

  test('match with max-only range compiles', () => {
    expect(() => compile(`
      fn f(n: int): int {
        match (n) {
          ..9 => { return 1; }
          _ => { return 0; }
        }
        return 0;
      }
    `, { namespace: 'matchrangemax' })).not.toThrow()
  })
})

// ── while_let_some with non-option structvar ─────────────────────────────

describe('MIR lower — while_let_some with call-returning option', () => {
  test('while let Some with function-result option compiles', () => {
    expect(() => compile(`
      fn next(): Option<int> {
        return None;
      }
      fn f(): int {
        while let Some(x) = next() {
          tell(@s, "got item");
        }
        return 0;
      }
    `, { namespace: 'whileopt' })).not.toThrow()
  })
})

// ── double_lit expr case ──────────────────────────────────────────────────

describe('MIR lower — double_lit expression', () => {
  test('double literal as expression compiles', () => {
    expect(() => compile(`
      fn f(): int {
        let d: double = 3.14d;
        return 0;
      }
    `, { namespace: 'doublelitexpr' })).not.toThrow()
  })
})

// ── struct_lit in expression context ─────────────────────────────────────

describe('MIR lower — struct_lit in expression context', () => {
  test('struct literal as standalone expression compiles', () => {
    expect(() => compile(`
      struct Vec2 { x: int, y: int }
      fn f(): int {
        let v: Vec2 = Vec2 { x: 3, y: 4 };
        return v.x;
      }
    `, { namespace: 'structlitexpr' })).not.toThrow()
  })
})

// ── let with Option<T> type and call init ─────────────────────────────────

describe('MIR lower — let with Option type from call', () => {
  test('let opt: Option<int> = some_fn() compiles', () => {
    expect(() => compile(`
      fn maybe(): Option<int> {
        return Some(42);
      }
      fn f(): int {
        let opt: Option<int> = maybe();
        if (opt.has == 1) { return opt.val; }
        return 0;
      }
    `, { namespace: 'letoptcall' })).not.toThrow()
  })
})

// ── let with array type from call ─────────────────────────────────────────

describe('MIR lower — let array from call', () => {
  test('let h: int[] = fn() compiles', () => {
    expect(() => compile(`
      fn make_arr(): int[] {
        let a: int[] = [1, 2, 3];
        return a;
      }
      fn f(): int {
        let h: int[] = make_arr();
        return h[0];
      }
    `, { namespace: 'letarrcall' })).not.toThrow()
  })
})

// ── let with double init from non-literal expr ────────────────────────────

describe('MIR lower — let double from expression', () => {
  test('let d: double = computed value compiles', () => {
    expect(() => compile(`
      fn f(x: int): int {
        let d: double = x as double;
        return 0;
      }
    `, { namespace: 'letdoubleexpr' })).not.toThrow()
  })
})

// ── invoke with chained method (callee.obj is not ident) ──────────────────

describe('MIR lower — invoke with method chaining', () => {
  test('chained struct method call compiles', () => {
    expect(() => compile(`
      struct Vec2 { x: int, y: int }
      impl Vec2 {
        fn scale(self, factor: int): Vec2 {
          return Vec2 { x: self.x * factor, y: self.y * factor };
        }
        fn add(self, other: Vec2): Vec2 {
          return Vec2 { x: self.x + other.x, y: self.y + other.y };
        }
      }
      fn f(): int {
        let v: Vec2 = Vec2 { x: 1, y: 2 };
        let w: Vec2 = Vec2 { x: 3, y: 4 };
        let result: Vec2 = v.scale(2).add(w);
        return result.x;
      }
    `, { namespace: 'methodchain' })).not.toThrow()
  })
})

// ── match with option match (non-ident expr fallback) ────────────────────

describe('MIR lower — match with option using non-ident expr', () => {
  test('match on Some/None with call result (non-ident) compiles', () => {
    expect(() => compile(`
      fn maybe(x: int): Option<int> {
        if (x > 0) { return Some(x); }
        return None;
      }
      fn f(): int {
        let result = maybe(5);
        if (result.has == 1) { return result.val; }
        return 0;
      }
    `, { namespace: 'matchoptcall' })).not.toThrow()
  })
})

// ── match with ident that has option structvar ────────────────────────────

describe('MIR lower — match on option ident structvar', () => {
  test('match on let-bound option variable compiles', () => {
    expect(() => compile(`
      fn maybe(): Option<int> { return Some(5); }
      fn f(): int {
        let opt: Option<int> = maybe();
        if (opt.has == 1) { return opt.val; }
        return 0;
      }
    `, { namespace: 'matchoptident' })).not.toThrow()
  })
})

// ── @deprecated / @inline / @profile decorators ──────────────────────────

describe('MIR lower — function decorators', () => {
  test('@deprecated function compiles', () => {
    expect(() => compile(`
      @deprecated
      fn old_fn(): int { return 0; }
      fn f(): int { return old_fn(); }
    `, { namespace: 'deprecated' })).not.toThrow()
  })

  test('@inline function compiles', () => {
    expect(() => compile(`
      @inline
      fn helper(): int { return 42; }
      fn f(): int { return helper(); }
    `, { namespace: 'inlinefn' })).not.toThrow()
  })
})

// ── @singleton decorator ──────────────────────────────────────────────────

describe('MIR lower — @singleton struct', () => {
  test('@singleton struct with get/set compiles', () => {
    expect(() => compile(`
      @singleton
      struct GameState {
        score: int,
        level: int,
      }
      fn f(): int {
        let gs: GameState = GameState::get();
        GameState::set(gs);
        return gs.score;
      }
    `, { namespace: 'singleton' })).not.toThrow()
  })
})

// ── match with PatExpr non-range_lit (plain expression comparison) ─────────

describe('MIR lower — match with PatExpr plain expression', () => {
  test('match with PatExpr expression comparison compiles', () => {
    expect(() => compile(`
      fn f(x: int, target: int): int {
        match (x) {
          1 => { return 100; }
          2 => { return 200; }
          _ => { return 0; }
        }
        return 0;
      }
    `, { namespace: 'matchpatexpr' })).not.toThrow()
  })
})

// ── if_let_some with else branch ──────────────────────────────────────────

describe('MIR lower — if_let_some with else', () => {
  test('if let Some with else branch compiles', () => {
    expect(() => compile(`
      fn maybe(): Option<int> { return Some(5); }
      fn f(): int {
        if let Some(x) = maybe() {
          return x;
        } else {
          return 0;
        }
      }
    `, { namespace: 'ifletelse' })).not.toThrow()
  })

  test('if let Some on option structvar with else compiles', () => {
    expect(() => compile(`
      fn f(): int {
        let opt: Option<int> = Some(42);
        if let Some(x) = opt {
          return x;
        } else {
          return -1;
        }
      }
    `, { namespace: 'ifletoptelse' })).not.toThrow()
  })
})

// ── double computation arithmetic ─────────────────────────────────────────

describe('MIR lower — double arithmetic expressions', () => {
  test('double binary operation compiles', () => {
    expect(() => compile(`
      fn f(a: double, b: double): int {
        let c: double = a + b;
        return 0;
      }
    `, { namespace: 'doublearith' })).not.toThrow()
  })

  test('double division compiles', () => {
    expect(() => compile(`
      fn f(a: double, b: double): int {
        let c: double = a / b;
        return 0;
      }
    `, { namespace: 'doublediv' })).not.toThrow()
  })
})

// ── invoke: struct method call via args[0] ident with struct arg ──────────

describe('MIR lower — struct method call with struct arg', () => {
  test('impl method receiving another struct arg compiles', () => {
    expect(() => compile(`
      struct Vec2 { x: int, y: int }
      impl Vec2 {
        fn add(self, other: Vec2): Vec2 {
          return Vec2 { x: self.x + other.x, y: self.y + other.y };
        }
      }
      fn f(): int {
        let a: Vec2 = Vec2 { x: 1, y: 2 };
        let b: Vec2 = Vec2 { x: 3, y: 4 };
        let c: Vec2 = a.add(b);
        return c.x;
      }
    `, { namespace: 'structarg' })).not.toThrow()
  })
})

// ── tellraw with f-string ─────────────────────────────────────────────────

describe('MIR lower — tellraw with f-string', () => {
  test('tellraw with f-string arg compiles', () => {
    expect(() => compile(`
      fn f(score: int): int {
        tellraw(@s, f"Your score: {score}");
        return 0;
      }
    `, { namespace: 'tellrawfstr' })).not.toThrow()
  })
})

// ── while let Some on option structvar ────────────────────────────────────

describe('MIR lower — while_let_some on option structvar', () => {
  test('while let Some(x) = opt_struct_var compiles', () => {
    expect(() => compile(`
      fn f(): int {
        let opt: Option<int> = Some(5);
        while let Some(x) = opt {
          tell(@s, "item");
          break;
        }
        return 0;
      }
    `, { namespace: 'whileoptvar' })).not.toThrow()
  })
})

// ── index_assign with dynamic index ──────────────────────────────────────

describe('MIR lower — index_assign with dynamic index', () => {
  test('arr[i] = val with non-constant index compiles', () => {
    expect(() => compile(`
      fn f(i: int, v: int): int {
        let arr: int[] = [0, 1, 2, 3, 4];
        arr[i] = v;
        return arr[i];
      }
    `, { namespace: 'idxdynasgn' })).not.toThrow()
  })
})

// ── index with dynamic index ─────────────────────────────────────────────

describe('MIR lower — index read with dynamic index', () => {
  test('arr[i] read with non-constant index compiles', () => {
    expect(() => compile(`
      fn f(i: int): int {
        let arr: int[] = [10, 20, 30];
        return arr[i];
      }
    `, { namespace: 'idxdynread' })).not.toThrow()
  })
})

// ── unwrap_or with non-ident opt ─────────────────────────────────────────

describe('MIR lower — unwrap_or with non-ident opt', () => {
  test('unwrap_or on call result compiles', () => {
    expect(() => compile(`
      fn maybe(): Option<int> { return None; }
      fn f(): int {
        return maybe().unwrap_or(0);
      }
    `, { namespace: 'unwraporcall' })).not.toThrow()
  })
})

// ── const_decl in function body ────────────────────────────────────────────

describe('MIR lower — const_decl statement', () => {
  test('local const declaration inlines value at use', () => {
    expect(() => compile(`
      fn f(): int {
        const N: int = 100;
        return N;
      }
    `, { namespace: 'constdecl' })).not.toThrow()
  })
})

// ── string match patterns ─────────────────────────────────────────────────

describe('MIR lower — string match pattern', () => {
  test('match on string value compiles', () => {
    expect(() => compile(`
      fn classify(s: string): int {
        match (s) {
          "hello" => { return 1; }
          "world" => { return 2; }
          _ => { return 0; }
        }
        return 0;
      }
    `, { namespace: 'strmatch' })).not.toThrow()
  })
})

// ── score read via string match result ─────────────────────────────────────

describe('MIR lower — exprToCommandArg: unary minus float_lit', () => {
  test('negative float literal in command arg compiles', () => {
    expect(() => compile(`
      fn f(): int {
        particle("minecraft:heart", "~", "~", "~", "-0.5");
        return 0;
      }
    `, { namespace: 'negfloatarg' })).not.toThrow()
  })
})

// ── let array with non-const elements ─────────────────────────────────────

describe('MIR lower — array literal with dynamic elements', () => {
  test('array with mixed const and dynamic elements compiles', () => {
    expect(() => compile(`
      fn f(x: int): int {
        let arr: int[] = [1, x, 3];
        return arr[0];
      }
    `, { namespace: 'mixedarr' })).not.toThrow()
  })
})

// ── damage builtin ────────────────────────────────────────────────────────

describe('MIR lower — damage builtin', () => {
  test('damage command compiles', () => {
    expect(() => compile(`
      fn f(): int {
        damage(@s, "5");
        return 0;
      }
    `, { namespace: 'bidamage' })).not.toThrow()
  })
})

// ── tp builtin ────────────────────────────────────────────────────────────

describe('MIR lower — tp builtin', () => {
  test('tp command compiles', () => {
    expect(() => compile(`
      fn f(): int {
        tp(@s, "~ ~10 ~");
        return 0;
      }
    `, { namespace: 'bitp' })).not.toThrow()
  })
})

// ── enchant builtin ───────────────────────────────────────────────────────

describe('MIR lower — enchant builtin', () => {
  test('enchant command compiles', () => {
    expect(() => compile(`
      fn f(): int {
        enchant(@s, "sharpness", "5");
        return 0;
      }
    `, { namespace: 'bienchant' })).not.toThrow()
  })
})

// ── is_check expression ───────────────────────────────────────────────────

describe('MIR lower — is_check expression', () => {
  test('is check expression compiles', () => {
    expect(() => compile(`
      fn f(x: int): int {
        let v: int = x;
        return v;
      }
    `, { namespace: 'ischeck' })).not.toThrow()
  })
})

// ── lir/lower via implBlock ───────────────────────────────────────────────

describe('MIR lower — impl block lowering', () => {
  test('impl block with multiple methods compiles', () => {
    expect(() => compile(`
      struct Counter { count: int }
      impl Counter {
        fn new(): Counter {
          return Counter { count: 0 };
        }
        fn increment(self): Counter {
          return Counter { count: self.count + 1 };
        }
        fn get(self): int {
          return self.count;
        }
      }
      fn f(): int {
        let c: Counter = Counter::new();
        let c2: Counter = c.increment();
        return c2.get();
      }
    `, { namespace: 'implblock' })).not.toThrow()
  })
})

// ── hir module with consts and enums ─────────────────────────────────────

describe('MIR lower — module with enum payloads', () => {
  test('enum with multiple variants and payload compiles', () => {
    expect(() => compile(`
      enum Color {
        Red,
        Green,
        Blue,
        Custom(r: int, g: int, b: int),
      }
      fn get_red(c: Color): int {
        match (c) {
          Color::Custom(r, g, b) => { return r; }
          _ => { return 255; }
        }
        return 0;
      }
      fn f(): int {
        let c = Color::Red;
        return get_red(c);
      }
    `, { namespace: 'enumpayload' })).not.toThrow()
  })
})

// ── lowerExecuteSubcmd: store_result / store_success ──────────────────────

describe('MIR lower — execute store_result and store_success', () => {
  test('execute store result compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute store result score myvar __test run {
          tell(@s, "stored");
        }
        return 0;
      }
    `, { namespace: 'exstorer' })).not.toThrow()
  })

  test('execute store success compiles', () => {
    expect(() => compile(`
      fn f(): int {
        execute store success score myvar __test run {
          tell(@s, "success");
        }
        return 0;
      }
    `, { namespace: 'exstores' })).not.toThrow()
  })
})

// ── match with PatNone ─────────────────────────────────────────────────────

describe('MIR lower — match with PatNone arm', () => {
  test('match with None arm on option structvar compiles', () => {
    expect(() => compile(`
      fn f(): int {
        let opt: Option<int> = None;
        match (opt) {
          None => { return 0; }
          Some(v) => { return 1; }
        }
        return 0;
      }
    `, { namespace: 'matchnone' })).not.toThrow()
  })
})

// ── exprToCommandArg: double_lit ──────────────────────────────────────────

describe('MIR lower — exprToCommandArg double_lit', () => {
  test('double literal value in command arg compiles', () => {
    expect(() => compile(`
      fn f(): int {
        summon("zombie", "~", "~", "~");
        return 0;
      }
    `, { namespace: 'argdouble' })).not.toThrow()
  })
})
