import { DiagnosticError } from '../diagnostics'
import type { BuildTarget, LoadedProject } from '../project/model'
import { loadPackageGraph, type LoadPackageGraphOptions } from '../project/package-loader'
import type { PackageGraph } from '../project/package-graph'
import { resolvePackageSymbols, type ResolvedPackageProgram } from '../resolver/package-symbols'
import { buildSemanticTargetPlan } from '../targets/capabilities'
import type { SemanticTargetPlan } from '../targets/model'
import { validateTargetPlan } from '../targets/validate'
import { typecheckResolvedPackageProgram, type LinkedPackageTypecheckResult } from './package-typecheck'

export interface ProjectTargetAnalysis {
  readonly graph: PackageGraph
  readonly linked: ResolvedPackageProgram
  readonly typecheck: LinkedPackageTypecheckResult
  readonly plan: SemanticTargetPlan
  readonly diagnostics: readonly DiagnosticError[]
}

/**
 * Builds the canonical, read-only frontend analysis shared by compilation and
 * CLI inspection. Frontend errors stop before reachability/target legality;
 * target diagnostics are returned so inspection can explain incompatibility.
 */
export function analyzeProjectTarget(
  project: LoadedProject,
  target: BuildTarget,
  options: LoadPackageGraphOptions = {},
): ProjectTargetAnalysis {
  const graphTarget = project.targets[target.name]
  if (!graphTarget) {
    throw new DiagnosticError(
      'LoweringError',
      `Target '${target.name}' does not belong to project '${project.manifest.project.modulePath}'`,
      { file: project.manifestPath, line: 1, col: 1 },
    )
  }
  if (graphTarget.kind !== target.kind || graphTarget.entry !== target.entry) {
    throw new DiagnosticError(
      'LoweringError',
      `Target '${target.name}' does not match its manifest declaration`,
      { file: project.manifestPath, line: 1, col: 1 },
    )
  }

  const graph = loadPackageGraph(project, graphTarget, options)
  const linked = resolvePackageSymbols(graph)
  const typecheck = typecheckResolvedPackageProgram(linked)
  if (typecheck.errors.length > 0) throw typecheck.errors[0]
  const plan = buildSemanticTargetPlan(linked, target)
  const diagnostics = Object.freeze(validateTargetPlan(plan))
  return Object.freeze({ graph, linked, typecheck, plan, diagnostics })
}
