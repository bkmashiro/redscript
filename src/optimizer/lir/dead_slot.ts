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

import type { LIRFunction, LIRModule } from '../../lir/types'
import { getPureWriteDst, getReadSlots, isProtectedSlot, slotKey } from './analysis'

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
