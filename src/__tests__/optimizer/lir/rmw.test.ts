import { scoreboardRmwPass } from '../../../optimizer/lir/rmw'
import type { LIRFunction, LIRInstr, Slot } from '../../../lir/types'

const obj = '__test'

function mkSlot(player: string): Slot {
  return { player, obj }
}

function mkFn(instructions: LIRInstr[]): LIRFunction {
  return { name: 'main', instructions, isMacro: false, macroParams: [] }
}

describe('LIR scoreboard RMW optimizer', () => {
  test('collapses temp copy/op/output-copy into direct output RMW', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
      { kind: 'return_value', slot: mkSlot('$out') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result.instructions).toEqual([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$out'), src: mkSlot('$rhs') },
      { kind: 'return_value', slot: mkSlot('$out') },
    ])
  })

  test.each([
    'score_sub',
    'score_mul',
    'score_div',
    'score_mod',
    'score_min',
    'score_max',
  ] as const)('collapses %s temp/output RMW shape', kind => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind, dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result.instructions).toEqual([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind, dst: mkSlot('$out'), src: mkSlot('$rhs') },
    ])
  })

  test('collapses temp copy/op/return into direct $ret RMW', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'return_value', slot: mkSlot('$tmp') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result.instructions).toEqual([
      { kind: 'score_copy', dst: mkSlot('$ret'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$ret'), src: mkSlot('$rhs') },
    ])
  })

  test('does not rewrite return collapse when $ret is the original RHS', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$ret') },
      { kind: 'return_value', slot: mkSlot('$tmp') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('does not rewrite return collapse when a later raw command references the temporary slot', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'return_value', slot: mkSlot('$tmp') },
      { kind: 'raw', cmd: 'execute if score $tmp __test matches 1.. run say tmp' },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('does not rewrite when temporary is read later', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
      { kind: 'score_add', dst: mkSlot('$later'), src: mkSlot('$tmp') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('does not rewrite when output slot is also the original RHS', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$out') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('does not rewrite protected temporary slots', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$ret'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$ret'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$ret') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('does not rewrite when a later raw command references the temporary slot', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
      { kind: 'raw', cmd: 'execute if score $tmp __test matches 1.. run say tmp' },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('does not rewrite when a later macro line references the temporary slot', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
      { kind: 'macro_line', template: '$execute if score $tmp __test matches $(range) run say tmp' },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('does not rewrite non-adjacent shapes across raw barriers', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'raw', cmd: 'say barrier' },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })

  test('returns same reference when nothing changes', () => {
    const fn = mkFn([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'return_value', slot: mkSlot('$out') },
    ])

    const result = scoreboardRmwPass(fn)

    expect(result).toBe(fn)
  })
})
