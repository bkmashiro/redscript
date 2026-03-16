/**
 * Coroutine Transform — MIR module-level pass.
 *
 * Transforms functions annotated with @coroutine(batch=N, onDone=fn) into
 * tick-spread state machines. Each loop back-edge becomes a yield point,
 * and the function is split into continuation functions dispatched by a
 * @tick function via a pc (program counter) scoreboard slot.
 *
 * Algorithm:
 *   1. Compute dominator tree → find back edges (yield points)
 *   2. Backward liveness analysis at yield points
 *   3. Split CFG into continuations at yield points
 *   4. Promote live variables to persistent scoreboard slots
 *   5. Generate @tick dispatcher function
 *
 * Spec: docs/compiler-pipeline-redesign.md § "Coroutine Transform"
 */

import type {
  MIRFunction,
  MIRModule,
  MIRBlock,
  MIRInstr,
  Operand,
  Temp,
  BlockId,
} from '../mir/types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CoroutineInfo {
  fnName: string
  batch: number
  onDone?: string
}

export interface CoroutineResult {
  module: MIRModule
  /** Names of generated @tick dispatcher functions (caller must add to tick list). */
  generatedTickFunctions: string[]
}

/**
 * Apply the coroutine transform to all functions in `infos`.
 * Returns a new module with continuations + dispatchers injected,
 * and the original function replaced with initialization code.
 */
export function coroutineTransform(
  mod: MIRModule,
  infos: CoroutineInfo[],
): CoroutineResult {
  if (infos.length === 0) return { module: mod, generatedTickFunctions: [] }

  const infoMap = new Map(infos.map(i => [i.fnName, i]))
  const newFunctions: MIRFunction[] = []
  const tickFns: string[] = []

  for (const fn of mod.functions) {
    const info = infoMap.get(fn.name)
    if (!info) {
      newFunctions.push(fn)
      continue
    }

    const transformed = transformCoroutine(fn, info, mod.objective)
    newFunctions.push(transformed.initFn)
    newFunctions.push(...transformed.continuations)
    newFunctions.push(transformed.dispatcher)
    tickFns.push(transformed.dispatcher.name)
  }

  return {
    module: { ...mod, functions: newFunctions },
    generatedTickFunctions: tickFns,
  }
}

// ---------------------------------------------------------------------------
// Core transform
// ---------------------------------------------------------------------------

interface TransformResult {
  initFn: MIRFunction
  continuations: MIRFunction[]
  dispatcher: MIRFunction
}

function transformCoroutine(
  fn: MIRFunction,
  info: CoroutineInfo,
  objective: string,
): TransformResult {
  const prefix = `_coro_${fn.name}`
  const pcTemp = `${prefix}_pc`
  const batchCountTemp = `${prefix}_batch_count`

  // Step 1: Build dominator tree and find back edges
  const blockMap = new Map(fn.blocks.map(b => [b.id, b]))
  const doms = computeDominators(fn.blocks, fn.entry)
  const backEdges = findBackEdges(fn.blocks, doms)

  // If no back edges (no loops), the function doesn't need coroutine splitting.
  // Just wrap it as a single continuation.
  if (backEdges.length === 0) {
    return buildSingleContinuation(fn, info, prefix, pcTemp, objective)
  }

  // Step 2: Liveness analysis — find live variables at each yield point
  const liveAtYield = computeLivenessAtYieldPoints(fn.blocks, backEdges, fn.params)

  // Collect all live variables across all yield points (these need promotion)
  const allLiveVars = new Set<Temp>()
  for (const liveSet of liveAtYield.values()) {
    for (const v of liveSet) allLiveVars.add(v)
  }

  // Build promoted variable names: original temp → persistent slot name
  const promoted = new Map<Temp, Temp>()
  for (const v of allLiveVars) {
    promoted.set(v, `${prefix}_${v}`)
  }

  // Step 3: Split CFG into continuations
  // Each continuation runs from a loop header to the next yield point.
  // For simplicity, we split at loop headers (targets of back edges).
  const loopHeaders = new Set(backEdges.map(e => e.target))

  // Partition blocks into continuation groups.
  // Continuation 1: entry block → until first yield
  // Continuation N: from loop header → until next yield or exit
  const continuations = partitionIntoContinuations(fn, loopHeaders, backEdges)

  // Step 4: Build continuation functions with batch counting and variable promotion
  const contFunctions: MIRFunction[] = []

  for (let i = 0; i < continuations.length; i++) {
    const contId = i + 1
    const cont = continuations[i]
    const contFn = buildContinuationFunction(
      `${prefix}_cont_${contId}`,
      cont,
      info.batch,
      contId,
      continuations.length,
      promoted,
      pcTemp,
      batchCountTemp,
      objective,
      info.onDone,
      fn.name,
    )
    contFunctions.push(contFn)
  }

  // Step 5: Build the init function (replaces original)
  const initFn = buildInitFunction(fn, promoted, pcTemp, prefix, objective)

  // Step 6: Build the @tick dispatcher
  const dispatcher = buildDispatcher(
    `${prefix}_tick`,
    contFunctions,
    pcTemp,
    objective,
    fn.name,
  )

  return { initFn, continuations: contFunctions, dispatcher }
}

// ---------------------------------------------------------------------------
// Step 1: Dominator tree & back-edge detection
// ---------------------------------------------------------------------------

function computeDominators(
  blocks: MIRBlock[],
  entry: BlockId,
): Map<BlockId, BlockId> {
  // Simple iterative dominator algorithm (Cooper, Harvey, Kennedy)
  const blockIds = blocks.map(b => b.id)
  const idom = new Map<BlockId, BlockId>()

  // RPO ordering
  const rpo = reversePostorder(blocks, entry)
  const rpoIndex = new Map(rpo.map((id, i) => [id, i]))

  // Initialize: entry dominates itself
  idom.set(entry, entry)

  let changed = true
  while (changed) {
    changed = false
    for (const bId of rpo) {
      if (bId === entry) continue
      const block = blocks.find(b => b.id === bId)
      if (!block) continue

      // Find first processed predecessor
      const processedPreds = block.preds.filter(p => idom.has(p))
      if (processedPreds.length === 0) continue

      let newIdom = processedPreds[0]
      for (let i = 1; i < processedPreds.length; i++) {
        newIdom = intersect(newIdom, processedPreds[i], idom, rpoIndex)
      }

      if (idom.get(bId) !== newIdom) {
        idom.set(bId, newIdom)
        changed = true
      }
    }
  }

  return idom
}

function intersect(
  a: BlockId,
  b: BlockId,
  idom: Map<BlockId, BlockId>,
  rpoIndex: Map<BlockId, number>,
): BlockId {
  let f1 = a
  let f2 = b
  while (f1 !== f2) {
    while ((rpoIndex.get(f1) ?? 0) > (rpoIndex.get(f2) ?? 0)) {
      f1 = idom.get(f1) ?? f1
    }
    while ((rpoIndex.get(f2) ?? 0) > (rpoIndex.get(f1) ?? 0)) {
      f2 = idom.get(f2) ?? f2
    }
  }
  return f1
}

function reversePostorder(blocks: MIRBlock[], entry: BlockId): BlockId[] {
  const visited = new Set<BlockId>()
  const order: BlockId[] = []
  const blockMap = new Map(blocks.map(b => [b.id, b]))

  function dfs(id: BlockId) {
    if (visited.has(id)) return
    visited.add(id)
    const block = blockMap.get(id)
    if (!block) return
    for (const succ of getSuccessors(block.term)) {
      dfs(succ)
    }
    order.push(id)
  }

  dfs(entry)
  return order.reverse()
}

interface BackEdge {
  source: BlockId
  target: BlockId  // the loop header (dominator)
}

function findBackEdges(
  blocks: MIRBlock[],
  doms: Map<BlockId, BlockId>,
): BackEdge[] {
  const edges: BackEdge[] = []
  for (const block of blocks) {
    for (const succ of getSuccessors(block.term)) {
      if (dominates(succ, block.id, doms)) {
        edges.push({ source: block.id, target: succ })
      }
    }
  }
  return edges
}

function dominates(a: BlockId, b: BlockId, doms: Map<BlockId, BlockId>): boolean {
  let cur = b
  while (cur !== a) {
    const idom = doms.get(cur)
    if (!idom || idom === cur) return false
    cur = idom
  }
  return true
}

// ---------------------------------------------------------------------------
// Step 2: Liveness analysis
// ---------------------------------------------------------------------------

function computeLivenessAtYieldPoints(
  blocks: MIRBlock[],
  backEdges: BackEdge[],
  params: { name: Temp }[],
): Map<BlockId, Set<Temp>> {
  // Standard backward liveness: live_in[B] = use[B] ∪ (live_out[B] \ def[B])
  const blockMap = new Map(blocks.map(b => [b.id, b]))

  // Compute use/def for each block
  const useSets = new Map<BlockId, Set<Temp>>()
  const defSets = new Map<BlockId, Set<Temp>>()

  for (const block of blocks) {
    const use = new Set<Temp>()
    const def = new Set<Temp>()

    for (const instr of [...block.instrs, block.term]) {
      // Uses before defs
      for (const t of getUsedTemps(instr)) {
        if (!def.has(t)) use.add(t)
      }
      const dst = getDst(instr)
      if (dst) def.add(dst)
    }

    useSets.set(block.id, use)
    defSets.set(block.id, def)
  }

  // Iterative liveness
  const liveIn = new Map<BlockId, Set<Temp>>()
  const liveOut = new Map<BlockId, Set<Temp>>()
  for (const block of blocks) {
    liveIn.set(block.id, new Set())
    liveOut.set(block.id, new Set())
  }

  let changed = true
  while (changed) {
    changed = false
    for (const block of [...blocks].reverse()) {
      // live_out = ∪ live_in[succ]
      const newOut = new Set<Temp>()
      for (const succ of getSuccessors(block.term)) {
        const succIn = liveIn.get(succ)
        if (succIn) for (const t of succIn) newOut.add(t)
      }

      // live_in = use ∪ (live_out \ def)
      const newIn = new Set(useSets.get(block.id) ?? [])
      const def = defSets.get(block.id) ?? new Set()
      for (const t of newOut) {
        if (!def.has(t)) newIn.add(t)
      }

      const prevIn = liveIn.get(block.id)!
      const prevOut = liveOut.get(block.id)!
      if (!setsEqual(newIn, prevIn) || !setsEqual(newOut, prevOut)) {
        liveIn.set(block.id, newIn)
        liveOut.set(block.id, newOut)
        changed = true
      }
    }
  }

  // At each yield point (back edge source → target), the live vars
  // are the live-out of the source block
  const result = new Map<BlockId, Set<Temp>>()
  for (const edge of backEdges) {
    const lo = liveOut.get(edge.source) ?? new Set()
    result.set(edge.source, lo)
  }

  return result
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

// ---------------------------------------------------------------------------
// Step 3: Partition into continuations
// ---------------------------------------------------------------------------

interface Continuation {
  blocks: MIRBlock[]
  isLoopBody: boolean
  loopHeaderId?: BlockId
  /** Block IDs that exit the loop (branch to blocks outside this continuation) */
  exitBlocks: Set<BlockId>
}

function partitionIntoContinuations(
  fn: MIRFunction,
  loopHeaders: Set<BlockId>,
  backEdges: BackEdge[],
): Continuation[] {
  const blockMap = new Map(fn.blocks.map(b => [b.id, b]))
  const backEdgeTargets = new Set(backEdges.map(e => e.target))
  const backEdgeSources = new Set(backEdges.map(e => e.source))

  // Find which blocks belong to which loop (blocks between header and back edge)
  // We use a simple approach: BFS from entry, split at loop headers
  const loopBlocks = new Map<BlockId, Set<BlockId>>()  // header → blocks in loop

  for (const header of loopHeaders) {
    const inLoop = new Set<BlockId>()
    // Find all blocks that can reach the back edge source without leaving the loop
    // i.e., blocks dominated by the header that can reach a back edge source
    const sources = backEdges.filter(e => e.target === header).map(e => e.source)

    // Backward BFS from back-edge sources to header
    const queue = [...sources]
    for (const s of sources) inLoop.add(s)
    inLoop.add(header)
    while (queue.length > 0) {
      const bid = queue.shift()!
      const block = blockMap.get(bid)
      if (!block) continue
      for (const pred of block.preds) {
        if (!inLoop.has(pred) && pred !== header) {
          inLoop.add(pred)
          queue.push(pred)
        }
      }
    }
    inLoop.add(header)
    loopBlocks.set(header, inLoop)
  }

  // Build continuations:
  // Continuation 1 = loop body (the main one — header + loop blocks)
  // Continuation 2 = post-loop (blocks after loop exit)
  const conts: Continuation[] = []

  // For each loop, create a loop-body continuation
  for (const header of loopHeaders) {
    const lb = loopBlocks.get(header)!
    const loopBlocksList = fn.blocks.filter(b => lb.has(b.id))
    const exitBlocks = new Set<BlockId>()

    // Find exit blocks: blocks in the loop that branch to blocks outside the loop
    for (const block of loopBlocksList) {
      for (const succ of getSuccessors(block.term)) {
        if (!lb.has(succ)) exitBlocks.add(block.id)
      }
    }

    conts.push({
      blocks: loopBlocksList,
      isLoopBody: true,
      loopHeaderId: header,
      exitBlocks,
    })
  }

  // Post-loop continuation: all blocks not in any loop
  const allLoopBlockIds = new Set<BlockId>()
  for (const lb of loopBlocks.values()) {
    for (const id of lb) allLoopBlockIds.add(id)
  }
  // Also exclude the entry block if it's not in a loop (it becomes the init fn)
  const postLoopBlocks = fn.blocks.filter(b =>
    !allLoopBlockIds.has(b.id) && b.id !== fn.entry
  )
  if (postLoopBlocks.length > 0) {
    conts.push({
      blocks: postLoopBlocks,
      isLoopBody: false,
      exitBlocks: new Set(),
    })
  }

  return conts
}

// ---------------------------------------------------------------------------
// Step 4: Build continuation functions
// ---------------------------------------------------------------------------

function buildContinuationFunction(
  name: string,
  cont: Continuation,
  batch: number,
  contId: number,
  totalConts: number,
  promoted: Map<Temp, Temp>,
  pcTemp: Temp,
  batchCountTemp: Temp,
  objective: string,
  onDone: string | undefined,
  originalFnName: string,
): MIRFunction {
  if (cont.isLoopBody) {
    return buildLoopContinuation(
      name, cont, batch, contId, totalConts,
      promoted, pcTemp, batchCountTemp, objective, onDone,
    )
  } else {
    return buildPostLoopContinuation(
      name, cont, contId, promoted, pcTemp, objective, onDone,
    )
  }
}

function buildLoopContinuation(
  name: string,
  cont: Continuation,
  batch: number,
  contId: number,
  totalConts: number,
  promoted: Map<Temp, Temp>,
  pcTemp: Temp,
  batchCountTemp: Temp,
  objective: string,
  onDone: string | undefined,
): MIRFunction {
  // Build a new function that:
  // 1. Initializes batch_count = 0
  // 2. Runs the loop body up to `batch` iterations
  // 3. At back edge: if batch_count >= batch, yield (return)
  // 4. On loop exit: return (dispatcher handles next continuation via pc)
  //
  // IMPORTANT: The LIR lowerer handles multi-pred blocks via `jump` terminators
  // correctly (emits a function call) but `branch → multi-pred` can cause infinite
  // recursion. So we ensure back edges use `jump` via a trampoline block, and
  // batch-done checks use `branch → yield_block | continue_block` where both
  // targets have single predecessors.

  const blocks: MIRBlock[] = []
  const batchCmpTemp = `${batchCountTemp}_cmp`

  // Entry: set batch_count = 0, then jump to loop header
  const entryBlock: MIRBlock = {
    id: 'entry',
    instrs: [
      { kind: 'const', dst: batchCountTemp, value: 0 },
    ],
    term: { kind: 'jump', target: cont.loopHeaderId ?? cont.blocks[0].id },
    preds: [],
  }
  blocks.push(entryBlock)

  // Clone and rewrite the loop blocks with promoted variable names
  for (const block of cont.blocks) {
    const rewritten = rewriteBlock(block, promoted)
    const succs = getSuccessors(rewritten.term)
    const isBackEdgeBlock = cont.loopHeaderId && succs.includes(cont.loopHeaderId)

    if (isBackEdgeBlock) {
      // This block has a back edge to the loop header.
      // Append batch counting to the body, then branch:
      //   batch_done → yield (return), !batch_done → continue (jump → header)
      //
      // body_block → branch(batch_done) → yield_block | continue_block
      // continue_block → jump → loop_header  (uses 'jump', safe for multi-pred)
      // yield_block → return

      const continueBlockId = `${block.id}_continue`
      const yieldBlockId = `${block.id}_yield`

      // Append batch check instructions to the body block
      const bodyInstrs = [
        ...rewritten.instrs,
        { kind: 'add' as const, dst: batchCountTemp, a: { kind: 'temp' as const, name: batchCountTemp }, b: { kind: 'const' as const, value: 1 } },
        { kind: 'cmp' as const, dst: batchCmpTemp, op: 'ge' as const, a: { kind: 'temp' as const, name: batchCountTemp }, b: { kind: 'const' as const, value: batch } },
      ]

      blocks.push({
        ...rewritten,
        instrs: bodyInstrs,
        // Rewrite terminator: instead of jumping to header, branch on batch check
        term: {
          kind: 'branch',
          cond: { kind: 'temp', name: batchCmpTemp },
          then: yieldBlockId,
          else: continueBlockId,
        },
      })

      // Continue block: jump back to loop header (uses jump → multi-pred = call)
      blocks.push({
        id: continueBlockId,
        instrs: [],
        term: { kind: 'jump', target: cont.loopHeaderId! },
        preds: [block.id],
      })

      // Yield block: return (resume next tick)
      blocks.push({
        id: yieldBlockId,
        instrs: [],
        term: { kind: 'return', value: null },
        preds: [block.id],
      })
    } else {
      // Check if this block exits the loop
      const exitSuccs = succs.filter(s => !cont.blocks.some(b => b.id === s))
      if (exitSuccs.length > 0) {
        // Redirect exit branch to an exit block that returns
        const exitBlockId = `${block.id}_exit`
        const exitBlock: MIRBlock = {
          id: exitBlockId,
          instrs: [],
          term: { kind: 'return', value: null },
          preds: [block.id],
        }

        if (rewritten.term.kind === 'branch') {
          const branchTerm = rewritten.term
          const thenInLoop = cont.blocks.some(b => b.id === branchTerm.then)
          const elseInLoop = cont.blocks.some(b => b.id === branchTerm.else)

          if (!thenInLoop && elseInLoop) {
            blocks.push({
              ...rewritten,
              term: { ...branchTerm, then: exitBlockId },
            })
          } else if (thenInLoop && !elseInLoop) {
            blocks.push({
              ...rewritten,
              term: { ...branchTerm, else: exitBlockId },
            })
          } else {
            blocks.push(rewritten)
          }
        } else {
          blocks.push(rewritten)
        }
        blocks.push(exitBlock)
      } else {
        blocks.push(rewritten)
      }
    }
  }

  // Deduplicate blocks by ID
  const seenIds = new Set<BlockId>()
  const dedupBlocks: MIRBlock[] = []
  for (const b of blocks) {
    if (!seenIds.has(b.id)) {
      seenIds.add(b.id)
      dedupBlocks.push(b)
    }
  }

  return {
    name,
    params: [],
    blocks: dedupBlocks,
    entry: 'entry',
    isMacro: false,
  }
}

function buildPostLoopContinuation(
  name: string,
  cont: Continuation,
  contId: number,
  promoted: Map<Temp, Temp>,
  pcTemp: Temp,
  objective: string,
  onDone: string | undefined,
): MIRFunction {
  const blocks: MIRBlock[] = []

  // Rewrite blocks with promoted variables
  for (const block of cont.blocks) {
    blocks.push(rewriteBlock(block, promoted))
  }

  // The entry is the first block in the continuation
  const entry = cont.blocks[0]?.id ?? 'entry'

  // Add onDone call if this is the last continuation
  if (onDone) {
    // Find blocks with return terminators and add onDone call before them
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].term.kind === 'return') {
        blocks[i] = {
          ...blocks[i],
          instrs: [
            ...blocks[i].instrs,
            { kind: 'call', dst: null, fn: onDone, args: [] },
          ],
        }
      }
    }
  }

  return {
    name,
    params: [],
    blocks,
    entry,
    isMacro: false,
  }
}

// ---------------------------------------------------------------------------
// Step 5: Build init function (replaces original)
// ---------------------------------------------------------------------------

function buildInitFunction(
  originalFn: MIRFunction,
  promoted: Map<Temp, Temp>,
  pcTemp: Temp,
  prefix: string,
  objective: string,
): MIRFunction {
  // The init function:
  // 1. Sets pc = 1 (start from continuation 1)
  // 2. Initializes promoted variables from the entry block's pre-loop code

  const instrs: MIRInstr[] = []

  // Set pc = 1
  instrs.push({ kind: 'const', dst: pcTemp, value: 1 })

  // Initialize promoted variables from entry block instructions
  // Walk the entry block and copy any const/copy instructions for promoted vars
  const entryBlock = originalFn.blocks.find(b => b.id === originalFn.entry)
  if (entryBlock) {
    for (const instr of entryBlock.instrs) {
      const dst = getDst(instr)
      if (dst && promoted.has(dst)) {
        // Rewrite to use promoted name
        instrs.push(rewriteInstr(instr, promoted))
      }
    }
  }

  const block: MIRBlock = {
    id: 'entry',
    instrs,
    term: { kind: 'return', value: null },
    preds: [],
  }

  return {
    name: originalFn.name,
    params: originalFn.params,
    blocks: [block],
    entry: 'entry',
    isMacro: originalFn.isMacro,
  }
}

// ---------------------------------------------------------------------------
// Step 6: Build dispatcher
// ---------------------------------------------------------------------------

function buildDispatcher(
  name: string,
  continuations: MIRFunction[],
  pcTemp: Temp,
  objective: string,
  originalFnName: string,
): MIRFunction {
  // Generates a dispatcher function that checks pc and calls the right continuation.
  // For each continuation i (1-indexed):
  //   execute if score $coro_pc __ns matches i run function ns:_coro_cont_i
  //
  // We model this as a chain of branches in MIR.

  const blocks: MIRBlock[] = []

  if (continuations.length === 0) {
    // No continuations — just return
    blocks.push({
      id: 'entry',
      instrs: [],
      term: { kind: 'return', value: null },
      preds: [],
    })
  } else {
    // Build a chain: check pc==1 → call cont_1, else check pc==2 → call cont_2, ...
    for (let i = 0; i < continuations.length; i++) {
      const contFn = continuations[i]
      const blockId = i === 0 ? 'entry' : `check_${i + 1}`
      const cmpTemp = `${name}_cmp_${i + 1}`
      const nextBlock = i < continuations.length - 1 ? `check_${i + 2}` : 'done'
      const callBlock = `call_${i + 1}`

      blocks.push({
        id: blockId,
        instrs: [
          { kind: 'cmp', dst: cmpTemp, op: 'eq', a: { kind: 'temp', name: pcTemp }, b: { kind: 'const', value: i + 1 } },
        ],
        term: { kind: 'branch', cond: { kind: 'temp', name: cmpTemp }, then: callBlock, else: nextBlock },
        preds: i === 0 ? [] : [`check_${i}`],
      })

      blocks.push({
        id: callBlock,
        instrs: [
          { kind: 'call', dst: null, fn: contFn.name, args: [] },
        ],
        term: { kind: 'return', value: null },
        preds: [blockId],
      })
    }

    // Done block (pc doesn't match any continuation — coroutine finished)
    blocks.push({
      id: 'done',
      instrs: [],
      term: { kind: 'return', value: null },
      preds: [continuations.length === 1 ? 'entry' : `check_${continuations.length}`],
    })
  }

  return {
    name,
    params: [],
    blocks,
    entry: 'entry',
    isMacro: false,
  }
}

// ---------------------------------------------------------------------------
// Single-continuation fallback (no loops)
// ---------------------------------------------------------------------------

function buildSingleContinuation(
  fn: MIRFunction,
  info: CoroutineInfo,
  prefix: string,
  pcTemp: Temp,
  objective: string,
): TransformResult {
  // If there are no loops, the entire function body runs in one tick.
  // We still wrap it in the coroutine pattern for consistency (init → cont_1 → done).

  const contName = `${prefix}_cont_1`

  // Continuation = entire original function body, plus set pc=-1 at the end
  const contBlocks = fn.blocks.map(block => {
    if (block.term.kind === 'return') {
      const instrs = [...block.instrs]
      if (info.onDone) {
        instrs.push({ kind: 'call', dst: null, fn: info.onDone, args: [] })
      }
      return { ...block, instrs }
    }
    return block
  })

  const contFn: MIRFunction = {
    name: contName,
    params: [],
    blocks: contBlocks,
    entry: fn.entry,
    isMacro: false,
  }

  // Init: set pc = 1
  const initBlock: MIRBlock = {
    id: 'entry',
    instrs: [
      { kind: 'const', dst: pcTemp, value: 1 },
    ],
    term: { kind: 'return', value: null },
    preds: [],
  }
  const initFn: MIRFunction = {
    name: fn.name,
    params: fn.params,
    blocks: [initBlock],
    entry: 'entry',
    isMacro: fn.isMacro,
  }

  const dispatcher = buildDispatcher(
    `${prefix}_tick`,
    [contFn],
    pcTemp,
    objective,
    fn.name,
  )

  return { initFn, continuations: [contFn], dispatcher }
}

// ---------------------------------------------------------------------------
// Helpers: instruction rewriting
// ---------------------------------------------------------------------------

function rewriteBlock(block: MIRBlock, promoted: Map<Temp, Temp>): MIRBlock {
  return {
    ...block,
    instrs: block.instrs.map(i => rewriteInstr(i, promoted)),
    term: rewriteInstr(block.term, promoted) as MIRInstr,
  }
}

function rewriteInstr(instr: MIRInstr, promoted: Map<Temp, Temp>): MIRInstr {
  // Deep-rewrite all temp references through the promoted map
  const rTemp = (t: Temp): Temp => promoted.get(t) ?? t
  const rOp = (op: Operand): Operand =>
    op.kind === 'temp' ? { kind: 'temp', name: rTemp(op.name) } : op

  switch (instr.kind) {
    case 'const':
      return { ...instr, dst: rTemp(instr.dst) }
    case 'copy':
      return { ...instr, dst: rTemp(instr.dst), src: rOp(instr.src) }
    case 'add': case 'sub': case 'mul': case 'div': case 'mod':
      return { ...instr, dst: rTemp(instr.dst), a: rOp(instr.a), b: rOp(instr.b) }
    case 'neg':
      return { ...instr, dst: rTemp(instr.dst), src: rOp(instr.src) }
    case 'cmp':
      return { ...instr, dst: rTemp(instr.dst), a: rOp(instr.a), b: rOp(instr.b) }
    case 'and': case 'or':
      return { ...instr, dst: rTemp(instr.dst), a: rOp(instr.a), b: rOp(instr.b) }
    case 'not':
      return { ...instr, dst: rTemp(instr.dst), src: rOp(instr.src) }
    case 'nbt_read':
      return { ...instr, dst: rTemp(instr.dst) }
    case 'nbt_write':
      return { ...instr, src: rOp(instr.src) }
    case 'call':
      return { ...instr, dst: instr.dst ? rTemp(instr.dst) : null, args: instr.args.map(rOp) }
    case 'call_macro':
      return { ...instr, dst: instr.dst ? rTemp(instr.dst) : null, args: instr.args.map(a => ({ ...a, value: rOp(a.value) })) }
    case 'call_context':
      return instr
    case 'branch':
      return { ...instr, cond: rOp(instr.cond) }
    case 'return':
      return { ...instr, value: instr.value ? rOp(instr.value) : null }
    case 'jump':
      return instr
    default:
      return instr
  }
}

function rewriteTerminator(term: MIRInstr, from: BlockId, to: BlockId): MIRInstr {
  switch (term.kind) {
    case 'jump':
      return term.target === from ? { ...term, target: to } : term
    case 'branch':
      return {
        ...term,
        then: term.then === from ? to : term.then,
        else: term.else === from ? to : term.else,
      }
    default:
      return term
  }
}

// ---------------------------------------------------------------------------
// Helpers: MIR instruction queries
// ---------------------------------------------------------------------------

function getSuccessors(term: MIRInstr): BlockId[] {
  switch (term.kind) {
    case 'jump': return [term.target]
    case 'branch': return [term.then, term.else]
    default: return []
  }
}

function getDst(instr: MIRInstr): Temp | null {
  switch (instr.kind) {
    case 'const': case 'copy':
    case 'add': case 'sub': case 'mul': case 'div': case 'mod':
    case 'neg': case 'cmp':
    case 'and': case 'or': case 'not':
    case 'nbt_read':
      return instr.dst
    case 'call': case 'call_macro':
      return instr.dst
    default:
      return null
  }
}

function getUsedTemps(instr: MIRInstr): Temp[] {
  const temps: Temp[] = []
  const addOp = (op: Operand) => { if (op.kind === 'temp') temps.push(op.name) }

  switch (instr.kind) {
    case 'copy': case 'neg': case 'not':
      addOp(instr.src); break
    case 'add': case 'sub': case 'mul': case 'div': case 'mod':
    case 'cmp': case 'and': case 'or':
      addOp(instr.a); addOp(instr.b); break
    case 'nbt_write':
      addOp(instr.src); break
    case 'call':
      instr.args.forEach(addOp); break
    case 'call_macro':
      instr.args.forEach(a => addOp(a.value)); break
    case 'branch':
      addOp(instr.cond); break
    case 'return':
      if (instr.value) addOp(instr.value); break
  }
  return temps
}
