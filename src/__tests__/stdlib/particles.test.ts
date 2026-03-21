/**
 * Tests for stdlib/particles.mcrs — particle effect helpers.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/particles.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/particles.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('hearts_at is emitted', () => {
    const r = compileWith(`@keep fn t() { hearts_at(0, 64, 0); }`)
    expect(r.files.some(f => f.path.includes('hearts_at'))).toBe(true)
  })

  test('flames is emitted', () => {
    const r = compileWith(`@keep fn t() { flames(0, 64, 0); }`)
    expect(r.files.some(f => f.path.includes('flames'))).toBe(true)
  })

  test('smoke is emitted', () => {
    const r = compileWith(`@keep fn t() { smoke(0, 64, 0); }`)
    expect(r.files.some(f => f.path.includes('smoke'))).toBe(true)
  })

  test('explosion_effect is emitted', () => {
    const r = compileWith(`@keep fn t() { explosion_effect(10, 70, -5); }`)
    expect(r.files.some(f => f.path.includes('explosion_effect'))).toBe(true)
  })
})
