import type { Program, Span } from '../ast/types'
import type { SourceFileId } from '../compiler/source-manager'
import type { ProjectModuleGraph } from './module-graph'

export interface PackageId {
  /** Owning manifest module identity. */
  readonly modulePath: string
  /** Path relative to a source root, empty for the module root package. */
  readonly packagePath: string
  /** Canonical semantic package path. */
  readonly path: string
}

export interface PackageSourceFile {
  readonly id: SourceFileId
  readonly absolutePath: string
  readonly text: string
}

export interface PackageImport {
  readonly path: string
  /** Owning module chosen by canonical longest-prefix resolution. */
  readonly modulePath: string
  readonly alias: string
  readonly sourceFile: SourceFileId
  readonly span?: Span
}

/** Binding inputs do not require invented filesystem provenance for virtual code. */
export interface BindingPackage {
  readonly id: PackageId
  readonly name: string
  readonly sourceFiles?: readonly PackageSourceFile[]
  readonly programs: readonly Program[]
  readonly imports: readonly PackageImport[]
}

export interface LoadedPackage extends BindingPackage {
  readonly dir: string
  readonly sourceFiles: readonly PackageSourceFile[]
}

/** Semantic graph consumed by binding. Discovery/resource provenance is separate. */
export interface PackageBindingGraph {
  readonly modulePath: string
  readonly rootPackages: readonly PackageId[]
  readonly packages: ReadonlyMap<string, BindingPackage>
  /** Dependencies precede importers; unrelated packages are path-sorted. */
  readonly topologicalOrder: readonly PackageId[]
}

export interface PackageGraph extends PackageBindingGraph {
  readonly packages: ReadonlyMap<string, LoadedPackage>
  readonly moduleGraph: ProjectModuleGraph
  /** Aggregate dependency content hash for project-level incremental keys. */
  readonly dependencyHash: string
}

export function packageId(modulePath: string, relativePath: string): PackageId {
  const normalizedRelativePath = relativePath.split('\\').join('/').replace(/^\/+|\/+$/g, '')
  return Object.freeze({
    modulePath,
    packagePath: normalizedRelativePath,
    path: normalizedRelativePath ? `${modulePath}/${normalizedRelativePath}` : modulePath,
  })
}

/** Packages rooted by the selected target entry package(s), plus their explicit import closure. */
export function reachablePackagePaths(graph: PackageBindingGraph): ReadonlySet<string> {
  const reachable = new Set<string>()
  const visit = (packagePath: string): void => {
    if (reachable.has(packagePath)) return
    reachable.add(packagePath)
    for (const dependency of graph.packages.get(packagePath)?.imports ?? []) {
      visit(dependency.path)
    }
  }
  for (const root of graph.rootPackages) visit(root.path)
  return reachable
}
