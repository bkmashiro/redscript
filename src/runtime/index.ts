/**
 * MCRuntime - Minecraft Command Runtime Simulator
 *
 * A TypeScript interpreter that simulates the subset of MC commands that
 * RedScript generates, allowing behavioral testing without a real server.
 */

import { compile as rsCompile } from '../compile'
import * as fs from 'fs'
import * as path from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Entity {
  id: string
  tags: Set<string>
  scores: Map<string, number>
  selector: string
}

interface Range {
  min: number
  max: number
}

interface SelectorFilters {
  tag?: string[]
  notTag?: string[]
  limit?: number
  scores?: Map<string, Range>
}

// ---------------------------------------------------------------------------
// Selector & Range Parsing
// ---------------------------------------------------------------------------

export function parseRange(s: string): Range {
  if (s.includes('..')) {
    const [left, right] = s.split('..')
    return {
      min: left === '' ? -Infinity : parseInt(left, 10),
      max: right === '' ? Infinity : parseInt(right, 10),
    }
  }
  const val = parseInt(s, 10)
  return { min: val, max: val }
}

export function matchesRange(value: number, range: Range): boolean {
  return value >= range.min && value <= range.max
}

function parseFilters(content: string): SelectorFilters {
  const filters: SelectorFilters = {
    tag: [],
    notTag: [],
  }

  if (!content) return filters

  // Handle scores={...} separately
  let processed = content
  const scoresMatch = content.match(/scores=\{([^}]*)\}/)
  if (scoresMatch) {
    filters.scores = new Map()
    const scoresPart = scoresMatch[1]
    const scoreEntries = scoresPart.split(',')
    for (const entry of scoreEntries) {
      const [obj, range] = entry.split('=')
      if (obj && range) {
        filters.scores.set(obj.trim(), parseRange(range.trim()))
      }
    }
    processed = content.replace(/,?scores=\{[^}]*\},?/, ',').replace(/^,|,$/g, '')
  }

  // Parse remaining filters
  const parts = processed.split(',').filter(p => p.trim())
  for (const part of parts) {
    const [key, value] = part.split('=').map(s => s.trim())
    if (key === 'tag') {
      if (value.startsWith('!')) {
        filters.notTag!.push(value.slice(1))
      } else {
        filters.tag!.push(value)
      }
    } else if (key === 'limit') {
      filters.limit = parseInt(value, 10)
    }
  }

  return filters
}

function matchesFilters(entity: Entity, filters: SelectorFilters): boolean {
  for (const tag of filters.tag || []) {
    if (!entity.tags.has(tag)) return false
  }
  for (const notTag of filters.notTag || []) {
    if (entity.tags.has(notTag)) return false
  }
  if (filters.scores) {
    for (const [obj, range] of filters.scores) {
      const score = entity.scores.get(obj) ?? 0
      if (!matchesRange(score, range)) return false
    }
  }
  return true
}

export function parseSelector(sel: string, entities: Entity[], executor?: Entity): Entity[] {
  if (sel === '@s') return executor ? [executor] : []
  if (sel === '@e' || sel === '@a') return [...entities]

  const match = sel.match(/^(@[eaps])(?:\[(.*)\])?$/)
  if (!match) return []

  const [, selectorType, bracketContent] = match

  if (selectorType === '@s') {
    if (!executor) return []
    const filters = parseFilters(bracketContent || '')
    return matchesFilters(executor, filters) ? [executor] : []
  }

  const filters = parseFilters(bracketContent || '')
  let result = entities.filter(e => matchesFilters(e, filters))

  if (filters.limit !== undefined) {
    result = result.slice(0, filters.limit)
  }

  return result
}

// ---------------------------------------------------------------------------
// JSON Component Parsing
// ---------------------------------------------------------------------------

function extractJsonText(json: any): string {
  if (typeof json === 'string') {
    try { json = JSON.parse(json) } catch { return json }
  }
  if (typeof json === 'string') return json
  if (Array.isArray(json)) return json.map(extractJsonText).join('')
  if (typeof json === 'object' && json !== null) {
    if ('text' in json) return String(json.text)
    if ('extra' in json && Array.isArray(json.extra)) {
      return json.extra.map(extractJsonText).join('')
    }
  }
  return ''
}

// ---------------------------------------------------------------------------
// NBT Parsing
// ---------------------------------------------------------------------------

function parseNBT(nbt: string): Record<string, any> {
  const result: Record<string, any> = {}
  const tagsMatch = nbt.match(/Tags:\s*\[(.*?)\]/)
  if (tagsMatch) {
    const tagsStr = tagsMatch[1]
    result.Tags = tagsStr.split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(s => s.length > 0)
  }
  return result
}

// ---------------------------------------------------------------------------
// MCRuntime Class
// ---------------------------------------------------------------------------

export class MCRuntime {
  scoreboard: Map<string, Map<string, number>> = new Map()
  storage: Map<string, any> = new Map()
  entities: Entity[] = []
  functions: Map<string, string[]> = new Map()
  chatLog: string[] = []
  tickCount: number = 0
  namespace: string

  private entityIdCounter = 0
  private returnValue: number | undefined
  private shouldReturn: boolean = false

  constructor(namespace: string) {
    this.namespace = namespace
    this.scoreboard.set('rs', new Map())
  }

  loadDatapack(dir: string): void {
    const functionsDir = path.join(dir, 'data', this.namespace, 'function')
    if (!fs.existsSync(functionsDir)) return

    const loadFunctions = (base: string, prefix: string): void => {
      const entries = fs.readdirSync(base, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(base, entry.name)
        if (entry.isDirectory()) {
          loadFunctions(fullPath, `${prefix}${entry.name}/`)
        } else if (entry.name.endsWith('.mcfunction')) {
          const fnName = `${prefix}${entry.name.replace('.mcfunction', '')}`
          const content = fs.readFileSync(fullPath, 'utf-8')
          this.loadFunction(`${this.namespace}:${fnName}`, content.split('\n'))
        }
      }
    }
    loadFunctions(functionsDir, '')
  }

  loadFunction(name: string, lines: string[]): void {
    const cleaned = lines.map(l => l.trim()).filter(l => l && !l.startsWith('#'))
    this.functions.set(name, cleaned)
  }

  load(): void {
    const loadFn = `${this.namespace}:__load`
    if (this.functions.has(loadFn)) this.execFunction(loadFn)
  }

  tick(): void {
    this.tickCount++
    const tickFn = `${this.namespace}:__tick`
    if (this.functions.has(tickFn)) this.execFunction(tickFn)
  }

  ticks(n: number): void {
    for (let i = 0; i < n; i++) this.tick()
  }

  execFunction(name: string, executor?: Entity): void {
    const lines = this.functions.get(name)
    if (!lines) {
      const prefixedName = name.includes(':') ? name : `${this.namespace}:${name}`
      const prefixedLines = this.functions.get(prefixedName)
      if (!prefixedLines) return
      this.execFunctionLines(prefixedLines, executor)
      return
    }
    this.execFunctionLines(lines, executor)
  }

  private execFunctionLines(lines: string[], executor?: Entity): void {
    this.shouldReturn = false
    for (const line of lines) {
      if (this.shouldReturn) break
      this.execCommand(line, executor)
    }
  }

  execCommand(cmd: string, executor?: Entity): boolean {
    cmd = cmd.trim()
    if (!cmd || cmd.startsWith('#')) return true

    if (cmd.startsWith('scoreboard ')) return this.execScoreboard(cmd)
    if (cmd.startsWith('execute ')) return this.execExecute(cmd, executor)
    if (cmd.startsWith('function ')) return this.execFunctionCmd(cmd, executor)
    if (cmd.startsWith('data ')) return this.execData(cmd)
    if (cmd.startsWith('tag ')) return this.execTag(cmd, executor)
    if (cmd.startsWith('say ')) return this.execSay(cmd, executor)
    if (cmd.startsWith('tellraw ')) return this.execTellraw(cmd)
    if (cmd.startsWith('title ')) return this.execTitle(cmd)
    if (cmd.startsWith('kill ')) return this.execKill(cmd, executor)
    if (cmd.startsWith('summon ')) return this.execSummon(cmd)
    if (cmd.startsWith('return ')) return this.execReturn(cmd, executor)
    if (cmd === 'return') { this.shouldReturn = true; return true }
    return true
  }

  private execScoreboard(cmd: string): boolean {
    const parts = cmd.split(/\s+/)
    if (parts[1] === 'objectives' && parts[2] === 'add') {
      const name = parts[3]
      if (!this.scoreboard.has(name)) this.scoreboard.set(name, new Map())
      return true
    }
    if (parts[1] === 'players') {
      const action = parts[2], player = parts[3], objective = parts[4]
      switch (action) {
        case 'set': this.setScore(player, objective, parseInt(parts[5], 10)); return true
        case 'add': this.addScore(player, objective, parseInt(parts[5], 10)); return true
        case 'remove': this.addScore(player, objective, -parseInt(parts[5], 10)); return true
        case 'get': this.returnValue = this.getScore(player, objective); return true
        case 'reset': { const obj = this.scoreboard.get(objective); if (obj) obj.delete(player); return true }
        case 'enable': return true
        case 'operation': {
          const op = parts[5], source = parts[6], sourceObj = parts[7]
          const targetVal = this.getScore(player, objective), sourceVal = this.getScore(source, sourceObj)
          let result: number
          switch (op) {
            case '=': result = sourceVal; break
            case '+=': result = targetVal + sourceVal; break
            case '-=': result = targetVal - sourceVal; break
            case '*=': result = targetVal * sourceVal; break
            case '/=': result = Math.trunc(targetVal / sourceVal); break
            case '%=': result = targetVal % sourceVal; break
            case '<': result = Math.min(targetVal, sourceVal); break
            case '>': result = Math.max(targetVal, sourceVal); break
            case '><': this.setScore(player, objective, sourceVal); this.setScore(source, sourceObj, targetVal); return true
            default: return false
          }
          this.setScore(player, objective, result)
          return true
        }
      }
    }
    return false
  }

  private execExecute(cmd: string, executor?: Entity): boolean {
    let rest = cmd.slice(8)
    let currentExecutor = executor
    let condition = true
    let storeTarget: { player: string; objective: string; type: 'result' | 'success' } | null = null

    while (rest.length > 0) {
      rest = rest.trimStart()

      if (rest.startsWith('run ')) {
        if (!condition) return false
        const innerCmd = rest.slice(4)
        const result = this.execCommand(innerCmd, currentExecutor)
        if (storeTarget) {
          const value = storeTarget.type === 'result' ? (this.returnValue ?? (result ? 1 : 0)) : (result ? 1 : 0)
          this.setScore(storeTarget.player, storeTarget.objective, value)
        }
        return result
      }

      if (rest.startsWith('as ')) {
        rest = rest.slice(3)
        const { selector, remaining } = this.parseNextSelector(rest)
        rest = remaining
        const entities = parseSelector(selector, this.entities, currentExecutor)
        if (entities.length === 0) return false
        if (entities.length > 1) {
          let success = false
          for (const entity of entities) {
            success = this.execCommand('execute ' + rest, entity) || success
          }
          return success
        }
        currentExecutor = entities[0]
        continue
      }

      if (rest.startsWith('at ')) {
        rest = rest.slice(3)
        const { remaining } = this.parseNextSelector(rest)
        rest = remaining
        continue
      }

      if (rest.startsWith('if score ')) {
        rest = rest.slice(9)
        const scoreParts = rest.match(/^(\S+)\s+(\S+)\s+matches\s+(\S+)(.*)$/)
        if (scoreParts) {
          const [, player, obj, rangeStr, remaining] = scoreParts
          const range = parseRange(rangeStr)
          const score = this.getScore(player, obj)
          condition = condition && matchesRange(score, range)
          rest = remaining.trim()
          continue
        }
        const compareMatch = rest.match(/^(\S+)\s+(\S+)\s+([<>=]+)\s+(\S+)\s+(\S+)(.*)$/)
        if (compareMatch) {
          const [, p1, o1, op, p2, o2, remaining] = compareMatch
          const v1 = this.getScore(p1, o1), v2 = this.getScore(p2, o2)
          let matches = false
          switch (op) {
            case '=': matches = v1 === v2; break
            case '<': matches = v1 < v2; break
            case '<=': matches = v1 <= v2; break
            case '>': matches = v1 > v2; break
            case '>=': matches = v1 >= v2; break
          }
          condition = condition && matches
          rest = remaining.trim()
          continue
        }
      }

      if (rest.startsWith('unless score ')) {
        rest = rest.slice(13)
        const scoreParts = rest.match(/^(\S+)\s+(\S+)\s+matches\s+(\S+)(.*)$/)
        if (scoreParts) {
          const [, player, obj, rangeStr, remaining] = scoreParts
          const range = parseRange(rangeStr)
          const score = this.getScore(player, obj)
          condition = condition && !matchesRange(score, range)
          rest = remaining.trim()
          continue
        }
      }

      if (rest.startsWith('if entity ')) {
        rest = rest.slice(10)
        const { selector, remaining } = this.parseNextSelector(rest)
        rest = remaining
        const entities = parseSelector(selector, this.entities, currentExecutor)
        condition = condition && entities.length > 0
        continue
      }

      if (rest.startsWith('unless entity ')) {
        rest = rest.slice(14)
        const { selector, remaining } = this.parseNextSelector(rest)
        rest = remaining
        const entities = parseSelector(selector, this.entities, currentExecutor)
        condition = condition && entities.length === 0
        continue
      }

      if (rest.startsWith('store result score ')) {
        rest = rest.slice(19)
        const storeParts = rest.match(/^(\S+)\s+(\S+)(.*)$/)
        if (storeParts) {
          const [, player, obj, remaining] = storeParts
          storeTarget = { player, objective: obj, type: 'result' }
          rest = remaining.trim()
          continue
        }
      }

      if (rest.startsWith('store success score ')) {
        rest = rest.slice(20)
        const storeParts = rest.match(/^(\S+)\s+(\S+)(.*)$/)
        if (storeParts) {
          const [, player, obj, remaining] = storeParts
          storeTarget = { player, objective: obj, type: 'success' }
          rest = remaining.trim()
          continue
        }
      }

      const nextSpace = rest.indexOf(' ')
      if (nextSpace === -1) break
      rest = rest.slice(nextSpace + 1)
    }
    return condition
  }

  private parseNextSelector(input: string): { selector: string; remaining: string } {
    input = input.trimStart()
    const match = input.match(/^(@[eaps])(\[[^\]]*\])?/)
    if (match) {
      const selector = match[0]
      return { selector, remaining: input.slice(selector.length).trim() }
    }
    const spaceIdx = input.indexOf(' ')
    if (spaceIdx === -1) return { selector: input, remaining: '' }
    return { selector: input.slice(0, spaceIdx), remaining: input.slice(spaceIdx + 1) }
  }

  private execFunctionCmd(cmd: string, executor?: Entity): boolean {
    const fnName = cmd.slice(9).trim()
    this.execFunction(fnName, executor)
    return true
  }

  private execData(cmd: string): boolean {
    const setMatch = cmd.match(/^data modify storage (\S+) (\S+) set value (.+)$/)
    if (setMatch) {
      const [, storagePath, field, valueStr] = setMatch
      this.setStorageField(storagePath, field, this.parseDataValue(valueStr))
      return true
    }
    const appendMatch = cmd.match(/^data modify storage (\S+) (\S+) append value (.+)$/)
    if (appendMatch) {
      const [, storagePath, field, valueStr] = appendMatch
      const current = this.getStorageField(storagePath, field) ?? []
      if (Array.isArray(current)) {
        current.push(this.parseDataValue(valueStr))
        this.setStorageField(storagePath, field, current)
      }
      return true
    }
    const getMatch = cmd.match(/^data get storage (\S+) (\S+)$/)
    if (getMatch) {
      const [, storagePath, field] = getMatch
      const value = this.getStorageField(storagePath, field)
      this.returnValue = typeof value === 'number' ? value : (value ? 1 : 0)
      return true
    }
    const copyMatch = cmd.match(/^data modify storage (\S+) (\S+) set from storage (\S+) (\S+)$/)
    if (copyMatch) {
      const [, dstPath, dstField, srcPath, srcField] = copyMatch
      this.setStorageField(dstPath, dstField, this.getStorageField(srcPath, srcField))
      return true
    }
    return false
  }

  private parseDataValue(str: string): any {
    str = str.trim()
    try { return JSON.parse(str) } catch { const num = parseFloat(str); return isNaN(num) ? str : num }
  }

  getStorageField(storagePath: string, field: string): any {
    const data = this.storage.get(storagePath) ?? {}
    const parts = field.split('.')
    let current = data
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined
      current = current[part]
    }
    return current
  }

  setStorageField(storagePath: string, field: string, value: any): void {
    let data = this.storage.get(storagePath)
    if (!data) { data = {}; this.storage.set(storagePath, data) }
    const parts = field.split('.')
    let current = data
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!(part in current)) current[part] = {}
      current = current[part]
    }
    current[parts[parts.length - 1]] = value
  }

  private execTag(cmd: string, executor?: Entity): boolean {
    const addMatch = cmd.match(/^tag (\S+) add (\S+)$/)
    if (addMatch) {
      const [, selStr, tagName] = addMatch
      const entities = selStr === '@s' && executor ? [executor] : parseSelector(selStr, this.entities, executor)
      for (const entity of entities) entity.tags.add(tagName)
      return entities.length > 0
    }
    const removeMatch = cmd.match(/^tag (\S+) remove (\S+)$/)
    if (removeMatch) {
      const [, selStr, tagName] = removeMatch
      const entities = selStr === '@s' && executor ? [executor] : parseSelector(selStr, this.entities, executor)
      for (const entity of entities) entity.tags.delete(tagName)
      return entities.length > 0
    }
    return false
  }

  private execSay(cmd: string, executor?: Entity): boolean {
    const message = cmd.slice(4)
    this.chatLog.push(`[${executor?.id ?? 'Server'}] ${message}`)
    return true
  }

  private execTellraw(cmd: string): boolean {
    const match = cmd.match(/^tellraw \S+ (.+)$/)
    if (match) {
      this.chatLog.push(extractJsonText(match[1]))
      return true
    }
    return false
  }

  private execTitle(cmd: string): boolean {
    const match = cmd.match(/^title \S+ title (.+)$/)
    if (match) {
      this.chatLog.push(`[TITLE] ${extractJsonText(match[1])}`)
      return true
    }
    return false
  }

  private execKill(cmd: string, executor?: Entity): boolean {
    const selStr = cmd.slice(5).trim()
    if (selStr === '@s' && executor) {
      this.entities = this.entities.filter(e => e !== executor)
      return true
    }
    const entities = parseSelector(selStr, this.entities, executor)
    for (const entity of entities) this.entities = this.entities.filter(e => e !== entity)
    return entities.length > 0
  }

  private execSummon(cmd: string): boolean {
    const match = cmd.match(/^summon \S+ [^\s]+ [^\s]+ [^\s]+ ({.+})$/)
    if (match) {
      const nbt = parseNBT(match[1])
      this.spawnEntity(nbt.Tags || [])
      return true
    }
    if (cmd.match(/^summon /)) { this.spawnEntity([]); return true }
    return false
  }

  private execReturn(cmd: string, executor?: Entity): boolean {
    const rest = cmd.slice(7).trim()
    if (rest.startsWith('run ')) {
      this.execCommand(rest.slice(4), executor)
      this.shouldReturn = true
      return true
    }
    const value = parseInt(rest, 10)
    if (!isNaN(value)) {
      this.returnValue = value
      this.shouldReturn = true
      return true
    }
    return false
  }

  getScore(player: string, objective: string): number {
    const obj = this.scoreboard.get(objective)
    return obj?.get(player) ?? 0
  }

  setScore(player: string, objective: string, value: number): void {
    let obj = this.scoreboard.get(objective)
    if (!obj) { obj = new Map(); this.scoreboard.set(objective, obj) }
    obj.set(player, value)
  }

  addScore(player: string, objective: string, delta: number): void {
    this.setScore(player, objective, this.getScore(player, objective) + delta)
  }

  getStorage(path: string): any {
    const colonIdx = path.indexOf(':')
    if (colonIdx === -1) return this.storage.get(path)
    const nsPath = path.slice(0, colonIdx + 1) + path.slice(colonIdx + 1).split('.')[0]
    const field = path.slice(colonIdx + 1).includes('.') ? path.slice(path.indexOf('.', colonIdx) + 1) : undefined
    if (!field) return this.storage.get(nsPath)
    return this.getStorageField(nsPath, field)
  }

  setStorage(path: string, value: any): void {
    const colonIdx = path.indexOf(':')
    if (colonIdx === -1) { this.storage.set(path, value); return }
    const basePath = path.slice(0, colonIdx + 1) + path.slice(colonIdx + 1).split('.')[0]
    const field = path.slice(colonIdx + 1).includes('.') ? path.slice(path.indexOf('.', colonIdx) + 1) : undefined
    if (!field) { this.storage.set(basePath, value); return }
    this.setStorageField(basePath, field, value)
  }

  spawnEntity(tags: string[]): Entity {
    const id = `entity_${this.entityIdCounter++}`
    const entity: Entity = { id, tags: new Set(tags), scores: new Map(), selector: `@e[tag=${tags[0] ?? id},limit=1]` }
    this.entities.push(entity)
    return entity
  }

  killEntity(tag: string): void {
    this.entities = this.entities.filter(e => !e.tags.has(tag))
  }

  getEntities(selector: string): Entity[] {
    return parseSelector(selector, this.entities)
  }

  getLastSaid(): string { return this.chatLog[this.chatLog.length - 1] ?? '' }
  getChatLog(): string[] { return [...this.chatLog] }

  compileAndLoad(source: string): void {
    const result = rsCompile(source, { namespace: this.namespace })
    if (!result.success || !result.files) {
      const errorMsg = result.error?.message ?? 'Unknown compilation error'
      throw new Error(`Compilation failed: ${errorMsg}`)
    }
    for (const file of result.files) {
      if (file.path.endsWith('.mcfunction')) {
        const match = file.path.match(/data\/([^/]+)\/function\/(.+)\.mcfunction$/)
        if (match) {
          const [, ns, fnPath] = match
          this.loadFunction(`${ns}:${fnPath.replace(/\//g, '/')}`, file.content.split('\n'))
        }
      }
    }
    this.load()
  }
}
