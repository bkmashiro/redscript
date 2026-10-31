import { describe, expect, test } from '@jest/globals'
import * as fs from 'fs'
import { compile, CompileStageSnapshot } from '../../compile'
import { summarizeDatapackCommands } from '../../optimizer/report'
import { SCORE_EFFECTS_NAMESPACE, SCORE_EFFECTS_SOURCE_PATH } from '../../../tests/mc-cases/scoreboard-call-effects-cases'

function withReport() {
  const snapshots: CompileStageSnapshot[] = []
  const result = compile(fs.readFileSync(SCORE_EFFECTS_SOURCE_PATH, 'utf8'), {
    namespace: SCORE_EFFECTS_NAMESPACE, filePath: SCORE_EFFECTS_SOURCE_PATH,
    snapshotStages: ['lowerAndOptimize', 'emitDatapack'], stageSnapshots: snapshots,
  })
  return { result, snapshots }
}

describe('production optimization reports', () => {
  test('reports final command counts and preserves ordinary compilation output', () => {
    const { result, snapshots } = withReport()
    const ordinary = compile(fs.readFileSync(SCORE_EFFECTS_SOURCE_PATH, 'utf8'), {
      namespace: SCORE_EFFECTS_NAMESPACE, filePath: SCORE_EFFECTS_SOURCE_PATH,
    })
    expect(result).toEqual(ordinary)
    expect(snapshots.find(stage => stage.stage === 'emitDatapack')!.summary).toMatchObject({
      commandReport: {
        scope: 'static-emitted-commands', dynamicCost: 'unknown',
        functions: expect.arrayContaining([expect.objectContaining({
          path: `data/${SCORE_EFFECTS_NAMESPACE}/function/test_readonly.mcfunction`,
          commands: 7,
          textIndicators: expect.objectContaining({ scoreReads: 2, functionCalls: 1 }),
        })]),
      },
    })
  })

  test('exposes MIR read reductions, existing LIR pass deltas and conservative call barriers', () => {
    const { snapshots } = withReport()
    expect(snapshots.find(stage => stage.stage === 'lowerAndOptimize')!.summary).toMatchObject({
      optimization: {
        scope: 'static-ir',
        functions: expect.arrayContaining([expect.objectContaining({
          name: 'test_readonly', scoreReadsBefore: 2, scoreReadsAfter: 1,
        })]),
        scoreboardEffects: expect.arrayContaining([
          expect.objectContaining({ name: 'cooldown_cost_chain', preservesUserScores: true }),
          expect.objectContaining({ name: 'raw_mutate_cooldown', preservesUserScores: false, barrier: { kind: 'raw-call' } }),
        ]),
        lirPasses: expect.arrayContaining([expect.objectContaining({ name: 'deadSlotElimModule' })]),
      },
    })
  })

  test('is deterministic and reports only the requested stages', () => {
    expect(withReport().snapshots).toEqual(withReport().snapshots)
    expect(withReport().snapshots.map(stage => stage.stage)).toEqual(['lowerAndOptimize', 'emitDatapack'])
  })

  test('counts non-comment emitted lines without inventing runtime cost', () => {
    const report = summarizeDatapackCommands([
      { path: 'data/demo/function/tick.mcfunction', content: '# comment\r\n\r\nsay hello\r\n$say $(message)\r\n' },
      { path: 'data/minecraft/tags/function/tick.json', content: '{"values":["demo:tick",{"id":"other:tick","required":false}]}' },
      { path: 'data/minecraft/tags/function/load.json', content: 'invalid json' },
    ])
    expect(report).toMatchObject({
      dynamicCost: 'unknown', totalCommands: 2,
      lifecycleRoots: { tick: ['demo:tick', 'other:tick'], load: [] },
      unreadableLifecycleTags: ['data/minecraft/tags/function/load.json'],
      functions: [{ commands: 2, textIndicators: expect.objectContaining({ macros: 1 }) }],
    })
  })
})
