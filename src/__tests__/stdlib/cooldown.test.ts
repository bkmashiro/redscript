/**
 * Tests for stdlib/cooldown.mcrs — per-player cooldown helpers.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/cooldown.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/cooldown.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('cooldown_start is emitted', () => {
    const r = compileWith(`@keep fn t() { cooldown_start("skill", 20); }`)
    expect(r.files.some(f => f.path.includes('cooldown_start'))).toBe(true)
  })

  test('cooldown_ready is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return cooldown_ready("skill"); }`)
    expect(r.files.some(f => f.path.includes('cooldown_ready'))).toBe(true)
  })

  test('cooldown_tick is emitted', () => {
    const r = compileWith(`@keep fn t() { cooldown_tick("skill"); }`)
    expect(r.files.some(f => f.path.includes('cooldown_tick'))).toBe(true)
  })
})
