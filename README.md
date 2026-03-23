<div align="center">

<img src="./logo.png" alt="RedScript Logo" width="64" />

# RedScript

**A typed language that compiles to Minecraft datapacks.**

Write clean code. Get vanilla datapacks. No mods required.

[![npm](https://img.shields.io/npm/v/redscript-mc?color=cb3837&label=npm)](https://www.npmjs.com/package/redscript-mc)
[![CI](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml/badge.svg)](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-3886%20passing-brightgreen)](https://github.com/bkmashiro/redscript)
[![VSCode](https://img.shields.io/badge/VSCode-Extension-007ACC?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=bkmashiro.redscript-vscode)

[中文版](./README.zh.md) · [Documentation](https://redscript-docs.pages.dev) · [Playground](https://redscript-ide.pages.dev)

</div>

---

## Why RedScript?

Minecraft datapacks are powerful but painful to write:

```mcfunction
# Vanilla: Check if player has 100+ score and give reward
execute as @a[scores={points=100..}] run scoreboard players add @s rewards 1
execute as @a[scores={points=100..}] run scoreboard players set @s points 0
execute as @a[scores={points=100..}] run give @s minecraft:diamond 1
execute as @a[scores={points=100..}] run tellraw @s {"text":"Reward claimed!"}
```

```rs
// RedScript: Same logic, readable
@tick fn check_rewards() {
    foreach (p in @a) {
        if (scoreboard_get(p, #points) >= 100) {
            scoreboard_add(p, #rewards, 1);
            scoreboard_set(p, #points, 0);
            give(p, "minecraft:diamond", 1);
            tell(p, "Reward claimed!");
        }
    }
}
```

## Quick Start

### Try Online (No Install)

**[→ redscript-ide.pages.dev](https://redscript-ide.pages.dev)** — Write code, download datapack.

### Install CLI

```bash
npm install -g redscript-mc
```

### Hello World

```rs
// hello.mcrs
@load fn init() {
    say("Hello from RedScript!");
}

@tick fn game_loop() {
    foreach (p in @a[tag=playing]) {
        effect(p, "minecraft:speed", 1, 0, true);
    }
}
```

```bash
redscript build hello.mcrs -o ./my-datapack
```

Drop `my-datapack/` into your world's `datapacks/` folder, run `/reload`. Done.

---

## Features

### Language

| Feature | Example |
|---------|---------|
| Variables | `let x: int = 42;` |
| Functions | `fn damage(target: selector, amount: int) { ... }` |
| Control flow | `if`, `else`, `for`, `while`, `foreach`, `match` |
| Structs | `struct Player { score: int, alive: bool }` |
| Enums | `enum State { Lobby, Playing, Ended }` |
| Option type | `let item: Option<int> = Some(5);` |
| Result type | `let r: Result<int, string> = Ok(42);` |
| F-strings | `say(f"Score: {points}");` |
| Modules | `import math; math::sin(45);` |

### Minecraft Integration

```rs
// Decorators for game events
@tick fn every_tick() { }
@tick(rate=20) fn every_second() { }
@load fn on_datapack_load() { }
@on(PlayerJoin) fn welcome(p: Player) { }

// Entity selectors work naturally
foreach (zombie in @e[type=zombie, distance=..10]) {
    kill(zombie);
}

// Execute subcommands
foreach (p in @a) at @s positioned ~ ~2 ~ {
    particle("minecraft:flame", ~0, ~0, ~0, 0.1, 0.1, 0.1, 0.01, 10);
}

// Coroutines for heavy work (spread across ticks)
@coroutine(batch=100)
fn process_all() {
    for (let i = 0; i < 10000; i = i + 1) {
        // Won't lag — runs 100 iterations per tick
    }
}
```

### Tooling

- **15 optimizer passes** — Dead code elimination, constant folding, inlining, etc.
- **LSP** — Hover docs, go-to-definition, auto-complete, diagnostics
- **VSCode Extension** — Full syntax highlighting and snippets
- **50 stdlib modules** — Math, vectors, pathfinding, particles, and more

---

## CLI Commands

```bash
redscript build <file>     # Compile with optimizations
redscript compile <file>   # Compile without optimizations
redscript check <file>     # Type check only
redscript fmt <file>       # Format code
redscript lint <file>      # Static analysis
redscript test <file>      # Run @test functions
redscript watch <dir>      # Watch mode with hot reload
redscript docs [module]    # Open stdlib docs
```

---

## Standard Library

50 modules covering math, data structures, game systems, and MC-specific helpers:

```rs
import math;        // sin, cos, sqrt, pow, abs
import vec;         // 2D/3D vectors, dot, cross, normalize
import random;      // LCG/PCG random generators
import pathfind;    // A* pathfinding
import particles;   // Particle helpers
import inventory;   // Slot manipulation
import scheduler;   // Delayed execution
import ecs;         // Entity-component system
// ... and 42 more
```

Full list: [Stdlib Documentation](https://redscript-docs.pages.dev/stdlib/)

---

## Examples

| File | Description |
|------|-------------|
| [`loops-demo.mcrs`](./examples/loops-demo.mcrs) | All loop constructs |
| [`showcase.mcrs`](./examples/showcase.mcrs) | Full feature tour |

More in the [`examples/`](./examples/) directory.

---

## Documentation

- **[Getting Started](https://redscript-docs.pages.dev/guide/)** — Installation and first project
- **[Language Reference](https://redscript-docs.pages.dev/reference/)** — Complete syntax guide
- **[Stdlib Reference](https://redscript-docs.pages.dev/stdlib/)** — All 50 modules documented
- **[CLI Reference](https://redscript-docs.pages.dev/cli/)** — Command line options

---

## Links

- [Online Playground](https://redscript-ide.pages.dev)
- [VSCode Extension](https://marketplace.visualstudio.com/items?itemName=bkmashiro.redscript-vscode)
- [npm Package](https://www.npmjs.com/package/redscript-mc)
- [Changelog](./CHANGELOG.md)
- [Contributing](./CONTRIBUTING.md)

---

<div align="center">

MIT License · [bkmashiro](https://github.com/bkmashiro)

</div>
