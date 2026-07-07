/**
 * RedScript MC Core Oracle (descriptor-driven)
 *
 * This suite runs a small set of high-signal core behavior cases through
 * a reusable descriptor runner. When no harness is online, each case is
 * marked skipped with a clear reason rather than producing false semantic proof.
 */

import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../compile'
import { MCTestClient } from '../mc-test/client'
import { runMcCoreCase } from '../mc-test/case-runner'
import {
  CORE_ORACLE_CASES,
  CORE_ORACLE_NAMESPACE,
  CORE_ORACLE_SOURCE_PATH,
} from '../../tests/mc-cases/core-oracle-cases'

const MC_HOST = process.env.MC_HOST ?? 'localhost'
const MC_PORT = parseInt(process.env.MC_PORT ?? '25561')
const MC_SERVER_DIR = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')
const DATAPACK_DIR = path.join(MC_SERVER_DIR, 'world', 'datapacks', 'redscript-core-oracle')
const REQUIRE_ONLINE = process.env.MC_CORE_REQUIRE_ONLINE === 'true'

let mc: MCTestClient

async function waitForServer(timeoutMs = 20000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await mc.isOnline()) return true
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

async function ensurePackMetaPresent(): Promise<void> {
  const packMeta = path.join(DATAPACK_DIR, 'pack.mcmeta')
  if (fs.existsSync(packMeta)) return
  fs.mkdirSync(DATAPACK_DIR, { recursive: true })
  fs.writeFileSync(
    packMeta,
    JSON.stringify({
      pack: {
        pack_format: 48,
        description: 'RedScript MC core oracle fixtures',
      },
    }, null, 2),
  )
}

beforeAll(async () => {
  mc = new MCTestClient(MC_HOST, MC_PORT)
  const online = await waitForServer()
  if (REQUIRE_ONLINE && !online) {
    throw new Error('MC core oracle requested with MC_CORE_REQUIRE_ONLINE=true, but the harness is offline')
  }
  if (!online) return
  await ensurePackMetaPresent()
  await mc.command('/scoreboard objectives add core_oracle dummy').catch(() => {})
}, 40000)

describe('MC Core Oracle (descriptor-driven)', () => {
  for (const descriptor of CORE_ORACLE_CASES) {
    test(descriptor.name, async () => {
      const result = await runMcCoreCase(descriptor, {
        client: mc,
        datapackDir: DATAPACK_DIR,
      })

      if (result.status === 'skipped') {
        console.log(`[SKIP] ${descriptor.name}: ${result.reason}`)
        return
      }

      if (result.status === 'failed') {
        throw new Error(result.error ?? 'case failed without error text')
      }

      expect(result.status).toBe('passed')
    }, 25000)
  }
})

test('compile supports core constructs used by descriptor suite', () => {
  const source = fs.readFileSync(CORE_ORACLE_SOURCE_PATH, 'utf-8')
  expect(() => compile(source, { namespace: CORE_ORACLE_NAMESPACE, filePath: CORE_ORACLE_SOURCE_PATH }))
    .not.toThrow()
}, 30000)

test('generated array macro oracle case is compiler-generated, not a raw command smoke', () => {
  const source = fs.readFileSync(CORE_ORACLE_SOURCE_PATH, 'utf-8')
  const result = compile(source, { namespace: CORE_ORACLE_NAMESPACE, filePath: CORE_ORACLE_SOURCE_PATH })
  const files = result.files ?? []
  const body = files.find(file => file.path.endsWith('/test_generated_array_macro_nested_loop.mcfunction'))?.content
  const loopBody = files.find(file => file.path.endsWith('/test_generated_array_macro_nested_loop__loop_body_1.mcfunction'))?.content
  const helper = files.find(file => file.path.includes('__dyn_idx_') && file.content.includes('nums[$(arr_idx)]'))

  expect(body).toBeDefined()
  expect(loopBody).toBeDefined()
  expect(helper).toBeDefined()
  expect(body).toContain('test_generated_array_macro_nested_loop')
  expect(loopBody).toContain('with storage rs:macro_args')
  expect(loopBody).toContain('function core_oracle_mc:__dyn_idx_core_oracle_mc_arrays_nums')
  expect(helper!.content).toContain('$return run data get')
  expect(helper!.content).toContain('nums[$(arr_idx)]')
}, 30000)
