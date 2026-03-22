import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/map.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(extra, { namespace: 'test', librarySources: [SRC] })
}

describe('stdlib/map.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('map_set emits storage write command', () => {
    const r = compileWith(`@keep fn t() { map_set("Stats", "kills", 7); }`)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('data modify storage rs:macro_args map_name set from storage rs:strings __sp0')
    expect(all).toContain('data modify storage rs:macro_args key set from storage rs:strings __sp1')
    expect(all).toContain('execute store result storage rs:macro_args value int 1 run scoreboard players get $p0 __test')
    expect(all).toContain('function test:__map_set_apply with storage rs:macro_args')
    expect(all).toContain('$execute store result storage rs:maps $(map_name).$(key) int 1 run data get storage rs:macro_args value')
  })

  test('map_get emits storage read command with zero default', () => {
    const r = compileWith(`@keep fn t(): int { return map_get("Stats", "kills"); }`)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('scoreboard players set $ret __test 0')
    expect(all).toContain('function test:__map_get_apply with storage rs:macro_args')
    expect(all).toContain('$execute store result score $ret __test run data get storage rs:maps $(map_name).$(key)')
  })

  test('map_has emits if data existence check', () => {
    const r = compileWith(`@keep fn t(): int { return map_has("Stats", "kills"); }`)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('function test:__map_has_apply with storage rs:macro_args')
    expect(all).toContain('$execute store success score $ret __test if data storage rs:maps $(map_name).$(key)')
  })

  test('map_delete and map_clear emit data remove commands', () => {
    const r = compileWith(`
      @keep fn t() {
        map_delete("Stats", "kills");
        map_clear("Stats");
      }
    `)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('function test:__map_delete_apply with storage rs:macro_args')
    expect(all).toContain('function test:__map_clear_apply with storage rs:macro_args')
    expect(all).toContain('$data remove storage rs:maps $(map_name).$(key)')
    expect(all).toContain('$data remove storage rs:maps $(map_name)')
  })
})
