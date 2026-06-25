import { VIRModuleBuilder } from '../../../optimizer/vir/builder'
import type { VIRPass } from '../../../optimizer/vir/pass-manager'
import { runSinglePass, runVIRPasses } from '../../../optimizer/vir/pass-manager'
import { canonicalizePass } from '../../../optimizer/vir/passes/canonicalize'
import { constantFoldPass } from '../../../optimizer/vir/passes/constant-fold'
import { localCsePass } from '../../../optimizer/vir/passes/local-cse'
import { dcePass } from '../../../optimizer/vir/passes/dce'
import { verifyVIR } from '../../../optimizer/vir/verifier'

function buildArithmeticModule(): ReturnType<VIRModuleBuilder['build']> {
  const builder = new VIRModuleBuilder('passes', '__passes')
  const i32 = builder.internType('i32')
  const loc = builder.addUnknownLoc()
  const fn = builder.addFunction('probe', [i32, i32], [i32], {})

  const a = builder.addParam(fn.functionId, i32, 'a', {}, loc)
  const b = builder.addParam(fn.functionId, i32, 'b', {}, loc)
  const zero = builder.addConst(fn.functionId, fn.entryBlock, 0, i32, loc)
  const one = builder.addConst(fn.functionId, fn.entryBlock, 1, i32, loc)
  const addZero = builder.addBinary(fn.functionId, fn.entryBlock, 'arith.add', a, zero, i32, loc)
  builder.addBinary(fn.functionId, fn.entryBlock, 'arith.add', a, zero, i32, loc)
  const addOne = builder.addBinary(fn.functionId, fn.entryBlock, 'arith.add', b, one, i32, loc)
  const c = builder.addBinary(fn.functionId, fn.entryBlock, 'arith.mul', addOne, one, i32, loc)
  const d = builder.addBinary(fn.functionId, fn.entryBlock, 'arith.mul', addOne, c, i32, loc)
  builder.addReturn(fn.functionId, fn.entryBlock, [d], loc)

  return builder.build()
}

function buildConstantArithmeticModule(): ReturnType<VIRModuleBuilder['build']> {
  const builder = new VIRModuleBuilder('passes', '__passes')
  const i32 = builder.internType('i32')
  const loc = builder.addUnknownLoc()
  const fn = builder.addFunction('fold', [], [i32], {})
  const lhs = builder.addConst(fn.functionId, fn.entryBlock, 3, i32, loc)
  const rhs = builder.addConst(fn.functionId, fn.entryBlock, 4, i32, loc)
  const sum = builder.addBinary(fn.functionId, fn.entryBlock, 'arith.add', lhs, rhs, i32, loc)
  builder.addReturn(fn.functionId, fn.entryBlock, [sum], loc)
  return builder.build()
}

function applyPassesInSequence(
  module: ReturnType<VIRModuleBuilder['build']>,
  passes: VIRPass[],
): ReturnType<VIRModuleBuilder['build']> {
  let current = module
  for (const pass of passes) {
    const result = pass(current)
    current = result.module
  }
  return current
}

describe('VIR first-pass optimizer behavior', () => {
  test('canonicalize rewrites identities', () => {
    const module = buildArithmeticModule()
    const result = runSinglePass(module, canonicalizePass)
    expect(result.changed).toBe(true)
    const ops = result.module.ops
    const changedKinds = ops.map(op => op.kind)
    expect(changedKinds).toContain('arith.identity')
  })

  test('constant-fold folds literal arithmetic', () => {
    const module = buildConstantArithmeticModule()
    const afterFold = runSinglePass(module, constantFoldPass)
    expect(afterFold.changed).toBe(true)
    expect(afterFold.module.ops.filter(op => op.kind === 'arith.constant')).toHaveLength(3)
    const sum = afterFold.module.ops.find(op => op.kind === 'arith.constant' && op.resultIds.length === 1 && op.value === 7)
    expect(sum).toBeDefined()
  })

  test('local CSE removes duplicate pure expression in same block', () => {
    const builder = new VIRModuleBuilder('passes', '__passes')
    const i32 = builder.internType('i32')
    const loc = builder.addUnknownLoc()
    const fn = builder.addFunction('dup', [i32], [i32], {})
    const a = builder.addParam(fn.functionId, i32, 'a', {}, loc)
    const two = builder.addConst(fn.functionId, fn.entryBlock, 2, i32, loc)
    const first = builder.addBinary(fn.functionId, fn.entryBlock, 'arith.mul', a, two, i32, loc)
    const second = builder.addBinary(fn.functionId, fn.entryBlock, 'arith.mul', a, two, i32, loc)
    builder.addReturn(fn.functionId, fn.entryBlock, [first], loc)
    const module = builder.build()

    const result = runSinglePass(module, localCsePass)
    expect(result.changed).toBe(true)

    const block = result.module.blocks[0]
    const opKinds = block.opIds.map(opId => result.module.ops[opId].kind)
    expect(opKinds).toContain('arith.mul')
    expect(opKinds).toContain('cf.return')
    expect(result.module.values[second].kind).toBe('removed')
    const returnOp = result.module.ops[block.opIds[block.opIds.length - 1] as number]
    expect(returnOp.kind).toBe('cf.return')
  })

  test('DCE drops unused pure operations', () => {
    const builder = new VIRModuleBuilder('passes', '__passes')
    const i32 = builder.internType('i32')
    const loc = builder.addUnknownLoc()
    const fn = builder.addFunction('dead', [i32], [i32], {})
    const a = builder.addParam(fn.functionId, i32, 'a', {}, loc)
    builder.addConst(fn.functionId, fn.entryBlock, 1, i32, loc)
    const dead = builder.addBinary(fn.functionId, fn.entryBlock, 'arith.mul', a, a, i32, loc)
    builder.addReturn(fn.functionId, fn.entryBlock, [a], loc)

    const result = runSinglePass(builder.build(), dcePass)
    expect(result.changed).toBe(true)
    const deadValue = result.module.values[dead as any]
    expect(deadValue.kind).toBe('removed')
  })

  test('verifies modules after each pass', () => {
    const passes = [canonicalizePass, constantFoldPass, localCsePass, dcePass]
    let module = buildArithmeticModule()

    for (const pass of passes) {
      const run = pass(module)
      expect(verifyVIR(run.module)).toHaveLength(0)
      module = run.module
    }
  })

  test('runs passes in deterministic order and reaches fixpoint', () => {
    const module = buildArithmeticModule()
    const final = runVIRPasses(module, { maxIterations: 6 })
    const finalOps = final.ops.map(op => op.kind)
    expect(finalOps).toContain('arith.constant')
    expect(finalOps).toContain('cf.return')

    const second = runVIRPasses(final, { maxIterations: 6 })
    expect(second.ops.map(op => op.kind)).toEqual(final.ops.map(op => op.kind))

    const pipeline = applyPassesInSequence(module, [canonicalizePass, constantFoldPass, localCsePass, dcePass])
    const check = runSinglePass(pipeline, localCsePass)
    expect(typeof check.changed).toBe('boolean')
    expect(runSinglePass(pipeline, localCsePass).module).not.toBeUndefined()
  })
})
