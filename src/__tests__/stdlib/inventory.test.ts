/**
 * Tests for stdlib/inventory.mcrs — inventory management utilities.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/inventory.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

function allContent(result: ReturnType<typeof compile>): string {
  return result.files.map(f => f.content).join('\n')
}

describe('stdlib/inventory.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('clear_inventory is emitted', () => {
    const r = compileWith(`@keep fn t() { clear_inventory(@s); }`)
    expect(r.files.some(f => f.path.includes('clear_inventory'))).toBe(true)
  })

  test('give_kit_warrior is emitted', () => {
    const r = compileWith(`@keep fn t() { give_kit_warrior(@s); }`)
    expect(r.files.some(f => f.path.includes('give_kit_warrior'))).toBe(true)
  })

  test('give_kit_archer is emitted', () => {
    const r = compileWith(`@keep fn t() { give_kit_archer(@s); }`)
    expect(r.files.some(f => f.path.includes('give_kit_archer'))).toBe(true)
  })

  test('remove_item is emitted', () => {
    const r = compileWith(`@keep fn t() { remove_item(@s, "minecraft:diamond_sword"); }`)
    expect(allContent(r)).toContain('function test:remove_item with storage rs:macro_args')
  })
})
