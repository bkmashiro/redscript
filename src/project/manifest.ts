import * as fs from 'fs'
import * as path from 'path'
import { parse, TomlError } from 'smol-toml'

import { discoverProjectManifest } from './discovery'
import {
  BuildTarget,
  BuildTargetKind,
  LoadedProject,
} from './model'

interface Table {
  [key: string]: unknown
}

export class ProjectManifestError extends Error {
  readonly manifestPath: string
  readonly line?: number
  readonly column?: number
  readonly key?: string

  constructor(
    manifestPath: string,
    message: string,
    options: { line?: number; column?: number; key?: string } = {},
  ) {
    const location = options.line == null
      ? manifestPath
      : `${manifestPath}:${options.line}:${options.column ?? 1}`
    super(`${location}: ${message}`)
    this.name = 'ProjectManifestError'
    this.manifestPath = manifestPath
    this.line = options.line
    this.column = options.column
    this.key = options.key
  }
}

const TOP_LEVEL_KEYS = ['project', 'compiler', 'output', 'assets', 'dependencies', 'target']
const PROJECT_KEYS = ['name', 'module', 'namespace', 'mc-version', 'description', 'source-roots']
const COMPILER_KEYS = ['optimization', 'include-dirs', 'no-dce']
const OUTPUT_KEYS = ['dir']
const ASSET_KEYS = ['roots', 'include']
const TARGET_KEYS = ['kind', 'entry', 'out', 'default', 'namespace', 'mc-version']
const DEPENDENCY_KEYS = ['path']

function isTable(value: unknown): value is Table {
  return value != null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
}

function lineForKey(source: string, key: string): { line: number; column: number } | undefined {
  const leaf = key.split('.').at(-1) ?? key
  const pattern = new RegExp(`^\\s*${leaf.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=`)
  const lines = source.split('\n')
  for (let index = 0; index < lines.length; index++) {
    const match = pattern.exec(lines[index])
    if (match) {
      const column = lines[index].indexOf(leaf) + 1
      return { line: index + 1, column: Math.max(1, column) }
    }
  }
  return undefined
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let i = 1; i <= left.length; i++) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= right.length; j++) {
      const above = previous[j]
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (left[i - 1] === right[j - 1] ? 0 : 1),
      )
      diagonal = above
    }
  }
  return previous[right.length]
}

function nearestKey(key: string, allowed: string[]): string | undefined {
  let best: { key: string; distance: number } | undefined
  for (const candidate of allowed) {
    const distance = editDistance(key, candidate)
    if (!best || distance < best.distance) best = { key: candidate, distance }
  }
  return best && best.distance <= Math.max(2, Math.floor(key.length / 3)) ? best.key : undefined
}

function fail(
  manifestPath: string,
  source: string,
  key: string,
  message: string,
): never {
  throw new ProjectManifestError(manifestPath, message, {
    ...lineForKey(source, key),
    key,
  })
}

function tableAt(
  value: unknown,
  qualifiedName: string,
  manifestPath: string,
  source: string,
): Table {
  if (!isTable(value)) {
    fail(manifestPath, source, qualifiedName, `'${qualifiedName}' must be a TOML table`)
  }
  return value
}

function checkKnownKeys(
  table: Table,
  section: string,
  allowed: string[],
  manifestPath: string,
  source: string,
): void {
  for (const key of Object.keys(table)) {
    if (allowed.includes(key)) continue
    const qualified = section ? `${section}.${key}` : key
    const suggestion = nearestKey(key, allowed)
    fail(
      manifestPath,
      source,
      qualified,
      `Unknown key '${qualified}'.${suggestion ? ` Did you mean '${suggestion}'?` : ''}`,
    )
  }
}

function optionalString(
  table: Table,
  key: string,
  section: string,
  manifestPath: string,
  source: string,
): string | undefined {
  const value = table[key]
  if (value == null) return undefined
  if (typeof value !== 'string' || value.trim() === '') {
    fail(manifestPath, source, `${section}.${key}`, `'${section}.${key}' must be a non-empty string`)
  }
  return value
}

function optionalBoolean(
  table: Table,
  key: string,
  section: string,
  manifestPath: string,
  source: string,
): boolean | undefined {
  const value = table[key]
  if (value == null) return undefined
  if (typeof value !== 'boolean') {
    fail(manifestPath, source, `${section}.${key}`, `'${section}.${key}' must be a boolean`)
  }
  return value
}

function optionalStringArray(
  table: Table,
  key: string,
  section: string,
  manifestPath: string,
  source: string,
): string[] | undefined {
  const value = table[key]
  if (value == null) return undefined
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.trim() === '')) {
    fail(manifestPath, source, `${section}.${key}`, `'${section}.${key}' must be an array of non-empty strings`)
  }
  return value as string[]
}

function isInside(rootDir: string, candidate: string): boolean {
  const relative = path.relative(rootDir, candidate)
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
}

function nearestExistingAncestor(candidate: string): string {
  let current = candidate
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current)
    if (parent === current) return current
    current = parent
  }
  return current
}

function resolveInsideRoot(
  rootDir: string,
  value: string,
  qualifiedName: string,
  manifestPath: string,
  source: string,
): string {
  const resolved = path.resolve(rootDir, value)
  if (!isInside(rootDir, resolved)) {
    fail(manifestPath, source, qualifiedName, `'${qualifiedName}' escapes project root: ${value}`)
  }

  // Lexical checks do not catch root/link -> /outside. Resolve the nearest
  // existing ancestor so both existing paths and future outputs below a
  // symlink remain inside the canonical project root.
  const canonicalRoot = fs.realpathSync(rootDir)
  const canonicalAncestor = fs.realpathSync(nearestExistingAncestor(resolved))
  if (!isInside(canonicalRoot, canonicalAncestor)) {
    fail(manifestPath, source, qualifiedName, `'${qualifiedName}' escapes project root through a symlink: ${value}`)
  }
  return resolved
}

function isCanonicalModulePath(modulePath: string): boolean {
  const segments = modulePath.split('/')
  return !(
    modulePath.includes('\\')
    || modulePath.startsWith('/')
    || modulePath.endsWith('/')
    || segments.some(segment =>
      segment === ''
      || segment === '.'
      || segment === '..'
      || !/^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(segment),
    )
    || /\s/.test(modulePath)
  )
}

function parseLocalDependencies(
  root: Table,
  rootDir: string,
  manifestPath: string,
  source: string,
): ReadonlyMap<string, { modulePath: string; rootDir: string; manifestPath: string }> {
  if (root.dependencies == null) return new Map()
  const table = tableAt(root.dependencies, 'dependencies', manifestPath, source)
  const dependencies = new Map<string, { modulePath: string; rootDir: string; manifestPath: string }>()

  for (const [modulePath, rawDependency] of Object.entries(table).sort(([left], [right]) => left.localeCompare(right))) {
    const section = `dependencies.${modulePath}`
    if (!isCanonicalModulePath(modulePath)) {
      fail(manifestPath, source, section, `Dependency key '${modulePath}' must be a canonical module path`)
    }
    const dependency = tableAt(rawDependency, section, manifestPath, source)
    checkKnownKeys(dependency, section, DEPENDENCY_KEYS, manifestPath, source)
    const localPath = optionalString(dependency, 'path', section, manifestPath, source)
    if (!localPath) {
      fail(manifestPath, source, `${section}.path`, `'${section}.path' is required`)
    }
    const resolvedRoot = path.resolve(rootDir, localPath)
    if (!fs.existsSync(resolvedRoot)) {
      fail(manifestPath, source, `${section}.path`, `'${section}.path' does not exist: ${localPath}`)
    }
    if (!fs.statSync(resolvedRoot).isDirectory()) {
      fail(manifestPath, source, `${section}.path`, `'${section}.path' must point to a directory`)
    }
    const canonicalRoot = fs.realpathSync(resolvedRoot)
    const dependencyManifest = path.join(canonicalRoot, 'redscript.toml')
    if (!fs.existsSync(dependencyManifest) || !fs.statSync(dependencyManifest).isFile()) {
      fail(
        manifestPath,
        source,
        `${section}.path`,
        `'${section}.path' must point to a project containing redscript.toml`,
      )
    }
    dependencies.set(modulePath, Object.freeze({
      modulePath,
      rootDir: canonicalRoot,
      manifestPath: fs.realpathSync(dependencyManifest),
    }))
  }

  return dependencies
}

function normalizedLocalModule(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/^[-./]+|[-./]+$/g, '')
  return `local/${normalized || 'project'}`
}

function parseKind(
  value: unknown,
  section: string,
  manifestPath: string,
  source: string,
): BuildTargetKind {
  if (value === 'datapack' || value === 'commands') return value
  fail(
    manifestPath,
    source,
    `${section}.kind`,
    `'${section}.kind' must be one of: datapack, commands`,
  )
}

function defaultOutput(rootDir: string, kind: BuildTargetKind, targetName: string): string {
  return kind === 'datapack'
    ? path.join(rootDir, 'dist')
    : path.join(rootDir, 'dist', `${targetName}.commands.json`)
}

function parseTargets(
  root: Table,
  rootDir: string,
  manifestPath: string,
  source: string,
  namespace: string,
  minecraftVersion: string | undefined,
  legacyOutput: string | undefined,
): { targets: Record<string, BuildTarget>; defaultTarget?: string } {
  const targetTable = root.target
  if (targetTable == null) {
    const outputPath = legacyOutput
      ? resolveInsideRoot(rootDir, legacyOutput, 'output.dir', manifestPath, source)
      : path.join(rootDir, 'dist')
    return {
      targets: {
        default: {
          name: 'default',
          kind: 'datapack',
          namespace,
          minecraftVersion,
          outputPath,
          isDefault: true,
          compatibility: 'legacy-implicit',
        },
      },
      defaultTarget: 'default',
    }
  }

  const targetSections = tableAt(targetTable, 'target', manifestPath, source)
  const targets: Record<string, BuildTarget> = {}
  for (const [name, rawTarget] of Object.entries(targetSections)) {
    if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
      fail(manifestPath, source, `target.${name}`, `Invalid target name '${name}'`)
    }
    const section = `target.${name}`
    const target = tableAt(rawTarget, section, manifestPath, source)
    checkKnownKeys(target, section, TARGET_KEYS, manifestPath, source)
    const kind = parseKind(target.kind, section, manifestPath, source)
    const entry = optionalString(target, 'entry', section, manifestPath, source)
    if (!entry) {
      fail(manifestPath, source, `${section}.entry`, `'${section}.entry' is required for explicit targets`)
    }
    const output = optionalString(target, 'out', section, manifestPath, source)
    const outputPath = output
      ? resolveInsideRoot(rootDir, output, `${section}.out`, manifestPath, source)
      : legacyOutput
        ? resolveInsideRoot(rootDir, legacyOutput, 'output.dir', manifestPath, source)
        : defaultOutput(rootDir, kind, name)
    targets[name] = {
      name,
      kind,
      entry,
      namespace: optionalString(target, 'namespace', section, manifestPath, source) ?? namespace,
      minecraftVersion: optionalString(target, 'mc-version', section, manifestPath, source) ?? minecraftVersion,
      outputPath,
      isDefault: optionalBoolean(target, 'default', section, manifestPath, source) ?? false,
      compatibility: 'explicit',
    }
  }

  if (Object.keys(targets).length === 0) {
    fail(manifestPath, source, 'target', "'target' must declare at least one named target")
  }

  const defaults = Object.values(targets).filter(target => target.isDefault).map(target => target.name)
  if (defaults.length > 1) {
    throw new ProjectManifestError(manifestPath, `Multiple default targets: ${defaults.join(', ')}`)
  }
  const onlyTarget = Object.keys(targets).length === 1 ? Object.keys(targets)[0] : undefined
  return { targets, defaultTarget: defaults[0] ?? onlyTarget }
}

export function parseProjectManifest(manifestPath: string): LoadedProject {
  const absoluteManifestPath = path.resolve(manifestPath)
  const rootDir = path.dirname(absoluteManifestPath)
  let source: string
  try {
    source = fs.readFileSync(absoluteManifestPath, 'utf8')
  } catch (error) {
    throw new ProjectManifestError(absoluteManifestPath, `Unable to read manifest: ${(error as Error).message}`)
  }

  let parsed: unknown
  try {
    parsed = parse(source)
  } catch (error) {
    if (error instanceof TomlError) {
      throw new ProjectManifestError(absoluteManifestPath, error.message, {
        line: Math.max(1, error.line),
        column: Math.max(1, error.column),
      })
    }
    throw new ProjectManifestError(absoluteManifestPath, `Unable to parse TOML: ${(error as Error).message}`)
  }

  const root = tableAt(parsed, '', absoluteManifestPath, source)
  checkKnownKeys(root, '', TOP_LEVEL_KEYS, absoluteManifestPath, source)

  const project = root.project == null
    ? {}
    : tableAt(root.project, 'project', absoluteManifestPath, source)
  checkKnownKeys(project, 'project', PROJECT_KEYS, absoluteManifestPath, source)

  const name = optionalString(project, 'name', 'project', absoluteManifestPath, source)
    ?? path.basename(rootDir)
  const namespace = optionalString(project, 'namespace', 'project', absoluteManifestPath, source)
    ?? name.toLowerCase().replace(/[^a-z0-9_.-]+/g, '_')
  if (!/^[a-z0-9_.-]+$/.test(namespace)) {
    fail(
      absoluteManifestPath,
      source,
      'project.namespace',
      `'project.namespace' must contain only lowercase letters, digits, '_', '-', and '.'`,
    )
  }
  const declaredModulePath = optionalString(project, 'module', 'project', absoluteManifestPath, source)
  if (root.target != null && !declaredModulePath) {
    fail(
      absoluteManifestPath,
      source,
      'project.module',
      "'project.module' is required when explicit targets are declared",
    )
  }
  const modulePath = declaredModulePath ?? normalizedLocalModule(name)
  if (!isCanonicalModulePath(modulePath)) {
    fail(
      absoluteManifestPath,
      source,
      'project.module',
      "'project.module' must be a canonical slash-separated module path",
    )
  }
  const minecraftVersion = optionalString(project, 'mc-version', 'project', absoluteManifestPath, source)
  const sourceRootsRaw = optionalStringArray(project, 'source-roots', 'project', absoluteManifestPath, source) ?? ['.']
  const sourceRoots = sourceRootsRaw.map(value => resolveInsideRoot(
    rootDir,
    value,
    'project.source-roots',
    absoluteManifestPath,
    source,
  ))

  const compiler = root.compiler == null
    ? {}
    : tableAt(root.compiler, 'compiler', absoluteManifestPath, source)
  checkKnownKeys(compiler, 'compiler', COMPILER_KEYS, absoluteManifestPath, source)
  const optimization = compiler.optimization
  if (optimization != null && (!Number.isInteger(optimization) || (optimization as number) < 0)) {
    fail(
      absoluteManifestPath,
      source,
      'compiler.optimization',
      "'compiler.optimization' must be a non-negative integer",
    )
  }
  const includeDirsRaw = optionalStringArray(
    compiler,
    'include-dirs',
    'compiler',
    absoluteManifestPath,
    source,
  ) ?? []

  const output = root.output == null
    ? {}
    : tableAt(root.output, 'output', absoluteManifestPath, source)
  checkKnownKeys(output, 'output', OUTPUT_KEYS, absoluteManifestPath, source)
  const legacyOutput = optionalString(output, 'dir', 'output', absoluteManifestPath, source)

  if (root.assets != null) {
    const assets = tableAt(root.assets, 'assets', absoluteManifestPath, source)
    checkKnownKeys(assets, 'assets', ASSET_KEYS, absoluteManifestPath, source)
    optionalStringArray(assets, 'roots', 'assets', absoluteManifestPath, source)
    optionalStringArray(assets, 'include', 'assets', absoluteManifestPath, source)
  }
  const dependencies = parseLocalDependencies(root, rootDir, absoluteManifestPath, source)

  const { targets, defaultTarget } = parseTargets(
    root,
    rootDir,
    absoluteManifestPath,
    source,
    namespace,
    minecraftVersion,
    legacyOutput,
  )

  return {
    rootDir,
    manifestPath: absoluteManifestPath,
    manifest: {
      project: {
        name,
        modulePath,
        namespace,
        minecraftVersion,
        description: optionalString(project, 'description', 'project', absoluteManifestPath, source),
      },
    },
    sourceRoots,
    dependencies,
    compiler: {
      optimization: optimization as number | undefined,
      includeDirs: includeDirsRaw.map(value => path.resolve(rootDir, value)),
      noDce: optionalBoolean(compiler, 'no-dce', 'compiler', absoluteManifestPath, source),
    },
    targets,
    defaultTarget,
  }
}

export function loadProject(startPath: string): LoadedProject | null {
  const discovered = discoverProjectManifest(startPath)
  return discovered ? parseProjectManifest(discovered.manifestPath) : null
}

export function resolveBuildTarget(project: LoadedProject, targetName?: string): BuildTarget {
  const selectedName = targetName ?? project.defaultTarget
  if (!selectedName) {
    throw new ProjectManifestError(
      project.manifestPath,
      `Project has multiple targets and no default; select one of: ${Object.keys(project.targets).join(', ')}`,
    )
  }
  const target = project.targets[selectedName]
  if (!target) {
    throw new ProjectManifestError(
      project.manifestPath,
      `Unknown target '${selectedName}'. Available targets: ${Object.keys(project.targets).join(', ')}`,
    )
  }
  return target
}
