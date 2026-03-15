/**
 * HIR → MIR Lowering — Stage 3 of the RedScript compiler pipeline.
 *
 * Converts structured HIR (if/while/break/continue) into an explicit CFG
 * with 3-address instructions and unlimited fresh temporaries.
 */

import type {
  HIRModule, HIRFunction, HIRStmt, HIRBlock, HIRExpr,
  HIRExecuteSubcommand,
} from '../hir/types'
import type {
  MIRModule, MIRFunction, MIRBlock, MIRInstr, BlockId,
  Operand, Temp, CmpOp, ExecuteSubcmd,
} from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function lowerToMIR(hir: HIRModule): MIRModule {
  return {
    functions: hir.functions.map(f => lowerFunction(f, hir.namespace)),
    namespace: hir.namespace,
    objective: `__${hir.namespace}`,
  }
}

// ---------------------------------------------------------------------------
// Function lowering context
// ---------------------------------------------------------------------------

class FnContext {
  private tempCounter = 0
  private blockCounter = 0
  readonly blocks: MIRBlock[] = []
  private currentBlock: MIRBlock
  /** Stack of (loopHeader, loopExit, continueTo) for break/continue */
  private loopStack: { header: BlockId; exit: BlockId; continueTo: BlockId }[] = []
  /** Extracted helper functions for execute blocks */
  readonly helperFunctions: MIRFunction[] = []
  private readonly namespace: string
  private readonly fnName: string

  constructor(namespace: string, fnName: string) {
    this.namespace = namespace
    this.fnName = fnName
    const entry = this.makeBlock('entry')
    this.currentBlock = entry
  }

  freshTemp(): Temp {
    return `t${this.tempCounter++}`
  }

  private makeBlock(id?: string): MIRBlock {
    const block: MIRBlock = {
      id: id ?? `bb${this.blockCounter++}`,
      instrs: [],
      term: { kind: 'return', value: null }, // placeholder
      preds: [],
    }
    this.blocks.push(block)
    return block
  }

  newBlock(prefix?: string): MIRBlock {
    return this.makeBlock(prefix ? `${prefix}_${this.blockCounter++}` : undefined)
  }

  emit(instr: MIRInstr): void {
    this.currentBlock.instrs.push(instr)
  }

  terminate(term: MIRInstr): void {
    this.currentBlock.term = term
  }

  switchTo(block: MIRBlock): void {
    this.currentBlock = block
  }

  current(): MIRBlock {
    return this.currentBlock
  }

  pushLoop(header: BlockId, exit: BlockId, continueTo?: BlockId): void {
    this.loopStack.push({ header, exit, continueTo: continueTo ?? header })
  }

  popLoop(): void {
    this.loopStack.pop()
  }

  currentLoop(): { header: BlockId; exit: BlockId; continueTo: BlockId } | undefined {
    return this.loopStack[this.loopStack.length - 1]
  }

  getNamespace(): string {
    return this.namespace
  }

  getFnName(): string {
    return this.fnName
  }
}

// ---------------------------------------------------------------------------
// Function lowering
// ---------------------------------------------------------------------------

function lowerFunction(fn: HIRFunction, namespace: string): MIRFunction {
  const ctx = new FnContext(namespace, fn.name)

  // Create temps for parameters
  const params: { name: Temp; isMacroParam: boolean }[] = fn.params.map(p => {
    const t = ctx.freshTemp()
    return { name: t, isMacroParam: false }
  })

  // Map parameter names to their temps
  const scope = new Map<string, Temp>()
  fn.params.forEach((p, i) => {
    scope.set(p.name, params[i].name)
  })

  lowerBlock(fn.body, ctx, scope)

  // If the current block doesn't have a real terminator, add void return
  const cur = ctx.current()
  if (isPlaceholderTerm(cur.term)) {
    ctx.terminate({ kind: 'return', value: null })
  }

  // Remove unreachable blocks (dead continuations after return/break/continue)
  const reachable = computeReachable(ctx.blocks, 'entry')
  const liveBlocks = ctx.blocks.filter(b => reachable.has(b.id))

  // Fill predecessor lists
  computePreds(liveBlocks)

  const result: MIRFunction = {
    name: fn.name,
    params,
    blocks: liveBlocks,
    entry: 'entry',
    isMacro: false,
  }

  return result
}

function isPlaceholderTerm(term: MIRInstr): boolean {
  // Our placeholder is a return null that was set in makeBlock
  return term.kind === 'return' && (term as any).value === null
}

function computeReachable(blocks: MIRBlock[], entry: BlockId): Set<BlockId> {
  const reachable = new Set<BlockId>()
  const queue: BlockId[] = [entry]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (reachable.has(id)) continue
    reachable.add(id)
    const block = blocks.find(b => b.id === id)
    if (block) {
      for (const t of getTermTargets(block.term)) {
        if (!reachable.has(t)) queue.push(t)
      }
    }
  }
  return reachable
}

function computePreds(blocks: MIRBlock[]): void {
  // Clear all preds
  for (const b of blocks) b.preds = []

  for (const b of blocks) {
    const targets = getTermTargets(b.term)
    for (const t of targets) {
      const target = blocks.find(bb => bb.id === t)
      if (target && !target.preds.includes(b.id)) {
        target.preds.push(b.id)
      }
    }
  }
}

function getTermTargets(term: MIRInstr): BlockId[] {
  switch (term.kind) {
    case 'jump': return [term.target]
    case 'branch': return [term.then, term.else]
    case 'return': return []
    default: return []
  }
}

// ---------------------------------------------------------------------------
// Block / statement lowering
// ---------------------------------------------------------------------------

function lowerBlock(
  stmts: HIRBlock,
  ctx: FnContext,
  scope: Map<string, Temp>,
): void {
  for (const stmt of stmts) {
    lowerStmt(stmt, ctx, scope)
  }
}

function lowerStmt(
  stmt: HIRStmt,
  ctx: FnContext,
  scope: Map<string, Temp>,
): void {
  switch (stmt.kind) {
    case 'let': {
      const valOp = lowerExpr(stmt.init, ctx, scope)
      const t = ctx.freshTemp()
      ctx.emit({ kind: 'copy', dst: t, src: valOp })
      scope.set(stmt.name, t)
      break
    }

    case 'expr': {
      lowerExpr(stmt.expr, ctx, scope)
      break
    }

    case 'return': {
      const val = stmt.value ? lowerExpr(stmt.value, ctx, scope) : null
      ctx.terminate({ kind: 'return', value: val })
      // Create a dead block for any subsequent statements
      const dead = ctx.newBlock('post_ret')
      ctx.switchTo(dead)
      break
    }

    case 'break': {
      const loop = ctx.currentLoop()
      if (!loop) throw new Error('break outside loop')
      ctx.terminate({ kind: 'jump', target: loop.exit })
      const dead = ctx.newBlock('post_break')
      ctx.switchTo(dead)
      break
    }

    case 'continue': {
      const loop = ctx.currentLoop()
      if (!loop) throw new Error('continue outside loop')
      ctx.terminate({ kind: 'jump', target: loop.continueTo })
      const dead = ctx.newBlock('post_continue')
      ctx.switchTo(dead)
      break
    }

    case 'if': {
      const condOp = lowerExpr(stmt.cond, ctx, scope)
      const thenBlock = ctx.newBlock('then')
      const mergeBlock = ctx.newBlock('merge')
      const elseBlock = stmt.else_ ? ctx.newBlock('else') : mergeBlock

      ctx.terminate({ kind: 'branch', cond: condOp, then: thenBlock.id, else: elseBlock.id })

      // Then branch
      ctx.switchTo(thenBlock)
      lowerBlock(stmt.then, ctx, new Map(scope))
      if (isPlaceholderTerm(ctx.current().term)) {
        ctx.terminate({ kind: 'jump', target: mergeBlock.id })
      }

      // Else branch
      if (stmt.else_) {
        ctx.switchTo(elseBlock)
        lowerBlock(stmt.else_, ctx, new Map(scope))
        if (isPlaceholderTerm(ctx.current().term)) {
          ctx.terminate({ kind: 'jump', target: mergeBlock.id })
        }
      }

      ctx.switchTo(mergeBlock)
      break
    }

    case 'while': {
      const headerBlock = ctx.newBlock('loop_header')
      const bodyBlock = ctx.newBlock('loop_body')
      const exitBlock = ctx.newBlock('loop_exit')

      // If there's a step block (for/for_range), create a latch block that
      // executes the step and then jumps to the header. Continue targets the
      // latch so the increment always runs.
      let latchBlock: MIRBlock | null = null
      if (stmt.step && stmt.step.length > 0) {
        latchBlock = ctx.newBlock('loop_latch')
      }
      const continueTarget = latchBlock ? latchBlock.id : headerBlock.id

      // Jump from current block to header
      ctx.terminate({ kind: 'jump', target: headerBlock.id })

      // Header: evaluate condition
      ctx.switchTo(headerBlock)
      const condOp = lowerExpr(stmt.cond, ctx, scope)
      ctx.terminate({ kind: 'branch', cond: condOp, then: bodyBlock.id, else: exitBlock.id })

      // Body
      ctx.switchTo(bodyBlock)
      ctx.pushLoop(headerBlock.id, exitBlock.id, continueTarget)
      lowerBlock(stmt.body, ctx, new Map(scope))
      ctx.popLoop()
      if (isPlaceholderTerm(ctx.current().term)) {
        ctx.terminate({ kind: 'jump', target: continueTarget })
      }

      // Latch block (step): execute increment, then jump to header
      if (latchBlock && stmt.step) {
        ctx.switchTo(latchBlock)
        lowerBlock(stmt.step, ctx, new Map(scope))
        if (isPlaceholderTerm(ctx.current().term)) {
          ctx.terminate({ kind: 'jump', target: headerBlock.id })
        }
      }

      ctx.switchTo(exitBlock)
      break
    }

    case 'foreach': {
      // foreach is MC-specific entity iteration — lower to call_context
      // For now, extract body into a helper and emit call_context
      const helperName = `${ctx.getFnName()}__foreach_${ctx.freshTemp()}`
      const subcommands: ExecuteSubcmd[] = []

      // The iterable should be a selector expression
      if (stmt.iterable.kind === 'selector') {
        subcommands.push({ kind: 'as', selector: stmt.iterable.raw })
      }
      if (stmt.executeContext === '@s') {
        subcommands.push({ kind: 'at_self' })
      }

      // Build helper function body as MIR
      const helperCtx = new FnContext(ctx.getNamespace(), helperName)
      const helperScope = new Map(scope)
      lowerBlock(stmt.body, helperCtx, helperScope)
      if (isPlaceholderTerm(helperCtx.current().term)) {
        helperCtx.terminate({ kind: 'return', value: null })
      }
      const helperReachable = computeReachable(helperCtx.blocks, 'entry')
      const helperBlocks = helperCtx.blocks.filter(b => helperReachable.has(b.id))
      computePreds(helperBlocks)

      ctx.helperFunctions.push({
        name: helperName,
        params: [],
        blocks: helperBlocks,
        entry: 'entry',
        isMacro: false,
      })

      ctx.emit({ kind: 'call_context', fn: helperName, subcommands })
      break
    }

    case 'execute': {
      // Extract body into a helper function, emit call_context
      const helperName = `${ctx.getFnName()}__exec_${ctx.freshTemp()}`
      const subcommands = stmt.subcommands.map(lowerExecuteSubcmd)

      const helperCtx = new FnContext(ctx.getNamespace(), helperName)
      const helperScope = new Map(scope)
      lowerBlock(stmt.body, helperCtx, helperScope)
      if (isPlaceholderTerm(helperCtx.current().term)) {
        helperCtx.terminate({ kind: 'return', value: null })
      }
      const execReachable = computeReachable(helperCtx.blocks, 'entry')
      const execBlocks = helperCtx.blocks.filter(b => execReachable.has(b.id))
      computePreds(execBlocks)

      ctx.helperFunctions.push({
        name: helperName,
        params: [],
        blocks: execBlocks,
        entry: 'entry',
        isMacro: false,
      })

      ctx.emit({ kind: 'call_context', fn: helperName, subcommands })
      break
    }

    case 'match': {
      // Lower match as chained if/else
      const matchVal = lowerExpr(stmt.expr, ctx, scope)
      const mergeBlock = ctx.newBlock('match_merge')

      for (let i = 0; i < stmt.arms.length; i++) {
        const arm = stmt.arms[i]
        if (arm.pattern === null) {
          // Default arm — just emit the body
          lowerBlock(arm.body, ctx, new Map(scope))
          if (isPlaceholderTerm(ctx.current().term)) {
            ctx.terminate({ kind: 'jump', target: mergeBlock.id })
          }
        } else {
          const patOp = lowerExpr(arm.pattern, ctx, scope)
          const cmpTemp = ctx.freshTemp()
          ctx.emit({ kind: 'cmp', dst: cmpTemp, op: 'eq', a: matchVal, b: patOp })

          const armBody = ctx.newBlock('match_arm')
          const nextArm = ctx.newBlock('match_next')
          ctx.terminate({ kind: 'branch', cond: { kind: 'temp', name: cmpTemp }, then: armBody.id, else: nextArm.id })

          ctx.switchTo(armBody)
          lowerBlock(arm.body, ctx, new Map(scope))
          if (isPlaceholderTerm(ctx.current().term)) {
            ctx.terminate({ kind: 'jump', target: mergeBlock.id })
          }

          ctx.switchTo(nextArm)
        }
      }

      // If no default arm matched, jump to merge
      if (isPlaceholderTerm(ctx.current().term)) {
        ctx.terminate({ kind: 'jump', target: mergeBlock.id })
      }

      ctx.switchTo(mergeBlock)
      break
    }

    case 'raw': {
      // Raw commands are opaque at MIR level — emit as a call to a synthetic raw function
      // For now, pass through as a call with no args (will be handled in LIR)
      ctx.emit({ kind: 'call', dst: null, fn: `__raw:${stmt.cmd}`, args: [] })
      break
    }

    default: {
      const _exhaustive: never = stmt
      throw new Error(`Unknown HIR statement kind: ${(_exhaustive as any).kind}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Expression lowering → produces an Operand (temp or const)
// ---------------------------------------------------------------------------

function lowerExpr(
  expr: HIRExpr,
  ctx: FnContext,
  scope: Map<string, Temp>,
): Operand {
  switch (expr.kind) {
    case 'int_lit':
      return { kind: 'const', value: expr.value }

    case 'float_lit':
      // float is ×1000 fixed-point in RedScript
      return { kind: 'const', value: expr.value }

    case 'byte_lit':
    case 'short_lit':
    case 'long_lit':
    case 'double_lit':
      return { kind: 'const', value: expr.value }

    case 'bool_lit': {
      return { kind: 'const', value: expr.value ? 1 : 0 }
    }

    case 'str_lit':
    case 'range_lit':
    case 'array_lit':
    case 'struct_lit':
    case 'rel_coord':
    case 'local_coord':
    case 'mc_name':
    case 'blockpos':
    case 'selector':
    case 'str_interp':
    case 'f_string':
    case 'is_check':
    case 'lambda': {
      // MC-specific / complex types — opaque at MIR level
      // Emit as const 0 placeholder; these are handled in LIR lowering
      const t = ctx.freshTemp()
      ctx.emit({ kind: 'const', dst: t, value: 0 })
      return { kind: 'temp', name: t }
    }

    case 'ident': {
      const temp = scope.get(expr.name)
      if (temp) return { kind: 'temp', name: temp }
      // Unresolved ident — could be a global or external reference
      const t = ctx.freshTemp()
      ctx.emit({ kind: 'copy', dst: t, src: { kind: 'const', value: 0 } })
      scope.set(expr.name, t)
      return { kind: 'temp', name: t }
    }

    case 'binary': {
      // Handle short-circuit && and ||
      if (expr.op === '&&') {
        return lowerShortCircuitAnd(expr, ctx, scope)
      }
      if (expr.op === '||') {
        return lowerShortCircuitOr(expr, ctx, scope)
      }

      const left = lowerExpr(expr.left, ctx, scope)
      const right = lowerExpr(expr.right, ctx, scope)
      const t = ctx.freshTemp()

      // Map HIR binary ops to MIR instructions
      const arithmeticOps: Record<string, MIRInstr['kind']> = {
        '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'mod',
      }
      const cmpOps: Record<string, CmpOp> = {
        '==': 'eq', '!=': 'ne', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge',
      }

      if (expr.op in arithmeticOps) {
        ctx.emit({ kind: arithmeticOps[expr.op] as any, dst: t, a: left, b: right })
      } else if (expr.op in cmpOps) {
        ctx.emit({ kind: 'cmp', dst: t, op: cmpOps[expr.op], a: left, b: right })
      } else {
        throw new Error(`Unknown binary op: ${expr.op}`)
      }
      return { kind: 'temp', name: t }
    }

    case 'unary': {
      const operand = lowerExpr(expr.operand, ctx, scope)
      const t = ctx.freshTemp()
      if (expr.op === '-') {
        ctx.emit({ kind: 'neg', dst: t, src: operand })
      } else if (expr.op === '!') {
        ctx.emit({ kind: 'not', dst: t, src: operand })
      }
      return { kind: 'temp', name: t }
    }

    case 'assign': {
      const val = lowerExpr(expr.value, ctx, scope)
      // Reuse the existing temp for this variable so that updates inside
      // if/while bodies are visible to outer code (we target mutable
      // scoreboard slots, not true SSA registers).
      const existing = scope.get(expr.target)
      const t = existing ?? ctx.freshTemp()
      ctx.emit({ kind: 'copy', dst: t, src: val })
      scope.set(expr.target, t)
      return val
    }

    case 'member_assign': {
      // Struct field assignment — opaque at MIR, handled in LIR
      const val = lowerExpr(expr.value, ctx, scope)
      return val
    }

    case 'member': {
      // Struct field access — opaque at MIR
      const obj = lowerExpr(expr.obj, ctx, scope)
      const t = ctx.freshTemp()
      ctx.emit({ kind: 'copy', dst: t, src: obj })
      return { kind: 'temp', name: t }
    }

    case 'index': {
      const obj = lowerExpr(expr.obj, ctx, scope)
      const idx = lowerExpr(expr.index, ctx, scope)
      const t = ctx.freshTemp()
      ctx.emit({ kind: 'copy', dst: t, src: obj })
      return { kind: 'temp', name: t }
    }

    case 'call': {
      const args = expr.args.map(a => lowerExpr(a, ctx, scope))
      const t = ctx.freshTemp()
      ctx.emit({ kind: 'call', dst: t, fn: expr.fn, args })
      return { kind: 'temp', name: t }
    }

    case 'invoke': {
      const calleeOp = lowerExpr(expr.callee, ctx, scope)
      const args = expr.args.map(a => lowerExpr(a, ctx, scope))
      const t = ctx.freshTemp()
      ctx.emit({ kind: 'call', dst: t, fn: '__invoke', args: [calleeOp, ...args] })
      return { kind: 'temp', name: t }
    }

    case 'static_call': {
      const args = expr.args.map(a => lowerExpr(a, ctx, scope))
      const t = ctx.freshTemp()
      ctx.emit({ kind: 'call', dst: t, fn: `${expr.type}::${expr.method}`, args })
      return { kind: 'temp', name: t }
    }

    default: {
      const _exhaustive: never = expr
      throw new Error(`Unknown HIR expression kind: ${(_exhaustive as any).kind}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Short-circuit lowering
// ---------------------------------------------------------------------------

function lowerShortCircuitAnd(
  expr: Extract<HIRExpr, { kind: 'binary' }>,
  ctx: FnContext,
  scope: Map<string, Temp>,
): Operand {
  // a && b → if(a) { b } else { 0 }
  const left = lowerExpr(expr.left, ctx, scope)
  const result = ctx.freshTemp()

  const evalRight = ctx.newBlock('and_right')
  const merge = ctx.newBlock('and_merge')
  const falseBlock = ctx.newBlock('and_false')

  ctx.terminate({ kind: 'branch', cond: left, then: evalRight.id, else: falseBlock.id })

  ctx.switchTo(evalRight)
  const right = lowerExpr(expr.right, ctx, scope)
  ctx.emit({ kind: 'copy', dst: result, src: right })
  ctx.terminate({ kind: 'jump', target: merge.id })

  ctx.switchTo(falseBlock)
  ctx.emit({ kind: 'const', dst: result, value: 0 })
  ctx.terminate({ kind: 'jump', target: merge.id })

  ctx.switchTo(merge)
  return { kind: 'temp', name: result }
}

function lowerShortCircuitOr(
  expr: Extract<HIRExpr, { kind: 'binary' }>,
  ctx: FnContext,
  scope: Map<string, Temp>,
): Operand {
  // a || b → if(a) { 1 } else { b }
  const left = lowerExpr(expr.left, ctx, scope)
  const result = ctx.freshTemp()

  const trueBlock = ctx.newBlock('or_true')
  const evalRight = ctx.newBlock('or_right')
  const merge = ctx.newBlock('or_merge')

  ctx.terminate({ kind: 'branch', cond: left, then: trueBlock.id, else: evalRight.id })

  ctx.switchTo(trueBlock)
  ctx.emit({ kind: 'const', dst: result, value: 1 })
  ctx.terminate({ kind: 'jump', target: merge.id })

  ctx.switchTo(evalRight)
  const right = lowerExpr(expr.right, ctx, scope)
  ctx.emit({ kind: 'copy', dst: result, src: right })
  ctx.terminate({ kind: 'jump', target: merge.id })

  ctx.switchTo(merge)
  return { kind: 'temp', name: result }
}

// ---------------------------------------------------------------------------
// Execute subcommand lowering
// ---------------------------------------------------------------------------

function lowerExecuteSubcmd(sub: HIRExecuteSubcommand): ExecuteSubcmd {
  switch (sub.kind) {
    case 'as':
      return { kind: 'as', selector: selectorToString(sub.selector) }
    case 'at':
      return { kind: 'at', selector: selectorToString(sub.selector) }
    case 'positioned':
      return { kind: 'positioned', x: sub.x, y: sub.y, z: sub.z }
    case 'rotated':
      return { kind: 'rotated', yaw: sub.yaw, pitch: sub.pitch }
    case 'in':
      return { kind: 'in', dimension: sub.dimension }
    case 'anchored':
      return { kind: 'anchored', anchor: sub.anchor }
    case 'positioned_as':
      return { kind: 'at', selector: selectorToString(sub.selector) }
    case 'rotated_as':
      return { kind: 'rotated', yaw: '0', pitch: '0' }
    case 'facing':
      return { kind: 'positioned', x: sub.x, y: sub.y, z: sub.z }
    case 'facing_entity':
      return { kind: 'at', selector: selectorToString(sub.selector) }
    case 'align':
      return { kind: 'positioned', x: '0', y: '0', z: '0' }
    case 'on':
      return { kind: 'at_self' }
    case 'summon':
      return { kind: 'at_self' }
    case 'if_entity':
    case 'unless_entity':
    case 'if_block':
    case 'unless_block':
    case 'if_score':
    case 'unless_score':
    case 'if_score_range':
    case 'unless_score_range':
    case 'store_result':
    case 'store_success':
      // These are condition subcommands — pass through as-is for now
      return { kind: 'at_self' }
    default: {
      const _exhaustive: never = sub
      throw new Error(`Unknown execute subcommand kind: ${(_exhaustive as any).kind}`)
    }
  }
}

function selectorToString(sel: { kind: string; filters?: any }): string {
  // EntitySelector has kind like '@a', '@e', '@s', etc.
  return sel.kind
}
