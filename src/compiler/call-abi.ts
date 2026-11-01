import type { HIRModule, HIRParam, TypeNode } from '../hir/types'
import { detectMacroFunctions, type MacroFunctionInfo } from '../mir/macro'
import { DiagnosticError } from '../diagnostics'

/** Physical callee information shared by both sides of a resolved call.
 * Canonical source identity remains separate from its backend function path.
 */
export interface FunctionCallABI {
  readonly symbolId: string
  readonly callee: string
  readonly objective: string
  readonly parameters: readonly HIRParam[]
  readonly returnType: TypeNode
  readonly macro?: MacroFunctionInfo
}

export type CallABIRegistry = ReadonlyMap<string, FunctionCallABI>

export function buildCallABI(units: readonly { hir: HIRModule; objective: string }[]): CallABIRegistry {
  const entries = new Map<string, FunctionCallABI>()
  for (const { hir, objective } of units) {
    const macros = detectMacroFunctions(hir)
    for (const fn of hir.functions) {
      if (entries.has(fn.name)) throw new DiagnosticError('LoweringError', `Duplicate callee ABI '${fn.name}'`, fn.span ?? { line: 1, col: 1 })
      entries.set(fn.name, Object.freeze({
        symbolId: fn.symbolId ?? fn.name,
        callee: fn.name,
        objective,
        parameters: Object.freeze(fn.params.map(param => ({ ...param }))),
        returnType: fn.returnType,
        macro: macros.get(fn.name),
      }))
    }
  }
  return entries
}
