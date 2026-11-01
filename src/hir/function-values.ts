import { createHash } from 'crypto'
import { DiagnosticError } from '../diagnostics'
import type { TypeNode } from '../ast/types'
import type { HIRModule, HIRFunction, HIRExpr, HIRStmt } from './types'
import { visitScopedExpressions } from '../resolver/scoped-expressions'

type Signature = Extract<TypeNode, { kind: 'function_type' }>
interface Target { key: string; name: string; type: Signature; id: number }

/** Closed-build function handles, with ordinary typed calls as dispatch targets.
 * No new MIR/LIR call convention or unknown-function escape is introduced.
 */
export function lowerFunctionValues(units: readonly { hir: HIRModule; prefix: string }[]): HIRModule[] {
  const targets = new Map<string, Target>()
  const lambdas = new Map<object, Target>()
  const lifted = units.map(() => [] as HIRFunction[])
  const scopes = new Map<object, ReadonlySet<string>>()
  const used = new Set(units.flatMap(unit => unit.hir.functions.map(fn => fn.name)))
  const fresh = (base: string) => {
    let name = base, suffix = 0
    while (used.has(name)) name = `${base}_${++suffix}`
    used.add(name)
    return name
  }
  const add = (key: string, name: string, type: Signature) => {
    const target = targets.get(key) ?? { key, name, type, id: 0 }
    targets.set(key, target)
    return target
  }
  for (const [index, unit] of units.entries()) {
    const functions = [...unit.hir.functions, ...unit.hir.implBlocks.flatMap(block => block.methods)]
    for (const fn of functions) visitScopedExpressions(fn, (expr, names) => scopes.set(expr, new Set(names)))
    let ordinal = 0
    for (const fn of functions) visitScopedExpressions(fn, raw => {
      const expr = raw as unknown as HIRExpr
      if (expr.kind === 'ident' && expr.symbolId && expr.functionType?.kind === 'function_type') {
        add(expr.symbolId, expr.name, expr.functionType)
      }
      if (expr.kind !== 'lambda') return
      const captures = new Set<string>()
      const outer = scopes.get(expr) ?? new Set<string>()
      visitScopedExpressions(expr, (rawInner, names) => {
        const inner = rawInner as unknown as HIRExpr
        if (inner.kind === 'ident' && outer.has(inner.name) && !names.has(inner.name)) captures.add(inner.name)
        if (inner.kind === 'call' && !inner.symbolId && outer.has(inner.fn) && !names.has(inner.fn)) captures.add(inner.fn)
      })
      for (const param of expr.params) captures.delete(param.name)
      if (captures.size) throw new DiagnosticError('LoweringError', `Capturing lambda is not supported by the function-value ABI: ${[...captures].sort().join(', ')}`, expr.span ?? { line: 1, col: 1 })
      if (!expr.returnType || expr.params.some(param => !param.type)) throw new DiagnosticError('LoweringError', 'Lambda callable type was not resolved before function-value lowering', expr.span ?? { line: 1, col: 1 })
      const params = expr.params.map(param => ({ name: param.name, type: param.type! }))
      const type: Signature = { kind: 'function_type', params: params.map(param => param.type), return: expr.returnType }
      const name = fresh(`${unit.prefix ? unit.prefix + '/' : ''}__lambda/${ordinal++}`)
      const target = add(`lambda:${name}`, name, type)
      lambdas.set(expr, target)
      lifted[index].push({ name, symbolId: target.key, params, returnType: type.return, decorators: [], body: Array.isArray(expr.body) ? expr.body : [{ kind: 'return', value: expr.body }], isLibraryFn: true, span: expr.span, sourceFile: fn.sourceFile })
    })
  }
  for (const [index, target] of [...targets.values()].sort((a, b) => a.key.localeCompare(b.key)).entries()) target.id = index + 1
  const signatureKey = (type: Signature) => JSON.stringify(type)
  return units.map((unit, index) => {
    const dispatchers = new Map<string, HIRFunction>()
    const dispatch = (type: Signature): string => {
      const key = signatureKey(type)
      const found = dispatchers.get(key)
      if (found) return found.name
      const hash = createHash('sha256').update(key).digest('hex').slice(0, 12)
      const name = fresh(`${unit.prefix ? unit.prefix + '/' : ''}__fn_dispatch/${hash}`)
      const params = [{ name: '__handle', type: { kind: 'named', name: 'int' } as TypeNode }, ...type.params.map((type, i) => ({ name: `argument_${i}`, type }))]
      const body: HIRStmt[] = []
      for (const target of targets.values()) {
        if (signatureKey(target.type) !== key) continue
        const call: HIRExpr = { kind: 'call', fn: target.name, symbolId: target.key, args: type.params.map((_, i) => ({ kind: 'ident', name: `argument_${i}` })) }
        const action: HIRStmt[] = type.return.kind === 'named' && type.return.name === 'void'
          ? [{ kind: 'expr', expr: call }, { kind: 'return' }]
          : [{ kind: 'return', value: call }]
        body.push({ kind: 'if', cond: { kind: 'binary', op: '==', left: { kind: 'ident', name: '__handle' }, right: { kind: 'int_lit', value: target.id } }, then: action })
      }
      // Valid handles come only from typed function references/lambdas in this
      // build. An externally corrupted handle fails explicitly, never calls f:0.
      body.push({ kind: 'raw', cmd: 'tellraw @a {"text":"Invalid function value","color":"red"}' }, { kind: 'raw', cmd: 'return fail' })
      dispatchers.set(key, { name, symbolId: `dispatch:${unit.prefix}:${hash}`, params, returnType: type.return, decorators: [], body, isLibraryFn: true })
      return name
    }
    const staticCallback = (expr: HIRExpr): HIRExpr => {
      if (expr.kind === 'lambda') return { ...expr, body: rewrite(expr.body) }
      const target = expr.kind === 'ident' && expr.symbolId ? targets.get(expr.symbolId) : undefined
      if (!target) throw new DiagnosticError('LoweringError', 'Scheduling requires a statically known function reference', expr.span ?? { line: 1, col: 1 })
      return { kind: 'lambda', params: [], returnType: { kind: 'named', name: 'void' }, body: [{ kind: 'expr', expr: { kind: 'call', fn: target.name, symbolId: target.key, args: [] } }] }
    }
    const rewrite = (value: any): any => {
      if (Array.isArray(value)) return value.map(rewrite)
      if (!value || typeof value !== 'object') return value
      if (value.kind === 'lambda') return { kind: 'int_lit', value: lambdas.get(value)!.id, span: value.span }
      if (value.kind === 'ident' && value.symbolId && value.functionType?.kind === 'function_type') {
        return { kind: 'int_lit', value: targets.get(value.symbolId)!.id, span: value.span }
      }
      if ((value.kind === 'call' && !value.symbolId || value.kind === 'invoke') && value.functionType?.kind === 'function_type') {
        return { kind: 'call', fn: dispatch(value.functionType), symbolId: `dispatch:${signatureKey(value.functionType)}`, args: [value.kind === 'call' ? { kind: 'ident', name: value.fn } : rewrite(value.callee), ...value.args.map(rewrite)], span: value.span }
      }
      if (value.kind === 'call' && !value.symbolId && ['setTimeout', 'setInterval'].includes(value.fn)) {
        return { ...value, args: [rewrite(value.args[0]), staticCallback(value.args[1])] }
      }
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, key === 'span' ? child : rewrite(child)]))
    }
    const hir: HIRModule = { ...unit.hir, functions: [...unit.hir.functions, ...lifted[index]].map(fn => ({ ...fn, body: rewrite(fn.body) })), implBlocks: unit.hir.implBlocks.map(block => ({ ...block, methods: block.methods.map(fn => ({ ...fn, body: rewrite(fn.body) })) })) }
    hir.functions.push(...dispatchers.values())
    return hir
  })
}
