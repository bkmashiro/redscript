import type { Block, Expr, FnDecl, Program, Stmt } from '../ast/types'

interface ScopeEntry {
  id: string
  name: string
}

function copySpan<T extends object>(target: T, source: object): T {
  const descriptor = Object.getOwnPropertyDescriptor(source, 'span')
  if (descriptor) {
    Object.defineProperty(target, 'span', descriptor)
  }
  return target
}

function isConstantBoolean(expr: Expr): boolean | null {
  if (expr.kind === 'bool_lit') {
    return expr.value
  }
  return null
}

function isPureExpr(expr: Expr): boolean {
  switch (expr.kind) {
    case 'int_lit':
    case 'float_lit':
    case 'byte_lit':
    case 'short_lit':
    case 'long_lit':
    case 'double_lit':
    case 'rel_coord':
    case 'local_coord':
    case 'bool_lit':
    case 'str_lit':
    case 'mc_name':
    case 'range_lit':
    case 'selector':
    case 'ident':
    case 'blockpos':
      return true
    case 'str_interp':
      return expr.parts.every(part => typeof part === 'string' || isPureExpr(part))
    case 'f_string':
      return expr.parts.every(part => part.kind === 'text' || isPureExpr(part.expr))
    case 'binary':
      return isPureExpr(expr.left) && isPureExpr(expr.right)
    case 'is_check':
      return isPureExpr(expr.expr)
    case 'unary':
      return isPureExpr(expr.operand)
    case 'member':
      return isPureExpr(expr.obj)
    case 'index':
      return isPureExpr(expr.obj) && isPureExpr(expr.index)
    case 'array_lit':
      return expr.elements.every(isPureExpr)
    case 'struct_lit':
      return expr.fields.every(field => isPureExpr(field.value))
    case 'lambda':
      return true
    case 'assign':
    case 'member_assign':
    case 'call':
    case 'invoke':
    case 'static_call':
      return false
  }
}

export interface DCEWarning {
  message: string
  code: string
  line?: number
  col?: number
  filePath?: string
}

export class DeadCodeEliminator {
  private readonly functionMap = new Map<string, FnDecl>()
  private readonly reachableFunctions = new Set<string>()
  private readonly usedConstants = new Set<string>()
  private readonly localReads = new Set<string>()
  private readonly localDeclIds = new WeakMap<Stmt, string>()
  private localIdCounter = 0
  readonly warnings: DCEWarning[] = []

  eliminate(program: Program): Program {
    this.functionMap.clear()
    this.reachableFunctions.clear()
    this.usedConstants.clear()
    this.localReads.clear()
    this.localIdCounter = 0
    this.warnings.length = 0

    for (const fn of program.declarations) {
      this.functionMap.set(fn.name, fn)
    }

    const entryPoints = this.findEntryPoints(program)
    if (entryPoints.length === 0) {
      for (const fn of program.declarations) {
        this.markReachable(fn.name)
      }
    } else {
      for (const fnName of entryPoints) {
        this.markReachable(fnName)
      }
    }

    for (const global of program.globals) {
      this.collectExprRefs(global.init, [])
    }

    for (const implBlock of program.implBlocks) {
      for (const method of implBlock.methods) {
        this.collectFunctionRefs(method)
      }
    }

    return {
      ...program,
      declarations: program.declarations
        .filter(fn => this.reachableFunctions.has(fn.name))
        .map(fn => this.transformFunction(fn)),
      consts: program.consts.filter(constDecl => this.usedConstants.has(constDecl.name)),
      implBlocks: program.implBlocks.map(implBlock => ({
        ...implBlock,
        methods: implBlock.methods.map(method => this.transformFunction(method)),
      })),
    }
  }

  private findEntryPoints(program: Program): string[] {
    const entries = new Set<string>()

    for (const fn of program.declarations) {
      // All top-level functions are entry points (callable via /function)
      // Exception: functions starting with _ are considered private/internal
      if (!fn.name.startsWith('_')) {
        entries.add(fn.name)
      }

      // Decorated functions are always entry points (even if prefixed with _)
      if (fn.decorators.some(decorator => [
        'tick',
        'load',
        'on',
        'on_trigger',
        'on_advancement',
        'on_craft',
        'on_death',
        'on_login',
        'on_join_team',
        'keep',
      ].includes(decorator.name))) {
        entries.add(fn.name)
      }
    }

    return [...entries]
  }

  private markReachable(fnName: string): void {
    if (this.reachableFunctions.has(fnName)) {
      return
    }

    const fn = this.functionMap.get(fnName)
    if (!fn) {
      return
    }

    this.reachableFunctions.add(fnName)
    this.collectFunctionRefs(fn)

    // @requires("dep") — when fn is reachable, its required dependencies are
    // also pulled into the reachable set so they survive DCE.
    for (const decorator of fn.decorators) {
      if (decorator.name === 'require_on_load') {
        for (const arg of decorator.rawArgs ?? []) {
          if (arg.kind === 'string') {
            this.markReachable(arg.value)
          }
        }
      }
    }
  }

  private collectFunctionRefs(fn: FnDecl): void {
    const scope: ScopeEntry[][] = [fn.params.map(param => ({ id: `param:${fn.name}:${param.name}`, name: param.name }))]
    for (const param of fn.params) {
      if (param.default) {
        this.collectExprRefs(param.default, scope)
      }
    }
    this.collectStmtRefs(fn.body, scope)
  }

  private collectStmtRefs(block: Block, scope: ScopeEntry[][]): void {
    scope.push([])

    for (const stmt of block) {
      this.collectStmtRef(stmt, scope)
    }

    scope.pop()
  }

  private collectStmtRef(stmt: Stmt, scope: ScopeEntry[][]): void {
    switch (stmt.kind) {
      case 'let': {
        this.collectExprRefs(stmt.init, scope)
        const id = `local:${stmt.name}:${this.localIdCounter++}:${(stmt.span?.line ?? 0)}:${(stmt.span?.col ?? 0)}`
        this.localDeclIds.set(stmt, id)
        scope[scope.length - 1].push({ id, name: stmt.name })
        break
      }
      case 'expr':
        this.collectExprRefs(stmt.expr, scope)
        break
      case 'return':
        if (stmt.value) {
          this.collectExprRefs(stmt.value, scope)
        }
        break
      case 'if': {
        this.collectExprRefs(stmt.cond, scope)
        const constant = isConstantBoolean(stmt.cond)
        if (constant === true) {
          this.collectStmtRefs(stmt.then, scope)
        } else if (constant === false) {
          if (stmt.else_) {
            this.collectStmtRefs(stmt.else_, scope)
          }
        } else {
          this.collectStmtRefs(stmt.then, scope)
          if (stmt.else_) {
            this.collectStmtRefs(stmt.else_, scope)
          }
        }
        break
      }
      case 'while':
        this.collectExprRefs(stmt.cond, scope)
        this.collectStmtRefs(stmt.body, scope)
        break
      case 'for':
        scope.push([])
        if (stmt.init) {
          this.collectStmtRef(stmt.init, scope)
        }
        this.collectExprRefs(stmt.cond, scope)
        this.collectExprRefs(stmt.step, scope)
        this.collectStmtRefs(stmt.body, scope)
        scope.pop()
        break
      case 'foreach':
        this.collectExprRefs(stmt.iterable, scope)
        scope.push([{ id: `foreach:${stmt.binding}:${stmt.span?.line ?? 0}:${stmt.span?.col ?? 0}`, name: stmt.binding }])
        this.collectStmtRefs(stmt.body, scope)
        scope.pop()
        break
      case 'for_range':
        this.collectExprRefs(stmt.start, scope)
        this.collectExprRefs(stmt.end, scope)
        scope.push([{ id: `range:${stmt.varName}:${stmt.span?.line ?? 0}:${stmt.span?.col ?? 0}`, name: stmt.varName }])
        this.collectStmtRefs(stmt.body, scope)
        scope.pop()
        break
      case 'match':
        this.collectExprRefs(stmt.expr, scope)
        for (const arm of stmt.arms) {
          if (arm.pattern) {
            this.collectExprRefs(arm.pattern, scope)
          }
          this.collectStmtRefs(arm.body, scope)
        }
        break
      case 'as_block':
      case 'at_block':
      case 'as_at':
      case 'execute':
        this.collectNestedStmtRefs(stmt, scope)
        break
      case 'raw':
      case 'break':
      case 'continue':
        break
    }
  }

  private collectNestedStmtRefs(
    stmt: Extract<Stmt, { kind: 'as_block' | 'at_block' | 'as_at' | 'execute' }>,
    scope: ScopeEntry[][]
  ): void {
    if (stmt.kind === 'execute') {
      for (const sub of stmt.subcommands) {
        if ('varName' in sub && sub.varName) {
          const resolved = this.resolveLocal(sub.varName, scope)
          if (resolved) {
            this.localReads.add(resolved.id)
          }
        }
      }
    }
    this.collectStmtRefs(stmt.body, scope)
  }

  private collectExprRefs(expr: Expr, scope: ScopeEntry[][]): void {
    switch (expr.kind) {
      case 'ident': {
        const resolved = this.resolveLocal(expr.name, scope)
        if (resolved) {
          this.localReads.add(resolved.id)
        } else {
          this.usedConstants.add(expr.name)
        }
        break
      }
      case 'call':
        {
          const resolved = this.resolveLocal(expr.fn, scope)
          if (resolved) {
            this.localReads.add(resolved.id)
          } else if (this.functionMap.has(expr.fn)) {
            this.markReachable(expr.fn)
          }
        }
        for (const arg of expr.args) {
          this.collectExprRefs(arg, scope)
        }
        break
      case 'static_call':
        for (const arg of expr.args) {
          this.collectExprRefs(arg, scope)
        }
        break
      case 'invoke':
        this.collectExprRefs(expr.callee, scope)
        for (const arg of expr.args) {
          this.collectExprRefs(arg, scope)
        }
        break
      case 'member':
        this.collectExprRefs(expr.obj, scope)
        break
      case 'member_assign':
        this.collectExprRefs(expr.obj, scope)
        this.collectExprRefs(expr.value, scope)
        break
      case 'index':
        this.collectExprRefs(expr.obj, scope)
        this.collectExprRefs(expr.index, scope)
        break
      case 'array_lit':
        expr.elements.forEach(element => this.collectExprRefs(element, scope))
        break
      case 'struct_lit':
        expr.fields.forEach(field => this.collectExprRefs(field.value, scope))
        break
      case 'binary':
        this.collectExprRefs(expr.left, scope)
        this.collectExprRefs(expr.right, scope)
        break
      case 'is_check':
        this.collectExprRefs(expr.expr, scope)
        break
      case 'unary':
        this.collectExprRefs(expr.operand, scope)
        break
      case 'assign': {
        this.collectExprRefs(expr.value, scope)
        break
      }
      case 'str_interp':
        expr.parts.forEach(part => {
          if (typeof part !== 'string') {
            this.collectExprRefs(part, scope)
          }
        })
        break
      case 'f_string':
        expr.parts.forEach(part => {
          if (part.kind === 'expr') {
            this.collectExprRefs(part.expr, scope)
          }
        })
        break
      case 'lambda': {
        const lambdaScope: ScopeEntry[][] = [
          ...scope.map(entries => [...entries]),
          expr.params.map(param => ({ id: `lambda:${param.name}:${expr.span?.line ?? 0}:${expr.span?.col ?? 0}`, name: param.name })),
        ]
        if (Array.isArray(expr.body)) {
          this.collectStmtRefs(expr.body, lambdaScope)
        } else {
          this.collectExprRefs(expr.body, lambdaScope)
        }
        break
      }
      case 'blockpos':
      case 'bool_lit':
      case 'byte_lit':
      case 'double_lit':
      case 'float_lit':
      case 'int_lit':
      case 'long_lit':
      case 'mc_name':
      case 'range_lit':
      case 'selector':
      case 'short_lit':
      case 'str_lit':
        break
    }
  }

  private resolveLocal(name: string, scope: ScopeEntry[][]): ScopeEntry | null {
    for (let i = scope.length - 1; i >= 0; i--) {
      for (let j = scope[i].length - 1; j >= 0; j--) {
        if (scope[i][j].name === name) {
          return scope[i][j]
        }
      }
    }
    return null
  }

  private transformFunction(fn: FnDecl): FnDecl {
    const scope: ScopeEntry[][] = [fn.params.map(param => ({ id: `param:${fn.name}:${param.name}`, name: param.name }))]
    const body = this.transformBlock(fn.body, scope)
    return body === fn.body ? fn : copySpan({ ...fn, body }, fn)
  }

  private transformBlock(block: Block, scope: ScopeEntry[][]): Block {
    scope.push([])
    const transformed: Stmt[] = []

    for (const stmt of block) {
      const next = this.transformStmt(stmt, scope)
      transformed.push(...next)
    }

    scope.pop()
    return transformed
  }

  private transformStmt(stmt: Stmt, scope: ScopeEntry[][]): Stmt[] {
    switch (stmt.kind) {
      case 'let': {
        const init = this.transformExpr(stmt.init, scope)
        const id = this.localDeclIds.get(stmt) ?? `local:${stmt.name}:${stmt.span?.line ?? 0}:${stmt.span?.col ?? 0}`
        scope[scope.length - 1].push({ id, name: stmt.name })
        if (this.localReads.has(id)) {
          if (init === stmt.init) {
            return [stmt]
          }
          return [copySpan({ ...stmt, init }, stmt)]
        }
        // Unused variable - emit warning
        this.warnings.push({
          message: `Unused variable '${stmt.name}'`,
          code: 'W_UNUSED_VAR',
          line: stmt.span?.line,
          col: stmt.span?.col,
        })
        if (isPureExpr(init)) {
          return []
        }
        return [copySpan({ kind: 'expr', expr: init }, stmt)]
      }
      case 'expr': {
        const expr = this.transformExpr(stmt.expr, scope)
        if (expr.kind === 'assign') {
          const resolved = this.resolveLocal(expr.target, scope)
          if (resolved && !this.localReads.has(resolved.id)) {
            if (isPureExpr(expr.value)) {
              return []
            }
            return [copySpan({ kind: 'expr', expr: expr.value }, stmt)]
          }
        }
        if (expr === stmt.expr) {
          return [stmt]
        }
        return [copySpan({ ...stmt, expr }, stmt)]
      }
      case 'return': {
        if (!stmt.value) {
          return [stmt]
        }
        const value = this.transformExpr(stmt.value, scope)
        if (value === stmt.value) {
          return [stmt]
        }
        return [copySpan({ ...stmt, value }, stmt)]
      }
      case 'if': {
        const cond = this.transformExpr(stmt.cond, scope)
        const constant = isConstantBoolean(cond)
        if (constant === true) {
          return this.transformBlock(stmt.then, scope)
        }
        if (constant === false) {
          return stmt.else_ ? this.transformBlock(stmt.else_, scope) : []
        }
        const thenBlock = this.transformBlock(stmt.then, scope)
        const elseBlock = stmt.else_ ? this.transformBlock(stmt.else_, scope) : undefined
        if (cond === stmt.cond && thenBlock === stmt.then && elseBlock === stmt.else_) {
          return [stmt]
        }
        return [copySpan({ ...stmt, cond, then: thenBlock, else_: elseBlock }, stmt)]
      }
      case 'while': {
        const cond = this.transformExpr(stmt.cond, scope)
        if (isConstantBoolean(cond) === false) {
          return []
        }
        const body = this.transformBlock(stmt.body, scope)
        return [copySpan({ ...stmt, cond, body }, stmt)]
      }
      case 'for': {
        const forScope: ScopeEntry[][] = [...scope, []]
        const init = stmt.init ? this.transformStmt(stmt.init, forScope)[0] : undefined
        const cond = this.transformExpr(stmt.cond, forScope)
        if (isConstantBoolean(cond) === false) {
          return init ? [init] : []
        }
        const step = this.transformExpr(stmt.step, forScope)
        const body = this.transformBlock(stmt.body, forScope)
        return [copySpan({ ...stmt, init, cond, step, body }, stmt)]
      }
      case 'foreach': {
        const iterable = this.transformExpr(stmt.iterable, scope)
        const foreachScope: ScopeEntry[][] = [...scope, [{ id: `foreach:${stmt.binding}:${stmt.span?.line ?? 0}:${stmt.span?.col ?? 0}`, name: stmt.binding }]]
        const body = this.transformBlock(stmt.body, foreachScope)
        return [copySpan({ ...stmt, iterable, body }, stmt)]
      }
      case 'for_range': {
        const start = this.transformExpr(stmt.start, scope)
        const end = this.transformExpr(stmt.end, scope)
        const rangeScope: ScopeEntry[][] = [...scope, [{ id: `range:${stmt.varName}:${stmt.span?.line ?? 0}:${stmt.span?.col ?? 0}`, name: stmt.varName }]]
        const body = this.transformBlock(stmt.body, rangeScope)
        return [copySpan({ ...stmt, start, end, body }, stmt)]
      }
      case 'match': {
        const expr = this.transformExpr(stmt.expr, scope)
        const arms = stmt.arms.map(arm => ({
          pattern: arm.pattern ? this.transformExpr(arm.pattern, scope) : null,
          body: this.transformBlock(arm.body, scope),
        }))
        return [copySpan({ ...stmt, expr, arms }, stmt)]
      }
      case 'as_block':
        return [copySpan({ ...stmt, body: this.transformBlock(stmt.body, scope) }, stmt)]
      case 'at_block':
        return [copySpan({ ...stmt, body: this.transformBlock(stmt.body, scope) }, stmt)]
      case 'as_at':
        return [copySpan({ ...stmt, body: this.transformBlock(stmt.body, scope) }, stmt)]
      case 'execute':
        return [copySpan({ ...stmt, body: this.transformBlock(stmt.body, scope) }, stmt)]
      case 'raw':
        return [stmt]
      case 'break':
        return [stmt]
      case 'continue':
        return [stmt]
    }
  }

  private transformExpr(expr: Expr, scope: ScopeEntry[][]): Expr {
    switch (expr.kind) {
      case 'call':
        return copySpan({ ...expr, args: expr.args.map(arg => this.transformExpr(arg, scope)) }, expr)
      case 'static_call':
        return copySpan({ ...expr, args: expr.args.map(arg => this.transformExpr(arg, scope)) }, expr)
      case 'invoke':
        return copySpan({
          ...expr,
          callee: this.transformExpr(expr.callee, scope),
          args: expr.args.map(arg => this.transformExpr(arg, scope)),
        }, expr)
      case 'binary':
        return copySpan({
          ...expr,
          left: this.transformExpr(expr.left, scope),
          right: this.transformExpr(expr.right, scope),
        }, expr)
      case 'is_check':
        return copySpan({ ...expr, expr: this.transformExpr(expr.expr, scope) }, expr)
      case 'unary':
        return copySpan({ ...expr, operand: this.transformExpr(expr.operand, scope) }, expr)
      case 'assign':
        return copySpan({ ...expr, value: this.transformExpr(expr.value, scope) }, expr)
      case 'member':
        return copySpan({ ...expr, obj: this.transformExpr(expr.obj, scope) }, expr)
      case 'member_assign':
        return copySpan({
          ...expr,
          obj: this.transformExpr(expr.obj, scope),
          value: this.transformExpr(expr.value, scope),
        }, expr)
      case 'index':
        return copySpan({
          ...expr,
          obj: this.transformExpr(expr.obj, scope),
          index: this.transformExpr(expr.index, scope),
        }, expr)
      case 'array_lit':
        return copySpan({ ...expr, elements: expr.elements.map(element => this.transformExpr(element, scope)) }, expr)
      case 'struct_lit':
        return copySpan({
          ...expr,
          fields: expr.fields.map(field => ({ ...field, value: this.transformExpr(field.value, scope) })),
        }, expr)
      case 'str_interp':
        return copySpan({
          ...expr,
          parts: expr.parts.map(part => typeof part === 'string' ? part : this.transformExpr(part, scope)),
        }, expr)
      case 'f_string':
        return copySpan({
          ...expr,
          parts: expr.parts.map(part => part.kind === 'text' ? part : { kind: 'expr', expr: this.transformExpr(part.expr, scope) }),
        }, expr)
      case 'lambda': {
        const lambdaScope: ScopeEntry[][] = [
          ...scope.map(entries => [...entries]),
          expr.params.map(param => ({ id: `lambda:${param.name}:${expr.span?.line ?? 0}:${expr.span?.col ?? 0}`, name: param.name })),
        ]
        const body = Array.isArray(expr.body)
          ? this.transformBlock(expr.body, lambdaScope)
          : this.transformExpr(expr.body, lambdaScope)
        return copySpan({ ...expr, body }, expr)
      }
      case 'blockpos':
      case 'bool_lit':
      case 'byte_lit':
      case 'double_lit':
      case 'float_lit':
      case 'ident':
      case 'int_lit':
      case 'long_lit':
      case 'mc_name':
      case 'range_lit':
      case 'rel_coord':
      case 'local_coord':
      case 'selector':
      case 'short_lit':
      case 'str_lit':
        return expr
    }
  }
}

export function eliminateDeadCode(
  program: Program,
  sourceRanges?: import('../compile').SourceRange[]
): { program: Program; warnings: DCEWarning[] } {
  const eliminator = new DeadCodeEliminator()
  const result = eliminator.eliminate(program)
  let warnings = eliminator.warnings

  // Resolve combined-source line numbers back to original file + line
  if (sourceRanges && sourceRanges.length > 0) {
    const { resolveSourceLine } = require('../compile') as typeof import('../compile')
    warnings = warnings.map(w => {
      if (w.line == null) return w
      const resolved = resolveSourceLine(w.line, sourceRanges)
      return { ...w, line: resolved.line, filePath: resolved.filePath ?? w.filePath }
    })
  }

  return { program: result, warnings }
}
