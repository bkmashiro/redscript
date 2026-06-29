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

function remapSlot(slot: Slot, from: Slot, to: Slot): Slot {
  return sameSlot(slot, from) ? to : slot
}

function remapInstructionSlot(instr: LIRInstr, from: Slot, to: Slot): LIRInstr {
  switch (instr.kind) {
    case 'score_set':
      return { ...instr, dst: remapSlot(instr.dst, from, to) }
    case 'score_copy':
    case 'score_add':
    case 'score_sub':
    case 'score_mul':
    case 'score_div':
    case 'score_mod':
    case 'score_min':
    case 'score_max':
      return { ...instr, dst: remapSlot(instr.dst, from, to), src: remapSlot(instr.src, from, to) }
    case 'score_swap':
      return { ...instr, a: remapSlot(instr.a, from, to), b: remapSlot(instr.b, from, to) }
    case 'store_cmd_to_score':
      return { ...instr, dst: remapSlot(instr.dst, from, to), cmd: remapInstructionSlot(instr.cmd, from, to) }
    case 'store_score_to_nbt':
      return { ...instr, src: remapSlot(instr.src, from, to) }
    case 'store_nbt_to_score':
      return { ...instr, dst: remapSlot(instr.dst, from, to) }
    case 'return_value':
      return { ...instr, slot: remapSlot(instr.slot, from, to) }
    case 'call_if_matches':
    case 'call_unless_matches':
      return { ...instr, slot: remapSlot(instr.slot, from, to) }
    case 'call_if_score':
    case 'call_unless_score':
      return { ...instr, a: remapSlot(instr.a, from, to), b: remapSlot(instr.b, from, to) }
    default:
      return instr
  }
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
  const copyIn = context.window[0]
  if (!copyIn || copyIn.kind !== 'score_copy') return null

  const temp = copyIn.dst
  const ops: Array<Extract<LIRInstr, { kind: 'score_add' | 'score_sub' | 'score_mul' | 'score_div' | 'score_mod' | 'score_min' | 'score_max' }>> = []
  let copyOutOffset = -1
  for (let offset = 1; offset < context.window.length; offset += 1) {
    const current = context.window[offset]
    if (!current) return null
    if (isRmwOp(current) && sameSlot(current.dst, temp)) {
      ops.push(current)
      continue
    }
    if (current.kind === 'score_copy' && sameSlot(current.src, temp)) {
      copyOutOffset = offset
    }
    break
  }

  if (ops.length === 0 || copyOutOffset < 0) return null
  const copyOut = context.window[copyOutOffset]
  if (!copyOut || copyOut.kind !== 'score_copy') return null
  if (copyIn.dst.obj !== copyOut.dst.obj) return null

  for (const op of ops) {
    if (op.src.obj !== copyOut.dst.obj) return null
    if (sameSlot(copyOut.dst, op.src) && !sameSlot(copyOut.dst, copyIn.src)) return null
  }

  if (!isTemporarySafe(temp, context.start + copyOutOffset, context, isExternallyMentioned)) return null

  const replacement: LIRInstr[] = sameSlot(copyOut.dst, copyIn.src)
    ? []
    : [makeScoreCopy(copyOut.dst, copyIn.src, copyIn.sourceLoc)]
  replacement.push(...ops.map(op => ({
    ...op,
    dst: copyOut.dst,
    src: remapTemp(op.src, temp, copyOut.dst),
  })))

  return {
    replacement,
    consume: copyOutOffset + 1,
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

function isLikelyLocalTemp(slot: Slot): boolean {
  return slot.player.startsWith('$') && /_t\d+$/.test(slot.player)
}

function coalesceDeadSourceCopySlots(
  fn: LIRFunction,
  isExternallyMentioned: (slot: Slot) => boolean,
): LIRFunction {
  const out: LIRInstr[] = []
  let changed = false
  const instrs = fn.instructions

  for (let i = 0; i < instrs.length; i += 1) {
    const instr = instrs[i]
    if (instr.kind !== 'score_copy') {
      out.push(instr)
      continue
    }

    const { dst, src } = instr
    if (dst.obj !== src.obj || !isLikelyLocalTemp(dst) || !isLikelyLocalTemp(src)) {
      out.push(instr)
      continue
    }
    if (isProtectedSlot(dst) || isProtectedSlot(src) || isExternallyMentioned(dst) || isExternallyMentioned(src)) {
      out.push(instr)
      continue
    }

    let lastDstMention = -1
    let unsafe = false
    for (let j = i + 1; j < instrs.length; j += 1) {
      const candidate = instrs[j]
      if (isConservativeBarrierInstruction(candidate)) break
      const mentionsDst = getReadSlots(candidate).some(slot => sameSlot(slot, dst))
        || getWriteSlots(candidate).some(slot => sameSlot(slot, dst))
      const mentionsSrc = getReadSlots(candidate).some(slot => sameSlot(slot, src))
        || getWriteSlots(candidate).some(slot => sameSlot(slot, src))
      if (mentionsSrc && !mentionsDst) {
        unsafe = true
        break
      }
      if (mentionsDst) lastDstMention = j
    }

    if (unsafe || lastDstMention < 0) {
      out.push(instr)
      continue
    }

    const regionLength = lastDstMention - i
    if (regionLength > 32) {
      out.push(instr)
      continue
    }

    changed = true
    for (let j = i + 1; j <= lastDstMention; j += 1) {
      out.push(remapInstructionSlot(instrs[j], dst, src))
    }
    i = lastDstMention
  }

  return changed ? { ...fn, instructions: out } : fn
}

export function scoreboardRmwPass(fn: LIRFunction, options: RmwPassOptions = {}): LIRFunction {
  const isExternallyMentioned = options.isExternallyMentioned ?? (() => false)
  const liveness = analyzeStraightLineSlotLiveness(fn.instructions)
  const windowOptimized = applyLocalRewriteWindows(fn, rewriteRules(isExternallyMentioned), {
    maxWindowSize: 10,
    isBarrier: isConservativeBarrierInstruction,
    isExternallyMentioned,
    liveness,
  })
  let coalesced = windowOptimized
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const next = coalesceDeadSourceCopySlots(coalesced, isExternallyMentioned)
    if (next === coalesced) break
    coalesced = next
  }
  const coalescedLiveness = coalesced === windowOptimized
    ? liveness
    : analyzeStraightLineSlotLiveness(coalesced.instructions)
  const result = applyLocalRewriteWindows(coalesced, rewriteRules(isExternallyMentioned), {
    maxWindowSize: 10,
    isBarrier: isConservativeBarrierInstruction,
    isExternallyMentioned,
    liveness: coalescedLiveness,
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
