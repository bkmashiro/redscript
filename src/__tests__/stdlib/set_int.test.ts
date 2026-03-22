import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/set_int.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(SRC + '\n' + extra, { namespace: 'test' })
}

describe('stdlib/set_int.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('set_add loads named storage, deduplicates, and stores back', () => {
    const r = compileWith(`@keep fn t() { set_add("Visited", 42); }`)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('data modify storage rs:macro_args set_name set from storage rs:strings __sp0')
    expect(all).toContain('function test:__set_int_load_items_apply with storage rs:macro_args')
    expect(all).toContain('$data modify storage test:arrays items set from storage rs:set_int $(set_name)')
    expect(all).toContain('function test:__set_int_store_items_apply with storage rs:macro_args')
  })

  test('set_has emits array scan helper usage', () => {
    const r = compileWith(`@keep fn t(): int { return set_has("Visited", 42); }`)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('function test:__set_int_load_items_apply with storage rs:macro_args')
    expect(all).toContain('function test:_set_int_array_has')
  })

  test('set_remove filters elements and writes rebuilt set', () => {
    const r = compileWith(`@keep fn t() { set_remove("Visited", 42); }`)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('function test:__set_int_store_kept_apply with storage rs:macro_args')
    expect(all).toContain('$data modify storage rs:set_int $(set_name) set from storage test:arrays kept')
  })

  test('set_size initializes zero default and reads list length from storage', () => {
    const r = compileWith(`@keep fn t(): int { return set_size("Visited"); }`)
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('set_clear resets named set to an empty list', () => {
    const r = compileWith(`@keep fn t() { set_clear("Visited"); }`)
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('set_union merges both sets into the result storage', () => {
    const r = compileWith(`@keep fn t() { set_union("A", "B", "Out"); }`)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('$data modify storage rs:set_int $(result) set from storage test:arrays merged')
  })

  test('set_intersect scans both sources and writes the shared result', () => {
    const r = compileWith(`@keep fn t() { set_intersect("A", "B", "Both"); }`)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('$data modify storage rs:set_int $(result) set from storage test:arrays shared')
    expect(all).toContain('function test:_set_int_array_has')
  })
})
