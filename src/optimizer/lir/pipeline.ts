/**
 * LIR Optimization Pipeline — runs all LIR passes on a module.
 *
 * Pass order: deadSlotElimModule → optional experimental local-copy/RMW →
 * execStorePeephole → constImmFold → deadSlotElimModule.
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

export interface LIROptimizePassResult {
  name: string
  changed: boolean
  stats: {
    instructionsIn: number
    instructionsOut: number
    functionsVisited: number
    functionsChanged: number
  }
}

export interface LIROptimizePassManagerResult {
  module: LIRModule
  passes: LIROptimizePassResult[]
}

export type LIRPass = (fn: LIRFunction) => LIRFunction

function moduleInstructionCount(mod: LIRModule): number {
  return mod.functions.reduce((sum, fn) => sum + fn.instructions.length, 0)
}

export function runLIRPassManager(
  mod: LIRModule,
  options: LIROptimizeOptions = {},
): LIROptimizePassManagerResult {
  const passes: LIROptimizePassResult[] = []
  let current = mod

  const runModulePass = (name: string, pass: (module: LIRModule) => LIRModule): void => {
    const instructionsIn = moduleInstructionCount(current)
    const next = pass(current)
    const instructionsOut = moduleInstructionCount(next)
    const functionsChanged = next.functions.filter((fn, index) => fn !== current.functions[index]).length

    passes.push({
      name,
      changed: next !== current,
      stats: {
        instructionsIn,
        instructionsOut,
        functionsVisited: next.functions.length,
        functionsChanged,
      },
    })

    if (next !== current) {
      current = next
    }
  }

  const runFunctionPass = (name: string, pass: LIRPass): void => {
    const instructionsIn = moduleInstructionCount(current)
    let functionsChanged = 0

    const functions = current.functions.map(fn => {
      const next = pass(fn)
      if (next !== fn) functionsChanged += 1
      return next
    })

    const next = functionsChanged === 0
      ? current
      : { ...current, functions }
    const instructionsOut = moduleInstructionCount(next)

    passes.push({
      name,
      changed: functionsChanged > 0,
      stats: {
        instructionsIn,
        instructionsOut,
        functionsVisited: next.functions.length,
        functionsChanged,
      },
    })

    if (next !== current) {
      current = next
    }
  }

  // Module-level dead slot elimination remains part of the production-safe LIR
  // cleanup baseline. Local copy/RMW rewrites are explicitly opt-in while the
  // bounded equivalence evidence is being expanded.
  runModulePass('deadSlotElimModule', deadSlotElimModule)

  if (options.experimentalLocalCopyRewrite === true) {
    runModulePass('scoreboardRmwPassModule', scoreboardRmwPassModule)
  }

  runFunctionPass('execStorePeephole', execStorePeephole)
  runFunctionPass('constImmFold', constImmFold)
  runModulePass('deadSlotElimModule', deadSlotElimModule)

  return { module: current, passes }
}

export function lirOptimizeModule(mod: LIRModule, options: LIROptimizeOptions = {}): LIRModule {
  return runLIRPassManager(mod, options).module
}
