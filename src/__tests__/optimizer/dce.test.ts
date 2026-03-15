import { dce } from '../../optimizer/dce'
import type { MIRFunction, MIRBlock, MIRInstr, Operand } from '../../mir/types'

function mkFn(blocks: MIRBlock[], entry = 'entry'): MIRFunction {
  return { name: 'test', params: [], blocks, entry, isMacro: false }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr, preds: string[] = []): MIRBlock {
  return { id, instrs, term, preds }
}

const c = (v: number): Operand => ({ kind: 'const', value: v })
const t = (n: string): Operand => ({ kind: 'temp', name: n })

describe('dead code elimination', () => {
  test('removes unused temp definition', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'const', dst: 'dead', value: 42 },
        { kind: 'const', dst: 'live', value: 1 },
      ], { kind: 'return', value: t('live') }),
    ])
    const result = dce(fn)
    expect(result.blocks[0].instrs).toHaveLength(1)
    expect(result.blocks[0].instrs[0]).toEqual({ kind: 'const', dst: 'live', value: 1 })
  })

  test('keeps side-effectful instructions even if dst unused', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'call', dst: 'unused', fn: 'sideEffect', args: [] },
      ], { kind: 'return', value: null }),
    ])
    const result = dce(fn)
    expect(result.blocks[0].instrs).toHaveLength(1)
  })

  test('removes unreachable blocks', () => {
    const fn = mkFn([
      mkBlock('entry', [], { kind: 'return', value: null }),
      mkBlock('dead_block', [
        { kind: 'const', dst: 't0', value: 99 },
      ], { kind: 'return', value: t('t0') }),
    ])
    const result = dce(fn)
    expect(result.blocks).toHaveLength(1)
    expect(result.blocks[0].id).toBe('entry')
  })

  test('keeps reachable blocks', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'const', dst: 't0', value: 1 },
      ], { kind: 'branch', cond: t('t0'), then: 'b1', else: 'b2' }),
      mkBlock('b1', [], { kind: 'return', value: null }, ['entry']),
      mkBlock('b2', [], { kind: 'return', value: null }, ['entry']),
    ])
    const result = dce(fn)
    expect(result.blocks).toHaveLength(3)
  })

  test('recomputes preds after block removal', () => {
    const fn = mkFn([
      mkBlock('entry', [], { kind: 'jump', target: 'b1' }),
      mkBlock('b1', [], { kind: 'return', value: null }, ['entry']),
      mkBlock('dead', [], { kind: 'jump', target: 'b1' }),
    ])
    const result = dce(fn)
    expect(result.blocks).toHaveLength(2)
    const b1 = result.blocks.find(b => b.id === 'b1')!
    expect(b1.preds).toEqual(['entry'])
  })

  test('keeps nbt_write even though it has no dst', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'nbt_write', ns: 'rs:data', path: 'x', type: 'int', scale: 1, src: c(5) },
      ], { kind: 'return', value: null }),
    ])
    const result = dce(fn)
    expect(result.blocks[0].instrs).toHaveLength(1)
  })
})
