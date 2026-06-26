import type { MIRFunction, MIRInstr, MIRModule } from '../../../mir/types'
import * as allocationChecker from '../../../optimizer/vir/lower/allocation-checker'
import { lowerMirToVir } from '../../../optimizer/vir/lower/mir-to-vir'
import * as slotPlanner from '../../../optimizer/vir/lower/slot-planner'
import {
  chooseVirLoweringPlan,
  lowerVirToLir,
} from '../../../optimizer/vir/lower/vir-to-lir'
import type { VIRModule } from '../../../optimizer/vir/types'
import * as virTypes from '../../../optimizer/vir/types'
import * as virVerifier from '../../../optimizer/vir/verifier'

function makeMirOneBlockFunction(instructions: MIRInstr[], returnTemp: string): MIRModule {
  return {
    namespace: 'arith',
    objective: '__arith',
    functions: [{
      name: 'probe',
      params: [
        { name: 'a', isMacroParam: false },
        { name: 'b', isMacroParam: false },
      ],
      blocks: [
        {
          id: 'entry',
          instrs: instructions,
          term: { kind: 'return', value: { kind: 'temp', name: returnTemp } },
          preds: [],
        },
      ],
      entry: 'entry',
      isMacro: false,
      sourceLoc: { file: 'test.redscript', line: 1, col: 1 },
  } satisfies MIRFunction],
  }
}

function makeMalformedVIRModuleForControlFlowUnsupported(): VIRModule {
  const unknownLoc = { kind: 'unknown' } as const
  return ({
    id: 1,
    namespace: 'arith',
    objective: '__arith',
    types: [{ id: 1, kind: 'i32' }],
    locs: [{ id: 1, loc: unknownLoc }],
    values: [
      {
        kind: 'param',
        id: 1,
        function: 1,
        type: 1,
        loc: 1,
        attrs: {},
        name: 'a',
      },
      {
        kind: 'op',
        id: 2,
        function: 1,
        type: 1,
        loc: 1,
        attrs: {},
        definingOp: 10,
      },
    ],
    blocks: [
      { id: 1, function: 1, name: 'entry', opIds: [10], loc: 1 },
      { id: 2, function: 1, name: 'other', opIds: [11], loc: 1 },
    ],
    functions: [{
      id: 1,
      name: 'probe',
      signature: { params: [1], results: [1] },
      entryBlock: 1,
      blocks: [1, 2],
      paramValues: [1],
      loc: 1,
    }],
    ops: [
      {
        kind: 'arith.constant',
        id: 10,
        block: 1,
        loc: 1,
        resultIds: [2],
        type: 1,
        operands: [],
      },
      {
        kind: 'cf.return',
        id: 11,
        block: 2,
        loc: 1,
        resultIds: [],
        operands: [2],
      },
    ],
  }) as unknown as VIRModule
}

function makeMalformedVIRModuleForDirectUnsupported(): VIRModule {
  const unknownLoc = { kind: 'unknown' } as const
  return ({
    id: 0,
    namespace: 'arith',
    objective: '__arith',
    types: [{ id: 0, kind: 'i32' }],
    locs: [{ id: 0, loc: unknownLoc }],
    values: [
      {
        kind: 'param',
        id: 0,
        function: 0,
        type: 0,
        loc: 0,
        attrs: {},
        name: 'a',
      },
      {
        kind: 'op',
        id: 1,
        function: 0,
        type: 0,
        loc: 0,
        attrs: {},
        definingOp: 0,
      },
    ],
    blocks: [{ id: 0, function: 0, name: 'entry', opIds: [0, 1], loc: 0 }],
    functions: [{
      id: 0,
      name: 'probe',
      signature: { params: [0], results: [0] },
      entryBlock: 0,
      blocks: [0],
      paramValues: [0],
      loc: 0,
    }],
    ops: [
      {
        kind: 'arith.add',
        id: 0,
        block: 0,
        loc: 0,
        resultIds: [1],
        type: 0,
        operands: [0, 0],
      },
      {
        kind: 'cf.return',
        id: 1,
        block: 0,
        loc: 0,
        resultIds: [],
        operands: [1],
      },
    ],
  }) as unknown as VIRModule
}

describe('VIR arithmetic-only lowering experiment', () => {
  test('lowers supported single-block arithmetic and matches expected LIR shape', () => {
    const mir = makeMirOneBlockFunction([
      { kind: 'const', dst: 'c', value: 3 },
      { kind: 'add', dst: 'x', a: { kind: 'temp', name: 'a' }, b: { kind: 'temp', name: 'b' } },
      { kind: 'sub', dst: 'y', a: { kind: 'temp', name: 'x' }, b: { kind: 'temp', name: 'c' } },
      { kind: 'mul', dst: 'z', a: { kind: 'temp', name: 'y' }, b: { kind: 'const', value: 2 } },
    ], 'z')

    const lowered = lowerMirToVir(mir)
    expect(lowered.kind).toBe('ok')
    if (lowered.kind !== 'ok') return

    const lir = lowerVirToLir(lowered.module)
    expect(lir.kind).toBe('ok')
    if (lir.kind !== 'ok') return

    const instructions = lir.module.functions[0].instructions
    expect(instructions.map(instruction => instruction.kind)).toEqual([
      'score_set',
      'score_copy',
      'score_add',
      'score_copy',
      'score_sub',
      'score_set',
      'score_copy',
      'score_mul',
      'return_value',
    ])

    expect(instructions[0]).toEqual({ kind: 'score_set', dst: { player: '$v2', obj: '__arith' }, value: 3 })
    expect(instructions[1]).toEqual({ kind: 'score_copy', dst: { player: '$v3', obj: '__arith' }, src: { player: '$v0', obj: '__arith' } })
    expect(instructions[2]).toEqual({ kind: 'score_add', dst: { player: '$v3', obj: '__arith' }, src: { player: '$v1', obj: '__arith' } })
    expect(instructions[7]).toMatchObject({ kind: 'score_mul', dst: { player: '$v6', obj: '__arith' }, src: { player: '$v5', obj: '__arith' } })
    expect(instructions[8]).toEqual({ kind: 'return_value', slot: { player: '$v6', obj: '__arith' } })
  })

  test('lowers void return without writing the shared return slot', () => {
    const mir = makeMirOneBlockFunction([
      { kind: 'const', dst: 'scratch', value: 3 },
    ], 'scratch')
    mir.functions[0].blocks[0].term = { kind: 'return', value: null }

    const lowered = lowerMirToVir(mir)
    expect(lowered.kind).toBe('ok')
    if (lowered.kind !== 'ok') return

    const lir = lowerVirToLir(lowered.module)
    expect(lir.kind).toBe('ok')
    if (lir.kind !== 'ok') return

    expect(lir.module.functions[0].instructions).toEqual([
      { kind: 'score_set', dst: { player: '$v2', obj: '__arith' }, value: 3 },
    ])
  })

  test('planned mode reuses destructive lhs slots and precolors return to $ret', () => {
    const mir = makeMirOneBlockFunction([
      { kind: 'add', dst: 'x', a: { kind: 'temp', name: 'a' }, b: { kind: 'temp', name: 'b' } },
      { kind: 'sub', dst: 'y', a: { kind: 'temp', name: 'x' }, b: { kind: 'temp', name: 'b' } },
    ], 'y')

    const lowered = lowerMirToVir(mir)
    expect(lowered.kind).toBe('ok')
    if (lowered.kind !== 'ok') return

    const direct = lowerVirToLir(lowered.module)
    expect(direct.kind).toBe('ok')
    if (direct.kind !== 'ok') return

    const planned = lowerVirToLir(lowered.module, { mode: 'planned' })
    expect(planned.kind).toBe('ok')
    if (planned.kind !== 'ok') return

    const directCopyCount = direct.module.functions[0].instructions.filter(instruction => instruction.kind === 'score_copy').length
    const plannedCopyCount = planned.module.functions[0].instructions.filter(instruction => instruction.kind === 'score_copy').length
    const plannedInstructions = planned.module.functions[0].instructions

    expect(plannedCopyCount).toBeLessThan(directCopyCount)
    expect(plannedInstructions).toEqual(expect.arrayContaining([
      { kind: 'score_sub', dst: { player: '$ret', obj: '__arith' }, src: { player: '$v1', obj: '__arith' } },
      { kind: 'return_value', slot: { player: '$ret', obj: '__arith' } },
    ]))
    expect(plannedInstructions).not.toEqual(expect.arrayContaining([
      { kind: 'score_copy', dst: { player: '$v2', obj: '__arith' }, src: { player: '$v1', obj: '__arith' } },
    ]))
  })

  test('rejects mixed unsupported instructions without partial fallback', () => {
    const mir: MIRModule = {
      namespace: 'arith',
      objective: '__arith',
      functions: [
        {
          name: 'mixed',
          params: [{ name: 'a', isMacroParam: false }],
          blocks: [{
            id: 'entry',
            instrs: [
              { kind: 'const', dst: 'a1', value: 1 },
              { kind: 'copy', dst: 'tmp', src: { kind: 'temp', name: 'a' } } as MIRInstr,
            ],
            term: { kind: 'return', value: { kind: 'temp', name: 'a1' } },
            preds: [],
          }],
          entry: 'entry',
          isMacro: false,
          sourceLoc: { file: 'test.redscript', line: 1, col: 1 },
        },
      ],
    }

    const lowered = lowerMirToVir(mir)
    expect(lowered).toMatchObject({ kind: 'unsupported', reason: expect.stringContaining('unsupported instruction') })
    if (lowered.kind === 'unsupported') {
      expect(lowered.reasonTags).toEqual(expect.arrayContaining(['unsupported-mir-op-kind']))
      expect(lowered.unsupportedMirOpKinds).toEqual(expect.arrayContaining(['copy']))
    }
  })

  test('captures MIR call target metadata on unsupported call instructions', () => {
    const mir: MIRModule = {
      namespace: 'arith',
      objective: '__arith',
      functions: [{
        name: 'unsupported_call',
        params: [
          { name: 'a', isMacroParam: false },
          { name: 'b', isMacroParam: false },
        ],
        blocks: [{
          id: 'entry',
          instrs: [
            { kind: 'call', dst: 'tmp', fn: 'sqrt_fx', args: [{ kind: 'temp', name: 'a' }, { kind: 'const', value: 2 }] },
            { kind: 'add', dst: 'y', a: { kind: 'temp', name: 'tmp' }, b: { kind: 'temp', name: 'a' } },
          ],
          term: { kind: 'return', value: { kind: 'temp', name: 'y' } },
          preds: [],
        }],
        entry: 'entry',
        isMacro: false,
        sourceLoc: { file: 'test.redscript', line: 1, col: 1 },
      }],
    }

    const lowered = lowerMirToVir(mir)
    expect(lowered).toMatchObject({ kind: 'unsupported', reason: expect.stringContaining("unsupported instruction 'call'") })
    if (lowered.kind === 'unsupported') {
      expect(lowered.unsupportedMirCallTargets).toEqual([
        {
          fn: 'sqrt_fx',
          argCount: 2,
          hasResult: true,
        },
      ])
      expect(lowered.unsupportedMirOpKinds).toEqual(['call'])
    }
  })

  test('supports structured MIR-to-VIR tags for unsupported control-flow shape', () => {
    const mir: MIRModule = {
      namespace: 'arith',
      objective: '__arith',
      functions: [{
        name: 'unsupported',
        params: [{ name: 'a', isMacroParam: false }],
        blocks: [
          {
            id: 'entry',
            instrs: [{ kind: 'const', dst: 'x', value: 1 }],
            term: { kind: 'return', value: { kind: 'temp', name: 'x' } },
            preds: [],
          },
          {
            id: 'other',
            instrs: [],
            term: { kind: 'return', value: { kind: 'temp', name: 'x' } },
            preds: [],
          },
        ],
        entry: 'entry',
        isMacro: false,
        sourceLoc: { file: 'test.redscript', line: 1, col: 1 },
      }],
    }

    const lowered = lowerMirToVir(mir)
    expect(lowered).toMatchObject({ kind: 'unsupported', reason: expect.stringContaining('multi-block') })
    if (lowered.kind === 'unsupported') {
      expect(lowered.reasonTags).toEqual(expect.arrayContaining(['unsupported-control-flow-shape']))
    }
  })

  test('retains operand-shape tags when MIR operands are undeclared', () => {
    const mir = makeMirOneBlockFunction([
      { kind: 'add', dst: 'y', a: { kind: 'temp', name: 'a' }, b: { kind: 'temp', name: 'missing' } },
    ], 'y')

    const lowered = lowerMirToVir(mir)
    expect(lowered).toMatchObject({ kind: 'unsupported', reason: expect.stringContaining('undeclared') })
    if (lowered.kind === 'unsupported') {
      expect(lowered.reasonTags).toEqual(expect.arrayContaining(['unsupported-operand-shape']))
    }
  })

  test('auto decision gate accepts planned output when planned is not worse', () => {
    const mir = makeMirOneBlockFunction([
      { kind: 'add', dst: 'x', a: { kind: 'temp', name: 'a' }, b: { kind: 'temp', name: 'b' } },
      { kind: 'sub', dst: 'y', a: { kind: 'temp', name: 'x' }, b: { kind: 'temp', name: 'a' } },
    ], 'y')

    const lowered = lowerMirToVir(mir)
    expect(lowered.kind).toBe('ok')
    if (lowered.kind !== 'ok') return

    const decision = chooseVirLoweringPlan(lowered.module)
    expect(decision.kind).toBe('ok')
    if (decision.kind !== 'ok') return

    expect(decision.decisions).toHaveLength(1)
    expect(decision.decisions[0]).toMatchObject({
      functionName: 'probe',
      status: 'accepted',
      selectedMode: 'planned',
    })
    expect(decision.decisions[0].planned.instructionCount).toBeLessThanOrEqual(decision.decisions[0].direct.instructionCount)
    if (decision.decisions[0].planned.instructionCount === decision.decisions[0].direct.instructionCount) {
      expect(decision.decisions[0].planned.scoreCopyCount).toBeLessThanOrEqual(decision.decisions[0].direct.scoreCopyCount)
    }

    const auto = lowerVirToLir(lowered.module, { mode: 'auto' })
    expect(auto.kind).toBe('ok')
    if (auto.kind !== 'ok') return
    expect(auto.module.functions[0].instructions).toEqual(decision.selectedModule?.functions[0].instructions)
    expect(auto.module.functions[0].instructions).toEqual(expect.arrayContaining([
      { kind: 'return_value', slot: { player: '$ret', obj: '__arith' } },
    ]))
  })

  test('auto decision gate rejects planned when mocked planned output is higher cost', () => {
    const mir = makeMirOneBlockFunction([
      { kind: 'add', dst: 'x', a: { kind: 'temp', name: 'a' }, b: { kind: 'temp', name: 'b' } },
      { kind: 'add', dst: 'y', a: { kind: 'temp', name: 'x' }, b: { kind: 'temp', name: 'a' } },
    ], 'x')

    const lowered = lowerMirToVir(mir)
    expect(lowered.kind).toBe('ok')
    if (lowered.kind !== 'ok') return

    const originalEmitPlannedFunction = slotPlanner.emitPlannedFunction
    const emitSpy = jest.spyOn(slotPlanner, 'emitPlannedFunction').mockImplementation(plan => {
      const emitted = originalEmitPlannedFunction(plan)
      if (emitted.kind !== 'ok') return emitted
      return {
        kind: 'ok',
        value: [
          ...emitted.value,
          { kind: 'score_copy', dst: { player: '$waste', obj: '__arith' }, src: { player: '$waste', obj: '__arith' } },
          { kind: 'score_copy', dst: { player: '$waste', obj: '__arith' }, src: { player: '$waste', obj: '__arith' } },
          { kind: 'score_copy', dst: { player: '$waste', obj: '__arith' }, src: { player: '$waste', obj: '__arith' } },
        ],
      }
    })

    try {
      const decision = chooseVirLoweringPlan(lowered.module)
      expect(decision.kind).toBe('ok')
      if (decision.kind !== 'ok') return

      expect(decision.decisions).toHaveLength(1)
      expect(decision.decisions[0].status).toBe('rejected')
      expect(decision.decisions[0].selectedMode).toBe('direct')
      expect(decision.decisions[0].rejectionCategory).toBe('higher_cost')
      expect(decision.decisions[0].rejectionReasonTags).toEqual(expect.arrayContaining(['direct-higher-cost']))
      expect(decision.decisions[0].planned.instructionCount).toBeGreaterThan(decision.decisions[0].direct.instructionCount)
      expect(decision.decisions[0].rejectionReason).toContain('planned instruction estimate')
    } finally {
      emitSpy.mockRestore()
    }
  })

  test('decision gate surfaces allocation-check failures as rejection categories', () => {
    const mir = makeMirOneBlockFunction([
      { kind: 'add', dst: 'x', a: { kind: 'temp', name: 'a' }, b: { kind: 'temp', name: 'b' } },
      { kind: 'sub', dst: 'y', a: { kind: 'temp', name: 'x' }, b: { kind: 'temp', name: 'b' } },
    ], 'y')

    const lowered = lowerMirToVir(mir)
    expect(lowered.kind).toBe('ok')
    if (lowered.kind !== 'ok') return

    const spy = jest.spyOn(allocationChecker, 'collectAllocationFailure').mockReturnValue({
      reason: 'synthetic parallel-copy cycle',
    })

    try {
      const decision = chooseVirLoweringPlan(lowered.module)
      expect(decision.kind).toBe('ok')
      if (decision.kind !== 'ok') return
      expect(decision.decisions[0].status).toBe('rejected')
      expect(decision.decisions[0].selectedMode).toBe('direct')
      expect(decision.decisions[0].rejectionCategory).toBe('allocation_check_failed')
      expect(decision.decisions[0].rejectionReasonTags).toEqual(expect.arrayContaining([
        'allocation-check-failure',
        'planned-lowering-unsupported',
      ]))
      expect(decision.decisions[0].planned.allocationCheckFailureReason).toBe('synthetic parallel-copy cycle')
      expect(decision.rejectionCategoryCounts.allocation_check_failed).toBe(1)
    } finally {
      spy.mockRestore()
    }
  })

  test('maps direct_unsupported category to direct-lowering rejection tags when direct fails', () => {
    const module = makeMalformedVIRModuleForDirectUnsupported()
    const isPureSpy = jest.spyOn(virTypes, 'isPureOp').mockImplementation(op => {
      if (op.kind === 'arith.add') return false
      return true
    })
    const verifySpy = jest.spyOn(virVerifier, 'verifyVIR').mockReturnValue([])
    const slotSpy = jest.spyOn(slotPlanner, 'planSlotsForFunction').mockReturnValue({
      kind: 'ok',
      plan: {
        functionName: 'probe',
        objective: '__arith',
        valueToSlot: new Map<number, { player: string; obj: string }>(),
        scratchSlot: { player: '$scratch', obj: '__arith' },
        copiedSlotsCount: 0,
        operations: [],
      },
    })
    const emitSpy = jest.spyOn(slotPlanner, 'emitPlannedFunction').mockReturnValue({
      kind: 'ok',
      value: [{ kind: 'return_value', slot: { player: '$ret', obj: '__arith' } }],
    })

    try {
      const decision = chooseVirLoweringPlan(module, { runAllocationCheck: false })
      expect(decision.kind).toBe('ok')
      if (decision.kind !== 'ok') return

      expect(decision.decisions).toHaveLength(1)
      expect(decision.decisions[0].status).toBe('accepted')
      expect(decision.decisions[0].rejectionCategory).toBe('direct_unsupported')
      expect(decision.decisions[0].selectedMode).toBe('planned')
      expect(decision.decisions[0].rejectionReasonTags).toEqual(expect.arrayContaining([
        'direct-lowering-unsupported',
        'unsupported-mir-op-kind',
      ]))
    } finally {
      isPureSpy.mockRestore()
      verifySpy.mockRestore()
      emitSpy.mockRestore()
      slotSpy.mockRestore()
    }
  })

  test('maps unsupported_both category to combined rejection tags for full fallback failures', () => {
    const module = makeMalformedVIRModuleForDirectUnsupported()
    const isPureSpy = jest.spyOn(virTypes, 'isPureOp').mockImplementation(op => {
      if (op.kind === 'arith.add') return false
      return true
    })
    const verifySpy = jest.spyOn(virVerifier, 'verifyVIR').mockReturnValue([])
    const slotSpy = jest.spyOn(slotPlanner, 'planSlotsForFunction').mockReturnValue({
      kind: 'unsupported',
        reason: 'planned lowered to unsupported',
      } as { kind: 'unsupported', reason: string })

    try {
      const decision = chooseVirLoweringPlan(module, { runAllocationCheck: false })
      expect(decision.kind).toBe('unsupported')
      if (decision.kind === 'ok') return

      expect(decision.decisions).toHaveLength(1)
      expect(decision.decisions[0].status).toBe('unsupported')
      expect(decision.decisions[0].rejectionCategory).toBe('unsupported_both')
      expect(decision.unsupportedReasonTags).toEqual(expect.arrayContaining([
        'unsupported-both-modes',
        'unsupported-mir-op-kind',
      ]))
      expect(decision.decisions[0].rejectionReasonTags).toEqual(expect.arrayContaining([
        'unsupported-both-modes',
        'unsupported-mir-op-kind',
      ]))
    } finally {
      isPureSpy.mockRestore()
      verifySpy.mockRestore()
      slotSpy.mockRestore()
    }
  })

  test('keeps commutative swap behavior safe in decision acceptance', () => {
    const mir = makeMirOneBlockFunction([
      { kind: 'add', dst: 'x', a: { kind: 'temp', name: 'a' }, b: { kind: 'const', value: 1 } },
      { kind: 'add', dst: 'y', a: { kind: 'temp', name: 'x' }, b: { kind: 'temp', name: 'b' } },
      { kind: 'add', dst: 'z', a: { kind: 'temp', name: 'y' }, b: { kind: 'temp', name: 'x' } },
    ], 'z')

    const lowered = lowerMirToVir(mir)
    expect(lowered.kind).toBe('ok')
    if (lowered.kind !== 'ok') return

    const decision = chooseVirLoweringPlan(lowered.module)
    expect(decision.kind).toBe('ok')
    if (decision.kind !== 'ok') return

    expect(decision.decisions[0].status).toBe('accepted')
    expect(decision.decisions[0].selectedMode).toBe('planned')
    expect(decision.decisions[0].planned.instructionCount).toBeLessThanOrEqual(decision.decisions[0].direct.instructionCount)
    expect(decision.decisions[0].planned.scoreCopyCount).toBeLessThanOrEqual(decision.decisions[0].direct.scoreCopyCount + 1)
  })
})
