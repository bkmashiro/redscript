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
  Block, Decorator, EntitySelector, Expr, FnDecl, Program, RangeExpr, Stmt,
  StructDecl, TypeNode, ExecuteSubcommand, BlockPosExpr, CoordComponent
} from '../ast/types'

// ---------------------------------------------------------------------------
// Builtin Functions
// ---------------------------------------------------------------------------

const BUILTINS: Record<string, (args: string[]) => string | null> = {
  say:         ([msg]) => `say ${msg}`,
  tell:        ([sel, msg]) => `tellraw ${sel} {"text":"${msg}"}`,
  title:       ([sel, msg]) => `title ${sel} title {"text":"${msg}"}`,
  actionbar:   ([sel, msg]) => `title ${sel} actionbar {"text":"${msg}"}`,
  subtitle:    ([sel, msg]) => `title ${sel} subtitle {"text":"${msg}"}`,
  title_times: ([sel, fadeIn, stay, fadeOut]) => `title ${sel} times ${fadeIn} ${stay} ${fadeOut}`,
  announce:    ([msg]) => `tellraw @a {"text":"${msg}"}`,
  give:        ([sel, item, count]) => `give ${sel} ${item} ${count ?? '1'}`,
  kill:        ([sel]) => `kill ${sel ?? '@s'}`,
  effect:      ([sel, eff, dur, amp]) => `effect give ${sel} ${eff} ${dur ?? '30'} ${amp ?? '0'}`,
  summon: ([type, x, y, z, nbt]) => {
    const pos = [x ?? '~', y ?? '~', z ?? '~'].join(' ')
    return nbt ? `summon ${type} ${pos} ${nbt}` : `summon ${type} ${pos}`
  },
  particle: ([name, x, y, z]) => {
    const pos = [x ?? '~', y ?? '~', z ?? '~'].join(' ')
    return `particle ${name} ${pos}`
  },
  playsound:  ([sound, source, sel, x, y, z, volume, pitch, minVolume]) =>
    ['playsound', sound, source, sel, x, y, z, volume, pitch, minVolume].filter(Boolean).join(' '),
  tp:         ([sel, x, y, z]) => `tp ${sel} ${x} ${y} ${z}`,
  tp_to:      ([sel, target]) => `tp ${sel} ${target}`,
  clear:      ([sel, item]) => `clear ${sel} ${item ?? ''}`.trim(),
  weather:    ([type]) => `weather ${type}`,
  time_set:   ([val]) => `time set ${val}`,
  time_add:   ([val]) => `time add ${val}`,
  gamerule:   ([rule, val]) => `gamerule ${rule} ${val}`,
  tag_add:    ([sel, tag]) => `tag ${sel} add ${tag}`,
  tag_remove: ([sel, tag]) => `tag ${sel} remove ${tag}`,
  kick:       ([player, reason]) => `kick ${player} ${reason ?? ''}`.trim(),
  setblock:   ([x, y, z, block]) => `setblock ${x} ${y} ${z} ${block}`,
  fill:       ([x1, y1, z1, x2, y2, z2, block]) => `fill ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${block}`,
  clone:      ([x1, y1, z1, x2, y2, z2, dx, dy, dz]) => `clone ${x1} ${y1} ${z1} ${x2} ${y2} ${z2} ${dx} ${dy} ${dz}`,
  difficulty: ([level]) => `difficulty ${level}`,
  xp_add:     ([sel, amount, type]) => `xp add ${sel} ${amount} ${type ?? 'points'}`,
  xp_set:     ([sel, amount, type]) => `xp set ${sel} ${amount} ${type ?? 'points'}`,
  random: () => null, // Special handling
  scoreboard_get: () => null, // Special handling (returns value)
  scoreboard_set: () => null, // Special handling
  score: () => null, // Special handling (same as scoreboard_get)
  data_get: () => null, // Special handling (returns value from NBT)
}

function emitCoord(component: CoordComponent): string {
  switch (component.kind) {
    case 'absolute':
      return String(component.value)
    case 'relative':
      return component.offset === 0 ? '~' : `~${component.offset}`
    case 'local':
      return component.offset === 0 ? '^' : `^${component.offset}`
  }
}

function emitBlockPos(pos: BlockPosExpr): string {
  return `${emitCoord(pos.x)} ${emitCoord(pos.y)} ${emitCoord(pos.z)}`
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
  private blockPosVars: Map<string, BlockPosExpr> = new Map()

  // Struct definitions: name → { fieldName: TypeNode }
  private structDefs: Map<string, Map<string, TypeNode>> = new Map()
  private enumDefs: Map<string, Map<string, number>> = new Map()
  private functionDefaults: Map<string, Array<Expr | undefined>> = new Map()
  // Variable types: varName → TypeNode
  private varTypes: Map<string, TypeNode> = new Map()
  // Float variables (stored as fixed-point × 1000)
  private floatVars: Set<string> = new Set()
  // World object counter for unique tags
  private worldObjCounter: number = 0

  constructor(namespace: string) {
    this.namespace = namespace
  }

  lower(program: Program): IRModule {
    this.namespace = program.namespace

    // Load struct definitions
    for (const struct of program.structs ?? []) {
      const fields = new Map<string, TypeNode>()
      for (const field of struct.fields) {
        fields.set(field.name, field.type)
      }
      this.structDefs.set(struct.name, fields)
    }

    for (const enumDecl of program.enums ?? []) {
      const variants = new Map<string, number>()
      for (const variant of enumDecl.variants) {
        variants.set(variant.name, variant.value ?? 0)
      }
      this.enumDefs.set(enumDecl.name, variants)
    }

    for (const fn of program.declarations) {
      this.functionDefaults.set(fn.name, fn.params.map(param => param.default))
    }

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
    this.blockPosVars = new Map()
    this.builder = new LoweringBuilder()

    // Map parameters
    for (let i = 0; i < fn.params.length; i++) {
      const paramName = fn.params[i].name
      this.varMap.set(paramName, `$${paramName}`)
      this.varTypes.set(paramName, this.normalizeType(fn.params[i].type))
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

    // Check for trigger handler
    const triggerDec = fn.decorators.find(d => d.name === 'on_trigger')
    const isTriggerHandler = !!triggerDec
    const triggerName = triggerDec?.args?.trigger

    const irFn = this.builder.build(fn.name, fn.params.map(p => `$${p.name}`), isTickLoop)

    // Add trigger metadata if applicable
    if (isTriggerHandler && triggerName) {
      irFn.isTriggerHandler = true
      irFn.triggerName = triggerName
    }

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
      case 'for':
        this.lowerForStmt(stmt)
        break
      case 'foreach':
        this.lowerForeachStmt(stmt)
        break
      case 'match':
        this.lowerMatchStmt(stmt)
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
      case 'execute':
        this.lowerExecuteStmt(stmt)
        break
      case 'raw':
        this.builder.emitRaw(stmt.cmd)
        break
    }
  }

  private lowerLetStmt(stmt: Extract<Stmt, { kind: 'let' }>): void {
    const varName = `$${stmt.name}`
    this.varMap.set(stmt.name, varName)

    // Track variable type
    if (stmt.type) {
      const normalizedType = this.normalizeType(stmt.type)
      this.varTypes.set(stmt.name, normalizedType)
      // Track float variables for fixed-point arithmetic
      if (normalizedType.kind === 'named' && normalizedType.name === 'float') {
        this.floatVars.add(stmt.name)
      }
    }

    // Handle struct literal initialization
    if (stmt.init.kind === 'struct_lit' && stmt.type?.kind === 'struct') {
      const structName = stmt.type.name.toLowerCase()
      for (const field of stmt.init.fields) {
        const path = `rs:heap ${structName}_${stmt.name}.${field.name}`
        const fieldValue = this.lowerExpr(field.value)
        if (fieldValue.kind === 'const') {
          this.builder.emitRaw(`data modify storage ${path} set value ${fieldValue.value}`)
        } else if (fieldValue.kind === 'var') {
          // Copy from scoreboard to NBT
          this.builder.emitRaw(`execute store result storage ${path} int 1 run scoreboard players get ${fieldValue.name} rs`)
        }
      }
      return
    }

    // Handle array literal initialization
    if (stmt.init.kind === 'array_lit') {
      // Initialize empty NBT array
      this.builder.emitRaw(`data modify storage rs:heap ${stmt.name} set value []`)
      // Add each element
      for (const elem of stmt.init.elements) {
        const elemValue = this.lowerExpr(elem)
        if (elemValue.kind === 'const') {
          this.builder.emitRaw(`data modify storage rs:heap ${stmt.name} append value ${elemValue.value}`)
        } else if (elemValue.kind === 'var') {
          this.builder.emitRaw(`data modify storage rs:heap ${stmt.name} append value 0`)
          this.builder.emitRaw(`execute store result storage rs:heap ${stmt.name}[-1] int 1 run scoreboard players get ${elemValue.name} rs`)
        }
      }
      return
    }

    // Handle spawn_object returning entity handle
    if (stmt.init.kind === 'call' && stmt.init.fn === 'spawn_object') {
      const value = this.lowerExpr(stmt.init)
      // value is the selector like @e[tag=__rs_obj_0,limit=1]
      if (value.kind === 'var' && value.name.startsWith('@e[tag=__rs_obj_')) {
        this.varMap.set(stmt.name, value.name)
        // Mark as entity type for later member access
        this.varTypes.set(stmt.name, { kind: 'named', name: 'void' }) // Marker
      }
      return
    }

    const blockPosValue = this.resolveBlockPosExpr(stmt.init)
    if (blockPosValue) {
      this.blockPosVars.set(stmt.name, blockPosValue)
      return
    }

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

  private lowerForStmt(stmt: Extract<Stmt, { kind: 'for' }>): void {
    // For loop is lowered to: init; while(cond) { body; step; }
    
    // Init statement (if present)
    if (stmt.init) {
      this.lowerStmt(stmt.init)
    }

    const checkLabel = this.builder.freshLabel('for_check')
    const bodyLabel = this.builder.freshLabel('for_body')
    const exitLabel = this.builder.freshLabel('for_exit')

    this.builder.emitJump(checkLabel)

    // Check block
    this.builder.startBlock(checkLabel)
    const condVar = this.lowerExpr(stmt.cond)
    const condName = this.operandToVar(condVar)
    this.builder.emitJumpIf(condName, bodyLabel, exitLabel)

    // Body block
    this.builder.startBlock(bodyLabel)
    this.lowerBlock(stmt.body)
    // Step expression
    this.lowerExpr(stmt.step)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitJump(checkLabel)
    }

    // Exit block
    this.builder.startBlock(exitLabel)
  }

  private lowerForeachStmt(stmt: Extract<Stmt, { kind: 'foreach' }>): void {
    if (stmt.iterable.kind !== 'selector') {
      this.lowerArrayForeachStmt(stmt)
      return
    }

    // Extract body into a separate function
    const subFnName = `${this.currentFn}/foreach_${this.foreachCounter++}`
    const selector = this.exprToString(stmt.iterable)

    // Emit execute as ... run function ...
    this.builder.emitRaw(`execute as ${selector} run function ${this.namespace}:${subFnName}`)

    // Create the sub-function
    const savedBuilder = this.builder
    const savedVarMap = new Map(this.varMap)
    const savedContext = this.currentContext
    const savedBlockPosVars = new Map(this.blockPosVars)

    this.builder = new LoweringBuilder()
    this.varMap = new Map(savedVarMap)
    this.currentContext = { binding: stmt.binding }
    this.blockPosVars = new Map(savedBlockPosVars)

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
    this.blockPosVars = savedBlockPosVars
  }

  private lowerMatchStmt(stmt: Extract<Stmt, { kind: 'match' }>): void {
    const subject = this.operandToVar(this.lowerExpr(stmt.expr))
    const matchedVar = this.builder.freshTemp()
    this.builder.emitAssign(matchedVar, { kind: 'const', value: 0 })

    let defaultArm: { pattern: Expr | null; body: Block } | null = null

    for (const arm of stmt.arms) {
      if (arm.pattern === null) {
        defaultArm = arm
        continue
      }

      const patternValue = this.lowerExpr(arm.pattern)
      if (patternValue.kind !== 'const') {
        throw new Error('Match patterns must lower to compile-time constants')
      }

      const subFnName = `${this.currentFn}/match_${this.foreachCounter++}`
      this.builder.emitRaw(`execute if score ${matchedVar} rs matches ..0 if score ${subject} rs matches ${patternValue.value} run function ${this.namespace}:${subFnName}`)
      this.emitMatchArmSubFunction(subFnName, matchedVar, arm.body, true)
    }

    if (defaultArm) {
      const subFnName = `${this.currentFn}/match_${this.foreachCounter++}`
      this.builder.emitRaw(`execute if score ${matchedVar} rs matches ..0 run function ${this.namespace}:${subFnName}`)
      this.emitMatchArmSubFunction(subFnName, matchedVar, defaultArm.body, false)
    }
  }

  private emitMatchArmSubFunction(name: string, matchedVar: string, body: Block, setMatched: boolean): void {
    const savedBuilder = this.builder
    const savedVarMap = new Map(this.varMap)
    const savedContext = this.currentContext
    const savedBlockPosVars = new Map(this.blockPosVars)

    this.builder = new LoweringBuilder()
    this.varMap = new Map(savedVarMap)
    this.currentContext = savedContext
    this.blockPosVars = new Map(savedBlockPosVars)

    this.builder.startBlock('entry')
    if (setMatched) {
      this.builder.emitRaw(`scoreboard players set ${matchedVar} rs 1`)
    }
    this.lowerBlock(body)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitReturn()
    }

    this.functions.push(this.builder.build(name, [], false))

    this.builder = savedBuilder
    this.varMap = savedVarMap
    this.currentContext = savedContext
    this.blockPosVars = savedBlockPosVars
  }

  private lowerArrayForeachStmt(stmt: Extract<Stmt, { kind: 'foreach' }>): void {
    const arrayName = this.getArrayStorageName(stmt.iterable)
    if (!arrayName) {
      this.builder.emitRaw('# Unsupported foreach iterable')
      return
    }

    const arrayType = this.inferExprType(stmt.iterable)
    const bindingVar = `$${stmt.binding}`
    const indexVar = this.builder.freshTemp()
    const lengthVar = this.builder.freshTemp()
    const condVar = this.builder.freshTemp()
    const oneVar = this.builder.freshTemp()

    const savedBinding = this.varMap.get(stmt.binding)
    const savedType = this.varTypes.get(stmt.binding)

    this.varMap.set(stmt.binding, bindingVar)
    if (arrayType?.kind === 'array') {
      this.varTypes.set(stmt.binding, arrayType.elem)
    }

    this.builder.emitAssign(indexVar, { kind: 'const', value: 0 })
    this.builder.emitAssign(oneVar, { kind: 'const', value: 1 })
    this.builder.emitRaw(`execute store result score ${lengthVar} rs run data get storage rs:heap ${arrayName}`)

    const checkLabel = this.builder.freshLabel('foreach_array_check')
    const bodyLabel = this.builder.freshLabel('foreach_array_body')
    const exitLabel = this.builder.freshLabel('foreach_array_exit')

    this.builder.emitJump(checkLabel)

    this.builder.startBlock(checkLabel)
    this.builder.emitCmp(condVar, { kind: 'var', name: indexVar }, '<', { kind: 'var', name: lengthVar })
    this.builder.emitJumpIf(condVar, bodyLabel, exitLabel)

    this.builder.startBlock(bodyLabel)
    const element = this.readArrayElement(arrayName, { kind: 'var', name: indexVar })
    this.builder.emitAssign(bindingVar, element)
    this.lowerBlock(stmt.body)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitRaw(`scoreboard players operation ${indexVar} rs += ${oneVar} rs`)
      this.builder.emitJump(checkLabel)
    }

    this.builder.startBlock(exitLabel)

    if (savedBinding) {
      this.varMap.set(stmt.binding, savedBinding)
    } else {
      this.varMap.delete(stmt.binding)
    }

    if (savedType) {
      this.varTypes.set(stmt.binding, savedType)
    } else {
      this.varTypes.delete(stmt.binding)
    }
  }

  private lowerAsBlockStmt(stmt: Extract<Stmt, { kind: 'as_block' }>): void {
    const selector = this.selectorToString(stmt.selector)
    const subFnName = `${this.currentFn}/as_${this.foreachCounter++}`

    this.builder.emitRaw(`execute as ${selector} run function ${this.namespace}:${subFnName}`)

    // Create sub-function
    const savedBuilder = this.builder
    const savedVarMap = new Map(this.varMap)
    const savedBlockPosVars = new Map(this.blockPosVars)

    this.builder = new LoweringBuilder()
    this.varMap = new Map(savedVarMap)
    this.blockPosVars = new Map(savedBlockPosVars)

    this.builder.startBlock('entry')
    this.lowerBlock(stmt.body)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitReturn()
    }

    const subFn = this.builder.build(subFnName, [], false)
    this.functions.push(subFn)

    this.builder = savedBuilder
    this.varMap = savedVarMap
    this.blockPosVars = savedBlockPosVars
  }

  private lowerAtBlockStmt(stmt: Extract<Stmt, { kind: 'at_block' }>): void {
    const selector = this.selectorToString(stmt.selector)
    const subFnName = `${this.currentFn}/at_${this.foreachCounter++}`

    this.builder.emitRaw(`execute at ${selector} run function ${this.namespace}:${subFnName}`)

    // Create sub-function
    const savedBuilder = this.builder
    const savedVarMap = new Map(this.varMap)
    const savedBlockPosVars = new Map(this.blockPosVars)

    this.builder = new LoweringBuilder()
    this.varMap = new Map(savedVarMap)
    this.blockPosVars = new Map(savedBlockPosVars)

    this.builder.startBlock('entry')
    this.lowerBlock(stmt.body)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitReturn()
    }

    const subFn = this.builder.build(subFnName, [], false)
    this.functions.push(subFn)

    this.builder = savedBuilder
    this.varMap = savedVarMap
    this.blockPosVars = savedBlockPosVars
  }

  private lowerAsAtStmt(stmt: Extract<Stmt, { kind: 'as_at' }>): void {
    const asSel = this.selectorToString(stmt.as_sel)
    const atSel = this.selectorToString(stmt.at_sel)
    const subFnName = `${this.currentFn}/as_at_${this.foreachCounter++}`

    this.builder.emitRaw(`execute as ${asSel} at ${atSel} run function ${this.namespace}:${subFnName}`)

    // Create sub-function
    const savedBuilder = this.builder
    const savedVarMap = new Map(this.varMap)
    const savedBlockPosVars = new Map(this.blockPosVars)

    this.builder = new LoweringBuilder()
    this.varMap = new Map(savedVarMap)
    this.blockPosVars = new Map(savedBlockPosVars)

    this.builder.startBlock('entry')
    this.lowerBlock(stmt.body)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitReturn()
    }

    const subFn = this.builder.build(subFnName, [], false)
    this.functions.push(subFn)

    this.builder = savedBuilder
    this.varMap = savedVarMap
    this.blockPosVars = savedBlockPosVars
  }

  private lowerExecuteStmt(stmt: Extract<Stmt, { kind: 'execute' }>): void {
    // Build the execute prefix from subcommands
    const parts: string[] = ['execute']
    for (const sub of stmt.subcommands) {
      switch (sub.kind) {
        case 'as':
          parts.push(`as ${this.selectorToString(sub.selector)}`)
          break
        case 'at':
          parts.push(`at ${this.selectorToString(sub.selector)}`)
          break
        case 'if_entity':
          parts.push(`if entity ${this.selectorToString(sub.selector)}`)
          break
        case 'unless_entity':
          parts.push(`unless entity ${this.selectorToString(sub.selector)}`)
          break
        case 'in':
          parts.push(`in ${sub.dimension}`)
          break
      }
    }

    const subFnName = `${this.currentFn}/exec_${this.foreachCounter++}`
    this.builder.emitRaw(`${parts.join(' ')} run function ${this.namespace}:${subFnName}`)

    // Create sub-function for the body
    const savedBuilder = this.builder
    const savedVarMap = new Map(this.varMap)
    const savedBlockPosVars = new Map(this.blockPosVars)

    this.builder = new LoweringBuilder()
    this.varMap = new Map(savedVarMap)
    this.blockPosVars = new Map(savedBlockPosVars)

    this.builder.startBlock('entry')
    this.lowerBlock(stmt.body)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitReturn()
    }

    const subFn = this.builder.build(subFnName, [], false)
    this.functions.push(subFn)

    this.builder = savedBuilder
    this.varMap = savedVarMap
    this.blockPosVars = savedBlockPosVars
  }

  // -------------------------------------------------------------------------
  // Expression Lowering
  // -------------------------------------------------------------------------

  private lowerExpr(expr: Expr): Operand {
    switch (expr.kind) {
      case 'int_lit':
        return { kind: 'const', value: expr.value }

      case 'float_lit':
        // Float stored as fixed-point × 1000
        return { kind: 'const', value: Math.round(expr.value * 1000) }

      case 'bool_lit':
        return { kind: 'const', value: expr.value ? 1 : 0 }

      case 'str_lit':
        // Strings are handled inline in builtins
        return { kind: 'const', value: 0 } // Placeholder

      case 'str_interp':
        // Interpolated strings are handled inline in message builtins.
        return { kind: 'const', value: 0 }

      case 'range_lit':
        // Ranges are handled in context (selectors, etc.)
        return { kind: 'const', value: 0 }

      case 'blockpos':
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

      case 'member':
        if (expr.obj.kind === 'ident' && this.enumDefs.has(expr.obj.name)) {
          const variants = this.enumDefs.get(expr.obj.name)!
          const value = variants.get(expr.field)
          if (value === undefined) {
            throw new Error(`Unknown enum variant ${expr.obj.name}.${expr.field}`)
          }
          return { kind: 'const', value }
        }
        return this.lowerMemberExpr(expr)

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

      case 'member_assign':
        return this.lowerMemberAssign(expr)

      case 'index':
        return this.lowerIndexExpr(expr)

      case 'struct_lit':
        // Struct literals should be handled in let statement
        return { kind: 'const', value: 0 }

      case 'array_lit':
        // Array literals should be handled in let statement
        return { kind: 'const', value: 0 }
    }

    throw new Error(`Unhandled expression kind: ${(expr as { kind: string }).kind}`)
  }

  private lowerMemberExpr(expr: Extract<Expr, { kind: 'member' }>): Operand {
    // Check if this is a struct field access
    if (expr.obj.kind === 'ident') {
      const varType = this.varTypes.get(expr.obj.name)

      // Check for world object handle (entity selector)
      const mapped = this.varMap.get(expr.obj.name)
      if (mapped && mapped.startsWith('@e[tag=__rs_obj_')) {
        // World object field access → scoreboard get
        const dst = this.builder.freshTemp()
        this.builder.emitRaw(`scoreboard players operation ${dst} rs = ${mapped} rs`)
        return { kind: 'var', name: dst }
      }

      if (varType?.kind === 'struct') {
        const structName = varType.name.toLowerCase()
        const path = `rs:heap ${structName}_${expr.obj.name}.${expr.field}`
        const dst = this.builder.freshTemp()
        // Read from NBT storage into scoreboard
        this.builder.emitRaw(`execute store result score ${dst} rs run data get storage ${path}`)
        return { kind: 'var', name: dst }
      }

      // Array length property
      if (varType?.kind === 'array' && expr.field === 'len') {
        const dst = this.builder.freshTemp()
        this.builder.emitRaw(`execute store result score ${dst} rs run data get storage rs:heap ${expr.obj.name}`)
        return { kind: 'var', name: dst }
      }
    }

    // Default behavior: simple member access
    return { kind: 'var', name: `$${(expr.obj as any).name}_${expr.field}` }
  }

  private lowerMemberAssign(expr: Extract<Expr, { kind: 'member_assign' }>): Operand {
    if (expr.obj.kind === 'ident') {
      const varType = this.varTypes.get(expr.obj.name)

      // Check for world object handle
      const mapped = this.varMap.get(expr.obj.name)
      if (mapped && mapped.startsWith('@e[tag=__rs_obj_')) {
        const value = this.lowerExpr(expr.value)
        if (expr.op === '=') {
          if (value.kind === 'const') {
            this.builder.emitRaw(`scoreboard players set ${mapped} rs ${value.value}`)
          } else if (value.kind === 'var') {
            this.builder.emitRaw(`scoreboard players operation ${mapped} rs = ${value.name} rs`)
          }
        } else {
          // Compound assignment
          const binOp = expr.op.slice(0, -1)
          const opMap: Record<string, string> = { '+': '+=', '-': '-=', '*': '*=', '/': '/=', '%': '%=' }
          if (value.kind === 'const') {
            const constTemp = this.builder.freshTemp()
            this.builder.emitAssign(constTemp, value)
            this.builder.emitRaw(`scoreboard players operation ${mapped} rs ${opMap[binOp]} ${constTemp} rs`)
          } else if (value.kind === 'var') {
            this.builder.emitRaw(`scoreboard players operation ${mapped} rs ${opMap[binOp]} ${value.name} rs`)
          }
        }
        return { kind: 'const', value: 0 }
      }

      if (varType?.kind === 'struct') {
        const structName = varType.name.toLowerCase()
        const path = `rs:heap ${structName}_${expr.obj.name}.${expr.field}`
        const value = this.lowerExpr(expr.value)

        if (expr.op === '=') {
          if (value.kind === 'const') {
            this.builder.emitRaw(`data modify storage ${path} set value ${value.value}`)
          } else if (value.kind === 'var') {
            this.builder.emitRaw(`execute store result storage ${path} int 1 run scoreboard players get ${value.name} rs`)
          }
        } else {
          // Compound assignment: read, modify, write back
          const dst = this.builder.freshTemp()
          this.builder.emitRaw(`execute store result score ${dst} rs run data get storage ${path}`)
          const binOp = expr.op.slice(0, -1)
          this.builder.emitBinop(dst, { kind: 'var', name: dst }, binOp as any, value)
          this.builder.emitRaw(`execute store result storage ${path} int 1 run scoreboard players get ${dst} rs`)
        }
        return { kind: 'const', value: 0 }
      }
    }

    // Default: simple assignment
    const varName = `$${(expr.obj as any).name}_${expr.field}`
    const value = this.lowerExpr(expr.value)
    this.builder.emitAssign(varName, value)
    return { kind: 'var', name: varName }
  }

  private lowerIndexExpr(expr: Extract<Expr, { kind: 'index' }>): Operand {
    const arrayName = this.getArrayStorageName(expr.obj)
    if (arrayName) {
      return this.readArrayElement(arrayName, this.lowerExpr(expr.index))
    }
    return { kind: 'const', value: 0 }
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
      // Check if this is float arithmetic
      const isFloatOp = this.isFloatExpr(expr.left) || this.isFloatExpr(expr.right)
      
      if (isFloatOp && (expr.op === '*' || expr.op === '/')) {
        // Float multiplication: a * b / 1000
        // Float division: a * 1000 / b
        if (expr.op === '*') {
          this.builder.emitBinop(dst, left, '*', right)
          // Divide by 1000 to correct for double scaling
          const constDiv = this.builder.freshTemp()
          this.builder.emitAssign(constDiv, { kind: 'const', value: 1000 })
          this.builder.emitRaw(`scoreboard players operation ${dst} rs /= ${constDiv} rs`)
        } else {
          // Division: a * 1000 / b
          const constMul = this.builder.freshTemp()
          this.builder.emitAssign(constMul, { kind: 'const', value: 1000 })
          this.builder.emitAssign(dst, left)
          this.builder.emitRaw(`scoreboard players operation ${dst} rs *= ${constMul} rs`)
          const rightVar = this.operandToVar(right)
          this.builder.emitRaw(`scoreboard players operation ${dst} rs /= ${rightVar} rs`)
        }
        return { kind: 'var', name: dst }
      }
      
      this.builder.emitBinop(dst, left, expr.op as BinOp, right)
    }

    return { kind: 'var', name: dst }
  }

  private isFloatExpr(expr: Expr): boolean {
    if (expr.kind === 'float_lit') return true
    if (expr.kind === 'ident') {
      return this.floatVars.has(expr.name)
    }
    if (expr.kind === 'binary') {
      return this.isFloatExpr(expr.left) || this.isFloatExpr(expr.right)
    }
    return false
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
    const blockPosValue = this.resolveBlockPosExpr(expr.value)
    if (blockPosValue) {
      this.blockPosVars.set(expr.target, blockPosValue)
      return { kind: 'const', value: 0 }
    }

    this.blockPosVars.delete(expr.target)
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

    // Handle entity methods: __entity_tag, __entity_untag, __entity_has_tag
    if (expr.fn === '__entity_tag') {
      const entity = this.exprToString(expr.args[0])
      const tagName = this.exprToString(expr.args[1])
      this.builder.emitRaw(`tag ${entity} add ${tagName}`)
      return { kind: 'const', value: 0 }
    }

    if (expr.fn === '__entity_untag') {
      const entity = this.exprToString(expr.args[0])
      const tagName = this.exprToString(expr.args[1])
      this.builder.emitRaw(`tag ${entity} remove ${tagName}`)
      return { kind: 'const', value: 0 }
    }

    if (expr.fn === '__entity_has_tag') {
      const entity = this.exprToString(expr.args[0])
      const tagName = this.exprToString(expr.args[1])
      const dst = this.builder.freshTemp()
      this.builder.emitRaw(`execute store result score ${dst} rs if entity ${entity}[tag=${tagName}]`)
      return { kind: 'var', name: dst }
    }

    // Handle array push
    if (expr.fn === '__array_push') {
      const arrExpr = expr.args[0]
      const valueExpr = expr.args[1]
      const arrName = this.getArrayStorageName(arrExpr)
      if (arrName) {
        const value = this.lowerExpr(valueExpr)
        if (value.kind === 'const') {
          this.builder.emitRaw(`data modify storage rs:heap ${arrName} append value ${value.value}`)
        } else if (value.kind === 'var') {
          this.builder.emitRaw(`data modify storage rs:heap ${arrName} append value 0`)
          this.builder.emitRaw(`execute store result storage rs:heap ${arrName}[-1] int 1 run scoreboard players get ${value.name} rs`)
        }
      }
      return { kind: 'const', value: 0 }
    }

    if (expr.fn === '__array_pop') {
      const arrName = this.getArrayStorageName(expr.args[0])
      const dst = this.builder.freshTemp()
      if (arrName) {
        this.builder.emitRaw(`execute store result score ${dst} rs run data get storage rs:heap ${arrName}[-1]`)
        this.builder.emitRaw(`data remove storage rs:heap ${arrName}[-1]`)
      } else {
        this.builder.emitAssign(dst, { kind: 'const', value: 0 })
      }
      return { kind: 'var', name: dst }
    }

    // Handle spawn_object - creates world object (invisible armor stand)
    if (expr.fn === 'spawn_object') {
      const x = this.exprToString(expr.args[0])
      const y = this.exprToString(expr.args[1])
      const z = this.exprToString(expr.args[2])
      const tag = `__rs_obj_${this.worldObjCounter++}`
      this.builder.emitRaw(`summon minecraft:armor_stand ${x} ${y} ${z} {Invisible:1b,Marker:1b,NoGravity:1b,Tags:["${tag}"]}`)
      // Return a selector pointing to this entity
      const selector = `@e[tag=${tag},limit=1]`
      return { kind: 'var', name: selector }
    }

    // Handle kill for world objects
    if (expr.fn === 'kill' && expr.args.length === 1 && expr.args[0].kind === 'ident') {
      const mapped = this.varMap.get(expr.args[0].name)
      if (mapped && mapped.startsWith('@e[tag=__rs_obj_')) {
        this.builder.emitRaw(`kill ${mapped}`)
        return { kind: 'const', value: 0 }
      }
    }

    // Regular function call
    const defaultArgs = this.functionDefaults.get(expr.fn) ?? []
    const fullArgs = [...expr.args]
    for (let i = fullArgs.length; i < defaultArgs.length; i++) {
      const defaultExpr = defaultArgs[i]
      if (!defaultExpr) {
        break
      }
      fullArgs.push(defaultExpr)
    }

    const args: Operand[] = fullArgs.map(arg => this.lowerExpr(arg))
    const dst = this.builder.freshTemp()
    this.builder.emitCall(expr.fn, args, dst)
    return { kind: 'var', name: dst }
  }

  private lowerBuiltinCall(name: string, args: Expr[]): Operand {
    const richTextCommand = this.lowerRichTextBuiltin(name, args)
    if (richTextCommand) {
      this.builder.emitRaw(richTextCommand)
      return { kind: 'const', value: 0 }
    }

    // Special case: random
    if (name === 'random') {
      const dst = this.builder.freshTemp()
      const min = args[0] ? this.exprToLiteral(args[0]) : '0'
      const max = args[1] ? this.exprToLiteral(args[1]) : '100'
      this.builder.emitRaw(`execute store result score ${dst} rs run random value ${min}..${max}`)
      return { kind: 'var', name: dst }
    }

    // Special case: scoreboard_get / score — read from vanilla MC scoreboard
    if (name === 'scoreboard_get' || name === 'score') {
      const dst = this.builder.freshTemp()
      const player = this.exprToString(args[0])
      const objective = this.exprToString(args[1])
      this.builder.emitRaw(`execute store result score ${dst} rs run scoreboard players get ${player} ${objective}`)
      return { kind: 'var', name: dst }
    }

    // Special case: scoreboard_set — write to vanilla MC scoreboard
    if (name === 'scoreboard_set') {
      const player = this.exprToString(args[0])
      const objective = this.exprToString(args[1])
      const value = this.lowerExpr(args[2])
      if (value.kind === 'const') {
        this.builder.emitRaw(`scoreboard players set ${player} ${objective} ${value.value}`)
      } else if (value.kind === 'var') {
        // Read directly from the computed scoreboard temp. Routing through a fresh
        // temp here breaks once optimization removes the apparently-dead assign.
        this.builder.emitRaw(`execute store result score ${player} ${objective} run scoreboard players get ${value.name} rs`)
      }
      return { kind: 'const', value: 0 }
    }

    // Special case: data_get — read NBT data into a variable
    // data_get(target_type, target, path, scale?)
    // target_type: "entity", "block", "storage"
    if (name === 'data_get') {
      const dst = this.builder.freshTemp()
      const targetType = this.exprToString(args[0])
      const target = this.exprToString(args[1])
      const path = this.exprToString(args[2])
      const scale = args[3] ? this.exprToString(args[3]) : '1'
      this.builder.emitRaw(`execute store result score ${dst} rs run data get ${targetType} ${target} ${path} ${scale}`)
      return { kind: 'var', name: dst }
    }

    const coordCommand = this.lowerCoordinateBuiltin(name, args)
    if (coordCommand) {
      this.builder.emitRaw(coordCommand)
      return { kind: 'const', value: 0 }
    }

    // Convert args to strings for builtin
    const strArgs = args.map(arg => this.exprToString(arg))
    const cmd = BUILTINS[name](strArgs)
    if (cmd) {
      this.builder.emitRaw(cmd)
    }

    return { kind: 'const', value: 0 }
  }

  private lowerRichTextBuiltin(name: string, args: Expr[]): string | null {
    const messageArgIndex = this.getRichTextArgIndex(name)
    if (messageArgIndex === null) {
      return null
    }

    const messageExpr = args[messageArgIndex]
    if (!messageExpr || messageExpr.kind !== 'str_interp') {
      return null
    }

    const json = this.buildRichTextJson(messageExpr)

    switch (name) {
      case 'say':
      case 'announce':
        return `tellraw @a ${json}`
      case 'tell':
        return `tellraw ${this.exprToString(args[0])} ${json}`
      case 'title':
        return `title ${this.exprToString(args[0])} title ${json}`
      case 'actionbar':
        return `title ${this.exprToString(args[0])} actionbar ${json}`
      case 'subtitle':
        return `title ${this.exprToString(args[0])} subtitle ${json}`
      default:
        return null
    }
  }

  private getRichTextArgIndex(name: string): number | null {
    switch (name) {
      case 'say':
      case 'announce':
        return 0
      case 'tell':
      case 'title':
      case 'actionbar':
      case 'subtitle':
        return 1
      default:
        return null
    }
  }

  private buildRichTextJson(expr: Extract<Expr, { kind: 'str_interp' }>): string {
    const components: Array<string | Record<string, unknown>> = ['']

    for (const part of expr.parts) {
      if (typeof part === 'string') {
        if (part.length > 0) {
          components.push({ text: part })
        }
        continue
      }

      this.appendRichTextExpr(components, part)
    }

    return JSON.stringify(components)
  }

  private appendRichTextExpr(components: Array<string | Record<string, unknown>>, expr: Expr): void {
    if (expr.kind === 'str_lit') {
      if (expr.value.length > 0) {
        components.push({ text: expr.value })
      }
      return
    }

    if (expr.kind === 'str_interp') {
      for (const part of expr.parts) {
        if (typeof part === 'string') {
          if (part.length > 0) {
            components.push({ text: part })
          }
        } else {
          this.appendRichTextExpr(components, part)
        }
      }
      return
    }

    if (expr.kind === 'bool_lit') {
      components.push({ text: expr.value ? 'true' : 'false' })
      return
    }

    if (expr.kind === 'int_lit') {
      components.push({ text: expr.value.toString() })
      return
    }

    if (expr.kind === 'float_lit') {
      components.push({ text: expr.value.toString() })
      return
    }

    const operand = this.lowerExpr(expr)
    if (operand.kind === 'const') {
      components.push({ text: operand.value.toString() })
      return
    }

    components.push({ score: { name: this.operandToVar(operand), objective: 'rs' } })
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
      case 'str_interp':
        return this.buildRichTextJson(expr)
      case 'blockpos':
        return emitBlockPos(expr)
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

  private lowerCoordinateBuiltin(name: string, args: Expr[]): string | null {
    const pos0 = args[0] ? this.resolveBlockPosExpr(args[0]) : null
    const pos1 = args[1] ? this.resolveBlockPosExpr(args[1]) : null
    const pos2 = args[2] ? this.resolveBlockPosExpr(args[2]) : null

    if (name === 'setblock') {
      if (args.length === 2 && pos0) {
        return `setblock ${emitBlockPos(pos0)} ${this.exprToString(args[1])}`
      }
      return null
    }

    if (name === 'fill') {
      if (args.length === 3 && pos0 && pos1) {
        return `fill ${emitBlockPos(pos0)} ${emitBlockPos(pos1)} ${this.exprToString(args[2])}`
      }
      return null
    }

    if (name === 'clone') {
      if (args.length === 3 && pos0 && pos1 && pos2) {
        return `clone ${emitBlockPos(pos0)} ${emitBlockPos(pos1)} ${emitBlockPos(pos2)}`
      }
      return null
    }

    if (name === 'tp') {
      if (args.length === 2 && pos1) {
        return `tp ${this.exprToString(args[0])} ${emitBlockPos(pos1)}`
      }
      return null
    }

    if (name === 'tp_to') {
      if (args.length === 1 && pos0) {
        return `tp ${emitBlockPos(pos0)}`
      }
      if (args.length === 2 && pos1) {
        return `tp ${this.exprToString(args[0])} ${emitBlockPos(pos1)}`
      }
      return null
    }

    return null
  }

  private resolveBlockPosExpr(expr: Expr): BlockPosExpr | null {
    if (expr.kind === 'blockpos') {
      return expr
    }
    if (expr.kind === 'ident') {
      return this.blockPosVars.get(expr.name) ?? null
    }
    return null
  }

  private getArrayStorageName(expr: Expr): string | null {
    if (expr.kind === 'ident') {
      return expr.name
    }
    return null
  }

  private inferExprType(expr: Expr): TypeNode | undefined {
    if (expr.kind === 'ident') {
      return this.varTypes.get(expr.name)
    }
    if (expr.kind === 'member' && expr.obj.kind === 'ident' && this.enumDefs.has(expr.obj.name)) {
      return { kind: 'enum', name: expr.obj.name }
    }
    return undefined
  }

  private normalizeType(type: TypeNode): TypeNode {
    if (type.kind === 'array') {
      return { kind: 'array', elem: this.normalizeType(type.elem) }
    }
    if ((type.kind === 'struct' || type.kind === 'enum') && this.enumDefs.has(type.name)) {
      return { kind: 'enum', name: type.name }
    }
    return type
  }

  private readArrayElement(arrayName: string, index: Operand): Operand {
    const dst = this.builder.freshTemp()

    if (index.kind === 'const') {
      this.builder.emitRaw(`execute store result score ${dst} rs run data get storage rs:heap ${arrayName}[${index.value}]`)
      return { kind: 'var', name: dst }
    }

    const macroKey = `__rs_index_${this.foreachCounter++}`
    const subFnName = `${this.currentFn}/array_get_${this.foreachCounter++}`
    const indexVar = index.kind === 'var' ? index.name : this.operandToVar(index)
    this.builder.emitRaw(`execute store result storage rs:heap ${macroKey} int 1 run scoreboard players get ${indexVar} rs`)
    this.builder.emitRaw(`function ${this.namespace}:${subFnName} with storage rs:heap`)
    this.emitRawSubFunction(
      subFnName,
      `$execute store result score ${dst} rs run data get storage rs:heap ${arrayName}[$(${macroKey})]`
    )
    return { kind: 'var', name: dst }
  }

  private emitRawSubFunction(name: string, ...commands: string[]): void {
    const builder = new LoweringBuilder()
    builder.startBlock('entry')
    for (const cmd of commands) {
      builder.emitRaw(cmd)
    }
    builder.emitReturn()
    this.functions.push(builder.build(name, [], false))
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
