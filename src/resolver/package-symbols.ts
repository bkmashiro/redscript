import { DiagnosticError } from '../diagnostics'
import type { Expr, FnDecl, Program, Span } from '../ast/types'
import type { LoadedPackage, PackageGraph } from '../project/package-graph'

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
  readonly package: LoadedPackage
  readonly references: readonly PackageReference[]
}

export interface ResolvedPackageProgram {
  readonly graph: PackageGraph
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

function collectFunctionSymbols(graph: PackageGraph): Map<PackageSymbolId, PackageSymbol> {
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

function visitObject(value: unknown, visitExpr: (expr: Expr) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) visitObject(item, visitExpr)
    return
  }
  if (!value || typeof value !== 'object') return
  const record = value as Record<string, unknown>
  if (typeof record.kind === 'string') visitExpr(value as Expr)
  for (const key of Object.keys(record)) {
    if (key === 'span') continue
    visitObject(record[key], visitExpr)
  }
}

function resolveProgramReferences(
  loaded: LoadedPackage,
  program: Program,
  symbols: ReadonlyMap<PackageSymbolId, PackageSymbol>,
): PackageReference[] {
  const aliases = new Map<string, string>()
  for (const declaration of program.imports) {
    if (!declaration.packagePath) continue
    const alias = declaration.alias ?? declaration.packagePath.split('/').pop()!
    aliases.set(alias, declaration.packagePath)
  }

  const references: PackageReference[] = []
  const visitExpr = (expr: Expr): void => {
    if (expr.kind !== 'static_call') return
    const targetPackagePath = aliases.get(expr.type)
    if (!targetPackagePath) return
    const id = symbolId(targetPackagePath, expr.method)
    const target = symbols.get(id)
    if (!target || !target.exported) {
      throw diagnostic(
        `Package '${targetPackagePath}' does not export '${expr.method}' (referenced through alias '${expr.type}')`,
        expr.span,
      )
    }
    references.push(Object.freeze({
      fromPackagePath: loaded.id.path,
      alias: expr.type,
      name: expr.method,
      symbolId: id,
      span: expr.span,
    }))
  }

  visitObject(program, visitExpr)
  return references
}

/** Resolve package-qualified function references without mutating source ASTs. */
export function resolvePackageSymbols(graph: PackageGraph): ResolvedPackageProgram {
  const symbols = collectFunctionSymbols(graph)
  const packages = new Map<string, ResolvedPackage>()

  for (const packagePath of [...graph.packages.keys()].sort()) {
    const loaded = graph.packages.get(packagePath)!
    const references = loaded.programs.flatMap(program =>
      resolveProgramReferences(loaded, program, symbols),
    )
    packages.set(packagePath, Object.freeze({
      package: loaded,
      references: Object.freeze(references),
    }))
  }

  return Object.freeze({ graph, symbols, packages })
}
