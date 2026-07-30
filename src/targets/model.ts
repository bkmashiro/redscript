import type { Span } from '../ast/types'
import type { BuildTarget, BuildTargetKind } from '../project/model'
import type { PackageSymbolId, ResolvedPackageProgram } from '../resolver/package-symbols'

export type TargetCapability =
  | 'lifecycle-hooks'
  | 'scheduled-execution'
  | 'resource-artifacts'
  | 'resource-references'
  | 'function-artifacts'
  | 'function-tags'
  | 'event-runtime'
  | 'runtime-wrappers'
  | 'load-dependencies'
  | 'recursive-calls'
  | 'generated-helper-functions'
  | 'persistent-state'
  | 'opaque-commands'
  | 'dynamic-dispatch'

export interface TargetProfile {
  readonly kind: BuildTargetKind
  readonly capabilities: readonly TargetCapability[]
}

export interface CapabilityRequirement {
  readonly capability: TargetCapability
  readonly origin: string
  readonly symbolId?: PackageSymbolId
  readonly span?: Span
  readonly callChain: readonly PackageSymbolId[]
}

export interface SemanticTargetPlan {
  readonly target: BuildTarget
  readonly profile: TargetProfile
  readonly linked: ResolvedPackageProgram
  readonly entry: PackageSymbolId
  readonly roots: readonly PackageSymbolId[]
  readonly reachableSymbols: readonly PackageSymbolId[]
  readonly callGraph: ReadonlyMap<PackageSymbolId, readonly PackageSymbolId[]>
  readonly requirements: readonly CapabilityRequirement[]
}

const DATAPACK_CAPABILITIES: readonly TargetCapability[] = Object.freeze([
  'lifecycle-hooks',
  'scheduled-execution',
  'resource-artifacts',
  'resource-references',
  'function-artifacts',
  'function-tags',
  'recursive-calls',
  'generated-helper-functions',
  'persistent-state',
  'opaque-commands',
  'dynamic-dispatch',
])

const COMMANDS_CAPABILITIES: readonly TargetCapability[] = Object.freeze([
  'resource-references',
  'persistent-state',
  'opaque-commands',
])

const PROFILES: Readonly<Record<BuildTargetKind, TargetProfile>> = Object.freeze({
  datapack: Object.freeze({ kind: 'datapack', capabilities: DATAPACK_CAPABILITIES }),
  commands: Object.freeze({ kind: 'commands', capabilities: COMMANDS_CAPABILITIES }),
})

export function getTargetProfile(kind: BuildTargetKind): TargetProfile {
  return PROFILES[kind]
}

export function targetSupports(profile: TargetProfile, capability: TargetCapability): boolean {
  return profile.capabilities.includes(capability)
}
