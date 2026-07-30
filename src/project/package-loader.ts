import * as fs from 'fs'
import * as path from 'path'
import { DiagnosticError } from '../diagnostics'
import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { SourceManager } from '../compiler/source-manager'
import type { Program, Span } from '../ast/types'
import type { BuildTarget, LoadedProject } from './model'
import {
  packageId,
  type LoadedPackage,
  type PackageGraph,
  type PackageId,
  type PackageImport,
  type PackageSourceFile,
} from './package-graph'

export interface LoadPackageGraphOptions {
  sourceManager?: SourceManager
}

interface ParsedSource {
  readonly sourceRoot: string
  readonly dir: string
  readonly file: PackageSourceFile
  readonly program: Program
}

const IGNORED_DIRECTORIES = new Set(['.git', '.hg', '.svn', 'node_modules'])

function packageDiagnostic(message: string, span?: Span, fallbackFile?: string): DiagnosticError {
  return new DiagnosticError('ParseError', message, {
    file: span?.file ?? fallbackFile,
    line: span?.line ?? 1,
    col: span?.col ?? 1,
  })
}

function isTestSource(fileName: string): boolean {
  return fileName.endsWith('.test.mcrs') || fileName.endsWith('_test.mcrs')
}

function discoverSources(rootDir: string, projectRoot: string): string[] {
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) return []
  const discovered: string[] = []

  const visit = (dir: string): void => {
    if (dir !== projectRoot && fs.existsSync(path.join(dir, 'redscript.toml'))) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) continue
        visit(absolutePath)
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.mcrs') || isTestSource(entry.name)) continue
      discovered.push(absolutePath)
    }
  }

  visit(rootDir)
  return discovered
}

function parseSource(sourceManager: SourceManager, sourceRoot: string, filePath: string, namespace: string): ParsedSource {
  const source = sourceManager.readFile(filePath)
  const lexer = new Lexer(source.text, source.filePath)
  const parser = new Parser(lexer.tokenize(), source.text, source.filePath)
  const program = parser.parse(namespace)
  if (parser.parseErrors.length > 0) throw parser.parseErrors[0]
  if (!program.packageName) {
    throw packageDiagnostic(
      `Source '${source.displayName}' must declare package <name>; in strict project mode`,
      undefined,
      source.filePath,
    )
  }
  if (program.moduleName || program.isLibrary) {
    throw packageDiagnostic(
      `Source '${source.displayName}' uses legacy module syntax; strict project packages must use package <name>;`,
      undefined,
      source.filePath,
    )
  }

  return {
    sourceRoot,
    dir: path.dirname(source.filePath!),
    file: Object.freeze({
      id: source.id,
      absolutePath: source.filePath!,
      text: source.text,
    }),
    program,
  }
}

function validateCanonicalImport(
  project: LoadedProject,
  source: ParsedSource,
  packagePath: string,
  span?: Span,
): void {
  if (
    packagePath.startsWith('.') ||
    packagePath.startsWith('/') ||
    packagePath.includes('\\') ||
    packagePath.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
  ) {
    throw packageDiagnostic(
      `Import '${packagePath}' must use a canonical package path, not a relative or filesystem path`,
      span,
      source.file.absolutePath,
    )
  }
  const modulePath = project.manifest.project.modulePath
  if (packagePath !== modulePath && !packagePath.startsWith(`${modulePath}/`)) {
    throw packageDiagnostic(
      `Import '${packagePath}' is outside module '${modulePath}'; local dependencies are not available until P3`,
      span,
      source.file.absolutePath,
    )
  }
}

function targetPackagePath(project: LoadedProject, target: BuildTarget): string {
  const entry = target.entry
  if (!entry) {
    throw new DiagnosticError(
      'ParseError',
      `Target '${target.name}' must declare an entry for package compilation`,
      { file: project.manifestPath, line: 1, col: 1 },
    )
  }
  const separator = entry.lastIndexOf('::')
  if (separator <= 0 || separator === entry.length - 2) {
    throw new DiagnosticError(
      'ParseError',
      `Target '${target.name}' entry '${entry}' must be '<canonical-package-path>::<exported-symbol>'`,
      { file: project.manifestPath, line: 1, col: 1 },
    )
  }
  return entry.slice(0, separator)
}

function selectTarget(project: LoadedProject, target?: BuildTarget | string): BuildTarget {
  if (typeof target === 'object') {
    if (project.targets[target.name] !== target) {
      throw new DiagnosticError(
        'ParseError',
        `Target '${target.name}' does not belong to project '${project.manifest.project.modulePath}'`,
        { file: project.manifestPath, line: 1, col: 1 },
      )
    }
    return target
  }
  const name = target ?? project.defaultTarget
  const selected = name ? project.targets[name] : undefined
  if (!selected) {
    throw new DiagnosticError(
      'ParseError',
      'Project has no default build target',
      { file: project.manifestPath, line: 1, col: 1 },
    )
  }
  return selected
}

function buildTopologicalOrder(packages: ReadonlyMap<string, LoadedPackage>): PackageId[] {
  const state = new Map<string, 'visiting' | 'visited'>()
  const result: PackageId[] = []
  const stack: string[] = []

  const visit = (packagePath: string): void => {
    const currentState = state.get(packagePath)
    if (currentState === 'visited') return
    if (currentState === 'visiting') {
      const cycleStart = stack.indexOf(packagePath)
      const cycle = [...stack.slice(cycleStart), packagePath]
      const source = packages.get(stack[stack.length - 1])
      const importSite = source?.imports.find(entry => entry.path === packagePath)
      throw packageDiagnostic(
        `Package import cycle detected: ${cycle.join(' → ')}`,
        importSite?.span,
      )
    }

    state.set(packagePath, 'visiting')
    stack.push(packagePath)
    const loaded = packages.get(packagePath)
    if (loaded) {
      for (const dependency of [...new Set(loaded.imports.map(entry => entry.path))].sort()) {
        visit(dependency)
      }
    }
    stack.pop()
    state.set(packagePath, 'visited')
    if (loaded) result.push(loaded.id)
  }

  for (const packagePath of [...packages.keys()].sort()) visit(packagePath)
  return result
}

/**
 * Load every strict project source independently, group directory packages, and
 * build the deterministic in-module import graph. This is the only canonical
 * package discovery path shared by compiler sessions and future language tools.
 */
export function loadPackageGraph(
  project: LoadedProject,
  target?: BuildTarget | string,
  options: LoadPackageGraphOptions = {},
): PackageGraph {
  const selectedTarget = selectTarget(project, target)
  const sourceManager = options.sourceManager ?? new SourceManager({ cwd: project.rootDir })
  const parsedByFile = new Map<string, ParsedSource>()

  const canonicalProjectRoot = fs.realpathSync(project.rootDir)
  const canonicalSourceRoots = [...project.sourceRoots]
    .map(sourceRoot => fs.existsSync(sourceRoot) ? fs.realpathSync(sourceRoot) : path.resolve(sourceRoot))
    .sort()
  for (let index = 0; index < canonicalSourceRoots.length; index++) {
    for (let other = index + 1; other < canonicalSourceRoots.length; other++) {
      const relative = path.relative(canonicalSourceRoots[index], canonicalSourceRoots[other])
      if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
        throw packageDiagnostic(
          `Overlapping source roots '${canonicalSourceRoots[index]}' and '${canonicalSourceRoots[other]}' make canonical package identity ambiguous`,
          undefined,
          project.manifestPath,
        )
      }
    }
  }

  for (const canonicalSourceRoot of canonicalSourceRoots) {
    for (const filePath of discoverSources(canonicalSourceRoot, canonicalProjectRoot)) {
      const canonicalFilePath = fs.realpathSync(filePath)
      if (parsedByFile.has(canonicalFilePath)) continue
      parsedByFile.set(
        canonicalFilePath,
        parseSource(sourceManager, canonicalSourceRoot, canonicalFilePath, selectedTarget.namespace),
      )
    }
  }

  const grouped = new Map<string, ParsedSource[]>()
  for (const parsed of parsedByFile.values()) {
    const relativeDir = path.relative(parsed.sourceRoot, parsed.dir)
    if (relativeDir.startsWith(`..${path.sep}`) || path.isAbsolute(relativeDir)) {
      throw packageDiagnostic(`Source '${parsed.file.absolutePath}' escaped source root '${parsed.sourceRoot}'`)
    }
    const id = packageId(project.manifest.project.modulePath, relativeDir)
    const group = grouped.get(id.path) ?? []
    group.push(parsed)
    grouped.set(id.path, group)
  }

  const packages = new Map<string, LoadedPackage>()
  for (const [canonicalPath, sources] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    sources.sort((a, b) => a.file.absolutePath.localeCompare(b.file.absolutePath))
    const first = sources[0]
    const expectedName = first.program.packageName!
    for (const source of sources.slice(1)) {
      if (source.program.packageName !== expectedName) {
        throw packageDiagnostic(
          `Source declares package '${source.program.packageName}' but files in the same directory already declare package '${expectedName}'`,
          source.program.declarations[0]?.span,
          source.file.absolutePath,
        )
      }
    }

    const imports: PackageImport[] = []
    const aliases = new Map<string, string>()
    for (const source of sources) {
      for (const declaration of source.program.imports) {
        if (!declaration.packagePath) {
          throw packageDiagnostic(
            `Import '${declaration.moduleName}' must use a canonical package path in strict project mode`,
            declaration.span,
            source.file.absolutePath,
          )
        }
        validateCanonicalImport(project, source, declaration.packagePath, declaration.span)
        const alias = declaration.alias ?? declaration.packagePath.split('/').pop()!
        const previous = aliases.get(alias)
        if (previous && previous !== declaration.packagePath) {
          throw packageDiagnostic(
            `Package import alias '${alias}' refers to both '${previous}' and '${declaration.packagePath}'`,
            declaration.span,
            source.file.absolutePath,
          )
        }
        aliases.set(alias, declaration.packagePath)
        imports.push(Object.freeze({
          path: declaration.packagePath,
          alias,
          sourceFile: source.file.id,
          span: declaration.span,
        }))
      }
    }

    const modulePath = project.manifest.project.modulePath
    const relativePath = canonicalPath === modulePath
      ? ''
      : canonicalPath.slice(modulePath.length + 1)
    packages.set(canonicalPath, Object.freeze({
      id: packageId(modulePath, relativePath),
      name: expectedName,
      dir: first.dir,
      sourceFiles: Object.freeze(sources.map(source => source.file)),
      programs: Object.freeze(sources.map(source => source.program)),
      imports: Object.freeze(imports),
    }))
  }

  for (const loaded of packages.values()) {
    for (const dependency of loaded.imports) {
      if (!packages.has(dependency.path)) {
        throw packageDiagnostic(
          `Package '${dependency.path}' not found (imported by '${loaded.id.path}')`,
          dependency.span,
        )
      }
    }
  }

  const rootPath = targetPackagePath(project, selectedTarget)
  const root = packages.get(rootPath)
  if (!root) {
    throw new DiagnosticError(
      'ParseError',
      `Target '${selectedTarget.name}' entry package '${rootPath}' was not found in configured source roots`,
      { file: project.manifestPath, line: 1, col: 1 },
    )
  }

  return Object.freeze({
    modulePath: project.manifest.project.modulePath,
    rootPackages: Object.freeze([root.id]),
    packages,
    topologicalOrder: Object.freeze(buildTopologicalOrder(packages)),
  })
}
