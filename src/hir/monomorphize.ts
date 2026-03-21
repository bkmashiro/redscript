/**
 * HIR Monomorphization — Phase 2c: Generic functions
 *
 * For each generic function `fn foo<T>(...)`, each unique instantiation
 * `foo<int>`, `foo<float>` etc. produces a concrete copy with a mangled name.
 *
 * Algorithm:
 * 1. Walk the HIR module collecting all call sites to generic functions.
 * 2. For each unique (fnName, typeArgs) pair, clone the generic HIRFunction,
 *    substitute all occurrences of the type params, and add to module.functions.
 * 3. Rewrite every call site: `foo<int>(x, y)` → `foo_int(x, y)`.
 * 4. Remove original generic function definitions from the output.
 *
 * Type arg → suffix mapping:
 *   int      → "int"
 *   float    → "float"
 *   bool     → "bool"
 *   string   → "string"
 *   (others) → use struct/enum name
 */

import type {
  HIRModule, HIRFunction, HIRParam, HIRExpr, HIRStmt, HIRBlock,
  TypeNode, HIRMatchPattern,
} from './types'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function monomorphize(module: HIRModule): HIRModule {
  const mono = new Monomorphizer(module)
  return mono.run()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a stable string suffix for a type argument, used in mangled names. */
function typeSuffix(t: TypeNode): string {
  switch (t.kind) {
    case 'named': return t.name
    case 'struct': return t.name
    case 'enum':   return t.name
    case 'array':  return `arr_${typeSuffix(t.elem)}`
    case 'tuple':  return `tup_${t.elements.map(typeSuffix).join('_')}`
    case 'option': return `opt_${typeSuffix(t.inner)}`
    default:       return 'unknown'
  }
}

/** Produce the mangled name for a specialization, e.g. "max_int". */
function mangledName(fnName: string, typeArgs: TypeNode[]): string {
  return `${fnName}_${typeArgs.map(typeSuffix).join('_')}`
}

/** Build a substitution map: type param name → concrete type. */
function buildSubst(typeParams: string[], typeArgs: TypeNode[]): Map<string, TypeNode> {
  const subst = new Map<string, TypeNode>()
  for (let i = 0; i < typeParams.length; i++) {
    subst.set(typeParams[i], typeArgs[i])
  }
  return subst
}

/** Apply substitution to a TypeNode (replacing struct-kind nodes whose name
 *  matches a type param with the concrete type). */
function substType(t: TypeNode, subst: Map<string, TypeNode>): TypeNode {
  switch (t.kind) {
    case 'struct': {
      const replacement = subst.get(t.name)
      if (replacement) return replacement
      return t
    }
    case 'array':
      return { kind: 'array', elem: substType(t.elem, subst) }
    case 'tuple':
      return { kind: 'tuple', elements: t.elements.map(e => substType(e, subst)) }
    case 'option':
      return { kind: 'option', inner: substType(t.inner, subst) }
    case 'function_type':
      return { kind: 'function_type', params: t.params.map(p => substType(p, subst)), return: substType(t.return, subst) }
    default:
      return t
  }
}

// ---------------------------------------------------------------------------
// Monomorphizer
// ---------------------------------------------------------------------------

/** Context passed through expression/statement rewriting. */
interface RewriteCtx {
  /** Type substitution: type param name → concrete type */
  subst: Map<string, TypeNode>
  /** Variable scope: variable name → concrete type (for inference) */
  varTypes: Map<string, TypeNode>
}

class Monomorphizer {
  private module: HIRModule
  /** Map from function name → HIRFunction for generic functions */
  private genericFns: Map<string, HIRFunction> = new Map()
  /** Cache: cacheKey → specialized HIRFunction (to avoid duplicate generation) */
  private specialized: Map<string, HIRFunction> = new Map()
  /** Worklist for BFS specialization (to handle generic calling generic) */
  private worklist: Array<{ fn: HIRFunction; typeArgs: TypeNode[] }> = []

  constructor(module: HIRModule) {
    this.module = module
  }

  run(): HIRModule {
    // Collect all generic function definitions
    for (const fn of this.module.functions) {
      if (fn.typeParams && fn.typeParams.length > 0) {
        this.genericFns.set(fn.name, fn)
      }
    }

    if (this.genericFns.size === 0) {
      // Nothing to do — fast path
      return this.module
    }

    // Rewrite all non-generic functions, collecting specializations needed
    const newFunctions: HIRFunction[] = []
    for (const fn of this.module.functions) {
      if (fn.typeParams && fn.typeParams.length > 0) {
        // Skip generic function templates — they'll be replaced by specializations
        continue
      }
      const rewritten = this.rewriteFn(fn)
      newFunctions.push(rewritten)
    }

    // Process worklist BFS: generate specializations (which may add more to worklist)
    while (this.worklist.length > 0) {
      const { fn: templateFn, typeArgs } = this.worklist.shift()!
      const key = this.cacheKey(templateFn.name, typeArgs)
      if (this.specialized.has(key)) continue
      // Mark as in-progress to prevent cycles
      this.specialized.set(key, null as unknown as HIRFunction)
      const specializedFn = this.specialize(templateFn, typeArgs)
      this.specialized.set(key, specializedFn)
    }

    // Add all specializations
    for (const fn of this.specialized.values()) {
      if (fn) newFunctions.push(fn)
    }

    return { ...this.module, functions: newFunctions }
  }

  private cacheKey(fnName: string, typeArgs: TypeNode[]): string {
    return `${fnName}|${typeArgs.map(typeSuffix).join(',')}`
  }

  /** Specialize a generic function with concrete type args. */
  private specialize(templateFn: HIRFunction, typeArgs: TypeNode[]): HIRFunction {
    const subst = buildSubst(templateFn.typeParams!, typeArgs)
    const name = mangledName(templateFn.name, typeArgs)

    // Build initial variable scope from parameters
    const varTypes = new Map<string, TypeNode>()
    const params: HIRParam[] = templateFn.params.map(p => {
      const concreteType = substType(p.type, subst)
      varTypes.set(p.name, concreteType)
      return {
        name: p.name,
        type: concreteType,
        default: p.default ? this.rewriteExpr(p.default, { subst, varTypes }) : undefined,
      }
    })

    const returnType = substType(templateFn.returnType, subst)
    const body = this.rewriteBlock(templateFn.body, { subst, varTypes })

    return {
      name,
      params,
      returnType,
      decorators: templateFn.decorators,
      body,
      isLibraryFn: templateFn.isLibraryFn,
      isExported: templateFn.isExported,
      span: templateFn.span,
      // No typeParams on the specialized copy
    }
  }

  /** Rewrite a non-generic function (substitute calls to generic functions). */
  private rewriteFn(fn: HIRFunction): HIRFunction {
    const varTypes = new Map<string, TypeNode>()
    // Add params to scope with their concrete types
    for (const p of fn.params) {
      varTypes.set(p.name, p.type)
    }
    return {
      ...fn,
      params: fn.params.map(p => ({
        ...p,
        default: p.default ? this.rewriteExpr(p.default, { subst: new Map(), varTypes }) : undefined,
      })),
      body: this.rewriteBlock(fn.body, { subst: new Map(), varTypes }),
    }
  }

  private rewriteBlock(block: HIRBlock, ctx: RewriteCtx): HIRBlock {
    // Clone varTypes so block-local bindings don't leak
    const localCtx: RewriteCtx = { subst: ctx.subst, varTypes: new Map(ctx.varTypes) }
    const result: HIRBlock = []
    for (const stmt of block) {
      result.push(this.rewriteStmt(stmt, localCtx))
    }
    return result
  }

  private rewriteStmt(stmt: HIRStmt, ctx: RewriteCtx): HIRStmt {
    const { subst } = ctx
    switch (stmt.kind) {
      case 'let': {
        const init = this.rewriteExpr(stmt.init, ctx)
        const type = stmt.type ? substType(stmt.type, subst) : undefined
        // Track variable type in scope
        if (type) ctx.varTypes.set(stmt.name, type)
        else {
          const inferred = this.inferExprType(init, ctx)
          if (inferred) ctx.varTypes.set(stmt.name, inferred)
        }
        return { ...stmt, type, init }
      }
      case 'let_destruct':
        return { ...stmt, type: stmt.type ? substType(stmt.type, subst) : undefined, init: this.rewriteExpr(stmt.init, ctx) }
      case 'expr':
        return { ...stmt, expr: this.rewriteExpr(stmt.expr, ctx) }
      case 'return':
        return { ...stmt, value: stmt.value ? this.rewriteExpr(stmt.value, ctx) : undefined }
      case 'if':
        return {
          ...stmt,
          cond: this.rewriteExpr(stmt.cond, ctx),
          then: this.rewriteBlock(stmt.then, ctx),
          else_: stmt.else_ ? this.rewriteBlock(stmt.else_, ctx) : undefined,
        }
      case 'while':
        return {
          ...stmt,
          cond: this.rewriteExpr(stmt.cond, ctx),
          body: this.rewriteBlock(stmt.body, ctx),
          step: stmt.step ? this.rewriteBlock(stmt.step, ctx) : undefined,
        }
      case 'foreach':
        return { ...stmt, iterable: this.rewriteExpr(stmt.iterable, ctx), body: this.rewriteBlock(stmt.body, ctx) }
      case 'match':
        return {
          ...stmt,
          expr: this.rewriteExpr(stmt.expr, ctx),
          arms: stmt.arms.map(arm => {
            let pattern: HIRMatchPattern
            if (arm.pattern.kind === 'PatExpr') {
              pattern = { kind: 'PatExpr', expr: this.rewriteExpr(arm.pattern.expr, ctx) }
            } else {
              pattern = arm.pattern
            }
            return { pattern, body: this.rewriteBlock(arm.body, ctx) }
          }),
        }
      case 'execute':
        return { ...stmt, body: this.rewriteBlock(stmt.body, ctx) }
      case 'if_let_some':
        return {
          ...stmt,
          init: this.rewriteExpr(stmt.init, ctx),
          then: this.rewriteBlock(stmt.then, ctx),
          else_: stmt.else_ ? this.rewriteBlock(stmt.else_, ctx) : undefined,
        }
      case 'while_let_some':
        return {
          ...stmt,
          init: this.rewriteExpr(stmt.init, ctx),
          body: this.rewriteBlock(stmt.body, ctx),
        }
      case 'const_decl':
        return { ...stmt, value: this.rewriteExpr(stmt.value, ctx) }
      case 'break':
      case 'continue':
      case 'raw':
        return stmt
    }
  }

  private rewriteExpr(expr: HIRExpr, ctx: RewriteCtx): HIRExpr {
    const { subst } = ctx
    switch (expr.kind) {
      case 'call': {
        const args = expr.args.map(a => this.rewriteExpr(a, ctx))
        // Determine concrete type args for this call
        const resolvedTypeArgs: TypeNode[] | undefined = expr.typeArgs?.map(t => substType(t, subst))
        const genericFn = this.genericFns.get(expr.fn)
        if (genericFn && genericFn.typeParams && genericFn.typeParams.length > 0) {
          // This call targets a generic function — we need to monomorphize
          const concreteTypeArgs = resolvedTypeArgs ?? this.inferTypeArgs(genericFn, args, ctx)
          if (concreteTypeArgs) {
            const key = this.cacheKey(expr.fn, concreteTypeArgs)
            if (!this.specialized.has(key)) {
              // Enqueue for specialization
              this.worklist.push({ fn: genericFn, typeArgs: concreteTypeArgs })
            }
            const name = mangledName(expr.fn, concreteTypeArgs)
            return { ...expr, fn: name, args, typeArgs: undefined }
          }
        }
        return { ...expr, args, typeArgs: resolvedTypeArgs }
      }
      case 'invoke':
        return { ...expr, callee: this.rewriteExpr(expr.callee, ctx), args: expr.args.map(a => this.rewriteExpr(a, ctx)) }
      case 'binary':
        return { ...expr, left: this.rewriteExpr(expr.left, ctx), right: this.rewriteExpr(expr.right, ctx) }
      case 'unary':
        return { ...expr, operand: this.rewriteExpr(expr.operand, ctx) }
      case 'assign':
        return { ...expr, value: this.rewriteExpr(expr.value, ctx) }
      case 'member_assign':
        return { ...expr, obj: this.rewriteExpr(expr.obj, ctx), value: this.rewriteExpr(expr.value, ctx) }
      case 'index_assign':
        return { ...expr, obj: this.rewriteExpr(expr.obj, ctx), index: this.rewriteExpr(expr.index, ctx), value: this.rewriteExpr(expr.value, ctx) }
      case 'member':
        return { ...expr, obj: this.rewriteExpr(expr.obj, ctx) }
      case 'index':
        return { ...expr, obj: this.rewriteExpr(expr.obj, ctx), index: this.rewriteExpr(expr.index, ctx) }
      case 'array_lit':
        return { ...expr, elements: expr.elements.map(e => this.rewriteExpr(e, ctx)) }
      case 'struct_lit':
        return { ...expr, fields: expr.fields.map(f => ({ name: f.name, value: this.rewriteExpr(f.value, ctx) })) }
      case 'tuple_lit':
        return { ...expr, elements: expr.elements.map(e => this.rewriteExpr(e, ctx)) }
      case 'static_call':
        return { ...expr, args: expr.args.map(a => this.rewriteExpr(a, ctx)) }
      case 'lambda':
        return { ...expr, body: Array.isArray(expr.body) ? this.rewriteBlock(expr.body as HIRBlock, ctx) : this.rewriteExpr(expr.body as HIRExpr, ctx) }
      case 'is_check':
        return { ...expr, expr: this.rewriteExpr(expr.expr, ctx) }
      case 'str_interp':
        return { ...expr, parts: expr.parts.map(p => typeof p === 'string' ? p : this.rewriteExpr(p, ctx)) }
      case 'f_string':
        // FStringPart uses AST Expr (not HIRExpr) — pass through without rewriting
        return expr
      case 'some_lit':
        return { ...expr, value: this.rewriteExpr(expr.value, ctx) }
      case 'none_lit':
        return expr
      case 'unwrap_or':
        return { ...expr, opt: this.rewriteExpr(expr.opt, ctx), default_: this.rewriteExpr(expr.default_, ctx) }
      // Literals / terminals — pass through unchanged
      default:
        return expr
    }
  }

  /**
   * Infer type args from the actual argument expressions.
   * Works by looking at the types of call arguments and matching them to
   * the type parameters in the function signature.
   *
   * Returns null if inference fails.
   */
  private inferTypeArgs(fn: HIRFunction, args: HIRExpr[], ctx: RewriteCtx): TypeNode[] | null {
    const inferred = new Map<string, TypeNode>()
    const typeParams = fn.typeParams!

    for (let i = 0; i < fn.params.length && i < args.length; i++) {
      const paramType = fn.params[i].type
      const argType = this.inferExprType(args[i], ctx)
      if (argType) {
        this.matchTypes(paramType, argType, typeParams, inferred)
      }
    }

    // Check all type params were inferred
    if (typeParams.every(tp => inferred.has(tp))) {
      return typeParams.map(tp => inferred.get(tp)!)
    }
    return null
  }

  /** Walk a type pattern and a concrete type, binding type param names. */
  private matchTypes(pattern: TypeNode, concrete: TypeNode, typeParams: string[], inferred: Map<string, TypeNode>): void {
    if (pattern.kind === 'struct' && typeParams.includes(pattern.name)) {
      // This position is a type param — bind it
      if (!inferred.has(pattern.name)) {
        inferred.set(pattern.name, concrete)
      }
      return
    }
    if (pattern.kind === 'array' && concrete.kind === 'array') {
      this.matchTypes(pattern.elem, concrete.elem, typeParams, inferred)
      return
    }
    if (pattern.kind === 'tuple' && concrete.kind === 'tuple') {
      for (let i = 0; i < pattern.elements.length && i < concrete.elements.length; i++) {
        this.matchTypes(pattern.elements[i], concrete.elements[i], typeParams, inferred)
      }
    }
  }

  /** Infer the type of a HIR expression (best-effort, for type inference). */
  private inferExprType(expr: HIRExpr, ctx: RewriteCtx): TypeNode | null {
    switch (expr.kind) {
      case 'int_lit':    return { kind: 'named', name: 'int' }
      case 'float_lit':  return { kind: 'named', name: 'fixed' }
      case 'bool_lit':   return { kind: 'named', name: 'bool' }
      case 'str_lit':    return { kind: 'named', name: 'string' }
      case 'byte_lit':   return { kind: 'named', name: 'byte' }
      case 'short_lit':  return { kind: 'named', name: 'short' }
      case 'long_lit':   return { kind: 'named', name: 'long' }
      case 'double_lit': return { kind: 'named', name: 'double' }
      case 'ident':      return ctx.varTypes.get(expr.name) ?? null
      case 'unary':
        // unary minus/not preserves the operand's type
        return this.inferExprType(expr.operand, ctx)
      case 'binary': {
        // For arithmetic, use the left operand's type
        const lt = this.inferExprType(expr.left, ctx)
        if (lt) return lt
        return this.inferExprType(expr.right, ctx)
      }
      default: return null
    }
  }
}
