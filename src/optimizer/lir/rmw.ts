import type { LIRFunction, LIRInstr, Slot } from '../../lir/types'

const RMW_OPS = new Set<LIRInstr['kind']>([
  'score_add',
  'score_sub',
  'score_mul',
  'score_div',
  'score_mod',
  'score_min',
  'score_max',
])

function slotKey(slot: Slot): string {
  return `${slot.player}\0${slot.obj}`
}

function sameSlot(a: Slot, b: Slot): boolean {
  return a.player === b.player && a.obj === b.obj
}

function isProtectedSlot(slot: Slot): boolean {
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

function isRmwOp(instr: LIRInstr): instr is Extract<LIRInstr, { kind: 'score_add' | 'score_sub' | 'score_mul' | 'score_div' | 'score_mod' | 'score_min' | 'score_max' }> {
  return RMW_OPS.has(instr.kind)
}

function textMentionsSlot(text: string, slot: Slot): boolean {
  const escapedPlayer = slot.player.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedObj = slot.obj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|\\s)${escapedPlayer}\\s+${escapedObj}(\\s|$)`).test(text)
}

function instructionMentionsSlot(instr: LIRInstr, slot: Slot): boolean {
  switch (instr.kind) {
    case 'score_set':
      return sameSlot(instr.dst, slot)
    case 'score_copy':
      return sameSlot(instr.dst, slot) || sameSlot(instr.src, slot)
    case 'score_add':
    case 'score_sub':
    case 'score_mul':
    case 'score_div':
    case 'score_mod':
    case 'score_min':
    case 'score_max':
      return sameSlot(instr.dst, slot) || sameSlot(instr.src, slot)
    case 'score_swap':
      return sameSlot(instr.a, slot) || sameSlot(instr.b, slot)
    case 'store_cmd_to_score':
      return sameSlot(instr.dst, slot) || instructionMentionsSlot(instr.cmd, slot)
    case 'store_score_to_nbt':
      return sameSlot(instr.src, slot)
    case 'store_nbt_to_score':
      return sameSlot(instr.dst, slot)
    case 'call_if_matches':
    case 'call_unless_matches':
      return sameSlot(instr.slot, slot)
    case 'call_if_score':
    case 'call_unless_score':
      return sameSlot(instr.a, slot) || sameSlot(instr.b, slot)
    case 'return_value':
      return sameSlot(instr.slot, slot)
    case 'raw':
      return textMentionsSlot(instr.cmd, slot)
    case 'macro_line':
      return textMentionsSlot(instr.template, slot)
    default:
      return false
  }
}

function tempOnlyAppearsInWindow(instrs: LIRInstr[], temp: Slot, start: number): boolean {
  for (let i = 0; i < instrs.length; i++) {
    if (i >= start && i <= start + 2) continue
    if (instructionMentionsSlot(instrs[i], temp)) return false
  }
  return true
}

function canCollapse(copyIn: LIRInstr, op: LIRInstr, copyOut: LIRInstr, instrs: LIRInstr[], index: number): boolean {
  if (copyIn.kind !== 'score_copy' || !isRmwOp(op) || copyOut.kind !== 'score_copy') return false
  if (!sameSlot(copyIn.dst, op.dst)) return false
  if (!sameSlot(copyOut.src, copyIn.dst)) return false
  if (isProtectedSlot(copyIn.dst)) return false
  if (copyIn.dst.obj !== copyOut.dst.obj || op.src.obj !== copyOut.dst.obj) return false

  // If the output is also the RHS, copying src into output first changes the RHS value.
  // The self case remains safe because MC scoreboard self-RMW reads the current dst value.
  if (sameSlot(copyOut.dst, op.src) && !sameSlot(copyOut.dst, copyIn.src)) return false

  return tempOnlyAppearsInWindow(instrs, copyIn.dst, index)
}

function remapTemp(slot: Slot, temp: Slot, out: Slot): Slot {
  return sameSlot(slot, temp) ? out : slot
}

export function scoreboardRmwPass(fn: LIRFunction): LIRFunction {
  const out: LIRInstr[] = []
  let changed = false

  for (let i = 0; i < fn.instructions.length; i++) {
    const first = fn.instructions[i]
    const second = fn.instructions[i + 1]
    const third = fn.instructions[i + 2]

    if (second && third && canCollapse(first, second, third, fn.instructions, i)) {
      const copyIn = first as Extract<LIRInstr, { kind: 'score_copy' }>
      const op = second as Extract<LIRInstr, { kind: 'score_add' | 'score_sub' | 'score_mul' | 'score_div' | 'score_mod' | 'score_min' | 'score_max' }>
      const copyOut = third as Extract<LIRInstr, { kind: 'score_copy' }>

      out.push({ kind: 'score_copy', dst: copyOut.dst, src: copyIn.src, sourceLoc: copyIn.sourceLoc })
      out.push({ ...op, dst: copyOut.dst, src: remapTemp(op.src, copyIn.dst, copyOut.dst) })
      i += 2
      changed = true
      continue
    }

    out.push(first)
  }

  return changed ? { ...fn, instructions: out } : fn
}
