/**
 * End-to-End Tests
 *
 * Tests the complete pipeline: Source → Lexer → Parser → Lowering → Optimizer → CodeGen
 */

import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { Lowering } from '../lowering'
import { optimize } from '../optimizer/passes'
import { generateDatapack, DatapackFile } from '../codegen/mcfunction'
import type { IRModule } from '../ir/types'

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function compile(source: string, namespace = 'test'): DatapackFile[] {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse(namespace)
  const ir = new Lowering(namespace).lower(ast)
  const optimized: IRModule = {
    ...ir,
    functions: ir.functions.map(fn => optimize(fn)),
  }
  return generateDatapack(optimized)
}

function getFunction(files: DatapackFile[], name: string): string | undefined {
  const file = files.find(f => f.path.includes(`/${name}.mcfunction`))
  return file?.content
}

function getSubFunction(files: DatapackFile[], parent: string, sub: string): string | undefined {
  const file = files.find(f => f.path.includes(`/${parent}/${sub}.mcfunction`))
  return file?.content
}

function hasTickTag(files: DatapackFile[], namespace: string, fnName: string): boolean {
  const tickTag = files.find(f => f.path === 'data/minecraft/tags/function/tick.json')
  if (!tickTag) return false
  const content = JSON.parse(tickTag.content)
  return content.values.includes(`${namespace}:${fnName}`)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('E2E: Complete Pipeline', () => {
  describe('Test 1: Simple function (add)', () => {
    const source = `
fn add(a: int, b: int) -> int {
    return a + b;
}
`
    it('generates mcfunction file', () => {
      const files = compile(source)
      const fn = getFunction(files, 'add')
      expect(fn).toBeDefined()
    })

    it('copies params to named variables', () => {
      const files = compile(source)
      const fn = getFunction(files, 'add')!
      expect(fn).toContain('$a')
      expect(fn).toContain('$p0')
    })

    it('performs addition', () => {
      const files = compile(source)
      const fn = getFunction(files, 'add')!
      expect(fn).toContain('+=')
    })

    it('returns result', () => {
      const files = compile(source)
      const fn = getFunction(files, 'add')!
      expect(fn).toMatch(/return/)
    })
  })

  describe('Test 2: if/else (abs)', () => {
    const source = `
fn abs(x: int) -> int {
    if (x < 0) {
        return -x;
    } else {
        return x;
    }
}
`
    it('generates main function and control flow blocks', () => {
      const files = compile(source)
      const fn = getFunction(files, 'abs')
      expect(fn).toBeDefined()
      // Should have conditional execution
      expect(fn).toContain('execute if score')
    })

    it('has comparison logic', () => {
      const files = compile(source)
      const fn = getFunction(files, 'abs')!
      // Check for comparison with 0
      expect(fn).toContain('$const_0')
    })
  })

  describe('Test 3: @tick + say', () => {
    const source = `
@tick(rate=20)
fn heartbeat() {
    say("still alive");
}
`
    it('generates function with say command', () => {
      const files = compile(source)
      // Find the tick_body or main function that has the say command
      const allContent = files.map(f => f.content).join('\n')
      expect(allContent).toContain('say still alive')
    })

    it('is registered in tick tag', () => {
      const files = compile(source)
      expect(hasTickTag(files, 'test', 'heartbeat')).toBe(true)
    })
  })

  describe('Test 4: foreach', () => {
    const source = `
fn kill_zombies() {
    foreach (z in @e[type=zombie, distance=..10]) {
        kill(z);
    }
}
`
    it('generates main function with execute as', () => {
      const files = compile(source)
      const fn = getFunction(files, 'kill_zombies')
      expect(fn).toBeDefined()
      expect(fn).toContain('execute as @e[type=zombie,distance=..10]')
      expect(fn).toContain('run function test:kill_zombies/foreach_0')
    })

    it('generates sub-function with kill @s', () => {
      const files = compile(source)
      // Look for the foreach sub-function
      const subFn = files.find(f => f.path.includes('foreach_0'))
      expect(subFn).toBeDefined()
      expect(subFn?.content).toContain('kill @s')
    })
  })

  describe('Test 5: while loop (countdown)', () => {
    const source = `
fn count_down() {
    let i: int = 10;
    while (i > 0) {
        i = i - 1;
    }
}
`
    it('generates function with loop structure', () => {
      const files = compile(source)
      const fn = getFunction(files, 'count_down')
      expect(fn).toBeDefined()
    })

    it('initializes variable to 10', () => {
      const files = compile(source)
      const fn = getFunction(files, 'count_down')!
      expect(fn).toContain('10')
    })

    it('has comparison and conditional jumps', () => {
      const files = compile(source)
      const allContent = files
        .filter(f => f.path.includes('count_down'))
        .map(f => f.content)
        .join('\n')
      // Should have comparison with 0
      expect(allContent).toContain('$const_0')
      // Should have conditional execution
      expect(allContent).toMatch(/execute if score/)
    })
  })

  describe('Datapack structure', () => {
    it('generates pack.mcmeta', () => {
      const files = compile('fn test() {}')
      const meta = files.find(f => f.path === 'pack.mcmeta')
      expect(meta).toBeDefined()
      const content = JSON.parse(meta!.content)
      expect(content.pack.pack_format).toBeDefined()
    })

    it('generates load.mcfunction', () => {
      const files = compile('fn test() {}')
      const load = files.find(f => f.path.includes('load.mcfunction'))
      expect(load).toBeDefined()
      expect(load!.content).toContain('scoreboard objectives add rs dummy')
    })

    it('generates minecraft:load tag', () => {
      const files = compile('fn test() {}')
      const tag = files.find(f => f.path === 'data/minecraft/tags/function/load.json')
      expect(tag).toBeDefined()
    })
  })

  describe('Built-in functions', () => {
    it('compiles give()', () => {
      const source = 'fn test() { give(@p, "diamond", 64); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('give @p diamond 64')
    })

    it('compiles summon()', () => {
      const source = 'fn test() { summon("zombie"); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('summon zombie')
    })

    it('compiles effect()', () => {
      const source = 'fn test() { effect(@a, "speed", 60, 2); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('effect give @a speed 60 2')
    })

    it('compiles tp()', () => {
      const source = 'fn test() { tp(@s, "0", "100", "0"); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('tp @s 0 100 0')
    })

    it('compiles random()', () => {
      const source = 'fn test() { let x: int = random(1, 10); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('random value 1..10')
    })
  })

  describe('Selectors', () => {
    it('handles simple selectors', () => {
      const source = 'fn test() { kill(@e); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('kill @e')
    })

    it('handles selectors with type filter', () => {
      const source = 'fn test() { kill(@e[type=creeper]); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('kill @e[type=creeper]')
    })

    it('handles selectors with multiple filters', () => {
      const source = 'fn test() { kill(@e[type=zombie, distance=..5, limit=1]); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('type=zombie')
      expect(fn).toContain('distance=..5')
      expect(fn).toContain('limit=1')
    })

    it('handles tag filters', () => {
      const source = 'fn test() { kill(@e[tag=boss, tag=!friendly]); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('tag=boss')
      expect(fn).toContain('tag=!friendly')
    })
  })

  describe('Control flow', () => {
    it('handles nested if statements', () => {
      const source = `
fn nested(x: int, y: int) {
    if (x > 0) {
        if (y > 0) {
            say("both positive");
        }
    }
}
`
      const files = compile(source)
      const allContent = files
        .filter(f => f.path.includes('nested'))
        .map(f => f.content)
        .join('\n')
      expect(allContent).toContain('say both positive')
    })

    it('handles else-if chains', () => {
      const source = `
fn grade(score: int) {
    if (score >= 90) {
        say("A");
    } else {
        if (score >= 80) {
            say("B");
        } else {
            say("C");
        }
    }
}
`
      const files = compile(source)
      const allContent = files
        .filter(f => f.path.includes('grade'))
        .map(f => f.content)
        .join('\n')
      expect(allContent).toContain('say A')
      expect(allContent).toContain('say B')
      expect(allContent).toContain('say C')
    })
  })

  describe('as/at blocks', () => {
    it('compiles as block', () => {
      const source = `
fn greet_all() {
    as @a {
        say("Hello!");
    }
}
`
      const files = compile(source)
      const fn = getFunction(files, 'greet_all')
      expect(fn).toContain('execute as @a')
      expect(fn).toContain('run function test:greet_all/')
    })

    it('compiles at block', () => {
      const source = `
fn spawn_at_players() {
    at @a {
        summon("zombie");
    }
}
`
      const files = compile(source)
      const fn = getFunction(files, 'spawn_at_players')
      expect(fn).toContain('execute at @a')
      expect(fn).toContain('run function test:spawn_at_players/')
    })
  })

  describe('Optimization', () => {
    it('folds constants', () => {
      const source = 'fn test() -> int { return 2 + 3; }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      // After constant folding, should have direct value 5
      expect(fn).toContain('5')
    })

    it('propagates copies', () => {
      const source = `
fn test() -> int {
    let x: int = 10;
    let y: int = x;
    return y;
}
`
      const files = compile(source)
      const fn = getFunction(files, 'test')
      // Should have 10 in the output (propagated)
      expect(fn).toContain('10')
    })
  })

  describe('Multiple functions', () => {
    it('compiles multiple functions', () => {
      const source = `
fn helper() -> int {
    return 42;
}

fn main() -> int {
    return helper();
}
`
      const files = compile(source)
      expect(getFunction(files, 'helper')).toBeDefined()
      expect(getFunction(files, 'main')).toBeDefined()
    })

    it('generates function calls', () => {
      const source = `
fn helper() -> int {
    return 42;
}

fn main() -> int {
    return helper();
}
`
      const files = compile(source)
      const main = getFunction(files, 'main')
      expect(main).toContain('function test:helper')
    })
  })

  describe('Raw commands', () => {
    it('passes through raw commands', () => {
      const source = 'fn test() { raw("gamemode creative @a"); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('gamemode creative @a')
    })

    it('preserves complex raw commands', () => {
      const source = 'fn test() { raw("execute as @a at @s run particle flame ~ ~ ~ 0.5 0.5 0.5 0 10"); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('execute as @a at @s run particle flame')
    })
  })

  describe('Compound assignment', () => {
    it('compiles += operator', () => {
      const source = `
fn test() {
    let x: int = 5;
    x += 3;
}
`
      const files = compile(source)
      const allContent = files.map(f => f.content).join('\n')
      // Should have both 5 and 3, and addition
      expect(allContent).toContain('5')
      expect(allContent).toContain('3')
    })

    it('compiles all compound operators', () => {
      const source = `
fn test() {
    let x: int = 10;
    x += 1;
    x -= 1;
    x *= 2;
    x /= 2;
    x %= 3;
}
`
      const files = compile(source)
      // Should compile without error
      expect(getFunction(files, 'test')).toBeDefined()
    })
  })

  describe('Trigger system', () => {
    it('generates trigger objective in load.mcfunction', () => {
      const source = `
@on_trigger("claim_reward")
fn handle_claim() {
    say("Claimed!");
}
`
      const files = compile(source)
      const load = files.find(f => f.path.includes('load.mcfunction'))
      expect(load?.content).toContain('scoreboard objectives add claim_reward trigger')
      expect(load?.content).toContain('scoreboard players enable @a claim_reward')
    })

    it('generates trigger check function', () => {
      const source = `
@on_trigger("claim_reward")
fn handle_claim() {
    say("Claimed!");
}
`
      const files = compile(source)
      const check = files.find(f => f.path.includes('__trigger_check.mcfunction'))
      expect(check).toBeDefined()
      expect(check?.content).toContain('execute as @a[scores={claim_reward=1..}]')
      expect(check?.content).toContain('run function test:__trigger_claim_reward_dispatch')
    })

    it('generates trigger dispatch function', () => {
      const source = `
@on_trigger("claim_reward")
fn handle_claim() {
    say("Claimed!");
}
`
      const files = compile(source)
      const dispatch = files.find(f => f.path.includes('__trigger_claim_reward_dispatch.mcfunction'))
      expect(dispatch).toBeDefined()
      expect(dispatch?.content).toContain('function test:handle_claim')
      expect(dispatch?.content).toContain('scoreboard players set @s claim_reward 0')
      expect(dispatch?.content).toContain('scoreboard players enable @s claim_reward')
    })

    it('registers trigger check in tick tag', () => {
      const source = `
@on_trigger("claim_reward")
fn handle_claim() {
    say("Claimed!");
}
`
      const files = compile(source)
      const tickTag = files.find(f => f.path === 'data/minecraft/tags/function/tick.json')
      expect(tickTag).toBeDefined()
      const content = JSON.parse(tickTag!.content)
      expect(content.values).toContain('test:__trigger_check')
    })

    it('combines tick functions and trigger check in tick tag', () => {
      const source = `
@tick
fn game_loop() {
    say("tick");
}

@on_trigger("claim_reward")
fn handle_claim() {
    say("Claimed!");
}
`
      const files = compile(source)
      const tickTag = files.find(f => f.path === 'data/minecraft/tags/function/tick.json')
      expect(tickTag).toBeDefined()
      const content = JSON.parse(tickTag!.content)
      expect(content.values).toContain('test:__trigger_check')
      expect(content.values).toContain('test:game_loop')
    })
  })

  describe('Entity tag methods', () => {
    it('compiles entity.tag()', () => {
      const source = 'fn test() { @s.tag("boss"); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('tag @s add boss')
    })

    it('compiles entity.untag()', () => {
      const source = 'fn test() { @s.untag("boss"); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('tag @s remove boss')
    })

    it('compiles entity.has_tag()', () => {
      const source = 'fn test() { let x: bool = @s.has_tag("boss"); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('if entity @s[tag=boss]')
    })
  })

  describe('Real program: zombie_game.rs', () => {
    const source = `
// A zombie survival game logic
// Kills nearby zombies and tracks score

@tick(rate=20)
fn check_zombies() {
    foreach (z in @e[type=zombie, distance=..10]) {
        kill(z);
    }
}

@tick(rate=100)
fn announce() {
    say("Zombie check complete");
}

fn reward_player() {
    give(@s, "minecraft:diamond", 1);
    title(@s, "Zombie Slayer!");
}

@on_trigger("claim_reward")
fn handle_claim() {
    reward_player();
}
`

    it('compiles without errors', () => {
      const files = compile(source, 'zombie')
      expect(files.length).toBeGreaterThan(0)
    })

    it('generates check_zombies with foreach loop', () => {
      const files = compile(source, 'zombie')
      // With tick rate, the foreach is in tick_body block
      const allContent = files
        .filter(f => f.path.includes('check_zombies'))
        .map(f => f.content)
        .join('\n')
      expect(allContent).toContain('execute as @e[type=zombie,distance=..10]')
    })

    it('generates foreach sub-function with kill @s', () => {
      const files = compile(source, 'zombie')
      const subFn = files.find(f => 
        f.path.includes('check_zombies/foreach_0')
      )
      expect(subFn).toBeDefined()
      expect(subFn?.content).toContain('kill @s')
    })

    it('generates announce function with say command', () => {
      const files = compile(source, 'zombie')
      const allContent = files
        .filter(f => f.path.includes('announce'))
        .map(f => f.content)
        .join('\n')
      expect(allContent).toContain('say Zombie check complete')
    })

    it('generates reward_player with give and title', () => {
      const files = compile(source, 'zombie')
      const fn = getFunction(files, 'reward_player')
      expect(fn).toContain('give @s minecraft:diamond 1')
      expect(fn).toContain('title @s title')
      expect(fn).toContain('Zombie Slayer!')
    })

    it('registers tick functions in tick tag', () => {
      const files = compile(source, 'zombie')
      const tickTag = files.find(f => f.path === 'data/minecraft/tags/function/tick.json')
      expect(tickTag).toBeDefined()
      const content = JSON.parse(tickTag!.content)
      expect(content.values).toContain('zombie:check_zombies')
      expect(content.values).toContain('zombie:announce')
    })

    it('generates trigger infrastructure for claim_reward', () => {
      const files = compile(source, 'zombie')
      
      // Check load.mcfunction has trigger objective
      const load = files.find(f => f.path.includes('load.mcfunction'))
      expect(load?.content).toContain('scoreboard objectives add claim_reward trigger')
      
      // Check dispatch function exists
      const dispatch = files.find(f => 
        f.path.includes('__trigger_claim_reward_dispatch')
      )
      expect(dispatch).toBeDefined()
      expect(dispatch?.content).toContain('function zombie:handle_claim')
      
      // Check trigger_check is registered
      const tickTag = files.find(f => f.path === 'data/minecraft/tags/function/tick.json')
      const content = JSON.parse(tickTag!.content)
      expect(content.values).toContain('zombie:__trigger_check')
    })

    it('generates function call from handle_claim to reward_player', () => {
      const files = compile(source, 'zombie')
      const fn = getFunction(files, 'handle_claim')
      expect(fn).toContain('function zombie:reward_player')
    })
  })

  describe('Test 11: Struct types backed by NBT storage', () => {
    const source = `
struct Point { x: int, y: int }

fn test_struct() {
    let p: Point = { x: 10, y: 20 };
    p.x = 30;
    let val = p.x;
}
`
    it('generates struct field initialization with NBT storage', () => {
      const files = compile(source, 'structs')
      const fn = getFunction(files, 'test_struct')
      expect(fn).toBeDefined()
      expect(fn).toContain('data modify storage rs:heap point_p.x set value 10')
      expect(fn).toContain('data modify storage rs:heap point_p.y set value 20')
    })

    it('generates struct field assignment', () => {
      const files = compile(source, 'structs')
      const fn = getFunction(files, 'test_struct')!
      expect(fn).toContain('data modify storage rs:heap point_p.x set value 30')
    })

    it('generates struct field read into scoreboard', () => {
      const files = compile(source, 'structs')
      const fn = getFunction(files, 'test_struct')!
      expect(fn).toContain('execute store result score')
      expect(fn).toContain('data get storage rs:heap point_p.x')
    })
  })

  describe('Test 12: Struct compound assignment', () => {
    const source = `
struct Counter { value: int }

fn test_compound() {
    let c: Counter = { value: 0 };
    c.value += 10;
    c.value -= 5;
}
`
    it('generates read-modify-write for compound assignment', () => {
      const files = compile(source, 'compound')
      const fn = getFunction(files, 'test_compound')
      expect(fn).toBeDefined()
      // Should read, add, write back
      expect(fn).toContain('data get storage rs:heap counter_c.value')
      expect(fn).toContain('+=')
    })
  })

  describe('Test 13: int[] array type', () => {
    const source = `
fn test_array() {
    let arr: int[] = [];
    arr.push(42);
    arr.push(100);
    let first = arr[0];
}
`
    it('initializes empty array in NBT storage', () => {
      const files = compile(source, 'arrays')
      const fn = getFunction(files, 'test_array')
      expect(fn).toBeDefined()
      expect(fn).toContain('data modify storage rs:heap arr set value []')
    })

    it('generates array push', () => {
      const files = compile(source, 'arrays')
      const fn = getFunction(files, 'test_array')!
      expect(fn).toContain('data modify storage rs:heap arr append value 42')
      expect(fn).toContain('data modify storage rs:heap arr append value 100')
    })

    it('generates array index access', () => {
      const files = compile(source, 'arrays')
      const fn = getFunction(files, 'test_array')!
      expect(fn).toContain('data get storage rs:heap arr[0]')
    })
  })

  describe('Test 14: Array with initial values', () => {
    const source = `
fn test_init_array() {
    let nums: int[] = [1, 2, 3];
}
`
    it('initializes array with values', () => {
      const files = compile(source, 'initarr')
      const fn = getFunction(files, 'test_init_array')
      expect(fn).toBeDefined()
      expect(fn).toContain('data modify storage rs:heap nums set value []')
      expect(fn).toContain('data modify storage rs:heap nums append value 1')
      expect(fn).toContain('data modify storage rs:heap nums append value 2')
      expect(fn).toContain('data modify storage rs:heap nums append value 3')
    })
  })

  describe('Test 15: World objects (armor stands)', () => {
    const source = `
fn test_spawn() {
    let turret = spawn_object(10, 64, 20);
    turret.health = 100;
}
`
    it('generates summon command for world object', () => {
      const files = compile(source, 'world')
      const fn = getFunction(files, 'test_spawn')
      expect(fn).toBeDefined()
      expect(fn).toContain('summon minecraft:armor_stand 10 64 20')
      expect(fn).toContain('Invisible:1b')
      expect(fn).toContain('Marker:1b')
      expect(fn).toContain('NoGravity:1b')
      expect(fn).toContain('Tags:["__rs_obj_')
    })

    it('generates scoreboard set for world object field', () => {
      const files = compile(source, 'world')
      const fn = getFunction(files, 'test_spawn')!
      expect(fn).toContain('scoreboard players set @e[tag=__rs_obj_')
      expect(fn).toContain('rs 100')
    })
  })

  describe('Test 16: World object compound operations', () => {
    const source = `
fn test_damage() {
    let obj = spawn_object(0, 64, 0);
    obj.health = 100;
    obj.health -= 10;
}
`
    it('generates compound assignment on world object', () => {
      const files = compile(source, 'damage')
      const fn = getFunction(files, 'test_damage')
      expect(fn).toBeDefined()
      // Should have -= operation
      expect(fn).toContain('scoreboard players operation @e[tag=__rs_obj_')
      expect(fn).toContain('-=')
    })
  })

  describe('Test 17: Kill world object', () => {
    const source = `
fn test_kill() {
    let obj = spawn_object(0, 64, 0);
    kill(obj);
}
`
    it('generates kill command for world object', () => {
      const files = compile(source, 'killobj')
      const fn = getFunction(files, 'test_kill')
      expect(fn).toBeDefined()
      expect(fn).toContain('kill @e[tag=__rs_obj_')
    })
  })
})
