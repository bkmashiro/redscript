/**
 * Optimization passes over IR.
 *
 * Each pass: IRFunction → IRFunction  (pure transformation)
 *
 * Pipeline order:
 *   1. constantFolding      — evaluate constant expressions at compile time
 *   2. copyPropagation      — eliminate redundant copies
 *   3. deadCodeElimination  — remove unused assignments
 *   4. commandMerging       — MC-specific: merge chained execute conditions
 */

import type { IRBlock, IRFunction, IRInstr, Operand } from '../ir/types'
import { createEmptyOptimizationStats, mergeOptimizationStats, type OptimizationStats } from './commands'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isConst(op: Operand): op is { kind: 'const'; value: number } {
  return op.kind === 'const'
}

function evalBinop(lhs: number, bop: string, rhs: number): number | null {
  switch (bop) {
    case '+': return lhs + rhs
    case '-': return lhs - rhs
    case '*': return lhs * rhs
    case '/': return rhs === 0 ? null : Math.trunc(lhs / rhs)  // MC uses truncated int division
    case '%': return rhs === 0 ? null : lhs % rhs
    default:  return null
  }
}

function evalCmp(lhs: number, cop: string, rhs: number): number {
  switch (cop) {
    case '==': return lhs === rhs ? 1 : 0
    case '!=': return lhs !== rhs ? 1 : 0
    case '<':  return lhs < rhs ? 1 : 0
    case '<=': return lhs <= rhs ? 1 : 0
    case '>':  return lhs > rhs ? 1 : 0
    case '>=': return lhs >= rhs ? 1 : 0
    default:   return 0
  }
}

// ---------------------------------------------------------------------------
// Pass 1: Constant Folding
// Evaluates expressions with all-constant operands at compile time.
// ---------------------------------------------------------------------------

export function constantFolding(fn: IRFunction): IRFunction {
  return constantFoldingWithStats(fn).fn
}

export function constantFoldingWithStats(fn: IRFunction): { fn: IRFunction; stats: Partial<OptimizationStats> } {
  let folded = 0
  const newBlocks = fn.blocks.map(block => {
    const newInstrs: IRInstr[] = []
    for (const instr of block.instrs) {
      if (instr.op === 'binop' && isConst(instr.lhs) && isConst(instr.rhs)) {
        const result = evalBinop(instr.lhs.value, instr.bop, instr.rhs.value)
        if (result !== null) {
          folded++
          newInstrs.push({ op: 'assign', dst: instr.dst, src: { kind: 'const', value: result } })
          continue
        }
      }
      if (instr.op === 'cmp' && isConst(instr.lhs) && isConst(instr.rhs)) {
        const result = evalCmp(instr.lhs.value, instr.cop, instr.rhs.value)
        folded++
        newInstrs.push({ op: 'assign', dst: instr.dst, src: { kind: 'const', value: result } })
        continue
      }
      newInstrs.push(instr)
    }
    return { ...block, instrs: newInstrs }
  })
  return { fn: { ...fn, blocks: newBlocks }, stats: { constantFolds: folded } }
}

// ---------------------------------------------------------------------------
// Pass 2: Copy Propagation
// Replaces uses of variables that are just copies with their source.
// e.g.  t0 = x;  y = t0 + 1  →  y = x + 1
// ---------------------------------------------------------------------------

export function copyPropagation(fn: IRFunction): IRFunction {
  // Build copy map within each block (single-block analysis for simplicity)
  const newBlocks = fn.blocks.map(block => {
    const copies = new Map<string, Operand>()  // var → its source if it's a copy

    function resolve(op: Operand): Operand {
      if (op.kind !== 'var') return op
      return copies.get(op.name) ?? op
    }

    const newInstrs: IRInstr[] = []
    for (const instr of block.instrs) {
      switch (instr.op) {
        case 'assign': {
          const src = resolve(instr.src)
          // Only propagate scalars (var or const), not storage
          if (src.kind === 'var' || src.kind === 'const') {
            copies.set(instr.dst, src)
          } else {
            copies.delete(instr.dst)
          }
          newInstrs.push({ ...instr, src })
          break
        }
        case 'binop':
          copies.delete(instr.dst)
          newInstrs.push({ ...instr, lhs: resolve(instr.lhs), rhs: resolve(instr.rhs) })
          break
        case 'cmp':
          copies.delete(instr.dst)
          newInstrs.push({ ...instr, lhs: resolve(instr.lhs), rhs: resolve(instr.rhs) })
          break
        case 'call':
          if (instr.dst) copies.delete(instr.dst)
          newInstrs.push({ ...instr, args: instr.args.map(resolve) })
          break
        default:
          newInstrs.push(instr)
      }
    }
    return { ...block, instrs: newInstrs }
  })
  return { ...fn, blocks: newBlocks }
}

// ---------------------------------------------------------------------------
// Pass 3: Dead Code Elimination
// Removes assignments to variables that are never read afterward.
// ---------------------------------------------------------------------------

export function deadCodeElimination(fn: IRFunction): IRFunction {
  return deadCodeEliminationWithStats(fn).fn
}

export function deadCodeEliminationWithStats(fn: IRFunction): { fn: IRFunction; stats: Partial<OptimizationStats> } {
  // Collect all reads across all blocks
  const readVars = new Set<string>()

  function markRead(op: Operand) {
    if (op.kind === 'var') readVars.add(op.name)
  }

  function markRawReads(cmd: string) {
    for (const match of cmd.matchAll(/\$[A-Za-z0-9_]+/g)) {
      readVars.add(match[0])
    }
  }

  for (const block of fn.blocks) {
    for (const instr of block.instrs) {
      if (instr.op === 'binop')   { markRead(instr.lhs); markRead(instr.rhs) }
      if (instr.op === 'cmp')     { markRead(instr.lhs); markRead(instr.rhs) }
      if (instr.op === 'call')    { instr.args.forEach(markRead) }
      if (instr.op === 'assign')  { markRead(instr.src) }
      if (instr.op === 'raw')     { markRawReads(instr.cmd) }
    }
    // Terminator reads
    const t = block.term
    if (t.op === 'jump_if' || t.op === 'jump_unless') readVars.add(t.cond)
    if (t.op === 'return' && t.value) markRead(t.value)
    if (t.op === 'tick_yield') { /* no reads */ }
  }

  // Also keep params and globals
  fn.params.forEach(p => readVars.add(p))

  let removed = 0
  const newBlocks = fn.blocks.map(block => ({
    ...block,
    instrs: block.instrs.filter(instr => {
      // Only assignments/binops/cmps with an unused dst are candidates for removal
      if (instr.op === 'assign' || instr.op === 'binop' || instr.op === 'cmp') {
        const keep = readVars.has(instr.dst)
        if (!keep) removed++
        return keep
      }
      // calls may have side effects — keep them always
      return true
    }),
  }))

  return { fn: { ...fn, blocks: newBlocks }, stats: { deadCodeRemoved: removed } }
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export interface OptimizationPass {
  name: string
  run: (fn: IRFunction) => IRFunction
}

export const defaultPipeline: OptimizationPass[] = [
  { name: 'constant-folding',      run: constantFolding },
  { name: 'copy-propagation',      run: copyPropagation },
  { name: 'dead-code-elimination', run: deadCodeElimination },
  // commandMerging is applied during codegen (MC-specific)
]

export function optimize(fn: IRFunction, passes = defaultPipeline): IRFunction {
  return optimizeWithStats(fn, passes).fn
}

export function optimizeWithStats(fn: IRFunction, passes = defaultPipeline): { fn: IRFunction; stats: OptimizationStats } {
  let current = fn
  const stats = createEmptyOptimizationStats()

  for (const pass of passes) {
    if (pass.name === 'constant-folding') {
      const result = constantFoldingWithStats(current)
      current = result.fn
      mergeOptimizationStats(stats, result.stats)
      continue
    }
    if (pass.name === 'dead-code-elimination') {
      const result = deadCodeEliminationWithStats(current)
      current = result.fn
      mergeOptimizationStats(stats, result.stats)
      continue
    }
    current = pass.run(current)
  }

  return { fn: current, stats }
}
