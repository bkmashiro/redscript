import { DiagnosticError, type DiagnosticCode } from '../diagnostics'
import type { TargetCapability, SemanticTargetPlan } from './model'
import { targetSupports } from './model'

export interface TargetValidationOptions {
  /** Type-checking lenience never downgrades target legality. */
  readonly lenient?: boolean
}

const DIAGNOSTIC_CODES: Readonly<Record<TargetCapability, DiagnosticCode>> = Object.freeze({
  'lifecycle-hooks': 'RST2001',
  'scheduled-execution': 'RST2002',
  'resource-artifacts': 'RST2003',
  'resource-references': 'RST2099',
  'recursive-calls': 'RST2004',
  'generated-helper-functions': 'RST2005',
  'dynamic-dispatch': 'RST2006',
  'function-artifacts': 'RST2007',
  'function-tags': 'RST2008',
  'event-runtime': 'RST2009',
  'runtime-wrappers': 'RST2010',
  'load-dependencies': 'RST2011',
  'persistent-state': 'RST2099',
  'opaque-commands': 'RST2099',
})

const ALTERNATIVES: Readonly<Record<TargetCapability, string>> = Object.freeze({
  'lifecycle-hooks': 'invoke this behavior explicitly from the selected entry, or use a datapack target',
  'scheduled-execution': 'run the commands at an explicit time, or use a datapack target',
  'resource-artifacts': 'remove the generated resource artifact, or use a target that emits datapack resources',
  'resource-references': 'use a target-supported typed registry reference',
  'recursive-calls': 'rewrite the reachable recursion as bounded finite control flow',
  'generated-helper-functions': 'rewrite the operation as finite inline control flow, or use a datapack target',
  'dynamic-dispatch': 'replace dynamic invocation with a statically resolved call',
  'function-artifacts': 'replace the external/retained function artifact with inline commands, or use a datapack target',
  'function-tags': 'invoke this behavior explicitly from the selected entry, or use a datapack target',
  'event-runtime': 'replace the event decorator with an explicitly supported lifecycle hook',
  'runtime-wrappers': 'remove the runtime wrapper decorator until this project backend supports it',
  'load-dependencies': 'call the required initialization explicitly from a supported @load entry',
  'persistent-state': 'use target-supported setup/invoke/cleanup state',
  'opaque-commands': 'replace the opaque command with a target-supported typed operation',
})

function manifestPath(plan: SemanticTargetPlan): string | undefined {
  return plan.linked.graph.moduleGraph.modules.get(plan.linked.graph.modulePath)?.project.manifestPath
}

export function validateTargetPlan(
  plan: SemanticTargetPlan,
  options: TargetValidationOptions = {},
): DiagnosticError[] {
  // Deliberately consumed but never used for severity: target legality is fail-closed.
  void options.lenient
  const diagnostics: DiagnosticError[] = []
  for (const requirement of plan.requirements) {
    if (targetSupports(plan.profile, requirement.capability)) continue
    const chain = requirement.callChain.length > 0
      ? ` Call chain: ${requirement.callChain.join(' → ')}.`
      : ''
    const message = [
      `Target '${plan.target.name}' (${plan.target.kind}) does not support '${requirement.capability}' required by ${requirement.origin}.`,
      chain,
      ` Alternative: ${ALTERNATIVES[requirement.capability]}.`,
    ].join('').trim()
    diagnostics.push(new DiagnosticError(
      'TypeError',
      message,
      {
        file: requirement.span?.file ?? manifestPath(plan),
        line: requirement.span?.line ?? 1,
        col: requirement.span?.col ?? 1,
      },
      undefined,
      DIAGNOSTIC_CODES[requirement.capability],
    ))
  }
  return diagnostics
}

export function assertTargetCompatible(
  plan: SemanticTargetPlan,
  options: TargetValidationOptions = {},
): void {
  const diagnostics = validateTargetPlan(plan, options)
  if (diagnostics.length > 0) throw diagnostics[0]
}
