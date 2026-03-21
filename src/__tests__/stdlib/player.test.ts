/**
 * Tests for stdlib/player.mcrs — player utility functions.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/player.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/player.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('heal is emitted', () => {
    const r = compileWith(`@keep fn t() { heal(10); }`)
    expect(r.files.some(f => f.path.includes('heal'))).toBe(true)
  })

  test('damage is emitted', () => {
    const r = compileWith(`@keep fn t() { damage(5); }`)
    expect(r.files.some(f => f.path.includes('damage'))).toBe(true)
  })

  test('is_op is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return is_op(); }`)
    expect(r.files.some(f => f.path.includes('is_op'))).toBe(true)
  })
})
