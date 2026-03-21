/**
 * Tests for stdlib/teams.mcrs — team management utilities.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/teams.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/teams.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('create_team is emitted', () => {
    const r = compileWith(`@keep fn t() { create_team("red", "red"); }`)
    expect(r.files.some(f => f.path.includes('create_team'))).toBe(true)
  })

  test('create_red_team is emitted', () => {
    const r = compileWith(`@keep fn t() { create_red_team(); }`)
    expect(r.files.some(f => f.path.includes('create_red_team'))).toBe(true)
  })

  test('add_to_team is emitted', () => {
    const r = compileWith(`@keep fn t() { add_to_team(@a, "red"); }`)
    expect(r.files.some(f => f.path.includes('add_to_team'))).toBe(true)
  })

  test('remove_from_teams is emitted', () => {
    const r = compileWith(`@keep fn t() { remove_from_teams(@a); }`)
    expect(r.files.some(f => f.path.includes('remove_from_teams'))).toBe(true)
  })

  test('setup_two_teams is emitted', () => {
    const r = compileWith(`@keep fn t() { setup_two_teams(); }`)
    expect(r.files.some(f => f.path.includes('setup_two_teams'))).toBe(true)
  })
})
