/**
 * Code generator: IR → mcfunction datapack
 *
 * Output structure:
 *   <namespace>/
 *     functions/
 *       <fn_name>.mcfunction
 *       <fn_name>/<block_label>.mcfunction   (for control-flow continuations)
 *     load.mcfunction     (objective setup)
 *
 * Variable mapping:
 *   scoreboard objective: "rs"
 *   fake player:          "$<varname>"
 *   temporaries:          "$t0", "$t1", ...
 *   return value:         "$ret"
 *   parameters:           "$p0", "$p1", ...
 */

import type { IRBlock, IRFunction, IRModule, Operand, Terminator } from '../../ir/types'
import { optimizeCommandFunctions, type OptimizationStats, createEmptyOptimizationStats, mergeOptimizationStats } from '../../optimizer/commands'

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const OBJ = 'rs'  // scoreboard objective name

function varRef(name: string): string {
  // Ensure fake player prefix
  return name.startsWith('$') ? name : `$${name}`
}

function operandToScore(op: Operand): string {
  if (op.kind === 'var')   return `${varRef(op.name)} ${OBJ}`
  if (op.kind === 'const') return `$const_${op.value} ${OBJ}`
  throw new Error(`Cannot convert storage operand to score: ${op.path}`)
}

function constSetup(value: number): string {
  return `scoreboard players set $const_${value} ${OBJ} ${value}`
}

// Collect all constants used in a function for pre-setup
function collectConsts(fn: IRFunction): Set<number> {
  const consts = new Set<number>()
  for (const block of fn.blocks) {
    for (const instr of block.instrs) {
      if (instr.op === 'assign' && instr.src.kind === 'const') consts.add(instr.src.value)
      if (instr.op === 'binop') {
        if (instr.lhs.kind === 'const') consts.add(instr.lhs.value)
        if (instr.rhs.kind === 'const') consts.add(instr.rhs.value)
      }
      if (instr.op === 'cmp') {
        if (instr.lhs.kind === 'const') consts.add(instr.lhs.value)
        if (instr.rhs.kind === 'const') consts.add(instr.rhs.value)
      }
    }
    const t = block.term
    if (t.op === 'return' && t.value?.kind === 'const') consts.add(t.value.value)
  }
  return consts
}

// MC scoreboard operation suffix
const BOP_OP: Record<string, string> = {
  '+': '+=', '-': '-=', '*': '*=', '/': '/=', '%': '%=',
}

// ---------------------------------------------------------------------------
// Instruction codegen
// ---------------------------------------------------------------------------

function emitInstr(instr: ReturnType<typeof Object.assign> & { op: string }, ns: string): string[] {
  const lines: string[] = []

  switch (instr.op) {
    case 'assign': {
      const dst = varRef(instr.dst)
      const src = instr.src as Operand
      if (src.kind === 'const') {
        lines.push(`scoreboard players set ${dst} ${OBJ} ${src.value}`)
      } else if (src.kind === 'var') {
        lines.push(`scoreboard players operation ${dst} ${OBJ} = ${varRef(src.name)} ${OBJ}`)
      } else {
        lines.push(`execute store result score ${dst} ${OBJ} run data get storage ${src.path}`)
      }
      break
    }

    case 'binop': {
      const dst = varRef(instr.dst)
      const bop = BOP_OP[instr.bop as string] ?? '+='
      // Copy lhs → dst, then apply op with rhs
      lines.push(...emitInstr({ op: 'assign', dst: instr.dst, src: instr.lhs }, ns))
      lines.push(`scoreboard players operation ${dst} ${OBJ} ${bop} ${operandToScore(instr.rhs)}`)
      break
    }

    case 'cmp': {
      // MC doesn't have a direct compare-to-register; use execute store
      const dst = varRef(instr.dst)
      const lhsScore = operandToScore(instr.lhs)
      const rhsScore = operandToScore(instr.rhs)
      lines.push(`scoreboard players set ${dst} ${OBJ} 0`)
      switch (instr.cop) {
        case '==':
          lines.push(`execute if score ${lhsScore} = ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`)
          break
        case '!=':
          lines.push(`execute unless score ${lhsScore} = ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`)
          break
        case '<':
          lines.push(`execute if score ${lhsScore} < ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`)
          break
        case '<=':
          lines.push(`execute if score ${lhsScore} <= ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`)
          break
        case '>':
          lines.push(`execute if score ${lhsScore} > ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`)
          break
        case '>=':
          lines.push(`execute if score ${lhsScore} >= ${rhsScore} run scoreboard players set ${dst} ${OBJ} 1`)
          break
      }
      break
    }

    case 'call': {
      // Push args as fake players $p0, $p1, ...
      for (let i = 0; i < instr.args.length; i++) {
        lines.push(...emitInstr({ op: 'assign', dst: `$p${i}`, src: instr.args[i] }, ns))
      }
      lines.push(`function ${ns}:${instr.fn}`)
      if (instr.dst) {
        lines.push(`scoreboard players operation ${varRef(instr.dst)} ${OBJ} = $ret ${OBJ}`)
      }
      break
    }

    case 'raw':
      lines.push(instr.cmd as string)
      break
  }

  return lines
}

// ---------------------------------------------------------------------------
// Terminator codegen
// ---------------------------------------------------------------------------

function emitTerm(term: Terminator, ns: string, fnName: string): string[] {
  const lines: string[] = []
  switch (term.op) {
    case 'jump':
      lines.push(`function ${ns}:${fnName}/${term.target}`)
      break
    case 'jump_if':
      lines.push(`execute if score ${varRef(term.cond)} ${OBJ} matches 1.. run function ${ns}:${fnName}/${term.then}`)
      lines.push(`execute if score ${varRef(term.cond)} ${OBJ} matches ..0 run function ${ns}:${fnName}/${term.else_}`)
      break
    case 'jump_unless':
      lines.push(`execute if score ${varRef(term.cond)} ${OBJ} matches ..0 run function ${ns}:${fnName}/${term.then}`)
      lines.push(`execute if score ${varRef(term.cond)} ${OBJ} matches 1.. run function ${ns}:${fnName}/${term.else_}`)
      break
    case 'return':
      if (term.value) {
        lines.push(...emitInstr({ op: 'assign', dst: '$ret', src: term.value }, ns))
      }
      // In MC 1.20+, use `return` command
      if (term.value?.kind === 'const') {
        lines.push(`return ${term.value.value}`)
      } else if (term.value?.kind === 'var') {
        lines.push(`return run scoreboard players get ${varRef(term.value.name)} ${OBJ}`)
      }
      break
    case 'tick_yield':
      lines.push(`schedule function ${ns}:${fnName}/${term.continuation} 1t replace`)
      break
  }
  return lines
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DatapackFile {
  path: string    // relative to datapack root, e.g. "data/mypack/functions/add.mcfunction"
  content: string
}

function toFunctionName(file: DatapackFile): string | null {
  const match = file.path.match(/^data\/[^/]+\/function\/(.+)\.mcfunction$/)
  return match?.[1] ?? null
}

function applyFunctionOptimization(
  files: DatapackFile[],
): { files: DatapackFile[]; stats: OptimizationStats } {
  const functionFiles = files
    .map(file => {
      const functionName = toFunctionName(file)
      if (!functionName) return null
      const commands = file.content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line !== '' && !line.startsWith('#'))
        .map(cmd => ({ cmd }))
      return { file, functionName, commands }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  const optimized = optimizeCommandFunctions(functionFiles.map(entry => ({
    name: entry.functionName,
    commands: entry.commands,
  })))
  const commandMap = new Map(optimized.functions.map(fn => [fn.name, fn.commands]))

  return {
    files: files.map(file => {
    const functionName = toFunctionName(file)
    if (!functionName) return file
    const commands = commandMap.get(functionName)
    if (!commands) return file
    const lines = file.content.split('\n')
    const header = lines.filter(line => line.trim().startsWith('#'))
    return {
      ...file,
      content: [...header, ...commands.map(command => command.cmd)].join('\n'),
    }
    }),
    stats: optimized.stats,
  }
}

export interface DatapackGenerationResult {
  files: DatapackFile[]
  advancements: DatapackFile[]
  stats: OptimizationStats
}

export interface DatapackGenerationOptions {
  optimizeCommands?: boolean
}

export function countMcfunctionCommands(files: DatapackFile[]): number {
  return files.reduce((sum, file) => {
    if (!toFunctionName(file)) {
      return sum
    }

    return sum + file.content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line !== '' && !line.startsWith('#'))
      .length
  }, 0)
}

export function generateDatapackWithStats(
  module: IRModule,
  options: DatapackGenerationOptions = {},
): DatapackGenerationResult {
  const { optimizeCommands = true } = options
  const files: DatapackFile[] = []
  const advancements: DatapackFile[] = []
  const ns = module.namespace

  // Collect all trigger handlers
  const triggerHandlers = module.functions.filter(fn => fn.isTriggerHandler && fn.triggerName)
  const triggerNames = new Set(triggerHandlers.map(fn => fn.triggerName!))

  // Collect all tick functions
  const tickFunctionNames: string[] = []
  for (const fn of module.functions) {
    if (fn.isTickLoop) {
      tickFunctionNames.push(fn.name)
    }
  }

  // pack.mcmeta
  files.push({
    path: 'pack.mcmeta',
    content: JSON.stringify({
      pack: { pack_format: 26, description: `${ns} datapack — compiled by redscript` }
    }, null, 2),
  })

  // __load.mcfunction — create scoreboard objective + trigger registrations
  const loadLines = [
    `# RedScript runtime init`,
    `scoreboard objectives add ${OBJ} dummy`,
  ]
  for (const g of module.globals) {
    loadLines.push(`scoreboard players set ${varRef(g)} ${OBJ} 0`)
  }

  // Add trigger objectives
  for (const triggerName of triggerNames) {
    loadLines.push(`scoreboard objectives add ${triggerName} trigger`)
    loadLines.push(`scoreboard players enable @a ${triggerName}`)
  }

  // Generate trigger dispatch functions
  for (const triggerName of triggerNames) {
    const handlers = triggerHandlers.filter(fn => fn.triggerName === triggerName)

    // __trigger_{name}_dispatch.mcfunction
    const dispatchLines = [
      `# Trigger dispatch for ${triggerName}`,
    ]
    for (const handler of handlers) {
      dispatchLines.push(`function ${ns}:${handler.name}`)
    }
    dispatchLines.push(`scoreboard players set @s ${triggerName} 0`)
    dispatchLines.push(`scoreboard players enable @s ${triggerName}`)

    files.push({
      path: `data/${ns}/function/__trigger_${triggerName}_dispatch.mcfunction`,
      content: dispatchLines.join('\n'),
    })
  }

  // Generate each function (and collect constants for load)
  for (const fn of module.functions) {
    // Constant setup — place constants in __load.mcfunction
    const consts = collectConsts(fn)
    if (consts.size > 0) {
      loadLines.push(...Array.from(consts).map(constSetup))
    }

    // Entry block → <fn_name>.mcfunction
    // Continuation blocks → <fn_name>/<label>.mcfunction
    for (let i = 0; i < fn.blocks.length; i++) {
      const block = fn.blocks[i]
      const lines: string[] = [`# block: ${block.label}`]

      // Param setup in entry block
      if (i === 0) {
        for (let j = 0; j < fn.params.length; j++) {
          lines.push(`scoreboard players operation ${varRef(fn.params[j])} ${OBJ} = $p${j} ${OBJ}`)
        }
      }

      for (const instr of block.instrs) {
        lines.push(...emitInstr(instr as any, ns))
      }
      lines.push(...emitTerm(block.term, ns, fn.name))

      const filePath = i === 0
        ? `data/${ns}/function/${fn.name}.mcfunction`
        : `data/${ns}/function/${fn.name}/${block.label}.mcfunction`

      files.push({ path: filePath, content: lines.join('\n') })
    }
  }

  // Write __load.mcfunction
  files.push({
    path: `data/${ns}/function/__load.mcfunction`,
    content: loadLines.join('\n'),
  })

  // minecraft:load tag pointing to __load
  files.push({
    path: `data/minecraft/tags/function/load.json`,
    content: JSON.stringify({ values: [`${ns}:__load`] }, null, 2),
  })

  // __tick.mcfunction — calls all @tick functions + trigger check
  const tickLines = ['# RedScript tick dispatcher']
  
  // Call all @tick functions
  for (const fnName of tickFunctionNames) {
    tickLines.push(`function ${ns}:${fnName}`)
  }
  
  // Call trigger check if there are triggers
  if (triggerNames.size > 0) {
    tickLines.push(`# Trigger checks`)
    for (const triggerName of triggerNames) {
      tickLines.push(`execute as @a[scores={${triggerName}=1..}] run function ${ns}:__trigger_${triggerName}_dispatch`)
    }
  }

  // Only generate __tick if there's something to run
  if (tickFunctionNames.length > 0 || triggerNames.size > 0) {
    files.push({
      path: `data/${ns}/function/__tick.mcfunction`,
      content: tickLines.join('\n'),
    })

    // minecraft:tick tag pointing to __tick
    files.push({
      path: `data/minecraft/tags/function/tick.json`,
      content: JSON.stringify({ values: [`${ns}:__tick`] }, null, 2),
    })
  }

  for (const fn of module.functions) {
    const eventTrigger = fn.eventTrigger
    if (!eventTrigger) {
      continue
    }

    let path = ''
    let criteria: Record<string, unknown> = {}

    switch (eventTrigger.kind) {
      case 'advancement':
        path = `data/${ns}/advancements/on_advancement_${fn.name}.json`
        criteria = {
          trigger: {
            trigger: `minecraft:${eventTrigger.value}`,
          },
        }
        break
      case 'craft':
        path = `data/${ns}/advancements/on_craft_${fn.name}.json`
        criteria = {
          crafted: {
            trigger: 'minecraft:inventory_changed',
            conditions: {
              items: [
                {
                  items: [eventTrigger.value],
                },
              ],
            },
          },
        }
        break
      case 'death':
        path = `data/${ns}/advancements/on_death_${fn.name}.json`
        criteria = {
          death: {
            trigger: 'minecraft:entity_killed_player',
          },
        }
        break
      case 'login':
      case 'join_team':
        continue
    }

    advancements.push({
      path,
      content: JSON.stringify({
        criteria,
        rewards: {
          function: `${ns}:${fn.name}`,
        },
      }, null, 2),
    })
  }

  const stats = createEmptyOptimizationStats()
  if (!optimizeCommands) {
    return { files, advancements, stats }
  }

  const optimized = applyFunctionOptimization(files)
  mergeOptimizationStats(stats, optimized.stats)
  return { files: optimized.files, advancements, stats }
}

export function generateDatapack(module: IRModule): DatapackFile[] {
  const generated = generateDatapackWithStats(module)
  return [...generated.files, ...generated.advancements]
}
