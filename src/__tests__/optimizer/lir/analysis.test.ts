import fc from 'fast-check'
import {
  createModuleSlotReferenceIndex,
  getReadSlots,
  instructionMentionsSlot,
  sameSlot,
  slotKey,
} from '../../../optimizer/lir/analysis'
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

    expect(getReadSlots(nested)).toEqual([mkSlot('$rhs')])
    expect(getReadSlots(store)).toEqual([mkSlot('$src')])
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

    expect(instructionMentionsSlot(raw, shared)).toBe(true)
    expect(instructionMentionsSlot(macro, shared)).toBe(true)
    expect(instructionMentionsSlot(ctx, shared)).toBe(true)
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
})
