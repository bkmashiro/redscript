import { SCORE_INT_MAX, SCORE_INT_MIN, type LIRFunction, type LIRInstr, type Slot } from '../../../lir/types'
import { makeScoreboardState, projectState, runLIRFunction } from '../../../optimizer/lir/testing/interpreter'

const obj = '__interp'

function slot(player: string): Slot {
  return { player, obj }
}

function fn(instructions: LIRInstr[]): LIRFunction {
  return { name: 'interp', instructions, isMacro: false, macroParams: [] }
}

describe('LIR scoreboard interpreter', () => {
  test('executes typed scoreboard operations with int32 wrapping', () => {
    const result = runLIRFunction(fn([
      { kind: 'score_set', dst: slot('$max'), value: SCORE_INT_MAX },
      { kind: 'score_set', dst: slot('$one'), value: 1 },
      { kind: 'score_add', dst: slot('$max'), src: slot('$one') },
      { kind: 'score_set', dst: slot('$min'), value: SCORE_INT_MIN },
      { kind: 'score_sub', dst: slot('$min'), src: slot('$one') },
      { kind: 'score_set', dst: slot('$mul'), value: 50000 },
      { kind: 'score_set', dst: slot('$rhs'), value: 50000 },
      { kind: 'score_mul', dst: slot('$mul'), src: slot('$rhs') },
      { kind: 'score_set', dst: slot('$div'), value: -7 },
      { kind: 'score_set', dst: slot('$two'), value: 2 },
      { kind: 'score_div', dst: slot('$div'), src: slot('$two') },
      { kind: 'score_set', dst: slot('$mod'), value: -7 },
      { kind: 'score_mod', dst: slot('$mod'), src: slot('$two') },
    ]))

    expect(projectState(result, [
      slot('$max'),
      slot('$min'),
      slot('$mul'),
      slot('$div'),
      slot('$mod'),
    ])).toEqual({
      [slotKeyFor('$max')]: SCORE_INT_MIN,
      [slotKeyFor('$min')]: SCORE_INT_MAX,
      [slotKeyFor('$mul')]: Math.imul(50000, 50000),
      [slotKeyFor('$div')]: -3,
      [slotKeyFor('$mod')]: -1,
    })
  })

  test('covers boundary score_set values, min/max, swap, delta, copy, and return_value', () => {
    const result = runLIRFunction(fn([
      { kind: 'score_set', dst: slot('$lo'), value: SCORE_INT_MIN },
      { kind: 'score_set', dst: slot('$neg'), value: -1 },
      { kind: 'score_set', dst: slot('$zero'), value: 0 },
      { kind: 'score_set', dst: slot('$one'), value: 1 },
      { kind: 'score_set', dst: slot('$hi'), value: SCORE_INT_MAX },
      { kind: 'score_copy', dst: slot('$copy'), src: slot('$hi') },
      { kind: 'score_delta', dst: slot('$copy'), value: -1 },
      { kind: 'score_min', dst: slot('$copy'), src: slot('$neg') },
      { kind: 'score_max', dst: slot('$zero'), src: slot('$one') },
      { kind: 'score_swap', a: slot('$copy'), b: slot('$zero') },
      { kind: 'score_delta', dst: slot('$zero'), value: 0 },
      { kind: 'return_value', slot: slot('$copy') },
    ]))

    expect(projectState(result, [
      slot('$lo'),
      slot('$neg'),
      slot('$zero'),
      slot('$copy'),
      slot('$ret'),
    ])).toEqual({
      [slotKeyFor('$lo')]: SCORE_INT_MIN,
      [slotKeyFor('$neg')]: -1,
      [slotKeyFor('$zero')]: -1,
      [slotKeyFor('$copy')]: 1,
      [slotKeyFor('$ret')]: 1,
    })
  })

  test('rejects division and modulo by zero instead of inventing semantics', () => {
    expect(() => runLIRFunction(fn([
      { kind: 'score_set', dst: slot('$x'), value: 1 },
      { kind: 'score_set', dst: slot('$zero'), value: 0 },
      { kind: 'score_div', dst: slot('$x'), src: slot('$zero') },
    ]))).toThrow('score_div by zero')

    expect(() => runLIRFunction(fn([
      { kind: 'score_set', dst: slot('$x'), value: 1 },
      { kind: 'score_set', dst: slot('$zero'), value: 0 },
      { kind: 'score_mod', dst: slot('$x'), src: slot('$zero') },
    ]))).toThrow('score_mod by zero')
  })

  test.each([
    { kind: 'raw', cmd: 'scoreboard players set $x __interp 1' } as LIRInstr,
    { kind: 'macro_line', template: 'scoreboard players set $x __interp $(v)' } as LIRInstr,
    { kind: 'call', fn: 'test:callee' } as LIRInstr,
    { kind: 'call_macro', fn: 'test:callee', storage: 'test:args' } as LIRInstr,
    { kind: 'call_context', fn: 'test:callee', subcommands: [] } as LIRInstr,
    { kind: 'store_cmd_to_score', dst: slot('$out'), cmd: { kind: 'raw', cmd: 'say nope' } } as LIRInstr,
  ])('rejects unsupported barrier instruction $kind', instr => {
    expect(() => runLIRFunction(fn([instr]), makeScoreboardState([
      { slot: slot('$out'), value: 0 },
    ]))).toThrow(`instruction '${instr.kind}' is outside the supported interpreter subset`)
  })
})

function slotKeyFor(player: string): string {
  return `${player}\0${obj}`
}
