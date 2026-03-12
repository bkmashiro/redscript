import * as fs from 'fs'

interface BrigadierFile {
  root: BrigadierNode
}

interface BrigadierNode {
  type?: 'literal' | 'argument' | 'root'
  name?: string
  executable?: boolean
  children?: BrigadierNode[]
  redirects?: string[]
  parser?: {
    parser: string
    modifier?: {
      type?: string
    } | null
  }
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

const FUNCTION_ID_RE = /^[0-9a-z_.-]+:[0-9a-z_./-]+$/i
const INTEGER_RE = /^-?\d+$/
const SCORE_RANGE_RE = /^-?\d+\.\.$|^\.\.-?\d+$|^-?\d+\.\.-?\d+$|^-?\d+$/
const COMMENT_PREFIXES = [
  '# RedScript runtime init',
  '# block:',
  '# RedScript tick dispatcher',
]
const SCOREBOARD_PLAYER_ACTIONS = new Set(['set', 'add', 'remove', 'get', 'operation', 'enable'])
const SCOREBOARD_OPERATIONS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '<', '>', '><'])

export class MCCommandValidator {
  private readonly root: BrigadierNode
  private readonly rootChildren: BrigadierNode[]

  constructor(commandsPath: string) {
    const parsed = JSON.parse(fs.readFileSync(commandsPath, 'utf-8')) as BrigadierFile
    this.root = parsed.root
    this.rootChildren = parsed.root.children ?? []
  }

  validate(line: string): ValidationResult {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || COMMENT_PREFIXES.some(prefix => trimmed.startsWith(prefix))) {
      return { valid: true }
    }

    const tokens = tokenize(trimmed)
    if (tokens.length === 0) {
      return { valid: true }
    }

    if (!this.hasRootCommand(tokens[0])) {
      return { valid: false, error: `Unknown root command: ${tokens[0]}` }
    }

    switch (tokens[0]) {
      case 'execute':
        return this.validateExecute(tokens)
      case 'scoreboard':
        return this.validateScoreboard(tokens)
      case 'function':
        return this.validateFunction(tokens)
      case 'data':
        return this.validateData(tokens)
      case 'return':
        return this.validateReturn(tokens)
      default:
        return this.validateAgainstTree(tokens)
    }
  }

  private hasRootCommand(command: string): boolean {
    return this.rootChildren.some(child => child.type === 'literal' && child.name === command)
  }

  private validateExecute(tokens: string[]): ValidationResult {
    const runIndex = tokens.indexOf('run')
    if (runIndex === 1 || runIndex === tokens.length - 1) {
      return { valid: false, error: 'Malformed execute run clause' }
    }

    if (runIndex !== -1) {
      const chainResult = this.validateAgainstTree(tokens.slice(0, runIndex))
      if (!chainResult.valid) {
        return chainResult
      }

      return this.validate(tokens.slice(runIndex + 1).join(' '))
    }

    return this.validateAgainstTree(tokens)
  }

  private validateScoreboard(tokens: string[]): ValidationResult {
    if (tokens[1] === 'objectives' && tokens[2] === 'add') {
      if (tokens.length < 5) {
        return { valid: false, error: 'scoreboard objectives add requires name and criteria' }
      }
      return this.validateAgainstTree(tokens)
    }

    if (tokens[1] !== 'players' || !SCOREBOARD_PLAYER_ACTIONS.has(tokens[2] ?? '')) {
      return this.validateAgainstTree(tokens)
    }

    const action = tokens[2]
    if (action === 'enable') {
      if (tokens.length !== 5) {
        return { valid: false, error: 'scoreboard players enable requires target and objective' }
      }
      return this.validateAgainstTree(tokens)
    }

    if (action === 'get') {
      if (tokens.length !== 5) {
        return { valid: false, error: 'scoreboard players get requires target and objective' }
      }
      return this.validateAgainstTree(tokens)
    }

    if (action === 'operation') {
      if (tokens.length !== 8) {
        return { valid: false, error: 'scoreboard players operation requires 5 operands' }
      }
      if (!SCOREBOARD_OPERATIONS.has(tokens[5])) {
        return { valid: false, error: `Unknown scoreboard operation: ${tokens[5]}` }
      }
      return this.validateAgainstTree(tokens)
    }

    if (tokens.length !== 6) {
      return { valid: false, error: `scoreboard players ${action} requires target, objective, and value` }
    }

    if (!INTEGER_RE.test(tokens[5])) {
      return { valid: false, error: `Expected integer value, got: ${tokens[5]}` }
    }

    return this.validateAgainstTree(tokens)
  }

  private validateFunction(tokens: string[]): ValidationResult {
    if (tokens.length !== 2 || !FUNCTION_ID_RE.test(tokens[1])) {
      return { valid: false, error: 'function requires a namespaced function id' }
    }

    return this.validateAgainstTree(tokens)
  }

  private validateData(tokens: string[]): ValidationResult {
    if (tokens.length < 5) {
      return { valid: false, error: 'data command is incomplete' }
    }

    const action = tokens[1]
    if (!['get', 'modify', 'merge', 'remove'].includes(action)) {
      return this.validateAgainstTree(tokens)
    }

    const targetType = tokens[2]
    if (!['storage', 'entity', 'block'].includes(targetType)) {
      return { valid: false, error: `Unsupported data target: ${targetType}` }
    }

    if (action === 'get') {
      if (tokens.length < 5) {
        return { valid: false, error: 'data get requires target and path' }
      }
      if (tokens[5] && !isNumberish(tokens[5])) {
        return { valid: false, error: `Invalid data get scale: ${tokens[5]}` }
      }
      return this.validateAgainstTree(tokens)
    }

    if (action === 'modify') {
      if (tokens.length < 7) {
        return { valid: false, error: 'data modify is incomplete' }
      }
      if (!['set', 'append', 'prepend', 'insert', 'merge'].includes(tokens[5])) {
        return { valid: false, error: `Unsupported data modify mode: ${tokens[5]}` }
      }
      return this.validateAgainstTree(tokens)
    }

    return this.validateAgainstTree(tokens)
  }

  private validateReturn(tokens: string[]): ValidationResult {
    if (tokens.length < 2) {
      return { valid: false, error: 'return requires a value or run clause' }
    }

    if (tokens[1] === 'run') {
      if (tokens.length < 3) {
        return { valid: false, error: 'return run requires an inner command' }
      }
      return this.validate(tokens.slice(2).join(' '))
    }

    if (!INTEGER_RE.test(tokens[1])) {
      return { valid: false, error: `Invalid return value: ${tokens[1]}` }
    }

    return this.validateAgainstTree(tokens)
  }

  private validateAgainstTree(tokens: string[]): ValidationResult {
    const memo = new Map<string, boolean>()
    const isValid = walk(this.root, tokens, 0, memo, this.rootChildren)

    return isValid
      ? { valid: true }
      : { valid: false, error: `Command does not match Brigadier tree: ${tokens.join(' ')}` }
  }
}

function walk(
  node: BrigadierNode,
  tokens: string[],
  index: number,
  memo: Map<string, boolean>,
  rootChildren: BrigadierNode[]
): boolean {
  const key = `${node.name ?? '<root>'}:${index}`
  const cached = memo.get(key)
  if (cached !== undefined) {
    return cached
  }

  if (index === tokens.length) {
    const done = node.executable === true || (node.children ?? []).length === 0
    memo.set(key, done)
    return done
  }

  const children = node.children ?? []
  for (const child of children) {
    if (child.type === 'literal') {
      if (child.name === tokens[index] && walk(child, tokens, index + 1, memo, rootChildren)) {
        memo.set(key, true)
        return true
      }
      continue
    }

    if (child.type !== 'argument') {
      continue
    }

    const parser = child.parser?.parser
    const modifier = child.parser?.modifier?.type
    if (parserConsumesRest(parser, modifier)) {
      const done = child.executable === true || (child.children ?? []).length === 0
      if (done) {
        memo.set(key, true)
        return true
      }
    }

    const width = parserTokenWidth(parser, tokens, index)
    if (width === null) {
      continue
    }

    const nextIndex = index + width
    if (walk(child, tokens, nextIndex, memo, rootChildren)) {
      memo.set(key, true)
      return true
    }

    for (const redirect of child.redirects ?? []) {
      const target = rootChildren.find(candidate => candidate.name === redirect)
      if (target && walk(target, tokens, nextIndex, memo, rootChildren)) {
        memo.set(key, true)
        return true
      }
    }
  }

  memo.set(key, false)
  return false
}

function parserConsumesRest(parser?: string, modifier?: string): boolean {
  return (
    (parser === 'brigadier:string' && modifier === 'greedy') ||
    parser === 'minecraft:message'
  )
}

function parserTokenWidth(parser: string | undefined, tokens: string[], index: number): number | null {
  switch (parser) {
    case 'minecraft:vec3':
    case 'minecraft:block_pos':
      return index + 3 <= tokens.length ? 3 : null
    case 'minecraft:vec2':
    case 'minecraft:column_pos':
    case 'minecraft:rotation':
      return index + 2 <= tokens.length ? 2 : null
    default:
      return index < tokens.length ? 1 : null
  }
}

function tokenize(line: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | '\'' | null = null
  let escape = false
  let bracketDepth = 0
  let braceDepth = 0

  for (const char of line) {
    if (escape) {
      current += char
      escape = false
      continue
    }

    if (quote) {
      current += char
      if (char === '\\') {
        escape = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }

    if (char === '"' || char === '\'') {
      quote = char
      current += char
      continue
    }

    if (char === '[') bracketDepth += 1
    if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1)
    if (char === '{') braceDepth += 1
    if (char === '}') braceDepth = Math.max(0, braceDepth - 1)

    if (/\s/.test(char) && bracketDepth === 0 && braceDepth === 0) {
      if (current) {
        tokens.push(current)
        current = ''
      }
      continue
    }

    current += char
  }

  if (current) {
    tokens.push(current)
  }

  return tokens
}

function isNumberish(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value) || SCORE_RANGE_RE.test(value)
}
