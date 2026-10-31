import { describe, test, expect, jest } from '@jest/globals'
import * as fs from 'fs'
import { compile } from '../../compile'
import * as effects from '../../optimizer/scoreboard-effects'
import { resolveCorpusPackPath } from '../../mc-test/corpus-deployer'
import {
  SCORE_EFFECTS_CASES,
  SCORE_EFFECTS_NAMESPACE,
  SCORE_EFFECTS_SOURCE_PATH,
} from '../../../tests/mc-cases/scoreboard-call-effects-cases'

function compileFixture() {
  return compile(fs.readFileSync(SCORE_EFFECTS_SOURCE_PATH, 'utf8'), {
    namespace: SCORE_EFFECTS_NAMESPACE,
    filePath: SCORE_EFFECTS_SOURCE_PATH,
  }).files
}

function commands(content: string): string[] {
  return content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'))
}

describe('scoreboard effect output through the production compiler', () => {
  test('live descriptors have stable deployment IDs and generated entrypoints', () => {
    const files = compileFixture()
    expect(new Set(SCORE_EFFECTS_CASES.map(descriptor => descriptor.id)).size).toBe(SCORE_EFFECTS_CASES.length)
    for (const descriptor of SCORE_EFFECTS_CASES) {
      expect(() => resolveCorpusPackPath('/unused-fixture', descriptor.id!)).not.toThrow()
      expect(descriptor.entrypoints).toHaveLength(1)
      for (const entry of descriptor.entrypoints ?? []) {
        const path = `data/${descriptor.namespace}/function/${entry.target}.mcfunction`
        expect(files.some(file => file.path === path)).toBe(true)
      }
    }
  })

  test('removes one command/read from the readonly cooldown entrypoint', () => {
    const optimized = compileFixture()
    // Same production pipeline with only call-effect knowledge removed. No
    // second compiler implementation or public optimization flag is needed.
    const withoutEffects = jest.spyOn(effects, 'findScoreboardPreservingFunctions')
      .mockReturnValue(new Set<string>())
    let baseline: ReturnType<typeof compileFixture>
    try {
      baseline = compileFixture()
    } finally {
      withoutEffects.mockRestore()
    }

    const filePath = `data/${SCORE_EFFECTS_NAMESPACE}/function/test_readonly.mcfunction`
    const before = baseline.find(file => file.path === filePath)!.content
    const after = optimized.find(file => file.path === filePath)!.content
    const inputRead = 'scoreboard players get #cooldown effect_inputs'
    expect(before.split(inputRead)).toHaveLength(3)
    expect(after.split(inputRead)).toHaveLength(2)
    expect(commands(before).length - commands(after).length).toBe(1)
    expect(after).toContain(`function ${SCORE_EFFECTS_NAMESPACE}:cooldown_cost_chain`)

    for (const name of ['test_mutating', 'test_raw', 'test_context_write']) {
      const body = optimized.find(file => file.path.endsWith(`/${name}.mcfunction`))!.content
      expect(body.split(inputRead)).toHaveLength(3)
    }
  })
})
