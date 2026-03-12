import type { IRBlock, IRCommand, IRFunction, IRInstr, Operand, Terminator } from '../ir/types'
import { createEmptyOptimizationStats, mergeOptimizationStats, optimizeCommandFunctions, type OptimizationStats } from './commands'

const OBJ = 'rs'
const INLINE_THRESHOLD = 8

const BOP_OP: Record<string, string> = {
  '+': '+=',
  '-': '-=',
  '*': '*=',
  '/': '/=',
  '%': '%=',
}

interface InlineBlock {
  commands: IRCommand[]
  continuation?: string
}

function varRef(name: string): string {
  return name.startsWith('$') ? name : `$${name}`
}

function operandToScore(op: Operand): string {
  if (op.kind === 'var') return `${varRef(op.name)} ${OBJ}`
  if (op.kind === 'const') return `$const_${op.value} ${OBJ}`
  throw new Error(`Cannot convert storage operand to score: ${op.path}`)
}

function emitInstr(instr: IRInstr, namespace: string): IRCommand[] {
  const commands: IRCommand[] = []

  switch (instr.op) {
    case 'assign':
      if (instr.src.kind === 'const') {
        commands.push({ cmd: `scoreboard players set ${varRef(instr.dst)} ${OBJ} ${instr.src.value}` })
      } else if (instr.src.kind === 'var') {
        commands.push({
          cmd: `scoreboard players operation ${varRef(instr.dst)} ${OBJ} = ${varRef(instr.src.name)} ${OBJ}`,
        })
      } else {
        commands.push({
          cmd: `execute store result score ${varRef(instr.dst)} ${OBJ} run data get storage ${instr.src.path}`,
        })
      }
      break

    case 'binop':
      commands.push(...emitInstr({ op: 'assign', dst: instr.dst, src: instr.lhs }, namespace))
      commands.push({
        cmd: `scoreboard players operation ${varRef(instr.dst)} ${OBJ} ${BOP_OP[instr.bop]} ${operandToScore(instr.rhs)}`,
      })
      break

    case 'cmp': {
      const dst = varRef(instr.dst)
      const lhs = operandToScore(instr.lhs)
      const rhs = operandToScore(instr.rhs)
      commands.push({ cmd: `scoreboard players set ${dst} ${OBJ} 0` })
      const op =
        instr.cop === '==' ? 'if score' :
        instr.cop === '!=' ? 'unless score' :
        instr.cop === '<' ? 'if score' :
        instr.cop === '<=' ? 'if score' :
        instr.cop === '>' ? 'if score' :
        'if score'
      const cmp =
        instr.cop === '==' || instr.cop === '!=' ? '=' :
        instr.cop
      commands.push({
        cmd: `execute ${op} ${lhs} ${cmp} ${rhs} run scoreboard players set ${dst} ${OBJ} 1`,
      })
      break
    }

    case 'call':
      for (let i = 0; i < instr.args.length; i++) {
        commands.push(...emitInstr({ op: 'assign', dst: `$p${i}`, src: instr.args[i] }, namespace))
      }
      commands.push({ cmd: `function ${namespace}:${instr.fn}` })
      if (instr.dst) {
        commands.push({
          cmd: `scoreboard players operation ${varRef(instr.dst)} ${OBJ} = $ret ${OBJ}`,
        })
      }
      break

    case 'raw':
      commands.push({ cmd: instr.cmd })
      break
  }

  return commands
}

function emitReturn(term: Extract<Terminator, { op: 'return' }>): IRCommand[] {
  const commands: IRCommand[] = []
  if (term.value) {
    commands.push(...emitInstr({ op: 'assign', dst: '$ret', src: term.value }, ''))
  }
  if (term.value?.kind === 'const') {
    commands.push({ cmd: `return ${term.value.value}` })
  } else if (term.value?.kind === 'var') {
    commands.push({ cmd: `return run scoreboard players get ${varRef(term.value.name)} ${OBJ}` })
  }
  return commands
}

function markConditional(commands: IRCommand[]): IRCommand[] {
  return commands.map(command => ({
    ...command,
    conditional: true,
  }))
}

function cloneVisited(visited: Set<string>): Set<string> {
  return new Set(visited)
}

function isRecursiveCommand(command: string, currentFn: string, namespace: string): boolean {
  return command.includes(`function ${namespace}:${currentFn}`)
}

function getInlineableBlock(
  block: IRBlock | undefined,
  currentFn: string,
  namespace: string
): InlineBlock | null {
  if (!block) return null
  if (block.term.op === 'jump_if' || block.term.op === 'jump_unless' || block.term.op === 'tick_yield') {
    return null
  }

  const commands = block.instrs.flatMap(instr => emitInstr(instr, namespace))
  if (commands.some(command => isRecursiveCommand(command.cmd, currentFn, namespace))) {
    return null
  }

  if (block.term.op === 'return') {
    commands.push(...emitReturn(block.term))
  }

  if (commands.length > INLINE_THRESHOLD) {
    return null
  }

  return {
    commands,
    continuation: block.term.op === 'jump' ? block.term.target : undefined,
  }
}

function flattenBlock(
  fn: IRFunction,
  label: string,
  namespace: string,
  visited: Set<string>
): IRCommand[] {
  const blockMap = new Map(fn.blocks.map(block => [block.label, block]))
  const block = blockMap.get(label)
  if (!block) {
    return []
  }

  if (visited.has(label)) {
    return [{ cmd: `function ${namespace}:${fn.name}/${label}`, label }]
  }

  visited.add(label)

  const commands: IRCommand[] = []
  if (label === fn.blocks[0]?.label) {
    for (let i = 0; i < fn.params.length; i++) {
      commands.push({
        cmd: `scoreboard players operation ${varRef(fn.params[i])} ${OBJ} = $p${i} ${OBJ}`,
      })
    }
  }
  commands.push(...block.instrs.flatMap(instr => emitInstr(instr, namespace)))
  const term = block.term

  switch (term.op) {
    case 'jump':
      commands.push(...flattenBlock(fn, term.target, namespace, visited))
      return commands

    case 'jump_if':
    case 'jump_unless': {
      const trueLabel = term.op === 'jump_if' ? term.then : term.else_
      const falseLabel = term.op === 'jump_if' ? term.else_ : term.then
      const trueRange = term.op === 'jump_if' ? '1..' : '..0'
      const falseRange = term.op === 'jump_if' ? '..0' : '1..'
      const trueBlock = getInlineableBlock(blockMap.get(trueLabel), fn.name, namespace)
      const falseBlock = getInlineableBlock(blockMap.get(falseLabel), fn.name, namespace)

      if (trueBlock && falseBlock) {
        if (trueBlock.commands.length > 0) {
          commands.push({ cmd: `execute if score ${varRef(term.cond)} ${OBJ} matches ${trueRange}`, label: trueLabel })
          commands.push(...markConditional(trueBlock.commands))
        }
        if (falseBlock.commands.length > 0) {
          commands.push({ cmd: `execute if score ${varRef(term.cond)} ${OBJ} matches ${falseRange}`, label: falseLabel })
          commands.push(...markConditional(falseBlock.commands))
        }

        const continuation = trueBlock.continuation && trueBlock.continuation === falseBlock.continuation
          ? trueBlock.continuation
          : undefined
        if (continuation) {
          commands.push(...flattenBlock(fn, continuation, namespace, cloneVisited(visited)))
        }
        return commands
      }

      commands.push({ cmd: `execute if score ${varRef(term.cond)} ${OBJ} matches ${trueRange} run function ${namespace}:${fn.name}/${trueLabel}` })
      commands.push({ cmd: `execute if score ${varRef(term.cond)} ${OBJ} matches ${falseRange} run function ${namespace}:${fn.name}/${falseLabel}` })
      return commands
    }

    case 'return':
      commands.push(...emitReturn(term))
      return commands

    case 'tick_yield':
      commands.push({ cmd: `schedule function ${namespace}:${fn.name}/${term.continuation} 1t replace` })
      return commands
  }
}

function findVars(command: string): string[] {
  return Array.from(command.matchAll(/\$[A-Za-z0-9_]+/g), match => match[0])
}

function parsePureWrite(command: string): { dst: string; reads: string[] } | null {
  let match = command.match(/^scoreboard players set (\$[A-Za-z0-9_]+) rs -?\d+$/)
  if (match) {
    return { dst: match[1], reads: [] }
  }

  match = command.match(/^scoreboard players operation (\$[A-Za-z0-9_]+) rs = (\$[A-Za-z0-9_]+) rs$/)
  if (match) {
    return { dst: match[1], reads: [match[2]] }
  }

  match = command.match(/^execute .* run scoreboard players set (\$[A-Za-z0-9_]+) rs -?\d+$/)
  if (match) {
    return {
      dst: match[1],
      reads: findVars(command).filter(name => name !== match![1]),
    }
  }

  return null
}

function deadStoreEliminate(commands: IRCommand[]): IRCommand[] {
  const live = new Set<string>()
  const kept: IRCommand[] = []

  for (let i = commands.length - 1; i >= 0; i--) {
    const command = commands[i]
    const pureWrite = parsePureWrite(command.cmd)

    if (pureWrite) {
      pureWrite.reads.forEach(name => live.add(name))
      if (!live.has(pureWrite.dst)) {
        continue
      }
      live.delete(pureWrite.dst)
      kept.push(command)
      continue
    }

    findVars(command.cmd).forEach(name => live.add(name))
    kept.push(command)
  }

  return kept.reverse()
}

function isInlineableFunction(
  fn: IRFunction | undefined,
  currentFn: string,
  namespace: string
): fn is IRFunction & { commands: IRCommand[] } {
  if (!fn?.commands || fn.name === currentFn || fn.commands.length > INLINE_THRESHOLD) {
    return false
  }

  return !fn.commands.some(command =>
    isRecursiveCommand(command.cmd, currentFn, namespace) ||
    isRecursiveCommand(command.cmd, fn.name, namespace)
  )
}

function inlineConditionalCalls(
  commands: IRCommand[],
  functions: Map<string, IRFunction>,
  currentFn: string,
  namespace: string
): IRCommand[] {
  const optimized: IRCommand[] = []

  for (const command of commands) {
    const match = command.cmd.match(/^(execute .+) run function ([^:]+):(.+)$/)
    if (!match || match[2] !== namespace) {
      optimized.push(command)
      continue
    }

    const target = functions.get(match[3])
    if (!isInlineableFunction(target, currentFn, namespace)) {
      optimized.push(command)
      continue
    }

    optimized.push({ cmd: match[1], label: command.label })
    optimized.push(...markConditional(target.commands))
  }

  return optimized
}

function invertExecuteCondition(command: string): string | null {
  if (command.startsWith('execute if ')) {
    return command.replace(/^execute if /, 'execute unless ')
  }
  if (command.startsWith('execute unless ')) {
    return command.replace(/^execute unless /, 'execute if ')
  }
  return null
}

function eliminateBranchVariables(
  commands: IRCommand[],
  functions: Map<string, IRFunction>,
  currentFn: string,
  namespace: string
): IRCommand[] {
  const optimized: IRCommand[] = []

  for (let i = 0; i < commands.length; i++) {
    const init = commands[i]
    const set = commands[i + 1]
    const thenCmd = commands[i + 2]
    const elseCmd = commands[i + 3]

    const initMatch = init?.cmd.match(/^scoreboard players set (\$[A-Za-z0-9_]+) rs 0$/)
    const setMatch = set?.cmd.match(/^((?:execute if|execute unless) .+) run scoreboard players set (\$[A-Za-z0-9_]+) rs 1$/)
    const thenMatch = thenCmd?.cmd.match(/^execute if score (\$[A-Za-z0-9_]+) rs matches 1\.\. run function [^:]+:(.+)$/)
    const elseMatch =
      elseCmd?.cmd.match(/^execute if score (\$[A-Za-z0-9_]+) rs matches ..0 run function [^:]+:(.+)$/) ??
      elseCmd?.cmd.match(/^execute unless score (\$[A-Za-z0-9_]+) rs matches 1\.\. run function [^:]+:(.+)$/)

    if (!initMatch || !setMatch || !thenMatch || !elseMatch) {
      optimized.push(init)
      continue
    }

    const branchVar = initMatch[1]
    if (setMatch[2] !== branchVar || thenMatch[1] !== branchVar || elseMatch[1] !== branchVar) {
      optimized.push(init)
      continue
    }

    const thenFn = functions.get(thenMatch[2])
    const elseFn = functions.get(elseMatch[2])
    if (!isInlineableFunction(thenFn, currentFn, namespace) || !isInlineableFunction(elseFn, currentFn, namespace)) {
      optimized.push(init)
      continue
    }

    const thenCondition = setMatch[1]
    const elseCondition = invertExecuteCondition(thenCondition)
    if (!elseCondition) {
      optimized.push(init)
      continue
    }

    optimized.push({ cmd: thenCondition })
    optimized.push(...markConditional(thenFn.commands))
    if (elseFn.commands.length > 0) {
      optimized.push({ cmd: elseCondition })
      optimized.push(...markConditional(elseFn.commands))
    }
    i += 3
  }

  return optimized
}

export function optimizeFunctionForStructure(
  fn: IRFunction,
  functions: Map<string, IRFunction>,
  namespace: string
): IRCommand[] {
  if (fn.blocks.length === 0) {
    return []
  }

  const linear = flattenBlock(fn, fn.blocks[0].label, namespace, new Set<string>())
  const branchEliminated = eliminateBranchVariables(linear, functions, fn.name, namespace)
  const inlined = inlineConditionalCalls(branchEliminated, functions, fn.name, namespace)
  return deadStoreEliminate(inlined)
}

export function optimizeForStructure(functions: IRFunction[], namespace = 'redscript'): IRFunction[] {
  return optimizeForStructureWithStats(functions, namespace).functions
}

export function optimizeForStructureWithStats(
  functions: IRFunction[],
  namespace = 'redscript'
): { functions: IRFunction[]; stats: OptimizationStats } {
  const staged = new Map(functions.map(fn => [fn.name, { ...fn }]))

  for (const fn of staged.values()) {
    fn.commands = flattenBlock(fn, fn.blocks[0]?.label ?? 'entry', namespace, new Set<string>())
  }

  for (const fn of staged.values()) {
    fn.commands = optimizeFunctionForStructure(fn, staged, namespace)
  }

  const optimizedCommands = optimizeCommandFunctions(
    Array.from(staged.values()).map(fn => ({
      name: fn.name,
      commands: fn.commands ?? [],
    }))
  )
  const stats = createEmptyOptimizationStats()
  mergeOptimizationStats(stats, optimizedCommands.stats)

  return {
    functions: Array.from(staged.values()).map(fn => ({
      ...fn,
      commands: optimizedCommands.functions.find(candidate => candidate.name === fn.name)?.commands ?? fn.commands,
    })),
    stats,
  }
}
