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
