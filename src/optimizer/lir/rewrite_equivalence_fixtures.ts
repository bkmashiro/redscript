import type { LIRFunction, LIRInstr, Slot } from '../../lir/types'
import { slotKey } from './analysis'
import {
  checkBoundedLirEquivalence,
  type BoundedLirEquivalenceSample,
  type BoundedLirEquivalenceResult,
  type BoundedLirEquivalenceStatus,
} from './equivalence'

const obj = '__equiv'

type OfflineRewriteExpectedStatus = BoundedLirEquivalenceStatus

export interface OfflineRewriteEquivalenceFixture {
  name: string
  family: string
  expectedStatus: OfflineRewriteExpectedStatus
  before: LIRFunction
  after: LIRFunction
  observedSlots: Slot[]
  samples: BoundedLirEquivalenceSample[]
}

export interface OfflineRewriteFixtureRun {
  name: string
  family: string
  expectedStatus: OfflineRewriteExpectedStatus
  actualStatus: BoundedLirEquivalenceStatus
  passed: boolean
  result: BoundedLirEquivalenceResult
}

export interface OfflineRewriteFamilySummary {
  family: string
  total: number
  equivalent: number
  counterexample: number
  unsupported: number
  failed: number
}

export interface OfflineRewriteSummary {
  total: number
  equivalent: number
  counterexample: number
  unsupported: number
  failed: number
}

export interface OfflineRewriteEquivalenceRun {
  fixtureResults: OfflineRewriteFixtureRun[]
  summaryByFamily: OfflineRewriteFamilySummary[]
  totals: OfflineRewriteSummary
}

function mkSlot(player: string): Slot {
  return { player, obj }
}

function mkFn(instructions: LIRInstr[], name = 'probe'): LIRFunction {
  return { name, instructions, isMacro: false, macroParams: [] }
}

function sample(values: Array<[Slot, number]>): BoundedLirEquivalenceSample {
  return Object.fromEntries(values.map(([slot, value]) => [slotKey(slot), value]))
}

export const offlineRewriteEquivalenceFixtures: OfflineRewriteEquivalenceFixture[] = [
  {
    name: 'local-copy-forwarding-copy-chain',
    family: 'local-copy-forwarding',
    expectedStatus: 'equivalent',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]),
    after: mkFn([{ kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') }]),
    observedSlots: [mkSlot('$out')],
    samples: [
      sample([[mkSlot('$src'), 2], [mkSlot('$tmp'), 99], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), -3], [mkSlot('$tmp'), 7], [mkSlot('$out'), 8]]),
    ],
  },
  {
    name: 'observed-temp-safety',
    family: 'observed-temp-safety',
    expectedStatus: 'equivalent',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]),
    after: mkFn([{ kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') }]),
    observedSlots: [mkSlot('$out')],
    samples: [
      sample([[mkSlot('$src'), -7], [mkSlot('$tmp'), 100], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), 0], [mkSlot('$tmp'), 5], [mkSlot('$out'), 99]]),
      sample([[mkSlot('$src'), 42], [mkSlot('$tmp'), -1], [mkSlot('$out'), -3]]),
    ],
  },
  {
    name: 'observed-temp-counterexample',
    family: 'observed-temp-counterexample',
    expectedStatus: 'counterexample',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]),
    after: mkFn([{ kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') }]),
    observedSlots: [mkSlot('$out'), mkSlot('$tmp')],
    samples: [sample([[mkSlot('$src'), 9], [mkSlot('$tmp'), 1], [mkSlot('$out'), 0]])],
  },
  {
    name: 'predecessor-score-add-local-temp-to-output',
    family: 'predecessor-arithmetic',
    expectedStatus: 'equivalent',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]),
    after: mkFn([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$out'), src: mkSlot('$rhs') },
    ]),
    observedSlots: [mkSlot('$out')],
    samples: [
      sample([[mkSlot('$src'), 3], [mkSlot('$rhs'), 4], [mkSlot('$tmp'), 0], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), -10], [mkSlot('$rhs'), 6], [mkSlot('$tmp'), 123], [mkSlot('$out'), -1]]),
    ],
  },
  {
    name: 'predecessor-score-sub-local-temp-to-output',
    family: 'predecessor-arithmetic',
    expectedStatus: 'equivalent',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_sub', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]),
    after: mkFn([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_sub', dst: mkSlot('$out'), src: mkSlot('$rhs') },
    ]),
    observedSlots: [mkSlot('$out')],
    samples: [
      sample([[mkSlot('$src'), 42], [mkSlot('$rhs'), 7], [mkSlot('$tmp'), 0], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), -8], [mkSlot('$rhs'), 3], [mkSlot('$tmp'), 10], [mkSlot('$out'), -1]]),
    ],
  },
  {
    name: 'predecessor-score-mul-local-temp-to-output',
    family: 'predecessor-arithmetic',
    expectedStatus: 'equivalent',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_mul', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]),
    after: mkFn([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_mul', dst: mkSlot('$out'), src: mkSlot('$rhs') },
    ]),
    observedSlots: [mkSlot('$out')],
    samples: [
      sample([[mkSlot('$src'), 2], [mkSlot('$rhs'), 8], [mkSlot('$tmp'), 99], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), -3], [mkSlot('$rhs'), -4], [mkSlot('$tmp'), 5], [mkSlot('$out'), 0]]),
    ],
  },
  {
    name: 'predecessor-score-min-local-temp-to-output',
    family: 'predecessor-arithmetic',
    expectedStatus: 'equivalent',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_min', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]),
    after: mkFn([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_min', dst: mkSlot('$out'), src: mkSlot('$rhs') },
    ]),
    observedSlots: [mkSlot('$out')],
    samples: [
      sample([[mkSlot('$src'), 12], [mkSlot('$rhs'), 4], [mkSlot('$tmp'), 0], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), -2], [mkSlot('$rhs'), 6], [mkSlot('$tmp'), 10], [mkSlot('$out'), 0]]),
    ],
  },
  {
    name: 'predecessor-score-max-local-temp-to-output',
    family: 'predecessor-arithmetic',
    expectedStatus: 'equivalent',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_max', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]),
    after: mkFn([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_max', dst: mkSlot('$out'), src: mkSlot('$rhs') },
    ]),
    observedSlots: [mkSlot('$out')],
    samples: [
      sample([[mkSlot('$src'), 12], [mkSlot('$rhs'), 4], [mkSlot('$tmp'), 0], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), -2], [mkSlot('$rhs'), -6], [mkSlot('$tmp'), 10], [mkSlot('$out'), 0]]),
    ],
  },
  {
    name: 'predecessor-score-div-local-temp-to-output-nonzero',
    family: 'predecessor-arithmetic',
    expectedStatus: 'equivalent',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_div', dst: mkSlot('$tmp'), src: mkSlot('$divisor') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]),
    after: mkFn([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_div', dst: mkSlot('$out'), src: mkSlot('$divisor') },
    ]),
    observedSlots: [mkSlot('$out')],
    samples: [
      sample([[mkSlot('$src'), 14], [mkSlot('$divisor'), 2], [mkSlot('$tmp'), 0], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), -9], [mkSlot('$divisor'), 3], [mkSlot('$tmp'), 77], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), 9], [mkSlot('$divisor'), -4], [mkSlot('$tmp'), 3], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), -9], [mkSlot('$divisor'), -4], [mkSlot('$tmp'), -3], [mkSlot('$out'), 0]]),
    ],
  },
  {
    name: 'predecessor-score-mod-local-temp-to-output-nonzero',
    family: 'predecessor-arithmetic',
    expectedStatus: 'equivalent',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_mod', dst: mkSlot('$tmp'), src: mkSlot('$divisor') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]),
    after: mkFn([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_mod', dst: mkSlot('$out'), src: mkSlot('$divisor') },
    ]),
    observedSlots: [mkSlot('$out')],
    samples: [
      sample([[mkSlot('$src'), 14], [mkSlot('$divisor'), 5], [mkSlot('$tmp'), 0], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), -9], [mkSlot('$divisor'), 4], [mkSlot('$tmp'), 77], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), 9], [mkSlot('$divisor'), -4], [mkSlot('$tmp'), 3], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), -9], [mkSlot('$divisor'), -4], [mkSlot('$tmp'), -3], [mkSlot('$out'), 0]]),
    ],
  },
  {
    name: 'local-temp-write-window-safe-if-temp-not-observed',
    family: 'read-write-window',
    expectedStatus: 'equivalent',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
      { kind: 'score_set', dst: mkSlot('$marker'), value: 77 },
      { kind: 'score_set', dst: mkSlot('$tmp'), value: 5 },
    ]),
    after: mkFn([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$out'), src: mkSlot('$rhs') },
      { kind: 'score_set', dst: mkSlot('$marker'), value: 77 },
      { kind: 'score_set', dst: mkSlot('$tmp'), value: 5 },
    ]),
    observedSlots: [mkSlot('$out'), mkSlot('$marker')],
    samples: [sample([[mkSlot('$src'), 11], [mkSlot('$rhs'), 4], [mkSlot('$tmp'), -2], [mkSlot('$out'), 0], [mkSlot('$marker'), 1]])],
  },
  {
    name: 'local-temp-multi-rmw-window-safe-if-temp-not-observed',
    family: 'read-write-window',
    expectedStatus: 'equivalent',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs1') },
      { kind: 'score_mul', dst: mkSlot('$tmp'), src: mkSlot('$rhs2') },
      { kind: 'score_sub', dst: mkSlot('$tmp'), src: mkSlot('$rhs3') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]),
    after: mkFn([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$out'), src: mkSlot('$rhs1') },
      { kind: 'score_mul', dst: mkSlot('$out'), src: mkSlot('$rhs2') },
      { kind: 'score_sub', dst: mkSlot('$out'), src: mkSlot('$rhs3') },
    ]),
    observedSlots: [mkSlot('$out')],
    samples: [
      sample([[mkSlot('$src'), 2], [mkSlot('$rhs1'), 3], [mkSlot('$rhs2'), 4], [mkSlot('$rhs3'), 5], [mkSlot('$tmp'), 99], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), -7], [mkSlot('$rhs1'), 10], [mkSlot('$rhs2'), -2], [mkSlot('$rhs3'), 8], [mkSlot('$tmp'), 1], [mkSlot('$out'), 5]]),
    ],
  },
  {
    name: 'local-temp-multi-rmw-window-observed-temp-is-counterexample',
    family: 'read-write-window',
    expectedStatus: 'counterexample',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs1') },
      { kind: 'score_mul', dst: mkSlot('$tmp'), src: mkSlot('$rhs2') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]),
    after: mkFn([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$out'), src: mkSlot('$rhs1') },
      { kind: 'score_mul', dst: mkSlot('$out'), src: mkSlot('$rhs2') },
    ]),
    observedSlots: [mkSlot('$out'), mkSlot('$tmp')],
    samples: [sample([[mkSlot('$src'), 3], [mkSlot('$rhs1'), 4], [mkSlot('$rhs2'), 5], [mkSlot('$tmp'), 6], [mkSlot('$out'), 0]])],
  },
  {
    name: 'local-temp-observed-after-window-is-unsafe',
    family: 'read-write-window',
    expectedStatus: 'counterexample',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$tail') },
    ]),
    after: mkFn([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$out'), src: mkSlot('$rhs') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$tail') },
    ]),
    observedSlots: [mkSlot('$out'), mkSlot('$tmp')],
    samples: [sample([[mkSlot('$src'), 9], [mkSlot('$rhs'), 4], [mkSlot('$tail'), 5], [mkSlot('$tmp'), 1], [mkSlot('$out'), 0]])],
  },
  {
    name: 'score-swap-window-only-output-is-equivalent',
    family: 'score-swap-window',
    expectedStatus: 'equivalent',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_swap', a: mkSlot('$tmp'), b: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]),
    after: mkFn([{ kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$rhs') }]),
    observedSlots: [mkSlot('$out')],
    samples: [
      sample([[mkSlot('$src'), 12], [mkSlot('$rhs'), 5], [mkSlot('$tmp'), 0], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), -3], [mkSlot('$rhs'), 9], [mkSlot('$tmp'), 7], [mkSlot('$out'), -1]]),
    ],
  },
  {
    name: 'score-swap-window-observed-temp-is-counterexample',
    family: 'score-swap-window',
    expectedStatus: 'counterexample',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_swap', a: mkSlot('$tmp'), b: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]),
    after: mkFn([{ kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$rhs') }]),
    observedSlots: [mkSlot('$out'), mkSlot('$tmp')],
    samples: [
      sample([[mkSlot('$src'), 1], [mkSlot('$rhs'), 8], [mkSlot('$tmp'), 4], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), -7], [mkSlot('$rhs'), 2], [mkSlot('$tmp'), -2], [mkSlot('$out'), 9]]),
    ],
  },
  {
    name: 'score-set-overwrite-window-not-observed-is-equivalent',
    family: 'score-set-overwrite-window',
    expectedStatus: 'equivalent',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
      { kind: 'score_set', dst: mkSlot('$tmp'), value: 5 },
    ]),
    after: mkFn([{ kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') }]),
    observedSlots: [mkSlot('$out')],
    samples: [
      sample([[mkSlot('$src'), 4], [mkSlot('$tmp'), 11], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), -9], [mkSlot('$tmp'), 77], [mkSlot('$out'), 7]]),
    ],
  },
  {
    name: 'score-set-overwrite-window-observed-temp-is-counterexample',
    family: 'score-set-overwrite-window',
    expectedStatus: 'counterexample',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
      { kind: 'score_set', dst: mkSlot('$tmp'), value: 5 },
    ]),
    after: mkFn([{ kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') }]),
    observedSlots: [mkSlot('$out'), mkSlot('$tmp')],
    samples: [
      sample([[mkSlot('$src'), 3], [mkSlot('$tmp'), 2], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), 0], [mkSlot('$tmp'), -6], [mkSlot('$out'), 5]]),
    ],
  },
  {
    name: 'unsupported-boundary-store-cmd-to-score',
    family: 'unsupported-typed-boundary',
    expectedStatus: 'unsupported',
    before: mkFn([
      {
        kind: 'store_cmd_to_score',
        dst: mkSlot('$tmp'),
        cmd: { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]),
    after: mkFn([{ kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') }]),
    observedSlots: [mkSlot('$out')],
    samples: [sample([[mkSlot('$src'), 2], [mkSlot('$tmp'), 9], [mkSlot('$out'), 0]])],
  },
  {
    name: 'unsupported-boundary-store-score-to-nbt',
    family: 'unsupported-typed-boundary',
    expectedStatus: 'unsupported',
    before: mkFn([
      {
        kind: 'store_score_to_nbt',
        ns: 'rs:dp',
        path: 'value',
        type: 'int',
        scale: 1,
        src: mkSlot('$src'),
      },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
    ]),
    after: mkFn([{ kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') }]),
    observedSlots: [mkSlot('$out')],
    samples: [sample([[mkSlot('$src'), 8], [mkSlot('$out'), 0]])],
  },
  {
    name: 'unsupported-boundary-nbt-set-literal',
    family: 'unsupported-typed-boundary',
    expectedStatus: 'unsupported',
    before: mkFn([
      { kind: 'nbt_set_literal', ns: 'rs:dp', path: 'v', value: '0' },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
    ]),
    after: mkFn([{ kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') }]),
    observedSlots: [mkSlot('$out')],
    samples: [sample([[mkSlot('$src'), 15], [mkSlot('$out'), 0]])],
  },
  {
    name: 'unsupported-boundary-call-if-matches',
    family: 'unsupported-typed-boundary',
    expectedStatus: 'unsupported',
    before: mkFn([
      {
        kind: 'call_if_matches',
        fn: 'rs:helper',
        slot: mkSlot('$src'),
        range: '1..3',
      },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
    ]),
    after: mkFn([{ kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') }]),
    observedSlots: [mkSlot('$out')],
    samples: [sample([[mkSlot('$src'), 2], [mkSlot('$out'), 0]])],
  },
  {
    name: 'unsupported-boundary-call-context',
    family: 'unsupported-typed-boundary',
    expectedStatus: 'unsupported',
    before: mkFn([
      {
        kind: 'call_context',
        fn: 'rs:helper',
        subcommands: [],
      },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
    ]),
    after: mkFn([{ kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') }]),
    observedSlots: [mkSlot('$out')],
    samples: [sample([[mkSlot('$src'), 7], [mkSlot('$zero'), 0], [mkSlot('$out'), 0]])],
  },
  {
    name: 'unsupported-boundary-macro-line',
    family: 'unsupported-typed-boundary',
    expectedStatus: 'unsupported',
    before: mkFn([
      { kind: 'macro_line', template: 'say $(msg)' },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
    ]),
    after: mkFn([{ kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') }]),
    observedSlots: [mkSlot('$out')],
    samples: [sample([[mkSlot('$src'), 5], [mkSlot('$out'), 0]])],
  },
  {
    name: 'copy-chain/no-reuse',
    family: 'local-copy-forwarding',
    expectedStatus: 'equivalent',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]),
    after: mkFn([{ kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') }]),
    observedSlots: [mkSlot('$out')],
    samples: [
      sample([[mkSlot('$src'), 2], [mkSlot('$tmp'), 99], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), -3], [mkSlot('$tmp'), 7], [mkSlot('$out'), 8]]),
    ],
  },
  {
    name: 'local-copy-output-rmw',
    family: 'local-copy-forwarding',
    expectedStatus: 'equivalent',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$tmp') },
    ]),
    after: mkFn([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$out'), src: mkSlot('$rhs') },
    ]),
    observedSlots: [mkSlot('$out')],
    samples: [
      sample([[mkSlot('$src'), 10], [mkSlot('$rhs'), 3], [mkSlot('$tmp'), 0], [mkSlot('$out'), 0]]),
      sample([[mkSlot('$src'), -6], [mkSlot('$rhs'), 4], [mkSlot('$tmp'), 7], [mkSlot('$out'), -1]]),
    ],
  },
  {
    name: 'local-copy-return-rmw',
    family: 'return-path',
    expectedStatus: 'equivalent',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'return_value', slot: mkSlot('$tmp') },
    ]),
    after: mkFn([
      { kind: 'score_copy', dst: mkSlot('$ret'), src: mkSlot('$src') },
      { kind: 'score_add', dst: mkSlot('$ret'), src: mkSlot('$rhs') },
      { kind: 'return_value', slot: mkSlot('$ret') },
    ]),
    observedSlots: [mkSlot('$ret')],
    samples: [
      sample([[mkSlot('$src'), 12], [mkSlot('$rhs'), 5], [mkSlot('$tmp'), 0], [mkSlot('$ret'), 0]]),
      sample([[mkSlot('$src'), -2], [mkSlot('$rhs'), 7], [mkSlot('$tmp'), 9], [mkSlot('$ret'), -3]]),
    ],
  },
  {
    name: 'local-copy-return-rmw-mul',
    family: 'return-path',
    expectedStatus: 'equivalent',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
      { kind: 'score_mul', dst: mkSlot('$tmp'), src: mkSlot('$rhs') },
      { kind: 'return_value', slot: mkSlot('$tmp') },
    ]),
    after: mkFn([
      { kind: 'score_copy', dst: mkSlot('$ret'), src: mkSlot('$src') },
      { kind: 'score_mul', dst: mkSlot('$ret'), src: mkSlot('$rhs') },
      { kind: 'return_value', slot: mkSlot('$ret') },
    ]),
    observedSlots: [mkSlot('$ret')],
    samples: [
      sample([[mkSlot('$src'), 12], [mkSlot('$rhs'), 5], [mkSlot('$tmp'), 0], [mkSlot('$ret'), 0]]),
      sample([[mkSlot('$src'), -4], [mkSlot('$rhs'), -2], [mkSlot('$tmp'), 9], [mkSlot('$ret'), -3]]),
    ],
  },
  {
    name: 'division-by-zero-is-unsupported',
    family: 'unsupported-boundary',
    expectedStatus: 'unsupported',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_div', dst: mkSlot('$out'), src: mkSlot('$zero') },
    ]),
    after: mkFn([{ kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') }]),
    observedSlots: [mkSlot('$out')],
    samples: [sample([[mkSlot('$src'), 8], [mkSlot('$zero'), 0], [mkSlot('$out'), 0]])],
  },
  {
    name: 'modulo-by-zero-is-unsupported',
    family: 'unsupported-boundary',
    expectedStatus: 'unsupported',
    before: mkFn([
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
      { kind: 'score_mod', dst: mkSlot('$out'), src: mkSlot('$zero') },
    ]),
    after: mkFn([{ kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') }]),
    observedSlots: [mkSlot('$out')],
    samples: [sample([[mkSlot('$src'), 8], [mkSlot('$zero'), 0], [mkSlot('$out'), 0]])],
  },
  {
    name: 'opaque-before-window',
    family: 'unsupported-boundary',
    expectedStatus: 'unsupported',
    before: mkFn([
      { kind: 'raw', cmd: 'say opaque' },
      { kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') },
    ]),
    after: mkFn([{ kind: 'score_copy', dst: mkSlot('$out'), src: mkSlot('$src') }]),
    observedSlots: [mkSlot('$out')],
    samples: [sample([[mkSlot('$src'), 5], [mkSlot('$out'), 0]])],
  },
]

export const offlineRewriteEquivalenceFamilies = [
  'local-copy-forwarding',
  'observed-temp-counterexample',
  'observed-temp-safety',
  'predecessor-arithmetic',
  'read-write-window',
  'return-path',
  'unsupported-boundary',
  'score-swap-window',
  'score-set-overwrite-window',
  'unsupported-typed-boundary',
] as const

const familyOrder = new Map<string, number>(
  offlineRewriteEquivalenceFamilies.map((family, index) => [family, index]),
)

function assertNeverStatus(status: never): never {
  throw new Error(`unknown bounded equivalence status: ${status}`)
}

function incrementStatusCounts(
  summary: Pick<OfflineRewriteSummary, 'equivalent' | 'counterexample' | 'unsupported'>,
  status: BoundedLirEquivalenceStatus,
): void {
  switch (status) {
    case 'equivalent':
      summary.equivalent += 1
      return
    case 'counterexample':
      summary.counterexample += 1
      return
    case 'unsupported':
      summary.unsupported += 1
      return
    default:
      assertNeverStatus(status)
  }
}

export function runOfflineRewriteEquivalenceFixtures(
  fixtures: OfflineRewriteEquivalenceFixture[] = offlineRewriteEquivalenceFixtures,
): OfflineRewriteEquivalenceRun {
  const summaryByFamily = new Map<
    string,
    {
      family: string
      total: number
      equivalent: number
      counterexample: number
      unsupported: number
      failed: number
    }
  >()
  const totals = {
    total: 0,
    equivalent: 0,
    counterexample: 0,
    unsupported: 0,
    failed: 0,
  }
  const fixtureResults = fixtures.map((fixture) => {
    const result = checkBoundedLirEquivalence({
      name: fixture.name,
      before: fixture.before,
      after: fixture.after,
      observedSlots: fixture.observedSlots,
      samples: fixture.samples,
    })
    const actualStatus = result.status
    const fixtureResult: OfflineRewriteFixtureRun = {
      name: fixture.name,
      family: fixture.family,
      expectedStatus: fixture.expectedStatus,
      actualStatus,
      passed: fixture.expectedStatus === actualStatus,
      result,
    }

    totals.total += 1
    incrementStatusCounts(totals, actualStatus)
    if (!fixtureResult.passed) totals.failed += 1

    const summary = summaryByFamily.get(fixture.family) ?? {
      family: fixture.family,
      total: 0,
      equivalent: 0,
      counterexample: 0,
      unsupported: 0,
      failed: 0,
    }
    summary.total += 1
    incrementStatusCounts(summary, actualStatus)
    if (!fixtureResult.passed) summary.failed += 1

    summaryByFamily.set(fixture.family, summary)

    return fixtureResult
  })

  const orderedSummary = Array.from(summaryByFamily.values()).sort((left, right) => {
    const leftIndex = familyOrder.get(left.family)
    const rightIndex = familyOrder.get(right.family)
    if (leftIndex !== undefined && rightIndex !== undefined) {
      if (leftIndex !== rightIndex) return leftIndex - rightIndex
    } else if (leftIndex !== undefined) {
      return -1
    } else if (rightIndex !== undefined) {
      return 1
    }

    return left.family.localeCompare(right.family)
  })

  return {
    fixtureResults,
    summaryByFamily: orderedSummary,
    totals,
  }
}
