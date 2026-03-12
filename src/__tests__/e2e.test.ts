/**
 * End-to-End Tests
 *
 * Tests the complete pipeline: Source → Lexer → Parser → Lowering → Optimizer → CodeGen
 */

import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { Lowering } from '../lowering'
import { TypeChecker } from '../typechecker'
import { optimize } from '../optimizer/passes'
import { generateDatapack, generateDatapackWithStats, DatapackFile } from '../codegen/mcfunction'
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
  // Check if the function is called from __tick.mcfunction
  const tickFn = files.find(f => f.path.includes('__tick.mcfunction'))
  if (!tickFn) return false
  return tickFn.content.includes(`function ${namespace}:${fnName}`)
}

function typeCheck(source: string) {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens, source).parse('test')
  return new TypeChecker(source).check(ast)
}

import { generateCommandBlocks } from '../codegen/cmdblock'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Command Block Target', () => {
  it('generates cmdblock structure with load block', () => {
    const result = generateCommandBlocks('mypack', false, true)
    
    expect(result.format).toBe('redscript-cmdblock-v1')
    expect(result.namespace).toBe('mypack')
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].type).toBe('impulse')
    expect(result.blocks[0].command).toBe('function mypack:__load')
    expect(result.blocks[0].auto).toBe(true)
  })

  it('generates cmdblock structure with tick block', () => {
    const result = generateCommandBlocks('mypack', true, false)
    
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].type).toBe('repeat')
    expect(result.blocks[0].command).toBe('function mypack:__tick')
  })

  it('generates cmdblock structure with both blocks', () => {
    const result = generateCommandBlocks('game', true, true)
    
    expect(result.namespace).toBe('game')
    expect(result.blocks).toHaveLength(2)
    
    // Load block first
    expect(result.blocks[0].type).toBe('impulse')
    expect(result.blocks[0].command).toBe('function game:__load')
    expect(result.blocks[0].pos).toEqual([0, 0, 0])
    expect(result.blocks[0].auto).toBe(true)
    
    // Tick block second
    expect(result.blocks[1].type).toBe('repeat')
    expect(result.blocks[1].command).toBe('function game:__tick')
    expect(result.blocks[1].pos).toEqual([1, 0, 0])
  })

  it('generates empty blocks when no tick or load', () => {
    const result = generateCommandBlocks('empty', false, false)
    
    expect(result.blocks).toHaveLength(0)
  })

  it('produces valid JSON structure', () => {
    const result = generateCommandBlocks('test', true, true)
    const json = JSON.stringify(result)
    const parsed = JSON.parse(json)
    
    expect(parsed.format).toBe('redscript-cmdblock-v1')
    expect(Array.isArray(parsed.blocks)).toBe(true)
  })
})

describe('E2E: Complete Pipeline', () => {
  describe('const declarations', () => {
    it('inlines consts in expressions and string interpolation', () => {
      const files = compile(`
const MAX_HP: int = 100
const GAME_NAME: string = "Arena Battle"

fn main() {
    let hp: int = MAX_HP + 5;
    announce("\${GAME_NAME}: \${hp}");
}
`)
      const mainFn = getFunction(files, 'main')
      expect(mainFn).toBeDefined()
      expect(mainFn).toContain('scoreboard players set $hp rs 105')
      expect(mainFn).toContain('Arena Battle')
    })
  })

  describe('string stdlib helpers', () => {
    it('lowers str_len for literal-backed string variables', () => {
      const files = compile(`
fn main() {
    let name: string = "Player";
    let n: int = str_len(name);
    tell(@s, "\${n}");
}
`)
      const mainFn = getFunction(files, 'main')
      expect(mainFn).toBeDefined()
      expect(mainFn).toContain('data modify storage rs:strings name set value "Player"')
      expect(mainFn).toContain('run data get storage rs:strings name')
      expect(mainFn).toContain('"objective":"rs"')
    })
  })

  describe('advancement event decorators', () => {
    it('generates advancement json with reward function path', () => {
      const source = `
@on_advancement("story/mine_diamond")
fn on_mine_diamond() {
    title(@s, "Diamond");
}
`
      const tokens = new Lexer(source).tokenize()
      const ast = new Parser(tokens).parse('test')
      const ir = new Lowering('test').lower(ast)
      const optimized: IRModule = {
        ...ir,
        functions: ir.functions.map(fn => optimize(fn)),
      }
      const generated = generateDatapackWithStats(optimized)
      const advancement = generated.advancements.find(f => f.path === 'data/test/advancements/on_advancement_on_mine_diamond.json')
      expect(advancement).toBeDefined()
      const content = JSON.parse(advancement!.content)
      expect(content.criteria.trigger.trigger).toBe('minecraft:story/mine_diamond')
      expect(content.rewards.function).toBe('test:on_mine_diamond')
    })
  })

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

  describe('Builtins: command emission', () => {
    it('compiles UI and broadcast builtins', () => {
      const source = `
fn test() {
    actionbar(@a, "Fight!");
    subtitle(@a, "Wave 2");
    title_times(@a, 10, 60, 10);
    announce("Arena live");
}
`
      const fn = getFunction(compile(source), 'test')!
      expect(fn).toContain('title @a actionbar {"text":"Fight!"}')
      expect(fn).toContain('title @a subtitle {"text":"Wave 2"}')
      expect(fn).toContain('title @a times 10 60 10')
      expect(fn).toContain('tellraw @a {"text":"Arena live"}')
    })

    it('compiles world and utility builtins', () => {
      const source = `
fn test() {
    tp(@s, (~1, ~0, ~-1));
    tp(@s, @p);
    tp(@a, (1, 64, 1));
    clear(@s);
    weather("clear");
    time_set("noon");
    gamerule("doWeatherCycle", "false");
    setblock((0, 64, 0), "stone");
    fill((0, 64, 0), (2, 66, 2), "glass");
    clone((0, 64, 0), (2, 66, 2), (10, 64, 10));
    xp_add(@s, 5);
    xp_set(@s, 1, "levels");
}
`
      const fn = getFunction(compile(source), 'test')!
      expect(fn).toContain('tp @s ~1 ~ ~-1')
      expect(fn).toContain('tp @s @p')
      expect(fn).toContain('tp @a 1 64 1')
      expect(fn).toContain('clear @s')
      expect(fn).toContain('weather clear')
      expect(fn).toContain('time set noon')
      expect(fn).toContain('gamerule doWeatherCycle false')
      expect(fn).toContain('setblock 0 64 0 stone')
      expect(fn).toContain('fill 0 64 0 2 66 2 glass')
      expect(fn).toContain('clone 0 64 0 2 66 2 10 64 10')
      expect(fn).toContain('xp add @s 5 points')
      expect(fn).toContain('xp set @s 1 levels')
    })

    it('compiles scoreboard display and objective builtins', () => {
      const source = `
fn test() {
    scoreboard_display("sidebar", "kills");
    scoreboard_display("list", "coins");
    scoreboard_display("belowName", "hp");
    scoreboard_hide("sidebar");
    scoreboard_add_objective("kills", "playerKillCount", "Kill Count");
    scoreboard_remove_objective("kills");
}
`
      const fn = getFunction(compile(source), 'test')!
      expect(fn).toContain('scoreboard objectives setdisplay sidebar kills')
      expect(fn).toContain('scoreboard objectives setdisplay list coins')
      expect(fn).toContain('scoreboard objectives setdisplay belowName hp')
      expect(fn).toContain('scoreboard objectives setdisplay sidebar')
      expect(fn).toContain('scoreboard objectives add kills playerKillCount "Kill Count"')
      expect(fn).toContain('scoreboard objectives remove kills')
    })

    it('compiles bossbar builtins', () => {
      const source = `
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
`
      const fn = getFunction(compile(source), 'test')!
      expect(fn).toContain('bossbar add ns:health {"text":"Boss Health"}')
      expect(fn).toContain('bossbar set ns:health value 50')
      expect(fn).toContain('bossbar set ns:health max 100')
      expect(fn).toContain('bossbar set ns:health color red')
      expect(fn).toContain('bossbar set ns:health style notched_10')
      expect(fn).toContain('bossbar set ns:health visible true')
      expect(fn).toContain('bossbar set ns:health players @a')
      expect(fn).toContain('bossbar remove ns:health')
      expect(fn).toMatch(/execute store result score \$t\d+ rs run bossbar get ns:health value/)
    })

    it('compiles team builtins', () => {
      const source = `
fn test() {
    team_add("red", "Red Team");
    team_remove("red");
    team_join("red", @a[tag=red_team]);
    team_leave(@s);
    team_option("red", "friendlyFire", "false");
    team_option("red", "color", "red");
    team_option("red", "prefix", "[Red] ");
}
`
      const fn = getFunction(compile(source), 'test')!
      expect(fn).toContain('team add red {"text":"Red Team"}')
      expect(fn).toContain('team remove red')
      expect(fn).toContain('team join red @a[tag=red_team]')
      expect(fn).toContain('team leave @s')
      expect(fn).toContain('team modify red friendlyFire false')
      expect(fn).toContain('team modify red color red')
      expect(fn).toContain('team modify red prefix {"text":"[Red] "}')
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
      expect(fn).toContain('execute as @e[type=minecraft:zombie,distance=..10]')
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

  describe('Test 6: arrays', () => {
    const source = `
fn arrays() {
    let arr: int[] = [1, 2, 3];
    let first: int = arr[0];
    let i: int = 1;
    let second: int = arr[i];
    let len: int = arr.len;
    arr.push(4);
    let last: int = arr.pop();
    foreach (x in arr) {
        say("loop");
    }
}
`

    it('generates array storage commands', () => {
      const files = compile(source)
      const fn = getFunction(files, 'arrays')
      expect(fn).toBeDefined()
      expect(fn).toContain('data modify storage rs:heap arr set value []')
      expect(fn).toContain('data modify storage rs:heap arr append value 1')
      expect(fn).toContain('data modify storage rs:heap arr append value 4')
      expect(fn).toContain('data remove storage rs:heap arr[-1]')
    })

    it('generates array access helpers', () => {
      const files = compile(source)
      const fn = getFunction(files, 'arrays')!
      expect(fn).toContain('run data get storage rs:heap arr[0]')
      expect(fn).toContain('with storage rs:heap')
      const helper = files.find(f => f.path.includes('array_get_'))
      expect(helper?.content).toContain('arr[$(')
    })

    it('generates array foreach loop', () => {
      const files = compile(source)
      const allContent = files
        .filter(f => f.path.includes('/arrays'))
        .map(f => f.content)
        .join('\n')
      expect(allContent).toContain('foreach_array_check')
      expect(allContent).toContain('say loop')
    })
  })

  describe('Datapack structure', () => {
    it('generates pack.mcmeta with proper format and description', () => {
      const files = compile('fn test() {}')
      const meta = files.find(f => f.path === 'pack.mcmeta')
      expect(meta).toBeDefined()
      const content = JSON.parse(meta!.content)
      expect(content.pack.pack_format).toBe(26)
      expect(content.pack.description).toBe('test datapack — compiled by redscript')
    })

    it('generates __load.mcfunction with scoreboard setup', () => {
      const files = compile('fn test() {}')
      const load = files.find(f => f.path.includes('__load.mcfunction'))
      expect(load).toBeDefined()
      expect(load!.content).toContain('# RedScript runtime init')
      expect(load!.content).toContain('scoreboard objectives add rs dummy')
    })

    it('generates minecraft:load tag pointing to __load', () => {
      const files = compile('fn test() {}')
      const tag = files.find(f => f.path === 'data/minecraft/tags/function/load.json')
      expect(tag).toBeDefined()
      const content = JSON.parse(tag!.content)
      expect(content.values).toContain('test:__load')
    })

    it('generates __tick.mcfunction for tick functions', () => {
      const source = '@tick fn tick_fn() { say("tick"); }'
      const files = compile(source)
      const tickFn = files.find(f => f.path.includes('__tick.mcfunction'))
      expect(tickFn).toBeDefined()
      expect(tickFn!.content).toContain('# RedScript tick dispatcher')
      expect(tickFn!.content).toContain('function test:tick_fn')
    })

    it('generates minecraft:tick tag pointing to __tick', () => {
      const source = '@tick fn tick_fn() { say("tick"); }'
      const files = compile(source)
      const tag = files.find(f => f.path === 'data/minecraft/tags/function/tick.json')
      expect(tag).toBeDefined()
      const content = JSON.parse(tag!.content)
      expect(content.values).toContain('test:__tick')
    })

    it('does not generate tick infrastructure when no tick functions', () => {
      const files = compile('fn test() {}')
      const tickFn = files.find(f => f.path.includes('__tick.mcfunction'))
      const tickTag = files.find(f => f.path.includes('tick.json'))
      expect(tickFn).toBeUndefined()
      expect(tickTag).toBeUndefined()
    })
  })

  describe('Scoreboard interop', () => {
    it('compiles scoreboard_get to read vanilla scores', () => {
      const source = `
fn test() -> int {
    let kills: int = scoreboard_get("PlayerName", "kill_count");
    return kills;
}
`
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toBeDefined()
      expect(fn).toContain('execute store result score')
      expect(fn).toContain('scoreboard players get PlayerName kill_count')
    })

    it('compiles scoreboard_get with @s selector', () => {
      const source = `
fn test() -> int {
    let my_kills: int = scoreboard_get("@s", "kill_count");
    return my_kills;
}
`
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toBeDefined()
      expect(fn).toContain('scoreboard players get @s kill_count')
    })

    it('compiles scoreboard_set with constant value', () => {
      const source = `
fn test() {
    scoreboard_set("PlayerName", "kill_count", 100);
}
`
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toBeDefined()
      expect(fn).toContain('scoreboard players set PlayerName kill_count 100')
    })

    it('compiles scoreboard_set with variable value', () => {
      const source = `
fn test() {
    let value: int = 42;
    scoreboard_set("@s", "score", value);
}
`
      const files = compile(source)
      const allContent = files
        .filter(f => f.path.includes('test'))
        .map(f => f.content)
        .join('\n')
      expect(allContent).toContain('execute store result score @s score')
    })

    it('compiles score() as expression', () => {
      const source = `
fn test() -> int {
    let level: int = score("@s", "minecraft.custom:minecraft.play_one_minute");
    return level;
}
`
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toBeDefined()
      expect(fn).toContain('scoreboard players get @s minecraft.custom:minecraft.play_one_minute')
    })

    it('uses scoreboard values in expressions', () => {
      const source = `
fn double_score() -> int {
    let s: int = scoreboard_get("@s", "points");
    let doubled: int = s * 2;
    scoreboard_set("@s", "points", doubled);
    return doubled;
}
`
      const files = compile(source)
      const fn = getFunction(files, 'double_score')
      expect(fn).toBeDefined()
      expect(fn).toContain('scoreboard players get @s points')
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
      const source = 'fn test() { tp(@s, (0, 100, 0)); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('tp @s 0 100 0')
    })

    it('type checks tp selector destinations', () => {
      const invalid = typeCheck('fn test() { tp(@s, @a); }')
      expect(invalid.map(err => err.message)).toContain(
        'tp destination must be a single-entity selector (@s, @p, @r, or limit=1)'
      )

      expect(typeCheck('fn test() { tp(@s, @p); }')).toHaveLength(0)
      expect(typeCheck('fn test() { tp(@s, @e[limit=1, tag=target]); }')).toHaveLength(0)
    })

    it('compiles random()', () => {
      const source = 'fn test() { let x: int = random(1, 10); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('scoreboard players random $t0 rs 1 10')
    })

    it('compiles random_native()', () => {
      const source = 'fn test() { let x: int = random_native(1, 6); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('execute store result score $t0 rs run random value 1 6')
    })

    it('compiles random_native() with zero min', () => {
      const source = 'fn test() { let x: int = random_native(0, 100); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('execute store result score $t0 rs run random value 0 100')
    })

    it('compiles random_sequence()', () => {
      const source = 'fn test() { random_sequence("loot"); random_sequence("loot", 9); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('random reset loot 0')
      expect(fn).toContain('random reset loot 9')
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
      expect(fn).toContain('kill @e[type=minecraft:creeper]')
    })

    it('handles selectors with multiple filters', () => {
      const source = 'fn test() { kill(@e[type=zombie, distance=..5, limit=1]); }'
      const files = compile(source)
      const fn = getFunction(files, 'test')
      expect(fn).toContain('type=minecraft:zombie')
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

  describe('For loop', () => {
    it('compiles basic for loop', () => {
      const source = `
fn count() {
    for (let i: int = 0; i < 10; i = i + 1) {
        say("loop");
    }
}
`
      const files = compile(source)
      const allContent = files
        .filter(f => f.path.includes('count'))
        .map(f => f.content)
        .join('\n')
      
      // Should have initialization (set to 0)
      expect(allContent).toContain('0')
      // Should have say command
      expect(allContent).toContain('say loop')
      // Should have comparison
      expect(allContent).toContain('$const_10')
      // Should have loop structure
      expect(allContent).toContain('for_check')
    })

    it('compiles for loop without init', () => {
      const source = `
fn count() {
    let i: int = 5;
    for (; i > 0; i = i - 1) {
        say("counting");
    }
}
`
      const files = compile(source)
      const allContent = files
        .filter(f => f.path.includes('count'))
        .map(f => f.content)
        .join('\n')
      
      expect(allContent).toContain('say counting')
      expect(allContent).toContain('for_check')
    })

    it('compiles for loop with compound step', () => {
      const source = `
fn double() {
    for (let x: int = 1; x < 100; x = x * 2) {
        say("doubling");
    }
}
`
      const files = compile(source)
      const fn = getFunction(files, 'double')
      expect(fn).toBeDefined()
    })

    it('generates correct control flow blocks', () => {
      const source = `
fn loop_test() {
    for (let i: int = 0; i < 5; i = i + 1) {
        say("iteration");
    }
}
`
      const files = compile(source)
      
      // Should have for_check block
      const checkBlock = files.find(f => f.path.includes('for_check'))
      expect(checkBlock).toBeDefined()
      
      // Should have for_body block
      const bodyBlock = files.find(f => f.path.includes('for_body'))
      expect(bodyBlock).toBeDefined()
    })

    it('compiles nested for loops', () => {
      const source = `
fn nested() {
    for (let i: int = 0; i < 3; i = i + 1) {
        for (let j: int = 0; j < 3; j = j + 1) {
            say("nested");
        }
    }
}
`
      const files = compile(source)
      const allContent = files
        .filter(f => f.path.includes('nested'))
        .map(f => f.content)
        .join('\n')
      expect(allContent).toContain('say nested')
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

  describe('Float type (fixed-point)', () => {
    it('stores float as fixed-point × 1000', () => {
      const source = `
fn test() -> int {
    let pi: float = 3.14;
    return pi;
}
`
      const files = compile(source)
      const allContent = files.map(f => f.content).join('\n')
      // 3.14 * 1000 = 3140
      expect(allContent).toContain('3140')
    })

    it('handles float addition correctly', () => {
      const source = `
fn test() -> int {
    let a: float = 1.5;
    let b: float = 2.5;
    let c: float = a + b;
    return c;
}
`
      const files = compile(source)
      const allContent = files.map(f => f.content).join('\n')
      // 1.5 * 1000 = 1500, 2.5 * 1000 = 2500
      expect(allContent).toContain('1500')
      expect(allContent).toContain('2500')
      // Addition should use +=
      expect(allContent).toContain('+=')
    })

    it('handles float multiplication with scaling', () => {
      const source = `
fn test() {
    let a: float = 2.0;
    let b: float = 3.0;
    let c: float = a * b;
}
`
      const files = compile(source)
      const allContent = files.map(f => f.content).join('\n')
      // Should have 2000 and 3000 (the fixed-point values)
      expect(allContent).toContain('2000')
      expect(allContent).toContain('3000')
      // Should divide after multiplication (for fixed-point correction)
      expect(allContent).toContain('/=')
    })

    it('handles float division with scaling', () => {
      const source = `
fn test() {
    let a: float = 10.0;
    let b: float = 2.0;
    let c: float = a / b;
}
`
      const files = compile(source)
      const allContent = files.map(f => f.content).join('\n')
      // Should multiply by 1000 before division
      expect(allContent).toContain('*=')
      // Should then divide
      expect(allContent).toContain('/=')
    })

    it('handles small float literals', () => {
      const source = `
fn test() -> int {
    let x: float = 0.001;
    let y: float = 0.5;
    let z: float = x + y;
    return 0;
}
`
      const files = compile(source)
      const allContent = files.map(f => f.content).join('\n')
      // 0.001 * 1000 = 1, 0.5 * 1000 = 500
      // Check that fixed-point values are present
      expect(allContent).toContain('$const_1')
      expect(allContent).toContain('500')
    })

    it('handles float in expressions', () => {
      const source = `
fn calc() {
    let speed: float = 1.5;
    let time: float = 2.0;
    let distance: float = speed * time;
}
`
      const files = compile(source)
      const fn = getFunction(files, 'calc')
      expect(fn).toBeDefined()
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
    it('generates trigger objective in __load.mcfunction', () => {
      const source = `
@on_trigger("claim_reward")
fn handle_claim() {
    say("Claimed!");
}
`
      const files = compile(source)
      const load = files.find(f => f.path.includes('__load.mcfunction'))
      expect(load?.content).toContain('scoreboard objectives add claim_reward trigger')
      expect(load?.content).toContain('scoreboard players enable @a claim_reward')
    })

    it('generates trigger check in __tick function', () => {
      const source = `
@on_trigger("claim_reward")
fn handle_claim() {
    say("Claimed!");
}
`
      const files = compile(source)
      // Trigger checks are now in __tick.mcfunction
      const tickFn = files.find(f => f.path.includes('__tick.mcfunction'))
      expect(tickFn).toBeDefined()
      expect(tickFn?.content).toContain('execute as @a[scores={claim_reward=1..}]')
      expect(tickFn?.content).toContain('run function test:__trigger_claim_reward_dispatch')
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

    it('registers __tick in tick tag when triggers exist', () => {
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
      // All tick functionality is routed through __tick
      expect(content.values).toContain('test:__tick')
    })

    it('combines tick functions and trigger check in __tick', () => {
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
      // tick.json points to __tick
      const tickTag = files.find(f => f.path === 'data/minecraft/tags/function/tick.json')
      expect(tickTag).toBeDefined()
      const content = JSON.parse(tickTag!.content)
      expect(content.values).toContain('test:__tick')
      
      // __tick.mcfunction calls both tick functions and trigger checks
      const tickFn = files.find(f => f.path.includes('__tick.mcfunction'))
      expect(tickFn).toBeDefined()
      expect(tickFn?.content).toContain('function test:game_loop')
      expect(tickFn?.content).toContain('execute as @a[scores={claim_reward=1..}]')
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
      expect(allContent).toContain('execute as @e[type=minecraft:zombie,distance=..10]')
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

    it('registers __tick in tick tag and calls tick functions', () => {
      const files = compile(source, 'zombie')
      const tickTag = files.find(f => f.path === 'data/minecraft/tags/function/tick.json')
      expect(tickTag).toBeDefined()
      const content = JSON.parse(tickTag!.content)
      expect(content.values).toContain('zombie:__tick')
      
      // __tick should call both tick functions
      const tickFn = files.find(f => f.path.includes('__tick.mcfunction'))
      expect(tickFn).toBeDefined()
      expect(tickFn?.content).toContain('function zombie:check_zombies')
      expect(tickFn?.content).toContain('function zombie:announce')
    })

    it('generates trigger infrastructure for claim_reward', () => {
      const files = compile(source, 'zombie')
      
      // Check __load.mcfunction has trigger objective
      const load = files.find(f => f.path.includes('__load.mcfunction'))
      expect(load?.content).toContain('scoreboard objectives add claim_reward trigger')
      
      // Check dispatch function exists
      const dispatch = files.find(f => 
        f.path.includes('__trigger_claim_reward_dispatch')
      )
      expect(dispatch).toBeDefined()
      expect(dispatch?.content).toContain('function zombie:handle_claim')
      
      // Check trigger_check is in __tick.mcfunction
      const tickFn = files.find(f => f.path.includes('__tick.mcfunction'))
      expect(tickFn).toBeDefined()
      expect(tickFn?.content).toContain('execute as @a[scores={claim_reward=1..}]')
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
