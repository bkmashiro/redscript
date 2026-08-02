#!/usr/bin/env node
'use strict'

const http = require('http')
const mineflayer = require('mineflayer')

const mcHost = process.env.MC_GAME_HOST || '127.0.0.1'
const mcPort = Number(process.env.MC_GAME_PORT || 25566)
const apiHost = process.env.MC_BOT_HOST || '127.0.0.1'
const apiPort = Number(process.env.MC_BOT_PORT || 25562)
const username = process.env.MC_BOT_NAME || 'TestBot'
let connected = false
let lastError

const bot = mineflayer.createBot({
  host: mcHost,
  port: mcPort,
  username,
  auth: 'offline',
  version: process.env.MC_BOT_VERSION || false,
})
bot.once('spawn', () => { connected = true })
bot.on('end', reason => { connected = false; lastError = String(reason) })
bot.on('error', error => { lastError = error.message })

function send(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}
function readBody(request) {
  return new Promise((resolve, reject) => {
    let text = ''
    request.on('data', chunk => { text += chunk })
    request.on('end', () => {
      try { resolve(text === '' ? {} : JSON.parse(text)) } catch (error) { reject(error) }
    })
    request.on('error', reject)
  })
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${apiHost}:${apiPort}`)
    if (request.method === 'GET' && url.pathname === '/status') {
      return send(response, 200, { connected, username: bot.username, lastError })
    }
    if (request.method === 'GET' && url.pathname === '/inventory/count') {
      const name = url.searchParams.get('name') || ''
      const count = connected
        ? bot.inventory.items().filter(item => item.name === name).reduce((sum, item) => sum + item.count, 0)
        : 0
      return send(response, 200, { connected, name, count })
    }
    if (request.method === 'GET' && url.pathname === '/effects') {
      const effects = connected && bot.entity ? Object.values(bot.entity.effects || {}) : []
      return send(response, 200, { connected, effects })
    }
    if (request.method === 'POST' && url.pathname === '/wait') {
      const body = await readBody(request)
      const ticks = Number(body.ticks || 1)
      if (!connected) return send(response, 503, { connected: false, error: 'bot is not connected' })
      if (!Number.isInteger(ticks) || ticks < 0 || ticks > 1200) {
        return send(response, 400, { error: 'ticks must be an integer in [0,1200]' })
      }
      await bot.waitForTicks(ticks)
      return send(response, 200, { connected: true, ticks })
    }
    return send(response, 404, { error: 'not found' })
  } catch (error) {
    return send(response, 500, { error: error instanceof Error ? error.message : String(error) })
  }
})
server.listen(apiPort, apiHost, () => {
  process.stdout.write(`TestBot API listening on http://${apiHost}:${apiPort}\n`)
})

function shutdown() {
  server.close(() => process.exit(0))
  try { bot.quit('managed corpus complete') } catch {}
  setTimeout(() => process.exit(1), 5000).unref()
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
