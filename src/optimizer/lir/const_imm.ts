/**
 * Constant Immediate Folding — LIR optimization pass.
 *
 * Peephole: finds score_set($__const_C, C) immediately followed by
 * score_add/score_sub(dst, $__const_C), where $__const_C has no other
 * uses in the function, and replaces the pair with a single
 * `scoreboard players add/remove` raw command.
 *
 * This saves one command per arithmetic-with-constant operation.
 */

import type { LIRFunction, LIRInstr, Slot } from '../../lir/types'

function slotKey(s: Slot): string {
  return `${s.player}\0${s.obj}`
}

/** Count how many times a slot is used as a source operand. */
function countSlotUses(instrs: LIRInstr[], target: string): number {
  let count = 0
  for (const instr of instrs) {
    for (const s of getReadSlots(instr)) {
      if (slotKey(s) === target) count++
    }
  }
  return count
}

function extractSlotsFromRaw(cmd: string): Slot[] {
  const slots: Slot[] = []
  const re = /(\$[\w.:]+)\s+(\S+)/g
  let m
  while ((m = re.exec(cmd)) !== null) {
    slots.push({ player: m[1], obj: m[2] })
  }
  return slots
}

function getReadSlots(instr: LIRInstr): Slot[] {
  switch (instr.kind) {
    case 'score_copy': return [instr.src]
    case 'score_add': case 'score_sub':
    case 'score_mul': case 'score_div': case 'score_mod':
    case 'score_min': case 'score_max':
      return [instr.src]
    case 'score_swap': return [instr.a, instr.b]
    case 'store_cmd_to_score': return getReadSlots(instr.cmd)
    case 'store_score_to_nbt': return [instr.src]
    case 'return_value': return [instr.slot]
    case 'call_if_matches': case 'call_unless_matches':
      return [instr.slot]
    case 'call_if_score': case 'call_unless_score':
      return [instr.a, instr.b]
    case 'raw': return extractSlotsFromRaw(instr.cmd)
    case 'macro_line': return extractSlotsFromRaw(instr.template)
    default: return []
  }
}

export function constImmFold(fn: LIRFunction): LIRFunction {
  const instrs = fn.instructions
  if (instrs.length < 2) return fn

  // Pre-compute use counts for all const slots
  const useCounts = new Map<string, number>()
  for (const instr of instrs) {
    for (const s of getReadSlots(instr)) {
      const key = slotKey(s)
      useCounts.set(key, (useCounts.get(key) || 0) + 1)
    }
  }

  const result: LIRInstr[] = []
  let changed = false
  let i = 0

  while (i < instrs.length) {
    const curr = instrs[i]
    const next = instrs[i + 1]

    // Pattern: score_set(constSlot, C) + score_add/sub(dst, constSlot)
    if (
      next &&
      curr.kind === 'score_set' &&
      curr.dst.player.startsWith('$__const_') &&
      (next.kind === 'score_add' || next.kind === 'score_sub') &&
      slotKey(next.src) === slotKey(curr.dst) &&
      (useCounts.get(slotKey(curr.dst)) || 0) === 1
    ) {
      const C = curr.value
      const dst = next.dst

      if (C === 0 && next.kind === 'score_add') {
        // add 0 is a no-op — skip both
        changed = true
        i += 2
        continue
      }

      if (C === 0 && next.kind === 'score_sub') {
        // sub 0 is a no-op — skip both
        changed = true
        i += 2
        continue
      }

      // Determine add vs remove
      let op: string
      let val: number
      if (next.kind === 'score_add') {
        if (C > 0) {
          op = 'add'
          val = C
        } else {
          op = 'remove'
          val = -C
        }
      } else {
        // score_sub
        if (C > 0) {
          op = 'remove'
          val = C
        } else {
          op = 'add'
          val = -C
        }
      }

      result.push({
        kind: 'raw',
        cmd: `scoreboard players ${op} ${dst.player} ${dst.obj} ${val}`,
      })
      changed = true
      i += 2
      continue
    }

    result.push(curr)
    i++
  }

  return changed ? { ...fn, instructions: result } : fn
}
