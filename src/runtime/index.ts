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

function parseRange(s: string): Range {
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

function matchesRange(value: number, range: Range): boolean {
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

function matchesFilters(entity: Entity, filters: SelectorFilters, objective: string = 'rs'): boolean {
  // Check required tags
  for (const tag of filters.tag || []) {
    if (!entity.tags.has(tag)) return false
  }

  // Check excluded tags
  for (const notTag of filters.notTag || []) {
    if (entity.tags.has(notTag)) return false
  }

  // Check scores
  if (filters.scores) {
    for (const [obj, range] of filters.scores) {
      const score = entity.scores.get(obj) ?? 0
      if (!matchesRange(score, range)) return false
    }
  }

  return true
}

function parseSelector(
  sel: string,
  entities: Entity[],
  executor?: Entity
): Entity[] {
  // Handle @s
  if (sel === '@s') {
    return executor ? [executor] : []
  }

  // Handle bare selectors
  if (sel === '@e' || sel === '@a') {
    return [...entities]
  }

  // Parse selector with brackets
  const match = sel.match(/^(@[eaps])(?:\[(.*)\])?$/)
  if (!match) {
    return []
  }

  const [, selectorType, bracketContent] = match

  // @s with filters
  if (selectorType === '@s') {
    if (!executor) return []
    const filters = parseFilters(bracketContent || '')
    if (matchesFilters(executor, filters)) {
      return [executor]
    }
    return []
  }

  // @e/@a with filters
  const filters = parseFilters(bracketContent || '')
  let result = entities.filter(e => matchesFilters(e, filters))

  // Apply limit
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
    try {
      json = JSON.parse(json)
    } catch {
      return json
    }
  }

  if (typeof json === 'string') return json
  if (Array.isArray(json)) {
    return json.map(extractJsonText).join('')
  }
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
  // Simple NBT parser for Tags array
  const result: Record<string, any> = {}

  const tagsMatch = nbt.match(/Tags:\s*\[(.*?)\]/)
  if (tagsMatch) {
    const tagsStr = tagsMatch[1]
    result.Tags = tagsStr
      .split(',')
      .map(s => s.trim().replace(/^["']|["']$/g, ''))
      .filter(s => s.length > 0)
  }

  return result
}

// ---------------------------------------------------------------------------
// MCRuntime Class
// ---------------------------------------------------------------------------

export class MCRuntime {
  // Scoreboard state: objective → (player → score)
  scoreboard: Map<string, Map<string, number>> = new Map()

  // NBT storage: "namespace:path" → JSON value
  storage: Map<string, any> = new Map()

  // Entities in world
  entities: Entity[] = []

  // Loaded functions: "ns:name" → lines of mcfunction
  functions: Map<string, string[]> = new Map()

  // Log of say/tellraw/title output
  chatLog: string[] = []

  // Tick counter
  tickCount: number = 0

  // Namespace
  namespace: string

  // Entity ID counter
  private entityIdCounter = 0

  // Return value for current function
  private returnValue: number | undefined

  // Flag to stop function execution (for return)
  private shouldReturn: boolean = false

  constructor(namespace: string) {
    this.namespace = namespace
    // Initialize default objective
    this.scoreboard.set('rs', new Map())
  }

  // -------------------------------------------------------------------------
  // Datapack Loading
  // -------------------------------------------------------------------------

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
    // Filter out comments and empty lines, but keep all commands
    const cleaned = lines
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
    this.functions.set(name, cleaned)
  }

  // -------------------------------------------------------------------------
  // Lifecycle Methods
  // -------------------------------------------------------------------------

  load(): void {
    const loadFn = `${this.namespace}:__load`
    if (this.functions.has(loadFn)) {
      this.execFunction(loadFn)
    }
  }

  tick(): void {
    this.tickCount++
    const tickFn = `${this.namespace}:__tick`
    if (this.functions.has(tickFn)) {
      this.execFunction(tickFn)
    }
  }

  ticks(n: number): void {
    for (let i = 0; i < n; i++) {
      this.tick()
    }
  }

  // -------------------------------------------------------------------------
  // Function Execution
  // -------------------------------------------------------------------------

  execFunction(name: string, executor?: Entity): void {
    const lines = this.functions.get(name)
    if (!lines) {
      // Try with namespace prefix
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

  // -------------------------------------------------------------------------
  // Command Execution
  // -------------------------------------------------------------------------

  execCommand(cmd: string, executor?: Entity): boolean {
    cmd = cmd.trim()
    if (!cmd || cmd.startsWith('#')) return true

    // Parse command
    if (cmd.startsWith('scoreboard ')) {
      return this.execScoreboard(cmd)
    }
    if (cmd.startsWith('execute ')) {
      return this.execExecute(cmd, executor)
    }
    if (cmd.startsWith('function ')) {
      return this.execFunctionCmd(cmd, executor)
    }
    if (cmd.startsWith('data ')) {
      return this.execData(cmd)
    }
    if (cmd.startsWith('tag ')) {
      return this.execTag(cmd, executor)
    }
    if (cmd.startsWith('say ')) {
      return this.execSay(cmd, executor)
    }
    if (cmd.startsWith('tellraw ')) {
      return this.execTellraw(cmd)
    }
    if (cmd.startsWith('title ')) {
      return this.execTitle(cmd)
    }
    if (cmd.startsWith('kill ')) {
      return this.execKill(cmd, executor)
    }
    if (cmd.startsWith('summon ')) {
      return this.execSummon(cmd)
    }
    if (cmd.startsWith('return ')) {
      return this.execReturn(cmd, executor)
    }
    if (cmd === 'return') {
      this.shouldReturn = true
      return true
    }

    // Unknown command - succeed silently
    return true
  }

  // -------------------------------------------------------------------------
  // Scoreboard Commands
  // -------------------------------------------------------------------------

  private execScoreboard(cmd: string): boolean {
    const parts = cmd.split(/\s+/)

    // scoreboard objectives add <name> <criteria>
    if (parts[1] === 'objectives' && parts[2] === 'add') {
      const name = parts[3]
      if (!this.scoreboard.has(name)) {
        this.scoreboard.set(name, new Map())
      }
      return true
    }

    // scoreboard players ...
    if (parts[1] === 'players') {
      const action = parts[2]
      const player = parts[3]
      const objective = parts[4]

      switch (action) {
        case 'set': {
          const value = parseInt(parts[5], 10)
          this.setScore(player, objective, value)
          return true
        }
        case 'add': {
          const delta = parseInt(parts[5], 10)
          this.addScore(player, objective, delta)
          return true
        }
        case 'remove': {
          const delta = parseInt(parts[5], 10)
          this.addScore(player, objective, -delta)
          return true
        }
        case 'get': {
          this.returnValue = this.getScore(player, objective)
          return true
        }
        case 'reset': {
          const obj = this.scoreboard.get(objective)
          if (obj) obj.delete(player)
          return true
        }
        case 'enable': {
          // No-op for trigger enabling
          return true
        }
        case 'operation': {
          // scoreboard players operation <target> <targetObj> <op> <source> <sourceObj>
          const targetObj = objective
          const op = parts[5]
          const source = parts[6]
          const sourceObj = parts[7]

          const targetVal = this.getScore(player, targetObj)
          const sourceVal = this.getScore(source, sourceObj)

          let result: number
          switch (op) {
            case '=':
              result = sourceVal
              break
            case '+=':
              result = targetVal + sourceVal
              break
            case '-=':
              result = targetVal - sourceVal
              break
            case '*=':
              result = targetVal * sourceVal
              break
            case '/=':
              result = Math.trunc(targetVal / sourceVal)
              break
            case '%=':
              result = targetVal % sourceVal // Java modulo: sign follows dividend
              break
            case '<':
              result = Math.min(targetVal, sourceVal)
              break
            case '>':
              result = Math.max(targetVal, sourceVal)
              break
            case '><':
              // Swap
              this.setScore(player, targetObj, sourceVal)
              this.setScore(source, sourceObj, targetVal)
              return true
            default:
              return false
          }
          this.setScore(player, targetObj, result)
          return true
        }
      }
    }

    return false
  }

  // -------------------------------------------------------------------------
  // Execute Commands
  // -------------------------------------------------------------------------

  private execExecute(cmd: string, executor?: Entity): boolean {
    // Remove 'execute ' prefix
    let rest = cmd.slice(8)

    // Track execute state
    let currentExecutor = executor
    let condition: boolean = true
    let storeTarget: { player: string; objective: string; type: 'result' | 'success' } | null = null

    while (rest.length > 0) {
      rest = rest.trimStart()

      // Handle 'run' - execute the final command
      if (rest.startsWith('run ')) {
        if (!condition) return false
        const innerCmd = rest.slice(4)
        const result = this.execCommand(innerCmd, currentExecutor)

        if (storeTarget) {
          const value = storeTarget.type === 'result'
            ? (this.returnValue ?? (result ? 1 : 0))
            : (result ? 1 : 0)
          this.setScore(storeTarget.player, storeTarget.objective, value)
        }

        return result
      }

      // Handle 'as <selector>'
      if (rest.startsWith('as ')) {
        rest = rest.slice(3)
        const { selector, remaining } = this.parseNextSelector(rest)
        rest = remaining

        const entities = parseSelector(selector, this.entities, currentExecutor)
        if (entities.length === 0) return false

        // For multiple entities, execute as each
        if (entities.length > 1) {
          let success = false
          for (const entity of entities) {
            const result = this.execCommand('execute ' + rest, entity)
            success = success || result
          }
          return success
        }

        currentExecutor = entities[0]
        continue
      }

      // Handle 'at <selector>' - no-op for position, just continue
      if (rest.startsWith('at ')) {
        rest = rest.slice(3)
        const { remaining } = this.parseNextSelector(rest)
        rest = remaining
        continue
      }

      // Handle 'if score <player> <obj> matches <range>'
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

        // if score <p1> <o1> <op> <p2> <o2>
        const compareMatch = rest.match(/^(\S+)\s+(\S+)\s+([<>=]+)\s+(\S+)\s+(\S+)(.*)$/)
        if (compareMatch) {
          const [, p1, o1, op, p2, o2, remaining] = compareMatch
          const v1 = this.getScore(p1, o1)
          const v2 = this.getScore(p2, o2)
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

      // Handle 'unless score ...'
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

      // Handle 'if entity <selector>'
      if (rest.startsWith('if entity ')) {
        rest = rest.slice(10)
        const { selector, remaining } = this.parseNextSelector(rest)
        rest = remaining
        const entities = parseSelector(selector, this.entities, currentExecutor)
        condition = condition && entities.length > 0
        continue
      }

      // Handle 'unless entity <selector>'
      if (rest.startsWith('unless entity ')) {
        rest = rest.slice(14)
        const { selector, remaining } = this.parseNextSelector(rest)
        rest = remaining
        const entities = parseSelector(selector, this.entities, currentExecutor)
        condition = condition && entities.length === 0
        continue
      }

      // Handle 'store result score <player> <obj>'
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

      // Handle 'store success score <player> <obj>'
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

      // Unknown subcommand - skip to next space or 'run'
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
    // Non-selector target
    const spaceIdx = input.indexOf(' ')
    if (spaceIdx === -1) {
      return { selector: input, remaining: '' }
    }
    return { selector: input.slice(0, spaceIdx), remaining: input.slice(spaceIdx + 1) }
  }

  // -------------------------------------------------------------------------
  // Function Command
  // -------------------------------------------------------------------------

  private execFunctionCmd(cmd: string, executor?: Entity): boolean {
    const fnName = cmd.slice(9).trim() // remove 'function '
    this.execFunction(fnName, executor)
    return true
  }

  // -------------------------------------------------------------------------
  // Data Commands
  // -------------------------------------------------------------------------

  private execData(cmd: string): boolean {
    // data modify storage <ns:path> <field> set value <val>
    const setMatch = cmd.match(/^data modify storage (\S+) (\S+) set value (.+)$/)
    if (setMatch) {
      const [, storagePath, field, valueStr] = setMatch
      const value = this.parseDataValue(valueStr)
      this.setStorageField(storagePath, field, value)
      return true
    }

    // data modify storage <ns:path> <field> append value <val>
    const appendMatch = cmd.match(/^data modify storage (\S+) (\S+) append value (.+)$/)
    if (appendMatch) {
      const [, storagePath, field, valueStr] = appendMatch
      const value = this.parseDataValue(valueStr)
      const current = this.getStorageField(storagePath, field) ?? []
      if (Array.isArray(current)) {
        current.push(value)
        this.setStorageField(storagePath, field, current)
      }
      return true
    }

    // data get storage <ns:path> <field>
    const getMatch = cmd.match(/^data get storage (\S+) (\S+)$/)
    if (getMatch) {
      const [, storagePath, field] = getMatch
      const value = this.getStorageField(storagePath, field)
      this.returnValue = typeof value === 'number' ? value : (value ? 1 : 0)
      return true
    }

    // data modify storage <ns:path> <field> set from storage <src> <srcpath>
    const copyMatch = cmd.match(/^data modify storage (\S+) (\S+) set from storage (\S+) (\S+)$/)
    if (copyMatch) {
      const [, dstPath, dstField, srcPath, srcField] = copyMatch
      const value = this.getStorageField(srcPath, srcField)
      this.setStorageField(dstPath, dstField, value)
      return true
    }

    return false
  }

  private parseDataValue(str: string): any {
    str = str.trim()
    // Try JSON parse
    try {
      return JSON.parse(str)
    } catch {
      // Try numeric
      const num = parseFloat(str)
      if (!isNaN(num)) return num
      // Return as string
      return str
    }
  }

  private getStorageField(storagePath: string, field: string): any {
    const data = this.storage.get(storagePath) ?? {}
    const parts = field.split('.')
    let current = data
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined
      current = current[part]
    }
    return current
  }

  private setStorageField(storagePath: string, field: string, value: any): void {
    let data = this.storage.get(storagePath)
    if (!data) {
      data = {}
      this.storage.set(storagePath, data)
    }
    const parts = field.split('.')
    let current = data
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!(part in current)) {
        current[part] = {}
      }
      current = current[part]
    }
    current[parts[parts.length - 1]] = value
  }

  // -------------------------------------------------------------------------
  // Tag Commands
  // -------------------------------------------------------------------------

  private execTag(cmd: string, executor?: Entity): boolean {
    // tag <selector> add <name>
    const addMatch = cmd.match(/^tag (\S+) add (\S+)$/)
    if (addMatch) {
      const [, selStr, tagName] = addMatch
      const entities = selStr === '@s' && executor
        ? [executor]
        : parseSelector(selStr, this.entities, executor)
      for (const entity of entities) {
        entity.tags.add(tagName)
      }
      return entities.length > 0
    }

    // tag <selector> remove <name>
    const removeMatch = cmd.match(/^tag (\S+) remove (\S+)$/)
    if (removeMatch) {
      const [, selStr, tagName] = removeMatch
      const entities = selStr === '@s' && executor
        ? [executor]
        : parseSelector(selStr, this.entities, executor)
      for (const entity of entities) {
        entity.tags.delete(tagName)
      }
      return entities.length > 0
    }

    return false
  }

  // -------------------------------------------------------------------------
  // Say/Tellraw/Title Commands
  // -------------------------------------------------------------------------

  private execSay(cmd: string, executor?: Entity): boolean {
    const message = cmd.slice(4)
    this.chatLog.push(`[${executor?.id ?? 'Server'}] ${message}`)
    return true
  }

  private execTellraw(cmd: string): boolean {
    // tellraw <selector> <json>
    const match = cmd.match(/^tellraw \S+ (.+)$/)
    if (match) {
      const jsonStr = match[1]
      const text = extractJsonText(jsonStr)
      this.chatLog.push(text)
      return true
    }
    return false
  }

  private execTitle(cmd: string): boolean {
    // title <selector> title <json>
    const match = cmd.match(/^title \S+ title (.+)$/)
    if (match) {
      const jsonStr = match[1]
      const text = extractJsonText(jsonStr)
      this.chatLog.push(`[TITLE] ${text}`)
      return true
    }
    return false
  }

  // -------------------------------------------------------------------------
  // Kill Command
  // -------------------------------------------------------------------------

  private execKill(cmd: string, executor?: Entity): boolean {
    const selStr = cmd.slice(5).trim()

    if (selStr === '@s' && executor) {
      this.entities = this.entities.filter(e => e !== executor)
      return true
    }

    const entities = parseSelector(selStr, this.entities, executor)
    for (const entity of entities) {
      this.entities = this.entities.filter(e => e !== entity)
    }
    return entities.length > 0
  }

  // -------------------------------------------------------------------------
  // Summon Command
  // -------------------------------------------------------------------------

  private execSummon(cmd: string): boolean {
    // summon minecraft:armor_stand <x> <y> <z> {Tags:["tag1","tag2"]}
    const match = cmd.match(/^summon \S+ [^\s]+ [^\s]+ [^\s]+ ({.+})$/)
    if (match) {
      const nbt = parseNBT(match[1])
      this.spawnEntity(nbt.Tags || [])
      return true
    }

    // Simple summon without NBT
    const simpleMatch = cmd.match(/^summon /)
    if (simpleMatch) {
      this.spawnEntity([])
      return true
    }

    return false
  }

  // -------------------------------------------------------------------------
  // Return Command
  // -------------------------------------------------------------------------

  private execReturn(cmd: string, executor?: Entity): boolean {
    const rest = cmd.slice(7).trim()

    // return run <cmd>
    if (rest.startsWith('run ')) {
      const innerCmd = rest.slice(4)
      this.execCommand(innerCmd, executor)
      this.shouldReturn = true
      return true
    }

    // return <value>
    const value = parseInt(rest, 10)
    if (!isNaN(value)) {
      this.returnValue = value
      this.shouldReturn = true
      return true
    }

    return false
  }

  // -------------------------------------------------------------------------
  // Scoreboard Helpers
  // -------------------------------------------------------------------------

  getScore(player: string, objective: string): number {
    const obj = this.scoreboard.get(objective)
    if (!obj) return 0
    return obj.get(player) ?? 0
  }

  setScore(player: string, objective: string, value: number): void {
    let obj = this.scoreboard.get(objective)
    if (!obj) {
      obj = new Map()
      this.scoreboard.set(objective, obj)
    }
    obj.set(player, value)
  }

  addScore(player: string, objective: string, delta: number): void {
    const current = this.getScore(player, objective)
    this.setScore(player, objective, current + delta)
  }

  // -------------------------------------------------------------------------
  // Storage Helpers
  // -------------------------------------------------------------------------

  getStorage(path: string): any {
    // "ns:path.field" → parse namespace and nested fields
    const colonIdx = path.indexOf(':')
    if (colonIdx === -1) return this.storage.get(path)

    const nsPath = path.slice(0, colonIdx + 1) + path.slice(colonIdx + 1).split('.')[0]
    const field = path.slice(colonIdx + 1).includes('.')
      ? path.slice(path.indexOf('.', colonIdx) + 1)
      : undefined

    if (!field) return this.storage.get(nsPath)
    return this.getStorageField(nsPath, field)
  }

  setStorage(path: string, value: any): void {
    const colonIdx = path.indexOf(':')
    if (colonIdx === -1) {
      this.storage.set(path, value)
      return
    }

    const basePath = path.slice(0, colonIdx + 1) + path.slice(colonIdx + 1).split('.')[0]
    const field = path.slice(colonIdx + 1).includes('.')
      ? path.slice(path.indexOf('.', colonIdx) + 1)
      : undefined

    if (!field) {
      this.storage.set(basePath, value)
      return
    }

    this.setStorageField(basePath, field, value)
  }

  // -------------------------------------------------------------------------
  // Entity Helpers
  // -------------------------------------------------------------------------

  spawnEntity(tags: string[]): Entity {
    const id = `entity_${this.entityIdCounter++}`
    const entity: Entity = {
      id,
      tags: new Set(tags),
      scores: new Map(),
      selector: `@e[tag=${tags[0] ?? id},limit=1]`,
    }
    this.entities.push(entity)
    return entity
  }

  killEntity(tag: string): void {
    this.entities = this.entities.filter(e => !e.tags.has(tag))
  }

  getEntities(selector: string): Entity[] {
    return parseSelector(selector, this.entities)
  }

  // -------------------------------------------------------------------------
  // Output Helpers
  // -------------------------------------------------------------------------

  getLastSaid(): string {
    return this.chatLog[this.chatLog.length - 1] ?? ''
  }

  getChatLog(): string[] {
    return [...this.chatLog]
  }

  // -------------------------------------------------------------------------
  // Convenience: Compile and Load
  // -------------------------------------------------------------------------

  compileAndLoad(source: string): void {
    const result = rsCompile(source, { namespace: this.namespace })
    if (!result.success || !result.files) {
      throw new Error('Compilation failed')
    }

    // Load all .mcfunction files
    for (const file of result.files) {
      if (file.path.endsWith('.mcfunction')) {
        // Extract function name from path
        // e.g., "data/test/function/increment.mcfunction" → "test:increment"
        const match = file.path.match(/data\/([^/]+)\/function\/(.+)\.mcfunction$/)
        if (match) {
          const [, ns, fnPath] = match
          const fnName = `${ns}:${fnPath.replace(/\//g, '/')}`
          this.loadFunction(fnName, file.content.split('\n'))
        }
      }
    }

    // Run load function
    this.load()
  }
}

// Re-export for convenience
export { parseRange, matchesRange, parseSelector }
