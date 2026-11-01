import { DiagnosticError } from '../diagnostics'
import type { Expr, FnDecl, Program, Span } from '../ast/types'
import type { BindingPackage, PackageGraph, PackageBindingGraph } from '../project/package-graph'
import { visitScopedExpressions } from './scoped-expressions'
import { isBuiltinFunction } from '../builtins/callables'

declare const packageSymbolIdBrand: unique symbol
export type PackageSymbolId = string & { readonly [packageSymbolIdBrand]: true }

export function makePackageSymbolId(packagePath: string, symbol: string): PackageSymbolId {
  return `${packagePath}::${symbol}` as PackageSymbolId
}

export interface PackageSymbol {
  readonly id: PackageSymbolId
  readonly packagePath: string
  readonly name: string
  readonly kind: 'function'
  readonly exported: boolean
  readonly declaration: FnDecl
  readonly span?: Span
}

export interface PackageReference {
  readonly fromPackagePath: string
  readonly alias: string
  readonly name: string
  readonly symbolId: PackageSymbolId
  readonly span?: Span
}

export interface ResolvedPackage {
  readonly package: BindingPackage
  readonly references: readonly PackageReference[]
  readonly bindings: ReadonlyMap<Expr, PackageSymbolId>
}

export interface ResolvedPackageProgram<Graph extends PackageBindingGraph = PackageGraph> {
  readonly graph: Graph
  readonly symbols: ReadonlyMap<PackageSymbolId, PackageSymbol>
  readonly packages: ReadonlyMap<string, ResolvedPackage>
}

function symbolId(packagePath: string, name: string): PackageSymbolId {
  return makePackageSymbolId(packagePath, name)
}

function diagnostic(message: string, span?: Span): DiagnosticError {
  return new DiagnosticError('TypeError', message, {
    file: span?.file,
    line: span?.line ?? 1,
    col: span?.col ?? 1,
  })
}

function collectFunctionSymbols(graph: PackageBindingGraph): Map<PackageSymbolId, PackageSymbol> {
  const symbols = new Map<PackageSymbolId, PackageSymbol>()
  for (const packagePath of [...graph.packages.keys()].sort()) {
    const loaded = graph.packages.get(packagePath)!
    const localNames = new Map<string, PackageSymbol>()
    for (const program of loaded.programs) {
      for (const declaration of [...program.declarations, ...(program.declaredFunctions ?? [])]) {
        const previous = localNames.get(declaration.name)
        if (previous) {
          throw diagnostic(
            `Duplicate symbol '${declaration.name}' in package '${packagePath}' (first declared at ${previous.span?.file ?? 'unknown source'})`,
            declaration.span,
          )
        }
        const symbol: PackageSymbol = Object.freeze({
          id: symbolId(packagePath, declaration.name),
          packagePath,
          name: declaration.name,
          kind: 'function',
          exported: declaration.isExported === true,
          declaration,
          span: declaration.span,
        })
        localNames.set(declaration.name, symbol)
        symbols.set(symbol.id, symbol)
      }
    }
  }
  return symbols
}

function resolveProgramReferences(
  loaded: BindingPackage,
  program: Program,
  symbols: ReadonlyMap<PackageSymbolId, PackageSymbol>,
  bindings: Map<Expr, PackageSymbolId>,
): PackageReference[] {
  const aliases = new Map<string, string>()
  const importedNames = new Map<string, Set<PackageSymbolId>>()
  const expose = (symbol: PackageSymbol) => {
    const candidates = importedNames.get(symbol.name) ?? new Set<PackageSymbolId>()
    candidates.add(symbol.id)
    importedNames.set(symbol.name, candidates)
  }
  for (const declaration of program.imports) {
    const targetPath = declaration.packagePath
    if (!targetPath) continue
    const alias = declaration.alias ?? targetPath.split('/').pop()!
    if (declaration.symbol && declaration.symbol !== '*') {
      const target = symbols.get(symbolId(targetPath, declaration.symbol))
      if (!target?.exported) throw diagnostic(`Package '${targetPath}' does not export '${declaration.symbol}'`, declaration.span)
      expose(target)
      continue
    }
    const previous = aliases.get(alias)
    if (previous && previous !== targetPath) throw diagnostic(`Import alias '${alias}' refers to conflicting packages`, declaration.span)
    aliases.set(alias, targetPath)
    if (declaration.symbol === '*' || targetPath.startsWith('stdlib/')) {
      for (const target of symbols.values()) if (target.packagePath === targetPath && target.exported) expose(target)
    }
  }

  const localFunctions = new Set(loaded.programs.flatMap(source => [...source.declarations, ...(source.declaredFunctions ?? [])]).map(fn => fn.name))
  const generatedScheduleCalls = new Set(loaded.programs.flatMap(source => source.declarations.filter(fn => fn.decorators.some(decorator => decorator.name === 'schedule')).map(fn => `_schedule_${fn.name}`)))
  const values = new Set(loaded.programs.flatMap(source => [...source.globals, ...source.consts]).map(value => value.name))
  const localTypes = new Set(loaded.programs.flatMap(source => [...source.structs, ...source.enums, ...source.interfaces]).map(type => type.name))
  const references: PackageReference[] = []
  const bind = (expression: Expr, id: PackageSymbolId, alias: string): void => {
    const target = symbols.get(id)!
    bindings.set(expression, id)
    references.push(Object.freeze({ fromPackagePath: loaded.id.path, alias, name: target.name, symbolId: id, span: expression.span }))
  }
  visitScopedExpressions(program, (expression, scope) => {
    if (expression.kind === 'ident' && !scope.has(expression.name) && !values.has(expression.name) && !localTypes.has(expression.name)) {
      const local = symbols.get(symbolId(loaded.id.path, expression.name))
      const candidates = importedNames.get(expression.name)
      if (local) bindings.set(expression, local.id)
      else if (candidates?.size === 1) bind(expression, [...candidates][0], expression.name)
      else if (candidates && candidates.size > 1) throw diagnostic(`Ambiguous imported function reference '${expression.name}'`, expression.span)
      else if ([...symbols.values()].some(symbol => symbol.name === expression.name)) throw diagnostic(`Unknown function reference '${expression.name}'`, expression.span)
    } else if (expression.kind === 'static_call') {
      const targetPath = aliases.get(expression.type)
      if (!targetPath) return
      if (localTypes.has(expression.type)) throw diagnostic(`Import alias '${expression.type}' conflicts with a declared type`, expression.span)
      const id = symbolId(targetPath, expression.method)
      if (!symbols.get(id)?.exported) throw diagnostic(`Package '${targetPath}' does not export '${expression.method}' (referenced through alias '${expression.type}')`, expression.span)
      bind(expression, id, expression.type)
    } else if (expression.kind === 'call' && !expression.methodName && !scope.has(expression.fn)) {
      if (localFunctions.has(expression.fn)) {
        bindings.set(expression, symbolId(loaded.id.path, expression.fn))
        return
      }
      const candidates = importedNames.get(expression.fn)
      if (!candidates) {
        if (generatedScheduleCalls.has(expression.fn)) return
        if (!isBuiltinFunction(expression.fn)) throw diagnostic(`Unknown function '${expression.fn}'. Import or declare it before calling it.`, expression.span)
        return
      }
      if (candidates.size !== 1) throw diagnostic(`Ambiguous imported function '${expression.fn}'; qualify it with its package alias`, expression.span)
      bind(expression, [...candidates][0], expression.fn)
    }
  }, values)
  return references
}

/** Resolve package-qualified function references without mutating source ASTs. */
export function resolvePackageSymbols<Graph extends PackageBindingGraph>(graph: Graph): ResolvedPackageProgram<Graph> {
  const symbols = collectFunctionSymbols(graph)
  const packages = new Map<string, ResolvedPackage>()

  for (const packagePath of [...graph.packages.keys()].sort()) {
    const loaded = graph.packages.get(packagePath)!
    const bindings = new Map<Expr, PackageSymbolId>()
    const references = loaded.programs.flatMap(program =>
      resolveProgramReferences(loaded, program, symbols, bindings),
    )
    packages.set(packagePath, Object.freeze({
      package: loaded,
      references: Object.freeze(references),
      bindings,
    }))
  }

  return Object.freeze({ graph, symbols, packages })
}
