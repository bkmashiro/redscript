/**
 * Tests for stdlib/effects.mcrs — status effect helpers.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/effects.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/effects.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('speed is emitted', () => {
    const r = compileWith(`@keep fn t() { speed(@s, 200, 1); }`)
    expect(r.files.some(f => f.path.includes('speed'))).toBe(true)
  })

  test('jump is emitted', () => {
    const r = compileWith(`@keep fn t() { jump(@s, 200, 1); }`)
    expect(r.files.some(f => f.path.includes('jump'))).toBe(true)
  })

  test('invisible is emitted', () => {
    const r = compileWith(`@keep fn t() { invisible(@s, 100); }`)
    expect(r.files.some(f => f.path.includes('invisible'))).toBe(true)
  })

  test('night_vision is emitted', () => {
    const r = compileWith(`@keep fn t() { night_vision(@s, 300); }`)
    expect(r.files.some(f => f.path.includes('night_vision'))).toBe(true)
  })

  test('slow_fall is emitted', () => {
    const r = compileWith(`@keep fn t() { slow_fall(@s, 100); }`)
    expect(r.files.some(f => f.path.includes('slow_fall'))).toBe(true)
  })
})
