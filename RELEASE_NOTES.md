# RedScript v3.0.0 Release Notes

> **Release date:** 2026-03-22
> **NPM:** `npm install redscript-mc@3.0.0`

---

## Highlights

RedScript v3.0.0 is the biggest release yet. Seven new optimizer passes, a full test framework, project configuration via `redscript.toml`, LSP hover docs and real-time diagnostics, playground sharing, and a 50-module stdlib — all documented in English and Chinese.

---

## What's New

### Language Features

- **`struct extends`** — compile-time field inheritance; child structs inherit all parent fields and can add their own
- **`labeled break` / `labeled continue`** — escape or continue any outer loop by label, enabling clean nested-loop control flow

### Optimizer Passes

Seven new optimizer passes land in v3.0.0, bringing the total to **15 passes**:

| Pass | What it does |
|------|-------------|
| **Tail Call Optimization (TCO)** | Converts tail-recursive functions into loops, bypassing Minecraft's ~512 call-depth limit |
| **Common Subexpression Elimination (CSE)** | Caches repeated sub-expressions to avoid redundant computation |
| **Auto-Inline Small Functions** | Automatically inlines functions with fewer than 5 statements — no `@inline` needed |
| **Execute Chain Optimization** | Merges `execute if A run execute if B run …` into a single `execute if A if B …` command |
| **Strength Reduction** | Replaces expensive operations with cheaper equivalents (e.g. `x * 2` → `x + x`) |
| **Scoreboard Read Batching** | Deduplicates multiple reads of the same scoreboard variable within a single tick |
| **NBT Write Coalescing** | Merges consecutive writes to the same NBT path into one operation |

### CLI Commands

- **`redscript test`** — runs all functions annotated with `@test`; exits non-zero on failure
- **`redscript docs`** — opens the stdlib documentation site in your default browser

### Tooling & LSP

- **`redscript.toml`** — project configuration file (entry points, optimizer flags, target version, output path)
- **LSP hover docs** — `///` doc comments now appear on hover in VS Code and any LSP-capable editor
- **LSP lint diagnostics** — lint warnings from `redscript lint` are pushed to the Problems panel in real time
- **Playground share** — generate a shareable URL for any playground snippet via lz-string URL hash (no server required)
- **Source maps** — compiler now emits source maps that trace each `.mcfunction` line back to its `.mcrs` origin

### Stdlib

All **50 stdlib modules** are fully annotated with `///` doc comments and have generated documentation in both English and Chinese. A new CI check (`docs:check`) fails PRs if docs fall out of sync with source.

New module added this cycle:

- **`queue`** — FIFO queue backed by an NBT list

### Decorators

- **`@memoize`** — caches results of single-argument `int → int` functions; subsequent calls with the same argument return instantly
- **`@test`** — marks a function as a test case; picked up by `redscript test`
- **`@throttle(ticks)`** and **`@retry(max)`** — previously 🔄 in-progress, now fully shipped

---

## Breaking Changes

- **`redscript.toml` supersedes CLI flags** — projects using `redscript build` with inline `--entry` / `--out` flags should migrate to `redscript.toml`. CLI flags still work but are deprecated.
- **TCO changes recursion semantics** — tail-recursive functions are now compiled to loops. Any code relying on call-stack side-effects at tail position will behave differently. (Affects edge cases only.)
- **CSE may reorder expressions** — in rare cases where sub-expressions have side effects (e.g. scoreboard writes inside conditions), CSE can change execution order. Use `@no_cse` to opt out on a per-function basis.

---

## Migration Guide

### 1. Add `redscript.toml`

```toml
[project]
name    = "my-datapack"
version = "1.0.0"
entry   = "src/main.mcrs"
out     = "dist/"

[compiler]
mc_version = "1.21"
optimize   = true
```

Run `redscript init` in an existing project to generate a starter config.

### 2. Annotate tests

```redscript
@test
fn test_add() {
    assert(1 + 1 == 2)
}
```

Then run: `redscript test`

### 3. Add doc comments for LSP hover

```redscript
/// Returns the maximum of two integers.
/// @param a First value
/// @param b Second value
fn max(a: int, b: int) -> int { ... }
```

### 4. Share playground snippets

Open the playground → write code → click **Share** → copy the URL. Recipients open the link and see your exact code, no login required.

---

## Full Changelog

```
f28e4b8 feat(playground): share code via lz-string URL hash
e0cea71 fix(cli): fix publish outputZip ternary precedence bug
f760646 fix(optimizer): fix TCO infinite loop in LICM, CSE, auto-inline
bf994ed feat(cli): redscript docs command — open stdlib documentation in browser
76b68a3 feat(optimizer): NBT write coalescing — remove redundant consecutive NBT writes
482c4e3 feat(optimizer): scoreboard read batching — deduplicate redundant score reads
79df0be feat(emit): source map generation — trace mcfunction back to .mcrs lines
b7d59f9 feat(optimizer): tail call optimization (TCO) for tail-recursive functions
bfa77fc feat(optimizer): execute chain optimization — flatten nested execute if
bc09f52 feat(cli): redscript test command + @test decorator + assert builtin
be1ac15 feat(compiler): @memoize decorator — single-arg int function result caching
aa2031b feat(config): redscript.toml project configuration file
b2198f2 feat(lsp): hover shows /// doc comments; diagnostics push lint warnings
0cc825c feat(optimizer): loop-invariant code motion (LICM) pass
d5cca69 feat(stdlib): queue.mcrs — FIFO queue with NBT list
960b8eb feat(cli): redscript lint command with 5 static analysis rules
30686b0 feat(cli): redscript publish command — package datapack as .zip
7afcb91 feat(compiler): struct Display trait — to_string() method implementation
164cee1 feat(compiler): interface/trait declarations with impl verification
```

For the complete diff, see the [GitHub compare view](https://github.com/your-org/redscript/compare/v2.x...v3.0.0).

---

*RedScript — Write less datapack boilerplate, ship more game logic.*
