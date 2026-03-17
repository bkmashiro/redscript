/**
 * MIR Verifier — validates structural invariants of MIR modules.
 *
 * Checks:
 * 1. Every block ends with exactly one terminator (jump | branch | return)
 * 2. Every temp used is defined before use (in the block or as a param)
 * 3. No unreachable blocks (all blocks reachable from entry)
 * 4. Branch/jump targets must exist in the function
 */

import type { MIRModule, MIRFunction, MIRBlock, MIRInstr, Operand, Temp } from './types'

export interface VerifyError {
  fn: string
  block?: string
  message: string
}

export function verifyMIR(module: MIRModule): VerifyError[] {
  const errors: VerifyError[] = []
  for (const fn of module.functions) {
    errors.push(...verifyFunction(fn))
  }
  return errors
}

function verifyFunction(fn: MIRFunction): VerifyError[] {
  const errors: VerifyError[] = []

  const blockIds = new Set(fn.blocks.map(b => b.id))

  // 1. Check terminators
  for (const block of fn.blocks) {
    if (!isTerminator(block.term)) {
      errors.push({
        fn: fn.name,
        block: block.id,
        message: `block '${block.id}' does not end with a terminator (found '${block.term.kind}')`,
      })
    }

    // Check that no non-terminator instruction is a terminator
    for (const instr of block.instrs) {
      if (isTerminator(instr)) {
        errors.push({
          fn: fn.name,
          block: block.id,
          message: `block '${block.id}' has terminator '${instr.kind}' in non-terminal position`,
        })
      }
    }
  }

  // 2. Check that branch/jump targets exist
  for (const block of fn.blocks) {
    const targets = getTermTargets(block.term)
    for (const target of targets) {
      if (!blockIds.has(target)) {
        errors.push({
          fn: fn.name,
          block: block.id,
          message: `block '${block.id}' references non-existent target '${target}'`,
        })
      }
    }
  }

  // 3. Check reachability from entry
  const reachable = new Set<string>()
  const entryBlock = fn.blocks.find(b => b.id === fn.entry)
  if (!entryBlock) {
    errors.push({
      fn: fn.name,
      message: `entry block '${fn.entry}' not found`,
    })
  } else {
    // BFS from entry
    const queue: string[] = [fn.entry]
    while (queue.length > 0) {
      const id = queue.shift()!
      if (reachable.has(id)) continue
      reachable.add(id)

      const block = fn.blocks.find(b => b.id === id)
      if (block) {
        for (const target of getTermTargets(block.term)) {
          if (!reachable.has(target)) {
            queue.push(target)
          }
        }
      }
    }

    for (const block of fn.blocks) {
      if (!reachable.has(block.id)) {
        errors.push({
          fn: fn.name,
          block: block.id,
          message: `block '${block.id}' is unreachable from entry`,
        })
      }
    }
  }

  // 4. Check use-before-def for temporaries
  // Collect all defined temps: params + all dst fields in instructions
  const allDefs = new Set<Temp>()
  for (const p of fn.params) allDefs.add(p.name)
  for (const block of fn.blocks) {
    for (const instr of block.instrs) {
      const dst = getDst(instr)
      if (dst) allDefs.add(dst)
    }
    const termDst = getDst(block.term)
    if (termDst) allDefs.add(termDst)
  }

  // Check that every temp used in an operand is in allDefs
  for (const block of fn.blocks) {
    for (const instr of block.instrs) {
      for (const used of getUsedTemps(instr)) {
        if (!allDefs.has(used)) {
          errors.push({
            fn: fn.name,
            block: block.id,
            message: `temp '${used}' used but never defined`,
          })
        }
      }
    }
    for (const used of getUsedTemps(block.term)) {
      if (!allDefs.has(used)) {
        errors.push({
          fn: fn.name,
          block: block.id,
          message: `temp '${used}' used in terminator but never defined`,
        })
      }
    }
  }

  return errors
}

function isTerminator(instr: MIRInstr): boolean {
  return instr.kind === 'jump' || instr.kind === 'branch' || instr.kind === 'return'
}

function getTermTargets(term: MIRInstr): string[] {
  switch (term.kind) {
    case 'jump': return [term.target]
    case 'branch': return [term.then, term.else]
    case 'return': return []
    default: return []
  }
}

function getDst(instr: MIRInstr): Temp | null {
  switch (instr.kind) {
    case 'const':
    case 'copy':
    case 'add': case 'sub': case 'mul': case 'div': case 'mod':
    case 'neg':
    case 'cmp':
    case 'and': case 'or': case 'not':
    case 'nbt_read':
    case 'nbt_read_dynamic':
      return instr.dst
    case 'call':
    case 'call_macro':
      return instr.dst
    default:
      return null
  }
}

function getOperandTemps(op: Operand): Temp[] {
  return op.kind === 'temp' ? [op.name] : []
}

function getUsedTemps(instr: MIRInstr): Temp[] {
  const temps: Temp[] = []
  switch (instr.kind) {
    case 'const':
      break
    case 'copy':
    case 'neg':
    case 'not':
      temps.push(...getOperandTemps(instr.src))
      break
    case 'add': case 'sub': case 'mul': case 'div': case 'mod':
    case 'cmp':
    case 'and': case 'or':
      temps.push(...getOperandTemps(instr.a), ...getOperandTemps(instr.b))
      break
    case 'nbt_read':
      break
    case 'nbt_read_dynamic':
      temps.push(...getOperandTemps(instr.indexSrc))
      break
    case 'nbt_write':
      temps.push(...getOperandTemps(instr.src))
      break
    case 'nbt_write_dynamic':
      temps.push(...getOperandTemps(instr.indexSrc), ...getOperandTemps(instr.valueSrc))
      break
    case 'call':
      for (const arg of instr.args) temps.push(...getOperandTemps(arg))
      break
    case 'call_macro':
      for (const arg of instr.args) temps.push(...getOperandTemps(arg.value))
      break
    case 'call_context':
      break
    case 'jump':
      break
    case 'branch':
      temps.push(...getOperandTemps(instr.cond))
      break
    case 'return':
      if (instr.value) temps.push(...getOperandTemps(instr.value))
      break
  }
  return temps
}
