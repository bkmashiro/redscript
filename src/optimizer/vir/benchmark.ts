import type { LIRModule } from '../../lir/types'
import type { VirToLirResult } from './lower/vir-to-lir'

export interface VIRStaticEstimate {
  commandCount: number
  scoreCopyCount: number
}

export interface VIRBenchmarkComparison {
  oldEstimate: VIRStaticEstimate
  experimentalEstimate: VIRStaticEstimate
  commandCountDelta: number
  scoreCopyCountDelta: number
  experimentalUnsupportedReason?: string
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

export function compareVirExperimental(args: {
  oldLir: LIRModule
  experimental: VirToLirResult
}): VIRBenchmarkComparison {
  const oldEstimate = countCommands(args.oldLir)

  if (args.experimental.kind === 'unsupported') {
    return {
      oldEstimate,
      experimentalEstimate: { commandCount: 0, scoreCopyCount: 0 },
      commandCountDelta: -oldEstimate.commandCount,
      scoreCopyCountDelta: -oldEstimate.scoreCopyCount,
      experimentalUnsupportedReason: args.experimental.reason,
    }
  }

  const experimentalEstimate = countCommands(args.experimental.module)
  return {
    oldEstimate,
    experimentalEstimate,
    commandCountDelta: experimentalEstimate.commandCount - oldEstimate.commandCount,
    scoreCopyCountDelta: experimentalEstimate.scoreCopyCount - oldEstimate.scoreCopyCount,
  }
}
