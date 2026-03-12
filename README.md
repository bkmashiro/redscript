# RedScript

[![CI](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/redscript)](https://www.npmjs.com/package/redscript)
[![license](https://img.shields.io/badge/license-not%20specified-lightgrey)](./package.json)

RedScript is a compiler for Minecraft Java Edition datapacks and command block workflows. It lets you write gameplay logic in a compact C-style language, then compiles that code into `.mcfunction` datapacks or command block JSON.

## Quick Start

Install dependencies and build the CLI:

```bash
npm install
npm run build
```

Compile a real example program:

```bash
node dist/cli.js compile src/examples/turret.rs -o dist/turret --namespace turret
```

That generates a datapack layout under `dist/turret/`, including files such as:

```text
dist/turret/
├── pack.mcmeta
├── data/minecraft/tags/function/load.json
├── data/minecraft/tags/function/tick.json
└── data/turret/function/
    ├── __load.mcfunction
    ├── __tick.mcfunction
    ├── deploy_turret.mcfunction
    └── turret_tick.mcfunction
```

You can also target command block JSON:

```bash
node dist/cli.js compile src/examples/turret.rs -o dist/cmdblocks --namespace turret --target cmdblock
```

For iterative workflows, watch a directory and recompile on change:

```bash
node dist/cli.js watch src/examples -o dist/examples
```

## Status

Everything below is implemented in the current compiler:

- `Lexer -> Parser -> AST -> IR Lowering -> Optimizer -> CodeGen`
- Datapack code generation (`.mcfunction`)
- Command block JSON generation
- `@tick`, `@tick(rate=N)`, and `@on_trigger(...)`
- Functions, structs, arrays, control flow, selectors, and execute blocks
- Constant folding, copy propagation, and dead code elimination
- Watch mode in the CLI
- VSCode syntax highlighting and snippets
- GitHub Actions CI
- 282 passing tests across 9 test suites
- Working examples: `turret`, `arena`, `shop`, `quiz`, `counter`

## Architecture

```text
Source code (.rs)
      |
      v
   Lexer / Parser
      |
      v
     AST
      |
      v
  IR Lowering  <--- IRBuilder
      |
      v
  Optimizer  <--- constant folding, copy propagation, DCE
      |
      v
  Code Generator
      |- mcfunction datapack output
      `- command block JSON output
```

## Language Features

### Basic types and functions

```rs
fn add(a: int, b: int) -> int {
    return a + b;
}

fn announce(name: string) {
    tell(@a, "A player joined.");
}
```

Supported primitive types:

- `int`
- `bool`
- `float` (stored as fixed-point values scaled by `1000`)
- `string`
- `void`

### Control flow

```rs
fn loops() {
    let i: int = 0;

    while (i < 10) {
        i += 1;
    }

    for (let j: int = 0; j < 5; j += 1) {
        say("tick");
    }

    foreach (player in @a) {
        title(player, "Ready");
    }
}
```

### Structs

```rs
struct TurretState { health: int }

fn create_state() {
    let state: TurretState = { health: 40 };
    let hp = state.health;
    scoreboard_set("turret", "health", hp);
}
```

### Tick and trigger handlers

```rs
@tick(rate=20)
fn turret_tick() {
    foreach (z in @e[type=zombie, distance=..8]) {
        kill(z);
    }
}

@on_trigger("shop_buy")
fn handle_shop_trigger() {
    give(@s, "minecraft:bread", 1);
}
```

### Execute context blocks

```rs
fn effects() {
    as @a {
        say("Running as each player");
    }

    at @s {
        particle("flame", "~", "~", "~");
    }

    execute as @a if entity @s[tag=vip] run {
        title(@s, "VIP");
    }
}
```

### Scoreboards, selectors, and world interaction

```rs
fn scoreboard_logic() {
    let kills: int = scoreboard_get(@s, "kills");

    if (kills > 10) {
        give(@s, "minecraft:diamond", 1);
    }
}

fn deploy() {
    let turret = spawn_object(0, 64, 0);
    turret.tag("turret");
}
```

## Builtins Reference

| Builtin | Purpose | Example |
|:--|:--|:--|
| `say(msg)` | Emit `say` | `say("Hello");` |
| `tell(sel, msg)` | Emit `tellraw` text | `tell(@s, "Ready.");` |
| `title(sel, msg)` | Show a title | `title(@a, "Fight!");` |
| `give(sel, item, count?)` | Give an item | `give(@s, "minecraft:bread", 1);` |
| `effect(sel, effect, duration?, amplifier?)` | Apply a status effect | `effect(@s, "speed", 10, 1);` |
| `summon(type, x?, y?, z?, nbt?)` | Summon an entity | `summon("zombie", "~", "~", "~");` |
| `particle(name, x?, y?, z?)` | Emit particles | `particle("flame", "~", "~", "~");` |
| `tp(sel, x?, y?, z?)` | Teleport an entity | `tp(@s, "~", "~1", "~");` |
| `setblock(x, y, z, block)` | Place a block | `setblock("~", "~", "~", "minecraft:stone");` |
| `kill(sel?)` | Kill entities, defaulting to `@s` | `kill(@e[type=zombie]);` |
| `scoreboard_get(target, objective)` | Read a scoreboard value into an `int` | `let x: int = scoreboard_get(@s, "kills");` |
| `score(target, objective)` | Alias of `scoreboard_get` | `let x: int = score(@s, "kills");` |
| `scoreboard_set(target, objective, value)` | Write a scoreboard value | `scoreboard_set(@s, "kills", 0);` |
| `data_get(kind, target, path, scale?)` | Read NBT data into an `int` | `let hp = data_get("entity", @s, "Health", 1);` |
| `random(min, max)` | Generate a random integer via `/random value` | `let roll: int = random(1, 6);` |
| `spawn_object(x, y, z)` | Spawn an invisible armor-stand-backed world object | `let turret = spawn_object(0, 64, 0);` |
| `raw(cmd)` | Escape hatch for a literal Minecraft command | `raw("gamemode creative @a");` |
| `entity.tag(name)` | Add a tag to an entity selector or object handle | `@s.tag("boss");` |
| `entity.untag(name)` | Remove a tag | `@s.untag("boss");` |
| `entity.has_tag(name)` | Check for a tag and return `bool` | `let boss: bool = @s.has_tag("boss");` |

## Examples

The repository ships with working example programs in `src/examples/`:

- `counter.rs`: periodic scoreboard counter with `@tick`
- `arena.rs`: PvP scoreboard aggregation with `foreach`
- `shop.rs`: trigger-driven purchases
- `quiz.rs`: multi-trigger quiz state machine
- `turret.rs`: structs, world objects, tags, nested `foreach`, and `at` blocks

## Tooling

- CLI commands: `compile`, `watch`, `check`, `version`
- VSCode extension in `editors/vscode/`
- GitHub Actions CI for `npm test` and `npm run build`

## Documentation

- `docs/LANGUAGE_REFERENCE.md`: syntax and builtin reference
- `docs/MC_MAPPING.md`: how RedScript lowers language constructs to Minecraft commands
- `docs/IMPLEMENTATION_GUIDE.md`: implementation notes for the compiler internals
