/**
 * HIR → MIR Lowering — Stage 3 of the RedScript compiler pipeline.
 *
 * Converts structured HIR (if/while/break/continue) into an explicit CFG
 * with 3-address instructions and unlimited fresh temporaries.
 */

import type {
  HIRModule, HIRFunction, HIRStmt, HIRBlock, HIRExpr,
  HIRExecuteSubcommand, HIRParam,
} from '../hir/types'
import type {
  MIRModule, MIRFunction, MIRBlock, MIRInstr, BlockId,
  Operand, Temp, CmpOp, ExecuteSubcmd, NBTType, SourceLoc,
} from './types'
import { detectMacroFunctions, BUILTIN_SET, type MacroFunctionInfo } from './macro'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function lowerToMIR(hir: HIRModule, sourceFile?: string): MIRModule {
  // Build struct definitions: name → field names
  const structDefs = new Map<string, string[]>()
  for (const s of hir.structs) {
    structDefs.set(s.name, s.fields.map(f => f.name))
  }

  // Build enum definitions: enumName → variantName → integer value
  const enumDefs = new Map<string, Map<string, number>>()
  for (const e of hir.enums) {
    const variants = new Map<string, number>()
    for (const v of e.variants) {
      variants.set(v.name, v.value ?? 0)
    }
    enumDefs.set(e.name, variants)
  }

  // Build impl method info: typeName → methodName → { hasSelf }
  const implMethods = new Map<string, Map<string, { hasSelf: boolean }>>()
  for (const ib of hir.implBlocks) {
    const methods = new Map<string, { hasSelf: boolean }>()
    for (const m of ib.methods) {
      const hasSelf = m.params.length > 0 && m.params[0].name === 'self'
      methods.set(m.name, { hasSelf })
    }
    implMethods.set(ib.typeName, methods)
  }

  // Pre-scan for macro functions
  const macroInfo = detectMacroFunctions(hir)

  // Build function param info for call_macro generation at call sites
  const fnParamInfo = new Map<string, HIRParam[]>()
  for (const f of hir.functions) {
    fnParamInfo.set(f.name, f.params)
  }
  for (const ib of hir.implBlocks) {
    for (const m of ib.methods) {
      fnParamInfo.set(`${ib.typeName}::${m.name}`, m.params)
    }
  }

  const allFunctions: MIRFunction[] = []
  for (const f of hir.functions) {
    const { fn, helpers } = lowerFunction(f, hir.namespace, structDefs, implMethods, macroInfo, fnParamInfo, enumDefs, sourceFile)
    allFunctions.push(fn, ...helpers)
  }

  // Lower impl block methods
  for (const ib of hir.implBlocks) {
    for (const m of ib.methods) {
      const { fn, helpers } = lowerImplMethod(m, ib.typeName, hir.namespace, structDefs, implMethods, macroInfo, fnParamInfo, enumDefs, sourceFile)
      allFunctions.push(fn, ...helpers)
    }
  }

  return {
    functions: allFunctions,
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
  /** Struct definitions: struct name → field names */
  readonly structDefs: Map<string, string[]>
  /** Impl method info: typeName → methodName → { hasSelf } */
  readonly implMethods: Map<string, Map<string, { hasSelf: boolean }>>
  /** Struct variable tracking: varName → { typeName, fields: fieldName → temp } */
  readonly structVars = new Map<string, { typeName: string; fields: Map<string, Temp> }>()
  /** Tuple variable tracking: varName → array of element temps (index = slot) */
  readonly tupleVars = new Map<string, Temp[]>()
  /** Macro function info for all functions in the module */
  readonly macroInfo: Map<string, MacroFunctionInfo>
  /** Function parameter info for call_macro generation */
  readonly fnParamInfo: Map<string, HIRParam[]>
  /** Macro params for the current function being lowered */
  readonly currentMacroParams: Set<string>
  /** Enum definitions: enumName → variantName → integer value */
  readonly enumDefs: Map<string, Map<string, number>>
  /** Current source location (set during statement lowering) */
  currentSourceLoc: SourceLoc | undefined = undefined
  /** Source file path for the module being compiled */
  sourceFile: string | undefined = undefined

  constructor(
    namespace: string,
    fnName: string,
    structDefs: Map<string, string[]> = new Map(),
    implMethods: Map<string, Map<string, { hasSelf: boolean }>> = new Map(),
    macroInfo: Map<string, MacroFunctionInfo> = new Map(),
    fnParamInfo: Map<string, HIRParam[]> = new Map(),
    enumDefs: Map<string, Map<string, number>> = new Map(),
  ) {
    this.namespace = namespace
    this.fnName = fnName
    this.structDefs = structDefs
    this.implMethods = implMethods
    this.macroInfo = macroInfo
    this.fnParamInfo = fnParamInfo
    this.currentMacroParams = macroInfo.get(fnName)?.macroParams ?? new Set()
    this.enumDefs = enumDefs
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
    if (this.currentSourceLoc && !instr.sourceLoc) {
      instr.sourceLoc = this.currentSourceLoc
    }
    this.currentBlock.instrs.push(instr)
  }

  terminate(term: MIRInstr): void {
    if (this.currentSourceLoc && !term.sourceLoc) {
      term.sourceLoc = this.currentSourceLoc
    }
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

function lowerFunction(
  fn: HIRFunction,
  namespace: string,
  structDefs: Map<string, string[]> = new Map(),
  implMethods: Map<string, Map<string, { hasSelf: boolean }>> = new Map(),
  macroInfo: Map<string, MacroFunctionInfo> = new Map(),
  fnParamInfo: Map<string, HIRParam[]> = new Map(),
  enumDefs: Map<string, Map<string, number>> = new Map(),
  sourceFile?: string,
): { fn: MIRFunction; helpers: MIRFunction[] } {
  const ctx = new FnContext(namespace, fn.name, structDefs, implMethods, macroInfo, fnParamInfo, enumDefs)
  ctx.sourceFile = sourceFile
  const fnMacroInfo = macroInfo.get(fn.name)

  // Create temps for parameters
  const params: { name: Temp; isMacroParam: boolean }[] = fn.params.map(p => {
    const t = ctx.freshTemp()
    return { name: t, isMacroParam: fnMacroInfo?.macroParams.has(p.name) ?? false }
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
    isMacro: fnMacroInfo != null,
  }

  return { fn: result, helpers: ctx.helperFunctions }
}

function lowerImplMethod(
  method: HIRFunction,
  typeName: string,
  namespace: string,
  structDefs: Map<string, string[]>,
  implMethods: Map<string, Map<string, { hasSelf: boolean }>>,
  macroInfo: Map<string, MacroFunctionInfo> = new Map(),
  fnParamInfo: Map<string, HIRParam[]> = new Map(),
  enumDefs: Map<string, Map<string, number>> = new Map(),
  sourceFile?: string,
): { fn: MIRFunction; helpers: MIRFunction[] } {
  const fnName = `${typeName}::${method.name}`
  const ctx = new FnContext(namespace, fnName, structDefs, implMethods, macroInfo, fnParamInfo, enumDefs)
  ctx.sourceFile = sourceFile
  const fields = structDefs.get(typeName) ?? []
  const hasSelf = method.params.length > 0 && method.params[0].name === 'self'

  const params: { name: Temp; isMacroParam: boolean }[] = []
  const scope = new Map<string, Temp>()

  if (hasSelf) {
    // Self fields become the first N params (one per struct field)
    const selfFields = new Map<string, Temp>()
    for (const fieldName of fields) {
      const t = ctx.freshTemp()
      params.push({ name: t, isMacroParam: false })
      selfFields.set(fieldName, t)
    }
    ctx.structVars.set('self', { typeName, fields: selfFields })
    // Remaining params (after self)
    for (let i = 1; i < method.params.length; i++) {
      const t = ctx.freshTemp()
      params.push({ name: t, isMacroParam: false })
      scope.set(method.params[i].name, t)
    }
  } else {
    // Static method — regular params
    for (const p of method.params) {
      const t = ctx.freshTemp()
      params.push({ name: t, isMacroParam: false })
      scope.set(p.name, t)
    }
  }

  lowerBlock(method.body, ctx, scope)

  const cur = ctx.current()
  if (isPlaceholderTerm(cur.term)) {
    ctx.terminate({ kind: 'return', value: null })
  }

  const reachable = computeReachable(ctx.blocks, 'entry')
  const liveBlocks = ctx.blocks.filter(b => reachable.has(b.id))
  computePreds(liveBlocks)

  const result: MIRFunction = {
    name: fnName,
    params,
    blocks: liveBlocks,
    entry: 'entry',
    isMacro: macroInfo.has(fnName),
  }

  return { fn: result, helpers: ctx.helperFunctions }
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
  // Propagate source location from HIR statement span
  if (stmt.span && ctx.sourceFile) {
    ctx.currentSourceLoc = { file: ctx.sourceFile, line: stmt.span.line, col: stmt.span.col }
  }

  switch (stmt.kind) {
    case 'let': {
      if (stmt.init.kind === 'some_lit') {
        // Some(expr) — create option struct vars: has=1, val=expr
        // Use __opt_ prefix so DCE treats these as side-effectful scoreboard writes
        const hasTemp: Temp = `__opt_${stmt.name}_has`
        const valTemp: Temp = `__opt_${stmt.name}_val`
        ctx.emit({ kind: 'const', dst: hasTemp, value: 1 })
        const valOp = lowerExpr(stmt.init.value, ctx, scope)
        ctx.emit({ kind: 'copy', dst: valTemp, src: valOp })
        const fieldTemps = new Map<string, Temp>([['has', hasTemp], ['val', valTemp]])
        ctx.structVars.set(stmt.name, { typeName: '__option', fields: fieldTemps })
      } else if (stmt.init.kind === 'none_lit') {
        // None — create option struct vars: has=0, val=0
        const hasTemp: Temp = `__opt_${stmt.name}_has`
        const valTemp: Temp = `__opt_${stmt.name}_val`
        ctx.emit({ kind: 'const', dst: hasTemp, value: 0 })
        ctx.emit({ kind: 'const', dst: valTemp, value: 0 })
        const fieldTemps = new Map<string, Temp>([['has', hasTemp], ['val', valTemp]])
        ctx.structVars.set(stmt.name, { typeName: '__option', fields: fieldTemps })
      } else if (stmt.init.kind === 'struct_lit') {
        // Struct literal: create per-field temps
        const typeName = (stmt.type?.kind === 'struct') ? stmt.type.name : '__anon'
        const fieldTemps = new Map<string, Temp>()
        for (const field of stmt.init.fields) {
          const val = lowerExpr(field.value, ctx, scope)
          const t = ctx.freshTemp()
          ctx.emit({ kind: 'copy', dst: t, src: val })
          fieldTemps.set(field.name, t)
        }
        ctx.structVars.set(stmt.name, { typeName, fields: fieldTemps })
      } else if (stmt.type?.kind === 'option') {
        // Option<T>-typed let with function call result — use __rf_has/__rf_val convention
        lowerExpr(stmt.init, ctx, scope)
        const hasTemp: Temp = `__opt_${stmt.name}_has`
        const valTemp: Temp = `__opt_${stmt.name}_val`
        ctx.emit({ kind: 'copy', dst: hasTemp, src: { kind: 'temp', name: '__rf_has' } })
        ctx.emit({ kind: 'copy', dst: valTemp, src: { kind: 'temp', name: '__rf_val' } })
        const fieldTemps = new Map<string, Temp>([['has', hasTemp], ['val', valTemp]])
        ctx.structVars.set(stmt.name, { typeName: '__option', fields: fieldTemps })
      } else if (stmt.type?.kind === 'struct') {
        // Struct-typed let with non-literal init (e.g., call returning struct)
        const fields = ctx.structDefs.get(stmt.type.name)
        if (fields) {
          lowerExpr(stmt.init, ctx, scope)
          // Copy from return field slots into struct variable temps
          const fieldTemps = new Map<string, Temp>()
          for (const fieldName of fields) {
            const t = ctx.freshTemp()
            ctx.emit({ kind: 'copy', dst: t, src: { kind: 'temp', name: `__rf_${fieldName}` } })
            fieldTemps.set(fieldName, t)
          }
          ctx.structVars.set(stmt.name, { typeName: stmt.type.name, fields: fieldTemps })
        } else {
          const valOp = lowerExpr(stmt.init, ctx, scope)
          const t = ctx.freshTemp()
          ctx.emit({ kind: 'copy', dst: t, src: valOp })
          scope.set(stmt.name, t)
        }
      } else {
        const valOp = lowerExpr(stmt.init, ctx, scope)
        const t = ctx.freshTemp()
        ctx.emit({ kind: 'copy', dst: t, src: valOp })
        scope.set(stmt.name, t)
      }
      break
    }

    case 'let_destruct': {
      // Tuple destructuring: let (a, b, c) = expr
      const n = stmt.names.length
      if (stmt.init.kind === 'tuple_lit') {
        // Direct tuple literal: evaluate each element into its own temp
        const elemTemps: Temp[] = []
        for (let i = 0; i < stmt.init.elements.length && i < n; i++) {
          const val = lowerExpr(stmt.init.elements[i], ctx, scope)
          const t = ctx.freshTemp()
          ctx.emit({ kind: 'copy', dst: t, src: val })
          elemTemps.push(t)
          scope.set(stmt.names[i], t)
        }
      } else if (stmt.init.kind === 'ident') {
        // Could be referencing a known tuple var
        const tv = ctx.tupleVars.get(stmt.init.name)
        if (tv) {
          for (let i = 0; i < n && i < tv.length; i++) {
            scope.set(stmt.names[i], tv[i])
          }
          break
        }
        // Otherwise treat as a call result stored in __rf_ slots
        lowerExpr(stmt.init, ctx, scope)
        const elemTemps: Temp[] = []
        for (let i = 0; i < n; i++) {
          const t = ctx.freshTemp()
          ctx.emit({ kind: 'copy', dst: t, src: { kind: 'temp', name: `__rf_${i}` } })
          elemTemps.push(t)
          scope.set(stmt.names[i], t)
        }
        // Register as tuple var so it can be passed around
        const varName = stmt.names.join('_') + '_tup'
        ctx.tupleVars.set(varName, elemTemps)
      } else {
        // General expression (e.g. function call) — evaluate, read __rf_ slots
        lowerExpr(stmt.init, ctx, scope)
        const elemTemps: Temp[] = []
        for (let i = 0; i < n; i++) {
          const t = ctx.freshTemp()
          ctx.emit({ kind: 'copy', dst: t, src: { kind: 'temp', name: `__rf_${i}` } })
          elemTemps.push(t)
          scope.set(stmt.names[i], t)
        }
      }
      break
    }

    case 'expr': {
      lowerExpr(stmt.expr, ctx, scope)
      break
    }

    case 'return': {
      if (stmt.value?.kind === 'some_lit') {
        // Option return: Some(expr) → set __rf_has=1, __rf_val=expr
        const valOp = lowerExpr(stmt.value.value, ctx, scope)
        ctx.emit({ kind: 'copy', dst: '__rf_has', src: { kind: 'const', value: 1 } })
        ctx.emit({ kind: 'copy', dst: '__rf_val', src: valOp })
        ctx.terminate({ kind: 'return', value: null })
      } else if (stmt.value?.kind === 'none_lit') {
        // Option return: None → set __rf_has=0, __rf_val=0
        ctx.emit({ kind: 'copy', dst: '__rf_has', src: { kind: 'const', value: 0 } })
        ctx.emit({ kind: 'copy', dst: '__rf_val', src: { kind: 'const', value: 0 } })
        ctx.terminate({ kind: 'return', value: null })
      } else if (stmt.value?.kind === 'struct_lit') {
        // Struct return — copy each field to return field slots
        for (const field of stmt.value.fields) {
          const val = lowerExpr(field.value, ctx, scope)
          ctx.emit({ kind: 'copy', dst: `__rf_${field.name}`, src: val })
        }
        ctx.terminate({ kind: 'return', value: null })
      } else if (stmt.value?.kind === 'tuple_lit') {
        // Tuple return — copy each element to __rf_0, __rf_1, ...
        for (let i = 0; i < stmt.value.elements.length; i++) {
          const val = lowerExpr(stmt.value.elements[i], ctx, scope)
          ctx.emit({ kind: 'copy', dst: `__rf_${i}`, src: val })
        }
        ctx.terminate({ kind: 'return', value: null })
      } else if (stmt.value?.kind === 'ident') {
        // Check if returning an option struct var
        const sv = ctx.structVars.get(stmt.value.name)
        if (sv && sv.typeName === '__option') {
          const hasT = sv.fields.get('has')!
          const valT = sv.fields.get('val')!
          ctx.emit({ kind: 'copy', dst: '__rf_has', src: { kind: 'temp', name: hasT } })
          ctx.emit({ kind: 'copy', dst: '__rf_val', src: { kind: 'temp', name: valT } })
          ctx.terminate({ kind: 'return', value: null })
        } else {
          const val = lowerExpr(stmt.value, ctx, scope)
          ctx.terminate({ kind: 'return', value: val })
        }
      } else {
        const val = stmt.value ? lowerExpr(stmt.value, ctx, scope) : null
        ctx.terminate({ kind: 'return', value: val })
      }
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
      const helperCtx = new FnContext(ctx.getNamespace(), helperName, ctx.structDefs, ctx.implMethods)
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

      const helperCtx = new FnContext(ctx.getNamespace(), helperName, ctx.structDefs, ctx.implMethods)
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

    case 'if_let_some': {
      // if let Some(x) = opt { ... }
      // Lower: check opt.has, if 1 then bind x = opt.val and run then-block
      const sv = (() => {
        if (stmt.init.kind === 'ident') return ctx.structVars.get(stmt.init.name)
        return undefined
      })()

      let hasOp: Operand
      let valTemp: Temp | undefined

      if (sv && sv.typeName === '__option') {
        const hasT = sv.fields.get('has')!
        const valT = sv.fields.get('val')!
        hasOp = { kind: 'temp', name: hasT }
        valTemp = valT
      } else {
        // General: evaluate init (e.g. function call returning option via __rf_has/__rf_val)
        lowerExpr(stmt.init, ctx, scope)
        const hasT = ctx.freshTemp()
        const valT = ctx.freshTemp()
        ctx.emit({ kind: 'copy', dst: hasT, src: { kind: 'temp', name: '__rf_has' } })
        ctx.emit({ kind: 'copy', dst: valT, src: { kind: 'temp', name: '__rf_val' } })
        hasOp = { kind: 'temp', name: hasT }
        valTemp = valT
      }

      const thenBlock = ctx.newBlock('ifl_then')
      const mergeBlock = ctx.newBlock('ifl_merge')
      const elseBlock = stmt.else_ ? ctx.newBlock('ifl_else') : mergeBlock

      ctx.terminate({ kind: 'branch', cond: hasOp, then: thenBlock.id, else: elseBlock.id })

      // Then branch: bind x = val temp
      ctx.switchTo(thenBlock)
      const thenScope = new Map(scope)
      if (valTemp) thenScope.set(stmt.binding, valTemp)
      lowerBlock(stmt.then, ctx, thenScope)
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

    case 'struct_lit': {
      // Struct literal in expression context (not let/return — those handle it directly).
      // Lower each field value but return a placeholder since the struct
      // is tracked via structVars at the statement level.
      for (const field of expr.fields) {
        lowerExpr(field.value, ctx, scope)
      }
      const t = ctx.freshTemp()
      ctx.emit({ kind: 'const', dst: t, value: 0 })
      return { kind: 'temp', name: t }
    }

    case 'str_lit':
    case 'range_lit':
    case 'array_lit':
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
      const val = lowerExpr(expr.value, ctx, scope)
      // Struct field assignment: v.x = val → copy val to v's x temp
      if (expr.obj.kind === 'ident') {
        const sv = ctx.structVars.get(expr.obj.name)
        if (sv) {
          const fieldTemp = sv.fields.get(expr.field)
          if (fieldTemp) {
            ctx.emit({ kind: 'copy', dst: fieldTemp, src: val })
            return val
          }
        }
      }
      return val
    }

    case 'path_expr': {
      // Enum variant access: Phase::Idle → integer constant
      const variants = ctx.enumDefs.get(expr.enumName)
      const value = variants?.get(expr.variant) ?? 0
      return { kind: 'const', value }
    }

    case 'member': {
      // Enum variant access via dot syntax: Phase.Idle → integer constant
      if (expr.obj.kind === 'ident') {
        const enumVariants = ctx.enumDefs.get(expr.obj.name)
        if (enumVariants && enumVariants.has(expr.field)) {
          return { kind: 'const', value: enumVariants.get(expr.field)! }
        }
      }
      // Struct field access: v.x → return v's x temp
      if (expr.obj.kind === 'ident') {
        const sv = ctx.structVars.get(expr.obj.name)
        if (sv) {
          const fieldTemp = sv.fields.get(expr.field)
          if (fieldTemp) return { kind: 'temp', name: fieldTemp }
        }
      }
      // Fallback: opaque
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
      // Handle scoreboard_get / score — read from vanilla MC scoreboard
      if (expr.fn === 'scoreboard_get' || expr.fn === 'score') {
        const player = hirExprToStringLiteral(expr.args[0])
        const obj = hirExprToStringLiteral(expr.args[1])
        const t = ctx.freshTemp()
        ctx.emit({ kind: 'score_read', dst: t, player, obj })
        return { kind: 'temp', name: t }
      }

      // Handle scoreboard_set — write to vanilla MC scoreboard
      if (expr.fn === 'scoreboard_set') {
        const player = hirExprToStringLiteral(expr.args[0])
        const obj = hirExprToStringLiteral(expr.args[1])
        const src = lowerExpr(expr.args[2], ctx, scope)
        ctx.emit({ kind: 'score_write', player, obj, src })
        const t = ctx.freshTemp()
        ctx.emit({ kind: 'const', dst: t, value: 0 })
        return { kind: 'temp', name: t }
      }

      // Handle builtin calls → raw MC commands
      if (BUILTIN_SET.has(expr.fn)) {
        const cmd = formatBuiltinCall(expr.fn, expr.args, ctx.currentMacroParams)
        ctx.emit({ kind: 'call', dst: null, fn: `__raw:${cmd}`, args: [] })
        const t = ctx.freshTemp()
        ctx.emit({ kind: 'const', dst: t, value: 0 })
        return { kind: 'temp', name: t }
      }

      // Check for struct instance method call: parser desugars v.method() → call('method', [v, ...])
      if (expr.args.length > 0 && expr.args[0].kind === 'ident') {
        const sv = ctx.structVars.get(expr.args[0].name)
        if (sv) {
          const methodInfo = ctx.implMethods.get(sv.typeName)?.get(expr.fn)
          if (methodInfo?.hasSelf) {
            // Build args: self fields first, then remaining explicit args
            const fields = ctx.structDefs.get(sv.typeName) ?? []
            const selfArgs: Operand[] = fields.map(f => {
              const temp = sv.fields.get(f)
              return temp ? { kind: 'temp' as const, name: temp } : { kind: 'const' as const, value: 0 }
            })
            const explicitArgs = expr.args.slice(1).map(a => lowerExpr(a, ctx, scope))
            const allArgs = [...selfArgs, ...explicitArgs]
            const t = ctx.freshTemp()
            ctx.emit({ kind: 'call', dst: t, fn: `${sv.typeName}::${expr.fn}`, args: allArgs })
            return { kind: 'temp', name: t }
          }
        }
      }

      // Check if calling a macro function → emit call_macro
      const targetMacro = ctx.macroInfo.get(expr.fn)
      if (targetMacro) {
        const args = expr.args.map(a => lowerExpr(a, ctx, scope))
        const targetParams = ctx.fnParamInfo.get(expr.fn) ?? []
        const macroArgs: { name: string; value: Operand; type: NBTType; scale: number }[] = []
        for (let i = 0; i < targetParams.length && i < args.length; i++) {
          const paramName = targetParams[i].name
          if (targetMacro.macroParams.has(paramName)) {
            const paramTypeName = targetMacro.paramTypes.get(paramName) ?? 'int'
            const isFloat = paramTypeName === 'float'
            macroArgs.push({
              name: paramName,
              value: args[i],
              type: isFloat ? 'double' : 'int',
              scale: isFloat ? 0.01 : 1,
            })
          }
        }
        const t = ctx.freshTemp()
        ctx.emit({ kind: 'call_macro', dst: t, fn: expr.fn, args: macroArgs })
        return { kind: 'temp', name: t }
      }

      const args = expr.args.map(a => lowerExpr(a, ctx, scope))
      const t = ctx.freshTemp()
      ctx.emit({ kind: 'call', dst: t, fn: expr.fn, args })
      return { kind: 'temp', name: t }
    }

    case 'invoke': {
      // Check for struct method call: v.method(args)
      if (expr.callee.kind === 'member' && expr.callee.obj.kind === 'ident') {
        const sv = ctx.structVars.get(expr.callee.obj.name)
        if (sv) {
          const methodInfo = ctx.implMethods.get(sv.typeName)?.get(expr.callee.field)
          if (methodInfo?.hasSelf) {
            // Build args: self fields first, then explicit args
            const fields = ctx.structDefs.get(sv.typeName) ?? []
            const selfArgs: Operand[] = fields.map(f => {
              const temp = sv.fields.get(f)
              return temp ? { kind: 'temp' as const, name: temp } : { kind: 'const' as const, value: 0 }
            })
            const explicitArgs = expr.args.map(a => lowerExpr(a, ctx, scope))
            const allArgs = [...selfArgs, ...explicitArgs]
            const t = ctx.freshTemp()
            ctx.emit({ kind: 'call', dst: t, fn: `${sv.typeName}::${expr.callee.field}`, args: allArgs })
            return { kind: 'temp', name: t }
          }
        }
      }
      // Fallback: generic invoke
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

    case 'tuple_lit': {
      // Inline tuple literal as expression: store elements into __rf_ slots and return a dummy temp
      // This happens when a tuple literal appears as an expression (e.g., passed to a function)
      for (let i = 0; i < expr.elements.length; i++) {
        const val = lowerExpr(expr.elements[i], ctx, scope)
        ctx.emit({ kind: 'copy', dst: `__rf_${i}`, src: val })
      }
      const t = ctx.freshTemp()
      ctx.emit({ kind: 'const', dst: t, value: 0 })
      return { kind: 'temp', name: t }
    }

    case 'some_lit': {
      // Some(expr) in expression context: store has=1,val into __rf_has/__rf_val slots
      const valOp = lowerExpr(expr.value, ctx, scope)
      ctx.emit({ kind: 'copy', dst: '__rf_has', src: { kind: 'const', value: 1 } })
      ctx.emit({ kind: 'copy', dst: '__rf_val', src: valOp })
      const t = ctx.freshTemp()
      ctx.emit({ kind: 'const', dst: t, value: 1 })
      return { kind: 'temp', name: t }
    }

    case 'none_lit': {
      // None in expression context: store has=0,val=0 into __rf_has/__rf_val slots
      ctx.emit({ kind: 'copy', dst: '__rf_has', src: { kind: 'const', value: 0 } })
      ctx.emit({ kind: 'copy', dst: '__rf_val', src: { kind: 'const', value: 0 } })
      const t = ctx.freshTemp()
      ctx.emit({ kind: 'const', dst: t, value: 0 })
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
  // Filters are key=value pairs that become [key=value,key=value]
  if (!sel.filters || Object.keys(sel.filters).length === 0) {
    return sel.kind
  }
  const parts: string[] = []
  for (const [key, value] of Object.entries(sel.filters)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Range filter: { min, max } → key=min..max
      const rangeObj = value as { min?: number; max?: number }
      if (rangeObj.min !== undefined && rangeObj.max !== undefined) {
        parts.push(`${key}=${rangeObj.min}..${rangeObj.max}`)
      } else if (rangeObj.max !== undefined) {
        parts.push(`${key}=..${rangeObj.max}`)
      } else if (rangeObj.min !== undefined) {
        parts.push(`${key}=${rangeObj.min}..`)
      }
    } else {
      parts.push(`${key}=${value}`)
    }
  }
  return `${sel.kind}[${parts.join(',')}]`
}

// ---------------------------------------------------------------------------
// Builtin call formatting → raw MC command strings
// ---------------------------------------------------------------------------

const MACRO_SENTINEL = '\x01'

/**
 * Format a builtin call as a raw MC command string.
 * If any argument uses a macro param, the command is prefixed with \x01
 * (converted to $ in LIR emission).
 */
function formatBuiltinCall(
  fn: string,
  args: HIRExpr[],
  macroParams: Set<string>,
): string {
  const fmtArgs = args.map(a => exprToCommandArg(a, macroParams))
  const strs = fmtArgs.map(a => a.str)
  const hasMacro = fmtArgs.some(a => a.isMacro)

  let cmd: string
  switch (fn) {
    case 'summon': {
      const [type, x, y, z, nbt] = strs
      const pos = [x ?? '~', y ?? '~', z ?? '~'].join(' ')
      cmd = nbt ? `summon ${type} ${pos} ${nbt}` : `summon ${type} ${pos}`
      break
    }
    case 'particle': {
      const [name, x, y, z, ...rest] = strs
      const pos = [x ?? '~', y ?? '~', z ?? '~'].join(' ')
      const extra = rest.filter(v => v !== undefined)
      cmd = extra.length > 0 ? `particle ${name} ${pos} ${extra.join(' ')}` : `particle ${name} ${pos}`
      break
    }
    case 'setblock': {
      // args: blockpos, block — expand blockpos to x y z
      const [posOrX, blockOrY] = args
      if (posOrX?.kind === 'blockpos') {
        const px = coordStr(posOrX.x)
        const py = coordStr(posOrX.y)
        const pz = coordStr(posOrX.z)
        const blk = exprToCommandArg(blockOrY, macroParams).str
        cmd = `setblock ${px} ${py} ${pz} ${blk}`
      } else {
        const [x, y, z, block] = strs
        cmd = `setblock ${x} ${y} ${z} ${block}`
      }
      break
    }
    case 'fill': {
      // args: blockpos1, blockpos2, block — expand both blockpos
      const [p1, p2, blkArg] = args
      if (p1?.kind === 'blockpos' && p2?.kind === 'blockpos') {
        const x1 = coordStr(p1.x); const y1 = coordStr(p1.y); const z1 = coordStr(p1.z)
        const x2 = coordStr(p2.x); const y2 = coordStr(p2.y); const z2 = coordStr(p2.z)
        const blk = exprToCommandArg(blkArg, macroParams).str
        cmd = `fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${blk}`
      } else {
        const [x1, y1, z1, x2, y2, z2, block] = strs
        cmd = `fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${block}`
      }
      break
    }
    case 'say': cmd = `say ${strs[0] ?? ''}`; break
    case 'tell':
    case 'tellraw': cmd = `tellraw ${strs[0]} {"text":"${strs[1]}"}`; break
    case 'title': cmd = `title ${strs[0]} title {"text":"${strs[1]}"}`; break
    case 'actionbar': cmd = `title ${strs[0]} actionbar {"text":"${strs[1]}"}`; break
    case 'subtitle': cmd = `title ${strs[0]} subtitle {"text":"${strs[1]}"}`; break
    case 'title_times': cmd = `title ${strs[0]} times ${strs[1]} ${strs[2]} ${strs[3]}`; break
    case 'announce': cmd = `tellraw @a {"text":"${strs[0]}"}`; break
    case 'give': {
      const nbt = strs[3] ? strs[3] : ''
      cmd = `give ${strs[0]} ${strs[1]}${nbt} ${strs[2] ?? '1'}`
      break
    }
    case 'kill': cmd = `kill ${strs[0] ?? '@s'}`; break
    case 'effect': cmd = `effect give ${strs[0]} ${strs[1]} ${strs[2] ?? '30'} ${strs[3] ?? '0'}`; break
    case 'effect_clear': cmd = strs[1] ? `effect clear ${strs[0]} ${strs[1]}` : `effect clear ${strs[0]}`; break
    case 'playsound': cmd = ['playsound', ...strs].filter(Boolean).join(' '); break
    case 'clear': cmd = `clear ${strs[0]} ${strs[1] ?? ''}`.trim(); break
    case 'weather': cmd = `weather ${strs[0]}`; break
    case 'time_set': cmd = `time set ${strs[0]}`; break
    case 'time_add': cmd = `time add ${strs[0]}`; break
    case 'gamerule': cmd = `gamerule ${strs[0]} ${strs[1]}`; break
    case 'tag_add': cmd = `tag ${strs[0]} add ${strs[1]}`; break
    case 'tag_remove': cmd = `tag ${strs[0]} remove ${strs[1]}`; break
    case 'kick': cmd = `kick ${strs[0]} ${strs[1] ?? ''}`.trim(); break
    case 'clone': cmd = `clone ${strs.join(' ')}`; break
    case 'difficulty': cmd = `difficulty ${strs[0]}`; break
    case 'xp_add': cmd = `xp add ${strs[0]} ${strs[1]} ${strs[2] ?? 'points'}`; break
    case 'xp_set': cmd = `xp set ${strs[0]} ${strs[1]} ${strs[2] ?? 'points'}`; break
    default: cmd = `${fn} ${strs.join(' ')}`
  }

  return hasMacro ? `${MACRO_SENTINEL}${cmd}` : cmd
}

/** Convert an HIR expression to its MC command string representation */
/** Convert a CoordComponent to a MC coordinate string */
function coordStr(c: import('../ast/types').CoordComponent): string {
  switch (c.kind) {
    case 'absolute': return String(c.value)
    case 'relative': return c.offset === 0 ? '~' : `~${c.offset}`
    case 'local':    return c.offset === 0 ? '^' : `^${c.offset}`
  }
}

function exprToCommandArg(
  expr: HIRExpr,
  macroParams: Set<string>,
): { str: string; isMacro: boolean } {
  switch (expr.kind) {
    case 'int_lit': return { str: String(expr.value), isMacro: false }
    case 'float_lit': return { str: String(expr.value), isMacro: false }
    case 'byte_lit': return { str: String(expr.value), isMacro: false }
    case 'short_lit': return { str: String(expr.value), isMacro: false }
    case 'long_lit': return { str: String(expr.value), isMacro: false }
    case 'double_lit': return { str: String(expr.value), isMacro: false }
    case 'bool_lit': return { str: expr.value ? 'true' : 'false', isMacro: false }
    case 'str_lit': return { str: expr.value, isMacro: false }
    case 'mc_name': return { str: expr.value, isMacro: false }
    case 'selector': return { str: expr.raw, isMacro: false }
    case 'ident':
      if (macroParams.has(expr.name)) return { str: `$(${expr.name})`, isMacro: true }
      return { str: expr.name, isMacro: false }
    case 'local_coord': {
      const prefix = expr.value[0] // ^
      const rest = expr.value.slice(1)
      if (rest && /^[a-zA-Z_]\w*$/.test(rest) && macroParams.has(rest)) {
        return { str: `${prefix}$(${rest})`, isMacro: true }
      }
      return { str: expr.value, isMacro: false }
    }
    case 'rel_coord': {
      const prefix = expr.value[0] // ~
      const rest = expr.value.slice(1)
      if (rest && /^[a-zA-Z_]\w*$/.test(rest) && macroParams.has(rest)) {
        return { str: `${prefix}$(${rest})`, isMacro: true }
      }
      return { str: expr.value, isMacro: false }
    }
    case 'unary':
      if (expr.op === '-' && expr.operand.kind === 'float_lit') {
        return { str: String(-expr.operand.value), isMacro: false }
      }
      if (expr.op === '-' && expr.operand.kind === 'int_lit') {
        return { str: String(-expr.operand.value), isMacro: false }
      }
      return { str: '~', isMacro: false }
    default:
      return { str: '~', isMacro: false }
  }
}

/** Extract a string literal from a HIR expression for use in MC commands */
function hirExprToStringLiteral(expr: HIRExpr): string {
  switch (expr.kind) {
    case 'str_lit': return expr.value
    case 'mc_name': return expr.value
    case 'selector': return expr.raw
    case 'int_lit': return String(expr.value)
    default: return ''
  }
}
