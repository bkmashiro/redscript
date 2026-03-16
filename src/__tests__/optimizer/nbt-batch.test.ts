import { nbtBatchRead } from '../../optimizer/nbt-batch'
import type { MIRFunction, MIRBlock, MIRInstr, Operand } from '../../mir/types'

function mkFn(blocks: MIRBlock[]): MIRFunction {
  return { name: 'test', params: [], blocks, entry: 'entry', isMacro: false }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr): MIRBlock {
  return { id, instrs, term, preds: [] }
}

const t = (n: string): Operand => ({ kind: 'temp', name: n })

describe('nbtBatchRead', () => {
  test('deduplicates identical nbt_read in same block', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'nbt_read', dst: 't0', ns: '@s', path: 'Health', scale: 1 },
        { kind: 'nbt_read', dst: 't1', ns: '@s', path: 'Health', scale: 1 },
      ], { kind: 'return', value: null }),
    ])
    const result = nbtBatchRead(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('nbt_read')
    expect(instrs[1]).toEqual({ kind: 'copy', dst: 't1', src: { kind: 'temp', name: 't0' } })
  })

  test('does not deduplicate reads with different path', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'nbt_read', dst: 't0', ns: '@s', path: 'Health', scale: 1 },
        { kind: 'nbt_read', dst: 't1', ns: '@s', path: 'FoodLevel', scale: 1 },
      ], { kind: 'return', value: null }),
    ])
    const result = nbtBatchRead(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('nbt_read')
    expect(instrs[1].kind).toBe('nbt_read')
  })

  test('does not deduplicate reads with different ns', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'nbt_read', dst: 't0', ns: '@s', path: 'Health', scale: 1 },
        { kind: 'nbt_read', dst: 't1', ns: '@p', path: 'Health', scale: 1 },
      ], { kind: 'return', value: null }),
    ])
    const result = nbtBatchRead(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('nbt_read')
    expect(instrs[1].kind).toBe('nbt_read')
  })

  test('invalidates cache after nbt_write to same ns', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'nbt_read', dst: 't0', ns: '@s', path: 'Health', scale: 1 },
        { kind: 'nbt_write', ns: '@s', path: 'Health', type: 'int', scale: 1, src: { kind: 'const', value: 20 } },
        { kind: 'nbt_read', dst: 't1', ns: '@s', path: 'Health', scale: 1 },
      ], { kind: 'return', value: null }),
    ])
    const result = nbtBatchRead(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('nbt_read')
    expect(instrs[1].kind).toBe('nbt_write')
    expect(instrs[2].kind).toBe('nbt_read')
  })

  test('deduplicates third read that has no intervening write', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'nbt_read', dst: 't0', ns: '@s', path: 'Health', scale: 1 },
        { kind: 'nbt_read', dst: 't1', ns: '@s', path: 'Health', scale: 1 },
        { kind: 'nbt_read', dst: 't2', ns: '@s', path: 'Health', scale: 1 },
      ], { kind: 'return', value: null }),
    ])
    const result = nbtBatchRead(fn)
    const instrs = result.blocks[0].instrs
    expect(instrs[0].kind).toBe('nbt_read')
    expect(instrs[1]).toEqual({ kind: 'copy', dst: 't1', src: { kind: 'temp', name: 't0' } })
    expect(instrs[2]).toEqual({ kind: 'copy', dst: 't2', src: { kind: 'temp', name: 't0' } })
  })

  test('does not deduplicate across blocks', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'nbt_read', dst: 't0', ns: '@s', path: 'Health', scale: 1 },
      ], { kind: 'jump', target: 'b1' }),
      mkBlock('b1', [
        { kind: 'nbt_read', dst: 't1', ns: '@s', path: 'Health', scale: 1 },
      ], { kind: 'return', value: null }),
    ])
    const result = nbtBatchRead(fn)
    expect(result.blocks[0].instrs[0].kind).toBe('nbt_read')
    expect(result.blocks[1].instrs[0].kind).toBe('nbt_read')
  })

  test('does not deduplicate reads with different scale', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'nbt_read', dst: 't0', ns: '@s', path: 'Health', scale: 1 },
        { kind: 'nbt_read', dst: 't1', ns: '@s', path: 'Health', scale: 2 },
      ], { kind: 'return', value: null }),
    ])
    const result = nbtBatchRead(fn)
    expect(result.blocks[0].instrs[0].kind).toBe('nbt_read')
    expect(result.blocks[0].instrs[1].kind).toBe('nbt_read')
  })

  test('no change when no duplicates', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'nbt_read', dst: 't0', ns: '@s', path: 'Health', scale: 1 },
      ], { kind: 'return', value: null }),
    ])
    const result = nbtBatchRead(fn)
    expect(result.blocks[0].instrs[0].kind).toBe('nbt_read')
  })
})
