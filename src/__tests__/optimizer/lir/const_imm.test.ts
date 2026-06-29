import { constImmFold } from '../../../optimizer/lir/const_imm'
import type { LIRFunction, LIRInstr, Slot } from '../../../lir/types'

const obj = '__test'

function mkSlot(player: string): Slot {
  return { player, obj }
}

function mkFn(instructions: LIRInstr[]): LIRFunction {
  return { name: 'test', instructions, isMacro: false, macroParams: [] }
}

describe('constant immediate folding', () => {
  test('folds score_set + score_add into scoreboard players add', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
      { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$__const_5') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toHaveLength(1)
    expect(result.instructions[0]).toEqual({
      kind: 'score_delta',
      dst: mkSlot('$x'),
      value: 5,
    })
  })

  test('folds score_set + score_sub into scoreboard players remove', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_3'), value: 3 },
      { kind: 'score_sub', dst: mkSlot('$y'), src: mkSlot('$__const_3') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toHaveLength(1)
    expect(result.instructions[0]).toEqual({
      kind: 'score_delta',
      dst: mkSlot('$y'),
      value: -3,
    })
  })

  test('folds negative constant add into remove', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_-7'), value: -7 },
      { kind: 'score_add', dst: mkSlot('$z'), src: mkSlot('$__const_-7') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toHaveLength(1)
    expect(result.instructions[0]).toEqual({
      kind: 'score_delta',
      dst: mkSlot('$z'),
      value: -7,
    })
  })

  test('folds negative constant sub into add', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_-2'), value: -2 },
      { kind: 'score_sub', dst: mkSlot('$w'), src: mkSlot('$__const_-2') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toHaveLength(1)
    expect(result.instructions[0]).toEqual({
      kind: 'score_delta',
      dst: mkSlot('$w'),
      value: 2,
    })
  })

  test('eliminates add 0 (no-op)', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_0'), value: 0 },
      { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$__const_0') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toHaveLength(0)
  })

  test('eliminates sub 0 (no-op)', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_0'), value: 0 },
      { kind: 'score_sub', dst: mkSlot('$x'), src: mkSlot('$__const_0') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toHaveLength(0)
  })

  test('keeps const-foldable source use count stable when const is used as RMW destination later', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_7'), value: 7 },
      { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$__const_7') },
      { kind: 'score_add', dst: mkSlot('$__const_7'), src: mkSlot('$y') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual([
      { kind: 'score_delta', dst: mkSlot('$x'), value: 7 },
      { kind: 'score_add', dst: mkSlot('$__const_7'), src: mkSlot('$y') },
    ])
  })

  test('does not fold when const slot has multiple uses', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
      { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$__const_5') },
      { kind: 'score_add', dst: mkSlot('$y'), src: mkSlot('$__const_5') },
    ])
    const result = constImmFold(fn)
    // Should not fold because $__const_5 is used twice
    expect(result.instructions).toHaveLength(3)
  })

  test('does not fold non-const slots', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$temp'), value: 5 },
      { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$temp') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toHaveLength(2)
  })

  test('does not fold when instructions are not adjacent', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
      { kind: 'call', fn: 'test:foo' },
      { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$__const_5') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toHaveLength(3)
  })

  test('does not fold across raw barrier even with slot-looking raw text', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
      {
        kind: 'raw',
        cmd: 'execute if score $shared_tmp __test matches 1.. run tellraw @s {"text":"$__const_5"}',
      },
      { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$__const_5') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual(fn.instructions)
  })

  test('does not fold across macro_line barrier when command text merely resembles a slot', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_7'), value: 7 },
      {
        kind: 'macro_line',
        template: '$execute if data storage rs:tmp {dummy:"$(slotLike)$__const_7"}',
      },
      { kind: 'score_sub', dst: mkSlot('$x'), src: mkSlot('$__const_7') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual(fn.instructions)
  })

  test('does not delete const materialization when later raw text mentions the slot', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
      { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$__const_5') },
      { kind: 'raw', cmd: 'scoreboard players get $__const_5 __test' },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual(fn.instructions)
  })

  test('does not delete const materialization when later macro text mentions the slot', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_7'), value: 7 },
      { kind: 'score_sub', dst: mkSlot('$x'), src: mkSlot('$__const_7') },
      { kind: 'macro_line', template: '$scoreboard players get $__const_7 __test' },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual(fn.instructions)
  })

  test('eliminates multiply by 1', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_1'), value: 1 },
      { kind: 'score_mul', dst: mkSlot('$x'), src: mkSlot('$__const_1') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toHaveLength(0)
  })

  test('folds multiply by 0 into score_set 0', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_0'), value: 0 },
      { kind: 'score_mul', dst: mkSlot('$x'), src: mkSlot('$__const_0') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual([
      { kind: 'score_set', dst: mkSlot('$x'), value: 0 },
    ])
  })

  test('eliminates divide by 1', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_1'), value: 1 },
      { kind: 'score_div', dst: mkSlot('$x'), src: mkSlot('$__const_1') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toHaveLength(0)
  })

  test('eliminates score_min on same slot', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$x'), value: 7 },
      { kind: 'score_min', dst: mkSlot('$x'), src: mkSlot('$x') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual([
      { kind: 'score_set', dst: mkSlot('$x'), value: 7 },
    ])
  })

  test('eliminates score_max on same slot', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$x'), value: 7 },
      { kind: 'score_max', dst: mkSlot('$x'), src: mkSlot('$x') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual([
      { kind: 'score_set', dst: mkSlot('$x'), value: 7 },
    ])
  })

  test('folds adjacent score_set + const materialization + score_min into score_set', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$x'), value: 7 },
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
      { kind: 'score_min', dst: mkSlot('$x'), src: mkSlot('$__const_5') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual([
      { kind: 'score_set', dst: mkSlot('$x'), value: 5 },
    ])
  })

  test('folds adjacent score_set + const materialization + score_max into score_set', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$x'), value: 7 },
      { kind: 'score_set', dst: mkSlot('$__const_9'), value: 9 },
      { kind: 'score_max', dst: mkSlot('$x'), src: mkSlot('$__const_9') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual([
      { kind: 'score_set', dst: mkSlot('$x'), value: 9 },
    ])
  })

  test('keeps sequence when const slot is used more than once', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$x'), value: 7 },
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
      { kind: 'score_min', dst: mkSlot('$x'), src: mkSlot('$__const_5') },
      { kind: 'score_add', dst: mkSlot('$y'), src: mkSlot('$__const_5') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual([
      { kind: 'score_set', dst: mkSlot('$x'), value: 7 },
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
      { kind: 'score_min', dst: mkSlot('$x'), src: mkSlot('$__const_5') },
      { kind: 'score_add', dst: mkSlot('$y'), src: mkSlot('$__const_5') },
    ])
  })

  test('keeps sequence when min/max source is not const slot', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$x'), value: 7 },
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
      { kind: 'score_min', dst: mkSlot('$x'), src: mkSlot('$y') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual([
      { kind: 'score_set', dst: mkSlot('$x'), value: 7 },
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
      { kind: 'score_min', dst: mkSlot('$x'), src: mkSlot('$y') },
    ])
  })

  test('keeps sequence when dst differs from min/max destination', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$x'), value: 7 },
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
      { kind: 'score_min', dst: mkSlot('$z'), src: mkSlot('$__const_5') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual([
      { kind: 'score_set', dst: mkSlot('$x'), value: 7 },
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
      { kind: 'score_min', dst: mkSlot('$z'), src: mkSlot('$__const_5') },
    ])
  })

  test('keeps sequence when initial dst is the const slot', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 7 },
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
      { kind: 'score_min', dst: mkSlot('$__const_5'), src: mkSlot('$__const_5') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual([
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 7 },
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
    ])
  })

  test('keeps sequence when non-adjacent across call', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$x'), value: 7 },
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
      { kind: 'call', fn: 'test:foo' },
      { kind: 'score_min', dst: mkSlot('$x'), src: mkSlot('$__const_5') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual([
      { kind: 'score_set', dst: mkSlot('$x'), value: 7 },
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
      { kind: 'call', fn: 'test:foo' },
      { kind: 'score_min', dst: mkSlot('$x'), src: mkSlot('$__const_5') },
    ])
  })

  test('does not eliminate score_min with different source', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$x'), value: 7 },
      { kind: 'score_min', dst: mkSlot('$x'), src: mkSlot('$y') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual([
      { kind: 'score_set', dst: mkSlot('$x'), value: 7 },
      { kind: 'score_min', dst: mkSlot('$x'), src: mkSlot('$y') },
    ])
  })

  test('eliminates standalone and consecutive min/max self no-ops', () => {
    const fn = mkFn([
      { kind: 'score_min', dst: mkSlot('$x'), src: mkSlot('$x') },
      { kind: 'score_max', dst: mkSlot('$x'), src: mkSlot('$x') },
      { kind: 'return_value', slot: mkSlot('$x') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual([
      { kind: 'return_value', slot: mkSlot('$x') },
    ])
  })

  test('folds modulo by 1 into score_set 0', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_1'), value: 1 },
      { kind: 'score_mod', dst: mkSlot('$x'), src: mkSlot('$__const_1') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual([
      { kind: 'score_set', dst: mkSlot('$x'), value: 0 },
    ])
  })

  test('does not fold multiply by non-identity constant', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
      { kind: 'score_mul', dst: mkSlot('$x'), src: mkSlot('$__const_5') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toHaveLength(2)
  })

  test('folds score_set const copied into destination', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_42'), value: 42 },
      { kind: 'score_copy', dst: mkSlot('$x'), src: mkSlot('$__const_42') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual([
      { kind: 'score_set', dst: mkSlot('$x'), value: 42 },
    ])
  })

  test('does not fold score_set const copy when const slot has multiple uses', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_42'), value: 42 },
      { kind: 'score_copy', dst: mkSlot('$x'), src: mkSlot('$__const_42') },
      { kind: 'score_add', dst: mkSlot('$y'), src: mkSlot('$__const_42') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toHaveLength(3)
  })

  test('folds multiple independent pairs', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_3'), value: 3 },
      { kind: 'score_add', dst: mkSlot('$a'), src: mkSlot('$__const_3') },
      { kind: 'score_set', dst: mkSlot('$__const_7'), value: 7 },
      { kind: 'score_sub', dst: mkSlot('$b'), src: mkSlot('$__const_7') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toHaveLength(2)
    expect(result.instructions[0]).toEqual({
      kind: 'score_delta',
      dst: mkSlot('$a'),
      value: 3,
    })
    expect(result.instructions[1]).toEqual({
      kind: 'score_delta',
      dst: mkSlot('$b'),
      value: -7,
    })
  })

  test('does not fold score_set + score_add when delta is Int32 min', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_min'), value: -2147483648 },
      { kind: 'score_add', dst: mkSlot('$x'), src: mkSlot('$__const_min') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual(fn.instructions)
  })

  test('does not fold out-of-range score_delta constants', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_large'), value: 2147483648 },
      { kind: 'score_sub', dst: mkSlot('$x'), src: mkSlot('$__const_large') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toEqual(fn.instructions)
  })

  test('returns same reference when nothing changed', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$x'), value: 1 },
      { kind: 'return_value', slot: mkSlot('$x') },
    ])
    const result = constImmFold(fn)
    expect(result).toBe(fn)
  })
})
