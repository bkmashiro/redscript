<div align="center">

<img src="./logo.png" alt="RedScript Logo" width="72" />

# RedScript

**A typed language and toolchain for building vanilla Minecraft datapacks.**

Write structured code. Compile to `.mcfunction`. Ship without mods.

[![npm](https://img.shields.io/npm/v/redscript-mc?color=cb3837&label=npm)](https://www.npmjs.com/package/redscript-mc)
[![CI](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml/badge.svg)](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml)
[![VSCode](https://img.shields.io/badge/VSCode-Extension-007ACC?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=bkmashiro.redscript-vscode)
[![Datapack](https://img.shields.io/badge/output-vanilla%20datapack-55aa55)](https://redscript-docs.pages.dev)

[中文版](./README.zh.md) · [Documentation](https://redscript-docs.pages.dev) · [Playground](https://redscript-ide.pages.dev)

</div>

---

## Why RedScript?

Minecraft datapacks are powerful, but real projects quickly become piles of selectors, scoreboards, generated functions, and fragile command glue.

RedScript gives you a typed language, optimizer, CLI, LSP, formatter, stdlib, and Minecraft-aware validation loop while still emitting plain vanilla datapacks.

```mcfunction
# Vanilla mcfunction: repeat the selector and command plumbing everywhere
execute as @a[scores={points=100..}] run scoreboard players add @s rewards 1
execute as @a[scores={points=100..}] run scoreboard players set @s points 0
execute as @a[scores={points=100..}] run give @s minecraft:diamond 1
execute as @a[scores={points=100..}] run tellraw @s {"text":"Reward claimed!"}
```

```rs
// RedScript: keep the game logic readable
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

### Try online

**[redscript-ide.pages.dev](https://redscript-ide.pages.dev)** — write code in the browser and download a datapack.

### Install the CLI

```bash
npm install -g redscript-mc
```

### Compile a datapack

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

Drop `my-datapack/` into your world's `datapacks/` folder and run `/reload`.

---

## See it in action

RedScript can drive live Minecraft effects from regular typed code. This demo computes a moving particle ribbon at runtime, then lowers the math into vanilla scoreboard and macro commands for particle rendering.

```rs
let phase: int = 0;
let running: bool = false;

fn draw_point(y: fixed) {
    particle("minecraft:end_rod", ^0, ^y, ^6, 0.02, 0.02, 0.02, 0.0, 6);
}

fn triangle_wave(n: int): int {
    let a: int = n % 120;
    if (a > 60) { a = 120 - a; }
    return a - 30;
}

@tick fn draw_wave() {
    if (!running) { return; }
    phase = (phase + 5) % 120;

    foreach (p in @a) at @s {
        draw_point((triangle_wave(phase) * 700) as fixed);
    }
}
```

Run the full version locally:

```bash
redscript compile examples/hero-demo.mcrs -o /tmp/redscript-hero --namespace rsdemo
```

```mcfunction
/reload
/function rsdemo:start
```

It demonstrates runtime integer math, fixed-point macro parameters, local-coordinate particles, `@load`, `@tick`, functions, globals, selectors, and typed control flow — all compiled into a small vanilla datapack.

<!-- Optional media slot:
<p align="center">
  <img src="./docs/assets/redscript-hero-demo.gif" alt="RedScript live particle demo in Minecraft" width="720" />
</p>
-->

---

## Features

### Language

| Feature | Example |
| --- | --- |
| Variables | `let x: int = 42;` |
| Functions | `fn damage(target: selector, amount: int) { ... }` |
| Control flow | `if`, `else`, `for`, `while`, `foreach`, `match` |
| Structs / impls | `struct Player { score: int, alive: bool }` |
| Enums | `enum State { Lobby, Playing, Ended }` |
| Option / Result | `Some(5)`, `Ok(42)` |
| F-strings | `say(f"Score: {points}");` |
| Modules | `import math; math::sin(45);` |

### Minecraft integration

```rs
@load fn on_reload() {
    say("Datapack loaded.");
}

@tick(rate=20) fn every_second() {
    foreach (p in @a[tag=playing]) {
        title(p, "§aReady", "§7RedScript tick handler");
    }
}

fn clear_nearby_zombies() {
    foreach (zombie in @e[type=zombie, distance=..10]) {
        kill(zombie);
    }
}

@tick fn flame_trail() {
    foreach (p in @a) at @s positioned ~ ~2 ~ {
        particle("minecraft:flame", ~0, ~0, ~0, 0.1, 0.1, 0.1, 0.01, 10);
    }
}
```

### Tooling

- **Compiler pipeline** — parser, type checker, HIR/MIR/LIR lowering, optimizers, and datapack emitter.
- **Minecraft-aware validation** — static command checks plus optional Paper/TestHarness integration tests.
- **LSP + VSCode extension** — hover docs, go-to-definition, completion, diagnostics, snippets, and syntax highlighting.
- **Formatter / linter / test runner** — project tooling for maintaining larger datapacks.
- **Stdlib** — math, vectors, particles, inventory, scheduling, data structures, ECS-style helpers, and more.
- **Numeric tuner** — helper-level `.mcrs` overlay generation with reviewable manifests.

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
redscript tune --adapter sqrt-newton --range 10000:400000 --samples 128 --out tuned.mcrs --manifest-out tuned.tune.json
```

`redscript tune` is helper-level numeric tooling: it writes a reviewable `.mcrs` overlay plus an optional `.tune.json` manifest for the sample range, metrics, overflow report, and regeneration command. It does **not** change the language-level `fixed` scale or silently rewrite checked-in stdlib files.

---

## Standard Library

RedScript ships with stdlib modules for math, data structures, game systems, and MC-specific helpers:

```rs
import math;        // sin, cos, sqrt, interpolation, fixed-scale helpers
import math_hp;     // higher-precision numeric helpers
import vec;         // 2D/3D vectors, dot, cross, normalize
import random;      // random generators
import particles;   // particle helpers
import inventory;   // slot manipulation
import scheduler;   // delayed execution
import ecs;         // entity-component style helpers
```

Full list: [Stdlib Documentation](https://redscript-docs.pages.dev/en/stdlib/)

> **Attribution:** The `bigint` module's multi-precision arithmetic approach was inspired by [kaer-3058/large_number](https://github.com/kaer-3058/large_number).

---

## Examples

| File | Description |
| --- | --- |
| [`hero-demo.mcrs`](./examples/hero-demo.mcrs) | Live particle ribbon demo |
| [`readme-demo.mcrs`](./examples/readme-demo.mcrs) | Compact real-time sine wave |
| [`showcase.mcrs`](./examples/showcase.mcrs) | Larger feature tour |
| [`loops-demo.mcrs`](./examples/loops-demo.mcrs) | Loop constructs |

More examples live in [`examples/`](./examples/).

---

## Documentation

- **[Getting Started](https://redscript-docs.pages.dev/en/guide/)** — installation and first project
- **[Language Reference](https://redscript-docs.pages.dev/en/reference/)** — syntax and semantics
- **[Stdlib Reference](https://redscript-docs.pages.dev/en/stdlib/)** — generated stdlib docs
- **[CLI Reference](https://redscript-docs.pages.dev/en/reference/cli)** — command-line options

---

## Development

```bash
npm install
npm run build
npm run test:unit       # pure TS/unit tests, parallel
npm run test:integration # mc-integration project, serial
npm run gate:full       # heavyweight release-style gate
```

See [AGENTS.md](./AGENTS.md) and [compiler hardening roadmap](./docs/plans/compiler-mc-hardening-roadmap.md) for current architecture and verification notes.

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
