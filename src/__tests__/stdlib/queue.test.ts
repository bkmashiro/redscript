import { compile } from '../../emit/compile'
import * as fs from 'fs'
import * as path from 'path'

const SRC = fs.readFileSync(path.join(__dirname, '../../stdlib/queue.mcrs'), 'utf-8')

function compileWith(extra: string) {
  return compile(extra, { namespace: 'test', librarySources: [SRC] })
}

describe('stdlib/queue.mcrs', () => {
  test('compiles without errors', () => {
    const r = compileWith('')
    expect(r.files.length).toBeGreaterThan(0)
  })

  test('queue_push appends to rs:arrays Queue via macro', () => {
    const r = compileWith(`@keep fn t() { queue_push(99); }`)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('function test:__queue_append_apply with storage rs:macro_args')
    expect(all).toContain('$data modify storage rs:arrays Queue append value $(val)')
  })

  test('queue_push stores val into macro_args from scoreboard', () => {
    const r = compileWith(`@keep fn t() { queue_push(5); }`)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('execute store result storage rs:macro_args val int 1 run scoreboard players get $p0 __test')
  })

  test('queue_pop reads head index from rs.q_head scoreboard', () => {
    const r = compileWith(`@keep fn t(): int { return queue_pop(); }`)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('scoreboard players get rs.q_head rs')
  })

  test('queue_pop advances head pointer after reading', () => {
    const r = compileWith(`@keep fn t(): int { return queue_pop(); }`)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('scoreboard players add rs.q_head rs 1')
  })

  test('queue_pop uses __queue_peek_apply macro to read element', () => {
    const r = compileWith(`@keep fn t(): int { return queue_pop(); }`)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('function test:__queue_peek_apply with storage rs:macro_args')
    expect(all).toContain('$execute store result score rs.peek_tmp rs run data get storage rs:arrays Queue[$(idx)]')
  })

  test('queue_peek uses __queue_peek_apply macro', () => {
    const r = compileWith(`@keep fn t(): int { return queue_peek(); }`)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('function test:__queue_peek_apply with storage rs:macro_args')
  })

  test('queue_size subtracts head from raw list length', () => {
    const r = compileWith(`@keep fn t(): int { return queue_size(); }`)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('scoreboard players operation $ret __test -= rs.q_head rs')
  })

  test('queue_size uses __queue_size_raw_apply to read raw list length', () => {
    const r = compileWith(`@keep fn t(): int { return queue_size(); }`)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('function test:__queue_size_raw_apply')
  })

  test('queue_clear resets Queue list and head pointer', () => {
    const r = compileWith(`@keep fn t() { queue_clear(); }`)
    const all = r.files.map(f => f.content).join('\n')
    expect(all).toContain('data modify storage rs:arrays Queue set value []')
    expect(all).toContain('scoreboard players set rs.q_head rs 0')
  })
})
