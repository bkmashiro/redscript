/**
 * Tests for stdlib/tags.mcrs — Minecraft tag constant definitions.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/tags.mcrs'), 'utf-8')

describe('stdlib/tags.mcrs', () => {
  test('compiles without errors', () => {
    const r = compile(SRC + '\nfn _noop(): int { return 0; }', { namespace: 'test' })
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('BLOCK_MINEABLE_AXE constant is accessible', () => {
    const r = compile(
      SRC + '\n@keep fn t(): string { return BLOCK_MINEABLE_AXE; }',
      { namespace: 'test' }
    )
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('BLOCK_MINEABLE_PICKAXE constant is accessible', () => {
    const r = compile(
      SRC + '\n@keep fn t(): string { return BLOCK_MINEABLE_PICKAXE; }',
      { namespace: 'test' }
    )
    expect(r.files.length).toBeGreaterThan(0)
  })
})
