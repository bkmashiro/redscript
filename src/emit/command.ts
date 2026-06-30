import { SCORE_INT_MIN, type CmpOp, type ExecuteSubcmd, type LIRInstr, type Slot } from '../lir/types'
import { McVersion } from '../types/mc-version'

/**
 * Emit a single LIR instruction as a raw MC command string.
 *
 * This is the core dispatch table for the emitter: each `LIRInstr` variant maps
 * to one (or occasionally two, for version-gated variants) MC command strings.
 *
 * @param instr - The LIR instruction to emit.
 * @param ns - Datapack namespace used for function references.
 * @param obj - Scoreboard objective for temporary score slots.
 * @param mcVersion - Target MC version; gates macro and other version-specific syntax.
 * @returns A single raw MC command (no trailing newline).
 */
export function emitInstr(instr: LIRInstr, ns: string, obj: string, mcVersion: McVersion): string {
  switch (instr.kind) {
    case 'score_set':
      return `scoreboard players set ${slot(instr.dst)} ${instr.value}`

    case 'score_delta':
      if (instr.value === 0) {
        return ''
      }
      if (instr.value < 0) {
        if (instr.value === SCORE_INT_MIN) {
          throw new Error('score_delta value -2147483648 is not emit-safe as a single remove immediate')
        }
        return `scoreboard players remove ${slot(instr.dst)} ${-instr.value}`
      }
      return `scoreboard players add ${slot(instr.dst)} ${instr.value}`

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
      throw new Error('Minecraft function macros require target Minecraft 1.20.2 or newer')

    case 'call_if_matches':
      return `execute if score ${slot(instr.slot)} matches ${instr.range} run function ${instr.fn}`

    case 'call_unless_matches':
      return `execute unless score ${slot(instr.slot)} matches ${instr.range} run function ${instr.fn}`

    case 'call_if_score':
      return `execute ${scoreCondition('if', instr.op, slot(instr.a), slot(instr.b))} run function ${instr.fn}`

    case 'call_unless_score':
      return `execute ${scoreCondition('unless', instr.op, slot(instr.a), slot(instr.b))} run function ${instr.fn}`

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
      throw new Error('Minecraft function macros require target Minecraft 1.20.2 or newer')

    case 'raw':
      return instr.cmd
  }
}

/**
 * Render a {@link Slot} as the `<player> <objective>` pair used by scoreboard commands.
 *
 * @param s - The slot to render.
 * @returns String of the form `"<player> <objective>"`.
 */
export function slot(s: Slot): string {
  return `${s.player} ${s.obj}`
}

function sameSlot(a: Slot, b: Slot): boolean {
  return a.player === b.player && a.obj === b.obj
}

export function isEmitterNoOp(instr: LIRInstr): boolean {
  return (
    (instr.kind === 'score_copy' && sameSlot(instr.dst, instr.src)) ||
    (instr.kind === 'score_delta' && instr.value === 0)
  )
}

/**
 * Map a {@link CmpOp} to its MC `scoreboard players operation` operator token.
 *
 * Note: `ne` maps to `=` because the "not-equal" sense is expressed by the
 * surrounding `unless score` subcommand, not by the operator itself.
 *
 * @param op - Abstract comparison operator from LIR.
 * @returns MC operator string (`"="`, `"<"`, `"<="`, `">"`, or `">="`).
 */
export function cmpToMC(op: CmpOp): string {
  switch (op) {
    case 'eq': return '='
    case 'ne': return '='
    case 'lt': return '<'
    case 'le': return '<='
    case 'gt': return '>'
    case 'ge': return '>='
  }
}

/**
 * Emit a score condition fragment, e.g. "if score $a obj = $b obj".
 *
 * MC has no "!=" operator; not-equal is expressed by flipping the if/unless
 * keyword and using "=" as the operator:
 *   a != b  ->  unless score a = b
 *   a == b  ->  if score a = b
 *
 * The `sense` parameter is the caller's intended polarity ('if' or 'unless').
 * For 'ne', both the sense and operator are adjusted automatically.
 */
export function scoreCondition(sense: 'if' | 'unless', op: CmpOp, a: string, b: string): string {
  if (op === 'ne') {
    const flipped = sense === 'if' ? 'unless' : 'if'
    return `${flipped} score ${a} = ${b}`
  }
  return `${sense} score ${a} ${cmpToMC(op)} ${b}`
}

/**
 * Flatten nested execute-if chains into a single execute with multiple conditions.
 *
 * MC allows chaining conditions:
 *   execute if A run execute if B run X
 * can be written as:
 *   execute if A if B run X
 *
 * This reduces command-parsing overhead and improves TPS.
 *
 * Rules:
 * - Only merges when the inner `run` clause is itself `execute if ...`
 * - Does NOT merge `if ... run execute unless ...` because semantics differ.
 * - Recursively flattens deeper nesting.
 */
export function flattenExecute(cmd: string): string {
  const RUN_EXECUTE_IF = / run execute if /
  if (!RUN_EXECUTE_IF.test(cmd)) {
    return cmd
  }

  const idx = cmd.indexOf(' run execute if ')
  if (idx === -1) return cmd

  const outer = cmd.slice(0, idx)
  const inner = cmd.slice(idx + ' run '.length)

  if (!outer.startsWith('execute ')) return cmd

  const innerWithoutExecute = inner.slice('execute '.length)
  const merged = `${outer} ${innerWithoutExecute}`

  return flattenExecute(merged)
}

/**
 * Render a single {@link ExecuteSubcmd} as the MC subcommand fragment it represents.
 *
 * The returned string is joined with spaces and prefixed with `execute` by
 * the `call_context` branch of {@link emitInstr}.
 *
 * @param sub - The execute subcommand variant to render.
 * @returns Fragment string, e.g. `"as @e[type=zombie]"` or `"if score $x obj = $y obj"`.
 */
export function emitSubcmd(sub: ExecuteSubcmd): string {
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
      return scoreCondition('if', sub.op, sub.a, sub.b)
    case 'unless_score':
      return scoreCondition('unless', sub.op, sub.a, sub.b)
    case 'if_matches':
      return `if score ${sub.score} matches ${sub.range}`
    case 'unless_matches':
      return `unless score ${sub.score} matches ${sub.range}`
  }
}
