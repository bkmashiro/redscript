/**
 * MCTestClient.dumpScores / dumpScoresByObj — unit tests
 *
 * Uses jest's global fetch mock to exercise the dump methods without a live
 * Minecraft server. Covers:
 *  - happy path: valid response with entries
 *  - missing entries field → descriptive error thrown
 *  - HTTP error from the server → error propagated
 *  - entries present but empty → returns {}
 */

import { MCTestClient } from '../mc-test/client'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function mockFetch(body: unknown, status = 200): void {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }
  global.fetch = jest.fn().mockResolvedValue(res)
}

// ---------------------------------------------------------------------------
// dumpScores
// ---------------------------------------------------------------------------

describe('MCTestClient.dumpScores', () => {
  let mc: MCTestClient

  beforeEach(() => {
    mc = new MCTestClient('localhost', 25561)
  })

  it('returns entries on a valid response', async () => {
    mockFetch({ entries: { '$p0': 0, '$val': 11, '#result': 42 } })
    const result = await mc.dumpScores('arena')
    expect(result).toEqual({ '$p0': 0, '$val': 11, '#result': 42 })
  })

  it('returns empty object when entries is {}', async () => {
    mockFetch({ entries: {} })
    const result = await mc.dumpScores('arena')
    expect(result).toEqual({})
  })

  it('throws a descriptive error when entries field is missing', async () => {
    mockFetch({ ok: true })
    await expect(mc.dumpScores('arena')).rejects.toThrow(
      'dumpScores: response missing \'entries\' field for ns="arena"'
    )
  })

  it('throws when the response has entries: null', async () => {
    mockFetch({ entries: null })
    await expect(mc.dumpScores('arena')).rejects.toThrow(
      'dumpScores: response missing \'entries\' field for ns="arena"'
    )
  })

  it('propagates HTTP errors from the server', async () => {
    mockFetch({ error: 'unknown namespace' }, 500)
    await expect(mc.dumpScores('bad')).rejects.toThrow('GET /scoreboard/dump failed 500')
  })

  it('includes the ns name in the error message', async () => {
    mockFetch({ noEntries: true })
    await expect(mc.dumpScores('my_ns')).rejects.toThrow('ns="my_ns"')
  })
})

// ---------------------------------------------------------------------------
// dumpScoresByObj
// ---------------------------------------------------------------------------

describe('MCTestClient.dumpScoresByObj', () => {
  let mc: MCTestClient

  beforeEach(() => {
    mc = new MCTestClient('localhost', 25561)
  })

  it('returns entries on a valid response', async () => {
    mockFetch({ entries: { Alice: 3, Bob: 7 } })
    const result = await mc.dumpScoresByObj('kills')
    expect(result).toEqual({ Alice: 3, Bob: 7 })
  })

  it('returns empty object when entries is {}', async () => {
    mockFetch({ entries: {} })
    const result = await mc.dumpScoresByObj('kills')
    expect(result).toEqual({})
  })

  it('throws a descriptive error when entries field is missing', async () => {
    mockFetch({ ok: true })
    await expect(mc.dumpScoresByObj('kills')).rejects.toThrow(
      'dumpScoresByObj: response missing \'entries\' field for obj="kills"'
    )
  })

  it('throws when the response has entries: null', async () => {
    mockFetch({ entries: null })
    await expect(mc.dumpScoresByObj('kills')).rejects.toThrow(
      'dumpScoresByObj: response missing \'entries\' field for obj="kills"'
    )
  })

  it('propagates HTTP errors from the server', async () => {
    mockFetch({ error: 'unknown objective' }, 404)
    await expect(mc.dumpScoresByObj('bad')).rejects.toThrow('GET /scoreboard/dump failed 404')
  })

  it('includes the obj name in the error message', async () => {
    mockFetch({ noEntries: true })
    await expect(mc.dumpScoresByObj('my_obj')).rejects.toThrow('obj="my_obj"')
  })
})
