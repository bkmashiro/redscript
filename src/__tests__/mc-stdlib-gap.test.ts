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
  'stdlib-gap.bigint-add': [
    'data/gap_bigint_add/function/bigint_add__arr_a__gap_bigint_add_arrays__a__b__gap_bigint_add_arrays__b__result__gap_bigint_add_arrays__out.mcfunction',
  ],
  'stdlib-gap.bigint-sub': [
    'data/gap_bigint_sub/function/bigint_sub__arr_a__gap_bigint_sub_arrays__a__b__gap_bigint_sub_arrays__b__result__gap_bigint_sub_arrays__out.mcfunction',
  ],
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
  'stdlib-gap.calculus': [
    'data/gap_calculus/function/deriv_central.mcfunction',
    'data/gap_calculus/function/deriv_forward.mcfunction',
    'data/gap_calculus/function/integrate_simpson__arr_vals__gap_calculus_arrays__linear.mcfunction',
    'data/gap_calculus/function/integrate_trapezoid__arr_vals__gap_calculus_arrays__constant.mcfunction',
    'data/gap_calculus/function/integrate_trapezoid__arr_vals__gap_calculus_arrays__linear.mcfunction',
    'data/gap_calculus/function/running_m2__const_0_20000_30000_40000.mcfunction',
    'data/gap_calculus/function/running_mean.mcfunction',
    'data/gap_calculus/function/variance_from_m2.mcfunction',
  ],
  // expr_eval is currently inlined; semantic + entry receipt are required, but no artifact marker is claimed.
  'stdlib-gap.expr': [],
  'stdlib-gap.list-dynamic': [
    ...[['list_sum','values'],['list_avg','values'],['list_min','values'],['list_max','values'],['list_contains','values'],['list_index_of','values'],['list_dedup_count','values'],['list_sort_asc','asc'],['list_sort_desc','desc'],['list_shuffle','source']].map(([name, array]) => `data/gap_list_dynamic/function/${name}__arr_arr__gap_list_dynamic_arrays__${array}.mcfunction`),
  ],
  'stdlib-gap.heap': [
    'data/gap_heap/function/heap_new.mcfunction',
    'data/gap_heap/function/heap_push__arr_h__gap_heap_arrays__isolated.mcfunction',
    'data/gap_heap/function/heap_push__arr_h__gap_heap_arrays__min_h.mcfunction',
    'data/gap_heap/function/heap_pop__arr_h__gap_heap_arrays__min_h.mcfunction',
    'data/gap_heap/function/max_heap_push__arr_h__gap_heap_arrays__max_h.mcfunction',
    'data/gap_heap/function/max_heap_pop__arr_h__gap_heap_arrays__max_h.mcfunction',
  ],
  'stdlib-gap.linalg': ['data/gap_linalg/function/vec2d_dot.mcfunction'],
  'stdlib-gap.list-fixed': [
    ...['list_min3','list_max3','list_min5','list_max5','sort3','sort4','sort5','weighted2','weighted3'].map(name => `data/gap_list_fixed/function/${name}.mcfunction`),
    'data/gap_list_fixed/function/avg5__const_1_2_3_4_5.mcfunction',
  ],
  'stdlib-gap.math': ['data/gap_math/function/clamp_int.mcfunction','data/gap_math/function/gcd.mcfunction','data/gap_math/function/isqrt.mcfunction','data/gap_math/function/pow_int.mcfunction'],
  'stdlib-gap.timer': [],
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
        const missingArtifacts = expectedArtifacts.filter(expected => !executed.has(expected))
        expect(missingArtifacts).toEqual([])
      }
    }, 40_000)
  }
})
