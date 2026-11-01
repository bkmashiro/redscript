import * as path from 'path'
import { createHash } from 'crypto'
import { SourceManager } from '../compiler/source-manager'
import { Lexer } from '../lexer'
import { Parser } from '../parser'
import { DiagnosticError } from '../diagnostics'
import type { ImportDecl } from '../ast/types'
import { getStdlibDir, stdlibModuleName } from '../stdlib/paths'
import { packageId, type LoadedPackage, type PackageImport } from './package-graph'

/** Normalize only compiler-owned imports; ordinary project dependencies are untouched. */
export function normalizeStdlibImport(imported: ImportDecl): string | undefined {
  const name = stdlibModuleName(imported.packagePath ?? imported.moduleName)
  if (!name) return undefined
  imported.packagePath = `stdlib/${name}`
  return name
}

/** One immutable loaded package per shipped module in a build/session. */
export class StdlibPackageProvider {
  readonly packages = new Map<string, LoadedPackage>()
  private readonly visiting = new Set<string>()
  constructor(private readonly sources: SourceManager) {}

  load(name: string): LoadedPackage {
    const canonical = `stdlib/${name}`
    const cached = this.packages.get(canonical)
    if (cached) return cached
    if (!stdlibModuleName(canonical)) throw new DiagnosticError('ParseError', `Unknown standard library module '${name}'`, { line: 1, col: 1 })
    if (this.visiting.has(canonical)) throw new DiagnosticError('ParseError', `Standard library dependency cycle at '${canonical}'`, { line: 1, col: 1 })
    this.visiting.add(canonical)
    const filePath = path.join(getStdlibDir(), `${name}.mcrs`)
    const source = this.sources.readFile(filePath)
    const parser = new Parser(new Lexer(source.text, filePath).tokenize(), source.text, filePath)
    const program = parser.parse('stdlib')
    if (parser.parseErrors.length) throw parser.parseErrors[0]
    program.packageName = name
    program.isLibrary = false
    const imports: PackageImport[] = []
    for (const imported of program.imports) {
      const dependency = normalizeStdlibImport(imported)
      if (!dependency) throw new DiagnosticError('ParseError', `Shipped stdlib '${name}' has an unknown dependency '${imported.moduleName}'`, imported.span ?? { file: filePath, line: 1, col: 1 })
      const loaded = this.load(dependency)
      imports.push({ path: loaded.id.path, modulePath: 'stdlib', alias: imported.alias ?? dependency, sourceFile: source.id, span: imported.span })
    }
    for (const fn of program.declarations) {
      fn.isExported = !fn.name.startsWith('_')
      fn.isLibraryFn = true
    }
    const loaded: LoadedPackage = Object.freeze({
      id: packageId('stdlib', name), name, dir: path.dirname(filePath),
      sourceFiles: Object.freeze([{ id: source.id, absolutePath: filePath, text: source.text }]),
      programs: Object.freeze([program]), imports: Object.freeze(imports),
    })
    this.visiting.delete(canonical)
    this.packages.set(canonical, loaded)
    return loaded
  }

  dependencyHash(base: string): string {
    const hash = createHash('sha256').update(base)
    for (const [name, pkg] of [...this.packages].sort(([a], [b]) => a.localeCompare(b))) {
      hash.update(name).update('\0').update(pkg.sourceFiles[0].text).update('\0')
    }
    return hash.digest('hex')
  }
}
