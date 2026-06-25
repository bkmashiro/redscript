import { cloneVIRModule } from './types'
import type { VIRModule } from './types'
import { canonicalizePass } from './passes/canonicalize'
import { constantFoldPass } from './passes/constant-fold'
import { dcePass } from './passes/dce'
import { localCsePass } from './passes/local-cse'

export interface VIRPassResult {
  changed: boolean
  module: VIRModule
}

export type VIRPass = (module: VIRModule) => VIRPassResult

export const defaultVIRPasses: VIRPass[] = [
  canonicalizePass,
  constantFoldPass,
  localCsePass,
  dcePass,
]

export interface VIRPassManagerOptions {
  passes?: VIRPass[]
  maxIterations?: number
}

export function runVIRPasses(module: VIRModule, options: VIRPassManagerOptions = {}): VIRModule {
  const passes = options.passes ?? defaultVIRPasses
  const maxIterations = options.maxIterations ?? 8

  let current = cloneVIRModule(module)
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    let changed = false

    for (const pass of passes) {
      const result = pass(current)
      current = result.module
      changed = changed || result.changed
    }

    if (!changed) {
      return current
    }
  }

  return current
}

export function runSinglePass(module: VIRModule, pass: VIRPass): VIRPassResult {
  return pass(cloneVIRModule(module))
}
