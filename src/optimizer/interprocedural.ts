/**
 * Interprocedural Constant Propagation — MIR module-level optimization pass.
 *
 * For each call site where all arguments are compile-time constants, creates
 * a specialized clone of the callee with the parameters substituted as
 * constants, then runs constant folding on the clone.
 *
 * Specialized function naming: `original__const_N1_N2_...` where N1, N2 are
 * the constant argument values.
 *
 * This pass iterates to fixpoint to handle transitively specialized callees.
 */

import type { MIRFunction, MIRModule, MIRBlock, MIRInstr, Operand, Temp } from '../mir/types'
import { constantFold } from './constant_fold'

export function interproceduralConstProp(mod: MIRModule): MIRModule {
  let current = mod
  // Iterate to fixpoint (new specializations may enable further specializations)
  for (let i = 0; i < 10; i++) {
    const next = runOnePass(current)
    if (next.functions.length === current.functions.length &&
        JSON.stringify(next.functions.map(f => f.name)) === JSON.stringify(current.functions.map(f => f.name))) {
      // No new specializations
      return next
    }
    current = next
  }
  return current
}

function runOnePass(mod: MIRModule): MIRModule {
  const fnMap = new Map<string, MIRFunction>(mod.functions.map(f => [f.name, f]))
  const newFunctions: MIRFunction[] = [...mod.functions]
  const added = new Set<string>()

  for (const fn of mod.functions) {
    for (const block of fn.blocks) {
      for (const instr of block.instrs) {
        if (instr.kind !== 'call') continue
        if (instr.args.length === 0) continue
        if (!instr.args.every(a => a.kind === 'const')) continue

        const callee = fnMap.get(instr.fn)
        if (!callee) continue
        if (callee.isMacro) continue
        if (callee.name === fn.name) continue // no direct recursion at call site
        if (callee.params.length !== instr.args.length) continue
        // Skip if the callee is self-recursive (would cause infinite specialization)
        if (isSelfRecursive(callee)) continue
        // Only specialize single-block (loop-free) functions — loop bodies mutate
        // variables in ways that make constant-param substitution unsafe.
        if (callee.blocks.length > 1) continue

        const constArgs = instr.args as { kind: 'const'; value: number }[]
        const mangledName = mangleName(instr.fn, constArgs.map(a => a.value))

        if (fnMap.has(mangledName) || added.has(mangledName)) continue

        // Create specialized clone
        const specialized = specialize(callee, constArgs.map(a => a.value), mangledName, mod.objective)
        newFunctions.push(specialized)
        added.add(mangledName)
        fnMap.set(mangledName, specialized)
      }
    }
  }

  if (added.size === 0) return mod

  // Rewrite call sites to use specialized names
  const updatedFunctions = newFunctions.map(fn => rewriteCallSites(fn, fnMap))

  return { ...mod, functions: updatedFunctions }
}

/** Returns true if the function contains a call to itself (direct recursion). */
function isSelfRecursive(fn: MIRFunction): boolean {
  for (const block of fn.blocks) {
    for (const instr of block.instrs) {
      if (instr.kind === 'call' && instr.fn === fn.name) return true
      if (instr.kind === 'call_macro' && instr.fn === fn.name) return true
    }
  }
  return false
}

function mangleName(name: string, args: number[]): string {
  return `${name}__const_${args.map(v => v < 0 ? `n${Math.abs(v)}` : String(v)).join('_')}`
}

/**
 * Returns true if the function has any __raw: calls that directly reference
 * scoreboard param slots ($p0, $p1, ...) by name in the raw command string.
 * Such functions use the raw() pattern to read params via scoreboard, so the
 * specialized clone must pre-set those slots before executing the body.
 */
function hasRawParamRefs(fn: MIRFunction, paramCount: number): boolean {
  for (let i = 0; i < paramCount; i++) {
    const pattern = `$p${i}`
    for (const block of fn.blocks) {
      for (const instr of block.instrs) {
        if (instr.kind === 'call' && instr.fn.startsWith('__raw:') && instr.fn.includes(pattern)) {
          return true
        }
      }
    }
  }
  return false
}

function specialize(fn: MIRFunction, args: number[], newName: string, objective: string): MIRFunction {
  // Build substitution map: param.name → const operand
  const sub = new Map<Temp, Operand>()
  for (let i = 0; i < fn.params.length; i++) {
    sub.set(fn.params[i].name, { kind: 'const', value: args[i] })
  }

  const newBlocks = fn.blocks.map(block => substituteBlock(block, sub))

  // If the function uses raw() commands that read from $p<i> scoreboard slots
  // directly, we must pre-set those slots in the entry block so the raw commands
  // see the correct values (the normal call convention sets $p<i> at the call
  // site, but the specialized function is called with no args).
  if (hasRawParamRefs(fn, args.length)) {
    const entryBlock = newBlocks.find(b => b.id === fn.entry)
    if (entryBlock) {
      const scoreWrites: MIRInstr[] = args.map((value, i) => ({
        kind: 'score_write' as const,
        player: `$p${i}`,
        obj: objective,
        src: { kind: 'const' as const, value },
      }))
      entryBlock.instrs = [...scoreWrites, ...entryBlock.instrs]
    }
  }

  const specialized: MIRFunction = {
    ...fn,
    name: newName,
    params: [], // no params — all specialized
    blocks: newBlocks,
    isMacro: false,
  }

  // Run constant folding on the specialized function
  return constantFold(specialized)
}

function substituteBlock(block: MIRBlock, sub: Map<Temp, Operand>): MIRBlock {
  const instrs = block.instrs.map(instr => substituteInstr(instr, sub))
  const term = substituteInstr(block.term, sub)
  return { ...block, instrs, term }
}

function substituteOp(op: Operand, sub: Map<Temp, Operand>): Operand {
  if (op.kind === 'temp') {
    const replacement = sub.get(op.name)
    if (replacement !== undefined) return replacement
  }
  return op
}

function substituteInstr(instr: MIRInstr, sub: Map<Temp, Operand>): MIRInstr {
  switch (instr.kind) {
    case 'copy': return { ...instr, src: substituteOp(instr.src, sub) }
    case 'neg': case 'not': return { ...instr, src: substituteOp(instr.src, sub) }
    case 'add': case 'sub': case 'mul': case 'div': case 'mod': case 'pow':
    case 'and': case 'or':
      return { ...instr, a: substituteOp(instr.a, sub), b: substituteOp(instr.b, sub) }
    case 'cmp':
      return { ...instr, a: substituteOp(instr.a, sub), b: substituteOp(instr.b, sub) }
    case 'score_write':
      return { ...instr, src: substituteOp(instr.src, sub) }
    case 'score_read':
      return instr  // no substitutable operands (player/obj are strings)
    case 'nbt_write':
      return { ...instr, src: substituteOp(instr.src, sub) }
    case 'nbt_read_dynamic':
      return { ...instr, indexSrc: substituteOp(instr.indexSrc, sub) }
    case 'nbt_write_dynamic':
      return { ...instr, indexSrc: substituteOp(instr.indexSrc, sub), valueSrc: substituteOp(instr.valueSrc, sub) }
    case 'call':
      return { ...instr, args: instr.args.map(a => substituteOp(a, sub)) }
    case 'call_macro':
      return { ...instr, args: instr.args.map(a => ({ ...a, value: substituteOp(a.value, sub) })) }
    case 'branch':
      return { ...instr, cond: substituteOp(instr.cond, sub) }
    case 'return':
      return { ...instr, value: instr.value ? substituteOp(instr.value, sub) : null }
    default:
      return instr
  }
}

function rewriteCallSites(fn: MIRFunction, fnMap: Map<string, MIRFunction>): MIRFunction {
  return {
    ...fn,
    blocks: fn.blocks.map(block => ({
      ...block,
      instrs: block.instrs.map(instr => {
        if (instr.kind !== 'call') return instr
        if (!instr.args.every(a => a.kind === 'const')) return instr
        const callee = fnMap.get(instr.fn)
        if (!callee) return instr
        if (callee.isMacro) return instr
        if (callee.name === fn.name) return instr
        if (callee.params.length !== instr.args.length) return instr

        const constArgs = instr.args as { kind: 'const'; value: number }[]
        const mangledName = mangleName(instr.fn, constArgs.map(a => a.value))
        if (!fnMap.has(mangledName)) return instr

        return { ...instr, fn: mangledName, args: [] }
      }),
      term: (() => {
        const term = block.term
        if (term.kind !== 'call') return term
        return term
      })(),
    })),
  }
}
