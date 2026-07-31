import type { ProjectLock } from './lockfile'

export type BuildTargetKind = 'datapack' | 'commands'

export interface ProjectIdentity {
  name: string
  modulePath: string
  namespace: string
  minecraftVersion?: string
  description?: string
  /** SPDX expression or other declared project license text. */
  license?: string
}

export interface CompilerSettings {
  optimization?: number
  includeDirs: string[]
  noDce?: boolean
}

export interface BuildTarget {
  name: string
  kind: BuildTargetKind
  entry?: string
  namespace: string
  minecraftVersion?: string
  /** Maximum total setup/invoke/cleanup commands for a commands artifact. */
  maxCommands?: number
  outputPath: string
  isDefault: boolean
  compatibility: 'explicit' | 'legacy-implicit'
}

export interface ProjectManifest {
  project: ProjectIdentity
}

export interface LocalDependency {
  /** Expected canonical module identity from the dependency table key. */
  readonly modulePath: string
  /** Canonical dependency root selected by the explicit local path. */
  readonly rootDir: string
  readonly manifestPath: string
}

export interface LocalDependencySpec extends LocalDependency {
  readonly kind: 'local'
}

export interface RemoteDependencySpec {
  readonly kind: 'remote'
  readonly modulePath: string
  readonly source: {
    readonly kind: 'git'
    readonly url: string
  }
  readonly constraint: string
}

export type DependencySpec = LocalDependencySpec | RemoteDependencySpec

export interface CachedRemoteDependency extends LocalDependency {
  readonly remote: {
    readonly source: RemoteDependencySpec['source']
    readonly constraint: string
    readonly version: string
    readonly revision: string
    readonly contentHash: string
    readonly license: {
      readonly declared: string | null
      readonly source: 'redscript.toml#project.license'
    }
  }
}

export type ResolvedDependency = LocalDependency | CachedRemoteDependency

export interface ProjectDependencyContext {
  readonly lockfilePath: string
  readonly cacheDir: string
  readonly lock?: ProjectLock
}

export interface LoadedProject {
  rootDir: string
  manifestPath: string
  manifest: ProjectManifest
  sourceRoots: string[]
  dependencies: ReadonlyMap<string, ResolvedDependency>
  /** Direct manifest declarations; remote specs remain immutable until explicit resolution. */
  dependencySpecs: ReadonlyMap<string, DependencySpec>
  /** Root-project lock authority reused while loading every transitive module. */
  dependencyContext?: ProjectDependencyContext
  compiler: CompilerSettings
  targets: Record<string, BuildTarget>
  defaultTarget?: string
}
