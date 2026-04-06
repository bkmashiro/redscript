import { emit } from '../../emit'
import { compile } from '../../emit/compile'
import type { DatapackFile } from '../../emit'
import type { LIRFunction, LIRInstr, LIRModule } from '../../lir/types'
import { McVersion } from '../../types/mc-version'

function getFile(files: DatapackFile[], path: string): string {
  const file = files.find(entry => entry.path === path)
  if (!file) {
    throw new Error(`Missing file: ${path}\nFiles:\n${files.map(entry => entry.path).join('\n')}`)
  }
  return file.content
}

describe('emit/index coverage', () => {
  test('emit() covers singleton/watch/memoize/throttle/retry/benchmark branches and source maps', () => {
    const sourceLoc = { file: 'src/coverage.mcrs', line: 2, col: 1 }
    const functions: LIRFunction[] = [
      {
        name: 'watch_hp',
        isMacro: false,
        macroParams: [],
        sourceLoc,
        sourceSnippet: 'fn watch_hp() -> void',
        instructions: [{ kind: 'raw', cmd: 'say watch', sourceLoc } satisfies LIRInstr],
      },
      {
        name: 'slow_fn',
        isMacro: false,
        macroParams: [],
        sourceLoc,
        sourceSnippet: 'fn slow_fn() -> void',
        instructions: [{ kind: 'raw', cmd: 'say throttle', sourceLoc } satisfies LIRInstr],
      },
      {
        name: 'retry_fn',
        isMacro: false,
        macroParams: [],
        sourceLoc,
        sourceSnippet: 'fn retry_fn() -> int',
        instructions: [
          { kind: 'score_set', dst: { player: '$ret', obj: '__cov' }, value: 1, sourceLoc } satisfies LIRInstr,
        ],
      },
      {
        name: 'memo_fn_impl',
        isMacro: false,
        macroParams: [],
        sourceLoc,
        sourceSnippet: 'fn memo_fn_impl(n: int) -> int',
        instructions: [
          { kind: 'score_copy', dst: { player: '$ret', obj: '__cov' }, src: { player: '$p0', obj: '__cov' }, sourceLoc } satisfies LIRInstr,
        ],
      },
      {
        name: 'bench_fn_impl',
        isMacro: false,
        macroParams: [],
        sourceLoc,
        sourceSnippet: 'fn bench_fn_impl() -> int',
        instructions: [
          { kind: 'score_set', dst: { player: '$ret', obj: '__cov' }, value: 42, sourceLoc } satisfies LIRInstr,
        ],
      },
    ]

    const module: LIRModule = {
      namespace: 'cov',
      objective: '__cov',
      functions,
    }

    const files = emit(module, {
      namespace: 'cov',
      tickFunctions: ['base_tick'],
      loadFunctions: ['bootstrap'],
      watchFunctions: [{ name: 'watch_hp', objective: 'hp' }],
      singletonObjectives: ['_s_Game_phase'],
      benchmarkFunctions: ['bench_fn'],
      throttleFunctions: [{ name: 'slow_fn', ticks: 4 }],
      retryFunctions: [{ name: 'retry_fn', max: 3 }],
      memoizeFunctions: ['memo_fn'],
      generateSourceMap: true,
      mcVersion: McVersion.v1_21,
      eventHandlers: new Map([
        ['PlayerDeath', ['cov:on_death']],
      ]),
    })

    const load = getFile(files, 'data/cov/function/load.mcfunction')
    expect(load).toContain('scoreboard objectives add __cov dummy')
    expect(load).toContain('scoreboard objectives add __watch_watch_hp_prev dummy')
    expect(load).toContain('scoreboard objectives add _s_Game_phase dummy')
    expect(load).toContain('scoreboard objectives add __bench dummy')
    expect(load).toContain('scoreboard objectives add __throttle_slow_fn dummy')
    expect(load).toContain('scoreboard objectives add __retry_retry_fn dummy')
    expect(load).toContain('scoreboard objectives add __memo dummy')

    const watch = getFile(files, 'data/cov/function/__watch_watch_hp.mcfunction')
    expect(watch).toContain('execute as @a unless score @s __watch_watch_hp_prev = @s __watch_watch_hp_prev run scoreboard players operation @s __watch_watch_hp_prev = @s hp')
    expect(watch).toContain('execute as @a unless score @s hp = @s __watch_watch_hp_prev run function cov:watch_hp')

    const throttle = getFile(files, 'data/cov/function/__throttle_slow_fn.mcfunction')
    expect(throttle).toContain('scoreboard players add __throttle_slow_fn __throttle_slow_fn 1')
    expect(throttle).toContain('function cov:slow_fn_inner')

    const retry = getFile(files, 'data/cov/function/__retry_retry_fn.mcfunction')
    expect(retry).toContain('function cov:retry_fn')
    expect(retry).toContain('if score $ret __retry_retry_fn matches 0')
    expect(getFile(files, 'data/cov/function/retry_fn_start.mcfunction')).toContain('scoreboard players set __retry_retry_fn __retry_retry_fn 3')

    const memo = getFile(files, 'data/cov/function/memo_fn.mcfunction')
    expect(memo).toContain('# @memoize wrapper for memo_fn (LRU-1 cache)')
    expect(memo).toContain('function cov:memo_fn_impl')
    expect(memo).toContain('return 0')

    expect(getFile(files, 'data/cov/function/bench_fn.mcfunction')).toBe('function cov:bench_fn_impl\n')
    const benchmark = getFile(files, 'data/cov/function/__bench_bench_fn.mcfunction')
    expect(benchmark).toContain('function cov:bench_fn_impl')
    expect(benchmark).toContain('tellraw @a [{"text":"[benchmark] bench_fn: "}')

    const tick = JSON.parse(getFile(files, 'data/minecraft/tags/function/tick.json'))
    expect(tick.values).toEqual([
      'cov:base_tick',
      'cov:__watch_watch_hp',
      'cov:__throttle_slow_fn',
      'cov:__retry_retry_fn',
    ])
    expect(JSON.parse(getFile(files, 'data/minecraft/tags/function/load.json')).values).toEqual(['cov:load', 'cov:bootstrap'])
    expect(JSON.parse(getFile(files, 'data/rs/tags/function/on_player_death.json')).values).toEqual(['cov:on_death'])

    const fnMap = JSON.parse(getFile(files, 'data/cov/function/watch_hp.sourcemap.json'))
    expect(fnMap.generatedFile).toBe('data/cov/function/watch_hp.mcfunction')
    const namespaceMap = JSON.parse(getFile(files, 'cov.sourcemap.json'))
    expect(namespaceMap.mappings['cov:watch_hp']).toMatchObject({ line: 2, name: 'watch_hp' })
  })

  test('compile() drives config/singleton/display/labeled-loop emission into emit()', () => {
    const result = compile(`
      @config("damage", default: 9)
      let DAMAGE: int

      @singleton
      struct GameState { phase: int }

      struct Vec2 { x: int, y: int }

      impl Display for Vec2 {
        fn to_string(self): string {
          return f"Vec2({self.x}, {self.y})"
        }
      }

      @watch("player_hp")
      fn watch_hp() {
        say("hp changed")
      }

      @memoize
      fn memo_fn(n: int): int {
        return n + DAMAGE
      }

      @throttle(ticks=4)
      fn slow_fn() {
        say("slow")
      }

      @retry(max=2)
      fn retry_fn(): int {
        return 1
      }

      @benchmark
      fn bench_fn(): int {
        return 7
      }

      fn labeled(flag: int): void {
        let total: int = 0
        outer: while total < 3 {
          inner: while true {
            if flag == 1 {
              continue outer
            }
            break outer
          }
        }
      }

      @keep fn demo(): void {
        let state = GameState::get()
        let v: Vec2 = Vec2 { x: 3, y: 4 }
        announce(f"{v.to_string()}")
        GameState::set(state)
        watch_hp()
        slow_fn()
        let cached = memo_fn(5)
        let retrying = retry_fn()
        let bench = bench_fn()
        labeled(cached + retrying + bench)
      }
    `, {
      namespace: 'fullcov',
      config: { damage: 12 },
      generateSourceMap: true,
      filePath: 'src/fullcov.mcrs',
    })

    const load = getFile(result.files, 'data/fullcov/function/load.mcfunction')
    expect(load).toContain('_s_Game_phase')
    expect(load).toContain('__watch_watch_hp_prev')
    expect(load).toContain('__memo dummy')
    expect(load).toContain('__throttle_slow_fn dummy')
    expect(load).toContain('__retry_retry_fn dummy')
    expect(load).toContain('__bench dummy')

    expect(getFile(result.files, 'data/fullcov/function/memo_fn.mcfunction')).toContain('function fullcov:memo_fn_impl')
    expect(getFile(result.files, 'data/fullcov/function/__throttle_slow_fn.mcfunction')).toContain('function fullcov:slow_fn_inner')
    expect(getFile(result.files, 'data/fullcov/function/__retry_retry_fn.mcfunction')).toContain('function fullcov:retry_fn')
    expect(getFile(result.files, 'data/fullcov/function/__bench_bench_fn.mcfunction')).toContain('function fullcov:bench_fn_impl')

    const demo = getFile(result.files, 'data/fullcov/function/demo.mcfunction')
    expect(demo).toContain('Vec2(')
    expect(demo).toContain('scoreboard players operation')

    const labeled = getFile(result.files, 'data/fullcov/function/labeled.mcfunction')
    expect(labeled).toContain('function fullcov:')
    expect(labeled).toContain('# src: src/fullcov.mcrs:')

    const tick = JSON.parse(getFile(result.files, 'data/minecraft/tags/function/tick.json'))
    expect(tick.values).toContain('fullcov:__watch_watch_hp')
    expect(tick.values).toContain('fullcov:__throttle_slow_fn')
    expect(tick.values).toContain('fullcov:__retry_retry_fn')

    const map = JSON.parse(getFile(result.files, 'fullcov.sourcemap.json'))
    expect(map.sources).toEqual(['src/fullcov.mcrs'])
    expect(map.mappings['fullcov:demo']).toMatchObject({ name: 'demo' })
  })
})
