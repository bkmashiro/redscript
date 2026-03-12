/**
 * RedScript AST Types
 *
 * This module defines the Abstract Syntax Tree structure for RedScript.
 * The AST is produced by the parser and consumed by the lowering pass.
 */

import type { BinOp, CmpOp } from '../ir/types'

// ---------------------------------------------------------------------------
// Type Nodes
// ---------------------------------------------------------------------------

export type PrimitiveType = 'int' | 'bool' | 'float' | 'string' | 'void' | 'BlockPos'

export type TypeNode =
  | { kind: 'named'; name: PrimitiveType }
  | { kind: 'array'; elem: TypeNode }
  | { kind: 'struct'; name: string }
  | { kind: 'enum'; name: string }
  | { kind: 'function_type'; params: TypeNode[]; return: TypeNode }

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
  | { kind: 'int_lit';    value: number }
  | { kind: 'float_lit';  value: number }
  | { kind: 'bool_lit';   value: boolean }
  | { kind: 'str_lit';    value: string }
  | { kind: 'str_interp'; parts: Array<string | Expr> }
  | { kind: 'range_lit';  range: RangeExpr }
  | BlockPosExpr
  | { kind: 'ident';      name: string }
  | { kind: 'selector';   raw: string; isSingle: boolean; sel: EntitySelector }
  | { kind: 'binary';     op: BinOp | CmpOp | '&&' | '||'; left: Expr; right: Expr }
  | { kind: 'unary';      op: '!' | '-'; operand: Expr }
  | { kind: 'assign';     target: string; op: AssignOp; value: Expr }
  | { kind: 'call';       fn: string; args: Expr[] }
  | { kind: 'invoke';     callee: Expr; args: Expr[] }
  | { kind: 'member';     obj: Expr; field: string }
  | { kind: 'struct_lit'; fields: { name: string; value: Expr }[] }
  | { kind: 'member_assign'; obj: Expr; field: string; op: AssignOp; value: Expr }
  | { kind: 'index';      obj: Expr; index: Expr }
  | { kind: 'array_lit';  elements: Expr[] }
  | { kind: 'static_call'; type: string; method: string; args: Expr[] }
  | LambdaExpr

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
  | { kind: 'as'; selector: EntitySelector }
  | { kind: 'at'; selector: EntitySelector }
  | { kind: 'if_entity'; selector: EntitySelector }
  | { kind: 'unless_entity'; selector: EntitySelector }
  | { kind: 'in'; dimension: string }

export type Stmt =
  | { kind: 'let';        name: string; type?: TypeNode; init: Expr }
  | { kind: 'expr';       expr: Expr }
  | { kind: 'return';     value?: Expr }
  | { kind: 'if';         cond: Expr; then: Block; else_?: Block }
  | { kind: 'while';      cond: Expr; body: Block }
  | { kind: 'for';        init?: Stmt; cond: Expr; step: Expr; body: Block }
  | { kind: 'foreach';    binding: string; iterable: Expr; body: Block }
  | { kind: 'match';      expr: Expr; arms: { pattern: Expr | null; body: Block }[] }
  | { kind: 'as_block';   selector: EntitySelector; body: Block }
  | { kind: 'at_block';   selector: EntitySelector; body: Block }
  | { kind: 'as_at';      as_sel: EntitySelector; at_sel: EntitySelector; body: Block }
  | { kind: 'execute';    subcommands: ExecuteSubcommand[]; body: Block }
  | { kind: 'raw';        cmd: string }

export type Block = Stmt[]

// ---------------------------------------------------------------------------
// Decorators
// ---------------------------------------------------------------------------

export interface Decorator {
  name: 'tick' | 'on_trigger' | 'on_advancement' | 'on_craft' | 'on_death' | 'on_login' | 'on_join_team'
  args?: {
    rate?: number
    trigger?: string
    advancement?: string
    item?: string
    team?: string
  }
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
  name: string
  params: Param[]
  returnType: TypeNode
  decorators: Decorator[]
  body: Block
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
  fields: StructField[]
}

export interface EnumVariant {
  name: string
  value?: number
}

export interface EnumDecl {
  name: string
  variants: EnumVariant[]
}

export interface ConstDecl {
  name: string
  type: TypeNode
  value: LiteralExpr
}

// ---------------------------------------------------------------------------
// Program (Top-Level)
// ---------------------------------------------------------------------------

export interface Program {
  namespace: string    // Inferred from filename or `namespace mypack;`
  declarations: FnDecl[]
  structs: StructDecl[]
  enums: EnumDecl[]
  consts: ConstDecl[]
}
