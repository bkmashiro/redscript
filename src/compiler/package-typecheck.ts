import type { FnDecl, Program } from '../ast/types'
import { cloneBoundCalls } from '../resolver/bound-program'
import type { DiagnosticError } from '../diagnostics'
import { reachablePackagePaths, type PackageBindingGraph } from '../project/package-graph'
import { TypeChecker } from '../typechecker'
import {
  type ResolvedPackageProgram,
} from '../resolver/package-symbols'

export interface LinkedPackageTypecheckResult {
  readonly errors: readonly DiagnosticError[]
  readonly warnings: readonly string[]
}

function cloneAstValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => cloneAstValue(item)) as T
  if (value === null || typeof value !== 'object') return value
  const clone = Object.create(Object.getPrototypeOf(value)) as object
  for (const key of Reflect.ownKeys(value as object)) {
    const descriptor = Object.getOwnPropertyDescriptor(value as object, key)!
    if ('value' in descriptor) descriptor.value = cloneAstValue(descriptor.value)
    Object.defineProperty(clone, key, descriptor)
  }
  return clone as T
}

function signatureClone(source: FnDecl, name: string): FnDecl {
  const clone = cloneAstValue(source)
  clone.name = name
  clone.body = []
  clone.decorators = []
  clone.isExported = false
  clone.isDeclareOnly = true
  clone.symbolId = name
  return clone
}

function aggregateSemanticProgram(
  linked: ResolvedPackageProgram<PackageBindingGraph>,
  packagePath: string,
): Program {
  const loaded = linked.graph.packages.get(packagePath)!
  const transformed = loaded.programs.map(program =>
    cloneBoundCalls(program, linked.packages.get(packagePath)!.bindings, id => {
      const symbol = linked.symbols.get(id)!
      return symbol.packagePath === packagePath ? symbol.name : id
    }),
  )
  const declarations = transformed.flatMap(program => program.declarations)
  const declaredFunctions = transformed.flatMap(program => program.declaredFunctions ?? [])
  const knownNames = new Set([
    ...declarations.map(declaration => declaration.name),
    ...declaredFunctions.map(declaration => declaration.name),
  ])

  for (const reference of linked.packages.get(packagePath)?.references ?? []) {
    const symbol = linked.symbols.get(reference.symbolId)
    if (!symbol || symbol.packagePath === packagePath || knownNames.has(symbol.id)) continue
    declaredFunctions.push(signatureClone(symbol.declaration, symbol.id))
    knownNames.add(symbol.id)
  }

  return {
    namespace: linked.graph.modulePath,
    packageName: loaded.name,
    globals: transformed.flatMap(program => program.globals),
    declarations,
    declaredFunctions,
    structs: transformed.flatMap(program => program.structs),
    implBlocks: transformed.flatMap(program => program.implBlocks),
    enums: transformed.flatMap(program => program.enums),
    consts: transformed.flatMap(program => program.consts),
    imports: [],
    resourceDeclarations: transformed.flatMap(program => program.resourceDeclarations ?? []),
    interfaces: transformed.flatMap(program => program.interfaces),
    isLibrary: false,
  }
}

function compareDiagnostics(left: DiagnosticError, right: DiagnosticError): number {
  return (left.location.file ?? '').localeCompare(right.location.file ?? '')
    || left.location.line - right.location.line
    || left.location.col - right.location.col
    || left.message.localeCompare(right.message)
}

/**
 * Type-checks the immutable linked package program using canonical symbol IDs.
 * This is a frontend preflight: it performs no target layout, lowering, or emission.
 */
export function typecheckResolvedPackageProgram(
  linked: ResolvedPackageProgram<PackageBindingGraph>,
): LinkedPackageTypecheckResult {
  const errors: DiagnosticError[] = []
  const warnings: string[] = []
  const reachable = reachablePackagePaths(linked.graph)
  for (const packageId of linked.graph.topologicalOrder) {
    if (!reachable.has(packageId.path)) continue
    const program = aggregateSemanticProgram(linked, packageId.path)
    const sourceFile = linked.graph.packages.get(packageId.path)?.sourceFiles?.[0]
    const checker = new TypeChecker('', sourceFile?.absolutePath)
    errors.push(...checker.check(program))
    warnings.push(...checker.getWarnings())
  }
  return Object.freeze({
    errors: Object.freeze(errors.sort(compareDiagnostics)),
    warnings: Object.freeze(warnings.sort()),
  })
}
