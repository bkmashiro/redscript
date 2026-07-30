import { createHash } from 'crypto'
import { DiagnosticError } from '../diagnostics'
import type { Expr, ImportDecl, Program } from '../ast/types'
import { compileModules, type CompileModulesResult, type ModuleInput } from '../emit/modules'
import { parseMcVersion } from '../types/mc-version'
import type { BuildTarget, LoadedProject } from '../project/model'
import { reachablePackagePaths, type LoadedPackage } from '../project/package-graph'
import {
  makePackageSymbolId,
  type PackageSymbolId,
  type ResolvedPackageProgram,
} from '../resolver/package-symbols'
import { analyzeProjectTarget } from './project-target-analysis'
import type { SourceManager } from './source-manager'

function backendPackagePath(loaded: LoadedPackage, rootModulePath: string): string {
  if (loaded.id.modulePath === rootModulePath) return loaded.id.packagePath || '_root'
  return `_deps/${loaded.id.modulePath}/${loaded.id.packagePath || '_root'}`
}

function packageObjective(packagePath: string): string {
  const digest = createHash('sha256').update(packagePath).digest('hex').slice(0, 10)
  return `__rs_${digest}`
}

function targetEntry(target: BuildTarget): { packagePath: string; symbol: string; id: PackageSymbolId } {
  const entry = target.entry
  const separator = entry?.lastIndexOf('::') ?? -1
  if (!entry || separator <= 0 || separator === entry.length - 2) {
    throw new DiagnosticError(
      'TypeError',
      `Target '${target.name}' entry must be '<canonical-package-path>::<exported-symbol>'`,
      { line: 1, col: 1 },
    )
  }
  const packagePath = entry.slice(0, separator)
  const symbol = entry.slice(separator + 2)
  return { packagePath, symbol, id: makePackageSymbolId(packagePath, symbol) }
}


function cloneForBackend<T>(
  value: T,
  aliases: ReadonlyMap<string, string>,
  backendPaths: ReadonlyMap<string, string>,
): T {
  if (Array.isArray(value)) {
    return value.map(item => cloneForBackend(item, aliases, backendPaths)) as T
  }
  if (value === null || typeof value !== 'object') return value

  const record = value as Record<string, unknown>
  if (record.kind === 'static_call') {
    const expr = value as unknown as Extract<Expr, { kind: 'static_call' }>
    const targetPackagePath = aliases.get(expr.type)
    if (targetPackagePath) {
      const targetBackendPath = backendPaths.get(targetPackagePath)
      if (!targetBackendPath) {
        throw new DiagnosticError(
          'LoweringError',
          `No backend layout exists for imported package '${targetPackagePath}'`,
          { file: expr.span?.file, line: expr.span?.line ?? 1, col: expr.span?.col ?? 1 },
        )
      }
      const clone: Record<string, unknown> = {
        kind: 'call',
        fn: `${targetBackendPath}/${expr.method}`,
        symbolId: makePackageSymbolId(targetPackagePath, expr.method),
        args: expr.args.map(arg => cloneForBackend(arg, aliases, backendPaths)),
      }
      const span = Object.getOwnPropertyDescriptor(value as object, 'span')
      if (span) Object.defineProperty(clone, 'span', span)
      return clone as T
    }
  }

  const clone = Object.create(Object.getPrototypeOf(value)) as object
  for (const key of Reflect.ownKeys(value as object)) {
    const descriptor = Object.getOwnPropertyDescriptor(value as object, key)!
    if ('value' in descriptor) {
      descriptor.value = cloneForBackend(descriptor.value, aliases, backendPaths)
    }
    Object.defineProperty(clone, key, descriptor)
  }
  return clone as T
}

function packageAliases(program: Program): Map<string, string> {
  const aliases = new Map<string, string>()
  for (const imported of program.imports) {
    if (!imported.packagePath) continue
    aliases.set(imported.alias ?? imported.packagePath.split('/').pop()!, imported.packagePath)
  }
  return aliases
}

function legacyImportsForPackage(
  loaded: LoadedPackage,
  linked: ResolvedPackageProgram,
  backendPaths: ReadonlyMap<string, string>,
): ImportDecl[] {
  const resolved = linked.packages.get(loaded.id.path)
  if (!resolved) return []
  const imports = new Map<string, ImportDecl>()
  for (const reference of resolved.references) {
    const symbol = linked.symbols.get(reference.symbolId)!
    const moduleName = backendPaths.get(symbol.packagePath)!
    const key = `${moduleName}::${symbol.name}`
    if (!imports.has(key)) {
      imports.set(key, {
        moduleName,
        symbol: symbol.name,
        span: reference.span,
      })
    }
  }
  return [...imports.values()].sort((a, b) =>
    `${a.moduleName}::${a.symbol}`.localeCompare(`${b.moduleName}::${b.symbol}`),
  )
}

function aggregatePackageProgram(
  loaded: LoadedPackage,
  linked: ResolvedPackageProgram,
  backendPaths: ReadonlyMap<string, string>,
  namespace: string,
): Program {
  const transformed = loaded.programs.map(program => {
    const aliases = packageAliases(program)
    const clone = cloneForBackend(program, aliases, backendPaths)
    for (const declaration of [...clone.declarations, ...(clone.declaredFunctions ?? [])]) {
      declaration.symbolId = makePackageSymbolId(loaded.id.path, declaration.name)
    }
    return clone
  })

  return {
    namespace,
    moduleName: backendPaths.get(loaded.id.path),
    packageName: loaded.name,
    globals: transformed.flatMap(program => program.globals),
    declarations: transformed.flatMap(program => program.declarations),
    declaredFunctions: transformed.flatMap(program => program.declaredFunctions ?? []),
    structs: transformed.flatMap(program => program.structs),
    implBlocks: transformed.flatMap(program => program.implBlocks),
    enums: transformed.flatMap(program => program.enums),
    consts: transformed.flatMap(program => program.consts),
    imports: legacyImportsForPackage(loaded, linked, backendPaths),
    resourceDeclarations: transformed.flatMap(program => program.resourceDeclarations ?? []),
    interfaces: transformed.flatMap(program => program.interfaces),
    isLibrary: false,
  }
}

/**
 * Temporary backend adapter: canonical package loading/resolution remains
 * immutable, then this function projects a linked graph into the proven legacy
 * multi-module datapack backend. The adapter is the only AST-rewrite boundary.
 */
export function compileProjectPackages(
  project: LoadedProject,
  target: BuildTarget,
  sourceManager: SourceManager,
): CompileModulesResult {
  const analysis = analyzeProjectTarget(project, target, { sourceManager })
  const { graph, linked } = analysis
  if (analysis.diagnostics.length > 0) throw analysis.diagnostics[0]

  if (target.kind !== 'datapack') {
    throw new DiagnosticError(
      'LoweringError',
      `Target '${target.name}' (${target.kind}) passed capability validation, but its backend is not implemented yet`,
      { file: project.manifestPath, line: 1, col: 1 },
    )
  }

  const entry = targetEntry(target)

  const reachable = reachablePackagePaths(graph)
  const backendPaths = new Map<string, string>()
  const backendObjectives = new Map<string, string>()
  for (const packagePath of reachable) {
    const loaded = graph.packages.get(packagePath)!
    const physicalPath = backendPackagePath(loaded, graph.modulePath)
    if (!/^[a-z0-9._/-]+$/.test(physicalPath)) {
      throw new DiagnosticError(
        'LoweringError',
        `Package '${packagePath}' cannot map to a datapack function path; directory segments must match [a-z0-9._-]+`,
        { file: loaded.sourceFiles[0]?.absolutePath, line: 1, col: 1 },
      )
    }
    if ([...backendPaths.values()].includes(physicalPath)) {
      throw new DiagnosticError(
        'LoweringError',
        `Backend package path collision at '${physicalPath}'`,
        { file: project.manifestPath, line: 1, col: 1 },
      )
    }
    backendPaths.set(packagePath, physicalPath)
    const objective = packageObjective(packagePath)
    if ([...backendObjectives.values()].includes(objective)) {
      throw new DiagnosticError(
        'LoweringError',
        `Scoreboard objective hash collision for package '${packagePath}'`,
        { file: project.manifestPath, line: 1, col: 1 },
      )
    }
    backendObjectives.set(packagePath, objective)
  }

  const modules: ModuleInput[] = graph.topologicalOrder
    .filter(id => reachable.has(id.path))
    .map(id => {
      const loaded = graph.packages.get(id.path)!
      const physicalPath = backendPaths.get(id.path)!
      return {
        name: physicalPath,
        source: '',
        filePath: loaded.sourceFiles[0]?.absolutePath,
        program: aggregatePackageProgram(loaded, linked, backendPaths, target.namespace),
        objective: backendObjectives.get(id.path),
      }
    })

  const minecraftVersion = target.minecraftVersion ?? project.manifest.project.minecraftVersion
  return compileModules(modules, {
    namespace: target.namespace,
    mcVersion: minecraftVersion ? parseMcVersion(minecraftVersion) : undefined,
    entryFunctions: [`${backendPaths.get(entry.packagePath)}/${entry.symbol}`],
  })
}
