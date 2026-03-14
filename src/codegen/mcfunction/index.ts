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
 *   temporaries:          "$_0", "$_1", ...
 *   return value:         "$ret"
 *   parameters:           "$p0", "$p1", ...
 */

import type { IRBlock, IRFunction, IRInstr, IRModule, Operand, Terminator } from '../../ir/types'
import { optimizeCommandFunctions, type OptimizationStats, createEmptyOptimizationStats, mergeOptimizationStats } from '../../optimizer/commands'
import { EVENT_TYPES, isEventTypeName, type EventTypeName } from '../../events/types'
import { VarAllocator } from '../var-allocator'

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const OBJ = 'rs'  // scoreboard objective name

function operandToScore(op: Operand, alloc: VarAllocator): string {
  if (op.kind === 'var')   return `${alloc.alloc(op.name)} ${OBJ}`
  if (op.kind === 'const') return `${alloc.constant(op.value)} ${OBJ}`
  if (op.kind === 'param') return `${alloc.internal(`p${op.index}`)} ${OBJ}`
  throw new Error(`Cannot convert storage operand to score: ${op.path}`)
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

function emitInstr(instr: ReturnType<typeof Object.assign> & { op: string }, ns: string, alloc: VarAllocator): string[] {
  const lines: string[] = []

  switch (instr.op) {
    case 'assign': {
      const dst = alloc.alloc(instr.dst)
      const src = instr.src as Operand
      if (src.kind === 'const') {
        lines.push(`scoreboard players set ${dst} ${OBJ} ${src.value}`)
      } else if (src.kind === 'var') {
        lines.push(`scoreboard players operation ${dst} ${OBJ} = ${alloc.alloc(src.name)} ${OBJ}`)
      } else if (src.kind === 'param') {
        lines.push(`scoreboard players operation ${dst} ${OBJ} = ${alloc.internal(`p${src.index}`)} ${OBJ}`)
      } else {
        lines.push(`execute store result score ${dst} ${OBJ} run data get storage ${src.path}`)
      }
      break
    }

    case 'binop': {
      const dst = alloc.alloc(instr.dst)
      const bop = BOP_OP[instr.bop as string] ?? '+='
      // Copy lhs → dst, then apply op with rhs
      lines.push(...emitInstr({ op: 'assign', dst: instr.dst, src: instr.lhs }, ns, alloc))
      lines.push(`scoreboard players operation ${dst} ${OBJ} ${bop} ${operandToScore(instr.rhs, alloc)}`)
      break
    }

    case 'cmp': {
      // MC doesn't have a direct compare-to-register; use execute store
      const dst = alloc.alloc(instr.dst)
      const lhsScore = operandToScore(instr.lhs, alloc)
      const rhsScore = operandToScore(instr.rhs, alloc)
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
      // Push args into the internal parameter slots ($p0, $p1, ...).
      // We emit the copy commands directly (not via emitInstr/alloc.alloc) to
      // ensure the destination resolves to alloc.internal('p{i}') rather than
      // alloc.alloc('p{i}') which would create a *different* user-var slot.
      for (let i = 0; i < instr.args.length; i++) {
        const paramSlot = alloc.internal(`p${i}`)
        const arg = instr.args[i] as Operand
        if (arg.kind === 'const') {
          lines.push(`scoreboard players set ${paramSlot} ${OBJ} ${arg.value}`)
        } else if (arg.kind === 'var') {
          lines.push(`scoreboard players operation ${paramSlot} ${OBJ} = ${alloc.alloc(arg.name)} ${OBJ}`)
        } else if (arg.kind === 'param') {
          lines.push(`scoreboard players operation ${paramSlot} ${OBJ} = ${alloc.internal(`p${arg.index}`)} ${OBJ}`)
        }
        // storage args are rare for call sites; fall through to no-op
      }
      lines.push(`function ${ns}:${instr.fn}`)
      if (instr.dst) {
        const retSlot = alloc.internal('ret')
        lines.push(`scoreboard players operation ${alloc.alloc(instr.dst)} ${OBJ} = ${retSlot} ${OBJ}`)
      }
      break
    }

    case 'raw': {
      // resolveRaw rewrites $var tokens that are registered in the allocator
      // so that mangle=true mode produces correct mangled names instead of
      // the raw IR names embedded by the lowering phase.
      // \x01 is a sentinel for the MC macro line-start '$' (used by
      // storage_get_int sub-functions). Replace it last, after resolveRaw,
      // so '$execute' is never treated as a variable reference.
      const rawResolved = alloc.resolveRaw(instr.cmd as string).replace(/^\x01/, '$')
      lines.push(rawResolved)
      break
    }
  }

  return lines
}

// ---------------------------------------------------------------------------
// Terminator codegen
// ---------------------------------------------------------------------------

function emitTerm(term: Terminator, ns: string, fnName: string, alloc: VarAllocator): string[] {
  const lines: string[] = []
  switch (term.op) {
    case 'jump':
      lines.push(`function ${ns}:${fnName}/${term.target}`)
      break
    case 'jump_if':
      lines.push(`execute if score ${alloc.alloc(term.cond)} ${OBJ} matches 1.. run function ${ns}:${fnName}/${term.then}`)
      lines.push(`execute if score ${alloc.alloc(term.cond)} ${OBJ} matches ..0 run function ${ns}:${fnName}/${term.else_}`)
      break
    case 'jump_unless':
      lines.push(`execute if score ${alloc.alloc(term.cond)} ${OBJ} matches ..0 run function ${ns}:${fnName}/${term.then}`)
      lines.push(`execute if score ${alloc.alloc(term.cond)} ${OBJ} matches 1.. run function ${ns}:${fnName}/${term.else_}`)
      break
    case 'return': {
      // Emit the copy to the shared return slot directly — do NOT go through
      // emitInstr/alloc.alloc(retSlot) which would allocate a *user* var slot
      // (different from the internal slot) and break mangle mode.
      const retSlot = alloc.internal('ret')
      if (term.value) {
        if (term.value.kind === 'const') {
          lines.push(`scoreboard players set ${retSlot} ${OBJ} ${term.value.value}`)
        } else if (term.value.kind === 'var') {
          lines.push(`scoreboard players operation ${retSlot} ${OBJ} = ${alloc.alloc(term.value.name)} ${OBJ}`)
        } else if (term.value.kind === 'param') {
          lines.push(`scoreboard players operation ${retSlot} ${OBJ} = ${alloc.internal(`p${term.value.index}`)} ${OBJ}`)
        }
      }
      // MC 1.20+: use `return` to propagate the value back to the caller's
      // `execute store result … run function …` without an extra scoreboard read.
      if (term.value?.kind === 'const') {
        lines.push(`return ${term.value.value}`)
      } else if (term.value?.kind === 'var') {
        lines.push(`return run scoreboard players get ${alloc.alloc(term.value.name)} ${OBJ}`)
      } else if (term.value?.kind === 'param') {
        lines.push(`return run scoreboard players get ${alloc.internal(`p${term.value.index}`)} ${OBJ}`)
      }
      break
    }
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

  // Filter out files for functions that were removed (inlined trivial functions)
  const optimizedNames = new Set(optimized.functions.map(fn => fn.name))

  return {
    files: files
      .filter(file => {
        const functionName = toFunctionName(file)
        // Keep non-function files and functions that weren't removed
        return !functionName || optimizedNames.has(functionName)
      })
      .map(file => {
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
  sourceMap?: Record<string, string>
}

export interface DatapackGenerationOptions {
  optimizeCommands?: boolean
  mangle?: boolean
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

// ---------------------------------------------------------------------------
// Pre-allocation helpers for the two-pass mangle strategy
// ---------------------------------------------------------------------------

/** Register every variable referenced in an instruction with the allocator. */
function preAllocInstr(instr: IRInstr, alloc: VarAllocator): void {
  switch (instr.op) {
    case 'assign':
      alloc.alloc(instr.dst)
      if (instr.src.kind === 'var') alloc.alloc(instr.src.name)
      break
    case 'binop':
      alloc.alloc(instr.dst)
      if (instr.lhs.kind === 'var') alloc.alloc(instr.lhs.name)
      if (instr.rhs.kind === 'var') alloc.alloc(instr.rhs.name)
      break
    case 'cmp':
      alloc.alloc(instr.dst)
      if (instr.lhs.kind === 'var') alloc.alloc(instr.lhs.name)
      if (instr.rhs.kind === 'var') alloc.alloc(instr.rhs.name)
      break
    case 'call':
      for (const arg of instr.args) {
        if (arg.kind === 'var') alloc.alloc(arg.name)
      }
      if (instr.dst) alloc.alloc(instr.dst)
      break
    case 'raw':
      // Scan for $varname tokens and pre-register each one
      ;(instr.cmd as string).replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, (tok) => {
        alloc.alloc(tok)
        return tok
      })
      break
  }
}

/** Register every variable referenced in a terminator with the allocator. */
function preAllocTerm(term: Terminator, alloc: VarAllocator): void {
  switch (term.op) {
    case 'jump_if':
    case 'jump_unless':
      alloc.alloc(term.cond)
      break
    case 'return':
      if (term.value?.kind === 'var') alloc.alloc(term.value.name)
      break
  }
}

export function generateDatapackWithStats(
  module: IRModule,
  options: DatapackGenerationOptions = {},
): DatapackGenerationResult {
  const { optimizeCommands = true, mangle = false } = options
  const alloc = new VarAllocator(mangle)
  const files: DatapackFile[] = []
  const advancements: DatapackFile[] = []
  const ns = module.namespace

  // Collect all trigger handlers
  const triggerHandlers = module.functions.filter(fn => fn.isTriggerHandler && fn.triggerName)
  const triggerNames = new Set(triggerHandlers.map(fn => fn.triggerName!))
  const eventHandlers = module.functions.filter((fn): fn is IRFunction & { eventHandler: { eventType: EventTypeName; tag: string } } =>
    !!fn.eventHandler && isEventTypeName(fn.eventHandler.eventType)
  )
  const eventTypes = new Set<EventTypeName>(eventHandlers.map(fn => fn.eventHandler.eventType))

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
    loadLines.push(`scoreboard players set ${alloc.alloc(g.name)} ${OBJ} ${g.init}`)
  }

  // Add trigger objectives
  for (const triggerName of triggerNames) {
    loadLines.push(`scoreboard objectives add ${triggerName} trigger`)
    loadLines.push(`scoreboard players enable @a ${triggerName}`)
  }

  for (const eventType of eventTypes) {
    const detection = EVENT_TYPES[eventType].detection
    if (eventType === 'PlayerDeath') {
      loadLines.push('scoreboard objectives add rs.deaths deathCount')
    } else if (eventType === 'EntityKill') {
      loadLines.push('scoreboard objectives add rs.kills totalKillCount')
    } else if (eventType === 'ItemUse') {
      loadLines.push('# ItemUse detection requires a project-specific objective/tag setup')
    } else if (detection === 'tag' || detection === 'advancement') {
      loadLines.push(`# ${eventType} detection expects tag ${EVENT_TYPES[eventType].tag} to be set externally`)
    }
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

  // Collect all constants across all functions first (deduplicated)
  const allConsts = new Set<number>()
  for (const fn of module.functions) {
    for (const c of collectConsts(fn)) allConsts.add(c)
  }
  if (allConsts.size > 0) {
    loadLines.push(...Array.from(allConsts).sort((a, b) => a - b).map(
      value => `scoreboard players set ${alloc.constant(value)} ${OBJ} ${value}`
    ))
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Pre-allocation pass (mangle mode only)
  //
  // When mangle=true, the codegen assigns sequential names ($a, $b, …) the
  // FIRST time alloc.alloc() is called for a given variable.  Raw IR commands
  // embed variable names (e.g. "$_0") as plain strings; resolveRaw() can only
  // substitute them if the name was already registered in the allocator.
  //
  // Problem: a freshTemp ($\_0) used in a `raw` instruction and then in the
  // immediately following `assign` gets registered by the `assign` AFTER the
  // `raw` has already been emitted — so resolveRaw sees an unknown name and
  // passes it through verbatim ($\_0), while the assign emits a different
  // mangled slot ($e).  The two slots never meet and the value is lost.
  //
  // Fix: walk every instruction (and terminator) of every function in order
  // and call alloc.alloc() for each variable reference.  This registers all
  // names — with the same sequential order the main emit pass will encounter
  // them — so that resolveRaw() can always find the correct mangled name.
  // ─────────────────────────────────────────────────────────────────────────
  if (mangle) {
    for (const fn of module.functions) {
      // Register internals used by the calling convention
      for (let i = 0; i < fn.params.length; i++) alloc.internal(`p${i}`)
      alloc.internal('ret')

      for (const block of fn.blocks) {
        for (const instr of block.instrs) {
          preAllocInstr(instr as IRInstr, alloc)
        }
        preAllocTerm(block.term, alloc)
      }
    }
  }

  // Generate each function
  for (const fn of module.functions) {

    // Entry block → <fn_name>.mcfunction
    // Continuation blocks → <fn_name>/<label>.mcfunction
    for (let i = 0; i < fn.blocks.length; i++) {
      const block = fn.blocks[i]
      const lines: string[] = [`# block: ${block.label}`]

      // Param setup is now handled by the lowering IR itself via { kind: 'param' }
      // operands, so we no longer need a separate codegen param-copy loop here.
      // (Removing it prevents the double-assignment that caused mangle-mode collisions.)

      for (const instr of block.instrs) {
        lines.push(...emitInstr(instr as any, ns, alloc))
      }
      lines.push(...emitTerm(block.term, ns, fn.name, alloc))

      const filePath = i === 0
        ? `data/${ns}/function/${fn.name}.mcfunction`
        : `data/${ns}/function/${fn.name}/${block.label}.mcfunction`

      // Skip empty continuation blocks (only contain the block comment, no real commands)
      // Entry block (i === 0) is always emitted so the function file exists
      const hasRealContent = lines.some(l => !l.startsWith('#') && l.trim() !== '')
      if (i !== 0 && !hasRealContent) continue

      files.push({ path: filePath, content: lines.join('\n') })
    }
  }

  // Call @load functions and @requires-referenced load helpers from __load.
  // We collect them in a set to deduplicate (multiple fns might @requires the same dep).
  const loadCalls = new Set<string>()
  for (const fn of module.functions) {
    if (fn.isLoadInit) {
      loadCalls.add(fn.name)
    }
    // @requires: if this fn is compiled in, its required load-helpers must also run
    for (const dep of fn.requiredLoads ?? []) {
      loadCalls.add(dep)
    }
  }
  for (const name of loadCalls) {
    loadLines.push(`function ${ns}:${name}`)
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

  if (eventHandlers.length > 0) {
    tickLines.push('# Event checks')
    for (const eventType of eventTypes) {
      const tag = EVENT_TYPES[eventType].tag
      const handlers = eventHandlers.filter(fn => fn.eventHandler?.eventType === eventType)
      for (const handler of handlers) {
        tickLines.push(`execute as @a[tag=${tag}] run function ${ns}:${handler.name}`)
      }
      tickLines.push(`tag @a[tag=${tag}] remove ${tag}`)
    }
  }

  // Only generate __tick if there's something to run
  if (tickFunctionNames.length > 0 || triggerNames.size > 0 || eventHandlers.length > 0) {
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
  const sourceMap = mangle ? alloc.toSourceMap() : undefined

  if (!optimizeCommands) {
    return { files, advancements, stats, sourceMap }
  }

  const optimized = applyFunctionOptimization(files)
  mergeOptimizationStats(stats, optimized.stats)
  return { files: optimized.files, advancements, stats, sourceMap }
}

export function generateDatapack(module: IRModule): DatapackFile[] {
  const generated = generateDatapackWithStats(module)
  return [...generated.files, ...generated.advancements]
}
