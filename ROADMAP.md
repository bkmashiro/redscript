# RedScript ROADMAP

> Last updated: 2026-03-22
> Current version: 3.0.0

## Legend
- ✅ Done
- 🔄 In Progress
- 📋 Planned
- 💡 Idea

---

## Compiler Optimizations

| Pass | Status | Description |
|------|--------|-------------|
| Dead Code Elimination (DCE) | ✅ | Remove unreachable code |
| Constant Folding | ✅ | Evaluate constant expressions at compile time |
| Copy Propagation | ✅ | Replace variable copies with original |
| Loop Invariant Code Motion (LICM) | ✅ | Hoist invariants out of loops |
| Loop Unrolling | ✅ | Unroll small loops |
| NBT Batch Read | ✅ | Merge consecutive NBT reads |
| Function Inlining (`@inline`) | ✅ | Manual inline annotation |
| Partial Evaluation | ✅ | Fold dead branches with constant conditions |
| Tail Call Optimization (TCO) | ✅ | Convert tail recursion to loops (MC depth limit ~512) |
| Common Subexpression Elimination (CSE) | ✅ | Cache repeated expressions |
| Auto-Inline Small Functions | ✅ | Auto-inline functions < 5 statements |
| Execute Chain Optimization | ✅ | Merge `execute if A run execute if B` → `execute if A if B` |
| Strength Reduction | ✅ | `x * 2` → `x + x`, cheaper operations |
| Scoreboard Read Batching | ✅ | Merge multiple reads of same scoreboard var in one tick |
| NBT Write Coalescing | ✅ | Merge consecutive writes to same NBT path |

---

## Language Features

| Feature | Status | Description |
|---------|--------|-------------|
| Basic types (int, bool, string) | ✅ | |
| Structs | ✅ | |
| Struct extends | ✅ | Compile-time field inheritance |
| Enums with payload | ✅ | Tag + NBT payload |
| Arrays (static + dynamic) | ✅ | |
| Tuples | ✅ | Scoreboard-backed |
| match expression | ✅ | Pattern matching incl. string |
| Option<T> | ✅ | Algebraic option type |
| Result<T, E> | ✅ | Error handling |
| Interfaces / Traits | ✅ | Compile-time impl check |
| Module import | ✅ | Three import forms |
| Format strings (f-string) | ✅ | |
| Multi-line strings | ✅ | |
| `while let Some(x)` | ✅ | |
| `for item in array` | ✅ | |
| Labeled break/continue | ✅ | Nested loop control |
| Generics | 💡 | Low ROI for MC target |
| Closures / lambdas | 💡 | MC has no closures natively |

---

## Decorators

| Decorator | Status | Description |
|-----------|--------|-------------|
| `@on(EventType)` | ✅ | Event handler |
| `@tick` | ✅ | Run every game tick |
| `@load` | ✅ | Run on datapack load |
| `@inline` | ✅ | Force function inlining |
| `@deprecated` | ✅ | Compile-time warning |
| `@singleton` | ✅ | Global state singleton |
| `@watch` | ✅ | Scoreboard change listener |
| `@config` | ✅ | Compile-time config injection |
| `@profile` | ✅ | Performance profiling |
| `@throttle(ticks)` | ✅ | Rate limit execution |
| `@retry(max)` | ✅ | Auto-retry on failure |
| `@memoize` | ✅ | Cache function results |
| `@benchmark` | ✅ | Tick-level benchmarking |
| `@test` | ✅ | Mark test functions |

---

## CLI Commands

| Command | Status | Description |
|---------|--------|-------------|
| `redscript compile` | ✅ | Compile .mcrs files |
| `redscript build` | ✅ | Build with optimization |
| `redscript check` | ✅ | Type check only |
| `redscript fmt` | ✅ | Format source code |
| `redscript lint` | ✅ | Static analysis (5 rules) |
| `redscript init` | ✅ | Project scaffold |
| `redscript watch` | ✅ | Watch mode + hot reload |
| `redscript publish` | ✅ | Package as .zip datapack |
| `redscript test` | ✅ | Run @test functions |
| `redscript upgrade` | ✅ | Check for updates |
| `redscript repl` | ✅ | HTTP REPL server |
| `redscript docs` | ✅ | Open stdlib docs in browser |

---

## Stdlib Modules (50 total)

All 50 modules documented with `///` annotations and en+zh generated docs.

| Category | Modules |
|----------|---------|
| Math | math ✅ math_hp ✅ vec ✅ linalg ✅ matrix ✅ quaternion ✅ |
| DSP / Simulation | fft ✅ ode ✅ signal ✅ easing ✅ noise ✅ |
| Geometry | geometry ✅ parabola ✅ physics ✅ |
| Data Structures | sort ✅ heap ✅ bigint ✅ map ✅ set_int ✅ sets ✅ queue ✅ list ✅ |
| AI / Graph | graph ✅ pathfind ✅ |
| Game Systems | player ✅ effects ✅ combat ✅ scheduler ✅ state ✅ dialog ✅ timer ✅ cooldown ✅ |
| MC Specific | bossbar ✅ tags ✅ teams ✅ mobs ✅ spawn ✅ world ✅ interactions ✅ inventory ✅ particles ✅ |
| ECS | ecs ✅ |
| Utility | strings ✅ result ✅ bits ✅ color ✅ random ✅ |
| Advanced | advanced ✅ calculus ✅ expr ✅ events ✅ |

---

## Tooling

| Tool | Status | Description |
|------|--------|-------------|
| VSCode Extension | ✅ v1.3.74 | Syntax highlighting, snippets |
| LSP Server | ✅ | Hover, completion, goto-def, diagnostics |
| LSP hover docs | ✅ | Shows `///` comments on hover |
| LSP lint diagnostics | ✅ | Real-time lint warnings in Problems panel |
| Playground | ✅ | Web IDE with examples |
| Playground share | ✅ | URL-encoded shareable links (lz-string URL hash) |
| REPL server | ✅ | HTTP POST /compile |
| Doc generator | ✅ | `npm run docs:gen` — 50 modules |
| CI docs:check | ✅ | PR fails if docs out of sync |
| Benchmarks suite | ✅ | `benchmarks/` |
| Source map | ✅ | Trace mcfunction → .mcrs line |

---

## Documentation

| Doc | Status |
|-----|--------|
| Getting started guide (en+zh) | ✅ |
| Advanced docs (optimization/modules/decorators/cli) | ✅ |
| Stdlib reference — all 50 modules (en+zh) | ✅ |
| Type system reference | ✅ |
| Error reference | ✅ |
| Blog posts (3) | ✅ |
| Tutorials | 📋 |

---

## Release

| Item | Status |
|------|--------|
| redscript-mc v3.0.0 npm publish | ✅ |
| VSCode marketplace v3.0.0 description update | 📋 |
| nest-faster-crud npm publish | 📋 |
| GitHub Release notes | 📋 |
