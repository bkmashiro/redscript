import {
  isSubtype,
  areCompatibleTypes,
  getConcreteSubtypes,
  getSelectorEntityType,
  getBaseSelectorType,
} from '../types/entity-hierarchy'
import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { Lowering } from '../lowering'
import type { IRModule } from '../ir/types'

function compileWithWarnings(source: string, namespace = 'test'): { ir: IRModule; warnings: Lowering['warnings'] } {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse(namespace)
  const lowering = new Lowering(namespace)
  return { ir: lowering.lower(ast), warnings: lowering.warnings }
}

// ---------------------------------------------------------------------------
// Entity hierarchy utilities
// ---------------------------------------------------------------------------

describe('Entity type hierarchy', () => {
  test('isSubtype: Zombie is a subtype of Mob', () => {
    expect(isSubtype('Zombie', 'Mob')).toBe(true)
  })

  test('isSubtype: Player is NOT a subtype of Mob', () => {
    expect(isSubtype('Player', 'Mob')).toBe(false)
  })

  test('isSubtype: Zombie is a subtype of Entity (transitive)', () => {
    expect(isSubtype('Zombie', 'Entity')).toBe(true)
  })

  test('isSubtype: identity — Zombie is subtype of Zombie', () => {
    expect(isSubtype('Zombie', 'Zombie')).toBe(true)
  })

  test('areCompatibleTypes: Player and Zombie are NOT compatible', () => {
    expect(areCompatibleTypes('Player', 'Zombie')).toBe(false)
  })

  test('areCompatibleTypes: Zombie and Mob are compatible', () => {
    expect(areCompatibleTypes('Zombie', 'Mob')).toBe(true)
  })

  test('areCompatibleTypes: Mob and Zombie are compatible (reverse)', () => {
    expect(areCompatibleTypes('Mob', 'Zombie')).toBe(true)
  })

  test('getConcreteSubtypes: HostileMob includes Zombie, Skeleton, Creeper', () => {
    const subtypes = getConcreteSubtypes('HostileMob')
    const names = subtypes.map(n => n.name)
    expect(names).toContain('Zombie')
    expect(names).toContain('Skeleton')
    expect(names).toContain('Creeper')
    expect(names).toContain('Blaze')
    expect(names).toContain('CaveSpider')
    // Should NOT include passive mobs
    expect(names).not.toContain('Pig')
    expect(names).not.toContain('Player')
  })

  test('getConcreteSubtypes: PassiveMob includes Pig, Cow, Villager', () => {
    const subtypes = getConcreteSubtypes('PassiveMob')
    const names = subtypes.map(n => n.name)
    expect(names).toContain('Pig')
    expect(names).toContain('Cow')
    expect(names).toContain('Villager')
    expect(names).toContain('WanderingTrader')
    expect(names).not.toContain('Zombie')
  })

  test('getSelectorEntityType: parses type=zombie', () => {
    expect(getSelectorEntityType('@e[type=zombie]')).toBe('Zombie')
  })

  test('getSelectorEntityType: parses type=minecraft:skeleton', () => {
    expect(getSelectorEntityType('@e[type=minecraft:skeleton]')).toBe('Skeleton')
  })

  test('getBaseSelectorType: @a → Player', () => {
    expect(getBaseSelectorType('@a')).toBe('Player')
  })

  test('getBaseSelectorType: @e → Entity', () => {
    expect(getBaseSelectorType('@e')).toBe('Entity')
  })

  test('getBaseSelectorType: @e[type=zombie] → Zombie', () => {
    expect(getBaseSelectorType('@e[type=zombie]')).toBe('Zombie')
  })

  test('getBaseSelectorType: @s → null', () => {
    expect(getBaseSelectorType('@s')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// W_IMPOSSIBLE_AS warning
// ---------------------------------------------------------------------------

describe('W_IMPOSSIBLE_AS warning', () => {
  test('foreach @a with as @e[type=zombie] produces warning', () => {
    const source = `
      fn main() {
        foreach (p in @a) {
          as @e[type=minecraft:zombie] {
            kill(@s);
          }
        }
      }
    `
    const { warnings } = compileWithWarnings(source)
    const impossible = warnings.filter(w => w.code === 'W_IMPOSSIBLE_AS')
    expect(impossible.length).toBe(1)
    expect(impossible[0].message).toContain('Player')
    expect(impossible[0].message).toContain('Zombie')
  })

  test('foreach @e[type=zombie] with as @e[type=zombie] produces NO warning', () => {
    const source = `
      fn main() {
        foreach (z in @e[type=minecraft:zombie]) {
          as @e[type=minecraft:zombie] {
            kill(@s);
          }
        }
      }
    `
    const { warnings } = compileWithWarnings(source)
    const impossible = warnings.filter(w => w.code === 'W_IMPOSSIBLE_AS')
    expect(impossible.length).toBe(0)
  })

  test('foreach @e (generic) with as @e[type=zombie] produces NO warning', () => {
    const source = `
      fn main() {
        foreach (e in @e) {
          as @e[type=minecraft:zombie] {
            kill(@s);
          }
        }
      }
    `
    const { warnings } = compileWithWarnings(source)
    const impossible = warnings.filter(w => w.code === 'W_IMPOSSIBLE_AS')
    expect(impossible.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// is_check with abstract types
// ---------------------------------------------------------------------------

describe('is_check compilation', () => {
  test('concrete is_check emits single execute if entity', () => {
    const source = `
      fn main() {
        foreach (e in @e) {
          if (e is Zombie) {
            kill(@s);
          }
        }
      }
    `
    const { ir } = compileWithWarnings(source)
    const thenFn = ir.functions.find(f => f.name.includes('then_'))
    expect(thenFn).toBeDefined()

    // The parent foreach function should contain the execute if entity command
    const foreachFn = ir.functions.find(f => f.name.includes('foreach_'))
    expect(foreachFn).toBeDefined()
    const rawCmds = foreachFn!.blocks.flatMap(b => b.instrs)
      .filter((i): i is any => i.op === 'raw')
      .map(i => i.cmd)
    expect(rawCmds.some(c => c.includes('type=minecraft:zombie'))).toBe(true)
  })

  test('abstract is_check (HostileMob) emits multiple type checks', () => {
    const source = `
      fn main() {
        foreach (e in @e) {
          if (e is HostileMob) {
            kill(@s);
          }
        }
      }
    `
    const { ir } = compileWithWarnings(source)
    const foreachFn = ir.functions.find(f => f.name.includes('foreach_'))
    expect(foreachFn).toBeDefined()
    const rawCmds = foreachFn!.blocks.flatMap(b => b.instrs)
      .filter((i): i is any => i.op === 'raw')
      .map(i => i.cmd)

    // Should have scoreboard setup and multiple type checks
    expect(rawCmds.some(c => c.includes('scoreboard players set __is_result rs:temp 0'))).toBe(true)
    expect(rawCmds.some(c => c.includes('type=minecraft:zombie'))).toBe(true)
    expect(rawCmds.some(c => c.includes('type=minecraft:skeleton'))).toBe(true)
    expect(rawCmds.some(c => c.includes('type=minecraft:creeper'))).toBe(true)
    expect(rawCmds.some(c => c.includes('if score __is_result rs:temp matches 1'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// selector<T> type annotation
// ---------------------------------------------------------------------------

describe('selector<T> type annotation', () => {
  test('parses selector<Player> type', () => {
    const source = `
      fn greet(target: selector<Player>) {
        say("hello");
      }
    `
    const tokens = new Lexer(source).tokenize()
    const ast = new Parser(tokens).parse('test')
    const fn = ast.declarations[0]
    expect(fn.params[0].type).toEqual({ kind: 'selector', entityType: 'Player' })
  })

  test('parses plain selector type', () => {
    const source = `
      fn greet(target: selector) {
        say("hello");
      }
    `
    const tokens = new Lexer(source).tokenize()
    const ast = new Parser(tokens).parse('test')
    const fn = ast.declarations[0]
    expect(fn.params[0].type).toEqual({ kind: 'selector' })
  })
})
