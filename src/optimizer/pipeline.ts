/**
 * MIR Optimization Pipeline — runs all passes to a fixpoint.
 *
 * Each pass is a function MIRFunction → MIRFunction.
 * The pipeline iterates until no pass changes the function (fixpoint).
 *
 * Module-level passes (interproceduralConstProp) run once after the
 * per-function fixpoint loop.
 */

import type { MIRFunction, MIRModule } from '../mir/types'
import { constantFold } from './constant_fold'
import { copyProp } from './copy_prop'
import { dce } from './dce'
import { blockMerge } from './block_merge'
import { branchSimplify } from './branch_simplify'
import { loopUnroll } from './unroll'
import { licm } from './licm'
import { nbtBatchRead } from './nbt-batch'
import { interproceduralConstProp } from './interprocedural'
import { inlinePass } from './inline'

// selectorCache is intentionally excluded from the default pipeline:
// it emits synthetic __sel_cleanup_* / __sel_tag_* call_context instructions
// that require codegen support before being used end-to-end.
export { selectorCache } from './selector-cache'

export type Pass = (fn: MIRFunction) => MIRFunction

const defaultPasses: Pass[] = [
  loopUnroll,
  licm,
  nbtBatchRead,
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
  // Module-level pass: inline @inline-marked functions before per-function opts
  const inlined = inlinePass(mod)
  const perFnOptimized = {
    ...inlined,
    functions: inlined.functions.map(fn => optimizeFunction(fn, passes)),
  }
  // Module-level pass: interprocedural constant propagation
  return interproceduralConstProp(perFnOptimized)
}
