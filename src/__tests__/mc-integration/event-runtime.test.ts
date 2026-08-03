/** Managed live oracle for RedScript built-in @on events. */
import * as fs from 'fs'
import * as path from 'path'
import { compile } from '../../compile'
import { MCTestClient } from '../../mc-test/client'
import { ensureCorpusPackWorkspace, removeCorpusPack, resolveCorpusPackPath } from '../../mc-test/corpus-deployer'
import {
  assertMcIntegrationConfiguration,
  assertMcIntegrationPrerequisites,
} from '../../test-utils/mc-live-prerequisites'

const MC_HOST = process.env.MC_HOST ?? 'localhost'
const MC_PORT = parseInt(process.env.MC_PORT ?? '25561')
const MC_SERVER_DIR = process.env.MC_SERVER_DIR ?? path.join(process.env.HOME!, 'mc-test-server')
const CORPUS_CASE_ID = 'event-runtime'
const DATAPACK_DIR = resolveCorpusPackPath(MC_SERVER_DIR, CORPUS_CASE_ID)
const BOT_NAME = process.env.MC_BOT_NAME ?? 'TestBot'
const RESULT_OBJECTIVE = 'event_result'
const BOT_URL = (process.env.MC_BOT_URL
  ?? `http://${process.env.MC_BOT_HOST ?? 'localhost'}:${process.env.MC_BOT_PORT ?? '25562'}`).replace(/\/+$/, '')

let serverOnline = false
let botOnline = false
let mc: MCTestClient

function writeFixture(source: string, namespace: string): void {
  ensureCorpusPackWorkspace(MC_SERVER_DIR, CORPUS_CASE_ID)
  if (!fs.existsSync(path.join(DATAPACK_DIR, 'pack.mcmeta'))) {
    fs.writeFileSync(path.join(DATAPACK_DIR, 'pack.mcmeta'), JSON.stringify({
      pack: { pack_format: 48, description: 'RedScript event runtime oracle' },
    }))
  }
  const result = compile(source, { namespace })
  if (!result.success) throw new Error('event fixture failed to compile')
  for (const file of result.files) {
    if (file.path === 'pack.mcmeta') continue
    const out = path.join(DATAPACK_DIR, file.path)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    if (file.path.includes('/tags/function/') && fs.existsSync(out)) {
      const existing = JSON.parse(fs.readFileSync(out, 'utf8')) as { values?: string[] }
      const incoming = JSON.parse(file.content) as { values?: string[] }
      const values = [...new Set([...(existing.values ?? []), ...(incoming.values ?? [])])]
      fs.writeFileSync(out, JSON.stringify({ values }, null, 2))
    } else {
      fs.writeFileSync(out, file.content)
    }
  }
}

async function botStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${BOT_URL}/status`)
    if (!response.ok) return false
    return Boolean((await response.json() as { connected?: boolean }).connected)
  } catch {
    return false
  }
}

async function botPost<T>(endpoint: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`${BOT_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(`TestBot ${endpoint} failed ${response.status}: ${payload.error ?? 'unknown error'}`)
  return payload
}

beforeAll(async () => {
  assertMcIntegrationConfiguration()
  if (process.env.MC_OFFLINE === 'true') return
  mc = new MCTestClient(MC_HOST, MC_PORT)
  serverOnline = await mc.isOnline()
  botOnline = await botStatus()
  assertMcIntegrationPrerequisites({ serverOnline, botConnected: botOnline })

  writeFixture(`
    namespace event_oracle_a
    @on(PlayerJoin)
    fn on_join() { raw("scoreboard players add evt_join_a event_result 1"); }
    @on(PlayerDeath)
    fn on_death() { raw("scoreboard players add evt_death event_result 1"); }
    @on(EntityKill)
    fn on_kill() { raw("scoreboard players add evt_kill event_result 1"); }
  `, 'event_oracle_a')

  writeFixture(`
    namespace event_oracle_b
    @on(PlayerJoin)
    fn on_join() { raw("scoreboard players add evt_join_b event_result 1"); }
  `, 'event_oracle_b')

  for (const objective of ['rs.deaths', 'rs.kills', 'rs.left', 'rs.events', RESULT_OBJECTIVE]) {
    await mc.command(`/scoreboard objectives remove ${objective}`).catch(() => {})
  }
  await mc.command(`/scoreboard objectives add ${RESULT_OBJECTIVE} dummy`)
  for (const holder of ['evt_join_a', 'evt_join_b', 'evt_death', 'evt_kill']) {
    await mc.command(`/scoreboard players set ${holder} ${RESULT_OBJECTIVE} 0`)
  }
  await mc.command(`/tag ${BOT_NAME} remove rs.joined`)
  await mc.command('/kill @e[tag=rs_event_target]')
  await mc.reload()
  await mc.ticks(10)
}, 90_000)

afterAll(async () => {
  if (!fs.existsSync(DATAPACK_DIR)) return
  removeCorpusPack(DATAPACK_DIR, CORPUS_CASE_ID)
  if (serverOnline) {
    await mc.command('/kill @e[tag=rs_event_target]').catch(() => {})
    await mc.reload()
  }
}, 30_000)

describe('managed @on event runtime', () => {
  test('compiled handlers and generated function tag are reachable', async () => {
    if (!serverOnline || !botOnline) return
    await mc.command(`/scoreboard players set evt_join_a ${RESULT_OBJECTIVE} 0`)
    await mc.command(`/scoreboard players set evt_join_b ${RESULT_OBJECTIVE} 0`)
    await mc.command('/function event_oracle_a:on_join')
    expect(await mc.scoreboard('evt_join_a', RESULT_OBJECTIVE)).toBe(1)
    await mc.command(`/scoreboard players set evt_join_a ${RESULT_OBJECTIVE} 0`)
    await mc.command('/function #rs:on_player_join')
    expect(await mc.scoreboard('evt_join_a', RESULT_OBJECTIVE)).toBe(1)
    expect(await mc.scoreboard('evt_join_b', RESULT_OBJECTIVE)).toBe(1)
  })

  test('two embedded runtimes dispatch first-appearance PlayerJoin exactly once', async () => {
    if (!serverOnline || !botOnline) return
    await mc.command(`/scoreboard players set evt_join_a ${RESULT_OBJECTIVE} 0`)
    await mc.command(`/scoreboard players set evt_join_b ${RESULT_OBJECTIVE} 0`)
    await mc.command(`/tag ${BOT_NAME} remove rs.joined`)
    await mc.ticks(3)
    expect(await mc.scoreboard('evt_join_a', RESULT_OBJECTIVE)).toBe(1)
    expect(await mc.scoreboard('evt_join_b', RESULT_OBJECTIVE)).toBe(1)
  })

  test('a real disconnect and reconnect dispatches PlayerJoin exactly once', async () => {
    if (!serverOnline || !botOnline) return
    await botPost('/reconnect')
    await mc.ticks(10)
    expect(await mc.scoreboard('evt_join_a', RESULT_OBJECTIVE)).toBe(2)
    expect(await mc.scoreboard('evt_join_b', RESULT_OBJECTIVE)).toBe(2)
  }, 60_000)

  test('a real player death dispatches PlayerDeath exactly once', async () => {
    if (!serverOnline || !botOnline) return
    await mc.command(`/scoreboard players set evt_death ${RESULT_OBJECTIVE} 0`)
    await mc.command(`/kill ${BOT_NAME}`)
    await mc.ticks(20)
    expect(await mc.scoreboard('evt_death', RESULT_OBJECTIVE)).toBe(1)
  }, 60_000)

  test('a real Mineflayer combat kill dispatches EntityKill exactly once', async () => {
    if (!serverOnline || !botOnline) return
    await mc.command(`/scoreboard players set evt_kill ${RESULT_OBJECTIVE} 0`)
    await mc.command(`/tp ${BOT_NAME} 0 65 0`)
    await mc.command('/fill -1 64 -1 2 67 2 minecraft:barrier hollow')
    await mc.command('/summon minecraft:pig 1 65 0 {Tags:["rs_event_target"],NoAI:1b,PersistenceRequired:1b}')
    try {
      await mc.ticks(2)
      const result = await botPost<{ killed: boolean }>('/attack-nearest', { name: 'pig', maxAttacks: 32 })
      expect(result.killed).toBe(true)
      await mc.ticks(10)
      expect(await mc.scoreboard('evt_kill', RESULT_OBJECTIVE)).toBe(1)
    } finally {
      await mc.command('/kill @e[tag=rs_event_target]').catch(() => {})
      await mc.command('/fill -1 65 -1 2 67 2 minecraft:air').catch(() => {})
      await mc.command('/fill -1 64 -1 2 64 2 minecraft:smooth_stone').catch(() => {})
    }
  }, 90_000)
})
