import { scoreboardBatchRead } from '../../optimizer/scoreboard-batch'
import type { MIRBlock, MIRFunction, MIRInstr, Operand } from '../../mir/types'

function mkFn(blocks: MIRBlock[]): MIRFunction {
  return { name: 'test', params: [], blocks, entry: 'entry', isMacro: false }
}

function mkBlock(id: string, instrs: MIRInstr[], term: MIRInstr): MIRBlock {
  return { id, instrs, term, preds: [] }
}

const t = (name: string): Operand => ({ kind: 'temp', name })

describe('scoreboardBatchRead', () => {
  test('deduplicates repeated score_read of same player+obj', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'score_read', dst: 't0', player: 'A', obj: 'rs.vars' },
        { kind: 'score_read', dst: 't1', player: 'A', obj: 'rs.vars' },
      ], { kind: 'return', value: t('t1') }),
    ])

    const result = scoreboardBatchRead(fn)
    const instrs = result.blocks[0].instrs

    expect(instrs[0]).toEqual({ kind: 'score_read', dst: 't0', player: 'A', obj: 'rs.vars' })
    expect(instrs[1]).toEqual({ kind: 'copy', dst: 't1', src: { kind: 'temp', name: 't0' } })
  })

  test('three reads — second and third become copies', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'score_read', dst: 't0', player: 'X', obj: 'obj' },
        { kind: 'score_read', dst: 't1', player: 'X', obj: 'obj' },
        { kind: 'score_read', dst: 't2', player: 'X', obj: 'obj' },
      ], { kind: 'return', value: null }),
    ])

    const result = scoreboardBatchRead(fn)
    const instrs = result.blocks[0].instrs

    expect(instrs[0].kind).toBe('score_read')
    expect(instrs[1]).toEqual({ kind: 'copy', dst: 't1', src: { kind: 'temp', name: 't0' } })
    expect(instrs[2]).toEqual({ kind: 'copy', dst: 't2', src: { kind: 'temp', name: 't0' } })
  })

  test('score_write invalidates cache — read after write is not deduplicated', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'score_read', dst: 't0', player: 'A', obj: 'rs.vars' },
        { kind: 'score_write', player: 'A', obj: 'rs.vars', src: { kind: 'const', value: 42 } },
        { kind: 'score_read', dst: 't1', player: 'A', obj: 'rs.vars' },
      ], { kind: 'return', value: t('t1') }),
    ])

    const result = scoreboardBatchRead(fn)
    const instrs = result.blocks[0].instrs

    expect(instrs[0].kind).toBe('score_read')
    expect(instrs[1].kind).toBe('score_write')
    expect(instrs[2].kind).toBe('score_read')
  })

  test('call clears entire cache — read after call is not deduplicated', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'score_read', dst: 't0', player: 'A', obj: 'rs.vars' },
        { kind: 'call', dst: null, fn: 'some_fn', args: [] },
        { kind: 'score_read', dst: 't1', player: 'A', obj: 'rs.vars' },
      ], { kind: 'return', value: t('t1') }),
    ])

    const result = scoreboardBatchRead(fn)
    const instrs = result.blocks[0].instrs

    expect(instrs[0].kind).toBe('score_read')
    expect(instrs[1].kind).toBe('call')
    expect(instrs[2].kind).toBe('score_read')
  })

  test('call_macro clears entire cache', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'score_read', dst: 't0', player: 'B', obj: 'obj' },
        { kind: 'call_macro', dst: null, fn: 'macro_fn', args: [] },
        { kind: 'score_read', dst: 't1', player: 'B', obj: 'obj' },
      ], { kind: 'return', value: null }),
    ])

    const result = scoreboardBatchRead(fn)
    const instrs = result.blocks[0].instrs

    expect(instrs[2].kind).toBe('score_read')
  })

  test('different objectives are not merged', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'score_read', dst: 't0', player: 'A', obj: 'obj1' },
        { kind: 'score_read', dst: 't1', player: 'A', obj: 'obj2' },
      ], { kind: 'return', value: null }),
    ])

    const result = scoreboardBatchRead(fn)
    const instrs = result.blocks[0].instrs

    expect(instrs[0].kind).toBe('score_read')
    expect(instrs[1].kind).toBe('score_read')
  })

  test('different players are not merged', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'score_read', dst: 't0', player: 'Alice', obj: 'rs.vars' },
        { kind: 'score_read', dst: 't1', player: 'Bob', obj: 'rs.vars' },
      ], { kind: 'return', value: null }),
    ])

    const result = scoreboardBatchRead(fn)
    const instrs = result.blocks[0].instrs

    expect(instrs[0].kind).toBe('score_read')
    expect(instrs[1].kind).toBe('score_read')
  })

  test('cache does not carry across blocks', () => {
    const fn = mkFn([
      mkBlock('entry', [
        { kind: 'score_read', dst: 't0', player: 'A', obj: 'rs.vars' },
      ], { kind: 'jump', target: 'next' }),
      mkBlock('next', [
        { kind: 'score_read', dst: 't1', player: 'A', obj: 'rs.vars' },
      ], { kind: 'return', value: t('t1') }),
    ])

    const result = scoreboardBatchRead(fn)

    expect(result.blocks[0].instrs[0].kind).toBe('score_read')
    expect(result.blocks[1].instrs[0].kind).toBe('score_read')
  })
})
