import type { LIRFunction, LIRInstr, LIRModule, Slot } from '../../lir/types'

/** Canonical key for a scoreboard slot (fake player + objective). */
export function slotKey(slot: Slot): string {
  return `${slot.player}\0${slot.obj}`
}

export function sameSlot(a: Slot, b: Slot): boolean {
  return a.player === b.player && a.obj === b.obj
}

/** Slots that should be treated as ABI-visible or compiler-owned. */
export function isProtectedSlot(slot: Slot): boolean {
  const player = slot.player
  return (
    player === '$ret' ||
    player.startsWith('$ret_') ||
    /^\$p\d+$/.test(player) ||
    player.startsWith('$__const_') ||
    player.includes('__rf_') ||
    player.includes('__opt_')
  )
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function textMentionsSlot(text: string, slot: Slot): boolean {
  const escapedPlayer = escapeRegExp(slot.player)
  const escapedObj = escapeRegExp(slot.obj)
  return new RegExp(`(^|\\s)${escapedPlayer}\\s+${escapedObj}(\\s|$)`).test(text)
}

/**
 * Extract explicit scoreboard-looking slots from raw text.
 * This is intentionally conservative and only recognizes fake-player style
 * references that are useful for optimizer safety barriers.
 */
export function extractSlotsFromText(text: string): Slot[] {
  const slots: Slot[] = []
  const re = /(\$[\w.:]+)\s+(\S+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    slots.push({ player: match[1], obj: match[2] })
  }
  return slots
}

function getSubcommandReadSlots(subcmd: { kind: string } & Record<string, unknown>): Slot[] {
  switch (subcmd.kind) {
    case 'if_score':
    case 'unless_score':
      return [
        ...extractSlotsFromText(String(subcmd.a ?? '')),
        ...extractSlotsFromText(String(subcmd.b ?? '')),
      ]
    case 'if_matches':
    case 'unless_matches':
      return extractSlotsFromText(String(subcmd.score ?? ''))
    default:
      return []
  }
}

function isBarrierInstruction(instr: LIRInstr): boolean {
  switch (instr.kind) {
    case 'raw':
    case 'macro_line':
    case 'call':
    case 'call_macro':
    case 'call_context':
    case 'call_if_matches':
    case 'call_unless_matches':
    case 'call_if_score':
    case 'call_unless_score':
    case 'store_score_to_nbt':
    case 'store_nbt_to_score':
      return true
    default:
      return false
  }
}

export function isConservativeBarrierInstruction(instr: LIRInstr): boolean {
  return isBarrierInstruction(instr)
}

function subcommandMentionsSlot(subcmd: { kind: string } & Record<string, unknown>, slot: Slot): boolean {
  return getSubcommandReadSlots(subcmd).some(candidate => sameSlot(candidate, slot))
}

/** Collect slots read by an instruction. Destructive scoreboard ops read only src here. */
export function getReadSlots(instr: LIRInstr): Slot[] {
  switch (instr.kind) {
    case 'score_copy':
      return [instr.src]
    case 'score_add':
    case 'score_sub':
    case 'score_mul':
    case 'score_div':
    case 'score_mod':
    case 'score_min':
    case 'score_max':
      return [instr.src]
    case 'score_swap':
      return [instr.a, instr.b]
    case 'store_cmd_to_score':
      return getReadSlots(instr.cmd)
    case 'store_score_to_nbt':
      return [instr.src]
    case 'store_nbt_to_score':
      return []
    case 'return_value':
      return [instr.slot]
    case 'call_if_matches':
    case 'call_unless_matches':
      return [instr.slot]
    case 'call_if_score':
    case 'call_unless_score':
      return [instr.a, instr.b]
    case 'raw':
      return extractSlotsFromText(instr.cmd)
    case 'macro_line':
      return extractSlotsFromText(instr.template)
    case 'call_context':
      return instr.subcommands.flatMap(subcmd => getSubcommandReadSlots(subcmd as { kind: string } & Record<string, unknown>))
    default:
      return []
  }
}

/** Collect slots written by an instruction. */
export function getWriteSlots(instr: LIRInstr): Slot[] {
  switch (instr.kind) {
    case 'score_set':
    case 'score_copy':
    case 'score_add':
    case 'score_sub':
    case 'score_mul':
    case 'score_div':
    case 'score_mod':
    case 'score_min':
    case 'score_max':
    case 'store_cmd_to_score':
    case 'store_nbt_to_score':
      return [instr.dst]
    case 'score_swap':
      return [instr.a, instr.b]
    default:
      return []
  }
}

/** Destination slot for pure write instructions that can be deleted if dead. */
export function getPureWriteDst(instr: LIRInstr): Slot | null {
  switch (instr.kind) {
    case 'score_set':
    case 'score_copy':
      return instr.dst
    default:
      return null
  }
}

/** True when an instruction explicitly mentions a slot in a typed field or conservative raw text scan. */
export function instructionMentionsSlot(instr: LIRInstr, slot: Slot): boolean {
  switch (instr.kind) {
    case 'score_set':
    case 'store_cmd_to_score':
    case 'store_nbt_to_score':
      return getWriteSlots(instr).some(candidate => sameSlot(candidate, slot)) ||
        (instr.kind === 'store_cmd_to_score' ? instructionMentionsSlot(instr.cmd, slot) : false)
    case 'score_copy':
    case 'score_add':
    case 'score_sub':
    case 'score_mul':
    case 'score_div':
    case 'score_mod':
    case 'score_min':
    case 'score_max':
    case 'score_swap':
    case 'store_score_to_nbt':
    case 'return_value':
    case 'call_if_matches':
    case 'call_unless_matches':
    case 'call_if_score':
    case 'call_unless_score':
      return getReadSlots(instr).some(candidate => sameSlot(candidate, slot)) ||
        getWriteSlots(instr).some(candidate => sameSlot(candidate, slot))
    case 'raw':
      return textMentionsSlot(instr.cmd, slot)
    case 'macro_line':
      return textMentionsSlot(instr.template, slot)
    case 'call_context':
      return instr.subcommands.some(subcmd => subcommandMentionsSlot(subcmd as { kind: string } & Record<string, unknown>, slot))
    default:
      return false
  }
}

export interface ModuleSlotReferenceIndex {
  isMentionedOutside(fn: LIRFunction, slot: Slot): boolean
}

export function createModuleSlotReferenceIndex(mod: LIRModule): ModuleSlotReferenceIndex {
  const mentionsByFunction = new Map<LIRFunction, Set<string>>()

  for (const fn of mod.functions) {
    const mentioned = new Set<string>()
    for (const instr of fn.instructions) {
      for (const slot of [...getReadSlots(instr), ...getWriteSlots(instr)]) {
        mentioned.add(slotKey(slot))
      }
      if (instr.kind === 'raw') {
        for (const slot of extractSlotsFromText(instr.cmd)) mentioned.add(slotKey(slot))
      } else if (instr.kind === 'macro_line') {
        for (const slot of extractSlotsFromText(instr.template)) mentioned.add(slotKey(slot))
      } else if (instr.kind === 'call_context') {
        for (const subcmd of instr.subcommands) {
          for (const slot of getSubcommandReadSlots(subcmd as { kind: string } & Record<string, unknown>)) {
            mentioned.add(slotKey(slot))
          }
        }
      }
    }
    mentionsByFunction.set(fn, mentioned)
  }

  return {
    isMentionedOutside(fn: LIRFunction, slot: Slot): boolean {
      const key = slotKey(slot)
      for (const [otherFn, mentioned] of mentionsByFunction.entries()) {
        if (otherFn === fn) continue
        if (mentioned.has(key)) return true
      }
      return false
    },
  }
}

export interface LIRNextUseInfo {
  hasLaterRead(index: number, slot: Slot): boolean
  nextReadAfter(index: number, slot: Slot): number | null
  nextWriteAfter(index: number, slot: Slot): number | null
  isDeadAfter(index: number, slot: Slot): boolean
}

export function analyzeStraightLineSlotLiveness(instrs: LIRInstr[]): LIRNextUseInfo {
  const n = instrs.length
  const nextReadBySlot = new Map<string, number>()
  const nextWriteBySlot = new Map<string, number>()
  const nextReadAfter: Array<Map<string, number>> = new Array(n)
  const nextWriteAfter: Array<Map<string, number>> = new Array(n)
  const barrierAfter: boolean[] = new Array(n).fill(false)

  let hasBarrierAfter = false

  for (let index = n - 1; index >= 0; index--) {
    barrierAfter[index] = hasBarrierAfter
    nextReadAfter[index] = new Map(nextReadBySlot)
    nextWriteAfter[index] = new Map(nextWriteBySlot)

    if (isConservativeBarrierInstruction(instrs[index])) {
      hasBarrierAfter = true
      nextReadBySlot.clear()
      nextWriteBySlot.clear()
      continue
    }

    for (const slot of getReadSlots(instrs[index])) {
      nextReadBySlot.set(slotKey(slot), index)
    }
    for (const slot of getWriteSlots(instrs[index])) {
      nextWriteBySlot.set(slotKey(slot), index)
    }
  }

  function key(slot: Slot): string {
    return slotKey(slot)
  }

  return {
    hasLaterRead(index: number, slot: Slot): boolean {
      if (index < 0 || index >= n) return false
      if (barrierAfter[index]) return true
      return nextReadAfter[index].has(key(slot))
    },
    nextReadAfter(index: number, slot: Slot): number | null {
      if (index < 0 || index >= n) return null
      return nextReadAfter[index].get(key(slot)) ?? null
    },
    nextWriteAfter(index: number, slot: Slot): number | null {
      if (index < 0 || index >= n) return null
      return nextWriteAfter[index].get(key(slot)) ?? null
    },
    isDeadAfter(index: number, slot: Slot): boolean {
      if (index < 0 || index >= n) return false
      const hasBarrier = barrierAfter[index]
      const hasRead = nextReadAfter[index].has(key(slot))
      const hasWrite = nextWriteAfter[index].has(key(slot))
      return !hasBarrier && !hasRead && !hasWrite
    },
  }
}
