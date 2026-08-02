import {
  assertMcIntegrationConfiguration,
  assertMcIntegrationPrerequisites,
  probeMcIntegrationPrerequisites,
} from '../test-utils/mc-live-prerequisites'

type FakeResponse = {
  ok: boolean
  json: () => Promise<unknown>
}

type FetchCall = (url: string) => Promise<FakeResponse>

function response(body: unknown, ok = true): FakeResponse {
  return { ok, json: async () => body }
}

describe('mc integration live prerequisites', () => {
  test('rejects MC_OFFLINE combined with online strict mode', () => {
    expect(() => assertMcIntegrationConfiguration({
      MC_OFFLINE: 'true',
      MC_INTEGRATION_REQUIRE_ONLINE: 'true',
    })).toThrow(/MC_OFFLINE.*MC_INTEGRATION_REQUIRE_ONLINE|MC_INTEGRATION_REQUIRE_ONLINE.*MC_OFFLINE/)
  })

  test('rejects MC_OFFLINE combined with bot strict mode', () => {
    expect(() => assertMcIntegrationConfiguration({
      MC_OFFLINE: 'true',
      MC_INTEGRATION_REQUIRE_BOT: 'true',
    })).toThrow(/MC_OFFLINE.*MC_INTEGRATION_REQUIRE_BOT|MC_INTEGRATION_REQUIRE_BOT.*MC_OFFLINE/)
  })

  test('optional mode preserves offline behavior without probing the server or bot', async () => {
    const calls: string[] = []
    const fetchImpl: FetchCall = async (url) => {
      calls.push(url)
      throw new Error('fetch should not be called in optional offline mode')
    }

    const state = await probeMcIntegrationPrerequisites({
      env: { MC_OFFLINE: 'true' },
      fetchImpl,
    })

    expect(state).toEqual({ serverOnline: false, botConnected: false })
    expect(calls).toEqual([])
  })

  test('strict online mode fails when the TestHarness server is unavailable', async () => {
    const fetchImpl: FetchCall = async () => {
      throw new Error('connection refused')
    }

    await expect(probeMcIntegrationPrerequisites({
      env: { MC_INTEGRATION_REQUIRE_ONLINE: 'true' },
      fetchImpl,
    })).rejects.toThrow(/TestHarness server.*unavailable|server.*unavailable/i)
  })

  test('bot strict mode requires the server and connected bot status', async () => {
    const urls: string[] = []
    const fetchImpl: FetchCall = async (url) => {
      urls.push(url)
      if (url.endsWith('/status') && url.includes(':25561')) {
        return response({ online: true })
      }
      return response({ connected: false })
    }

    await expect(probeMcIntegrationPrerequisites({
      env: { MC_INTEGRATION_REQUIRE_BOT: 'true' },
      fetchImpl,
    })).rejects.toThrow(/bot.*connected|bot.*unavailable/i)
    expect(urls).toEqual([
      'http://localhost:25561/status',
      'http://localhost:25562/status',
    ])
  })

  test('bot strict mode fails when the server is unavailable', async () => {
    const fetchImpl: FetchCall = async () => {
      throw new Error('connection refused')
    }

    await expect(probeMcIntegrationPrerequisites({
      env: { MC_INTEGRATION_REQUIRE_BOT: 'true' },
      fetchImpl,
    })).rejects.toThrow(/TestHarness server.*unavailable/i)
  })

  test('bot status is accepted only when connected is exactly true', async () => {
    const fetchImpl: FetchCall = async (url) => {
      if (url === 'http://localhost:25561/status') return response({ online: true })
      return response({ connected: true })
    }

    await expect(probeMcIntegrationPrerequisites({
      env: { MC_INTEGRATION_REQUIRE_BOT: 'true' },
      fetchImpl,
    })).resolves.toEqual({ serverOnline: true, botConnected: true })
  })

  test('uses configured server and bot host/ports', async () => {
    const urls: string[] = []
    const fetchImpl: FetchCall = async (url) => {
      urls.push(url)
      return response(url.includes(':26666') ? { connected: true } : { online: true })
    }

    await expect(probeMcIntegrationPrerequisites({
      env: {
        MC_HOST: 'paper.example.test',
        MC_PORT: '29999',
        MC_BOT_HOST: 'bot.example.test',
        MC_BOT_PORT: '26666',
        MC_INTEGRATION_REQUIRE_BOT: 'true',
      },
      fetchImpl,
    })).resolves.toEqual({ serverOnline: true, botConnected: true })

    expect(urls).toEqual([
      'http://paper.example.test:29999/status',
      'http://bot.example.test:26666/status',
    ])
  })

  test('strict prerequisite assertion fails closed for missing server or bot', () => {
    expect(() => assertMcIntegrationPrerequisites(
      { serverOnline: false, botConnected: false },
      { MC_INTEGRATION_REQUIRE_ONLINE: 'true' },
    )).toThrow(/TestHarness server/i)

    expect(() => assertMcIntegrationPrerequisites(
      { serverOnline: true, botConnected: false },
      { MC_INTEGRATION_REQUIRE_BOT: 'true' },
    )).toThrow(/bot/i)
  })
})
