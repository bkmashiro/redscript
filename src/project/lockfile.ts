import * as fs from 'fs'
import { satisfies, valid } from 'semver'

import { normalizeGitSourceUrl, normalizeSemverConstraint, type GitDependencySource } from './dependency-source'
import { isCanonicalModulePath } from './identity'

export const PROJECT_LOCK_SCHEMA_VERSION = 1 as const

export interface LockedLicenseProvenance {
  readonly declared: string | null
  readonly source: 'redscript.toml#project.license'
}

export interface LockedRemoteDependency {
  readonly modulePath: string
  readonly source: GitDependencySource
  readonly constraints: readonly string[]
  readonly version: string
  readonly revision: string
  readonly contentHash: string
  readonly license: LockedLicenseProvenance
}

export interface ProjectLock {
  readonly schemaVersion: typeof PROJECT_LOCK_SCHEMA_VERSION
  readonly dependencies: readonly LockedRemoteDependency[]
}

export class ProjectLockError extends Error {
  readonly lockfilePath: string

  constructor(lockfilePath: string, message: string) {
    super(`${lockfilePath}: ${message}`)
    this.name = 'ProjectLockError'
    this.lockfilePath = lockfilePath
  }
}

const ROOT_KEYS = new Set(['schemaVersion', 'dependencies'])
const DEPENDENCY_KEYS = new Set([
  'modulePath',
  'source',
  'constraints',
  'version',
  'revision',
  'contentHash',
  'license',
])
const SOURCE_KEYS = new Set(['kind', 'url'])
const LICENSE_KEYS = new Set(['declared', 'source'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function requireRecord(value: unknown, label: string, lockfilePath: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ProjectLockError(lockfilePath, `${label} must be an object`)
  return value
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
  lockfilePath: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ProjectLockError(lockfilePath, `Unknown key '${label}.${key}'`)
    }
  }
}

function requireString(value: unknown, label: string, lockfilePath: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ProjectLockError(lockfilePath, `${label} must be a non-empty string`)
  }
  return value
}

function normalizeDependency(
  raw: unknown,
  index: number,
  lockfilePath: string,
): LockedRemoteDependency {
  const label = `dependencies[${index}]`
  const dependency = requireRecord(raw, label, lockfilePath)
  rejectUnknownKeys(dependency, DEPENDENCY_KEYS, label, lockfilePath)

  const modulePath = requireString(dependency.modulePath, `${label}.modulePath`, lockfilePath)
  if (!isCanonicalModulePath(modulePath)) {
    throw new ProjectLockError(lockfilePath, `${label}.modulePath must be canonical`)
  }
  const sourceValue = requireRecord(dependency.source, `${label}.source`, lockfilePath)
  rejectUnknownKeys(sourceValue, SOURCE_KEYS, `${label}.source`, lockfilePath)
  if (sourceValue.kind !== 'git') {
    throw new ProjectLockError(lockfilePath, `${label}.source.kind must be 'git'`)
  }
  const rawUrl = requireString(sourceValue.url, `${label}.source.url`, lockfilePath)
  let url: string
  try {
    url = normalizeGitSourceUrl(rawUrl)
  } catch (error) {
    throw new ProjectLockError(lockfilePath, (error as Error).message)
  }
  if (url !== rawUrl) {
    throw new ProjectLockError(lockfilePath, `${label}.source.url is not canonical; expected '${url}'`)
  }

  if (!Array.isArray(dependency.constraints) || dependency.constraints.length === 0) {
    throw new ProjectLockError(lockfilePath, `${label}.constraints must be a non-empty array`)
  }
  const constraints = dependency.constraints.map((rawConstraint, constraintIndex) => {
    const constraint = requireString(
      rawConstraint,
      `${label}.constraints[${constraintIndex}]`,
      lockfilePath,
    )
    try {
      const canonical = normalizeSemverConstraint(constraint)
      if (canonical !== constraint) {
        throw new ProjectLockError(
          lockfilePath,
          `${label}.constraints[${constraintIndex}] is not canonical; expected '${canonical}'`,
        )
      }
    } catch (error) {
      if (error instanceof ProjectLockError) throw error
      throw new ProjectLockError(lockfilePath, (error as Error).message)
    }
    return constraint
  }).sort()
  if (new Set(constraints).size !== constraints.length) {
    throw new ProjectLockError(lockfilePath, `${label}.constraints must not contain duplicates`)
  }
  const version = requireString(dependency.version, `${label}.version`, lockfilePath)
  const canonicalVersion = valid(version)
  if (!canonicalVersion) {
    throw new ProjectLockError(lockfilePath, `${label}.version must be an exact semantic version`)
  }
  if (canonicalVersion !== version) {
    throw new ProjectLockError(
      lockfilePath,
      `${label}.version is not canonical; expected '${canonicalVersion}'`,
    )
  }
  for (const constraint of constraints) {
    if (!satisfies(version, constraint)) {
      throw new ProjectLockError(
        lockfilePath,
        `${label}.version '${version}' does not satisfy constraint '${constraint}'`,
      )
    }
  }

  const revision = requireString(dependency.revision, `${label}.revision`, lockfilePath)
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(revision)) {
    throw new ProjectLockError(lockfilePath, `${label}.revision must be a lowercase Git commit hash`)
  }
  const contentHash = requireString(dependency.contentHash, `${label}.contentHash`, lockfilePath)
  if (!/^sha256:[a-f0-9]{64}$/.test(contentHash)) {
    throw new ProjectLockError(lockfilePath, `${label}.contentHash must be a sha256:<64 lowercase hex> digest`)
  }

  const licenseValue = requireRecord(dependency.license, `${label}.license`, lockfilePath)
  rejectUnknownKeys(licenseValue, LICENSE_KEYS, `${label}.license`, lockfilePath)
  if (licenseValue.declared !== null && (
    typeof licenseValue.declared !== 'string'
    || licenseValue.declared.trim() === ''
  )) {
    throw new ProjectLockError(lockfilePath, `${label}.license.declared must be a non-empty string or null`)
  }
  if (licenseValue.source !== 'redscript.toml#project.license') {
    throw new ProjectLockError(
      lockfilePath,
      `${label}.license.source must be 'redscript.toml#project.license'`,
    )
  }

  return Object.freeze({
    modulePath,
    source: Object.freeze({ kind: 'git' as const, url }),
    constraints: Object.freeze(constraints),
    version,
    revision,
    contentHash,
    license: Object.freeze({
      declared: licenseValue.declared as string | null,
      source: 'redscript.toml#project.license' as const,
    }),
  })
}

function normalizeProjectLock(raw: unknown, lockfilePath: string): ProjectLock {
  const root = requireRecord(raw, 'lockfile', lockfilePath)
  rejectUnknownKeys(root, ROOT_KEYS, 'lockfile', lockfilePath)
  if (root.schemaVersion !== PROJECT_LOCK_SCHEMA_VERSION) {
    throw new ProjectLockError(
      lockfilePath,
      `Unsupported schemaVersion '${String(root.schemaVersion)}'; expected ${PROJECT_LOCK_SCHEMA_VERSION}`,
    )
  }
  if (!Array.isArray(root.dependencies)) {
    throw new ProjectLockError(lockfilePath, 'lockfile.dependencies must be an array')
  }

  const dependencies = root.dependencies.map((dependency, index) =>
    normalizeDependency(dependency, index, lockfilePath),
  ).sort((left, right) => left.modulePath < right.modulePath ? -1 : left.modulePath > right.modulePath ? 1 : 0)
  const seen = new Set<string>()
  for (const dependency of dependencies) {
    if (seen.has(dependency.modulePath)) {
      throw new ProjectLockError(lockfilePath, `Duplicate locked module '${dependency.modulePath}'`)
    }
    seen.add(dependency.modulePath)
  }
  return Object.freeze({
    schemaVersion: PROJECT_LOCK_SCHEMA_VERSION,
    dependencies: Object.freeze(dependencies),
  })
}

export function parseProjectLock(source: string, lockfilePath: string): ProjectLock {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    throw new ProjectLockError(lockfilePath, `Invalid JSON: ${(error as Error).message}`)
  }
  return normalizeProjectLock(parsed, lockfilePath)
}

export function readProjectLock(lockfilePath: string): ProjectLock {
  let source: string
  try {
    source = fs.readFileSync(lockfilePath, 'utf8')
  } catch (error) {
    throw new ProjectLockError(lockfilePath, `Unable to read lockfile: ${(error as Error).message}`)
  }
  return parseProjectLock(source, lockfilePath)
}

export function serializeProjectLock(lock: ProjectLock): string {
  const normalized = normalizeProjectLock(lock, 'redscript.lock')
  const canonical = {
    schemaVersion: normalized.schemaVersion,
    dependencies: normalized.dependencies.map(dependency => ({
      modulePath: dependency.modulePath,
      source: {
        kind: dependency.source.kind,
        url: dependency.source.url,
      },
      constraints: dependency.constraints,
      version: dependency.version,
      revision: dependency.revision,
      contentHash: dependency.contentHash,
      license: {
        declared: dependency.license.declared,
        source: dependency.license.source,
      },
    })),
  }
  return `${JSON.stringify(canonical, null, 2)}\n`
}
