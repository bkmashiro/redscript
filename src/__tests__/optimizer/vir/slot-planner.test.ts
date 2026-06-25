import { analyzeFunctionLiveness } from '../../../optimizer/vir/lower/liveness'
import { planSlotsForFunction } from '../../../optimizer/vir/lower/slot-planner'
import type { MIRModule } from '../../../mir/types'
import { lowerMirToVir } from '../../../optimizer/vir/lower/mir-to-vir'
import { lowerVirToLir } from '../../../optimizer/vir/lower/vir-to-lir'
import { resolveParallelCopies } from '../../../optimizer/vir/lower/parallel-copies'
import { collectAllocationFailure } from '../../../optimizer/vir/lower/allocation-checker'
import { VIRModuleBuilder } from '../../../optimizer/vir/builder'

function makeSimpleMirArithmetic(instructions: MIRModule['functions'][0]['blocks'][0]['instrs']): MIRModule {
  return {
    namespace: 'arith',
    objective: '__arith',
    functions: [{
      name: 'probe',
      params: [
        { name: 'a', isMacroParam: false },
        { name: 'b', isMacroParam: false },
      ],
      blocks: [{
        id: 'entry',
        instrs: instructions,
        term: { kind: 'return', value: { kind: 'temp', name: 'y' } },
        preds: [],
      }],
      entry: 'entry',
      isMacro: false,
      sourceLoc: { file: 'test.redscript', line: 1, col: 1 },
    }],
  }
}

describe('VIR slot planning prototype', () => {
  test('planned allocation uses fewer score-copy instructions than direct lowering for arithmetic', () => {
    const mir = makeSimpleMirArithmetic([
      { kind: 'add', dst: 'x', a: { kind: 'temp', name: 'a' }, b: { kind: 'temp', name: 'b' } },
      { kind: 'sub', dst: 'y', a: { kind: 'temp', name: 'x' }, b: { kind: 'temp', name: 'a' } },
    ])

    const lowered = lowerMirToVir(mir)
    expect(lowered.kind).toBe('ok')
    if (lowered.kind !== 'ok') return

    const direct = lowerVirToLir(lowered.module)
    const planned = lowerVirToLir(lowered.module, { mode: 'planned' })

    expect(direct.kind).toBe('ok')
    expect(planned.kind).toBe('ok')
    if (direct.kind !== 'ok' || planned.kind !== 'ok') return

    const directCopies = direct.module.functions[0].instructions.filter(instr => instr.kind === 'score_copy').length
    const plannedCopies = planned.module.functions[0].instructions.filter(instr => instr.kind === 'score_copy').length

    expect(plannedCopies).toBeLessThan(directCopies)
    expect(planned.module.functions[0].instructions.at(-1)).toMatchObject({ kind: 'return_value', slot: { player: '$ret', obj: '__arith' } })
  })

  test('planner can emit an allocation that passes allocation checking', () => {
    const mir = makeSimpleMirArithmetic([
      { kind: 'add', dst: 'x', a: { kind: 'temp', name: 'a' }, b: { kind: 'temp', name: 'b' } },
      { kind: 'add', dst: 'y', a: { kind: 'temp', name: 'x' }, b: { kind: 'temp', name: 'b' } },
    ])

    const lowered = lowerMirToVir(mir)
    expect(lowered.kind).toBe('ok')
    if (lowered.kind !== 'ok') return

    const module = lowered.module
    const fn = module.functions[0]
    const plan = planSlotsForFunction(module, fn)
    expect(plan.kind).toBe('ok')
    if (plan.kind !== 'ok') return

    const failure = collectAllocationFailure(module, fn, plan.plan)
    expect(failure).toBeNull()
    expect(plan.plan.copiedSlotsCount).toBeGreaterThanOrEqual(0)
    expect(plan.plan.scratchSlot.player).toBe('$__vir_planner')
  })

  test('liveness query supports last-use and next-use for supported arithmetic path', () => {
    const builder = new VIRModuleBuilder('arith', '__arith')
    const i32 = builder.internType('i32')
    const loc = builder.addUnknownLoc()
    const { functionId, entryBlock } = builder.addFunction('fixture', [i32, i32], [i32], {})
    const a = builder.addParam(functionId, i32, 'a', {}, loc)
    const b = builder.addParam(functionId, i32, 'b', {}, loc)
    const x = builder.addBinary(functionId, entryBlock, 'arith.add', a, b, i32, loc)
    builder.addReturn(functionId, entryBlock, [x], loc)

    const module = builder.build()
    const fn = module.functions[0]
    const liveness = analyzeFunctionLiveness(module, fn)

    expect(liveness.lastUse(a)).toBeDefined()
    expect(liveness.nextUseAfter(liveness.opCount - 1, b)).toBeNull()
    expect(liveness.nextUseAfter(0, x)).toBe(1)
    expect(liveness.isLiveAfter(0, a)).toBe(false)
    expect(liveness.isLiveAfter(0, b)).toBe(false)
  })

  test('parallel copy resolver handles acyclic chains and cycle-with-scratch', () => {
    const acyclic = resolveParallelCopies({
      copies: [
        { dst: { player: '$a', obj: 'bench' }, src: { player: '$b', obj: 'bench' } },
        { dst: { player: '$c', obj: 'bench' }, src: { player: '$a', obj: 'bench' } },
      ],
      scratch: { player: '$scratch', obj: 'bench' },
    })
    expect(acyclic.kind).toBe('ok')
    expect(acyclic.kind === 'ok' ? acyclic.movesCount : 0).toBe(2)

    const cycle = resolveParallelCopies({
      copies: [
        { dst: { player: '$a', obj: 'bench' }, src: { player: '$b', obj: 'bench' } },
        { dst: { player: '$b', obj: 'bench' }, src: { player: '$a', obj: 'bench' } },
      ],
      scratch: { player: '$scratch', obj: 'bench' },
    })
    expect(cycle.kind).toBe('ok')
    if (cycle.kind !== 'ok') return
    expect(cycle.movesCount).toBe(3)
    expect(cycle.instructions[0]).toMatchObject({ kind: 'score_copy', dst: { player: '$scratch', obj: 'bench' } })
  })

  test('parallel copy resolver reports unsupported when cycles lack scratch', () => {
    const cyclesUnsupported = resolveParallelCopies({
      copies: [
        { dst: { player: '$a', obj: 'bench' }, src: { player: '$b', obj: 'bench' } },
        { dst: { player: '$b', obj: 'bench' }, src: { player: '$a', obj: 'bench' } },
      ],
    })
    expect(cyclesUnsupported.kind).toBe('unsupported')
  })
})
