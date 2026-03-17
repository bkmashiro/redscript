/**
 * AST → HIR Lowering — Stage 2 of the RedScript compiler pipeline.
 *
 * Desugaring transforms:
 * - for(init;cond;step) → block { init; while(cond) { body; step } }
 * - for_range(v,start,end) → block { let v = start; while(v < end) { body; v = v + 1 } }
 * - a += b / -= / *= / /= / %= → a = a OP b
 * - a && b → if(a) { b } else { false }
 * - a || b → if(a) { true } else { b }
 * - as_block / at_block / as_at → unified execute with subcommands
 * - All other nodes pass through with field-wise recursion
 */

import type {
  Program, Expr, Stmt, Block, FnDecl, Param,
  AssignOp, ExecuteSubcommand,
} from '../ast/types'
import type {
  HIRModule, HIRFunction, HIRParam, HIRExpr, HIRStmt, HIRBlock,
  HIRExecuteSubcommand, HIRStruct, HIRImplBlock, HIREnum, HIRConst, HIRGlobal,
} from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function lowerToHIR(program: Program): HIRModule {
  return {
    namespace: program.namespace,
    globals: program.globals.map(lowerGlobal),
    functions: program.declarations.map(lowerFunction),
    structs: program.structs.map((s): HIRStruct => ({
      name: s.name,
      fields: s.fields.map(f => ({ name: f.name, type: f.type })),
      span: s.span,
    })),
    implBlocks: program.implBlocks.map((ib): HIRImplBlock => ({
      typeName: ib.typeName,
      methods: ib.methods.map(lowerFunction),
      span: ib.span,
    })),
    enums: program.enums.map((e): HIREnum => ({
      name: e.name,
      variants: e.variants.map(v => ({ name: v.name, value: v.value })),
      span: e.span,
    })),
    consts: program.consts.map((c): HIRConst => ({
      name: c.name,
      type: c.type,
      value: lowerExpr(c.value),
      span: c.span,
    })),
    isLibrary: program.isLibrary,
  }
}

// ---------------------------------------------------------------------------
// Functions & globals
// ---------------------------------------------------------------------------

function lowerGlobal(g: Program['globals'][0]): HIRGlobal {
  return {
    name: g.name,
    type: g.type,
    init: lowerExpr(g.init),
    mutable: g.mutable,
    span: g.span,
  }
}

function lowerFunction(fn: FnDecl): HIRFunction {
  return {
    name: fn.name,
    typeParams: fn.typeParams,
    params: fn.params.map(lowerParam),
    returnType: fn.returnType,
    decorators: fn.decorators,
    body: lowerBlock(fn.body),
    isLibraryFn: fn.isLibraryFn,
    isExported: fn.isExported,
    span: fn.span,
  }
}

function lowerParam(p: Param): HIRParam {
  return {
    name: p.name,
    type: p.type,
    default: p.default ? lowerExpr(p.default) : undefined,
  }
}

// ---------------------------------------------------------------------------
// Blocks & statements
// ---------------------------------------------------------------------------

function lowerBlock(block: Block): HIRBlock {
  const result: HIRBlock = []
  for (const stmt of block) {
    const lowered = lowerStmt(stmt)
    // lowerStmt may return an array (e.g. for → [init, while])
    if (Array.isArray(lowered)) {
      result.push(...lowered)
    } else {
      result.push(lowered)
    }
  }
  return result
}

function lowerStmt(stmt: Stmt): HIRStmt | HIRStmt[] {
  switch (stmt.kind) {
    case 'let':
      return { kind: 'let', name: stmt.name, type: stmt.type, init: lowerExpr(stmt.init), span: stmt.span }

    case 'let_destruct':
      return { kind: 'let_destruct', names: stmt.names, type: stmt.type, init: lowerExpr(stmt.init), span: stmt.span }

    case 'expr':
      return { kind: 'expr', expr: lowerExpr(stmt.expr), span: stmt.span }

    case 'return':
      return { kind: 'return', value: stmt.value ? lowerExpr(stmt.value) : undefined, span: stmt.span }

    case 'break':
      return { kind: 'break', span: stmt.span }

    case 'continue':
      return { kind: 'continue', span: stmt.span }

    case 'if':
      return {
        kind: 'if',
        cond: lowerExpr(stmt.cond),
        then: lowerBlock(stmt.then),
        else_: stmt.else_ ? lowerBlock(stmt.else_) : undefined,
        span: stmt.span,
      }

    case 'while':
      return { kind: 'while', cond: lowerExpr(stmt.cond), body: lowerBlock(stmt.body), span: stmt.span }

    // --- Desugaring: for → while ---
    case 'for': {
      const stmts: HIRStmt[] = []
      // Init
      if (stmt.init) {
        const init = lowerStmt(stmt.init)
        if (Array.isArray(init)) stmts.push(...init)
        else stmts.push(init)
      }
      // while(cond) { body } step { step_expr }
      const body = lowerBlock(stmt.body)
      const step: HIRStmt[] = [{ kind: 'expr', expr: lowerExpr(stmt.step), span: stmt.span }]
      stmts.push({ kind: 'while', cond: lowerExpr(stmt.cond), body, step, span: stmt.span })
      return stmts
    }

    // --- Desugaring: for_range → let + while(cond) { body } step { v++ } ---
    case 'for_range': {
      const varName = stmt.varName
      const initStmt: HIRStmt = {
        kind: 'let',
        name: varName,
        type: { kind: 'named', name: 'int' },
        init: lowerExpr(stmt.start),
        span: stmt.span,
      }
      const body = lowerBlock(stmt.body)
      // step: v = v + 1 (in separate step block so continue still increments)
      const step: HIRStmt[] = [{
        kind: 'expr',
        expr: {
          kind: 'assign',
          target: varName,
          value: {
            kind: 'binary',
            op: '+',
            left: { kind: 'ident', name: varName },
            right: { kind: 'int_lit', value: 1 },
          },
        },
      }]
      const whileStmt: HIRStmt = {
        kind: 'while',
        cond: {
          kind: 'binary',
          op: '<',
          left: { kind: 'ident', name: varName },
          right: lowerExpr(stmt.end),
        },
        body,
        step,
        span: stmt.span,
      }
      return [initStmt, whileStmt]
    }

    // --- Desugaring: for_in_array → let idx = 0; while(idx < len) { let v = arr[idx]; body; idx = idx + 1 } ---
    case 'for_in_array': {
      const idxName = `__forin_idx_${stmt.binding}`
      const initStmt: HIRStmt = {
        kind: 'let',
        name: idxName,
        type: { kind: 'named', name: 'int' },
        init: { kind: 'int_lit', value: 0 },
        span: stmt.span,
      }
      const bindingInit: HIRStmt = {
        kind: 'let',
        name: stmt.binding,
        type: undefined,
        init: {
          kind: 'index',
          obj: { kind: 'ident', name: stmt.arrayName },
          index: { kind: 'ident', name: idxName },
        },
        span: stmt.span,
      }
      const stepStmt: HIRStmt = {
        kind: 'expr',
        expr: {
          kind: 'assign',
          target: idxName,
          value: {
            kind: 'binary',
            op: '+',
            left: { kind: 'ident', name: idxName },
            right: { kind: 'int_lit', value: 1 },
          },
        },
        span: stmt.span,
      }
      const body = [bindingInit, ...lowerBlock(stmt.body)]
      const step: HIRStmt[] = [stepStmt]
      const whileStmt: HIRStmt = {
        kind: 'while',
        cond: {
          kind: 'binary',
          op: '<',
          left: { kind: 'ident', name: idxName },
          right: lowerExpr(stmt.lenExpr),
        },
        body,
        step,
        span: stmt.span,
      }
      return [initStmt, whileStmt]
    }

    case 'foreach':
      return {
        kind: 'foreach',
        binding: stmt.binding,
        iterable: lowerExpr(stmt.iterable),
        body: lowerBlock(stmt.body),
        executeContext: stmt.executeContext,
        span: stmt.span,
      }

    case 'match':
      return {
        kind: 'match',
        expr: lowerExpr(stmt.expr),
        arms: stmt.arms.map(arm => ({
          pattern: arm.pattern ? lowerExpr(arm.pattern) : null,
          body: lowerBlock(arm.body),
        })),
        span: stmt.span,
      }

    // --- Desugaring: as_block → execute [as] ---
    case 'as_block':
      return {
        kind: 'execute',
        subcommands: [{ kind: 'as', selector: stmt.selector }],
        body: lowerBlock(stmt.body),
        span: stmt.span,
      }

    // --- Desugaring: at_block → execute [at] ---
    case 'at_block':
      return {
        kind: 'execute',
        subcommands: [{ kind: 'at', selector: stmt.selector }],
        body: lowerBlock(stmt.body),
        span: stmt.span,
      }

    // --- Desugaring: as_at → execute [as, at] ---
    case 'as_at':
      return {
        kind: 'execute',
        subcommands: [
          { kind: 'as', selector: stmt.as_sel },
          { kind: 'at', selector: stmt.at_sel },
        ],
        body: lowerBlock(stmt.body),
        span: stmt.span,
      }

    case 'execute':
      return {
        kind: 'execute',
        subcommands: stmt.subcommands.map(lowerExecuteSubcommand),
        body: lowerBlock(stmt.body),
        span: stmt.span,
      }

    case 'raw':
      return { kind: 'raw', cmd: stmt.cmd, span: stmt.span }

    case 'if_let_some':
      return {
        kind: 'if_let_some',
        binding: stmt.binding,
        init: lowerExpr(stmt.init),
        then: lowerBlock(stmt.then),
        else_: stmt.else_ ? lowerBlock(stmt.else_) : undefined,
        span: stmt.span,
      }

    default: {
      const _exhaustive: never = stmt
      throw new Error(`Unknown statement kind: ${(_exhaustive as any).kind}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Execute subcommands (pass-through — same shape)
// ---------------------------------------------------------------------------

function lowerExecuteSubcommand(sub: ExecuteSubcommand): HIRExecuteSubcommand {
  // All subcommand types share the same shape between AST and HIR
  return sub as HIRExecuteSubcommand
}

// ---------------------------------------------------------------------------
// Expressions
// ---------------------------------------------------------------------------

/** Map compound assignment operator to its base binary op */
const COMPOUND_TO_BINOP: Record<string, string> = {
  '+=': '+',
  '-=': '-',
  '*=': '*',
  '/=': '/',
  '%=': '%',
}

function lowerExpr(expr: Expr): HIRExpr {
  switch (expr.kind) {
    // --- Pass-through literals ---
    case 'int_lit':
    case 'float_lit':
    case 'byte_lit':
    case 'short_lit':
    case 'long_lit':
    case 'double_lit':
    case 'bool_lit':
    case 'str_lit':
    case 'range_lit':
    case 'rel_coord':
    case 'local_coord':
    case 'mc_name':
    case 'blockpos':
      return expr as HIRExpr

    case 'ident':
      return { kind: 'ident', name: expr.name, span: expr.span }

    case 'selector':
      return { kind: 'selector', raw: expr.raw, isSingle: expr.isSingle, sel: expr.sel, span: expr.span }

    case 'array_lit':
      return { kind: 'array_lit', elements: expr.elements.map(lowerExpr), span: expr.span }

    case 'struct_lit':
      return {
        kind: 'struct_lit',
        fields: expr.fields.map(f => ({ name: f.name, value: lowerExpr(f.value) })),
        span: expr.span,
      }

    case 'str_interp':
      return {
        kind: 'str_interp',
        parts: expr.parts.map(p => typeof p === 'string' ? p : lowerExpr(p)),
        span: expr.span,
      }

    case 'f_string':
      return { kind: 'f_string', parts: expr.parts, span: expr.span }

    // Binary ops — && and || preserved as-is (short-circuit → control flow in MIR)
    case 'binary':
      return {
        kind: 'binary',
        op: expr.op,
        left: lowerExpr(expr.left),
        right: lowerExpr(expr.right),
        span: expr.span,
      }

    case 'unary':
      return { kind: 'unary', op: expr.op, operand: lowerExpr(expr.operand), span: expr.span }

    case 'is_check':
      return { kind: 'is_check', expr: lowerExpr(expr.expr), entityType: expr.entityType, span: expr.span }

    // --- Desugaring: compound assignment → plain assign ---
    case 'assign':
      if (expr.op !== '=') {
        const binOp = COMPOUND_TO_BINOP[expr.op]
        return {
          kind: 'assign',
          target: expr.target,
          value: {
            kind: 'binary',
            op: binOp as any,
            left: { kind: 'ident', name: expr.target },
            right: lowerExpr(expr.value),
            span: expr.span,
          },
          span: expr.span,
        }
      }
      return { kind: 'assign', target: expr.target, value: lowerExpr(expr.value), span: expr.span }

    // --- Desugaring: compound member_assign → plain member_assign ---
    case 'member_assign':
      if (expr.op !== '=') {
        const binOp = COMPOUND_TO_BINOP[expr.op]
        const obj = lowerExpr(expr.obj)
        return {
          kind: 'member_assign',
          obj,
          field: expr.field,
          value: {
            kind: 'binary',
            op: binOp as any,
            left: { kind: 'member', obj, field: expr.field },
            right: lowerExpr(expr.value),
            span: expr.span,
          },
          span: expr.span,
        }
      }
      return {
        kind: 'member_assign',
        obj: lowerExpr(expr.obj),
        field: expr.field,
        value: lowerExpr(expr.value),
        span: expr.span,
      }

    case 'member':
      return { kind: 'member', obj: lowerExpr(expr.obj), field: expr.field, span: expr.span }

    case 'index':
      return { kind: 'index', obj: lowerExpr(expr.obj), index: lowerExpr(expr.index), span: expr.span }

    // --- Desugaring: compound index_assign → plain index_assign ---
    case 'index_assign':
      if (expr.op !== '=') {
        const binOp = COMPOUND_TO_BINOP[expr.op]
        const obj = lowerExpr(expr.obj)
        const index = lowerExpr(expr.index)
        return {
          kind: 'index_assign',
          obj,
          index,
          op: '=' as const,
          value: {
            kind: 'binary',
            op: binOp as any,
            left: { kind: 'index', obj, index },
            right: lowerExpr(expr.value),
            span: expr.span,
          },
          span: expr.span,
        }
      }
      return {
        kind: 'index_assign',
        obj: lowerExpr(expr.obj),
        index: lowerExpr(expr.index),
        op: expr.op,
        value: lowerExpr(expr.value),
        span: expr.span,
      }

    case 'call':
      return { kind: 'call', fn: expr.fn, args: expr.args.map(lowerExpr), typeArgs: expr.typeArgs, span: expr.span }

    case 'invoke':
      return { kind: 'invoke', callee: lowerExpr(expr.callee), args: expr.args.map(lowerExpr), span: expr.span }

    case 'static_call':
      return {
        kind: 'static_call',
        type: expr.type,
        method: expr.method,
        args: expr.args.map(lowerExpr),
        span: expr.span,
      }

    case 'path_expr':
      return { kind: 'path_expr', enumName: expr.enumName, variant: expr.variant, span: expr.span }

    case 'tuple_lit':
      return { kind: 'tuple_lit', elements: expr.elements.map(lowerExpr), span: expr.span }

    case 'some_lit':
      return { kind: 'some_lit', value: lowerExpr(expr.value), span: expr.span }

    case 'none_lit':
      return { kind: 'none_lit', span: expr.span }

    case 'type_cast':
      return { kind: 'type_cast', expr: lowerExpr(expr.expr), targetType: expr.targetType, span: expr.span }

    case 'lambda': {
      const body = Array.isArray(expr.body) ? lowerBlock(expr.body) : lowerExpr(expr.body)
      return {
        kind: 'lambda',
        params: expr.params,
        returnType: expr.returnType,
        body,
        span: expr.span,
      }
    }

    default: {
      const _exhaustive: never = expr
      throw new Error(`Unknown expression kind: ${(_exhaustive as any).kind}`)
    }
  }
}
