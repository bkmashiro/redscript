/**
 * Tests for the @singleton decorator — global state singleton structs.
 *
 * Covers:
 * 1. Parser: @singleton recognized before struct
 * 2. AST: isSingleton flag set on StructDecl
 * 3. HIR: isSingleton propagated to HIRStruct
 * 4. TypeChecker: synthetic get/set methods registered; no type errors
 * 5. Emit (end-to-end): load.mcfunction includes objective adds, get/set .mcfunction files generated
 */

import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { compile } from '../emit/compile'
import { TypeChecker } from '../typechecker'
import { lowerToHIR } from '../hir/lower'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parse(source: string) {
  const tokens = new Lexer(source).tokenize()
  return new Parser(tokens, source).parse()
}

function typeCheck(source: string) {
  const program = parse(source)
  const checker = new TypeChecker(source)
  return checker.check(program)
}

function compileAndGetFiles(source: string, namespace = 'test') {
  const result = compile(source, { namespace })
  expect(result.success).toBe(true)
  return result.files
}

function getFile(files: { path: string; content: string }[], pathSubstr: string): string | undefined {
  return files.find(f => f.path.includes(pathSubstr))?.content
}

// ---------------------------------------------------------------------------
// Test 1: Parser recognizes @singleton before struct
// ---------------------------------------------------------------------------

describe('@singleton: parser', () => {
  test('parses @singleton struct with isSingleton=true', () => {
    const program = parse(`
      @singleton
      struct GameState {
        phase: int,
        tick_count: int,
      }
    `)
    expect(program.structs).toHaveLength(1)
    expect(program.structs[0].name).toBe('GameState')
    expect(program.structs[0].isSingleton).toBe(true)
    expect(program.structs[0].fields).toHaveLength(2)
  })

  test('plain struct without @singleton has isSingleton=undefined', () => {
    const program = parse(`
      struct Vec2 { x: int, y: int }
    `)
    expect(program.structs[0].isSingleton).toBeUndefined()
  })

  test('@singleton struct fields are correctly parsed', () => {
    const program = parse(`
      @singleton
      struct Config {
        difficulty: int,
        player_count: int,
        game_running: int,
      }
    `)
    const s = program.structs[0]
    expect(s.isSingleton).toBe(true)
    expect(s.fields.map(f => f.name)).toEqual(['difficulty', 'player_count', 'game_running'])
    expect(s.fields.every(f => f.type.kind === 'named' && f.type.name === 'int')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Test 2: HIR lowering propagates isSingleton
// ---------------------------------------------------------------------------

describe('@singleton: HIR lowering', () => {
  test('lowerToHIR preserves isSingleton flag', () => {
    const program = parse(`
      @singleton
      struct Counter { value: int }
    `)
    const hir = lowerToHIR(program)
    expect(hir.structs).toHaveLength(1)
    expect(hir.structs[0].name).toBe('Counter')
    expect(hir.structs[0].isSingleton).toBe(true)
  })

  test('plain struct isSingleton stays undefined in HIR', () => {
    const program = parse(`
      struct Plain { x: int }
    `)
    const hir = lowerToHIR(program)
    expect(hir.structs[0].isSingleton).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Test 3: TypeChecker — no errors for GameState::get() / GameState::set(gs)
// ---------------------------------------------------------------------------

describe('@singleton: typechecker', () => {
  test('GameState::get() and GameState::set(gs) pass type-checking', () => {
    const errors = typeCheck(`
      @singleton
      struct GameState {
        phase: int,
        tick_count: int,
      }
      @keep fn update(): void {
        let gs = GameState::get()
        GameState::set(gs)
      }
    `)
    expect(errors).toHaveLength(0)
  })

  test('calling unknown method on singleton struct is a type error', () => {
    const errors = typeCheck(`
      @singleton
      struct Counter { value: int }
      @keep fn test(): void {
        Counter::reset()
      }
    `)
    expect(errors.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Test 4: End-to-end — load.mcfunction has scoreboard objectives
// ---------------------------------------------------------------------------

describe('@singleton: emit — load.mcfunction', () => {
  test('load.mcfunction includes scoreboard objective add for each field', () => {
    const files = compileAndGetFiles(`
      @singleton
      struct GameState {
        phase: int,
        tick_count: int,
        player_count: int,
      }
      @keep fn dummy(): void {}
    `)
    const load = getFile(files, 'load.mcfunction') ?? ''
    expect(load).toContain('scoreboard objectives add')
    // MC scoreboard objective names are limited to 16 chars.
    // "_s_" (3) + "_" (1) = 4 fixed chars, leaving 12 for struct+field combined.
    // GameState (9) + field > 12 → truncated: _s_ + Game(4) + _ + field.slice(0,8)
    expect(load).toContain('_s_Game_phase')
    expect(load).toContain('_s_Game_tick_cou')
    expect(load).toContain('_s_Game_player_c')
  })

  test('objective name fits exactly at the 12-char budget — no truncation', () => {
    // "Foo" (3) + "val_field" (9) = 12 → fits: _s_Foo_val_field (16 chars total)
    const files = compileAndGetFiles(`
      @singleton
      struct Foo {
        val_field: int,
      }
      @keep fn dummy(): void {}
    `)
    const load = getFile(files, 'load.mcfunction') ?? ''
    expect(load).toContain('_s_Foo_val_field')
  })

  test('objective name one over budget — truncation kicks in', () => {
    // "FooB" (4) + "val_field" (9) = 13 > 12 → truncated: _s_FooB_val_fiel (16 chars)
    const files = compileAndGetFiles(`
      @singleton
      struct FooB {
        val_field: int,
      }
      @keep fn dummy(): void {}
    `)
    const load = getFile(files, 'load.mcfunction') ?? ''
    expect(load).toContain('_s_FooB_val_fiel')
    expect(load).not.toContain('_s_FooB_val_field')
  })

  test('all generated objective names are at most 16 characters', () => {
    const files = compileAndGetFiles(`
      @singleton
      struct VeryLongStructName {
        very_long_field_name: int,
        another_long_field: int,
      }
      @keep fn dummy(): void {}
    `)
    const load = getFile(files, 'load.mcfunction') ?? ''
    const objectiveNames = [...load.matchAll(/scoreboard objectives add (\S+)/g)].map(m => m[1])
    expect(objectiveNames.length).toBeGreaterThan(0)
    for (const name of objectiveNames) {
      expect(name.length).toBeLessThanOrEqual(16)
    }
  })

  test('short struct and field names produce no truncation', () => {
    // "Ab" (2) + "x" (1) = 3 → _s_Ab_x (7 chars, well under limit)
    const files = compileAndGetFiles(`
      @singleton
      struct Ab {
        x: int,
      }
      @keep fn dummy(): void {}
    `)
    const load = getFile(files, 'load.mcfunction') ?? ''
    expect(load).toContain('_s_Ab_x')
  })
})

// ---------------------------------------------------------------------------
// Test 5: End-to-end — GameState::get mcfunction reads from scoreboard
// ---------------------------------------------------------------------------

describe('@singleton: emit — get/set functions', () => {
  test('GameState/get.mcfunction is generated', () => {
    const files = compileAndGetFiles(`
      @singleton
      struct GameState {
        phase: int,
        tick_count: int,
      }
      @keep fn dummy(): void {}
    `)
    const getPaths = files.filter(f => f.path.includes('gamestate/get'))
    expect(getPaths.length).toBeGreaterThan(0)
  })

  test('GameState/set.mcfunction is generated', () => {
    const files = compileAndGetFiles(`
      @singleton
      struct GameState {
        phase: int,
        tick_count: int,
      }
      @keep fn dummy(): void {}
    `)
    const setPaths = files.filter(f => f.path.includes('gamestate/set'))
    expect(setPaths.length).toBeGreaterThan(0)
  })

  test('GameState/get reads fields from their scoreboard objectives', () => {
    const files = compileAndGetFiles(`
      @singleton
      struct GameState {
        phase: int,
      }
      @keep fn dummy(): void {}
    `)
    const getContent = getFile(files, 'gamestate/get') ?? ''
    // Should copy from __sng in the field objective to $__rf_phase
    // (objective name is truncated: _s_Game_phase for GameState/phase)
    expect(getContent).toContain('_s_Game_phase')
    expect(getContent).toContain('__sng')
  })

  test('GameState/set writes fields to their scoreboard objectives', () => {
    const files = compileAndGetFiles(`
      @singleton
      struct GameState {
        phase: int,
      }
      @keep fn dummy(): void {}
    `)
    const setContent = getFile(files, 'gamestate/set') ?? ''
    // Should copy from $p0 to __sng in the field objective
    expect(setContent).toContain('_s_Game_phase')
  })

  test('full update_state pattern compiles without errors', () => {
    expect(() => compile(`
      @singleton
      struct GameState {
        phase: int,
        tick_count: int,
        player_count: int,
      }
      @keep fn update_state(): void {
        let gs = GameState::get()
        gs.phase = 1
        gs.tick_count = gs.tick_count + 1
        GameState::set(gs)
      }
    `, { namespace: 'test' })).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Test 6: Multiple singletons coexist
// ---------------------------------------------------------------------------

describe('@singleton: multiple singletons', () => {
  test('two singleton structs both get objectives in load.mcfunction', () => {
    const files = compileAndGetFiles(`
      @singleton
      struct GameState { phase: int }
      @singleton
      struct Config { difficulty: int }
      @keep fn dummy(): void {}
    `)
    const load = getFile(files, 'load.mcfunction') ?? ''
    // GameState → _s_Game_phase, Config → _s_Conf_difficul (both truncated to ≤16 chars)
    expect(load).toContain('_s_Game_phase')
    expect(load).toContain('_s_Conf_difficul')
  })
})

// ---------------------------------------------------------------------------
// Test 7: Singleton with non-singleton struct — no interference
// ---------------------------------------------------------------------------

describe('@singleton: no interference with plain structs', () => {
  test('plain struct is not treated as singleton', () => {
    const files = compileAndGetFiles(`
      struct Vec2 { x: int, y: int }
      @singleton
      struct Counter { value: int }
      @keep fn dummy(): void {}
    `)
    const load = getFile(files, 'load.mcfunction') ?? ''
    // Counter fields get objectives (_s_Counter_value is exactly 16 chars, fits)
    expect(load).toContain('_s_Counter_value')
    // Vec2 fields do NOT
    expect(load).not.toContain('Vec2')
    // No get/set for Vec2
    const vec2GetPath = files.filter(f => f.path.includes('vec2/get'))
    expect(vec2GetPath).toHaveLength(0)
  })
})
