import type { IRCommand } from '../ir/types'

export interface OptimizationStats {
  licmHoists: number
  licmLoopBodies: number
  cseRedundantReads: number
  cseArithmetic: number
  setblockMergedCommands: number
  setblockFillCommands: number
  setblockSavedCommands: number
  deadCodeRemoved: number
  constantFolds: number
  totalCommandsBefore: number
  totalCommandsAfter: number
}

export interface CommandFunction {
  name: string
  commands: IRCommand[]
}

const SCOREBOARD_READ_RE =
  /^execute store result score (\$[A-Za-z0-9_]+) rs run scoreboard players get (\S+) (\S+)$/
const SCOREBOARD_WRITE_RE =
  /^(?:scoreboard players (?:set|add|remove|reset)\s+(\S+)\s+(\S+)|scoreboard players operation\s+(\S+)\s+(\S+)\s+[+\-*/%]?= )/
const EXECUTE_STORE_SCORE_RE =
  /^execute store result score (\S+) (\S+) run /
const FUNCTION_CALL_RE = /^execute as (.+) run function ([^:]+):(.+)$/
const TEMP_RE = /\$[A-Za-z0-9_]+/g
const SETBLOCK_RE = /^setblock (-?\d+) (-?\d+) (-?\d+) (\S+)$/

export function createEmptyOptimizationStats(): OptimizationStats {
  return {
    licmHoists: 0,
    licmLoopBodies: 0,
    cseRedundantReads: 0,
    cseArithmetic: 0,
    setblockMergedCommands: 0,
    setblockFillCommands: 0,
    setblockSavedCommands: 0,
    deadCodeRemoved: 0,
    constantFolds: 0,
    totalCommandsBefore: 0,
    totalCommandsAfter: 0,
  }
}

function cloneCommand(command: IRCommand): IRCommand {
  return { ...command }
}

function cloneFunctions(functions: CommandFunction[]): CommandFunction[] {
  return functions.map(fn => ({
    name: fn.name,
    commands: fn.commands.map(cloneCommand),
  }))
}

export function mergeOptimizationStats(base: OptimizationStats, delta: Partial<OptimizationStats>): void {
  for (const [key, value] of Object.entries(delta)) {
    base[key as keyof OptimizationStats] += value as number
  }
}

function parseScoreboardWrite(command: string): { player: string; objective: string } | null {
  const executeStoreMatch = command.match(EXECUTE_STORE_SCORE_RE)
  if (executeStoreMatch) {
    return { player: executeStoreMatch[1], objective: executeStoreMatch[2] }
  }

  const match = command.match(SCOREBOARD_WRITE_RE)
  if (!match) {
    return null
  }

  if (match[1] && match[2]) {
    return { player: match[1], objective: match[2] }
  }

  if (match[3] && match[4]) {
    return { player: match[3], objective: match[4] }
  }

  return null
}

function replaceTemp(command: string, from: string, to: string): string {
  const re = new RegExp(`\\${from}(?![A-Za-z0-9_])`, 'g')
  return command.replace(re, to)
}

function collectObjectiveWrites(functions: CommandFunction[]): Map<string, number> {
  const writes = new Map<string, number>()

  for (const fn of functions) {
    for (const command of fn.commands) {
      const write = parseScoreboardWrite(command.cmd)
      if (!write) continue
      writes.set(write.objective, (writes.get(write.objective) ?? 0) + 1)
    }
  }

  return writes
}

function applyLICMInternal(functions: CommandFunction[]): Partial<OptimizationStats> {
  const stats: Partial<OptimizationStats> = { licmHoists: 0, licmLoopBodies: 0 }
  const functionMap = new Map(functions.map(fn => [fn.name, fn]))
  const objectiveWrites = collectObjectiveWrites(functions)

  for (const fn of functions) {
    const nextCommands: IRCommand[] = []

    for (const command of fn.commands) {
      const match = command.cmd.match(FUNCTION_CALL_RE)
      if (!match) {
        nextCommands.push(command)
        continue
      }

      const loopFn = functionMap.get(match[3])
      if (!loopFn) {
        nextCommands.push(command)
        continue
      }

      const readInfo = new Map<string, { temp: string; player: string; objective: string; uses: number }>()
      const scoreboardWrites = new Set<string>()

      for (const inner of loopFn.commands) {
        const readMatch = inner.cmd.match(SCOREBOARD_READ_RE)
        if (readMatch) {
          const [, temp, player, objective] = readMatch
          const key = `${player} ${objective}`
          readInfo.set(key, { temp, player, objective, uses: 0 })
        }

        const write = parseScoreboardWrite(inner.cmd)
        if (write) {
          scoreboardWrites.add(`${write.player} ${write.objective}`)
        }
      }

      for (const inner of loopFn.commands) {
        for (const info of readInfo.values()) {
          const matches = inner.cmd.match(TEMP_RE) ?? []
          const usageCount = matches.filter(name => name === info.temp).length
          const isDef = inner.cmd.startsWith(`execute store result score ${info.temp} rs run scoreboard players get `)
          if (!isDef) {
            info.uses += usageCount
          }
        }
      }

      const hoistable = Array.from(readInfo.entries())
        .filter(([key, info]) => {
          if (info.uses < 2) return false
          if ((objectiveWrites.get(info.objective) ?? 0) !== 0) return false
          if (scoreboardWrites.has(key)) return false
          return true
        })
        .map(([, info]) => info)

      if (hoistable.length === 0) {
        nextCommands.push(command)
        continue
      }

      const hoistedTemps = new Set(hoistable.map(item => item.temp))
      const rewrittenLoopCommands: IRCommand[] = []

      for (const inner of loopFn.commands) {
        const readMatch = inner.cmd.match(SCOREBOARD_READ_RE)
        if (readMatch && hoistedTemps.has(readMatch[1])) {
          continue
        }
        rewrittenLoopCommands.push(inner)
      }

      loopFn.commands = rewrittenLoopCommands
      nextCommands.push(
        ...hoistable.map(item => ({
          cmd: `execute store result score ${item.temp} rs run scoreboard players get ${item.player} ${item.objective}`,
        })),
        command
      )
      stats.licmHoists = (stats.licmHoists ?? 0) + hoistable.length
      stats.licmLoopBodies = (stats.licmLoopBodies ?? 0) + 1
    }

    fn.commands = nextCommands
  }

  return stats
}

function extractArithmeticExpression(commands: IRCommand[], index: number): { key: string; dst: string } | null {
  const assign =
    commands[index]?.cmd.match(/^scoreboard players operation (\$[A-Za-z0-9_]+) rs = (\$[A-Za-z0-9_]+|\$const_-?\d+) rs$/) ??
    commands[index]?.cmd.match(/^scoreboard players set (\$[A-Za-z0-9_]+) rs (-?\d+)$/)
  const op = commands[index + 1]?.cmd.match(/^scoreboard players operation (\$[A-Za-z0-9_]+) rs ([+\-*/%]=) (\$[A-Za-z0-9_]+|\$const_-?\d+) rs$/)
  if (!assign || !op || assign[1] !== op[1]) {
    return null
  }
  return {
    key: `${assign[2]} ${op[2]} ${op[3]}`,
    dst: assign[1],
  }
}

function applyCSEInternal(functions: CommandFunction[]): Partial<OptimizationStats> {
  const stats: Partial<OptimizationStats> = { cseRedundantReads: 0, cseArithmetic: 0 }

  for (const fn of functions) {
    const commands = fn.commands.map(cloneCommand)
    const readCache = new Map<string, string>()
    const exprCache = new Map<string, string>()
    const rewritten: IRCommand[] = []

    function invalidateByTemp(temp: string): void {
      for (const [key, value] of readCache.entries()) {
        if (value === temp || key.includes(`${temp} `) || key.endsWith(` ${temp}`)) {
          readCache.delete(key)
        }
      }
      for (const [key, value] of exprCache.entries()) {
        if (value === temp || key.includes(temp)) {
          exprCache.delete(key)
        }
      }
    }

    for (let i = 0; i < commands.length; i++) {
      const command = commands[i]
      const readMatch = command.cmd.match(SCOREBOARD_READ_RE)
      if (readMatch) {
        const [, dst, player, objective] = readMatch
        const key = `${player} ${objective}`
        const cached = readCache.get(key)
        if (cached) {
          stats.cseRedundantReads = (stats.cseRedundantReads ?? 0) + 1
          rewritten.push({ ...command, cmd: `scoreboard players operation ${dst} rs = ${cached} rs` })
        } else {
          readCache.set(key, dst)
          rewritten.push(command)
        }
        invalidateByTemp(dst)
        readCache.set(key, dst)
        continue
      }

      const expr = extractArithmeticExpression(commands, i)
      if (expr) {
        const cached = exprCache.get(expr.key)
        if (cached) {
          rewritten.push({ ...commands[i], cmd: `scoreboard players operation ${expr.dst} rs = ${cached} rs` })
          stats.cseArithmetic = (stats.cseArithmetic ?? 0) + 1
          i += 1
        } else {
          rewritten.push(command)
          rewritten.push(commands[i + 1])
          exprCache.set(expr.key, expr.dst)
          i += 1
        }
        invalidateByTemp(expr.dst)
        exprCache.set(expr.key, expr.dst)
        continue
      }

      const write = parseScoreboardWrite(command.cmd)
      if (write) {
        readCache.delete(`${write.player} ${write.objective}`)
        if (write.player.startsWith('$')) {
          invalidateByTemp(write.player)
        }
      }

      rewritten.push(command)
    }

    fn.commands = rewritten
  }

  return stats
}

function batchSetblocksInCommands(commands: IRCommand[]): { commands: IRCommand[]; stats: Partial<OptimizationStats> } {
  const rewritten: IRCommand[] = []
  const stats: Partial<OptimizationStats> = {
    setblockMergedCommands: 0,
    setblockFillCommands: 0,
    setblockSavedCommands: 0,
  }

  for (let i = 0; i < commands.length; ) {
    const start = commands[i].cmd.match(SETBLOCK_RE)
    if (!start) {
      rewritten.push(commands[i])
      i++
      continue
    }

    const block = start[4]
    const run = [{ index: i, x: Number(start[1]), y: Number(start[2]), z: Number(start[3]) }]
    let axis: 'x' | 'z' | null = null
    let j = i + 1

    while (j < commands.length) {
      const next = commands[j].cmd.match(SETBLOCK_RE)
      if (!next || next[4] !== block) break

      const point = { x: Number(next[1]), y: Number(next[2]), z: Number(next[3]) }
      const prev = run[run.length - 1]
      if (point.y !== prev.y) break

      const stepX = point.x - prev.x
      const stepZ = point.z - prev.z
      if (axis === null) {
        if (stepX === 1 && stepZ === 0) axis = 'x'
        else if (stepX === 0 && stepZ === 1) axis = 'z'
        else break
      }

      const valid = axis === 'x'
        ? point.z === prev.z && stepX === 1 && stepZ === 0
        : point.x === prev.x && stepX === 0 && stepZ === 1
      if (!valid) break

      run.push({ index: j, ...point })
      j++
    }

    if (run.length >= 2) {
      const first = run[0]
      const last = run[run.length - 1]
      rewritten.push({
        ...commands[i],
        cmd: `fill ${first.x} ${first.y} ${first.z} ${last.x} ${last.y} ${last.z} ${block}`,
      })
      stats.setblockMergedCommands = (stats.setblockMergedCommands ?? 0) + run.length
      stats.setblockFillCommands = (stats.setblockFillCommands ?? 0) + 1
      stats.setblockSavedCommands = (stats.setblockSavedCommands ?? 0) + (run.length - 1)
      i = j
      continue
    }

    rewritten.push(commands[i])
    i++
  }

  return { commands: rewritten, stats }
}

function applySetblockBatchingInternal(functions: CommandFunction[]): Partial<OptimizationStats> {
  const stats: Partial<OptimizationStats> = {
    setblockMergedCommands: 0,
    setblockFillCommands: 0,
    setblockSavedCommands: 0,
  }

  for (const fn of functions) {
    const batched = batchSetblocksInCommands(fn.commands)
    fn.commands = batched.commands
    mergeOptimizationStats(stats as OptimizationStats, batched.stats)
  }

  return stats
}

export function applyLICM(functions: CommandFunction[]): { functions: CommandFunction[]; stats: OptimizationStats } {
  const optimized = cloneFunctions(functions)
  const stats = createEmptyOptimizationStats()
  stats.totalCommandsBefore = optimized.reduce((sum, fn) => sum + fn.commands.length, 0)
  mergeOptimizationStats(stats, applyLICMInternal(optimized))
  stats.totalCommandsAfter = optimized.reduce((sum, fn) => sum + fn.commands.length, 0)
  return { functions: optimized, stats }
}

export function applyCSE(functions: CommandFunction[]): { functions: CommandFunction[]; stats: OptimizationStats } {
  const optimized = cloneFunctions(functions)
  const stats = createEmptyOptimizationStats()
  stats.totalCommandsBefore = optimized.reduce((sum, fn) => sum + fn.commands.length, 0)
  mergeOptimizationStats(stats, applyCSEInternal(optimized))
  stats.totalCommandsAfter = optimized.reduce((sum, fn) => sum + fn.commands.length, 0)
  return { functions: optimized, stats }
}

export function batchSetblocks(functions: CommandFunction[]): { functions: CommandFunction[]; stats: OptimizationStats } {
  const optimized = cloneFunctions(functions)
  const stats = createEmptyOptimizationStats()
  stats.totalCommandsBefore = optimized.reduce((sum, fn) => sum + fn.commands.length, 0)
  mergeOptimizationStats(stats, applySetblockBatchingInternal(optimized))
  stats.totalCommandsAfter = optimized.reduce((sum, fn) => sum + fn.commands.length, 0)
  return { functions: optimized, stats }
}

export function optimizeCommandFunctions(functions: CommandFunction[]): { functions: CommandFunction[]; stats: OptimizationStats } {
  const initial = cloneFunctions(functions)
  const stats = createEmptyOptimizationStats()
  stats.totalCommandsBefore = initial.reduce((sum, fn) => sum + fn.commands.length, 0)

  const licm = applyLICM(initial)
  mergeOptimizationStats(stats, licm.stats)

  const cse = applyCSE(licm.functions)
  mergeOptimizationStats(stats, cse.stats)

  const batched = batchSetblocks(cse.functions)
  mergeOptimizationStats(stats, batched.stats)
  stats.totalCommandsAfter = batched.functions.reduce((sum, fn) => sum + fn.commands.length, 0)

  return {
    functions: batched.functions,
    stats,
  }
}
