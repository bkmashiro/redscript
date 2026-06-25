import type { LIRFunction, LIRInstr, LIRModule, Slot } from '../../../lir/types'
import { compareVirExperimental } from '../../../optimizer/vir/benchmark'
import type { VirToLirResult } from '../../../optimizer/vir/lower/vir-to-lir'

function mkSlot(player: string): Slot {
  return { player, obj: '__bench' }
}

describe('experimental VIR benchmark comparison stub', () => {
  function makeOldLir(): LIRModule {
    const fn: LIRFunction = {
      name: 'probe',
      instructions: [
        { kind: 'score_set', dst: mkSlot('$a'), value: 1 },
        { kind: 'score_copy', dst: mkSlot('$b'), src: mkSlot('$a') },
        { kind: 'score_add', dst: mkSlot('$a'), src: mkSlot('$b') },
      ],
      isMacro: false,
      macroParams: [],
    }
    return { namespace: 'bench', objective: '__bench', functions: [fn] }
  }

  test('computes command and score-copy deltas for successful experimental lowering', () => {
    const experimental: VirToLirResult = {
      kind: 'ok',
      module: {
        namespace: 'bench',
        objective: '__bench',
        functions: [
          {
            name: 'probe',
            instructions: [
              { kind: 'score_set', dst: mkSlot('$x'), value: 2 },
              { kind: 'score_copy', dst: mkSlot('$y'), src: mkSlot('$x') },
              { kind: 'return_value', slot: mkSlot('$y') },
            ],
            isMacro: false,
            macroParams: [],
          },
        ],
      },
    }

    const comparison = compareVirExperimental({ oldLir: makeOldLir(), experimental })
    expect(comparison.experimentalUnsupportedReason).toBeUndefined()
    expect(comparison.oldEstimate.commandCount).toBe(3)
    expect(comparison.experimentalEstimate.commandCount).toBe(3)
    expect(comparison.commandCountDelta).toBe(0)
    expect(comparison.scoreCopyCountDelta).toBe(0)
  })

  test('reports unsupported reason and zero experimental estimates', () => {
    const comparison = compareVirExperimental({ oldLir: makeOldLir(), experimental: { kind: 'unsupported', reason: 'feature not supported' } })
    expect(comparison.experimentalUnsupportedReason).toBe('feature not supported')
    expect(comparison.experimentalEstimate.commandCount).toBe(0)
    expect(comparison.scoreCopyCountDelta).toBeLessThan(0)
  })
})
