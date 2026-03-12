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
  type?: string
  position?: { x: number; y: number; z: number }
}

interface Range {
  min: number
  max: number
}

interface SelectorFilters {
  tag?: string[]
  notTag?: string[]
  type?: string[]
  notType?: string[]
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

function canonicalEntityType(entityType: string): string {
  return entityType.includes(':') ? entityType : `minecraft:${entityType}`
}

function parseFilters(content: string): SelectorFilters {
  const filters: SelectorFilters = {
    tag: [],
    notTag: [],
    type: [],
    notType: [],
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
    } else if (key === 'type') {
      if (value.startsWith('!')) {
        filters.notType!.push(value.slice(1))
      } else {
        filters.type!.push(value)
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

  // Check types
  if ((filters.type?.length ?? 0) > 0) {
    const entityType = canonicalEntityType(entity.type ?? 'minecraft:armor_stand')
    const allowedTypes = filters.type!.map(canonicalEntityType)
    if (!allowedTypes.includes(entityType)) {
      return false
    }
  }
  for (const notType of filters.notType || []) {
    const entityType = canonicalEntityType(entity.type ?? 'minecraft:armor_stand')
    if (canonicalEntityType(notType) === entityType) {
      return false
    }
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

  // Simple world state: "x,y,z" -> block id
  world: Map<string, string> = new Map()

  // Current weather
  weather: string = 'clear'

  // Current world time
  worldTime: number = 0

  // Active potion effects by entity id
  effects: Map<string, { effect: string; duration: number; amplifier: number }[]> = new Map()

  // XP values by player/entity id
  xp: Map<string, number> = new Map()

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
    if (cmd.startsWith('setblock ')) {
      return this.execSetblock(cmd)
    }
    if (cmd.startsWith('fill ')) {
      return this.execFill(cmd)
    }
    if (cmd.startsWith('tp ')) {
      return this.execTp(cmd, executor)
    }
    if (cmd.startsWith('weather ')) {
      return this.execWeather(cmd)
    }
    if (cmd.startsWith('time ')) {
      return this.execTime(cmd)
    }
    if (cmd.startsWith('kill ')) {
      return this.execKill(cmd, executor)
    }
    if (cmd.startsWith('effect ')) {
      return this.execEffect(cmd, executor)
    }
    if (cmd.startsWith('xp ')) {
      return this.execXp(cmd, executor)
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

    if (storeTarget) {
      const value = storeTarget.type === 'result'
        ? (this.returnValue ?? (condition ? 1 : 0))
        : (condition ? 1 : 0)
      this.setScore(storeTarget.player, storeTarget.objective, value)
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
    const outerShouldReturn = this.shouldReturn
    this.execFunction(fnName, executor)
    this.shouldReturn = outerShouldReturn
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
      if (typeof value === 'number') {
        this.returnValue = value
      } else if (Array.isArray(value)) {
        this.returnValue = value.length
      } else {
        this.returnValue = value ? 1 : 0
      }
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

    // data remove storage <ns:path> <field>
    const removeMatch = cmd.match(/^data remove storage (\S+) (\S+)$/)
    if (removeMatch) {
      const [, storagePath, field] = removeMatch
      return this.removeStorageField(storagePath, field)
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
    const segments = this.parseStoragePath(field)
    let current: any = data
    for (const segment of segments) {
      if (typeof segment === 'number') {
        if (!Array.isArray(current)) return undefined
        const index = segment < 0 ? current.length + segment : segment
        current = current[index]
        continue
      }
      if (current == null || typeof current !== 'object') return undefined
      current = current[segment]
    }
    return current
  }

  private setStorageField(storagePath: string, field: string, value: any): void {
    let data = this.storage.get(storagePath)
    if (!data) {
      data = {}
      this.storage.set(storagePath, data)
    }
    const segments = this.parseStoragePath(field)
    let current: any = data
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]
      const next = segments[i + 1]
      if (typeof segment === 'number') {
        if (!Array.isArray(current)) return
        const index = segment < 0 ? current.length + segment : segment
        if (current[index] === undefined) {
          current[index] = typeof next === 'number' ? [] : {}
        }
        current = current[index]
        continue
      }
      if (!(segment in current)) {
        current[segment] = typeof next === 'number' ? [] : {}
      }
      current = current[segment]
    }

    const last = segments[segments.length - 1]
    if (typeof last === 'number') {
      if (!Array.isArray(current)) return
      const index = last < 0 ? current.length + last : last
      current[index] = value
      return
    }
    current[last] = value
  }

  private removeStorageField(storagePath: string, field: string): boolean {
    const data = this.storage.get(storagePath)
    if (!data) return false

    const segments = this.parseStoragePath(field)
    let current: any = data
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]
      if (typeof segment === 'number') {
        if (!Array.isArray(current)) return false
        const index = segment < 0 ? current.length + segment : segment
        current = current[index]
      } else {
        current = current?.[segment]
      }
      if (current === undefined) return false
    }

    const last = segments[segments.length - 1]
    if (typeof last === 'number') {
      if (!Array.isArray(current)) return false
      const index = last < 0 ? current.length + last : last
      if (index < 0 || index >= current.length) return false
      current.splice(index, 1)
      return true
    }

    if (current == null || typeof current !== 'object' || !(last in current)) return false
    delete current[last]
    return true
  }

  private parseStoragePath(field: string): Array<string | number> {
    return field
      .split('.')
      .flatMap(part => {
        const segments: Array<string | number> = []
        const regex = /([^\[\]]+)|\[(-?\d+)\]/g
        for (const match of part.matchAll(regex)) {
          if (match[1]) segments.push(match[1])
          if (match[2]) segments.push(parseInt(match[2], 10))
        }
        return segments
      })
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
      const text = this.extractJsonText(jsonStr)
      this.chatLog.push(text)
      return true
    }
    return false
  }

  private execTitle(cmd: string): boolean {
    // title <selector> <kind> <json>
    const match = cmd.match(/^title \S+ (actionbar|title|subtitle) (.+)$/)
    if (match) {
      const [, kind, jsonStr] = match
      const text = this.extractJsonText(jsonStr)
      this.chatLog.push(`[${kind.toUpperCase()}] ${text}`)
      return true
    }
    return false
  }

  private extractJsonText(json: any): string {
    if (typeof json === 'string') {
      try {
        json = JSON.parse(json)
      } catch {
        return json
      }
    }

    if (typeof json === 'string') return json
    if (Array.isArray(json)) {
      return json.map(part => this.extractJsonText(part)).join('')
    }
    if (typeof json === 'object' && json !== null) {
      if ('text' in json) return String(json.text)
      if ('score' in json && typeof json.score === 'object' && json.score !== null) {
        const name = 'name' in json.score ? String(json.score.name) : ''
        const objective = 'objective' in json.score ? String(json.score.objective) : 'rs'
        return String(this.getScore(name, objective))
      }
      if ('extra' in json && Array.isArray(json.extra)) {
        return json.extra.map((part: any) => this.extractJsonText(part)).join('')
      }
    }
    return ''
  }

  // -------------------------------------------------------------------------
  // World Commands
  // -------------------------------------------------------------------------

  private execSetblock(cmd: string): boolean {
    const match = cmd.match(/^setblock (\S+) (\S+) (\S+) (\S+)$/)
    if (!match) return false

    const [, x, y, z, block] = match
    const key = this.positionKey(x, y, z)
    if (!key) return false
    this.world.set(key, block)
    return true
  }

  private execFill(cmd: string): boolean {
    const match = cmd.match(/^fill (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) (\S+)$/)
    if (!match) return false

    const [, x1, y1, z1, x2, y2, z2, block] = match
    const start = this.parseAbsolutePosition(x1, y1, z1)
    const end = this.parseAbsolutePosition(x2, y2, z2)
    if (!start || !end) return false

    const [minX, maxX] = [Math.min(start.x, end.x), Math.max(start.x, end.x)]
    const [minY, maxY] = [Math.min(start.y, end.y), Math.max(start.y, end.y)]
    const [minZ, maxZ] = [Math.min(start.z, end.z), Math.max(start.z, end.z)]

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          this.world.set(`${x},${y},${z}`, block)
        }
      }
    }
    return true
  }

  private execTp(cmd: string, executor?: Entity): boolean {
    const selfCoordsMatch = cmd.match(/^tp (\S+) (\S+) (\S+)$/)
    if (selfCoordsMatch && executor) {
      const [, x, y, z] = selfCoordsMatch
      const next = this.resolvePosition(executor.position ?? { x: 0, y: 0, z: 0 }, x, y, z)
      if (!next) return false
      executor.position = next
      return true
    }

    const coordsMatch = cmd.match(/^tp (\S+) (\S+) (\S+) (\S+)$/)
    if (coordsMatch) {
      const [, selStr, x, y, z] = coordsMatch
      const entities = selStr === '@s' && executor
        ? [executor]
        : parseSelector(selStr, this.entities, executor)
      for (const entity of entities) {
        const next = this.resolvePosition(entity.position ?? { x: 0, y: 0, z: 0 }, x, y, z)
        if (next) {
          entity.position = next
        }
      }
      return entities.length > 0
    }

    const entityMatch = cmd.match(/^tp (\S+) (\S+)$/)
    if (entityMatch) {
      const [, selStr, targetStr] = entityMatch
      const entities = selStr === '@s' && executor
        ? [executor]
        : parseSelector(selStr, this.entities, executor)
      const target = targetStr === '@s' && executor
        ? executor
        : parseSelector(targetStr, this.entities, executor)[0]
      if (!target?.position) return false
      for (const entity of entities) {
        entity.position = { ...target.position }
      }
      return entities.length > 0
    }

    return false
  }

  private execWeather(cmd: string): boolean {
    const match = cmd.match(/^weather (\S+)$/)
    if (!match) return false
    this.weather = match[1]
    return true
  }

  private execTime(cmd: string): boolean {
    const match = cmd.match(/^time (set|add) (\S+)$/)
    if (!match) return false

    const [, action, valueStr] = match
    const value = this.parseTimeValue(valueStr)
    if (value === null) return false

    if (action === 'set') {
      this.worldTime = value
    } else {
      this.worldTime += value
    }
    return true
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
  // Effect / XP Commands
  // -------------------------------------------------------------------------

  private execEffect(cmd: string, executor?: Entity): boolean {
    const match = cmd.match(/^effect give (\S+) (\S+)(?: (\S+))?(?: (\S+))?(?: \S+)?$/)
    if (!match) return false

    const [, selStr, effect, durationStr, amplifierStr] = match
    const entities = selStr === '@s' && executor
      ? [executor]
      : parseSelector(selStr, this.entities, executor)

    const duration = durationStr ? parseInt(durationStr, 10) : 30
    const amplifier = amplifierStr ? parseInt(amplifierStr, 10) : 0
    for (const entity of entities) {
      const current = this.effects.get(entity.id) ?? []
      current.push({ effect, duration: isNaN(duration) ? 30 : duration, amplifier: isNaN(amplifier) ? 0 : amplifier })
      this.effects.set(entity.id, current)
    }
    return entities.length > 0
  }

  private execXp(cmd: string, executor?: Entity): boolean {
    const match = cmd.match(/^xp (add|set) (\S+) (-?\d+)(?: (\S+))?$/)
    if (!match) return false

    const [, action, target, amountStr] = match
    const amount = parseInt(amountStr, 10)
    const keys = this.resolveTargetKeys(target, executor)
    if (keys.length === 0) return false

    for (const key of keys) {
      const current = this.xp.get(key) ?? 0
      this.xp.set(key, action === 'set' ? amount : current + amount)
    }
    return true
  }

  // -------------------------------------------------------------------------
  // Summon Command
  // -------------------------------------------------------------------------

  private execSummon(cmd: string): boolean {
    // summon minecraft:armor_stand <x> <y> <z> {Tags:["tag1","tag2"]}
    const match = cmd.match(/^summon (\S+) (\S+) (\S+) (\S+) ({.+})$/)
    if (match) {
      const [, type, x, y, z, nbtStr] = match
      const nbt = parseNBT(nbtStr)
      const position = this.parseAbsolutePosition(x, y, z) ?? { x: 0, y: 0, z: 0 }
      this.spawnEntity(nbt.Tags || [], type, position)
      return true
    }

    // Simple summon without NBT
    const simpleMatch = cmd.match(/^summon (\S+)(?: (\S+) (\S+) (\S+))?$/)
    if (simpleMatch) {
      const [, type, x, y, z] = simpleMatch
      const position = x && y && z
        ? (this.parseAbsolutePosition(x, y, z) ?? { x: 0, y: 0, z: 0 })
        : { x: 0, y: 0, z: 0 }
      this.spawnEntity([], type, position)
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

  spawnEntity(tags: string[], type: string = 'minecraft:armor_stand', position: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): Entity {
    const id = `entity_${this.entityIdCounter++}`
    const entity: Entity = {
      id,
      tags: new Set(tags),
      scores: new Map(),
      selector: `@e[tag=${tags[0] ?? id},limit=1]`,
      type,
      position,
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

  private positionKey(x: string, y: string, z: string): string | null {
    const pos = this.parseAbsolutePosition(x, y, z)
    return pos ? `${pos.x},${pos.y},${pos.z}` : null
  }

  private parseAbsolutePosition(x: string, y: string, z: string): { x: number; y: number; z: number } | null {
    const coords = [x, y, z].map(coord => {
      if (coord.startsWith('~') || coord.startsWith('^')) {
        const offset = coord.slice(1)
        return offset === '' ? 0 : parseInt(offset, 10)
      }
      return parseInt(coord, 10)
    })
    if (coords.some(Number.isNaN)) return null
    return { x: coords[0], y: coords[1], z: coords[2] }
  }

  private resolvePosition(base: { x: number; y: number; z: number }, x: string, y: string, z: string): { x: number; y: number; z: number } | null {
    const values = [x, y, z].map((coord, index) => {
      if (coord.startsWith('~') || coord.startsWith('^')) {
        const offset = coord.slice(1)
        const delta = offset === '' ? 0 : parseInt(offset, 10)
        return [base.x, base.y, base.z][index] + delta
      }
      return parseInt(coord, 10)
    })
    if (values.some(Number.isNaN)) return null
    return { x: values[0], y: values[1], z: values[2] }
  }

  private parseTimeValue(value: string): number | null {
    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10)
    }

    const aliases: Record<string, number> = {
      day: 1000,
      noon: 6000,
      night: 13000,
      midnight: 18000,
      sunrise: 23000,
    }
    return aliases[value] ?? null
  }

  private resolveTargetKeys(target: string, executor?: Entity): string[] {
    if (target.startsWith('@')) {
      const entities = target === '@s' && executor
        ? [executor]
        : parseSelector(target, this.entities, executor)
      return entities.map(entity => entity.id)
    }
    return [target]
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
