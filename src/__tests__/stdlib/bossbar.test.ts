/**
 * Tests for stdlib/bossbar.mcrs — boss bar utility functions.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/bossbar.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/bossbar.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('create_timer_bar is emitted', () => {
    const r = compileWith(`@keep fn t() { create_timer_bar("rs:timer", "Timer", 60); }`)
    expect(r.files.some(f => f.path.includes('create_timer_bar'))).toBe(true)
  })

  test('create_health_bar is emitted', () => {
    const r = compileWith(`@keep fn t() { create_health_bar("rs:hp", "HP", 100); }`)
    expect(r.files.some(f => f.path.includes('create_health_bar'))).toBe(true)
  })

  test('update_bar is emitted', () => {
    const r = compileWith(`@keep fn t() { update_bar("rs:hp", 50); }`)
    expect(r.files.some(f => f.path.includes('update_bar'))).toBe(true)
  })

  test('hide_bar is emitted', () => {
    const r = compileWith(`@keep fn t() { hide_bar("rs:hp"); }`)
    expect(r.files.some(f => f.path.includes('hide_bar'))).toBe(true)
  })

  test('remove_bar is emitted', () => {
    const r = compileWith(`@keep fn t() { remove_bar("rs:hp"); }`)
    expect(r.files.some(f => f.path.includes('remove_bar'))).toBe(true)
  })
})
