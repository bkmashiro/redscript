import { getSlotEffect, type SlotEffect } from './effects'
import type { LIRInstr, Slot, NBTType } from '../../lir/types'

export type BoundaryConfidence = 'exact' | 'conservative' | 'opaque'
export type BoundaryProvenance = 'typed-lir' | 'macro-helper' | 'raw-user-command' | 'lowering-compat'

export interface StorageRef {
  namespace: string
  path: string
  type?: NBTType
  scale?: number
}

export interface BoundarySidecar {
  reads: Slot[]
  writes: Slot[]
  storageReads: StorageRef[]
  storageWrites: StorageRef[]
  opaqueScoreboardRead: boolean
  opaqueScoreboardWrite: boolean
  opaqueStorageRead: boolean
  opaqueStorageWrite: boolean
  macroSubstitution: boolean
  rawText: boolean
  barrier: boolean
  provenance: BoundaryProvenance
  confidence: BoundaryConfidence
}

function sameSlot(left: Slot, right: Slot): boolean {
  return left.player === right.player && left.obj === right.obj
}

function dedupeSlots(items: Slot[]): Slot[] {
  const result: Slot[] = []
  for (const item of items) {
    if (!result.some(existing => sameSlot(existing, item))) {
      result.push(item)
    }
  }
  return result
}

function sameStorageRef(left: StorageRef, right: StorageRef): boolean {
  return left.namespace === right.namespace && left.path === right.path
}

function dedupeStorageRefs(items: StorageRef[]): StorageRef[] {
  const result: StorageRef[] = []
  for (const item of items) {
    if (!result.some(existing => sameStorageRef(existing, item))) {
      result.push(item)
    }
  }
  return result
}

function makeStorageRef(namespace: string, path: string, type?: NBTType, scale?: number): StorageRef {
  const ref: StorageRef = { namespace, path }
  if (type !== undefined) {
    ref.type = type
  }
  if (scale !== undefined) {
    ref.scale = scale
  }
  return ref
}

function exactStorageWrites(storageWrites: StorageRef[]): BoundarySidecar {
  return {
    reads: [],
    writes: [],
    storageReads: [],
    storageWrites,
    opaqueScoreboardRead: false,
    opaqueScoreboardWrite: false,
    opaqueStorageRead: false,
    opaqueStorageWrite: false,
    macroSubstitution: false,
    rawText: false,
    barrier: true,
    provenance: 'typed-lir',
    confidence: 'exact',
  }
}

function exactStorageCopy(storageReads: StorageRef[], storageWrites: StorageRef[]): BoundarySidecar {
  return {
    reads: [],
    writes: [],
    storageReads,
    storageWrites,
    opaqueScoreboardRead: false,
    opaqueScoreboardWrite: false,
    opaqueStorageRead: false,
    opaqueStorageWrite: false,
    macroSubstitution: false,
    rawText: false,
    barrier: true,
    provenance: 'typed-lir',
    confidence: 'exact',
  }
}

function fromSlotEffect(
  slotEffect: SlotEffect,
  options: {
    confidence?: BoundaryConfidence
    provenance?: BoundaryProvenance
    opaqueScoreboardRead?: boolean
    opaqueScoreboardWrite?: boolean
    storageReads?: StorageRef[]
    storageWrites?: StorageRef[]
    macroSubstitution?: boolean
    rawText?: boolean
    barrier?: boolean
    opaqueStorageRead?: boolean
    opaqueStorageWrite?: boolean
  } = {},
): BoundarySidecar {
  return {
    reads: dedupeSlots(slotEffect.semanticReads),
    writes: dedupeSlots(slotEffect.writes),
    storageReads: dedupeStorageRefs(options.storageReads ?? []),
    storageWrites: dedupeStorageRefs(options.storageWrites ?? []),
    opaqueScoreboardRead: options.opaqueScoreboardRead ?? slotEffect.opaqueReads,
    opaqueScoreboardWrite: options.opaqueScoreboardWrite ?? slotEffect.opaqueWrites,
    opaqueStorageRead: options.opaqueStorageRead ?? false,
    opaqueStorageWrite: options.opaqueStorageWrite ?? false,
    macroSubstitution: options.macroSubstitution ?? false,
    rawText: options.rawText ?? false,
    barrier: options.barrier ?? slotEffect.barrier,
    provenance: options.provenance ?? 'typed-lir',
    confidence: options.confidence ?? 'exact',
  }
}

function degradeStoreCmdToScoreConfidence(nestedConfidence: BoundaryConfidence): BoundaryConfidence {
  if (nestedConfidence === 'exact') return 'conservative'
  return nestedConfidence
}

export function deriveBoundarySidecar(instr: LIRInstr): BoundarySidecar {
  switch (instr.kind) {
    case 'score_set':
    case 'score_delta':
    case 'score_copy':
    case 'score_add':
    case 'score_sub':
    case 'score_mul':
    case 'score_div':
    case 'score_mod':
    case 'score_min':
    case 'score_max':
    case 'score_swap':
    case 'return_value':
      return fromSlotEffect(getSlotEffect(instr), { confidence: 'exact' })

    case 'store_cmd_to_score': {
      const nested = deriveBoundarySidecar(instr.cmd)
      const nestedSlotEffect = getSlotEffect(instr.cmd)
      const merged = fromSlotEffect(nestedSlotEffect, {
        confidence: degradeStoreCmdToScoreConfidence(nested.confidence),
        barrier: true,
        storageReads: nested.storageReads,
        storageWrites: nested.storageWrites,
        macroSubstitution: nested.macroSubstitution,
        rawText: nested.rawText,
        opaqueStorageRead: nested.opaqueStorageRead,
        opaqueStorageWrite: nested.opaqueStorageWrite,
        provenance: nested.provenance,
      })
      const reads = dedupeSlots([instr.dst, ...nested.reads, ...merged.reads])
      const writes = dedupeSlots([instr.dst, ...nested.writes, ...merged.writes])
      return {
        ...merged,
        reads,
        writes,
      }
    }

    case 'store_score_to_nbt':
      return {
        ...fromSlotEffect(getSlotEffect(instr), {
          confidence: 'exact',
          barrier: true,
          opaqueScoreboardRead: false,
          opaqueScoreboardWrite: false,
          storageWrites: [makeStorageRef(instr.ns, instr.path, instr.type, instr.scale)],
          opaqueStorageRead: false,
          opaqueStorageWrite: false,
        }),
      }

    case 'store_nbt_to_score':
      return {
        ...fromSlotEffect(getSlotEffect(instr), {
          confidence: 'exact',
          barrier: true,
          opaqueScoreboardRead: false,
          opaqueScoreboardWrite: false,
          opaqueStorageWrite: false,
          storageReads: [makeStorageRef(instr.ns, instr.path)],
        }),
      }

    case 'nbt_set_literal':
      return {
        ...exactStorageWrites([makeStorageRef(instr.ns, instr.path)]),
        opaqueScoreboardRead: false,
        opaqueScoreboardWrite: false,
        opaqueStorageRead: false,
      }

    case 'nbt_copy':
      return exactStorageCopy(
        [makeStorageRef(instr.srcNs, instr.srcPath)],
        [makeStorageRef(instr.dstNs, instr.dstPath)],
      )

    case 'call':
    case 'call_if_matches':
    case 'call_unless_matches':
    case 'call_if_score':
    case 'call_unless_score':
    case 'call_context':
      return {
        ...fromSlotEffect(getSlotEffect(instr), {
          confidence: 'conservative',
          barrier: true,
          opaqueStorageRead: true,
          opaqueStorageWrite: true,
        }),
        provenance: 'lowering-compat',
      }

    case 'call_macro':
      return {
        ...fromSlotEffect(getSlotEffect(instr), {
          confidence: 'conservative',
          barrier: true,
          opaqueStorageRead: true,
          opaqueStorageWrite: true,
          provenance: 'macro-helper',
        }),
        macroSubstitution: true,
      }

    case 'macro_line':
      return {
        reads: [],
        writes: [],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: true,
        opaqueScoreboardWrite: true,
        opaqueStorageRead: true,
        opaqueStorageWrite: true,
        macroSubstitution: true,
        rawText: true,
        barrier: true,
        provenance: 'macro-helper',
        confidence: 'opaque',
      }

    case 'raw':
      return {
        reads: [],
        writes: [],
        storageReads: [],
        storageWrites: [],
        opaqueScoreboardRead: true,
        opaqueScoreboardWrite: true,
        opaqueStorageRead: true,
        opaqueStorageWrite: true,
        macroSubstitution: false,
        rawText: true,
        barrier: true,
        provenance: 'raw-user-command',
        confidence: 'opaque',
      }

    default: {
      const _exhaustive: never = instr
      throw new Error(`Unsupported LIR instruction kind '${(_exhaustive as LIRInstr).kind}' in deriveBoundarySidecar`)
    }
  }
}
