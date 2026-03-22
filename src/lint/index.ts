/**
 * RedScript Lint Engine
 *
 * Analyzes HIR to detect potential issues (warnings, not errors).
 * Run after HIR lowering, before MIR.
 *
 * Rules:
 *   unused-variable   — let x = 5 but x never read
 *   unused-import     — import math::sin but sin never called
 *   magic-number      — literal number > 1 used directly (0 and 1 ignored)
 *   dead-branch       — if (const == const) always-true/false condition
 *   function-too-long — function body exceeds 50 lines
 */

import type {
  HIRModule,
  HIRFunction,
  HIRStmt,
  HIRBlock,
  HIRExpr,
  Span,
} from '../hir/types'
import type { ImportDecl } from '../ast/types'
import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { lowerToHIR } from '../hir/lower'
import * as fs from 'fs'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LintWarning {
  rule: string
  message: string
  file?: string
  line?: number
  col?: number
}

export interface LintOptions {
  filePath?: string
  /** Max function body lines before function-too-long fires (default: 50) */
  maxFunctionLines?: number
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Lint a RedScript source file. Parses → lowers → analyzes HIR.
 * Returns a (possibly empty) list of lint warnings.
 */
export function lintSource(
  source: string,
  imports: ImportDecl[],
  hir: HIRModule,
  options: LintOptions = {},
): LintWarning[] {
  const warnings: LintWarning[] = []
  const file = options.filePath
  const maxLines = options.maxFunctionLines ?? 50

  // Rule: unused-import
  warnings.push(...checkUnusedImports(imports, hir, file))

  for (const fn of hir.functions) {
    if (fn.isLibraryFn) continue

    // Rule: unused-variable
    warnings.push(...checkUnusedVariables(fn, file))

    // Rule: magic-number
    warnings.push(...checkMagicNumbers(fn, file))

    // Rule: dead-branch
    warnings.push(...checkDeadBranches(fn, file))

    // Rule: function-too-long
    const fnWarning = checkFunctionLength(fn, maxLines, file)
    if (fnWarning) warnings.push(fnWarning)
  }

  return warnings
}

/**
 * Lint from a file path. Convenience wrapper.
 */
export function lintFile(filePath: string, namespace = 'redscript', options: LintOptions = {}): LintWarning[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`)
  }
  const source = fs.readFileSync(filePath, 'utf-8')
  return lintString(source, filePath, namespace, options)
}

/**
 * Lint from source string + file path for error reporting.
 */
export function lintString(source: string, filePath: string, namespace = 'redscript', options: LintOptions = {}): LintWarning[] {
  const lexer = new Lexer(source)
  const tokens = lexer.tokenize()
  const parser = new Parser(tokens, source, namespace)
  const ast = parser.parse(namespace)
  const hir = lowerToHIR(ast)
  return lintSource(source, ast.imports, hir, { ...options, filePath })
}

/**
 * Format lint warnings in the standard output format:
 *   file:line:col [rule] message
 */
export function formatLintWarning(w: LintWarning): string {
  const location = w.file && w.line != null && w.col != null
    ? `${w.file}:${w.line}:${w.col}`
    : w.file && w.line != null
      ? `${w.file}:${w.line}`
      : w.file ?? '<unknown>'
  return `${location} [${w.rule}] ${w.message}`
}

// ---------------------------------------------------------------------------
// Rule: unused-import
// ---------------------------------------------------------------------------

function checkUnusedImports(imports: ImportDecl[], hir: HIRModule, file?: string): LintWarning[] {
  const warnings: LintWarning[] = []
  // Collect all names called in the HIR
  const calledNames = new Set<string>()
  for (const fn of hir.functions) {
    collectCalledNames(fn.body, calledNames)
  }

  for (const imp of imports) {
    if (!imp.symbol || imp.symbol === '*') continue
    if (!calledNames.has(imp.symbol)) {
      const warn: LintWarning = {
        rule: 'unused-import',
        message: `Import "${imp.symbol}" from "${imp.moduleName}" is never used`,
        file,
      }
      if (imp.span) {
        warn.line = imp.span.line
        warn.col = imp.span.col
      }
      warnings.push(warn)
    }
  }

  return warnings
}

/** Collect all called function names (and idents used as function pointers) from a block. */
function collectCalledNames(block: HIRBlock, out: Set<string>): void {
  for (const stmt of block) {
    collectCalledNamesStmt(stmt, out)
  }
}

function collectCalledNamesStmt(stmt: HIRStmt, out: Set<string>): void {
  switch (stmt.kind) {
    case 'let':
      collectCalledNamesExpr(stmt.init, out)
      break
    case 'const_decl':
      collectCalledNamesExpr(stmt.value, out)
      break
    case 'let_destruct':
      collectCalledNamesExpr(stmt.init, out)
      break
    case 'expr':
    case 'return':
      if (stmt.kind === 'return' && stmt.value) collectCalledNamesExpr(stmt.value, out)
      if (stmt.kind === 'expr') collectCalledNamesExpr(stmt.expr, out)
      break
    case 'if':
      collectCalledNamesExpr(stmt.cond, out)
      collectCalledNames(stmt.then, out)
      if (stmt.else_) collectCalledNames(stmt.else_, out)
      break
    case 'while':
      collectCalledNamesExpr(stmt.cond, out)
      collectCalledNames(stmt.body, out)
      if (stmt.step) collectCalledNames(stmt.step, out)
      break
    case 'foreach':
      collectCalledNamesExpr(stmt.iterable, out)
      collectCalledNames(stmt.body, out)
      break
    case 'match':
      collectCalledNamesExpr(stmt.expr, out)
      for (const arm of stmt.arms) collectCalledNames(arm.body, out)
      break
    case 'execute':
      collectCalledNames(stmt.body, out)
      break
    case 'if_let_some':
      collectCalledNamesExpr(stmt.init, out)
      collectCalledNames(stmt.then, out)
      if (stmt.else_) collectCalledNames(stmt.else_, out)
      break
    case 'while_let_some':
      collectCalledNamesExpr(stmt.init, out)
      collectCalledNames(stmt.body, out)
      break
    case 'labeled_loop':
      collectCalledNamesStmt(stmt.body, out)
      break
  }
}

function collectCalledNamesExpr(expr: HIRExpr | undefined, out: Set<string>): void {
  if (!expr) return
  switch (expr.kind) {
    case 'call':
      out.add(expr.fn)
      for (const arg of expr.args) collectCalledNamesExpr(arg, out)
      break
    case 'invoke':
      collectCalledNamesExpr(expr.callee, out)
      for (const arg of expr.args) collectCalledNamesExpr(arg, out)
      break
    case 'static_call':
      out.add(expr.method)
      for (const arg of expr.args) collectCalledNamesExpr(arg, out)
      break
    case 'binary':
      collectCalledNamesExpr(expr.left, out)
      collectCalledNamesExpr(expr.right, out)
      break
    case 'unary':
      collectCalledNamesExpr(expr.operand, out)
      break
    case 'member':
    case 'member_assign':
      collectCalledNamesExpr(expr.obj, out)
      if (expr.kind === 'member_assign') collectCalledNamesExpr(expr.value, out)
      break
    case 'index':
    case 'index_assign':
      collectCalledNamesExpr(expr.obj, out)
      collectCalledNamesExpr(expr.index, out)
      if (expr.kind === 'index_assign') collectCalledNamesExpr(expr.value, out)
      break
    case 'assign':
      collectCalledNamesExpr(expr.value, out)
      break
    case 'some_lit':
      collectCalledNamesExpr(expr.value, out)
      break
    case 'unwrap_or':
      collectCalledNamesExpr(expr.opt, out)
      collectCalledNamesExpr(expr.default_, out)
      break
    case 'type_cast':
      collectCalledNamesExpr(expr.expr, out)
      break
    case 'array_lit':
    case 'tuple_lit':
      for (const e of expr.elements) collectCalledNamesExpr(e, out)
      break
    case 'struct_lit':
      for (const f of expr.fields) collectCalledNamesExpr(f.value, out)
      break
    case 'str_interp':
      for (const p of expr.parts) {
        if (typeof p !== 'string') collectCalledNamesExpr(p, out)
      }
      break
    case 'f_string':
      for (const p of expr.parts) {
        if (p.kind === 'expr') collectCalledNamesExpr(p.expr, out)
      }
      break
    case 'lambda':
      if (Array.isArray(expr.body)) {
        collectCalledNames(expr.body as HIRBlock, out)
      } else {
        collectCalledNamesExpr(expr.body as HIRExpr, out)
      }
      break
    case 'enum_construct':
      for (const f of expr.args) collectCalledNamesExpr(f.value, out)
      break
    // Terminals: ident, int_lit, float_lit, bool_lit, str_lit, etc.
    default:
      break
  }
}

// ---------------------------------------------------------------------------
// Rule: unused-variable
// ---------------------------------------------------------------------------

interface VarInfo {
  name: string
  span?: Span
  readCount: number
}

function checkUnusedVariables(fn: HIRFunction, file?: string): LintWarning[] {
  const warnings: LintWarning[] = []
  // We do a simple scope-insensitive pass: collect all let declarations,
  // then count how many times each name appears as an ident (read).
  // If readCount == 0, warn.

  const declared = new Map<string, VarInfo>()
  collectLetDecls(fn.body, declared)

  // Count reads
  const reads = new Map<string, number>()
  countIdentReads(fn.body, reads, new Set(declared.keys()))

  for (const [name, info] of declared) {
    const readCount = reads.get(name) ?? 0
    if (readCount === 0) {
      const warn: LintWarning = {
        rule: 'unused-variable',
        message: `Variable "${name}" is declared but never used`,
        file,
      }
      if (info.span) {
        warn.line = info.span.line
        warn.col = info.span.col
      }
      warnings.push(warn)
    }
  }

  return warnings
}

function collectLetDecls(block: HIRBlock, out: Map<string, VarInfo>): void {
  for (const stmt of block) {
    if (stmt.kind === 'let') {
      out.set(stmt.name, { name: stmt.name, span: stmt.span, readCount: 0 })
      collectLetDeclsExpr(stmt.init, out)
    } else if (stmt.kind === 'let_destruct') {
      for (const name of stmt.names) {
        out.set(name, { name, span: stmt.span, readCount: 0 })
      }
      collectLetDeclsExpr(stmt.init, out)
    } else if (stmt.kind === 'const_decl') {
      // const is intentionally excluded from unused-variable (dead code elimination handles it)
    } else {
      collectLetDeclsStmt(stmt, out)
    }
  }
}

function collectLetDeclsExpr(_expr: HIRExpr, _out: Map<string, VarInfo>): void {
  // No nested let declarations in expressions (HIR doesn't have let-expr)
}

function collectLetDeclsStmt(stmt: HIRStmt, out: Map<string, VarInfo>): void {
  switch (stmt.kind) {
    case 'if':
      collectLetDecls(stmt.then, out)
      if (stmt.else_) collectLetDecls(stmt.else_, out)
      break
    case 'while':
      collectLetDecls(stmt.body, out)
      if (stmt.step) collectLetDecls(stmt.step, out)
      break
    case 'foreach':
      // binding is declared by the foreach — treat it as declared
      out.set(stmt.binding, { name: stmt.binding, span: stmt.span, readCount: 0 })
      collectLetDecls(stmt.body, out)
      break
    case 'match':
      for (const arm of stmt.arms) collectLetDecls(arm.body, out)
      break
    case 'execute':
      collectLetDecls(stmt.body, out)
      break
    case 'if_let_some':
      out.set(stmt.binding, { name: stmt.binding, span: stmt.span, readCount: 0 })
      collectLetDecls(stmt.then, out)
      if (stmt.else_) collectLetDecls(stmt.else_, out)
      break
    case 'while_let_some':
      out.set(stmt.binding, { name: stmt.binding, span: stmt.span, readCount: 0 })
      collectLetDecls(stmt.body, out)
      break
    case 'labeled_loop':
      collectLetDeclsStmt(stmt.body, out)
      break
  }
}

/** Count how many times each declared variable name appears as a read ident. */
function countIdentReads(block: HIRBlock, out: Map<string, number>, declared: Set<string>): void {
  for (const stmt of block) {
    countIdentReadsStmt(stmt, out, declared)
  }
}

function countIdentReadsStmt(stmt: HIRStmt, out: Map<string, number>, declared: Set<string>): void {
  switch (stmt.kind) {
    case 'let':
      countIdentReadsExpr(stmt.init, out, declared)
      break
    case 'let_destruct':
      countIdentReadsExpr(stmt.init, out, declared)
      break
    case 'const_decl':
      countIdentReadsExpr(stmt.value, out, declared)
      break
    case 'expr':
      countIdentReadsExpr(stmt.expr, out, declared)
      break
    case 'return':
      if (stmt.value) countIdentReadsExpr(stmt.value, out, declared)
      break
    case 'if':
      countIdentReadsExpr(stmt.cond, out, declared)
      countIdentReads(stmt.then, out, declared)
      if (stmt.else_) countIdentReads(stmt.else_, out, declared)
      break
    case 'while':
      countIdentReadsExpr(stmt.cond, out, declared)
      countIdentReads(stmt.body, out, declared)
      if (stmt.step) countIdentReads(stmt.step, out, declared)
      break
    case 'foreach':
      countIdentReadsExpr(stmt.iterable, out, declared)
      countIdentReads(stmt.body, out, declared)
      break
    case 'match':
      countIdentReadsExpr(stmt.expr, out, declared)
      for (const arm of stmt.arms) countIdentReads(arm.body, out, declared)
      break
    case 'execute':
      countIdentReads(stmt.body, out, declared)
      break
    case 'if_let_some':
      countIdentReadsExpr(stmt.init, out, declared)
      countIdentReads(stmt.then, out, declared)
      if (stmt.else_) countIdentReads(stmt.else_, out, declared)
      break
    case 'while_let_some':
      countIdentReadsExpr(stmt.init, out, declared)
      countIdentReads(stmt.body, out, declared)
      break
    case 'labeled_loop':
      countIdentReadsStmt(stmt.body, out, declared)
      break
  }
}

function countIdentReadsExpr(expr: HIRExpr | undefined, out: Map<string, number>, declared: Set<string>): void {
  if (!expr) return
  switch (expr.kind) {
    case 'ident':
      if (declared.has(expr.name)) {
        out.set(expr.name, (out.get(expr.name) ?? 0) + 1)
      }
      break
    case 'assign':
      // The target name is being assigned to (write), not read.
      // But the value is read.
      countIdentReadsExpr(expr.value, out, declared)
      break
    case 'binary':
      countIdentReadsExpr(expr.left, out, declared)
      countIdentReadsExpr(expr.right, out, declared)
      break
    case 'unary':
      countIdentReadsExpr(expr.operand, out, declared)
      break
    case 'call':
      for (const arg of expr.args) countIdentReadsExpr(arg, out, declared)
      break
    case 'invoke':
      countIdentReadsExpr(expr.callee, out, declared)
      for (const arg of expr.args) countIdentReadsExpr(arg, out, declared)
      break
    case 'static_call':
      for (const arg of expr.args) countIdentReadsExpr(arg, out, declared)
      break
    case 'member':
      countIdentReadsExpr(expr.obj, out, declared)
      break
    case 'member_assign':
      countIdentReadsExpr(expr.obj, out, declared)
      countIdentReadsExpr(expr.value, out, declared)
      break
    case 'index':
      countIdentReadsExpr(expr.obj, out, declared)
      countIdentReadsExpr(expr.index, out, declared)
      break
    case 'index_assign':
      countIdentReadsExpr(expr.obj, out, declared)
      countIdentReadsExpr(expr.index, out, declared)
      countIdentReadsExpr(expr.value, out, declared)
      break
    case 'some_lit':
      countIdentReadsExpr(expr.value, out, declared)
      break
    case 'unwrap_or':
      countIdentReadsExpr(expr.opt, out, declared)
      countIdentReadsExpr(expr.default_, out, declared)
      break
    case 'type_cast':
      countIdentReadsExpr(expr.expr, out, declared)
      break
    case 'array_lit':
    case 'tuple_lit':
      for (const e of expr.elements) countIdentReadsExpr(e, out, declared)
      break
    case 'struct_lit':
      for (const f of expr.fields) countIdentReadsExpr(f.value, out, declared)
      break
    case 'str_interp':
      for (const p of expr.parts) {
        if (typeof p !== 'string') countIdentReadsExpr(p, out, declared)
      }
      break
    case 'f_string':
      for (const p of expr.parts) {
        if (p.kind === 'expr') countIdentReadsExpr(p.expr, out, declared)
      }
      break
    case 'lambda':
      if (Array.isArray(expr.body)) {
        countIdentReads(expr.body as HIRBlock, out, declared)
      } else {
        countIdentReadsExpr(expr.body as HIRExpr, out, declared)
      }
      break
    case 'enum_construct':
      for (const f of expr.args) countIdentReadsExpr(f.value, out, declared)
      break
    default:
      break
  }
}

// ---------------------------------------------------------------------------
// Rule: magic-number
// ---------------------------------------------------------------------------

function checkMagicNumbers(fn: HIRFunction, file?: string): LintWarning[] {
  const warnings: LintWarning[] = []
  // Skip magic numbers in const declarations (that's the intended fix!)
  checkMagicNumbersBlock(fn.body, warnings, file, /*inConst=*/false)
  return warnings
}

const MAGIC_NUMBER_THRESHOLD = 1 // values > 1 are considered magic (so abs > 1)

function isMagicNumber(value: number): boolean {
  return Math.abs(value) > MAGIC_NUMBER_THRESHOLD
}

function checkMagicNumbersBlock(
  block: HIRBlock,
  out: LintWarning[],
  file: string | undefined,
  inConst: boolean,
): void {
  for (const stmt of block) {
    checkMagicNumbersStmt(stmt, out, file, inConst)
  }
}

function checkMagicNumbersStmt(
  stmt: HIRStmt,
  out: LintWarning[],
  file: string | undefined,
  inConst: boolean,
): void {
  switch (stmt.kind) {
    case 'const_decl':
      // The RHS of a const is fine — don't flag it
      break
    case 'let':
      checkMagicNumbersExpr(stmt.init, out, file)
      break
    case 'let_destruct':
      checkMagicNumbersExpr(stmt.init, out, file)
      break
    case 'expr':
      checkMagicNumbersExpr(stmt.expr, out, file)
      break
    case 'return':
      if (stmt.value) checkMagicNumbersExpr(stmt.value, out, file)
      break
    case 'if':
      checkMagicNumbersExpr(stmt.cond, out, file)
      checkMagicNumbersBlock(stmt.then, out, file, false)
      if (stmt.else_) checkMagicNumbersBlock(stmt.else_, out, file, false)
      break
    case 'while':
      checkMagicNumbersExpr(stmt.cond, out, file)
      checkMagicNumbersBlock(stmt.body, out, file, false)
      if (stmt.step) checkMagicNumbersBlock(stmt.step, out, file, false)
      break
    case 'foreach':
      checkMagicNumbersExpr(stmt.iterable, out, file)
      checkMagicNumbersBlock(stmt.body, out, file, false)
      break
    case 'match':
      checkMagicNumbersExpr(stmt.expr, out, file)
      for (const arm of stmt.arms) checkMagicNumbersBlock(arm.body, out, file, false)
      break
    case 'execute':
      checkMagicNumbersBlock(stmt.body, out, file, false)
      break
    case 'if_let_some':
      checkMagicNumbersExpr(stmt.init, out, file)
      checkMagicNumbersBlock(stmt.then, out, file, false)
      if (stmt.else_) checkMagicNumbersBlock(stmt.else_, out, file, false)
      break
    case 'while_let_some':
      checkMagicNumbersExpr(stmt.init, out, file)
      checkMagicNumbersBlock(stmt.body, out, file, false)
      break
    case 'labeled_loop':
      checkMagicNumbersStmt(stmt.body, out, file, inConst)
      break
  }
}

function checkMagicNumbersExpr(expr: HIRExpr | undefined, out: LintWarning[], file: string | undefined): void {
  if (!expr) return
  switch (expr.kind) {
    case 'int_lit':
    case 'float_lit':
    case 'byte_lit':
    case 'short_lit':
    case 'long_lit':
    case 'double_lit':
      if (isMagicNumber(expr.value)) {
        const warn: LintWarning = {
          rule: 'magic-number',
          message: `Avoid magic number ${expr.value}, consider using a const`,
          file,
        }
        if (expr.span) {
          warn.line = expr.span.line
          warn.col = expr.span.col
        }
        out.push(warn)
      }
      break
    case 'binary':
      checkMagicNumbersExpr(expr.left, out, file)
      checkMagicNumbersExpr(expr.right, out, file)
      break
    case 'unary':
      // For unary minus applied to a literal, the literal itself will be visited
      checkMagicNumbersExpr(expr.operand, out, file)
      break
    case 'call':
      for (const arg of expr.args) checkMagicNumbersExpr(arg, out, file)
      break
    case 'invoke':
      checkMagicNumbersExpr(expr.callee, out, file)
      for (const arg of expr.args) checkMagicNumbersExpr(arg, out, file)
      break
    case 'static_call':
      for (const arg of expr.args) checkMagicNumbersExpr(arg, out, file)
      break
    case 'member':
      checkMagicNumbersExpr(expr.obj, out, file)
      break
    case 'member_assign':
      checkMagicNumbersExpr(expr.obj, out, file)
      checkMagicNumbersExpr(expr.value, out, file)
      break
    case 'index':
      checkMagicNumbersExpr(expr.obj, out, file)
      checkMagicNumbersExpr(expr.index, out, file)
      break
    case 'index_assign':
      checkMagicNumbersExpr(expr.obj, out, file)
      checkMagicNumbersExpr(expr.index, out, file)
      checkMagicNumbersExpr(expr.value, out, file)
      break
    case 'assign':
      checkMagicNumbersExpr(expr.value, out, file)
      break
    case 'some_lit':
      checkMagicNumbersExpr(expr.value, out, file)
      break
    case 'unwrap_or':
      checkMagicNumbersExpr(expr.opt, out, file)
      checkMagicNumbersExpr(expr.default_, out, file)
      break
    case 'type_cast':
      checkMagicNumbersExpr(expr.expr, out, file)
      break
    case 'array_lit':
    case 'tuple_lit':
      for (const e of expr.elements) checkMagicNumbersExpr(e, out, file)
      break
    case 'struct_lit':
      for (const f of expr.fields) checkMagicNumbersExpr(f.value, out, file)
      break
    case 'str_interp':
      for (const p of expr.parts) {
        if (typeof p !== 'string') checkMagicNumbersExpr(p, out, file)
      }
      break
    case 'f_string':
      for (const p of expr.parts) {
        if (p.kind === 'expr') checkMagicNumbersExpr(p.expr, out, file)
      }
      break
    case 'lambda':
      if (Array.isArray(expr.body)) {
        checkMagicNumbersBlock(expr.body as HIRBlock, out, file, false)
      } else {
        checkMagicNumbersExpr(expr.body as HIRExpr, out, file)
      }
      break
    case 'enum_construct':
      for (const f of expr.args) checkMagicNumbersExpr(f.value, out, file)
      break
    default:
      break
  }
}

// ---------------------------------------------------------------------------
// Rule: dead-branch
// ---------------------------------------------------------------------------

/**
 * Detects `if <constant_condition> { ... }` where the condition is always
 * true or always false at compile time.
 *
 * We detect the following constant patterns:
 *   - int_lit == int_lit  / != / < / <= / > / >=
 *   - bool_lit (bare `if true` / `if false`)
 */
function checkDeadBranches(fn: HIRFunction, file?: string): LintWarning[] {
  const warnings: LintWarning[] = []
  checkDeadBranchesBlock(fn.body, warnings, file)
  return warnings
}

function checkDeadBranchesBlock(block: HIRBlock, out: LintWarning[], file: string | undefined): void {
  for (const stmt of block) {
    if (stmt.kind === 'if') {
      const result = evaluateConstBool(stmt.cond)
      if (result !== null) {
        const warn: LintWarning = {
          rule: 'dead-branch',
          message: result
            ? `Condition is always true — else branch is dead code`
            : `Condition is always false — then branch is dead code`,
          file,
        }
        if (stmt.span) {
          warn.line = stmt.span.line
          warn.col = stmt.span.col
        } else if (stmt.cond.span) {
          warn.line = stmt.cond.span.line
          warn.col = stmt.cond.span.col
        }
        out.push(warn)
      }
      // Recurse into branches regardless
      checkDeadBranchesBlock(stmt.then, out, file)
      if (stmt.else_) checkDeadBranchesBlock(stmt.else_, out, file)
    } else {
      checkDeadBranchesStmt(stmt, out, file)
    }
  }
}

function checkDeadBranchesStmt(stmt: HIRStmt, out: LintWarning[], file: string | undefined): void {
  switch (stmt.kind) {
    case 'while':
      checkDeadBranchesBlock(stmt.body, out, file)
      if (stmt.step) checkDeadBranchesBlock(stmt.step, out, file)
      break
    case 'foreach':
      checkDeadBranchesBlock(stmt.body, out, file)
      break
    case 'match':
      for (const arm of stmt.arms) checkDeadBranchesBlock(arm.body, out, file)
      break
    case 'execute':
      checkDeadBranchesBlock(stmt.body, out, file)
      break
    case 'if_let_some':
      checkDeadBranchesBlock(stmt.then, out, file)
      if (stmt.else_) checkDeadBranchesBlock(stmt.else_, out, file)
      break
    case 'while_let_some':
      checkDeadBranchesBlock(stmt.body, out, file)
      break
    case 'labeled_loop':
      checkDeadBranchesStmt(stmt.body, out, file)
      break
  }
}

type CmpOp = '==' | '!=' | '<' | '<=' | '>' | '>='

/**
 * Try to evaluate an expression as a compile-time boolean.
 * Returns true/false if it can be determined, null otherwise.
 */
function evaluateConstBool(expr: HIRExpr): boolean | null {
  if (expr.kind === 'bool_lit') return expr.value

  if (expr.kind === 'binary') {
    const lv = evaluateConstNumber(expr.left)
    const rv = evaluateConstNumber(expr.right)
    if (lv !== null && rv !== null) {
      switch (expr.op as CmpOp) {
        case '==': return lv === rv
        case '!=': return lv !== rv
        case '<':  return lv < rv
        case '<=': return lv <= rv
        case '>':  return lv > rv
        case '>=': return lv >= rv
      }
    }
    // bool == bool
    const lb = evaluateConstBool(expr.left)
    const rb = evaluateConstBool(expr.right)
    if (lb !== null && rb !== null) {
      if (expr.op === '==') return lb === rb
      if (expr.op === '!=') return lb !== rb
    }
  }

  return null
}

function evaluateConstNumber(expr: HIRExpr): number | null {
  switch (expr.kind) {
    case 'int_lit':
    case 'float_lit':
    case 'byte_lit':
    case 'short_lit':
    case 'long_lit':
    case 'double_lit':
      return expr.value
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Rule: function-too-long
// ---------------------------------------------------------------------------

function checkFunctionLength(fn: HIRFunction, maxLines: number, file?: string): LintWarning | null {
  const lineCount = countFunctionLines(fn)
  if (lineCount > maxLines) {
    const warn: LintWarning = {
      rule: 'function-too-long',
      message: `Function "${fn.name}" is ${lineCount} lines long (max ${maxLines}), consider splitting it`,
      file,
    }
    if (fn.span) {
      warn.line = fn.span.line
      warn.col = fn.span.col
    }
    return warn
  }
  return null
}

/** Estimate line count from span range or count statements recursively. */
function countFunctionLines(fn: HIRFunction): number {
  if (fn.span && fn.body.length > 0) {
    const lastStmt = fn.body[fn.body.length - 1]
    if (lastStmt.span && fn.span.line) {
      const endLine = lastStmt.span.line
      const startLine = fn.span.line
      if (endLine > startLine) return endLine - startLine
    }
  }
  // Fallback: count statements recursively (rough)
  return countStmts(fn.body)
}

function countStmts(block: HIRBlock): number {
  let count = 0
  for (const stmt of block) {
    count++
    switch (stmt.kind) {
      case 'if':
        count += countStmts(stmt.then)
        if (stmt.else_) count += countStmts(stmt.else_)
        break
      case 'while':
        count += countStmts(stmt.body)
        if (stmt.step) count += countStmts(stmt.step)
        break
      case 'foreach':
        count += countStmts(stmt.body)
        break
      case 'match':
        for (const arm of stmt.arms) count += countStmts(arm.body)
        break
      case 'execute':
        count += countStmts(stmt.body)
        break
      case 'if_let_some':
        count += countStmts(stmt.then)
        if (stmt.else_) count += countStmts(stmt.else_)
        break
      case 'while_let_some':
        count += countStmts(stmt.body)
        break
      case 'labeled_loop':
        count += countStmts([stmt.body])
        break
    }
  }
  return count
}
