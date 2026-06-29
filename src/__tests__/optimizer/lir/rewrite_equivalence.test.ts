import type { LIRFunction, LIRInstr, Slot } from '../../../lir/types'
import {
  checkBoundedLirEquivalence,
  type BoundedLirEquivalenceSample,
} from '../../../optimizer/lir/equivalence'
import { slotKey } from '../../../optimizer/lir/analysis'

const obj = '__equiv'

function mkSlot(player: string): Slot {
  return { player, obj }
}

function mkFn(instructions: LIRInstr[], name = 'probe'): LIRFunction {
  return { name, instructions, isMacro: false, macroParams: [] }
}

function sample(values: Array<[Slot, number]>): BoundedLirEquivalenceSample {
  return Object.fromEntries(values.map(([slot, value]) => [slotKey(slot), value]))
}

describe('offline bounded LIR rewrite equivalence harness', () => {
  test('proves a local copy forwarding fixture over bounded samples', () => {
    const src = mkSlot('$src')
    const tmp = mkSlot('$tmp')
    const out = mkSlot('$out')
    const before = mkFn([
      { kind: 'score_copy', dst: tmp, src },
      { kind: 'score_copy', dst: out, src: tmp },
    ])
    const after = mkFn([
      { kind: 'score_copy', dst: out, src },
    ])

    const result = checkBoundedLirEquivalence({
      name: 'local-copy-forwarding',
      before,
      after,
      observedSlots: [out],
      samples: [
        sample([[src, -7], [tmp, 100], [out, 0]]),
        sample([[src, 0], [tmp, 5], [out, 99]]),
        sample([[src, 42], [tmp, -1], [out, -3]]),
      ],
    })

    expect(result.status).toBe('equivalent')
    expect(result.samplesChecked).toBe(3)
    expect(result.counterexample).toBeUndefined()
  })

  test('catches a candidate when observed temp state differs', () => {
    const src = mkSlot('$src')
    const tmp = mkSlot('$tmp')
    const out = mkSlot('$out')
    const before = mkFn([
      { kind: 'score_copy', dst: tmp, src },
      { kind: 'score_copy', dst: out, src: tmp },
    ])
    const after = mkFn([
      { kind: 'score_copy', dst: out, src },
    ])

    const result = checkBoundedLirEquivalence({
      name: 'local-copy-forwarding-observing-temp',
      before,
      after,
      observedSlots: [out, tmp],
      samples: [sample([[src, 9], [tmp, 1], [out, 0]])],
    })

    expect(result.status).toBe('counterexample')
    expect(result.counterexample).toMatchObject({
      sampleIndex: 0,
      slot: slotKey(tmp),
      beforeValue: 9,
      afterValue: 1,
    })
  })

  test('proves predecessor arithmetic feeding a local temp when rewritten to the output slot', () => {
    const src = mkSlot('$src')
    const rhs = mkSlot('$rhs')
    const tmp = mkSlot('$tmp')
    const out = mkSlot('$out')
    const before = mkFn([
      { kind: 'score_copy', dst: tmp, src },
      { kind: 'score_add', dst: tmp, src: rhs },
      { kind: 'score_copy', dst: out, src: tmp },
    ])
    const after = mkFn([
      { kind: 'score_copy', dst: out, src },
      { kind: 'score_add', dst: out, src: rhs },
    ])

    const result = checkBoundedLirEquivalence({
      name: 'predecessor-arith-feeds-local-temp',
      before,
      after,
      observedSlots: [out],
      samples: [
        sample([[src, 3], [rhs, 4], [tmp, 0], [out, 0]]),
        sample([[src, -10], [rhs, 6], [tmp, 123], [out, -1]]),
      ],
    })

    expect(result).toMatchObject({
      status: 'equivalent',
      samplesChecked: 2,
    })
  })

  test('refuses division by zero samples instead of guessing scoreboard runtime behavior', () => {
    const src = mkSlot('$src')
    const zero = mkSlot('$zero')
    const out = mkSlot('$out')
    const before = mkFn([
      { kind: 'score_copy', dst: out, src },
      { kind: 'score_div', dst: out, src: zero },
    ])
    const after = mkFn([
      { kind: 'score_copy', dst: out, src },
    ])

    const result = checkBoundedLirEquivalence({
      name: 'division-by-zero-is-unsupported',
      before,
      after,
      observedSlots: [out],
      samples: [sample([[src, 8], [zero, 0], [out, 0]])],
    })

    expect(result.status).toBe('unsupported')
    expect(result.unsupportedReason).toContain('division by zero')
  })

  test('refuses opaque instructions instead of fabricating a proof', () => {
    const src = mkSlot('$src')
    const out = mkSlot('$out')
    const before = mkFn([
      { kind: 'raw', cmd: 'say opaque' },
      { kind: 'score_copy', dst: out, src },
    ])
    const after = mkFn([
      { kind: 'score_copy', dst: out, src },
    ])

    const result = checkBoundedLirEquivalence({
      name: 'opaque-before-window',
      before,
      after,
      observedSlots: [out],
      samples: [sample([[src, 5], [out, 0]])],
    })

    expect(result.status).toBe('unsupported')
    expect(result.unsupportedReason).toContain('raw')
    expect(result.samplesChecked).toBe(0)
  })
})
