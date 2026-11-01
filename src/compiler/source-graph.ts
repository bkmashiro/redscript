import * as fs from 'fs'
import * as path from 'path'
import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { DiagnosticError } from '../diagnostics'
import type { ImportDecl, Program } from '../ast/types'
import { SourceManager, type SourceUnit } from './source-manager'
import { resolveSourceImport } from './source-imports'
import { getStdlibDir } from '../stdlib/paths'
import { StdlibPackageProvider } from '../project/stdlib-provider'
import { packageId, type BindingPackage, type LoadedPackage, type PackageBindingGraph, type PackageImport } from '../project/package-graph'

export interface SourceGraphInput {
  filePath?: string
  uri?: string
  source: string
  librarySources?: readonly string[]
  namespace?: string
  includeDirs?: readonly string[]
  /** Editor discovery retains usable imports alongside parse/import diagnostics. */
  allowDiagnostics?: boolean
}

export interface StandaloneSourceInput extends SourceGraphInput {
  /** Real document location, including a not-yet-saved file-backed document. */
  filePath: string
}

export interface SourceGraph extends PackageBindingGraph {
  readonly entry: BindingPackage
  readonly sourceManager: SourceManager
  readonly warnings: readonly string[]
  readonly diagnostics: readonly DiagnosticError[]
  readonly entryImports: readonly ImportDecl[]
}

export interface StandaloneSourceGraph extends SourceGraph {
  readonly packages: ReadonlyMap<string, LoadedPackage>
  readonly entry: LoadedPackage
}

/** Canonicalize missing editor files through their existing ancestor too. */
function canonicalSourcePath(file: string): string {
  let existing = path.resolve(file)
  const missing: string[] = []
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing)
    if (parent === existing) return path.resolve(file)
    missing.unshift(path.basename(existing))
    existing = parent
  }
  return path.join(fs.realpathSync(existing), ...missing)
}

/** Discover file and virtual source units through one parser/import graph.
 * Physical provenance is supplied only for actual file-backed source units.
 */
export function loadSourceGraph(input: StandaloneSourceInput): StandaloneSourceGraph
export function loadSourceGraph(input: SourceGraphInput): SourceGraph
export function loadSourceGraph(input: SourceGraphInput): SourceGraph {
  const entryPath = input.filePath ? canonicalSourcePath(input.filePath) : undefined
  const rootDir = entryPath ? path.dirname(entryPath) : undefined
  const manager = new SourceManager({ cwd: rootDir })
  const entrySource = entryPath
    ? manager.addSource({ filePath: entryPath, text: input.source })
    : manager.addVirtualSource({ text: input.source, uri: input.uri ?? 'compiler:entry' })
  const standardDir = canonicalSourcePath(getStdlibDir())
  const stdlib = new StdlibPackageProvider(manager)
  const presentation = new Map<string, string>()
  if (input.filePath) presentation.set(entrySource.id, input.filePath)
  const packages = new Map<string, BindingPackage>()
  const units = new Map<string, BindingPackage>()
  const syntaxImports = new Map<string, ImportDecl[]>()
  const diagnostics: DiagnosticError[] = []
  const warnings: string[] = []
  const report = (error: DiagnosticError) => {
    if (!input.allowDiagnostics) throw error
    diagnostics.push(error)
  }
  const loadFile = (filePath: string, displayPath = filePath): LoadedPackage => {
    const unit = manager.readFile(canonicalSourcePath(filePath))
    if (!presentation.has(unit.id)) presentation.set(unit.id, displayPath)
    return loadUnit(unit) as LoadedPackage
  }
  const loadUnit = (source: SourceUnit): BindingPackage => {
    const existing = units.get(source.id)
    if (existing) return existing
    const filePath = source.filePath
    // Register the real source vertex before following imports. Mutually
    // importing source units can then bind after discovery without text pasting.
    const relative = filePath ? (rootDir ? path.relative(rootDir, filePath) : filePath).replace(/\\/g, '/').replace(/\.mcrs$/, '') : 'entry'
    const logicalPath = relative.split('/').map(segment => segment === '..' ? '%2e%2e' : encodeURIComponent(segment)).join('/')
    const id = packageId(filePath ? 'source' : 'virtual', logicalPath)
    const programs: Program[] = []
    const imports: PackageImport[] = []
    const loaded = {
      id, name: filePath ? path.basename(filePath, '.mcrs') : 'entry', programs, imports,
      ...(filePath ? { dir: path.dirname(filePath), sourceFiles: [{ id: source.id, absolutePath: filePath, text: source.text }] } : {}),
    }
    units.set(source.id, loaded)
    packages.set(id.path, loaded)
    const sources = [source]
    if (source.id === entrySource.id) {
      for (const [index, text] of [...new Set(input.librarySources ?? [])].entries()) {
        sources.push(manager.addVirtualSource({ text, uri: `compiler:library/${index}` }))
      }
    }
    for (const unit of sources) {
      const displayFile = presentation.get(unit.id) ?? unit.filePath
      const parser = new Parser(new Lexer(unit.text, displayFile).tokenize(), unit.text, displayFile)
      const program = parser.parse(input.namespace ?? 'redscript')
      programs.push(program)
      warnings.push(...parser.warnings)
      for (const error of parser.parseErrors) report(error)
      syntaxImports.set(unit.id, program.imports.map(imported => Object.freeze({ ...imported })))
      const inlineLibrary = unit.id !== source.id
      const implicitExports = inlineLibrary || program.isLibrary || (!program.moduleName && !program.packageName)
      for (const fn of program.declarations) {
        if (implicitExports) fn.isExported = true
        if (inlineLibrary) fn.isLibraryFn = true
        if (displayFile) fn.sourceFile = displayFile
      }
      for (const impl of program.implBlocks) for (const method of impl.methods) {
        if (displayFile) method.sourceFile = displayFile
      }
      for (const fn of program.declaredFunctions ?? []) fn.isExported = true
      for (const imported of program.imports) {
        try {
          const specifier = imported.packagePath ?? imported.moduleName
          const resolved = resolveSourceImport(specifier, { fromFile: filePath, includeDirs: input.includeDirs, sources: manager })
          if (!resolved) throw new DiagnosticError('ParseError', `Module '${specifier}' not found`, imported.span ?? { file: filePath, line: 1, col: 1 })
          const targetPath = canonicalSourcePath(resolved)
          const dependency = path.dirname(targetPath) === standardDir
            ? stdlib.load(path.basename(targetPath, '.mcrs')) : loadFile(targetPath, resolveSourceImport(specifier, { fromFile: presentation.get(source.id) ?? filePath, includeDirs: input.includeDirs, sources: manager }) ?? resolved)
          const alias = imported.alias ?? path.basename(specifier, '.mcrs')
          imported.packagePath = dependency.id.path
          imported.alias = alias
          // Whole-file source imports historically expose public callables bare.
          if (imported.symbol === undefined) imported.symbol = '*'
          imports.push({ path: dependency.id.path, modulePath: dependency.id.modulePath, alias, sourceFile: unit.id, span: imported.span })
        } catch (error) {
          if (!(error instanceof DiagnosticError)) throw error
          report(error)
        }
      }
    }
    const program = programs[0]
    loaded.name = program.packageName ?? program.moduleName ?? loaded.name
    Object.freeze(programs)
    Object.freeze(imports)
    return Object.freeze(loaded)
  }

  const entry = loadUnit(entrySource)
  for (const [id, loaded] of stdlib.packages) packages.set(id, loaded)
  const seen = new Set<string>()
  const order: BindingPackage['id'][] = []
  const visit = (loaded: BindingPackage) => {
    if (seen.has(loaded.id.path)) return
    seen.add(loaded.id.path)
    for (const imported of [...loaded.imports].sort((a, b) => a.path.localeCompare(b.path))) visit(packages.get(imported.path)!)
    order.push(loaded.id)
  }
  visit(entry)
  return Object.freeze({
    modulePath: entry.id.modulePath, rootPackages: Object.freeze([entry.id]), packages,
    topologicalOrder: Object.freeze(order), entry, sourceManager: manager,
    warnings: Object.freeze(warnings), diagnostics: Object.freeze(diagnostics), entryImports: Object.freeze(syntaxImports.get(entrySource.id) ?? []),
  })
}

export function loadStandaloneSourceGraph(input: StandaloneSourceInput): StandaloneSourceGraph {
  return loadSourceGraph(input)
}
