import type { LIRModule } from '../../lir/types'
import type { VirToLirResult } from './lower/vir-to-lir'

export interface VIRStaticEstimate {
  commandCount: number
  scoreCopyCount: number
}

export interface VIRBenchmarkComparison {
  oldEstimate: VIRStaticEstimate
  directEstimate: VIRStaticEstimate
  experimentalEstimate: VIRStaticEstimate
  plannedEstimate: VIRStaticEstimate
  commandCountDelta: number
  scoreCopyCountDelta: number
  experimentalUnsupportedReason?: string
  directUnsupportedReason?: string
  plannedUnsupportedReason?: string
  allocationFailureReason?: string
}

function countCommands(module: LIRModule): VIRStaticEstimate {
  let commandCount = 0
  let scoreCopyCount = 0
  for (const fn of module.functions) {
    for (const instr of fn.instructions) {
      commandCount += 1
      if (instr.kind === 'score_copy') scoreCopyCount += 1
    }
  }
  return { commandCount, scoreCopyCount }
}

function summarizeResult(
  result: VirToLirResult,
): { estimate: VIRStaticEstimate; unsupportedReason?: string } {
  if (result.kind === 'ok') {
    return { estimate: countCommands(result.module) }
  }
  return {
    estimate: { commandCount: 0, scoreCopyCount: 0 },
    unsupportedReason: result.reason,
  }
}

export function compareVirExperimental(args: {
  oldLir: LIRModule
  experimental?: VirToLirResult
  direct?: VirToLirResult
  planned?: VirToLirResult
  allocationFailure?: string
}): VIRBenchmarkComparison {
  const directSource = args.direct ?? args.experimental
  const plannedSource = args.planned ?? args.experimental

  const oldEstimate = countCommands(args.oldLir)
  const direct = directSource ? summarizeResult(directSource) : { estimate: oldEstimate }
  const planned = plannedSource ? summarizeResult(plannedSource) : { estimate: oldEstimate }

  return {
    oldEstimate,
    directEstimate: direct.estimate,
    experimentalEstimate: planned.estimate,
    plannedEstimate: planned.estimate,
    commandCountDelta: planned.estimate.commandCount - direct.estimate.commandCount,
    scoreCopyCountDelta: planned.estimate.scoreCopyCount - direct.estimate.scoreCopyCount,
    experimentalUnsupportedReason: planned.unsupportedReason,
    directUnsupportedReason: direct.unsupportedReason,
    plannedUnsupportedReason: planned.unsupportedReason,
    allocationFailureReason: args.allocationFailure,
  }
}
