import * as path from 'path'

import { MCTestClient } from '../mc-test/client'
import { runMcCoreCase } from '../mc-test/case-runner'
import { STDLIB_GAP_CASES } from '../../tests/mc-cases/stdlib-gap-cases'

const host = process.env.MC_HOST ?? 'localhost'
const port = Number(process.env.MC_PORT ?? '25561')
const serverRoot = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')
const requireOnline = process.env.MC_STDLIB_GAP_REQUIRE_ONLINE === 'true'
const instrument = process.env.MC_STDLIB_GAP_INSTRUMENT_COVERAGE === 'true'
const templates = [
  path.resolve(process.env.HOME!, 'mc-test-server'),
  path.resolve(process.env.HOME!, 'mc-test-server-26.2'),
]
const expectedFunctions: Record<string, string[]> = {
  'stdlib-gap.advanced': ['data/gap_advanced/function/fib.mcfunction'],
  'stdlib-gap.bits': [
    'data/gap_bits/function/bit_and.mcfunction',
    'data/gap_bits/function/bit_clear.mcfunction',
    'data/gap_bits/function/bit_get.mcfunction',
    'data/gap_bits/function/bit_not.mcfunction',
    'data/gap_bits/function/bit_or.mcfunction',
    'data/gap_bits/function/bit_set.mcfunction',
    'data/gap_bits/function/bit_shl.mcfunction',
    'data/gap_bits/function/bit_shr.mcfunction',
    'data/gap_bits/function/bit_toggle.mcfunction',
    'data/gap_bits/function/bit_xor.mcfunction',
    'data/gap_bits/function/popcount.mcfunction',
  ],
  // expr_eval is inlined; semantic + entry receipt are required, but no artifact marker is claimed.
  'stdlib-gap.expr': [],
  'stdlib-gap.linalg': ['data/gap_linalg/function/vec2d_dot.mcfunction'],
  'stdlib-gap.sets': [
    'data/gap_sets/function/set_new.mcfunction',
    'data/gap_sets/function/set_add.mcfunction',
    'data/gap_sets/function/set_contains.mcfunction',
    'data/gap_sets/function/set_remove.mcfunction',
    'data/gap_sets/function/set_clear.mcfunction',
  ],
  'stdlib-gap.result': ['data/gap_result_ns/function/result_divide.mcfunction', 'data/gap_result_ns/function/result_value.mcfunction'],
  'stdlib-gap.state': ['data/gap_state/function/is_state.mcfunction'],
}

let client: MCTestClient
let online = false

beforeAll(async () => {
  client = new MCTestClient(host, port)
  online = await client.isOnline()
  if (requireOnline && !online) throw new Error('stdlib gap oracle requires an online TestHarness')
  if (!online) return
  if (templates.includes(path.resolve(serverRoot))) {
    throw new Error(`MC_SERVER_DIR must be disposable, not frozen template '${serverRoot}'`)
  }
  await client.command('/scoreboard objectives add gap_result dummy').catch(() => {})
}, 40_000)

afterAll(async () => {
  if (online) await client.command('/kill @e[tag=gap_state_target]').catch(() => {})
})

describe('stdlib zero-reference representative semantic oracles', () => {
  for (const descriptor of STDLIB_GAP_CASES) {
    test(descriptor.name, async () => {
      const result = await runMcCoreCase(descriptor, {
        client,
        serverRoot,
        instrumentFunctionCoverage: instrument,
      })
      if (result.status === 'skipped') return
      if (result.status === 'failed') throw new Error(result.error)
      expect(result.status).toBe('passed')
      if (instrument) {
        const executed = new Set(result.functionCoverage?.filter(item => item.executed).map(item => item.artifactPath))
        const expectedArtifacts = expectedFunctions[descriptor.id!]
        expect(expectedArtifacts).toBeDefined()
        for (const expected of expectedArtifacts) expect(executed.has(expected)).toBe(true)
      }
    }, 40_000)
  }
})
