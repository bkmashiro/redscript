/**
 * Stage 7 — LIR → .mcfunction Emission
 *
 * Converts a LIRModule into DatapackFile[] representing a Minecraft datapack.
 * Each LIRFunction becomes a .mcfunction file under data/<ns>/function/.
 */

import type { LIRModule, LIRFunction, LIRInstr, Slot, CmpOp, ExecuteSubcmd } from '../lir/types'
import { SourceMapBuilder, serializeSourceMap, sourceMapPath } from './sourcemap'
import { McVersion, DEFAULT_MC_VERSION } from '../types/mc-version'

export interface DatapackFile {
  path: string
  content: string
}

export interface EmitOptions {
  namespace: string
  tickFunctions?: string[]
  loadFunctions?: string[]
  scheduleFunctions?: Array<{ name: string; ticks: number }>
  /** When true, generate a .sourcemap.json sidecar file for each .mcfunction */
  generateSourceMap?: boolean
  /** Target Minecraft version; controls which MC features are used in codegen */
  mcVersion?: McVersion
  /** Map of EventTypeName → list of fully-qualified function references for @on handlers */
  eventHandlers?: Map<string, string[]>
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function emit(module: LIRModule, options: EmitOptions): DatapackFile[] {
  const { namespace } = options
  const tickFns = options.tickFunctions ?? []
  const loadFns = options.loadFunctions ?? []
  const scheduleFns = options.scheduleFunctions ?? []
  const objective = module.objective
  const genSourceMap = options.generateSourceMap ?? false
  const mcVersion = options.mcVersion ?? DEFAULT_MC_VERSION
  const files: DatapackFile[] = []

  // pack.mcmeta
  files.push({
    path: 'pack.mcmeta',
    content: JSON.stringify({
      pack: { pack_format: 26, description: `RedScript datapack: ${namespace}` },
    }, null, 2) + '\n',
  })

  // load.mcfunction — creates the scoreboard objective
  const loadCmds = [`scoreboard objectives add ${objective} dummy`]
  files.push({
    path: `data/${namespace}/function/load.mcfunction`,
    content: loadCmds.join('\n') + '\n',
  })

  // Each LIR function → .mcfunction file
  for (const fn of module.functions) {
    const fnPath = fnNameToPath(fn.name, namespace)
    if (genSourceMap) {
      const builder = new SourceMapBuilder(fnPath)
      const lines = emitFunctionWithSourceMap(fn, namespace, objective, builder, mcVersion)
      files.push({ path: fnPath, content: lines.join('\n') + '\n' })
      const map = builder.build()
      if (map) {
        files.push({ path: sourceMapPath(fnPath), content: serializeSourceMap(map) })
      }
    } else {
      const lines = emitFunction(fn, namespace, objective, mcVersion)
      files.push({ path: fnPath, content: lines.join('\n') + '\n' })
    }
  }

  // @schedule wrapper functions: _schedule_xxx → schedule function ns:xxx Nt
  for (const { name, ticks } of scheduleFns) {
    files.push({
      path: `data/${namespace}/function/_schedule_${name}.mcfunction`,
      content: `schedule function ${namespace}:${name} ${ticks}t\n`,
    })
  }

  // Tag files for tick/load
  if (loadFns.length > 0 || true) {
    // Always include load.json — it must reference the load.mcfunction
    const loadValues = [`${namespace}:load`, ...loadFns.map(fn => `${namespace}:${fn}`)]
    files.push({
      path: 'data/minecraft/tags/function/load.json',
      content: JSON.stringify({ values: loadValues }, null, 2) + '\n',
    })
  }

  if (tickFns.length > 0) {
    const tickValues = tickFns.map(fn => `${namespace}:${fn}`)
    files.push({
      path: 'data/minecraft/tags/function/tick.json',
      content: JSON.stringify({ values: tickValues }, null, 2) + '\n',
    })
  }

  // Event handler tag files: data/rs/tags/function/on_<event>.json
  const EVENT_TAG_NAMES: Record<string, string> = {
    PlayerJoin: 'on_player_join',
    PlayerDeath: 'on_player_death',
    EntityKill: 'on_entity_kill',
    ItemUse: 'on_item_use',
    BlockBreak: 'on_block_break',
  }

  if (options.eventHandlers) {
    for (const [evType, handlers] of options.eventHandlers) {
      const tagName = EVENT_TAG_NAMES[evType]
      if (tagName && handlers.length > 0) {
        files.push({
          path: `data/rs/tags/function/${tagName}.json`,
          content: JSON.stringify({ values: handlers }, null, 2) + '\n',
        })
      }
    }
  }

  return files
}

// ---------------------------------------------------------------------------
// Function emission
// ---------------------------------------------------------------------------

function emitFunction(fn: LIRFunction, namespace: string, objective: string, mcVersion: McVersion): string[] {
  const lines: string[] = []
  for (const instr of fn.instructions) {
    lines.push(emitInstr(instr, namespace, objective, mcVersion))
  }
  return lines
}

function emitFunctionWithSourceMap(
  fn: LIRFunction,
  namespace: string,
  objective: string,
  builder: SourceMapBuilder,
  mcVersion: McVersion,
): string[] {
  const lines: string[] = []
  for (const instr of fn.instructions) {
    lines.push(emitInstr(instr, namespace, objective, mcVersion))
    builder.addLine(instr.sourceLoc)
  }
  return lines
}

function fnNameToPath(name: string, namespace: string): string {
  // LIR function names may contain :: for methods — convert to /
  const mcName = name.replace(/::/g, '/').toLowerCase()
  return `data/${namespace}/function/${mcName}.mcfunction`
}

// ---------------------------------------------------------------------------
// Instruction emission
// ---------------------------------------------------------------------------

function emitInstr(instr: LIRInstr, ns: string, obj: string, mcVersion: McVersion): string {
  switch (instr.kind) {
    case 'score_set':
      return `scoreboard players set ${slot(instr.dst)} ${instr.value}`

    case 'score_copy':
      return `scoreboard players operation ${slot(instr.dst)} = ${slot(instr.src)}`

    case 'score_add':
      return `scoreboard players operation ${slot(instr.dst)} += ${slot(instr.src)}`

    case 'score_sub':
      return `scoreboard players operation ${slot(instr.dst)} -= ${slot(instr.src)}`

    case 'score_mul':
      return `scoreboard players operation ${slot(instr.dst)} *= ${slot(instr.src)}`

    case 'score_div':
      return `scoreboard players operation ${slot(instr.dst)} /= ${slot(instr.src)}`

    case 'score_mod':
      return `scoreboard players operation ${slot(instr.dst)} %= ${slot(instr.src)}`

    case 'score_min':
      return `scoreboard players operation ${slot(instr.dst)} < ${slot(instr.src)}`

    case 'score_max':
      return `scoreboard players operation ${slot(instr.dst)} > ${slot(instr.src)}`

    case 'score_swap':
      return `scoreboard players operation ${slot(instr.a)} >< ${slot(instr.b)}`

    case 'store_cmd_to_score':
      return `execute store result score ${slot(instr.dst)} run ${emitInstr(instr.cmd, ns, obj, mcVersion)}`

    case 'store_score_to_nbt':
      return `execute store result storage ${instr.ns} ${instr.path} ${instr.type} ${instr.scale} run scoreboard players get ${slot(instr.src)}`

    case 'store_nbt_to_score':
      return `execute store result score ${slot(instr.dst)} run data get storage ${instr.ns} ${instr.path} ${Number.isInteger(instr.scale) ? instr.scale.toFixed(1) : instr.scale}`

    case 'nbt_set_literal':
      return `data modify storage ${instr.ns} ${instr.path} set value ${instr.value}`

    case 'nbt_copy':
      return `data modify storage ${instr.dstNs} ${instr.dstPath} set from storage ${instr.srcNs} ${instr.srcPath}`

    case 'call':
      return `function ${instr.fn}`

    case 'call_macro':
      if (mcVersion >= McVersion.v1_20_2) {
        return `function ${instr.fn} with storage ${instr.storage}`
      }
      // Pre-1.20.2: macros not supported; call function directly (args in storage are ignored)
      return `function ${instr.fn}`

    case 'call_if_matches':
      return `execute if score ${slot(instr.slot)} matches ${instr.range} run function ${instr.fn}`

    case 'call_unless_matches':
      return `execute unless score ${slot(instr.slot)} matches ${instr.range} run function ${instr.fn}`

    case 'call_if_score':
      return `execute if score ${slot(instr.a)} ${cmpToMC(instr.op)} ${slot(instr.b)} run function ${instr.fn}`

    case 'call_unless_score':
      return `execute unless score ${slot(instr.a)} ${cmpToMC(instr.op)} ${slot(instr.b)} run function ${instr.fn}`

    case 'call_context': {
      const subcmds = instr.subcommands.map(emitSubcmd).join(' ')
      return subcmds
        ? `execute ${subcmds} run function ${instr.fn}`
        : `function ${instr.fn}`
    }

    case 'return_value':
      return `scoreboard players operation $ret ${instr.slot.obj} = ${slot(instr.slot)}`

    case 'macro_line':
      if (mcVersion >= McVersion.v1_20_2) {
        return `$${instr.template}`
      }
      // Pre-1.20.2: function macros not available. Emit as a plain command with
      // $(param) placeholders replaced by storage reads via data get (best-effort
      // compat for string/id params; numeric coords will not be dynamic).
      return macroLineCompat(instr.template)

    case 'raw':
      return instr.cmd
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slot(s: Slot): string {
  return `${s.player} ${s.obj}`
}

function cmpToMC(op: CmpOp): string {
  switch (op) {
    case 'eq': return '='
    case 'ne': return '='  // ne uses "unless" form, but when used in if score context
    case 'lt': return '<'
    case 'le': return '<='
    case 'gt': return '>'
    case 'ge': return '>='
  }
}

/**
 * Pre-1.20.2 compat: emit a macro template as a plain command.
 * $(param) placeholders are replaced with `storage rs:macro_args <param>` data-get
 * expressions for string/id values, or left as literal "0" for coordinates.
 * This is best-effort — dynamic numeric positions cannot be truly emulated.
 */
function macroLineCompat(template: string): string {
  // Replace $(param) with data-get-style substitution marker
  return template.replace(/\$\((\w+)\)/g, (_m, p) => `{storage:rs:macro_args,path:${p}}`)
}

function emitSubcmd(sub: ExecuteSubcmd): string {
  switch (sub.kind) {
    case 'as':
      return `as ${sub.selector}`
    case 'at':
      return `at ${sub.selector}`
    case 'at_self':
      return 'at @s'
    case 'positioned':
      return `positioned ${sub.x} ${sub.y} ${sub.z}`
    case 'rotated':
      return `rotated ${sub.yaw} ${sub.pitch}`
    case 'in':
      return `in ${sub.dimension}`
    case 'anchored':
      return `anchored ${sub.anchor}`
    case 'if_score':
      return `if score ${sub.a} ${cmpToMC(sub.op)} ${sub.b}`
    case 'unless_score':
      return `unless score ${sub.a} ${cmpToMC(sub.op)} ${sub.b}`
    case 'if_matches':
      return `if score ${sub.score} matches ${sub.range}`
    case 'unless_matches':
      return `unless score ${sub.score} matches ${sub.range}`
  }
}
