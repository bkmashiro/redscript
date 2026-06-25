import type { LIRFunction, LIRInstr, Slot } from '../../lir/types'
import { isConservativeBarrierInstruction, type LIRNextUseInfo } from './analysis'

export interface RewriteContext {
  start: number
  window: readonly LIRInstr[]
  liveness?: LIRNextUseInfo
  isExternallyMentioned: (slot: Slot) => boolean
  hasBarrierBetween: (start: number, end: number) => boolean
  isBarrier: (instr: LIRInstr) => boolean
}

export interface RewriteMatch {
  replacement: LIRInstr[]
  consume: number
}

export type RewriteRule = (context: RewriteContext) => RewriteMatch | null

export interface RewriteOptions {
  maxWindowSize?: number
  isBarrier?: (instr: LIRInstr) => boolean
  isExternallyMentioned?: (slot: Slot) => boolean
  liveness?: LIRNextUseInfo
}

export function hasConservativeBarrierBetween(
  instrs: readonly LIRInstr[],
  start: number,
  end: number,
  isBarrier: (instr: LIRInstr) => boolean = isConservativeBarrierInstruction,
): boolean {
  for (let i = start; i < end; i++) {
    if (isBarrier(instrs[i])) return true
  }
  return false
}

export function applyLocalRewriteWindows(
  fn: LIRFunction,
  rules: RewriteRule[],
  options: RewriteOptions = {},
): LIRFunction {
  const instrs = fn.instructions
  const maxWindowSize = options.maxWindowSize ?? 4
  if (instrs.length === 0 || rules.length === 0) return fn

  const isBarrier = options.isBarrier ?? isConservativeBarrierInstruction
  const isExternallyMentioned = options.isExternallyMentioned ?? (() => false)
  const hasBarrierBetween = (start: number, end: number): boolean => {
    return hasConservativeBarrierBetween(instrs, start, end, isBarrier)
  }

  const out: LIRInstr[] = []
  let changed = false
  let i = 0

  while (i < instrs.length) {
    const windowEnd = Math.min(instrs.length, i + maxWindowSize)
    const window = instrs.slice(i, windowEnd)
    let matched = false

    for (const rule of rules) {
      const result = rule({
        start: i,
        window,
        liveness: options.liveness,
        isExternallyMentioned,
        hasBarrierBetween,
        isBarrier,
      })

      if (!result) continue
      if (result.consume <= 0) continue
      if (result.consume > window.length) continue
      if (hasBarrierBetween(i, i + result.consume)) continue

      out.push(...result.replacement)
      i += result.consume
      matched = true
      changed = true
      break
    }

    if (!matched) {
      out.push(instrs[i])
      i += 1
    }
  }

  return changed ? { ...fn, instructions: out } : fn
}
