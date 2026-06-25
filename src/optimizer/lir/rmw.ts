import type { LIRFunction, LIRInstr, LIRModule, Slot } from '../../lir/types'
import {
  analyzeStraightLineSlotLiveness,
  createModuleSlotReferenceIndex,
  isConservativeBarrierInstruction,
  isProtectedSlot,
  sameSlot,
} from './analysis'
import { applyLocalRewriteWindows, type RewriteContext, type RewriteRule } from './rewrite'

interface RmwPassOptions {
  isExternallyMentioned?: (slot: Slot) => boolean
}

const RMW_OPS = new Set<LIRInstr['kind']>([
  'score_add',
  'score_sub',
  'score_mul',
  'score_div',
  'score_mod',
  'score_min',
  'score_max',
])

function isRmwOp(instr: LIRInstr): instr is Extract<LIRInstr, { kind: 'score_add' | 'score_sub' | 'score_mul' | 'score_div' | 'score_mod' | 'score_min' | 'score_max' }> {
  return RMW_OPS.has(instr.kind)
}

function makeScoreCopy(
  dst: Slot,
  src: Slot,
  sourceLoc?: LIRInstr['sourceLoc'],
): Extract<LIRInstr, { kind: 'score_copy' }> {
  return sourceLoc === undefined
    ? { kind: 'score_copy', dst, src }
    : { kind: 'score_copy', dst, src, sourceLoc }
}

function isTemporarySafe(
  temp: Slot,
  endIndex: number,
  context: RewriteContext,
  isExternallyMentioned: (slot: Slot) => boolean,
): boolean {
  if (isProtectedSlot(temp)) return false
  if (isExternallyMentioned(temp)) return false
  if (!context.liveness) return true
  if (!context.liveness.isDeadAfter(endIndex, temp)) return false
  return true
}

function remapTemp(slot: Slot, temp: Slot, out: Slot): Slot {
  return sameSlot(slot, temp) ? out : slot
}

const selfCopyRule: RewriteRule = (context): { replacement: LIRInstr[]; consume: number } | null => {
  const current = context.window[0]
  if (context.window.length === 0 || !current || current.kind !== 'score_copy') return null
  if (!sameSlot(current.src, current.dst)) return null
  if (isProtectedSlot(current.src)) return null
  return {
    replacement: [],
    consume: 1,
  }
}

const copyChainRule = (isExternallyMentioned: (slot: Slot) => boolean): RewriteRule => (context): { replacement: LIRInstr[]; consume: number } | null => {
  const [copyIn, copyOut] = context.window
  if (!copyIn || !copyOut) return null
  if (copyIn.kind !== 'score_copy' || copyOut.kind !== 'score_copy') return null
  if (!sameSlot(copyOut.src, copyIn.dst)) return null

  const temp = copyIn.dst
  if (!isTemporarySafe(temp, context.start + 1, context, isExternallyMentioned)) return null

  return {
    replacement: sameSlot(copyOut.dst, copyIn.src)
      ? []
      : [makeScoreCopy(copyOut.dst, copyIn.src, copyIn.sourceLoc)],
    consume: 2,
  }
}

const copyReturnRule = (isExternallyMentioned: (slot: Slot) => boolean): RewriteRule => (context): { replacement: LIRInstr[]; consume: number } | null => {
  const [copyIn, ret] = context.window
  if (!copyIn || !ret) return null
  if (copyIn.kind !== 'score_copy' || ret.kind !== 'return_value') return null
  if (!sameSlot(ret.slot, copyIn.dst)) return null

  const temp = copyIn.dst
  if (!isTemporarySafe(temp, context.start + 1, context, isExternallyMentioned)) return null

  return {
    replacement: [makeScoreCopy({ player: '$ret', obj: ret.slot.obj }, copyIn.src, copyIn.sourceLoc)],
    consume: 2,
  }
}

const copyRmwRule = (isExternallyMentioned: (slot: Slot) => boolean): RewriteRule => (context): { replacement: LIRInstr[]; consume: number } | null => {
  const [copyIn, op, copyOut] = context.window
  if (!copyIn || !op || !copyOut) return null
  if (copyIn.kind !== 'score_copy') return null
  if (!isRmwOp(op)) return null
  if (copyOut.kind !== 'score_copy') return null
  if (!sameSlot(copyIn.dst, op.dst)) return null
  if (!sameSlot(copyOut.src, copyIn.dst)) return null
  if (copyIn.dst.obj !== copyOut.dst.obj || op.src.obj !== copyOut.dst.obj) return null
  if (sameSlot(copyOut.dst, op.src) && !sameSlot(copyOut.dst, copyIn.src)) return null

  const temp = copyIn.dst
  if (!isTemporarySafe(temp, context.start + 2, context, isExternallyMentioned)) return null

  return {
    replacement: [
      makeScoreCopy(copyOut.dst, copyIn.src, copyIn.sourceLoc),
      { ...op, dst: copyOut.dst, src: remapTemp(op.src, temp, copyOut.dst) },
    ],
    consume: 3,
  }
}

const copyRmwReturnRule = (isExternallyMentioned: (slot: Slot) => boolean): RewriteRule => (context): { replacement: LIRInstr[]; consume: number } | null => {
  const [copyIn, op, ret] = context.window
  if (!copyIn || !op || !ret) return null
  if (copyIn.kind !== 'score_copy') return null
  if (!isRmwOp(op)) return null
  if (ret.kind !== 'return_value') return null
  if (!sameSlot(op.dst, copyIn.dst)) return null
  if (!sameSlot(ret.slot, copyIn.dst)) return null
  if (copyIn.dst.obj !== copyIn.src.obj || op.src.obj !== copyIn.dst.obj) return null

  const temp = copyIn.dst
  if (!isTemporarySafe(temp, context.start + 2, context, isExternallyMentioned)) return null
  if (sameSlot({ player: '$ret', obj: ret.slot.obj }, op.src) && !sameSlot(copyIn.src, { player: '$ret', obj: ret.slot.obj })) return null

  const retSlot: Slot = { player: '$ret', obj: ret.slot.obj }
  return {
    replacement: [
      makeScoreCopy(retSlot, copyIn.src, copyIn.sourceLoc),
      { ...op, dst: retSlot, src: remapTemp(op.src, temp, retSlot) },
    ],
    consume: 3,
  }
}

function rewriteRules(isExternallyMentioned: (slot: Slot) => boolean): RewriteRule[] {
  return [
    selfCopyRule,
    copyChainRule(isExternallyMentioned),
    copyReturnRule(isExternallyMentioned),
    copyRmwRule(isExternallyMentioned),
    copyRmwReturnRule(isExternallyMentioned),
  ]
}

export function scoreboardRmwPass(fn: LIRFunction, options: RmwPassOptions = {}): LIRFunction {
  const isExternallyMentioned = options.isExternallyMentioned ?? (() => false)
  const liveness = analyzeStraightLineSlotLiveness(fn.instructions)
  const result = applyLocalRewriteWindows(fn, rewriteRules(isExternallyMentioned), {
    maxWindowSize: 3,
    isBarrier: isConservativeBarrierInstruction,
    isExternallyMentioned,
    liveness,
  })

  return result
}

export function scoreboardRmwPassModule(mod: LIRModule): LIRModule {
  const referenceIndex = createModuleSlotReferenceIndex(mod)
  const optimized = mod.functions.map(fn => scoreboardRmwPass(fn, {
    isExternallyMentioned: (slot: Slot): boolean => referenceIndex.isMentionedOutside(fn, slot),
  }))

  const changed = optimized.some((fn, index) => fn !== mod.functions[index])
  return changed ? { ...mod, functions: optimized } : mod
}
