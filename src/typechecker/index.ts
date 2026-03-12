/**
 * RedScript Type Checker
 *
 * Performs basic type checking between Parser and Lowering phases.
 * Collects errors but doesn't block compilation (warn mode).
 */

import type { Program, FnDecl, Stmt, Expr, TypeNode, Block } from '../ast/types'
import { DiagnosticError, DiagnosticCollector } from '../diagnostics'

// ---------------------------------------------------------------------------
// Type Checker
// ---------------------------------------------------------------------------

export class TypeChecker {
  private collector: DiagnosticCollector
  private functions: Map<string, FnDecl> = new Map()
  private structs: Map<string, Map<string, TypeNode>> = new Map()
  private enums: Map<string, Map<string, number>> = new Map()
  private currentFn: FnDecl | null = null
  private scope: Map<string, TypeNode> = new Map()

  constructor(source?: string, filePath?: string) {
    this.collector = new DiagnosticCollector(source, filePath)
  }

  private getNodeLocation(node: unknown): { line: number; col: number } {
    const loc = (node as { loc?: { line: number; col: number } } | undefined)?.loc
    return {
      line: loc?.line ?? 1,
      col: loc?.col ?? 1,
    }
  }

  private report(message: string, node?: unknown): void {
    const { line, col } = this.getNodeLocation(node)
    this.collector.error('TypeError', message, line, col)
  }

  /**
   * Type check a program. Returns collected errors.
   */
  check(program: Program): DiagnosticError[] {
    // First pass: collect function and struct declarations
    for (const fn of program.declarations) {
      this.functions.set(fn.name, fn)
    }

    for (const struct of program.structs ?? []) {
      const fields = new Map<string, TypeNode>()
      for (const field of struct.fields) {
        fields.set(field.name, field.type)
      }
      this.structs.set(struct.name, fields)
    }

    for (const enumDecl of program.enums ?? []) {
      const variants = new Map<string, number>()
      for (const variant of enumDecl.variants) {
        variants.set(variant.name, variant.value ?? 0)
      }
      this.enums.set(enumDecl.name, variants)
    }

    // Second pass: type check function bodies
    for (const fn of program.declarations) {
      this.checkFunction(fn)
    }

    return this.collector.getErrors()
  }

  private checkFunction(fn: FnDecl): void {
    this.currentFn = fn
    this.scope = new Map()

    // Add parameters to scope
    for (const param of fn.params) {
      this.scope.set(param.name, this.normalizeType(param.type))
    }

    // Check body
    this.checkBlock(fn.body)

    this.currentFn = null
  }

  private checkBlock(stmts: Block): void {
    for (const stmt of stmts) {
      this.checkStmt(stmt)
    }
  }

  private checkStmt(stmt: Stmt): void {
    switch (stmt.kind) {
      case 'let':
        this.checkLetStmt(stmt)
        break
      case 'return':
        this.checkReturnStmt(stmt)
        break
      case 'if':
        this.checkExpr(stmt.cond)
        this.checkBlock(stmt.then)
        if (stmt.else_) this.checkBlock(stmt.else_)
        break
      case 'while':
        this.checkExpr(stmt.cond)
        this.checkBlock(stmt.body)
        break
      case 'for':
        if (stmt.init) this.checkStmt(stmt.init)
        this.checkExpr(stmt.cond)
        this.checkExpr(stmt.step)
        this.checkBlock(stmt.body)
        break
      case 'foreach':
        this.checkExpr(stmt.iterable)
        if (stmt.iterable.kind === 'selector') {
          this.scope.set(stmt.binding, { kind: 'named', name: 'void' }) // Entity marker
        } else {
          const iterableType = this.inferType(stmt.iterable)
          if (iterableType.kind === 'array') {
            this.scope.set(stmt.binding, iterableType.elem)
          } else {
            this.scope.set(stmt.binding, { kind: 'named', name: 'void' })
          }
        }
        this.checkBlock(stmt.body)
        break
      case 'match':
        this.checkExpr(stmt.expr)
        for (const arm of stmt.arms) {
          if (arm.pattern) {
            this.checkExpr(arm.pattern)
            if (!this.typesMatch(this.inferType(stmt.expr), this.inferType(arm.pattern))) {
              this.report('Match arm pattern type must match subject type', arm.pattern)
            }
          }
          this.checkBlock(arm.body)
        }
        break
      case 'as_block':
      case 'at_block':
        this.checkBlock(stmt.body)
        break
      case 'as_at':
        this.checkBlock(stmt.body)
        break
      case 'execute':
        this.checkBlock(stmt.body)
        break
      case 'expr':
        this.checkExpr(stmt.expr)
        break
      case 'raw':
        // Raw commands are not type checked
        break
    }
  }

  private checkLetStmt(stmt: Extract<Stmt, { kind: 'let' }>): void {
    // Add variable to scope
    const type = stmt.type ? this.normalizeType(stmt.type) : this.inferType(stmt.init)
    this.scope.set(stmt.name, type)

    // Check initializer
    this.checkExpr(stmt.init)

    const expectedType = stmt.type ? this.normalizeType(stmt.type) : undefined
    const actualType = this.inferType(stmt.init)
    if (
      expectedType &&
      stmt.init.kind !== 'struct_lit' &&
      stmt.init.kind !== 'array_lit' &&
      !(actualType.kind === 'named' && actualType.name === 'void') &&
      !this.typesMatch(expectedType, actualType)
    ) {
      this.report(
        `Type mismatch: expected ${this.typeToString(expectedType)}, got ${this.typeToString(actualType)}`,
        stmt
      )
    }
  }

  private checkReturnStmt(stmt: Extract<Stmt, { kind: 'return' }>): void {
    if (!this.currentFn) return

    const expectedType = this.currentFn.returnType
    
    if (stmt.value) {
      const actualType = this.inferType(stmt.value)
      this.checkExpr(stmt.value)
      
      if (!this.typesMatch(expectedType, actualType)) {
        this.report(
          `Return type mismatch: expected ${this.typeToString(expectedType)}, got ${this.typeToString(actualType)}`,
          stmt
        )
      }
    } else {
      // No return value
      if (expectedType.kind !== 'named' || expectedType.name !== 'void') {
        this.report(`Missing return value: expected ${this.typeToString(expectedType)}`, stmt)
      }
    }
  }

  private checkExpr(expr: Expr): void {
    switch (expr.kind) {
      case 'ident':
        if (!this.scope.has(expr.name)) {
          this.report(`Variable '${expr.name}' used before declaration`, expr)
        }
        break

      case 'call':
        this.checkCallExpr(expr)
        break

      case 'member':
        this.checkMemberExpr(expr)
        break

      case 'binary':
        this.checkExpr(expr.left)
        this.checkExpr(expr.right)
        break

      case 'unary':
        this.checkExpr(expr.operand)
        break

      case 'assign':
        if (!this.scope.has(expr.target)) {
          this.report(`Variable '${expr.target}' used before declaration`, expr)
        }
        this.checkExpr(expr.value)
        break

      case 'member_assign':
        this.checkExpr(expr.obj)
        this.checkExpr(expr.value)
        break

      case 'index':
        this.checkExpr(expr.obj)
        this.checkExpr(expr.index)
        const indexType = this.inferType(expr.index)
        if (indexType.kind !== 'named' || indexType.name !== 'int') {
          this.report('Array index must be int', expr.index)
        }
        break

      case 'struct_lit':
        for (const field of expr.fields) {
          this.checkExpr(field.value)
        }
        break

      case 'str_interp':
        for (const part of expr.parts) {
          if (typeof part !== 'string') {
            this.checkExpr(part)
          }
        }
        break

      case 'array_lit':
        for (const elem of expr.elements) {
          this.checkExpr(elem)
        }
        break

      case 'static_call':
        for (const arg of expr.args) {
          this.checkExpr(arg)
        }
        break

      // Literals don't need checking
      case 'int_lit':
      case 'float_lit':
      case 'bool_lit':
      case 'str_lit':
      case 'range_lit':
      case 'selector':
        break
    }
  }

  private checkCallExpr(expr: Extract<Expr, { kind: 'call' }>): void {
    // Check args
    for (const arg of expr.args) {
      this.checkExpr(arg)
    }

    // Check if function exists and arg count matches
    const fn = this.functions.get(expr.fn)
    if (fn) {
      if (expr.args.length !== fn.params.length) {
        this.report(
          `Function '${expr.fn}' expects ${fn.params.length} arguments, got ${expr.args.length}`,
          expr
        )
      }
      for (let i = 0; i < expr.args.length; i++) {
        const paramType = fn.params[i] ? this.normalizeType(fn.params[i].type) : undefined
        const argType = this.inferType(expr.args[i])
        if (paramType && !this.typesMatch(paramType, argType)) {
          this.report(
            `Argument ${i + 1} of '${expr.fn}' expects ${this.typeToString(paramType)}, got ${this.typeToString(argType)}`,
            expr.args[i]
          )
        }
      }
    }
    // Built-in functions are not checked for arg count
  }

  private checkMemberExpr(expr: Extract<Expr, { kind: 'member' }>): void {
    if (!(expr.obj.kind === 'ident' && this.enums.has(expr.obj.name))) {
      this.checkExpr(expr.obj)
    }

    // Check if accessing member on appropriate type
    if (expr.obj.kind === 'ident') {
      if (this.enums.has(expr.obj.name)) {
        const enumVariants = this.enums.get(expr.obj.name)!
        if (!enumVariants.has(expr.field)) {
          this.report(`Enum '${expr.obj.name}' has no variant '${expr.field}'`, expr)
        }
        return
      }

      const varType = this.scope.get(expr.obj.name)
      if (varType) {
        // Allow member access on struct types
        if (varType.kind === 'struct') {
          const structFields = this.structs.get(varType.name)
          if (structFields && !structFields.has(expr.field)) {
            this.report(`Struct '${varType.name}' has no field '${expr.field}'`, expr)
          }
        } else if (varType.kind === 'array') {
          if (expr.field !== 'len' && expr.field !== 'push' && expr.field !== 'pop') {
            this.report(`Array has no field '${expr.field}'`, expr)
          }
        } else if (varType.kind === 'named') {
          // Entity marker (void) - allow all members
          if (varType.name !== 'void') {
            // Only warn for primitive types
            if (['int', 'bool', 'float', 'string'].includes(varType.name)) {
              this.report(
                `Cannot access member '${expr.field}' on ${this.typeToString(varType)}`,
                expr
              )
            }
          }
        }
      }
    }
  }

  private inferType(expr: Expr): TypeNode {
    switch (expr.kind) {
      case 'int_lit':
        return { kind: 'named', name: 'int' }
      case 'float_lit':
        return { kind: 'named', name: 'float' }
      case 'bool_lit':
        return { kind: 'named', name: 'bool' }
      case 'str_lit':
        return { kind: 'named', name: 'string' }
      case 'str_interp':
        for (const part of expr.parts) {
          if (typeof part !== 'string') {
            this.checkExpr(part)
          }
        }
        return { kind: 'named', name: 'string' }
      case 'ident':
        return this.scope.get(expr.name) ?? { kind: 'named', name: 'void' }
      case 'call': {
        if (expr.fn === '__array_push') {
          return { kind: 'named', name: 'void' }
        }
        if (expr.fn === '__array_pop') {
          const target = expr.args[0]
          if (target && target.kind === 'ident') {
            const targetType = this.scope.get(target.name)
            if (targetType?.kind === 'array') return targetType.elem
          }
          return { kind: 'named', name: 'int' }
        }
        const fn = this.functions.get(expr.fn)
        return fn?.returnType ?? { kind: 'named', name: 'int' }
      }
      case 'member':
        if (expr.obj.kind === 'ident' && this.enums.has(expr.obj.name)) {
          return { kind: 'enum', name: expr.obj.name }
        }
        if (expr.obj.kind === 'ident') {
          const objType = this.scope.get(expr.obj.name)
          if (objType?.kind === 'array' && expr.field === 'len') {
            return { kind: 'named', name: 'int' }
          }
        }
        return { kind: 'named', name: 'void' }
      case 'index': {
        const objType = this.inferType(expr.obj)
        if (objType.kind === 'array') return objType.elem
        return { kind: 'named', name: 'void' }
      }
      case 'binary':
        if (['==', '!=', '<', '<=', '>', '>=', '&&', '||'].includes(expr.op)) {
          return { kind: 'named', name: 'bool' }
        }
        return this.inferType(expr.left)
      case 'unary':
        if (expr.op === '!') return { kind: 'named', name: 'bool' }
        return this.inferType(expr.operand)
      case 'array_lit':
        if (expr.elements.length > 0) {
          return { kind: 'array', elem: this.inferType(expr.elements[0]) }
        }
        return { kind: 'array', elem: { kind: 'named', name: 'int' } }
      default:
        return { kind: 'named', name: 'void' }
    }
  }

  private typesMatch(expected: TypeNode, actual: TypeNode): boolean {
    if (expected.kind !== actual.kind) return false

    if (expected.kind === 'named' && actual.kind === 'named') {
      // void matches anything (for inferred types)
      if (actual.name === 'void') return true
      return expected.name === actual.name
    }

    if (expected.kind === 'array' && actual.kind === 'array') {
      return this.typesMatch(expected.elem, actual.elem)
    }

    if (expected.kind === 'struct' && actual.kind === 'struct') {
      return expected.name === actual.name
    }

    if (expected.kind === 'enum' && actual.kind === 'enum') {
      return expected.name === actual.name
    }

    return false
  }

  private typeToString(type: TypeNode): string {
    switch (type.kind) {
      case 'named':
        return type.name
      case 'array':
        return `${this.typeToString(type.elem)}[]`
      case 'struct':
        return type.name
      case 'enum':
        return type.name
    }
  }

  private normalizeType(type: TypeNode): TypeNode {
    if (type.kind === 'array') {
      return { kind: 'array', elem: this.normalizeType(type.elem) }
    }
    if ((type.kind === 'struct' || type.kind === 'enum') && this.enums.has(type.name)) {
      return { kind: 'enum', name: type.name }
    }
    return type
  }
}
