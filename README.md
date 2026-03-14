<div align="center">

<img src="./logo.png" alt="RedScript Logo" width="64" />

<img src="https://img.shields.io/badge/RedScript-1.2.26-red?style=for-the-badge&logo=minecraft&logoColor=white" alt="RedScript" />

**A typed scripting language that compiles to Minecraft datapacks.**

Write clean game logic. RedScript handles the scoreboard spaghetti.

[![CI](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-917%20passing-brightgreen)](https://github.com/bkmashiro/redscript)
[![npm](https://img.shields.io/npm/v/redscript-mc?color=cb3837)](https://www.npmjs.com/package/redscript-mc)
[![npm downloads](https://img.shields.io/npm/dm/redscript-mc?color=cb3837)](https://www.npmjs.com/package/redscript-mc)
[![VSCode](https://img.shields.io/badge/VSCode-Extension-007ACC?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=bkmashiro.redscript-vscode)
[![Online IDE](https://img.shields.io/badge/Try-Online%20IDE-orange)](https://redscript-ide.pages.dev)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

[中文版](./README.zh.md) · [Quick Start](#quick-start) · [Docs](https://redscript-docs.pages.dev) · [Contributing](./CONTRIBUTING.md)

### 🚀 [Try it online — no install needed!](https://redscript-ide.pages.dev)

<img src="./demo.gif" alt="RedScript Demo" width="400" />

*↑ Particles spawning at player position every tick — 100% vanilla, no mods! Just 30 lines of RedScript with full control flow: `if`, `foreach`, `@tick`, f-strings, and more.*

</div>

---

### What is RedScript?

RedScript is a typed scripting language that compiles to vanilla Minecraft datapacks. Write clean code with variables, functions, loops, and events — RedScript handles the scoreboard commands and `.mcfunction` files for you.

**The demo above?** Just 30 lines:

```rs
let counter: int = 0;
let running: bool = false;

@tick fn demo_tick() {
    if (!running) { return; }
    counter = counter + 1;
    
    foreach (p in @a) at @s {
        particle("minecraft:end_rod", ~0, ~1, ~0, 0.5, 0.5, 0.5, 0.1, 5);
    }
    
    if (counter % 20 == 0) {
        say(f"Running for {counter} ticks");
    }
}

fn start() {
    running = true;
    counter = 0;
    say(f"Demo started!");
}

fn stop() {
    running = false;
    say(f"Demo stopped at {counter} ticks.");
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
- ✅ One file -> ready-to-use datapack

---

### What's New in v1.2.26

- **Math stdlib** (`math.mcrs`): 18 fixed-point functions — `abs`, `sign`, `min`, `max`, `clamp`, `lerp`, `isqrt`, `sqrt_fixed`, `pow_int`, `gcd`, `lcm`, `sin_fixed`, `cos_fixed`, `map`, `ceil_div`, `log2_int`, `mulfix`, `divfix`, `smoothstep`, `smootherstep`
- **Vector stdlib** (`vec.mcrs`): 2D and 3D geometry — dot/cross products, `length2d_fixed`, `atan2_fixed` (binary search, O(log 46)), `normalize2d`, `rotate2d`, `lerp2d`, full 3D cross product
- **Advanced stdlib** (`advanced.mcrs`): number theory (`fib`, `is_prime`, `collatz_steps`, `gcd`, `mod_pow`), hash/noise (`hash_int` splitmix32, `noise1d`), curves (`bezier_quad`), fractals (`mandelbrot_iter`, `julia_iter`), geometry experiments
- **BigInt** (`bigint.mcrs`): arbitrary precision integers — base 10,000 × 8 limbs = up to 32 decimal digits; `bigint_add/sub/compare/mul/fib` running on MC scoreboard + NBT storage
- **`module library;` pragma**: declare a file as a library; functions are tree-shaken out unless called — stdlib never bloats your pack
- **`storage_get_int` / `storage_set_int` builtins**: dynamic NBT int array read/write with runtime indices via MC 1.20.2 macro sub-functions
- **`@require_on_load(fn)` decorator**: declarative load-time dependency tracking for stdlib initializers (sin/cos table setup etc.)
- **Compiler fixes**: `isqrt` large-number convergence, optimizer copy propagation alias invalidation, cross-function variable collision, MCRuntime array-index regex

### What's New in v1.2.25

- `impl` blocks and methods for object-style APIs on structs
- `is` type narrowing for safer entity checks
- Static events with `@on(Event)`
- Runtime f-strings for `say`, `title`, `actionbar`, and related output
- Timer OOP API with `Timer::new(...)` and instance methods
- `setTimeout(...)` and `setInterval(...)` scheduling helpers
- `break` / `continue`, match range patterns, and full `execute` subcommands
- `foreach` execute context modifiers like `at`, `positioned`, and `rotated`
- Automatic MC 1.20.2+ function macro support for runtime variables
- Builtins now accept macro parameters in any position
- Dead code elimination that preserves public functions automatically
- 313 Minecraft tag constants in the standard library

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
  --no-optimize                Skip optimizer passes
  --stats                      Print optimizer statistics

redscript repl                 Interactive REPL
redscript validate <file>      Validate MC commands
```

---

### Standard Library

All stdlib files use `module library;` — only the functions you actually call are compiled in.

```rs
import "stdlib/math.mcrs"       // abs, sign, min, max, clamp, lerp, isqrt, sqrt_fixed,
                                // pow_int, gcd, lcm, sin_fixed, cos_fixed, map, ceil_div,
                                // log2_int, mulfix, divfix, smoothstep, smootherstep

import "stdlib/vec.mcrs"        // dot2d, cross2d, length2d_fixed, distance2d_fixed,
                                // manhattan, chebyshev, atan2_fixed, normalize2d_x/y,
                                // rotate2d_x/y, lerp2d_x/y, dot3d, cross3d_x/y/z,
                                // length3d_fixed

import "stdlib/advanced.mcrs"   // fib, is_prime, collatz_steps, digit_sum, reverse_int,
                                // mod_pow, hash_int, noise1d, bezier_quad,
                                // mandelbrot_iter, julia_iter, angle_between,
                                // clamp_circle_x/y, newton_sqrt, digital_root

import "stdlib/bigint.mcrs"     // bigint_init, bigint_from_int_a/b, bigint_add/sub/mul,
                                // bigint_compare, bigint_mul_small, bigint_fib
                                // — up to 32 decimal digits, runs on MC scoreboard

import "stdlib/player.mcrs"     // is_alive, in_range, get_health
import "stdlib/timer.mcrs"      // start_timer, tick_timer, has_elapsed
import "stdlib/cooldown.mcrs"   // set_cooldown, check_cooldown
import "stdlib/mobs.mcrs"       // ZOMBIE, SKELETON, CREEPER, ... (60+ constants)
```

**Example — computing Fibonacci(50) in-game:**

```rs
import "stdlib/bigint.mcrs"

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

### Changelog Highlights

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

<div align="center">

MIT License · Copyright © 2026 [bkmashiro](https://github.com/bkmashiro)

*Write less. Build more. Ship faster.*

</div>
