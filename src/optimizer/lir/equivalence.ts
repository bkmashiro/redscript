import type { LIRFunction, LIRInstr, Slot } from '../../lir/types'
import { slotKey } from './analysis'

export type BoundedLirEquivalenceSample = Record<string, number>

export interface BoundedLirEquivalenceInput {
  name: string
  before: LIRFunction
  after: LIRFunction
  observedSlots: Slot[]
  samples: BoundedLirEquivalenceSample[]
}

export interface BoundedLirEquivalenceCounterexample {
  sampleIndex: number
  slot: string
  beforeValue: number
  afterValue: number
  sample: BoundedLirEquivalenceSample
}

export type BoundedLirEquivalenceStatus = 'equivalent' | 'counterexample' | 'unsupported'

export interface BoundedLirEquivalenceResult {
  name: string
  status: BoundedLirEquivalenceStatus
  samplesChecked: number
  observedSlots: string[]
  counterexample?: BoundedLirEquivalenceCounterexample
  unsupportedReason?: string
}

type ScoreState = Map<string, number>

function readSlot(state: ScoreState, slot: Slot): number {
  return state.get(slotKey(slot)) ?? 0
}

function writeSlot(state: ScoreState, slot: Slot, value: number): void {
  state.set(slotKey(slot), normalizeScoreboardInt(value))
}

function normalizeScoreboardInt(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.trunc(value)
}

function divTowardZero(left: number, right: number): number {
  if (right === 0) throw new Error('unsupported scoreboard division by zero in bounded equivalence sample')
  return Math.trunc(left / right)
}

function modTowardZero(left: number, right: number): number {
  if (right === 0) throw new Error('unsupported scoreboard modulo by zero in bounded equivalence sample')
  return left - divTowardZero(left, right) * right
}

function cloneSample(sample: BoundedLirEquivalenceSample): ScoreState {
  return new Map(Object.entries(sample).map(([key, value]) => [key, normalizeScoreboardInt(value)]))
}

function unsupported(kind: string): Error {
  return new Error(`unsupported LIR instruction in bounded equivalence harness: ${kind}`)
}

function executeInstruction(state: ScoreState, instr: LIRInstr): void {
  switch (instr.kind) {
    case 'score_set':
      writeSlot(state, instr.dst, instr.value)
      return
    case 'score_copy':
      writeSlot(state, instr.dst, readSlot(state, instr.src))
      return
    case 'score_add':
      writeSlot(state, instr.dst, readSlot(state, instr.dst) + readSlot(state, instr.src))
      return
    case 'score_sub':
      writeSlot(state, instr.dst, readSlot(state, instr.dst) - readSlot(state, instr.src))
      return
    case 'score_mul':
      writeSlot(state, instr.dst, readSlot(state, instr.dst) * readSlot(state, instr.src))
      return
    case 'score_div':
      writeSlot(state, instr.dst, divTowardZero(readSlot(state, instr.dst), readSlot(state, instr.src)))
      return
    case 'score_mod':
      writeSlot(state, instr.dst, modTowardZero(readSlot(state, instr.dst), readSlot(state, instr.src)))
      return
    case 'score_min':
      writeSlot(state, instr.dst, Math.min(readSlot(state, instr.dst), readSlot(state, instr.src)))
      return
    case 'score_max':
      writeSlot(state, instr.dst, Math.max(readSlot(state, instr.dst), readSlot(state, instr.src)))
      return
    case 'score_swap': {
      const a = readSlot(state, instr.a)
      const b = readSlot(state, instr.b)
      writeSlot(state, instr.a, b)
      writeSlot(state, instr.b, a)
      return
    }
    case 'return_value':
      writeSlot(state, { player: '$ret', obj: instr.slot.obj }, readSlot(state, instr.slot))
      return
    default:
      throw unsupported(instr.kind)
  }
}

function executeFunction(fn: LIRFunction, sample: BoundedLirEquivalenceSample): ScoreState {
  const state = cloneSample(sample)
  for (const instr of fn.instructions) {
    executeInstruction(state, instr)
  }
  return state
}

export function checkBoundedLirEquivalence(input: BoundedLirEquivalenceInput): BoundedLirEquivalenceResult {
  const observedSlots = input.observedSlots.map(slotKey).sort()

  for (let sampleIndex = 0; sampleIndex < input.samples.length; sampleIndex += 1) {
    const sample = input.samples[sampleIndex] ?? {}
    let beforeState: ScoreState
    let afterState: ScoreState

    try {
      beforeState = executeFunction(input.before, sample)
      afterState = executeFunction(input.after, sample)
    } catch (error) {
      return {
        name: input.name,
        status: 'unsupported',
        samplesChecked: sampleIndex,
        observedSlots,
        unsupportedReason: error instanceof Error ? error.message : String(error),
      }
    }

    for (const slot of observedSlots) {
      const beforeValue = beforeState.get(slot) ?? 0
      const afterValue = afterState.get(slot) ?? 0
      if (beforeValue !== afterValue) {
        return {
          name: input.name,
          status: 'counterexample',
          samplesChecked: sampleIndex + 1,
          observedSlots,
          counterexample: {
            sampleIndex,
            slot,
            beforeValue,
            afterValue,
            sample,
          },
        }
      }
    }
  }

  return {
    name: input.name,
    status: 'equivalent',
    samplesChecked: input.samples.length,
    observedSlots,
  }
}
