import { VIRModuleBuilder } from '../../../optimizer/vir/builder'
import { printVIRModule } from '../../../optimizer/vir/printer'
import { verifyVIR } from '../../../optimizer/vir/verifier'

describe('VIR core skeleton', () => {
  test('builds deterministic tiny arithmetic function and verifies', () => {
    const builder = new VIRModuleBuilder('arith', '__vir_arith')
    const i32 = builder.internType('i32')

    const source = builder.addSourceLocation({
      kind: 'source',
      file: 'test.redscript',
      start: { line: 1, col: 1 },
      end: { line: 1, col: 12 },
    })
    const synthetic = builder.addSyntheticLoc('tiny arithmetic', source)

    const { functionId, entryBlock } = builder.addFunction(
      'add_two_numbers',
      [i32, i32],
      [i32],
      { source: { kind: 'source', file: 'test.redscript', start: { line: 1, col: 1 }, end: { line: 1, col: 12 } } },
    )

    const a = builder.addParam(functionId, i32, 'a', {}, synthetic)
    const b = builder.addParam(functionId, i32, 'b', {}, synthetic)
    const c = builder.addConst(functionId, entryBlock, 7, i32, synthetic)
    const d = builder.addBinary(functionId, entryBlock, 'arith.add', a, b, i32, synthetic)
    builder.addIdentity(functionId, entryBlock, d, i32, synthetic)
    const e = builder.addBinary(functionId, entryBlock, 'arith.mul', d, c, i32, synthetic)
    builder.addReturn(functionId, entryBlock, [e], synthetic)

    const module = builder.build()
    expect(verifyVIR(module)).toHaveLength(0)

    const printed = printVIRModule(module, { showRemovedValues: true })
    expect(printed).toContain('module @arith objective __vir_arith')
    expect(printed).toContain('fn #0 @add_two_numbers')
    expect(printed).toContain('arith.constant')
    expect(printed).toContain('cf.return')

    const printedAgain = printVIRModule(module, { showRemovedValues: true })
    expect(printedAgain).toBe(printed)
  })

  test('supports source and synthetic locations', () => {
    const builder = new VIRModuleBuilder('locs', '__locs')
    const i32 = builder.internType('i32')

    const functionSource = { kind: 'source', file: 'src.redscript', start: { line: 5, col: 11 }, end: { line: 5, col: 11 } } as const
    const sourceLoc = builder.addSourceLocation(functionSource)

    const { functionId, entryBlock } = builder.addFunction('fnWithLocs', [i32], [i32], { source: functionSource })
    const arg = builder.addParam(functionId, i32, 'a', {}, sourceLoc)
    const constant = builder.addConst(functionId, entryBlock, 1, i32, sourceLoc)
    builder.addBinary(functionId, entryBlock, 'arith.sub', arg, constant, i32, sourceLoc)

    const synthetic = builder.addSyntheticLoc('synthetic helper', sourceLoc)
    builder.addReturn(functionId, entryBlock, [arg], synthetic)

    const module = builder.build()
    expect(verifyVIR(module)).toHaveLength(0)
  })
})
