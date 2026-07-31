import { DiagnosticError } from '../diagnostics'
import type { DecoratorName } from '../ast/decorators'
import type { Span } from '../ast/types'
import type { BuildTarget } from '../project/model'
import { reachablePackagePaths } from '../project/package-graph'
import { makePackageSymbolId, type PackageSymbolId, type ResolvedPackageProgram } from '../resolver/package-symbols'
import {
  collectSemanticFunctions,
  computeReachability,
  findReachableRecursion,
  shortestCallChain,
  visitSemanticObjects,
  type ReachabilityResult,
  type SemanticFunction,
} from './reachability'
import {
  getTargetProfile,
  type CapabilityRequirement,
  type SemanticTargetPlan,
  type TargetCapability,
} from './model'

const CAPABILITY_ORDER: readonly TargetCapability[] = [
  'lifecycle-hooks',
  'scheduled-execution',
  'resource-artifacts',
  'resource-references',
  'function-artifacts',
  'function-tags',
  'event-runtime',
  'runtime-wrappers',
  'load-dependencies',
  'recursive-calls',
  'generated-helper-functions',
  'persistent-state',
  'opaque-commands',
  'dynamic-dispatch',
]

const LIFECYCLE_DECORATORS: ReadonlySet<DecoratorName> = new Set([
  'tick',
  'load',
  'watch',
])

const EVENT_RUNTIME_DECORATORS: ReadonlySet<DecoratorName> = new Set([
  'on',
  'on_trigger',
  'on_advancement',
  'on_craft',
  'on_death',
  'on_login',
  'on_join_team',
])

const RUNTIME_WRAPPER_DECORATORS: ReadonlySet<DecoratorName> = new Set([
  'profile',
  'benchmark',
  'throttle',
  'retry',
  'memoize',
])

const ROOT_DECORATORS: ReadonlySet<DecoratorName> = new Set([
  ...LIFECYCLE_DECORATORS,
  ...EVENT_RUNTIME_DECORATORS,
  ...RUNTIME_WRAPPER_DECORATORS,
  'function_tag',
  'require_on_load',
  'schedule',
  'keep',
  'coroutine',
])

const HELPER_DECORATORS: ReadonlySet<DecoratorName> = new Set([
  'coroutine',
  ...RUNTIME_WRAPPER_DECORATORS,
])

const HELPER_CONTROL_FLOW = new Set([
  'while',
  'do_while',
  'foreach',
  'for_range',
  'for_in_array',
  'for_each',
  'labeled_loop',
])

/** Match the exact small-loop shape consumed by optimizer/unroll.ts. */
function isStaticallyUnrollableFor(record: Record<string, unknown>): boolean {
  if (record.kind !== 'for') return false
  const init = record.init as Record<string, unknown> | undefined
  const cond = record.cond as Record<string, unknown> | undefined
  const step = record.step as Record<string, unknown> | undefined
  const initValue = init?.init as Record<string, unknown> | undefined
  const left = cond?.left as Record<string, unknown> | undefined
  const right = cond?.right as Record<string, unknown> | undefined
  const stepValue = step?.value as Record<string, unknown> | undefined
  const stepLeft = stepValue?.left as Record<string, unknown> | undefined
  const stepRight = stepValue?.right as Record<string, unknown> | undefined
  const body = record.body as readonly Record<string, unknown>[] | undefined

  return init?.kind === 'let'
    && typeof init.name === 'string'
    && initValue?.kind === 'int_lit'
    && initValue.value === 0
    && cond?.kind === 'binary'
    && cond.op === '<'
    && left?.kind === 'ident'
    && left.name === init.name
    && right?.kind === 'int_lit'
    && typeof right.value === 'number'
    && right.value >= 0
    && right.value <= 8
    && step?.kind === 'assign'
    && step.target === init.name
    && step.op === '='
    && stepValue?.kind === 'binary'
    && stepValue.op === '+'
    && stepLeft?.kind === 'ident'
    && stepLeft.name === init.name
    && stepRight?.kind === 'int_lit'
    && stepRight.value === 1
    && Array.isArray(body)
    && body.every(stmt => !HELPER_CONTROL_FLOW.has(String(stmt.kind)) && stmt.kind !== 'for' && stmt.kind !== 'if')
}

function requiresGeneratedHelper(record: Record<string, unknown>): boolean {
  if (record.kind === 'for') return !isStaticallyUnrollableFor(record)
  return HELPER_CONTROL_FLOW.has(String(record.kind))
}

function projectManifestPath(linked: ResolvedPackageProgram): string | undefined {
  return linked.graph.moduleGraph.modules.get(linked.graph.modulePath)?.project.manifestPath
}

export function resolveTargetEntry(
  linked: ResolvedPackageProgram,
  target: BuildTarget,
): PackageSymbolId {
  const entry = target.entry
  const separator = entry?.lastIndexOf('::') ?? -1
  if (!entry || separator <= 0 || separator === entry.length - 2) {
    throw new DiagnosticError(
      'TypeError',
      `Target '${target.name}' entry must be '<canonical-package-path>::<exported-symbol>'`,
      { file: projectManifestPath(linked), line: 1, col: 1 },
    )
  }

  const id = makePackageSymbolId(entry.slice(0, separator), entry.slice(separator + 2))
  const symbol = linked.symbols.get(id)
  if (!symbol || !symbol.exported || symbol.declaration.isDeclareOnly) {
    throw new DiagnosticError(
      'TypeError',
      `Target '${target.name}' entry '${entry}' must resolve to an exported function`,
      { file: projectManifestPath(linked), line: 1, col: 1 },
    )
  }
  return id
}

function rootSymbols(
  functions: ReadonlyMap<PackageSymbolId, SemanticFunction>,
  targetPackages: ReadonlySet<string>,
): PackageSymbolId[] {
  const roots: PackageSymbolId[] = []
  for (const [id, fn] of functions) {
    if (
      targetPackages.has(fn.packagePath)
      && fn.declaration.decorators.some(decorator => ROOT_DECORATORS.has(decorator.name))
    ) {
      roots.push(id)
    }
  }
  return roots.sort()
}


function addRequirement(
  requirements: CapabilityRequirement[],
  reachability: ReachabilityResult,
  capability: TargetCapability,
  origin: string,
  symbolId?: PackageSymbolId,
  span?: Span,
): void {
  requirements.push(Object.freeze({
    capability,
    origin,
    symbolId,
    span,
    callChain: Object.freeze(symbolId ? shortestCallChain(reachability, symbolId) : []),
  }))
}

function packageAliases(fn: SemanticFunction): Map<string, string> {
  const aliases = new Map<string, string>()
  for (const imported of fn.program.imports) {
    if (!imported.packagePath) continue
    aliases.set(imported.alias ?? imported.packagePath.split('/').pop()!, imported.packagePath)
  }
  return aliases
}

function inferFunctionRequirements(
  linked: ResolvedPackageProgram,
  reachability: ReachabilityResult,
  fn: SemanticFunction,
  requirements: CapabilityRequirement[],
): void {
  const { id, declaration } = fn
  for (const decorator of declaration.decorators) {
    if (LIFECYCLE_DECORATORS.has(decorator.name)) {
      addRequirement(requirements, reachability, 'lifecycle-hooks', `@${decorator.name} on ${id}`, id, declaration.span)
    }
    if (decorator.name === 'function_tag') {
      addRequirement(requirements, reachability, 'function-tags', `@function_tag on ${id}`, id, declaration.span)
    }
    if (EVENT_RUNTIME_DECORATORS.has(decorator.name)) {
      addRequirement(requirements, reachability, 'event-runtime', `@${decorator.name} on ${id}`, id, declaration.span)
    }
    if (RUNTIME_WRAPPER_DECORATORS.has(decorator.name)) {
      addRequirement(requirements, reachability, 'runtime-wrappers', `@${decorator.name} on ${id}`, id, declaration.span)
    }
    if (decorator.name === 'require_on_load') {
      addRequirement(
        requirements,
        reachability,
        'load-dependencies',
        `@require_on_load on ${id}`,
        id,
        declaration.span,
      )
    }
    if (decorator.name === 'schedule') {
      addRequirement(requirements, reachability, 'scheduled-execution', `@schedule on ${id}`, id, declaration.span)
    }
    if (decorator.name === 'keep') {
      addRequirement(requirements, reachability, 'function-artifacts', `@keep on ${id}`, id, declaration.span)
    }
    if (HELPER_DECORATORS.has(decorator.name)) {
      addRequirement(
        requirements,
        reachability,
        'generated-helper-functions',
        `@${decorator.name} on ${id}`,
        id,
        declaration.span,
      )
    }
    if (decorator.name === 'watch') {
      addRequirement(requirements, reachability, 'persistent-state', `@watch on ${id}`, id, declaration.span)
    }
  }

  const aliases = packageAliases(fn)
  visitSemanticObjects([declaration.params.map(param => param.default), declaration.body], record => {
    const span = record.span as Span | undefined
    if (record.kind === 'call' && typeof record.fn === 'string') {
      if (record.fn === 'setTimeout' || record.fn === 'setInterval' || record.fn === 'clearInterval') {
        addRequirement(
          requirements,
          reachability,
          'scheduled-execution',
          `intrinsic ${record.fn}`,
          id,
          span,
        )
      }
      const localId = makePackageSymbolId(fn.packagePath, record.fn)
      const symbol = linked.symbols.get(localId)
      if (symbol?.declaration.isDeclareOnly) {
        addRequirement(
          requirements,
          reachability,
          'function-artifacts',
          `external function ${localId}`,
          id,
          span,
        )
      }
    }
    if (record.kind === 'static_call' && typeof record.type === 'string' && typeof record.method === 'string') {
      const importedPackage = aliases.get(record.type)
      if (importedPackage) {
        const targetId = makePackageSymbolId(importedPackage, record.method)
        if (linked.symbols.get(targetId)?.declaration.isDeclareOnly) {
          addRequirement(
            requirements,
            reachability,
            'function-artifacts',
            `external function ${targetId}`,
            id,
            span,
          )
        }
      }
    }
    if (requiresGeneratedHelper(record)) {
      addRequirement(
        requirements,
        reachability,
        'generated-helper-functions',
        `${String(record.kind)} control flow`,
        id,
        span,
      )
    }
    if (record.kind === 'raw') {
      addRequirement(requirements, reachability, 'opaque-commands', 'raw command', id, span)
    }
    if (record.kind === 'invoke') {
      addRequirement(requirements, reachability, 'dynamic-dispatch', 'dynamic function invocation', id, span)
    }
  })
}

function deduplicateAndSort(requirements: CapabilityRequirement[]): CapabilityRequirement[] {
  const seen = new Set<string>()
  return requirements
    .sort((left, right) => {
      const capability = CAPABILITY_ORDER.indexOf(left.capability) - CAPABILITY_ORDER.indexOf(right.capability)
      if (capability !== 0) return capability
      const symbol = (left.symbolId ?? '').localeCompare(right.symbolId ?? '')
      if (symbol !== 0) return symbol
      const file = (left.span?.file ?? '').localeCompare(right.span?.file ?? '')
      if (file !== 0) return file
      const line = (left.span?.line ?? 0) - (right.span?.line ?? 0)
      return line || left.origin.localeCompare(right.origin)
    })
    .filter(requirement => {
      const key = [
        requirement.capability,
        requirement.symbolId ?? '',
        requirement.origin,
        requirement.span?.file ?? '',
        requirement.span?.line ?? 0,
        requirement.span?.col ?? 0,
      ].join('\0')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export function buildSemanticTargetPlan(
  linked: ResolvedPackageProgram,
  target: BuildTarget,
): SemanticTargetPlan {
  const entry = resolveTargetEntry(linked, target)
  const functions = collectSemanticFunctions(linked)
  const packageClosure = reachablePackagePaths(linked.graph)
  const reachability = computeReachability(linked, entry, rootSymbols(functions, packageClosure))
  const requirements: CapabilityRequirement[] = []

  for (const symbolId of reachability.reachableSymbols) {
    inferFunctionRequirements(linked, reachability, reachability.functions.get(symbolId)!, requirements)
  }

  for (const cycle of findReachableRecursion(reachability)) {
    const symbolId = cycle.symbols[0]
    addRequirement(
      requirements,
      reachability,
      'recursive-calls',
      `recursive cycle ${cycle.cycle.join(' → ')}`,
      symbolId,
      reachability.functions.get(symbolId)?.declaration.span,
    )
  }

  for (const packagePath of [...packageClosure].sort()) {
    const loaded = linked.graph.packages.get(packagePath)
    if (!loaded) continue
    for (const program of loaded.programs) {
      for (const resource of program.resourceDeclarations ?? []) {
        addRequirement(
          requirements,
          reachability,
          'resource-references',
          `resource ${resource.registry} ${resource.id}`,
          undefined,
          resource.span,
        )
      }
      for (const global of program.globals.filter(candidate => candidate.mutable)) {
        addRequirement(
          requirements,
          reachability,
          'persistent-state',
          `mutable global ${packagePath}::${global.name}`,
          undefined,
          global.span,
        )
      }
    }
  }

  return Object.freeze({
    target,
    profile: getTargetProfile(target.kind),
    linked,
    entry,
    roots: reachability.roots,
    reachableSymbols: reachability.reachableSymbols,
    callGraph: reachability.callGraph,
    requirements: Object.freeze(deduplicateAndSort(requirements)),
  })
}
