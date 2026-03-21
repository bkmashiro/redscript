import { compile } from '../emit/compile'
import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { TypeChecker } from '../typechecker'
import type { DiagnosticError } from '../diagnostics'

function getFile(files: Array<{ path: string; content: string }>, path: string): string {
  const file = files.find(entry => entry.path === path)
  if (!file) {
    throw new Error(`Missing file: ${path}\nFiles:\n${files.map(entry => entry.path).join('\n')}`)
  }
  return file.content
}

function typeCheck(source: string): DiagnosticError[] {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  return new TypeChecker(source).check(ast)
}

describe('@watch decorator', () => {
  test('typechecker accepts parameterless handlers and rejects parameters', () => {
    expect(typeCheck(`
      @watch("rs.kills")
      fn on_kill() {
        say("kill");
      }
    `)).toHaveLength(0)

    const errors = typeCheck(`
      @watch("rs.kills")
      fn on_kill(player: Player) {}
    `)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('cannot declare parameters')
  })

  test('emits watcher objective, dispatcher, and tick registration', () => {
    const result = compile(`
      @watch("rs.kills")
      fn on_kill() {
        let k: int = scoreboard_get("@s", "rs.kills");
        if (k >= 10) {
          title("@s", "Achievement Unlocked!");
        }
      }
    `, { namespace: 'watch_test' })

    const load = getFile(result.files, 'data/watch_test/function/load.mcfunction')
    const tick = JSON.parse(getFile(result.files, 'data/minecraft/tags/function/tick.json'))
    const watch = getFile(result.files, 'data/watch_test/function/__watch_on_kill.mcfunction')

    expect(load).toContain('scoreboard objectives add __watch_on_kill_prev dummy')
    expect(tick.values).toContain('watch_test:__watch_on_kill')
    expect(watch).toContain('execute as @a unless score @s __watch_on_kill_prev = @s __watch_on_kill_prev run scoreboard players operation @s __watch_on_kill_prev = @s rs.kills')
    expect(watch).toContain('execute as @a unless score @s rs.kills = @s __watch_on_kill_prev run function watch_test:on_kill')
    expect(watch).toContain('execute as @a unless score @s rs.kills = @s __watch_on_kill_prev run scoreboard players operation @s __watch_on_kill_prev = @s rs.kills')
  })
})
