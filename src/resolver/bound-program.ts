import type { Expr } from '../ast/types'
import type { PackageSymbolId } from './package-symbols'

/** Project immutable binding decisions into a cloned AST. Consumers choose a
 * semantic or physical callee name; neither reinterprets source import syntax.
 */
export function cloneBoundCalls<T>(
  value: T,
  bindings: ReadonlyMap<Expr, PackageSymbolId>,
  calleeName: (symbol: PackageSymbolId) => string = symbol => symbol,
): T {
  if (Array.isArray(value)) return value.map(item => cloneBoundCalls(item, bindings, calleeName)) as T
  if (value === null || typeof value !== 'object') return value
  const symbol = bindings.get(value as unknown as Expr)
  const clone = Object.create(Object.getPrototypeOf(value)) as Record<PropertyKey, unknown>
  if (symbol) {
    const expression = value as unknown as Extract<Expr, { kind: 'ident' | 'call' | 'static_call' }>
    Object.assign(clone, {
      ...(expression.kind === 'ident' ? { kind: 'ident', name: calleeName(symbol) } : { kind: 'call', fn: calleeName(symbol), args: expression.args.map(argument => cloneBoundCalls(argument, bindings, calleeName)) }),
      symbolId: symbol,
    })
  }
  for (const key of Reflect.ownKeys(value as object)) {
    if (symbol && ['kind', 'name', 'fn', 'type', 'method', 'symbolId', 'args'].includes(String(key))) continue
    const descriptor = Object.getOwnPropertyDescriptor(value as object, key)!
    if ('value' in descriptor) descriptor.value = cloneBoundCalls(descriptor.value, bindings, calleeName)
    Object.defineProperty(clone, key, descriptor)
  }
  return clone as T
}
