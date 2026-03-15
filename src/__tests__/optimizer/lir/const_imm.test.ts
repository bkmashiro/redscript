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
      kind: 'raw',
      cmd: 'scoreboard players add $x __test 5',
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
      kind: 'raw',
      cmd: 'scoreboard players remove $y __test 3',
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
      kind: 'raw',
      cmd: 'scoreboard players remove $z __test 7',
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
      kind: 'raw',
      cmd: 'scoreboard players add $w __test 2',
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

  test('does not fold score_mul (no single MC command)', () => {
    const fn = mkFn([
      { kind: 'score_set', dst: mkSlot('$__const_5'), value: 5 },
      { kind: 'score_mul', dst: mkSlot('$x'), src: mkSlot('$__const_5') },
    ])
    const result = constImmFold(fn)
    expect(result.instructions).toHaveLength(2)
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
      kind: 'raw',
      cmd: 'scoreboard players add $a __test 3',
    })
    expect(result.instructions[1]).toEqual({
      kind: 'raw',
      cmd: 'scoreboard players remove $b __test 7',
    })
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
