/**
 * Extra coverage for src/runtime/index.ts
 *
 * Targets:
 * - parseSelector: @s with/without executor, @e with type/notType/notTag/scores/limit filters
 * - execScoreboard: all operation variants (=, +=, -=, *=, /=, %=, <, >, ><, reset, enable)
 * - execExecute: store success, unless entity, unless score compare, if score compare ops
 * - execData: append, getArr, getMatch boolean/numeric/array, removeStorageField
 * - execTag: tag remove
 * - execReturn: return run, return value
 * - execSummon: simple summon without NBT, entity type filters
 * - execEffect: with explicit duration/amplifier, no executor
 * - MCRuntime: spawnEntity, getEntities, tick, loadFunction
 */

import {
  MCRuntime,
  parseRange,
  matchesRange,
  parseSelector,
  type Entity,
} from '../runtime'

// ── parseSelector ───────────────────────────────────────────────────────────

describe('runtime — parseSelector', () => {
  const makeEntity = (id: string, tags: string[], type: string, scores: Record<string, number> = {}): Entity => ({
    id,
    tags: new Set(tags),
    scores: new Map(Object.entries(scores)),
    selector: '@e',
    type,
    position: { x: 0, y: 64, z: 0 },
  })

  test('@s with no executor returns empty', () => {
    const result = parseSelector('@s', [])
    expect(result).toEqual([])
  })

  test('@s with executor returns executor', () => {
    const executor = makeEntity('player', [], 'minecraft:player')
    const result = parseSelector('@s', [executor], executor)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('player')
  })

  test('@e returns all entities', () => {
    const entities = [makeEntity('a', [], 'zombie'), makeEntity('b', [], 'player')]
    expect(parseSelector('@e', entities)).toHaveLength(2)
  })

  test('@a returns all entities', () => {
    const entities = [makeEntity('a', [], 'zombie'), makeEntity('b', [], 'player')]
    expect(parseSelector('@a', entities)).toHaveLength(2)
  })

  test('invalid selector returns empty', () => {
    expect(parseSelector('notasel', [])).toEqual([])
  })

  test('@s with filters matches executor if filters pass', () => {
    const executor = makeEntity('p', ['runner'], 'minecraft:player', { rs: 5 })
    const result = parseSelector('@s[tag=runner]', [executor], executor)
    expect(result).toHaveLength(1)
  })

  test('@s with filters returns empty if executor missing', () => {
    const result = parseSelector('@s[tag=runner]', [])
    expect(result).toHaveLength(0)
  })

  test('@e with type filter', () => {
    const entities = [
      makeEntity('zombie1', [], 'zombie'),
      makeEntity('player1', [], 'minecraft:player'),
    ]
    const result = parseSelector('@e[type=zombie]', entities)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('zombie1')
  })

  test('@e with notType filter', () => {
    const entities = [
      makeEntity('zombie1', [], 'zombie'),
      makeEntity('player1', [], 'minecraft:player'),
    ]
    const result = parseSelector('@e[type=!zombie]', entities)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('player1')
  })

  test('@e with notTag filter', () => {
    const entities = [
      makeEntity('tagged', ['boss'], 'zombie'),
      makeEntity('plain', [], 'zombie'),
    ]
    const result = parseSelector('@e[tag=!boss]', entities)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('plain')
  })

  test('@e with limit filter', () => {
    const entities = [
      makeEntity('a', [], 'zombie'),
      makeEntity('b', [], 'zombie'),
      makeEntity('c', [], 'zombie'),
    ]
    const result = parseSelector('@e[limit=2]', entities)
    expect(result).toHaveLength(2)
  })

  test('@e with scores filter', () => {
    const entities = [
      makeEntity('high', [], 'player', { rs: 10 }),
      makeEntity('low', [], 'player', { rs: 2 }),
    ]
    const result = parseSelector('@e[scores={rs=5..15}]', entities)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('high')
  })

  test('entity without type falls back to minecraft:armor_stand for type matching', () => {
    const entity: Entity = { id: 'notype', tags: new Set(), scores: new Map(), selector: '@e' }
    const result = parseSelector('@e[type=armor_stand]', [entity])
    expect(result).toHaveLength(1)
  })
})

// ── Scoreboard operations ───────────────────────────────────────────────────

describe('runtime — scoreboard operations', () => {
  test('objectives add creates new objective', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('scoreboard objectives add kills dummy')
    expect(rt.scoreboard.has('kills')).toBe(true)
  })

  test('objectives add is idempotent', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('scoreboard objectives add coins dummy')
    rt.execCommand('scoreboard objectives add coins dummy')
    expect(rt.scoreboard.has('coins')).toBe(true)
  })

  test('scoreboard players set/get', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('scoreboard players set alice rs 42')
    expect(rt.getScore('alice', 'rs')).toBe(42)
  })

  test('scoreboard players add', () => {
    const rt = new MCRuntime('test')
    rt.setScore('alice', 'rs', 10)
    rt.execCommand('scoreboard players add alice rs 5')
    expect(rt.getScore('alice', 'rs')).toBe(15)
  })

  test('scoreboard players remove', () => {
    const rt = new MCRuntime('test')
    rt.setScore('alice', 'rs', 10)
    rt.execCommand('scoreboard players remove alice rs 3')
    expect(rt.getScore('alice', 'rs')).toBe(7)
  })

  test('scoreboard players reset', () => {
    const rt = new MCRuntime('test')
    rt.setScore('alice', 'rs', 99)
    rt.execCommand('scoreboard players reset alice rs')
    expect(rt.getScore('alice', 'rs')).toBe(0)
  })

  test('scoreboard players enable (no-op)', () => {
    const rt = new MCRuntime('test')
    const result = rt.execCommand('scoreboard players enable @s trigger')
    expect(result).toBe(true)
  })

  test('scoreboard operation = (copy)', () => {
    const rt = new MCRuntime('test')
    rt.setScore('src', 'rs', 77)
    rt.setScore('dst', 'rs', 0)
    rt.execCommand('scoreboard players operation dst rs = src rs')
    expect(rt.getScore('dst', 'rs')).toBe(77)
  })

  test('scoreboard operation += ', () => {
    const rt = new MCRuntime('test')
    rt.setScore('x', 'rs', 10)
    rt.setScore('y', 'rs', 5)
    rt.execCommand('scoreboard players operation x rs += y rs')
    expect(rt.getScore('x', 'rs')).toBe(15)
  })

  test('scoreboard operation -=', () => {
    const rt = new MCRuntime('test')
    rt.setScore('x', 'rs', 10)
    rt.setScore('y', 'rs', 3)
    rt.execCommand('scoreboard players operation x rs -= y rs')
    expect(rt.getScore('x', 'rs')).toBe(7)
  })

  test('scoreboard operation *=', () => {
    const rt = new MCRuntime('test')
    rt.setScore('x', 'rs', 4)
    rt.setScore('y', 'rs', 3)
    rt.execCommand('scoreboard players operation x rs *= y rs')
    expect(rt.getScore('x', 'rs')).toBe(12)
  })

  test('scoreboard operation /= (truncate)', () => {
    const rt = new MCRuntime('test')
    rt.setScore('x', 'rs', 10)
    rt.setScore('y', 'rs', 3)
    rt.execCommand('scoreboard players operation x rs /= y rs')
    expect(rt.getScore('x', 'rs')).toBe(3) // truncate(10/3)
  })

  test('scoreboard operation %=', () => {
    const rt = new MCRuntime('test')
    rt.setScore('x', 'rs', 10)
    rt.setScore('y', 'rs', 3)
    rt.execCommand('scoreboard players operation x rs %= y rs')
    expect(rt.getScore('x', 'rs')).toBe(1)
  })

  test('scoreboard operation < (min)', () => {
    const rt = new MCRuntime('test')
    rt.setScore('x', 'rs', 10)
    rt.setScore('y', 'rs', 5)
    rt.execCommand('scoreboard players operation x rs < y rs')
    expect(rt.getScore('x', 'rs')).toBe(5)
  })

  test('scoreboard operation > (max)', () => {
    const rt = new MCRuntime('test')
    rt.setScore('x', 'rs', 3)
    rt.setScore('y', 'rs', 8)
    rt.execCommand('scoreboard players operation x rs > y rs')
    expect(rt.getScore('x', 'rs')).toBe(8)
  })

  test('scoreboard operation >< (swap)', () => {
    const rt = new MCRuntime('test')
    rt.setScore('x', 'rs', 10)
    rt.setScore('y', 'rs', 20)
    rt.execCommand('scoreboard players operation x rs >< y rs')
    expect(rt.getScore('x', 'rs')).toBe(20)
    expect(rt.getScore('y', 'rs')).toBe(10)
  })
})

// ── Execute subcommands ────────────────────────────────────────────────────

describe('runtime — execute subcommands', () => {
  test('store success score stores 1 on success', () => {
    const rt = new MCRuntime('test')
    rt.setScore('p', 'rs', 5)
    rt.execCommand('execute store success score result rs if score p rs matches 1..10 run scoreboard players set noop rs 0')
    expect(rt.getScore('result', 'rs')).toBe(1)
  })

  test('unless entity fires when no matching entity', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('execute unless entity @e[tag=nonexistent] run scoreboard players set fired rs 1')
    expect(rt.getScore('fired', 'rs')).toBe(1)
  })

  test('unless entity skips when entity exists', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['target'], 'zombie', { x: 0, y: 0, z: 0 })
    rt.execCommand('execute unless entity @e[tag=target] run scoreboard players set fired rs 1')
    expect(rt.getScore('fired', 'rs')).toBe(0)
  })

  test('if score compare operators: = < <= > >=', () => {
    const rt = new MCRuntime('test')
    rt.setScore('a', 'rs', 5)
    rt.setScore('b', 'rs', 5)

    rt.execCommand('execute if score a rs = b rs run scoreboard players set eq rs 1')
    expect(rt.getScore('eq', 'rs')).toBe(1)

    rt.setScore('a', 'rs', 3)
    rt.execCommand('execute if score a rs < b rs run scoreboard players set lt rs 1')
    expect(rt.getScore('lt', 'rs')).toBe(1)

    rt.execCommand('execute if score a rs <= b rs run scoreboard players set lte rs 1')
    expect(rt.getScore('lte', 'rs')).toBe(1)

    rt.setScore('a', 'rs', 7)
    rt.execCommand('execute if score a rs > b rs run scoreboard players set gt rs 1')
    expect(rt.getScore('gt', 'rs')).toBe(1)

    rt.execCommand('execute if score a rs >= b rs run scoreboard players set gte rs 1')
    expect(rt.getScore('gte', 'rs')).toBe(1)
  })

  test('unless score compare negates condition', () => {
    const rt = new MCRuntime('test')
    rt.setScore('a', 'rs', 3)
    rt.setScore('b', 'rs', 5)
    rt.execCommand('execute unless score a rs = b rs run scoreboard players set neq rs 1')
    expect(rt.getScore('neq', 'rs')).toBe(1)
  })

  test('execute as multiple entities runs for each', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['target'], 'zombie', { x: 0, y: 0, z: 0 })
    rt.spawnEntity(['target'], 'zombie', { x: 1, y: 0, z: 0 })
    rt.execCommand('execute as @e[tag=target] run tag @s add processed')
    const processed = rt.getEntities('@e[tag=processed]')
    expect(processed).toHaveLength(2)
  })

  test('execute at selector continues', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['walker'], 'player', { x: 5, y: 64, z: 5 })
    rt.execCommand('execute at @e[tag=walker] run scoreboard players set walked rs 1')
    expect(rt.getScore('walked', 'rs')).toBe(1)
  })
})

// ── Data commands ──────────────────────────────────────────────────────────

describe('runtime — data commands', () => {
  test('data append and get array length', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('data modify storage test:arr list set value []')
    rt.execCommand('data modify storage test:arr list append value 10')
    rt.execCommand('data modify storage test:arr list append value 20')
    rt.execCommand('execute store result score count rs run data get storage test:arr list')
    expect(rt.getScore('count', 'rs')).toBe(2)
  })

  test('data remove storage field', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('data modify storage test:del value set value 42')
    rt.execCommand('data remove storage test:del value')
    expect(rt.getStorage('test:del.value')).toBeUndefined()
  })

  test('data modify append to non-array does nothing', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('data modify storage test:scalar x set value 99')
    // append to non-array - should not crash
    rt.execCommand('data modify storage test:scalar x append value 1')
    expect(rt.getStorage('test:scalar.x')).toBe(99)
  })

  test('data get storage returns 0 for undefined', () => {
    const rt = new MCRuntime('test')
    const result = rt.execCommand('data get storage test:empty missingfield')
    expect(result).toBe(true)
  })

  test('data get storage array element', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('data modify storage test:arr nums set value [10,20,30]')
    rt.execCommand('execute store result score elem rs run data get storage test:arr nums[1]')
    expect(rt.getScore('elem', 'rs')).toBe(20)
  })

  test('data get storage on array returns length', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('data modify storage test:arr items set value [1,2,3,4]')
    rt.execCommand('execute store result score len rs run data get storage test:arr items')
    expect(rt.getScore('len', 'rs')).toBe(4)
  })
})

// ── Tag commands ─────────────────────────────────────────────────────────────

describe('runtime — tag commands', () => {
  test('tag add via @e selector', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['enemy'], 'zombie', { x: 0, y: 0, z: 0 })
    rt.execCommand('tag @e[tag=enemy] add hostile')
    const entities = rt.getEntities('@e[tag=hostile]')
    expect(entities).toHaveLength(1)
  })

  test('tag remove via @s', () => {
    const rt = new MCRuntime('test')
    const p = rt.spawnEntity(['runner', 'active'], 'player', { x: 0, y: 0, z: 0 })
    rt.execCommand('tag @s remove active', p)
    expect(p.tags.has('active')).toBe(false)
    expect(p.tags.has('runner')).toBe(true)
  })

  test('tag remove via @e selector', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['marked'], 'zombie', { x: 0, y: 0, z: 0 })
    rt.execCommand('tag @e[tag=marked] remove marked')
    const entities = rt.getEntities('@e[tag=marked]')
    expect(entities).toHaveLength(0)
  })

  test('tag command returns false for invalid', () => {
    const rt = new MCRuntime('test')
    const result = rt.execCommand('tag badformat')
    expect(result).toBe(false)
  })
})

// ── Return command ────────────────────────────────────────────────────────────

describe('runtime — return command', () => {
  test('return <value> can be captured via store result', () => {
    const rt = new MCRuntime('test')
    rt.loadFunction('test:myfn', ['return 99'])
    rt.execCommand('execute store result score ret rs run function test:myfn')
    expect(rt.getScore('ret', 'rs')).toBe(99)
  })

  test('bare return command stops execution', () => {
    const rt = new MCRuntime('test')
    rt.loadFunction('test:early', [
      'scoreboard players set before rs 1',
      'return',
      'scoreboard players set after rs 1',
    ])
    rt.execFunction('early')
    expect(rt.getScore('before', 'rs')).toBe(1)
    expect(rt.getScore('after', 'rs')).toBe(0)
  })

  test('return run <cmd> executes inner cmd then stops', () => {
    const rt = new MCRuntime('test')
    rt.loadFunction('test:retrun', [
      'return run scoreboard players set ret rs 42',
      'scoreboard players set nope rs 1',
    ])
    rt.execFunction('retrun')
    expect(rt.getScore('ret', 'rs')).toBe(42)
    expect(rt.getScore('nope', 'rs')).toBe(0)
  })
})

// ── Summon ───────────────────────────────────────────────────────────────────

describe('runtime — summon', () => {
  test('simple summon without NBT creates entity', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('summon minecraft:zombie 10 65 10')
    const zombies = rt.getEntities('@e[type=zombie]')
    expect(zombies.length).toBeGreaterThan(0)
  })

  test('summon with NBT creates tagged entity', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('summon minecraft:armor_stand 0 64 0 {Tags:["marker","special"]}')
    const markers = rt.getEntities('@e[tag=marker]')
    expect(markers.length).toBeGreaterThan(0)
    expect(markers[0].tags.has('special')).toBe(true)
  })

  test('summon without position creates entity at origin', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('summon minecraft:chicken')
    const chickens = rt.getEntities('@e[type=chicken]')
    expect(chickens.length).toBeGreaterThan(0)
  })
})

// ── Effect ───────────────────────────────────────────────────────────────────

describe('runtime — effect command', () => {
  test('effect give with defaults (no duration/amplifier)', () => {
    const rt = new MCRuntime('test')
    const p = rt.spawnEntity(['player'], 'minecraft:player', { x: 0, y: 64, z: 0 })
    rt.execCommand('effect give @e[tag=player] minecraft:speed')
    const fx = rt.effects.get(p.id)!
    expect(fx).toBeDefined()
    expect(fx[0].effect).toBe('minecraft:speed')
    expect(fx[0].duration).toBe(30) // default
    expect(fx[0].amplifier).toBe(0)  // default
  })

  test('effect give to no matching entity returns false', () => {
    const rt = new MCRuntime('test')
    const result = rt.execCommand('effect give @e[tag=nobody] minecraft:speed')
    expect(result).toBe(false)
  })
})

// ── MCRuntime misc ────────────────────────────────────────────────────────────

describe('runtime — MCRuntime misc', () => {
  test('tick increments tickCount', () => {
    const rt = new MCRuntime('test')
    rt.tick()
    rt.tick()
    expect(rt.tickCount).toBe(2)
  })

  test('getEntities with @e selector', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['a'], 'zombie', { x: 0, y: 0, z: 0 })
    rt.spawnEntity(['b'], 'zombie', { x: 1, y: 0, z: 0 })
    expect(rt.getEntities('@e').length).toBe(2)
  })

  test('loadFunction stores function by name', () => {
    const rt = new MCRuntime('test')
    rt.loadFunction('test:ping', ['say pong'])
    expect(rt.functions.has('test:ping')).toBe(true)
  })

  test('execFunction runs loaded function', () => {
    const rt = new MCRuntime('test')
    rt.loadFunction('test:greet', ['say hello'])
    rt.execFunction('greet')
    expect(rt.getLastSaid()).toBe('[Server] hello')
  })

  test('unknown command succeeds silently', () => {
    const rt = new MCRuntime('test')
    expect(rt.execCommand('gamemode creative @a')).toBe(true)
  })

  test('getChatLog returns all messages', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('say first')
    rt.execCommand('say second')
    expect(rt.getChatLog()).toEqual(['[Server] first', '[Server] second'])
  })

  test('getStorage with nested path', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('data modify storage test:ns a set value {"b":42}')
    expect(rt.getStorage('test:ns.a.b')).toBe(42)
  })

  test('weather command sets weather', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('weather thunder')
    expect(rt.weather).toBe('thunder')
    rt.execCommand('weather clear')
    expect(rt.weather).toBe('clear')
  })

  test('time set and add', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('time set 1000')
    expect(rt.worldTime).toBe(1000)
    rt.execCommand('time add 500')
    expect(rt.worldTime).toBe(1500)
  })

  test('time set noon', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('time set noon')
    expect(rt.worldTime).toBe(6000)
  })

  test('time set midnight', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('time set midnight')
    expect(rt.worldTime).toBe(18000)
  })

  test('time set day/night', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('time set day')
    expect(rt.worldTime).toBe(1000)
    rt.execCommand('time set night')
    expect(rt.worldTime).toBe(13000)
  })

  test('tp with relative coords', () => {
    const rt = new MCRuntime('test')
    const p = rt.spawnEntity(['mover'], 'player', { x: 10, y: 64, z: 10 })
    rt.execCommand('tp @s ~5 ~ ~-3', p)
    expect(p.position).toEqual({ x: 15, y: 64, z: 7 })
  })

  test('compileAndLoad runs compiled code', () => {
    const rt = new MCRuntime('test')
    rt.compileAndLoad('fn greet(): int { return 1; }')
    expect(rt.functions.size).toBeGreaterThan(0)
  })
})

// ── Additional tp coverage ────────────────────────────────────────────────

describe('runtime — tp additional variants', () => {
  test('tp self to absolute coords (3 args)', () => {
    const rt = new MCRuntime('test')
    const p = rt.spawnEntity(['p'], 'player', { x: 0, y: 0, z: 0 })
    rt.execCommand('tp 5 10 15', p)
    expect(p.position).toEqual({ x: 5, y: 10, z: 15 })
  })

  test('tp entity to entity', () => {
    const rt = new MCRuntime('test')
    const src = rt.spawnEntity(['mover'], 'player', { x: 10, y: 64, z: 10 })
    const dst = rt.spawnEntity(['target'], 'player', { x: 50, y: 70, z: 50 })
    rt.execCommand('execute as @e[tag=mover] run tp @s @e[tag=target]', src)
    expect(src.position).toEqual({ x: 50, y: 70, z: 50 })
  })

  test('tp selector to coords', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['mob'], 'zombie', { x: 0, y: 64, z: 0 })
    rt.execCommand('tp @e[tag=mob] 100 64 100')
    const mobs = rt.getEntities('@e[tag=mob]')
    expect(mobs[0].position).toEqual({ x: 100, y: 64, z: 100 })
  })
})

// ── Kill command ──────────────────────────────────────────────────────────

describe('runtime — kill command', () => {
  test('kill self entity removes from entities list', () => {
    const rt = new MCRuntime('test')
    const p = rt.spawnEntity(['victim'], 'player', { x: 0, y: 0, z: 0 })
    rt.execCommand('kill @s', p)
    expect(rt.getEntities('@e[tag=victim]')).toHaveLength(0)
  })

  test('kill by selector removes matching entities', () => {
    const rt = new MCRuntime('test')
    rt.spawnEntity(['dead1'], 'zombie', { x: 0, y: 0, z: 0 })
    rt.spawnEntity(['dead2'], 'zombie', { x: 1, y: 0, z: 0 })
    rt.spawnEntity(['alive'], 'player', { x: 2, y: 0, z: 0 })
    rt.execCommand('kill @e[type=zombie]')
    expect(rt.getEntities('@e[type=zombie]')).toHaveLength(0)
    expect(rt.getEntities('@e[tag=alive]')).toHaveLength(1)
  })
})

// ── xp and effect edge cases ──────────────────────────────────────────────

describe('runtime — xp edge cases', () => {
  test('xp add to @s executor', () => {
    const rt = new MCRuntime('test')
    const p = rt.spawnEntity(['p'], 'player', { x: 0, y: 0, z: 0 })
    rt.execCommand('xp add @s 100 points', p)
    expect(rt.xp.get(p.id)).toBe(100)
  })

  test('xp set with selector', () => {
    const rt = new MCRuntime('test')
    const p = rt.spawnEntity(['p'], 'player', { x: 0, y: 0, z: 0 })
    rt.execCommand('xp set @e[tag=p] 50 points')
    expect(rt.xp.get(p.id)).toBe(50)
  })
})

// ── tellraw extractJsonText edge cases ────────────────────────────────────

describe('runtime — tellraw extractJsonText', () => {
  test('tellraw with text component', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('tellraw @a {"text":"hello"}')
    expect(rt.getChatLog()).toContain('hello')
  })

  test('tellraw with plain string JSON', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('tellraw @a "plain text"')
    expect(rt.getChatLog()).toContain('plain text')
  })

  test('tellraw with array of text parts', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('tellraw @a [{"text":"hello"},{"text":" world"}]')
    expect(rt.getChatLog().some(m => m.includes('hello'))).toBe(true)
  })

  test('title with subtitle', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('title @a title {"text":"big title"}')
    expect(rt.getChatLog().some(m => m.includes('[TITLE]'))).toBe(true)
  })

  test('title with subtitle kind', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('title @a subtitle {"text":"small title"}')
    expect(rt.getChatLog().some(m => m.includes('[SUBTITLE]'))).toBe(true)
  })
})

// ── scoreboard players get ────────────────────────────────────────────────

describe('runtime — scoreboard players get', () => {
  test('scoreboard players get returns score via store result', () => {
    const rt = new MCRuntime('test')
    rt.setScore('player1', 'rs', 55)
    rt.execCommand('execute store result score result rs run scoreboard players get player1 rs')
    expect(rt.getScore('result', 'rs')).toBe(55)
  })
})

// ── Storage path parsing ────────────────────────────────────────────────────

describe('runtime — storage path edge cases', () => {
  test('getStorage without colon returns raw storage key', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('data modify storage simple-key field set value 42')
    // Simple key (no colon) should work
    expect(rt.execCommand('data get storage simple-key field')).toBe(true)
  })

  test('setStorage without colon', () => {
    const rt = new MCRuntime('test')
    rt.setStorage('simple-key', { x: 1 })
    // Should not throw
    expect(true).toBe(true)
  })

  test('getStorage with no dot after colon returns top-level ns', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('data modify storage test:bucket field set value 42')
    // getStorage returns the field
    const val = rt.getStorage('test:bucket.field')
    expect(val).toBe(42)
  })

  test('setStorage with dotted path sets nested field', () => {
    const rt = new MCRuntime('test')
    rt.setStorage('test:ns.field', 99)
    expect(rt.getStorage('test:ns.field')).toBe(99)
  })
})

// ── matchesRange ──────────────────────────────────────────────────────────

describe('runtime — matchesRange / parseRange', () => {
  test('matchesRange works for exact value', () => {
    const rt = new MCRuntime('test')
    rt.setScore('p', 'rs', 5)
    rt.execCommand('execute if score p rs matches 5 run scoreboard players set exact rs 1')
    expect(rt.getScore('exact', 'rs')).toBe(1)
  })

  test('matchesRange works for open-ended range ..N', () => {
    const rt = new MCRuntime('test')
    rt.setScore('p', 'rs', 3)
    rt.execCommand('execute if score p rs matches ..5 run scoreboard players set open rs 1')
    expect(rt.getScore('open', 'rs')).toBe(1)
  })

  test('matchesRange works for open-start range N..', () => {
    const rt = new MCRuntime('test')
    rt.setScore('p', 'rs', 10)
    rt.execCommand('execute if score p rs matches 5.. run scoreboard players set start rs 1')
    expect(rt.getScore('start', 'rs')).toBe(1)
  })

  test('matchesRange fails for out-of-range', () => {
    const rt = new MCRuntime('test')
    rt.setScore('p', 'rs', 20)
    rt.execCommand('execute if score p rs matches 1..10 run scoreboard players set inrange rs 1')
    expect(rt.getScore('inrange', 'rs')).toBe(0)
  })
})

// ── execFunction with return value ────────────────────────────────────────

describe('runtime — execFunction with return value', () => {
  test('return value captured via store result', () => {
    const rt = new MCRuntime('test')
    rt.loadFunction('test:calc', [
      'scoreboard players set __rs_return rs 77',
      'return 77',
    ])
    rt.execCommand('execute store result score result rs run function test:calc')
    expect(rt.getScore('result', 'rs')).toBe(77)
  })

  test('function called with execute as @s sets executor', () => {
    const rt = new MCRuntime('test')
    const p = rt.spawnEntity(['runner'], 'player', { x: 0, y: 0, z: 0 })
    rt.loadFunction('test:tagme', ['tag @s add tagged'])
    rt.execCommand('execute as @e[tag=runner] run function test:tagme')
    expect(p.tags.has('tagged')).toBe(true)
  })
})

// ── kill with @s ─────────────────────────────────────────────────────────

describe('runtime — kill edge cases', () => {
  test('kill @s does not crash without executor', () => {
    const rt = new MCRuntime('test')
    // kill @s without executor - should fail gracefully
    const result = rt.execCommand('kill @s')
    expect(typeof result).toBe('boolean')
  })
})

// ── setblock / fill ────────────────────────────────────────────────────────

describe('runtime — setblock and fill', () => {
  test('setblock places block at coordinate in world map', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('setblock 10 64 10 minecraft:stone')
    expect(rt.world.get('10,64,10')).toBe('minecraft:stone')
  })

  test('fill region sets multiple blocks', () => {
    const rt = new MCRuntime('test')
    rt.execCommand('fill 0 64 0 2 64 2 minecraft:oak_planks')
    expect(rt.world.get('1,64,1')).toBe('minecraft:oak_planks')
    expect(rt.world.get('0,64,0')).toBe('minecraft:oak_planks')
    expect(rt.world.get('2,64,2')).toBe('minecraft:oak_planks')
  })

  test('setblock with invalid coordinates returns false', () => {
    const rt = new MCRuntime('test')
    const result = rt.execCommand('setblock notacoord notacoord notacoord minecraft:stone')
    expect(result).toBe(false)
  })
})

// ── effect with duration and amplifier ────────────────────────────────────

describe('runtime — effect with explicit duration/amplifier', () => {
  test('effect give with duration and amplifier', () => {
    const rt = new MCRuntime('test')
    const p = rt.spawnEntity(['p'], 'player', { x: 0, y: 0, z: 0 })
    rt.execCommand('effect give @e[tag=p] minecraft:strength 60 2')
    const fx = rt.effects.get(p.id)!
    expect(fx[0].duration).toBe(60)
    expect(fx[0].amplifier).toBe(2)
  })

  test('multiple effect give stacks effects', () => {
    const rt = new MCRuntime('test')
    const p = rt.spawnEntity(['p'], 'player', { x: 0, y: 0, z: 0 })
    rt.execCommand('effect give @e[tag=p] minecraft:speed 30 0')
    rt.execCommand('effect give @e[tag=p] minecraft:strength 60 1')
    const fx = rt.effects.get(p.id)!
    expect(fx.length).toBe(2)
    expect(fx[1].effect).toBe('minecraft:strength')
  })
})

// ── compileAndLoad ─────────────────────────────────────────────────────────

describe('runtime — compileAndLoad', () => {
  test('compileAndLoad loads multiple functions', () => {
    const rt = new MCRuntime('test')
    rt.compileAndLoad(`
      fn add(a: int, b: int): int { return a + b; }
      fn sub(a: int, b: int): int { return a - b; }
    `)
    expect(rt.functions.size).toBeGreaterThan(1)
  })

  test('compileAndLoad allows calling compiled functions', () => {
    const rt = new MCRuntime('test')
    rt.compileAndLoad(`
      fn set_score(): void {
        scoreboard_set("player", "rs", 99);
      }
    `)
    rt.execFunction('set_score')
    expect(rt.getScore('player', 'rs')).toBe(99)
  })
})
