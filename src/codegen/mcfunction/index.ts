/**
 * Code generator: IR → mcfunction datapack
 *
 * Output structure:
 *   <namespace>/
 *     functions/
 *       <fn_name>.mcfunction
 *       <fn_name>/<block_label>.mcfunction   (for control-flow continuations)
 *     load.mcfunction     (objective setup)
 *
 * Variable mapping:
 *   scoreboard objective: "rs"
 *   fake player:          "$<varname>"
 *   temporaries:          "$t0", "$t1", ...
 *   return value:         "$ret"
 *   parameters:           "$p0", "$p1", ...
 */

import type { IRBlock, IRFunction, IRModule, Operand, Terminator } from '../../ir/types'

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const OBJ = 'rs'  // scoreboard objective name

function varRef(name: string): string {
  // Ensure fake player prefix
  return name.startsWith('$') ? name : `$${name}`
}

function operandToScore(op: Operand): string {
  if (op.kind === 'var')   return `${varRef(op.name)} ${OBJ}`
  if (op.kind === 'const') return `$const_${op.value} ${OBJ}`
  throw new Error(`Cannot convert storage operand to score: ${op.path}`)
}

function constSetup(value: number): string {
  return `scoreboard players set $const_${value} ${OBJ} ${value}`
}

// Collect all constants used in a function for pre-setup
function collectConsts(fn: IRFunction): Set<number> {
  const consts = new Set<number>()
  for (const block of fn.blocks) {
    for (const instr of block.instrs) {
      if (instr.op === 'assign' && instr.src.kind === 'const') consts.add(instr.src.value)
      if (instr.op === 'binop') {
        if (instr.lhs.kind === 'const') consts.add(instr.lhs.value)
        if (instr.rhs.kind === 'const') consts.add(instr.rhs.value)
      }
      if (instr.op === 'cmp') {
        if (instr.lhs.kind === 'const') consts.add(instr.lhs.value)
        if (instr.rhs.kind === 'const') consts.add(instr.rhs.value)
      }
    }
    const t = block.term
    if (t.op === 'return' && t.value?.kind === 'const') consts.add(t.value.value)
  }
  return consts
}

// MC scoreboard operation suffix
const BOP_OP: Record<string, string> = {
  '+': '+=', '-': '-=', '*': '*=', '/': '/=', '%': '%=',
}

// ---------------------------------------------------------------------------
// Instruction codegen
// ---------------------------------------------------------------------------

function emitInstr(instr: ReturnType<typeof Object.assign> & { op: string }, ns: string): string[] {
  const lines: string[] = []

  switch (instr.op) {
    case 'assign': {
      const dst = varRef(instr.dst)
      const src = instr.src as Operand
      if (src.kind === 'const') {
        lines.push(`scoreboard players set ${dst} ${OBJ} ${src.value}`)
      } else if (src.kind === 'var') {
        lines.push(`scoreboard players operation ${dst} ${OBJ} = ${varRef(src.name)} ${OBJ}`)
      } else {
        lines.push(`execute store result score ${dst} ${OBJ} run data get storage ${src.path}`)
      }
      break
    }

    case 'binop': {
      const dst = varRef(instr.dst)
      const bop = BOP_OP[instr.bop as string] ?? '+='
      // Copy lhs → dst, then apply op with rhs
      lines.push(...emitInstr({ op: 'assign', dst: instr.dst, src: instr.lhs }, ns))
      lines.push(`scoreboard players operation ${dst} ${OBJ} ${bop} ${operandToScore(instr.rhs)}`)
      break
    }

    case 'cmp': {
      // MC doesn't have a direct compare-to-register; use execute store
      const dst = varRef(instr.dst)
      const lhsScore = operandToScore(instr.lhs)
      const rhsScore = operandToScore(instr.rhs)
      lines.push(`scoreboard players set ${dst} ${OBJ} 0`)
      switch (instr.cop) {
        case '==':
          lines.push(`execute if score ${lhsScore} = ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`)
          break
        case '!=':
          lines.push(`execute unless score ${lhsScore} = ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`)
          break
        case '<':
          lines.push(`execute if score ${lhsScore} < ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`)
          break
        case '<=':
          lines.push(`execute if score ${lhsScore} <= ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`)
          break
        case '>':
          lines.push(`execute if score ${lhsScore} > ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`)
          break
        case '>=':
          lines.push(`execute if score ${lhsScore} >= ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`)
          break
      }
      break
    }

    case 'call': {
      // Push args as fake players $p0, $p1, ...
      for (let i = 0; i < instr.args.length; i++) {
        lines.push(...emitInstr({ op: 'assign', dst: `$p${i}`, src: instr.args[i] }, ns))
      }
      lines.push(`function ${ns}:${instr.fn}`)
      if (instr.dst) {
        lines.push(`scoreboard players operation ${varRef(instr.dst)} ${OBJ} = $ret ${OBJ}`)
      }
      break
    }

    case 'raw':
      lines.push(instr.cmd as string)
      break
  }

  return lines
}

// ---------------------------------------------------------------------------
// Terminator codegen
// ---------------------------------------------------------------------------

function emitTerm(term: Terminator, ns: string, fnName: string): string[] {
  const lines: string[] = []
  switch (term.op) {
    case 'jump':
      lines.push(`function ${ns}:${fnName}/${term.target}`)
      break
    case 'jump_if':
      lines.push(`execute if score ${varRef(term.cond)} ${OBJ} matches 1.. run function ${ns}:${fnName}/${term.then}`)
      lines.push(`execute if score ${varRef(term.cond)} ${OBJ} matches ..0 run function ${ns}:${fnName}/${term.else_}`)
      break
    case 'jump_unless':
      lines.push(`execute if score ${varRef(term.cond)} ${OBJ} matches ..0 run function ${ns}:${fnName}/${term.then}`)
      lines.push(`execute if score ${varRef(term.cond)} ${OBJ} matches 1.. run function ${ns}:${fnName}/${term.else_}`)
      break
    case 'return':
      if (term.value) {
        lines.push(...emitInstr({ op: 'assign', dst: '$ret', src: term.value }, ns))
      }
      // In MC 1.20+, use `return` command
      if (term.value?.kind === 'const') {
        lines.push(`return ${term.value.value}`)
      } else if (term.value?.kind === 'var') {
        lines.push(`return run scoreboard players get ${varRef(term.value.name)} ${OBJ}`)
      }
      break
    case 'tick_yield':
      lines.push(`schedule function ${ns}:${fnName}/${term.continuation} 1t replace`)
      break
  }
  return lines
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DatapackFile {
  path: string    // relative to datapack root, e.g. "data/mypack/functions/add.mcfunction"
  content: string
}

export function generateDatapack(module: IRModule): DatapackFile[] {
  const files: DatapackFile[] = []
  const ns = module.namespace

  // pack.mcmeta
  files.push({
    path: 'pack.mcmeta',
    content: JSON.stringify({
      pack: { pack_format: 26, description: `Generated by RedScript` }
    }, null, 2),
  })

  // load.mcfunction — create scoreboard objective
  const loadLines = [
    `# RedScript runtime init`,
    `scoreboard objectives add ${OBJ} dummy`,
  ]
  for (const g of module.globals) {
    loadLines.push(`scoreboard players set ${varRef(g)} ${OBJ} 0`)
  }
  files.push({
    path: `data/${ns}/function/load.mcfunction`,
    content: loadLines.join('\n'),
  })

  // minecraft:load tag
  files.push({
    path: `data/minecraft/tags/function/load.json`,
    content: JSON.stringify({ values: [`${ns}:load`] }, null, 2),
  })

  // Generate each function
  for (const fn of module.functions) {
    // Constant setup — place constants in load.mcfunction
    const consts = collectConsts(fn)
    if (consts.size > 0) {
      loadLines.push(...Array.from(consts).map(constSetup))
    }

    // Entry block → <fn_name>.mcfunction
    // Continuation blocks → <fn_name>/<label>.mcfunction
    for (let i = 0; i < fn.blocks.length; i++) {
      const block = fn.blocks[i]
      const lines: string[] = [`# block: ${block.label}`]

      // Param setup in entry block
      if (i === 0) {
        for (let j = 0; j < fn.params.length; j++) {
          lines.push(`scoreboard players operation ${varRef(fn.params[j])} ${OBJ} = $p${j} ${OBJ}`)
        }
      }

      for (const instr of block.instrs) {
        lines.push(...emitInstr(instr as any, ns))
      }
      lines.push(...emitTerm(block.term, ns, fn.name))

      const filePath = i === 0
        ? `data/${ns}/function/${fn.name}.mcfunction`
        : `data/${ns}/function/${fn.name}/${block.label}.mcfunction`

      files.push({ path: filePath, content: lines.join('\n') })
    }

    // Tick loop → register in tick tag
    if (fn.isTickLoop) {
      files.push({
        path: `data/minecraft/tags/function/tick.json`,
        content: JSON.stringify({ values: [`${ns}:${fn.name}`] }, null, 2),
      })
    }
  }

  return files
}
