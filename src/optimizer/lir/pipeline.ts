/**
 * LIR Optimization Pipeline — runs all LIR passes on a module.
 *
 * Pass order: dead_slot → optional experimental local-copy/RMW → exec_store_peephole → const_imm
 * Dead slot runs first to remove unused writes, exposing simpler
 * temporary-copy shapes and single-use const slots for later passes. The
 * local-copy/RMW rewrite pass remains opt-in until equivalence/bench gates
 * justify default enablement.
 */

import type { LIRFunction, LIRModule } from '../../lir/types'
import { deadSlotElimModule } from './dead_slot'
import { scoreboardRmwPassModule } from './rmw'
import { constImmFold } from './const_imm'
import { execStorePeephole } from './peephole'

export interface LIROptimizeOptions {
  /**
   * Opt-in local scoreboard copy/RMW rewrites. Kept behind an explicit flag
   * while bounded equivalence and benchmark evidence mature.
   */
  experimentalLocalCopyRewrite?: boolean
}

export type LIRPass = (fn: LIRFunction) => LIRFunction

const perFunctionPasses: LIRPass[] = [
  execStorePeephole,
  constImmFold,
]

export function lirOptimizeModule(mod: LIRModule, options: LIROptimizeOptions = {}): LIRModule {
  // Module-level dead slot elimination remains part of the production-safe LIR
  // cleanup baseline. Local copy/RMW rewrites are explicitly opt-in while the
  // bounded equivalence evidence is being expanded.
  let result = deadSlotElimModule(mod)
  if (options.experimentalLocalCopyRewrite === true) {
    result = scoreboardRmwPassModule(result)
  }

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
