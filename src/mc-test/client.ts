/**
 * RedScript MC Test Client
 *
 * Connects to a Paper server running TestHarnessPlugin and provides
 * a fluent API for integration testing compiled datapacks.
 *
 * Usage:
 *   const mc = new MCTestClient('localhost', 25561)
 *   await mc.command('/function arena:start')
 *   await mc.ticks(100)
 *   const score = await mc.scoreboard('Alice', 'kills')
 *   expect(score).toBe(3)
 */

export interface ScoreResult {
  player: string
  obj: string
  value: number
}

export interface BlockResult {
  x: number
  y: number
  z: number
  world: string
  type: string
  blockData: string
}

export interface EntityResult {
  uuid: string
  name: string
  type: string
  x: number
  y: number
  z: number
  world: string
  tags: string[]
}

export interface ChatMessage {
  tick: number
  type: string
  sender?: string
  message: string
}

export interface GameEvent {
  tick: number
  type: string
  player?: string
  advancement?: string
  cause?: string
}

export interface ServerStatus {
  online: boolean
  tps_1m: number
  tps_5m: number
  tps_15m: number
  players: number
  playerNames: string[]
  worlds: string[]
  version: string
}

export class MCTestClient {
  private baseUrl: string

  constructor(host = 'localhost', port = 25561) {
    this.baseUrl = `http://${host}:${port}`
  }

  private async get<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    const qs = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&')
    const url = `${this.baseUrl}${path}${qs ? '?' + qs : ''}`
    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`GET ${path} failed ${res.status}: ${body}`)
    }
    return res.json() as Promise<T>
  }

  private async post<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`POST ${path} failed ${res.status}: ${text}`)
    }
    return res.json() as Promise<T>
  }

  /** Check if server is reachable */
  async isOnline(): Promise<boolean> {
    try {
      const status = await this.get<ServerStatus>('/status')
      return status.online
    } catch {
      return false
    }
  }

  /** Get server status */
  async status(): Promise<ServerStatus> {
    return this.get('/status')
  }

  /** Run a command on the server (as console sender) */
  async command(cmd: string): Promise<{ ok: boolean; cmd: string }> {
    return this.post('/command', { cmd })
  }

  /** Wait for N server ticks (50ms each) */
  async ticks(count: number): Promise<void> {
    await this.post('/tick', { count })
  }

  /** Wait for 1 second = 20 ticks */
  async seconds(s: number): Promise<void> {
    await this.ticks(s * 20)
  }

  /** Get a scoreboard value */
  async scoreboard(player: string, obj: string): Promise<number> {
    const result = await this.get<ScoreResult>('/scoreboard', { player, obj })
    return result.value
  }

  /** Get all scoreboard values for a selector */
  async scoreboardAll(selector: string, obj: string): Promise<ScoreResult[]> {
    return this.get('/scoreboard', { player: selector, obj })
  }

  /** Get block at position */
  async block(x: number, y: number, z: number, world = 'world'): Promise<BlockResult> {
    return this.get('/block', { x, y, z, world })
  }

  /** Get entities matching selector */
  async entities(selector = '@e'): Promise<EntityResult[]> {
    return this.get('/entity', { sel: selector })
  }

  /** Get chat log since a tick */
  async chat(since = 0): Promise<ChatMessage[]> {
    return this.get('/chat', { since })
  }

  /** Get last N chat messages */
  async chatLast(n: number): Promise<ChatMessage[]> {
    return this.get('/chat', { last: n })
  }

  /** Get events since a tick, optionally filtered by type */
  async events(since = 0, type?: string): Promise<GameEvent[]> {
    const params: Record<string, string | number> = { since }
    if (type) params.type = type
    return this.get('/events', params)
  }

  /** Clear chat and event logs */
  async reset(): Promise<void> {
    await this.post('/reset')
  }

  /**
   * Full test reset: clear logs + fill test area with air + kill entities + reset scoreboards.
   * Call this at the start of each integration test.
   */
  async fullReset(options?: {
    x1?: number; y1?: number; z1?: number
    x2?: number; y2?: number; z2?: number
    clearArea?: boolean
    killEntities?: boolean
    resetScoreboards?: boolean
  }): Promise<void> {
    await this.post('/reset', {
      clearArea: options?.clearArea ?? true,
      killEntities: options?.killEntities ?? true,
      resetScoreboards: options?.resetScoreboards ?? true,
      x1: options?.x1 ?? -50, y1: options?.y1 ?? 0, z1: options?.z1 ?? -50,
      x2: options?.x2 ?? 50,  y2: options?.y2 ?? 100, z2: options?.z2 ?? 50,
    })
  }

  /** Reload datapacks */
  async reload(): Promise<void> {
    await this.post('/reload')
    await this.ticks(40) // wait 2s for reload
  }

  /**
   * Assert a scoreboard value equals expected.
   * Throws with a descriptive error if it doesn't match.
   */
  async assertScore(player: string, obj: string, expected: number, msg?: string): Promise<void> {
    const actual = await this.scoreboard(player, obj)
    if (actual !== expected) {
      throw new Error(
        msg ?? `assertScore failed: ${player}/${obj} expected ${expected}, got ${actual}`
      )
    }
  }

  /**
   * Assert a block type at position.
   */
  async assertBlock(x: number, y: number, z: number, expectedType: string, world = 'world'): Promise<void> {
    const block = await this.block(x, y, z, world)
    if (block.type !== expectedType) {
      throw new Error(
        `assertBlock failed: (${x},${y},${z}) expected ${expectedType}, got ${block.type}`
      )
    }
  }

  /**
   * Assert chat log contains a message matching substring.
   */
  async assertChatContains(substring: string, since = 0): Promise<void> {
    const msgs = await this.chat(since)
    const found = msgs.some(m => m.message.includes(substring))
    if (!found) {
      const recent = msgs.map(m => m.message).slice(-5).join(', ')
      throw new Error(
        `assertChatContains: "${substring}" not found in chat. Recent: [${recent}]`
      )
    }
  }

  /**
   * Wait until a scoreboard value equals expected, up to timeout ms.
   */
  async waitForScore(
    player: string,
    obj: string,
    expected: number,
    timeoutMs = 5000,
    pollMs = 100
  ): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const val = await this.scoreboard(player, obj)
        if (val === expected) return
      } catch { /* ignore transient errors */ }
      await new Promise(r => setTimeout(r, pollMs))
    }
    const final = await this.scoreboard(player, obj)
    throw new Error(`waitForScore: ${player}/${obj} never reached ${expected} (last: ${final})`)
  }
}
