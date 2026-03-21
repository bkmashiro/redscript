/**
 * Tests for stdlib/interactions.mcrs — player interaction helpers.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/interactions.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/interactions.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('interactions_init is emitted', () => {
    const r = compileWith(`@keep fn t() { interactions_init(); }`)
    expect(r.files.some(f => f.path.includes('interactions_init'))).toBe(true)
  })

  test('is_sneaking is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return is_sneaking(@s); }`)
    expect(r.files.some(f => f.path.includes('is_sneaking'))).toBe(true)
  })
})
