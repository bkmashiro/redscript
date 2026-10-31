import type { MIRFunction, MIRModule } from '../mir/types'

export interface ScoreboardEffectBarrier {
  kind: string
  callee?: string
}

export interface ScoreboardEffectSummary {
  name: string
  preservesUserScores: boolean
  barrier?: ScoreboardEffectBarrier
}

/** Find helpers safe for user-score read reuse, not general purity/motion. */
export function findScoreboardPreservingFunctions(mod: MIRModule): ReadonlySet<string> {
  return analyzeScoreboardEffects(mod).preservingCalls
}

/**
 * Arithmetic and reads still write compiler-owned temporary/parameter slots.
 * Unknown calls, macros, context/storage operations and recursive call graphs
 * remain unclassified. Reports explain the first conservative boundary without
 * claiming that an unproven helper actually mutates scores.
 */
export function analyzeScoreboardEffects(mod: MIRModule): {
  preservingCalls: ReadonlySet<string>
  functions: ScoreboardEffectSummary[]
} {
  const pending = new Map<string, number>()
  const dependencies = new Map<string, Set<string>>()
  const barriers = new Map<string, ScoreboardEffectBarrier>()
  const callers = new Map<string, Set<string>>()
  const ready: string[] = []
  const names = new Set(mod.functions.map(fn => fn.name))

  for (const fn of mod.functions) {
    const facts = preservingDependencies(fn)
    if (facts.barrier) {
      barriers.set(fn.name, facts.barrier)
      continue
    }
    dependencies.set(fn.name, facts.dependencies)
    pending.set(fn.name, facts.dependencies.size)
    if (facts.dependencies.size === 0) ready.push(fn.name)
    for (const dependency of facts.dependencies) {
      const incoming = callers.get(dependency) ?? new Set<string>()
      incoming.add(fn.name)
      callers.set(dependency, incoming)
    }
  }

  const preservingCalls = new Set<string>()
  for (let i = 0; i < ready.length; i++) {
    const name = ready[i]
    preservingCalls.add(name)
    for (const caller of callers.get(name) ?? []) {
      const remaining = pending.get(caller)! - 1
      pending.set(caller, remaining)
      if (remaining === 0) ready.push(caller)
    }
  }

  const functions = mod.functions.map(fn => {
    if (preservingCalls.has(fn.name)) return { name: fn.name, preservesUserScores: true }
    let barrier = barriers.get(fn.name)
    if (!barrier) {
      const callee = [...(dependencies.get(fn.name) ?? [])].find(name => !preservingCalls.has(name))
      barrier = { kind: callee && !names.has(callee) ? 'unknown-callee' : 'callee-not-proven', callee }
    }
    return { name: fn.name, preservesUserScores: false, barrier }
  }).sort((a, b) => a.name.localeCompare(b.name))
  return { preservingCalls, functions }
}

function preservingDependencies(fn: MIRFunction): {
  dependencies: Set<string>
  barrier?: ScoreboardEffectBarrier
} {
  const dependencies = new Set<string>()
  if (fn.isMacro) return { dependencies, barrier: { kind: 'macro-function' } }
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
          if (instr.fn.startsWith('__raw:')) return { dependencies, barrier: { kind: 'raw-call' } }
          dependencies.add(instr.fn)
          break
        default:
          return { dependencies, barrier: { kind: instr.kind } }
      }
    }
  }
  return { dependencies }
}
