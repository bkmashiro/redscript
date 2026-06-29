import type { LIRInstr, Slot } from '../../lir/types'

type Subcommand = { kind: string } & Record<string, unknown>

function extractSlotsFromText(text: string): Slot[] {
  const slots: Slot[] = []
  // Conservative slot-hint extraction only.
  // This is not a correctness proof; it is only a safety/debug hint and should
  // never justify non-opaque transforms on its own.
  const re = /(\$[\w.:]+)\s+(\S+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(text)) !== null) {
    slots.push({ player: match[1], obj: match[2] })
  }
  return slots
}

export type SlotEffect = {
  sourceOperands: Slot[]
  semanticReads: Slot[]
  writes: Slot[]
  opaqueReads: boolean
  opaqueWrites: boolean
  barrier: boolean
}

function sameSlot(a: Slot, b: Slot): boolean {
  return a.player === b.player && a.obj === b.obj
}

function mergeSlots(...groups: Slot[][]): Slot[] {
  const out: Slot[] = []
  for (const slots of groups) {
    for (const slot of slots) {
      if (!out.some(existing => sameSlot(existing, slot))) out.push(slot)
    }
  }
  return out
}

function getSubcommandReadSlots(subcmd: Subcommand): Slot[] {
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

function getNestedConservativeReadSlots(instr: LIRInstr): Slot[] {
  if (instr.kind === 'raw') return extractSlotsFromText(instr.cmd)
  if (instr.kind === 'macro_line') return extractSlotsFromText(instr.template)
  return []
}

function getCallContextReadsAndWrites(subcmds: Subcommand[]): Slot[] {
  const reads: Slot[] = []
  for (const subcmd of subcmds) {
    for (const slot of getSubcommandReadSlots(subcmd)) {
      reads.push(slot)
    }
  }
  return reads
}

function getSlotEffectForStoreCmdToScore(instr: Extract<LIRInstr, { kind: 'store_cmd_to_score' }>): SlotEffect {
  const nested = getSlotEffect(instr.cmd)
  const nestedConservativeReads = getNestedConservativeReadSlots(instr.cmd)
  return {
    sourceOperands: [...nested.sourceOperands],
    semanticReads: mergeSlots(nested.semanticReads, nestedConservativeReads),
    writes: mergeSlots([instr.dst], nested.writes),
    opaqueReads: nested.opaqueReads,
    opaqueWrites: nested.opaqueWrites,
    barrier: true,
  }
}

export function getSlotEffect(instr: LIRInstr): SlotEffect {
  switch (instr.kind) {
    case 'score_set':
      return {
        sourceOperands: [],
        semanticReads: [],
        writes: [instr.dst],
        opaqueReads: false,
        opaqueWrites: false,
        barrier: false,
      }
    case 'score_delta':
      return {
        sourceOperands: [],
        semanticReads: [instr.dst],
        writes: [instr.dst],
        opaqueReads: false,
        opaqueWrites: false,
        barrier: false,
      }
    case 'score_copy':
      return {
        sourceOperands: [instr.src],
        semanticReads: [instr.src],
        writes: [instr.dst],
        opaqueReads: false,
        opaqueWrites: false,
        barrier: false,
      }
    case 'score_add':
    case 'score_sub':
    case 'score_mul':
    case 'score_div':
    case 'score_mod':
    case 'score_min':
    case 'score_max':
      return {
        sourceOperands: [instr.src],
        semanticReads: [instr.dst, instr.src],
        writes: [instr.dst],
        opaqueReads: false,
        opaqueWrites: false,
        barrier: false,
      }
    case 'score_swap':
      return {
        sourceOperands: [instr.a, instr.b],
        semanticReads: [instr.a, instr.b],
        writes: [instr.a, instr.b],
        opaqueReads: false,
        opaqueWrites: false,
        barrier: false,
      }
    case 'store_cmd_to_score':
      return getSlotEffectForStoreCmdToScore(instr)
    case 'store_score_to_nbt':
      return {
        sourceOperands: [instr.src],
        semanticReads: [instr.src],
        writes: [],
        opaqueReads: false,
        opaqueWrites: true,
        barrier: true,
      }
    case 'store_nbt_to_score':
      return {
        sourceOperands: [],
        semanticReads: [],
        writes: [instr.dst],
        opaqueReads: true,
        opaqueWrites: false,
        barrier: true,
      }
    case 'nbt_set_literal':
      return {
        sourceOperands: [],
        semanticReads: [],
        writes: [],
        opaqueReads: false,
        opaqueWrites: true,
        barrier: true,
      }
    case 'nbt_copy':
      return {
        sourceOperands: [],
        semanticReads: [],
        writes: [],
        opaqueReads: true,
        opaqueWrites: true,
        barrier: true,
      }
    case 'call':
      return {
        sourceOperands: [],
        semanticReads: [],
        writes: [],
        opaqueReads: true,
        opaqueWrites: true,
        barrier: true,
      }
    case 'call_macro':
      return {
        sourceOperands: [],
        semanticReads: [],
        writes: [],
        opaqueReads: true,
        opaqueWrites: true,
        barrier: true,
      }
    case 'call_context':
      return {
        sourceOperands: getCallContextReadsAndWrites(instr.subcommands),
        semanticReads: getCallContextReadsAndWrites(instr.subcommands),
        writes: [],
        opaqueReads: true,
        opaqueWrites: true,
        barrier: true,
      }
    case 'call_if_matches':
      return {
        sourceOperands: [instr.slot],
        semanticReads: [instr.slot],
        writes: [],
        opaqueReads: false,
        opaqueWrites: false,
        barrier: true,
      }
    case 'call_unless_matches':
      return {
        sourceOperands: [instr.slot],
        semanticReads: [instr.slot],
        writes: [],
        opaqueReads: false,
        opaqueWrites: false,
        barrier: true,
      }
    case 'call_if_score':
      return {
        sourceOperands: [instr.a, instr.b],
        semanticReads: [instr.a, instr.b],
        writes: [],
        opaqueReads: false,
        opaqueWrites: false,
        barrier: true,
      }
    case 'call_unless_score':
      return {
        sourceOperands: [instr.a, instr.b],
        semanticReads: [instr.a, instr.b],
        writes: [],
        opaqueReads: false,
        opaqueWrites: false,
        barrier: true,
      }
    case 'return_value':
      return {
        sourceOperands: [instr.slot],
        semanticReads: [instr.slot],
        writes: [],
        opaqueReads: false,
        opaqueWrites: false,
        barrier: false,
      }
    case 'macro_line':
      return {
        sourceOperands: [],
        semanticReads: [],
        writes: [],
        opaqueReads: true,
        opaqueWrites: true,
        barrier: true,
      }
    case 'raw':
      return {
        sourceOperands: [],
        semanticReads: [],
        writes: [],
        opaqueReads: true,
        opaqueWrites: true,
        barrier: true,
      }
    default:
      return {
        sourceOperands: [],
        semanticReads: [],
        writes: [],
        opaqueReads: false,
        opaqueWrites: false,
        barrier: false,
      }
  }
}

export function getSourceOperandSlots(instr: LIRInstr): Slot[] {
  return getSlotEffect(instr).sourceOperands
}

export function getSemanticReadSlots(instr: LIRInstr): Slot[] {
  return getSlotEffect(instr).semanticReads
}

export function getWriteSlots(instr: LIRInstr): Slot[] {
  return getSlotEffect(instr).writes
}

export function isOpaqueBarrierInstruction(instr: LIRInstr): boolean {
  return getSlotEffect(instr).barrier
}
