/**
 * RedScript AST Types
 *
 * This module defines the Abstract Syntax Tree structure for RedScript.
 * The AST is produced by the parser and consumed by the lowering pass.
 */

// ---------------------------------------------------------------------------
// Binary / comparison operators (shared across AST, HIR, MIR)
// ---------------------------------------------------------------------------

export type BinOp = '+' | '-' | '*' | '/' | '%'
export type CmpOp = '==' | '!=' | '<' | '<=' | '>' | '>='

// ---------------------------------------------------------------------------
// Source Span
// ---------------------------------------------------------------------------

export interface Span {
  line: number      // 1-indexed
  col: number       // 1-indexed
  endLine?: number
  endCol?: number
}

// ---------------------------------------------------------------------------
// Type Nodes
// ---------------------------------------------------------------------------

export type PrimitiveType = 'int' | 'bool' | 'float' | 'fixed' | 'string' | 'void' | 'BlockPos' | 'byte' | 'short' | 'long' | 'double' | 'format_string'

// Entity type hierarchy
export type EntityTypeName =
  | 'entity'      // Base type
  | 'Player'      // @a, @p, @r
  | 'Mob'         // Base mob type
  | 'HostileMob'  // Hostile mobs
  | 'PassiveMob'  // Passive mobs
  // Hostile mob types
  | 'Zombie' | 'Skeleton' | 'Creeper' | 'Spider' | 'Enderman'
  | 'Blaze' | 'Witch' | 'Slime' | 'ZombieVillager' | 'Husk'
  | 'Drowned' | 'Stray' | 'WitherSkeleton' | 'CaveSpider'
  // Passive mob types
  | 'Pig' | 'Cow' | 'Sheep' | 'Chicken' | 'Villager' | 'WanderingTrader'
  // Non-mob entities
  | 'ArmorStand' | 'Item' | 'Arrow'

export type TypeNode =
  | { kind: 'named'; name: PrimitiveType }
  | { kind: 'array'; elem: TypeNode }
  | { kind: 'struct'; name: string }
  | { kind: 'enum'; name: string }
  | { kind: 'function_type'; params: TypeNode[]; return: TypeNode }
  | { kind: 'entity'; entityType: EntityTypeName }  // Entity types
  | { kind: 'selector'; entityType?: string }  // Selector type, optionally parameterized: selector<Player>
  | { kind: 'tuple'; elements: TypeNode[] }  // Tuple type: (int, int, bool)
  | { kind: 'option'; inner: TypeNode }  // Option<T> — null safety wrapper

export interface LambdaParam {
  name: string
  type?: TypeNode
}

export interface LambdaExpr {
  kind: 'lambda'
  params: LambdaParam[]
  returnType?: TypeNode
  body: Expr | Block
}

export type FStringPart =
  | { kind: 'text'; value: string }
  | { kind: 'expr'; expr: Expr }

export interface FStringExpr {
  kind: 'f_string'
  parts: FStringPart[]
  span?: Span
}

// ---------------------------------------------------------------------------
// Range Expression
// ---------------------------------------------------------------------------

export interface RangeExpr {
  min?: number    // undefined = no lower bound
  max?: number    // undefined = no upper bound
}

// ---------------------------------------------------------------------------
// Entity Selector
// ---------------------------------------------------------------------------

export type SelectorKind = '@a' | '@e' | '@s' | '@p' | '@r' | '@n'

export interface SelectorFilter {
  type?: string
  distance?: RangeExpr
  tag?: string[]
  notTag?: string[]
  scores?: Record<string, RangeExpr>
  limit?: number
  sort?: 'nearest' | 'furthest' | 'random' | 'arbitrary'
  nbt?: string
  gamemode?: string
  // Position filters
  x?: RangeExpr
  y?: RangeExpr
  z?: RangeExpr
  // Rotation filters
  x_rotation?: RangeExpr
  y_rotation?: RangeExpr
}

export interface EntitySelector {
  kind: SelectorKind
  filters?: SelectorFilter
}

// ---------------------------------------------------------------------------
// Block Positions
// ---------------------------------------------------------------------------

export type CoordComponent =
  | { kind: 'absolute'; value: number }
  | { kind: 'relative'; offset: number }
  | { kind: 'local'; offset: number }

export interface BlockPosExpr {
  kind: 'blockpos'
  x: CoordComponent
  y: CoordComponent
  z: CoordComponent
}

// ---------------------------------------------------------------------------
// Assignment Operators
// ---------------------------------------------------------------------------

export type AssignOp = '=' | '+=' | '-=' | '*=' | '/=' | '%='

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

export type Expr =
  | { kind: 'int_lit';    value: number; span?: Span }
  | { kind: 'float_lit';  value: number; span?: Span }
  | { kind: 'byte_lit';   value: number; span?: Span }
  | { kind: 'short_lit';  value: number; span?: Span }
  | { kind: 'long_lit';   value: number; span?: Span }
  | { kind: 'double_lit'; value: number; span?: Span }
  | { kind: 'rel_coord';  value: string; span?: Span }   // ~  ~5  ~-3  (relative coordinate)
  | { kind: 'local_coord'; value: string; span?: Span }  // ^  ^5  ^-3  (local/facing coordinate)
  | { kind: 'bool_lit';   value: boolean; span?: Span }
  | { kind: 'str_lit';    value: string; span?: Span }
  | { kind: 'mc_name';   value: string; span?: Span }  // #health → "health" (MC identifier)
  | { kind: 'str_interp'; parts: Array<string | Expr>; span?: Span }
  | FStringExpr
  | { kind: 'range_lit';  range: RangeExpr; span?: Span }
  | (BlockPosExpr & { span?: Span })
  | { kind: 'ident';      name: string; span?: Span }
  | { kind: 'selector';   raw: string; isSingle: boolean; sel: EntitySelector; span?: Span }
  | { kind: 'binary';     op: BinOp | CmpOp | '&&' | '||'; left: Expr; right: Expr; span?: Span }
  | { kind: 'is_check';   expr: Expr; entityType: EntityTypeName; span?: Span }
  | { kind: 'unary';      op: '!' | '-'; operand: Expr; span?: Span }
  | { kind: 'assign';     target: string; op: AssignOp; value: Expr; span?: Span }
  | { kind: 'call';       fn: string; args: Expr[]; typeArgs?: TypeNode[]; span?: Span }
  | { kind: 'invoke';     callee: Expr; args: Expr[]; span?: Span }
  | { kind: 'member';     obj: Expr; field: string; span?: Span }
  | { kind: 'struct_lit'; fields: { name: string; value: Expr }[]; span?: Span }
  | { kind: 'member_assign'; obj: Expr; field: string; op: AssignOp; value: Expr; span?: Span }
  | { kind: 'index';      obj: Expr; index: Expr; span?: Span }
  | { kind: 'index_assign'; obj: Expr; index: Expr; op: AssignOp; value: Expr; span?: Span }
  | { kind: 'array_lit';  elements: Expr[]; span?: Span }
  | { kind: 'static_call'; type: string; method: string; args: Expr[]; span?: Span }
  | { kind: 'path_expr'; enumName: string; variant: string; span?: Span }
  | { kind: 'enum_construct'; enumName: string; variant: string; args: { name: string; value: Expr }[]; span?: Span }
  | (LambdaExpr & { span?: Span })
  | { kind: 'tuple_lit'; elements: Expr[]; span?: Span }
  | { kind: 'some_lit'; value: Expr; span?: Span }  // Some(expr)
  | { kind: 'none_lit'; span?: Span }               // None
  | { kind: 'unwrap_or'; opt: Expr; default_: Expr; span?: Span }  // opt.unwrap_or(default)
  | { kind: 'type_cast'; expr: Expr; targetType: TypeNode; span?: Span }  // expr as Type

export type LiteralExpr =
  | Extract<Expr, { kind: 'int_lit' }>
  | Extract<Expr, { kind: 'float_lit' }>
  | Extract<Expr, { kind: 'bool_lit' }>
  | Extract<Expr, { kind: 'str_lit' }>

// ---------------------------------------------------------------------------
// Statements
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Execute Subcommand Types
// ---------------------------------------------------------------------------

export type ExecuteSubcommand =
  // Context modifiers
  | { kind: 'as'; selector: EntitySelector }
  | { kind: 'at'; selector: EntitySelector }
  | { kind: 'positioned'; x: string; y: string; z: string }
  | { kind: 'positioned_as'; selector: EntitySelector }
  | { kind: 'rotated'; yaw: string; pitch: string }
  | { kind: 'rotated_as'; selector: EntitySelector }
  | { kind: 'facing'; x: string; y: string; z: string }
  | { kind: 'facing_entity'; selector: EntitySelector; anchor: 'eyes' | 'feet' }
  | { kind: 'anchored'; anchor: 'eyes' | 'feet' }
  | { kind: 'align'; axes: string }
  | { kind: 'in'; dimension: string }
  | { kind: 'on'; relation: string }
  | { kind: 'summon'; entity: string }
  // Conditions
  | { kind: 'if_entity'; selector?: EntitySelector; varName?: string; filters?: SelectorFilter }
  | { kind: 'unless_entity'; selector?: EntitySelector; varName?: string; filters?: SelectorFilter }
  | { kind: 'if_block'; pos: [string, string, string]; block: string }
  | { kind: 'unless_block'; pos: [string, string, string]; block: string }
  | { kind: 'if_score'; target: string; targetObj: string; op: string; source: string; sourceObj: string }
  | { kind: 'unless_score'; target: string; targetObj: string; op: string; source: string; sourceObj: string }
  | { kind: 'if_score_range'; target: string; targetObj: string; range: string }
  | { kind: 'unless_score_range'; target: string; targetObj: string; range: string }
  // Store
  | { kind: 'store_result'; target: string; targetObj: string }
  | { kind: 'store_success'; target: string; targetObj: string }

// ---------------------------------------------------------------------------
// Match Patterns
// ---------------------------------------------------------------------------

export type MatchPattern =
  | { kind: 'PatSome'; binding: string }   // Some(x)
  | { kind: 'PatNone' }                    // None
  | { kind: 'PatInt'; value: number }      // 1, 2, 3
  | { kind: 'PatWild' }                    // _
  | { kind: 'PatExpr'; expr: Expr }        // legacy: range_lit or other expr
  | { kind: 'PatEnum'; enumName: string; variant: string; bindings: string[] }  // Color::RGB(r, g, b)

export type Stmt =
  | { kind: 'let';        name: string; type?: TypeNode; init: Expr; span?: Span }
  | { kind: 'let_destruct'; names: string[]; type?: TypeNode; init: Expr; span?: Span }
  | { kind: 'const_decl'; name: string; type: TypeNode; value: Expr; span?: Span }
  | { kind: 'expr';       expr: Expr; span?: Span }
  | { kind: 'return';     value?: Expr; span?: Span }
  | { kind: 'break';      span?: Span }
  | { kind: 'continue';   span?: Span }
  | { kind: 'break_label'; label: string; span?: Span }
  | { kind: 'continue_label'; label: string; span?: Span }
  | { kind: 'labeled_loop'; label: string; body: Stmt; span?: Span }
  | { kind: 'if';         cond: Expr; then: Block; else_?: Block; span?: Span }
  | { kind: 'while';      cond: Expr; body: Block; span?: Span }
  | { kind: 'do_while';   cond: Expr; body: Block; span?: Span }
  | { kind: 'repeat';     count: number; body: Block; span?: Span }
  | { kind: 'for';        init?: Stmt; cond: Expr; step: Expr; body: Block; span?: Span }
  | { kind: 'foreach';    binding: string; iterable: Expr; body: Block; executeContext?: string; span?: Span }
  | { kind: 'for_range';  varName: string; start: Expr; end: Expr; inclusive?: boolean; body: Block; span?: Span }
  | { kind: 'for_in_array'; binding: string; arrayName: string; lenExpr: Expr; body: Block; span?: Span }
  | { kind: 'for_each';    binding: string; array: Expr; body: Block; span?: Span }
  | { kind: 'match';      expr: Expr; arms: { pattern: MatchPattern; body: Block }[]; span?: Span }
  | { kind: 'if_let_some'; binding: string; init: Expr; then: Block; else_?: Block; span?: Span }
  | { kind: 'while_let_some'; binding: string; init: Expr; body: Block; span?: Span }
  | { kind: 'as_block';   selector: EntitySelector; body: Block; span?: Span }
  | { kind: 'at_block';   selector: EntitySelector; body: Block; span?: Span }
  | { kind: 'as_at';      as_sel: EntitySelector; at_sel: EntitySelector; body: Block; span?: Span }
  | { kind: 'execute';    subcommands: ExecuteSubcommand[]; body: Block; span?: Span }
  | { kind: 'raw';        cmd: string; span?: Span }

export type Block = Stmt[]

// ---------------------------------------------------------------------------
// Decorators
// ---------------------------------------------------------------------------

export interface Decorator {
  name: 'tick' | 'load' | 'watch' | 'on' | 'on_trigger' | 'on_advancement' | 'on_craft' | 'on_death' | 'on_login' | 'on_join_team' | 'keep' | 'require_on_load' | 'coroutine' | 'schedule' | 'deprecated' | 'inline' | 'no-inline' | 'config' | 'singleton' | 'profile' | 'benchmark' | 'throttle' | 'retry' | 'memoize' | 'test'
  args?: {
    rate?: number
    objective?: string
    eventType?: string
    trigger?: string
    advancement?: string
    item?: string
    team?: string
    batch?: number
    onDone?: string
    ticks?: number
    /** @deprecated decorator message */
    message?: string
    /** @config decorator: config key name */
    configKey?: string
    /** @config decorator: default value */
    configDefault?: number
    /** @retry decorator: max retry count */
    max?: number
    /** @test decorator: human-readable test label */
    testLabel?: string
  }
  /** Raw positional arguments (used by @requires and future generic decorators). */
  rawArgs?: Array<{ kind: 'string'; value: string } | { kind: 'number'; value: number }>
}

// ---------------------------------------------------------------------------
// Function Declaration
// ---------------------------------------------------------------------------

export interface Param {
  name: string
  type: TypeNode
  default?: Expr
}

export interface FnDecl {
  /** Set when this function was parsed from a `module library;` source.
   *  Library functions are NOT MC entry points — DCE only keeps them if they
   *  are reachable from a non-library (user) entry point. */
  isLibraryFn?: boolean
  /** True when declared with `export fn` or `@keep fn` — survives DCE. */
  isExported?: boolean
  /** Scoreboard objective watched by @watch("..."), if present. */
  watchObjective?: string
  name: string
  /** Generic type parameter names, e.g. ['T'] for fn foo<T>(...) */
  typeParams?: string[]
  params: Param[]
  returnType: TypeNode
  decorators: Decorator[]
  body: Block
  span?: Span
  sourceFile?: string
}

// ---------------------------------------------------------------------------
// Struct Declaration
// ---------------------------------------------------------------------------

export interface StructField {
  name: string
  type: TypeNode
}

export interface StructDecl {
  name: string
  extends?: string
  fields: StructField[]
  /** True when the struct was declared with `@singleton` */
  isSingleton?: boolean
  span?: Span
}

export interface ImplBlock {
  kind: 'impl_block'
  typeName: string
  /** Trait name when declared as `impl TraitName for TypeName` (e.g. "Display") */
  traitName?: string
  methods: FnDecl[]
  span?: Span
}

// ---------------------------------------------------------------------------
// Interface / Trait Declarations
// ---------------------------------------------------------------------------

/** A method signature in an interface body (no body) */
export interface InterfaceMethod {
  name: string
  params: Param[]
  returnType?: TypeNode
  span?: Span
}

/** `interface Drawable { fn draw(self, x: int, y: int) ... }` */
export interface InterfaceDecl {
  name: string
  methods: InterfaceMethod[]
  span?: Span
}

export interface EnumPayloadField {
  name: string
  type: TypeNode
}

export interface EnumVariant {
  name: string
  value?: number
  /** Payload fields for tuple-like variants, e.g. RGB(r: int, g: int, b: int) */
  fields?: EnumPayloadField[]
}

export interface EnumDecl {
  name: string
  variants: EnumVariant[]
  span?: Span
}

export interface ConstDecl {
  name: string
  type: TypeNode
  value: LiteralExpr
  span?: Span
}

export interface GlobalDecl {
  kind: 'global'
  name: string
  type: TypeNode
  init: Expr
  mutable: boolean  // let = true, const = false
  /** Present when the global was declared with @config("key", default: value) */
  configKey?: string
  /** Default value for @config globals */
  configDefault?: number
  span?: Span
}

// ---------------------------------------------------------------------------
// Import Declarations (Phase 5b module system)
// ---------------------------------------------------------------------------

export interface ImportDecl {
  /** The module being imported from, e.g. "math" in `import math::sin` */
  moduleName: string
  /** The symbol being imported, or '*' for wildcard.
   *  Undefined when this is a whole-module file import (`import player_utils`). */
  symbol?: string   // '*' | identifier | undefined (whole-module import)
  span?: Span
}

// ---------------------------------------------------------------------------
// Program (Top-Level)
// ---------------------------------------------------------------------------

export interface Program {
  namespace: string    // Inferred from filename or `namespace mypack;`
  /** Module name declared with `module <name>;` (undefined if no module decl) */
  moduleName?: string
  globals: GlobalDecl[]
  declarations: FnDecl[]
  structs: StructDecl[]
  implBlocks: ImplBlock[]
  enums: EnumDecl[]
  consts: ConstDecl[]
  /** Phase 5b: module imports (`import math::sin;`) */
  imports: ImportDecl[]
  /** Interface / trait declarations */
  interfaces: InterfaceDecl[]
  /** True when the source file declares `module library;`.
   *  Library-mode: all functions are DCE-eligible by default — none are treated
   *  as MC entry points unless they carry @tick / @load / @on / @keep etc. */
  isLibrary?: boolean
}
