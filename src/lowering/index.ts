/**
 * RedScript Lowering
 *
 * Transforms AST into IR (Three-Address Code).
 * Handles control flow, function extraction for foreach, and builtin calls.
 */

import type { IRBuilder } from '../ir/builder'
import { buildModule } from '../ir/builder'
import type { IRFunction, IRModule, Operand, BinOp, CmpOp } from '../ir/types'
import type {
  Block, Decorator, EntitySelector, Expr, FnDecl, Program, RangeExpr, Stmt
} from '../ast/types'

// ---------------------------------------------------------------------------
// Builtin Functions
// ---------------------------------------------------------------------------

const BUILTINS: Record<string, (args: string[]) => string | null> = {
  say:    ([msg]) => `say ${msg}`,
  tell:   ([sel, msg]) => `tellraw ${sel} {"text":"${msg}"}`,
  title:  ([sel, msg]) => `title ${sel} title {"text":"${msg}"}`,
  give:   ([sel, item, count]) => `give ${sel} ${item} ${count ?? '1'}`,
  kill:   ([sel]) => `kill ${sel ?? '@s'}`,
  effect: ([sel, eff, dur, amp]) => `effect give ${sel} ${eff} ${dur ?? '30'} ${amp ?? '0'}`,
  summon: ([type, x, y, z, nbt]) => {
    const pos = [x ?? '~', y ?? '~', z ?? '~'].join(' ')
    return nbt ? `summon ${type} ${pos} ${nbt}` : `summon ${type} ${pos}`
  },
  particle: ([name, x, y, z]) => {
    const pos = [x ?? '~', y ?? '~', z ?? '~'].join(' ')
    return `particle ${name} ${pos}`
  },
  tp: ([sel, x, y, z]) => `tp ${sel} ${x ?? '~'} ${y ?? '~'} ${z ?? '~'}`,
  setblock: ([x, y, z, block]) => `setblock ${x} ${y} ${z} ${block}`,
  random: () => null, // Special handling
}

// ---------------------------------------------------------------------------
// Lowering Class
// ---------------------------------------------------------------------------

export class Lowering {
  private namespace: string
  private functions: IRFunction[] = []
  private globals: string[] = []
  private currentFn: string = ''
  private foreachCounter: number = 0

  // Builder state for current function
  private builder!: LoweringBuilder
  private varMap: Map<string, string> = new Map()
  private currentContext: { binding?: string } = {}

  constructor(namespace: string) {
    this.namespace = namespace
  }

  lower(program: Program): IRModule {
    this.namespace = program.namespace

    for (const fn of program.declarations) {
      this.lowerFn(fn)
    }

    return buildModule(this.namespace, this.functions, this.globals)
  }

  // -------------------------------------------------------------------------
  // Function Lowering
  // -------------------------------------------------------------------------

  private lowerFn(fn: FnDecl): void {
    this.currentFn = fn.name
    this.foreachCounter = 0
    this.varMap = new Map()
    this.currentContext = {}
    this.builder = new LoweringBuilder()

    // Map parameters
    for (let i = 0; i < fn.params.length; i++) {
      const paramName = fn.params[i].name
      this.varMap.set(paramName, `$${paramName}`)
    }

    // Start entry block
    this.builder.startBlock('entry')

    // Copy params from $p0, $p1, ... to named variables
    for (let i = 0; i < fn.params.length; i++) {
      const paramName = fn.params[i].name
      const varName = `$${paramName}`
      this.builder.emitAssign(varName, { kind: 'var', name: `$p${i}` })
    }

    // Lower body
    this.lowerBlock(fn.body)

    // If no explicit return, add void return
    if (!this.builder.isBlockSealed()) {
      this.builder.emitReturn()
    }

    // Build function
    const isTickLoop = fn.decorators.some(d => d.name === 'tick')
    const tickRate = this.getTickRate(fn.decorators)

    const irFn = this.builder.build(fn.name, fn.params.map(p => `$${p.name}`), isTickLoop)

    // Handle tick rate counter if needed
    if (tickRate && tickRate > 1) {
      this.wrapWithTickRate(irFn, tickRate)
    }

    this.functions.push(irFn)
  }

  private getTickRate(decorators: Decorator[]): number | undefined {
    const tickDec = decorators.find(d => d.name === 'tick')
    return tickDec?.args?.rate
  }

  private wrapWithTickRate(fn: IRFunction, rate: number): void {
    // Add tick counter logic to entry block
    const counterVar = `$__tick_${fn.name}`
    this.globals.push(counterVar)

    // Prepend counter logic to entry block
    const entry = fn.blocks[0]
    const originalInstrs = [...entry.instrs]
    const originalTerm = entry.term

    entry.instrs = [
      { op: 'raw', cmd: `scoreboard players add ${counterVar} rs 1` },
    ]

    // Create conditional jump
    const bodyLabel = 'tick_body'
    const skipLabel = 'tick_skip'

    entry.term = {
      op: 'jump_if',
      cond: `${counterVar}_check`,
      then: bodyLabel,
      else_: skipLabel,
    }

    // Add check instruction
    entry.instrs.push({
      op: 'raw',
      cmd: `execute store success score ${counterVar}_check rs if score ${counterVar} rs matches ${rate}..`,
    })

    // Body block (original logic + counter reset)
    fn.blocks.push({
      label: bodyLabel,
      instrs: [
        { op: 'raw', cmd: `scoreboard players set ${counterVar} rs 0` },
        ...originalInstrs,
      ],
      term: originalTerm,
    })

    // Skip block (just return)
    fn.blocks.push({
      label: skipLabel,
      instrs: [],
      term: { op: 'return' },
    })
  }

  // -------------------------------------------------------------------------
  // Statement Lowering
  // -------------------------------------------------------------------------

  private lowerBlock(stmts: Block): void {
    for (const stmt of stmts) {
      this.lowerStmt(stmt)
    }
  }

  private lowerStmt(stmt: Stmt): void {
    switch (stmt.kind) {
      case 'let':
        this.lowerLetStmt(stmt)
        break
      case 'expr':
        this.lowerExpr(stmt.expr)
        break
      case 'return':
        this.lowerReturnStmt(stmt)
        break
      case 'if':
        this.lowerIfStmt(stmt)
        break
      case 'while':
        this.lowerWhileStmt(stmt)
        break
      case 'foreach':
        this.lowerForeachStmt(stmt)
        break
      case 'as_block':
        this.lowerAsBlockStmt(stmt)
        break
      case 'at_block':
        this.lowerAtBlockStmt(stmt)
        break
      case 'as_at':
        this.lowerAsAtStmt(stmt)
        break
      case 'raw':
        this.builder.emitRaw(stmt.cmd)
        break
    }
  }

  private lowerLetStmt(stmt: Extract<Stmt, { kind: 'let' }>): void {
    const varName = `$${stmt.name}`
    this.varMap.set(stmt.name, varName)
    const value = this.lowerExpr(stmt.init)
    this.builder.emitAssign(varName, value)
  }

  private lowerReturnStmt(stmt: Extract<Stmt, { kind: 'return' }>): void {
    if (stmt.value) {
      const value = this.lowerExpr(stmt.value)
      this.builder.emitReturn(value)
    } else {
      this.builder.emitReturn()
    }
  }

  private lowerIfStmt(stmt: Extract<Stmt, { kind: 'if' }>): void {
    const condVar = this.lowerExpr(stmt.cond)
    const condName = this.operandToVar(condVar)

    const thenLabel = this.builder.freshLabel('then')
    const elseLabel = this.builder.freshLabel('else')
    const mergeLabel = this.builder.freshLabel('merge')

    this.builder.emitJumpIf(condName, thenLabel, stmt.else_ ? elseLabel : mergeLabel)

    // Then block
    this.builder.startBlock(thenLabel)
    this.lowerBlock(stmt.then)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitJump(mergeLabel)
    }

    // Else block (if present)
    if (stmt.else_) {
      this.builder.startBlock(elseLabel)
      this.lowerBlock(stmt.else_)
      if (!this.builder.isBlockSealed()) {
        this.builder.emitJump(mergeLabel)
      }
    }

    // Merge block
    this.builder.startBlock(mergeLabel)
  }

  private lowerWhileStmt(stmt: Extract<Stmt, { kind: 'while' }>): void {
    const checkLabel = this.builder.freshLabel('loop_check')
    const bodyLabel = this.builder.freshLabel('loop_body')
    const exitLabel = this.builder.freshLabel('loop_exit')

    this.builder.emitJump(checkLabel)

    // Check block
    this.builder.startBlock(checkLabel)
    const condVar = this.lowerExpr(stmt.cond)
    const condName = this.operandToVar(condVar)
    this.builder.emitJumpIf(condName, bodyLabel, exitLabel)

    // Body block
    this.builder.startBlock(bodyLabel)
    this.lowerBlock(stmt.body)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitJump(checkLabel)
    }

    // Exit block
    this.builder.startBlock(exitLabel)
  }

  private lowerForeachStmt(stmt: Extract<Stmt, { kind: 'foreach' }>): void {
    // Extract body into a separate function
    const subFnName = `${this.currentFn}/foreach_${this.foreachCounter++}`
    const selector = this.selectorToString(stmt.selector)

    // Emit execute as ... run function ...
    this.builder.emitRaw(`execute as ${selector} run function ${this.namespace}:${subFnName}`)

    // Create the sub-function
    const savedBuilder = this.builder
    const savedVarMap = new Map(this.varMap)
    const savedContext = this.currentContext

    this.builder = new LoweringBuilder()
    this.varMap = new Map(savedVarMap)
    this.currentContext = { binding: stmt.binding }

    // In foreach body, the binding maps to @s
    this.varMap.set(stmt.binding, '@s')

    this.builder.startBlock('entry')
    this.lowerBlock(stmt.body)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitReturn()
    }

    const subFn = this.builder.build(subFnName, [], false)
    this.functions.push(subFn)

    // Restore
    this.builder = savedBuilder
    this.varMap = savedVarMap
    this.currentContext = savedContext
  }

  private lowerAsBlockStmt(stmt: Extract<Stmt, { kind: 'as_block' }>): void {
    const selector = this.selectorToString(stmt.selector)
    const subFnName = `${this.currentFn}/as_${this.foreachCounter++}`

    this.builder.emitRaw(`execute as ${selector} run function ${this.namespace}:${subFnName}`)

    // Create sub-function
    const savedBuilder = this.builder
    const savedVarMap = new Map(this.varMap)

    this.builder = new LoweringBuilder()
    this.varMap = new Map(savedVarMap)

    this.builder.startBlock('entry')
    this.lowerBlock(stmt.body)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitReturn()
    }

    const subFn = this.builder.build(subFnName, [], false)
    this.functions.push(subFn)

    this.builder = savedBuilder
    this.varMap = savedVarMap
  }

  private lowerAtBlockStmt(stmt: Extract<Stmt, { kind: 'at_block' }>): void {
    const selector = this.selectorToString(stmt.selector)
    const subFnName = `${this.currentFn}/at_${this.foreachCounter++}`

    this.builder.emitRaw(`execute at ${selector} run function ${this.namespace}:${subFnName}`)

    // Create sub-function
    const savedBuilder = this.builder
    const savedVarMap = new Map(this.varMap)

    this.builder = new LoweringBuilder()
    this.varMap = new Map(savedVarMap)

    this.builder.startBlock('entry')
    this.lowerBlock(stmt.body)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitReturn()
    }

    const subFn = this.builder.build(subFnName, [], false)
    this.functions.push(subFn)

    this.builder = savedBuilder
    this.varMap = savedVarMap
  }

  private lowerAsAtStmt(stmt: Extract<Stmt, { kind: 'as_at' }>): void {
    const asSel = this.selectorToString(stmt.as_sel)
    const atSel = this.selectorToString(stmt.at_sel)
    const subFnName = `${this.currentFn}/as_at_${this.foreachCounter++}`

    this.builder.emitRaw(`execute as ${asSel} at ${atSel} run function ${this.namespace}:${subFnName}`)

    // Create sub-function
    const savedBuilder = this.builder
    const savedVarMap = new Map(this.varMap)

    this.builder = new LoweringBuilder()
    this.varMap = new Map(savedVarMap)

    this.builder.startBlock('entry')
    this.lowerBlock(stmt.body)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitReturn()
    }

    const subFn = this.builder.build(subFnName, [], false)
    this.functions.push(subFn)

    this.builder = savedBuilder
    this.varMap = savedVarMap
  }

  // -------------------------------------------------------------------------
  // Expression Lowering
  // -------------------------------------------------------------------------

  private lowerExpr(expr: Expr): Operand {
    switch (expr.kind) {
      case 'int_lit':
        return { kind: 'const', value: expr.value }

      case 'float_lit':
        // MC doesn't support floats, truncate to int
        return { kind: 'const', value: Math.trunc(expr.value) }

      case 'bool_lit':
        return { kind: 'const', value: expr.value ? 1 : 0 }

      case 'str_lit':
        // Strings are handled inline in builtins
        return { kind: 'const', value: 0 } // Placeholder

      case 'range_lit':
        // Ranges are handled in context (selectors, etc.)
        return { kind: 'const', value: 0 }

      case 'ident': {
        const mapped = this.varMap.get(expr.name)
        if (mapped) {
          // Check if it's a selector reference (like @s)
          if (mapped.startsWith('@')) {
            return { kind: 'var', name: mapped }
          }
          return { kind: 'var', name: mapped }
        }
        return { kind: 'var', name: `$${expr.name}` }
      }

      case 'selector':
        // Selectors are handled inline in builtins
        return { kind: 'var', name: this.selectorToString(expr.sel) }

      case 'binary':
        return this.lowerBinaryExpr(expr)

      case 'unary':
        return this.lowerUnaryExpr(expr)

      case 'assign':
        return this.lowerAssignExpr(expr)

      case 'call':
        return this.lowerCallExpr(expr)

      case 'member':
        // Member access not fully supported in MC
        return { kind: 'var', name: `$${(expr.obj as any).name}_${expr.field}` }
    }
  }

  private lowerBinaryExpr(expr: Extract<Expr, { kind: 'binary' }>): Operand {
    const left = this.lowerExpr(expr.left)
    const right = this.lowerExpr(expr.right)
    const dst = this.builder.freshTemp()

    if (['&&', '||'].includes(expr.op)) {
      // Logical operators need special handling
      if (expr.op === '&&') {
        // Short-circuit AND
        this.builder.emitAssign(dst, left)
        const rightVar = this.operandToVar(right)
        // dst = dst && right → if dst != 0 then dst = right
        this.builder.emitRaw(`execute if score ${dst} rs matches 1.. run scoreboard players operation ${dst} rs = ${rightVar} rs`)
      } else {
        // Short-circuit OR
        this.builder.emitAssign(dst, left)
        const rightVar = this.operandToVar(right)
        // dst = dst || right → if dst == 0 then dst = right
        this.builder.emitRaw(`execute if score ${dst} rs matches ..0 run scoreboard players operation ${dst} rs = ${rightVar} rs`)
      }
      return { kind: 'var', name: dst }
    }

    if (['==', '!=', '<', '<=', '>', '>='].includes(expr.op)) {
      this.builder.emitCmp(dst, left, expr.op as CmpOp, right)
    } else {
      this.builder.emitBinop(dst, left, expr.op as BinOp, right)
    }

    return { kind: 'var', name: dst }
  }

  private lowerUnaryExpr(expr: Extract<Expr, { kind: 'unary' }>): Operand {
    const operand = this.lowerExpr(expr.operand)
    const dst = this.builder.freshTemp()

    if (expr.op === '!') {
      // Logical NOT: dst = (operand == 0) ? 1 : 0
      this.builder.emitCmp(dst, operand, '==', { kind: 'const', value: 0 })
    } else if (expr.op === '-') {
      // Negation: dst = 0 - operand
      this.builder.emitBinop(dst, { kind: 'const', value: 0 }, '-', operand)
    }

    return { kind: 'var', name: dst }
  }

  private lowerAssignExpr(expr: Extract<Expr, { kind: 'assign' }>): Operand {
    const varName = this.varMap.get(expr.target) ?? `$${expr.target}`
    const value = this.lowerExpr(expr.value)

    if (expr.op === '=') {
      this.builder.emitAssign(varName, value)
    } else {
      // Compound assignment
      const binOp = expr.op.slice(0, -1) as BinOp // Remove '='
      const dst = this.builder.freshTemp()
      this.builder.emitBinop(dst, { kind: 'var', name: varName }, binOp, value)
      this.builder.emitAssign(varName, { kind: 'var', name: dst })
    }

    return { kind: 'var', name: varName }
  }

  private lowerCallExpr(expr: Extract<Expr, { kind: 'call' }>): Operand {
    // Check for builtin
    if (expr.fn in BUILTINS) {
      return this.lowerBuiltinCall(expr.fn, expr.args)
    }

    // Regular function call
    const args: Operand[] = expr.args.map(arg => this.lowerExpr(arg))
    const dst = this.builder.freshTemp()
    this.builder.emitCall(expr.fn, args, dst)
    return { kind: 'var', name: dst }
  }

  private lowerBuiltinCall(name: string, args: Expr[]): Operand {
    // Special case: random
    if (name === 'random') {
      const dst = this.builder.freshTemp()
      const min = args[0] ? this.exprToLiteral(args[0]) : '0'
      const max = args[1] ? this.exprToLiteral(args[1]) : '100'
      this.builder.emitRaw(`execute store result score ${dst} rs run random value ${min}..${max}`)
      return { kind: 'var', name: dst }
    }

    // Convert args to strings for builtin
    const strArgs = args.map(arg => this.exprToString(arg))
    const cmd = BUILTINS[name](strArgs)
    if (cmd) {
      this.builder.emitRaw(cmd)
    }

    return { kind: 'const', value: 0 }
  }

  private exprToString(expr: Expr): string {
    switch (expr.kind) {
      case 'int_lit':
        return expr.value.toString()
      case 'float_lit':
        return Math.trunc(expr.value).toString()
      case 'bool_lit':
        return expr.value ? '1' : '0'
      case 'str_lit':
        return expr.value
      case 'ident': {
        const mapped = this.varMap.get(expr.name)
        return mapped ?? `$${expr.name}`
      }
      case 'selector':
        return this.selectorToString(expr.sel)
      default:
        // Complex expression - lower and return var name
        const op = this.lowerExpr(expr)
        return this.operandToVar(op)
    }
  }

  private exprToLiteral(expr: Expr): string {
    if (expr.kind === 'int_lit') return expr.value.toString()
    if (expr.kind === 'float_lit') return Math.trunc(expr.value).toString()
    return '0'
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private operandToVar(op: Operand): string {
    if (op.kind === 'var') return op.name
    // Constant needs to be stored in a temp
    const dst = this.builder.freshTemp()
    this.builder.emitAssign(dst, op)
    return dst
  }

  private selectorToString(sel: EntitySelector): string {
    const { kind, filters } = sel
    if (!filters) return kind

    const parts: string[] = []
    if (filters.type) parts.push(`type=${filters.type}`)
    if (filters.distance) parts.push(`distance=${this.rangeToString(filters.distance)}`)
    if (filters.tag) filters.tag.forEach(t => parts.push(`tag=${t}`))
    if (filters.notTag) filters.notTag.forEach(t => parts.push(`tag=!${t}`))
    if (filters.limit !== undefined) parts.push(`limit=${filters.limit}`)
    if (filters.sort) parts.push(`sort=${filters.sort}`)
    if (filters.scores) {
      const scoreStr = Object.entries(filters.scores)
        .map(([k, v]) => `${k}=${this.rangeToString(v)}`).join(',')
      parts.push(`scores={${scoreStr}}`)
    }
    if (filters.nbt) parts.push(`nbt=${filters.nbt}`)
    if (filters.gamemode) parts.push(`gamemode=${filters.gamemode}`)

    return parts.length ? `${kind}[${parts.join(',')}]` : kind
  }

  private rangeToString(r: RangeExpr): string {
    if (r.min !== undefined && r.max !== undefined) {
      if (r.min === r.max) return `${r.min}`
      return `${r.min}..${r.max}`
    }
    if (r.min !== undefined) return `${r.min}..`
    if (r.max !== undefined) return `..${r.max}`
    return '..'
  }
}

// ---------------------------------------------------------------------------
// LoweringBuilder - Wrapper around IR construction
// ---------------------------------------------------------------------------

class LoweringBuilder {
  private tempCount = 0
  private labelCount = 0
  private blocks: any[] = []
  private currentBlock: any = null
  private locals = new Set<string>()

  freshTemp(): string {
    const name = `$t${this.tempCount++}`
    this.locals.add(name)
    return name
  }

  freshLabel(hint = 'L'): string {
    return `${hint}_${this.labelCount++}`
  }

  startBlock(label: string): void {
    this.currentBlock = { label, instrs: [], term: null }
  }

  isBlockSealed(): boolean {
    return this.currentBlock === null || this.currentBlock.term !== null
  }

  private sealBlock(term: any): void {
    if (this.currentBlock) {
      this.currentBlock.term = term
      this.blocks.push(this.currentBlock)
      this.currentBlock = null
    }
  }

  emitAssign(dst: string, src: Operand): void {
    if (!dst.startsWith('$') && !dst.startsWith('@')) {
      dst = '$' + dst
    }
    this.locals.add(dst)
    this.currentBlock?.instrs.push({ op: 'assign', dst, src })
  }

  emitBinop(dst: string, lhs: Operand, bop: BinOp, rhs: Operand): void {
    this.locals.add(dst)
    this.currentBlock?.instrs.push({ op: 'binop', dst, lhs, bop, rhs })
  }

  emitCmp(dst: string, lhs: Operand, cop: CmpOp, rhs: Operand): void {
    this.locals.add(dst)
    this.currentBlock?.instrs.push({ op: 'cmp', dst, lhs, cop, rhs })
  }

  emitCall(fn: string, args: Operand[], dst?: string): void {
    if (dst) this.locals.add(dst)
    this.currentBlock?.instrs.push({ op: 'call', fn, args, dst })
  }

  emitRaw(cmd: string): void {
    this.currentBlock?.instrs.push({ op: 'raw', cmd })
  }

  emitJump(target: string): void {
    this.sealBlock({ op: 'jump', target })
  }

  emitJumpIf(cond: string, then: string, else_: string): void {
    this.sealBlock({ op: 'jump_if', cond, then, else_ })
  }

  emitReturn(value?: Operand): void {
    this.sealBlock({ op: 'return', value })
  }

  build(name: string, params: string[], isTickLoop = false): IRFunction {
    // Ensure current block is sealed
    if (this.currentBlock && !this.currentBlock.term) {
      this.sealBlock({ op: 'return' })
    }

    return {
      name,
      params,
      locals: Array.from(this.locals),
      blocks: this.blocks,
      isTickLoop,
    }
  }
}
