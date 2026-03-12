import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { Lowering } from '../lowering'
import type { IRModule, IRFunction, IRInstr } from '../ir/types'

function compile(source: string, namespace = 'test'): IRModule {
  return compileWithWarnings(source, namespace).ir
}

function compileWithWarnings(source: string, namespace = 'test'): { ir: IRModule; warnings: Lowering['warnings'] } {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse(namespace)
  const lowering = new Lowering(namespace)
  return { ir: lowering.lower(ast), warnings: lowering.warnings }
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

    it('fills in missing default arguments at call sites', () => {
      const ir = compile(`
fn damage(amount: int, multiplier: int = 1) -> int {
  return amount * multiplier;
}

fn test() -> int {
  return damage(10);
}
`)
      const fn = getFunction(ir, 'test')!
      const call = getInstructions(fn).find(i => i.op === 'call') as any
      expect(call.args).toHaveLength(2)
      expect(call.args[0]).toEqual({ kind: 'const', value: 10 })
      expect(call.args[1]).toEqual({ kind: 'const', value: 1 })
    })

    it('specializes callback-accepting functions for lambda arguments', () => {
      const ir = compile(`
fn apply(val: int, cb: (int) -> int) -> int {
  return cb(val);
}

fn test() -> int {
  return apply(5, (x: int) => x * 3);
}
`)
      expect(getFunction(ir, '__lambda_0')).toBeDefined()
      const specialized = ir.functions.find(fn => fn.name.startsWith('apply__cb___lambda_0'))
      expect(specialized).toBeDefined()
      expect(specialized?.params).toEqual(['$val'])
      const call = getInstructions(specialized!).find(i => i.op === 'call') as any
      expect(call.fn).toBe('__lambda_0')
    })
  })

  describe('let statements', () => {
    it('inlines const values without allocating scoreboard variables', () => {
      const ir = compile(`
const MAX_HP: int = 100

fn foo() {
  let x: int = MAX_HP;
}
`)
      const fn = getFunction(ir, 'foo')!
      const instrs = getInstructions(fn)
      expect(instrs.some(i =>
        i.op === 'assign' && i.dst === '$x' && (i.src as any).kind === 'const' && (i.src as any).value === 100
      )).toBe(true)
      expect(ir.globals).not.toContain('$MAX_HP')
    })

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

    it('stores literal-backed string variables in storage for str_len', () => {
      const ir = compile('fn foo() { let name: string = "Player"; let n: int = str_len(name); }')
      const fn = getFunction(ir, 'foo')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('data modify storage rs:strings name set value "Player"')
      expect(rawCmds.some(cmd =>
        cmd.includes('execute store result score') && cmd.includes('run data get storage rs:strings name')
      )).toBe(true)
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

  describe('lambda lowering', () => {
    it('lowers lambda variables to generated sub-functions', () => {
      const ir = compile(`
fn test() {
  let double: (int) -> int = (x: int) => x * 2;
  let result: int = double(5);
}
`)
      const lambdaFn = getFunction(ir, '__lambda_0')
      expect(lambdaFn).toBeDefined()
      const testFn = getFunction(ir, 'test')!
      const calls = getInstructions(testFn).filter((instr): instr is IRInstr & { op: 'call' } => instr.op === 'call')
      expect(calls.some(call => call.fn === '__lambda_0')).toBe(true)
    })

    it('inlines immediately-invoked expression-body lambdas', () => {
      const ir = compile(`
fn test() -> int {
  return ((x: int) => x * 2)(5);
}
`)
      expect(ir.functions.find(fn => fn.name.startsWith('__lambda_'))).toBeUndefined()
      const testFn = getFunction(ir, 'test')!
      expect(getInstructions(testFn).some(instr => instr.op === 'binop')).toBe(true)
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
        cmd.includes('execute as @e[type=minecraft:zombie]') && cmd.includes('run function')
      )).toBe(true)
    })

    it('binding maps to @s in sub-function', () => {
      const ir = compile('fn kill_all() { foreach (e in @e[type=zombie]) { kill(e); } }')
      const subFn = ir.functions.find(f => f.name.includes('foreach'))!
      const rawCmds = getRawCommands(subFn)
      expect(rawCmds.some(cmd => cmd === 'kill @s')).toBe(true)
    })

    it('lowers foreach over array into a counting loop', () => {
      const ir = compile('fn walk() { let arr: int[] = [1, 2, 3]; foreach (x in arr) { let y: int = x; } }')
      const fn = getFunction(ir, 'walk')!
      expect(fn.blocks.some(b => b.label.includes('foreach_array_check'))).toBe(true)
      expect(fn.blocks.some(b => b.label.includes('foreach_array_body'))).toBe(true)
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd => cmd.includes('data get storage rs:heap arr'))).toBe(true)
    })
  })

  describe('match statements', () => {
    it('lowers match into guarded execute function calls', () => {
      const ir = compile('fn choose() { let choice: int = 2; match (choice) { 1 => { say("one"); } 2 => { say("two"); } _ => { say("other"); } } }')
      const fn = getFunction(ir, 'choose')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd => cmd.includes('execute if score') && cmd.includes('matches 1 run function'))).toBe(true)
      expect(rawCmds.some(cmd => cmd.includes('execute if score') && cmd.includes('matches 2 run function'))).toBe(true)
      expect(rawCmds.some(cmd => cmd.includes('matches ..0 run function'))).toBe(true)
      expect(ir.functions.filter(f => f.name.includes('match_')).length).toBe(3)
    })

    it('lowers enum variants to integer constants in comparisons and match arms', () => {
      const ir = compile(`
enum Direction { North, South, East, West }

fn choose(dir: Direction) {
  if (dir == Direction.South) {
    say("south");
  }
  match (dir) {
    Direction.North => { say("north"); }
    Direction.South => { say("south"); }
    _ => { say("other"); }
  }
}
`)
      const fn = getFunction(ir, 'choose')!
      const rawCmds = getRawCommands(fn)
      expect(getInstructions(fn).some(i => i.op === 'cmp' && (i as any).rhs.value === 1)).toBe(true)
      expect(rawCmds.some(cmd => cmd.includes('matches 0 run function'))).toBe(true)
      expect(rawCmds.some(cmd => cmd.includes('matches 1 run function'))).toBe(true)
    })
  })

  describe('arrays', () => {
    it('lowers array literal initialization', () => {
      const ir = compile('fn test() { let arr: int[] = [1, 2, 3]; }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('data modify storage rs:heap arr set value []')
      expect(rawCmds).toContain('data modify storage rs:heap arr append value 1')
      expect(rawCmds).toContain('data modify storage rs:heap arr append value 2')
      expect(rawCmds).toContain('data modify storage rs:heap arr append value 3')
    })

    it('lowers array len property', () => {
      const ir = compile('fn test() { let arr: int[] = [1]; let n: int = arr.len; }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd =>
        cmd.includes('execute store result score') && cmd.includes('run data get storage rs:heap arr')
      )).toBe(true)
    })

    it('lowers static array indexing', () => {
      const ir = compile('fn test() { let arr: int[] = [7, 8]; let x: int = arr[0]; }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd => cmd.includes('run data get storage rs:heap arr[0]'))).toBe(true)
    })

    it('lowers dynamic array indexing via macro helper', () => {
      const ir = compile('fn test() { let arr: int[] = [7, 8]; let i: int = 1; let x: int = arr[i]; }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd => cmd.includes('with storage rs:heap'))).toBe(true)
      const helperFn = ir.functions.find(f => f.name.includes('array_get_'))
      expect(helperFn).toBeDefined()
      expect(getRawCommands(helperFn!).some(cmd => cmd.includes('arr[$('))).toBe(true)
    })

    it('lowers array push', () => {
      const ir = compile('fn test() { let arr: int[] = []; arr.push(4); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('data modify storage rs:heap arr append value 4')
    })

    it('lowers array pop', () => {
      const ir = compile('fn test() { let arr: int[] = [1, 2]; let x: int = arr.pop(); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd => cmd.includes('run data get storage rs:heap arr[-1]'))).toBe(true)
      expect(rawCmds).toContain('data remove storage rs:heap arr[-1]')
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

  describe('execute inline blocks', () => {
    it('extracts execute as run block into sub-function', () => {
      const ir = compile('fn test() { execute as @a run { say("hello from each"); } }')
      expect(ir.functions.length).toBe(2)
      const mainFn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(mainFn)
      expect(rawCmds.some(cmd =>
        cmd.includes('execute as @a run function')
      )).toBe(true)
    })

    it('extracts execute as at run block into sub-function', () => {
      const ir = compile('fn test() { execute as @a at @s run { particle("flame"); } }')
      expect(ir.functions.length).toBe(2)
      const mainFn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(mainFn)
      expect(rawCmds.some(cmd =>
        cmd.includes('execute as @a at @s run function')
      )).toBe(true)
    })

    it('handles execute with if entity condition', () => {
      const ir = compile('fn test() { execute as @a if entity @s[tag=admin] run { give(@s, "diamond", 1); } }')
      expect(ir.functions.length).toBe(2)
      const mainFn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(mainFn)
      expect(rawCmds.some(cmd =>
        cmd.includes('execute as @a if entity @s[tag=admin] run function')
      )).toBe(true)
    })

    it('handles execute with unless entity condition', () => {
      const ir = compile('fn test() { execute as @a unless entity @s[tag=dead] run { effect(@s, "regeneration", 5); } }')
      expect(ir.functions.length).toBe(2)
      const mainFn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(mainFn)
      expect(rawCmds.some(cmd =>
        cmd.includes('execute as @a unless entity @s[tag=dead] run function')
      )).toBe(true)
    })

    it('handles execute with in dimension', () => {
      const ir = compile('fn test() { execute in the_nether run { say("in nether"); } }')
      expect(ir.functions.length).toBe(2)
      const mainFn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(mainFn)
      expect(rawCmds.some(cmd =>
        cmd.includes('execute in the_nether run function')
      )).toBe(true)
    })

    it('lowered sub-function contains body commands', () => {
      const ir = compile('fn test() { execute as @a run { say("inner"); give(@s, "bread", 1); } }')
      const subFn = ir.functions.find(f => f.name.includes('exec_'))!
      expect(subFn).toBeDefined()
      const rawCmds = getRawCommands(subFn)
      expect(rawCmds).toContain('say inner')
      expect(rawCmds.some(cmd => cmd.includes('give @s bread 1'))).toBe(true)
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
      expect(rawCmds).toContain('kill @e[type=minecraft:zombie]')
    })

    it('lowers give()', () => {
      const ir = compile('fn test() { give(@p, "diamond", 64); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('give @p diamond 64')
    })

    it('lowers actionbar(), subtitle(), and title_times()', () => {
      const ir = compile('fn test() { actionbar(@a, "Fight!"); subtitle(@a, "Next wave"); title_times(@a, 10, 40, 10); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('title @a actionbar {"text":"Fight!"}')
      expect(rawCmds).toContain('title @a subtitle {"text":"Next wave"}')
      expect(rawCmds).toContain('title @a times 10 40 10')
    })

    it('lowers announce()', () => {
      const ir = compile('fn test() { announce("Server event starting"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('tellraw @a {"text":"Server event starting"}')
    })

    it('lowers interpolated say() to tellraw score components', () => {
      const ir = compile('fn test() { let score: int = 7; say("You have ${score} points"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('tellraw @a ["",{"text":"You have "},{"score":{"name":"$score","objective":"rs"}},{"text":" points"}]')
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

    it('lowers tp() for both positions and entity destinations', () => {
      const ir = compile('fn test() { tp(@s, (~1, ~0, ~-1)); tp(@s, "^0", "^1", "^0"); tp(@s, @p); tp(@a, (1, 64, 1)); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('tp @s ~1 ~ ~-1')
      expect(rawCmds).toContain('tp @s ^0 ^1 ^0')
      expect(rawCmds).toContain('tp @s @p')
      expect(rawCmds).toContain('tp @a 1 64 1')
    })

    it('warns when using tp_to()', () => {
      const { ir, warnings } = compileWithWarnings('fn test() { tp_to(@s, @p); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('tp @s @p')
      expect(warnings).toContainEqual(expect.objectContaining({
        code: 'W_DEPRECATED',
        message: 'tp_to is deprecated; use tp instead',
      }))
    })

    it('lowers inventory and player admin commands', () => {
      const ir = compile('fn test() { clear(@s); clear(@s, "minecraft:stick"); kick(@p); kick(@p, "AFK"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('clear @s')
      expect(rawCmds).toContain('clear @s minecraft:stick')
      expect(rawCmds).toContain('kick @p')
      expect(rawCmds).toContain('kick @p AFK')
    })

    it('lowers world management commands', () => {
      const ir = compile('fn test() { weather("rain"); time_set("day"); time_add(1000); gamerule("doDaylightCycle", "false"); difficulty("hard"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('weather rain')
      expect(rawCmds).toContain('time set day')
      expect(rawCmds).toContain('time add 1000')
      expect(rawCmds).toContain('gamerule doDaylightCycle false')
      expect(rawCmds).toContain('difficulty hard')
    })

    it('lowers tag_add() and tag_remove()', () => {
      const ir = compile('fn test() { tag_add(@s, "boss"); tag_remove(@s, "boss"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('tag @s add boss')
      expect(rawCmds).toContain('tag @s remove boss')
    })

    it('lowers setblock(), fill(), and clone()', () => {
      const ir = compile('fn test() { setblock((4, 65, 4), "stone"); fill((0, 64, 0), (8, 64, 8), "minecraft:smooth_stone"); clone((0, 64, 0), (4, 68, 4), (10, 64, 10)); setblock("~", "~", "~", "legacy"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('setblock 4 65 4 stone')
      expect(rawCmds).toContain('fill 0 64 0 8 64 8 minecraft:smooth_stone')
      expect(rawCmds).toContain('clone 0 64 0 4 68 4 10 64 10')
      expect(rawCmds).toContain('setblock ~ ~ ~ legacy')
    })

    it('lowers BlockPos locals in coordinate builtins', () => {
      const ir = compile('fn test() { let spawn: BlockPos = (4, 65, 4); setblock(spawn, "minecraft:stone"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('setblock 4 65 4 minecraft:stone')
    })

    it('lowers xp_add() and xp_set()', () => {
      const ir = compile('fn test() { xp_add(@s, 5); xp_add(@s, 2, "levels"); xp_set(@s, 0); xp_set(@s, 3, "levels"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('xp add @s 5 points')
      expect(rawCmds).toContain('xp add @s 2 levels')
      expect(rawCmds).toContain('xp set @s 0 points')
      expect(rawCmds).toContain('xp set @s 3 levels')
    })

    it('lowers scoreboard display and objective management builtins', () => {
      const ir = compile(`
fn test() {
  scoreboard_display("sidebar", "kills");
  scoreboard_display("list", "coins");
  scoreboard_display("belowName", "hp");
  scoreboard_hide("sidebar");
  scoreboard_add_objective("kills", "playerKillCount", "Kill Count");
  scoreboard_remove_objective("kills");
}
`)
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('scoreboard objectives setdisplay sidebar kills')
      expect(rawCmds).toContain('scoreboard objectives setdisplay list coins')
      expect(rawCmds).toContain('scoreboard objectives setdisplay belowName hp')
      expect(rawCmds).toContain('scoreboard objectives setdisplay sidebar')
      expect(rawCmds).toContain('scoreboard objectives add kills playerKillCount "Kill Count"')
      expect(rawCmds).toContain('scoreboard objectives remove kills')
    })

    it('lowers bossbar management builtins', () => {
      const ir = compile(`
fn test() {
  bossbar_add("ns:health", "Boss Health");
  bossbar_set_value("ns:health", 50);
  bossbar_set_max("ns:health", 100);
  bossbar_set_color("ns:health", "red");
  bossbar_set_style("ns:health", "notched_10");
  bossbar_set_visible("ns:health", true);
  bossbar_set_players("ns:health", @a);
  bossbar_remove("ns:health");
  let current: int = bossbar_get_value("ns:health");
}
`)
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('bossbar add ns:health {"text":"Boss Health"}')
      expect(rawCmds).toContain('bossbar set ns:health value 50')
      expect(rawCmds).toContain('bossbar set ns:health max 100')
      expect(rawCmds).toContain('bossbar set ns:health color red')
      expect(rawCmds).toContain('bossbar set ns:health style notched_10')
      expect(rawCmds).toContain('bossbar set ns:health visible true')
      expect(rawCmds).toContain('bossbar set ns:health players @a')
      expect(rawCmds).toContain('bossbar remove ns:health')
      expect(rawCmds.some(cmd => /^execute store result score \$_\d+ rs run bossbar get ns:health value$/.test(cmd))).toBe(true)
    })

    it('lowers team management builtins', () => {
      const ir = compile(`
fn test() {
  team_add("red", "Red Team");
  team_remove("red");
  team_join("red", @a[tag=red_team]);
  team_leave(@s);
  team_option("red", "friendlyFire", "false");
  team_option("red", "color", "red");
  team_option("red", "prefix", "[Red] ");
}
`)
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('team add red {"text":"Red Team"}')
      expect(rawCmds).toContain('team remove red')
      expect(rawCmds).toContain('team join red @a[tag=red_team]')
      expect(rawCmds).toContain('team leave @s')
      expect(rawCmds).toContain('team modify red friendlyFire false')
      expect(rawCmds).toContain('team modify red color red')
      expect(rawCmds).toContain('team modify red prefix {"text":"[Red] "}')
    })

    it('lowers random()', () => {
      const ir = compile('fn test() { let x: int = random(1, 100); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('scoreboard players random $_0 rs 1 100')
    })

    it('lowers random_native()', () => {
      const ir = compile('fn test() { let x: int = random_native(1, 6); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('execute store result score $_0 rs run random value 1 6')
    })

    it('lowers random_sequence()', () => {
      const ir = compile('fn test() { random_sequence("loot", 42); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('random reset loot 42')
    })

    it('lowers data_get from entity', () => {
      const ir = compile('fn test() { let item_count: int = data_get("entity", "@s", "SelectedItem.Count"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd =>
        cmd.includes('execute store result score') && 
        cmd.includes('run data get entity @s SelectedItem.Count 1')
      )).toBe(true)
    })

    it('lowers data_get from block', () => {
      const ir = compile('fn test() { let furnace_fuel: int = data_get("block", "~ ~ ~", "BurnTime"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd =>
        cmd.includes('run data get block ~ ~ ~ BurnTime 1')
      )).toBe(true)
    })

    it('lowers data_get from storage', () => {
      const ir = compile('fn test() { let val: int = data_get("storage", "mypack:globals", "player_count"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd =>
        cmd.includes('run data get storage mypack:globals player_count 1')
      )).toBe(true)
    })

    it('lowers data_get with scale factor', () => {
      const ir = compile('fn test() { let scaled: int = data_get("entity", "@s", "Pos[0]", "1000"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd =>
        cmd.includes('run data get entity @s Pos[0] 1000')
      )).toBe(true)
    })

    it('data_get result can be used in expressions', () => {
      const ir = compile(`
        fn test() {
          let count: int = data_get("entity", "@s", "SelectedItem.Count");
          let doubled: int = count * 2;
        }
      `)
      const fn = getFunction(ir, 'test')!
      const instrs = getInstructions(fn)
      expect(instrs.some(i => i.op === 'binop' && (i as any).bop === '*')).toBe(true)
    })

    it('accepts bare selector targets in scoreboard_get', () => {
      const ir = compile('fn test() { let score: int = scoreboard_get(@s, "score"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd =>
        cmd.includes('run scoreboard players get @s score')
      )).toBe(true)
    })

    it('accepts bare selector targets in scoreboard_set', () => {
      const ir = compile('fn test() { scoreboard_set(@a, "kills", 0); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('scoreboard players set @a kills 0')
    })

    it('warns on quoted selectors in scoreboard_get', () => {
      const { ir, warnings } = compileWithWarnings('fn test() { let score: int = scoreboard_get("@s", "score"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd =>
        cmd.includes('run scoreboard players get @s score')
      )).toBe(true)
      expect(warnings).toContainEqual(expect.objectContaining({
        code: 'W_QUOTED_SELECTOR',
        message: 'Quoted selector "@s" is deprecated; pass @s without quotes',
      }))
    })

    it('does not warn on fake player names', () => {
      const { ir, warnings } = compileWithWarnings('fn test() { let total: int = scoreboard_get("#global", "total"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd =>
        cmd.includes('run scoreboard players get #global total')
      )).toBe(true)
      expect(warnings).toHaveLength(0)
    })

    it('warns on quoted selectors in data_get entity targets', () => {
      const { ir, warnings } = compileWithWarnings('fn test() { let pos: int = data_get("entity", "@s", "Pos[0]"); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds.some(cmd =>
        cmd.includes('run data get entity @s Pos[0] 1')
      )).toBe(true)
      expect(warnings).toContainEqual(expect.objectContaining({
        code: 'W_QUOTED_SELECTOR',
        message: 'Quoted selector "@s" is deprecated; pass @s without quotes',
      }))
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

    it('marks @on_advancement function for advancement json generation', () => {
      const ir = compile('@on_advancement("story/mine_diamond") fn handle_advancement() {}')
      const fn = getFunction(ir, 'handle_advancement')!
      expect(fn.eventTrigger).toEqual({ kind: 'advancement', value: 'story/mine_diamond' })
    })
  })

  describe('selectors', () => {
    it('converts selector with filters to string', () => {
      const ir = compile('fn test() { kill(@e[type=zombie, distance=..10, tag=boss]); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      const killCmd = rawCmds.find(cmd => cmd.startsWith('kill'))
      expect(killCmd).toContain('type=minecraft:zombie')
      expect(killCmd).toContain('distance=..10')
      expect(killCmd).toContain('tag=boss')
    })

    it('warns and auto-qualifies unnamespaced entity types', () => {
      const { ir, warnings } = compileWithWarnings('fn test() { kill(@e[type=zombie]); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('kill @e[type=minecraft:zombie]')
      expect(warnings).toContainEqual({
        code: 'W_UNNAMESPACED_TYPE',
        message: 'Unnamespaced entity type "zombie", auto-qualifying to "minecraft:zombie"',
      })
    })

    it('passes through minecraft entity types without warnings', () => {
      const { ir, warnings } = compileWithWarnings('fn test() { kill(@e[type=minecraft:zombie]); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('kill @e[type=minecraft:zombie]')
      expect(warnings).toHaveLength(0)
    })

    it('passes through custom namespaced entity types without warnings', () => {
      const { ir, warnings } = compileWithWarnings('fn test() { kill(@e[type=my_mod:custom_mob]); }')
      const fn = getFunction(ir, 'test')!
      const rawCmds = getRawCommands(fn)
      expect(rawCmds).toContain('kill @e[type=my_mod:custom_mob]')
      expect(warnings).toHaveLength(0)
    })

    it('throws on invalid entity type format', () => {
      expect(() => compileWithWarnings('fn test() { kill(@e[type=invalid!!!]); }'))
        .toThrow('Invalid entity type format: "invalid!!!"')
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
        cmd.includes('tag @e[type=minecraft:zombie] add marked')
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

  describe('Global variables', () => {
    it('registers global in IR globals with init value', () => {
      const ir = compile('let x: int = 42;\nfn test() { say("hi"); }')
      expect(ir.globals).toContainEqual({ name: '$x', init: 42 })
    })

    it('reads global variable in function body', () => {
      const ir = compile('let count: int = 0;\nfn test() { let y: int = count; }')
      const fn = getFunction(ir, 'test')!
      const instrs = getInstructions(fn)
      expect(instrs.some(i =>
        i.op === 'assign' && i.dst === '$y' && (i.src as any).kind === 'var' && (i.src as any).name === '$count'
      )).toBe(true)
    })

    it('writes global variable in function body', () => {
      const ir = compile('let count: int = 0;\nfn inc() { count = 5; }')
      const fn = getFunction(ir, 'inc')!
      const instrs = getInstructions(fn)
      expect(instrs.some(i =>
        i.op === 'assign' && i.dst === '$count' && (i.src as any).kind === 'const' && (i.src as any).value === 5
      )).toBe(true)
    })

    it('compound assignment on global variable', () => {
      const ir = compile('let count: int = 0;\nfn inc() { count += 1; }')
      const fn = getFunction(ir, 'inc')!
      const instrs = getInstructions(fn)
      expect(instrs.some(i =>
        i.op === 'binop' && (i.lhs as any).name === '$count' && i.bop === '+' && (i.rhs as any).value === 1
      )).toBe(true)
    })

    it('const cannot be reassigned', () => {
      const src = 'const X: int = 5;\nfn bad() { X = 10; }'
      expect(() => compile(src)).toThrow(/Cannot assign to constant/)
    })

    it('multiple globals with different init values', () => {
      const ir = compile('let a: int = 10;\nlet b: int = 20;\nfn test() { a = b; }')
      expect(ir.globals).toContainEqual({ name: '$a', init: 10 })
      expect(ir.globals).toContainEqual({ name: '$b', init: 20 })
    })
  })
})
