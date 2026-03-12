import { Lexer } from '../lexer'
import { Parser } from '../parser'
import type { Program, FnDecl, Stmt, Expr } from '../ast/types'

function parse(source: string, namespace = 'test'): Program {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens).parse(namespace)
}

function parseExpr(source: string): Expr {
  const program = parse(`fn _test() { ${source}; }`)
  const stmt = program.declarations[0].body[0]
  if (stmt.kind !== 'expr') throw new Error('Expected expr stmt')
  return stmt.expr
}

function parseStmt(source: string): Stmt {
  const program = parse(`fn _test() { ${source} }`)
  return program.declarations[0].body[0]
}

describe('Parser', () => {
  describe('program structure', () => {
    it('parses empty program', () => {
      const program = parse('')
      expect(program.namespace).toBe('test')
      expect(program.declarations).toEqual([])
      expect(program.enums).toEqual([])
      expect(program.consts).toEqual([])
    })

    it('parses namespace declaration', () => {
      const program = parse('namespace mypack;', 'default')
      expect(program.namespace).toBe('mypack')
    })

    it('parses function declaration', () => {
      const program = parse('fn foo() {}')
      expect(program.declarations).toHaveLength(1)
      expect(program.declarations[0].name).toBe('foo')
    })

    it('parses top-level const declarations', () => {
      const program = parse('const MAX_HP: int = 100\nconst NAME: string = "Arena"')
      expect(program.consts).toEqual([
        { name: 'MAX_HP', type: { kind: 'named', name: 'int' }, value: { kind: 'int_lit', value: 100 } },
        { name: 'NAME', type: { kind: 'named', name: 'string' }, value: { kind: 'str_lit', value: 'Arena' } },
      ])
    })
  })

  describe('function declarations', () => {
    it('parses function with no params', () => {
      const program = parse('fn hello() {}')
      const fn = program.declarations[0]
      expect(fn.name).toBe('hello')
      expect(fn.params).toEqual([])
      expect(fn.returnType).toEqual({ kind: 'named', name: 'void' })
    })

    it('parses function with params', () => {
      const program = parse('fn add(a: int, b: int) -> int { return a + b; }')
      const fn = program.declarations[0]
      expect(fn.name).toBe('add')
      expect(fn.params).toEqual([
        { name: 'a', type: { kind: 'named', name: 'int' }, default: undefined },
        { name: 'b', type: { kind: 'named', name: 'int' }, default: undefined },
      ])
      expect(fn.returnType).toEqual({ kind: 'named', name: 'int' })
    })

    it('parses function params with defaults', () => {
      const program = parse('fn greet(name: string, formal: bool = false) {}')
      expect(program.declarations[0].params).toEqual([
        { name: 'name', type: { kind: 'named', name: 'string' }, default: undefined },
        { name: 'formal', type: { kind: 'named', name: 'bool' }, default: { kind: 'bool_lit', value: false } },
      ])
    })

    it('parses function with decorators', () => {
      const program = parse('@tick\nfn game_loop() {}')
      const fn = program.declarations[0]
      expect(fn.decorators).toEqual([{ name: 'tick' }])
    })

    it('parses decorator with args', () => {
      const program = parse('@tick(rate=20)\nfn slow_loop() {}')
      const fn = program.declarations[0]
      expect(fn.decorators).toEqual([{ name: 'tick', args: { rate: 20 } }])
    })

    it('parses multiple decorators', () => {
      const program = parse('@tick\n@on_trigger\nfn both() {}')
      const fn = program.declarations[0]
      expect(fn.decorators).toHaveLength(2)
    })

    it('parses advancement and death decorators', () => {
      const program = parse('@on_advancement("story/mine_diamond")\n@on_death\nfn handler() {}')
      expect(program.declarations[0].decorators).toEqual([
        { name: 'on_advancement', args: { advancement: 'story/mine_diamond' } },
        { name: 'on_death' },
      ])
    })
  })

  describe('types', () => {
    it('parses primitive types', () => {
      const program = parse('fn f(a: int, b: bool, c: float, d: string) {}')
      const params = program.declarations[0].params
      expect(params.map(p => p.type)).toEqual([
        { kind: 'named', name: 'int' },
        { kind: 'named', name: 'bool' },
        { kind: 'named', name: 'float' },
        { kind: 'named', name: 'string' },
      ])
    })

    it('parses array types', () => {
      const program = parse('fn f(a: int[]) {}')
      const param = program.declarations[0].params[0]
      expect(param.type).toEqual({ kind: 'array', elem: { kind: 'named', name: 'int' } })
    })

    it('parses BlockPos types', () => {
      const program = parse('fn f(pos: BlockPos) {}')
      const param = program.declarations[0].params[0]
      expect(param.type).toEqual({ kind: 'named', name: 'BlockPos' })
    })

    it('parses function types', () => {
      const program = parse('fn apply(val: int, cb: (int) -> int) -> int { return cb(val); }')
      expect(program.declarations[0].params[1].type).toEqual({
        kind: 'function_type',
        params: [{ kind: 'named', name: 'int' }],
        return: { kind: 'named', name: 'int' },
      })
    })

    it('parses enum declarations', () => {
      const program = parse('enum Direction { North, South = 3, East, West }')
      expect(program.enums).toEqual([
        {
          name: 'Direction',
          variants: [
            { name: 'North', value: 0 },
            { name: 'South', value: 3 },
            { name: 'East', value: 4 },
            { name: 'West', value: 5 },
          ],
        },
      ])
    })
  })

  describe('statements', () => {
    it('parses let statement', () => {
      const stmt = parseStmt('let x: int = 5;')
      expect(stmt).toEqual({
        kind: 'let',
        name: 'x',
        type: { kind: 'named', name: 'int' },
        init: { kind: 'int_lit', value: 5 },
      })
    })

    it('parses let without type annotation', () => {
      const stmt = parseStmt('let x = 5;')
      expect(stmt.kind).toBe('let')
      expect((stmt as any).type).toBeUndefined()
    })

    it('parses return statement', () => {
      const stmt = parseStmt('return 42;')
      expect(stmt).toEqual({
        kind: 'return',
        value: { kind: 'int_lit', value: 42 },
      })
    })

    it('parses empty return', () => {
      const stmt = parseStmt('return;')
      expect(stmt).toEqual({ kind: 'return', value: undefined })
    })

    it('parses if statement', () => {
      const stmt = parseStmt('if (x > 0) { y = 1; }')
      expect(stmt.kind).toBe('if')
      expect((stmt as any).cond.kind).toBe('binary')
      expect((stmt as any).then).toHaveLength(1)
      expect((stmt as any).else_).toBeUndefined()
    })

    it('parses if-else statement', () => {
      const stmt = parseStmt('if (x > 0) { y = 1; } else { y = 2; }')
      expect(stmt.kind).toBe('if')
      expect((stmt as any).else_).toHaveLength(1)
    })

    it('parses while statement', () => {
      const stmt = parseStmt('while (i > 0) { i = i - 1; }')
      expect(stmt.kind).toBe('while')
      expect((stmt as any).cond.kind).toBe('binary')
      expect((stmt as any).body).toHaveLength(1)
    })

    it('parses for statement', () => {
      const stmt = parseStmt('for (let i: int = 0; i < 10; i = i + 1) { say("loop"); }')
      expect(stmt.kind).toBe('for')
      expect((stmt as any).init.kind).toBe('let')
      expect((stmt as any).init.name).toBe('i')
      expect((stmt as any).cond.kind).toBe('binary')
      expect((stmt as any).cond.op).toBe('<')
      expect((stmt as any).step.kind).toBe('assign')
      expect((stmt as any).body).toHaveLength(1)
    })

    it('parses for statement without init', () => {
      const stmt = parseStmt('for (; i < 10; i = i + 1) { say("loop"); }')
      expect(stmt.kind).toBe('for')
      expect((stmt as any).init).toBeUndefined()
      expect((stmt as any).cond.kind).toBe('binary')
    })

    it('parses foreach statement', () => {
      const stmt = parseStmt('foreach (z in @e[type=zombie]) { kill(z); }')
      expect(stmt.kind).toBe('foreach')
      expect((stmt as any).binding).toBe('z')
      expect((stmt as any).iterable.kind).toBe('selector')
      expect((stmt as any).iterable.sel.kind).toBe('@e')
    })

    it('parses match statement', () => {
      const stmt = parseStmt('match (choice) { 1 => { say("one"); } 2 => { say("two"); } _ => { say("other"); } }')
      expect(stmt.kind).toBe('match')
      expect((stmt as any).expr).toEqual({ kind: 'ident', name: 'choice' })
      expect((stmt as any).arms).toEqual([
        { pattern: { kind: 'int_lit', value: 1 }, body: [{ kind: 'expr', expr: { kind: 'call', fn: 'say', args: [{ kind: 'str_lit', value: 'one' }] } }] },
        { pattern: { kind: 'int_lit', value: 2 }, body: [{ kind: 'expr', expr: { kind: 'call', fn: 'say', args: [{ kind: 'str_lit', value: 'two' }] } }] },
        { pattern: null, body: [{ kind: 'expr', expr: { kind: 'call', fn: 'say', args: [{ kind: 'str_lit', value: 'other' }] } }] },
      ])
    })

    it('parses as block', () => {
      const stmt = parseStmt('as @a { say("hello"); }')
      expect(stmt.kind).toBe('as_block')
      expect((stmt as any).selector.kind).toBe('@a')
    })

    it('parses at block', () => {
      const stmt = parseStmt('at @s { summon("zombie"); }')
      expect(stmt.kind).toBe('at_block')
      expect((stmt as any).selector.kind).toBe('@s')
    })

    it('parses as at combined', () => {
      const stmt = parseStmt('as @a at @s { particle("flame"); }')
      expect(stmt.kind).toBe('as_at')
      expect((stmt as any).as_sel.kind).toBe('@a')
      expect((stmt as any).at_sel.kind).toBe('@s')
    })

    it('parses raw command', () => {
      const stmt = parseStmt('raw("say hello");')
      expect(stmt).toEqual({ kind: 'raw', cmd: 'say hello' })
    })

    it('parses execute as run block', () => {
      const stmt = parseStmt('execute as @a run { say("hello"); }')
      expect(stmt.kind).toBe('execute')
      expect((stmt as any).subcommands).toHaveLength(1)
      expect((stmt as any).subcommands[0]).toEqual({ kind: 'as', selector: { kind: '@a' } })
      expect((stmt as any).body).toHaveLength(1)
    })

    it('parses execute as at run block', () => {
      const stmt = parseStmt('execute as @a at @s run { particle("flame"); }')
      expect(stmt.kind).toBe('execute')
      expect((stmt as any).subcommands).toHaveLength(2)
      expect((stmt as any).subcommands[0]).toEqual({ kind: 'as', selector: { kind: '@a' } })
      expect((stmt as any).subcommands[1]).toEqual({ kind: 'at', selector: { kind: '@s' } })
    })

    it('parses execute with if entity condition', () => {
      const stmt = parseStmt('execute as @a if entity @s[tag=admin] run { give(@s, "diamond", 1); }')
      expect(stmt.kind).toBe('execute')
      expect((stmt as any).subcommands).toHaveLength(2)
      expect((stmt as any).subcommands[1].kind).toBe('if_entity')
      expect((stmt as any).subcommands[1].selector.filters.tag).toEqual(['admin'])
    })

    it('parses execute with unless entity condition', () => {
      const stmt = parseStmt('execute as @a unless entity @s[tag=dead] run { effect(@s, "regeneration", 5); }')
      expect(stmt.kind).toBe('execute')
      expect((stmt as any).subcommands).toHaveLength(2)
      expect((stmt as any).subcommands[1].kind).toBe('unless_entity')
    })

    it('parses execute with in dimension', () => {
      const stmt = parseStmt('execute in the_nether run { say("in nether"); }')
      expect(stmt.kind).toBe('execute')
      expect((stmt as any).subcommands).toHaveLength(1)
      expect((stmt as any).subcommands[0]).toEqual({ kind: 'in', dimension: 'the_nether' })
    })

    it('parses complex execute chain', () => {
      const stmt = parseStmt('execute as @a at @s if entity @s[tag=vip] in overworld run { particle("heart"); }')
      expect(stmt.kind).toBe('execute')
      expect((stmt as any).subcommands).toHaveLength(4)
    })
  })

  describe('lambda expressions', () => {
    it('parses expression-body lambdas', () => {
      const stmt = parseStmt('let double = (x: int) => x * 2;')
      expect(stmt.kind).toBe('let')
      expect((stmt as any).init).toEqual({
        kind: 'lambda',
        params: [{ name: 'x', type: { kind: 'named', name: 'int' } }],
        returnType: undefined,
        body: {
          kind: 'binary',
          op: '*',
          left: { kind: 'ident', name: 'x' },
          right: { kind: 'int_lit', value: 2 },
        },
      })
    })

    it('parses block-body lambdas', () => {
      const stmt = parseStmt('let process: (int) -> int = (x: int) => { let doubled: int = x * 2; return doubled + 1; };')
      expect(stmt.kind).toBe('let')
      expect((stmt as any).init.kind).toBe('lambda')
      expect(Array.isArray((stmt as any).init.body)).toBe(true)
    })

    it('parses single-parameter lambdas without parens', () => {
      const stmt = parseStmt('let double: (int) -> int = x => x * 2;')
      expect(stmt.kind).toBe('let')
      expect((stmt as any).init).toEqual({
        kind: 'lambda',
        params: [{ name: 'x' }],
        returnType: undefined,
        body: {
          kind: 'binary',
          op: '*',
          left: { kind: 'ident', name: 'x' },
          right: { kind: 'int_lit', value: 2 },
        },
      })
    })

    it('parses immediately-invoked lambdas', () => {
      const expr = parseExpr('((x: int) => x * 2)(5)')
      expect(expr).toEqual({
        kind: 'invoke',
        callee: {
          kind: 'lambda',
          params: [{ name: 'x', type: { kind: 'named', name: 'int' } }],
          returnType: undefined,
          body: {
            kind: 'binary',
            op: '*',
            left: { kind: 'ident', name: 'x' },
            right: { kind: 'int_lit', value: 2 },
          },
        },
        args: [{ kind: 'int_lit', value: 5 }],
      })
    })
  })

  describe('expressions', () => {
    describe('literals', () => {
      it('parses integer literal', () => {
        const expr = parseExpr('42')
        expect(expr).toEqual({ kind: 'int_lit', value: 42 })
      })

      it('parses float literal', () => {
        const expr = parseExpr('3.14')
        expect(expr).toEqual({ kind: 'float_lit', value: 3.14 })
      })

    it('parses string literal', () => {
      const expr = parseExpr('"hello"')
      expect(expr).toEqual({ kind: 'str_lit', value: 'hello' })
    })

    it('parses interpolated string literal', () => {
      const expr = parseExpr('"Hello ${name}, score is ${score + 1}"')
      expect(expr).toEqual({
        kind: 'str_interp',
        parts: [
          'Hello ',
          { kind: 'ident', name: 'name' },
          ', score is ',
          {
            kind: 'binary',
            op: '+',
            left: { kind: 'ident', name: 'score' },
            right: { kind: 'int_lit', value: 1 },
          },
        ],
      })
    })

      it('parses boolean literals', () => {
        expect(parseExpr('true')).toEqual({ kind: 'bool_lit', value: true })
        expect(parseExpr('false')).toEqual({ kind: 'bool_lit', value: false })
      })

      it('parses range literals', () => {
        expect(parseExpr('..5')).toEqual({ kind: 'range_lit', range: { max: 5 } })
        expect(parseExpr('1..')).toEqual({ kind: 'range_lit', range: { min: 1 } })
        expect(parseExpr('1..10')).toEqual({ kind: 'range_lit', range: { min: 1, max: 10 } })
      })

      it('parses absolute block positions', () => {
        expect(parseExpr('(0, 64, 0)')).toEqual({
          kind: 'blockpos',
          x: { kind: 'absolute', value: 0 },
          y: { kind: 'absolute', value: 64 },
          z: { kind: 'absolute', value: 0 },
        })
      })

      it('parses relative block positions', () => {
        expect(parseExpr('(~1, ~0, ~-1)')).toEqual({
          kind: 'blockpos',
          x: { kind: 'relative', offset: 1 },
          y: { kind: 'relative', offset: 0 },
          z: { kind: 'relative', offset: -1 },
        })
      })

      it('parses local block positions', () => {
        expect(parseExpr('(^0, ^1, ^0)')).toEqual({
          kind: 'blockpos',
          x: { kind: 'local', offset: 0 },
          y: { kind: 'local', offset: 1 },
          z: { kind: 'local', offset: 0 },
        })
      })

      it('parses mixed block positions', () => {
        expect(parseExpr('(~0, 64, ~0)')).toEqual({
          kind: 'blockpos',
          x: { kind: 'relative', offset: 0 },
          y: { kind: 'absolute', value: 64 },
          z: { kind: 'relative', offset: 0 },
        })
      })
    })

    describe('identifiers and calls', () => {
      it('parses identifier', () => {
        const expr = parseExpr('foo')
        expect(expr).toEqual({ kind: 'ident', name: 'foo' })
      })

      it('parses function call', () => {
        const expr = parseExpr('foo(1, 2)')
        expect(expr).toEqual({
          kind: 'call',
          fn: 'foo',
          args: [
            { kind: 'int_lit', value: 1 },
            { kind: 'int_lit', value: 2 },
          ],
        })
      })

      it('parses no-arg call', () => {
        const expr = parseExpr('foo()')
        expect(expr).toEqual({ kind: 'call', fn: 'foo', args: [] })
      })

      it('parses enum variant member access', () => {
        const expr = parseExpr('Direction.North')
        expect(expr).toEqual({
          kind: 'member',
          obj: { kind: 'ident', name: 'Direction' },
          field: 'North',
        })
      })
    })

    describe('binary operators', () => {
      it('parses arithmetic', () => {
        const expr = parseExpr('1 + 2')
        expect(expr).toEqual({
          kind: 'binary',
          op: '+',
          left: { kind: 'int_lit', value: 1 },
          right: { kind: 'int_lit', value: 2 },
        })
      })

      it('respects precedence (mul before add)', () => {
        const expr = parseExpr('1 + 2 * 3')
        expect(expr.kind).toBe('binary')
        expect((expr as any).op).toBe('+')
        expect((expr as any).right.op).toBe('*')
      })

      it('respects precedence (compare before logical)', () => {
        const expr = parseExpr('a < b && c > d')
        expect(expr.kind).toBe('binary')
        expect((expr as any).op).toBe('&&')
        expect((expr as any).left.op).toBe('<')
        expect((expr as any).right.op).toBe('>')
      })

      it('is left associative', () => {
        const expr = parseExpr('1 - 2 - 3')
        // Should be (1 - 2) - 3
        expect(expr.kind).toBe('binary')
        expect((expr as any).op).toBe('-')
        expect((expr as any).left.kind).toBe('binary')
        expect((expr as any).right.kind).toBe('int_lit')
      })
    })

    describe('unary operators', () => {
      it('parses negation', () => {
        const expr = parseExpr('-5')
        expect(expr).toEqual({
          kind: 'unary',
          op: '-',
          operand: { kind: 'int_lit', value: 5 },
        })
      })

      it('parses logical not', () => {
        const expr = parseExpr('!flag')
        expect(expr).toEqual({
          kind: 'unary',
          op: '!',
          operand: { kind: 'ident', name: 'flag' },
        })
      })
    })

    describe('assignment', () => {
      it('parses simple assignment', () => {
        const expr = parseExpr('x = 5')
        expect(expr).toEqual({
          kind: 'assign',
          target: 'x',
          op: '=',
          value: { kind: 'int_lit', value: 5 },
        })
      })

      it('parses compound assignment', () => {
        const expr = parseExpr('x += 1')
        expect(expr).toEqual({
          kind: 'assign',
          target: 'x',
          op: '+=',
          value: { kind: 'int_lit', value: 1 },
        })
      })
    })

    describe('selectors', () => {
      it('parses simple selector', () => {
        const expr = parseExpr('@a')
        expect(expr).toEqual({
          kind: 'selector',
          raw: '@a',
          isSingle: false,
          sel: { kind: '@a' },
        })
      })

      it('marks single-entity selectors', () => {
        expect(parseExpr('@p')).toEqual({
          kind: 'selector',
          raw: '@p',
          isSingle: true,
          sel: { kind: '@p' },
        })
        expect(parseExpr('@e[limit=1, tag=target]')).toEqual({
          kind: 'selector',
          raw: '@e[limit=1, tag=target]',
          isSingle: true,
          sel: {
            kind: '@e',
            filters: { limit: 1, tag: ['target'] },
          },
        })
      })

      it('parses selector with type filter', () => {
        const expr = parseExpr('@e[type=zombie]')
        expect(expr).toEqual({
          kind: 'selector',
          raw: '@e[type=zombie]',
          isSingle: false,
          sel: {
            kind: '@e',
            filters: { type: 'zombie' },
          },
        })
      })

      it('parses selector with distance filter', () => {
        const expr = parseExpr('@e[distance=..5]')
        expect((expr as any).sel.filters.distance).toEqual({ max: 5 })
      })

      it('parses selector with tag filter', () => {
        const expr = parseExpr('@e[tag=boss, tag=!excluded]')
        expect((expr as any).sel.filters.tag).toEqual(['boss'])
        expect((expr as any).sel.filters.notTag).toEqual(['excluded'])
      })

      it('parses selector with limit and sort', () => {
        const expr = parseExpr('@e[limit=1, sort=nearest]')
        expect((expr as any).sel.filters.limit).toBe(1)
        expect((expr as any).sel.filters.sort).toBe('nearest')
      })

      it('parses selector with scores', () => {
        const expr = parseExpr('@a[scores={kills=1..}]')
        expect((expr as any).sel.filters.scores).toEqual({
          kills: { min: 1 },
        })
      })
    })

    describe('member access', () => {
      it('parses member access', () => {
        const expr = parseExpr('entity.health')
        expect(expr).toEqual({
          kind: 'member',
          obj: { kind: 'ident', name: 'entity' },
          field: 'health',
        })
      })

      it('parses array len property', () => {
        const expr = parseExpr('arr.len')
        expect(expr).toEqual({
          kind: 'member',
          obj: { kind: 'ident', name: 'arr' },
          field: 'len',
        })
      })
    })

    describe('arrays', () => {
      it('parses array literal', () => {
        expect(parseExpr('[1, 2, 3]')).toEqual({
          kind: 'array_lit',
          elements: [
            { kind: 'int_lit', value: 1 },
            { kind: 'int_lit', value: 2 },
            { kind: 'int_lit', value: 3 },
          ],
        })
      })

      it('parses array index access', () => {
        expect(parseExpr('arr[i]')).toEqual({
          kind: 'index',
          obj: { kind: 'ident', name: 'arr' },
          index: { kind: 'ident', name: 'i' },
        })
      })

      it('parses array push call', () => {
        expect(parseExpr('arr.push(4)')).toEqual({
          kind: 'call',
          fn: '__array_push',
          args: [
            { kind: 'ident', name: 'arr' },
            { kind: 'int_lit', value: 4 },
          ],
        })
      })

      it('parses array pop call', () => {
        expect(parseExpr('arr.pop()')).toEqual({
          kind: 'call',
          fn: '__array_pop',
          args: [
            { kind: 'ident', name: 'arr' },
          ],
        })
      })
    })

    describe('grouping', () => {
      it('parses parenthesized expression', () => {
        const expr = parseExpr('(1 + 2) * 3')
        expect(expr.kind).toBe('binary')
        expect((expr as any).op).toBe('*')
        expect((expr as any).left.kind).toBe('binary')
      })
    })
  })

  describe('complex programs', () => {
    it('parses add function', () => {
      const source = `
fn add(a: int, b: int) -> int {
    return a + b;
}
`
      const program = parse(source)
      expect(program.declarations).toHaveLength(1)
      const fn = program.declarations[0]
      expect(fn.name).toBe('add')
      expect(fn.body).toHaveLength(1)
      expect(fn.body[0].kind).toBe('return')
    })

    it('parses abs function with if/else', () => {
      const source = `
fn abs(x: int) -> int {
    if (x < 0) {
        return -x;
    } else {
        return x;
    }
}
`
      const program = parse(source)
      const fn = program.declarations[0]
      expect(fn.body).toHaveLength(1)
      const ifStmt = fn.body[0]
      expect(ifStmt.kind).toBe('if')
    })

    it('parses tick function', () => {
      const source = `
@tick(rate=20)
fn heartbeat() {
    say("still alive");
}
`
      const program = parse(source)
      const fn = program.declarations[0]
      expect(fn.decorators).toEqual([{ name: 'tick', args: { rate: 20 } }])
      expect(fn.body).toHaveLength(1)
    })

    it('parses foreach with kill', () => {
      const source = `
fn kill_zombies() {
    foreach (z in @e[type=zombie, distance=..10]) {
        kill(z);
    }
}
`
      const program = parse(source)
      const fn = program.declarations[0]
      const stmt = fn.body[0]
      expect(stmt.kind).toBe('foreach')
      expect((stmt as any).binding).toBe('z')
      expect((stmt as any).iterable.sel.filters.type).toBe('zombie')
      expect((stmt as any).iterable.sel.filters.distance).toEqual({ max: 10 })
    })

    it('parses foreach over array', () => {
      const source = `
fn walk() {
    let arr: int[] = [1, 2, 3];
    foreach (x in arr) {
        say("tick");
    }
}
`
      const program = parse(source)
      const stmt = program.declarations[0].body[1]
      expect(stmt.kind).toBe('foreach')
      expect((stmt as any).binding).toBe('x')
      expect((stmt as any).iterable).toEqual({ kind: 'ident', name: 'arr' })
    })

    it('parses while loop', () => {
      const source = `
fn count_down() {
    let i: int = 10;
    while (i > 0) {
        i = i - 1;
    }
}
`
      const program = parse(source)
      const fn = program.declarations[0]
      expect(fn.body).toHaveLength(2)
      expect(fn.body[0].kind).toBe('let')
      expect(fn.body[1].kind).toBe('while')
    })
  })
})
