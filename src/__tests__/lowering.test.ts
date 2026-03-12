import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { Lowering } from '../lowering'
import type { IRModule, IRFunction, IRInstr } from '../ir/types'

function compile(source: string, namespace = 'test'): IRModule {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse(namespace)
  return new Lowering(namespace).lower(ast)
}

function getFunction(module: IRModule, name: string): IRFunction | undefined {
  return module.functions.find(f => f.name === name)
}

function getInstructions(fn: IRFunction): IRInstr[] {
  return fn.blocks.flatMap(b => b.instrs)
}

function getRawCommands(fn: IRFunction): string[] {
  return getInstructions(fn)
    .filter((i): i is IRInstr & { op: 'raw' } => i.op === 'raw')
    .map(i => i.cmd)
}

describe('Lowering', () => {
  describe('basic functions', () => {
    it('lowers empty function', () => {
      const ir = compile('fn empty() {}')
      const fn = getFunction(ir, 'empty')
      expect(fn).toBeDefined()
      expect(fn?.blocks).toHaveLength(1)
      expect(fn?.blocks[0].term.op).toBe('return')
    })

    it('lowers function with params', () => {
      const ir = compile('fn add(a: int, b: int) -> int { return a + b; }')
      const fn = getFunction(ir, 'add')
      expect(fn).toBeDefined()
      expect(fn?.params).toEqual(['$a', '$b'])
    })

    it('creates param copy instructions', () => {
      const ir = compile('fn foo(x: int) {}')
      const fn = getFunction(ir, 'foo')!
      const instrs = getInstructions(fn)
      expect(instrs.some(i =>
        i.op === 'assign' && i.dst === '$x' && (i.src as any).name === '$p0'
      )).toBe(true)
    })
  })

  describe('let statements', () => {
    it('lowers let with literal', () => {
      const ir = compile('fn foo() { let x: int = 42; }')
      const fn = getFunction(ir, 'foo')!
      const instrs = getInstructions(fn)
      expect(instrs.some(i =>
        i.op === 'assign' && i.dst === '$x' && (i.src as any).value === 42
      )).toBe(true)
    })

    it('lowers let with expression', () => {
      const ir = compile('fn foo(a: int) { let x: int = a + 1; }')
      const fn = getFunction(ir, 'foo')!
      const instrs = getInstructions(fn)
      expect(instrs.some(i => i.op === 'binop')).toBe(true)
    })
  })

  describe('return statements', () => {
    it('lowers return with value', () => {
      const ir = compile('fn foo() -> int { return 42; }')
      const fn = getFunction(ir, 'foo')!
      const term = fn.blocks[0].term
      expect(term.op).toBe('return')
      expect((term as any).value).toEqual({ kind: 'const', value: 42 })
    })

    it('lowers empty return', () => {
      const ir = compile('fn foo() { return; }')
      const fn = getFunction(ir, 'foo')!
      const term = fn.blocks[0].term
      expect(term.op).toBe('return')
      expect((term as any).value).toBeUndefined()
    })
  })

  describe('binary expressions', () => {
    it('lowers arithmetic', () => {
      const ir = compile('fn foo(a: int, b: int) -> int { return a + b; }')
      const fn = getFunction(ir, 'foo')!
      const instrs = getInstructions(fn)
      const binop = instrs.find(i => i.op === 'binop')
      expect(binop).toBeDefined()
      expect((binop as any).bop).toBe('+')
    })

    it('lowers comparison', () => {
      const ir = compile('fn foo(a: int, b: int) -> bool { return a < b; }')
      const fn = getFunction(ir, 'foo')!
      const instrs = getInstructions(fn)
      const cmp = instrs.find(i => i.op === 'cmp')
      expect(cmp).toBeDefined()
      expect((cmp as any).cop).toBe('<')
    })
  })

  describe('unary expressions', () => {
    it('lowers negation', () => {
      const ir = compile('fn foo(x: int) -> int { return -x; }')
      const fn = getFunction(ir, 'foo')!
      const instrs = getInstructions(fn)
      const binop = instrs.find(i => i.op === 'binop' && (i as any).bop === '-')
      expect(binop).toBeDefined()
      // -x is lowered as 0 - x
      expect((binop as any).lhs).toEqual({ kind: 'const', value: 0 })
    })

    it('lowers logical not', () => {
      const ir = compile('fn foo(x: bool) -> bool { return !x; }')
      const fn = getFunction(ir, 'foo')!
      const instrs = getInstructions(fn)
      const cmp = instrs.find(i => i.op === 'cmp' && (i as any).cop === '==')
      expect(cmp).toBeDefined()
      // !x is lowered as x == 0
      expect((cmp as any).rhs).toEqual({ kind: 'const', value: 0 })
    })
  })

  describe('if statements', () => {
    it('creates conditional jump', () => {
      const ir = compile('fn foo(x: int) { if (x > 0) { let y: int = 1; } }')
      const fn = getFunction(ir, 'foo')!
      expect(fn.blocks.length).toBeGreaterThan(1)
      const term = fn.blocks[0].term
      expect(term.op).toBe('jump_if')
    })

    it('creates else block', () => {
      const ir = compile('fn foo(x: int) { if (x > 0) { let y: int = 1; } else { let y: int = 2; } }')
      const fn = getFunction(ir, 'foo')!
      expect(fn.blocks.length).toBeGreaterThanOrEqual(3) // entry, then, else, merge
    })
  })

  describe('while statements', () => {
    it('creates loop structure', () => {
      const ir = compile('fn foo() { let i: int = 0; while (i < 10) { i = i + 1; } }')
      const fn = getFunction(ir, 'foo')!
      // Should have: entry -> check -> body -> exit
      expect(fn.blocks.length).toBeGreaterThanOrEqual(3)

      // Find loop_check block
      const checkBlock = fn.blocks.find(b => b.label.includes('loop_check'))
      expect(checkBlock).toBeDefined()
    })
  })

  describe('foreach statements', () => {
    it('extracts body into sub-function', () => {
      const ir = compile('fn kill_all() { foreach (e in @e[type=zombie]) { kill(e); } }')
      expect(ir.functions.length).toBe(2) // main + foreach sub-function
      const subFn = ir.functions.find(f => f.name.includes('foreach'))
      expect(subFn).toBeDefined()
    })

    it('emits execute as ... run function', () => {
      const ir = compile('fn kill_all() { foreach (e in @e[type=zombie]) { kill(e); } }')
      const mainFn = getFunction(ir, 'kill_all')!
      const rawCmds = getRawCommands(mainFn)
      expect(rawCmds.some(cmd =>
        cmd.includes('execute as @e[type=zombie]') && cmd.includes('run function')
      )).toBe(true)
    })

    it('binding maps to @s in sub-function', () => {
      const ir = compile('fn kill_all() { foreach (e in @e[type=zombie]) { kill(e); } }')
      const subFn = ir.functions.find(f => f.name.includes('foreach'))!
      const rawCmds = getRawCommands(subFn)
      expect(rawCmds.some(cmd => cmd === 'kill @s')).toBe(true)
    })
  })

  describe('as/at blocks', () => {
    it('extracts as block into sub-function', () => {
      const ir = compile('fn test() { as @a { say("hello"); } }')
      expect(ir.functions.length).toBe(2)
      const mainFn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(mainFn)
      expect(rawCmds.some(cmd =>
        cmd.includes('execute as @a') && cmd.includes('run function')
      )).toBe(true)
    })

    it('extracts at block into sub-function', () => {
      const ir = compile('fn test() { at @s { summon("zombie"); } }')
      expect(ir.functions.length).toBe(2)
      const mainFn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(mainFn)
      expect(rawCmds.some(cmd =>
        cmd.includes('execute at @s') && cmd.includes('run function')
      )).toBe(true)
    })
  })

  describe('builtins', () => {
    it('lowers say()', () => {
      const ir = compile('fn test() { say("hello"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('say hello')
    })

    it('lowers kill()', () => {
      const ir = compile('fn test() { kill(@e[type=zombie]); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('kill @e[type=zombie]')
    })

    it('lowers give()', () => {
      const ir = compile('fn test() { give(@p, "diamond", 64); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('give @p diamond 64')
    })

    it('lowers summon()', () => {
      const ir = compile('fn test() { summon("zombie"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd => cmd.includes('summon zombie'))).toBe(true)
    })

    it('lowers effect()', () => {
      const ir = compile('fn test() { effect(@a, "speed", 30, 1); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd => cmd.includes('effect give @a speed 30 1'))).toBe(true)
    })

    it('lowers random()', () => {
      const ir = compile('fn test() { let x: int = random(1, 100); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd =>
        cmd.includes('execute store result score') && cmd.includes('random value 1..100')
      )).toBe(true)
    })
  })

  describe('decorators', () => {
    it('marks @tick function', () => {
      const ir = compile('@tick fn game_loop() {}')
      const fn = getFunction(ir, 'game_loop')!
      expect(fn.isTickLoop).toBe(true)
    })

    it('marks @on_trigger function', () => {
      const ir = compile('@on_trigger("my_trigger") fn handle_trigger() {}')
      const fn = getFunction(ir, 'handle_trigger')!
      expect(fn.isTriggerHandler).toBe(true)
      expect(fn.triggerName).toBe('my_trigger')
    })
  })

  describe('selectors', () => {
    it('converts selector with filters to string', () => {
      const ir = compile('fn test() { kill(@e[type=zombie, distance=..10, tag=boss]); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      const killCmd = rawCmds.find(cmd => cmd.startsWith('kill'))
      expect(killCmd).toContain('type=zombie')
      expect(killCmd).toContain('distance=..10')
      expect(killCmd).toContain('tag=boss')
    })
  })

  describe('raw commands', () => {
    it('passes through raw commands', () => {
      const ir = compile('fn test() { raw("tp @a ~ ~10 ~"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('tp @a ~ ~10 ~')
    })
  })

  describe('assignment operators', () => {
    it('lowers compound assignment', () => {
      const ir = compile('fn test() { let x: int = 5; x += 3; }')
      const fn = getFunction(ir, 'test')!
      const instrs = getInstructions(fn)
      const binop = instrs.find(i => i.op === 'binop' && (i as any).bop === '+')
      expect(binop).toBeDefined()
    })
  })

  describe('entity tag methods', () => {
    it('lowers entity.tag()', () => {
      const ir = compile('fn test() { @s.tag("boss"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('tag @s add boss')
    })

    it('lowers entity.untag()', () => {
      const ir = compile('fn test() { @s.untag("boss"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('tag @s remove boss')
    })

    it('lowers entity.has_tag() and returns temp var', () => {
      const ir = compile('fn test() { let x: bool = @s.has_tag("boss"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd =>
        cmd.includes('execute store result score') && cmd.includes('if entity @s[tag=boss]')
      )).toBe(true)
    })

    it('lowers entity.tag() on selector with filters', () => {
      const ir = compile('fn test() { @e[type=zombie].tag("marked"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd =>
        cmd.includes('tag @e[type=zombie] add marked')
      )).toBe(true)
    })
  })

  describe('complex programs', () => {
    it('compiles add function correctly', () => {
      const source = `
fn add(a: int, b: int) -> int {
    return a + b;
}
`
      const ir = compile(source)
      const fn = getFunction(ir, 'add')!
      expect(fn.params).toEqual(['$a', '$b'])

      const instrs = getInstructions(fn)
      expect(instrs.some(i => i.op === 'binop' && (i as any).bop === '+')).toBe(true)

      const term = fn.blocks[fn.blocks.length - 1].term
      expect(term.op).toBe('return')
      expect((term as any).value?.kind).toBe('var')
    })

    it('compiles abs function with if/else', () => {
      const source = `
fn abs(x: int) -> int {
    if (x < 0) {
        return -x;
    } else {
        return x;
    }
}
`
      const ir = compile(source)
      const fn = getFunction(ir, 'abs')!
      expect(fn.blocks.length).toBeGreaterThanOrEqual(3)

      // Should have comparison
      const instrs = getInstructions(fn)
      expect(instrs.some(i => i.op === 'cmp' && (i as any).cop === '<')).toBe(true)
    })

    it('compiles countdown with while', () => {
      const source = `
fn count_down() {
    let i: int = 10;
    while (i > 0) {
        i = i - 1;
    }
}
`
      const ir = compile(source)
      const fn = getFunction(ir, 'count_down')!

      // Should have loop structure
      const checkBlock = fn.blocks.find(b => b.label.includes('loop_check'))
      const bodyBlock = fn.blocks.find(b => b.label.includes('loop_body'))
      expect(checkBlock).toBeDefined()
      expect(bodyBlock).toBeDefined()
    })
  })
})
