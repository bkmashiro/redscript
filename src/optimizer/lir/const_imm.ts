/**
 * Constant Immediate Folding — LIR optimization pass.
 *
 * Peephole: finds score_set($__const_C, C) immediately followed by
 * arithmetic using that const slot exactly once. It folds add/sub into
 * typed `score_delta` immediates and removes safe algebraic identities such
 * as `* 1`, `/ 1`, `* 0`, and `% 1`.
 *
 * This saves one command per arithmetic-with-constant operation.
 */

import type { LIRFunction, LIRInstr, Slot } from '../../lir/types'
import { SCORE_INT_MIN, isScoreInt } from '../../lir/types'
import { getSourceOperandSlots } from './effects'

function slotKey(s: Slot): string {
  return `${s.player}\0${s.obj}`
}

function sameSlot(a: Slot, b: Slot): boolean {
  return a.player === b.player && a.obj === b.obj
}

function isMinMaxSelfNoOp(instr: LIRInstr): boolean {
  return (instr.kind === 'score_min' || instr.kind === 'score_max') && sameSlot(instr.dst, instr.src)
}

function constFoldScoreMinMax(a: number, b: number, op: 'score_min' | 'score_max'): number {
  return op === 'score_min' ? Math.min(a, b) : Math.max(a, b)
}

/** Count how many times a slot is used as a source operand. */
function countSlotUses(instrs: LIRInstr[], target: string): number {
  let count = 0
  for (const instr of instrs) {
    for (const s of getSourceOperandSlots(instr)) {
      if (slotKey(s) === target) count++
    }
  }
  return count
}

export function constImmFold(fn: LIRFunction): LIRFunction {
  const instrs = fn.instructions
  if (instrs.length < 2) return fn

  // Pre-compute use counts for all const slots
  const useCounts = new Map<string, number>()
  for (const instr of instrs) {
    for (const s of getSourceOperandSlots(instr)) {
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
    const nextNext = instrs[i + 2]

    // Pattern: score_set(dst, A), score_set(constSlot, B), score_min/max(dst, constSlot)
    if (
      curr &&
      next &&
      nextNext &&
      curr.kind === 'score_set' &&
      next.kind === 'score_set' &&
      next.dst.player.startsWith('$__const_') &&
      !sameSlot(curr.dst, next.dst) &&
      (nextNext.kind === 'score_min' || nextNext.kind === 'score_max') &&
      sameSlot(curr.dst, nextNext.dst) &&
      sameSlot(next.dst, nextNext.src) &&
      (useCounts.get(slotKey(next.dst)) || 0) === 1
    ) {
      result.push({
        kind: 'score_set',
        dst: curr.dst,
        value: constFoldScoreMinMax(curr.value, next.value, nextNext.kind),
      })
      changed = true
      i += 3
      continue
    }

    // Pattern: score_min(dst, dst) or score_max(dst, dst) is a no-op.
    if (isMinMaxSelfNoOp(curr)) {
      changed = true
      i++
      continue
    }

    // Pattern: score_set(constSlot, C) + score_copy/add/sub/mul/div/mod(dst, constSlot)
    if (
      next &&
      curr.kind === 'score_set' &&
      curr.dst.player.startsWith('$__const_') &&
      (next.kind === 'score_copy' || next.kind === 'score_add' || next.kind === 'score_sub' || next.kind === 'score_mul' || next.kind === 'score_div' || next.kind === 'score_mod') &&
      slotKey(next.src) === slotKey(curr.dst) &&
      (useCounts.get(slotKey(curr.dst)) || 0) === 1
    ) {
      const C = curr.value
      const dst = next.dst

      if (next.kind === 'score_copy') {
        result.push({ kind: 'score_set', dst: next.dst, value: C })
        changed = true
        i += 2
        continue
      }

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

      if (next.kind === 'score_mul' && C === 1) {
        // mul 1 is a no-op — skip both
        changed = true
        i += 2
        continue
      }

      if (next.kind === 'score_div' && C === 1) {
        // div 1 is a no-op — skip both
        changed = true
        i += 2
        continue
      }

      if (next.kind === 'score_mul' && C === 0) {
        // mul 0 always produces 0
        result.push({ kind: 'score_set', dst: next.dst, value: 0 })
        changed = true
        i += 2
        continue
      }

      if (next.kind === 'score_mod' && C === 1) {
        // integer x % 1 is always 0
        result.push({ kind: 'score_set', dst: next.dst, value: 0 })
        changed = true
        i += 2
        continue
      }

      if (next.kind !== 'score_add' && next.kind !== 'score_sub') {
        result.push(curr)
        i++
        continue
      }

      // score_add with constant K folds to dst += K.
      // score_sub with constant K folds to dst -= K.
      const delta = next.kind === 'score_add' ? C : -C

      if (!isScoreInt(delta) || delta === SCORE_INT_MIN) {
        result.push(curr)
        result.push(next)
        i += 2
        continue
      }

      result.push({
        kind: 'score_delta',
        dst,
        value: delta,
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
