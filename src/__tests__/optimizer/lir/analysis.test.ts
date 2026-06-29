import fc from 'fast-check'
import {
  analyzeStraightLineSlotLiveness,
  createModuleSlotReferenceIndex,
  isAbiSlot,
  getReadSlots,
  getSemanticReadSlots,
  getSourceOperandSlots,
  isPotentiallyMentionedByOpaqueBarrier,
  instructionMentionsSlot,
  isConservativeBarrierInstruction,
  isProtectedSlot,
  sameSlot,
  slotKey,
} from '../../../optimizer/lir/analysis'
import { getSlotEffect } from '../../../optimizer/lir/effects'
import type { LIRFunction, LIRInstr, LIRModule, Slot } from '../../../lir/types'

const obj = '__test'

function mkSlot(player: string, objective = obj): Slot {
  return { player, obj: objective }
}

function mkFn(instructions: LIRInstr[], name = 'main'): LIRFunction {
  return { name, instructions, isMacro: false, macroParams: [] }
}

function mkModule(functions: LIRFunction[]): LIRModule {
  return { functions, namespace: 'test', objective: obj }
}

describe('LIR optimizer analysis helpers', () => {
  test('uses canonical slot identity across player and objective', () => {
    expect(slotKey(mkSlot('$tmp'))).toBe('$tmp\0__test')
    expect(sameSlot(mkSlot('$tmp'), mkSlot('$tmp'))).toBe(true)
    expect(sameSlot(mkSlot('$tmp', '__left'), mkSlot('$tmp', '__right'))).toBe(false)
  })

  test('slot identity is stable for generated fake players/objectives', () => {
    fc.assert(fc.property(
      fc.stringMatching(/^\$[A-Za-z0-9_.:-]{1,16}$/),
      fc.stringMatching(/^__[A-Za-z0-9_.:-]{1,16}$/),
      fc.stringMatching(/^__[A-Za-z0-9_.:-]{1,16}$/),
      (player, leftObj, rightObj) => {
        const left = { player, obj: leftObj }
        const same = { player, obj: leftObj }
        const maybeDifferent = { player, obj: rightObj }

        expect(slotKey(left)).toBe(`${player}\0${leftObj}`)
        expect(sameSlot(left, same)).toBe(true)
        expect(sameSlot(left, maybeDifferent)).toBe(leftObj === rightObj)
      },
    ))
  })

  test('collects read slots from nested score and storage instructions', () => {
    const nested: LIRInstr = {
      kind: 'store_cmd_to_score',
      dst: mkSlot('$dst'),
      cmd: { kind: 'score_add', dst: mkSlot('$acc'), src: mkSlot('$rhs') },
    }
    const store: LIRInstr = { kind: 'store_score_to_nbt', ns: 'rs', path: 'tmp.x', type: 'int', scale: 1, src: mkSlot('$src') }

    expect(getReadSlots(nested)).toEqual([mkSlot('$acc'), mkSlot('$rhs')])
    expect(getReadSlots(store)).toEqual([mkSlot('$src')])
  })

  test('distinguishes source operands from semantic reads for score arithmetic', () => {
    const instr: LIRInstr = { kind: 'score_add', dst: mkSlot('$dst'), src: mkSlot('$src') }
    expect(getSourceOperandSlots(instr)).toEqual([mkSlot('$src')])
    expect(getSemanticReadSlots(instr)).toEqual([mkSlot('$dst'), mkSlot('$src')])
  })

  test('distinguishes source operands from semantic reads for score_delta', () => {
    const instr: LIRInstr = { kind: 'score_delta', dst: mkSlot('$dst'), value: 7 }
    expect(getSourceOperandSlots(instr)).toEqual([])
    expect(getSemanticReadSlots(instr)).toEqual([mkSlot('$dst')])
  })

  test('detects raw, macro, and execute-context slot references conservatively', () => {
    const shared = mkSlot('$shared_tmp')
    const raw: LIRInstr = { kind: 'raw', cmd: 'execute if score $shared_tmp __test matches 1.. run say hit' }
    const macro: LIRInstr = { kind: 'macro_line', template: '$execute if score $shared_tmp __test matches $(range) run say hit' }
    const ctx: LIRInstr = {
      kind: 'call_context',
      fn: 'test:body',
      subcommands: [{ kind: 'if_matches', score: '$shared_tmp __test', range: '1..' }],
    }
    const call: LIRInstr = { kind: 'call', fn: 'test:leaf' }
    const callMacro: LIRInstr = { kind: 'call_macro', fn: 'test:macro', storage: 'rs:macro_args' }

    expect(instructionMentionsSlot(raw, shared)).toBe(true)
    expect(instructionMentionsSlot(macro, shared)).toBe(true)
    expect(instructionMentionsSlot(ctx, shared)).toBe(true)
    expect(instructionMentionsSlot(call, shared)).toBe(false)
    expect(instructionMentionsSlot(callMacro, shared)).toBe(false)
    expect(isConservativeBarrierInstruction(call)).toBe(true)
    expect(isConservativeBarrierInstruction(callMacro)).toBe(true)
  })

  test('keeps ABI slots protected while not protecting const slots', () => {
    expect(isProtectedSlot(mkSlot('$ret'))).toBe(true)
    expect(isProtectedSlot(mkSlot('$ret_x'))).toBe(true)
    expect(isProtectedSlot(mkSlot('$p0'))).toBe(true)
    expect(isProtectedSlot(mkSlot('$__const_1'))).toBe(false)
    expect(isProtectedSlot(mkSlot('$tmp'))).toBe(false)
  })

  test('treats opaque barriers as potentially mentioning any slot', () => {
    const shared = mkSlot('$shared_tmp')
    const raw: LIRInstr = { kind: 'raw', cmd: 'say hi' }
    const macro: LIRInstr = { kind: 'macro_line', template: 'say $(arg)' }
    const call: LIRInstr = { kind: 'call', fn: 'test:leaf' }
    const callMacro: LIRInstr = { kind: 'call_macro', fn: 'test:macro', storage: 'rs:macro_args' }
    const callContext: LIRInstr = {
      kind: 'call_context',
      fn: 'test:body',
      subcommands: [{ kind: 'if_matches', score: '$other __test', range: '1..' }],
    }

    expect(isPotentiallyMentionedByOpaqueBarrier(raw, shared)).toBe(true)
    expect(isPotentiallyMentionedByOpaqueBarrier(macro, shared)).toBe(true)
    expect(isPotentiallyMentionedByOpaqueBarrier(call, shared)).toBe(true)
    expect(isPotentiallyMentionedByOpaqueBarrier(callMacro, shared)).toBe(true)
    expect(isPotentiallyMentionedByOpaqueBarrier(callContext, shared)).toBe(true)
    expect(isPotentiallyMentionedByOpaqueBarrier(
      { kind: 'score_set', dst: mkSlot('$x'), value: 1 },
      shared,
    )).toBe(false)
  })

  test('exposes opaque barrier metadata for raw and macro_line', () => {
    const raw: LIRInstr = { kind: 'raw', cmd: 'say something about $shared_tmp __test' }
    const macro: LIRInstr = { kind: 'macro_line', template: '$execute if score $shared_tmp __test matches $(range) run say hit' }

    const rawEffect = getSlotEffect(raw)
    const macroEffect = getSlotEffect(macro)

    expect(rawEffect.opaqueReads).toBe(true)
    expect(rawEffect.opaqueWrites).toBe(true)
    expect(rawEffect.barrier).toBe(true)
    expect(macroEffect.opaqueReads).toBe(true)
    expect(macroEffect.opaqueWrites).toBe(true)
    expect(macroEffect.barrier).toBe(true)
  })

  test('keeps conservative liveness across explicit call and call_macro barriers', () => {
    const shared = mkSlot('$shared_tmp')
    const output = mkSlot('$output')
    const call = mkFn([
      { kind: 'score_copy', dst: output, src: { player: '$shared_tmp', obj: obj } },
      { kind: 'call', fn: 'test:leaf' },
      { kind: 'score_copy', dst: output, src: output },
    ])
    const callMacro = mkFn([
      { kind: 'score_copy', dst: output, src: { player: '$shared_tmp', obj: obj } },
      { kind: 'call_macro', fn: 'test:macro', storage: 'rs:macro_args' },
      { kind: 'score_copy', dst: output, src: output },
    ], 'macroCarrier')

    const callLiveness = analyzeStraightLineSlotLiveness(call.instructions)
    const callMacroLiveness = analyzeStraightLineSlotLiveness(callMacro.instructions)

    expect(isConservativeBarrierInstruction(call.instructions[1])).toBe(true)
    expect(isConservativeBarrierInstruction(callMacro.instructions[1])).toBe(true)
    expect(callLiveness.nextReadAfter(0, output)).toBeNull()
    expect(callLiveness.hasLaterRead(0, output)).toBe(true)
    expect(callLiveness.isDeadAfter(0, output)).toBe(true)
    expect(callMacroLiveness.nextReadAfter(0, output)).toBeNull()
    expect(callMacroLiveness.hasLaterRead(0, output)).toBe(true)
    expect(callMacroLiveness.isDeadAfter(0, output)).toBe(true)
  })

  test('keeps conservative liveness across raw and execute-context barriers', () => {
    const shared = mkSlot('$shared_tmp')
    const output = mkSlot('$output')
    const ctx: LIRInstr = {
      kind: 'call_context',
      fn: 'test:body',
      subcommands: [{ kind: 'if_matches', score: '$shared_tmp __test', range: '1..' }],
    }

    const fn: LIRFunction = mkFn([
      { kind: 'score_copy', dst: output, src: shared },
      { kind: 'raw', cmd: 'say context: $shared_tmp __test' },
      ctx,
      { kind: 'score_copy', dst: output, src: output },
    ], 'rawCarrier')

    const liveness = analyzeStraightLineSlotLiveness(fn.instructions)

    expect(isConservativeBarrierInstruction(fn.instructions[1])).toBe(true)
    expect(isConservativeBarrierInstruction(fn.instructions[2])).toBe(true)
    expect(instructionMentionsSlot(ctx, shared)).toBe(true)
    expect(liveness.nextReadAfter(0, output)).toBeNull()
    expect(liveness.hasLaterRead(0, output)).toBe(true)
    expect(liveness.isDeadAfter(0, output)).toBe(true)
  })

  test('builds module-level slot mention index for cross-function safety checks', () => {
    const producer = mkFn([
      { kind: 'score_copy', dst: mkSlot('$tmp'), src: mkSlot('$src') },
    ], 'producer')
    const consumer = mkFn([
      { kind: 'raw', cmd: 'scoreboard players operation $out __test = $tmp __test' },
    ], 'consumer')

    const index = createModuleSlotReferenceIndex(mkModule([producer, consumer]))

    expect(index.isMentionedOutside(producer, mkSlot('$tmp'))).toBe(true)
    expect(index.isMentionedOutside(consumer, mkSlot('$src'))).toBe(true)
    expect(index.isMentionedOutside(producer, mkSlot('$missing'))).toBe(false)
  })
  test('distinguishes ABI/runtime slots from compiler-owned names', () => {
    expect(isAbiSlot(mkSlot('$ret'))).toBe(true)
    expect(isAbiSlot(mkSlot('$p1'))).toBe(true)
    expect(isAbiSlot(mkSlot('$x'))).toBe(false)
  })

  test('captures straight-line next-read/write and dead-after information', () => {
    const src = mkSlot('$src')
    const tmp = mkSlot('$tmp')
    const out = mkSlot('$out')

    const fn: LIRFunction = mkFn([
      { kind: 'score_copy', dst: tmp, src },
      { kind: 'score_add', dst: out, src: tmp },
      { kind: 'score_copy', dst: out, src: tmp },
    ])

    const liveness = analyzeStraightLineSlotLiveness(fn.instructions)

    expect(liveness.nextReadAfter(0, tmp)).toBe(1)
    expect(liveness.nextWriteAfter(1, tmp)).toBeNull()
    expect(liveness.hasLaterRead(0, tmp)).toBe(true)
    expect(liveness.hasLaterRead(0, out)).toBe(true)
    expect(liveness.isDeadAfter(0, out)).toBe(false)
    expect(liveness.isDeadAfter(1, out)).toBe(false)
    expect(liveness.isDeadAfter(2, out)).toBe(true)
  })

  test('treats conservative barriers as blocking cross-window liveness checks', () => {
    const src = mkSlot('$src')
    const tmp = mkSlot('$tmp')
    const later = mkSlot('$later')

    const fn: LIRFunction = mkFn([
      { kind: 'score_copy', dst: tmp, src },
      { kind: 'score_add', dst: later, src: tmp },
      { kind: 'raw', cmd: 'execute if score $tmp __test matches 1.. run say barrier' },
      { kind: 'score_copy', dst: later, src: tmp },
    ])

    const liveness = analyzeStraightLineSlotLiveness(fn.instructions)

    expect(isConservativeBarrierInstruction(fn.instructions[2])).toBe(true)
    expect(liveness.nextReadAfter(0, tmp)).toBe(1)
    expect(liveness.hasLaterRead(1, tmp)).toBe(true)
    expect(liveness.hasLaterRead(0, tmp)).toBe(true)
    expect(liveness.isDeadAfter(1, tmp)).toBe(false)
  })

  test('does not carry liveness reads from beyond an opaque barrier', () => {
    const src = mkSlot('$src')
    const tmp = mkSlot('$tmp')
    const later = mkSlot('$later')

    const fn: LIRFunction = mkFn([
      { kind: 'score_copy', dst: tmp, src },
      { kind: 'score_add', dst: later, src: tmp },
      { kind: 'raw', cmd: 'say barrier' },
      { kind: 'score_copy', dst: later, src: tmp },
    ])

    const liveness = analyzeStraightLineSlotLiveness(fn.instructions)

    expect(liveness.nextReadAfter(0, tmp)).toBe(1)
    expect(liveness.hasLaterRead(1, tmp)).toBe(true)
    expect(liveness.isDeadAfter(1, tmp)).toBe(true)
  })

})
