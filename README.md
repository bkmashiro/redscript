<div align="center">

<img src="./logo.png" alt="RedScript Logo" width="64" />

<img src="https://img.shields.io/badge/RedScript-2.1.1-red?style=for-the-badge&logo=minecraft&logoColor=white" alt="RedScript" />

**A typed scripting language that compiles to Minecraft datapacks.**

Write clean game logic. RedScript handles the scoreboard spaghetti.

[![CI](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-1123%20passing-brightgreen)](https://github.com/bkmashiro/redscript)
[![npm](https://img.shields.io/npm/v/redscript-mc?color=cb3837)](https://www.npmjs.com/package/redscript-mc)
[![npm downloads](https://img.shields.io/npm/dm/redscript-mc?color=cb3837)](https://www.npmjs.com/package/redscript-mc)
[![VSCode](https://img.shields.io/badge/VSCode-Extension-007ACC?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=bkmashiro.redscript-vscode)
[![Online IDE](https://img.shields.io/badge/Try-Online%20IDE-orange)](https://redscript-ide.pages.dev)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

[中文版](./README.zh.md) · [Quick Start](#quick-start) · [Docs](https://redscript-docs.pages.dev) · [Contributing](./CONTRIBUTING.md)

### 🚀 [Try it online — no install needed!](https://redscript-ide.pages.dev)

<img src="./demo.gif" alt="RedScript Demo — math curves drawn with particles in Minecraft" width="520" />

*↑ Five mathematical curves rendered in real-time with particles — 100% vanilla, no mods!*
*`y = x·sin(x)` · `y = sin(x) + ½sin(2x)` · `y = e⁻ˣsin(4x)` · `y = tanh(2x)` · `r = cos(2θ)` rose curve*
*Each curve is computed tick-by-tick using RedScript's fixed-point math stdlib.*

</div>

---

### What is RedScript?

RedScript is a typed scripting language that compiles to vanilla Minecraft datapacks. Write clean code with variables, functions, loops, and events — RedScript handles the scoreboard commands and `.mcfunction` files for you.

**The demo above?** Five math curves drawn with 64 sample points each. The core logic:

```rs
import "stdlib/math"

let phase: int = 0;
let frame: int = 0;

// 5 curves cycle every 128 ticks (~6.5 s each)
@tick fn _wave_tick() {
    phase = (phase + 4) % 360;
    frame = frame + 1;

    let curve_id: int = (frame / 128) % 5;

    // Compute sin at 9 column offsets (40° apart = full sine wave span)
    let s0: int = sin_fixed((phase +   0) % 360);
    let s1: int = sin_fixed((phase +  40) % 360);
    // ... s2 through s8 ...

    // Draw bar chart: each column height = sin value
    // (64 fixed particle positions per curve, all respawned each tick)
    if (curve_id == 0) { _draw_xsinx(); }
    if (curve_id == 1) { _draw_harmonic(); }
    // ...

    actionbar(@a, f"§e  y = x·sin(x)   phase: {phase}°  center: {s0}‰");
}
```

**What you get:**
- ✅ `let` / `const` variables (no more `scoreboard players set`)
- ✅ `if` / `else` / `for` / `foreach` / `break` / `continue` control flow
- ✅ `@tick` / `@load` / `@on(Event)` decorators
- ✅ `foreach (p in @a) at @s positioned ~ ~1 ~` and full `execute` subcommand support
- ✅ `match` with range patterns like `70..79`
- ✅ Builtins accept runtime macro variables in any argument position
- ✅ f-strings like `f"Score: {points}"` for dynamic output
- ✅ Public functions are preserved automatically; `_privateFn()` stays private
- ✅ `enum` types with `match` dispatch (zero-runtime overhead)
- ✅ Multi-return values: `fn divmod(a: int, b: int): (int, int)`
- ✅ Generics: `fn max<T>(a: T, b: T): T` (monomorphized)
- ✅ `Option<T>` null safety: `Some(x)` / `None` / `if let Some(x) = opt`
- ✅ `@coroutine(batch=N)` for tick-spread loops (no more maxCommandChain hits)
- ✅ `@schedule(ticks=N)` to delay function execution
- ✅ Module system: `module math; import math::sin;`
- ✅ Multi-version targets: `--mc-version 1.20.2`
- ✅ Source maps: `--source-map` for debugging
- ✅ Language Server Protocol: diagnostics, hover, go-to-def, completion
- ✅ One file -> ready-to-use datapack

---

### What's New in v2.1.x

- **`enum` + `match` dispatch** — zero-runtime-overhead state machines; the compiler folds enum variants to integer constants and uses `execute if score` dispatch with no heap allocation
- **Multi-return values** — `fn divmod(a: int, b: int): (int, int)` unpacks to separate scoreboard slots; no struct wrapper needed
- **Generics** — `fn max<T>(a: T, b: T): T` is fully monomorphized at compile time; no boxing, no indirection
- **`Option<T>` null safety** — `Some(x)` / `None` with `if let Some(x) = opt` pattern binding; safe access to optional values without sentinel integers
- **`@coroutine(batch=N)`** — spreads a heavy loop across multiple ticks (`batch=50` means 50 iterations/tick), avoiding `maxCommandChainLength` hits on large workloads
- **`@schedule(ticks=N)`** — delays a function call by N game ticks; compiles to `schedule function` with automatic namespace scoping
- **Module system** — `module math;` declares a named module; consumers `import math::sin` to tree-shake individual symbols
- **Multi-version targets** — `--mc-version 1.20.2` switches emit strategy (macro sub-functions vs. legacy scoreboards) for the target server version
- **Source maps** — `--source-map` emits a `.mcrs.map` sidecar that maps each `.mcfunction` line back to the original source; enables in-editor debugging
- **LSP: hover + completion for builtins & decorators** — 50+ builtin functions and all decorators (`@tick`/`@load`/`@coroutine`/`@schedule`/`@on_trigger`) now show inline docs on hover

---

### Quick Start

#### Option 1: Online IDE (No Install)

**[→ redscript-ide.pages.dev](https://redscript-ide.pages.dev)** — Write code, see output instantly.

#### Option 2: VSCode Extension

1. Install [RedScript for VSCode](https://marketplace.visualstudio.com/items?itemName=bkmashiro.redscript-vscode)
2. Get syntax highlighting, auto-complete, hover docs, and more

#### Option 3: CLI

```mcrs
struct Timer { _id: int; duration: int; }

impl Timer {
    fn new(duration: int): Timer {
        return Timer { _id: 0, duration: duration };
    }
    fn done(self): bool { return true; }
}

@on(PlayerJoin)
fn welcome(player: Player) {
    say(f"Welcome {player}!");
}

@tick fn game_loop() {
    let timer = Timer::new(100);
    setTimeout(200, () => { say("Delayed!"); });
}
```

```bash
npm install -g redscript-mc
redscript compile game.mcrs -o ./my-datapack
```

#### Deploy

Drop the output folder into your world's `datapacks/` directory and run `/reload`. Done.

---

### The Language

#### Variables & Types

```rs
let x: int = 42;
let name: string = "Steve";
let spawn: BlockPos = (0, 64, 0);
let nearby: BlockPos = (~5, ~0, ~5);   // relative coords
const MAX: int = 100;                  // compile-time constant
```

#### MC Names (Objectives, Tags, Teams)

Use `#name` for Minecraft identifiers — no quotes needed:

```rs
// Objectives, fake players, tags, teams — write without quotes
let hp: int = scoreboard_get(@s, #health);
scoreboard_set(#game, #timer, 300);     // fake player #game, objective timer
tag_add(@s, #hasKey);
team_join(#red, @s);
gamerule(#keepInventory, true);

// String literals still work (backward compatible)
scoreboard_get(@s, "health")            // same output as #health
```

#### Functions & Defaults

```rs
fn greet(player: selector, msg: string = "Welcome!") {
    tell(player, msg);
}

greet(@s);              // uses default message
greet(@a, "Hello!");    // override
```

#### Decorators

```rs
@tick                  // every tick
fn heartbeat() { ... }

@tick(rate=20)         // every second
fn every_second() { ... }

@on_advancement("story/mine_diamond")
fn on_diamond() {
    give(@s, "minecraft:diamond", 5);
}

@on_death
fn on_death() {
    scoreboard_add(@s, #deaths, 1);
}

// Delay execution by N ticks (20t = 1 second)
@schedule(ticks=20)
fn after_one_second(): void {
    title(@a, "One second later!");
}

// Spread a heavy loop across multiple ticks (batch=N iterations/tick)
@coroutine(batch=50, onDone=all_done)
fn process_all(): void {
    let i: int = 0;
    while (i < 1000) {
        // work spread over ~20 ticks instead of lagging one tick
        i = i + 1;
    }
}
```

#### Control Flow

```rs
if (hp <= 0) {
    respawn();
} else if (hp < 5) {
    warn_player();
}

for (let i: int = 0; i < 10; i = i + 1) {
    say(f"Spawning wave {i}");
    summon("minecraft:zombie", ~0, ~0, ~0);
}

foreach (player in @a) {
    heal(player, 2);
}
```

#### Structs & Enums

```rs
enum Phase { Lobby, Playing, Ended }

struct Player {
    score: int,
    alive: bool,
}

match (phase) {
    Phase::Lobby   => { announce("Waiting..."); }
    Phase::Playing => { every_second(); }
    Phase::Ended   => { show_scoreboard(); }
}
```

#### Lambdas

```rs
fn apply(f: (int) -> int, x: int) -> int {
    return f(x);
}

let double = (x: int) -> int { return x * 2; };
apply(double, 5);  // 10
```

#### Arrays

```rs
let scores: int[] = [];
push(scores, 42);

foreach (s in scores) {
    announce("Score: ${s}");
}
```

---

### CLI Reference

```
redscript compile <file>       Compile to datapack (default) or structure
  -o, --output <dir>           Output directory         [default: ./out]
  --target datapack|structure  Output format            [default: datapack]
  --namespace <ns>             Datapack namespace       [default: filename]
  --mc-version <ver>           Target MC version        [default: 1.21]
  --include <dir>              Extra library search path (repeatable)
  --source-map                 Emit .mcrs.map source map for debugging
  --no-optimize                Skip optimizer passes
  --stats                      Print optimizer statistics

redscript repl                 Interactive REPL
redscript validate <file>      Validate MC commands
```

---

### Stdlib

RedScript ships a built-in standard library. Use the short form — no path needed:

```rs
import "stdlib/math"      // fixed-point math: ln, sqrt_fx, exp_fx, sin_fixed, cos_fixed...
import "stdlib/math_hp"   // high-precision trig via entity rotation (init_trig required)
import "stdlib/vec"       // 2D/3D vector: dot, cross, length, distance, atan2, rotate...
import "stdlib/random"    // LCG & PCG random number generators
import "stdlib/color"     // RGB/HSL color packing, blending, conversion
import "stdlib/bits"      // bitwise AND/OR/XOR/NOT/shift/popcount (integer-simulated)
import "stdlib/list"      // sort3, min/max/avg, weighted utilities
import "stdlib/geometry"  // AABB/sphere contains, parabola physics, angle helpers
import "stdlib/signal"    // normal/exponential distributions, bernoulli, weighted choice
import "stdlib/bigint"    // 96-bit base-10000 arithmetic (add/sub/mul/div/cmp)
import "stdlib/easing"    // 12 easing functions: quad/cubic/sine/bounce/back/smooth
import "stdlib/noise"     // value noise, fractal Brownian motion, terrain height
import "stdlib/combat"    // damage, kill-check helpers
import "stdlib/player"    // health, alive check, range
import "stdlib/cooldown"  // per-player cooldown tracking
```

Custom library paths can be added with `--include <dir>` so your own modules work the same way.

### Standard Library

All stdlib files use `module library;` — only the functions you actually call are compiled in.

> Parts of the standard library are inspired by [kaer-3058/large_number](https://github.com/kaer-3058/large_number), a comprehensive math library for Minecraft datapacks.

```rs
import "stdlib/math"            // abs, sign, min, max, clamp, lerp, isqrt, sqrt_fixed,
                                // pow_int, gcd, lcm, sin_fixed, cos_fixed, map, ceil_div,
                                // log2_int, mulfix, divfix, smoothstep, smootherstep

import "stdlib/vec"             // dot2d, cross2d, length2d_fixed, distance2d_fixed,
                                // manhattan, chebyshev, atan2_fixed, normalize2d_x/y,
                                // rotate2d_x/y, lerp2d_x/y, dot3d, cross3d_x/y/z,
                                // length3d_fixed

import "stdlib/advanced"        // fib, is_prime, collatz_steps, digit_sum, reverse_int,
                                // mod_pow, hash_int, noise1d, bezier_quad,
                                // mandelbrot_iter, julia_iter, angle_between,
                                // clamp_circle_x/y, newton_sqrt, digital_root

import "stdlib/bigint"          // bigint_init, bigint_from_int_a/b, bigint_add/sub/mul,
                                // bigint_compare, bigint_mul_small, bigint_fib
                                // — up to 32 decimal digits, runs on MC scoreboard

import "stdlib/player"          // is_alive, in_range, get_health
import "stdlib/timer"           // start_timer, tick_timer, has_elapsed
import "stdlib/cooldown"        // set_cooldown, check_cooldown
import "stdlib/mobs"            // ZOMBIE, SKELETON, CREEPER, ... (60+ constants)
```

**Example — computing Fibonacci(50) in-game:**

```rs
import "stdlib/bigint"

fn show_fib() {
    bigint_fib(50);
    // F(50) = 12,586,269,025 — too big for int32, stored across 3 limbs:
    let l0: int = bigint_get_a(0);  // 9025
    let l1: int = bigint_get_a(1);  // 8626
    let l2: int = bigint_get_a(2);  // 125
    say(f"F(50) limbs: {l2} {l1} {l0}");
}
```

---

### Examples

The `examples/` directory contains ready-to-compile demos:

| File | What it shows |
|---|---|
| `readme-demo.mcrs` | Real-time sine wave particles — `@tick`, `foreach`, f-strings, math stdlib |
| `math-showcase.mcrs` | All stdlib math modules: trig, vectors, BigInt, fractals |
| `showcase.mcrs` | Full feature tour: structs, enums, `match`, lambdas, `@tick`/`@load` |
| `coroutine-demo.mcrs` | `@coroutine(batch=50)` — spread 1000 iterations across ~20 ticks |
| `enum-demo.mcrs` | Enum state machine: NPC AI cycling Idle → Moving → Attacking with `match` |
| `scheduler-demo.mcrs` | `@schedule(ticks=20)` — delayed events, chained schedules |

Compile any example:
```bash
node dist/cli.js compile examples/coroutine-demo.mcrs -o ~/mc-server/datapacks/demo --namespace demo
```

---

### Further Reading

| | |
|---|---|
| 📖 [Language Reference](docs/LANGUAGE_REFERENCE.md) | Full syntax & type system |
| 🔧 [Builtins](https://redscript-docs.pages.dev/Builtins) | All 34+ MC builtin functions |
| ⚡ [Optimizer](https://redscript-docs.pages.dev/Optimizer) | How the optimizer works |
| 🧱 [Structure Target](docs/STRUCTURE_TARGET.md) | Compile to NBT command block structures |
| 🧪 [Integration Testing](https://redscript-docs.pages.dev/Integration-Testing) | Test against a real Paper server |
| 🏗 [Implementation Guide](docs/IMPLEMENTATION_GUIDE.md) | Compiler internals |

---

### What's New in v1.2.27

- **BigInt confirmed working in real Minecraft** (`bigint.mcrs`): arbitrary precision integers on MC scoreboard + NBT — base 10,000 × 8 limbs = up to 32 decimal digits; `bigint_add`, `bigint_sub`, `bigint_compare`, `bigint_mul`, `bigint_fib(50)` = 12,586,269,025 all verified on Paper 1.21.4
- **`storage_set_int` macro fix**: dynamic NBT array writes now use `execute store result storage` instead of `data modify set value $(n)` — avoids a silent Minecraft macro substitution bug with integer values
- **Full stdlib** (`math.mcrs`, `vec.mcrs`, `advanced.mcrs`, `bigint.mcrs`, `showcase.mcrs`): 18 math functions, 14 vector geometry functions, 20+ advanced number-theory and fractal functions
- **`module library;` pragma**: tree-shaking for library files — stdlib never bloats your pack
- **`storage_get_int` / `storage_set_int` builtins**: dynamic NBT int array read/write with runtime indices via MC 1.20.2+ macro sub-functions
- **`@require_on_load(fn)` decorator**: declarative load-time dependency tracking for sin/cos/atan table initializers

### What's New in v1.2.26

- **Math stdlib** (`math.mcrs`): 18 fixed-point functions — `abs`, `sign`, `min`, `max`, `clamp`, `lerp`, `isqrt`, `sqrt_fixed`, `pow_int`, `gcd`, `lcm`, `sin_fixed`, `cos_fixed`, `map`, `ceil_div`, `log2_int`, `mulfix`, `divfix`, `smoothstep`, `smootherstep`
- **Vector stdlib** (`vec.mcrs`): 2D and 3D geometry — dot/cross products, `length2d_fixed`, `atan2_fixed` (binary search, O(log 46)), `normalize2d`, `rotate2d`, `lerp2d`, full 3D cross product
- **Advanced stdlib** (`advanced.mcrs`): number theory (`fib`, `is_prime`, `collatz_steps`, `gcd`, `mod_pow`), hash/noise (`hash_int` splitmix32, `noise1d`), curves (`bezier_quad`), fractals (`mandelbrot_iter`, `julia_iter`), geometry experiments
- **BigInt** (`bigint.mcrs`): arbitrary precision integers — base 10,000 × 8 limbs = up to 32 decimal digits; `bigint_add/sub/compare/mul/fib` running on MC scoreboard + NBT storage
- **Compiler fixes**: `isqrt` large-number convergence, optimizer copy propagation alias invalidation, cross-function variable collision, MCRuntime array-index regex

### Changelog Highlights

#### v1.2.27 (2026-03-14)

- **BigInt real-MC fix**: `storage_set_int` macro now uses `execute store result storage` instead of `data modify set value $(n)` — avoids a Minecraft macro substitution bug with integer values; BigInt confirmed working on Paper 1.21.4
- **showcase**: `atan2_fixed` returns degrees (0–360), not millidegrees; fixed over-division in examples; `mod_pow` test cases use small safe-range moduli (no INT32 overflow)

#### v1.2.26 (2026-03-14)

- Full math/vector/advanced/bigint standard library (see above)
- `module library;` pragma for zero-cost tree-shaking
- `storage_get_int` / `storage_set_int` dynamic NBT array builtins
- Compiler bug fixes: `isqrt` convergence, copy propagation, variable scoping

#### v1.2.25 (2026-03-13)

- Entity type hierarchy with `W_IMPOSSIBLE_AS` warnings
- Variable name mangling (`$a`, `$b`, `$c`, ...) for minimal scoreboard footprint
- Automated CI/CD: npm publish + VSCode extension on every push

#### v1.2.0

- `impl` blocks, methods, and static constructors
- `is` type narrowing for entity-safe control flow
- `@on(Event)` static events and callback scheduling builtins
- Runtime f-strings for output functions
- Expanded stdlib with Timer OOP APIs and 313 MC tag constants
- Dead code elimination

See [CHANGELOG.md](./CHANGELOG.md) for the full release notes.

---

## Acknowledgements

Parts of the standard library are inspired by [kaer-3058/large_number](https://github.com/kaer-3058/large_number), a comprehensive math library for Minecraft datapacks. RedScript provides a higher-level, type-safe API over similar algorithms.

---

<div align="center">

MIT License · Copyright © 2026 [bkmashiro](https://github.com/bkmashiro)

*Write less. Build more. Ship faster.*

</div>
