/**
 * LIR Optimization Pipeline — runs all LIR passes on a module.
 *
 * Pass order: dead_slot → rmw → exec_store_peephole → const_imm
 * Dead slot runs first to remove unused writes, exposing simpler
 * temporary-copy shapes and single-use const slots for later passes.
 */

import type { LIRFunction, LIRModule } from '../../lir/types'
import { deadSlotElimModule } from './dead_slot'
import { scoreboardRmwPass } from './rmw'
import { constImmFold } from './const_imm'
import { execStorePeephole } from './peephole'

export type LIRPass = (fn: LIRFunction) => LIRFunction

const perFunctionPasses: LIRPass[] = [
  scoreboardRmwPass,
  execStorePeephole,
  constImmFold,
]

export function lirOptimizeModule(mod: LIRModule): LIRModule {
  // Module-level pass: dead slot elimination (cross-function analysis)
  let result = deadSlotElimModule(mod)

  // Per-function passes
  let changed = false
  const functions = result.functions.map(fn => {
    let current = fn
    for (const pass of perFunctionPasses) {
      current = pass(current)
    }
    if (current !== fn) changed = true
    return current
  })

  return changed ? { ...result, functions } : result
}
