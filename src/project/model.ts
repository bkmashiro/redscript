export type BuildTargetKind = 'datapack' | 'commands'

export interface ProjectIdentity {
  name: string
  modulePath: string
  namespace: string
  minecraftVersion?: string
  description?: string
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

export interface LoadedProject {
  rootDir: string
  manifestPath: string
  manifest: ProjectManifest
  sourceRoots: string[]
  dependencies: ReadonlyMap<string, LocalDependency>
  compiler: CompilerSettings
  targets: Record<string, BuildTarget>
  defaultTarget?: string
}
