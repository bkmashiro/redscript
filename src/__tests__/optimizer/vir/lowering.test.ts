import type { MIRFunction, MIRInstr, MIRModule } from '../../../mir/types'
import { lowerMirToVir } from '../../../optimizer/vir/lower/mir-to-vir'
import { lowerVirToLir } from '../../../optimizer/vir/lower/vir-to-lir'

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
    expect(lowered).toEqual({ kind: 'unsupported', reason: expect.stringContaining('unsupported instruction') })
  })
})
