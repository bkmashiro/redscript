/**
 * Static Tick Budget Analysis — Phase 1a
 *
 * Estimates the number of MC commands a function will execute at runtime.
 * Used to warn when loops may exceed Minecraft's maxCommandChainLength (65536).
 *
 * In LIR, loops are represented as mutually-recursive function calls
 * (e.g., fn__header ↔ fn__body). This module detects call-graph cycles
 * and multiplies the loop body cost by an estimated iteration count.
 */

import type { LIRModule, LIRFunction, LIRInstr } from './types'

/** Default estimated iteration count when the upper bound is unknown */
const DEFAULT_LOOP_ITERATIONS = 100

/**
 * Warning threshold for estimated command count.
 *
 * When a function's estimated command count exceeds this value (32768), a
 * `'warning'` diagnostic is emitted suggesting the function be annotated with
 * `@coroutine` to spread execution across multiple ticks.
 *
 * Set to half of {@link BUDGET_ERROR_THRESHOLD} to give authors headroom.
 */
export const BUDGET_WARN_THRESHOLD = 32768

/**
 * Error threshold for estimated command count.
 *
 * Minecraft's `maxCommandChainLength` game rule defaults to 65536. When a
 * function's estimated command count exceeds this value an `'error'` diagnostic
 * is emitted, because the function will likely crash at runtime by hitting that
 * hard limit.
 */
export const BUDGET_ERROR_THRESHOLD = 65536

/**
 * A single diagnostic produced by {@link analyzeBudget}.
 *
 * - `level` — `'warning'` when the estimate exceeds {@link BUDGET_WARN_THRESHOLD};
 *   `'error'` when it exceeds {@link BUDGET_ERROR_THRESHOLD}.
 * - `fnName` — the unqualified (no namespace prefix) function name.
 * - `estimatedCommands` — the estimated total MC command count, including all
 *   transitive callees and loop-iteration multipliers.
 * - `message` — a human-readable string suitable for display in the CLI or IDE.
 */
export interface BudgetDiagnostic {
  level: 'warning' | 'error'
  fnName: string
  estimatedCommands: number
  message: string
}

// ---------------------------------------------------------------------------
// Call graph utilities
// ---------------------------------------------------------------------------

/** Extract all function names called by an instruction */
function getCalledFunctions(instr: LIRInstr): string[] {
  switch (instr.kind) {
    case 'call':
    case 'call_macro':
      return [instr.fn]
    case 'call_if_matches':
    case 'call_unless_matches':
    case 'call_if_score':
    case 'call_unless_score':
    case 'call_context':
      return [instr.fn]
    case 'store_cmd_to_score':
      // The nested cmd may also be a call
      return getCalledFunctions(instr.cmd)
    default:
      return []
  }
}

/** Build adjacency list: fnName → set of called function names (module-local only) */
function buildCallGraph(mod: LIRModule): Map<string, Set<string>> {
  const fnNames = new Set(mod.functions.map(f => f.name))
  const graph = new Map<string, Set<string>>()

  for (const fn of mod.functions) {
    const callees = new Set<string>()
    for (const instr of fn.instructions) {
      for (const callee of getCalledFunctions(instr)) {
        // Strip namespace prefix to match local function names
        const local = stripNamespace(callee, mod.namespace)
        if (fnNames.has(local)) {
          callees.add(local)
        }
      }
    }
    graph.set(fn.name, callees)
  }

  return graph
}

/** Strip "namespace:" prefix from a qualified function name */
function stripNamespace(qualifiedName: string, namespace: string): string {
  const prefix = `${namespace}:`
  if (qualifiedName.startsWith(prefix)) {
    return qualifiedName.slice(prefix.length)
  }
  return qualifiedName
}

/** Find all strongly connected components (Tarjan's algorithm) */
function findSCCs(graph: Map<string, Set<string>>): string[][] {
  let index = 0
  const stack: string[] = []
  const onStack = new Set<string>()
  const indices = new Map<string, number>()
  const lowlinks = new Map<string, number>()
  const sccs: string[][] = []

  function strongconnect(v: string): void {
    indices.set(v, index)
    lowlinks.set(v, index)
    index++
    stack.push(v)
    onStack.add(v)

    for (const w of graph.get(v) ?? []) {
      if (!indices.has(w)) {
        strongconnect(w)
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!))
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!))
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = []
      let w: string
      do {
        w = stack.pop()!
        onStack.delete(w)
        scc.push(w)
      } while (w !== v)
      sccs.push(scc)
    }
  }

  for (const v of graph.keys()) {
    if (!indices.has(v)) {
      strongconnect(v)
    }
  }

  return sccs
}

// ---------------------------------------------------------------------------
// Command count estimation
// ---------------------------------------------------------------------------

/** Count the number of MC commands an instruction generates (non-recursive) */
function instrCommandCount(instr: LIRInstr): number {
  switch (instr.kind) {
    case 'store_cmd_to_score':
      // The execute store wrapper + the inner command
      return 1
    default:
      // Each LIR instruction maps to ~1 MC command
      return 1
  }
}

/** Count raw (non-call) commands in a function */
function localCommandCount(fn: LIRFunction): number {
  let count = 0
  for (const instr of fn.instructions) {
    count += instrCommandCount(instr)
  }
  return count
}

/**
 * Try to extract a constant loop bound from a loop's LIR functions.
 *
 * Looks for patterns like:
 *   score_set <limit_slot> <N>
 * in the cycle's functions, where N is used as a comparison bound.
 *
 * Returns the bound if found, otherwise DEFAULT_LOOP_ITERATIONS.
 */
function estimateLoopIterations(cycleFns: LIRFunction[]): number {
  // Look for score_set instructions that might be loop bounds
  // Heuristic: find the largest constant set in the cycle's callers
  // that looks like a loop limit (typically set before the loop)
  for (const fn of cycleFns) {
    for (const instr of fn.instructions) {
      if (instr.kind === 'call_if_matches' || instr.kind === 'call_unless_matches') {
        // Parse range like "..999" or "0..999" to extract upper bound
        const range = instr.range
        const match = range.match(/\.\.(\d+)/)
        if (match) {
          return parseInt(match[1], 10) + 1
        }
      }
    }
  }

  return DEFAULT_LOOP_ITERATIONS
}

/**
 * Estimate the total number of MC commands a function will execute at runtime,
 * including all transitive callees and loop-body repetitions.
 *
 * **Algorithm overview**
 * 1. Build a module-local call graph (cross-namespace calls are ignored and
 *    contribute 0 to the estimate).
 * 2. Decompose the graph into strongly-connected components (SCCs) via
 *    Tarjan's algorithm. Each SCC with more than one node, or a single node
 *    that calls itself, represents a loop.
 * 3. For each cyclic SCC the cost is:
 *    `(sum of local commands across all SCC members + external callee cost) × iterations`
 *    where `iterations` is inferred from `call_if_matches` / `call_unless_matches`
 *    range bounds (e.g. `..99` → 100) or {@link DEFAULT_LOOP_ITERATIONS} (100)
 *    when no bound is found.
 * 4. For non-cyclic functions the cost is the local command count plus the
 *    recursively estimated cost of each callee.
 * 5. Results are memoized per function name to avoid redundant work.
 *
 * **Edge cases**
 * - If `fnName` does not exist in `mod`, returns `0`.
 * - Cross-namespace calls (those whose namespace prefix doesn't match
 *   `mod.namespace`) are treated as 0-cost leaf nodes.
 * - `store_cmd_to_score` wraps an inner instruction; both are counted as
 *   1 command each (the outer `execute store … run` always executes exactly
 *   one command regardless of the inner result).
 * - Mutually-recursive functions that form a cycle are all assigned the same
 *   estimated cost (the whole cycle cost), so calling any member of the cycle
 *   from outside yields the same estimate.
 *
 * @param fnName - Unqualified (no namespace prefix) name of the function to
 *   estimate.  Must match `LIRFunction.name` exactly.
 * @param mod - The LIR module that contains the function and all its callees.
 * @returns Estimated number of MC `function` commands (≥ 0).  The value is a
 *   heuristic — it may over- or under-estimate for highly dynamic code.
 */
export function estimateCommandCount(fnName: string, mod: LIRModule): number {
  const fnMap = new Map<string, LIRFunction>()
  for (const fn of mod.functions) {
    fnMap.set(fn.name, fn)
  }

  const callGraph = buildCallGraph(mod)
  const sccs = findSCCs(callGraph)

  // Map each function to its SCC
  const fnToSCC = new Map<string, string[]>()
  for (const scc of sccs) {
    for (const name of scc) {
      fnToSCC.set(name, scc)
    }
  }

  // Memoize estimated counts
  const memo = new Map<string, number>()

  function estimate(name: string, visiting: Set<string>): number {
    if (memo.has(name)) return memo.get(name)!

    const fn = fnMap.get(name)
    if (!fn) return 0

    // Detect cycle: if we're already visiting this function, return 0
    // (cycle cost is handled at the SCC level)
    if (visiting.has(name)) return 0

    visiting.add(name)

    const scc = fnToSCC.get(name)!
    const isCyclic = scc.length > 1 || (scc.length === 1 && callGraph.get(name)?.has(name))

    if (isCyclic) {
      // Sum local commands across all functions in the cycle
      let cycleLocalCost = 0
      for (const member of scc) {
        const memberFn = fnMap.get(member)
        if (memberFn) cycleLocalCost += localCommandCount(memberFn)
      }

      // Estimate iterations
      const cycleFns = scc.map(n => fnMap.get(n)!).filter(Boolean)
      const iterations = estimateLoopIterations(cycleFns)

      // Also add cost of non-cycle callees
      let externalCalleeCost = 0
      for (const member of scc) {
        for (const callee of callGraph.get(member) ?? []) {
          if (!scc.includes(callee)) {
            externalCalleeCost += estimate(callee, new Set(visiting))
          }
        }
      }

      const total = (cycleLocalCost + externalCalleeCost) * iterations
      // Memoize for all members of this SCC
      for (const member of scc) {
        memo.set(member, total)
      }
      visiting.delete(name)
      return total
    }

    // Non-cyclic: local cost + callee costs
    let total = localCommandCount(fn)
    for (const callee of callGraph.get(name) ?? []) {
      total += estimate(callee, visiting)
    }

    memo.set(name, total)
    visiting.delete(name)
    return total
  }

  return estimate(fnName, new Set())
}

// ---------------------------------------------------------------------------
// Budget analysis for a full module
// ---------------------------------------------------------------------------

/**
 * Analyze all user-defined top-level functions in a module for tick-budget
 * violations, returning one diagnostic per offending function.
 *
 * **What counts as a "top-level" function?**
 * Only functions whose names pass all three of the following filters are
 * analyzed — the rest are skipped silently:
 * 1. Not in `coroutineFunctions` — functions annotated `@coroutine` are
 *    intentionally spread across ticks and cannot exceed the per-tick budget.
 * 2. Name does not contain `__` — compiler-generated helper blocks such as
 *    `myloop__header` and `myloop__body` are internal implementation details;
 *    they are reachable only via their parent function, which *is* analyzed.
 * 3. Name does not start with `_coro_` — coroutine continuation functions
 *    emitted by the compiler are also exempt.
 *
 * For each surviving function, {@link estimateCommandCount} is called and the
 * result compared against the two thresholds:
 * - `> BUDGET_ERROR_THRESHOLD` (65536) → `'error'`
 * - `> BUDGET_WARN_THRESHOLD`  (32768) → `'warning'`
 *
 * **Ordering** — diagnostics are returned in the same order as
 * `mod.functions`, with at most one diagnostic per function.  An `'error'`
 * takes precedence: a function that exceeds both thresholds only gets an
 * error, never a warning as well.
 *
 * @param mod - The LIR module to analyze.  All functions in the module are
 *   used for call-graph construction even if they are individually skipped.
 * @param coroutineFunctions - Optional set of unqualified function names that
 *   are marked `@coroutine` and should be excluded from budget checking.
 *   Defaults to an empty set.
 * @returns An array of {@link BudgetDiagnostic} objects.  Empty when no
 *   function exceeds the warning threshold.
 */
export function analyzeBudget(
  mod: LIRModule,
  coroutineFunctions: Set<string> = new Set(),
): BudgetDiagnostic[] {
  const diagnostics: BudgetDiagnostic[] = []

  // Only analyze user-defined "root" functions, not compiler-generated helper blocks
  // Helper blocks have names like "fnname__blockid"
  for (const fn of mod.functions) {
    // Skip coroutine-annotated functions
    if (coroutineFunctions.has(fn.name)) continue

    // Skip compiler-generated helper functions (contain __)
    if (fn.name.includes('__')) continue

    // Skip coroutine-generated functions
    if (fn.name.startsWith('_coro_')) continue

    const estimated = estimateCommandCount(fn.name, mod)

    if (estimated > BUDGET_ERROR_THRESHOLD) {
      diagnostics.push({
        level: 'error',
        fnName: fn.name,
        estimatedCommands: estimated,
        message: `function '${fn.name}' may exceed tick budget (~${estimated} commands), this will likely crash. Consider @coroutine or reducing loop iterations`,
      })
    } else if (estimated > BUDGET_WARN_THRESHOLD) {
      diagnostics.push({
        level: 'warning',
        fnName: fn.name,
        estimatedCommands: estimated,
        message: `loop may exceed tick budget (~${estimated} commands), consider @coroutine`,
      })
    }
  }

  return diagnostics
}
