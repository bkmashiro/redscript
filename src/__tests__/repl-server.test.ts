/**
 * Tests for the RedScript REPL HTTP server.
 *
 * The server is started once for all tests (beforeAll) and closed after (afterAll).
 */

import * as http from 'http'
import { server } from '../repl-server'

let PORT = 0

function request(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }

    const req = http.request(options, res => {
      const chunks: Buffer[] = []
      res.on('data', (chunk: Buffer) => chunks.push(chunk))
      res.on('end', () => {
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          resolve({ status: res.statusCode ?? 0, body: parsed })
        } catch {
          reject(new Error('Failed to parse response JSON'))
        }
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
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

describe('GET /health', () => {
  it('returns { ok: true }', async () => {
    const res = await request('GET', '/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})

describe('POST /compile', () => {
  it('returns files for valid RedScript code', async () => {
    const code = `fn hello() {\n  say("Hello, world!")\n}\n`
    const res = await request('POST', '/compile', { code, namespace: 'test' })
    expect(res.status).toBe(200)
    const body = res.body as { files: { path: string; content: string }[]; error?: string }
    expect(body.error).toBeUndefined()
    expect(Array.isArray(body.files)).toBe(true)
    expect(body.files.length).toBeGreaterThan(0)
    expect(body.files[0]).toHaveProperty('path')
    expect(body.files[0]).toHaveProperty('content')
  })

  it('returns error for invalid RedScript code', async () => {
    const code = `fn broken( { this is not valid redscript !!!`
    const res = await request('POST', '/compile', { code, namespace: 'test' })
    expect(res.status).toBe(200)
    const body = res.body as { files: unknown[]; error?: string }
    expect(typeof body.error).toBe('string')
    expect(body.error!.length).toBeGreaterThan(0)
  })

  it('returns 400 for missing code field', async () => {
    const res = await request('POST', '/compile', { namespace: 'test' })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON', async () => {
    const res = await new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const payload = 'not-json'
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port: PORT,
        path: '/compile',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }
      const req = http.request(options, res => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString()) })
        })
      })
      req.on('error', reject)
      req.write(payload)
      req.end()
    })
    expect(res.status).toBe(400)
  })
})
