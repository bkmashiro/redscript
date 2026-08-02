export interface McIntegrationPrerequisiteState {
  serverOnline: boolean
  botConnected: boolean
}

export interface McIntegrationPrerequisiteOptions {
  env?: NodeJS.ProcessEnv
  fetchImpl?: McIntegrationFetch
}

export interface McIntegrationFetchResponse {
  ok: boolean
  json(): Promise<unknown>
}

export type McIntegrationFetch = (url: string) => Promise<McIntegrationFetchResponse>

interface McIntegrationRequirements {
  offline: boolean
  requireOnline: boolean
  requireBot: boolean
  serverUrl: string
  botUrl: string
}

function isTrue(value: string | undefined): boolean {
  return value === 'true'
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function requirements(env: NodeJS.ProcessEnv): McIntegrationRequirements {
  const requireBot = isTrue(env.MC_INTEGRATION_REQUIRE_BOT)
  return {
    offline: isTrue(env.MC_OFFLINE),
    requireOnline: isTrue(env.MC_INTEGRATION_REQUIRE_ONLINE) || requireBot,
    requireBot,
    serverUrl: trimTrailingSlash(
      `http://${env.MC_HOST ?? 'localhost'}:${env.MC_PORT ?? '25561'}`
    ),
    botUrl: trimTrailingSlash(
      env.MC_BOT_URL
        ?? `http://${env.MC_BOT_HOST ?? 'localhost'}:${env.MC_BOT_PORT ?? '25562'}`
    ),
  }
}

export function assertMcIntegrationConfiguration(env: NodeJS.ProcessEnv = process.env): void {
  const config = requirements(env)
  if (config.offline && config.requireOnline) {
    throw new Error(
      'Invalid mc-integration configuration: MC_OFFLINE=true conflicts with '
      + 'MC_INTEGRATION_REQUIRE_ONLINE=true or MC_INTEGRATION_REQUIRE_BOT=true'
    )
  }
}

export function assertMcIntegrationPrerequisites(
  state: McIntegrationPrerequisiteState,
  env: NodeJS.ProcessEnv = process.env
): void {
  assertMcIntegrationConfiguration(env)
  const config = requirements(env)

  if (config.requireOnline && !state.serverOnline) {
    throw new Error(
      `Required TestHarness server is unavailable at ${config.serverUrl}/status`
    )
  }

  if (config.requireBot && !state.botConnected) {
    throw new Error(
      `Required TestBot is unavailable or not connected at ${config.botUrl}/status`
    )
  }
}

async function readStatus(fetchImpl: McIntegrationFetch, url: string): Promise<unknown | null> {
  try {
    const response = await fetchImpl(`${url}/status`)
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

export async function probeMcIntegrationPrerequisites({
  env = process.env,
  fetchImpl = (globalThis.fetch as unknown as McIntegrationFetch),
}: McIntegrationPrerequisiteOptions = {}): Promise<McIntegrationPrerequisiteState> {
  assertMcIntegrationConfiguration(env)
  const config = requirements(env)

  if (config.offline) {
    return { serverOnline: false, botConnected: false }
  }

  const serverStatus = await readStatus(fetchImpl, config.serverUrl)
  const serverOnline = serverStatus !== null
    && typeof serverStatus === 'object'
    && (serverStatus as { online?: unknown }).online === true

  if (!serverOnline) {
    const state = { serverOnline: false, botConnected: false }
    assertMcIntegrationPrerequisites(state, env)
    return state
  }

  const botStatus = await readStatus(fetchImpl, config.botUrl)
  const botConnected = botStatus !== null
    && typeof botStatus === 'object'
    && (botStatus as { connected?: unknown }).connected === true
  const state = { serverOnline, botConnected }
  assertMcIntegrationPrerequisites(state, env)
  return state
}
