/**
 * MIR (Mid-level IR) Types — Stage 3 of the RedScript compiler pipeline.
 *
 * MIR is a 3-address, explicit-CFG representation with versioned temporaries.
 * Every instruction produces at most one result into a fresh temporary.
 *
 * Spec: docs/compiler-pipeline-redesign.md § "MIR Instruction Set"
 */

// A temporary variable — unique within a function, named t0, t1, t2...
export type Temp = string

// Source location from the original .mcrs file
export interface SourceLoc {
  file: string
  line: number
  col: number
}

// An operand: either a temp or an inline constant
export type Operand =
  | { kind: 'temp'; name: Temp }
  | { kind: 'const'; value: number }

// A basic block identifier
export type BlockId = string

// Comparison operators (for cmp instruction)
export type CmpOp = 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'

// NBT value types (for nbt_write)
export type NBTType = 'int' | 'double' | 'float' | 'long' | 'short' | 'byte'

// ---------------------------------------------------------------------------
// Execute subcommands (used in call_context)
// ---------------------------------------------------------------------------

export type ExecuteSubcmd =
  | { kind: 'as'; selector: string }
  | { kind: 'at'; selector: string }
  | { kind: 'at_self' }
  | { kind: 'positioned'; x: string; y: string; z: string }
  | { kind: 'rotated'; yaw: string; pitch: string }
  | { kind: 'in'; dimension: string }
  | { kind: 'anchored'; anchor: 'eyes' | 'feet' }
  | { kind: 'if_score'; a: string; op: CmpOp; b: string }
  | { kind: 'unless_score'; a: string; op: CmpOp; b: string }
  | { kind: 'if_matches'; score: string; range: string }
  | { kind: 'unless_matches'; score: string; range: string }

// ---------------------------------------------------------------------------
// MIR Instructions
// ---------------------------------------------------------------------------

// Base type for all MIR instructions — carries optional source location
export type MIRInstrBase = { sourceLoc?: SourceLoc }

export type MIRInstr = MIRInstrBase & (
  // ── Constants & copies ──────────────────────────────────────────────────
  | { kind: 'const'; dst: Temp; value: number }
  | { kind: 'copy'; dst: Temp; src: Operand }

  // ── Integer arithmetic ──────────────────────────────────────────────────
  | { kind: 'add'; dst: Temp; a: Operand; b: Operand }
  | { kind: 'sub'; dst: Temp; a: Operand; b: Operand }
  | { kind: 'mul'; dst: Temp; a: Operand; b: Operand }
  | { kind: 'div'; dst: Temp; a: Operand; b: Operand }
  | { kind: 'mod'; dst: Temp; a: Operand; b: Operand }
  | { kind: 'pow'; dst: Temp; a: Operand; b: Operand }
  | { kind: 'neg'; dst: Temp; src: Operand }

  // ── Comparison (result is 0 or 1) ────────────────────────────────────────
  | { kind: 'cmp'; dst: Temp; op: CmpOp; a: Operand; b: Operand }
  | { kind: 'string_match'; dst: Temp; ns: string; path: string; value: string }

  // ── Boolean logic ────────────────────────────────────────────────────────
  | { kind: 'and'; dst: Temp; a: Operand; b: Operand }
  | { kind: 'or'; dst: Temp; a: Operand; b: Operand }
  | { kind: 'not'; dst: Temp; src: Operand }

  // ── NBT storage ──────────────────────────────────────────────────────────
  | { kind: 'nbt_read'; dst: Temp; ns: string; path: string; scale: number }
  | { kind: 'nbt_read_dynamic'; dst: Temp; ns: string; pathPrefix: string; indexSrc: Operand }
  | { kind: 'nbt_write'; ns: string; path: string; type: NBTType; scale: number; src: Operand }
  | { kind: 'nbt_write_dynamic'; ns: string; pathPrefix: string; indexSrc: Operand; valueSrc: Operand }
  | { kind: 'nbt_list_len'; dst: Temp; ns: string; path: string }

  // ── Vanilla scoreboard interop ────────────────────────────────────────────
  | { kind: 'score_read'; dst: Temp; player: string; obj: string }
  | { kind: 'score_write'; player: string; obj: string; src: Operand }

  // ── Function calls ────────────────────────────────────────────────────────
  | { kind: 'call'; dst: Temp | null; fn: string; args: Operand[] }
  | { kind: 'call_macro'; dst: Temp | null; fn: string; args: { name: string; value: Operand; type: NBTType; scale: number }[] }
  | { kind: 'call_context'; fn: string; subcommands: ExecuteSubcmd[] }

  // ── Terminators (exactly one per basic block, must be last) ──────────────
  | { kind: 'jump'; target: BlockId }
  | { kind: 'branch'; cond: Operand; then: BlockId; else: BlockId }
  | { kind: 'return'; value: Operand | null }
)

// ---------------------------------------------------------------------------
// Basic block and function structure
// ---------------------------------------------------------------------------

export interface MIRBlock {
  id: BlockId
  instrs: MIRInstr[]   // non-terminator instructions
  term: MIRInstr        // must be jump | branch | return
  preds: BlockId[]      // predecessor block ids (for dataflow)
}

export interface MIRFunction {
  name: string
  params: { name: Temp; isMacroParam: boolean }[]
  blocks: MIRBlock[]
  entry: BlockId         // entry block id (always 'entry')
  isMacro: boolean       // true if any param is a macro param
  sourceLoc?: SourceLoc
  sourceSnippet?: string
}

export interface MIRModule {
  functions: MIRFunction[]
  namespace: string
  objective: string      // scoreboard objective (default: __<namespace>)
  /** Set of fully-qualified function names marked @inline. */
  inlineFunctions?: Set<string>
  /** Set of fully-qualified function names marked @no-inline. */
  noInlineFunctions?: Set<string>
  /**
   * Set of function names that were auto-inlined and whose definitions should
   * still be emitted as separate .mcfunction files (so library callers work).
   */
  keepInOutput?: Set<string>
}
