/**
 * Tests for stdlib/spawn.mcrs — spawn / teleportation utilities.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/spawn.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/spawn.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('teleport_to is emitted', () => {
    const r = compileWith(`@keep fn t() { teleport_to(@s, 0, 64, 0); }`)
    expect(r.files.some(f => f.path.includes('teleport_to'))).toBe(true)
  })

  test('spread_players is emitted', () => {
    const r = compileWith(`@keep fn t() { spread_players(0, 0, 50); }`)
    expect(r.files.some(f => f.path.includes('spread_players'))).toBe(true)
  })

  test('gather_all is emitted', () => {
    const r = compileWith(`@keep fn t() { gather_all(0, 64, 0); }`)
    expect(r.files.some(f => f.path.includes('gather_all'))).toBe(true)
  })

  test('launch_up is emitted', () => {
    const r = compileWith(`@keep fn t() { launch_up(@s, 10); }`)
    expect(r.files.some(f => f.path.includes('launch_up'))).toBe(true)
  })
})
