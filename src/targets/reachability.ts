import type { Expr, FnDecl, Program } from '../ast/types'
import { makePackageSymbolId, type PackageSymbolId, type ResolvedPackageProgram } from '../resolver/package-symbols'

export interface SemanticFunction {
  readonly id: PackageSymbolId
  readonly packagePath: string
  readonly declaration: FnDecl
  readonly program: Program
  readonly ownerType?: string
}

export interface ReachabilityResult {
  readonly functions: ReadonlyMap<PackageSymbolId, SemanticFunction>
  readonly callGraph: ReadonlyMap<PackageSymbolId, readonly PackageSymbolId[]>
  readonly roots: readonly PackageSymbolId[]
  readonly reachableSymbols: readonly PackageSymbolId[]
  readonly predecessor: ReadonlyMap<PackageSymbolId, PackageSymbolId | null>
}

export interface RecursionCycle {
  readonly symbols: readonly PackageSymbolId[]
  readonly cycle: readonly PackageSymbolId[]
}

function implMethodId(packagePath: string, typeName: string, methodName: string): PackageSymbolId {
  return makePackageSymbolId(packagePath, `${typeName}.${methodName}`)
}

export function collectSemanticFunctions(linked: ResolvedPackageProgram): Map<PackageSymbolId, SemanticFunction> {
  const functions = new Map<PackageSymbolId, SemanticFunction>()
  for (const packagePath of [...linked.graph.packages.keys()].sort()) {
    const loaded = linked.graph.packages.get(packagePath)!
    for (const program of loaded.programs) {
      for (const declaration of program.declarations) {
        const id = makePackageSymbolId(packagePath, declaration.name)
        functions.set(id, Object.freeze({ id, packagePath, declaration, program }))
      }
      for (const impl of program.implBlocks) {
        for (const declaration of impl.methods) {
          const id = implMethodId(packagePath, impl.typeName, declaration.name)
          functions.set(id, Object.freeze({ id, packagePath, declaration, program, ownerType: impl.typeName }))
        }
      }
    }
  }
  return functions
}

export function visitSemanticObjects(value: unknown, visit: (record: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) visitSemanticObjects(item, visit)
    return
  }
  if (!value || typeof value !== 'object') return
  const record = value as Record<string, unknown>
  visit(record)
  for (const key of Object.keys(record)) {
    if (key === 'span') continue
    visitSemanticObjects(record[key], visit)
  }
}

function functionCalls(
  fn: SemanticFunction,
  functions: ReadonlyMap<PackageSymbolId, SemanticFunction>,
): PackageSymbolId[] {
  const calls = new Set<PackageSymbolId>()
  const aliases = new Map<string, string>()
  for (const imported of fn.program.imports) {
    if (!imported.packagePath) continue
    aliases.set(imported.alias ?? imported.packagePath.split('/').pop()!, imported.packagePath)
  }

  const localTypes = new Map<string, Set<string>>()
  const addLocalType = (name: string, typeName: string): void => {
    const existing = localTypes.get(name) ?? new Set<string>()
    existing.add(typeName)
    localTypes.set(name, existing)
  }
  for (const param of fn.declaration.params) {
    if ('name' in param.type && typeof param.type.name === 'string') addLocalType(param.name, param.type.name)
  }
  visitSemanticObjects(fn.declaration.body, record => {
    if (record.kind !== 'let' || typeof record.name !== 'string') return
    const annotated = record.type as { kind?: unknown; name?: unknown } | undefined
    if (typeof annotated?.name === 'string') {
      addLocalType(record.name, annotated.name)
      return
    }
    const init = record.init as { kind?: unknown; typeName?: unknown } | undefined
    if (init?.kind === 'struct_init' && typeof init.typeName === 'string') {
      addLocalType(record.name, init.typeName)
    }
  })

  const methodCandidates = (name: string): SemanticFunction[] => [...functions.values()]
    .filter(candidate => (
      candidate.packagePath === fn.packagePath
      && candidate.ownerType !== undefined
      && candidate.declaration.name === name
    ))
    .sort((left, right) => left.id.localeCompare(right.id))

  const receiverType = (record: Record<string, unknown>): string | undefined => {
    const args = record.args as unknown[] | undefined
    const receiver = args?.[0] as { kind?: unknown; name?: unknown; typeName?: unknown } | undefined
    if (receiver?.kind === 'ident' && typeof receiver.name === 'string') {
      const types = localTypes.get(receiver.name)
      return types?.size === 1 ? [...types][0] : undefined
    }
    if (receiver?.kind === 'struct_init' && typeof receiver.typeName === 'string') return receiver.typeName
    return undefined
  }

  const values = [fn.declaration.params.map(param => param.default), fn.declaration.body]
  visitSemanticObjects(values, record => {
    if (record.kind === 'call' && typeof record.fn === 'string') {
      const explicit = typeof record.symbolId === 'string'
        ? record.symbolId as PackageSymbolId
        : undefined
      const target = explicit && functions.has(explicit)
        ? explicit
        : makePackageSymbolId(fn.packagePath, record.fn)
      if (functions.has(target)) {
        calls.add(target)
        return
      }

      const candidates = methodCandidates(record.fn)
      if (candidates.length === 0) return
      const typeName = receiverType(record)
      const exact = typeName ? candidates.find(candidate => candidate.ownerType === typeName) : undefined
      if (exact) calls.add(exact.id)
      else for (const candidate of candidates) calls.add(candidate.id)
      return
    }

    if (record.kind === 'static_call' && typeof record.type === 'string' && typeof record.method === 'string') {
      const importedPackage = aliases.get(record.type)
      const target = importedPackage
        ? makePackageSymbolId(importedPackage, record.method)
        : implMethodId(fn.packagePath, record.type, record.method)
      if (functions.has(target)) calls.add(target)
    }
  })

  return [...calls].sort()
}

export function buildCallGraph(
  functions: ReadonlyMap<PackageSymbolId, SemanticFunction>,
): Map<PackageSymbolId, readonly PackageSymbolId[]> {
  const graph = new Map<PackageSymbolId, readonly PackageSymbolId[]>()
  for (const id of [...functions.keys()].sort()) {
    graph.set(id, Object.freeze(functionCalls(functions.get(id)!, functions)))
  }
  return graph
}

export function computeReachability(
  linked: ResolvedPackageProgram,
  entry: PackageSymbolId,
  additionalRoots: readonly PackageSymbolId[] = [],
): ReachabilityResult {
  const functions = collectSemanticFunctions(linked)
  const callGraph = buildCallGraph(functions)
  const roots = [entry, ...[...new Set(additionalRoots)].filter(id => id !== entry).sort()]
  const predecessor = new Map<PackageSymbolId, PackageSymbolId | null>()
  const queue: PackageSymbolId[] = []
  for (const root of roots) {
    if (!functions.has(root) || predecessor.has(root)) continue
    predecessor.set(root, null)
    queue.push(root)
  }

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index]
    for (const target of callGraph.get(current) ?? []) {
      if (predecessor.has(target)) continue
      predecessor.set(target, current)
      queue.push(target)
    }
  }

  return Object.freeze({
    functions,
    callGraph,
    roots: Object.freeze(roots.filter(root => functions.has(root))),
    reachableSymbols: Object.freeze([...predecessor.keys()].sort()),
    predecessor,
  })
}

export function shortestCallChain(
  reachability: ReachabilityResult,
  symbolId: PackageSymbolId,
): PackageSymbolId[] {
  if (!reachability.predecessor.has(symbolId)) return []
  const chain: PackageSymbolId[] = []
  let current: PackageSymbolId | null = symbolId
  while (current) {
    chain.push(current)
    current = reachability.predecessor.get(current) ?? null
  }
  return chain.reverse()
}

function cyclePath(
  component: readonly PackageSymbolId[],
  graph: ReadonlyMap<PackageSymbolId, readonly PackageSymbolId[]>,
): PackageSymbolId[] {
  const allowed = new Set(component)
  const start = [...component].sort()[0]
  if ((graph.get(start) ?? []).includes(start)) return [start, start]

  const visit = (current: PackageSymbolId, path: PackageSymbolId[], seen: Set<PackageSymbolId>): PackageSymbolId[] | null => {
    for (const next of graph.get(current) ?? []) {
      if (!allowed.has(next)) continue
      if (next === start) return [...path, start]
      if (seen.has(next)) continue
      const result = visit(next, [...path, next], new Set([...seen, next]))
      if (result) return result
    }
    return null
  }

  return visit(start, [start], new Set([start])) ?? [...component, start]
}

export function findReachableRecursion(reachability: ReachabilityResult): RecursionCycle[] {
  const reachable = new Set(reachability.reachableSymbols)
  let nextIndex = 0
  const index = new Map<PackageSymbolId, number>()
  const lowLink = new Map<PackageSymbolId, number>()
  const stack: PackageSymbolId[] = []
  const onStack = new Set<PackageSymbolId>()
  const components: PackageSymbolId[][] = []

  const connect = (symbol: PackageSymbolId): void => {
    index.set(symbol, nextIndex)
    lowLink.set(symbol, nextIndex)
    nextIndex++
    stack.push(symbol)
    onStack.add(symbol)

    for (const target of reachability.callGraph.get(symbol) ?? []) {
      if (!reachable.has(target)) continue
      if (!index.has(target)) {
        connect(target)
        lowLink.set(symbol, Math.min(lowLink.get(symbol)!, lowLink.get(target)!))
      } else if (onStack.has(target)) {
        lowLink.set(symbol, Math.min(lowLink.get(symbol)!, index.get(target)!))
      }
    }

    if (lowLink.get(symbol) !== index.get(symbol)) return
    const component: PackageSymbolId[] = []
    while (stack.length > 0) {
      const member = stack.pop()!
      onStack.delete(member)
      component.push(member)
      if (member === symbol) break
    }
    const recursive = component.length > 1
      || (reachability.callGraph.get(component[0]) ?? []).includes(component[0])
    if (recursive) components.push(component.sort())
  }

  for (const symbol of [...reachable].sort()) {
    if (!index.has(symbol)) connect(symbol)
  }

  return components
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(symbols => Object.freeze({
      symbols: Object.freeze(symbols),
      cycle: Object.freeze(cyclePath(symbols, reachability.callGraph)),
    }))
}
