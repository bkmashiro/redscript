import type { MIRFunction, MIRModule } from '../mir/types'
import { inlinePass } from './inline'

const SMALL_FUNCTION_INSTR_LIMIT = 5

export function autoInlineSmallFunctions(mod: MIRModule): MIRModule {
  const recursiveFns = findRecursiveFunctions(mod.functions)
  const noInlineFns = mod.noInlineFunctions ?? new Set<string>()
  const autoInlineFns = new Set<string>()

  for (const fn of mod.functions) {
    if (fn.isMacro) continue
    if (noInlineFns.has(fn.name)) continue
    if (recursiveFns.has(fn.name)) continue
    if (countFunctionInstrs(fn) > SMALL_FUNCTION_INSTR_LIMIT) continue
    // Don't auto-inline functions with raw() calls — these reference
    // MC calling-convention registers ($p0, etc.) that become invalid when inlined.
    if (containsRawCall(fn)) continue
    autoInlineFns.add(fn.name)
  }

  const inlineFunctions = new Set(mod.inlineFunctions ?? [])
  for (const fnName of autoInlineFns) inlineFunctions.add(fnName)

  // Track auto-inlined functions so compile pipeline can keep their output files
  const keepInOutput = new Set(mod.keepInOutput ?? [])
  for (const fnName of autoInlineFns) keepInOutput.add(fnName)

  return inlinePass({ ...mod, inlineFunctions, keepInOutput })
}

function containsRawCall(fn: MIRFunction): boolean {
  for (const block of fn.blocks) {
    for (const instr of block.instrs) {
      if (instr.kind === 'call' && instr.fn.startsWith('__raw:')) return true
    }
  }
  return false
}

function countFunctionInstrs(fn: MIRFunction): number {
  let count = 0
  for (const block of fn.blocks) {
    count += block.instrs.length + 1
  }
  return count
}

function findRecursiveFunctions(functions: MIRFunction[]): Set<string> {
  const fnNames = new Set(functions.map(fn => fn.name))
  const edges = new Map<string, Set<string>>()

  for (const fn of functions) {
    const callees = new Set<string>()
    for (const block of fn.blocks) {
      for (const instr of block.instrs) {
        if ((instr.kind === 'call' || instr.kind === 'call_macro') && fnNames.has(instr.fn)) {
          callees.add(instr.fn)
        }
      }
    }
    edges.set(fn.name, callees)
  }

  const recursive = new Set<string>()

  for (const fn of functions) {
    const seen = new Set<string>()
    const stack = [...(edges.get(fn.name) ?? [])]

    while (stack.length > 0) {
      const current = stack.pop()!
      if (current === fn.name) {
        recursive.add(fn.name)
        break
      }
      if (seen.has(current)) continue
      seen.add(current)
      for (const next of edges.get(current) ?? []) {
        stack.push(next)
      }
    }
  }

  return recursive
}
