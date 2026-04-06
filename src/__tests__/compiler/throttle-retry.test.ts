import { compile } from '../../emit/compile'
import { Lexer } from '../../lexer'
import { Parser } from '../../parser'
import { TypeChecker } from '../../typechecker'
import type { DiagnosticError } from '../../diagnostics'

function getFile(files: Array<{ path: string; content: string }>, path: string): string {
  const file = files.find(entry => entry.path === path)
  if (!file) {
    throw new Error(`Missing file: ${path}\nFiles:\n${files.map(entry => entry.path).join('\n')}`)
  }
  return file.content
}

function parseDecorators(source: string): Array<{ name: string; args?: Record<string, unknown> }> {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  return ast.declarations[0]?.decorators ?? []
}

function typeCheck(source: string): DiagnosticError[] {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse('test')
  return new TypeChecker(source).check(ast)
}

// ---------------------------------------------------------------------------
// @throttle tests
// ---------------------------------------------------------------------------

describe('@throttle decorator', () => {
  test('parser records @throttle with ticks argument', () => {
    const decorators = parseDecorators(`
      @throttle(ticks=20)
      fn on_player_move() {}
    `)
    expect(decorators).toHaveLength(1)
    expect(decorators[0].name).toBe('throttle')
    expect(decorators[0].args?.ticks).toBe(20)
  })

  test('typechecker rejects @throttle without ticks argument', () => {
    const errors = typeCheck(`
      @throttle(ticks=0)
      fn on_player_move() {}
    `)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('@throttle')
  })

  test('typechecker rejects duplicate @throttle decorators', () => {
    const errors = typeCheck(`
      @throttle(ticks=10)
      @throttle(ticks=20)
      fn on_player_move() {}
    `)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('multiple @throttle')
  })

  test('typechecker accepts valid @throttle decorator', () => {
    const errors = typeCheck(`
      @throttle(ticks=20)
      fn on_player_move() {}
    `)
    expect(errors).toHaveLength(0)
  })

  test('emits throttle objective in load.mcfunction', () => {
    const result = compile(`
      @throttle(ticks=20)
      fn on_player_move() {
        say("moved");
      }
    `, { namespace: 'throttle_test' })

    const load = getFile(result.files, 'data/throttle_test/function/load.mcfunction')
    expect(load).toContain('scoreboard objectives add __throttle_on_player_move dummy')
  })

  test('emits throttle dispatcher mcfunction with correct scoreboard commands', () => {
    const result = compile(`
      @throttle(ticks=20)
      fn on_player_move() {
        say("moved");
      }
    `, { namespace: 'throttle_test' })

    const dispatcher = getFile(result.files, 'data/throttle_test/function/__throttle_on_player_move.mcfunction')
    expect(dispatcher).toContain('scoreboard players add __throttle_on_player_move __throttle_on_player_move 1')
    expect(dispatcher).toContain('execute if score __throttle_on_player_move __throttle_on_player_move matches 20.. run function throttle_test:on_player_move_inner')
    expect(dispatcher).toContain('execute if score __throttle_on_player_move __throttle_on_player_move matches 20.. run scoreboard players set __throttle_on_player_move __throttle_on_player_move 0')
  })

  test('registers throttle dispatcher in tick.json', () => {
    const result = compile(`
      @throttle(ticks=20)
      fn on_player_move() {
        say("moved");
      }
    `, { namespace: 'throttle_test' })

    const tick = JSON.parse(getFile(result.files, 'data/minecraft/tags/function/tick.json'))
    expect(tick.values).toContain('throttle_test:__throttle_on_player_move')
  })
})

// ---------------------------------------------------------------------------
// @retry tests
// ---------------------------------------------------------------------------

describe('@retry decorator', () => {
  test('parser records @retry with max argument', () => {
    const decorators = parseDecorators(`
      @retry(max=3)
      fn try_spawn_mob(): int { 0 }
    `)
    expect(decorators).toHaveLength(1)
    expect(decorators[0].name).toBe('retry')
    expect(decorators[0].args?.max).toBe(3)
  })

  test('typechecker rejects @retry without max argument', () => {
    const errors = typeCheck(`
      @retry(max=0)
      fn try_spawn_mob(): int { 0 }
    `)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('@retry')
  })

  test('typechecker rejects duplicate @retry decorators', () => {
    const errors = typeCheck(`
      @retry(max=3)
      @retry(max=5)
      fn try_spawn_mob(): int { 0 }
    `)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('multiple @retry')
  })

  test('typechecker accepts valid @retry decorator', () => {
    const errors = typeCheck(`
      @retry(max=3)
      fn try_spawn_mob(): int { 0 }
    `)
    expect(errors).toHaveLength(0)
  })

  test('emits retry objective in load.mcfunction', () => {
    const result = compile(`
      @retry(max=3)
      fn try_spawn_mob(): int { 0 }
    `, { namespace: 'retry_test' })

    const load = getFile(result.files, 'data/retry_test/function/load.mcfunction')
    expect(load).toContain('scoreboard objectives add __retry_try_spawn_mob dummy')
  })

  test('emits retry dispatcher mcfunction with correct scoreboard commands', () => {
    const result = compile(`
      @retry(max=3)
      fn try_spawn_mob(): int { 0 }
    `, { namespace: 'retry_test' })

    const dispatcher = getFile(result.files, 'data/retry_test/function/__retry_try_spawn_mob.mcfunction')
    expect(dispatcher).toContain('execute if score __retry_try_spawn_mob __retry_try_spawn_mob matches 1.. run function retry_test:try_spawn_mob')
    expect(dispatcher).toContain('execute if score __retry_try_spawn_mob __retry_try_spawn_mob matches 1.. if score $ret __retry_try_spawn_mob matches 0 run scoreboard players remove __retry_try_spawn_mob __retry_try_spawn_mob 1')
    expect(dispatcher).toContain('execute if score __retry_try_spawn_mob __retry_try_spawn_mob matches 1.. unless score $ret __retry_try_spawn_mob matches 0 run scoreboard players set __retry_try_spawn_mob __retry_try_spawn_mob 0')
  })

  test('emits retry start helper function with max count', () => {
    const result = compile(`
      @retry(max=3)
      fn try_spawn_mob(): int { 0 }
    `, { namespace: 'retry_test' })

    const start = getFile(result.files, 'data/retry_test/function/try_spawn_mob_start.mcfunction')
    expect(start).toContain('scoreboard players set __retry_try_spawn_mob __retry_try_spawn_mob 3')
  })

  test('registers retry dispatcher in tick.json', () => {
    const result = compile(`
      @retry(max=3)
      fn try_spawn_mob(): int { 0 }
    `, { namespace: 'retry_test' })

    const tick = JSON.parse(getFile(result.files, 'data/minecraft/tags/function/tick.json'))
    expect(tick.values).toContain('retry_test:__retry_try_spawn_mob')
  })
})
