<div align="center">

<img src="https://img.shields.io/badge/RedScript-1.0-red?style=for-the-badge&logo=minecraft&logoColor=white" alt="RedScript" />

**A typed scripting language that compiles to Minecraft datapacks.**

Write clean game logic. RedScript handles the scoreboard spaghetti.

[![CI](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-510%20passing-brightgreen)](https://github.com/bkmashiro/redscript)
[![npm](https://img.shields.io/npm/v/redscript-mc?color=cb3837)](https://www.npmjs.com/package/redscript-mc)
[![npm downloads](https://img.shields.io/npm/dm/redscript-mc?color=cb3837)](https://www.npmjs.com/package/redscript-mc)
[![VSCode](https://img.shields.io/badge/VSCode-Extension-007ACC?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=bkmashiro.redscript-vscode)
[![Online IDE](https://img.shields.io/badge/Try-Online%20IDE-orange)](https://redscript-ide.pages.dev)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

[中文版](./README.zh.md) · [Quick Start](#quick-start) · [Docs](https://redscript-docs.pages.dev) · [Contributing](./CONTRIBUTING.md)

### 🚀 [Try it online — no install needed!](https://redscript-ide.pages.dev)

</div>

---

### What is RedScript?

You want to make a Minecraft mini-game. You need a countdown timer, kill counter, respawn logic, and a scoreboard display. In vanilla MC, that's 40+ `.mcfunction` files, hundreds of `execute if score` commands, and a weekend of debugging.

With RedScript, it's this:

```rs
// pvp_game.mcrs
import "stdlib/player.mcrs"

const GAME_TIME: int = 300;

@tick(rate=20)
fn every_second() {
    let time: int = scoreboard_get(#game, #timer);

    if (time <= 0) {
        end_game();
        return;
    }

    scoreboard_set(#game, #timer, time - 1);
    actionbar(@a, "⏱ ${time}s remaining");
}

fn start_game() {
    scoreboard_set(#game, #timer, GAME_TIME);
    scoreboard_set(#game, #running, 1);
    title(@a, "Fight!", "Game started");
    tp(@a, (0, 64, 0));
}

fn end_game() {
    scoreboard_set(#game, #running, 0);
    title(@a, "Game Over!");
    announce("Thanks for playing!");
}

@on_death
fn on_kill() {
    scoreboard_add(@s, #kills, 1);
}
```

One file. Compiles to a ready-to-use datapack in seconds.

---

### Quick Start

#### Option 1: Online IDE (No Install)

**[→ redscript-ide.pages.dev](https://redscript-ide.pages.dev)** — Write code, see output instantly.

#### Option 2: VSCode Extension

1. Install [RedScript for VSCode](https://marketplace.visualstudio.com/items?itemName=bkmashiro.redscript-vscode)
2. Get syntax highlighting, auto-complete, hover docs, and more

#### Option 3: CLI

```bash
npm install -g redscript-mc
redscript compile game.mcrs -o ./my-datapack
```

```
✓ Compiled pvp_game.mcrs
  Namespace : pvp_game
  Functions : 7
  Commands  : 34  →  28  (optimizer: −18%)
  Output    : ./my-datapack/
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
    summon("minecraft:zombie", (i, 64, 0));
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

```rs
import "stdlib/math.mcrs"       // abs, min, max, clamp
import "stdlib/player.mcrs"     // is_alive, in_range, get_health
import "stdlib/timer.mcrs"      // start_timer, tick_timer, has_elapsed
import "stdlib/cooldown.mcrs"   // set_cooldown, check_cooldown
import "stdlib/mobs.mcrs"       // ZOMBIE, SKELETON, CREEPER, ... (60+ constants)
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

<div align="center">

MIT License · Copyright © 2026 [bkmashiro](https://github.com/bkmashiro)

*Write less. Build more. Ship faster.*

</div>
