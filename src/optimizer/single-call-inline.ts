import type { MIRFunction, MIRModule } from '../mir/types'
import { containsRawCall } from './auto-inline'
import { findRecursiveFunctions, inlineSelectedFunctions } from './inline'

export function inlineSingleCallFunctions(mod: MIRModule): MIRModule {
  const singleCallFns = findSingleCallInlineCandidates(mod)
  if (singleCallFns.size === 0) return mod

  const inlined = inlineSelectedFunctions(mod, singleCallFns)
  const remainingCalls = countFunctionCalls(inlined.functions)
  const removableFns = new Set(
    [...singleCallFns].filter(fnName => (remainingCalls.get(fnName) ?? 0) === 0),
  )

  if (removableFns.size === 0) return inlined

  return {
    ...inlined,
    functions: inlined.functions.filter(fn => !removableFns.has(fn.name)),
  }
}

function findSingleCallInlineCandidates(mod: MIRModule): Set<string> {
  const callCounts = countFunctionCalls(mod.functions)
  const recursiveFns = findRecursiveFunctions(mod.functions)
  const noInlineFns = mod.noInlineFunctions ?? new Set<string>()
  const candidates = new Set<string>()

  for (const fn of mod.functions) {
    if ((callCounts.get(fn.name) ?? 0) !== 1) continue
    if (fn.isMacro) continue
    if (noInlineFns.has(fn.name)) continue
    if (recursiveFns.has(fn.name)) continue
    if (containsRawCall(fn)) continue
    candidates.add(fn.name)
  }

  return candidates
}

function countFunctionCalls(functions: MIRFunction[]): Map<string, number> {
  const fnNames = new Set(functions.map(fn => fn.name))
  const counts = new Map<string, number>()

  for (const fn of functions) {
    counts.set(fn.name, 0)
  }

  for (const fn of functions) {
    for (const block of fn.blocks) {
      for (const instr of block.instrs) {
        if ((instr.kind !== 'call' && instr.kind !== 'call_macro') || !fnNames.has(instr.fn)) continue
        counts.set(instr.fn, (counts.get(instr.fn) ?? 0) + 1)
      }
    }
  }

  return counts
}
