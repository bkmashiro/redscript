/** Bounded constant-argument specialization on the existing MIR path. */
import type { MIRFunction, MIRModule, MIRBlock, MIRInstr, Operand, Temp } from '../mir/types'
import { constantFold } from './constant_fold'
import { findScoreboardPreservingFunctions } from './scoreboard-effects'

// Engineering guards on code growth, not Minecraft limits or measured optima.
export const SPECIALIZATION_LIMITS = {
  perFunction: 8,
  perModule: 64,
  bodyInstructions: 64,
  rounds: 10,
  generatedNameLength: 240,
} as const

export function interproceduralConstProp(mod: MIRModule): MIRModule {
  const original = new Map(mod.functions.map(fn => [fn.name, fn]))
  const functions = new Map(original)
  // Removing an ineligible function also makes its callers unproven. This
  // propagates ABI/rounding boundaries transitively, not just one call deep.
  const partialEligible = findScoreboardPreservingFunctions({
    ...mod,
    functions: mod.functions.filter(fn => fn.blocks.every(block => block.instrs.every(instr =>
      instr.kind !== 'div' && instr.kind !== 'mod' &&
      !(instr.kind === 'score_read' && (instr.obj === mod.objective ||
        (instr.player.startsWith('@') && instr.player !== '@s')))))),
  })
  const origins = new Map(mod.functions.map(fn => [fn.name, fn.name]))
  const recursive = new Map<string, boolean>()
  const generated = new Map<string, string>()
  const counts = new Map<string, number>()
  let current = mod

  for (let round = 0; round < SPECIALIZATION_LIMITS.rounds; round++) {
    const additions: MIRFunction[] = []
    let changed = false
    const updated = current.functions.map(fn => ({
      ...fn,
      blocks: fn.blocks.map(block => ({
        ...block,
        instrs: block.instrs.map(instr => {
          if (instr.kind !== 'call' || !instr.args.some(arg => arg.kind === 'const')) return instr
          const callee = functions.get(instr.fn)
          if (!callee || callee.isMacro || callee.params.some(param => param.isMacroParam) ||
            callee.params.length !== instr.args.length || callee.blocks.length !== 1 ||
            callee.blocks[0].term.kind !== 'return' ||
            callee.blocks[0].instrs.length > SPECIALIZATION_LIMITS.bodyInstructions) return instr
          if (instr.args.some(arg => arg.kind === 'const' &&
            (!Number.isInteger(arg.value) || arg.value < -2147483648 || arg.value > 2147483647))) return instr

          const origin = origins.get(callee.name)!
          if (mod.specializationBarriers?.has(origin)) return instr
          if (!recursive.has(origin)) recursive.set(origin, isRecursive(origin, original))
          if (recursive.get(origin)) return instr
          const partial = instr.args.some(arg => arg.kind !== 'const')
          if (callee.blocks[0].instrs.some(op => op.kind === 'score_read' && op.obj === mod.objective)) return instr
          // Partial calls change physical parameter numbering. Limit the first
          // version to proven ordinary helpers, without raw/context/storage ABI
          // dependencies. Division rounding is a pending language decision.
          if (partial && !partialEligible.has(origin)) return instr

          const pattern = instr.args.map(arg => arg.kind === 'const' ? arg.value : null)
          const key = JSON.stringify([callee.name, pattern])
          let name = generated.get(key)
          if (!name) {
            if (generated.size >= SPECIALIZATION_LIMITS.perModule ||
              (counts.get(origin) ?? 0) >= SPECIALIZATION_LIMITS.perFunction) return instr
            const suffix = pattern.map(value => value === null ? 'x' : value < 0 ? `n${-value}` : String(value)).join('_')
            const stem = `${callee.name}__${partial ? 'partial' : 'const'}_${suffix}`
            name = stem
            for (let collision = 1; functions.has(name); collision++) name = `${stem}__spec${collision}`
            if (name.length > SPECIALIZATION_LIMITS.generatedNameLength) return instr
            const specialized = specialize(callee, instr.args, name, mod.objective)
            generated.set(key, name)
            counts.set(origin, (counts.get(origin) ?? 0) + 1)
            origins.set(name, origin)
            functions.set(name, specialized)
            additions.push(specialized)
          }
          changed = true
          return { ...instr, fn: name, args: instr.args.filter(arg => arg.kind !== 'const') }
        }),
      })),
    }))
    if (!changed) return current
    current = { ...current, functions: [...updated, ...additions] }
    for (const fn of updated) functions.set(fn.name, fn)
  }
  return current
}

function isRecursive(name: string, functions: ReadonlyMap<string, MIRFunction>): boolean {
  const visited = new Set<string>()
  const work = [name]
  while (work.length > 0) {
    const current = work.pop()!
    if (visited.has(current)) continue
    visited.add(current)
    for (const block of functions.get(current)?.blocks ?? []) {
      for (const instr of block.instrs) {
        if (instr.kind !== 'call' && instr.kind !== 'call_macro' && instr.kind !== 'call_context') continue
        if (instr.fn === name) return true
        if (functions.has(instr.fn)) work.push(instr.fn)
      }
    }
  }
  return false
}

function hasRawParamRefs(fn: MIRFunction): boolean {
  return fn.blocks.some(block => block.instrs.some(instr => instr.kind === 'call' &&
    instr.fn.startsWith('__raw:') && /\$p\d+\b/.test(instr.fn)))
}

function specialize(fn: MIRFunction, args: Operand[], name: string, objective: string): MIRFunction {
  const sub = new Map<Temp, Operand>()
  fn.params.forEach((param, index) => {
    if (args[index].kind === 'const') sub.set(param.name, args[index])
  })
  const blocks = fn.blocks.map(block => substituteBlock(block, sub))
  // Preserve the existing full-constant raw-ABI behavior. Partial specialization
  // never admits raw helpers, so parameter renumbering cannot reach this path.
  if (hasRawParamRefs(fn)) {
    const entry = blocks.find(block => block.id === fn.entry)!
    entry.instrs = [
      ...args.flatMap((arg, index): MIRInstr[] => arg.kind === 'const' ? [{
        kind: 'score_write', player: `$p${index}`, obj: objective, src: arg,
      }] : []),
      ...entry.instrs,
    ]
  }
  return constantFold({ ...fn, name, params: fn.params.filter((_param, index) => args[index].kind !== 'const'), blocks })
}

function substituteBlock(block: MIRBlock, bindings: ReadonlyMap<Temp, Operand>): MIRBlock {
  const sub = new Map(bindings)
  const instrs = block.instrs.map(instr => {
    const substituted = substituteInstr(instr, sub)
    if ('dst' in instr && instr.dst !== null) sub.delete(instr.dst)
    return substituted
  })
  return { ...block, instrs, term: substituteInstr(block.term, sub) }
}

function substituteOp(op: Operand, sub: ReadonlyMap<Temp, Operand>): Operand {
  return op.kind === 'temp' ? sub.get(op.name) ?? op : op
}

function substituteInstr(instr: MIRInstr, sub: ReadonlyMap<Temp, Operand>): MIRInstr {
  switch (instr.kind) {
    case 'copy': case 'neg': case 'not': return { ...instr, src: substituteOp(instr.src, sub) }
    case 'add': case 'sub': case 'mul': case 'div': case 'mod': case 'pow': case 'and': case 'or': case 'cmp':
      return { ...instr, a: substituteOp(instr.a, sub), b: substituteOp(instr.b, sub) }
    case 'score_write': case 'nbt_write': return { ...instr, src: substituteOp(instr.src, sub) }
    case 'nbt_read_dynamic': return { ...instr, indexSrc: substituteOp(instr.indexSrc, sub) }
    case 'nbt_write_dynamic':
      return { ...instr, indexSrc: substituteOp(instr.indexSrc, sub), valueSrc: substituteOp(instr.valueSrc, sub) }
    case 'call': return { ...instr, args: instr.args.map(arg => substituteOp(arg, sub)) }
    case 'call_macro': return { ...instr, args: instr.args.map(arg => ({ ...arg, value: substituteOp(arg.value, sub) })) }
    case 'branch': return { ...instr, cond: substituteOp(instr.cond, sub) }
    case 'return': return { ...instr, value: instr.value ? substituteOp(instr.value, sub) : null }
    default: return instr
  }
}
