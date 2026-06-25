import type { MIRModule } from '../../../mir/types'
import { VIRModuleBuilder } from '../../../optimizer/vir/builder'
import { verifyVIR } from '../../../optimizer/vir/verifier'

describe('VIR verifier invariants', () => {
  function buildValidModule(): ReturnType<VIRModuleBuilder['build']> {
    const builder = new VIRModuleBuilder('good', '__good')
    const i32 = builder.internType('i32')
    const loc = builder.addSourceLocation({ kind: 'source', file: 't.redscript', start: { line: 1, col: 1 }, end: { line: 1, col: 1 } })

    const { functionId, entryBlock } = builder.addFunction('good', [i32], [i32], { source: { kind: 'source', file: 't.redscript', start: { line: 1, col: 1 }, end: { line: 1, col: 1 } } })
    const arg = builder.addParam(functionId, i32, 'x', {}, loc)
    const two = builder.addConst(functionId, entryBlock, 2, i32, loc)
    const doubled = builder.addBinary(functionId, entryBlock, 'arith.mul', arg, two, i32, loc)
    builder.addReturn(functionId, entryBlock, [doubled], loc)

    return builder.build()
  }

  test('rejects return operand count mismatch', () => {
    const builder = new VIRModuleBuilder('bad', '__bad')
    const i32 = builder.internType('i32')
    const { functionId, entryBlock } = builder.addFunction('badReturn', [i32], [i32])
    const loc = builder.addUnknownLoc()
    const arg = builder.addParam(functionId, i32, 'x', {}, loc)

    builder.addReturn(functionId, entryBlock, [])
    const module = builder.build()

    const errors = verifyVIR(module).map(error => error.message)
    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('return op'),
    ]))
    expect(arg).toBeDefined()
  })

  test('rejects cross-function value use', () => {
    const builder = new VIRModuleBuilder('bad', '__bad')
    const i32 = builder.internType('i32')
    const loc = builder.addUnknownLoc()

    const leftFn = builder.addFunction('left', [i32], [i32], {})
    const leftArg = builder.addParam(leftFn.functionId, i32, 'a', {}, loc)
    const leftConst = builder.addConst(leftFn.functionId, leftFn.entryBlock, 1, i32, loc)
    builder.addReturn(leftFn.functionId, leftFn.entryBlock, [leftArg], loc)

    const rightFn = builder.addFunction('right', [i32], [i32], {})
    builder.addParam(rightFn.functionId, i32, 'b', {}, loc)

    // Right function illegally uses left function value.
    builder.addBinary(rightFn.functionId, rightFn.entryBlock, 'arith.add', leftArg, leftConst, i32, loc)
    builder.addReturn(rightFn.functionId, rightFn.entryBlock, [leftArg], loc)

    const module = builder.build()
    const errors = verifyVIR(module).map(error => error.message)
    expect(errors.some(error => error.includes('uses value'))).toBe(true)
  })

  test('rejects physical slot attrs in value metadata', () => {
    const module = buildValidModule()
    module.values[1] = {
      ...module.values[1],
      attrs: { slot: '$tmp' },
    }

    const errors = verifyVIR(module)
    expect(errors.some(error => error.message.includes('forbidden physical slot attr'))).toBe(true)
  })

  test('reports missing block ops instead of throwing during return scan', () => {
    const module = buildValidModule()
    const missingOp = 999 as never
    module.blocks[0] = {
      ...module.blocks[0],
      opIds: [...module.blocks[0].opIds, missingOp],
    }

    expect(() => verifyVIR(module)).not.toThrow()
    expect(verifyVIR(module).map(error => error.message)).toEqual(expect.arrayContaining([
      expect.stringContaining('references missing op 999'),
    ]))
  })
})
