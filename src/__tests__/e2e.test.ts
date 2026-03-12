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
})
