import type { MIRFunction, MIRModule } from '../mir/types'
import type { DatapackFile } from '../emit'
import type { LIROptimizePassResult } from './lir/pipeline'
import { analyzeScoreboardEffects } from './scoreboard-effects'

function count(fn: MIRFunction | undefined, kind?: string): number {
  return fn?.blocks.reduce((sum, block) => sum + block.instrs.filter(instr => !kind || instr.kind === kind).length, 0) ?? 0
}

export function summarizeOptimization(before: MIRModule, after: MIRModule, lirPasses: LIROptimizePassResult[]) {
  const inputs = new Map(before.functions.map(fn => [fn.name, fn]))
  const outputs = new Map(after.functions.map(fn => [fn.name, fn]))
  const names = [...new Set([...inputs.keys(), ...outputs.keys()])].sort()
  return {
    scope: 'static-ir' as const,
    functions: names.map(name => ({
      name,
      instructionsBefore: count(inputs.get(name)), instructionsAfter: count(outputs.get(name)),
      scoreReadsBefore: count(inputs.get(name), 'score_read'), scoreReadsAfter: count(outputs.get(name), 'score_read'),
    })),
    scoreboardEffects: analyzeScoreboardEffects(after).functions,
    lirPasses,
  }
}

/**
 * Count actual emitted lines. Indicators are lexical descriptions, not effect
 * analysis: quoted text/raw commands can contain these tokens. They must never
 * justify a rewrite or be interpreted as runtime cost/selector cardinality.
 */
export function summarizeDatapackCommands(files: readonly DatapackFile[]) {
  const functions = files.filter(file => file.path.endsWith('.mcfunction')).map(file => {
    const lines = file.content.split(/\r?\n/).map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'))
    return {
      path: file.path,
      commands: lines.length,
      textIndicators: {
        scoreReads: lines.filter(line => /\bscoreboard players get\b/.test(line)).length,
        scoreCopies: lines.filter(line => /\bscoreboard players operation\b.* = /.test(line)).length,
        functionCalls: lines.filter(line => /(?:^|\brun )function\s/.test(line)).length,
        storage: lines.filter(line => /\bstorage\s/.test(line)).length,
        selectors: lines.filter(line => /@[paresn](?:\b|\[)/.test(line)).length,
        macros: lines.filter(line => line.startsWith('$')).length,
      },
    }
  }).sort((a, b) => a.path.localeCompare(b.path))

  const lifecycleRoots: Record<'load' | 'tick', string[]> = { load: [], tick: [] }
  const unreadableLifecycleTags: string[] = []
  for (const file of files) {
    const tag = /^data\/minecraft\/tags\/functions?\/(load|tick)\.json$/.exec(file.path)
    if (!tag) continue
    try {
      const parsed: unknown = JSON.parse(file.content)
      const values = (parsed as { values?: unknown })?.values
      if (!Array.isArray(values)) throw new Error('missing tag values')
      for (const value of values) {
        const id = typeof value === 'string' ? value : value?.id
        if (typeof id !== 'string') throw new Error('invalid tag value')
        lifecycleRoots[tag[1] as 'load' | 'tick'].push(id)
      }
    } catch {
      unreadableLifecycleTags.push(file.path)
    }
  }
  lifecycleRoots.load = [...new Set(lifecycleRoots.load)].sort()
  lifecycleRoots.tick = [...new Set(lifecycleRoots.tick)].sort()
  return {
    scope: 'static-emitted-commands' as const,
    dynamicCost: 'unknown' as const,
    totalCommands: functions.reduce((sum, fn) => sum + fn.commands, 0),
    functions,
    lifecycleRoots,
    unreadableLifecycleTags: unreadableLifecycleTags.sort(),
  }
}
