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
    const r = compileWith(`@keep fn t() { cooldown_start(100, 20); }`)
    expect(r.files.some(f => f.path.includes('cooldown_start'))).toBe(true)
  })

  test('cooldown_ready is emitted', () => {
    const r = compileWith(`@keep fn t(): bool { return cooldown_ready(120, 100); }`)
    expect(r.files.some(f => f.path.includes('cooldown_ready'))).toBe(true)
  })

  test('cooldown_remaining is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return cooldown_remaining(120, 100); }`)
    expect(r.files.some(f => f.path.includes('cooldown_remaining'))).toBe(true)
  })
})
