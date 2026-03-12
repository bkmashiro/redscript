# RedScript

[![CI](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/redscript)](https://www.npmjs.com/package/redscript)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-423%20passing-brightgreen)](./src/__tests__)

A compiled, typed scripting language that targets Minecraft datapacks and structure files. Write clean, readable game logic — RedScript compiles it to optimized `.mcfunction` files and NBT structures ready to drop into any 1.21+ world.

```rs
// counter.rs
@tick
fn counter_tick() {
    let ticks: int = scoreboard_get("counter", "ticks");
    ticks = ticks + 1;
    scoreboard_set("counter", "ticks", ticks);

    if (ticks % 100 == 0) {
        say("Counter reached another 100 ticks");
    }
}
```

```bash
redscript compile counter.rs -o ./datapack
# ✓ Compiled counter.rs → datapack/
#   Namespace: counter  |  Functions: 4  |  Commands: 12
```

---

## Features

| | |
|---|---|
| **Typed variables** | `let x: int = 42;` with full type inference |
| **Functions** | First-class, default params, call chains |
| **Control flow** | `if/else`, `for`, `while`, `match` |
| **Lambdas** | Higher-order functions via monomorphization |
| **Structs & Enums** | Composite types with pattern matching |
| **Arrays** | NBT storage-backed, with push/pop/len/foreach |
| **String interpolation** | `"Hello ${player}!"` |
| **Decorators** | `@tick`, `@tick(rate=20)`, `@on_advancement`, `@on_death`, `@on_craft` |
| **Selectors** | `@s`, `@a`, `@e[type=zombie]` with type safety |
| **Imports** | Multi-file projects with `import "path/to/file.rs"` |
| **Constants** | Compile-time inlined `const` |
| **MC builtins** | 34+ builtins: `say`, `tp`, `setblock`, `fill`, `give`, `scoreboard`, `bossbar`, `team`, `effect`, and more |
| **Optimizer** | LICM, CSE, dead store elimination, setblock→fill batching |
| **Two targets** | `--target datapack` (default) or `--target structure` (NBT command block structure) |
| **Validator** | MC 1.21.4 command syntax validation with warnings |
| **REPL** | Interactive `redscript repl` for quick testing |

---

## Installation

```bash
npm install -g redscript
```

Or from source:

```bash
git clone https://github.com/bkmashiro/redscript
cd redscript
npm install && npm run build
npm link
```

---

## Quick Start

### 1. Write a script

```rs
// game.rs
import "stdlib/player.rs"

const MAX_SCORE: int = 100;

@tick(rate=20)
fn every_second() {
    let alive: int = scoreboard_get("#game", "alive");
    if (alive == 0) {
        end_game();
    }
}

fn end_game() {
    title(@a, "Game Over");
    scoreboard_set("#game", "running", 0);
}
```

### 2. Compile

```bash
# Compile to datapack
redscript compile game.rs -o ./my-datapack

# Compile to NBT structure (command blocks)
redscript compile game.rs --target structure -o ./structures

# Show optimization stats
redscript compile game.rs --stats
```

### 3. Deploy

Copy the output to your world's `datapacks/` folder and run `/reload`.

---

## Language Overview

### Variables & Types

```rs
let x: int = 42;
let name: string = "Steve";
let pos: BlockPos = (10, 64, -5);
let rel: BlockPos = (~1, ~0, ~-1);   // relative
let loc: BlockPos = (^0, ^1, ^0);   // local
```

### Functions & Default Params

```rs
fn greet(player: selector, msg: string = "Hello!") {
    tell(player, msg);
}

greet(@s);               // uses default
greet(@a, "Welcome!");   // override
```

### Decorators

```rs
@tick                      // runs every tick
fn heartbeat() { ... }

@tick(rate=20)             // runs every 20 ticks (1 second)
fn every_second() { ... }

@on_advancement("story/mine_diamond")
fn got_diamond() {
    give(@s, "minecraft:diamond", 1);
}

@on_death
fn on_player_death() {
    scoreboard_set(@s, "deaths", scoreboard_get(@s, "deaths") + 1);
}
```

### Structs & Enums

```rs
struct Vec2 {
    x: int,
    y: int,
}

enum GameState {
    Waiting,
    Running,
    Ended,
}
```

### Match

```rs
match (state) {
    GameState::Waiting => { announce("Waiting for players..."); }
    GameState::Running => { every_second(); }
    GameState::Ended   => { show_results(); }
}
```

### Lambdas

```rs
fn apply(f: (int) -> int, x: int) -> int {
    return f(x);
}

let double = (x: int) -> int { return x * 2; };
let result = apply(double, 5);  // 10
```

### Selectors

```rs
tp(@s, (0, 64, 0));
tell(@a[distance=..10], "You're close!");
scoreboard_set(@e[type=minecraft:zombie], "hp", 20);
```

---

## Standard Library

```rs
import "stdlib/math.rs"       // abs, min, max, clamp
import "stdlib/player.rs"     // is_alive, in_range, get_health
import "stdlib/timer.rs"      // start_timer, tick_timer, has_elapsed
import "stdlib/cooldown.rs"   // set_cooldown, check_cooldown
import "stdlib/mobs.rs"       // ZOMBIE, SKELETON, CREEPER, ... (60+ entity constants)
import "stdlib/strings.rs"    // str_len
```

---

## Structure Target

Compile to an NBT `.nbt` structure file containing command blocks:

```bash
redscript compile game.rs --target structure -o ./structures
```

RedScript generates impulse → chain → repeat command block layouts, automatically optimizing with the structure optimizer (conditional chain flattening, CSE, LICM, setblock→fill batching).

See [docs/STRUCTURE_TARGET.md](docs/STRUCTURE_TARGET.md) for details.

---

## Optimizer

RedScript includes a multi-pass optimizer:

| Pass | Description |
|------|-------------|
| Dead store elimination | Removes unused `$tmp` assignments |
| Branch variable elimination | Removes `$cond` vars when branch is unconditional |
| LICM | Hoists loop-invariant commands out of loops |
| CSE | Eliminates duplicate scoreboard reads |
| Setblock batching | Merges adjacent same-block `setblock` → `fill` |
| Conditional chain flattening | (Structure target) Flattens simple branches |

```bash
redscript compile large_script.rs --stats
# Optimizer stats:
#   dead stores removed:    12
#   setblock→fill batches:   3  (saved 8 commands)
#   LICM hoists:             2
#   CSE eliminations:        5
```

---

## Integration Testing

RedScript ships with a real Minecraft integration test suite that runs compiled datapacks on a live Paper 1.21.4 server.

See [redscript-testharness](https://github.com/bkmashiro/redscript-testharness) for the Paper plugin.

```bash
# Start Paper server (with redscript-testharness plugin)
# Then:
MC_SERVER_DIR=~/mc-test-server npx jest mc-integration --testTimeout=120000
```

Tests cover: setblock/fill, scoreboard arithmetic, @tick dispatch, entity queries, fill optimizer correctness, call chains, temp var isolation, and game loop logic.

---

## CLI Reference

```
Usage: redscript <command> [options]

Commands:
  compile <file>    Compile a .rs file to a datapack or structure
  repl              Start interactive REPL
  validate <file>   Validate MC commands without compiling

Options:
  -o, --output <dir>      Output directory (default: ./out)
  --target <target>       Output target: datapack | structure (default: datapack)
  --namespace <ns>        Datapack namespace (default: derived from filename)
  --no-optimize           Disable optimizer passes
  --stats                 Print optimizer statistics
  --validate              Run MC command validation after compile
```

---

## Documentation

- [Language Reference](docs/LANGUAGE_REFERENCE.md)
- [MC Command Mapping](docs/MC_MAPPING.md)
- [Structure Target](docs/STRUCTURE_TARGET.md)
- [Compilation Stats](docs/COMPILATION_STATS.md)
- [Implementation Guide](docs/IMPLEMENTATION_GUIDE.md)
- [GitHub Wiki](https://github.com/bkmashiro/redscript/wiki)

---

## License

MIT © [bkmashiro](https://github.com/bkmashiro)
