import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

import { parseProjectDependencyManifest, ProjectManifestError } from './manifest'
import { discoverProjectAssets } from './assets'
import type { LoadedProject } from './model'

export interface ModuleSourceFile {
  readonly sourceRoot: string
  readonly absolutePath: string
  readonly projectRelativePath: string
}

export interface LoadedProjectModule {
  readonly modulePath: string
  readonly project: LoadedProject
  readonly sourceFiles: readonly ModuleSourceFile[]
  readonly contentHash: string
}

export interface ProjectModuleGraph {
  readonly rootModulePath: string
  readonly modules: ReadonlyMap<string, LoadedProjectModule>
  /** Dependencies precede importers; unrelated modules are path-sorted. */
  readonly topologicalOrder: readonly string[]
  /** Location-independent aggregate of every non-root module's identity and content. */
  readonly dependencyHash: string
}

const IGNORED_DIRECTORIES = new Set(['.git', '.hg', '.svn', 'node_modules'])

function isInside(rootDir: string, candidate: string): boolean {
  const relative = path.relative(rootDir, candidate)
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
}

function canonicalSourceRoots(project: LoadedProject): string[] {
  const roots = project.sourceRoots
    .map(sourceRoot => fs.existsSync(sourceRoot) ? fs.realpathSync(sourceRoot) : path.resolve(sourceRoot))
    .sort()

  for (let index = 0; index < roots.length; index++) {
    for (let other = index + 1; other < roots.length; other++) {
      if (isInside(roots[index], roots[other]) || isInside(roots[other], roots[index])) {
        throw new ProjectManifestError(
          project.manifestPath,
          `Overlapping source roots '${roots[index]}' and '${roots[other]}' make canonical package identity ambiguous`,
        )
      }
    }
  }
  return roots
}

function discoverModuleSources(project: LoadedProject): ModuleSourceFile[] {
  const projectRoot = fs.realpathSync(project.rootDir)
  const discovered = new Map<string, ModuleSourceFile>()

  const visit = (sourceRoot: string, dir: string): void => {
    if (dir !== projectRoot && fs.existsSync(path.join(dir, 'redscript.toml'))) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) continue
        visit(sourceRoot, absolutePath)
        continue
      }
      if (
        !entry.isFile()
        || !entry.name.endsWith('.mcrs')
        || entry.name.endsWith('.test.mcrs')
        || entry.name.endsWith('_test.mcrs')
      ) continue
      const canonicalPath = fs.realpathSync(absolutePath)
      const existing = discovered.get(canonicalPath)
      if (existing && existing.sourceRoot !== sourceRoot) {
        throw new ProjectManifestError(
          project.manifestPath,
          `Source '${canonicalPath}' is owned by multiple source roots`,
        )
      }
      discovered.set(canonicalPath, Object.freeze({
        sourceRoot,
        absolutePath: canonicalPath,
        projectRelativePath: path.relative(projectRoot, canonicalPath).split(path.sep).join('/'),
      }))
    }
  }

  for (const sourceRoot of canonicalSourceRoots(project)) {
    if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) continue
    visit(sourceRoot, sourceRoot)
  }
  return [...discovered.values()].sort((left, right) =>
    left.projectRelativePath.localeCompare(right.projectRelativePath),
  )
}

function hashModule(project: LoadedProject, sourceFiles: readonly ModuleSourceFile[]): string {
  const hash = createHash('sha256')
  hash.update(`module\0${project.manifest.project.modulePath}\0`)
  hash.update(`manifest\0${fs.readFileSync(project.manifestPath)}\0`)
  for (const source of sourceFiles) {
    hash.update(`source\0${source.projectRelativePath}\0`)
    hash.update(fs.readFileSync(source.absolutePath))
    hash.update('\0')
  }
  for (const asset of discoverProjectAssets(project)) {
    hash.update(`asset\0${asset.projectRelativePath}\0`)
    hash.update(fs.readFileSync(asset.absolutePath))
    hash.update('\0')
  }
  return hash.digest('hex')
}

function stableTopologicalOrder(modules: ReadonlyMap<string, LoadedProjectModule>): string[] {
  const indegree = new Map<string, number>()
  const importers = new Map<string, string[]>()
  for (const [modulePath, loaded] of modules) {
    const dependencies = [...loaded.project.dependencies.keys()]
    indegree.set(modulePath, dependencies.length)
    for (const dependency of dependencies) {
      const consumers = importers.get(dependency) ?? []
      consumers.push(modulePath)
      importers.set(dependency, consumers)
    }
  }

  const ready = [...modules.keys()]
    .filter(modulePath => indegree.get(modulePath) === 0)
    .sort((left, right) => left.localeCompare(right))
  const order: string[] = []
  while (ready.length > 0) {
    const modulePath = ready.shift()!
    order.push(modulePath)
    for (const importer of (importers.get(modulePath) ?? []).sort((left, right) => left.localeCompare(right))) {
      const remaining = indegree.get(importer)! - 1
      indegree.set(importer, remaining)
      if (remaining === 0) {
        ready.push(importer)
        ready.sort((left, right) => left.localeCompare(right))
      }
    }
  }
  return order
}

export function loadProjectModuleGraph(rootProject: LoadedProject): ProjectModuleGraph {
  const modules = new Map<string, LoadedProjectModule>()
  const projectsByManifest = new Map<string, LoadedProject>([[rootProject.manifestPath, rootProject]])
  const states = new Map<string, 'visiting' | 'visited'>()
  const stack: string[] = []
  const moduleRoots = new Map<string, string>()
  const usedLockedModules = new Set<string>()
  const usedLockedConstraints = new Map<string, Set<string>>()

  const visit = (project: LoadedProject): void => {
    const modulePath = project.manifest.project.modulePath
    const canonicalRoot = fs.realpathSync(project.rootDir)
    const existingRoot = moduleRoots.get(modulePath)
    if (existingRoot && existingRoot !== canonicalRoot) {
      throw new ProjectManifestError(
        project.manifestPath,
        `Module '${modulePath}' resolves to both '${existingRoot}' and '${canonicalRoot}'`,
      )
    }
    moduleRoots.set(modulePath, canonicalRoot)

    const state = states.get(modulePath)
    if (state === 'visited') return
    if (state === 'visiting') {
      const start = stack.indexOf(modulePath)
      const cycle = [...stack.slice(start), modulePath]
      throw new ProjectManifestError(
        project.manifestPath,
        `Local module dependency cycle detected: ${cycle.join(' → ')}`,
      )
    }

    states.set(modulePath, 'visiting')
    stack.push(modulePath)
    for (const dependency of [...project.dependencies.values()].sort((left, right) =>
      left.modulePath.localeCompare(right.modulePath),
    )) {
      let loaded = projectsByManifest.get(dependency.manifestPath)
      if (!loaded) {
        const isRemote = 'remote' in dependency
        loaded = parseProjectDependencyManifest(
          dependency.manifestPath,
          rootProject,
          !isRemote,
        )
        projectsByManifest.set(dependency.manifestPath, loaded)
      }
      const actualModulePath = loaded.manifest.project.modulePath
      if (actualModulePath !== dependency.modulePath) {
        throw new ProjectManifestError(
          project.manifestPath,
          `Dependency identity mismatch: '${dependency.modulePath}' at '${dependency.rootDir}' declares module '${actualModulePath}', expected '${dependency.modulePath}'`,
        )
      }
      if ('remote' in dependency) {
        usedLockedModules.add(dependency.modulePath)
        const constraints = usedLockedConstraints.get(dependency.modulePath) ?? new Set<string>()
        constraints.add(dependency.remote.constraint)
        usedLockedConstraints.set(dependency.modulePath, constraints)
        const declaredLicense = loaded.manifest.project.license ?? null
        const lockedLicense = dependency.remote.license.declared
        if (declaredLicense !== lockedLicense) {
          throw new ProjectManifestError(
            project.manifestPath,
            `Remote dependency license provenance mismatch for '${dependency.modulePath}': manifest declares '${declaredLicense ?? '<none>'}', lock records '${lockedLicense ?? '<none>'}'`,
          )
        }
      }
      visit(loaded)
    }
    stack.pop()
    states.set(modulePath, 'visited')

    const sourceFiles = discoverModuleSources(project)
    modules.set(modulePath, Object.freeze({
      modulePath,
      project,
      sourceFiles: Object.freeze(sourceFiles),
      contentHash: hashModule(project, sourceFiles),
    }))
  }

  visit(rootProject)
  const unusedLockedModules = (rootProject.dependencyContext?.lock?.dependencies ?? [])
    .map(dependency => dependency.modulePath)
    .filter(modulePath => !usedLockedModules.has(modulePath))
    .sort()
  if (unusedLockedModules.length > 0) {
    throw new ProjectManifestError(
      rootProject.manifestPath,
      `redscript.lock contains dependencies not reachable from the project graph: ${unusedLockedModules.join(', ')}; run 'redscript resolve'`,
    )
  }
  for (const locked of rootProject.dependencyContext?.lock?.dependencies ?? []) {
    const used = [...(usedLockedConstraints.get(locked.modulePath) ?? [])].sort()
    if (
      used.length !== locked.constraints.length
      || used.some((constraint, index) => constraint !== locked.constraints[index])
    ) {
      throw new ProjectManifestError(
        rootProject.manifestPath,
        `Locked constraints for '${locked.modulePath}' do not match the reachable manifest declarations; run 'redscript resolve'`,
      )
    }
  }
  const order = stableTopologicalOrder(modules)
  const dependencyHash = createHash('sha256')
  for (const modulePath of [...modules.keys()].filter(path => path !== rootProject.manifest.project.modulePath).sort()) {
    dependencyHash.update(`${modulePath}\0${modules.get(modulePath)!.contentHash}\0`)
  }

  return Object.freeze({
    rootModulePath: rootProject.manifest.project.modulePath,
    modules,
    topologicalOrder: Object.freeze(order),
    dependencyHash: dependencyHash.digest('hex'),
  })
}
