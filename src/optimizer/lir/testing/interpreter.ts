import { SCORE_INT_MAX, SCORE_INT_MIN, type LIRFunction, type LIRInstr, type Slot } from '../../../lir/types'

export type ScoreboardState = Map<string, number>

export interface ScoreboardSeed {
  slot: Slot
  value: number
}

export function slotKey(slot: Slot): string {
  return `${slot.player}\0${slot.obj}`
}

export function makeScoreboardState(entries: readonly ScoreboardSeed[] = []): ScoreboardState {
  const state: ScoreboardState = new Map()
  for (const entry of entries) {
    writeSlot(state, entry.slot, entry.value)
  }
  return state
}

export function readSlot(state: ScoreboardState, slot: Slot): number {
  const value = state.get(slotKey(slot))
  if (value === undefined) {
    throw new Error(`slot '${slot.player} ${slot.obj}' is uninitialized`)
  }
  return value
}

export function projectState(state: ScoreboardState, slots: readonly Slot[]): Record<string, number> {
  return Object.fromEntries(slots.map(slot => [slotKey(slot), readSlot(state, slot)]))
}

export function runLIRFunction(fn: LIRFunction, initialState: ScoreboardState = makeScoreboardState()): ScoreboardState {
  const state: ScoreboardState = new Map(initialState)
  for (const instr of fn.instructions) {
    runInstr(instr, state)
  }
  return state
}

function runInstr(instr: LIRInstr, state: ScoreboardState): void {
  switch (instr.kind) {
    case 'score_set':
      writeSlot(state, instr.dst, instr.value)
      return

    case 'score_delta':
      if (instr.value === 0) return
      writeSlot(state, instr.dst, toScoreInt(readSlot(state, instr.dst) + instr.value))
      return

    case 'score_copy':
      writeSlot(state, instr.dst, readSlot(state, instr.src))
      return

    case 'score_add':
      writeSlot(state, instr.dst, toScoreInt(readSlot(state, instr.dst) + readSlot(state, instr.src)))
      return

    case 'score_sub':
      writeSlot(state, instr.dst, toScoreInt(readSlot(state, instr.dst) - readSlot(state, instr.src)))
      return

    case 'score_mul':
      writeSlot(state, instr.dst, Math.imul(readSlot(state, instr.dst), readSlot(state, instr.src)))
      return

    case 'score_div': {
      const rhs = readSlot(state, instr.src)
      if (rhs === 0) throw new Error('score_div by zero is outside the supported interpreter subset')
      writeSlot(state, instr.dst, toScoreInt(Math.trunc(readSlot(state, instr.dst) / rhs)))
      return
    }

    case 'score_mod': {
      const rhs = readSlot(state, instr.src)
      if (rhs === 0) throw new Error('score_mod by zero is outside the supported interpreter subset')
      writeSlot(state, instr.dst, toScoreInt(readSlot(state, instr.dst) % rhs))
      return
    }

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

    case 'raw':
    case 'macro_line':
    case 'call':
    case 'call_macro':
    case 'call_context':
    case 'call_if_matches':
    case 'call_unless_matches':
    case 'call_if_score':
    case 'call_unless_score':
    case 'store_cmd_to_score':
    case 'store_score_to_nbt':
    case 'store_nbt_to_score':
    case 'nbt_set_literal':
    case 'nbt_copy':
      throw new Error(`instruction '${instr.kind}' is outside the supported interpreter subset`)
  }
}

function writeSlot(state: ScoreboardState, slot: Slot, value: number): void {
  state.set(slotKey(slot), assertScoreInt(value))
}

function assertScoreInt(value: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < SCORE_INT_MIN || value > SCORE_INT_MAX) {
    throw new Error(`score value ${value} is outside MC int32 range [${SCORE_INT_MIN}, ${SCORE_INT_MAX}]`)
  }
  return value
}

function toScoreInt(value: number): number {
  return value | 0
}
