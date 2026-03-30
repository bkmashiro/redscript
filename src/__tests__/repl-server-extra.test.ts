/**
 * Extra branch coverage for src/repl-server.ts
 *
 * Targets:
 * - OPTIONS preflight → 204
 * - 404 fallback for unknown URL
 * - typeof code !== 'string' → 400
 * - POST /compile without namespace (uses default)
 */

import * as http from 'http'
import { requestHandler } from '../repl-server'

// Use port 0 so the OS assigns a free port — avoids port conflicts
const server = http.createServer(requestHandler)
let PORT = 0

function rawRequest(
  method: string,
  urlPath: string,
  body?: string,
  headers: http.OutgoingHttpHeaders = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: PORT,
      path: urlPath,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...headers,
      },
    }

    const req = http.request(options, res => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        })
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function jsonRequest(
  method: string,
  urlPath: string,
  body?: unknown
): Promise<{ status: number; body: unknown }> {
  const payload = body !== undefined ? JSON.stringify(body) : undefined
  return rawRequest(method, urlPath, payload).then(res => {
    let parsed: unknown = {}
    try { parsed = JSON.parse(res.body) } catch { /* empty body */ }
    return { status: res.status, body: parsed }
  })
}

beforeAll(done => {
  server.listen(0, () => {
    const addr = server.address() as import('net').AddressInfo
    PORT = addr.port
    done()
  })
})

afterAll(done => {
  server.close(done)
})

// ── OPTIONS preflight ─────────────────────────────────────────────────────

describe('OPTIONS /compile — CORS preflight', () => {
  it('returns 204 with CORS headers', async () => {
    const res = await rawRequest('OPTIONS', '/compile')
    expect(res.status).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe('*')
    expect(res.headers['access-control-allow-methods']).toContain('POST')
  })

  it('OPTIONS on other paths also returns 204 preflight', async () => {
    const res = await rawRequest('OPTIONS', '/health')
    expect(res.status).toBe(204)
  })
})

// ── 404 fallback ─────────────────────────────────────────────────────────

describe('Unknown routes — 404', () => {
  it('GET /unknown returns 404', async () => {
    const res = await jsonRequest('GET', '/unknown')
    expect(res.status).toBe(404)
  })

  it('DELETE /compile returns 404', async () => {
    const res = await jsonRequest('DELETE', '/compile')
    expect(res.status).toBe(404)
  })

  it('GET /compile returns 404 (only POST allowed)', async () => {
    const res = await jsonRequest('GET', '/compile')
    expect(res.status).toBe(404)
  })
})

// ── typeof code !== 'string' ──────────────────────────────────────────────

describe('POST /compile — non-string code field', () => {
  it('returns 400 when code is a number', async () => {
    const res = await jsonRequest('POST', '/compile', { code: 42 })
    expect(res.status).toBe(400)
    expect((res.body as { error: string }).error).toContain('"code"')
  })

  it('returns 400 when code is null', async () => {
    const res = await jsonRequest('POST', '/compile', { code: null })
    expect(res.status).toBe(400)
  })

  it('returns 400 when code is an array', async () => {
    const res = await jsonRequest('POST', '/compile', { code: ['fn f() {}'] })
    expect(res.status).toBe(400)
  })

  it('returns 400 when code is an object', async () => {
    const res = await jsonRequest('POST', '/compile', { code: { text: 'fn f() {}' } })
    expect(res.status).toBe(400)
  })
})

// ── POST /compile without namespace (uses default) ────────────────────────

describe('POST /compile — optional namespace', () => {
  it('compiles without namespace field using default', async () => {
    const res = await jsonRequest('POST', '/compile', { code: 'fn f(): int { return 1; }' })
    expect(res.status).toBe(200)
    const body = res.body as { files: { path: string; content: string }[] }
    expect(Array.isArray(body.files)).toBe(true)
    // Default namespace is 'redscript'
    expect(body.files.some(f => f.path.includes('redscript'))).toBe(true)
  })
})
