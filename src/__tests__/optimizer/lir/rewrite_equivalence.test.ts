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

  test('proves local temp copy + score_sub feeding output rewrite', () => {
    const src = mkSlot('$src')
    const rhs = mkSlot('$rhs')
    const tmp = mkSlot('$tmp')
    const out = mkSlot('$out')
    const before = mkFn([
      { kind: 'score_copy', dst: tmp, src },
      { kind: 'score_sub', dst: tmp, src: rhs },
      { kind: 'score_copy', dst: out, src: tmp },
    ])
    const after = mkFn([
      { kind: 'score_copy', dst: out, src },
      { kind: 'score_sub', dst: out, src: rhs },
    ])

    const result = checkBoundedLirEquivalence({
      name: 'predecessor-score-sub-local-temp-to-output',
      before,
      after,
      observedSlots: [out],
      samples: [
        sample([[src, 42], [rhs, 7], [tmp, 0], [out, 0]]),
        sample([[src, -8], [rhs, 3], [tmp, 10], [out, -1]]),
      ],
    })

    expect(result.status).toBe('equivalent')
    expect(result.samplesChecked).toBe(2)
  })

  test('proves local temp copy + score_mul feeding output rewrite', () => {
    const src = mkSlot('$src')
    const rhs = mkSlot('$rhs')
    const tmp = mkSlot('$tmp')
    const out = mkSlot('$out')
    const before = mkFn([
      { kind: 'score_copy', dst: tmp, src },
      { kind: 'score_mul', dst: tmp, src: rhs },
      { kind: 'score_copy', dst: out, src: tmp },
    ])
    const after = mkFn([
      { kind: 'score_copy', dst: out, src },
      { kind: 'score_mul', dst: out, src: rhs },
    ])

    const result = checkBoundedLirEquivalence({
      name: 'predecessor-score-mul-local-temp-to-output',
      before,
      after,
      observedSlots: [out],
      samples: [
        sample([[src, 2], [rhs, 8], [tmp, 99], [out, 0]]),
        sample([[src, -3], [rhs, -4], [tmp, 5], [out, 0]]),
      ],
    })

    expect(result.status).toBe('equivalent')
    expect(result.samplesChecked).toBe(2)
  })

  test('proves local temp copy + score_min feeding output rewrite', () => {
    const src = mkSlot('$src')
    const rhs = mkSlot('$rhs')
    const tmp = mkSlot('$tmp')
    const out = mkSlot('$out')
    const before = mkFn([
      { kind: 'score_copy', dst: tmp, src },
      { kind: 'score_min', dst: tmp, src: rhs },
      { kind: 'score_copy', dst: out, src: tmp },
    ])
    const after = mkFn([
      { kind: 'score_copy', dst: out, src },
      { kind: 'score_min', dst: out, src: rhs },
    ])

    const result = checkBoundedLirEquivalence({
      name: 'predecessor-score-min-local-temp-to-output',
      before,
      after,
      observedSlots: [out],
      samples: [
        sample([[src, 12], [rhs, 4], [tmp, 0], [out, 0]]),
        sample([[src, -2], [rhs, 6], [tmp, 10], [out, 0]]),
      ],
    })

    expect(result.status).toBe('equivalent')
    expect(result.samplesChecked).toBe(2)
  })

  test('proves local temp copy + score_max feeding output rewrite', () => {
    const src = mkSlot('$src')
    const rhs = mkSlot('$rhs')
    const tmp = mkSlot('$tmp')
    const out = mkSlot('$out')
    const before = mkFn([
      { kind: 'score_copy', dst: tmp, src },
      { kind: 'score_max', dst: tmp, src: rhs },
      { kind: 'score_copy', dst: out, src: tmp },
    ])
    const after = mkFn([
      { kind: 'score_copy', dst: out, src },
      { kind: 'score_max', dst: out, src: rhs },
    ])

    const result = checkBoundedLirEquivalence({
      name: 'predecessor-score-max-local-temp-to-output',
      before,
      after,
      observedSlots: [out],
      samples: [
        sample([[src, 12], [rhs, 4], [tmp, 0], [out, 0]]),
        sample([[src, -2], [rhs, -6], [tmp, 10], [out, 0]]),
      ],
    })

    expect(result.status).toBe('equivalent')
    expect(result.samplesChecked).toBe(2)
  })

  test('proves local-temp consumed into output then never observed after window', () => {
    const src = mkSlot('$src')
    const rhs = mkSlot('$rhs')
    const tmp = mkSlot('$tmp')
    const out = mkSlot('$out')
    const marker = mkSlot('$marker')
    const before = mkFn([
      { kind: 'score_copy', dst: tmp, src },
      { kind: 'score_add', dst: tmp, src: rhs },
      { kind: 'score_copy', dst: out, src: tmp },
      { kind: 'score_set', dst: marker, value: 77 },
      { kind: 'score_set', dst: tmp, value: 5 },
    ])
    const after = mkFn([
      { kind: 'score_copy', dst: out, src },
      { kind: 'score_add', dst: out, src: rhs },
      { kind: 'score_set', dst: marker, value: 77 },
      { kind: 'score_set', dst: tmp, value: 5 },
    ])

    const result = checkBoundedLirEquivalence({
      name: 'local-temp-write-window-safe-if-temp-not-observed',
      before,
      after,
      observedSlots: [out, marker],
      samples: [sample([[src, 11], [rhs, 4], [tmp, -2], [out, 0], [marker, 1]])],
    })

    expect(result.status).toBe('equivalent')
    expect(result.samplesChecked).toBe(1)
  })

  test('flags counterexample when local temp is read/observed after rewrite window', () => {
    const src = mkSlot('$src')
    const rhs = mkSlot('$rhs')
    const tail = mkSlot('$tail')
    const tmp = mkSlot('$tmp')
    const out = mkSlot('$out')
    const before = mkFn([
      { kind: 'score_copy', dst: tmp, src },
      { kind: 'score_add', dst: tmp, src: rhs },
      { kind: 'score_copy', dst: out, src: tmp },
      { kind: 'score_add', dst: tmp, src: tail },
    ])
    const after = mkFn([
      { kind: 'score_copy', dst: out, src },
      { kind: 'score_add', dst: out, src: rhs },
      { kind: 'score_add', dst: tmp, src: tail },
    ])

    const result = checkBoundedLirEquivalence({
      name: 'local-temp-observed-after-window-is-unsafe',
      before,
      after,
      observedSlots: [out, tmp],
      samples: [sample([[src, 9], [rhs, 4], [tail, 5], [tmp, 1], [out, 0]])],
    })

    expect(result.status).toBe('counterexample')
    expect(result.counterexample).toMatchObject({
      sampleIndex: 0,
      slot: slotKey(tmp),
      beforeValue: 18,
      afterValue: 6,
    })
  })

  test('proves local temp copy + score_div with nonzero divisor feeding output rewrite', () => {
    const src = mkSlot('$src')
    const divisor = mkSlot('$divisor')
    const tmp = mkSlot('$tmp')
    const out = mkSlot('$out')
    const before = mkFn([
      { kind: 'score_copy', dst: tmp, src },
      { kind: 'score_div', dst: tmp, src: divisor },
      { kind: 'score_copy', dst: out, src: tmp },
    ])
    const after = mkFn([
      { kind: 'score_copy', dst: out, src },
      { kind: 'score_div', dst: out, src: divisor },
    ])

    const result = checkBoundedLirEquivalence({
      name: 'predecessor-score-div-local-temp-to-output-nonzero',
      before,
      after,
      observedSlots: [out],
      samples: [
        sample([[src, 14], [divisor, 2], [tmp, 0], [out, 0]]),
        sample([[src, -9], [divisor, 3], [tmp, 77], [out, 0]]),
        sample([[src, 9], [divisor, -4], [tmp, 3], [out, 0]]),
        sample([[src, -9], [divisor, -4], [tmp, -3], [out, 0]]),
      ],
    })

    expect(result.status).toBe('equivalent')
    expect(result.samplesChecked).toBe(4)
  })

  test('proves local temp copy + score_mod with nonzero divisor feeding output rewrite', () => {
    const src = mkSlot('$src')
    const divisor = mkSlot('$divisor')
    const tmp = mkSlot('$tmp')
    const out = mkSlot('$out')
    const before = mkFn([
      { kind: 'score_copy', dst: tmp, src },
      { kind: 'score_mod', dst: tmp, src: divisor },
      { kind: 'score_copy', dst: out, src: tmp },
    ])
    const after = mkFn([
      { kind: 'score_copy', dst: out, src },
      { kind: 'score_mod', dst: out, src: divisor },
    ])

    const result = checkBoundedLirEquivalence({
      name: 'predecessor-score-mod-local-temp-to-output-nonzero',
      before,
      after,
      observedSlots: [out],
      samples: [
        sample([[src, 14], [divisor, 5], [tmp, 0], [out, 0]]),
        sample([[src, -9], [divisor, 4], [tmp, 77], [out, 0]]),
        sample([[src, 9], [divisor, -4], [tmp, 3], [out, 0]]),
        sample([[src, -9], [divisor, -4], [tmp, -3], [out, 0]]),
      ],
    })

    expect(result.status).toBe('equivalent')
    expect(result.samplesChecked).toBe(4)
  })

  test('proves copy-chain/no-reuse elimination to output', () => {
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
      name: 'copy-chain-no-reuse',
      before,
      after,
      observedSlots: [out],
      samples: [
        sample([[src, 2], [tmp, 99], [out, 0]]),
        sample([[src, -3], [tmp, 7], [out, 8]]),
      ],
    })

    expect(result.status).toBe('equivalent')
    expect(result.samplesChecked).toBe(2)
    expect(result.counterexample).toBeUndefined()
  })

  test('proves local-copy/output RMW rewrite shape over bounded samples', () => {
    const src = mkSlot('$src')
    const tmp = mkSlot('$tmp')
    const rhs = mkSlot('$rhs')
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
      name: 'local-copy-output-rmw',
      before,
      after,
      observedSlots: [out],
      samples: [
        sample([[src, 10], [rhs, 3], [tmp, 0], [out, 0]]),
        sample([[src, -6], [rhs, 4], [tmp, 7], [out, -1]]),
      ],
    })

    expect(result.status).toBe('equivalent')
    expect(result.samplesChecked).toBe(2)
  })

  test('proves local-copy/return RMW shape over bounded samples', () => {
    const src = mkSlot('$src')
    const tmp = mkSlot('$tmp')
    const rhs = mkSlot('$rhs')
    const before = mkFn([
      { kind: 'score_copy', dst: tmp, src },
      { kind: 'score_add', dst: tmp, src: rhs },
      { kind: 'return_value', slot: tmp },
    ])
    const after = mkFn([
      { kind: 'score_copy', dst: mkSlot('$ret'), src },
      { kind: 'score_add', dst: mkSlot('$ret'), src: rhs },
      { kind: 'return_value', slot: mkSlot('$ret') },
    ])

    const result = checkBoundedLirEquivalence({
      name: 'local-copy-return-rmw',
      before,
      after,
      observedSlots: [mkSlot('$ret')],
      samples: [
        sample([[src, 12], [rhs, 5], [tmp, 0], [mkSlot('$ret'), 0]]),
        sample([[src, -2], [rhs, 7], [tmp, 9], [mkSlot('$ret'), -3]]),
      ],
    })

    expect(result.status).toBe('equivalent')
    expect(result.samplesChecked).toBe(2)
  })

  test('proves local-copy/return RMW shape for score_mul', () => {
    const src = mkSlot('$src')
    const rhs = mkSlot('$rhs')
    const tmp = mkSlot('$tmp')
    const ret = mkSlot('$ret')
    const before = mkFn([
      { kind: 'score_copy', dst: tmp, src },
      { kind: 'score_mul', dst: tmp, src: rhs },
      { kind: 'return_value', slot: tmp },
    ])
    const after = mkFn([
      { kind: 'score_copy', dst: ret, src },
      { kind: 'score_mul', dst: ret, src: rhs },
      { kind: 'return_value', slot: ret },
    ])

    const result = checkBoundedLirEquivalence({
      name: 'local-copy-return-rmw-mul',
      before,
      after,
      observedSlots: [ret],
      samples: [
        sample([[src, 12], [rhs, 5], [tmp, 0], [ret, 0]]),
        sample([[src, -4], [rhs, -2], [tmp, 9], [ret, -3]]),
      ],
    })

    expect(result.status).toBe('equivalent')
    expect(result.samplesChecked).toBe(2)
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

  test('refuses modulo by zero samples instead of guessing scoreboard runtime behavior', () => {
    const src = mkSlot('$src')
    const zero = mkSlot('$zero')
    const out = mkSlot('$out')
    const before = mkFn([
      { kind: 'score_copy', dst: out, src },
      { kind: 'score_mod', dst: out, src: zero },
    ])
    const after = mkFn([
      { kind: 'score_copy', dst: out, src },
    ])

    const result = checkBoundedLirEquivalence({
      name: 'modulo-by-zero-is-unsupported',
      before,
      after,
      observedSlots: [out],
      samples: [sample([[src, 8], [zero, 0], [out, 0]])],
    })

    expect(result.status).toBe('unsupported')
    expect(result.unsupportedReason).toContain('modulo by zero')
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
