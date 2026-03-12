import * as fs from 'fs'
import * as path from 'path'

import { compile } from '../compile'
import { MCCommandValidator } from '../mc-validator'

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'mc-commands-1.21.4.json')
const EXAMPLES = ['counter', 'arena', 'shop', 'quiz', 'turret']

function getCommands(source: string, namespace = 'test'): string[] {
  const result = compile(source, { namespace })
  expect(result.success).toBe(true)
  expect(result.files).toBeDefined()

  return (result.files ?? [])
    .filter(file => file.path.endsWith('.mcfunction'))
    .flatMap(file => file.content.split('\n'))
    .filter(line => line.trim().length > 0)
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

  test('counter example generates valid MC commands', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'examples', 'counter.mcrs'), 'utf-8')
    const errors = validateSource(validator, src, 'counter')
    expect(errors).toHaveLength(0)
  })

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
})
