/**
 * MCTestClient Unit Tests
 *
 * Tests failure modes without a real server by mocking the global fetch API.
 *
 * Covers:
 *   - Network failures (fetch rejects)
 *   - Non-OK HTTP responses
 *   - Malformed / missing JSON fields
 *   - waitForScore timeout expiry
 *   - assertScore / assertBlock / assertChatContains / dumpScores / assertScoreMap
 *     throwing with descriptive messages when conditions are not met
 */

import { MCTestClient } from '../../mc-test/client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal Response-like object that fetch returns */
function okResponse(body: unknown): Response {
  const json = JSON.stringify(body)
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(json),
    json: () => Promise.resolve(body),
  } as unknown as Response
}

function errorResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.reject(new SyntaxError('not json')),
  } as unknown as Response
}

/** Replace global fetch for the duration of one test */
function mockFetch(impl: jest.Mock): void {
  global.fetch = impl
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Network failures
// ---------------------------------------------------------------------------

describe('network failures', () => {
  it('get() rejects when fetch throws (server unreachable)', async () => {
    mockFetch(jest.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const mc = new MCTestClient('unreachable-host', 25561)
    await expect(mc.status()).rejects.toThrow('Failed to fetch')
  })

  it('post() rejects when fetch throws', async () => {
    mockFetch(jest.fn().mockRejectedValue(new TypeError('connect ECONNREFUSED')))
    const mc = new MCTestClient()
    await expect(mc.command('/say hello')).rejects.toThrow('connect ECONNREFUSED')
  })

  it('isOnline() returns false when server is unreachable', async () => {
    mockFetch(jest.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const mc = new MCTestClient()
    await expect(mc.isOnline()).resolves.toBe(false)
  })

  it('scoreboard() rejects on network error', async () => {
    mockFetch(jest.fn().mockRejectedValue(new Error('socket hang up')))
    const mc = new MCTestClient()
    await expect(mc.scoreboard('Alice', 'kills')).rejects.toThrow('socket hang up')
  })
})

// ---------------------------------------------------------------------------
// Non-OK HTTP responses
// ---------------------------------------------------------------------------

describe('non-OK HTTP responses', () => {
  it('get() throws with status and body on 500', async () => {
    mockFetch(jest.fn().mockResolvedValue(errorResponse(500, 'internal server error')))
    const mc = new MCTestClient()
    await expect(mc.scoreboard('Alice', 'kills')).rejects.toThrow(
      'GET /scoreboard failed 500: internal server error'
    )
  })

  it('get() throws with status and body on 404', async () => {
    mockFetch(jest.fn().mockResolvedValue(errorResponse(404, 'not found')))
    const mc = new MCTestClient()
    await expect(mc.block(0, 64, 0)).rejects.toThrow('GET /block failed 404: not found')
  })

  it('post() throws with status and body on 400', async () => {
    mockFetch(jest.fn().mockResolvedValue(errorResponse(400, 'bad request')))
    const mc = new MCTestClient()
    await expect(mc.command('/invalid')).rejects.toThrow('POST /command failed 400: bad request')
  })

  it('isOnline() returns false on 503', async () => {
    mockFetch(jest.fn().mockResolvedValue(errorResponse(503, 'service unavailable')))
    const mc = new MCTestClient()
    await expect(mc.isOnline()).resolves.toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Malformed JSON responses
// ---------------------------------------------------------------------------

describe('malformed JSON responses', () => {
  it('scoreboard() rejects when response is not valid JSON', async () => {
    mockFetch(jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve('not-json'),
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    } as unknown as Response))
    const mc = new MCTestClient()
    await expect(mc.scoreboard('Alice', 'kills')).rejects.toThrow(SyntaxError)
  })

  it('dumpScores() throws when response is missing entries field', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse({ other: 'field' })))
    const mc = new MCTestClient()
    await expect(mc.dumpScores('myns')).rejects.toThrow(
      'dumpScores: response missing \'entries\' field for ns="myns"'
    )
  })

  it('dumpScoresByObj() throws when response is missing entries field', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse({})))
    const mc = new MCTestClient()
    await expect(mc.dumpScoresByObj('my_obj')).rejects.toThrow(
      'dumpScoresByObj: response missing \'entries\' field for obj="my_obj"'
    )
  })

  it('status() with unexpected shape: isOnline() returns falsy for missing online field', async () => {
    // Returns valid JSON but not a ServerStatus — status.online is undefined (falsy)
    mockFetch(jest.fn().mockResolvedValue(okResponse({ completely: 'wrong' })))
    const mc = new MCTestClient()
    // isOnline() returns status.online directly — undefined is falsy but not strictly false
    const result = await mc.isOnline()
    expect(result).toBeFalsy()
  })
})

// ---------------------------------------------------------------------------
// assertScore
// ---------------------------------------------------------------------------

describe('assertScore', () => {
  it('resolves when actual equals expected', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse({ player: 'Alice', obj: 'kills', value: 3 })))
    const mc = new MCTestClient()
    await expect(mc.assertScore('Alice', 'kills', 3)).resolves.toBeUndefined()
  })

  it('throws with descriptive default message when value does not match', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse({ player: 'Alice', obj: 'kills', value: 1 })))
    const mc = new MCTestClient()
    await expect(mc.assertScore('Alice', 'kills', 3)).rejects.toThrow(
      'assertScore failed: Alice/kills expected 3, got 1'
    )
  })

  it('throws with custom message when provided', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse({ player: 'Bob', obj: 'deaths', value: 0 })))
    const mc = new MCTestClient()
    await expect(mc.assertScore('Bob', 'deaths', 5, 'Bob should have died 5 times')).rejects.toThrow(
      'Bob should have died 5 times'
    )
  })

  it('propagates fetch errors', async () => {
    mockFetch(jest.fn().mockRejectedValue(new Error('unreachable')))
    const mc = new MCTestClient()
    await expect(mc.assertScore('Alice', 'kills', 1)).rejects.toThrow('unreachable')
  })
})

// ---------------------------------------------------------------------------
// assertBlock
// ---------------------------------------------------------------------------

describe('assertBlock', () => {
  it('resolves when block type matches', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse({
      x: 0, y: 64, z: 0, world: 'world', type: 'minecraft:stone', blockData: 'minecraft:stone'
    })))
    const mc = new MCTestClient()
    await expect(mc.assertBlock(0, 64, 0, 'minecraft:stone')).resolves.toBeUndefined()
  })

  it('throws with position and type info when block does not match', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse({
      x: 1, y: 65, z: 2, world: 'world', type: 'minecraft:dirt', blockData: 'minecraft:dirt'
    })))
    const mc = new MCTestClient()
    await expect(mc.assertBlock(1, 65, 2, 'minecraft:stone')).rejects.toThrow(
      'assertBlock failed: (1,65,2) expected minecraft:stone, got minecraft:dirt'
    )
  })

  it('uses custom world in error message context', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse({
      x: 0, y: 0, z: 0, world: 'the_nether', type: 'minecraft:netherrack', blockData: ''
    })))
    const mc = new MCTestClient()
    await expect(mc.assertBlock(0, 0, 0, 'minecraft:air', 'the_nether')).rejects.toThrow(
      'assertBlock failed: (0,0,0) expected minecraft:air, got minecraft:netherrack'
    )
  })
})

// ---------------------------------------------------------------------------
// assertChatContains
// ---------------------------------------------------------------------------

describe('assertChatContains', () => {
  it('resolves when substring is found in chat', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse([
      { tick: 1, type: 'chat', message: 'Hello world' },
      { tick: 2, type: 'chat', message: 'Game started' },
    ])))
    const mc = new MCTestClient()
    await expect(mc.assertChatContains('Hello')).resolves.toBeUndefined()
  })

  it('throws listing recent messages when substring not found', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse([
      { tick: 1, type: 'chat', message: 'Foo' },
      { tick: 2, type: 'chat', message: 'Bar' },
    ])))
    const mc = new MCTestClient()
    await expect(mc.assertChatContains('Missing')).rejects.toThrow(
      '"Missing" not found in chat'
    )
  })

  it('includes up to 5 recent messages in the error', async () => {
    const messages = Array.from({ length: 7 }, (_, i) => ({
      tick: i,
      type: 'chat',
      message: `msg${i}`,
    }))
    mockFetch(jest.fn().mockResolvedValue(okResponse(messages)))
    const mc = new MCTestClient()
    let caughtError: Error | undefined
    await mc.assertChatContains('nope').catch(e => { caughtError = e as Error })
    expect(caughtError).toBeInstanceOf(Error)
    // Should include recent (last 5) messages
    expect(caughtError!.message).toContain('msg2')
    expect(caughtError!.message).toContain('msg6')
    // Should not include first messages that were sliced off
    expect(caughtError!.message).not.toContain('msg0')
    expect(caughtError!.message).not.toContain('msg1')
  })

  it('resolves when chat is empty and no substring needed — but throws when empty', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse([])))
    const mc = new MCTestClient()
    await expect(mc.assertChatContains('anything')).rejects.toThrow(
      '"anything" not found in chat'
    )
  })
})

// ---------------------------------------------------------------------------
// dumpScores / assertScoreMap
// ---------------------------------------------------------------------------

describe('assertScoreMap', () => {
  it('resolves when all expected entries match', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse({
      entries: { '$p0': 11, '$ret': 2, '#result': 42 }
    })))
    const mc = new MCTestClient()
    await expect(mc.assertScoreMap('myns', { '$p0': 11, '$ret': 2 })).resolves.toBeUndefined()
  })

  it('throws with key, expected, and actual when a value mismatches', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse({
      entries: { '$p0': 11, '$ret': 99 }
    })))
    const mc = new MCTestClient()
    await expect(mc.assertScoreMap('myns', { '$p0': 11, '$ret': 2 })).rejects.toThrow(
      'assertScoreMap[myns] $ret: expected 2, got 99'
    )
  })

  it('throws with (unset) when key is absent from dump', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse({ entries: {} })))
    const mc = new MCTestClient()
    await expect(mc.assertScoreMap('myns', { '$missing': 5 })).rejects.toThrow(
      'assertScoreMap[myns] $missing: expected 5, got (unset)'
    )
  })

  it('includes the full dump in the error message', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse({ entries: { '$p0': 1 } })))
    const mc = new MCTestClient()
    let caughtError: Error | undefined
    await mc.assertScoreMap('myns', { '$p0': 999 }).catch(e => { caughtError = e as Error })
    expect(caughtError).toBeInstanceOf(Error)
    expect(caughtError!.message).toContain('Full dump:')
    expect(caughtError!.message).toContain('"$p0":1')
  })
})

// ---------------------------------------------------------------------------
// waitForScore — timeout
// ---------------------------------------------------------------------------

describe('waitForScore timeout', () => {
  it('throws after timeout when score never reaches expected value', async () => {
    // Always returns 0, never reaches 5
    mockFetch(jest.fn().mockResolvedValue(okResponse({ player: 'Alice', obj: 'kills', value: 0 })))
    const mc = new MCTestClient()

    // Attach .catch before advancing timers to avoid unhandled rejection warning
    const errors: Error[] = []
    const promise = mc.waitForScore('Alice', 'kills', 5, 500, 100).catch(e => { errors.push(e as Error) })

    // Advance time past the 500ms timeout
    await jest.advanceTimersByTimeAsync(600)
    await promise

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toBe('waitForScore: Alice/kills never reached 5 (last: 0)')
  })

  it('resolves immediately when score already matches', async () => {
    mockFetch(jest.fn().mockResolvedValue(okResponse({ player: 'Alice', obj: 'kills', value: 3 })))
    const mc = new MCTestClient()

    const promise = mc.waitForScore('Alice', 'kills', 3, 500, 100)
    // No timer advancement needed — should resolve on the first poll
    await jest.runAllTimersAsync()
    await expect(promise).resolves.toBeUndefined()
  })

  it('resolves when score reaches expected value before timeout', async () => {
    let callCount = 0
    // Returns wrong value for the first 2 polls, then returns correct value
    mockFetch(jest.fn().mockImplementation(() => {
      callCount++
      const value = callCount >= 3 ? 5 : 0
      return Promise.resolve(okResponse({ player: 'Alice', obj: 'kills', value }))
    }))

    const mc = new MCTestClient()
    const promise = mc.waitForScore('Alice', 'kills', 5, 5000, 100)

    await jest.advanceTimersByTimeAsync(300)
    await expect(promise).resolves.toBeUndefined()
  })

  it('ignores transient scoreboard errors and keeps polling', async () => {
    let callCount = 0
    // First call fails, second call succeeds with correct value
    mockFetch(jest.fn().mockImplementation(() => {
      callCount++
      if (callCount === 1) return Promise.reject(new Error('transient error'))
      return Promise.resolve(okResponse({ player: 'Alice', obj: 'kills', value: 7 }))
    }))

    const mc = new MCTestClient()
    const promise = mc.waitForScore('Alice', 'kills', 7, 5000, 100)

    await jest.advanceTimersByTimeAsync(200)
    await expect(promise).resolves.toBeUndefined()
  })

  it('throws with the last observed value in the timeout error', async () => {
    // Always returns 42, never reaches 100
    mockFetch(jest.fn().mockResolvedValue(okResponse({ player: 'Bob', obj: 'score', value: 42 })))
    const mc = new MCTestClient()

    // Attach .catch before advancing timers to avoid unhandled rejection warning
    const errors: Error[] = []
    const promise = mc.waitForScore('Bob', 'score', 100, 200, 100).catch(e => { errors.push(e as Error) })

    await jest.advanceTimersByTimeAsync(300)
    await promise

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('last: 42')
  })
})

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

describe('URL construction', () => {
  it('builds correct base URL from host and port', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse({ online: true, tps_1m: 20, tps_5m: 20, tps_15m: 20, players: 0, playerNames: [], worlds: [], version: '1.21.4' }))
    mockFetch(fetchMock)

    const mc = new MCTestClient('myserver.local', 9999)
    await mc.status()

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('http://myserver.local:9999'))
  })

  it('encodes query parameters correctly', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse({ player: 'Alice Bob', obj: 'test', value: 0 }))
    mockFetch(fetchMock)

    const mc = new MCTestClient()
    await mc.scoreboard('Alice Bob', 'test score')

    const url: string = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('player=Alice%20Bob')
    expect(url).toContain('obj=test%20score')
  })

  it('defaults to localhost:25561', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse({ online: false, tps_1m: 0, tps_5m: 0, tps_15m: 0, players: 0, playerNames: [], worlds: [], version: '1.21.4' }))
    mockFetch(fetchMock)

    const mc = new MCTestClient()
    await mc.status()

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('http://localhost:25561'))
  })
})
