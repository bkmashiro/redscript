/**
 * MCRuntime Tests - Minecraft Command Runtime Simulator
 */

import { MCRuntime, parseRange, matchesRange } from '../runtime'

describe('Range Parsing', () => {
  it('parses exact value', () => {
    const range = parseRange('5')
    expect(range).toEqual({ min: 5, max: 5 })
    expect(matchesRange(5, range)).toBe(true)
    expect(matchesRange(4, range)).toBe(false)
  })

  it('parses min..max range', () => {
    const range = parseRange('1..10')
    expect(matchesRange(1, range)).toBe(true)
    expect(matchesRange(10, range)).toBe(true)
    expect(matchesRange(0, range)).toBe(false)
    expect(matchesRange(11, range)).toBe(false)
  })

  it('parses ..max range', () => {
    const range = parseRange('..5')
    expect(matchesRange(-100, range)).toBe(true)
    expect(matchesRange(5, range)).toBe(true)
    expect(matchesRange(6, range)).toBe(false)
  })

  it('parses min.. range', () => {
    const range = parseRange('1..')
    expect(matchesRange(1, range)).toBe(true)
    expect(matchesRange(100, range)).toBe(true)
    expect(matchesRange(0, range)).toBe(false)
  })
})

describe('Scoreboard Commands', () => {
  it('executes set and get', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('scoreboard players set $x rs 42')
    expect(rt.getScore('$x', 'rs')).toBe(42)
  })

  it('executes add', () => {
    const rt = new MCRuntime('test')
    rt.setScore('$x', 'rs', 10)
    rt.execCommand('scoreboard players add $x rs 5')
    expect(rt.getScore('$x', 'rs')).toBe(15)
  })

  it('executes remove', () => {
    const rt = new MCRuntime('test')
    rt.setScore('$x', 'rs', 10)
    rt.execCommand('scoreboard players remove $x rs 3')
    expect(rt.getScore('$x', 'rs')).toBe(7)
  })

  it('executes operation +=', () => {
    const rt = new MCRuntime('test')
    rt.setScore('$x', 'rs', 10)
    rt.setScore('$y', 'rs', 5)
    rt.execCommand('scoreboard players operation $x rs += $y rs')
    expect(rt.getScore('$x', 'rs')).toBe(15)
  })

  it('executes operation -=', () => {
    const rt = new MCRuntime('test')
    rt.setScore('$x', 'rs', 10)
    rt.setScore('$y', 'rs', 3)
    rt.execCommand('scoreboard players operation $x rs -= $y rs')
    expect(rt.getScore('$x', 'rs')).toBe(7)
  })

  it('executes operation *=', () => {
    const rt = new MCRuntime('test')
    rt.setScore('$x', 'rs', 6)
    rt.setScore('$y', 'rs', 7)
    rt.execCommand('scoreboard players operation $x rs *= $y rs')
    expect(rt.getScore('$x', 'rs')).toBe(42)
  })

  it('executes operation /= with truncation', () => {
    const rt = new MCRuntime('test')
    rt.setScore('$x', 'rs', 10)
    rt.setScore('$y', 'rs', 3)
    rt.execCommand('scoreboard players operation $x rs /= $y rs')
    expect(rt.getScore('$x', 'rs')).toBe(3)
  })

  it('executes operation %= with Java semantics', () => {
    const rt = new MCRuntime('test')
    rt.setScore('$x', 'rs', -10)
    rt.setScore('$y', 'rs', 3)
    rt.execCommand('scoreboard players operation $x rs %= $y rs')
    expect(rt.getScore('$x', 'rs')).toBe(-1)
  })

  it('executes operation = (assign)', () => {
    const rt = new MCRuntime('test')
    rt.setScore('$y', 'rs', 42)
    rt.execCommand('scoreboard players operation $x rs = $y rs')
    expect(rt.getScore('$x', 'rs')).toBe(42)
  })

  it('executes operation < (min)', () => {
    const rt = new MCRuntime('test')
    rt.setScore('$x', 'rs', 10)
    rt.setScore('$y', 'rs', 5)
    rt.execCommand('scoreboard players operation $x rs < $y rs')
    expect(rt.getScore('$x', 'rs')).toBe(5)
  })

  it('executes operation > (max)', () => {
    const rt = new MCRuntime('test')
    rt.setScore('$x', 'rs', 5)
    rt.setScore('$y', 'rs', 10)
    rt.execCommand('scoreboard players operation $x rs > $y rs')
    expect(rt.getScore('$x', 'rs')).toBe(10)
  })

  it('executes operation >< (swap)', () => {
    const rt = new MCRuntime('test')
    rt.setScore('$x', 'rs', 10)
    rt.setScore('$y', 'rs', 20)
    rt.execCommand('scoreboard players operation $x rs >< $y rs')
    expect(rt.getScore('$x', 'rs')).toBe(20)
    expect(rt.getScore('$y', 'rs')).toBe(10)
  })

  it('executes objectives add', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('scoreboard objectives add custom dummy')
    expect(rt.scoreboard.has('custom')).toBe(true)
  })

  it('executes players reset', () => {
    const rt = new MCRuntime('test')
    rt.setScore('$x', 'rs', 42)
    rt.execCommand('scoreboard players reset $x rs')
    expect(rt.getScore('$x', 'rs')).toBe(0)
  })
})

describe('Execute Commands', () => {
  it('executes if score matches range', () => {
    const rt = new MCRuntime('test')
    rt.setScore('$x', 'rs', 5)
    rt.execCommand('execute if score $x rs matches 1..10 run scoreboard players set $hit rs 1')
    expect(rt.getScore('$hit', 'rs')).toBe(1)
  })

  it('fails if score does not match range', () => {
    const rt = new MCRuntime('test')
    rt.setScore('$x', 'rs', 15)
    const result = rt.execCommand('execute if score $x rs matches 1..10 run scoreboard players set $hit rs 1')
    expect(result).toBe(false)
    expect(rt.getScore('$hit', 'rs')).toBe(0)
  })

  it('executes unless score', () => {
    const rt = new MCRuntime('test')
    rt.setScore('$x', 'rs', 15)
    rt.execCommand('execute unless score $x rs matches 1..10 run scoreboard players set $hit rs 1')
    expect(rt.getScore('$hit', 'rs')).toBe(1)
  })

  it('executes foreach via execute as', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['zombie'])
    rt.spawnEntity(['zombie'])
    rt.execCommand('execute as @e[tag=zombie] run scoreboard players add $count rs 1')
    expect(rt.getScore('$count', 'rs')).toBe(2)
  })

  it('executes if entity', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['boss'])
    rt.execCommand('execute if entity @e[tag=boss] run scoreboard players set $found rs 1')
    expect(rt.getScore('$found', 'rs')).toBe(1)
  })

  it('fails if entity with no match', () => {
    const rt = new MCRuntime('test')
    const result = rt.execCommand('execute if entity @e[tag=boss] run scoreboard players set $found rs 1')
    expect(result).toBe(false)
  })

  it('executes unless entity', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('execute unless entity @e[tag=boss] run scoreboard players set $alone rs 1')
    expect(rt.getScore('$alone', 'rs')).toBe(1)
  })

  it('executes store result score', () => {
    const rt = new MCRuntime('test')
    rt.setScore('$x', 'rs', 42)
    rt.execCommand('execute store result score $result rs run scoreboard players get $x rs')
    expect(rt.getScore('$result', 'rs')).toBe(42)
  })

  it('executes chained subcommands', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['admin', 'player'])
    rt.execCommand('execute as @e[tag=player] if entity @s[tag=admin] run scoreboard players set $admin rs 1')
    expect(rt.getScore('$admin', 'rs')).toBe(1)
  })
})

describe('Function Commands', () => {
  it('executes a loaded function', () => {
    const rt = new MCRuntime('test')
    rt.loadFunction('test:helper', ['scoreboard players set $called rs 1'])
    rt.execCommand('function test:helper')
    expect(rt.getScore('$called', 'rs')).toBe(1)
  })

  it('executes nested function calls', () => {
    const rt = new MCRuntime('test')
    rt.loadFunction('test:outer', ['scoreboard players add $count rs 1', 'function test:inner'])
    rt.loadFunction('test:inner', ['scoreboard players add $count rs 10'])
    rt.execCommand('function test:outer')
    expect(rt.getScore('$count', 'rs')).toBe(11)
  })
})

describe('Output Commands', () => {
  it('executes say', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('say Hello World')
    expect(rt.getLastSaid()).toBe('[Server] Hello World')
  })

  it('executes say with executor', () => {
    const rt = new MCRuntime('test')
    const entity = rt.spawnEntity(['player'])
    rt.execCommand('say Hello', entity)
    expect(rt.getLastSaid()).toBe(`[${entity.id}] Hello`)
  })

  it('executes tellraw with JSON', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('tellraw @a {"text":"Hello World"}')
    expect(rt.getLastSaid()).toBe('Hello World')
  })

  it('executes title', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('title @a title {"text":"Welcome!"}')
    expect(rt.getLastSaid()).toBe('[TITLE] Welcome!')
  })

  it('getChatLog returns all messages', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('say First')
    rt.execCommand('say Second')
    expect(rt.getChatLog()).toHaveLength(2)
  })
})

describe('Tag Commands', () => {
  it('adds tag via @s', () => {
    const rt = new MCRuntime('test')
    const entity = rt.spawnEntity(['base'])
    rt.execCommand('tag @s add marked', entity)
    expect(entity.tags.has('marked')).toBe(true)
  })

  it('removes tag via @s', () => {
    const rt = new MCRuntime('test')
    const entity = rt.spawnEntity(['base', 'marked'])
    rt.execCommand('tag @s remove marked', entity)
    expect(entity.tags.has('marked')).toBe(false)
  })

  it('adds tag via selector', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['zombie'])
    rt.spawnEntity(['zombie'])
    rt.execCommand('tag @e[tag=zombie] add marked')
    expect(rt.entities.every(e => e.tags.has('marked'))).toBe(true)
  })
})

describe('Kill Commands', () => {
  it('kills via @s', () => {
    const rt = new MCRuntime('test')
    const entity = rt.spawnEntity(['mortal'])
    rt.execCommand('kill @s', entity)
    expect(rt.entities).toHaveLength(0)
  })

  it('kills via selector', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['enemy'])
    rt.spawnEntity(['enemy'])
    rt.spawnEntity(['ally'])
    rt.execCommand('kill @e[tag=enemy]')
    expect(rt.entities).toHaveLength(1)
    expect(rt.entities[0].tags.has('ally')).toBe(true)
  })
})

describe('Summon Commands', () => {
  it('summons entity with tags', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('summon minecraft:armor_stand 0 0 0 {Tags:["marker","rs"]}')
    expect(rt.entities).toHaveLength(1)
    expect(rt.entities[0].tags.has('marker')).toBe(true)
  })

  it('summons entity without tags', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('summon minecraft:armor_stand 0 0 0 {}')
    expect(rt.entities).toHaveLength(1)
  })
})

describe('Data Commands', () => {
  it('sets storage value', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('data modify storage test:data value set value 42')
    expect(rt.getStorageField('test:data', 'value')).toBe(42)
  })

  it('appends to storage array', () => {
    const rt = new MCRuntime('test')
    rt.setStorageField('test:data', 'list', [])
    rt.execCommand('data modify storage test:data list append value 1')
    rt.execCommand('data modify storage test:data list append value 2')
    expect(rt.getStorageField('test:data', 'list')).toEqual([1, 2])
  })

  it('copies storage value', () => {
    const rt = new MCRuntime('test')
    rt.setStorageField('test:src', 'value', 99)
    rt.execCommand('data modify storage test:dst value set from storage test:src value')
    expect(rt.getStorageField('test:dst', 'value')).toBe(99)
  })
})

describe('Return Commands', () => {
  it('stops function execution', () => {
    const rt = new MCRuntime('test')
    rt.loadFunction('test:returner', ['scoreboard players set $x rs 10', 'return 42', 'scoreboard players set $x rs 99'])
    rt.execCommand('function test:returner')
    expect(rt.getScore('$x', 'rs')).toBe(10)
  })

  it('executes return run', () => {
    const rt = new MCRuntime('test')
    rt.loadFunction('test:returner', ['return run scoreboard players set $x rs 42', 'scoreboard players set $x rs 99'])
    rt.execCommand('function test:returner')
    expect(rt.getScore('$x', 'rs')).toBe(42)
  })
})

describe('Selector Parsing', () => {
  it('handles @e selector', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['a'])
    rt.spawnEntity(['b'])
    expect(rt.getEntities('@e')).toHaveLength(2)
  })

  it('handles tag filter', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['enemy'])
    rt.spawnEntity(['enemy'])
    rt.spawnEntity(['ally'])
    expect(rt.getEntities('@e[tag=enemy]')).toHaveLength(2)
  })

  it('handles negative tag filter', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['player', 'admin'])
    rt.spawnEntity(['player'])
    expect(rt.getEntities('@e[tag=player,tag=!admin]')).toHaveLength(1)
  })

  it('handles limit', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['mob'])
    rt.spawnEntity(['mob'])
    rt.spawnEntity(['mob'])
    expect(rt.getEntities('@e[tag=mob,limit=2]')).toHaveLength(2)
  })
})

describe('Entity Helpers', () => {
  it('spawnEntity creates entity with tags', () => {
    const rt = new MCRuntime('test')
    const entity = rt.spawnEntity(['tag1', 'tag2'])
    expect(entity.tags.has('tag1')).toBe(true)
    expect(entity.tags.has('tag2')).toBe(true)
  })

  it('killEntity removes entities by tag', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['remove_me'])
    rt.spawnEntity(['keep_me'])
    rt.killEntity('remove_me')
    expect(rt.entities).toHaveLength(1)
  })
})

describe('Lifecycle', () => {
  it('load() executes __load', () => {
    const rt = new MCRuntime('test')
    rt.loadFunction('test:__load', ['scoreboard players set $init rs 1'])
    rt.load()
    expect(rt.getScore('$init', 'rs')).toBe(1)
  })

  it('tick() executes __tick', () => {
    const rt = new MCRuntime('test')
    rt.loadFunction('test:__tick', ['scoreboard players add $ticks rs 1'])
    rt.tick(); rt.tick(); rt.tick()
    expect(rt.getScore('$ticks', 'rs')).toBe(3)
    expect(rt.tickCount).toBe(3)
  })

  it('ticks(n) runs n ticks', () => {
    const rt = new MCRuntime('test')
    rt.loadFunction('test:__tick', ['scoreboard players add $ticks rs 1'])
    rt.ticks(10)
    expect(rt.getScore('$ticks', 'rs')).toBe(10)
  })
})

describe('compileAndLoad Integration', () => {
  it('compiles and loads tick functions', () => {
    const source = `@tick fn tick_test() { }`
    const rt = new MCRuntime('test')
    rt.compileAndLoad(source)
    expect(rt.functions.has('test:__tick')).toBe(true)
    rt.ticks(3)
    expect(rt.tickCount).toBe(3)
  })

  it('compiles and loads @load functions', () => {
    const source = `@load fn on_load() { }`
    const rt = new MCRuntime('test')
    rt.compileAndLoad(source)
    expect(rt.functions.has('test:__load')).toBe(true)
  })

  it('compiles multiple functions', () => {
    const source = `
      fn helper() { }
      @load fn main() { helper(); }
    `
    const rt = new MCRuntime('test')
    rt.compileAndLoad(source)
    expect(rt.functions.size).toBeGreaterThan(0)
  })

  it('compiles functions with parameters', () => {
    const source = `
      fn greet(n: int) { }
      @load fn init() { greet(1); }
    `
    const rt = new MCRuntime('test')
    rt.compileAndLoad(source)
    expect(rt.functions.size).toBeGreaterThan(0)
  })
})
