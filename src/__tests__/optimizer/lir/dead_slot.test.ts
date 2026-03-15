import { deadSlotElim, deadSlotElimModule } from '../../../optimizer/lir/dead_slot'
import type { LIRFunction, LIRInstr, LIRModule, Slot } from '../../../lir/types'

const obj = '__test'

function mkSlot(player: string): Slot {
  return { player, obj }
}

function mkFn(name: string, instructions: LIRInstr[]): LIRFunction {
  return { name, instructions, isMacro: false, macroParams: [] }
}

function mkModule(functions: LIRFunction[]): LIRModule {
  return { functions, namespace: 'test', objective: obj }
}

describe('dead slot elimination', () => {
  test('removes score_set when dst is never read', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$dead'), value: 42 },
      { kind: 'score_set', dst: mkSlot('$live'), value: 1 },
      { kind: 'return_value', slot: mkSlot('$live') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(2)
    expect(result.instructions[0]).toEqual({ kind: 'score_set', dst: mkSlot('$live'), value: 1 })
  })

  test('removes score_copy when dst is never read', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$src'), value: 5 },
      { kind: 'score_copy', dst: mkSlot('$dead'), src: mkSlot('$src') },
      { kind: 'return_value', slot: mkSlot('$src') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(2)
    expect(result.instructions.some(i => i.kind === 'score_copy')).toBe(false)
  })

  test('keeps writes to $ret slot', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$ret'), value: 10 },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(1)
  })

  test('keeps writes to $ret_field slots', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$ret_x'), value: 10 },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(1)
  })

  test('keeps writes to $p0 parameter slots', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$p0'), value: 3 },
      { kind: 'score_set', dst: mkSlot('$p1'), value: 7 },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(2)
  })

  test('keeps non-pure-write instructions even if dst is unread', () => {
    const fn = mkFn('test', [
      { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$y') },
      { kind: 'call', fn: 'test:foo' },
      { kind: 'raw', cmd: 'say hello' },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(3)
  })

  test('keeps score_set when dst is read by score_add', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$t'), value: 5 },
      { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$t') },
      { kind: 'return_value', slot: mkSlot('$x') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(3)
  })

  test('returns same reference when nothing removed', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$x'), value: 1 },
      { kind: 'return_value', slot: mkSlot('$x') },
    ])
    const result = deadSlotElim(fn)
    expect(result).toBe(fn)
  })

  test('handles call_if_matches slot reads', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$cond'), value: 1 },
      { kind: 'call_if_matches', fn: 'test:branch', slot: mkSlot('$cond'), range: '1' },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(2)
  })

  test('handles call_if_score slot reads', () => {
    const fn = mkFn('test', [
      { kind: 'score_set', dst: mkSlot('$a'), value: 1 },
      { kind: 'score_set', dst: mkSlot('$b'), value: 2 },
      { kind: 'call_if_score', fn: 'test:cmp', a: mkSlot('$a'), op: 'lt', b: mkSlot('$b') },
    ])
    const result = deadSlotElim(fn)
    expect(result.instructions).toHaveLength(3)
  })
})

describe('dead slot elimination (module-level)', () => {
  test('removes slot dead across all functions', () => {
    const mod = mkModule([
      mkFn('fn1', [
        { kind: 'score_set', dst: mkSlot('$dead'), value: 99 },
        { kind: 'score_set', dst: mkSlot('$live'), value: 1 },
      ]),
      mkFn('fn2', [
        { kind: 'return_value', slot: mkSlot('$live') },
      ]),
    ])
    const result = deadSlotElimModule(mod)
    expect(result.functions[0].instructions).toHaveLength(1)
    expect(result.functions[0].instructions[0]).toEqual({
      kind: 'score_set', dst: mkSlot('$live'), value: 1,
    })
  })

  test('keeps slot read in another function', () => {
    const mod = mkModule([
      mkFn('fn1', [
        { kind: 'score_set', dst: mkSlot('$shared'), value: 5 },
      ]),
      mkFn('fn2', [
        { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$shared') },
      ]),
    ])
    const result = deadSlotElimModule(mod)
    expect(result.functions[0].instructions).toHaveLength(1)
  })
})
