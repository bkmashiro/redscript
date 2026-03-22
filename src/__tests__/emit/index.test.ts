import { emit } from '../../emit'
import type { LIRModule, LIRFunction, LIRInstr } from '../../lir/types'
import { McVersion } from '../../types/mc-version'

function getFile(files: { path: string; content: string }[], path: string): string {
  const file = files.find(f => f.path === path)
  if (!file) {
    throw new Error(`Missing file: ${path}\nFiles:\n${files.map(f => f.path).join('\n')}`)
  }
  return file.content
}

describe('emit: direct LIR emission', () => {
  test('emits datapack files, source maps, tags, schedule wrappers, and modern instruction variants', () => {
    const sourceLoc = { file: 'src/test.mcrs', line: 3, col: 5 }
    const instructions: LIRInstr[] = [
      { kind: 'score_set', dst: { player: '$a', obj: '__emit' }, value: 7, sourceLoc },
      { kind: 'score_copy', dst: { player: '$b', obj: '__emit' }, src: { player: '$a', obj: '__emit' }, sourceLoc },
      { kind: 'score_add', dst: { player: '$a', obj: '__emit' }, src: { player: '$b', obj: '__emit' }, sourceLoc },
      { kind: 'score_sub', dst: { player: '$a', obj: '__emit' }, src: { player: '$b', obj: '__emit' }, sourceLoc },
      { kind: 'score_mul', dst: { player: '$a', obj: '__emit' }, src: { player: '$b', obj: '__emit' }, sourceLoc },
      { kind: 'score_div', dst: { player: '$a', obj: '__emit' }, src: { player: '$b', obj: '__emit' }, sourceLoc },
      { kind: 'score_mod', dst: { player: '$a', obj: '__emit' }, src: { player: '$b', obj: '__emit' }, sourceLoc },
      { kind: 'score_min', dst: { player: '$a', obj: '__emit' }, src: { player: '$b', obj: '__emit' }, sourceLoc },
      { kind: 'score_max', dst: { player: '$a', obj: '__emit' }, src: { player: '$b', obj: '__emit' }, sourceLoc },
      { kind: 'score_swap', a: { player: '$a', obj: '__emit' }, b: { player: '$b', obj: '__emit' }, sourceLoc },
      {
        kind: 'store_cmd_to_score',
        dst: { player: '$stored', obj: '__emit' },
        cmd: { kind: 'raw', cmd: 'say nested-store' },
        sourceLoc,
      },
      {
        kind: 'store_score_to_nbt',
        ns: 'rs:data',
        path: 'value.path',
        type: 'int',
        scale: 2,
        src: { player: '$a', obj: '__emit' },
        sourceLoc,
      },
      {
        kind: 'store_nbt_to_score',
        dst: { player: '$from_nbt', obj: '__emit' },
        ns: 'rs:data',
        path: 'value.path',
        scale: 2.5,
        sourceLoc,
      },
      { kind: 'nbt_set_literal', ns: 'rs:data', path: 'literal.path', value: '{foo:1b}', sourceLoc },
      { kind: 'nbt_copy', srcNs: 'rs:src', srcPath: 'foo', dstNs: 'rs:dst', dstPath: 'bar', sourceLoc },
      { kind: 'call', fn: 'emitns:helper', sourceLoc },
      { kind: 'call_macro', fn: 'emitns:macro_helper', storage: 'rs:macro_args', sourceLoc },
      { kind: 'call_if_matches', fn: 'emitns:matches', slot: { player: '$a', obj: '__emit' }, range: '1..5', sourceLoc },
      { kind: 'call_unless_matches', fn: 'emitns:unless_matches', slot: { player: '$a', obj: '__emit' }, range: '0', sourceLoc },
      { kind: 'call_if_score', fn: 'emitns:if_score', a: { player: '$a', obj: '__emit' }, op: 'eq', b: { player: '$b', obj: '__emit' }, sourceLoc },
      { kind: 'call_unless_score', fn: 'emitns:unless_score', a: { player: '$a', obj: '__emit' }, op: 'ne', b: { player: '$b', obj: '__emit' }, sourceLoc },
      {
        kind: 'call_context',
        fn: 'emitns:ctx',
        subcommands: [
          { kind: 'as', selector: '@a' },
          { kind: 'at', selector: '@e[type=marker]' },
          { kind: 'at_self' },
          { kind: 'positioned', x: '~1', y: '~2', z: '~3' },
          { kind: 'rotated', yaw: '~', pitch: '~10' },
          { kind: 'in', dimension: 'minecraft:the_nether' },
          { kind: 'anchored', anchor: 'eyes' },
          { kind: 'if_score', a: '$a __emit', op: 'lt', b: '$b __emit' },
          { kind: 'unless_score', a: '$a __emit', op: 'ge', b: '$b __emit' },
          { kind: 'if_matches', score: '$a __emit', range: '1..' },
          { kind: 'unless_matches', score: '$b __emit', range: '..0' },
        ],
        sourceLoc,
      },
      { kind: 'return_value', slot: { player: '$a', obj: '__emit' }, sourceLoc },
      { kind: 'macro_line', template: 'tp @s $(x) $(y) $(z)', sourceLoc },
      { kind: 'raw', cmd: 'say raw tail', sourceLoc },
    ]

    const mainFn: LIRFunction = {
      name: 'Main::Run',
      instructions,
      isMacro: false,
      macroParams: [],
    }
    const emptyFn: LIRFunction = {
      name: 'Empty',
      instructions: [],
      isMacro: false,
      macroParams: [],
    }
    const module: LIRModule = {
      functions: [mainFn, emptyFn],
      namespace: 'emitns',
      objective: '__emit',
    }

    const files = emit(module, {
      namespace: 'emitns',
      tickFunctions: ['tick_fn'],
      loadFunctions: ['bootstrap'],
      scheduleFunctions: [{ name: 'later', ticks: 5 }],
      generateSourceMap: true,
      mcVersion: McVersion.v1_21,
      eventHandlers: new Map([
        ['PlayerJoin', ['emitns:on_join']],
        ['BlockBreak', []],
        ['UnknownEvent', ['emitns:ignored']],
      ]),
    })

    expect(JSON.parse(getFile(files, 'pack.mcmeta')).pack.description).toContain('emitns')
    expect(getFile(files, 'data/emitns/function/load.mcfunction')).toBe('scoreboard objectives add __emit dummy\n')

    const main = getFile(files, 'data/emitns/function/main/run.mcfunction')
    expect(main).toContain('# src: src/test.mcrs:3')
    expect(main).toContain('scoreboard players set $a __emit 7')
    expect(main).toContain('scoreboard players operation $b __emit = $a __emit')
    expect(main).toContain('scoreboard players operation $a __emit += $b __emit')
    expect(main).toContain('scoreboard players operation $a __emit -= $b __emit')
    expect(main).toContain('scoreboard players operation $a __emit *= $b __emit')
    expect(main).toContain('scoreboard players operation $a __emit /= $b __emit')
    expect(main).toContain('scoreboard players operation $a __emit %= $b __emit')
    expect(main).toContain('scoreboard players operation $a __emit < $b __emit')
    expect(main).toContain('scoreboard players operation $a __emit > $b __emit')
    expect(main).toContain('scoreboard players operation $a __emit >< $b __emit')
    expect(main).toContain('execute store result score $stored __emit run say nested-store')
    expect(main).toContain('execute store result storage rs:data value.path int 2 run scoreboard players get $a __emit')
    expect(main).toContain('execute store result score $from_nbt __emit run data get storage rs:data value.path 2.5')
    expect(main).toContain('data modify storage rs:data literal.path set value {foo:1b}')
    expect(main).toContain('data modify storage rs:dst bar set from storage rs:src foo')
    expect(main).toContain('function emitns:helper')
    expect(main).toContain('function emitns:macro_helper with storage rs:macro_args')
    expect(main).toContain('execute if score $a __emit matches 1..5 run function emitns:matches')
    expect(main).toContain('execute unless score $a __emit matches 0 run function emitns:unless_matches')
    expect(main).toContain('execute if score $a __emit = $b __emit run function emitns:if_score')
    expect(main).toContain('execute unless score $a __emit = $b __emit run function emitns:unless_score')
    expect(main).toContain('execute as @a at @e[type=marker] at @s positioned ~1 ~2 ~3 rotated ~ ~10 in minecraft:the_nether anchored eyes if score $a __emit < $b __emit unless score $a __emit >= $b __emit if score $a __emit matches 1.. unless score $b __emit matches ..0 run function emitns:ctx')
    expect(main).toContain('scoreboard players operation $ret __emit = $a __emit')
    expect(main).toContain('$tp @s $(x) $(y) $(z)')
    expect(main).toContain('say raw tail')

    expect(getFile(files, 'data/emitns/function/empty.mcfunction')).toBe('\n')
    expect(getFile(files, 'data/emitns/function/_schedule_later.mcfunction')).toBe('schedule function emitns:later 5t\n')
    expect(JSON.parse(getFile(files, 'data/minecraft/tags/function/load.json')).values).toEqual(['emitns:load', 'emitns:bootstrap'])
    expect(JSON.parse(getFile(files, 'data/minecraft/tags/function/tick.json')).values).toEqual(['emitns:tick_fn'])
    expect(JSON.parse(getFile(files, 'data/rs/tags/function/on_player_join.json')).values).toEqual(['emitns:on_join'])
    expect(files.find(f => f.path === 'data/rs/tags/function/on_block_break.json')).toBeUndefined()

    const map = JSON.parse(getFile(files, 'data/emitns/function/main/run.sourcemap.json'))
    expect(map.generatedFile).toBe('data/emitns/function/main/run.mcfunction')
    expect(map.sources).toEqual(['src/test.mcrs'])
    expect(map.mappings[0]).toMatchObject({ line: 2, sourceLine: 3, sourceCol: 5 })
    expect(files.find(f => f.path === 'data/emitns/function/empty.sourcemap.json')).toBeUndefined()
  })

  test('falls back to legacy macro emission for pre-1.20.2 and handles empty execute context', () => {
    const module: LIRModule = {
      namespace: 'legacy',
      objective: '__legacy',
      functions: [
        {
          name: 'Legacy',
          isMacro: false,
          macroParams: [],
          instructions: [
            { kind: 'call_macro', fn: 'legacy:macro_target', storage: 'rs:macro_args' },
            { kind: 'macro_line', template: 'setblock $(x) $(y) $(z) minecraft:stone' },
            { kind: 'call_context', fn: 'legacy:plain', subcommands: [] },
            { kind: 'store_nbt_to_score', dst: { player: '$x', obj: '__legacy' }, ns: 'legacy:data', path: 'p', scale: 2 },
          ],
        },
      ],
    }

    const files = emit(module, {
      namespace: 'legacy',
      mcVersion: McVersion.v1_20,
    })

    const main = getFile(files, 'data/legacy/function/legacy.mcfunction')
    expect(main).toContain('function legacy:macro_target')
    expect(main).not.toContain('with storage')
    expect(main).toContain('setblock {storage:rs:macro_args,path:x} {storage:rs:macro_args,path:y} {storage:rs:macro_args,path:z} minecraft:stone')
    expect(main).toContain('function legacy:plain')
    expect(main).toContain('execute store result score $x __legacy run data get storage legacy:data p 2.0')
    expect(files.find(f => f.path === 'data/minecraft/tags/function/tick.json')).toBeUndefined()
  })
})
