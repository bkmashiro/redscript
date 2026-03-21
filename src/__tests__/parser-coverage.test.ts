/**
 * Parser branch coverage — targets uncovered branches in src/parser/index.ts.
 *
 * Focus areas derived from coverage analysis:
 *  • NBT suffix literals: byte_lit, short_lit, long_lit, double_lit
 *  • Coordinate literals: rel_coord, local_coord in expressions
 *  • mc_name literal (#health)
 *  • isTypeCastAs variants (cast to double, byte, short, long, selector, Option)
 *  • match pattern: enum with multi-binding, no-binding, negative int
 *  • execute subcommands: rotated <yaw> <pitch>, anchored, align, on, summon,
 *    store success, in dimension, unless score range
 *  • facing entity with 'feet' anchor
 *  • Function default parameter values
 *  • const with inferred type (bool, float/fixed, string)
 *  • module library declaration
 *  • named module declaration
 *  • enum variant with explicit value
 *  • import wildcard (import math::*)
 *  • negative integer match pattern
 *  • PatEnum with no bindings
 *  • member/index compound assignment operators (+=, -=, *=, /=, %=)
 *  • Generic call: fn<Type>(args)
 *  • invoke expression (callee is not ident)
 */

import { Lexer } from '../lexer'
import { Parser } from '../parser'
import type { Program, FnDecl, Stmt, Expr } from '../ast/types'

function parse(source: string): Program {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens).parse('test')
}

function parseStmt(source: string): Stmt {
  const prog = parse(`fn _t() { ${source} }`)
  return prog.declarations[0].body[0]
}

function parseExpr(source: string): Expr {
  const prog = parse(`fn _t(): int { return ${source}; }`)
  const ret = prog.declarations[0].body[0]
  return (ret as any).value
}

// ── NBT suffix literals ────────────────────────────────────────────────────

describe('Parser — NBT suffix literals', () => {
  test('byte literal 1b', () => {
    const expr = parseExpr('1b')
    expect(expr.kind).toBe('byte_lit')
    expect((expr as any).value).toBe(1)
  })

  test('byte literal 0b', () => {
    const expr = parseExpr('0b')
    expect(expr.kind).toBe('byte_lit')
  })

  test('short literal 100s', () => {
    const expr = parseExpr('100s')
    expect(expr.kind).toBe('short_lit')
    expect((expr as any).value).toBe(100)
  })

  test('long literal 999l', () => {
    const expr = parseExpr('999l')
    expect(expr.kind).toBe('long_lit')
    expect((expr as any).value).toBe(999)
  })

  test('double literal 3.14d', () => {
    const expr = parseExpr('3.14d')
    expect(expr.kind).toBe('double_lit')
    expect((expr as any).value).toBeCloseTo(3.14)
  })

  test('byte literal in function body', () => {
    const prog = parse(`fn f() { let x: int = 5b as int; }`)
    expect(prog.declarations.length).toBe(1)
  })
})

// ── mc_name literal ────────────────────────────────────────────────────────

describe('Parser — mc_name literal', () => {
  test('#health parses as mc_name expr', () => {
    const expr = parseExpr('#health')
    expect(expr.kind).toBe('mc_name')
    expect((expr as any).value).toBe('health')
  })

  test('#my_score parses as mc_name', () => {
    const expr = parseExpr('#my_score')
    expect(expr.kind).toBe('mc_name')
    expect((expr as any).value).toBe('my_score')
  })
})

// ── Type cast to NBT/special types ────────────────────────────────────────

describe('Parser — type cast to special types', () => {
  test('cast to double', () => {
    const expr = parseExpr('x as double')
    expect(expr.kind).toBe('type_cast')
    expect((expr as any).targetType).toMatchObject({ kind: 'named', name: 'double' })
  })

  test('cast to byte', () => {
    const expr = parseExpr('x as byte')
    expect(expr.kind).toBe('type_cast')
    expect((expr as any).targetType).toMatchObject({ kind: 'named', name: 'byte' })
  })

  test('cast to short', () => {
    const expr = parseExpr('x as short')
    expect(expr.kind).toBe('type_cast')
    expect((expr as any).targetType).toMatchObject({ kind: 'named', name: 'short' })
  })

  test('cast to long', () => {
    const expr = parseExpr('x as long')
    expect(expr.kind).toBe('type_cast')
    expect((expr as any).targetType).toMatchObject({ kind: 'named', name: 'long' })
  })

  test('cast to selector (bare)', () => {
    const expr = parseExpr('x as selector')
    expect(expr.kind).toBe('type_cast')
    const t = (expr as any).targetType
    expect(t.kind).toBe('selector')
  })

  test('cast to fixed', () => {
    const expr = parseExpr('x as fixed')
    expect(expr.kind).toBe('type_cast')
    expect((expr as any).targetType).toMatchObject({ kind: 'named', name: 'fixed' })
  })

  test('cast to bool', () => {
    const expr = parseExpr('x as bool')
    expect(expr.kind).toBe('type_cast')
  })

  test('cast to BlockPos', () => {
    const expr = parseExpr('x as BlockPos')
    expect(expr.kind).toBe('type_cast')
  })
})

// ── Default parameter values ────────────────────────────────────────────────

describe('Parser — default parameter values', () => {
  test('fn with default int param', () => {
    const prog = parse(`fn greet(n: int = 5): int { return n; }`)
    const fn = prog.declarations[0]
    expect(fn.params[0].default).toBeDefined()
  })

  test('fn with default string param', () => {
    const prog = parse(`fn greet(msg: string = "hello"): string { return msg; }`)
    const fn = prog.declarations[0]
    expect(fn.params[0].default).toBeDefined()
  })

  test('fn with two params, second has default', () => {
    const prog = parse(`fn add(a: int, b: int = 0): int { return a + b; }`)
    const fn = prog.declarations[0]
    expect(fn.params[0].default).toBeUndefined()
    expect(fn.params[1].default).toBeDefined()
  })
})

// ── const with inferred types ──────────────────────────────────────────────

describe('Parser — const with inferred types', () => {
  test('const inferred as string', () => {
    const prog = parse(`const MSG = "hello";`)
    const c = prog.consts[0]
    expect(c.type.kind).toBe('named')
    expect((c.type as any).name).toBe('string')
  })

  test('const inferred as bool from true', () => {
    const prog = parse(`const FLAG = true;`)
    const c = prog.consts[0]
    expect((c.type as any).name).toBe('bool')
  })

  test('const inferred as bool from false', () => {
    const prog = parse(`const OFF = false;`)
    const c = prog.consts[0]
    expect((c.type as any).name).toBe('bool')
  })

  test('const inferred as int', () => {
    const prog = parse(`const N = 42;`)
    const c = prog.consts[0]
    expect((c.type as any).name).toBe('int')
  })

  test('const with explicit type', () => {
    const prog = parse(`const N: int = 42;`)
    const c = prog.consts[0]
    expect((c.type as any).name).toBe('int')
  })
})

// ── Module declarations ────────────────────────────────────────────────────

describe('Parser — module declarations', () => {
  test('module library sets isLibrary', () => {
    const prog = parse(`module library;\nfn f(): int { return 0; }`)
    expect(prog.isLibrary).toBe(true)
  })

  test('named module declaration', () => {
    const prog = parse(`module math;\nfn f(): int { return 0; }`)
    expect(prog.moduleName).toBe('math')
    expect(prog.isLibrary).toBeFalsy()
  })
})

// ── Enum variants with explicit values ─────────────────────────────────────

describe('Parser — enum explicit values', () => {
  test('enum variant with = value', () => {
    const prog = parse(`
      enum Status {
        Ok = 0,
        NotFound = 404,
        ServerError = 500,
      }
    `)
    const e = prog.enums[0]
    const nf = e.variants.find(v => v.name === 'NotFound')
    expect(nf?.value).toBe(404)
  })

  test('enum mixed explicit and auto values', () => {
    const prog = parse(`
      enum Dir { North = 10, East, South, West }
    `)
    const e = prog.enums[0]
    expect(e.variants.find(v => v.name === 'North')?.value).toBe(10)
    expect(e.variants.find(v => v.name === 'East')?.value).toBe(11)
    expect(e.variants.find(v => v.name === 'South')?.value).toBe(12)
  })
})

// ── Import wildcard ────────────────────────────────────────────────────────

describe('Parser — import declarations', () => {
  test('import wildcard: import math::*', () => {
    const prog = parse(`import math::*;\nfn f(): int { return 0; }`)
    expect(prog.imports.length).toBe(1)
    expect(prog.imports[0].symbol).toBe('*')
    expect(prog.imports[0].moduleName).toBe('math')
  })

  test('import specific symbol: import math::sin', () => {
    const prog = parse(`import math::sin;\nfn f(): int { return 0; }`)
    expect(prog.imports[0].symbol).toBe('sin')
  })

  test('whole-module import: import player_utils', () => {
    const prog = parse(`import player_utils;\nfn f(): int { return 0; }`)
    expect(prog.imports.length).toBe(1)
    expect(prog.imports[0].moduleName).toBe('player_utils')
  })
})

// ── Match patterns ──────────────────────────────────────────────────────────

describe('Parser — match patterns', () => {
  test('PatEnum with no bindings', () => {
    const stmt = parseStmt(`
      match x {
        Color::Red => { }
        Color::Blue => { }
      }
    `)
    const m = stmt as any
    const arm = m.arms[0]
    expect(arm.pattern.kind).toBe('PatEnum')
    expect(arm.pattern.bindings).toHaveLength(0)
  })

  test('PatEnum with one binding', () => {
    const stmt = parseStmt(`
      match r {
        Result::Ok(v) => { }
        Result::Err(e) => { }
      }
    `)
    const m = stmt as any
    expect(m.arms[0].pattern.bindings).toHaveLength(1)
    expect(m.arms[0].pattern.bindings[0]).toBe('v')
  })

  test('PatEnum with two bindings', () => {
    const stmt = parseStmt(`
      match p {
        Pair::Both(a, b) => { }
      }
    `)
    const m = stmt as any
    expect(m.arms[0].pattern.bindings).toHaveLength(2)
  })

  test('negative integer match pattern', () => {
    const stmt = parseStmt(`
      match x {
        -1 => { }
        0  => { }
        1  => { }
      }
    `)
    const m = stmt as any
    expect(m.arms[0].pattern.kind).toBe('PatInt')
    expect(m.arms[0].pattern.value).toBe(-1)
  })

  test('match (legacy parenthesised syntax)', () => {
    const stmt = parseStmt(`
      match (x) {
        0 => { }
        1 => { }
      }
    `)
    expect(stmt.kind).toBe('match')
  })
})

// ── Execute advanced subcommands ────────────────────────────────────────────

describe('Parser — execute advanced subcommands', () => {
  test('execute rotated <yaw> <pitch> run', () => {
    const stmt = parseStmt('execute rotated 0 0 run { raw("x"); }')
    const ex = stmt as any
    const subs = ex.subcommands ?? ex.clauses
    expect(subs.some((c: any) => c.kind === 'rotated')).toBe(true)
  })

  test('execute anchored eyes run', () => {
    const stmt = parseStmt('execute anchored eyes run { raw("x"); }')
    const ex = stmt as any
    const subs = ex.subcommands ?? ex.clauses
    expect(subs.some((c: any) => c.kind === 'anchored')).toBe(true)
  })

  test('execute anchored feet run', () => {
    const stmt = parseStmt('execute anchored feet run { raw("x"); }')
    const ex = stmt as any
    const subs = ex.subcommands ?? ex.clauses
    expect(subs.some((c: any) => c.kind === 'anchored' && c.anchor === 'feet')).toBe(true)
  })

  test('execute align xyz run', () => {
    const stmt = parseStmt('execute align xyz run { raw("x"); }')
    const ex = stmt as any
    const subs = ex.subcommands ?? ex.clauses
    expect(subs.some((c: any) => c.kind === 'align')).toBe(true)
  })

  test('execute on attacker run', () => {
    const stmt = parseStmt('execute on attacker run { raw("x"); }')
    const ex = stmt as any
    const subs = ex.subcommands ?? ex.clauses
    expect(subs.some((c: any) => c.kind === 'on')).toBe(true)
  })

  test('execute summon zombie run', () => {
    const stmt = parseStmt('execute summon zombie run { raw("x"); }')
    const ex = stmt as any
    const subs = ex.subcommands ?? ex.clauses
    expect(subs.some((c: any) => c.kind === 'summon')).toBe(true)
  })

  test('execute store success score #r rs run', () => {
    const stmt = parseStmt('execute store success score #r rs run { raw("x"); }')
    const ex = stmt as any
    const subs = ex.subcommands ?? ex.clauses
    expect(subs.some((c: any) => c.kind === 'store_success')).toBe(true)
  })

  test('execute in minecraft:the_nether run', () => {
    const stmt = parseStmt('execute in minecraft:the_nether run { raw("x"); }')
    const ex = stmt as any
    const subs = ex.subcommands ?? ex.clauses
    const inSub = subs.find((c: any) => c.kind === 'in')
    expect(inSub).toBeDefined()
    expect(inSub.dimension).toBe('minecraft:the_nether')
  })

  test('execute in overworld (no namespace) run', () => {
    const stmt = parseStmt('execute in overworld run { raw("x"); }')
    const ex = stmt as any
    const subs = ex.subcommands ?? ex.clauses
    expect(subs.some((c: any) => c.kind === 'in')).toBe(true)
  })

  test('execute unless score matches range run', () => {
    const stmt = parseStmt('execute unless score x rs matches 1..10 run { raw("x"); }')
    const ex = stmt as any
    const subs = ex.subcommands ?? ex.clauses
    expect(subs.some((c: any) => c.kind === 'unless_score_range')).toBe(true)
  })

  test('execute if score matches range run', () => {
    const stmt = parseStmt('execute if score x rs matches 0 run { raw("x"); }')
    const ex = stmt as any
    const subs = ex.subcommands ?? ex.clauses
    expect(subs.some((c: any) => c.kind === 'if_score_range')).toBe(true)
  })

  test('execute unless entity selector run', () => {
    const stmt = parseStmt('execute unless entity @e[tag=dead] run { raw("x"); }')
    const ex = stmt as any
    const subs = ex.subcommands ?? ex.clauses
    expect(subs.some((c: any) => c.kind === 'unless_entity')).toBe(true)
  })

  test('execute unless block run', () => {
    const stmt = parseStmt('execute unless block 0 64 0 minecraft:air run { raw("x"); }')
    const ex = stmt as any
    const subs = ex.subcommands ?? ex.clauses
    expect(subs.some((c: any) => c.kind === 'unless_block')).toBe(true)
  })

  test('execute facing entity @s feet run', () => {
    const stmt = parseStmt('execute facing entity @s feet run { raw("x"); }')
    const ex = stmt as any
    const subs = ex.subcommands ?? ex.clauses
    const fe = subs.find((c: any) => c.kind === 'facing_entity')
    expect(fe).toBeDefined()
    expect(fe.anchor).toBe('feet')
  })

  test('execute if block without namespace (bare id)', () => {
    const stmt = parseStmt('execute if block 0 64 0 stone run { raw("x"); }')
    const ex = stmt as any
    const subs = ex.subcommands ?? ex.clauses
    expect(subs.some((c: any) => c.kind === 'if_block')).toBe(true)
  })
})

// ── Compound assignment on member and index ──────────────────────────────────

describe('Parser — compound assignment', () => {
  test('member += assignment', () => {
    const stmt = parseStmt('p.x += 5;')
    expect(stmt.kind).toBe('expr')
    const e = (stmt as any).expr
    expect(e.kind).toBe('member_assign')
    expect(e.op).toBe('+=')
  })

  test('member -= assignment', () => {
    const stmt = parseStmt('p.y -= 3;')
    const e = (stmt as any).expr
    expect(e.kind).toBe('member_assign')
    expect(e.op).toBe('-=')
  })

  test('index += assignment', () => {
    const stmt = parseStmt('arr[0] += 1;')
    const e = (stmt as any).expr
    expect(e.kind).toBe('index_assign')
    expect(e.op).toBe('+=')
  })

  test('index *= assignment', () => {
    const stmt = parseStmt('arr[i] *= 2;')
    const e = (stmt as any).expr
    expect(e.kind).toBe('index_assign')
    expect(e.op).toBe('*=')
  })

  test('variable /= assignment', () => {
    const stmt = parseStmt('x /= 4;')
    const e = (stmt as any).expr
    expect(e.kind).toBe('assign')
    expect(e.op).toBe('/=')
  })

  test('variable %= assignment', () => {
    const stmt = parseStmt('x %= 7;')
    const e = (stmt as any).expr
    expect(e.kind).toBe('assign')
    expect(e.op).toBe('%=')
  })
})

// ── Generic call syntax ────────────────────────────────────────────────────

describe('Parser — generic call', () => {
  test('generic call fn<int>(arg)', () => {
    const expr = parseExpr('identity<int>(42)')
    // Should parse as a call with typeArgs
    expect(expr.kind).toBe('call')
    expect((expr as any).typeArgs).toBeDefined()
    expect((expr as any).typeArgs.length).toBeGreaterThan(0)
  })

  test('non-generic comparison not mistaken for type args', () => {
    // a < b should remain a binary expression, not a generic call
    const expr = parseExpr('a < b')
    expect(expr.kind).toBe('binary')
  })
})

// ── Type parsing edge cases ────────────────────────────────────────────────

describe('Parser — type parsing', () => {
  test('selector<Player> type', () => {
    const prog = parse(`fn f(s: selector<Player>): void { }`)
    const param = prog.declarations[0].params[0]
    expect(param.type.kind).toBe('selector')
    expect((param.type as any).entityType).toBe('Player')
  })

  test('Option<int> type', () => {
    const prog = parse(`fn f(x: Option<int>): void { }`)
    const param = prog.declarations[0].params[0]
    expect(param.type.kind).toBe('option')
    expect((param.type as any).inner).toMatchObject({ kind: 'named', name: 'int' })
  })

  test('function type (int) -> int', () => {
    const prog = parse(`fn apply(f: (int) -> int, x: int): int { return f(x); }`)
    const param = prog.declarations[0].params[0]
    expect(param.type.kind).toBe('function_type')
  })

  test('array of arrays int[][]', () => {
    const prog = parse(`fn f(m: int[][]): void { }`)
    const param = prog.declarations[0].params[0]
    expect(param.type.kind).toBe('array')
    expect((param.type as any).elem.kind).toBe('array')
  })
})

// ── Export fn declaration ──────────────────────────────────────────────────

describe('Parser — export fn', () => {
  test('export fn sets isExported', () => {
    const prog = parse(`export fn api_call(): int { return 0; }`)
    expect(prog.declarations[0].isExported).toBe(true)
  })
})

// ── Declare stub ──────────────────────────────────────────────────────────

describe('Parser — declare stub', () => {
  test('declare fn with return type', () => {
    const prog = parse(`declare fn sin(x: int): int;\nfn f(): int { return 0; }`)
    // declare stubs are parsed and discarded; no crash
    expect(prog.declarations.length).toBe(1)
  })

  test('declare fn with -> return type', () => {
    const prog = parse(`declare fn cos(x: int) -> int;\nfn f(): int { return 0; }`)
    expect(prog.declarations.length).toBe(1)
  })
})

// ── Global let declaration ─────────────────────────────────────────────────

describe('Parser — global let', () => {
  test('global mutable let', () => {
    const prog = parse(`let COUNTER: int = 0;\nfn f(): int { return 0; }`)
    expect(prog.globals.length).toBe(1)
    expect(prog.globals[0].name).toBe('COUNTER')
  })
})
