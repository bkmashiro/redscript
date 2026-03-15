/**
 * Dead Slot Elimination — LIR optimization pass.
 *
 * Removes score_set / score_copy instructions where the destination slot
 * is never read anywhere in the function.
 *
 * Preserves writes to:
 *  - $ret (return value)
 *  - $p0, $p1, … (parameter passing slots)
 *  - slots used in side-effectful instructions (calls, stores, nbt ops, raw)
 */

import type { LIRFunction, LIRInstr, LIRModule, Slot } from '../../lir/types'

/** Canonical key for a slot (player + obj). */
function slotKey(s: Slot): string {
  return `${s.player}\0${s.obj}`
}

/**
 * Extract slot references from a raw MC command string.
 * Matches patterns like `$player_name objective_name` used in scoreboard commands.
 */
function extractSlotsFromRaw(cmd: string): Slot[] {
  const slots: Slot[] = []
  // Match $<player> <obj> patterns (scoreboard slot references)
  const re = /(\$[\w.]+)\s+(\S+)/g
  let m
  while ((m = re.exec(cmd)) !== null) {
    slots.push({ player: m[1], obj: m[2] })
  }
  return slots
}

/** Collect all slots that are *read* (used as source) by an instruction. */
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
    case 'store_nbt_to_score': return []
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

/** Returns the destination slot if the instruction is a pure write (no side effects). */
function getPureWriteDst(instr: LIRInstr): Slot | null {
  switch (instr.kind) {
    case 'score_set': return instr.dst
    case 'score_copy': return instr.dst
    default: return null
  }
}

/** True if a slot should never be eliminated (externally visible). */
function isProtectedSlot(s: Slot): boolean {
  const p = s.player
  return p === '$ret' || p.startsWith('$ret_') || /^\$p\d+$/.test(p)
}

export function deadSlotElim(fn: LIRFunction): LIRFunction {
  // 1. Collect all read slots across the function
  const readSet = new Set<string>()
  for (const instr of fn.instructions) {
    for (const s of getReadSlots(instr)) {
      readSet.add(slotKey(s))
    }
  }

  // 2. Filter out pure writes to slots that are never read
  const filtered = fn.instructions.filter(instr => {
    const dst = getPureWriteDst(instr)
    if (dst === null) return true // not a pure write → keep
    if (isProtectedSlot(dst)) return true
    return readSet.has(slotKey(dst))
  })

  if (filtered.length === fn.instructions.length) return fn
  return { ...fn, instructions: filtered }
}

export function deadSlotElimModule(mod: LIRModule): LIRModule {
  // Collect all slots read across ALL functions (cross-function visibility)
  const globalReadSet = new Set<string>()
  for (const fn of mod.functions) {
    for (const instr of fn.instructions) {
      for (const s of getReadSlots(instr)) {
        globalReadSet.add(slotKey(s))
      }
    }
  }

  let changed = false
  const functions = mod.functions.map(fn => {
    const filtered = fn.instructions.filter(instr => {
      const dst = getPureWriteDst(instr)
      if (dst === null) return true
      if (isProtectedSlot(dst)) return true
      return globalReadSet.has(slotKey(dst))
    })
    if (filtered.length !== fn.instructions.length) changed = true
    if (filtered.length === fn.instructions.length) return fn
    return { ...fn, instructions: filtered }
  })

  return changed ? { ...mod, functions } : mod
}
