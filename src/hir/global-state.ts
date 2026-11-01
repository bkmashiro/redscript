import type { TypeNode } from '../ast/types'
import type { HIRModule, HIRFunction, HIRExpr, HIRGlobal, HIRStmt } from './types'
import { visitScopedExpressions } from '../resolver/scoped-expressions'
import { isIntrinsicTimerType } from '../compiler/runtime-types'
import { DiagnosticError } from '../diagnostics'

interface View { path: string; type: TypeNode }

/** Static module state has an address, unlike a copied local struct value.
 * Normalize it before metadata/call-ABI construction using existing HIR ops.
 */
export function lowerGlobalState(module: HIRModule): HIRModule {
  if (!module.globals.length) return module
  const structs = new Map(module.structs.map(struct => [struct.name, struct]))
  const roots = new Map(module.globals.map(global => [global.name, { path: global.name, type: global.type }]))
  const generated: HIRFunction[] = []
  const methods = new Map<string, string>()
  const setters = new Map<string, string>()
  const usedNames = new Set(module.functions.map(fn => fn.name))
  const structFor = (type: TypeNode) => type.kind === 'struct' || type.kind === 'named' ? structs.get(type.name) : undefined
  const fresh = (base: string) => {
    let name = base, suffix = 0
    while (usedNames.has(name)) name = `${base}_${++suffix}`
    usedNames.add(name)
    return name
  }
  const fields = (view: View): View[] => {
    const struct = structFor(view.type)
    if (struct && isIntrinsicTimerType(struct.name, struct.fields.map(field => field.name))) throw new DiagnosticError('LoweringError', `Global '${view.path}' cannot store a compiler-intrinsic Timer; Timer::new() requires a function-local static handle`, struct.span ?? { line: 1, col: 1 })
    return struct ? struct.fields.flatMap(field => fields({ path: `${view.path}.${field.name}`, type: field.type })) : [view]
  }
  const snapshot = (view: View): HIRExpr => {
    const struct = structFor(view.type)
    return struct ? { kind: 'struct_lit', literalType: { kind: 'struct', name: struct.name }, fields: struct.fields.map(field => ({ name: field.name, value: snapshot({ path: `${view.path}.${field.name}`, type: field.type }) })) }
      : { kind: 'ident', name: view.path }
  }
  function transform(fn: HIRFunction, self?: View): HIRFunction {
    const scopes = new Map<object, ReadonlySet<string>>()
    visitScopedExpressions(fn, (node, names) => scopes.set(node, new Set(names)))
    const viewOf = (expr: HIRExpr): View | undefined => {
      if (expr.kind === 'ident') {
        if (self && expr.name === 'self') return self
        return scopes.get(expr)?.has(expr.name) ? undefined : roots.get(expr.name)
      }
      if (expr.kind === 'member') {
        const parent = viewOf(expr.obj)
        const field = parent && structFor(parent.type)?.fields.find(field => field.name === expr.field)
        if (parent && field) return { path: `${parent.path}.${field.name}`, type: field.type }
      }
      return undefined
    }
    const rewrite = (value: any): any => {
      if (Array.isArray(value)) return value.map(rewrite)
      if (!value || typeof value !== 'object') return value
      if (value.kind === 'ident' || value.kind === 'member') {
        const view = viewOf(value)
        if (view && (self || structFor(view.type) || value.kind === 'member')) return snapshot(view)
      }
      if (value.kind === 'member_assign') {
        const parent = viewOf(value.obj)
        const field = parent && structFor(parent.type)?.fields.find(field => field.name === value.field)
        if (parent && field && !structFor(field.type)) return { kind: 'assign', target: `${parent.path}.${field.name}`, value: rewrite(value.value), span: value.span }
      }
      if (value.kind === 'call' && !value.symbolId && value.methodName && value.args[0]) {
        const receiver = viewOf(value.args[0])
        const struct = receiver && structFor(receiver.type)
        const method = struct && module.implBlocks.filter(block => block.typeName === struct.name).flatMap(block => block.methods).find(method => method.name === value.methodName && method.params.some(param => param.name === 'self'))
        if (receiver && method) {
          const key = `${receiver.path}::${method.name}`
          let name = methods.get(key)
          if (!name) {
            name = fresh(`__global/${receiver.path}/${method.name}`)
            methods.set(key, name)
            generated.push(transform({ ...method, name, params: method.params.filter(param => param.name !== 'self'), decorators: [], isLibraryFn: false, isExported: false }, receiver))
          }
          return { ...value, fn: name, symbolId: `global:${key}`, args: value.args.slice(1).map(rewrite), methodName: undefined }
        }
      }
      if (value.kind === 'assign' && !scopes.get(value)?.has(value.target)) {
        const target = value.target === 'self' && self ? self : roots.get(value.target)
        if (target && structFor(target.type)) {
          let name = setters.get(target.path)
          if (!name) {
            name = fresh(`__global/${target.path}/assign`)
            setters.set(target.path, name)
            const body: HIRStmt[] = fields(target).map(field => {
              let expr: HIRExpr = { kind: 'ident', name: 'value' }
              for (const part of field.path.slice(target.path.length + 1).split('.')) expr = { kind: 'member', obj: expr, field: part }
              return { kind: 'expr', expr: { kind: 'assign', target: field.path, value: expr } }
            })
            body.push({ kind: 'return', value: { kind: 'ident', name: 'value' } })
            generated.push({ name, params: [{ name: 'value', type: target.type }], returnType: target.type, decorators: [], body })
          }
          const argument = value.value.kind === 'struct_lit'
            ? { ...value.value, literalType: { kind: 'struct', name: structFor(target.type)!.name } }
            : value.value
          return { kind: 'call', fn: name, symbolId: `global:${target.path}:assign`, args: [rewrite(argument)] }
        }
      }
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key === 'span' ? child : rewrite(child)]))
    }
    return { ...fn, body: rewrite(fn.body) }
  }
  for (const view of roots.values()) fields(view)
  const functions = module.functions.map(fn => transform(fn))
  const implBlocks = module.implBlocks.map(block => ({ ...block, methods: block.methods.map(method => transform(method)) }))
  const globals: HIRGlobal[] = module.globals.flatMap(global => fields({ path: global.name, type: global.type }).map(field => ({ ...global, name: field.path, type: field.type })))
  // Reuse the same assignment normalization for constructors and whole values.
  const initializer = transform({
    name: fresh('__global/init'), params: [], returnType: { kind: 'named', name: 'void' }, decorators: [{ name: 'load' }],
    body: module.globals.map(global => ({ kind: 'expr', expr: { kind: 'assign', target: global.name, value: global.init } })),
  })
  return { ...module, globals, implBlocks, functions: [initializer, ...functions, ...generated] }
}
