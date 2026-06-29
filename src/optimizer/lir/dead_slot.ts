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

import type { LIRFunction, LIRModule, Slot } from '../../lir/types'
import {
  analyzeStraightLineSlotLiveness,
  getPureWriteDst,
  extractSlotsFromText,
  getSemanticReadSlots,
  isConservativeBarrierInstruction,
  isPotentiallyMentionedByOpaqueBarrier,
  isProtectedSlot,
  slotKey,
} from './analysis'

function collectReadSlots(instructions: LIRFunction['instructions']): Set<string> {
  const readSet = new Set<string>()

  for (const instr of instructions) {
    for (const s of getSemanticReadSlots(instr)) {
      readSet.add(slotKey(s))
    }
    if (instr.kind === 'raw') {
      for (const slot of extractSlotsFromText(instr.cmd)) {
        readSet.add(slotKey(slot))
      }
    } else if (instr.kind === 'macro_line') {
      for (const slot of extractSlotsFromText(instr.template)) {
        readSet.add(slotKey(slot))
      }
    }
  }

  return readSet
}

function isFunctionPrefixedTempSlot(fnName: string, player: string): boolean {
  const prefix = `$${fnName}_t`
  if (!player.startsWith(prefix)) return false
  return /^\d+$/.test(player.slice(prefix.length))
}

function isCompilerOwnedLocalTempSlot(fnName: string, slot: Slot): boolean {
  return /^\$t\d+$/.test(slot.player) ||
    /^\$_t\d+$/.test(slot.player) ||
    isFunctionPrefixedTempSlot(fnName, slot.player)
}

function hasLaterOpaqueBarrierMention(
  instructions: LIRFunction['instructions'],
  fromIndex: number,
  slot: Slot,
): boolean {
  for (let index = fromIndex + 1; index < instructions.length; index += 1) {
    if (isPotentiallyMentionedByOpaqueBarrier(instructions[index], slot)) return true
  }
  return false
}

function eliminateDeadWrites(
  fn: LIRFunction,
  readSet: Set<string>,
  canElideOverwrittenTemp: (slot: Slot, fnName: string) => boolean,
): { instructions: LIRFunction['instructions']; changed: boolean } {
  const { instructions } = fn
  if (instructions.length === 0) return { instructions, changed: false }

  const liveness = analyzeStraightLineSlotLiveness(instructions)
  const keep = new Array<boolean>(instructions.length).fill(true)
  const nextPureWrite = new Map<string, number>()

  for (let index = instructions.length - 1; index >= 0; index -= 1) {
    const instr = instructions[index]
    const dst = getPureWriteDst(instr)

    if (isConservativeBarrierInstruction(instr)) {
      nextPureWrite.clear()
    }

    if (dst === null) continue
    if (isProtectedSlot(dst)) continue

    const key = slotKey(dst)
    if (!readSet.has(key) && !hasLaterOpaqueBarrierMention(instructions, index, dst)) {
      keep[index] = false
    } else if (isCompilerOwnedLocalTempSlot(fn.name, dst) && canElideOverwrittenTemp(dst, fn.name)) {
      const nextWrite = nextPureWrite.get(key)
      if (nextWrite !== undefined) {
        const nextRead = liveness.nextReadAfter(index, dst)
        if (nextRead === null || nextRead > nextWrite) {
          keep[index] = false
        }
      }
    }

    nextPureWrite.set(key, index)
  }

  const filtered = keep.every(v => v)
    ? instructions
    : instructions.filter((_, index) => keep[index])

  return { instructions: filtered, changed: filtered.length !== instructions.length }
}

export function deadSlotElim(fn: LIRFunction): LIRFunction {
  const readSet = collectReadSlots(fn.instructions)
  const { instructions, changed } = eliminateDeadWrites(fn, readSet, () => true)
  if (!changed) return fn
  return { ...fn, instructions }
}

export function deadSlotElimModule(mod: LIRModule): LIRModule {
  // Collect all slots read across ALL functions (cross-function visibility)
  const globalReadSet = new Set<string>()
  const readFunctionMap = new Map<string, Set<number>>()

  for (const [fnIndex, fn] of mod.functions.entries()) {
    const fnReadSet = collectReadSlots(fn.instructions)
    for (const key of fnReadSet) {
      globalReadSet.add(key)
      let functions = readFunctionMap.get(key)
      if (functions === undefined) {
        functions = new Set<number>()
        readFunctionMap.set(key, functions)
      }
      functions.add(fnIndex)
    }
  }

  let changed = false
  const functions = mod.functions.map((fn, fnIndex) => {
    const { instructions, changed: fnChanged } = eliminateDeadWrites(
      fn,
      globalReadSet,
      dst => {
        const readers = readFunctionMap.get(slotKey(dst))
        return readers !== undefined && readers.size === 1 && readers.has(fnIndex)
      },
    )
    if (fnChanged) changed = true
    return fnChanged ? { ...fn, instructions } : fn
  })

  return changed ? { ...mod, functions } : mod
}
