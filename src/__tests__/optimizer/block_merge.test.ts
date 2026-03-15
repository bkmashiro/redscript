import { blockMerge } from '../../optimizer/block_merge'
import type { MIRFunction, MIRBlock, MIRInstr, Operand } from '../../mir/types'

function mkFn(blocks: MIRBlock[], entry = 'entry'): MIRFunction {
  return { name: 'test', params: [], blocks, entry, isMacro: false }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr, preds: string[] = []): MIRBlock {
  return { id, instrs, term, preds }
}

const c = (v: number): Operand => ({ kind: 'const', value: v })
const t = (n: string): Operand => ({ kind: 'temp', name: n })

describe('block merging', () => {
  test('merges single-pred successor into predecessor', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'const', dst: 't0', value: 1 },
      ], { kind: 'jump', target: 'b1' }),
      mkBlock('b1', [
        { kind: 'const', dst: 't1', value: 2 },
      ], { kind: 'return', value: t('t1') }, ['entry']),
    ])
    const result = blockMerge(fn)
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].id).toBe('entry')
    expect(result.blocks[0].instrs).toHaveLength(2)
    expect(result.blocks[0].term).toEqual({ kind: 'return', value: t('t1') })
  })

  test('does not merge when successor has multiple preds', () => {
    const fn = mkFn([
      mkBlock('entry', [], { kind: 'branch', cond: t('c'), then: 'b1', else: 'b2' }),
      mkBlock('b1', [], { kind: 'jump', target: 'merge' }, ['entry']),
      mkBlock('b2', [], { kind: 'jump', target: 'merge' }, ['entry']),
      mkBlock('merge', [], { kind: 'return', value: null }, ['b1', 'b2']),
    ])
    const result = blockMerge(fn)
    // merge has 2 preds → no merging of merge block
    expect(result.blocks.length).toBeGreaterThanOrEqual(3)
    expect(result.blocks.some(b => b.id === 'merge')).toBe(true)
  })

  test('does not merge entry block into predecessor', () => {
    // Entry block should never be merged away
    const fn = mkFn([
      mkBlock('entry', [], { kind: 'jump', target: 'b1' }),
      mkBlock('b1', [], { kind: 'return', value: null }, ['entry']),
    ])
    const result = blockMerge(fn)
    // b1 has single pred → merged into entry
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].id).toBe('entry')
  })

  test('chains merges: A→B→C all single-pred', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'const', dst: 't0', value: 1 },
      ], { kind: 'jump', target: 'b1' }),
      mkBlock('b1', [
        { kind: 'const', dst: 't1', value: 2 },
      ], { kind: 'jump', target: 'b2' }, ['entry']),
      mkBlock('b2', [
        { kind: 'const', dst: 't2', value: 3 },
      ], { kind: 'return', value: t('t2') }, ['b1']),
    ])
    const result = blockMerge(fn)
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].instrs).toHaveLength(3)
  })

  test('recomputes preds after merge', () => {
    const fn = mkFn([
      mkBlock('entry', [], { kind: 'jump', target: 'b1' }),
      mkBlock('b1', [], { kind: 'jump', target: 'b2' }, ['entry']),
      mkBlock('b2', [], { kind: 'return', value: null }, ['b1']),
    ])
    const result = blockMerge(fn)
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].preds).toEqual([])
  })
})
