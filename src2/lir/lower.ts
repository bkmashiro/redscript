/**
 * MIR → LIR Lowering — Stage 5 of the RedScript compiler pipeline.
 *
 * Converts 3-address MIR (CFG with basic blocks) to 2-address LIR
 * (flat instruction lists with MC scoreboard semantics).
 *
 * Key transformations:
 * - Each MIR Temp → a Slot (player = $tempname, obj = module.objective)
 * - 3-address arithmetic → score_copy dst←a, then score_op dst←b
 * - CFG control flow → call_if_matches / call_unless_matches to extracted functions
 * - MIR calls → parameter slot setup + call instruction
 */

import type {
  MIRModule, MIRFunction, MIRBlock, MIRInstr, Operand, Temp, BlockId,
} from '../mir/types'
import type {
  LIRModule, LIRFunction, LIRInstr, Slot,
} from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function lowerToLIR(mir: MIRModule): LIRModule {
  const ctx = new LoweringContext(mir.namespace, mir.objective)
  for (const fn of mir.functions) {
    lowerFunction(fn, ctx)
  }
  return {
    functions: ctx.functions,
    namespace: mir.namespace,
    objective: mir.objective,
  }
}

// ---------------------------------------------------------------------------
// Lowering context
// ---------------------------------------------------------------------------

class LoweringContext {
  readonly functions: LIRFunction[] = []
  readonly namespace: string
  readonly objective: string
  /** Track which blocks have multiple predecessors (need their own function) */
  private multiPredBlocks = new Set<BlockId>()
  /** Map block id → generated LIR function name for multi-pred blocks */
  private blockFnNames = new Map<BlockId, string>()
  /** Current MIR function being lowered */
  private currentMIRFn: MIRFunction | null = null
  /** Block map for quick lookup */
  private blockMap = new Map<BlockId, MIRBlock>()

  constructor(namespace: string, objective: string) {
    this.namespace = namespace
    this.objective = objective
  }

  slot(temp: Temp): Slot {
    // Prefix temp names with function name to avoid caller/callee collision
    const fn = this.currentMIRFn
    const prefix = fn ? fn.name : ''
    return { player: `$${prefix}_${temp}`, obj: this.objective }
  }

  qualifiedName(fnName: string): string {
    return `${this.namespace}:${fnName}`
  }

  addFunction(fn: LIRFunction): void {
    this.functions.push(fn)
  }

  analyzeBlocks(fn: MIRFunction): void {
    this.currentMIRFn = fn
    this.multiPredBlocks.clear()
    this.blockFnNames.clear()
    this.blockMap.clear()

    for (const block of fn.blocks) {
      this.blockMap.set(block.id, block)
    }

    // Count predecessors for each block
    const predCount = new Map<BlockId, number>()
    for (const block of fn.blocks) {
      const targets = getTermTargets(block.term)
      for (const target of targets) {
        predCount.set(target, (predCount.get(target) || 0) + 1)
      }
    }

    // Blocks with >1 predecessors or that are branch targets need their own function
    for (const [blockId, count] of predCount) {
      if (count > 1 && blockId !== fn.entry) {
        this.multiPredBlocks.add(blockId)
        this.blockFnNames.set(blockId, `${fn.name}__${blockId}`)
      }
    }
  }

  isMultiPred(blockId: BlockId): boolean {
    return this.multiPredBlocks.has(blockId)
  }

  getBlockFnName(blockId: BlockId): string {
    const name = this.blockFnNames.get(blockId)
    if (name) return name
    // Generate one on demand
    const generated = `${this.currentMIRFn!.name}__${blockId}`
    this.blockFnNames.set(blockId, generated)
    return generated
  }

  getBlock(id: BlockId): MIRBlock | undefined {
    return this.blockMap.get(id)
  }
}

// ---------------------------------------------------------------------------
// Function lowering
// ---------------------------------------------------------------------------

function lowerFunction(fn: MIRFunction, ctx: LoweringContext): void {
  ctx.analyzeBlocks(fn)

  // Lower the entry block as the main function body
  const instrs: LIRInstr[] = []
  const visited = new Set<BlockId>()

  // Copy parameter slots ($p0, $p1, ...) into the callee's temp slots
  for (let i = 0; i < fn.params.length; i++) {
    const paramSlot: Slot = { player: `$p${i}`, obj: ctx.objective }
    const tempSlot = ctx.slot(fn.params[i].name)
    instrs.push({ kind: 'score_copy', dst: tempSlot, src: paramSlot })
  }

  lowerBlock(fn.entry, fn, ctx, instrs, visited)

  ctx.addFunction({
    name: fn.name,
    instructions: instrs,
    isMacro: fn.isMacro,
    macroParams: fn.params.filter(p => p.isMacroParam).map(p => p.name),
  })

  // Emit separate functions for multi-pred blocks
  for (const blockId of ctx['multiPredBlocks']) {
    if (!visited.has(blockId)) {
      const blockInstrs: LIRInstr[] = []
      const blockVisited = new Set<BlockId>()
      lowerBlock(blockId, fn, ctx, blockInstrs, blockVisited)
      ctx.addFunction({
        name: ctx.getBlockFnName(blockId),
        instructions: blockInstrs,
        isMacro: false,
        macroParams: [],
      })
    }
  }
}

function lowerBlock(
  blockId: BlockId,
  fn: MIRFunction,
  ctx: LoweringContext,
  instrs: LIRInstr[],
  visited: Set<BlockId>,
): void {
  if (visited.has(blockId)) return
  visited.add(blockId)

  const block = ctx.getBlock(blockId)
  if (!block) return

  // Lower all non-terminator instructions
  for (const instr of block.instrs) {
    lowerInstr(instr, fn, ctx, instrs)
  }

  // Lower the terminator
  lowerTerminator(block.term, fn, ctx, instrs, visited)
}

// ---------------------------------------------------------------------------
// Instruction lowering
// ---------------------------------------------------------------------------

function lowerInstr(
  instr: MIRInstr,
  fn: MIRFunction,
  ctx: LoweringContext,
  instrs: LIRInstr[],
): void {
  switch (instr.kind) {
    case 'const': {
      instrs.push({ kind: 'score_set', dst: ctx.slot(instr.dst), value: instr.value })
      break
    }

    case 'copy': {
      lowerOperandToSlot(instr.dst, instr.src, ctx, instrs)
      break
    }

    case 'add':
    case 'sub':
    case 'mul':
    case 'div':
    case 'mod': {
      // 3-address → 2-address: copy a to dst, then op dst with b
      lowerOperandToSlot(instr.dst, instr.a, ctx, instrs)
      const scoreOp = {
        add: 'score_add',
        sub: 'score_sub',
        mul: 'score_mul',
        div: 'score_div',
        mod: 'score_mod',
      } as const
      lowerBinOp(instr.dst, instr.b, scoreOp[instr.kind], ctx, instrs)
      break
    }

    case 'neg': {
      // 0 - src: set tmp to 0, then subtract src
      const dst = ctx.slot(instr.dst)
      instrs.push({ kind: 'score_set', dst, value: 0 })
      const srcSlot = operandToSlot(instr.src, ctx, instrs)
      instrs.push({ kind: 'score_sub', dst, src: srcSlot })
      break
    }

    case 'cmp': {
      // Strategy: set dst=0, then conditionally set to 1
      // MC pattern: execute if score $a <op> $b run scoreboard players set $dst 1
      const dst = ctx.slot(instr.dst)
      const aSlot = operandToSlot(instr.a, ctx, instrs)
      const bSlot = operandToSlot(instr.b, ctx, instrs)

      instrs.push({ kind: 'score_set', dst, value: 0 })

      const cmpOps: Record<string, string> = {
        eq: '=', ne: '=', lt: '<', le: '<=', gt: '>', ge: '>=',
      }
      const op = cmpOps[instr.op]
      const guard = instr.op === 'ne' ? 'unless' : 'if'
      const dstStr = `${dst.player} ${dst.obj}`
      const aStr = `${aSlot.player} ${aSlot.obj}`
      const bStr = `${bSlot.player} ${bSlot.obj}`
      instrs.push({
        kind: 'raw',
        cmd: `execute ${guard} score ${aStr} ${op} ${bStr} run scoreboard players set ${dstStr} 1`,
      })
      break
    }

    case 'and': {
      // Bitwise/logical AND: both are 0/1, so multiply works
      // But more accurately: dst = (a != 0) && (b != 0)
      // Simple approach: copy a, then score_mul with b (since both are 0/1)
      lowerOperandToSlot(instr.dst, instr.a, ctx, instrs)
      lowerBinOp(instr.dst, instr.b, 'score_mul', ctx, instrs)
      break
    }

    case 'or': {
      // OR for 0/1 values: add then clamp to 1
      // dst = a + b; if dst > 1, dst = 1
      const dst = ctx.slot(instr.dst)
      lowerOperandToSlot(instr.dst, instr.a, ctx, instrs)
      lowerBinOp(instr.dst, instr.b, 'score_add', ctx, instrs)
      // Clamp: use score_min with a const slot set to 1
      const oneSlot = constSlot(1, ctx, instrs)
      instrs.push({ kind: 'score_min', dst, src: oneSlot })
      break
    }

    case 'not': {
      // NOT for 0/1: dst = 1 - src
      const dst = ctx.slot(instr.dst)
      instrs.push({ kind: 'score_set', dst, value: 1 })
      const srcSlot = operandToSlot(instr.src, ctx, instrs)
      instrs.push({ kind: 'score_sub', dst, src: srcSlot })
      break
    }

    case 'nbt_read': {
      const dst = ctx.slot(instr.dst)
      instrs.push({
        kind: 'store_nbt_to_score',
        dst,
        ns: instr.ns,
        path: instr.path,
        scale: instr.scale,
      })
      break
    }

    case 'nbt_write': {
      const srcSlot = operandToSlot(instr.src, ctx, instrs)
      instrs.push({
        kind: 'store_score_to_nbt',
        ns: instr.ns,
        path: instr.path,
        type: instr.type,
        scale: instr.scale,
        src: srcSlot,
      })
      break
    }

    case 'call': {
      // Set parameter slots $p0, $p1, ...
      for (let i = 0; i < instr.args.length; i++) {
        const paramSlot: Slot = { player: `$p${i}`, obj: ctx.objective }
        lowerOperandToSlotDirect(paramSlot, instr.args[i], ctx, instrs)
      }

      // Handle raw commands embedded in call
      if (instr.fn.startsWith('__raw:')) {
        instrs.push({ kind: 'raw', cmd: instr.fn.slice(6) })
      } else {
        instrs.push({ kind: 'call', fn: ctx.qualifiedName(instr.fn) })
      }

      // Copy return value to dst if needed
      if (instr.dst) {
        const retSlot: Slot = { player: '$ret', obj: ctx.objective }
        instrs.push({ kind: 'score_copy', dst: ctx.slot(instr.dst), src: retSlot })
      }
      break
    }

    case 'call_macro': {
      const macroStorage = `rs:macro_args`
      // Store each arg to NBT
      for (const arg of instr.args) {
        const srcSlot = operandToSlot(arg.value, ctx, instrs)
        instrs.push({
          kind: 'store_score_to_nbt',
          ns: 'rs:macro_args',
          path: arg.name,
          type: arg.type,
          scale: arg.scale,
          src: srcSlot,
        })
      }
      instrs.push({ kind: 'call_macro', fn: ctx.qualifiedName(instr.fn), storage: macroStorage })

      // Copy return value to dst if needed
      if (instr.dst) {
        const retSlot: Slot = { player: '$ret', obj: ctx.objective }
        instrs.push({ kind: 'score_copy', dst: ctx.slot(instr.dst), src: retSlot })
      }
      break
    }

    case 'call_context': {
      instrs.push({
        kind: 'call_context',
        fn: ctx.qualifiedName(instr.fn),
        subcommands: instr.subcommands,
      })
      break
    }

    default:
      break
  }
}

// ---------------------------------------------------------------------------
// Terminator lowering
// ---------------------------------------------------------------------------

function lowerTerminator(
  term: MIRInstr,
  fn: MIRFunction,
  ctx: LoweringContext,
  instrs: LIRInstr[],
  visited: Set<BlockId>,
): void {
  switch (term.kind) {
    case 'return': {
      if (term.value) {
        const retSlot: Slot = { player: '$ret', obj: ctx.objective }
        const srcSlot = operandToSlot(term.value, ctx, instrs)
        instrs.push({ kind: 'return_value', slot: srcSlot })
      }
      break
    }

    case 'jump': {
      if (ctx.isMultiPred(term.target)) {
        // Target has multiple predecessors — call the extracted function
        instrs.push({ kind: 'call', fn: ctx.qualifiedName(ctx.getBlockFnName(term.target)) })
      } else {
        // Inline the target block's instructions
        lowerBlock(term.target, fn, ctx, instrs, visited)
      }
      break
    }

    case 'branch': {
      const condSlot = operandToSlot(term.cond, ctx, instrs)

      // Then branch → call_if_matches ... 1
      const thenFnName = emitBranchTarget(term.then, fn, ctx, visited)
      instrs.push({
        kind: 'call_if_matches',
        fn: ctx.qualifiedName(thenFnName),
        slot: condSlot,
        range: '1',
      })

      // Else branch → call_unless_matches ... 1
      const elseFnName = emitBranchTarget(term.else, fn, ctx, visited)
      instrs.push({
        kind: 'call_unless_matches',
        fn: ctx.qualifiedName(elseFnName),
        slot: condSlot,
        range: '1',
      })
      break
    }
  }
}

/**
 * Emit a branch target as a separate LIR function and return its name.
 * If the target is already a multi-pred block with a function, reuse it.
 */
function emitBranchTarget(
  blockId: BlockId,
  fn: MIRFunction,
  ctx: LoweringContext,
  parentVisited: Set<BlockId>,
): string {
  // If already has a function (multi-pred), return its name
  if (ctx.isMultiPred(blockId)) {
    // Make sure the block gets emitted
    if (!parentVisited.has(blockId)) {
      const blockInstrs: LIRInstr[] = []
      const blockVisited = new Set<BlockId>()
      lowerBlock(blockId, fn, ctx, blockInstrs, blockVisited)
      ctx.addFunction({
        name: ctx.getBlockFnName(blockId),
        instructions: blockInstrs,
        isMacro: false,
        macroParams: [],
      })
      parentVisited.add(blockId)
    }
    return ctx.getBlockFnName(blockId)
  }

  // Create a new function for this branch target
  const branchFnName = ctx.getBlockFnName(blockId)
  const blockInstrs: LIRInstr[] = []
  const blockVisited = new Set<BlockId>()
  lowerBlock(blockId, fn, ctx, blockInstrs, blockVisited)

  ctx.addFunction({
    name: branchFnName,
    instructions: blockInstrs,
    isMacro: false,
    macroParams: [],
  })

  // Mark visited so parent doesn't re-inline
  parentVisited.add(blockId)

  return branchFnName
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lower an operand into a named temp slot (copy const or score_copy) */
function lowerOperandToSlot(
  dstTemp: Temp,
  src: Operand,
  ctx: LoweringContext,
  instrs: LIRInstr[],
): void {
  const dst = ctx.slot(dstTemp)
  if (src.kind === 'const') {
    instrs.push({ kind: 'score_set', dst, value: src.value })
  } else {
    instrs.push({ kind: 'score_copy', dst, src: ctx.slot(src.name) })
  }
}

/** Lower an operand into a specific slot (not by temp name) */
function lowerOperandToSlotDirect(
  dst: Slot,
  src: Operand,
  ctx: LoweringContext,
  instrs: LIRInstr[],
): void {
  if (src.kind === 'const') {
    instrs.push({ kind: 'score_set', dst, value: src.value })
  } else {
    instrs.push({ kind: 'score_copy', dst, src: ctx.slot(src.name) })
  }
}

/** Get a slot for an operand, emitting a score_set for constants into a temp */
function operandToSlot(
  op: Operand,
  ctx: LoweringContext,
  instrs: LIRInstr[],
): Slot {
  if (op.kind === 'temp') {
    return ctx.slot(op.name)
  }
  // Constant → need a temporary slot
  return constSlot(op.value, ctx, instrs)
}

/** Create a constant slot with a given value */
function constSlot(value: number, ctx: LoweringContext, instrs: LIRInstr[]): Slot {
  const slot: Slot = { player: `$__const_${value}`, obj: ctx.objective }
  instrs.push({ kind: 'score_set', dst: slot, value })
  return slot
}

/** Apply a binary score operation: dst op= src */
function lowerBinOp(
  dstTemp: Temp,
  b: Operand,
  scoreKind: 'score_add' | 'score_sub' | 'score_mul' | 'score_div' | 'score_mod',
  ctx: LoweringContext,
  instrs: LIRInstr[],
): void {
  const dst = ctx.slot(dstTemp)
  const srcSlot = operandToSlot(b, ctx, instrs)
  instrs.push({ kind: scoreKind, dst, src: srcSlot })
}

function getTermTargets(term: MIRInstr): BlockId[] {
  switch (term.kind) {
    case 'jump': return [term.target]
    case 'branch': return [term.then, term.else]
    case 'return': return []
    default: return []
  }
}
