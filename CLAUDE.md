# RedScript Compiler — Claude Project Context

RedScript is a statically-typed programming language that compiles to Minecraft
Java Edition datapacks (`.mcfunction` files). It targets the MC scoreboard/NBT
runtime and generates commands that run inside the MC game engine.

**npm package:** `redscript-mc` | **VSCode extension:** `redscript-vscode`
**Docs:** https://redscript-docs.pages.dev | **IDE:** https://redscript-ide.pages.dev

---

## Build & Test

```bash
npm run build       # tsc compile
npm test            # jest (920 tests, ~35 s)
npm run build && npm test   # always run together after changes
```

**Tests must be green before any commit.** Current baseline: 920/920.

---

## Rules

- **`trash` not `rm`** — always use `trash` for deletions (recoverable)
- **Plain `git commit`** — GPG signing is passwordless, no flags needed
- **`git pull --rebase` before every push**
- **Remove Co-Authored-By** from commit messages before pushing
- **Small, frequent commits** — one feature/fix per commit; do not batch
- **Lowercase MC function names** — MC rejects uppercase paths
- **File extension:** `.mcrs`

---

## Current Architecture (v1.2.x — pre-refactor)

```
src/
  lexer/index.ts          Tokenizer
  parser/index.ts         Recursive-descent parser → AST
  lowering/index.ts       AST → IR  ⚠️ 3500 lines, stages 2+3+5 merged
  ir/index.ts             IR types (2-address)
  optimizer/
    passes.ts             Optimization passes (2-addr IR, regex-based)
    commands.ts           Scoreboard command regex patterns
    structure.ts          Structural analysis
  codegen/
    mcfunction/index.ts   IR → .mcfunction text
  compile.ts              Top-level compile() entry point
  cli.ts                  CLI
  runtime/index.ts        MCRuntime simulator (used by tests)
  stdlib/                 math.mcrs, vec.mcrs, advanced.mcrs, bigint.mcrs, timer.mcrs
  __tests__/              920 Jest tests
```

**Key identifiers:**
- Scoreboard objective default: `` `__${namespace}` `` (avoids multi-datapack collision)
- Macro sentinel: `\x01` at start of raw IR cmd string → codegen converts to `$`
- IR variable naming: `$fnname_varname` (function-scoped to avoid cross-fn collision)
- `LOWERING_OBJ` export in `src/lowering/index.ts`: the current objective name

---

## Planned Refactor (next major version)

**Full specification:** `docs/compiler-pipeline-redesign.md` (1700+ lines)
**Optimization ideas:** `docs/optimization-ideas.md` (1076 lines)

### 7-stage pipeline

```
Source → [Stage 1] AST → [Stage 2] HIR → [Stage 3] MIR (3-addr CFG)
       → [Stage 4] MIR optimized → [Stage 5] LIR (MC 2-addr)
       → [Stage 6] LIR optimized → [Stage 7] .mcfunction
```

### Implementation approach

- New code goes in `src2/` on branch `refactor/pipeline-v2`
- `src/` (current compiler) stays untouched until `src2/` passes 920/920
- Stage by stage: write unit tests for each stage, pass them, then move on
- 920 e2e tests only all-green at Stage 7 completion — partial pass mid-refactor is normal
- Adapt if stage boundaries feel wrong; design is a guide, not a contract

### MIR/LIR specs are in the design doc
The exact TypeScript types for `MIRInstr`, `LIRInstr`, `MIRBlock`, etc. are
fully specified in `docs/compiler-pipeline-redesign.md`. Read it before
implementing any stage.

---

## Language Quick Reference

```redscript
// Types: int, float (×1000 fixed-point), bool, string, void
// MC types: selector<entity>, selector<player>, BlockPos

let x: int = 0;
const MAX: int = 100;
fn add(a: int, b: int): int { return a + b; }

// Structs (value type — fields are scoreboard slots, no heap, no references)
struct Vec2 { x: int; y: int; }
impl Vec2 { fn length_sq(self): int { return self.x * self.x + self.y * self.y; } }

// Decorators
@tick fn _tick() { ... }     // runs every MC tick
@load fn _load() { ... }     // runs on /reload
export fn public_api() { ... } // survives DCE

// MC-specific
foreach (p in @e[tag=foo]) at @s { ... }
kill(@e[tag=screen]);
particle("minecraft:end_rod", ^px, ^py, ^5, 0.02, 0.02, 0.02, 0.0, 10);

// Macro functions (auto-detected when params appear in ^ coords)
fn draw_pt(px: float, py: float) {
    particle("minecraft:end_rod", ^px, ^py, ^5, 0.02, 0.02, 0.02, 0.0, 10);
}
// Compiles to: function ns:draw_pt with storage rs:macro_args

// Math stdlib (fixed-point ×1000)
let s: int = sin_fixed(45);  // = 707  (sin(45°) × 1000)
let r: int = sqrt_fixed(2000); // = 1414 (√2 × 1000)
let m: int = mulfix(a, b);   // = (a × b) / 1000
```

---

## Known Bugs / Technical Debt

- `redscript check` hardcodes `namespace = 'redscript'`; doesn't run TypeChecker
- TypeChecker is "warn mode" — type errors don't block compilation
- `watch` mode recompiles all files on any change (no incremental)
- Timer stdlib is single-instance only (shared fake player names)
- Optimizer passes use regex on raw command strings — fragile
- All of the above are addressed in the refactor plan

---

## Test Server

```bash
# Server: Paper 1.21.4, port 25561
cd ~/mc-test-server
/opt/homebrew/opt/openjdk@21/bin/java -jar paper.jar --nogui

# Deploy
node dist/cli.js compile examples/readme-demo.mcrs \
    -o ~/mc-test-server/world/datapacks/rsdemo --namespace rsdemo
# then in-game: /reload && /function rsdemo:start
```

---

## Useful Files

| File | Purpose |
|---|---|
| `docs/compiler-pipeline-redesign.md` | Full refactor spec (read this first) |
| `docs/optimization-ideas.md` | Optimization pass catalogue |
| `examples/readme-demo.mcrs` | Sine wave particle demo |
| `examples/math-showcase.mcrs` | Math stdlib showcase |
| `src/stdlib/math.mcrs` | sin/cos/sqrt/mulfix/divfix |
| `src/__tests__/` | 920 Jest tests — do not break these |
| `src/runtime/index.ts` | MCRuntime (scoreboard + NBT simulator) |

---

## Profiler (planned)

`MCRuntime` will gain a profiling mode (`{ profiling: { enabled: true } }`):
- Per-function command counts
- Error analysis vs JS float ground truth for math functions
- Coroutine BATCH auto-calibration

See `docs/compiler-pipeline-redesign.md` → "MCRuntime Profiler" section.
