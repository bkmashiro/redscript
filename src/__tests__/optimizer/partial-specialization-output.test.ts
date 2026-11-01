import { describe, expect, jest, test } from '@jest/globals'
import * as fs from 'fs'
import { compile } from '../../compile'
import * as specialization from '../../optimizer/interprocedural'
import { SCORE_EFFECTS_NAMESPACE as namespace, SCORE_EFFECTS_SOURCE_PATH as filePath } from '../../../tests/mc-cases/scoreboard-call-effects-cases'

function compileFixture() {
  return compile(fs.readFileSync(filePath, 'utf8'), { namespace, filePath }).files
}
function commands(content: string): string[] {
  return content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'))
}

describe('partial specialization through the production compiler', () => {
  test.each(['@no-inline', '', '@inline'])('does not bypass runtime decorators (hint: %s)', hint => {
    const result = compile(`
      ${hint}
      @retry(max=2)
      fn limited_cost(value: int, factor: int): int { return value * factor }
      fn main() {
        let value: int = scoreboard_get("#input", "inputs")
        scoreboard_set("#output", "outputs", limited_cost(value, 3))
      }
    `, { namespace: 'runtime_boundary' })
    const body = result.files.find(file => file.path.endsWith('/main.mcfunction'))!.content
    expect(body).not.toContain('__partial_')
    expect(body).toContain('function runtime_boundary:limited_cost')
  })

  test.each([
    ['test_partial_identity', 'scale_cost'],
    ['test_partial_affine', 'scale_cost'],
    ['test_partial_order', 'scale_cost_ordered'],
  ])('%s reduces the straight-line call path, including its callee', (entry, helper) => {
    const optimized = compileFixture()
    const disabled = jest.spyOn(specialization, 'interproceduralConstProp').mockImplementation(module => module)
    let baseline: ReturnType<typeof compileFixture>
    try { baseline = compileFixture() } finally { disabled.mockRestore() }
    const body = (files: typeof baseline, name: string) => files.find(file => file.path === `data/${namespace}/function/${name}.mcfunction`)!.content
    const afterEntry = body(optimized, entry)
    const target = new RegExp(`^function ${namespace}:(\\S+)`, 'm').exec(afterEntry)![1]
    expect(target).toContain('__partial_')
    const beforePath = commands(body(baseline, entry)).length + commands(body(baseline, helper)).length
    const afterPath = commands(afterEntry).length + commands(body(optimized, target)).length
    expect(afterPath).toBeLessThan(beforePath)
    // Original user functions remain externally callable. Report increased pack
    // size rather than implying specialization makes every metric smaller.
    const total = (files: typeof baseline) => files.filter(file => file.path.endsWith('.mcfunction'))
      .reduce((sum, file) => sum + commands(file.content).length, 0)
    expect(total(optimized)).toBeGreaterThan(total(baseline))
  })
})
