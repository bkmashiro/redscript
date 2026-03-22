# RedScript v3.0.0 — Release Notes

## Highlights

RedScript v3.0.0 is a major release that brings a comprehensive optimization pipeline, new language features, improved tooling, and complete stdlib documentation.

## What's New

### 🚀 Optimizer Pipeline (7 new passes)

| Pass | Description |
|------|-------------|
| Tail Call Optimization (TCO) | Converts tail-recursive functions to loops, avoiding MC's ~512-depth call limit |
| Common Subexpression Elimination (CSE) | Caches repeated expressions, eliminating redundant computation |
| Auto-Inline | Automatically inlines functions ≤5 MIR instructions |
| Execute Chain Optimization | Merges `execute if A run execute if B` → `execute if A if B` |
| Strength Reduction | `x * 2` → `x + x`, algebraic simplifications |
| Scoreboard Read Batching | Deduplicates redundant scoreboard reads within a block |
| NBT Write Coalescing | Removes overwritten NBT writes (backward analysis) |

### 🆕 Language Features

- **`struct extends`** — compile-time field inheritance, zero runtime overhead
- **`break <label>` / `continue <label>`** — jump out of nested loops
- **`@memoize`** — LRU-1 function result caching for single-arg int functions
- **`@throttle(ticks)`** — rate-limit function execution to once per N ticks
- **`@retry(max)`** — auto-retry on failure, up to N times

### 🛠️ CLI Commands

| Command | Description |
|---------|-------------|
| `redscript test` | Run `@test`-annotated functions with built-in `assert` |
| `redscript publish` | Package compiled output as standard Minecraft datapack `.zip` |
| `redscript docs [module]` | Open stdlib documentation in browser |
| `redscript lint` | 5 static analysis rules (unused-var, magic-number, dead-branch, ...) |
| `redscript.toml` | Project configuration file — replaces CLI flags |

### 🔧 Tooling & LSP

- **LSP hover**: Shows `///` doc comments on hover (description, @param, @returns)
- **LSP diagnostics**: Lint warnings pushed to editor Problems panel in real-time
- **Source map**: Generated `.sourcemap.json` traces `.mcfunction` back to `.mcrs` lines
- **Playground share**: URL-encoded shareable links via lz-string compression

### 📚 Stdlib (50 modules, complete documentation)

All 50 stdlib modules now have:
- `///` doc comment annotations with `@since`, `@param`, `@returns`, `@example`
- Auto-generated English + Chinese documentation
- VitePress `<Badge>` version tags

New modules added: `queue`, `map`, `set_int`, `sets`

### 🧪 Testing

- **3,886 unit tests passing**, 0 failing
- **430 MC integration tests** (with live Minecraft server)
- Overall branch coverage: **81.5%**

## Breaking Changes

- `format_string` type is now unified as `string` — remove any `as string` workarounds
- `arr.len()` for literal arrays returns compile-time constants — some dynamic expectations changed

## Migration from v2.x

1. Update package: `npm install redscript-mc@3.0.0`
2. Replace `as string` on format strings (no longer needed)
3. Add `redscript.toml` to your project (optional, run `redscript init` to generate)

## Full Changelog

See [CHANGELOG.md](./CHANGELOG.md) for detailed commit history.
