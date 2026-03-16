import { execStorePeephole } from '../../../optimizer/lir/peephole'
import type { LIRFunction, LIRInstr, Slot } from '../../../lir/types'

const obj = '__test'

function mkSlot(player: string): Slot {
  return { player, obj }
}

function mkFn(instructions: LIRInstr[]): LIRFunction {
  return { name: 'test', instructions, isMacro: false, macroParams: [] }
}

describe('execute store peephole', () => {
  test('merges call_context + score_set into store_cmd_to_score', () => {
    const callCtx: LIRInstr = {
      kind: 'call_context',
      fn: 'ns:myfn',
      subcommands: [{ kind: 'as', selector: '@s' }],
    }
    const fn = mkFn([
      callCtx,
      { kind: 'score_set', dst: mkSlot('$result'), value: 1 },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(1)
    expect(result.instructions[0]).toEqual({
      kind: 'store_cmd_to_score',
      dst: mkSlot('$result'),
      cmd: callCtx,
    })
  })

  test('merges call_context + score_set with zero value', () => {
    const callCtx: LIRInstr = {
      kind: 'call_context',
      fn: 'ns:check',
      subcommands: [{ kind: 'at_self' }],
    }
    const fn = mkFn([
      callCtx,
      { kind: 'score_set', dst: mkSlot('$flag'), value: 0 },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(1)
    expect(result.instructions[0].kind).toBe('store_cmd_to_score')
  })

  test('does not merge when call_context and score_set are not adjacent', () => {
    const fn = mkFn([
      {
        kind: 'call_context',
        fn: 'ns:myfn',
        subcommands: [{ kind: 'as', selector: '@s' }],
      },
      { kind: 'call', fn: 'ns:other' },
      { kind: 'score_set', dst: mkSlot('$result'), value: 1 },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(3)
  })

  test('does not merge plain call + score_set', () => {
    const fn = mkFn([
      { kind: 'call', fn: 'ns:myfn' },
      { kind: 'score_set', dst: mkSlot('$result'), value: 1 },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(2)
  })

  test('does not merge call_context + score_copy', () => {
    const fn = mkFn([
      {
        kind: 'call_context',
        fn: 'ns:myfn',
        subcommands: [{ kind: 'as', selector: '@s' }],
      },
      { kind: 'score_copy', dst: mkSlot('$result'), src: mkSlot('$src') },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(2)
  })

  test('merges multiple adjacent call_context + score_set pairs', () => {
    const ctx1: LIRInstr = {
      kind: 'call_context',
      fn: 'ns:fn1',
      subcommands: [{ kind: 'as', selector: '@s' }],
    }
    const ctx2: LIRInstr = {
      kind: 'call_context',
      fn: 'ns:fn2',
      subcommands: [{ kind: 'at_self' }],
    }
    const fn = mkFn([
      ctx1,
      { kind: 'score_set', dst: mkSlot('$r1'), value: 1 },
      ctx2,
      { kind: 'score_set', dst: mkSlot('$r2'), value: 1 },
    ])
    const result = execStorePeephole(fn)
    expect(result.instructions).toHaveLength(2)
    expect(result.instructions[0]).toEqual({
      kind: 'store_cmd_to_score',
      dst: mkSlot('$r1'),
      cmd: ctx1,
    })
    expect(result.instructions[1]).toEqual({
      kind: 'store_cmd_to_score',
      dst: mkSlot('$r2'),
      cmd: ctx2,
    })
  })

  test('returns same reference when nothing changed', () => {
    const fn = mkFn([
      { kind: 'call', fn: 'ns:myfn' },
      { kind: 'score_copy', dst: mkSlot('$a'), src: mkSlot('$b') },
    ])
    const result = execStorePeephole(fn)
    expect(result).toBe(fn)
  })

  test('handles empty instruction list', () => {
    const fn = mkFn([])
    const result = execStorePeephole(fn)
    expect(result).toBe(fn)
  })

  test('handles single instruction', () => {
    const fn = mkFn([{ kind: 'score_set', dst: mkSlot('$x'), value: 5 }])
    const result = execStorePeephole(fn)
    expect(result).toBe(fn)
  })
})
