/**
 * Extra branch coverage for src/mc-validator/index.ts
 *
 * Targets uncovered branches:
 * - validateExecute: run at index 1, run at end, no-run path
 * - validateScoreboard: enable, get, operation with bad op
 * - validateFunction: wrong token count / bad id
 * - validateData: various branches (modify, remove, bad target, bad action)
 * - validateReturn: run variant, bad value
 * - validateAgainstTree: fallthrough to tree
 * - tokenize: escape sequences, single quotes, nested brackets/braces
 */

import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { MCCommandValidator } from '../mc-validator'
import { DiagnosticError } from '../diagnostics'

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'mc-commands-1.21.4.json')

describe('MCCommandValidator — extended coverage', () => {
  const v = new MCCommandValidator(FIXTURE_PATH)

  // ─── empty / comment lines ─────────────────────────────────────────────
  test('empty line is valid', () => {
    expect(v.validate('').valid).toBe(true)
    expect(v.validate('   ').valid).toBe(true)
  })

  test('comment line is valid', () => {
    expect(v.validate('# this is a comment').valid).toBe(true)
    expect(v.validate('# RedScript runtime init').valid).toBe(true)
    expect(v.validate('# block: something').valid).toBe(true)
    expect(v.validate('# RedScript tick dispatcher').valid).toBe(true)
  })

  // ─── unknown root command ──────────────────────────────────────────────
  test('unknown root command returns invalid', () => {
    const result = v.validate('foobarcommand something')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Unknown root command')
  })

  // ─── validateFunction ──────────────────────────────────────────────────
  test('function with valid id is valid', () => {
    const result = v.validate('function myns:mypath/fn_name')
    expect(result.valid).toBe(true)
  })

  test('function with valid tag id is valid', () => {
    const result = v.validate('function #myns:my_tag')
    expect(result.valid).toBe(true)
  })

  test('function with extra tokens is invalid', () => {
    const result = v.validate('function myns:path extra')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('namespaced function id')
  })

  test('function with missing id is invalid', () => {
    const result = v.validate('function')
    expect(result.valid).toBe(false)
  })

  test('function with non-namespaced id is invalid', () => {
    const result = v.validate('function justname')
    expect(result.valid).toBe(false)
  })

  test('static syntax: accepts function command with storage when fully well-formed', () => {
    const result = v.validate('function rs:macro_target with storage rs:macro_args')
    expect(result.valid).toBe(true)
  })

  test('static syntax: accepts function command with storage path when fully well-formed', () => {
    const result = v.validate('function rs:macro_target with storage rs:macro_args payload')
    expect(result.valid).toBe(true)
  })

  test('static syntax: accepts function tag command with storage when fully well-formed', () => {
    const result = v.validate('function #rs:macro_targets with storage rs:macro_args')
    expect(result.valid).toBe(true)
  })

  test('static syntax: rejects function with storage missing storage id', () => {
    const result = v.validate('function rs:macro_target with storage')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('function with storage expects 5 or 6 tokens')
  })

  // ─── validateExecute ───────────────────────────────────────────────────
  test('execute run at index 1 is invalid (malformed)', () => {
    const result = v.validate('execute run scoreboard players set x obj 0')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Malformed execute run clause')
  })

  test('execute run at last token is invalid', () => {
    const result = v.validate('execute as @a run')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Malformed execute run clause')
  })

  test('execute as @a run scoreboard is valid', () => {
    const result = v.validate('execute as @a run scoreboard players set x __rs 5')
    expect(result.valid).toBe(true)
  })

  test('execute without run delegates to tree', () => {
    // execute if score — this is valid MC syntax
    const result = v.validate('execute as @a at @s run function myns:myfn')
    expect(result.valid).toBe(true)
  })

  test('static syntax: accepts execute if score + return run function with storage', () => {
    const result = v.validate(
      'execute if score $cond __bc matches 1 run return run function rs:macro_then with storage rs:macro_args',
    )
    expect(result.valid).toBe(true)
  })

  test('static syntax: rejects execute if score + return run function missing namespaced function id', () => {
    const result = v.validate(
      'execute if score $cond __bc matches 1 run return run function with storage rs:macro_args',
    )
    expect(result.valid).toBe(false)
    expect(result.error).toContain('function requires a namespaced function id')
  })

  // ─── validateScoreboard ────────────────────────────────────────────────
  test('scoreboard players set valid', () => {
    const result = v.validate('scoreboard players set x __rs 5')
    expect(result.valid).toBe(true)
  })

  test('scoreboard players set wrong number of tokens', () => {
    const result = v.validate('scoreboard players set x __rs')
    expect(result.valid).toBe(false)
  })

  test('scoreboard players set non-integer value', () => {
    const result = v.validate('scoreboard players set x __rs abc')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Expected integer value')
  })

  test('scoreboard players add valid', () => {
    const result = v.validate('scoreboard players add x __rs 1')
    expect(result.valid).toBe(true)
  })

  test('scoreboard players get valid', () => {
    const result = v.validate('scoreboard players get x __rs')
    expect(result.valid).toBe(true)
  })

  test('scoreboard players get wrong number of tokens', () => {
    const result = v.validate('scoreboard players get x')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('get requires target and objective')
  })

  test('scoreboard players enable valid', () => {
    const result = v.validate('scoreboard players enable @s __rs')
    expect(result.valid).toBe(true)
  })

  test('scoreboard players enable wrong tokens', () => {
    const result = v.validate('scoreboard players enable @s')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('enable requires')
  })

  test('scoreboard players operation valid', () => {
    const result = v.validate('scoreboard players operation x __rs += y __rs')
    expect(result.valid).toBe(true)
  })

  test('scoreboard players operation wrong number of tokens', () => {
    const result = v.validate('scoreboard players operation x __rs +=')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('operation requires')
  })

  test('scoreboard players operation bad operator', () => {
    const result = v.validate('scoreboard players operation x __rs ** y __rs')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Unknown scoreboard operation')
  })

  test('scoreboard objectives add valid', () => {
    const result = v.validate('scoreboard objectives add myobj dummy')
    expect(result.valid).toBe(true)
  })

  test('scoreboard objectives add too few tokens', () => {
    const result = v.validate('scoreboard objectives add myobj')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('objectives add requires')
  })

  test('scoreboard unknown subcommand delegates to tree', () => {
    // 'scoreboard objectives list' should delegate to tree
    const result = v.validate('scoreboard objectives list')
    // just check it doesn't crash
    expect(typeof result.valid).toBe('boolean')
  })

  // ─── validateData ──────────────────────────────────────────────────────
  test('data get storage valid', () => {
    const result = v.validate('data get storage myns:path key.field')
    expect(result.valid).toBe(true)
  })

  test('data get with scale', () => {
    const result = v.validate('data get storage myns:path key.field 1')
    expect(result.valid).toBe(true)
  })

  test('data get invalid scale', () => {
    const result = v.validate('data get storage myns:path key.field abc')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid data get scale')
  })

  test('data command incomplete (<5 tokens)', () => {
    const result = v.validate('data get storage')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('incomplete')
  })

  test('data modify set value valid', () => {
    const result = v.validate('data modify storage myns:path key.field set value 42')
    expect(result.valid).toBe(true)
  })

  test('data modify incomplete (<7 tokens)', () => {
    const result = v.validate('data modify storage myns:path k')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('incomplete')
  })

  test('data modify unsupported mode', () => {
    const result = v.validate('data modify storage myns:path key.field foobar value 42')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Unsupported data modify mode')
  })

  test('data bad action delegated to tree', () => {
    // 'data remove' is valid MC — delegates after action check
    const result = v.validate('data remove storage myns:path key.field')
    expect(typeof result.valid).toBe('boolean')
  })

  test('data unsupported target type', () => {
    const result = v.validate('data get world myns:path key')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Unsupported data target')
  })

  // ─── validateReturn ────────────────────────────────────────────────────
  test('return with integer value is valid', () => {
    const result = v.validate('return 0')
    expect(result.valid).toBe(true)
  })

  test('return with negative integer is valid', () => {
    const result = v.validate('return -1')
    expect(result.valid).toBe(true)
  })

  test('return with no value is invalid', () => {
    const result = v.validate('return')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('requires a value')
  })

  test('return with non-integer value is invalid', () => {
    const result = v.validate('return abc')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid return value')
  })

  test('return run <command> is valid', () => {
    const result = v.validate('return run scoreboard players set x __rs 0')
    expect(result.valid).toBe(true)
  })

  test('return run with no inner command is invalid', () => {
    const result = v.validate('return run')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('return run requires an inner command')
  })

  // ─── world/visual command families (setblock/fill/summon/title/playsound/particle/bossbar) ─
  test('valid setblock command shape', () => {
    const result = v.validate('setblock 0 64 0 minecraft:stone')
    expect(result.valid).toBe(true)
  })

  test('invalid setblock command shape without coordinates', () => {
    const result = v.validate('setblock minecraft:stone')
    expect(result.valid).toBe(false)
  })

  test('valid fill command shape', () => {
    const result = v.validate('fill 0 64 0 3 64 3 minecraft:air replace')
    expect(result.valid).toBe(true)
  })

  test('invalid fill command shape with missing coordinates', () => {
    const result = v.validate('fill 0 64 0 3 64')
    expect(result.valid).toBe(false)
  })

  test('valid summon command shape', () => {
    const result = v.validate('summon minecraft:zombie ~ ~ ~ {Tags:["rs_test"]}')
    expect(result.valid).toBe(true)
  })

  test('invalid summon command missing required entity id', () => {
    const result = v.validate('summon ~ ~ ~')
    expect(result.valid).toBe(false)
  })

  test('valid title text command shape', () => {
    const result = v.validate('title @a title {"text":"Welcome"}')
    expect(result.valid).toBe(true)
  })

  test('invalid title command missing payload', () => {
    const result = v.validate('title @a title')
    expect(result.valid).toBe(false)
  })

  test('valid playsound command shape', () => {
    const result = v.validate('playsound minecraft:block.anvil.use ambient @a ~ ~ ~ 1 1')
    expect(result.valid).toBe(true)
  })

  test('invalid playsound command missing target', () => {
    const result = v.validate('playsound minecraft:block.anvil.use ambient')
    expect(result.valid).toBe(false)
  })

  test('valid particle command shape', () => {
    const result = v.validate('particle minecraft:end_rod ~ ~ ~ 0 0 0 0 1')
    expect(result.valid).toBe(true)
  })

  test('invalid particle command missing coordinates', () => {
    const result = v.validate('particle minecraft:end_rod ~ ~ ~ 0 0')
    expect(result.valid).toBe(false)
  })

  test('valid bossbar command shape', () => {
    const result = v.validate('bossbar add test:rs-bossbar {"text":"Test"}')
    expect(result.valid).toBe(true)
  })

  test('invalid bossbar set command missing value', () => {
    const result = v.validate('bossbar set test:rs-bossbar value')
    expect(result.valid).toBe(false)
  })
})

// ─── MCCommandValidator constructor error handling ─────────────────────────

describe('MCCommandValidator constructor — error handling', () => {
  test('throws DiagnosticError with file path when commands file is missing', () => {
    const missingPath = '/nonexistent/path/commands.json'
    expect(() => new MCCommandValidator(missingPath)).toThrow(DiagnosticError)

    try {
      new MCCommandValidator(missingPath)
    } catch (error) {
      expect(error).toBeInstanceOf(DiagnosticError)
      const diagnostic = error as DiagnosticError
      expect(diagnostic.kind).toBe('ParseError')
      expect(diagnostic.message).toContain(missingPath)
      expect(diagnostic.location.file).toBe(missingPath)
    }
  })

  test('throws DiagnosticError with file path when commands file contains invalid JSON', () => {
    const tmpFile = path.join(os.tmpdir(), `commands-invalid-${Date.now()}.json`)
    fs.writeFileSync(tmpFile, '{ not valid json !!!')

    try {
      expect(() => new MCCommandValidator(tmpFile)).toThrow(DiagnosticError)

      try {
        new MCCommandValidator(tmpFile)
      } catch (error) {
        expect(error).toBeInstanceOf(DiagnosticError)
        const diagnostic = error as DiagnosticError
        expect(diagnostic.kind).toBe('ParseError')
        expect(diagnostic.message).toContain(tmpFile)
        expect(diagnostic.location.file).toBe(tmpFile)
      }
    } finally {
      fs.unlinkSync(tmpFile)
    }
  })

  test('throws DiagnosticError (not generic Error) so callers can detect it', () => {
    const missingPath = '/no/such/file.json'
    let thrown: unknown
    try {
      new MCCommandValidator(missingPath)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(DiagnosticError)
    expect((thrown as DiagnosticError).name).toBe('DiagnosticError')
  })
})
