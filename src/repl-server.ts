/**
 * RedScript REPL HTTP Server
 *
 * Provides a local HTTP API for compiling RedScript code in real-time.
 *
 * Endpoints:
 *   POST /compile  { code: string, namespace?: string } → { files: [{path, content}][], error?: string }
 *   GET  /health   → { ok: true }
 */

import * as http from 'http'
import { compile } from './emit/compile'

const PORT = 3000

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJSON(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': '*',
  })
  res.end(json)
}

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  // GET /health
  if (req.method === 'GET' && req.url === '/health') {
    sendJSON(res, 200, { ok: true })
    return
  }

  // POST /compile
  if (req.method === 'POST' && req.url === '/compile') {
    let body: unknown
    try {
      const raw = await readBody(req)
      body = JSON.parse(raw)
    } catch {
      sendJSON(res, 400, { error: 'Invalid JSON body' })
      return
    }

    if (typeof body !== 'object' || body === null || !('code' in body)) {
      sendJSON(res, 400, { error: 'Missing required field: code' })
      return
    }

    const { code, namespace } = body as { code: string; namespace?: string }

    if (typeof code !== 'string') {
      sendJSON(res, 400, { error: 'Field "code" must be a string' })
      return
    }

    try {
      const result = compile(code, { namespace: namespace ?? 'redscript' })
      const files = result.files.map(f => ({ path: f.path, content: f.content }))
      sendJSON(res, 200, { files })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      sendJSON(res, 200, { files: [], error: message })
    }
    return
  }

  // 404 fallback
  sendJSON(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => {
  console.log(`RedScript REPL server listening on http://localhost:${PORT}`)
  console.log('  POST /compile  — compile RedScript code')
  console.log('  GET  /health   — health check')
})

export { server }
