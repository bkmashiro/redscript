/**
 * Tests for stdlib/strings.mcrs — string manipulation helpers.
 */

import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/strings.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/strings.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('str_len is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return str_len("A"); }`)
    expect(r.files.some(f => f.path.includes('str_len'))).toBe(true)
  })

  test('str_concat is emitted', () => {
    const r = compileWith(`@keep fn t() { str_concat("A", "B"); }`)
    expect(r.files.some(f => f.path.includes('str_concat'))).toBe(true)
  })

  test('str_contains is emitted', () => {
    const r = compileWith(`@keep fn t(): int { return str_contains("A", "B"); }`)
    expect(r.files.some(f => f.path.includes('str_contains'))).toBe(true)
  })

  test('str_slice is emitted', () => {
    const r = compileWith(`@keep fn t() { str_slice("A", 0, 1); }`)
    expect(r.files.some(f => f.path.includes('str_slice'))).toBe(true)
  })
})
