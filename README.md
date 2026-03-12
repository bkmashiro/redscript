# RedScript

[![CI](https://img.shields.io/github/actions/workflow/status/bkmashiro/redscript/ci.yml?style=flat-square)](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](https://github.com/bkmashiro/redscript/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

RedScript is a typed, C-style language that compiles to Minecraft Java Edition datapacks. It gives datapack authors selectors, scoreboards, NBT-backed data, triggers, and entity-driven logic in one higher-level language instead of raw `.mcfunction` files.

```rs
@tick(rate=20)
fn check_zombies() {
    foreach (z in @e[type=zombie, distance=..10]) {
        kill(z);
    }
}

@on_trigger("claim_reward")
fn handle_claim() {
    give(@s, "minecraft:diamond", 1);
    title(@s, "Zombie Slayer!");
}
```

RedScript compiles that into the datapack plumbing Minecraft actually needs: tick tags, trigger objectives, dispatch functions, selector-scoped execution, and plain `.mcfunction` output.

## Features

- ✅ C-style syntax compiles to Minecraft datapacks
- ✅ Entity selectors as first-class types (`@e[type=zombie, distance=..5]`)
- ✅ `foreach` loops -> `execute as ... run function`
- ✅ `@tick` / `@tick(rate=N)` decorators with software timer codegen
- ✅ `@on_trigger` for non-operator player input via `/trigger`
- ✅ Structs backed by NBT storage
- ✅ `@entity_backed` structs for armor-stand-style world objects
- ✅ `float` type with fixed-point `x1000` lowering
- ✅ String interpolation in `tellraw`-backed output
- ✅ NBT literals with `nbt {}` syntax
- ✅ `scoreboard_get` / `scoreboard_set` for vanilla Minecraft interop
- ✅ `MCRuntime` simulator for behavioral testing
- ✅ VSCode extension with syntax highlighting and snippets
- ✅ CLI workflows for `compile`, `check`, and `watch`
- ✅ 265+ tests (currently 349 test cases in `src/__tests__`)

## Quick Start

Install dependencies and build the compiler:

```bash
npm install
npm run build
```

Write `hello.rs`:

```rs
@tick
fn hello_tick() {
    tell(@a, "RedScript is running.");
}

@on_trigger("hello_reward")
fn hello_reward() {
    give(@s, "minecraft:apple", 1);
    tell(@s, "Enjoy your reward!");
}
```

Compile it into a datapack:

```bash
node dist/cli.js compile hello.rs -o dist/hello --namespace hello
```

Use it in Minecraft Java Edition:

1. Copy `dist/hello/` into your world's `datapacks/` folder.
2. Start the world or run `/reload`.
3. Run `/function hello:__load` if needed, then use `/trigger hello_reward`.
4. The generated tick/load tags will keep `@tick` and trigger handlers wired up.

During development, `watch` and `check` are available too:

```bash
node dist/cli.js check hello.rs
node dist/cli.js watch . -o dist/devpacks
```

## Why RedScript

Minecraft commands are powerful, but large datapacks become hard to maintain when every behavior is handwritten in raw command syntax. RedScript keeps the generated output transparent while giving you a real source language with functions, control flow, structs, selectors, timers, and reusable examples for common datapack patterns.

The current examples cover recurring gameplay systems such as tick counters, trigger-driven shops, score-based arenas, armor-stand turrets, and quiz logic. See [`src/examples/README.md`](/Users/yuzhe/projects/redscript/src/examples/README.md) and [`src/test_programs/zombie_game.rs`](/Users/yuzhe/projects/redscript/src/test_programs/zombie_game.rs).

## Language Reference

This is the abbreviated version. The examples and tests are the best source of current behavior.

| Area | RedScript |
| :-- | :-- |
| Control flow | `if`, `else`, `while`, `for`, `foreach`, `return` |
| Decorators | `@tick`, `@tick(rate=20)`, `@on_trigger("name")`, `@entity_backed` |
| Entity ops | selectors like `@a`, `@s`, `@e[...]`; `as @e[...] { ... }`; `at @s { ... }`; selector-aware builtins |
| Builtins | `say`, `tell`, `title`, `give`, `kill`, `effect`, `raw`, `random`, `spawn_object`, `scoreboard_get`, `scoreboard_set` |
| Types | `int`, `bool`, `float`, `string`, `void`, structs, arrays, selector values |

### Core patterns

```rs
if (scoreboard_get("@s", "kills") > 10) {
    title(@s, "Boss unlocked");
}

foreach (player in @a) {
    tell(player, "Welcome back");
}

struct Counter { value: int }

fn bump() {
    let c: Counter = { value: 0 };
    c.value += 1;
}
```

## CLI

RedScript ships with a small compiler CLI:

```bash
redscript compile <file> [-o <outdir>] [--namespace <ns>] [--target datapack|cmdblock]
redscript check <file>
redscript watch <dir> [-o <outdir>] [--namespace <ns>]
redscript version
```

The default target is a full datapack. There is also an experimental command-block JSON target for command block placement workflows.

## VSCode Extension

A bundled VSCode extension lives in [`editors/vscode`](/Users/yuzhe/projects/redscript/editors/vscode). It provides:

- syntax highlighting for RedScript and generated `.mcfunction`
- snippets for `@tick`, `@on_trigger`, `foreach`, `struct`, and more
- a practical editing workflow while the compiler and language tooling mature

## Comparison

| Tool | Best fit |
| :-- | :-- |
| RedScript | Typed, compiler-style datapack development with selectors, structs, triggers, and predictable codegen |
| JMC | Macro-oriented command authoring when you want a lighter abstraction over command generation |
| Bolt | JavaScript-driven datapack generation when you prefer a host-language scripting model |

RedScript is aimed at authors who want a purpose-built language rather than a macro layer or a general-purpose scripting language embedded into the build process.

## Architecture

The compiler pipeline is intentionally straightforward:

```text
source (.rs)
  -> tokens
  -> AST
  -> IR
  -> optimizer
  -> codegen
  -> datapack / command-block output
```

- Lexer and parser turn RedScript source into an AST.
- Lowering converts the AST into a compiler IR tailored to Minecraft command generation.
- Optimization runs passes such as constant folding, copy propagation, and dead-code elimination.
- Codegen emits datapack files, tick/load tags, trigger dispatch functions, and Minecraft command output.

Key implementation entry points:

- [`src/lexer/index.ts`](/Users/yuzhe/projects/redscript/src/lexer/index.ts)
- [`src/parser/index.ts`](/Users/yuzhe/projects/redscript/src/parser/index.ts)
- [`src/lowering/index.ts`](/Users/yuzhe/projects/redscript/src/lowering/index.ts)
- [`src/optimizer/passes.ts`](/Users/yuzhe/projects/redscript/src/optimizer/passes.ts)
- [`src/codegen/mcfunction/index.ts`](/Users/yuzhe/projects/redscript/src/codegen/mcfunction/index.ts)

## Testing

RedScript has broad test coverage across lexing, parsing, lowering, code generation, diagnostics, CLI behavior, and end-to-end datapack output. There are currently 349 test cases under [`src/__tests__`](/Users/yuzhe/projects/redscript/src/__tests__).

Run the suite with:

```bash
npm test
```

## Roadmap

- [ ] LSP / language server
- [ ] Real MC integration tests (Paper + RCON)
- [ ] VSCode marketplace publish
- [ ] Package registry (publish RedScript compiler as npm package)
- [ ] Import system (multi-file projects)

## Project Status

RedScript already covers the core loop of writing typed gameplay logic, compiling it to datapacks, and validating behavior with tests. The next major step is making the developer experience sharper: better editor integration, multi-file project support, stronger real-server verification, and an easier install story.
