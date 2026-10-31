import { describe, test, expect } from '@jest/globals'
import { optimizeModule } from '../../optimizer/pipeline'
import { scoreboardBatchRead } from '../../optimizer/scoreboard-batch'
import { findScoreboardPreservingFunctions } from '../../optimizer/scoreboard-effects'
import type { MIRFunction, MIRInstr, MIRModule, Operand } from '../../mir/types'

const temp = (name: string) => ({ kind: 'temp' as const, name })

function fn(name: string, instrs: MIRInstr[], value: Operand | null = temp('after')): MIRFunction {
  return {
    name,
    params: [],
    entry: 'entry',
    isMacro: false,
    blocks: [{ id: 'entry', instrs, term: { kind: 'return', value }, preds: [] }],
  }
}

function moduleWith(...functions: MIRFunction[]): MIRModule {
  return {
    namespace: 'score_effects',
    objective: '__score_effects',
    functions,
    // Exercise call effects, not the existing small-function inliner.
    noInlineFunctions: new Set(functions.map(f => f.name)),
  }
}

function readsAround(call: MIRInstr, obj = 'cooldowns', player = '#player'): MIRInstr[] {
  return [
    { kind: 'score_read', dst: 'before', player, obj },
    call,
    { kind: 'score_read', dst: 'after', player, obj },
    { kind: 'add', dst: 'sum', a: temp('before'), b: temp('after') },
  ]
}

function readCount(mod: MIRModule, name = 'probe'): number {
  return mod.functions.find(f => f.name === name)!.blocks
    .flatMap(b => b.instrs).filter(i => i.kind === 'score_read').length
}

describe('scoreboard reads across ordinary helper calls', () => {
  test('reuses an external score across a read-only helper', () => {
    const helper = fn('helper', [
      { kind: 'score_read', dst: 'x', player: '#other', obj: 'inputs' },
      { kind: 'mul', dst: 'after', a: temp('x'), b: { kind: 'const', value: 3 } },
    ])
    const probe = fn('probe', readsAround({ kind: 'call', fn: 'helper', args: [], dst: 'cost' }), temp('sum'))

    const result = optimizeModule(moduleWith(probe, helper))

    expect(readCount(result)).toBe(1)
    expect(result.functions.find(f => f.name === 'probe')!.blocks[0].term)
      .toEqual({ kind: 'return', value: temp('sum') })
  })

  test('does not reuse a score across a context call that may change it', () => {
    const probe = fn('probe', readsAround({
      kind: 'call_context', fn: 'mutate', subcommands: [{ kind: 'as', selector: '@a' }],
    }), temp('sum'))

    const result = scoreboardBatchRead(probe)

    expect(result.blocks[0].instrs.filter(i => i.kind === 'score_read')).toHaveLength(2)
  })

  test('propagates read-only effects through multiple helper calls', () => {
    const leaf = fn('leaf', [], null)
    const middle = fn('middle', [{ kind: 'call', fn: 'leaf', args: [], dst: null }], null)
    const probe = fn('probe', readsAround({ kind: 'call', fn: 'middle', args: [], dst: null }), temp('sum'))
    // Caller-first order must not affect summary inference.
    expect(readCount(optimizeModule(moduleWith(probe, middle, leaf)))).toBe(1)
  })

  const barriers: Array<[string, MIRInstr]> = [
    ['score writes', { kind: 'score_write', player: '#player', obj: 'cooldowns', src: { kind: 'const', value: 7 } }],
    ['raw commands', { kind: 'call', fn: '__raw:scoreboard players set #player cooldowns 7', args: [], dst: null }],
    ['unknown callees', { kind: 'call', fn: 'external', args: [], dst: null }],
    ['macro calls', { kind: 'call_macro', fn: 'leaf', args: [], dst: null }],
    ['context calls', { kind: 'call_context', fn: 'leaf', subcommands: [] }],
    ['storage operations', { kind: 'nbt_write', ns: 'test:data', path: 'x', type: 'int', scale: 1, src: { kind: 'const', value: 7 } }],
  ]
  test.each(barriers)('preserves the call barrier for helpers containing %s', (_name, instr) => {
    const leaf = fn('leaf', [], null)
    const helper = fn('helper', [instr], null)
    const middle = fn('middle', [{ kind: 'call', fn: 'helper', args: [], dst: null }], null)
    const probe = fn('probe', readsAround({ kind: 'call', fn: 'middle', args: [], dst: null }), temp('sum'))
    const mod = moduleWith(probe, middle, helper, leaf)
    expect(findScoreboardPreservingFunctions(mod).has('middle')).toBe(false)
    expect(readCount(optimizeModule(mod))).toBe(2)
  })

  test.each([false, true])('does not classify recursive call graphs (mutual: %s)', mutual => {
    const a = fn('a', [{ kind: 'call', fn: mutual ? 'b' : 'a', args: [], dst: null }], null)
    const b = fn('b', [{ kind: 'call', fn: 'a', args: [], dst: null }], null)
    const probe = fn('probe', readsAround({ kind: 'call', fn: 'a', args: [], dst: null }), temp('sum'))
    const mod = moduleWith(probe, a, b)
    expect([...findScoreboardPreservingFunctions(mod)]).toEqual([])
    expect(readCount(optimizeModule(mod))).toBe(2)
  })

  test('does not classify macro functions even when they have no explicit writes', () => {
    const macro = { ...fn('macro', [], null), isMacro: true }
    expect(findScoreboardPreservingFunctions(moduleWith(macro)).has('macro')).toBe(false)
  })

  test('does not reuse reads of compiler-owned call registers', () => {
    const helper = fn('helper', [], null)
    const probe = fn('probe', readsAround({ kind: 'call', fn: 'helper', args: [], dst: null }, '__score_effects', '$p0'), temp('sum'))
    expect(readCount(optimizeModule(moduleWith(probe, helper)))).toBe(2)
  })

  test('does not add optimizations to an explicit custom pass list', () => {
    const helper = fn('helper', [], null)
    const probe = fn('probe', readsAround({ kind: 'call', fn: 'helper', args: [], dst: null }), temp('sum'))
    expect(readCount(optimizeModule(moduleWith(probe, helper), []))).toBe(2)
  })

  test('propagates effects from non-entry blocks', () => {
    const helper = fn('helper', [], null)
    helper.blocks.push({
      id: 'other', preds: ['entry'],
      instrs: [{ kind: 'score_write', player: '#player', obj: 'cooldowns', src: { kind: 'const', value: 7 } }],
      term: { kind: 'return', value: null },
    })
    expect(findScoreboardPreservingFunctions(moduleWith(helper)).has('helper')).toBe(false)
  })
})

describe('scoreboard read cache safety', () => {
  test.each(['@r', '@e[sort=random,limit=1]', '@p', '*'])('does not reuse general selector reads: %s', player => {
    const reads = readsAround({ kind: 'const', dst: 'x', value: 1 }, 'cooldowns', player)
    expect(scoreboardBatchRead(fn('probe', reads)).blocks[0].instrs[2].kind).toBe('score_read')
  })

  test.each([
    ['#player', '@a'],
    ['#player', '*'],
    ['@s', 'Alice'],
  ])('invalidates a cached %s read for a potentially aliasing %s write', (readPlayer, writePlayer) => {
    const reads = readsAround({ kind: 'score_write', player: writePlayer, obj: 'cooldowns', src: { kind: 'const', value: 7 } }, 'cooldowns', readPlayer)
    expect(scoreboardBatchRead(fn('probe', reads)).blocks[0].instrs[2].kind).toBe('score_read')
  })

  test('keeps different literal holders and objectives independent', () => {
    const reads = readsAround({ kind: 'score_write', player: 'Bob', obj: 'cooldowns', src: { kind: 'const', value: 7 } }, 'cooldowns', 'Alice')
    expect(scoreboardBatchRead(fn('probe', reads)).blocks[0].instrs[2].kind).toBe('copy')
    reads[1] = { kind: 'score_write', player: '*', obj: 'other', src: { kind: 'const', value: 7 } }
    expect(scoreboardBatchRead(fn('probe', reads)).blocks[0].instrs[2].kind).toBe('copy')
  })

  test('invalidates a cached value when its MIR temporary is reassigned', () => {
    const reads = readsAround({ kind: 'const', dst: 'before', value: 99 })
    expect(scoreboardBatchRead(fn('probe', reads)).blocks[0].instrs[2].kind).toBe('score_read')
  })

  test('invalidates a cached value overwritten by a preserving call result', () => {
    const reads = readsAround({ kind: 'call', fn: 'helper', args: [], dst: 'before' })
    const result = scoreboardBatchRead(fn('probe', reads), { objective: '__score_effects', preservingCalls: new Set(['helper']) })
    expect(result.blocks[0].instrs[2].kind).toBe('score_read')
  })

  test('preserves the source position of a reused read', () => {
    const reads = readsAround({ kind: 'const', dst: 'x', value: 1 })
    reads[2].sourceLoc = { file: 'cooldown.mcrs', line: 9, col: 5 }
    const result = scoreboardBatchRead(fn('probe', reads))
    expect(result.blocks[0].instrs[2]).toMatchObject({ kind: 'copy', sourceLoc: reads[2].sourceLoc })
  })
})
