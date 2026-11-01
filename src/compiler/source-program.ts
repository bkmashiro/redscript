import { createHash } from 'crypto'
import type { FnDecl, Program } from '../ast/types'
import { DiagnosticBundleError, DiagnosticError } from '../diagnostics'
import { cloneBoundCalls } from '../resolver/bound-program'
import { resolvePackageSymbols } from '../resolver/package-symbols'
import { loadSourceGraph, type SourceGraphInput } from './source-graph'

/** One source frontend, followed only by a physical single-datapack projection.
 * Discovery/visibility/call binding are owned by the shared graph and resolver.
 */
export function prepareSourceProgram(input: SourceGraphInput & { stopAfterCheck?: boolean }): {
  ast: Program; warnings: string[]; hasLibraries: boolean; root: Program
} {
  const graph = loadSourceGraph({ ...input, allowDiagnostics: true })
  if (graph.diagnostics.length) {
    throw input.stopAfterCheck ? new DiagnosticBundleError([...graph.diagnostics]) : graph.diagnostics[0]
  }
  const linked = resolvePackageSymbols(graph)
  const inlineTexts = new Set(input.librarySources ?? [])
  const duplicateInlinePackages = new Set([...graph.packages].filter(([id, pkg]) =>
    id !== graph.entry.id.path && pkg.sourceFiles?.length === 1 && inlineTexts.has(pkg.sourceFiles[0].text),
  ).map(([id]) => id))
  const declared = new Set<FnDecl>()
  for (const pkg of graph.packages.values()) for (const program of pkg.programs) {
    for (const fn of program.declaredFunctions ?? []) declared.add(fn)
  }
  const names = new Map<string, string[]>()
  for (const symbol of linked.symbols.values()) {
    if (declared.has(symbol.declaration) || duplicateInlinePackages.has(symbol.packagePath)) continue
    const owners = names.get(symbol.name) ?? []
    owners.push(symbol.packagePath)
    names.set(symbol.name, owners)
  }
  const physicalNames = new Map<string, string>()
  for (const symbol of linked.symbols.values()) {
    const collision = (names.get(symbol.name)?.length ?? 0) > 1
    if (collision && symbol.packagePath.startsWith('stdlib/')) {
      throw new DiagnosticError('LoweringError', `Conflicting standalone runtime ABI name '${symbol.name}' from '${symbol.packagePath}'`, symbol.span ?? { line: 1, col: 1 })
    }
    const qualify = collision && symbol.packagePath !== graph.entry.id.path && !declared.has(symbol.declaration)
    const prefix = createHash('sha256').update(symbol.packagePath).digest('hex').slice(0, 12)
    physicalNames.set(symbol.id, qualify ? `__imports/${prefix}/${symbol.name}` : symbol.name)
  }
  const parts: Program[] = []
  let projectedRoot: Program | undefined
  for (const id of graph.topologicalOrder) {
    if (duplicateInlinePackages.has(id.path)) continue
    const pkg = graph.packages.get(id.path)!
    const bindings = linked.packages.get(id.path)!.bindings
    for (const [index, program] of pkg.programs.entries()) {
      const transformed = cloneBoundCalls(program, bindings, symbol => physicalNames.get(symbol)!)
      for (const fn of [...transformed.declarations, ...(transformed.declaredFunctions ?? [])]) {
        const symbol = `${id.path}::${fn.name}`
        fn.symbolId = symbol
        fn.name = physicalNames.get(symbol)!
        if (id.path !== graph.entry.id.path || index > 0) {
          fn.isLibraryFn = true
          // Module exports are visible bindings, not datapack entry-point roots.
          fn.isExported = false
        }
        fn.sourceFile ??= pkg.sourceFiles?.[index]?.absolutePath
      }
      if (id.path === graph.entry.id.path && index === 0) projectedRoot = transformed
      parts.push(transformed)
    }
  }
  const root = graph.entry.programs[0]
  const ast: Program = {
    ...root,
    declarations: [projectedRoot!, ...parts.filter(program => program !== projectedRoot)].flatMap(program => program.declarations),
    declaredFunctions: parts.flatMap(program => program.declaredFunctions ?? []),
    globals: parts.flatMap(program => program.globals),
    consts: parts.flatMap(program => program.consts),
    structs: parts.flatMap(program => program.structs),
    implBlocks: parts.flatMap(program => program.implBlocks),
    enums: parts.flatMap(program => program.enums),
    interfaces: parts.flatMap(program => program.interfaces),
    resourceDeclarations: parts.flatMap(program => program.resourceDeclarations ?? []),
    imports: [],
  }
  return { ast, root, warnings: [...graph.warnings], hasLibraries: parts.length > 1 }
}
