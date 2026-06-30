import * as fs from 'fs'
import * as path from 'path'

import { compile } from '../compile'
import { MCCommandValidator } from '../mc-validator'

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'mc-commands-1.21.4.json')
const EXAMPLES = ['shop', 'quiz', 'turret']

function getCommands(source: string, namespace = 'test'): string[] {
  const result = compile(source, { namespace })
  expect(result.success).toBe(true)
  expect(result.files).toBeDefined()

  return (result.files ?? [])
    .filter(file => file.path.endsWith('.mcfunction'))
    .flatMap(file => file.content.split('\n'))
    .filter(line => line.trim().length > 0)
    .filter(line => !line.startsWith('#'))                     // skip comments
}

function validateSource(
  validator: MCCommandValidator,
  source: string,
  namespace: string
): Array<{ cmd: string, error?: string }> {
  return getCommands(source, namespace)
    .map(cmd => ({ cmd, result: validator.validate(cmd) }))
    .filter(entry => !entry.result.valid)
    .map(entry => ({ cmd: entry.cmd, error: entry.result.error }))
}

describe('MC Command Syntax Validation', () => {
  const validator = new MCCommandValidator(FIXTURE_PATH)

  EXAMPLES.forEach(name => {
    test(`${name}.mcrs generates valid MC commands`, () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'examples', `${name}.mcrs`), 'utf-8')
      const errors = validateSource(validator, src, name)

      if (errors.length > 0) {
        console.log('Invalid commands:', errors)
      }

      expect(errors).toHaveLength(0)
    })
  })

  test('string interpolation generates valid tellraw', () => {
    const errors = validateSource(validator, `
fn chat() {
    let score: int = 7;
    say("You have \${score} points");
}
`, 'interpolation')

    expect(errors).toHaveLength(0)
  })

  test('f-strings generate valid tellraw/title commands', () => {
    const errors = validateSource(validator, `
fn chat() {
    let score: int = 7;
    say(f"You have {score} points");
    tellraw(@a, f"Score: {score}");
    actionbar(@s, f"Score: {score}");
    title(@s, f"Score: {score}");
}
`, 'f-string')

    expect(errors).toHaveLength(0)
  })

  test('array operations generate valid data commands', () => {
    const errors = validateSource(validator, `
fn arrays() {
    let arr: int[] = [];
    arr.push(4);
    arr.push(9);
    let popped: int = arr.pop();
    let len: int = arr.len;

    scoreboard_set("arrays", "len", len);
    scoreboard_set("arrays", "last", popped);
}
`, 'arrays')

    expect(errors).toHaveLength(0)
  })

  test('match generates valid execute commands', () => {
    const errors = validateSource(validator, `
fn choose() {
    let choice: int = 2;
    match (choice) {
        1 => { say("one"); }
        2 => { say("two"); }
        _ => { say("other"); }
    }
}
`, 'matching')

    expect(errors).toHaveLength(0)
  })

  test('generated execute + scoreboard combinations validate statically', () => {
    const source = `
fn compare_and_branch() {
    let input: int = scoreboard_get("#input", "core_static")
    if (input > 5) {
        scoreboard_set("#out", "core_static", input + 1)
    } else {
        scoreboard_set("#out", "core_static", input - 1)
    }
}
`
    const commands = getCommands(source, 'exec_score_static')
    const errors = commands
      .map(cmd => ({ cmd, result: validator.validate(cmd) }))
      .filter(entry => !entry.result.valid)
      .map(entry => ({ cmd: entry.cmd, error: entry.result.error }))

    expect(errors).toHaveLength(0)
    expect(commands).toEqual(expect.arrayContaining([
      expect.stringMatching(/^execute store result score \$compare_and_branch_t\d+ __exec_score_static run scoreboard players get #input core_static$/),
      expect.stringMatching(/^execute store success score \$compare_and_branch_t\d+ __exec_score_static if score \$compare_and_branch_t\d+ __exec_score_static > \$__const_5 __exec_score_static$/),
      expect.stringMatching(/^execute if score \$compare_and_branch_t\d+ __exec_score_static matches 1 run return run function exec_score_static:compare_and_branch__then_\d+$/),
      expect.stringMatching(/^execute store result score #out core_static run scoreboard players get \$compare_and_branch_t\d+ __exec_score_static$/),
    ]))
  })

  test('accepts macro template commands', () => {
    const teleport = validator.validate('$tp @s $(x) $(y) $(z)')
    expect(teleport.valid).toBe(true)

    const scoreboard = validator.validate('$scoreboard players set #macro_result core_oracle $(value)')
    expect(scoreboard.valid).toBe(true)

    const particle = validator.validate('$particle minecraft:flame $(x) $(y) $(z) $(dx) $(dy) $(dz) $(speed) $(count) force')
    expect(particle.valid).toBe(true)

    const playsound = validator.validate('$playsound minecraft:block.note_block.pling master @a $(x) $(y) $(z) $(volume) $(pitch)')
    expect(playsound.valid).toBe(true)

    const title = validator.validate('$title @a actionbar {"text":"$(text)"}')
    expect(title.valid).toBe(true)

    const bossbar = validator.validate('$bossbar add rs:macro_bossbar {"text":"$(name)"}')
    expect(bossbar.valid).toBe(true)
  })

  test('rejects malformed macro template commands instead of accepting all $ lines', () => {
    const unknownRoot = validator.validate('$definitely_not_a_command $(value)')
    expect(unknownRoot.valid).toBe(false)
    expect(unknownRoot.error).toContain('Unknown root command')

    const malformedScoreboard = validator.validate('$scoreboard players set #macro_result core_oracle $(value) extra')
    expect(malformedScoreboard.valid).toBe(false)
    expect(malformedScoreboard.error).toContain('scoreboard players set requires target, objective, and value')
  })

  test('accepts function commands with storage arguments', () => {
    const result = validator.validate('function rs:macro_target with storage rs:macro_args')
    expect(result.valid).toBe(true)
  })

  test('rejects malformed function commands with storage', () => {
    const missingStorageArg = validator.validate('function rs:macro_target with storage')
    expect(missingStorageArg.valid).toBe(false)
    expect(missingStorageArg.error).toContain('function with storage expects 5 or 6 tokens')

    const missingFunctionId = validator.validate('function macro_target with storage rs:macro_args')
    expect(missingFunctionId.valid).toBe(false)
    expect(missingFunctionId.error).toContain('must be namespaced ids')
  })

  test('accepts execute branch-return shape as a control-flow boundary', () => {
    const result = validator.validate(
      'execute if score $cond __bc matches 1 run return run function rs:branch_then',
    )
    expect(result.valid).toBe(true)
  })

  test('accepts execute branch-return function-macro shape with with storage', () => {
    const result = validator.validate(
      'execute if score $cond __bc matches 1 run return run function rs:macro_then with storage rs:macro_args',
    )
    expect(result.valid).toBe(true)
  })

  test('accepts and rejects typed storage boundaries', () => {
    const validStore = validator.validate(
      'execute store result storage rs:typed val int 100 run scoreboard players get #p core',
    )
    const validGet = validator.validate(
      'execute store result score #tmp core run data get storage rs:typed val 100',
    )
    const invalidStorageScale = validator.validate(
      'execute store result score #tmp core run data get storage rs:typed val invalid',
    )

    expect(validStore.valid).toBe(true)
    expect(validGet.valid).toBe(true)
    expect(invalidStorageScale.valid).toBe(false)
  })
})
