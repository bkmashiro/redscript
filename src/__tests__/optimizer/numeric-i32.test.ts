import { describe, expect, test } from '@jest/globals'
import { constantFold } from '../../optimizer/constant_fold'
import { constantFoldPass } from '../../optimizer/vir/passes/constant-fold'
import { VIRModuleBuilder } from '../../optimizer/vir/builder'
import { checkBoundedLirEquivalence } from '../../optimizer/lir/equivalence'
import { makeScoreboardState, runLIRFunction, readSlot } from '../../optimizer/lir/testing/interpreter'
import { safeDiv } from '../../tuner/simulator'
import type { MIRFunction, MIRInstr } from '../../mir/types'

const products: Array<[number, number]> = [
  [2147483647, 2147483647], [-2147483647, 2147483647],
  [1234567891, 1987654321], [-2147483648, -1],
]

function foldMir(instr: MIRInstr) {
  const fn: MIRFunction = {
    name: 'numeric_probe', params: [], entry: 'entry', isMacro: false,
    blocks: [{ id: 'entry', preds: [], instrs: [instr], term: { kind: 'return', value: { kind: 'temp', name: 'out' } } }],
  }
  return constantFold(fn).blocks[0].instrs[0]
}

function foldVir(kind: 'arith.add' | 'arith.sub' | 'arith.mul' | 'arith.div' | 'arith.mod', a: number, b: number) {
  const builder = new VIRModuleBuilder('numeric_probe', '__numeric_probe')
  const type = builder.internType('i32')
  const loc = builder.addUnknownLoc()
  const fn = builder.addFunction('numeric_probe', [], [type], {})
  const left = builder.addConst(fn.functionId, fn.entryBlock, a, type, loc)
  const right = builder.addConst(fn.functionId, fn.entryBlock, b, type, loc)
  const result = builder.addBinary(fn.functionId, fn.entryBlock, kind, left, right, type, loc)
  builder.addReturn(fn.functionId, fn.entryBlock, [result], loc)
  const folded = constantFoldPass(builder.build()).module
  return folded.ops.find(op => op.resultIds.some(id => id === result))
}

describe('signed i32 constant arithmetic', () => {
  test('does not equate an uninitialized score with an initialized zero', () => {
    const slot = { player: '$out', obj: '__floor' }
    expect(checkBoundedLirEquivalence({
      name: 'missing', observedSlots: [slot], samples: [{}],
      before: { name: 'before', isMacro: false, macroParams: [], instructions: [{ kind: 'score_copy', dst: slot, src: { player: '$missing', obj: '__floor' } }] },
      after: { name: 'after', isMacro: false, macroParams: [], instructions: [{ kind: 'score_set', dst: slot, value: 0 }] },
    }).status).toBe('unsupported')
  })
  const division: Array<[number, number, number, number]> = [
    [-7, 3, -3, 2], [7, -3, -3, -2], [-7, -3, 2, -1],
    [7, 3, 2, 1], [-2147483648, -1, -2147483648, 0], [0, -3, 0, 0],
  ]
  test.each(division)('uses native floor division/remainder for %i and %i', (a, b, quotient, remainder) => {
    for (const [kind, expected] of [['div', quotient], ['mod', remainder]] as const) {
      expect(foldMir({ kind, dst: 'out', a: { kind: 'const', value: a }, b: { kind: 'const', value: b } }))
        .toEqual({ kind: 'const', dst: 'out', value: expected })
      expect(foldVir(kind === 'div' ? 'arith.div' : 'arith.mod', a, b))
        .toMatchObject({ kind: 'arith.constant', value: expected })
      const left = { player: '$left', obj: '__floor' }
      const right = { player: '$right', obj: '__floor' }
      const operation = { kind: kind === 'div' ? 'score_div' as const : 'score_mod' as const, dst: left, src: right }
      const state = runLIRFunction({ name: 'probe', instructions: [operation], isMacro: false, macroParams: [] },
        makeScoreboardState([{ slot: left, value: a }, { slot: right, value: b }]))
      expect(readSlot(state, left)).toBe(expected)
      expect(checkBoundedLirEquivalence({
        name: 'floor', observedSlots: [left], samples: [{ [`$left\0__floor`]: a, [`$right\0__floor`]: b }],
        before: { name: 'before', instructions: [operation], isMacro: false, macroParams: [] },
        after: { name: 'after', instructions: [{ kind: 'score_set', dst: left, value: expected }], isMacro: false, macroParams: [] },
      }).status).toBe('equivalent')
    }
    expect(safeDiv(a, b)).toBe(quotient)
  })

  test.each(products)('MIR multiplies %i * %i without JS precision loss', (a, b) => {
    const expected = Number(BigInt.asIntN(32, BigInt(a) * BigInt(b)))
    expect(foldMir({ kind: 'mul', dst: 'out', a: { kind: 'const', value: a }, b: { kind: 'const', value: b } }))
      .toEqual({ kind: 'const', dst: 'out', value: expected })
  })

  test.each(products)('VIR multiplies %i * %i with the same i32 contract', (a, b) => {
    const expected = Number(BigInt.asIntN(32, BigInt(a) * BigInt(b)))
    expect(foldVir('arith.mul', a, b)).toMatchObject({ kind: 'arith.constant', value: expected })
  })

  test('VIR addition and subtraction wrap at signed i32 boundaries', () => {
    expect(foldVir('arith.add', 2147483647, 1)).toMatchObject({ kind: 'arith.constant', value: -2147483648 })
    expect(foldVir('arith.sub', -2147483648, 1)).toMatchObject({ kind: 'arith.constant', value: 2147483647 })
  })

  test('MIR folding retains the source location used by diagnostics', () => {
    const sourceLoc = { file: 'numeric.mcrs', line: 3, col: 5 }
    expect(foldMir({ kind: 'add', dst: 'out', a: { kind: 'const', value: 1 }, b: { kind: 'const', value: 2 }, sourceLoc }))
      .toMatchObject({ kind: 'const', value: 3, sourceLoc })
  })
})
