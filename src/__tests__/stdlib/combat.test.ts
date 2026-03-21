/**
 * Tests for stdlib/combat.mcrs — combat utilities.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/combat.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/combat.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('weapon_damage is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return weapon_damage(10, 5); }`)
    expect(r.files.some(f => f.path.includes('weapon_damage'))).toBe(true)
  })

  test('take_damage is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return take_damage(100, 20); }`)
    expect(r.files.some(f => f.path.includes('take_damage'))).toBe(true)
  })

  test('is_dead is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return is_dead(0); }`)
    expect(r.files.some(f => f.path.includes('is_dead'))).toBe(true)
  })
})
