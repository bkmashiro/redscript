import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { TypeChecker } from '../typechecker'
import type { DiagnosticError } from '../diagnostics'

function typeCheck(source: string): DiagnosticError[] {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  const checker = new TypeChecker(source)
  return checker.check(ast)
}

describe('TypeChecker', () => {
  describe('variable declaration', () => {
    it('allows using top-level consts inside functions', () => {
      const errors = typeCheck(`
const MAX_HP: int = 100

fn test() {
    let hp: int = MAX_HP;
}
`)
      expect(errors).toHaveLength(0)
    })

    it('allows using declared variables', () => {
      const errors = typeCheck(`
fn test() {
    let x: int = 5;
    let y: int = x;
}
`)
      expect(errors).toHaveLength(0)
    })

    it('detects undeclared variable usage', () => {
      const errors = typeCheck(`
fn test() {
    let x: int = y;
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain("'y' used before declaration")
      expect(errors[0].location.line).toBe(3)
      expect(errors[0].location.col).toBe(18)
    })

    it('detects undeclared variable in expression', () => {
      const errors = typeCheck(`
fn test() {
    let x: int = 5 + undeclared;
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain("'undeclared' used before declaration")
    })

    it('accepts BlockPos literals for BlockPos variables', () => {
      const errors = typeCheck(`
fn test() {
    let spawn: BlockPos = (~0, 64, ~0);
}
`)
      expect(errors).toHaveLength(0)
    })

    it('rejects assigning to const', () => {
      const errors = typeCheck(`
const MAX_HP: int = 100

fn test() {
    MAX_HP = 50;
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain("Cannot assign to const 'MAX_HP'")
    })
  })

  describe('function calls', () => {
    it('allows correct number of arguments', () => {
      const errors = typeCheck(`
fn add(a: int, b: int) -> int {
    return a + b;
}

fn test() {
    let x: int = add(1, 2);
}
`)
      expect(errors).toHaveLength(0)
    })

    it('detects wrong number of arguments', () => {
      const errors = typeCheck(`
fn add(a: int, b: int) -> int {
    return a + b;
}

fn test() {
    let x: int = add(1);
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain("expects 2 arguments, got 1")
      expect(errors[0].location.line).toBe(7)
    })

    it('allows omitting trailing default arguments', () => {
      const errors = typeCheck(`
fn greet(name: string, formal: bool = false) {
    say(name);
}

fn test() {
    greet("Player");
    greet("Player", true);
}
`)
      expect(errors).toHaveLength(0)
    })

    it('detects too many arguments', () => {
      const errors = typeCheck(`
fn greet() {
    say("hello");
}

fn test() {
    greet(1, 2, 3);
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain("expects 0 arguments, got 3")
    })

    it('rejects a required parameter after a default parameter', () => {
      const errors = typeCheck(`
fn bad(a: int = 1, b: int) {}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain("cannot follow a default parameter")
    })

    it('rejects non-single selector tp destinations', () => {
      const errors = typeCheck(`
fn test() {
    tp(@s, @a);
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain('tp destination must be a single-entity selector')
    })

    it('allows single-selector and BlockPos tp destinations', () => {
      const singleErrors = typeCheck(`
fn test() {
    tp(@s, @p);
    tp(@s, @e[limit=1, tag=target]);
}
`)
      expect(singleErrors).toHaveLength(0)

      const posErrors = typeCheck(`
fn test() {
    tp(@a, (1, 64, 1));
    tp(@s, (~0, ~10, ~0));
}
`)
      expect(posErrors).toHaveLength(0)
    })

    it('treats bossbar_get_value() as int', () => {
      const errors = typeCheck(`
fn test() {
    let current: int = bossbar_get_value("ns:health");
}
`)
      expect(errors).toHaveLength(0)
    })

    it('allows lambda variables to be called via function types', () => {
      const errors = typeCheck(`
fn test() {
    let double: (int) -> int = (x: int) => x * 2;
    let result: int = double(5);
}
`)
      expect(errors).toHaveLength(0)
    })

    it('allows lambdas as callback arguments', () => {
      const errors = typeCheck(`
fn apply(val: int, cb: (int) -> int) -> int {
    return cb(val);
}

fn test() {
    let result: int = apply(5, (x: int) => x * 3);
}
`)
      expect(errors).toHaveLength(0)
    })

    it('infers single-parameter lambdas from the expected function type', () => {
      const errors = typeCheck(`
fn test() {
    let double: (int) -> int = x => x * 2;
    let result: int = double(5);
}
`)
      expect(errors).toHaveLength(0)
    })
  })

  describe('return type checking', () => {
    it('allows matching return type', () => {
      const errors = typeCheck(`
fn get_five() -> int {
    return 5;
}
`)
      expect(errors).toHaveLength(0)
    })

    it('detects return type mismatch', () => {
      const errors = typeCheck(`
fn get_bool() -> bool {
    return 5;
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain("Return type mismatch")
    })

    it('detects missing return value', () => {
      const errors = typeCheck(`
fn get_int() -> int {
    return;
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain("Missing return value")
    })

    it('allows void return with no value', () => {
      const errors = typeCheck(`
fn do_nothing() {
    return;
}
`)
      expect(errors).toHaveLength(0)
    })
  })

  describe('member access', () => {
    it('allows struct field access', () => {
      const errors = typeCheck(`
struct Point { x: int, y: int }

fn test() {
    let p: Point = { x: 10, y: 20 };
    let val: int = p.x;
}
`)
      expect(errors).toHaveLength(0)
    })

    it('detects invalid struct field', () => {
      const errors = typeCheck(`
struct Point { x: int, y: int }

fn test() {
    let p: Point = { x: 10, y: 20 };
    let val: int = p.z;
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain("has no field 'z'")
      expect(errors[0].location.line).toBe(6)
    })

    it('allows array.len access', () => {
      const errors = typeCheck(`
fn test() {
    let arr: int[] = [1, 2, 3];
    let len: int = arr.len;
}
`)
      expect(errors).toHaveLength(0)
    })

    it('detects member access on primitive', () => {
      const errors = typeCheck(`
fn test() {
    let x: int = 5;
    let y: int = x.value;
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain("Cannot access member")
    })

    it('allows enum variants and enum-typed variables', () => {
      const errors = typeCheck(`
enum Direction { North, South, East, West }

fn test() {
    let dir: Direction = Direction.North;
    if (dir == Direction.South) {
        say("south");
    }
    match (dir) {
        Direction.East => { say("east"); }
        _ => { say("other"); }
    }
}
`)
      expect(errors).toHaveLength(0)
    })
  })

  describe('control flow', () => {
    it('checks conditions in if statements', () => {
      const errors = typeCheck(`
fn test() {
    if (undeclared > 0) {
        say("yes");
    }
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain("'undeclared' used before declaration")
    })

    it('checks conditions in while loops', () => {
      const errors = typeCheck(`
fn test() {
    while (missing) {
        say("loop");
    }
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain("'missing' used before declaration")
    })

    it('checks for loop parts', () => {
      const errors = typeCheck(`
fn test() {
    for (let i: int = 0; i < count; i = i + 1) {
        say("loop");
    }
}
`)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].message).toContain("'count' used before declaration")
    })
  })

  describe('complex programs', () => {
    it('handles valid complex program', () => {
      const errors = typeCheck(`
struct Stats { health: int, mana: int }

fn heal(amount: int) -> int {
    let bonus: int = amount * 2;
    return bonus;
}

@tick
fn game_loop() {
    let stats: Stats = { health: 100, mana: 50 };
    let healed: int = heal(10);
    stats.health = stats.health + healed;
}
`)
      expect(errors).toHaveLength(0)
    })

    it('collects multiple errors', () => {
      const errors = typeCheck(`
fn broken() -> int {
    let x: int = undefined_var;
    let y: int = another_undefined;
    missing_func();
    return false;
}
`)
      // Should have multiple errors: 2 undefined vars, return type mismatch
      // (missing_func is not checked since it's not defined as a user function)
      expect(errors.length).toBeGreaterThanOrEqual(3)
    })
  })
})
