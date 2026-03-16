/**
 * HIR (High-level IR) Types — Stage 2 of the RedScript compiler pipeline.
 *
 * HIR is a desugared, structured representation. Compared to the AST:
 * - `for` loops → `while` loops with explicit init/step
 * - `a += b` → `a = a + b`
 * - `a && b` → `if(a) { b } else { false }`
 * - `a || b` → `if(a) { true } else { b }`
 * - `cond ? a : b` → if/else expression (not present in RedScript, but pattern applies)
 * - `as_block`, `at_block`, `as_at` → unified `execute` with subcommands
 *
 * All types and names are preserved from the AST.
 */

import type {
  Span,
  TypeNode,
  EntitySelector,
  CoordComponent,
  Decorator,
  RangeExpr,
  FStringPart,
  SelectorFilter,
  EntityTypeName,
  LambdaParam,
} from '../ast/types'
import type { BinOp, CmpOp } from '../ast/types'

// Re-export types that HIR shares with AST unchanged
export type {
  Span,
  TypeNode,
  EntitySelector,
  CoordComponent,
  Decorator,
  RangeExpr,
  FStringPart,
  SelectorFilter,
  EntityTypeName,
  LambdaParam,
  BinOp,
  CmpOp,
}

// ---------------------------------------------------------------------------
// HIR Expressions
// ---------------------------------------------------------------------------

export type HIRExpr =
  // Literals
  | { kind: 'int_lit'; value: number; span?: Span }
  | { kind: 'float_lit'; value: number; span?: Span }
  | { kind: 'byte_lit'; value: number; span?: Span }
  | { kind: 'short_lit'; value: number; span?: Span }
  | { kind: 'long_lit'; value: number; span?: Span }
  | { kind: 'double_lit'; value: number; span?: Span }
  | { kind: 'bool_lit'; value: boolean; span?: Span }
  | { kind: 'str_lit'; value: string; span?: Span }
  | { kind: 'range_lit'; range: RangeExpr; span?: Span }
  | { kind: 'array_lit'; elements: HIRExpr[]; span?: Span }
  | { kind: 'struct_lit'; fields: { name: string; value: HIRExpr }[]; span?: Span }
  // MC-specific literals
  | { kind: 'rel_coord'; value: string; span?: Span }
  | { kind: 'local_coord'; value: string; span?: Span }
  | { kind: 'mc_name'; value: string; span?: Span }
  | { kind: 'blockpos'; x: CoordComponent; y: CoordComponent; z: CoordComponent; span?: Span }
  | { kind: 'selector'; raw: string; isSingle: boolean; sel: EntitySelector; span?: Span }
  // String interpolation
  | { kind: 'str_interp'; parts: Array<string | HIRExpr>; span?: Span }
  | { kind: 'f_string'; parts: FStringPart[]; span?: Span }
  // Identifiers
  | { kind: 'ident'; name: string; span?: Span }
  // Operators — && and || preserved (control-flow lowering happens in MIR)
  | { kind: 'binary'; op: BinOp | CmpOp | '&&' | '||'; left: HIRExpr; right: HIRExpr; span?: Span }
  | { kind: 'unary'; op: '!' | '-'; operand: HIRExpr; span?: Span }
  | { kind: 'is_check'; expr: HIRExpr; entityType: EntityTypeName; span?: Span }
  // Assignment — only plain '=' (compound ops desugared)
  | { kind: 'assign'; target: string; value: HIRExpr; span?: Span }
  | { kind: 'member_assign'; obj: HIRExpr; field: string; value: HIRExpr; span?: Span }
  // Access
  | { kind: 'member'; obj: HIRExpr; field: string; span?: Span }
  | { kind: 'index'; obj: HIRExpr; index: HIRExpr; span?: Span }
  // Calls
  | { kind: 'call'; fn: string; args: HIRExpr[]; typeArgs?: TypeNode[]; span?: Span }
  | { kind: 'invoke'; callee: HIRExpr; args: HIRExpr[]; span?: Span }
  | { kind: 'static_call'; type: string; method: string; args: HIRExpr[]; span?: Span }
  // Enum variant path
  | { kind: 'path_expr'; enumName: string; variant: string; span?: Span }
  // Lambda
  | { kind: 'lambda'; params: LambdaParam[]; returnType?: TypeNode; body: HIRExpr | HIRBlock; span?: Span }
  // Tuple literal
  | { kind: 'tuple_lit'; elements: HIRExpr[]; span?: Span }
  // Option literals
  | { kind: 'some_lit'; value: HIRExpr; span?: Span }
  | { kind: 'none_lit'; span?: Span }

// ---------------------------------------------------------------------------
// Execute Subcommands (unified — absorbs as_block, at_block, as_at)
// ---------------------------------------------------------------------------

export type HIRExecuteSubcommand =
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
// HIR Statements
// ---------------------------------------------------------------------------

export type HIRStmt =
  | { kind: 'let'; name: string; type?: TypeNode; init: HIRExpr; span?: Span }
  | { kind: 'let_destruct'; names: string[]; type?: TypeNode; init: HIRExpr; span?: Span }
  | { kind: 'expr'; expr: HIRExpr; span?: Span }
  | { kind: 'return'; value?: HIRExpr; span?: Span }
  | { kind: 'break'; span?: Span }
  | { kind: 'continue'; span?: Span }
  | { kind: 'if'; cond: HIRExpr; then: HIRBlock; else_?: HIRBlock; span?: Span }
  | { kind: 'while'; cond: HIRExpr; body: HIRBlock; step?: HIRBlock; span?: Span }
  // foreach preserved (entity iteration is MC-specific, not just sugar)
  | { kind: 'foreach'; binding: string; iterable: HIRExpr; body: HIRBlock; executeContext?: string; span?: Span }
  // match preserved (not trivially desugarable)
  | { kind: 'match'; expr: HIRExpr; arms: { pattern: HIRExpr | null; body: HIRBlock }[]; span?: Span }
  // Unified execute block (absorbs as_block, at_block, as_at, execute)
  | { kind: 'execute'; subcommands: HIRExecuteSubcommand[]; body: HIRBlock; span?: Span }
  | { kind: 'raw'; cmd: string; span?: Span }
  | { kind: 'if_let_some'; binding: string; init: HIRExpr; then: HIRBlock; else_?: HIRBlock; span?: Span }

export type HIRBlock = HIRStmt[]

// ---------------------------------------------------------------------------
// HIR Function & Module
// ---------------------------------------------------------------------------

export interface HIRParam {
  name: string
  type: TypeNode
  default?: HIRExpr
}

export interface HIRFunction {
  name: string
  /** Generic type parameter names, e.g. ['T'] for fn foo<T>(...) */
  typeParams?: string[]
  params: HIRParam[]
  returnType: TypeNode
  decorators: Decorator[]
  body: HIRBlock
  isLibraryFn?: boolean
  isExported?: boolean
  span?: Span
}

export interface HIRStructField {
  name: string
  type: TypeNode
}

export interface HIRStruct {
  name: string
  fields: HIRStructField[]
  span?: Span
}

export interface HIRImplBlock {
  typeName: string
  methods: HIRFunction[]
  span?: Span
}

export interface HIREnumVariant {
  name: string
  value?: number
}

export interface HIREnum {
  name: string
  variants: HIREnumVariant[]
  span?: Span
}

export interface HIRConst {
  name: string
  type: TypeNode
  value: HIRExpr
  span?: Span
}

export interface HIRGlobal {
  name: string
  type: TypeNode
  init: HIRExpr
  mutable: boolean
  span?: Span
}

export interface HIRModule {
  namespace: string
  globals: HIRGlobal[]
  functions: HIRFunction[]
  structs: HIRStruct[]
  implBlocks: HIRImplBlock[]
  enums: HIREnum[]
  consts: HIRConst[]
  isLibrary?: boolean
}
