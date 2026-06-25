import type { Slot } from '../../../lir/types'
import { isProtectedSlot, sameSlot, slotKey } from '../../lir/analysis'

export interface VIRSlotCopy {
  dst: Slot
  src: Slot
}

export interface ParallelCopyInstruction {
  kind: 'score_copy'
  dst: Slot
  src: Slot
}

export interface ParallelCopySuccess {
  kind: 'ok'
  moves: VIRSlotCopy[]
  movesCount: number
  instructions: ParallelCopyInstruction[]
}

export interface ParallelCopyUnsupported {
  kind: 'unsupported'
  reason: string
}

export type ParallelCopyResult = ParallelCopySuccess | ParallelCopyUnsupported

interface ResolveParallelCopiesInput {
  copies: ReadonlyArray<VIRSlotCopy>
  scratch?: Slot
}

type CopyGraph = Map<string, VIRSlotCopy>

function copyKey(slot: Slot): string {
  return slotKey(slot)
}

function duplicateCopyForDestination(copies: ReadonlyArray<VIRSlotCopy>): CopyGraph | ParallelCopyUnsupported {
  const graph = new Map<string, VIRSlotCopy>()

  for (const copy of copies) {
    if (sameSlot(copy.dst, copy.src)) continue

    const destination = copyKey(copy.dst)
    const existing = graph.get(destination)
    if (!existing) {
      graph.set(destination, copy)
      continue
    }

    if (!sameSlot(existing.src, copy.src)) {
      return {
        kind: 'unsupported',
        reason: `parallel copy conflict for destination ${copy.dst.player} ${copy.dst.obj}`,
      }
    }
  }

  return graph
}

function sourceKey(copy: VIRSlotCopy): string {
  return copyKey(copy.src)
}

function destinationFor(graph: CopyGraph, destination: string): VIRSlotCopy {
  const copy = graph.get(destination)
  if (!copy) {
    throw new Error(`missing copy for destination ${destination}`)
  }
  return copy
}

function isReady(graph: CopyGraph, destination: string): boolean {
  return !graph.has(sourceKey(destinationFor(graph, destination)))
}

function collectCycle(graph: CopyGraph, start: string, limit: number): { kind: 'ok'; cycle: string[] } | ParallelCopyUnsupported {
  const cycle: string[] = []
  let cursor = start

  for (let index = 0; index <= limit; index += 1) {
    if (cycle.includes(cursor)) {
      if (cursor !== start || cycle.length < 2) {
        return {
          kind: 'unsupported',
          reason: `parallel copy contains non-simple cycle around ${start}`,
        }
      }
      return { kind: 'ok', cycle }
    }

    if (!graph.has(cursor)) {
      return {
        kind: 'unsupported',
        reason: `parallel copy has missing cycle edge for ${cursor}`,
      }
    }

    cycle.push(cursor)
    cursor = sourceKey(destinationFor(graph, cursor))
  }

  return {
    kind: 'unsupported',
    reason: `parallel copy cycle search exceeded limit for ${start}`,
  }
}

function resolveAcyclic(graph: CopyGraph, moves: VIRSlotCopy[]): void {
  let progress = true

  while (progress) {
    progress = false

    for (const destination of [...graph.keys()]) {
      if (!graph.has(destination) || !isReady(graph, destination)) continue
      const copy = destinationFor(graph, destination)
      graph.delete(destination)
      moves.push({ dst: copy.dst, src: copy.src })
      progress = true
    }
  }
}

function resolveCycle(graph: CopyGraph, cycle: string[], scratch: Slot): { kind: 'ok'; moves: VIRSlotCopy[] } | ParallelCopyUnsupported {
  if (cycle.length < 2) {
    return {
      kind: 'unsupported',
      reason: 'parallel copy cycle must contain at least 2 elements',
    }
  }

  const keyToSlot = new Map<string, Slot>()
  for (const copy of graph.values()) {
    keyToSlot.set(copyKey(copy.dst), copy.dst)
    keyToSlot.set(copyKey(copy.src), copy.src)
  }

  const scratchKey = copyKey(scratch)
  if (keyToSlot.has(scratchKey)) {
    return {
      kind: 'unsupported',
      reason: 'parallel copy scratch slot aliases cycle participant',
    }
  }

  const moves: VIRSlotCopy[] = []

  const firstDestinationSlot = keyToSlot.get(cycle[0])
  if (!firstDestinationSlot) {
    return {
      kind: 'unsupported',
      reason: `parallel copy missing destination slot for ${cycle[0]}`,
    }
  }

  moves.push({ dst: scratch, src: firstDestinationSlot })

  for (let index = 0; index < cycle.length - 1; index += 1) {
    const destinationSlot = keyToSlot.get(cycle[index])
    const sourceSlot = keyToSlot.get(sourceKey(destinationFor(graph, cycle[index])))
    if (!destinationSlot || !sourceSlot) {
      return {
        kind: 'unsupported',
        reason: `parallel copy missing slot mapping for ${cycle[index]}`,
      }
    }
    moves.push({ dst: destinationSlot, src: sourceSlot })
  }

  const finalDestinationSlot = keyToSlot.get(cycle[cycle.length - 1])
  if (!finalDestinationSlot) {
    return {
      kind: 'unsupported',
      reason: `parallel copy missing final destination slot for ${cycle[cycle.length - 1]}`,
    }
  }

  moves.push({ dst: finalDestinationSlot, src: scratch })

  return { kind: 'ok', moves }
}

function collectSlotMoves(graphInput: CopyGraph, scratch?: Slot): ParallelCopyResult {
  const graph = new Map<string, VIRSlotCopy>(graphInput)
  if (graph.size === 0) {
    return {
      kind: 'ok',
      moves: [],
      movesCount: 0,
      instructions: [],
    }
  }

  if (scratch && isProtectedSlot(scratch)) {
    return {
      kind: 'unsupported',
      reason: `parallel copy scratch ${scratch.player} ${scratch.obj} is protected`,
    }
  }

  const moves: VIRSlotCopy[] = []
  const nodeLimit = graph.size + 1

  while (graph.size > 0) {
    const previousSize = graph.size
    resolveAcyclic(graph, moves)

    if (graph.size === previousSize) {
      const start = [...graph.keys()][0]
      if (!start) {
        return {
          kind: 'unsupported',
          reason: 'parallel copy reached inconsistent cycle state',
        }
      }

      const cycleResult = collectCycle(graph, start, nodeLimit)
      if (cycleResult.kind === 'unsupported') {
        return cycleResult
      }

      if (!scratch) {
        return {
          kind: 'unsupported',
          reason: 'parallel copy cycle requires scratch slot',
        }
      }

      const cycle = cycleResult.cycle
      const cycleMoves = resolveCycle(graph, cycle, scratch)
      if (cycleMoves.kind === 'unsupported') {
        return cycleMoves
      }

      for (const destination of cycle) {
        graph.delete(destination)
      }
      moves.push(...cycleMoves.moves)
    }
  }

  return {
    kind: 'ok',
    moves,
    movesCount: moves.length,
    instructions: moves.map(move => ({
      kind: 'score_copy',
      dst: move.dst,
      src: move.src,
    })),
  }
}

export function resolveParallelCopies(input: ResolveParallelCopiesInput): ParallelCopyResult {
  const graph = duplicateCopyForDestination(input.copies)
  if ('kind' in graph) {
    return graph
  }

  return collectSlotMoves(graph, input.scratch)
}

export function emitParallelCopyInstructions(input: ResolveParallelCopiesInput): ParallelCopyResult {
  return resolveParallelCopies(input)
}
