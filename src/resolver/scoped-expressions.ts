import type { Expr } from '../ast/types'

/** Traverse source expressions with lexical value bindings. Array blocks are
 * visited in declaration order; branch/lambda/loop bindings do not escape.
 */
export function visitScopedExpressions(
  value: unknown,
  visit: (expression: Expr, values: ReadonlySet<string>) => void,
  values: Set<string> = new Set(),
): void {
  if (Array.isArray(value)) {
    for (const item of value) visitScopedExpressions(item, visit, values)
    return
  }
  if (!value || typeof value !== 'object') return
  const node = value as Record<string, any>
  const walk = (child: unknown, scope = values) => visitScopedExpressions(child, visit, scope)
  if (node.kind === 'let' || node.kind === 'const_decl' || node.kind === 'let_destruct') {
    walk(node.init ?? node.value)
    for (const name of node.names ?? [node.name]) values.add(name)
    return
  }
  if (node.kind === 'lambda' || (Array.isArray(node.params) && node.body && node.returnType)) {
    if (node.kind === 'lambda') visit(node as Expr, values)
    const scope = new Set(values)
    for (const param of node.params) { walk(param.default, scope); scope.add(param.name) }
    walk(node.body, scope)
    return
  }
  if (node.kind === 'foreach') {
    walk(node.iterable)
    const scope = new Set(values)
    scope.add(node.binding)
    walk(node.body, scope)
    return
  }
  if (node.kind === 'for') {
    const scope = new Set(values)
    walk(node.init, scope); walk(node.cond, scope)
    walk(node.body, new Set(scope)); walk(node.step, scope)
    return
  }
  if (['for_range', 'for_in_array', 'for_each'].includes(node.kind)) {
    walk(node.start); walk(node.end); walk(node.lenExpr); walk(node.array)
    const scope = new Set(values)
    scope.add(node.varName ?? node.binding)
    walk(node.body, scope)
    return
  }
  if (node.kind === 'if_let_some' || node.kind === 'while_let_some') {
    walk(node.init)
    const scope = new Set(values)
    scope.add(node.binding)
    walk(node.then ?? node.body, scope)
    walk(node.else_, new Set(values))
    return
  }
  if (node.kind === 'match') {
    walk(node.expr)
    for (const arm of node.arms) {
      const scope = new Set(values)
      if (arm.pattern.kind === 'PatSome') scope.add(arm.pattern.binding)
      if (arm.pattern.kind === 'PatEnum') for (const name of arm.pattern.bindings) scope.add(name)
      walk(arm.pattern.expr, values)
      walk(arm.body, scope)
    }
    return
  }
  if (typeof node.kind === 'string') visit(node as Expr, values)
  for (const [key, child] of Object.entries(node)) {
    if (key === 'span') continue
    walk(child, ['body', 'then', 'else', 'else_', 'step'].includes(key) ? new Set(values) : values)
  }
}
