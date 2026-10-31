import { describe, expect, test } from '@jest/globals'
import { constantFold } from '../../optimizer/constant_fold'
import { constantFoldPass } from '../../optimizer/vir/passes/constant-fold'
import { VIRModuleBuilder } from '../../optimizer/vir/builder'
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

function foldVir(kind: 'arith.add' | 'arith.sub' | 'arith.mul', a: number, b: number) {
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
