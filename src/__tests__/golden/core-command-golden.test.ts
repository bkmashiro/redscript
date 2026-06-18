import { compile } from '../../compile'
import type { DatapackFile } from '../../emit'

function normalize(content: string): string {
  return content
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim()
}

function pick(files: DatapackFile[], paths: string[]): Record<string, string> {
  const byPath = new Map(files.map(file => [file.path, normalize(file.content)]))
  const out: Record<string, string> = {}

  for (const path of paths) {
    const content = byPath.get(path)
    if (content === undefined) {
      throw new Error(`Missing golden file: ${path}\nAvailable files:\n${files.map(file => file.path).sort().join('\n')}`)
    }
    out[path] = content
  }

  return out
}

describe('core command golden outputs', () => {
  test('scoreboard arithmetic command shape stays stable', () => {
    const result = compile(`
      fn test_arith() {
        let x: int = scoreboard_get("#x", "golden_obj")
        scoreboard_set("#out", "golden_obj", x + 2 * 3)
      }
    `, { namespace: 'golden_arith' })

    expect(pick(result.files, [
      'data/golden_arith/function/test_arith.mcfunction',
    ])).toEqual({
      'data/golden_arith/function/test_arith.mcfunction': [
        'execute store result score $test_arith_t0 __golden_arith run scoreboard players get #x golden_obj',
        'scoreboard players operation $test_arith_t3 __golden_arith = $test_arith_t0 __golden_arith',
        'scoreboard players add $test_arith_t3 __golden_arith 6',
        'execute store result score #out golden_obj run scoreboard players get $test_arith_t3 __golden_arith',
      ].join('\n'),
    })
  })

  test('if/else lowers through scoreboard comparison command shape', () => {
    const result = compile(`
      fn test_branch() {
        let x: int = scoreboard_get("#x", "golden_obj")
        if (x > 5) {
          scoreboard_set("#out", "golden_obj", 1)
        } else {
          scoreboard_set("#out", "golden_obj", 0)
        }
      }
    `, { namespace: 'golden_branch' })

    expect(pick(result.files, [
      'data/golden_branch/function/test_branch.mcfunction',
      'data/golden_branch/function/test_branch__then_0.mcfunction',
      'data/golden_branch/function/test_branch__else_2.mcfunction',
    ])).toEqual({
      'data/golden_branch/function/test_branch.mcfunction': [
        'execute store result score $test_branch_t0 __golden_branch run scoreboard players get #x golden_obj',
        'scoreboard players set $__const_5 __golden_branch 5',
        'execute store success score $test_branch_t2 __golden_branch if score $test_branch_t0 __golden_branch > $__const_5 __golden_branch',
        'execute if score $test_branch_t2 __golden_branch matches 1 run return run function golden_branch:test_branch__then_0',
        'function golden_branch:test_branch__else_2',
      ].join('\n'),
      'data/golden_branch/function/test_branch__then_0.mcfunction': [
        'scoreboard players set #out golden_obj 1',
        'function golden_branch:test_branch__merge_1',
      ].join('\n'),
      'data/golden_branch/function/test_branch__else_2.mcfunction': [
        'scoreboard players set #out golden_obj 0',
        'function golden_branch:test_branch__merge_1',
      ].join('\n'),
    })
  })

  test('execute context helper call command shape stays stable', () => {
    const result = compile(`
      fn helper() {
        raw("scoreboard players add #ctx_hits golden_obj 1")
      }

      fn run_ctx() {
        as @e[type=armor_stand,tag=golden_ctx] at @s {
          helper()
        }
      }
    `, { namespace: 'golden_ctx' })

    expect(pick(result.files, [
      'data/golden_ctx/function/run_ctx.mcfunction',
      'data/golden_ctx/function/run_ctx__exec_t0.mcfunction',
      'data/golden_ctx/function/helper.mcfunction',
    ])).toEqual({
      'data/golden_ctx/function/run_ctx.mcfunction': 'execute as @e[type=armor_stand,tag=golden_ctx] at @s run function golden_ctx:run_ctx__exec_t0',
      'data/golden_ctx/function/run_ctx__exec_t0.mcfunction': 'function golden_ctx:helper',
      'data/golden_ctx/function/helper.mcfunction': 'scoreboard players add #ctx_hits golden_obj 1',
    })
  })

  test('macro with storage command shape stays stable', () => {
    const result = compile(`
      @keep
      fn __macro_apply() {
        raw("$scoreboard players set #macro_out golden_obj $(value)")
      }

      fn run_macro() {
        raw("data modify storage rs:golden value set value 7")
        raw("function __NS__:__macro_apply with storage rs:golden")
      }
    `, { namespace: 'golden_macro' })

    expect(pick(result.files, [
      'data/golden_macro/function/__macro_apply.mcfunction',
      'data/golden_macro/function/run_macro.mcfunction',
    ])).toEqual({
      'data/golden_macro/function/__macro_apply.mcfunction': '$scoreboard players set #macro_out golden_obj $(value)',
      'data/golden_macro/function/run_macro.mcfunction': [
        'data modify storage rs:golden value set value 7',
        'function golden_macro:__macro_apply with storage rs:golden',
      ].join('\n'),
    })
  })

  test('load and tick tag/function command shape stays stable', () => {
    const result = compile(`
      @load
      fn boot() {
        scoreboard_set("#load", "golden_obj", 1)
      }

      @tick
      fn ticking() {
        let t: int = scoreboard_get("#tick", "golden_obj")
        scoreboard_set("#tick", "golden_obj", t + 1)
      }
    `, { namespace: 'golden_lifecycle' })

    expect(pick(result.files, [
      'data/golden_lifecycle/function/boot.mcfunction',
      'data/golden_lifecycle/function/ticking.mcfunction',
      'data/minecraft/tags/function/load.json',
      'data/minecraft/tags/function/tick.json',
    ])).toEqual({
      'data/golden_lifecycle/function/boot.mcfunction': 'scoreboard players set #load golden_obj 1',
      'data/golden_lifecycle/function/ticking.mcfunction': [
        'execute store result score $ticking_t0 __golden_lifecycle run scoreboard players get #tick golden_obj',
        'scoreboard players operation $ticking_t2 __golden_lifecycle = $ticking_t0 __golden_lifecycle',
        'scoreboard players add $ticking_t2 __golden_lifecycle 1',
        'execute store result score #tick golden_obj run scoreboard players get $ticking_t2 __golden_lifecycle',
      ].join('\n'),
      'data/minecraft/tags/function/load.json': [
        '{',
        '  "values": [',
        '    "golden_lifecycle:load",',
        '    "golden_lifecycle:boot"',
        '  ]',
        '}',
      ].join('\n'),
      'data/minecraft/tags/function/tick.json': [
        '{',
        '  "values": [',
        '    "golden_lifecycle:ticking"',
        '  ]',
        '}',
      ].join('\n'),
    })
  })
})
