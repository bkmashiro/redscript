/**
 * MIR Optimization Pipeline — runs all passes to a fixpoint.
 *
 * Each pass is a function MIRFunction → MIRFunction.
 * The pipeline iterates until no pass changes the function (fixpoint).
 */

import type { MIRFunction, MIRModule } from '../mir/types'
import { constantFold } from './constant_fold'
import { copyProp } from './copy_prop'
import { dce } from './dce'
import { blockMerge } from './block_merge'
import { branchSimplify } from './branch_simplify'

export type Pass = (fn: MIRFunction) => MIRFunction

const defaultPasses: Pass[] = [
  constantFold,
  copyProp,
  branchSimplify,
  dce,
  blockMerge,
]

const MAX_ITERATIONS = 20

export function optimizeFunction(fn: MIRFunction, passes: Pass[] = defaultPasses): MIRFunction {
  let current = fn
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const before = JSON.stringify(current)
    for (const pass of passes) {
      current = pass(current)
    }
    if (JSON.stringify(current) === before) break
  }
  return current
}

export function optimizeModule(mod: MIRModule, passes?: Pass[]): MIRModule {
  return {
    ...mod,
    functions: mod.functions.map(fn => optimizeFunction(fn, passes)),
  }
}
