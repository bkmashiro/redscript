import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  MCRuntime,
  matchesRange,
  parseRange,
  parseSelector,
} from '../runtime'

describe('runtime helpers', () => {
  it('parses ranges and matches inclusive bounds', () => {
    expect(parseRange('5')).toEqual({ min: 5, max: 5 })
    expect(parseRange('..3')).toEqual({ min: -Infinity, max: 3 })
    expect(parseRange('7..')).toEqual({ min: 7, max: Infinity })
    expect(parseRange('2..4')).toEqual({ min: 2, max: 4 })

    expect(matchesRange(3, parseRange('2..4'))).toBe(true)
    expect(matchesRange(5, parseRange('2..4'))).toBe(false)
  })

  it('parses selectors with tags, types, scores, limits, and executor context', () => {
    const executor = {
      id: 'player',
      tags: new Set(['runner']),
      scores: new Map([['rs', 9], ['coins', 3]]),
      selector: '@s',
      type: 'minecraft:player',
      position: { x: 0, y: 64, z: 0 },
    }
    const entities = [
      executor,
      {
        id: 'zombie_a',
        tags: new Set(['enemy', 'boss']),
        scores: new Map([['rs', 5], ['coins', 10]]),
        selector: '@e[tag=enemy,limit=1]',
        type: 'zombie',
        position: { x: 1, y: 64, z: 0 },
      },
      {
        id: 'armor',
        tags: new Set(['marker']),
        scores: new Map([['rs', 1]]),
        selector: '@e[tag=marker,limit=1]',
        type: 'minecraft:armor_stand',
        position: { x: 2, y: 64, z: 0 },
      },
    ]

    expect(parseSelector('@s', entities, executor)).toEqual([executor])
    expect(parseSelector('@e[type=zombie,tag=enemy,scores={coins=8..},limit=1]', entities, executor))
      .toEqual([entities[1]])
    expect(parseSelector('@e[type=!armor_stand,tag=!marker]', entities, executor))
      .toEqual([executor, entities[1]])
    expect(parseSelector('@s[tag=runner,scores={rs=9}]', entities, executor)).toEqual([executor])
  })
})

describe('MCRuntime', () => {
  it('loads functions, runs lifecycle hooks, and stops execution after return', () => {
    const rt = new MCRuntime('test')
    rt.loadFunction('test:__load', [
      'scoreboard players add init rs 1',
      '# comment should be dropped',
      '',
    ])
    rt.loadFunction('test:__tick', ['scoreboard players add tick rs 1'])
    rt.loadFunction('test:early_return', [
      'scoreboard players set before rs 1',
      'return 42',
      'scoreboard players set after rs 1',
    ])

    rt.load()
    rt.ticks(3)
    rt.execFunction('early_return')

    expect(rt.getScore('init', 'rs')).toBe(1)
    expect(rt.getScore('tick', 'rs')).toBe(3)
    expect(rt.getScore('before', 'rs')).toBe(1)
    expect(rt.getScore('after', 'rs')).toBe(0)
    expect(rt.execCommand('execute store result score result rs run scoreboard players get before rs')).toBe(true)
    expect(rt.getScore('result', 'rs')).toBe(1)
  })

  it('supports execute conditions, storage writes, and macro function calls', () => {
    const rt = new MCRuntime('test')
    const runner = rt.spawnEntity(['runner'], 'minecraft:player', { x: 0, y: 64, z: 0 })
    rt.setScore('lhs', 'rs', 7)
    rt.setScore('rhs', 'rs', 4)
    rt.setStorage('test:macro', { msg: 'macro hello', amount: 12 })
    rt.loadFunction('test:macro_echo', [
      '$say $(msg)',
      '$scoreboard players set macro_score rs $(amount)',
    ])

    expect(rt.execCommand('execute if score lhs rs > rhs rs run scoreboard players set compare rs 1')).toBe(true)
    expect(rt.getScore('compare', 'rs')).toBe(1)

    expect(rt.execCommand('execute unless score lhs rs matches 1..5 run scoreboard players set outside rs 1')).toBe(true)
    expect(rt.getScore('outside', 'rs')).toBe(1)

    expect(rt.execCommand('execute as @e[tag=runner] if entity @s[tag=runner] run tag @s add active')).toBe(true)
    expect(runner.tags.has('active')).toBe(true)

    expect(rt.execCommand('execute store success score success rs if entity @e[tag=runner]')).toBe(true)
    expect(rt.getScore('success', 'rs')).toBe(1)

    expect(rt.execCommand('execute store result storage test:store answer int 1 run scoreboard players get lhs rs')).toBe(true)
    expect(rt.getStorage('test:store.answer')).toBe(7)

    expect(rt.execCommand('function test:macro_echo with storage test:macro')).toBe(true)
    expect(rt.getLastSaid()).toBe('[Server] macro hello')
    expect(rt.getScore('macro_score', 'rs')).toBe(12)
  })

  it('handles storage, chat output, world state, and entity-affecting commands', () => {
    const rt = new MCRuntime('test')
    const player = rt.spawnEntity(['player'], 'minecraft:player', { x: 10, y: 64, z: 10 })

    expect(rt.execCommand('data modify storage test:data numbers set value [1,2]')).toBe(true)
    expect(rt.execCommand('data modify storage test:data numbers append value 3')).toBe(true)
    expect(rt.execCommand('data modify storage test:data numbers[1] set value 9')).toBe(true)
    expect(rt.execCommand('data modify storage test:data nested.value set value {"ok":true}')).toBe(true)
    expect(rt.execCommand('data modify storage test:copy clone set from storage test:data nested.value')).toBe(true)
    expect(rt.execCommand('data get storage test:data numbers[1]')).toBe(true)
    expect(rt.execCommand('execute store result score fetched rs run data get storage test:data numbers')).toBe(true)
    expect(rt.execCommand('data remove storage test:data nested.value')).toBe(true)

    expect(rt.getStorage('test:data.numbers')).toEqual([1, 9, 3])
    expect(rt.getStorage('test:copy.clone')).toEqual({ ok: true })
    expect(rt.getScore('fetched', 'rs')).toBe(3)
    expect(rt.getStorage('test:data.nested.value')).toBeUndefined()

    expect(rt.execCommand('say hello')).toBe(true)
    expect(rt.execCommand('tellraw @a {"text":"score:","extra":[{"score":{"name":"fetched","objective":"rs"}}]}')).toBe(true)
    expect(rt.execCommand('title @a actionbar {"text":"Alert"}')).toBe(true)
    expect(rt.getChatLog()).toEqual([
      '[Server] hello',
      'score:',
      '[ACTIONBAR] Alert',
    ])

    expect(rt.execCommand('setblock 1 2 3 minecraft:stone')).toBe(true)
    expect(rt.execCommand('fill 0 0 0 1 0 1 minecraft:dirt')).toBe(true)
    expect(rt.execCommand('weather rain')).toBe(true)
    expect(rt.execCommand('time set noon')).toBe(true)
    expect(rt.execCommand('time add 20')).toBe(true)
    expect(rt.execCommand('tp @e[tag=player] ~1 ~2 ~3')).toBe(true)
    expect(rt.execCommand('summon minecraft:zombie 5 65 5 {Tags:["enemy","boss"]}')).toBe(true)
    expect(rt.execCommand('effect give @e[tag=player] minecraft:speed 15 2')).toBe(true)
    expect(rt.execCommand('xp add @e[tag=player] 5 points')).toBe(true)
    expect(rt.execCommand('xp set @s 8 points', player)).toBe(true)
    expect(rt.execCommand('kill @e[tag=enemy]')).toBe(true)

    expect(rt.world.get('1,2,3')).toBe('minecraft:stone')
    expect(rt.world.get('0,0,0')).toBe('minecraft:dirt')
    expect(rt.world.get('1,0,1')).toBe('minecraft:dirt')
    expect(rt.weather).toBe('rain')
    expect(rt.worldTime).toBe(6020)
    expect(player.position).toEqual({ x: 11, y: 66, z: 13 })
    expect(rt.effects.get(player.id)).toEqual([
      { effect: 'minecraft:speed', duration: 15, amplifier: 2 },
    ])
    expect(rt.xp.get(player.id)).toBe(8)
    expect(rt.getEntities('@e[tag=enemy]')).toEqual([])
  })

  it('loads datapacks from disk and exposes loaded functions', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'redscript-runtime-'))
    const fnDir = path.join(base, 'data', 'pack', 'function', 'nested')
    fs.mkdirSync(fnDir, { recursive: true })
    fs.writeFileSync(
      path.join(base, 'data', 'pack', 'function', '__load.mcfunction'),
      'scoreboard players set loaded rs 1\n',
      'utf8',
    )
    fs.writeFileSync(
      path.join(fnDir, 'ping.mcfunction'),
      'say datapack\n',
      'utf8',
    )

    const rt = new MCRuntime('pack')
    rt.loadDatapack(base)
    rt.load()
    rt.execFunction('nested/ping')

    expect(rt.getScore('loaded', 'rs')).toBe(1)
    expect(rt.getLastSaid()).toBe('[Server] datapack')
    expect(rt.functions.has('pack:nested/ping')).toBe(true)
  })
})
