import { Lexer } from '../../../src/lexer'
import { Parser } from '../../../src/parser'
import { lowerToHIR } from '../../hir/lower'
import type { HIRStmt, HIRExpr, HIRModule } from '../../hir/types'

function parse(source: string): HIRModule {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  return lowerToHIR(ast)
}

function getBody(source: string): HIRStmt[] {
  const mod = parse(source)
  return mod.functions[0].body
}

describe('HIR lowering — for loop desugaring', () => {
  test('for(init;cond;step) → let + while with step appended', () => {
    const body = getBody('fn f() { for (let i: int = 0; i < 10; i = i + 1) { let x: int = i; } }')
    // Should produce: let i = 0; while(i < 10) { let x = i; i = i + 1; }
    expect(body).toHaveLength(2)
    expect(body[0].kind).toBe('let')
    const letStmt = body[0] as Extract<HIRStmt, { kind: 'let' }>
    expect(letStmt.name).toBe('i')

    expect(body[1].kind).toBe('while')
    const whileStmt = body[1] as Extract<HIRStmt, { kind: 'while' }>
    expect(whileStmt.cond.kind).toBe('binary')

    // while body: original body + step
    expect(whileStmt.body).toHaveLength(2)
    expect(whileStmt.body[0].kind).toBe('let') // let x = i
    expect(whileStmt.body[1].kind).toBe('expr') // i = i + 1
  })

  test('for loop without init', () => {
    const body = getBody('fn f() { let i: int = 0; for (; i < 5; i = i + 1) {} }')
    // let i = 0; while(i < 5) { i = i + 1 }
    expect(body).toHaveLength(2)
    expect(body[0].kind).toBe('let')
    expect(body[1].kind).toBe('while')
  })
})

describe('HIR lowering — for_range desugaring', () => {
  test('for i in 0..10 → let + while', () => {
    const body = getBody('fn f() { for i in 0..10 { let x: int = i; } }')
    expect(body).toHaveLength(2)

    const letStmt = body[0] as Extract<HIRStmt, { kind: 'let' }>
    expect(letStmt.kind).toBe('let')
    expect(letStmt.name).toBe('i')
    expect(letStmt.init.kind).toBe('int_lit')

    const whileStmt = body[1] as Extract<HIRStmt, { kind: 'while' }>
    expect(whileStmt.kind).toBe('while')
    // cond: i < 10
    expect(whileStmt.cond.kind).toBe('binary')
    const cond = whileStmt.cond as Extract<HIRExpr, { kind: 'binary' }>
    expect(cond.op).toBe('<')
    // body: original body + increment
    expect(whileStmt.body.length).toBeGreaterThanOrEqual(2)
    const lastStmt = whileStmt.body[whileStmt.body.length - 1]
    expect(lastStmt.kind).toBe('expr')
  })
})

describe('HIR lowering — compound assignment desugaring', () => {
  test('x += 1 → x = x + 1', () => {
    const body = getBody('fn f() { let x: int = 0; x += 1; }')
    const exprStmt = body[1] as Extract<HIRStmt, { kind: 'expr' }>
    expect(exprStmt.kind).toBe('expr')
    const assign = exprStmt.expr as Extract<HIRExpr, { kind: 'assign' }>
    expect(assign.kind).toBe('assign')
    expect(assign.target).toBe('x')
    // value should be x + 1
    const binExpr = assign.value as Extract<HIRExpr, { kind: 'binary' }>
    expect(binExpr.kind).toBe('binary')
    expect(binExpr.op).toBe('+')
    expect((binExpr.left as any).name).toBe('x')
    expect((binExpr.right as any).value).toBe(1)
  })

  test('x -= 5 → x = x - 5', () => {
    const body = getBody('fn f() { let x: int = 10; x -= 5; }')
    const exprStmt = body[1] as Extract<HIRStmt, { kind: 'expr' }>
    const assign = exprStmt.expr as Extract<HIRExpr, { kind: 'assign' }>
    expect(assign.kind).toBe('assign')
    const bin = assign.value as Extract<HIRExpr, { kind: 'binary' }>
    expect(bin.op).toBe('-')
  })

  test('x *= 2 → x = x * 2', () => {
    const body = getBody('fn f() { let x: int = 1; x *= 2; }')
    const exprStmt = body[1] as Extract<HIRStmt, { kind: 'expr' }>
    const assign = exprStmt.expr as Extract<HIRExpr, { kind: 'assign' }>
    const bin = assign.value as Extract<HIRExpr, { kind: 'binary' }>
    expect(bin.op).toBe('*')
  })

  test('x /= 3 → x = x / 3', () => {
    const body = getBody('fn f() { let x: int = 9; x /= 3; }')
    const exprStmt = body[1] as Extract<HIRStmt, { kind: 'expr' }>
    const assign = exprStmt.expr as Extract<HIRExpr, { kind: 'assign' }>
    const bin = assign.value as Extract<HIRExpr, { kind: 'binary' }>
    expect(bin.op).toBe('/')
  })

  test('x %= 3 → x = x % 3', () => {
    const body = getBody('fn f() { let x: int = 10; x %= 3; }')
    const exprStmt = body[1] as Extract<HIRStmt, { kind: 'expr' }>
    const assign = exprStmt.expr as Extract<HIRExpr, { kind: 'assign' }>
    const bin = assign.value as Extract<HIRExpr, { kind: 'binary' }>
    expect(bin.op).toBe('%')
  })
})

describe('HIR lowering — execute block unification', () => {
  test('as_block → execute [as]', () => {
    const body = getBody('fn f() { as @e[tag=foo] { } }')
    expect(body).toHaveLength(1)
    const exec = body[0] as Extract<HIRStmt, { kind: 'execute' }>
    expect(exec.kind).toBe('execute')
    expect(exec.subcommands).toHaveLength(1)
    expect(exec.subcommands[0].kind).toBe('as')
  })

  test('foreach with at context preserved', () => {
    const body = getBody('fn f() { foreach (p in @a) at @s { } }')
    expect(body).toHaveLength(1)
    expect(body[0].kind).toBe('foreach')
    const fe = body[0] as Extract<HIRStmt, { kind: 'foreach' }>
    expect(fe.executeContext).toBe('at @s')
  })
})

describe('HIR lowering — && and || preservation', () => {
  test('&& preserved as binary op', () => {
    const body = getBody('fn f() { let x: bool = true && false; }')
    const letStmt = body[0] as Extract<HIRStmt, { kind: 'let' }>
    const bin = letStmt.init as Extract<HIRExpr, { kind: 'binary' }>
    expect(bin.kind).toBe('binary')
    expect(bin.op).toBe('&&')
  })

  test('|| preserved as binary op', () => {
    const body = getBody('fn f() { let x: bool = true || false; }')
    const letStmt = body[0] as Extract<HIRStmt, { kind: 'let' }>
    const bin = letStmt.init as Extract<HIRExpr, { kind: 'binary' }>
    expect(bin.kind).toBe('binary')
    expect(bin.op).toBe('||')
  })
})

describe('HIR lowering — pass-through constructs', () => {
  test('while loop passes through', () => {
    const body = getBody('fn f() { while (true) { } }')
    expect(body).toHaveLength(1)
    expect(body[0].kind).toBe('while')
  })

  test('if/else passes through', () => {
    const body = getBody('fn f() { if (true) { } else { } }')
    expect(body).toHaveLength(1)
    expect(body[0].kind).toBe('if')
    const ifStmt = body[0] as Extract<HIRStmt, { kind: 'if' }>
    expect(ifStmt.then).toBeDefined()
    expect(ifStmt.else_).toBeDefined()
  })

  test('return passes through', () => {
    const body = getBody('fn f(): int { return 42; }')
    expect(body).toHaveLength(1)
    expect(body[0].kind).toBe('return')
    const ret = body[0] as Extract<HIRStmt, { kind: 'return' }>
    expect(ret.value).toBeDefined()
    expect((ret.value as any).value).toBe(42)
  })

  test('function call passes through', () => {
    const body = getBody('fn f() { foo(1, 2); }')
    expect(body).toHaveLength(1)
    const exprStmt = body[0] as Extract<HIRStmt, { kind: 'expr' }>
    const call = exprStmt.expr as Extract<HIRExpr, { kind: 'call' }>
    expect(call.kind).toBe('call')
    expect(call.fn).toBe('foo')
    expect(call.args).toHaveLength(2)
  })

  test('break and continue pass through', () => {
    const body = getBody('fn f() { while (true) { break; continue; } }')
    const whileStmt = body[0] as Extract<HIRStmt, { kind: 'while' }>
    expect(whileStmt.body[0].kind).toBe('break')
    expect(whileStmt.body[1].kind).toBe('continue')
  })

  test('raw command passes through', () => {
    const body = getBody('fn f() { raw("say hello"); }')
    expect(body).toHaveLength(1)
    expect(body[0].kind).toBe('raw')
  })
})

describe('HIR lowering — module structure', () => {
  test('struct declarations preserved', () => {
    const mod = parse('struct Vec2 { x: int, y: int }')
    expect(mod.structs).toHaveLength(1)
    expect(mod.structs[0].name).toBe('Vec2')
    expect(mod.structs[0].fields).toHaveLength(2)
  })

  test('const declarations preserved', () => {
    const mod = parse('const MAX: int = 100;')
    expect(mod.consts).toHaveLength(1)
    expect(mod.consts[0].name).toBe('MAX')
  })

  test('namespace preserved', () => {
    const mod = parse('fn f() {}')
    expect(mod.namespace).toBe('test')
  })

  test('decorators preserved on functions', () => {
    const mod = parse('@tick fn tick_fn() {}')
    expect(mod.functions).toHaveLength(1)
    expect(mod.functions[0].decorators).toHaveLength(1)
    expect(mod.functions[0].decorators[0].name).toBe('tick')
  })
})

describe('HIR lowering — member compound assignment', () => {
  test('obj.field += 1 → obj.field = obj.field + 1', () => {
    const mod = parse('struct S { x: int } fn f() { let s: S = { x: 0 }; s.x += 1; }')
    const body = mod.functions[0].body
    const exprStmt = body[1] as Extract<HIRStmt, { kind: 'expr' }>
    const assign = exprStmt.expr as Extract<HIRExpr, { kind: 'member_assign' }>
    expect(assign.kind).toBe('member_assign')
    expect(assign.field).toBe('x')
    const bin = assign.value as Extract<HIRExpr, { kind: 'binary' }>
    expect(bin.kind).toBe('binary')
    expect(bin.op).toBe('+')
    expect((bin.left as any).kind).toBe('member')
    expect((bin.left as any).field).toBe('x')
  })
})

describe('HIR lowering — plain assignment passes through', () => {
  test('x = 5 stays as x = 5', () => {
    const body = getBody('fn f() { let x: int = 0; x = 5; }')
    const exprStmt = body[1] as Extract<HIRStmt, { kind: 'expr' }>
    const assign = exprStmt.expr as Extract<HIRExpr, { kind: 'assign' }>
    expect(assign.kind).toBe('assign')
    expect(assign.target).toBe('x')
    expect((assign.value as any).value).toBe(5)
  })
})
