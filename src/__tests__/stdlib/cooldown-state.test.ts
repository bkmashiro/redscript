import { describe, expect, test } from '@jest/globals'
import { compile } from '../../compile'
import * as fs from 'fs'
import * as path from 'path'
import { Lexer } from '../../lexer'
import { Parser } from '../../parser'

describe('explicit cooldown state API', () => {
  test('composes independent integer deadlines without module-owned state or tick work', () => {
    const result = compile(`
      import cooldown;
      fn probe(now: int) {
        let sword: int = cooldown_start(now, 40);
        let bow: int = cooldown_start(now, 10);
        scoreboard_set("#sword", "outputs", sword);
        scoreboard_set("#bow", "outputs", bow);
        if (cooldown_ready(sword, now)) { scoreboard_set("#ready", "outputs", 1); }
        scoreboard_set("#remaining", "outputs", cooldown_remaining(bow, now));
      }
    `, { namespace: 'explicit_cooldown' })
    const commands = result.files.map(file => file.content).join('\n')
    expect(commands).not.toContain('cooldown_ticks')
    expect(commands).not.toContain('cooldown_active')
    expect(commands).not.toContain('storage ')
    expect(result.files.some(file => file.path === 'data/minecraft/tags/function/tick.json')).toBe(false)
  })

  test('rejects the old fake string slot rather than ignoring its name', () => {
    expect(() => compile('import cooldown; fn probe() { cooldown_start("sword", 40); }', { namespace: 'explicit_cooldown' }))
      .toThrow()
  })

  test('does not expose the old per-tick slot updater', () => {
    // Legacy single-source compilation permits undeclared external functions.
    // Check the actual stdlib API rather than mistaking that fallback for an export.
    const source = fs.readFileSync(path.resolve(__dirname, '../../stdlib/cooldown.mcrs'), 'utf8')
    const ast = new Parser(new Lexer(source).tokenize()).parse('cooldown')
    expect(ast.declarations.map(fn => fn.name)).not.toContain('cooldown_tick')
  })
})
