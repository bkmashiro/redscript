#!/usr/bin/env node
'use strict'

const http = require('http')
const mineflayer = require('mineflayer')

const mcHost = process.env.MC_GAME_HOST || '127.0.0.1'
const mcPort = Number(process.env.MC_GAME_PORT || 25566)
const apiHost = process.env.MC_BOT_HOST || '127.0.0.1'
const apiPort = Number(process.env.MC_BOT_PORT || 25562)
const username = process.env.MC_BOT_NAME || 'TestBot'
let bot
let connected = false
let lastError

function createBot() {
  connected = false
  const next = mineflayer.createBot({
    host: mcHost,
    port: mcPort,
    username,
    auth: 'offline',
    version: process.env.MC_BOT_VERSION || false,
  })
  next.once('spawn', () => { connected = true })
  next.on('end', reason => {
    if (bot === next) connected = false
    lastError = String(reason)
  })
  next.on('error', error => { lastError = error.message })
  bot = next
}

function waitFor(predicate, timeoutMs, description) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const poll = () => {
      if (predicate()) return resolve()
      if (Date.now() >= deadline) return reject(new Error(`timed out waiting for ${description}`))
      setTimeout(poll, 100)
    }
    poll()
  })
}

createBot()

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
    if (request.method === 'POST' && url.pathname === '/reconnect') {
      if (!connected) return send(response, 503, { connected: false, error: 'bot is not connected' })
      const previous = bot
      previous.quit('event reconnect probe')
      await waitFor(() => !connected, 10_000, 'bot disconnect')
      createBot()
      await waitFor(() => connected, 30_000, 'bot reconnect')
      return send(response, 200, { connected: true, username: bot.username })
    }
    if (request.method === 'POST' && url.pathname === '/attack-nearest') {
      const body = await readBody(request)
      const entityName = typeof body.name === 'string' && body.name !== '' ? body.name : 'pig'
      const maxAttacks = Number(body.maxAttacks || 32)
      if (!connected) return send(response, 503, { connected: false, error: 'bot is not connected' })
      if (!Number.isInteger(maxAttacks) || maxAttacks < 1 || maxAttacks > 64) {
        return send(response, 400, { error: 'maxAttacks must be an integer in [1,64]' })
      }
      const selectTarget = () => Object.values(bot.entities)
        .filter(entity => entity !== bot.entity && entity.name === entityName)
        .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))[0]
      let attacks = 0
      while (attacks < maxAttacks) {
        const target = selectTarget()
        if (!target) return send(response, 200, { connected: true, entityName, attacks, killed: attacks > 0 })
        await bot.lookAt(target.position.offset(0, target.height || 0.5, 0), true)
        bot.attack(target)
        attacks += 1
        await bot.waitForTicks(12)
      }
      return send(response, 409, { connected: true, entityName, attacks, killed: false })
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
