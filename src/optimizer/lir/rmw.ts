import type { LIRFunction, LIRInstr, LIRModule, Slot } from '../../lir/types'
import {
  analyzeStraightLineSlotLiveness,
  createModuleSlotReferenceIndex,
  getReadSlots,
  getWriteSlots,
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
const NON_COMMUTATIVE_RMW_OPS = new Set<LIRInstr['kind']>([
  'score_sub',
  'score_div',
  'score_mod',
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

function isSlotTemporarySafeForOverwrite(
  temp: Slot,
  context: RewriteContext,
  isExternallyMentioned: (slot: Slot) => boolean,
): boolean {
  if (isProtectedSlot(temp)) return false
  if (isExternallyMentioned(temp)) return false
  if (!context.liveness) return true
  // Safe for overwrite elimination when there is no later read before the overwrite
  // and no liveness information would contradict that in the current window.
  const nextRead = context.liveness.nextReadAfter(context.start, temp)
  return nextRead === null || nextRead >= context.start + 1
}

function isWriteOnlyInstruction(instr: LIRInstr, slot: Slot): boolean {
  if (isRmwOp(instr)) return false

  if (instr.kind === 'score_set' && sameSlot(instr.dst, slot)) {
    return true
  }
  if (instr.kind === 'store_cmd_to_score' && sameSlot(instr.dst, slot)) {
    return true
  }
  if (instr.kind === 'store_nbt_to_score' && sameSlot(instr.dst, slot)) {
    return true
  }
  return false
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
  const copyIn = context.window[0]
  if (!copyIn || copyIn.kind !== 'score_copy') return null

  let chainEnd = 0
  const chain: Slot[] = [copyIn.src]
  const destinations: Slot[] = [copyIn.dst]
  for (let offset = 1; offset < context.window.length; offset += 1) {
    const current = context.window[offset]
    if (!current || current.kind !== 'score_copy') break
    const previousDst = destinations[destinations.length - 1]
    if (!sameSlot(current.src, previousDst)) break

    chainEnd = offset
    chain.push(current.src)
    destinations.push(current.dst)
  }

  if (chain.length <= 1) return null

  const chainCopies = context.window.slice(0, chainEnd + 1)
  const copyOut = chainCopies[chainCopies.length - 1] as LIRInstr & { kind: 'score_copy' }
  const firstCopy = copyIn
  const endIndex = context.start + chainEnd
  const temporarySlots = destinations.slice(0, destinations.length - 1)

  for (const temp of temporarySlots) {
    if (!isTemporarySafe(temp, endIndex, context, isExternallyMentioned)) return null
  }

  return {
    replacement: sameSlot(copyOut.dst, firstCopy.src)
      ? []
      : [makeScoreCopy(copyOut.dst, firstCopy.src, firstCopy.sourceLoc)],
    consume: chainEnd + 1,
  }
}

const copyOverwriteRule = (isExternallyMentioned: (slot: Slot) => boolean): RewriteRule => (context): { replacement: LIRInstr[]; consume: number } | null => {
  const [copyIn, overwritten] = context.window
  if (!copyIn || !overwritten) return null
  if (copyIn.kind !== 'score_copy') return null
  if (!isWriteOnlyInstruction(overwritten, copyIn.dst)) return null
  if (!isSlotTemporarySafeForOverwrite(copyIn.dst, context, isExternallyMentioned)) return null

  return {
    replacement: [overwritten],
    consume: 2,
  }
}

const arithCopySetRule = (isExternallyMentioned: (slot: Slot) => boolean): RewriteRule => (context): { replacement: LIRInstr[]; consume: number } | null => {
  const [arith, copy, set] = context.window
  if (!arith || !copy || !set) return null
  if (!isRmwOp(arith) || copy.kind !== 'score_copy' || set.kind !== 'score_set') return null
  if (!sameSlot(copy.src, arith.dst)) return null
  if (!sameSlot(copy.dst, set.dst)) return null

  if (!isSlotTemporarySafeForOverwrite(copy.dst, context, isExternallyMentioned)) return null

  return {
    replacement: [arith, set],
    consume: 3,
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

const copyToRmwRule = (isExternallyMentioned: (slot: Slot) => boolean): RewriteRule => (context): { replacement: LIRInstr[]; consume: number } | null => {
  const [copyIn, op] = context.window
  if (!copyIn || !op) return null
  if (copyIn.kind !== 'score_copy') return null
  if (!isRmwOp(op)) return null
  if (!sameSlot(op.src, copyIn.dst)) return null
  if (NON_COMMUTATIVE_RMW_OPS.has(op.kind) && sameSlot(op.dst, copyIn.src)) return null

  if (!isTemporarySafe(copyIn.dst, context.start + 1, context, isExternallyMentioned)) return null

  return {
    replacement: [{ ...op, src: copyIn.src }],
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
    copyOverwriteRule(isExternallyMentioned),
    arithCopySetRule(isExternallyMentioned),
    copyReturnRule(isExternallyMentioned),
    copyToRmwRule(isExternallyMentioned),
    copyRmwRule(isExternallyMentioned),
    copyRmwReturnRule(isExternallyMentioned),
  ]
}

export function scoreboardRmwPass(fn: LIRFunction, options: RmwPassOptions = {}): LIRFunction {
  const isExternallyMentioned = options.isExternallyMentioned ?? (() => false)
  const liveness = analyzeStraightLineSlotLiveness(fn.instructions)
  const result = applyLocalRewriteWindows(fn, rewriteRules(isExternallyMentioned), {
    maxWindowSize: 4,
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
