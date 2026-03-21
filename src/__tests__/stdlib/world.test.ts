/**
 * Tests for stdlib/world.mcrs — world management utilities.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/world.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/world.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('set_day is emitted', () => {
    const r = compileWith(`@keep fn t() { set_day(); }`)
    expect(r.files.some(f => f.path.includes('set_day'))).toBe(true)
  })

  test('set_night is emitted', () => {
    const r = compileWith(`@keep fn t() { set_night(); }`)
    expect(r.files.some(f => f.path.includes('set_night'))).toBe(true)
  })

  test('weather_clear is emitted', () => {
    const r = compileWith(`@keep fn t() { weather_clear(); }`)
    expect(r.files.some(f => f.path.includes('weather_clear'))).toBe(true)
  })

  test('weather_rain is emitted', () => {
    const r = compileWith(`@keep fn t() { weather_rain(); }`)
    expect(r.files.some(f => f.path.includes('weather_rain'))).toBe(true)
  })

  test('enable_keep_inventory is emitted', () => {
    const r = compileWith(`@keep fn t() { enable_keep_inventory(); }`)
    expect(r.files.some(f => f.path.includes('enable_keep_inventory'))).toBe(true)
  })
})
