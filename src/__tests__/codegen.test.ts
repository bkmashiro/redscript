import { generateDatapack, generateDatapackWithStats } from '../codegen/mcfunction'
import type { IRModule } from '../ir/types'

describe('generateDatapack', () => {
  it('generates pack.mcmeta', () => {
    const mod: IRModule = { namespace: 'test', functions: [], globals: [] }
    const files = generateDatapack(mod)
    const meta = files.find(f => f.path === 'pack.mcmeta')
    expect(meta).toBeDefined()
    expect(JSON.parse(meta!.content).pack.pack_format).toBe(26)
  })

  it('generates __load.mcfunction with objective setup', () => {
    const mod: IRModule = { namespace: 'mypack', functions: [], globals: ['counter'] }
    const files = generateDatapack(mod)
    const load = files.find(f => f.path.includes('__load.mcfunction'))
    expect(load?.content).toContain('scoreboard objectives add rs dummy')
    expect(load?.content).toContain('scoreboard players set $counter rs 0')
  })

  it('generates function file for simple add(a, b)', () => {
    const mod: IRModule = {
      namespace: 'mypack',
      globals: [],
      functions: [{
        name: 'add',
        params: ['a', 'b'],
        locals: ['a', 'b', 'result'],
        blocks: [{
          label: 'entry',
          instrs: [
            { op: 'binop', dst: 'result', lhs: { kind: 'var', name: 'a' }, bop: '+', rhs: { kind: 'var', name: 'b' } },
          ],
          term: { op: 'return', value: { kind: 'var', name: 'result' } },
        }],
      }],
    }
    const files = generateDatapack(mod)
    const fn = files.find(f => f.path.includes('add.mcfunction'))
    expect(fn).toBeDefined()
    // Should have param setup
    expect(fn!.content).toContain('scoreboard players operation $a rs = $p0 rs')
    expect(fn!.content).toContain('scoreboard players operation $b rs = $p1 rs')
    // Should have add operation
    expect(fn!.content).toContain('+=')
  })

  it('generates tick tag for tick loop function', () => {
    const mod: IRModule = {
      namespace: 'mypack',
      globals: [],
      functions: [{
        name: 'game_loop',
        params: [],
        locals: [],
        blocks: [{ label: 'entry', instrs: [], term: { op: 'return' } }],
        isTickLoop: true,
      }],
    }
    const files = generateDatapack(mod)
    
    // tick.json should point to __tick
    const tickTag = files.find(f => f.path.includes('tick.json'))
    expect(tickTag).toBeDefined()
    expect(JSON.parse(tickTag!.content).values).toContain('mypack:__tick')
    
    // __tick.mcfunction should call the game_loop function
    const tickFn = files.find(f => f.path.includes('__tick.mcfunction'))
    expect(tickFn).toBeDefined()
    expect(tickFn!.content).toContain('function mypack:game_loop')
  })

  it('generates conditional branches with execute if/unless', () => {
    const mod: IRModule = {
      namespace: 'mypack',
      globals: [],
      functions: [{
        name: 'check',
        params: [],
        locals: ['cond'],
        blocks: [
          {
            label: 'entry',
            instrs: [
              { op: 'assign', dst: 'cond', src: { kind: 'const', value: 1 } },
            ],
            term: { op: 'jump_if', cond: 'cond', then: 'then_block', else_: 'else_block' },
          },
          {
            label: 'then_block',
            instrs: [{ op: 'raw', cmd: 'say hello' }],
            term: { op: 'return' },
          },
          {
            label: 'else_block',
            instrs: [{ op: 'raw', cmd: 'say goodbye' }],
            term: { op: 'return' },
          },
        ],
      }],
    }
    const files = generateDatapack(mod)
    const entry = files.find(f => f.path.endsWith('check.mcfunction'))
    expect(entry?.content).toContain('execute if score $cond rs matches 1..')
    expect(entry?.content).toContain('execute if score $cond rs matches ..0')
  })

  it('generates advancement json for event decorators', () => {
    const mod: IRModule = {
      namespace: 'mypack',
      globals: [],
      functions: [{
        name: 'on_mine_diamond',
        params: [],
        locals: [],
        blocks: [{ label: 'entry', instrs: [], term: { op: 'return' } }],
        eventTrigger: { kind: 'advancement', value: 'story/mine_diamond' },
      }],
    }

    const result = generateDatapackWithStats(mod)
    const advancement = result.advancements.find(f => f.path === 'data/mypack/advancements/on_advancement_on_mine_diamond.json')
    expect(advancement).toBeDefined()
    const json = JSON.parse(advancement!.content)
    expect(json.criteria.trigger.trigger).toBe('minecraft:story/mine_diamond')
    expect(json.rewards.function).toBe('mypack:on_mine_diamond')
  })
})
