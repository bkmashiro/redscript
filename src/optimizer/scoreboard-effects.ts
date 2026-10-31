import type { MIRFunction, MIRModule } from '../mir/types'

/**
 * Find ordinary acyclic helpers that cannot modify user scoreboard state.
 *
 * Arithmetic and reads still write compiler-owned temporary/parameter slots.
 * Consumers must not reuse reads of the module's own objective across a call.
 * This is not a purity summary or permission to move NBT/world operations.
 * Unknown calls, macro/context calls, storage operations and recursive call
 * graphs are deliberately unclassified.
 */
export function findScoreboardPreservingFunctions(mod: MIRModule): ReadonlySet<string> {
  const pending = new Map<string, number>()
  const callers = new Map<string, Set<string>>()
  const ready: string[] = []

  for (const fn of mod.functions) {
    const dependencies = preservingDependencies(fn)
    if (!dependencies) continue
    pending.set(fn.name, dependencies.size)
    if (dependencies.size === 0) ready.push(fn.name)
    for (const dependency of dependencies) {
      const incoming = callers.get(dependency) ?? new Set<string>()
      incoming.add(fn.name)
      callers.set(dependency, incoming)
    }
  }

  const preserving = new Set<string>()
  for (let i = 0; i < ready.length; i++) {
    const name = ready[i]
    preserving.add(name)
    for (const caller of callers.get(name) ?? []) {
      const remaining = pending.get(caller)! - 1
      pending.set(caller, remaining)
      if (remaining === 0) ready.push(caller)
    }
  }
  return preserving
}

function preservingDependencies(fn: MIRFunction): Set<string> | undefined {
  if (fn.isMacro) return undefined
  const dependencies = new Set<string>()
  for (const block of fn.blocks) {
    for (const instr of [...block.instrs, block.term]) {
      switch (instr.kind) {
        case 'const': case 'copy':
        case 'add': case 'sub': case 'mul': case 'div': case 'mod': case 'pow':
        case 'neg': case 'cmp': case 'and': case 'or': case 'not':
        case 'score_read':
        case 'jump': case 'branch': case 'return':
          break
        case 'call':
          // Raw command names must remain opaque even in malformed input with
          // a matching module function. Missing callees never become ready.
          if (instr.fn.startsWith('__raw:')) return undefined
          dependencies.add(instr.fn)
          break
        default:
          return undefined
      }
    }
  }
  return dependencies
}
