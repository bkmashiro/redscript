import { randomBytes } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { rcompare, satisfies } from 'semver'

import { defaultDependencyCacheDir } from './dependency-cache'
import {
  listGitSemanticVersions,
  materializeGitDependency,
  type GitFetchLimits,
  type GitSemanticVersion,
} from './dependency-fetch'
import { loadProject, parseProjectManifest, type ParseProjectManifestOptions } from './manifest'
import {
  PROJECT_LOCK_SCHEMA_VERSION,
  serializeProjectLock,
  type LockedRemoteDependency,
  type ProjectLock,
} from './lockfile'
import type {
  LoadedProject,
  RemoteDependencySpec,
} from './model'

export const DEFAULT_MAX_REMOTE_DEPENDENCIES = 128
export const DEFAULT_RESOLUTION_ITERATIONS = 64

export interface DependencyResolverOptions extends GitFetchLimits {
  readonly cacheDir?: string
  readonly maxDependencies?: number
  readonly maxIterations?: number
}

export interface ResolvedRemoteDependency extends LockedRemoteDependency {
  readonly rootDir: string
  readonly manifestPath: string
}

export interface DependencyResolutionResult {
  readonly project: LoadedProject
  readonly cacheDir: string
  readonly lockfilePath: string
  readonly lock: ProjectLock
  readonly dependencies: readonly ResolvedRemoteDependency[]
}

export class DependencyResolutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DependencyResolutionError'
  }
}

interface Requirement {
  readonly modulePath: string
  readonly source: RemoteDependencySpec['source']
  readonly constraints: Set<string>
  readonly declaredBy: Set<string>
}

interface SelectedRemote {
  readonly requirement: Requirement
  readonly version: GitSemanticVersion
  readonly rootDir: string
  readonly contentHash: string
  readonly project: LoadedProject
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DependencyResolutionError(`${label} must be a positive safe integer`)
  }
}

function projectModule(project: LoadedProject): string {
  return project.manifest.project.modulePath
}

function parseDeclarations(
  manifestPath: string,
  allowLocalDependencies: boolean,
): LoadedProject {
  const options: ParseProjectManifestOptions = {
    dependencyMode: 'declarations',
    allowLocalDependencies,
  }
  return parseProjectManifest(manifestPath, options)
}

function collectWorkspaceProjects(root: LoadedProject): ReadonlyMap<string, LoadedProject> {
  const projects = new Map<string, LoadedProject>()
  const roots = new Map<string, string>()
  const pending: LoadedProject[] = [root]
  while (pending.length > 0) {
    const project = pending.pop()!
    const modulePath = projectModule(project)
    const canonicalRoot = fs.realpathSync(project.rootDir)
    const existingRoot = roots.get(modulePath)
    if (existingRoot) {
      if (existingRoot !== canonicalRoot) {
        throw new DependencyResolutionError(
          `Workspace module '${modulePath}' resolves to both '${existingRoot}' and '${canonicalRoot}'`,
        )
      }
      continue
    }
    roots.set(modulePath, canonicalRoot)
    projects.set(modulePath, project)

    for (const spec of project.dependencySpecs.values()) {
      if (spec.kind !== 'local') continue
      const dependency = parseDeclarations(spec.manifestPath, true)
      const actualModule = projectModule(dependency)
      if (actualModule !== spec.modulePath) {
        throw new DependencyResolutionError(
          `Dependency identity mismatch: manifest declares '${spec.modulePath}', but '${spec.manifestPath}' declares '${actualModule}'`,
        )
      }
      pending.push(dependency)
    }
  }
  return projects
}

function addRequirement(
  requirements: Map<string, Requirement>,
  spec: RemoteDependencySpec,
  declaredBy: string,
  workspaceProjects: ReadonlyMap<string, LoadedProject>,
): void {
  if (workspaceProjects.has(spec.modulePath)) {
    throw new DependencyResolutionError(
      `Module '${spec.modulePath}' is both a workspace module and a remote dependency`,
    )
  }
  const existing = requirements.get(spec.modulePath)
  if (existing) {
    if (existing.source.kind !== spec.source.kind || existing.source.url !== spec.source.url) {
      throw new DependencyResolutionError(
        `Remote module '${spec.modulePath}' is declared with conflicting sources '${existing.source.url}' and '${spec.source.url}'`,
      )
    }
    existing.constraints.add(spec.constraint)
    existing.declaredBy.add(declaredBy)
    return
  }
  requirements.set(spec.modulePath, {
    modulePath: spec.modulePath,
    source: spec.source,
    constraints: new Set([spec.constraint]),
    declaredBy: new Set([declaredBy]),
  })
}

function collectRequirements(
  workspaceProjects: ReadonlyMap<string, LoadedProject>,
  selected: ReadonlyMap<string, SelectedRemote>,
): Map<string, Requirement> {
  const requirements = new Map<string, Requirement>()
  for (const project of workspaceProjects.values()) {
    for (const spec of project.dependencySpecs.values()) {
      if (spec.kind === 'remote') {
        addRequirement(requirements, spec, projectModule(project), workspaceProjects)
      }
    }
  }
  for (const remote of selected.values()) {
    for (const spec of remote.project.dependencySpecs.values()) {
      if (spec.kind === 'local') {
        throw new DependencyResolutionError(
          `Remote module '${projectModule(remote.project)}' declares local dependency '${spec.modulePath}'; path dependencies inside immutable remote sources are not supported`,
        )
      }
      addRequirement(requirements, spec, projectModule(remote.project), workspaceProjects)
    }
  }
  return requirements
}

function canonicalConstraints(requirement: Requirement): readonly string[] {
  return Object.freeze([...requirement.constraints].sort(compareText))
}

function validateResolvedModuleGraph(
  workspaceProjects: ReadonlyMap<string, LoadedProject>,
  selected: ReadonlyMap<string, SelectedRemote>,
): void {
  const projects = new Map<string, LoadedProject>(workspaceProjects)
  for (const [modulePath, remote] of selected) projects.set(modulePath, remote.project)
  const states = new Map<string, 'visiting' | 'visited'>()
  const stack: string[] = []

  const visit = (modulePath: string): void => {
    const state = states.get(modulePath)
    if (state === 'visiting') {
      const cycleStart = stack.indexOf(modulePath)
      const cycle = [...stack.slice(cycleStart), modulePath]
      throw new DependencyResolutionError(`Module dependency cycle detected: ${cycle.join(' -> ')}`)
    }
    if (state === 'visited') return
    const project = projects.get(modulePath)
    if (!project) {
      throw new DependencyResolutionError(`Resolved module graph is missing '${modulePath}'`)
    }
    states.set(modulePath, 'visiting')
    stack.push(modulePath)
    for (const dependency of [...project.dependencySpecs.keys()].sort(compareText)) {
      visit(dependency)
    }
    stack.pop()
    states.set(modulePath, 'visited')
  }

  for (const modulePath of [...projects.keys()].sort(compareText)) visit(modulePath)
}

function resolutionState(
  requirements: ReadonlyMap<string, Requirement>,
  selected: ReadonlyMap<string, SelectedRemote>,
): string {
  return JSON.stringify(
    [...requirements.values()]
      .sort((left, right) => compareText(left.modulePath, right.modulePath))
      .map(requirement => ({
        modulePath: requirement.modulePath,
        source: requirement.source.url,
        constraints: [...requirement.constraints].sort(compareText),
        selected: selected.get(requirement.modulePath)?.version.version ?? null,
      })),
  )
}

function writeLockAtomically(lockfilePath: string, content: string): void {
  const token = `${process.pid}-${Date.now()}-${randomBytes(6).toString('hex')}`
  const tempPath = `${lockfilePath}.tmp-${token}`
  try {
    const descriptor = fs.openSync(tempPath, 'wx', 0o600)
    try {
      fs.writeFileSync(descriptor, content, 'utf8')
      fs.fsyncSync(descriptor)
    } finally {
      fs.closeSync(descriptor)
    }
    fs.renameSync(tempPath, lockfilePath)
  } catch (error) {
    fs.rmSync(tempPath, { force: true })
    throw error
  }
}

export async function resolveProjectDependencies(
  startPath: string,
  options: DependencyResolverOptions = {},
): Promise<DependencyResolutionResult> {
  const configuredCacheDir = options.cacheDir ?? defaultDependencyCacheDir()
  if (!path.isAbsolute(configuredCacheDir)) {
    throw new DependencyResolutionError(`Dependency cache path must be absolute: ${configuredCacheDir}`)
  }
  const cacheDir = path.resolve(configuredCacheDir)
  const maxDependencies = options.maxDependencies ?? DEFAULT_MAX_REMOTE_DEPENDENCIES
  const maxIterations = options.maxIterations ?? DEFAULT_RESOLUTION_ITERATIONS
  assertPositiveInteger(maxDependencies, 'Remote dependency count limit')
  assertPositiveInteger(maxIterations, 'Dependency resolution iteration limit')

  const root = loadProject(startPath, {
    dependencyMode: 'declarations',
    allowLocalDependencies: true,
  })
  if (!root) {
    throw new DependencyResolutionError(`No redscript.toml found from '${path.resolve(startPath)}'`)
  }
  const workspaceProjects = collectWorkspaceProjects(root)
  const versionCache = new Map<string, readonly GitSemanticVersion[]>()
  let selected = new Map<string, SelectedRemote>()
  let previousState: string | undefined
  const seenStates = new Set<string>()

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const requirements = collectRequirements(workspaceProjects, selected)
    if (requirements.size > maxDependencies) {
      throw new DependencyResolutionError(
        `Remote dependency count ${requirements.size} exceeds limit ${maxDependencies}`,
      )
    }

    const next = new Map<string, SelectedRemote>()
    for (const requirement of [...requirements.values()].sort((left, right) =>
      compareText(left.modulePath, right.modulePath),
    )) {
      let versions = versionCache.get(requirement.source.url)
      if (!versions) {
        versions = await listGitSemanticVersions(requirement.source, options)
        versionCache.set(requirement.source.url, versions)
      }
      const candidates = versions
        .filter(candidate => [...requirement.constraints].every(constraint =>
          satisfies(candidate.version, constraint),
        ))
        .sort((left, right) => rcompare(left.version, right.version))
      const version = candidates[0]
      if (!version) {
        const declarations = [...requirement.constraints].sort(compareText).join(', ')
        throw new DependencyResolutionError(
          `No semantic version of '${requirement.modulePath}' from '${requirement.source.url}' satisfies: ${declarations}`,
        )
      }

      const materialized = await materializeGitDependency(
        cacheDir,
        requirement.source,
        version.revision,
        options,
      )
      const manifestPath = path.join(materialized.rootDir, 'redscript.toml')
      if (!fs.existsSync(manifestPath)) {
        throw new DependencyResolutionError(
          `Remote module '${requirement.modulePath}' does not contain redscript.toml at repository root`,
        )
      }
      const project = parseDeclarations(manifestPath, false)
      const actualModule = projectModule(project)
      if (actualModule !== requirement.modulePath) {
        throw new DependencyResolutionError(
          `Remote dependency identity mismatch: lock candidate '${requirement.modulePath}' resolves to manifest module '${actualModule}'`,
        )
      }
      next.set(requirement.modulePath, {
        requirement,
        version,
        rootDir: materialized.rootDir,
        contentHash: materialized.contentHash,
        project,
      })
    }

    const state = resolutionState(requirements, next)
    if (state === previousState) {
      validateResolvedModuleGraph(workspaceProjects, next)
      const dependencies = [...next.values()]
        .sort((left, right) => compareText(
          left.requirement.modulePath,
          right.requirement.modulePath,
        ))
        .map(remote => Object.freeze({
          modulePath: remote.requirement.modulePath,
          source: remote.requirement.source,
          constraints: canonicalConstraints(remote.requirement),
          version: remote.version.version,
          revision: remote.version.revision,
          contentHash: remote.contentHash,
          license: Object.freeze({
            declared: remote.project.manifest.project.license ?? null,
            source: 'redscript.toml#project.license' as const,
          }),
          rootDir: remote.rootDir,
          manifestPath: remote.project.manifestPath,
        }))
      const lock: ProjectLock = Object.freeze({
        schemaVersion: PROJECT_LOCK_SCHEMA_VERSION,
        dependencies: Object.freeze(dependencies.map(dependency => Object.freeze({
          modulePath: dependency.modulePath,
          source: dependency.source,
          constraints: dependency.constraints,
          version: dependency.version,
          revision: dependency.revision,
          contentHash: dependency.contentHash,
          license: dependency.license,
        }))),
      })
      const lockfilePath = path.join(root.rootDir, 'redscript.lock')
      writeLockAtomically(lockfilePath, serializeProjectLock(lock))
      return Object.freeze({
        project: root,
        cacheDir,
        lockfilePath,
        lock,
        dependencies: Object.freeze(dependencies),
      })
    }
    if (seenStates.has(state)) {
      throw new DependencyResolutionError(
        'Remote dependency constraints did not converge to a stable version graph',
      )
    }
    seenStates.add(state)
    previousState = state
    selected = next
  }

  throw new DependencyResolutionError(
    `Remote dependency resolution exceeded ${maxIterations} iterations`,
  )
}
