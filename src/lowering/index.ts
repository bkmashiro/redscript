/**
 * RedScript Lowering
 *
 * Transforms AST into IR (Three-Address Code).
 * Handles control flow, function extraction for foreach, and builtin calls.
 */

import type { IRBuilder } from '../ir/builder'
import { buildModule } from '../ir/builder'
import type { IRFunction, IRModule, Operand, BinOp, CmpOp } from '../ir/types'
import { DiagnosticError } from '../diagnostics'
import type { SourceRange } from '../compile'
import type {
  Block, ConstDecl, Decorator, EntitySelector, Expr, FnDecl, GlobalDecl, Program, RangeExpr, Span, Stmt,
  StructDecl, TypeNode, ExecuteSubcommand, BlockPosExpr, CoordComponent, EntityTypeName
} from '../ast/types'
import type { GlobalVar } from '../ir/types'
import * as path from 'path'
import { EVENT_TYPES, getEventParamSpecs, isEventTypeName } from '../events/types'
import { getBaseSelectorType, areCompatibleTypes, getConcreteSubtypes } from '../types/entity-hierarchy'

// ---------------------------------------------------------------------------
// Macro-aware builtins (MC 1.20.2+)
// These builtins generate commands where parameter variables cannot appear
// as literal values (coordinates, entity types, block types), so they
// require MC macro syntax when called with runtime variables.
// ---------------------------------------------------------------------------

// All builtins support macro parameters - any arg that's a function param
// will automatically use MC 1.20.2+ macro syntax when needed

// ---------------------------------------------------------------------------
// Builtin Functions
// ---------------------------------------------------------------------------

const BUILTINS: Record<string, (args: string[]) => string | null> = {
  say:         ([msg]) => `say ${msg}`,
  tell:        ([sel, msg]) => `tellraw ${sel} {"text":"${msg}"}`,
  tellraw:     ([sel, msg]) => `tellraw ${sel} {"text":"${msg}"}`,
  title:       ([sel, msg]) => `title ${sel} title {"text":"${msg}"}`,
  actionbar:   ([sel, msg]) => `title ${sel} actionbar {"text":"${msg}"}`,
  subtitle:    ([sel, msg]) => `title ${sel} subtitle {"text":"${msg}"}`,
  title_times: ([sel, fadeIn, stay, fadeOut]) => `title ${sel} times ${fadeIn} ${stay} ${fadeOut}`,
  announce:    ([msg]) => `tellraw @a {"text":"${msg}"}`,
  give:        ([sel, item, count, nbt]) => nbt ? `give ${sel} ${item}${nbt} ${count ?? '1'}` : `give ${sel} ${item} ${count ?? '1'}`,
  kill:        ([sel]) => `kill ${sel ?? '@s'}`,
  effect:       ([sel, eff, dur, amp]) => `effect give ${sel} ${eff} ${dur ?? '30'} ${amp ?? '0'}`,
  effect_clear: ([sel, eff]) => eff ? `effect clear ${sel} ${eff}` : `effect clear ${sel}`,
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
  tp:         () => null, // Special handling
  tp_to:      () => null, // Special handling (deprecated alias)
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
  random_native: () => null, // Special handling
  random_sequence: () => null, // Special handling
  scoreboard_get: () => null, // Special handling (returns value)
  scoreboard_set: () => null, // Special handling
  score: () => null, // Special handling (same as scoreboard_get)
  scoreboard_display: () => null, // Special handling
  scoreboard_hide: () => null, // Special handling
  scoreboard_add_objective: () => null, // Special handling
  scoreboard_remove_objective: () => null, // Special handling
  bossbar_add: () => null, // Special handling
  bossbar_set_value: () => null, // Special handling
  bossbar_set_max: () => null, // Special handling
  bossbar_set_color: () => null, // Special handling
  bossbar_set_style: () => null, // Special handling
  bossbar_set_visible: () => null, // Special handling
  bossbar_set_players: () => null, // Special handling
  bossbar_remove: () => null, // Special handling
  bossbar_get_value: () => null, // Special handling
  team_add: () => null, // Special handling
  team_remove: () => null, // Special handling
  team_join: () => null, // Special handling
  team_leave: () => null, // Special handling
  team_option: () => null, // Special handling
  data_get: () => null, // Special handling (returns value from NBT)
  data_merge: () => null, // Special handling (merge NBT)
  set_new: () => null, // Special handling (returns set ID)
  set_add: () => null, // Special handling
  set_contains: () => null, // Special handling (returns 1/0)
  set_remove: () => null, // Special handling
  set_clear: () => null, // Special handling
  setTimeout: () => null, // Special handling
  setInterval: () => null, // Special handling
  clearInterval: () => null, // Special handling
  storage_get_int: () => null, // Special handling (dynamic NBT array read via macro)
  storage_set_array: () => null, // Special handling (write literal NBT array to storage)
}

export interface Warning {
  message: string
  code: string
  line?: number
  col?: number
}

interface StdlibCallSiteContext {
  filePath?: string
  line: number
  col: number
}

function getSpan(node: unknown): Span | undefined {
  return (node as { span?: Span } | undefined)?.span
}

const NAMESPACED_ENTITY_TYPE_RE = /^[a-z0-9_.-]+:[a-z0-9_./-]+$/
const BARE_ENTITY_TYPE_RE = /^[a-z0-9_./-]+$/

const ENTITY_TO_MC_TYPE: Partial<Record<EntityTypeName, string>> = {
  Player: 'minecraft:player',
  Zombie: 'minecraft:zombie',
  Skeleton: 'minecraft:skeleton',
  Creeper: 'minecraft:creeper',
  Spider: 'minecraft:spider',
  Enderman: 'minecraft:enderman',
  Blaze: 'minecraft:blaze',
  Witch: 'minecraft:witch',
  Slime: 'minecraft:slime',
  ZombieVillager: 'minecraft:zombie_villager',
  Husk: 'minecraft:husk',
  Drowned: 'minecraft:drowned',
  Stray: 'minecraft:stray',
  WitherSkeleton: 'minecraft:wither_skeleton',
  CaveSpider: 'minecraft:cave_spider',
  Pig: 'minecraft:pig',
  Cow: 'minecraft:cow',
  Sheep: 'minecraft:sheep',
  Chicken: 'minecraft:chicken',
  Villager: 'minecraft:villager',
  WanderingTrader: 'minecraft:wandering_trader',
  ArmorStand: 'minecraft:armor_stand',
  Item: 'minecraft:item',
  Arrow: 'minecraft:arrow',
}

function normalizeSelector(selector: string, warnings: Warning[]): string {
  return selector.replace(/type=([^,\]]+)/g, (match, entityType) => {
    const trimmed = entityType.trim()

    if (trimmed.includes(':')) {
      if (!NAMESPACED_ENTITY_TYPE_RE.test(trimmed)) {
        throw new DiagnosticError(
          'LoweringError',
          `Invalid entity type format: "${trimmed}" (must be namespace:name)`,
          { line: 1, col: 1 }
        )
      }
      return match
    }

    if (!BARE_ENTITY_TYPE_RE.test(trimmed)) {
      throw new DiagnosticError(
        'LoweringError',
        `Invalid entity type format: "${trimmed}" (must be namespace:name or bare_name)`,
        { line: 1, col: 1 }
      )
    }

    warnings.push({
      message: `Unnamespaced entity type "${trimmed}", auto-qualifying to "minecraft:${trimmed}"`,
      code: 'W_UNNAMESPACED_TYPE',
    })
    return `type=minecraft:${trimmed}`
  })
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
  private readonly sourceRanges: SourceRange[]
  private functions: IRFunction[] = []
  private globals: GlobalVar[] = []
  private globalNames: Map<string, { mutable: boolean }> = new Map()
  private fnDecls: Map<string, FnDecl> = new Map()
  private implMethods: Map<string, Map<string, { fn: FnDecl; loweredName: string }>> = new Map()
  private specializedFunctions: Map<string, string> = new Map()
  private currentFn: string = ''
  private currentStdlibCallSite?: StdlibCallSiteContext
  private foreachCounter: number = 0
  private lambdaCounter: number = 0
  private timeoutCounter: number = 0
  private intervalCounter: number = 0
  readonly warnings: Warning[] = []

  // Entity type context stack for W_IMPOSSIBLE_AS warnings
  private entityContextStack: string[] = []

  private currentEntityContext(): string {
    return this.entityContextStack.length > 0
      ? this.entityContextStack[this.entityContextStack.length - 1]
      : 'Entity'
  }

  // Builder state for current function
  private builder!: LoweringBuilder
  private varMap: Map<string, string> = new Map()
  private lambdaBindings: Map<string, string> = new Map()
  private intervalBindings: Map<string, string> = new Map()
  private intervalFunctions: Map<number, string> = new Map()
  private currentCallbackBindings: Map<string, string> = new Map()
  private currentContext: { binding?: string } = {}
  private blockPosVars: Map<string, BlockPosExpr> = new Map()

  // Struct definitions: name → { fieldName: TypeNode }
  private structDefs: Map<string, Map<string, TypeNode>> = new Map()
  // Full struct declarations for field iteration
  private structDecls: Map<string, StructDecl> = new Map()
  private enumDefs: Map<string, Map<string, number>> = new Map()
  private functionDefaults: Map<string, Array<Expr | undefined>> = new Map()
  private constValues: Map<string, ConstDecl['value']> = new Map()
  private stringValues: Map<string, string> = new Map()
  // Variable types: varName → TypeNode
  private varTypes: Map<string, TypeNode> = new Map()
  // Float variables (stored as fixed-point × 1000)
  private floatVars: Set<string> = new Set()
  // World object counter for unique tags
  private worldObjCounter: number = 0

  // Loop context stack for break/continue
  private loopStack: Array<{ breakLabel: string; continueLabel: string; stepFn?: () => void }> = []

  // MC 1.20.2+ macro function support
  // Names of params in the current function being lowered
  private currentFnParamNames: Set<string> = new Set()
  // Params in the current function that need macro treatment (used in literal positions)
  private currentFnMacroParams: Set<string> = new Set()
  // Global registry: fnName → macroParamNames (populated by pre-scan + lowering)
  private macroFunctionInfo: Map<string, string[]> = new Map()

  constructor(namespace: string, sourceRanges: SourceRange[] = []) {
    this.namespace = namespace
    this.sourceRanges = sourceRanges
    LoweringBuilder.resetTempCounter()
  }

  // ---------------------------------------------------------------------------
  // MC Macro pre-scan: identify which function params need macro treatment
  // ---------------------------------------------------------------------------

  private preScanMacroFunctions(program: Program): void {
    for (const fn of program.declarations) {
      const paramNames = new Set(fn.params.map(p => p.name))
      const macroParams = new Set<string>()
      this.preScanStmts(fn.body, paramNames, macroParams)
      if (macroParams.size > 0) {
        this.macroFunctionInfo.set(fn.name, [...macroParams])
      }
    }
    for (const implBlock of program.implBlocks ?? []) {
      for (const method of implBlock.methods) {
        const paramNames = new Set(method.params.map(p => p.name))
        const macroParams = new Set<string>()
        this.preScanStmts(method.body, paramNames, macroParams)
        if (macroParams.size > 0) {
          this.macroFunctionInfo.set(`${implBlock.typeName}_${method.name}`, [...macroParams])
        }
      }
    }
  }

  private preScanStmts(stmts: Block, paramNames: Set<string>, macroParams: Set<string>): void {
    for (const stmt of stmts) {
      this.preScanStmt(stmt, paramNames, macroParams)
    }
  }

  private preScanStmt(stmt: Stmt, paramNames: Set<string>, macroParams: Set<string>): void {
    switch (stmt.kind) {
      case 'expr':
        this.preScanExpr(stmt.expr, paramNames, macroParams)
        break
      case 'let':
        this.preScanExpr(stmt.init, paramNames, macroParams)
        break
      case 'return':
        if (stmt.value) this.preScanExpr(stmt.value, paramNames, macroParams)
        break
      case 'if':
        this.preScanExpr(stmt.cond, paramNames, macroParams)
        this.preScanStmts(stmt.then, paramNames, macroParams)
        if (stmt.else_) this.preScanStmts(stmt.else_, paramNames, macroParams)
        break
      case 'while':
        this.preScanExpr(stmt.cond, paramNames, macroParams)
        this.preScanStmts(stmt.body, paramNames, macroParams)
        break
      case 'for':
        if (stmt.init) this.preScanStmt(stmt.init, paramNames, macroParams)
        this.preScanExpr(stmt.cond, paramNames, macroParams)
        this.preScanStmts(stmt.body, paramNames, macroParams)
        break
      case 'for_range':
        this.preScanStmts(stmt.body, paramNames, macroParams)
        break
      case 'foreach':
        this.preScanStmts(stmt.body, paramNames, macroParams)
        break
      case 'match':
        this.preScanExpr(stmt.expr, paramNames, macroParams)
        for (const arm of stmt.arms) {
          this.preScanStmts(arm.body, paramNames, macroParams)
        }
        break
      case 'as_block':
      case 'at_block':
        this.preScanStmts(stmt.body, paramNames, macroParams)
        break
      case 'execute':
        this.preScanStmts(stmt.body, paramNames, macroParams)
        break
      // raw, break, continue have no nested exprs of interest
    }
  }

  private preScanExpr(expr: Expr, paramNames: Set<string>, macroParams: Set<string>): void {
    if (expr.kind === 'call' && BUILTINS[expr.fn] !== undefined) {
      // All ident args to macro-aware builtins that are params → macro params
      for (const arg of expr.args) {
        if (arg.kind === 'ident' && paramNames.has(arg.name)) {
          macroParams.add(arg.name)
        }
      }
      return
    }
    // Recurse into sub-expressions for other call types
    if (expr.kind === 'call') {
      for (const arg of expr.args) this.preScanExpr(arg, paramNames, macroParams)
    } else if (expr.kind === 'binary') {
      this.preScanExpr(expr.left, paramNames, macroParams)
      this.preScanExpr(expr.right, paramNames, macroParams)
    } else if (expr.kind === 'unary') {
      this.preScanExpr(expr.operand, paramNames, macroParams)
    } else if (expr.kind === 'assign') {
      this.preScanExpr(expr.value, paramNames, macroParams)
    }
  }

  // ---------------------------------------------------------------------------
  // Macro helpers
  // ---------------------------------------------------------------------------

  /**
   * If `expr` is a function parameter that needs macro treatment (runtime value
   * used in a literal position), returns the param name; otherwise null.
   */
  private tryGetMacroParam(expr: Expr): string | null {
    if (expr.kind !== 'ident') return null
    if (!this.currentFnParamNames.has(expr.name)) return null
    if (this.constValues.has(expr.name)) return null
    if (this.stringValues.has(expr.name)) return null
    return expr.name
  }

  private tryGetMacroParamByName(name: string): string | null {
    if (!this.currentFnParamNames.has(name)) return null
    if (this.constValues.has(name)) return null
    if (this.stringValues.has(name)) return null
    return name
  }

  /**
   * Converts an expression to a string for use as a builtin arg.
   * If the expression is a macro param, returns `$(name)` and sets macroParam.
   */
  private exprToBuiltinArg(expr: Expr): { str: string; macroParam?: string } {
    const macroParam = this.tryGetMacroParam(expr)
    if (macroParam) {
      return { str: `$(${macroParam})`, macroParam }
    }
    // Handle ~ident / ^ident syntax — relative/local coord with a VARIABLE offset.
    //
    // WHY macros are required here:
    //   Minecraft's ~N and ^N coordinate syntax requires N to be a compile-time
    //   literal number. There is no command that accepts a scoreboard value as a
    //   relative offset. Therefore `~height` (where height is a runtime int) can
    //   only be expressed at the MC level via the 1.20.2+ function macro system,
    //   which substitutes $(height) into the command text at call time.
    //
    //   Contrast with absolute coords: `tp(target, x, y, z)` where x/y/z are
    //   plain ints — those become $(x) etc. as literal replacements, same mechanism,
    //   but the distinction matters to callers: ~$(height) means "relative by height
    //   blocks from current pos", not "teleport to absolute scoreboard value".
    //
    //   Example:
    //     fn launch_up(target: selector, height: int) {
    //       tp(target, ~0, ~height, ~0);   // "~height" parsed as rel_coord
    //     }
    //   Emits:  $tp $(target) ~0 ~$(height) ~0
    //   Called: function ns:launch_up with storage rs:macro_args
    if (expr.kind === 'rel_coord' || expr.kind === 'local_coord') {
      const val = expr.value  // e.g. "~height" or "^depth"
      const prefix = val[0]   // ~ or ^
      const rest = val.slice(1)
      // If rest is an identifier (not a number), treat as macro param
      if (rest && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(rest)) {
        const paramName = this.tryGetMacroParamByName(rest)
        if (paramName) {
          return { str: `${prefix}$(${paramName})`, macroParam: paramName }
        }
      }
    }
    if (expr.kind === 'struct_lit' || expr.kind === 'array_lit') {
      return { str: this.exprToSnbt(expr) }
    }
    return { str: this.exprToString(expr) }
  }

  /**
   * Emits a call to a macro function, setting up both scoreboard params
   * (for arithmetic use) and NBT macro args (for coordinate/literal use).
   */
  private emitMacroFunctionCall(
    fnName: string,
    args: Expr[],
    macroParamNames: string[],
    fnDecl: FnDecl | undefined,
  ): Operand {
    const params = fnDecl?.params ?? []
    const loweredArgs: Operand[] = args.map(arg => this.lowerExpr(arg))

    // Set up regular scoreboard params (for arithmetic within the function)
    for (let i = 0; i < loweredArgs.length; i++) {
      const operand = loweredArgs[i]
      if (operand.kind === 'const') {
        this.builder.emitRaw(`scoreboard players set $p${i} rs ${operand.value}`)
      } else if (operand.kind === 'var') {
        this.builder.emitRaw(`scoreboard players operation $p${i} rs = ${operand.name} rs`)
      }
    }

    // Set up NBT storage for each macro param
    for (const macroParam of macroParamNames) {
      const paramIdx = params.findIndex(p => p.name === macroParam)
      if (paramIdx < 0 || paramIdx >= loweredArgs.length) continue

      const operand = loweredArgs[paramIdx]
      if (operand.kind === 'const') {
        this.builder.emitRaw(`data modify storage rs:macro_args ${macroParam} set value ${operand.value}`)
      } else if (operand.kind === 'var') {
        this.builder.emitRaw(
          `execute store result storage rs:macro_args ${macroParam} int 1 run scoreboard players get ${operand.name} rs`
        )
      }
    }

    // Call with macro storage
    this.builder.emitRaw(`function ${this.namespace}:${fnName} with storage rs:macro_args`)

    // Copy return value (callers may use it)
    const dst = this.builder.freshTemp()
    this.builder.emitRaw(`scoreboard players operation ${dst} rs = $ret rs`)
    return { kind: 'var', name: dst }
  }

  lower(program: Program): IRModule {
    this.namespace = program.namespace

    // Pre-scan for macro functions before main lowering (so call sites can detect them)
    this.preScanMacroFunctions(program)

    // Load struct definitions
    for (const struct of program.structs ?? []) {
      const fields = new Map<string, TypeNode>()
      for (const field of struct.fields) {
        fields.set(field.name, field.type)
      }
      this.structDefs.set(struct.name, fields)
      this.structDecls.set(struct.name, struct)
    }

    for (const enumDecl of program.enums ?? []) {
      const variants = new Map<string, number>()
      for (const variant of enumDecl.variants) {
        variants.set(variant.name, variant.value ?? 0)
      }
      this.enumDefs.set(enumDecl.name, variants)
    }

    for (const constDecl of program.consts ?? []) {
      this.constValues.set(constDecl.name, constDecl.value)
      this.varTypes.set(constDecl.name, this.normalizeType(constDecl.type))
    }

    // Process global variable declarations (top-level let)
    for (const g of program.globals ?? []) {
      this.globalNames.set(g.name, { mutable: g.mutable })
      this.varTypes.set(g.name, this.normalizeType(g.type))
      const initValue = g.init.kind === 'int_lit' ? g.init.value : 0
      this.globals.push({ name: `$${g.name}`, init: initValue })
    }

    for (const fn of program.declarations) {
      this.fnDecls.set(fn.name, fn)
      this.functionDefaults.set(fn.name, fn.params.map(param => param.default))
    }

    for (const implBlock of program.implBlocks ?? []) {
      let methods = this.implMethods.get(implBlock.typeName)
      if (!methods) {
        methods = new Map()
        this.implMethods.set(implBlock.typeName, methods)
      }

      for (const method of implBlock.methods) {
        const loweredName = `${implBlock.typeName}_${method.name}`
        methods.set(method.name, { fn: method, loweredName })
        this.fnDecls.set(loweredName, method)
        this.functionDefaults.set(loweredName, method.params.map(param => param.default))
      }
    }

    for (const fn of program.declarations) {
      this.lowerFn(fn)
    }

    for (const implBlock of program.implBlocks ?? []) {
      for (const method of implBlock.methods) {
        this.lowerFn(method, { name: `${implBlock.typeName}_${method.name}` })
      }
    }

    return buildModule(this.namespace, this.functions, this.globals)
  }

  // -------------------------------------------------------------------------
  // Function Lowering
  // -------------------------------------------------------------------------

  private lowerFn(
    fn: FnDecl,
    options: {
      name?: string
      callbackBindings?: Map<string, string>
      stdlibCallSite?: StdlibCallSiteContext
    } = {}
  ): void {
    const loweredName = options.name ?? fn.name
    const callbackBindings = options.callbackBindings ?? new Map<string, string>()
    const stdlibCallSite = options.stdlibCallSite
    const staticEventDec = fn.decorators.find(d => d.name === 'on')
    const eventType = staticEventDec?.args?.eventType
    const eventParamSpecs = eventType && isEventTypeName(eventType) ? getEventParamSpecs(eventType) : []
    const runtimeParams = staticEventDec
      ? []
      : fn.params.filter(param => !callbackBindings.has(param.name))

    this.currentFn = loweredName
    this.currentStdlibCallSite = stdlibCallSite
    this.foreachCounter = 0
    this.varMap = new Map()
    this.lambdaBindings = new Map()
    this.intervalBindings = new Map()
    this.currentCallbackBindings = new Map(callbackBindings)
    this.currentContext = {}
    this.blockPosVars = new Map()
    this.stringValues = new Map()
    this.builder = new LoweringBuilder()
    // Initialize macro tracking for this function
    this.currentFnParamNames = new Set(runtimeParams.map(p => p.name))
    this.currentFnMacroParams = new Set()

    // Map parameters
    if (staticEventDec) {
      for (let i = 0; i < fn.params.length; i++) {
        const param = fn.params[i]
        const expected = eventParamSpecs[i]
        const normalizedType = this.normalizeType(param.type)
        this.varTypes.set(param.name, normalizedType)

        if (expected?.type.kind === 'entity') {
          this.varMap.set(param.name, '@s')
          continue
        }

        if (expected?.type.kind === 'named' && expected.type.name === 'string') {
          this.stringValues.set(param.name, '')
          continue
        }

        this.varMap.set(param.name, `$${param.name}`)
      }
    } else {
      for (const param of runtimeParams) {
        const paramName = param.name
        this.varMap.set(paramName, `$${paramName}`)
        this.varTypes.set(paramName, this.normalizeType(param.type))
      }
    }
    for (const param of fn.params) {
      if (callbackBindings.has(param.name)) {
        this.varTypes.set(param.name, this.normalizeType(param.type))
      }
    }

    // Start entry block
    this.builder.startBlock('entry')

    // Copy params from the parameter-passing slots to named local variables.
    // Use { kind: 'param', index: i } so the codegen resolves to
    // alloc.internal('p{i}') consistently in both mangle and no-mangle modes,
    // avoiding the slot-collision between the internal register and a user variable
    // named 'p0'/'p1' that occurred with { kind: 'var', name: '$p0' }.
    for (let i = 0; i < runtimeParams.length; i++) {
      const paramName = runtimeParams[i].name
      const varName = `$${paramName}`
      this.builder.emitAssign(varName, { kind: 'param', index: i })
    }

    if (staticEventDec) {
      for (let i = 0; i < fn.params.length; i++) {
        const param = fn.params[i]
        const expected = eventParamSpecs[i]
        if (expected?.type.kind === 'named' && expected.type.name !== 'string') {
          this.builder.emitAssign(`$${param.name}`, { kind: 'const', value: 0 })
        }
      }
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

    const irFn = this.builder.build(loweredName, runtimeParams.map(p => `$${p.name}`), isTickLoop)

    // Add trigger metadata if applicable
    if (isTriggerHandler && triggerName) {
      irFn.isTriggerHandler = true
      irFn.triggerName = triggerName
    }

    const eventDec = fn.decorators.find(d =>
      d.name === 'on_advancement' ||
      d.name === 'on_craft' ||
      d.name === 'on_death' ||
      d.name === 'on_login' ||
      d.name === 'on_join_team'
    )
    if (eventDec) {
      switch (eventDec.name) {
        case 'on_advancement':
          irFn.eventTrigger = { kind: 'advancement', value: eventDec.args?.advancement }
          break
        case 'on_craft':
          irFn.eventTrigger = { kind: 'craft', value: eventDec.args?.item }
          break
        case 'on_death':
          irFn.eventTrigger = { kind: 'death' }
          break
        case 'on_login':
          irFn.eventTrigger = { kind: 'login' }
          break
        case 'on_join_team':
          irFn.eventTrigger = { kind: 'join_team', value: eventDec.args?.team }
          break
      }
    }

    if (eventType && isEventTypeName(eventType)) {
      irFn.eventHandler = {
        eventType,
        tag: EVENT_TYPES[eventType].tag,
      }
    }

    // Check for @load decorator
    if (fn.decorators.some(d => d.name === 'load')) {
      irFn.isLoadInit = true
    }

    // @requires("dep_fn") — when this function is compiled in, dep_fn is also
    // called from __load.  The dep_fn itself does NOT need @load; it can be a
    // private (_) function that only runs at load time when this fn is used.
    const requiredLoads: string[] = []
    for (const d of fn.decorators) {
      if (d.name === 'requires') {
        for (const arg of d.rawArgs ?? []) {
          if (arg.kind === 'string') {
            requiredLoads.push(arg.value)
          }
        }
      }
    }
    if (requiredLoads.length > 0) {
      irFn.requiredLoads = requiredLoads
    }

    // Handle tick rate counter if needed
    if (tickRate && tickRate > 1) {
      this.wrapWithTickRate(irFn, tickRate)
    }

    // Set macro metadata if this function uses MC macro syntax
    if (this.currentFnMacroParams.size > 0) {
      irFn.isMacroFunction = true
      irFn.macroParamNames = [...this.currentFnMacroParams]
      // Update registry (may refine the pre-scan result)
      this.macroFunctionInfo.set(loweredName, irFn.macroParamNames)
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
    this.globals.push({ name: counterVar, init: 0 })

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
      case 'break':
        this.lowerBreakStmt()
        break
      case 'continue':
        this.lowerContinueStmt()
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
      case 'for_range':
        this.lowerForRangeStmt(stmt)
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
        this.checkRawCommandInterpolation(stmt.cmd, stmt.span)
        this.builder.emitRaw(stmt.cmd)
        break
    }
  }

  private lowerLetStmt(stmt: Extract<Stmt, { kind: 'let' }>): void {
    // Check for duplicate declaration of foreach binding
    if (this.currentContext.binding === stmt.name) {
      throw new DiagnosticError(
        'LoweringError',
        `Cannot redeclare foreach binding '${stmt.name}'`,
        stmt.span ?? { line: 0, col: 0 }
      )
    }
    
    const varName = `$${stmt.name}`
    this.varMap.set(stmt.name, varName)

    // Track variable type
    const declaredType = stmt.type ? this.normalizeType(stmt.type) : this.inferExprType(stmt.init)
    if (declaredType) {
      this.varTypes.set(stmt.name, declaredType)
      // Track float variables for fixed-point arithmetic
      if (declaredType.kind === 'named' && declaredType.name === 'float') {
        this.floatVars.add(stmt.name)
      }
    }

    if (stmt.init.kind === 'lambda') {
      const lambdaName = this.lowerLambdaExpr(stmt.init)
      this.lambdaBindings.set(stmt.name, lambdaName)
      return
    }

    if (stmt.init.kind === 'call' && stmt.init.fn === 'setInterval') {
      const value = this.lowerExpr(stmt.init)
      const intervalFn = this.intervalFunctions.get(value.kind === 'const' ? value.value : NaN)
      if (intervalFn) {
        this.intervalBindings.set(stmt.name, intervalFn)
      }
      this.builder.emitAssign(varName, value)
      return
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

    // Handle struct initialization from function call (copy from __ret_struct)
    if ((stmt.init.kind === 'call' || stmt.init.kind === 'static_call') && stmt.type?.kind === 'struct') {
      // First, execute the function call
      this.lowerExpr(stmt.init)
      // Then copy all fields from __ret_struct to the variable's storage
      const structDecl = this.structDecls.get(stmt.type.name)
      if (structDecl) {
        const structName = stmt.type.name.toLowerCase()
        for (const field of structDecl.fields) {
          const srcPath = `rs:heap __ret_struct.${field.name}`
          const dstPath = `rs:heap ${structName}_${stmt.name}.${field.name}`
          this.builder.emitRaw(`data modify storage ${dstPath} set from storage ${srcPath}`)
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

    // Handle set_new returning a set ID string
    if (stmt.init.kind === 'call' && stmt.init.fn === 'set_new') {
      const setId = `__set_${this.foreachCounter++}`
      this.builder.emitRaw(`data modify storage rs:sets ${setId} set value []`)
      this.stringValues.set(stmt.name, setId)
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

    const stmtType = stmt.type ? this.normalizeType(stmt.type) : this.inferExprType(stmt.init)
    if (stmtType?.kind === 'named' && stmtType.name === 'string' && this.storeStringValue(stmt.name, stmt.init)) {
      return
    }

    const value = this.lowerExpr(stmt.init)
    this.builder.emitAssign(varName, value)
  }

  private lowerReturnStmt(stmt: Extract<Stmt, { kind: 'return' }>): void {
    if (stmt.value) {
      // Handle struct literal return: store fields to __ret_struct storage
      if (stmt.value.kind === 'struct_lit') {
        for (const field of stmt.value.fields) {
          const path = `rs:heap __ret_struct.${field.name}`
          const fieldValue = this.lowerExpr(field.value)
          if (fieldValue.kind === 'const') {
            this.builder.emitRaw(`data modify storage ${path} set value ${fieldValue.value}`)
          } else if (fieldValue.kind === 'var') {
            this.builder.emitRaw(`execute store result storage ${path} int 1 run scoreboard players get ${fieldValue.name} rs`)
          }
        }
        this.builder.emitReturn({ kind: 'const', value: 0 })
        return
      }
      const value = this.lowerExpr(stmt.value)
      this.builder.emitReturn(value)
    } else {
      this.builder.emitReturn()
    }
  }

  private lowerBreakStmt(): void {
    if (this.loopStack.length === 0) {
      throw new DiagnosticError('LoweringError', 'break statement outside of loop', { line: 1, col: 1 })
    }
    const loop = this.loopStack[this.loopStack.length - 1]
    this.builder.emitJump(loop.breakLabel)
  }

  private lowerContinueStmt(): void {
    if (this.loopStack.length === 0) {
      throw new DiagnosticError('LoweringError', 'continue statement outside of loop', { line: 1, col: 1 })
    }
    const loop = this.loopStack[this.loopStack.length - 1]
    this.builder.emitJump(loop.continueLabel)
  }

  private lowerIfStmt(stmt: Extract<Stmt, { kind: 'if' }>): void {
    if (stmt.cond.kind === 'is_check') {
      this.lowerIsCheckIfStmt(stmt)
      return
    }

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

  private lowerIsCheckIfStmt(stmt: Extract<Stmt, { kind: 'if' }>): void {
    const cond = stmt.cond
    if (cond.kind !== 'is_check') {
      throw new DiagnosticError(
        'LoweringError',
        "Internal error: expected 'is' check condition",
        stmt.span ?? { line: 0, col: 0 }
      )
    }

    if (stmt.else_) {
      throw new DiagnosticError(
        'LoweringError',
        "'is' checks with else branches are not yet supported",
        cond.span ?? stmt.span ?? { line: 0, col: 0 }
      )
    }

    const selector = this.exprToEntitySelector(cond.expr)
    if (!selector) {
      throw new DiagnosticError(
        'LoweringError',
        "'is' checks require an entity selector or entity binding",
        cond.span ?? stmt.span ?? { line: 0, col: 0 }
      )
    }

    const mcType = ENTITY_TO_MC_TYPE[cond.entityType]
    const thenFnName = `${this.currentFn}/then_${this.foreachCounter++}`

    if (!mcType) {
      // Abstract type — check all concrete subtypes
      const subtypes = getConcreteSubtypes(cond.entityType)
      if (subtypes.length === 0) {
        throw new DiagnosticError(
          'LoweringError',
          `Cannot lower entity type check for '${cond.entityType}'`,
          cond.span ?? stmt.span ?? { line: 0, col: 0 }
        )
      }
      // Use a temp scoreboard variable to OR multiple type checks
      this.builder.emitRaw(`scoreboard players set __is_result rs:temp 0`)
      for (const subtype of subtypes) {
        if (subtype.mcId) {
          this.builder.emitRaw(`execute if entity ${this.appendTypeFilter(selector, subtype.mcId)} run scoreboard players set __is_result rs:temp 1`)
        }
      }
      this.builder.emitRaw(`execute if score __is_result rs:temp matches 1 run function ${this.namespace}:${thenFnName}`)
    } else {
      // Concrete type — single check
      this.builder.emitRaw(`execute if entity ${this.appendTypeFilter(selector, mcType)} run function ${this.namespace}:${thenFnName}`)
    }

    const savedBuilder = this.builder
    const savedVarMap = new Map(this.varMap)
    const savedBlockPosVars = new Map(this.blockPosVars)

    this.builder = new LoweringBuilder()
    this.varMap = new Map(savedVarMap)
    this.blockPosVars = new Map(savedBlockPosVars)

    this.builder.startBlock('entry')
    this.lowerBlock(stmt.then)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitReturn()
    }

    this.functions.push(this.builder.build(thenFnName, [], false))

    this.builder = savedBuilder
    this.varMap = savedVarMap
    this.blockPosVars = savedBlockPosVars
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

    // Push loop context for break/continue (while has no step, so continue goes to check)
    this.loopStack.push({ breakLabel: exitLabel, continueLabel: checkLabel })

    // Body block
    this.builder.startBlock(bodyLabel)
    this.lowerBlock(stmt.body)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitJump(checkLabel)
    }

    // Pop loop context
    this.loopStack.pop()

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
    const continueLabel = this.builder.freshLabel('for_continue')
    const exitLabel = this.builder.freshLabel('for_exit')

    this.builder.emitJump(checkLabel)

    // Check block
    this.builder.startBlock(checkLabel)
    const condVar = this.lowerExpr(stmt.cond)
    const condName = this.operandToVar(condVar)
    this.builder.emitJumpIf(condName, bodyLabel, exitLabel)

    // Push loop context for break/continue
    this.loopStack.push({ breakLabel: exitLabel, continueLabel })

    // Body block
    this.builder.startBlock(bodyLabel)
    this.lowerBlock(stmt.body)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitJump(continueLabel)
    }

    // Continue block (step + loop back)
    this.builder.startBlock(continueLabel)
    this.lowerExpr(stmt.step)
    this.builder.emitJump(checkLabel)

    // Pop loop context
    this.loopStack.pop()

    // Exit block
    this.builder.startBlock(exitLabel)
  }

  private lowerForRangeStmt(stmt: Extract<Stmt, { kind: 'for_range' }>): void {
    const loopVar = `$${stmt.varName}`
    const subFnName = `${this.currentFn}/__for_${this.foreachCounter++}`

    // Initialize loop variable
    this.varMap.set(stmt.varName, loopVar)
    const startVal = this.lowerExpr(stmt.start)
    if (startVal.kind === 'const') {
      this.builder.emitRaw(`scoreboard players set ${loopVar} rs ${startVal.value}`)
    } else if (startVal.kind === 'var') {
      this.builder.emitRaw(`scoreboard players operation ${loopVar} rs = ${startVal.name} rs`)
    }

    // Call loop function
    this.builder.emitRaw(`function ${this.namespace}:${subFnName}`)

    // Generate loop sub-function
    const savedBuilder = this.builder
    const savedVarMap = new Map(this.varMap)
    const savedContext = this.currentContext
    const savedBlockPosVars = new Map(this.blockPosVars)

    this.builder = new LoweringBuilder()
    this.varMap = new Map(savedVarMap)
    this.currentContext = savedContext
    this.blockPosVars = new Map(savedBlockPosVars)

    this.builder.startBlock('entry')

    // Body
    this.lowerBlock(stmt.body)

    // Increment
    this.builder.emitRaw(`scoreboard players add ${loopVar} rs 1`)

    // Loop condition: execute if score matches ..<end-1> run function
    const endVal = this.lowerExpr(stmt.end)
    const endNum = endVal.kind === 'const' ? endVal.value - 1 : '?'
    this.builder.emitRaw(`execute if score ${loopVar} rs matches ..${endNum} run function ${this.namespace}:${subFnName}`)

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

  private lowerForeachStmt(stmt: Extract<Stmt, { kind: 'foreach' }>): void {
    if (stmt.iterable.kind !== 'selector') {
      this.lowerArrayForeachStmt(stmt)
      return
    }

    // Extract body into a separate function
    const subFnName = `${this.currentFn}/foreach_${this.foreachCounter++}`
    const selector = this.exprToString(stmt.iterable)

    // Emit execute as ... [context modifiers] run function ...
    const execContext = stmt.executeContext ? ` ${stmt.executeContext}` : ''
    this.builder.emitRaw(`execute as ${selector}${execContext} run function ${this.namespace}:${subFnName}`)

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

    // Track entity context for type narrowing
    const selectorEntityType = getBaseSelectorType(selector)
    if (selectorEntityType) {
      this.entityContextStack.push(selectorEntityType)
    }

    this.builder.startBlock('entry')
    this.lowerBlock(stmt.body)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitReturn()
    }

    if (selectorEntityType) {
      this.entityContextStack.pop()
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

      // Handle range patterns specially
      let matchCondition: string
      if (arm.pattern.kind === 'range_lit') {
        const range = arm.pattern.range
        if (range.min !== undefined && range.max !== undefined) {
          matchCondition = `${range.min}..${range.max}`
        } else if (range.min !== undefined) {
          matchCondition = `${range.min}..`
        } else if (range.max !== undefined) {
          matchCondition = `..${range.max}`
        } else {
          matchCondition = '0..'  // Match any
        }
      } else {
        const patternValue = this.lowerExpr(arm.pattern)
        if (patternValue.kind !== 'const') {
          throw new Error('Match patterns must lower to compile-time constants')
        }
        matchCondition = String(patternValue.value)
      }

      const subFnName = `${this.currentFn}/match_${this.foreachCounter++}`
      this.builder.emitRaw(`execute if score ${matchedVar} rs matches ..0 if score ${subject} rs matches ${matchCondition} run function ${this.namespace}:${subFnName}`)
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

    // Check for impossible type assertions (W_IMPOSSIBLE_AS)
    const innerType = getBaseSelectorType(selector)
    const outerType = this.currentEntityContext()
    if (innerType && outerType !== 'Entity' && innerType !== 'Entity' && !areCompatibleTypes(outerType, innerType)) {
      this.warnings.push({
        message: `Impossible type assertion: @s is ${outerType} but as-block targets ${innerType}`,
        code: 'W_IMPOSSIBLE_AS',
        line: stmt.span?.line,
        col: stmt.span?.col,
      })
    }

    this.builder.emitRaw(`execute as ${selector} run function ${this.namespace}:${subFnName}`)

    // Create sub-function
    const savedBuilder = this.builder
    const savedVarMap = new Map(this.varMap)
    const savedBlockPosVars = new Map(this.blockPosVars)

    this.builder = new LoweringBuilder()
    this.varMap = new Map(savedVarMap)
    this.blockPosVars = new Map(savedBlockPosVars)

    // Track entity context inside as-block
    if (innerType) {
      this.entityContextStack.push(innerType)
    }

    this.builder.startBlock('entry')
    this.lowerBlock(stmt.body)
    if (!this.builder.isBlockSealed()) {
      this.builder.emitReturn()
    }

    if (innerType) {
      this.entityContextStack.pop()
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
        // Context modifiers
        case 'as':
          parts.push(`as ${this.selectorToString(sub.selector)}`)
          break
        case 'at':
          parts.push(`at ${this.selectorToString(sub.selector)}`)
          break
        case 'positioned':
          parts.push(`positioned ${sub.x} ${sub.y} ${sub.z}`)
          break
        case 'positioned_as':
          parts.push(`positioned as ${this.selectorToString(sub.selector)}`)
          break
        case 'rotated':
          parts.push(`rotated ${sub.yaw} ${sub.pitch}`)
          break
        case 'rotated_as':
          parts.push(`rotated as ${this.selectorToString(sub.selector)}`)
          break
        case 'facing':
          parts.push(`facing ${sub.x} ${sub.y} ${sub.z}`)
          break
        case 'facing_entity':
          parts.push(`facing entity ${this.selectorToString(sub.selector)} ${sub.anchor}`)
          break
        case 'anchored':
          parts.push(`anchored ${sub.anchor}`)
          break
        case 'align':
          parts.push(`align ${sub.axes}`)
          break
        case 'in':
          parts.push(`in ${sub.dimension}`)
          break
        case 'on':
          parts.push(`on ${sub.relation}`)
          break
        case 'summon':
          parts.push(`summon ${sub.entity}`)
          break
        // Conditions
        case 'if_entity':
          if (sub.selector) {
            parts.push(`if entity ${this.selectorToString(sub.selector)}`)
          } else if (sub.varName) {
            const sel: EntitySelector = { kind: '@s', filters: sub.filters }
            parts.push(`if entity ${this.selectorToString(sel)}`)
          }
          break
        case 'unless_entity':
          if (sub.selector) {
            parts.push(`unless entity ${this.selectorToString(sub.selector)}`)
          } else if (sub.varName) {
            const sel: EntitySelector = { kind: '@s', filters: sub.filters }
            parts.push(`unless entity ${this.selectorToString(sel)}`)
          }
          break
        case 'if_block':
          parts.push(`if block ${sub.pos[0]} ${sub.pos[1]} ${sub.pos[2]} ${sub.block}`)
          break
        case 'unless_block':
          parts.push(`unless block ${sub.pos[0]} ${sub.pos[1]} ${sub.pos[2]} ${sub.block}`)
          break
        case 'if_score':
          parts.push(`if score ${sub.target} ${sub.targetObj} ${sub.op} ${sub.source} ${sub.sourceObj}`)
          break
        case 'unless_score':
          parts.push(`unless score ${sub.target} ${sub.targetObj} ${sub.op} ${sub.source} ${sub.sourceObj}`)
          break
        case 'if_score_range':
          parts.push(`if score ${sub.target} ${sub.targetObj} matches ${sub.range}`)
          break
        case 'unless_score_range':
          parts.push(`unless score ${sub.target} ${sub.targetObj} matches ${sub.range}`)
          break
        // Store
        case 'store_result':
          parts.push(`store result score ${sub.target} ${sub.targetObj}`)
          break
        case 'store_success':
          parts.push(`store success score ${sub.target} ${sub.targetObj}`)
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

      case 'byte_lit':
        return { kind: 'const', value: expr.value }

      case 'short_lit':
        return { kind: 'const', value: expr.value }

      case 'long_lit':
        return { kind: 'const', value: expr.value }

      case 'double_lit':
        return { kind: 'const', value: Math.round(expr.value * 1000) }

      case 'bool_lit':
        return { kind: 'const', value: expr.value ? 1 : 0 }

      case 'str_lit':
        // Strings are handled inline in builtins
        return { kind: 'const', value: 0 } // Placeholder

      case 'mc_name':
        // MC names (#health, #red) treated as string constants
        return { kind: 'const', value: 0 } // Handled inline in exprToString

      case 'str_interp':
      case 'f_string':
        // Interpolated strings are handled inline in message builtins.
        return { kind: 'const', value: 0 }

      case 'range_lit':
        // Ranges are handled in context (selectors, etc.)
        return { kind: 'const', value: 0 }

      case 'blockpos':
        return { kind: 'const', value: 0 }

      case 'ident': {
        const constValue = this.constValues.get(expr.name)
        if (constValue) {
          return this.lowerConstLiteral(constValue)
        }
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

      case 'is_check':
        throw new DiagnosticError(
          'LoweringError',
          "'is' checks are only supported as if conditions",
          expr.span ?? { line: 0, col: 0 }
        )

      case 'unary':
        return this.lowerUnaryExpr(expr)

      case 'assign':
        return this.lowerAssignExpr(expr)

      case 'call':
        return this.lowerCallExpr(expr)

      case 'static_call':
        return this.lowerStaticCallExpr(expr)

      case 'invoke':
        return this.lowerInvokeExpr(expr)

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

      case 'lambda':
        throw new Error('Lambda expressions must be used in a function context')
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
    // Check for const reassignment (both compile-time consts and immutable globals)
    if (this.constValues.has(expr.target)) {
      throw new DiagnosticError('LoweringError', `Cannot assign to constant '${expr.target}'`, getSpan(expr) ?? { line: 1, col: 1 })
    }
    const globalInfo = this.globalNames.get(expr.target)
    if (globalInfo && !globalInfo.mutable) {
      throw new DiagnosticError('LoweringError', `Cannot assign to constant '${expr.target}'`, getSpan(expr) ?? { line: 1, col: 1 })
    }

    const blockPosValue = this.resolveBlockPosExpr(expr.value)
    if (blockPosValue) {
      this.blockPosVars.set(expr.target, blockPosValue)
      return { kind: 'const', value: 0 }
    }

    this.blockPosVars.delete(expr.target)
    const targetType = this.varTypes.get(expr.target)
    if (targetType?.kind === 'named' && targetType.name === 'string' && this.storeStringValue(expr.target, expr.value)) {
      return { kind: 'const', value: 0 }
    }
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
    if (expr.fn === 'str_len') {
      const storagePath = this.getStringStoragePath(expr.args[0])
      if (storagePath) {
        const dst = this.builder.freshTemp()
        this.builder.emitRaw(`execute store result score ${dst} rs run data get storage ${storagePath}`)
        return { kind: 'var', name: dst }
      }

      const staticString = this.resolveStaticString(expr.args[0])
      if (staticString !== null) {
        return { kind: 'const', value: Array.from(staticString).length }
      } else {
        const dst = this.builder.freshTemp()
        this.builder.emitAssign(dst, { kind: 'const', value: 0 })
        return { kind: 'var', name: dst }
      }
    }

    // Check for builtin
    if (expr.fn in BUILTINS) {
      return this.lowerBuiltinCall(expr.fn, expr.args, getSpan(expr))
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

    const callbackTarget = this.resolveFunctionRefByName(expr.fn)
    if (callbackTarget) {
      return this.emitDirectFunctionCall(callbackTarget, expr.args)
    }

    const implMethod = this.resolveInstanceMethod(expr)
    if (implMethod) {
      // Copy struct fields from instance to 'self' storage before calling
      const receiver = expr.args[0]
      if (receiver?.kind === 'ident') {
        const receiverType = this.inferExprType(receiver)
        if (receiverType?.kind === 'struct') {
          const structDecl = this.structDecls.get(receiverType.name)
          const structName = receiverType.name.toLowerCase()
          if (structDecl) {
            for (const field of structDecl.fields) {
              const srcPath = `rs:heap ${structName}_${receiver.name}.${field.name}`
              const dstPath = `rs:heap ${structName}_self.${field.name}`
              this.builder.emitRaw(`data modify storage ${dstPath} set from storage ${srcPath}`)
            }
          }
        }
      }
      return this.emitMethodCall(implMethod.loweredName, implMethod.fn, expr.args)
    }

    // Regular function call
    const fnDecl = this.fnDecls.get(expr.fn)
    const defaultArgs = this.functionDefaults.get(expr.fn) ?? []
    const fullArgs = [...expr.args]
    for (let i = fullArgs.length; i < defaultArgs.length; i++) {
      const defaultExpr = defaultArgs[i]
      if (!defaultExpr) {
        break
      }
      fullArgs.push(defaultExpr)
    }

    if (fnDecl) {
      const callbackBindings = new Map<string, string>()
      const runtimeArgs: Expr[] = []

      for (let i = 0; i < fullArgs.length; i++) {
        const param = fnDecl.params[i]
        if (param && this.normalizeType(param.type).kind === 'function_type') {
          const functionRef = this.resolveFunctionRefExpr(fullArgs[i])
          if (!functionRef) {
            throw new Error(`Cannot lower callback argument for parameter '${param.name}'`)
          }
          callbackBindings.set(param.name, functionRef)
          continue
        }
        runtimeArgs.push(fullArgs[i])
      }

      const stdlibCallSite = this.getStdlibCallSiteContext(fnDecl, getSpan(expr))
      const targetFn = callbackBindings.size > 0 || stdlibCallSite
        ? this.ensureSpecializedFunctionWithContext(fnDecl, callbackBindings, stdlibCallSite)
        : expr.fn

      // Check if this is a call to a known macro function
      const macroParams = this.macroFunctionInfo.get(targetFn)
      if (macroParams && macroParams.length > 0) {
        return this.emitMacroFunctionCall(targetFn, runtimeArgs, macroParams, fnDecl)
      }

      return this.emitDirectFunctionCall(targetFn, runtimeArgs)
    }

    // Check for macro function (forward-declared or external)
    const macroParamsForUnknown = this.macroFunctionInfo.get(expr.fn)
    if (macroParamsForUnknown && macroParamsForUnknown.length > 0) {
      return this.emitMacroFunctionCall(expr.fn, fullArgs, macroParamsForUnknown, undefined)
    }

    return this.emitDirectFunctionCall(expr.fn, fullArgs)
  }

  private lowerStaticCallExpr(expr: Extract<Expr, { kind: 'static_call' }>): Operand {
    const method = this.implMethods.get(expr.type)?.get(expr.method)
    const targetFn = method?.loweredName ?? `${expr.type}_${expr.method}`
    return this.emitMethodCall(targetFn, method?.fn, expr.args)
  }

  private lowerInvokeExpr(expr: Extract<Expr, { kind: 'invoke' }>): Operand {
    if (expr.callee.kind === 'lambda') {
      if (!Array.isArray(expr.callee.body)) {
        return this.inlineLambdaInvoke(expr.callee, expr.args)
      }
      const lambdaName = this.lowerLambdaExpr(expr.callee)
      return this.emitDirectFunctionCall(lambdaName, expr.args)
    }

    const functionRef = this.resolveFunctionRefExpr(expr.callee)
    if (!functionRef) {
      throw new Error('Cannot invoke a non-function value')
    }
    return this.emitDirectFunctionCall(functionRef, expr.args)
  }

  private inlineLambdaInvoke(expr: Extract<Expr, { kind: 'lambda' }>, args: Expr[]): Operand {
    const savedVarMap = new Map(this.varMap)
    const savedVarTypes = new Map(this.varTypes)
    const savedLambdaBindings = new Map(this.lambdaBindings)
    const savedBlockPosVars = new Map(this.blockPosVars)

    for (let i = 0; i < expr.params.length; i++) {
      const param = expr.params[i]
      const temp = this.builder.freshTemp()
      const arg = args[i]
      this.builder.emitAssign(temp, arg ? this.lowerExpr(arg) : { kind: 'const', value: 0 })
      this.varMap.set(param.name, temp)
      if (param.type) {
        this.varTypes.set(param.name, this.normalizeType(param.type))
      }
      this.lambdaBindings.delete(param.name)
      this.blockPosVars.delete(param.name)
    }

    const result = this.lowerExpr(expr.body as Expr)

    this.varMap = savedVarMap
    this.varTypes = savedVarTypes
    this.lambdaBindings = savedLambdaBindings
    this.blockPosVars = savedBlockPosVars
    return result
  }

  private emitDirectFunctionCall(fn: string, args: Expr[]): Operand {
    const loweredArgs: Operand[] = args.map(arg => this.lowerExpr(arg))
    const dst = this.builder.freshTemp()
    this.builder.emitCall(fn, loweredArgs, dst)
    return { kind: 'var', name: dst }
  }

  private emitMethodCall(fn: string, fnDecl: FnDecl | undefined, args: Expr[]): Operand {
    const defaultArgs = this.functionDefaults.get(fn) ?? fnDecl?.params.map(param => param.default) ?? []
    const fullArgs = [...args]
    for (let i = fullArgs.length; i < defaultArgs.length; i++) {
      const defaultExpr = defaultArgs[i]
      if (!defaultExpr) {
        break
      }
      fullArgs.push(defaultExpr)
    }
    return this.emitDirectFunctionCall(fn, fullArgs)
  }

  private resolveFunctionRefExpr(expr: Expr): string | null {
    if (expr.kind === 'lambda') {
      return this.lowerLambdaExpr(expr)
    }
    if (expr.kind === 'ident') {
      return this.resolveFunctionRefByName(expr.name) ?? (this.fnDecls.has(expr.name) ? expr.name : null)
    }
    return null
  }

  private resolveFunctionRefByName(name: string): string | null {
    return this.lambdaBindings.get(name) ?? this.currentCallbackBindings.get(name) ?? null
  }

  private ensureSpecializedFunction(fn: FnDecl, callbackBindings: Map<string, string>): string {
    return this.ensureSpecializedFunctionWithContext(fn, callbackBindings)
  }

  private ensureSpecializedFunctionWithContext(
    fn: FnDecl,
    callbackBindings: Map<string, string>,
    stdlibCallSite?: StdlibCallSiteContext
  ): string {
    const parts = [...callbackBindings.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([param, target]) => `${param}_${target.replace(/[^a-zA-Z0-9_]/g, '_')}`)
    const callSiteHash = stdlibCallSite ? this.shortHash(this.serializeCallSite(stdlibCallSite)) : null
    if (callSiteHash) {
      parts.push(`callsite_${callSiteHash}`)
    }
    const key = `${fn.name}::${parts.join('::')}`
    const cached = this.specializedFunctions.get(key)
    if (cached) {
      return cached
    }

    const specializedName = `${fn.name}__${parts.join('__')}`
    this.specializedFunctions.set(key, specializedName)
    this.withSavedFunctionState(() => {
      this.lowerFn(fn, { name: specializedName, callbackBindings, stdlibCallSite })
    })
    return specializedName
  }

  private lowerLambdaExpr(expr: Extract<Expr, { kind: 'lambda' }>): string {
    const lambdaName = `__lambda_${this.lambdaCounter++}`
    const lambdaFn: FnDecl = {
      name: lambdaName,
      params: expr.params.map(param => ({
        name: param.name,
        type: param.type ?? { kind: 'named', name: 'int' },
      })),
      returnType: expr.returnType ?? this.inferLambdaReturnType(expr),
      decorators: [],
      body: Array.isArray(expr.body) ? expr.body : [{ kind: 'return', value: expr.body }],
    }
    this.withSavedFunctionState(() => {
      this.lowerFn(lambdaFn)
    })
    return lambdaName
  }

  private withSavedFunctionState<T>(callback: () => T): T {
    const savedCurrentFn = this.currentFn
    const savedStdlibCallSite = this.currentStdlibCallSite
    const savedForeachCounter = this.foreachCounter
    const savedBuilder = this.builder
    const savedVarMap = new Map(this.varMap)
    const savedLambdaBindings = new Map(this.lambdaBindings)
    const savedIntervalBindings = new Map(this.intervalBindings)
    const savedCallbackBindings = new Map(this.currentCallbackBindings)
    const savedContext = this.currentContext
    const savedBlockPosVars = new Map(this.blockPosVars)
    const savedStringValues = new Map(this.stringValues)
    const savedVarTypes = new Map(this.varTypes)
    // Macro tracking state
    const savedCurrentFnParamNames = new Set(this.currentFnParamNames)
    const savedCurrentFnMacroParams = new Set(this.currentFnMacroParams)

    try {
      return callback()
    } finally {
      this.currentFn = savedCurrentFn
      this.currentStdlibCallSite = savedStdlibCallSite
      this.foreachCounter = savedForeachCounter
      this.builder = savedBuilder
      this.varMap = savedVarMap
      this.lambdaBindings = savedLambdaBindings
      this.intervalBindings = savedIntervalBindings
      this.currentCallbackBindings = savedCallbackBindings
      this.currentContext = savedContext
      this.blockPosVars = savedBlockPosVars
      this.stringValues = savedStringValues
      this.varTypes = savedVarTypes
      this.currentFnParamNames = savedCurrentFnParamNames
      this.currentFnMacroParams = savedCurrentFnMacroParams
    }
  }

  private lowerBuiltinCall(name: string, args: Expr[], callSpan?: Span): Operand {
    const richTextCommand = this.lowerRichTextBuiltin(name, args)
    if (richTextCommand) {
      this.builder.emitRaw(richTextCommand)
      return { kind: 'const', value: 0 }
    }

    if (name === 'setTimeout') {
      return this.lowerSetTimeout(args)
    }

    if (name === 'setInterval') {
      return this.lowerSetInterval(args)
    }

    if (name === 'clearInterval') {
      return this.lowerClearInterval(args, callSpan)
    }

    // Special case: random - legacy scoreboard RNG for pre-1.20.3 compatibility
    if (name === 'random') {
      const dst = this.builder.freshTemp()
      const min = args[0] ? this.exprToLiteral(args[0]) : '0'
      const max = args[1] ? this.exprToLiteral(args[1]) : '100'
      this.builder.emitRaw(`scoreboard players random ${dst} rs ${min} ${max}`)
      return { kind: 'var', name: dst }
    }

    // Special case: random_native - /random value (MC 1.20.3+)
    if (name === 'random_native') {
      const dst = this.builder.freshTemp()
      const min = args[0] ? this.exprToLiteral(args[0]) : '0'
      const max = args[1] ? this.exprToLiteral(args[1]) : '100'
      this.builder.emitRaw(`execute store result score ${dst} rs run random value ${min} ${max}`)
      return { kind: 'var', name: dst }
    }

    // Special case: random_sequence - /random reset (MC 1.20.3+)
    if (name === 'random_sequence') {
      const sequence = this.exprToString(args[0])
      const seed = args[1] ? this.exprToLiteral(args[1]) : '0'
      this.builder.emitRaw(`random reset ${sequence} ${seed}`)
      return { kind: 'const', value: 0 }
    }

    // Special case: scoreboard_get / score — read from vanilla MC scoreboard
    if (name === 'scoreboard_get' || name === 'score') {
      const dst = this.builder.freshTemp()
      const player = this.exprToTargetString(args[0])
      const objective = this.resolveScoreboardObjective(args[0], args[1], callSpan)
      this.builder.emitRaw(`execute store result score ${dst} rs run scoreboard players get ${player} ${objective}`)
      return { kind: 'var', name: dst }
    }

    // Special case: scoreboard_set — write to vanilla MC scoreboard
    if (name === 'scoreboard_set') {
      const player = this.exprToTargetString(args[0])
      const objective = this.resolveScoreboardObjective(args[0], args[1], callSpan)
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

    if (name === 'scoreboard_display') {
      const slot = this.exprToString(args[0])
      const objective = this.resolveScoreboardObjective(undefined, args[1], callSpan)
      this.builder.emitRaw(`scoreboard objectives setdisplay ${slot} ${objective}`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'scoreboard_hide') {
      const slot = this.exprToString(args[0])
      this.builder.emitRaw(`scoreboard objectives setdisplay ${slot}`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'scoreboard_add_objective') {
      const objective = this.resolveScoreboardObjective(undefined, args[0], callSpan)
      const criteria = this.exprToString(args[1])
      const displayName = args[2] ? ` ${this.exprToQuotedString(args[2])}` : ''
      this.builder.emitRaw(`scoreboard objectives add ${objective} ${criteria}${displayName}`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'scoreboard_remove_objective') {
      const objective = this.resolveScoreboardObjective(undefined, args[0], callSpan)
      this.builder.emitRaw(`scoreboard objectives remove ${objective}`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'bossbar_add') {
      const id = this.exprToString(args[0])
      const title = this.exprToTextComponent(args[1])
      this.builder.emitRaw(`bossbar add ${id} ${title}`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'bossbar_set_value') {
      this.builder.emitRaw(`bossbar set ${this.exprToString(args[0])} value ${this.exprToString(args[1])}`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'bossbar_set_max') {
      this.builder.emitRaw(`bossbar set ${this.exprToString(args[0])} max ${this.exprToString(args[1])}`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'bossbar_set_color') {
      this.builder.emitRaw(`bossbar set ${this.exprToString(args[0])} color ${this.exprToString(args[1])}`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'bossbar_set_style') {
      this.builder.emitRaw(`bossbar set ${this.exprToString(args[0])} style ${this.exprToString(args[1])}`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'bossbar_set_visible') {
      this.builder.emitRaw(`bossbar set ${this.exprToString(args[0])} visible ${this.exprToBoolString(args[1])}`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'bossbar_set_players') {
      this.builder.emitRaw(`bossbar set ${this.exprToString(args[0])} players ${this.exprToTargetString(args[1])}`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'bossbar_remove') {
      this.builder.emitRaw(`bossbar remove ${this.exprToString(args[0])}`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'bossbar_get_value') {
      const dst = this.builder.freshTemp()
      this.builder.emitRaw(`execute store result score ${dst} rs run bossbar get ${this.exprToString(args[0])} value`)
      return { kind: 'var', name: dst }
    }

    if (name === 'team_add') {
      const team = this.exprToString(args[0])
      const displayName = args[1] ? ` ${this.exprToTextComponent(args[1])}` : ''
      this.builder.emitRaw(`team add ${team}${displayName}`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'team_remove') {
      this.builder.emitRaw(`team remove ${this.exprToString(args[0])}`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'team_join') {
      this.builder.emitRaw(`team join ${this.exprToString(args[0])} ${this.exprToTargetString(args[1])}`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'team_leave') {
      this.builder.emitRaw(`team leave ${this.exprToTargetString(args[0])}`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'team_option') {
      const team = this.exprToString(args[0])
      const option = this.exprToString(args[1])
      const value = this.isTeamTextOption(option)
        ? this.exprToTextComponent(args[2])
        : this.exprToString(args[2])
      this.builder.emitRaw(`team modify ${team} ${option} ${value}`)
      return { kind: 'const', value: 0 }
    }

    // Special case: data_get — read NBT data into a variable
    // data_get(target_type, target, path, scale?)
    // target_type: "entity", "block", "storage"
    if (name === 'data_get') {
      const dst = this.builder.freshTemp()
      const targetType = this.exprToString(args[0])
      const target = targetType === 'entity'
        ? this.exprToTargetString(args[1])
        : this.exprToString(args[1])
      const path = this.exprToString(args[2])
      const scale = args[3] ? this.exprToString(args[3]) : '1'
      this.builder.emitRaw(`execute store result score ${dst} rs run data get ${targetType} ${target} ${path} ${scale}`)
      return { kind: 'var', name: dst }
    }

    // storage_get_int(storage_ns, array_key, index) -> int
    // Reads one element from an NBT int-array stored in data storage.
    //   storage_ns : e.g. "math:tables"
    //   array_key  : e.g. "sin"
    //   index      : integer index (const or runtime)
    //
    // Const index: execute store result score $dst rs run data get storage math:tables sin[N] 1
    // Runtime index: macro sub-function via rs:heap, mirrors readArrayElement.
    if (name === 'storage_get_int') {
      const storageNs  = this.exprToString(args[0])  // "math:tables"
      const arrayKey   = this.exprToString(args[1])  // "sin"
      const indexOperand = this.lowerExpr(args[2])
      const dst = this.builder.freshTemp()

      if (indexOperand.kind === 'const') {
        this.builder.emitRaw(
          `execute store result score ${dst} rs run data get storage ${storageNs} ${arrayKey}[${indexOperand.value}] 1`
        )
      } else {
        // Runtime index: store the index into rs:heap under a unique key,
        // then call a macro sub-function that uses $(key) to index the array.
        const macroKey  = `__sgi_${this.foreachCounter++}`
        const subFnName = `${this.currentFn}/__sgi_${this.foreachCounter++}`
        const indexVar  = indexOperand.kind === 'var'
          ? indexOperand.name
          : this.operandToVar(indexOperand)
        this.builder.emitRaw(
          `execute store result storage rs:heap ${macroKey} int 1 run scoreboard players get ${indexVar} rs`
        )
        this.builder.emitRaw(`function ${this.namespace}:${subFnName} with storage rs:heap`)
        this.emitRawSubFunction(
          subFnName,
          `$execute store result score ${dst} rs run data get storage ${storageNs} ${arrayKey}[$(${macroKey})] 1`
        )
      }
      return { kind: 'var', name: dst }
    }

    // storage_set_array(storage_ns, array_key, nbt_array_literal)
    // Writes a literal NBT int array to data storage (used in @load for tables).
    //   storage_set_array("math:tables", "sin", "[0, 17, 35, ...]")
    if (name === 'storage_set_array') {
      const storageNs  = this.exprToString(args[0])
      const arrayKey   = this.exprToString(args[1])
      const nbtLiteral = this.exprToString(args[2])
      this.builder.emitRaw(
        `data modify storage ${storageNs} ${arrayKey} set value ${nbtLiteral}`
      )
      return { kind: 'const', value: 0 }
    }

    // data_merge(target, nbt) — merge NBT into entity/block/storage
    // data_merge(@s, { Invisible: 1b, Silent: 1b })
    if (name === 'data_merge') {
      const target = args[0]
      const nbt = args[1]
      const nbtStr = this.exprToSnbt ? this.exprToSnbt(nbt) : this.exprToString(nbt)
      
      // Check if target is a selector (entity) or string (block/storage)
      if (target.kind === 'selector') {
        const sel = this.exprToTargetString(target)
        this.builder.emitRaw(`data merge entity ${sel} ${nbtStr}`)
      } else {
        // Assume block position or storage
        const targetStr = this.exprToString(target)
        // If it looks like coordinates, use block; otherwise storage
        if (targetStr.match(/^~|^\d|^\^/)) {
          this.builder.emitRaw(`data merge block ${targetStr} ${nbtStr}`)
        } else {
          this.builder.emitRaw(`data merge storage ${targetStr} ${nbtStr}`)
        }
      }
      return { kind: 'const', value: 0 }
    }

    // Set data structure operations — unique collections via NBT storage
    // set_new is primarily handled in lowerLetStmt for proper string tracking.
    // This fallback handles standalone set_new() calls without assignment.
    if (name === 'set_new') {
      const setId = `__set_${this.foreachCounter++}`
      this.builder.emitRaw(`data modify storage rs:sets ${setId} set value []`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'set_add') {
      const setId = this.exprToString(args[0])
      const value = this.exprToString(args[1])
      this.builder.emitRaw(`execute unless data storage rs:sets ${setId}[{value:${value}}] run data modify storage rs:sets ${setId} append value {value:${value}}`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'set_contains') {
      const dst = this.builder.freshTemp()
      const setId = this.exprToString(args[0])
      const value = this.exprToString(args[1])
      this.builder.emitRaw(`execute store result score ${dst} rs if data storage rs:sets ${setId}[{value:${value}}]`)
      return { kind: 'var', name: dst }
    }

    if (name === 'set_remove') {
      const setId = this.exprToString(args[0])
      const value = this.exprToString(args[1])
      this.builder.emitRaw(`data remove storage rs:sets ${setId}[{value:${value}}]`)
      return { kind: 'const', value: 0 }
    }

    if (name === 'set_clear') {
      const setId = this.exprToString(args[0])
      this.builder.emitRaw(`data modify storage rs:sets ${setId} set value []`)
      return { kind: 'const', value: 0 }
    }

    const coordCommand = this.lowerCoordinateBuiltin(name, args)
    if (coordCommand) {
      this.builder.emitRaw(coordCommand)
      return { kind: 'const', value: 0 }
    }

    if (name === 'tp_to') {
      this.warnings.push({
        message: 'tp_to is deprecated; use tp instead',
        code: 'W_DEPRECATED',
        ...(callSpan ? { line: callSpan.line, col: callSpan.col } : {}),
      })
      const tpResult = this.lowerTpCommandMacroAware(args)
      if (tpResult) {
        this.builder.emitRaw(tpResult.cmd)
      }
      return { kind: 'const', value: 0 }
    }

    if (name === 'tp') {
      const tpResult = this.lowerTpCommandMacroAware(args)
      if (tpResult) {
        this.builder.emitRaw(tpResult.cmd)
      }
      return { kind: 'const', value: 0 }
    }

    // All builtins support macro params - check if any arg is a param needing macro treatment
    const argResults = args.map(arg => this.exprToBuiltinArg(arg))
    const hasMacroArg = argResults.some(r => r.macroParam !== undefined)
    if (hasMacroArg) {
      argResults.forEach(r => { if (r.macroParam) this.currentFnMacroParams.add(r.macroParam) })
    }
    const strArgs = argResults.map(r => r.str)
    const cmd = BUILTINS[name]?.(strArgs)
    if (cmd) {
      this.builder.emitRaw(hasMacroArg ? `$${cmd}` : cmd)
    }

    return { kind: 'const', value: 0 }
  }

  private lowerSetTimeout(args: Expr[]): Operand {
    const delay = this.exprToLiteral(args[0])
    const callback = args[1]
    if (!callback || callback.kind !== 'lambda') {
      throw new DiagnosticError(
        'LoweringError',
        'setTimeout requires a lambda callback',
        getSpan(callback) ?? { line: 1, col: 1 }
      )
    }

    const fnName = `__timeout_${this.timeoutCounter++}`
    this.lowerNamedLambdaFunction(fnName, callback)
    this.builder.emitRaw(`schedule function ${this.namespace}:${fnName} ${delay}t`)
    return { kind: 'const', value: 0 }
  }

  private lowerSetInterval(args: Expr[]): Operand {
    const delay = this.exprToLiteral(args[0])
    const callback = args[1]
    if (!callback || callback.kind !== 'lambda') {
      throw new DiagnosticError(
        'LoweringError',
        'setInterval requires a lambda callback',
        getSpan(callback) ?? { line: 1, col: 1 }
      )
    }

    const id = this.intervalCounter++
    const bodyName = `__interval_body_${id}`
    const fnName = `__interval_${id}`

    this.lowerNamedLambdaFunction(bodyName, callback)
    this.lowerIntervalWrapperFunction(fnName, bodyName, delay)
    this.intervalFunctions.set(id, fnName)
    this.builder.emitRaw(`schedule function ${this.namespace}:${fnName} ${delay}t`)

    return { kind: 'const', value: id }
  }

  private lowerClearInterval(args: Expr[], callSpan?: Span): Operand {
    const fnName = this.resolveIntervalFunctionName(args[0])
    if (!fnName) {
      throw new DiagnosticError(
        'LoweringError',
        'clearInterval requires an interval ID returned from setInterval',
        callSpan ?? getSpan(args[0]) ?? { line: 1, col: 1 }
      )
    }

    this.builder.emitRaw(`schedule clear ${this.namespace}:${fnName}`)
    return { kind: 'const', value: 0 }
  }

  private lowerNamedLambdaFunction(name: string, expr: Extract<Expr, { kind: 'lambda' }>): void {
    const lambdaFn: FnDecl = {
      name,
      params: expr.params.map(param => ({
        name: param.name,
        type: param.type ?? { kind: 'named', name: 'int' },
      })),
      returnType: expr.returnType ?? this.inferLambdaReturnType(expr),
      decorators: [],
      body: Array.isArray(expr.body) ? expr.body : [{ kind: 'return', value: expr.body }],
    }

    this.withSavedFunctionState(() => {
      this.lowerFn(lambdaFn)
    })
  }

  private lowerIntervalWrapperFunction(name: string, bodyName: string, delay: string): void {
    const intervalFn: FnDecl = {
      name,
      params: [],
      returnType: { kind: 'named', name: 'void' },
      decorators: [],
      body: [
        { kind: 'raw', cmd: `function ${this.namespace}:${bodyName}` },
        { kind: 'raw', cmd: `schedule function ${this.namespace}:${name} ${delay}t` },
      ],
    }

    this.withSavedFunctionState(() => {
      this.lowerFn(intervalFn)
    })
  }

  private resolveIntervalFunctionName(expr: Expr | undefined): string | null {
    if (!expr) {
      return null
    }

    if (expr.kind === 'ident') {
      const boundInterval = this.intervalBindings.get(expr.name)
      if (boundInterval) {
        return boundInterval
      }

      const constValue = this.constValues.get(expr.name)
      if (constValue?.kind === 'int_lit') {
        return this.intervalFunctions.get(constValue.value) ?? null
      }
      return null
    }

    if (expr.kind === 'int_lit') {
      return this.intervalFunctions.get(expr.value) ?? null
    }

    return null
  }

  private lowerRichTextBuiltin(name: string, args: Expr[]): string | null {
    const messageArgIndex = this.getRichTextArgIndex(name)
    if (messageArgIndex === null) {
      return null
    }

    const messageExpr = args[messageArgIndex]
    if (!messageExpr || (messageExpr.kind !== 'str_interp' && messageExpr.kind !== 'f_string')) {
      return null
    }

    const json = this.buildRichTextJson(messageExpr)

    switch (name) {
      case 'say':
      case 'announce':
        return `tellraw @a ${json}`
      case 'tell':
      case 'tellraw':
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
      case 'tellraw':
      case 'title':
      case 'actionbar':
      case 'subtitle':
        return 1
      default:
        return null
    }
  }

  private buildRichTextJson(expr: Extract<Expr, { kind: 'str_interp' | 'f_string' }>): string {
    const components: Array<string | Record<string, unknown>> = ['']

    if (expr.kind === 'f_string') {
      for (const part of expr.parts) {
        if (part.kind === 'text') {
          if (part.value.length > 0) {
            components.push({ text: part.value })
          }
          continue
        }
        this.appendRichTextExpr(components, part.expr)
      }
      return JSON.stringify(components)
    }

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
    if (expr.kind === 'ident') {
      const constValue = this.constValues.get(expr.name)
      if (constValue) {
        this.appendRichTextExpr(components, constValue)
        return
      }
      const stringValue = this.stringValues.get(expr.name)
      if (stringValue !== undefined) {
        components.push({ text: stringValue })
        return
      }
    }

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

    if (expr.kind === 'f_string') {
      for (const part of expr.parts) {
        if (part.kind === 'text') {
          if (part.value.length > 0) {
            components.push({ text: part.value })
          }
        } else {
          this.appendRichTextExpr(components, part.expr)
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
      case 'byte_lit':
        return `${expr.value}b`
      case 'short_lit':
        return `${expr.value}s`
      case 'long_lit':
        return `${expr.value}L`
      case 'double_lit':
        return `${expr.value}d`
      case 'rel_coord':
        return expr.value   // ~ or ~5 or ~-3 - output as-is for MC commands
      case 'local_coord':
        return expr.value   // ^ or ^5 or ^-3 - output as-is for MC commands
      case 'bool_lit':
        return expr.value ? '1' : '0'
      case 'str_lit':
        return expr.value
      case 'mc_name':
        return expr.value   // #health → "health" (no quotes, used as bare MC name)
      case 'str_interp':
      case 'f_string':
        return this.buildRichTextJson(expr)
      case 'blockpos':
        return emitBlockPos(expr)
      case 'ident': {
        const constValue = this.constValues.get(expr.name)
        if (constValue) {
          return this.exprToString(constValue)
        }
        const stringValue = this.stringValues.get(expr.name)
        if (stringValue !== undefined) {
          return stringValue
        }
        const mapped = this.varMap.get(expr.name)
        return mapped ?? `$${expr.name}`
      }
      case 'selector':
        return this.selectorToString(expr.sel)
      case 'unary':
        // Handle unary minus on literals directly
        if (expr.op === '-' && expr.operand.kind === 'int_lit') {
          return (-expr.operand.value).toString()
        }
        if (expr.op === '-' && expr.operand.kind === 'float_lit') {
          return Math.trunc(-expr.operand.value).toString()
        }
        // Fall through to default for complex cases
        const unaryOp = this.lowerExpr(expr)
        return this.operandToVar(unaryOp)
      default:
        // Complex expression - lower and return var name
        const op = this.lowerExpr(expr)
        return this.operandToVar(op)
    }
  }

  private exprToEntitySelector(expr: Expr): string | null {
    if (expr.kind === 'selector') {
      return this.selectorToString(expr.sel)
    }

    if (expr.kind === 'ident') {
      const constValue = this.constValues.get(expr.name)
      if (constValue) {
        return this.exprToEntitySelector(constValue)
      }
      const mapped = this.varMap.get(expr.name)
      if (mapped?.startsWith('@')) {
        return mapped
      }
    }

    return null
  }

  private appendTypeFilter(selector: string, mcType: string): string {
    if (selector.endsWith(']')) {
      return `${selector.slice(0, -1)},type=${mcType}]`
    }
    return `${selector}[type=${mcType}]`
  }

  private exprToSnbt(expr: Expr): string {
    switch (expr.kind) {
      case 'struct_lit': {
        const entries = expr.fields.map(f => `${f.name}:${this.exprToSnbt(f.value)}`)
        return `{${entries.join(',')}}`
      }
      case 'array_lit': {
        const items = expr.elements.map(e => this.exprToSnbt(e))
        return `[${items.join(',')}]`
      }
      case 'str_lit':
        return `"${expr.value}"`
      case 'int_lit':
        return String(expr.value)
      case 'float_lit':
        return String(expr.value)
      case 'byte_lit':
        return `${expr.value}b`
      case 'short_lit':
        return `${expr.value}s`
      case 'long_lit':
        return `${expr.value}L`
      case 'double_lit':
        return `${expr.value}d`
      case 'bool_lit':
        return expr.value ? '1b' : '0b'
      default:
        return this.exprToString(expr)
    }
  }

  private exprToTargetString(expr: Expr): string {
    if (expr.kind === 'selector') {
      return this.selectorToString(expr.sel)
    }

    if (expr.kind === 'str_lit' && expr.value.startsWith('@')) {
      const span = getSpan(expr)
      this.warnings.push({
        message: `Quoted selector "${expr.value}" is deprecated; pass ${expr.value} without quotes`,
        code: 'W_QUOTED_SELECTOR',
        ...(span ? { line: span.line, col: span.col } : {}),
      })
      return expr.value
    }

    return this.exprToString(expr)
  }

  private exprToLiteral(expr: Expr): string {
    if (expr.kind === 'int_lit') return expr.value.toString()
    if (expr.kind === 'float_lit') return Math.trunc(expr.value).toString()
    return '0'
  }

  private exprToQuotedString(expr: Expr): string {
    return JSON.stringify(this.exprToString(expr))
  }

  private exprToTextComponent(expr: Expr): string {
    return JSON.stringify({ text: this.exprToString(expr) })
  }

  private exprToBoolString(expr: Expr): string {
    if (expr.kind === 'bool_lit') {
      return expr.value ? 'true' : 'false'
    }
    return this.exprToString(expr)
  }

  private isTeamTextOption(option: string): boolean {
    return option === 'displayName' || option === 'prefix' || option === 'suffix'
  }

  private exprToScoreboardObjective(expr: Expr, span?: Span): string {
    if (expr.kind === 'mc_name') {
      return expr.value
    }

    const objective = this.exprToString(expr)
    if (objective.startsWith('#') || objective.includes('.')) {
      return objective.startsWith('#') ? objective.slice(1) : objective
    }

    return `${this.getObjectiveNamespace(span)}.${objective}`
  }

  private resolveScoreboardObjective(playerExpr: Expr | undefined, objectiveExpr: Expr, span?: Span): string {
    const stdlibInternalObjective = this.tryGetStdlibInternalObjective(playerExpr, objectiveExpr, span)
    if (stdlibInternalObjective) {
      return stdlibInternalObjective
    }
    return this.exprToScoreboardObjective(objectiveExpr, span)
  }

  private getObjectiveNamespace(span?: Span): string {
    const filePath = this.filePathForSpan(span)
    if (!filePath) {
      return this.namespace
    }

    return this.isStdlibFile(filePath) ? 'rs' : this.namespace
  }

  private tryGetStdlibInternalObjective(playerExpr: Expr | undefined, objectiveExpr: Expr, span?: Span): string | null {
    if (!span || !this.currentStdlibCallSite || objectiveExpr.kind !== 'mc_name' || objectiveExpr.value !== 'rs') {
      return null
    }

    const filePath = this.filePathForSpan(span)
    if (!filePath || !this.isStdlibFile(filePath)) {
      return null
    }

    const resourceBase = this.getStdlibInternalResourceBase(playerExpr)
    if (!resourceBase) {
      return null
    }

    const hash = this.shortHash(this.serializeCallSite(this.currentStdlibCallSite))
    return `rs._${resourceBase}_${hash}`
  }

  private getStdlibInternalResourceBase(playerExpr: Expr | undefined): string | null {
    if (!playerExpr || playerExpr.kind !== 'str_lit') {
      return null
    }

    const match = playerExpr.value.match(/^([a-z0-9]+)_/)
    return match?.[1] ?? null
  }

  private getStdlibCallSiteContext(fn: FnDecl, exprSpan?: Span): StdlibCallSiteContext | undefined {
    const fnFilePath = this.filePathForSpan(getSpan(fn))
    if (!fnFilePath || !this.isStdlibFile(fnFilePath)) {
      return undefined
    }

    if (this.currentStdlibCallSite) {
      return this.currentStdlibCallSite
    }

    if (!exprSpan) {
      return undefined
    }

    return {
      filePath: this.filePathForSpan(exprSpan),
      line: exprSpan.line,
      col: exprSpan.col,
    }
  }

  private serializeCallSite(callSite: StdlibCallSiteContext): string {
    return `${callSite.filePath ?? '<memory>'}:${callSite.line}:${callSite.col}`
  }

  private shortHash(input: string): string {
    let hash = 2166136261
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 4)
  }

  private isStdlibFile(filePath: string): boolean {
    const normalized = path.normalize(filePath)
    const stdlibSegment = `${path.sep}src${path.sep}stdlib${path.sep}`
    return normalized.includes(stdlibSegment)
  }

  private filePathForSpan(span?: Span): string | undefined {
    if (!span) {
      return undefined
    }

    const line = span.line
    return this.sourceRanges.find(range => line >= range.startLine && line <= range.endLine)?.filePath
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

    if (name === 'summon') {
      if (args.length >= 2 && pos1) {
        const nbt = args[2] ? ` ${this.exprToString(args[2])}` : ''
        return `summon ${this.exprToString(args[0])} ${emitBlockPos(pos1)}${nbt}`
      }
      return null
    }

    return null
  }

  private lowerTpCommand(args: Expr[]): string | null {
    const pos0 = args[0] ? this.resolveBlockPosExpr(args[0]) : null
    const pos1 = args[1] ? this.resolveBlockPosExpr(args[1]) : null

    if (args.length === 1 && pos0) {
      return `tp ${emitBlockPos(pos0)}`
    }

    if (args.length === 2) {
      if (pos1) {
        return `tp ${this.exprToString(args[0])} ${emitBlockPos(pos1)}`
      }
      return `tp ${this.exprToString(args[0])} ${this.exprToString(args[1])}`
    }

    if (args.length === 4) {
      return `tp ${this.exprToString(args[0])} ${this.exprToString(args[1])} ${this.exprToString(args[2])} ${this.exprToString(args[3])}`
    }

    return null
  }

  private lowerTpCommandMacroAware(args: Expr[]): { cmd: string } | null {
    const pos0 = args[0] ? this.resolveBlockPosExpr(args[0]) : null
    const pos1 = args[1] ? this.resolveBlockPosExpr(args[1]) : null

    // If blockpos args are used, no macro needed (coords are already resolved)
    if (args.length === 1 && pos0) {
      return { cmd: `tp ${emitBlockPos(pos0)}` }
    }
    if (args.length === 2 && pos1) {
      return { cmd: `tp ${this.exprToString(args[0])} ${emitBlockPos(pos1)}` }
    }

    // Check for macro args (int params used as coordinates)
    if (args.length >= 2) {
      const argResults = args.map(a => this.exprToBuiltinArg(a))
      const hasMacro = argResults.some(r => r.macroParam !== undefined)
      if (hasMacro) {
        argResults.forEach(r => { if (r.macroParam) this.currentFnMacroParams.add(r.macroParam) })
        const strs = argResults.map(r => r.str)
        if (args.length === 2) {
          return { cmd: `$tp ${strs[0]} ${strs[1]}` }
        }
        if (args.length === 4) {
          return { cmd: `$tp ${strs[0]} ${strs[1]} ${strs[2]} ${strs[3]}` }
        }
      }
    }

    // Fallback to non-macro
    const plain = this.lowerTpCommand(args)
    return plain ? { cmd: plain } : null
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

  private inferLambdaReturnType(expr: Extract<Expr, { kind: 'lambda' }>): TypeNode {
    if (expr.returnType) {
      return this.normalizeType(expr.returnType)
    }
    if (Array.isArray(expr.body)) {
      return { kind: 'named', name: 'void' }
    }
    return this.inferExprType(expr.body) ?? { kind: 'named', name: 'void' }
  }

  private inferExprType(expr: Expr): TypeNode | undefined {
    if (expr.kind === 'int_lit') return { kind: 'named', name: 'int' }
    if (expr.kind === 'float_lit') return { kind: 'named', name: 'float' }
    if (expr.kind === 'bool_lit') return { kind: 'named', name: 'bool' }
    if (expr.kind === 'str_lit' || expr.kind === 'str_interp') return { kind: 'named', name: 'string' }
    if (expr.kind === 'f_string') return { kind: 'named', name: 'format_string' }
    if (expr.kind === 'blockpos') return { kind: 'named', name: 'BlockPos' }
    if (expr.kind === 'ident') {
      const constValue = this.constValues.get(expr.name)
      if (constValue) {
        switch (constValue.kind) {
          case 'int_lit':
            return { kind: 'named', name: 'int' }
          case 'float_lit':
            return { kind: 'named', name: 'float' }
          case 'bool_lit':
            return { kind: 'named', name: 'bool' }
          case 'str_lit':
            return { kind: 'named', name: 'string' }
        }
      }
      return this.varTypes.get(expr.name)
    }
    if (expr.kind === 'lambda') {
      return {
        kind: 'function_type',
        params: expr.params.map(param => this.normalizeType(param.type ?? { kind: 'named', name: 'int' })),
        return: this.inferLambdaReturnType(expr),
      }
    }
    if (expr.kind === 'call') {
      const resolved = this.resolveFunctionRefByName(expr.fn) ?? this.resolveInstanceMethod(expr)?.loweredName ?? expr.fn
      return this.fnDecls.get(resolved)?.returnType
    }
    if (expr.kind === 'static_call') {
      return this.implMethods.get(expr.type)?.get(expr.method)?.fn.returnType
    }
    if (expr.kind === 'invoke') {
      const calleeType = this.inferExprType(expr.callee)
      if (calleeType?.kind === 'function_type') {
        return calleeType.return
      }
    }
    if (expr.kind === 'binary') {
      if (['==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(expr.op)) {
        return { kind: 'named', name: 'bool' }
      }
      return this.inferExprType(expr.left)
    }
    if (expr.kind === 'unary') {
      return expr.op === '!' ? { kind: 'named', name: 'bool' } : this.inferExprType(expr.operand)
    }
    if (expr.kind === 'array_lit') {
      return {
        kind: 'array',
        elem: expr.elements[0] ? (this.inferExprType(expr.elements[0]) ?? { kind: 'named', name: 'int' }) : { kind: 'named', name: 'int' },
      }
    }
    if (expr.kind === 'member' && expr.obj.kind === 'ident' && this.enumDefs.has(expr.obj.name)) {
      return { kind: 'enum', name: expr.obj.name }
    }
    return undefined
  }

  /**
   * Checks a raw() command string for `${...}` interpolation containing runtime variables.
   * - If the interpolated expression is a numeric literal → OK (MC macro syntax).
   * - If the interpolated name is a compile-time constant (in constValues) → OK.
   * - If the interpolated name is a known runtime variable (in varMap) → DiagnosticError.
   * - Unknown names → OK (could be MC macro params or external constants).
   *
   * This catches the common mistake of writing raw("say ${score}") expecting interpolation,
   * which would silently emit a literal `${score}` in the MC command.
   */
  private checkRawCommandInterpolation(cmd: string, span?: Span): void {
    const interpRe = /\$\{([^}]+)\}/g
    let match: RegExpExecArray | null
    while ((match = interpRe.exec(cmd)) !== null) {
      const name = match[1].trim()
      // Numeric/boolean literals are fine (intentional MC macro syntax)
      if (/^\d+(\.\d+)?$/.test(name) || name === 'true' || name === 'false') {
        continue
      }
      // Compile-time constants are fine
      if (this.constValues.has(name)) {
        continue
      }
      // Only error if it's a known runtime variable (in varMap or function params)
      // Unknown identifiers are left alone (could be MC macro params the user intends)
      if (this.varMap.has(name) || this.currentFnParamNames.has(name)) {
        const loc = span ?? { line: 1, col: 1 }
        throw new DiagnosticError(
          'LoweringError',
          `raw() command contains runtime variable interpolation '\${${name}}'. ` +
          `Variables cannot be interpolated into raw commands at compile time. ` +
          `Use f-string messages (say/tell/announce) or MC macro syntax '$(${name})' for MC 1.20.2+ commands.`,
          loc
        )
      }
    }
  }

  private resolveInstanceMethod(expr: Extract<Expr, { kind: 'call' }>): { fn: FnDecl; loweredName: string } | null {
    const receiver = expr.args[0]
    if (!receiver) {
      return null
    }

    const receiverType = this.inferExprType(receiver)
    if (receiverType?.kind !== 'struct') {
      return null
    }

    const method = this.implMethods.get(receiverType.name)?.get(expr.fn)
    if (!method || method.fn.params[0]?.name !== 'self') {
      return null
    }

    return method
  }

  private normalizeType(type: TypeNode): TypeNode {
    if (type.kind === 'array') {
      return { kind: 'array', elem: this.normalizeType(type.elem) }
    }
    if (type.kind === 'function_type') {
      return {
        kind: 'function_type',
        params: type.params.map(param => this.normalizeType(param)),
        return: this.normalizeType(type.return),
      }
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

  private storeStringValue(name: string, expr: Expr): boolean {
    const value = this.resolveStaticString(expr)
    if (value === null) {
      this.stringValues.delete(name)
      return false
    }
    this.stringValues.set(name, value)
    this.builder.emitRaw(`data modify storage rs:strings ${name} set value ${JSON.stringify(value)}`)
    return true
  }

  private resolveStaticString(expr: Expr | undefined): string | null {
    if (!expr) {
      return null
    }

    if (expr.kind === 'str_lit') {
      return expr.value
    }

    if (expr.kind === 'ident') {
      const constValue = this.constValues.get(expr.name)
      if (constValue?.kind === 'str_lit') {
        return constValue.value
      }
      return this.stringValues.get(expr.name) ?? null
    }

    return null
  }

  private getStringStoragePath(expr: Expr | undefined): string | null {
    if (!expr || expr.kind !== 'ident') {
      return null
    }

    if (this.stringValues.has(expr.name)) {
      return `rs:strings ${expr.name}`
    }

    return null
  }

  private lowerConstLiteral(expr: ConstDecl['value']): Operand {
    switch (expr.kind) {
      case 'int_lit':
        return { kind: 'const', value: expr.value }
      case 'float_lit':
        return { kind: 'const', value: Math.round(expr.value * 1000) }
      case 'bool_lit':
        return { kind: 'const', value: expr.value ? 1 : 0 }
      case 'str_lit':
        return { kind: 'const', value: 0 }
    }
  }

  private operandToVar(op: Operand): string {
    if (op.kind === 'var') return op.name
    // Constant needs to be stored in a temp
    const dst = this.builder.freshTemp()
    this.builder.emitAssign(dst, op)
    return dst
  }

  private selectorToString(sel: EntitySelector): string {
    const { kind, filters } = sel
    if (!filters) return this.finalizeSelector(kind)

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
    // Position filters
    if (filters.x) parts.push(`x=${this.rangeToString(filters.x)}`)
    if (filters.y) parts.push(`y=${this.rangeToString(filters.y)}`)
    if (filters.z) parts.push(`z=${this.rangeToString(filters.z)}`)
    // Rotation filters
    if (filters.x_rotation) parts.push(`x_rotation=${this.rangeToString(filters.x_rotation)}`)
    if (filters.y_rotation) parts.push(`y_rotation=${this.rangeToString(filters.y_rotation)}`)

    return this.finalizeSelector(parts.length ? `${kind}[${parts.join(',')}]` : kind)
  }

  private finalizeSelector(selector: string): string {
    return normalizeSelector(selector, this.warnings)
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
  private static globalTempId = 0
  private labelCount = 0
  private blocks: any[] = []
  private currentBlock: any = null
  private locals = new Set<string>()

  /** Reset the global temp counter (call between compilations). */
  static resetTempCounter(): void {
    LoweringBuilder.globalTempId = 0
  }

  freshTemp(): string {
    const name = `$_${LoweringBuilder.globalTempId++}`
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
