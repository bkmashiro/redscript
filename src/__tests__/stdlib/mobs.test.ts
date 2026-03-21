/**
 * Tests for stdlib/mobs.mcrs — vanilla mob entity type constants.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/mobs.mcrs'), 'utf-8')

describe('stdlib/mobs.mcrs', () => {
  test('compiles without errors', () => {
    const r = compile(SRC + '\nfn _noop(): int { return 0; }', { namespace: 'test' })
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('ZOMBIE constant is accessible', () => {
    const r = compile(
      SRC + '\n@keep fn t(): string { return ZOMBIE; }',
      { namespace: 'test' }
    )
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('SKELETON constant is accessible', () => {
    const r = compile(
      SRC + '\n@keep fn t(): string { return SKELETON; }',
      { namespace: 'test' }
    )
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('CREEPER constant is accessible', () => {
    const r = compile(
      SRC + '\n@keep fn t(): string { return CREEPER; }',
      { namespace: 'test' }
    )
    expect(r.files.length).toBeGreaterThan(0)
  })
})
