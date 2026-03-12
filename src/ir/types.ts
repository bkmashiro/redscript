/**
 * RedScript IR — Three-Address Code (TAC)
 *
 * Compilation pipeline:
 *   Source → AST → IR → (optimize) → CodeGen → mcfunction / cmdblock
 *
 * Variable storage in MC Java Edition:
 *   - Integer vars  → scoreboard fake player  ($name on objective "rs_vars")
 *   - Complex data  → NBT storage             (redscript:stack / redscript:heap)
 *   - Return value  → fake player $ret
 *   - Temporaries   → $t0, $t1, ...
 */

// ---------------------------------------------------------------------------
// Operands
// ---------------------------------------------------------------------------

export type Operand =
  | { kind: 'var';     name: string }        // scoreboard fake player
  | { kind: 'const';   value: number }       // integer literal
  | { kind: 'storage'; path: string }        // NBT storage path (e.g. "redscript:heap data.x")

// ---------------------------------------------------------------------------
// Binary operators (all map to `scoreboard players operation`)
// ---------------------------------------------------------------------------

export type BinOp = '+' | '-' | '*' | '/' | '%'
export type CmpOp = '==' | '!=' | '<' | '<=' | '>' | '>='

// ---------------------------------------------------------------------------
// IR Instructions
// ---------------------------------------------------------------------------

export type IRInstr =
  // x = src
  | { op: 'assign';    dst: string; src: Operand }

  // dst = lhs bop rhs
  | { op: 'binop';     dst: string; lhs: Operand; bop: BinOp; rhs: Operand }

  // dst = (lhs cop rhs) ? 1 : 0
  | { op: 'cmp';       dst: string; lhs: Operand; cop: CmpOp; rhs: Operand }

  // goto label
  | { op: 'jump';      target: string }

  // if cond != 0 goto target
  | { op: 'jump_if';   cond: string; target: string }

  // if cond == 0 goto target
  | { op: 'jump_unless'; cond: string; target: string }

  // dst = fn(args)
  | { op: 'call';      fn: string; args: Operand[]; dst?: string }

  // return value (optional)
  | { op: 'return';    value?: Operand }

  // label declaration (block entry point)
  | { op: 'label';     id: string }

  // raw MC command passthrough (escape hatch)
  | { op: 'raw';       cmd: string }

  // wait one game tick (command block target only)
  // maps to: schedule function <continuation> 1t replace
  | { op: 'tick_yield' }

// ---------------------------------------------------------------------------
// Basic Block — straight-line code, ends with a terminator
// ---------------------------------------------------------------------------

export type Terminator =
  | { op: 'jump';        target: string }
  | { op: 'jump_if';     cond: string; then: string; else_: string }
  | { op: 'jump_unless'; cond: string; then: string; else_: string }
  | { op: 'return';      value?: Operand }
  | { op: 'tick_yield';  continuation: string }

export interface IRBlock {
  label: string
  instrs: IRInstr[]       // non-terminator instructions
  term: Terminator
}

export interface IRCommand {
  cmd: string
  conditional?: boolean
  label?: string
}

// ---------------------------------------------------------------------------
// Function
// ---------------------------------------------------------------------------

export interface IRFunction {
  name: string
  params: string[]         // parameter names (passed via fake players)
  locals: string[]         // all local variable names
  blocks: IRBlock[]        // blocks[0] = entry block
  commands?: IRCommand[]   // structure target command stream
  isTickLoop?: boolean     // true → Repeat command block (runs every tick)
  isTriggerHandler?: boolean  // true → handles a trigger event
  triggerName?: string        // the trigger objective name
  eventTrigger?: {
    kind: 'advancement' | 'craft' | 'death' | 'login' | 'join_team'
    value?: string
  }
}

// ---------------------------------------------------------------------------
// Module — top-level compilation unit
// ---------------------------------------------------------------------------

export interface IRModule {
  namespace: string        // datapack namespace (e.g. "mypack")
  functions: IRFunction[]
  globals: string[]        // global variable names
}
