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

function allContent(result: ReturnType<typeof compile>): string {
  return result.files.map(f => f.content).join('\n')
}

describe('stdlib/bossbar.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('create_timer_bar is emitted', () => {
    const r = compileWith(`@keep fn t() { create_timer_bar("rs:timer", "Timer", 60); }`)
    expect(allContent(r)).toContain('function test:create_timer_bar with storage rs:macro_args')
  })

  test('create_health_bar is emitted', () => {
    const r = compileWith(`@keep fn t() { create_health_bar("rs:hp", "HP", 100); }`)
    expect(allContent(r)).toContain('function test:create_health_bar with storage rs:macro_args')
  })

  test('update_bar is emitted', () => {
    const r = compileWith(`@keep fn t() { update_bar("rs:hp", 50); }`)
    expect(r.files.some(f => f.path.includes('update_bar'))).toBe(true)
  })

  test('hide_bar is emitted', () => {
    const r = compileWith(`@keep fn t() { hide_bar("rs:hp"); }`)
    expect(allContent(r)).toContain('function test:hide_bar with storage rs:macro_args')
  })

  test('remove_bar is emitted', () => {
    const r = compileWith(`@keep fn t() { remove_bar("rs:hp"); }`)
    expect(allContent(r)).toContain('function test:remove_bar with storage rs:macro_args')
  })
})
