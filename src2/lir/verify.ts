/**
 * LIR Verifier — validates structural invariants of LIR modules.
 *
 * Checks:
 * 1. All Slots use the module's objective
 * 2. No undefined function references (call/call_if_* targets exist)
 * 3. macro_line only appears in isMacro functions
 */

import type { LIRModule, LIRFunction, LIRInstr, Slot } from './types'

export interface LIRVerifyError {
  fn: string
  message: string
}

export function verifyLIR(module: LIRModule): LIRVerifyError[] {
  const errors: LIRVerifyError[] = []
  const fnNames = new Set(module.functions.map(f => `${module.namespace}:${f.name}`))

  for (const fn of module.functions) {
    errors.push(...verifyFunction(fn, module, fnNames))
  }

  return errors
}

function verifyFunction(
  fn: LIRFunction,
  module: LIRModule,
  fnNames: Set<string>,
): LIRVerifyError[] {
  const errors: LIRVerifyError[] = []

  for (const instr of fn.instructions) {
    // Check objective on all slots
    for (const slot of getSlotsFromInstr(instr)) {
      if (slot.obj !== module.objective) {
        errors.push({
          fn: fn.name,
          message: `slot '${slot.player}' uses objective '${slot.obj}' but module objective is '${module.objective}'`,
        })
      }
    }

    // Check function references
    for (const ref of getFnRefsFromInstr(instr)) {
      // Skip empty refs (used in store_cmd_to_score with cmp pattern)
      if (ref === '' || ref === `${module.namespace}:`) continue
      if (!fnNames.has(ref)) {
        errors.push({
          fn: fn.name,
          message: `references undefined function '${ref}'`,
        })
      }
    }

    // Check macro_line only in macro functions
    if (instr.kind === 'macro_line' && !fn.isMacro) {
      errors.push({
        fn: fn.name,
        message: `macro_line instruction in non-macro function`,
      })
    }
  }

  return errors
}

function getSlotsFromInstr(instr: LIRInstr): Slot[] {
  switch (instr.kind) {
    case 'score_set':
      return [instr.dst]
    case 'score_copy':
    case 'score_add':
    case 'score_sub':
    case 'score_mul':
    case 'score_div':
    case 'score_mod':
    case 'score_min':
    case 'score_max':
      return [instr.dst, instr.src]
    case 'score_swap':
      return [instr.a, instr.b]
    case 'store_cmd_to_score':
      return [instr.dst, ...getSlotsFromInstr(instr.cmd)]
    case 'store_score_to_nbt':
      return [instr.src]
    case 'store_nbt_to_score':
      return [instr.dst]
    case 'call_if_matches':
    case 'call_unless_matches':
      return [instr.slot]
    case 'call_if_score':
    case 'call_unless_score':
      return [instr.a, instr.b]
    case 'return_value':
      return [instr.slot]
    case 'call':
    case 'call_macro':
    case 'call_context':
    case 'nbt_set_literal':
    case 'nbt_copy':
    case 'macro_line':
    case 'raw':
      return []
  }
}

function getFnRefsFromInstr(instr: LIRInstr): string[] {
  switch (instr.kind) {
    case 'call':
      return [instr.fn]
    case 'call_macro':
      return [instr.fn]
    case 'call_if_matches':
    case 'call_unless_matches':
      return [instr.fn]
    case 'call_if_score':
    case 'call_unless_score':
      return [instr.fn]
    case 'call_context':
      return [instr.fn]
    case 'store_cmd_to_score':
      return getFnRefsFromInstr(instr.cmd)
    default:
      return []
  }
}
