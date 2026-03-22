/**
 * Common Subexpression Elimination (CSE) — MIR optimization pass.
 *
 * Performs local (intra-block) CSE: within each BasicBlock, if a pure
 * computation has already been computed and its operands haven't been
 * overwritten since, reuse the previous result via a `copy` instead of
 * recomputing.
 *
 * Pure instructions considered:
 *   add, sub, mul, div, mod, neg, cmp, and, or, not
 *
 * Side-effect instructions that invalidate expressions when their
 * destination (or any operand) is overwritten:
 *   score_write, nbt_write, nbt_write_dynamic, call, call_macro,
 *   call_context, and any instruction that redefines a temp.
 *
 * Global (cross-block) CSE is not performed — only per-block.
 */

import type { MIRFunction, MIRBlock, MIRInstr, Operand, Temp } from '../mir/types'

// ---------------------------------------------------------------------------
// Expression key helpers
// ---------------------------------------------------------------------------

function operandKey(op: Operand): string {
  return op.kind === 'const' ? `c:${op.value}` : `t:${op.name}`
}

/** Commutative ops — operand order doesn't matter. */
const COMMUTATIVE = new Set(['add', 'mul', 'and', 'or'])

function exprKey(instr: MIRInstr): string | null {
  switch (instr.kind) {
    case 'add':
    case 'sub':
    case 'mul':
    case 'div':
    case 'mod':
    case 'and':
    case 'or': {
      const ka = operandKey(instr.a)
      const kb = operandKey(instr.b)
      const [l, r] = COMMUTATIVE.has(instr.kind) && ka > kb ? [kb, ka] : [ka, kb]
      return `${instr.kind}:${l}:${r}`
    }
    case 'neg':
    case 'not':
      return `${instr.kind}:${operandKey(instr.src)}`
    case 'cmp': {
      const ka = operandKey(instr.a)
      const kb = operandKey(instr.b)
      return `cmp:${instr.op}:${ka}:${kb}`
    }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Temp defined by an instruction
// ---------------------------------------------------------------------------

function getDst(instr: MIRInstr): Temp | null {
  switch (instr.kind) {
    case 'const': case 'copy': case 'add': case 'sub': case 'mul':
    case 'div': case 'mod': case 'neg': case 'not': case 'and':
    case 'or': case 'cmp': case 'string_match': case 'nbt_read':
    case 'nbt_read_dynamic': case 'nbt_list_len': case 'score_read':
      return instr.dst
    case 'call': case 'call_macro':
      return instr.dst
    default:
      return null
  }
}

/** Temps used as operands in an instruction (for invalidation). */
function getUsedTemps(instr: MIRInstr): Temp[] {
  const temps: Temp[] = []
  const add = (op: Operand) => { if (op.kind === 'temp') temps.push(op.name) }
  switch (instr.kind) {
    case 'copy': add(instr.src); break
    case 'neg': case 'not': add(instr.src); break
    case 'add': case 'sub': case 'mul': case 'div': case 'mod': case 'pow':
    case 'and': case 'or': add(instr.a); add(instr.b); break
    case 'cmp': add(instr.a); add(instr.b); break
    case 'nbt_write': add(instr.src); break
    case 'nbt_write_dynamic': add(instr.indexSrc); add(instr.valueSrc); break
    case 'nbt_read_dynamic': add(instr.indexSrc); break
    case 'score_write': add(instr.src); break
    case 'call': instr.args.forEach(add); break
    case 'call_macro': instr.args.forEach(a => add(a.value)); break
    case 'branch': add(instr.cond); break
    case 'return': if (instr.value) add(instr.value); break
    case 'jump': break
  }
  return temps
}

// ---------------------------------------------------------------------------
// Block-level CSE
// ---------------------------------------------------------------------------

function cseBlock(block: MIRBlock): MIRBlock {
  // Map: expression key → temp holding the already-computed result
  const available = new Map<string, Temp>()
  // Map: temp → set of expression keys that depend on it (for invalidation)
  const tempDeps = new Map<Temp, Set<string>>()

  function recordDep(key: string, deps: Temp[]) {
    for (const dep of deps) {
      if (!tempDeps.has(dep)) tempDeps.set(dep, new Set())
      tempDeps.get(dep)!.add(key)
    }
  }

  function invalidate(temp: Temp) {
    // Remove all expressions that depend on this temp
    const keys = tempDeps.get(temp)
    if (keys) {
      for (const key of keys) {
        available.delete(key)
      }
      tempDeps.delete(temp)
    }
    // Also remove any expression whose result was stored in this temp
    for (const [key, resultTemp] of available) {
      if (resultTemp === temp) {
        available.delete(key)
      }
    }
  }

  const instrs: MIRInstr[] = []

  for (const instr of block.instrs) {
    const key = exprKey(instr)

    if (key !== null) {
      const existing = available.get(key)
      if (existing !== undefined) {
        // Replace with a copy from the already-computed temp
        const dst = getDst(instr)!
        instrs.push({ kind: 'copy', dst, src: { kind: 'temp', name: existing } })
        // Don't update available[key] — the original mapping stays valid
        // But do invalidate any previous mapping for dst if it existed
        invalidate(dst)
        // Record dst as another name for the result (through copy)
        // No need to add to available again; the original key still maps to existing
        continue
      }
    }

    // Process instruction normally
    const dst = getDst(instr)
    if (dst !== null) {
      // Invalidate expressions that used the old value of dst
      invalidate(dst)
    }

    if (key !== null && dst !== null) {
      // Record this new expression
      available.set(key, dst)
      // Track which temps this expression depends on
      const deps = getUsedTemps(instr)
      recordDep(key, deps)
    } else if (
      // Side-effect instructions that may alias-write through external state:
      // call, call_macro, call_context, score_write, nbt_write, nbt_write_dynamic
      // These don't define a Temp dst we can track, but they invalidate expressions
      // that read from the same external state. For safety, clear all non-temp
      // expressions (conservative approach for local CSE).
      instr.kind === 'call' ||
      instr.kind === 'call_macro' ||
      instr.kind === 'call_context' ||
      instr.kind === 'score_write' ||
      instr.kind === 'nbt_write' ||
      instr.kind === 'nbt_write_dynamic'
    ) {
      // For calls and writes, we conservatively clear ALL available expressions
      // since they may have side effects or alias effects we can't track locally.
      available.clear()
      tempDeps.clear()
    }

    instrs.push(instr)
  }

  return { ...block, instrs }
}

// ---------------------------------------------------------------------------
// Public pass entry point
// ---------------------------------------------------------------------------

export function cse(fn: MIRFunction): MIRFunction {
  return {
    ...fn,
    blocks: fn.blocks.map(cseBlock),
  }
}
