/**
 * Stage 7 — LIR → .mcfunction Emission
 *
 * Converts a LIRModule into DatapackFile[] representing a Minecraft datapack.
 * Each LIRFunction becomes a .mcfunction file under data/<ns>/function/.
 */

import type { LIRModule, LIRFunction, LIRInstr, Slot, CmpOp, ExecuteSubcmd } from '../lir/types'
import { SourceMapBuilder, serializeSourceMap, sourceMapPath } from './sourcemap'

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
      const lines = emitFunctionWithSourceMap(fn, namespace, objective, builder)
      files.push({ path: fnPath, content: lines.join('\n') + '\n' })
      const map = builder.build()
      if (map) {
        files.push({ path: sourceMapPath(fnPath), content: serializeSourceMap(map) })
      }
    } else {
      const lines = emitFunction(fn, namespace, objective)
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

  return files
}

// ---------------------------------------------------------------------------
// Function emission
// ---------------------------------------------------------------------------

function emitFunction(fn: LIRFunction, namespace: string, objective: string): string[] {
  const lines: string[] = []
  for (const instr of fn.instructions) {
    lines.push(emitInstr(instr, namespace, objective))
  }
  return lines
}

function emitFunctionWithSourceMap(
  fn: LIRFunction,
  namespace: string,
  objective: string,
  builder: SourceMapBuilder,
): string[] {
  const lines: string[] = []
  for (const instr of fn.instructions) {
    lines.push(emitInstr(instr, namespace, objective))
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

function emitInstr(instr: LIRInstr, ns: string, obj: string): string {
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
      return `execute store result score ${slot(instr.dst)} run ${emitInstr(instr.cmd, ns, obj)}`

    case 'store_score_to_nbt':
      return `execute store result storage ${instr.ns} ${instr.path} ${instr.type} ${instr.scale} run scoreboard players get ${slot(instr.src)}`

    case 'store_nbt_to_score':
      return `execute store result score ${slot(instr.dst)} run data get storage ${instr.ns} ${instr.path} ${instr.scale}`

    case 'nbt_set_literal':
      return `data modify storage ${instr.ns} ${instr.path} set value ${instr.value}`

    case 'nbt_copy':
      return `data modify storage ${instr.dstNs} ${instr.dstPath} set from storage ${instr.srcNs} ${instr.srcPath}`

    case 'call':
      return `function ${instr.fn}`

    case 'call_macro':
      return `function ${instr.fn} with storage ${instr.storage}`

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
      return `execute ${subcmds} run function ${instr.fn}`
    }

    case 'return_value':
      return `scoreboard players operation $ret ${instr.slot.obj} = ${slot(instr.slot)}`

    case 'macro_line':
      return `$${instr.template}`

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
