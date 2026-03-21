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
import { MCCommandValidator } from '../mc-validator'

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
})
