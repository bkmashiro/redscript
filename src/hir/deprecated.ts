/**
 * Deprecated function checker — Stage 2.5 of the RedScript compiler pipeline.
 *
 * Walks HIR to find calls to @deprecated-annotated functions and collects
 * compile-time warnings (non-fatal).
 */

import type { HIRModule, HIRFunction, HIRStmt, HIRExpr, HIRBlock } from './types'
import type { Decorator } from '../ast/types'

/**
 * Build a map from function name → deprecation message for all @deprecated functions.
 */
function buildDeprecatedMap(hir: HIRModule): Map<string, string> {
  const deprecated = new Map<string, string>()
  for (const fn of hir.functions) {
    const dep = getDeprecatedDecorator(fn.decorators)
    if (dep !== null) {
      deprecated.set(fn.name, dep)
    }
  }
  // Also check impl block methods
  for (const ib of hir.implBlocks) {
    for (const m of ib.methods) {
      const dep = getDeprecatedDecorator(m.decorators)
      if (dep !== null) {
        deprecated.set(`${ib.typeName}::${m.name}`, dep)
      }
    }
  }
  return deprecated
}

function getDeprecatedDecorator(decorators: Decorator[]): string | null {
  for (const dec of decorators) {
    if (dec.name === 'deprecated') {
      return dec.args?.message ?? ''
    }
  }
  return null
}

/**
 * Walk HIR and emit a warning for every call to a @deprecated function.
 *
 * Returns an array of warning strings (same format as parser.warnings).
 */
export function checkDeprecatedCalls(hir: HIRModule): string[] {
  const deprecated = buildDeprecatedMap(hir)
  if (deprecated.size === 0) return []

  const warnings: string[] = []

  for (const fn of hir.functions) {
    walkBlock(fn.body, fn.name, deprecated, warnings)
  }
  for (const ib of hir.implBlocks) {
    for (const m of ib.methods) {
      walkBlock(m.body, `${ib.typeName}::${m.name}`, deprecated, warnings)
    }
  }

  return warnings
}

function walkBlock(block: HIRBlock, caller: string, deprecated: Map<string, string>, warnings: string[]): void {
  for (const stmt of block) {
    walkStmt(stmt, caller, deprecated, warnings)
  }
}

function walkStmt(stmt: HIRStmt, caller: string, deprecated: Map<string, string>, warnings: string[]): void {
  switch (stmt.kind) {
    case 'let':
    case 'let_destruct':
      walkExpr(stmt.init, caller, deprecated, warnings)
      break
    case 'expr':
      walkExpr(stmt.expr, caller, deprecated, warnings)
      break
    case 'return':
      if (stmt.value) walkExpr(stmt.value, caller, deprecated, warnings)
      break
    case 'if':
      walkExpr(stmt.cond, caller, deprecated, warnings)
      walkBlock(stmt.then, caller, deprecated, warnings)
      if (stmt.else_) walkBlock(stmt.else_, caller, deprecated, warnings)
      break
    case 'while':
      walkExpr(stmt.cond, caller, deprecated, warnings)
      walkBlock(stmt.body, caller, deprecated, warnings)
      if (stmt.step) walkBlock(stmt.step, caller, deprecated, warnings)
      break
    case 'foreach':
      walkExpr(stmt.iterable, caller, deprecated, warnings)
      walkBlock(stmt.body, caller, deprecated, warnings)
      break
    case 'match':
      walkExpr(stmt.expr, caller, deprecated, warnings)
      for (const arm of stmt.arms) {
        walkBlock(arm.body, caller, deprecated, warnings)
      }
      break
    // break/continue/raw/execute: no sub-exprs to walk for deprecation purposes
    default:
      break
  }
}

function walkExpr(expr: HIRExpr, caller: string, deprecated: Map<string, string>, warnings: string[]): void {
  switch (expr.kind) {
    case 'call': {
      // Check if this function is deprecated
      if (deprecated.has(expr.fn)) {
        const msg = deprecated.get(expr.fn)!
        const location = expr.span ? `line ${expr.span.line}, col ${expr.span.col}: ` : ''
        const detail = msg ? `: ${msg}` : ''
        warnings.push(`[DeprecatedUsage] ${location}'${expr.fn}' is deprecated${detail} (called from '${caller}')`)
      }
      for (const arg of expr.args) walkExpr(arg, caller, deprecated, warnings)
      break
    }
    case 'static_call': {
      const qualName = `${expr.type}::${expr.method}`
      if (deprecated.has(qualName)) {
        const msg = deprecated.get(qualName)!
        const location = expr.span ? `line ${expr.span.line}, col ${expr.span.col}: ` : ''
        const detail = msg ? `: ${msg}` : ''
        warnings.push(`[DeprecatedUsage] ${location}'${qualName}' is deprecated${detail} (called from '${caller}')`)
      }
      for (const arg of expr.args) walkExpr(arg, caller, deprecated, warnings)
      break
    }
    case 'invoke':
      walkExpr(expr.callee, caller, deprecated, warnings)
      for (const arg of expr.args) walkExpr(arg, caller, deprecated, warnings)
      break
    case 'binary':
      walkExpr(expr.left, caller, deprecated, warnings)
      walkExpr(expr.right, caller, deprecated, warnings)
      break
    case 'unary':
      walkExpr(expr.operand, caller, deprecated, warnings)
      break
    case 'is_check':
      walkExpr(expr.expr, caller, deprecated, warnings)
      break
    case 'type_cast':
      walkExpr(expr.expr, caller, deprecated, warnings)
      break
    case 'assign':
      walkExpr(expr.value, caller, deprecated, warnings)
      break
    case 'member_assign':
      walkExpr(expr.obj, caller, deprecated, warnings)
      walkExpr(expr.value, caller, deprecated, warnings)
      break
    case 'index_assign':
      walkExpr(expr.obj, caller, deprecated, warnings)
      walkExpr(expr.index, caller, deprecated, warnings)
      walkExpr(expr.value, caller, deprecated, warnings)
      break
    case 'member':
      walkExpr(expr.obj, caller, deprecated, warnings)
      break
    case 'index':
      walkExpr(expr.obj, caller, deprecated, warnings)
      walkExpr(expr.index, caller, deprecated, warnings)
      break
    case 'array_lit':
      for (const el of expr.elements) walkExpr(el, caller, deprecated, warnings)
      break
    case 'struct_lit':
      for (const f of expr.fields) walkExpr(f.value, caller, deprecated, warnings)
      break
    case 'str_interp':
      for (const part of expr.parts) {
        if (typeof part !== 'string') walkExpr(part, caller, deprecated, warnings)
      }
      break
    case 'f_string':
      for (const part of expr.parts) {
        if (typeof part === 'object' && 'expr' in part) walkExpr(part.expr as HIRExpr, caller, deprecated, warnings)
      }
      break
    case 'some_lit':
      walkExpr(expr.value, caller, deprecated, warnings)
      break
    case 'unwrap_or':
      walkExpr(expr.opt, caller, deprecated, warnings)
      walkExpr(expr.default_, caller, deprecated, warnings)
      break
    case 'lambda': {
      const body = expr.body
      if (Array.isArray(body)) {
        walkBlock(body as HIRBlock, caller, deprecated, warnings)
      } else {
        walkExpr(body as HIRExpr, caller, deprecated, warnings)
      }
      break
    }
    case 'tuple_lit':
      for (const el of expr.elements) walkExpr(el, caller, deprecated, warnings)
      break
    case 'enum_construct':
      for (const arg of expr.args) walkExpr(arg.value, caller, deprecated, warnings)
      break
    // Terminals: int_lit, float_lit, bool_lit, str_lit, ident, selector, etc.
    default:
      break
  }
}
