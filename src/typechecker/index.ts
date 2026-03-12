/**
 * RedScript Type Checker
 *
 * Performs basic type checking between Parser and Lowering phases.
 * Collects errors but doesn't block compilation (warn mode).
 */

import type { Program, FnDecl, Stmt, Expr, TypeNode, Block } from '../ast/types'
import { DiagnosticError, DiagnosticCollector } from '../diagnostics'

interface ScopeSymbol {
  type: TypeNode
  mutable: boolean
}

// ---------------------------------------------------------------------------
// Type Checker
// ---------------------------------------------------------------------------

export class TypeChecker {
  private collector: DiagnosticCollector
  private functions: Map<string, FnDecl> = new Map()
  private structs: Map<string, Map<string, TypeNode>> = new Map()
  private enums: Map<string, Map<string, number>> = new Map()
  private consts: Map<string, TypeNode> = new Map()
  private currentFn: FnDecl | null = null
  private currentReturnType: TypeNode | null = null
  private scope: Map<string, ScopeSymbol> = new Map()

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

    for (const constDecl of program.consts ?? []) {
      const constType = this.normalizeType(constDecl.type)
      const actualType = this.inferType(constDecl.value)
      if (!this.typesMatch(constType, actualType)) {
        this.report(
          `Type mismatch: expected ${this.typeToString(constType)}, got ${this.typeToString(actualType)}`,
          constDecl.value
        )
      }
      this.consts.set(constDecl.name, constType)
    }

    // Second pass: type check function bodies
    for (const fn of program.declarations) {
      this.checkFunction(fn)
    }

    return this.collector.getErrors()
  }

  private checkFunction(fn: FnDecl): void {
    this.currentFn = fn
    this.currentReturnType = this.normalizeType(fn.returnType)
    this.scope = new Map()
    let seenDefault = false

    for (const [name, type] of this.consts.entries()) {
      this.scope.set(name, { type, mutable: false })
    }

    // Add parameters to scope
    for (const param of fn.params) {
      this.scope.set(param.name, { type: this.normalizeType(param.type), mutable: true })
      if (param.default) {
        seenDefault = true
        this.checkExpr(param.default)
        const defaultType = this.inferType(param.default)
        const paramType = this.normalizeType(param.type)
        if (!this.typesMatch(paramType, defaultType)) {
          this.report(
            `Default value for '${param.name}' must be ${this.typeToString(paramType)}, got ${this.typeToString(defaultType)}`,
            param.default
          )
        }
      } else if (seenDefault) {
        this.report(`Parameter '${param.name}' cannot follow a default parameter`, param)
      }
    }

    // Check body
    this.checkBlock(fn.body)

    this.currentFn = null
    this.currentReturnType = null
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
          this.scope.set(stmt.binding, { type: { kind: 'named', name: 'void' }, mutable: true }) // Entity marker
        } else {
          const iterableType = this.inferType(stmt.iterable)
          if (iterableType.kind === 'array') {
            this.scope.set(stmt.binding, { type: iterableType.elem, mutable: true })
          } else {
            this.scope.set(stmt.binding, { type: { kind: 'named', name: 'void' }, mutable: true })
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
    // Check initializer
    const expectedType = stmt.type ? this.normalizeType(stmt.type) : undefined
    this.checkExpr(stmt.init, expectedType)

    // Add variable to scope
    const type = expectedType ?? this.inferType(stmt.init)
    this.scope.set(stmt.name, { type, mutable: true })

    const actualType = this.inferType(stmt.init, expectedType)
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
    if (!this.currentReturnType) return

    const expectedType = this.currentReturnType
    
    if (stmt.value) {
      const actualType = this.inferType(stmt.value, expectedType)
      this.checkExpr(stmt.value, expectedType)
      
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

  private checkExpr(expr: Expr, expectedType?: TypeNode): void {
    switch (expr.kind) {
      case 'ident':
        if (!this.scope.has(expr.name)) {
          this.report(`Variable '${expr.name}' used before declaration`, expr)
        }
        break

      case 'call':
        this.checkCallExpr(expr)
        break

      case 'invoke':
        this.checkInvokeExpr(expr)
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
        } else if (!this.scope.get(expr.target)?.mutable) {
          this.report(`Cannot assign to const '${expr.target}'`, expr)
        }
        this.checkExpr(expr.value, this.scope.get(expr.target)?.type)
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

      case 'lambda':
        this.checkLambdaExpr(expr, expectedType)
        break

      case 'blockpos':
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
    if (expr.fn === 'tp' || expr.fn === 'tp_to') {
      this.checkTpCall(expr)
    }

    // Check if function exists and arg count matches
    const fn = this.functions.get(expr.fn)
    if (fn) {
      const requiredParams = fn.params.filter(param => !param.default).length
      if (expr.args.length < requiredParams || expr.args.length > fn.params.length) {
        const expectedRange = requiredParams === fn.params.length
          ? `${fn.params.length}`
          : `${requiredParams}-${fn.params.length}`
        this.report(
          `Function '${expr.fn}' expects ${expectedRange} arguments, got ${expr.args.length}`,
          expr
        )
      }
      for (let i = 0; i < expr.args.length; i++) {
        const paramType = fn.params[i] ? this.normalizeType(fn.params[i].type) : undefined
        if (paramType) {
          this.checkExpr(expr.args[i], paramType)
        }
        const argType = this.inferType(expr.args[i], paramType)
        if (paramType && !this.typesMatch(paramType, argType)) {
          this.report(
            `Argument ${i + 1} of '${expr.fn}' expects ${this.typeToString(paramType)}, got ${this.typeToString(argType)}`,
            expr.args[i]
          )
        }
      }
      return
    }

    const varType = this.scope.get(expr.fn)?.type
    if (varType?.kind === 'function_type') {
      this.checkFunctionCallArgs(expr.args, varType.params, expr.fn, expr)
      return
    }

    for (const arg of expr.args) {
      this.checkExpr(arg)
    }
    // Built-in functions are not checked for arg count
  }

  private checkInvokeExpr(expr: Extract<Expr, { kind: 'invoke' }>): void {
    this.checkExpr(expr.callee)
    const calleeType = this.inferType(expr.callee)
    if (calleeType.kind !== 'function_type') {
      this.report('Attempted to call a non-function value', expr.callee)
      for (const arg of expr.args) {
        this.checkExpr(arg)
      }
      return
    }

    this.checkFunctionCallArgs(expr.args, calleeType.params, 'lambda', expr)
  }

  private checkFunctionCallArgs(
    args: Expr[],
    params: TypeNode[],
    calleeName: string,
    node: Expr
  ): void {
    if (args.length !== params.length) {
      this.report(`Function '${calleeName}' expects ${params.length} arguments, got ${args.length}`, node)
    }

    for (let i = 0; i < args.length; i++) {
      const paramType = params[i]
      if (!paramType) {
        this.checkExpr(args[i])
        continue
      }
      this.checkExpr(args[i], paramType)
      const argType = this.inferType(args[i], paramType)
      if (!this.typesMatch(paramType, argType)) {
        this.report(
          `Argument ${i + 1} of '${calleeName}' expects ${this.typeToString(paramType)}, got ${this.typeToString(argType)}`,
          args[i]
        )
      }
    }
  }

  private checkTpCall(expr: Extract<Expr, { kind: 'call' }>): void {
    const dest = expr.args[1]
    if (!dest) {
      return
    }

    const destType = this.inferType(dest)
    if (destType.kind === 'named' && destType.name === 'BlockPos') {
      return
    }

    if (dest.kind === 'selector' && !dest.isSingle) {
      this.report(
        'tp destination must be a single-entity selector (@s, @p, @r, or limit=1)',
        dest
      )
    }
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

      const varSymbol = this.scope.get(expr.obj.name)
      const varType = varSymbol?.type
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

  private checkLambdaExpr(expr: Extract<Expr, { kind: 'lambda' }>, expectedType?: TypeNode): void {
    const normalizedExpected = expectedType ? this.normalizeType(expectedType) : undefined
    const expectedFnType = normalizedExpected?.kind === 'function_type' ? normalizedExpected : undefined
    const lambdaType = this.inferLambdaType(expr, expectedFnType)

    if (expectedFnType && !this.typesMatch(expectedFnType, lambdaType)) {
      this.report(
        `Type mismatch: expected ${this.typeToString(expectedFnType)}, got ${this.typeToString(lambdaType)}`,
        expr
      )
      return
    }

    const outerScope = this.scope
    const outerReturnType = this.currentReturnType
    const lambdaScope = new Map(this.scope)
    const paramTypes = expectedFnType?.params ?? lambdaType.params

    for (let i = 0; i < expr.params.length; i++) {
      lambdaScope.set(expr.params[i].name, {
        type: paramTypes[i] ?? { kind: 'named', name: 'void' },
        mutable: true,
      })
    }

    this.scope = lambdaScope
    this.currentReturnType = expr.returnType
      ? this.normalizeType(expr.returnType)
      : (expectedFnType?.return ?? lambdaType.return)

    if (Array.isArray(expr.body)) {
      this.checkBlock(expr.body)
    } else {
      this.checkExpr(expr.body, this.currentReturnType)
      const actualType = this.inferType(expr.body, this.currentReturnType)
      if (!this.typesMatch(this.currentReturnType, actualType)) {
        this.report(
          `Return type mismatch: expected ${this.typeToString(this.currentReturnType)}, got ${this.typeToString(actualType)}`,
          expr.body
        )
      }
    }

    this.scope = outerScope
    this.currentReturnType = outerReturnType
  }

  private inferType(expr: Expr, expectedType?: TypeNode): TypeNode {
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
      case 'blockpos':
        return { kind: 'named', name: 'BlockPos' }
      case 'ident':
        return this.scope.get(expr.name)?.type ?? { kind: 'named', name: 'void' }
      case 'call': {
        if (expr.fn === '__array_push') {
          return { kind: 'named', name: 'void' }
        }
        if (expr.fn === '__array_pop') {
          const target = expr.args[0]
          if (target && target.kind === 'ident') {
            const targetType = this.scope.get(target.name)?.type
            if (targetType?.kind === 'array') return targetType.elem
          }
          return { kind: 'named', name: 'int' }
        }
        if (expr.fn === 'bossbar_get_value') {
          return { kind: 'named', name: 'int' }
        }
        if (expr.fn === 'random_sequence') {
          return { kind: 'named', name: 'void' }
        }
        const varType = this.scope.get(expr.fn)?.type
        if (varType?.kind === 'function_type') {
          return varType.return
        }
        const fn = this.functions.get(expr.fn)
        return fn?.returnType ?? { kind: 'named', name: 'int' }
      }
      case 'invoke': {
        const calleeType = this.inferType(expr.callee)
        if (calleeType.kind === 'function_type') {
          return calleeType.return
        }
        return { kind: 'named', name: 'void' }
      }
      case 'member':
        if (expr.obj.kind === 'ident' && this.enums.has(expr.obj.name)) {
          return { kind: 'enum', name: expr.obj.name }
        }
        if (expr.obj.kind === 'ident') {
          const objTypeNode = this.scope.get(expr.obj.name)?.type
          if (objTypeNode?.kind === 'array' && expr.field === 'len') {
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
      case 'lambda':
        return this.inferLambdaType(
          expr,
          expectedType && this.normalizeType(expectedType).kind === 'function_type'
            ? this.normalizeType(expectedType) as Extract<TypeNode, { kind: 'function_type' }>
            : undefined
        )
      default:
        return { kind: 'named', name: 'void' }
    }
  }

  private inferLambdaType(
    expr: Extract<Expr, { kind: 'lambda' }>,
    expectedType?: Extract<TypeNode, { kind: 'function_type' }>
  ): Extract<TypeNode, { kind: 'function_type' }> {
    const params: TypeNode[] = expr.params.map((param, index) => {
      if (param.type) {
        return this.normalizeType(param.type)
      }
      const inferred = expectedType?.params[index]
      if (inferred) {
        return inferred
      }
      this.report(`Lambda parameter '${param.name}' requires a type annotation`, expr)
      return { kind: 'named', name: 'void' }
    })

    let returnType: TypeNode | undefined = expr.returnType
      ? this.normalizeType(expr.returnType)
      : expectedType?.return
    if (!returnType) {
      returnType = Array.isArray(expr.body) ? { kind: 'named', name: 'void' } : this.inferType(expr.body)
    }

    return { kind: 'function_type', params, return: returnType }
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

    if (expected.kind === 'function_type' && actual.kind === 'function_type') {
      return expected.params.length === actual.params.length &&
        expected.params.every((param, index) => this.typesMatch(param, actual.params[index])) &&
        this.typesMatch(expected.return, actual.return)
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
      case 'function_type':
        return `(${type.params.map(param => this.typeToString(param)).join(', ')}) -> ${this.typeToString(type.return)}`
    }
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
    if ((type.kind === 'struct' || type.kind === 'enum') && this.enums.has(type.name)) {
      return { kind: 'enum', name: type.name }
    }
    return type
  }
}
