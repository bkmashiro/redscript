/**
 * LIR (Low-level IR) Types — Stage 5 of the RedScript compiler pipeline.
 *
 * LIR is 2-address, MC-specific, typed nodes — no raw strings.
 * Each LIR instruction maps 1:1 (or near) to one MC command.
 *
 * Spec: docs/compiler-pipeline-redesign.md § "LIR Instruction Set"
 */

import type { CmpOp, NBTType, ExecuteSubcmd, SourceLoc } from '../mir/types'

// A scoreboard slot: fake-player name + objective
export interface Slot {
  player: string
  obj: string
}

// Re-export types used in LIR from MIR
export type { CmpOp, NBTType, ExecuteSubcmd, SourceLoc }

// ---------------------------------------------------------------------------
// LIR Instructions
// ---------------------------------------------------------------------------

// Base type for all LIR instructions — carries optional source location
export type LIRInstrBase = { sourceLoc?: SourceLoc }

export type LIRInstr = LIRInstrBase & (
  // ── Scoreboard ───────────────────────────────────────────────────────────
  | { kind: 'score_set'; dst: Slot; value: number }
  // scoreboard players set <dst.player> <dst.obj> value

  | { kind: 'score_copy'; dst: Slot; src: Slot }
  // scoreboard players operation <dst> = <src>

  | { kind: 'score_add'; dst: Slot; src: Slot }   // +=
  | { kind: 'score_sub'; dst: Slot; src: Slot }   // -=
  | { kind: 'score_mul'; dst: Slot; src: Slot }   // *=
  | { kind: 'score_div'; dst: Slot; src: Slot }   // /=
  | { kind: 'score_mod'; dst: Slot; src: Slot }   // %=
  | { kind: 'score_min'; dst: Slot; src: Slot }   // < (min)
  | { kind: 'score_max'; dst: Slot; src: Slot }   // > (max)
  | { kind: 'score_swap'; a: Slot; b: Slot }      // ><

  // ── Execute store ────────────────────────────────────────────────────────
  | { kind: 'store_cmd_to_score'; dst: Slot; cmd: LIRInstr }
  // execute store result score <dst> run <cmd>

  | { kind: 'store_score_to_nbt';
      ns: string; path: string; type: NBTType; scale: number;
      src: Slot }
  // execute store result storage <ns> <path> <type> <scale> run scoreboard players get <src>

  | { kind: 'store_nbt_to_score';
      dst: Slot; ns: string; path: string; scale: number }
  // execute store result score <dst> run data get storage <ns> <path> <scale>

  // ── NBT ──────────────────────────────────────────────────────────────────
  | { kind: 'nbt_set_literal'; ns: string; path: string; value: string }
  // data modify storage <ns> <path> set value <value>

  | { kind: 'nbt_copy'; srcNs: string; srcPath: string; dstNs: string; dstPath: string }
  // data modify storage <dstNs> <dstPath> set from storage <srcNs> <srcPath>

  // ── Control flow ─────────────────────────────────────────────────────────
  | { kind: 'call'; fn: string }
  // function <fn>

  | { kind: 'call_macro'; fn: string; storage: string }
  // function <fn> with storage <storage>

  | { kind: 'call_if_matches'; fn: string; slot: Slot; range: string }
  // execute if score <slot> matches <range> run function <fn>

  | { kind: 'call_unless_matches'; fn: string; slot: Slot; range: string }

  | { kind: 'call_if_score'; fn: string; a: Slot; op: CmpOp; b: Slot }
  // execute if score <a> <op> <b> run function <fn>

  | { kind: 'call_unless_score'; fn: string; a: Slot; op: CmpOp; b: Slot }

  | { kind: 'call_context'; fn: string; subcommands: ExecuteSubcmd[] }
  // execute [subcommands] run function <fn>

  | { kind: 'return_value'; slot: Slot }
  // scoreboard players operation $ret <obj> = <slot>  (then implicit return)

  // ── Macro line ────────────────────────────────────────────────────────────
  | { kind: 'macro_line'; template: string }
  // A line starting with $ in a macro function.
  // template uses $(param) substitutions

  // ── Arbitrary MC command ─────────────────────────────────────────────────
  | { kind: 'raw'; cmd: string }
  // Emitted verbatim. Use sparingly — prefer typed instructions.
)

// ---------------------------------------------------------------------------
// LIR function and module structure
// ---------------------------------------------------------------------------

export interface LIRFunction {
  name: string
  instructions: LIRInstr[]    // flat list (no blocks; control flow is via call_if_*)
  isMacro: boolean
  macroParams: string[]       // names of $(param) substitution keys
  sourceLoc?: SourceLoc
  sourceSnippet?: string
}

export interface LIRModule {
  functions: LIRFunction[]
  namespace: string
  objective: string
}
