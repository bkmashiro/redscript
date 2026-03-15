# RedScript Compiler Pipeline Redesign

> Status: **planned** — target next major refactor cycle  
> Written: 2026-03-15

---

## Motivation

The current compiler is a single-pass lowering that goes roughly  
`Parser → AST → IR (2-address) → MCFunction`.  
It works, but has accumulated tech debt that makes further optimizations fragile:

- IR is 2-address, which complicates use-def analysis and CSE
- "Optimization" and "lowering" are interleaved in the same pass
- Macro handling, builtin dispatch, and control-flow lowering all happen together
- Adding a new optimization often requires touching 3+ files

The plan below separates concerns cleanly into 7 stages.

---

## Stage 1 — Frontend: Parser → AST

**Responsibilities:** source text → well-formed typed syntax tree

- Lexing / parsing (already solid)
- Name resolution (resolve identifiers to their declarations)
- Type checking (infer and check all expression types)
- Scope analysis (closures, shadowing, struct fields)

**Output:** a fully type-annotated AST where every node carries its type.

No desugaring here. Keep AST faithful to source.

---

## Stage 2 — AST → HIR  *(High-level IR)*

**Goal:** eliminate syntax sugar; keep structured control flow.

Transforms applied:

| Source construct | HIR form |
|---|---|
| `for (init; cond; step)` | `while` loop with explicit init/step |
| `a += b` | `a = a + b` (or dedicated `Op` node) |
| `let x = complex_expr` | declaration + separate assignment |
| `a && b` | `if a { b } else { false }` |
| `a \|\| b` | `if a { true } else { b }` |
| `cond ? a : b` | `if cond { a } else { b }` |
| comma expressions | sequential statements |
| `foreach` | explicit iterator variable + while |

HIR is still **structured** (no gotos, no basic blocks yet).  
All types are known; all names are resolved.

---

## Stage 3 — HIR → MIR  *(Mid-level IR, 3-address CFG)*

**Goal:** structured control flow → explicit Control Flow Graph (CFG).

- Introduce basic blocks with explicit predecessors/successors
- Introduce unlimited fresh temporaries
- **3-address form**: every instruction has at most one operation

```
# MIR example
t1 = add a, b
t2 = mul t1, c
x  = mov t2
```

Why 3-address (not 2-address like the current IR)?

- Use-def chains are trivial to build
- CSE: identical RHS expressions are immediately comparable
- Constant propagation: single definition per temp makes dataflow simple
- Expression reordering: no aliasing through the destination

Control flow:
- `if` → conditional branch + merge block
- `while` → loop header + body + exit
- `return` → explicit jump to exit block
- `break`/`continue` → explicit jumps

---

## Stage 4 — MIR Optimization Passes

Run on the 3-address CFG. Passes are composable and independent.

### Required (correctness + baseline perf)

| Pass | Description |
|---|---|
| **Constant folding** | `t = add 3, 4` → `t = 7` |
| **Constant propagation** | replace uses of single-def consts with the value |
| **Copy propagation** | `x = mov y; ... use x` → `... use y` |
| **Dead code elimination** | remove defs with no live uses |
| **Unreachable block elimination** | remove blocks with no predecessors |
| **Block merging** | merge unconditional-jump-only block chains |
| **Branch simplification** | `if true` / `if false` → unconditional jump |

### High value (significantly smaller output)

| Pass | Description |
|---|---|
| **Liveness analysis** | compute live sets for all blocks (required by DCE + alloc) |
| **Temp coalescing** | merge non-interfering temporaries (reduces slots) |
| **Destination forwarding** | `t = op a, b; x = mov t` → `x = op a, b` when t dead |
| **Local CSE** | eliminate repeated identical subexpressions within a block |
| **Small function inlining** | inline trivial callee bodies at call site |

---

## Stage 5 — MIR → LIR  *(Low-level IR, Minecraft-friendly)*

**Goal:** abstract operations → Minecraft scoreboard semantics.

This is where 3-address gets translated to 2-address **with awareness of  
the destination-reuse pattern** that MC scoreboard requires.

```
# MIR (3-address)
t1 = add a, b
t2 = add t1, c
x  = mov t2

# LIR output (when t1, t2 not live after)
ScoreCopy x, a
ScoreAdd  x, b
ScoreAdd  x, c
```

Key decisions made here:

- Which values live in scoreboards vs NBT storage
- How to represent `execute`-chained subcommands
- Macro parameter injection points
- `$(param)` substitution for dynamic coordinates

This stage should be *target-specific* but not yet emitting strings.  
LIR instructions are typed MC operations, not raw text.

---

## Stage 6 — LIR Optimization

Backend-specific optimizations that only make sense post-lowering:

| Pass | Description |
|---|---|
| **Scoreboard slot allocation** | minimize number of distinct objective slots used |
| **`execute` context extraction** | hoist repeated `execute as @p at @s` prefixes |
| **`execute` chain merging** | `execute A run execute B run cmd` → `execute A B run cmd` |
| **Guard block merging** | merge adjacent `execute if score ... matches` guards |
| **NBT/score carrier selection** | decide when to spill to storage vs keep in score |
| **Peephole** | local pattern rewrites (e.g. `op X = X` → nop) |
| **Command deduplication** | remove identical adjacent commands |
| **Function inlining / outlining** | inline trivial functions; outline repeated sequences |
| **Block layout** | order blocks to minimize `function` call overhead |

---

## Stage 7 — Emission

**Goal:** LIR → `.mcfunction` files on disk.

- Assign each LIR block to a `namespace:path/block_name` function
- Emit `function` calls for control flow edges
- Generate `load.mcfunction`: objective creation, storage init, const table
- Generate `tick.mcfunction`: `@tick`-annotated function dispatch
- Emit call graph in dependency order
- Write sourcemap (IR name → file:line for diagnostics)

---

## Summary

```
Source
  │
  ▼ Stage 1
 AST (typed, name-resolved)
  │
  ▼ Stage 2
 HIR (desugared, structured)
  │
  ▼ Stage 3
 MIR (3-address CFG)
  │
  ▼ Stage 4
 MIR' (optimized)
  │
  ▼ Stage 5
 LIR (MC-friendly 2-address)
  │
  ▼ Stage 6
 LIR' (backend-optimized)
  │
  ▼ Stage 7
 .mcfunction files
```

The key insight: **optimization-friendly representation (Stage 4) and  
target-friendly representation (Stage 6) are separate**. Trying to do  
both at once is why the current IR is hard to extend.

---

## Migration Notes

- Current `src/lowering/index.ts` = Stage 2 + 3 + 5 merged → split into three
- Current `src/optimizer/` = partial Stage 4, operating on 2-address → rewrite around 3-address MIR
- Current `src/codegen/` = Stage 6 + 7 merged → split at the LIR boundary
- Current `src/ir/` = needs 3-address extension or replacement
- Tests: keep end-to-end `.mcrs → .mcfunction` tests as regression suite; add unit tests per stage

---

*This document was drafted to guide the next major refactor. Details may change during implementation.*

---

## Tech Stack & Infrastructure Decisions

### Language: stay in TypeScript

The MC target is too domain-specific for a general backend (LLVM, Cranelift, QBE)
to add value. The compilation workload is also small enough (functions are
typically < 100 MIR instructions) that performance is not a concern.
TS gives good type safety for IR node types and is already the existing codebase.

### SSA: no, use versioned temporaries

| | SSA | Versioned temps |
|---|---|---|
| Constant prop | trivial one-pass | fixed-point iteration needed |
| DCE | trivial | single backward sweep |
| Copy prop | trivial | one extra level of indirection |
| Construction | dominator tree + φ-insertion | trivial, just increment a counter |
| Deconstruction | must run before LIR | N/A |

For function bodies in the 20–200 instruction range with no complex loop
induction variable analysis, versioned temps are sufficient. SSA complexity
is not justified at this scale.

### Pass framework: nanopass style

Each optimization pass should be a pure function:

```typescript
type Pass = (module: MIRModule) => MIRModule
```

- No mutation of shared global state
- Can be verified with `verifyMIR(module)` between passes
- Pipeline is just an array of passes: `const pipeline: Pass[] = [constantFold, copyProp, dce, ...]`
- Easy to toggle a pass for debugging
- Easy to add `before/after` IR dumps per pass

Current code mixes optimization and lowering in the same methods.
The nanopass shape forces separation.

### What to reuse from the current codebase

| Module | Verdict | Notes |
|---|---|---|
| `src/parser/` | **keep as-is** | solid, already produces typed AST |
| `src/lexer/` | **keep as-is** | —  |
| `src/runtime/` | **keep as-is** | MC runtime simulator used in tests |
| `src/__tests__/` | **keep e2e tests** | regression suite covering `.mcrs → .mcfunction` |
| `src/optimizer/passes.ts` | **port logic, rewrite impl** | copy the *idea*, not the regex machinery |
| `src/optimizer/commands.ts` | **discard** | regex-based command matching, replace with typed LIR |
| `src/ir/` | **replace** | extend with 3-address form and explicit CFG |
| `src/lowering/` | **split into Stage 2+3+5** | 3,500-line file doing too many things |
| `src/codegen/` | **split into Stage 6+7** | keep emission logic, rebuild on new LIR |

---

## Current Architecture (as of v1.2.x)

Knowing what we have makes migration planning concrete.

```
src/
  lexer/index.ts         Tokenizer
  parser/index.ts        Recursive-descent parser → AST
  lowering/index.ts      AST → IR  (3,500 lines; Stages 2+3+5 merged)
  ir/index.ts            IR types: IRModule, IRFunction, IRBlock, IRInstr
  optimizer/
    passes.ts            Optimization passes on 2-addr IR
    commands.ts          Regex-based command analysis (OBJ pattern etc.)
    structure.ts         Structural analysis helpers
  codegen/
    mcfunction/index.ts  IR → .mcfunction text files
  compile.ts             Top-level compile() entry point
  cli.ts                 CLI wrapper
  runtime/index.ts       MCRuntime: scoreboard + storage simulator for tests
  stdlib/
    math.mcrs            sin/cos/sqrt tables + trig, 91-entry lookup
    vec.mcrs             2D/3D vector ops using fixed-point
    advanced.mcrs        smoothstep, smootherstep, clamp, etc.
    bigint.mcrs          8-limb base-10000 BigInt
    timer.mcrs           single-instance Timer (tick countdown)
```

The IR is 2-address:

```
x = a      (copy)
x += b     (in-place add)
x *= c     (in-place mul)
```

Arithmetic sequences are modeled as chains of in-place updates on a single
destination, which obscures the value-dependency graph and complicates CSE.

Optimization passes operate on `IRInstr` objects that contain raw MC command
strings. Several passes (copy propagation, CSE, block merge) parse those strings
with regular expressions to extract slot names and objective names, which is
fragile and tightly coupled to the objective naming scheme.

---

## Lessons Learned / Design Pitfalls

These are real bugs or design limitations that shaped the current codebase.
The redesign should address all of them.

### 1. Global mutable objective name state

**Problem:** The scoreboard objective name (`rs`, then `__namespace`) is stored
in a module-level mutable variable. To support multiple datapacks in one process,
we had to add `setScoreboardObjective()`, `setOptimizerObjective()`,
`setStructureObjective()` — three separate setters across three files.
The optimizer's regex patterns also had to be regenerated dynamically.

**Root cause:** objective name was a constant baked into every pass.

**Fix in redesign:** Pass a `CompileContext` record through the entire pipeline.
No global state.

---

### 2. Optimizer regex matching on command strings

**Problem:** Copy propagation, CSE, and block merge all pattern-match on raw
MC command text like `"scoreboard players operation $x rs = $y rs"`.
When the objective name changed from `rs` to `__namespace`, every regex had
to be updated. When the regex didn't account for a case (e.g. `$x rs 0`),
the pass silently failed.

**Root cause:** IR instructions are strings, not typed nodes.

**Fix in redesign:** LIR instructions are typed (e.g. `ScoreCopy`, `ScoreAdd`).
Passes pattern-match on structured nodes, not strings.

---

### 3. Lowering, desugaring, and macro detection all in one pass

**Problem:** `src/lowering/index.ts` is 3,500 lines that simultaneously:
- Desugar `for`/`+=`/ternary
- Build basic blocks and terminators
- Handle builtin dispatch (particle, setblock, tp, ...)
- Detect macro parameters and rewrite coordinates as `$(param)`
- Manage function specialization for stdlib callbacks
- Track struct fields and impl method dispatch

Adding any new feature requires understanding all of this at once.

**Fix in redesign:** Each of these is a separate stage.

---

### 4. `\x01` sentinel for macro line prefix

**Problem:** When a builtin command needed a `$` prefix for MC macro syntax
(e.g. `$particle ... ^$(px) ...`), the lowering used a literal `$` prefix.
The codegen's `resolveRaw()` then saw `$particle` and allocated a fresh
temporary named `particle`, replacing the `$` prefix with `$v` (or whatever
the temp was allocated as). The particle command silently became `$v minecraft:end_rod ...`
which MC ignored.

**Root cause:** The `$var` variable reference syntax and the MC macro `$` line
prefix shared the same sigil in raw command strings.

**Fix applied:** Use `\x01` as sentinel in IR; codegen converts `\x01` → `$`
after variable resolution.

**Fix in redesign:** Typed LIR instruction `MacroParticle { ... }` — no raw
string parsing needed.

---

### 5. Cross-function variable name collision

**Problem:** Two functions `foo` and `bar` could each declare a variable `x`,
both getting lowered to scoreboard slot `$x`. If both were inlined or called
in the same tick context, they shared the slot.

**Fix applied:** IR variable names are scoped as `$fnname_varname`.

**Fix in redesign:** 3-address MIR uses globally-unique temporaries (counter-based).
Slot allocation is a separate explicit pass.

---

### 6. `mc_name` early-return bypassed `#rs` resolution

**Problem:** In `exprToScoreboardObjective`, the handler for `mc_name` returned
`expr.value` directly, bypassing the `#rs → LOWERING_OBJ` special case.
All timer stdlib tests that used `#rs` as the objective were matching the
literal string `"rs"` instead of the namespace-specific objective.

**Root cause:** Early-return before the special-case check.

**Fix applied:** Check `value === 'rs'` before the early return.

**Fix in redesign:** Objective references should be a first-class IR type,
not a string that might be the literal `"rs"` or the special token `"rs"`.

---

### 7. Timer is single-instance

**Problem:** `timer.mcrs` stores tick count and active state on fake players
`timer_ticks` and `timer_active`. All Timer instances share the same player,
so only one Timer can be active at a time.

**Root cause:** No per-instance storage mechanism. The `_id` field was stubbed
but never implemented.

**Path forward:** Per-instance state needs either:
- Named fake player per instance: `timer_1_ticks`, `timer_2_ticks`, ...  (requires macro `$-prefixed scoreboard` commands)
- NBT array slot per instance (same pattern as BigInt limbs)

---

### 8. `^varname` not supported in lexer until v1.2.x

**Problem:** `^px` (local coordinate with variable offset) was lexed as two
tokens: `^` (local_coord) + `px` (ident). The parser then failed with
"Expected ')' but got 'ident'".

Only `~varname` (relative coordinate) supported variable names.
This made the macro-based dynamic particle positioning impossible to write.

**Fix applied:** Lexer now reads `^identifier` as a single `local_coord` token.

**Fix in redesign:** `^varname` and `~varname` should be unified as
`LocalCoord(varname | number)` and `RelCoord(varname | number)` in the AST.

---

### 9. sin_fixed is a lookup table, and that is correct

Not a pitfall — a deliberate constraint.

MC scoreboards support only 32-bit integer arithmetic (add, sub, mul, div, mod).
There is no trigonometric instruction. Taylor series (`sin x = x - x³/6 + ...`)
overflows INT32 by the third term in fixed-point ×1000 representation.
CORDIC requires ~20 integer iterations per call.

A 91-entry table (0°–90° with quadrant symmetry) gives exact 1° resolution
in O(1) and is the standard approach on integer-only platforms (GBA BIOS,
early DSP chips, NDS).

**Implication for redesign:** The `sin_fixed` table pattern (initialized at
`@load`, read via storage array indexing + macros) is a first-class language
pattern, not a hack. The stdlib should keep it.

---

### 10. Datapack objective collision (the `rs` problem)

**Problem:** All compiled datapacks shared a single scoreboard objective named
`rs`. Two datapacks in the same world had their mangle tables collide — the
`$a rs` slot meant different things in each datapack's load function.

**Fix applied:** Default objective is now `__<namespace>` (double-underscore
prefix, following the `__load`/`__tick` convention).

**Fix in redesign:** `CompileContext` carries the objective name. No global.

---

## Language Design: TypeScript Syntax, Custom Frontend

### Should we reuse the TypeScript frontend (tsc / ts-morph)?

**No.** The core RedScript syntax is not valid TypeScript:

```redscript
foreach (p in @a[tag=foo, limit=1]) at @s {
    particle("end_rod", ^0, ^0, ^5, 0.02, 0.02, 0.02, 0, 10);
}
kill(@e[tag=screen]);
```

`@a[tag=foo]` is not a valid TS expression (confused with array-access on a
decorator). `^5` / `~-3` are not valid TS expressions. `at @s {}` does not
exist. Encoding these as valid TS trades the language for a verbose API:

```typescript
// not the goal
forEach(selector('@a', { tag: 'foo', limit: 1 }), (p) =>
  atSelf(p, () => particle('end_rod', localCoord(0, 0, 5), ...)));
```

If we have to write that, RedScript provides no value. Keep the custom parser.

### Should we reuse TypeScript's type checker (tsc)?

**No.** RedScript only needs a small subset of TypeScript's type system:

| Feature | TypeScript | RedScript needs |
|---|---|---|
| Primitive types | `number`, `string`, `boolean`, `symbol`, `bigint`... | `int`, `bool`, `string`, `float` |
| Compound | union, intersection, conditional, mapped, template literal | `struct`, `enum`, `T[]` |
| MC-specific | — | `selector<T>`, `BlockPos`, `void` |
| Generics | higher-kinded, infer, conditional | simple `T<U>` instantiation |
| Complexity | Turing-complete type system | intentionally simple |

Embedding tsc's type checker means inheriting `never`, `unknown`, conditional
types, `infer`, mapped types — none of which are useful on the MC target. A
lightweight structural type checker custom-built for the above set is smaller,
faster, and easier to extend with MC-specific rules.

### What to borrow from TypeScript (syntax conventions only)

Keep the source syntax **familiar to TypeScript developers** without binding to tsc:

```redscript
// These match TypeScript conventions — keep them
let x: int = 0;
const MAX: int = 100;
fn add(a: int, b: int): int { return a + b; }
struct Vec2 { x: int; y: int; }
impl Vec2 {
    fn length(self): int { ... }
}
type Callback = (x: int) => void;  // function type syntax
```

```redscript
// MC-specific extensions — keep them as-is, do not force into TS grammar
@tick fn _update() { ... }              // decorator-style annotation
foreach (p in @a[tag=foo]) at @s { }   // MC selector iteration
let s: selector<entity> = @e[...];     // generic selector type
kill(@e[tag=screen]);                   // MC command as builtin call
particle("end_rod", ^px, ^py, ^5, ...) // caret/tilde coordinates
```

The rule: **syntax form follows TypeScript; semantics follow Minecraft.**

### IDE support: implement LSP, not a tsc plugin

For real IntelliSense (completions, hover types, go-to-definition), the correct
path is a Language Server Protocol implementation:

```
redscript-lsp
  ├── parse .mcrs → typed AST
  ├── type inference + error diagnostics
  ├── completions: builtin names, selector attributes, struct fields
  ├── hover: type info, MC command documentation
  └── go-to-definition: cross-file symbol resolution
```

LSP decouples the language server from the editor: VS Code, Neovim, Helix,
Zed, and any LSP-capable editor get support from one implementation.
A tsc plugin would be harder, VS Code-only, and still require all the same
semantic analysis.


---

## MC Compilation Target: Computational Commands

This section covers the MC commands that actually participate in computation —
not side-effect commands like `particle`, `summon`, `say`, `playsound`, etc.
Every operation in the IR must ultimately map to one or more of these.

### Scoreboard: the "CPU registers" of MC

Scoreboard objectives hold named fake-player slots, each storing one INT32.
This is the primary computational medium.

```
# Initialization
scoreboard objectives add <obj> dummy

# Write constant
scoreboard players set <fake_player> <obj> <value>

# Copy
scoreboard players operation $dst <obj> = $src <obj>

# Arithmetic (all in-place, 2-address)
scoreboard players operation $dst <obj> += $src <obj>   # add
scoreboard players operation $dst <obj> -= $src <obj>   # sub
scoreboard players operation $dst <obj> *= $src <obj>   # mul
scoreboard players operation $dst <obj> /= $src <obj>   # integer div (truncates toward zero)
scoreboard players operation $dst <obj> %= $src <obj>   # mod (sign follows dividend)

# Min / max
scoreboard players operation $dst <obj> < $src <obj>    # dst = min(dst, src)
scoreboard players operation $dst <obj> > $src <obj>    # dst = max(dst, src)

# Swap
scoreboard players operation $a <obj> >< $b <obj>
```

**Constraints:**
- INT32 only. No float, no 64-bit.
- Division is truncated toward zero (Java `int` semantics).
- No bitwise operations. XOR/AND/OR must be emulated with arithmetic.
- No comparison that produces a value — comparisons only appear in `execute if score`.

### `execute store result score` — bridge from commands to scores

Captures the integer result of a command into a score slot:

```
execute store result score $dst <obj> run <command>
```

Used for:
- Reading entity NBT: `run data get entity @s Health 1`
- Reading storage: `run data get storage <ns> <path> <scale>`
- Capturing command success: `execute store success score $dst <obj> run ...`
- Returning from a function: `run function <ns>:<fn>` (captures `return` value)

### `execute if/unless score` — the only conditional

All control flow in the compiled output is expressed with score comparisons:

```
# Range check (most common — if score matches an integer range)
execute if score $x <obj> matches <N>           run function <ns>:then_block
execute if score $x <obj> matches <N>..<M>      run function <ns>:range_block
execute if score $x <obj> matches ..<N>         run function <ns>:le_block

# Two-operand comparison
execute if     score $a <obj> = $b <obj>        run ...   # a == b
execute if     score $a <obj> < $b <obj>        run ...   # a < b
execute unless score $a <obj> = $b <obj>        run ...   # a != b
```

**Why `matches` vs two-operand:**
- `matches N..` is cheaper than `= $const` (no extra fake-player needed).
- `matches 1..` is the canonical boolean-true check.
- Two-operand form needed for dynamic comparisons (`a < b` where both vary).

### NBT Storage: heap memory

NBT storage (`data storage <ns>:<path>`) is the only persistent structured
memory available. It holds typed NBT values (int, double, string, list, compound).

```
# Write literal
data modify storage <ns> <path> set value <nbt_literal>

# Copy between paths
data modify storage <ns> <dst_path> set from storage <ns> <src_path>

# Read into score (with optional scale factor)
execute store result score $dst <obj> run data get storage <ns> <path> 1

# Write score into storage (with scale: useful for float conversion)
execute store result storage <ns> <path> int    1     run scoreboard players get $src <obj>
execute store result storage <ns> <path> double 0.01  run scoreboard players get $src <obj>
# → stores (score × 0.01) as a double; e.g. score=975 → NBT 9.75d
```

**Scale factor:**
The `<scale>` in `data get` / `execute store result storage` is a multiplier
applied on read/write. This is the only way to convert between integer scores
and fractional NBT values (used for float-coordinate macro parameters).

### Array indexing via NBT

Static index (compile-time constant):

```
execute store result score $dst <obj> run data get storage rs:heap array[5] 1
data modify storage rs:heap array[3] set value 42
```

Dynamic index (runtime variable) — requires MC 1.20.2+ macros:

```
# Step 1: write index into macro args storage
execute store result storage rs:macro_args i int 1 run scoreboard players get $idx <obj>

# Step 2: call macro function
function ns:_read_array with storage rs:macro_args

# Step 3: inside _read_array.mcfunction (macro function)
$execute store result score $ret <obj> run data get storage rs:heap array[$(i)] 1
```

**RedScript `storage_get_int` / `storage_set_int` builtins compile to exactly this pattern.**

### MC 1.20.2+ Function Macros

A function file that contains `$(key)` substitutions must be called with
`function <ns>:<fn> with storage <ns>:<macro_storage>`.
Any line containing `$(...)` must begin with `$`.

```
# Caller: populate rs:macro_args, then call
execute store result storage rs:macro_args px double 0.01 run scoreboard players get $px_int <obj>
execute store result storage rs:macro_args py double 0.01 run scoreboard players get $py_int <obj>
function rsdemo:_draw with storage rs:macro_args

# Inside _draw.mcfunction (macro function):
$particle minecraft:end_rod ^$(px) ^$(py) ^5 0.02 0.02 0.02 0 10
```

**What macros unlock:**
- Dynamic array indexing (above)
- Dynamic coordinates in `particle`, `setblock`, `tp`, `fill`, etc.
- Dynamic entity selectors and NBT paths

**Constraint:** Macro substitution is string interpolation at the command level.
The substituted value must be a valid literal for that position (integer, float,
coordinate, selector string). No arithmetic is performed during substitution.

### `function` and `return`: call graph and early exit

```
# Unconditional call
function <ns>:<path>

# Conditional call (the compiled form of if/else branches)
execute if score $cond <obj> matches 1.. run function <ns>:then_0
execute if score $cond <obj> matches ..0 run function <ns>:else_0

# Macro function call
function <ns>:<path> with storage <ns>:<macro_storage>

# Return a value (MC 1.20.3+)
return 42
return run scoreboard players get $x <obj>

# Early return (MC 1.20.2+, exits current function immediately)
return 0
```

`return run <cmd>` stores the command's result as the function's return value,
readable via `execute store result score $ret <obj> run function ...`.

### Summary: IR operation → MC command mapping

| IR operation | MC command |
|---|---|
| `x = const N` | `scoreboard players set $x <obj> N` |
| `x = copy y` | `scoreboard players operation $x <obj> = $y <obj>` |
| `x = add y, z` | copy y→x, then `+= $z` |
| `x = sub y, z` | copy y→x, then `-= $z` |
| `x = mul y, z` | copy y→x, then `*= $z` |
| `x = div y, z` | copy y→x, then `/= $z` |
| `x = mod y, z` | copy y→x, then `%= $z` |
| `if x == 0` | `execute if score $x <obj> matches 0 run ...` |
| `if x > y` | `execute if score $x <obj> > $y <obj> run ...` |
| `x = array[i]` | macro: store i, call macro fn, read `$ret` |
| `array[i] = v` | macro: store i+v, call macro fn |
| `call fn(args...)` | set up params in `$p0..$pN`, `function <ns>:<fn>` |
| `call_macro fn(args...)` | store args in `rs:macro_args`, `function ... with storage` |
| `return x` | `scoreboard players operation $ret <obj> = $x <obj>` |


---

## Current Debugging & Tooling

### CLI commands

```
redscript compile <file> [-o <out>] [--namespace <ns>] [--scoreboard <obj>] [--no-dce] [--no-mangle]
redscript watch   <dir>  [-o <out>] [--namespace <ns>] [--hot-reload <url>]
redscript check   <file>
redscript fmt     <file> [file2 ...]
redscript repl
redscript generate-dts [-o <file>]
```

---

### `redscript check` — local syntax checker

**What it does:** Parse + preprocess only. Exits 0 if the file is syntactically
valid, non-zero with a formatted error otherwise. Does **not** run the type
checker, lowering, or optimizer.

```bash
redscript check examples/readme-demo.mcrs
# ✓ examples/readme-demo.mcrs is valid
```

**Known bug:** `check` always passes `namespace = 'redscript'` hardcoded to the
parser, regardless of the filename or any `--namespace` flag. This means
namespace-sensitive parse errors (e.g. a symbol that happens to conflict with
the literal string `"redscript"`) may behave differently under `check` vs
`compile`. Fix: derive namespace from filename (same logic as `compile`) or
accept a `--namespace` flag.

Additionally, `check` only calls the parser — it does **not** call the type
checker (`TypeChecker`). Type errors silently pass `check` and only surface
during `compile`. The type checker itself is currently in "warn mode" (collects
errors but does not block compilation), so even `compile` does not hard-fail on
type errors.

**Redesign:** `check` should run: parse → name resolution → full type checking,
and exit non-zero on any diagnostic. The current "warn mode" type checker should
become "error mode".

---

### `redscript watch` + `--hot-reload` — live reload against a running server

Watch mode recompiles on every `.mcrs` file change in a directory, then
optionally POSTs to a hot-reload endpoint:

```bash
redscript watch src/ -o ~/mc-test-server/world/datapacks/rsdemo \
    --namespace rsdemo \
    --hot-reload http://localhost:25570
```

On each successful compile, it calls `POST <url>/reload`, which is expected
to trigger `/reload` on the MC server. This gives a **save → auto-deploy →
`/reload`** loop without switching to the game.

```
Save .mcrs
  → recompile (< 1 s)
  → write .mcfunction files to datapack dir
  → POST /reload
  → server reloads datapack
  → test in-game immediately
```

The hot-reload server is a tiny HTTP listener that must be running alongside
the MC server. Currently this is a manual setup (run a small HTTP server that
calls RCON `/reload`).

**Known limitation:** watch mode compiles all `.mcrs` files in the directory on
every change, not just the changed file. For large projects this is wasteful.
Incremental compilation (track which files changed, only recompile affected
functions) is a future improvement.

---

### `redscript repl` — interactive expression evaluator

Starts a read-eval-print loop. Accepts RedScript expressions and statements,
compiles them, runs them through `MCRuntime` (the in-process scoreboard
simulator), and prints the result.

Useful for quickly testing arithmetic, `sin_fixed` values, or algorithm
correctness without deploying to a server.

```
> let x: int = sin_fixed(45);
x = 707
> x * x + (cos_fixed(45) * cos_fixed(45) / 1000)
= 999649
```

**Known limitation:** the REPL resets all state between expressions (no
persistent variable binding across lines). Calling stdlib functions that depend
on `@load` initialization (e.g. `sin_fixed` table load) may not work correctly
unless the REPL explicitly runs the load function first.

---

### `--no-mangle` flag — readable variable names for debugging

By default, IR variable names are mangled to short names (`$a`, `$b`, `$ad`...)
to keep scoreboard objective slot names short. With `--no-mangle`, the original
source variable names are preserved:

```bash
redscript compile demo.mcrs -o /tmp/out --no-mangle
```

Generated mcfunction uses `$phase __rsdemo` instead of `$c __rsdemo`, making
it possible to read the output and correlate with source.

---

### Sourcemap

Every compile outputs a `.map.json` file alongside the datapack:

```
/tmp/rsdemo/rsdemo.map.json
```

Maps each generated `.mcfunction` path back to the source `.mcrs` file and
line number. Currently used for error reporting. Future use: step-through
debugger that maps MC function calls back to source lines.

---

### `MCRuntime` — in-process MC simulator (used by tests)

`src/runtime/index.ts` implements a simulated MC execution environment:
- Scoreboard: fake-player → objective → INT32 value
- NBT storage: nested map of NBT values
- Function call stack: dispatches `function ns:path` to the compiled output
- `execute if/unless score`: evaluated against the simulated scoreboard
- `execute store result score ... run ...`: captures command return value

All 920 tests use `MCRuntime` to run compiled datapacks in-process without a
real MC server. This makes the test suite fast (< 35 s for all 920 tests) and
server-independent.

**What `MCRuntime` does not simulate:**
- Entity selectors (`@a`, `@e`, `@p`, `@s`) — tests must mock these
- World block state (`setblock`, `fill`) — not tracked
- Particle/sound/title commands — silently ignored
- Tick scheduling — tests call `@tick` functions manually

---

### Test server: Paper 1.21.4 at `~/mc-test-server`

For integration testing that requires real MC behavior (entity selectors,
actual particle rendering, boss bars, etc.):

```bash
# Start
cd ~/mc-test-server
/opt/homebrew/opt/openjdk@21/bin/java -jar paper.jar --nogui

# Deploy a datapack
redscript compile examples/readme-demo.mcrs \
    -o ~/mc-test-server/world/datapacks/rsdemo \
    --namespace rsdemo

# In-game or via RCON
/reload
/function rsdemo:start
```

Server details:
- Paper 1.21.4-232
- Port 25561
- Java: `/opt/homebrew/opt/openjdk@21/bin/java`
- Accessible via Tailscale at `100.73.231.27:25561`


---

## Language Semantics Design (Redesign Decisions)

### Visibility & DCE: `export` replaces `@keep`

**Current:** `@keep` forces a function to survive DCE. Everything without `@keep`
is potentially eliminated if unreachable.

**Redesign:** Use `export` as the explicit public-API marker, matching TypeScript/JS conventions.

```redscript
export fn spawn_wave() { ... }    // public — never DCE'd
fn _helper(x: int): int { ... }  // private — eliminated if unreachable

@tick fn _tick() { ... }          // @tick implies export (referenced by tick.json)
@load fn _load() { ... }          // @load implies export (referenced by load.json)
```

Rules:
- `export` → never DCE'd; accessible from other datapacks / MC
- no `export` → private; DCE applies
- `@tick` / `@load` implicitly export the function and wire it into `tick.json` / `load.json`
- `@require_on_load` (current stdlib pragma) → absorbed into `@load` or library `export` semantics

`module library;` pragma stays: marks a file as a library (all exports are
available for import; nothing auto-runs at load time).

---

### Struct: value type, no heap, no references

`struct` is kept (not renamed to `class`) because the value-type semantics are
immediately obvious from the name — same as C/C++/Rust structs.

```redscript
struct Vec2 {
    x: int;
    y: int;
}

impl Vec2 {
    fn length_sq(self): int {
        return self.x * self.x + self.y * self.y;
    }
}

let v: Vec2 = Vec2 { x: 3, y: 4 };
let d: int = v.length_sq();   // = 25
```

**Constraints (by MC target):**
- No heap allocation. A `Vec2` is two scoreboard slots, not a pointer.
- No references. `let a = v; a.x = 10` does **not** modify `v`.
- No dynamic dispatch / vtables. Method calls are statically resolved at compile time.
- No inheritance. Composition only.
- Struct fields cannot be `string` (strings cannot live in scoreboard).

**Why not `class`?** "Class" implies heap allocation and reference semantics in
most languages. Using `struct` sets the correct expectation: this is a named
group of scoreboard slots, not a Java-style object.

---

### Macro functions: transparent to users

A **macro function** is one that uses a parameter as a dynamic MC coordinate or
array index — positions where MC requires literal values but we want runtime
substitution via the 1.20.2+ function macro mechanism.

```redscript
// User writes this — looks like a normal function:
fn draw_pt(px: float, py: float) {
    particle("minecraft:end_rod", ^px, ^py, ^5, 0.02, 0.02, 0.02, 0.0, 10);
}
```

The compiler detects that `px`/`py` appear in `^`-coordinate positions and
automatically emits:
1. A macro function file (`$particle ... ^$(px) ^$(py) ...`)
2. A call site that writes args to `rs:macro_args` storage and calls
   `function ns:draw_pt with storage rs:macro_args`

**Users never write `$` or `with storage`** — the compiler handles it.

In the redesign, macro-function status can be auto-detected (current behavior)
or explicitly annotated `@macro fn draw_pt(...)`. Auto-detection is simpler for
users; explicit annotation makes it clearer in large codebases. Decision: keep
auto-detection, but emit a diagnostic if a function is unexpectedly promoted to
macro status (so users are aware).

---

### Error handling & diagnostics

**Goal:** report all errors in a file before stopping, not just the first one.
This is critical for IDE integration (the language server must not crash on the
first typo).

**Approach: panic-mode error recovery in the parser**

When the parser encounters an unexpected token, it:
1. Records the error with source span
2. Skips tokens until it finds a synchronization point: `fn`, `}`, `;`, `@tick`, `@load`, EOF
3. Resumes parsing from that point

This collects multiple independent errors before stopping:

```
Error at line 5:  expected ':' but got '='
Error at line 12: unknown type 'flot'
Error at line 18: undefined variable 'phse'
3 errors found.
```

**Not doing incremental parsing.** Incremental parsing (re-parse only changed
sections) is a separate project requiring a tree-sitter-style persistent parse
tree. The benefit for RedScript's typical file sizes (< 500 lines) is minimal,
and the implementation cost is high. Panic-mode recovery is sufficient for
a good developer experience.

**Diagnostic severity levels:**

| Level | Use |
|---|---|
| `error` | Compilation fails. Type mismatch, undefined symbol, syntax error. |
| `warning` | Compilation succeeds but something is suspicious. Unused variable, unreachable code. |
| `hint` | Informational. Style suggestions, implicit conversions. |

**Current `TypeChecker` is in "warn mode"** (type errors do not block compilation).
In the redesign, type errors are `error` level and do block compilation.

---

### Type system

#### Primitive types

| Type | Storage | Notes |
|---|---|---|
| `int` | scoreboard INT32 | All arithmetic. Range: −2³¹ to 2³¹−1 |
| `float` | scoreboard INT32 (×1000) | Fixed-point. `1.5` stored as `1500`. Use `mulfix`/`divfix` for ×/÷ |
| `bool` | scoreboard 0 or 1 | `true`=1, `false`=0 |
| `string` | NBT string | Cannot do arithmetic. Only usable in command/NBT contexts |
| `void` | — | Function returns nothing |

#### MC-specific types

| Type | Notes |
|---|---|
| `selector<entity>` | Not a runtime value. Only usable in `foreach` / command contexts |
| `selector<player>` | Subtype of `selector<entity>` for player-only selectors |
| `BlockPos` | Coordinate triple. Only usable in command contexts |

#### Compound types

| Type | Notes |
|---|---|
| `struct Foo { ... }` | Value type. Fields are independent scoreboard slots |
| `int[]` | NBT integer array. Dynamic access requires macro |
| `(a: int) => int` | Function type. Used for stdlib callbacks |

#### Key design decisions

**1. Nominal typing (not structural)**

Two structs with identical fields are NOT compatible:

```redscript
struct Vec2  { x: int; y: int; }
struct Point { x: int; y: int; }

fn distance(a: Vec2, b: Vec2): int { ... }
let p: Point = Point { x: 1, y: 2 };
distance(p, p)  // ERROR: Point is not Vec2
```

Rationale: `Vec2` and `Point` use different scoreboard slot names. Structural
compatibility would require a copy — which must be explicit.

**2. No implicit type conversion**

```redscript
let x: int = 5;
let y: float = x;          // ERROR: use 'x as float' (×1000 implicit conversion)
let z: float = x as float; // OK: z = 5000 internally
```

Rationale: `int → float` is a ×1000 multiply. Making it implicit hides a
potentially significant operation and makes arithmetic bugs hard to find.

**3. No null**

Scoreboard slots are always initialized to 0. There is no null/undefined/None
in RedScript. No nullable types, no optional chaining.

**4. No union types, no conditional types**

These require runtime type tags, which cost scoreboard slots and add dispatch
overhead. Not worth it at MC scale.

**5. Simple generics only**

`selector<entity>` and `selector<player>` are essentially two distinct concrete
types, not a generic in the full sense. Generic functions (e.g. stdlib
`foreach<T>`) are specialized at each call site by the compiler — no runtime
polymorphism.

#### Type inference

Local variables: `let x = 5` → `int`, `let x = 5.0` → `float`, `let x = true` → `bool`.
Function return types: inferred from `return` statements if not annotated.
Struct fields: must be explicitly typed.

**Implementation estimate:** ~800–1200 lines of TypeScript. Two weeks.

---

### Incremental compilation: explicitly deferred

**Decision: do not implement.** `watch` mode already recompiles in < 1 second
for typical project sizes. The complexity of tracking a file-level dependency
graph and invalidating only affected functions outweighs the benefit.

If project sizes grow to hundreds of files and compilation becomes noticeably
slow, incremental compilation can be added as a separate pass: build a module
dependency DAG, recompile only the subgraph invalidated by a file change.
Architecture note for the future: keep module loading separated from lowering
so that a cached module's IR can be reused without re-parsing.


---

## MC Execution Budget & Coroutine Transform

### The 65536 command budget

`maxCommandChainLength` (gamerule, default 65536) limits the **total number of
commands executed per game tick**, summed across all function calls triggered
in that tick. It is a tick budget, not a per-function call depth limit.

A separate limit (~512 levels) applies to nested function call depth (JVM stack).
This rarely matters for compiled output, which is usually shallow chains of
`execute if ... run function`.

**Practical implications:**
- A loop of 1000 iterations × 10 commands/iteration = 10,000 commands. Safe.
- A loop of 1000 iterations × 100 commands/iteration = 100,000 commands. Exceeds budget — only ~655 iterations actually run; the rest are silently dropped.
- The budget can be raised by a server admin: `gamerule maxCommandChainLength 1000000`. Cannot be changed from within a datapack.

**Compiler response:** The redesigned compiler should statically estimate the
command count of loops and emit a `warning` when the estimated count approaches
the budget.

---

### Coroutine Transform: automatic tick-splitting

For computations that genuinely require more commands than one tick allows,
the compiler can automatically transform a long-running function into a
tick-spread state machine. This is the same transformation JavaScript engines
apply to `async/await`, Python applies to `yield`, and C# applies to
`yield return` — just targeting the MC tick scheduler instead of an event loop.

#### Usage (proposed syntax)

```redscript
@coroutine(batch=10) fn process_all() {
    for (let i: int = 0; i < 1000; i++) {
        do_work(i);   // heavy per-iteration work
    }
    finish();
}
```

`@coroutine(batch=N)` tells the compiler: "split this function's loops so that
each tick advances at most N iterations". If `batch` is omitted, the compiler
estimates it from the loop body's command count.

#### How the transform works

**Step 1: Find yield points**

In the MIR CFG, find all back edges (edges that jump to a dominator block —
i.e., loop headers). A yield point is inserted at each back edge, triggered
every `batch` iterations.

**Step 2: Liveness analysis at yield points**

Compute the set of variables live at each yield point. These variables must
persist across ticks — they cannot stay in function-local temporary slots.
They are promoted to persistent scoreboard slots (or NBT for arrays/structs).

In the example above, `i` is the only live variable at the loop's yield point.

**Step 3: Split the CFG into continuations**

Each segment between yield points becomes a separate function. A `pc`
(program counter) scoreboard slot tracks which continuation runs next.

```
coroutine_state:
  i  → $coro_i  __ns     (promoted temp)
  pc → $coro_pc __ns     (program counter)

continuation_1  (loop body, batch iterations):
  for (batch_count = 0; batch_count < BATCH && i < 1000; batch_count++) {
    do_work(i)
    i++
  }
  if i >= 1000: pc = 2   # advance to finish()
  else:         pc = 1   # resume loop next tick
  return                 # end this tick's work

continuation_2:
  finish()
  pc = -1                # done
```

**Step 4: Generate the dispatcher**

```redscript
@tick fn _coro_process_all_tick() {
    // generated — do not edit
    execute if score $coro_pc __ns matches 1 run function ns:_coro_cont_1
    execute if score $coro_pc __ns matches 2 run function ns:_coro_cont_2
}
```

The original `process_all()` call site becomes:
```
scoreboard players set $coro_pc __ns 1   # start from continuation_1
scoreboard players set $coro_i  __ns 0   # initialize i
```

#### Algorithm components

| Component | Technique | Est. size |
|---|---|---|
| Find yield points | Dominator tree + back-edge detection | ~100 lines |
| Live variable analysis | Standard dataflow (backwards liveness) | ~150 lines |
| CFG splitting | Insert `pc = N; return` at yield points | ~200 lines |
| Variable promotion | Assign persistent slots to live vars at yields | ~100 lines |
| Dispatch generation | `execute if score pc matches N` chain | ~50 lines |
| Batch size estimation | Static command-count estimate per loop body | ~100 lines |

**Total:** ~700 lines. Approximately 3–4 weeks of focused implementation.
Prerequisite: proper MIR CFG with dominator tree (Stage 3 of the new pipeline).

#### Placement in the pipeline

This transform runs in **Stage 4 (MIR optimization passes)** as an opt-in pass:

```typescript
const pipeline: Pass[] = [
  constantFold,
  copyProp,
  dce,
  ...(options.coroutine ? [coroutineTransform] : []),  // opt-in
  destinationForwarding,
  blockMerge,
]
```

It is not run by default — only on functions annotated `@coroutine`. The
compiler will warn if a non-annotated loop is estimated to exceed the tick
budget, suggesting the user add `@coroutine`.

#### What the transform does NOT do

- Does not handle `return` with a value from inside a coroutine (complex; deferred).
- Does not support nested coroutines (a `@coroutine` calling another `@coroutine`).
- Does not handle exceptions (RedScript has none, so this is fine).
- Does not parallelize — MC is single-threaded; `@tick` runs one coroutine step per tick.

#### Relationship to Timer and manual state machines

RedScript's `Timer` stdlib is a manually written version of this pattern.
The coroutine transform automates what users currently write by hand
when they need multi-tick computations.

