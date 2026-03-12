# RedScript to Minecraft Mapping

This document explains how the compiler maps RedScript constructs onto Minecraft commands and generated files.

## Pipeline Overview

The compiler pipeline is:

```text
Lexer -> Parser -> AST -> IR Lowering -> Optimizer -> CodeGen
```

The lowering stage converts RedScript syntax into a simple three-address IR. The optimizer rewrites that IR, and code generation emits datapack files or command block JSON.

## Variables

### Local scalar variables

Scalar locals such as `int`, `bool`, and fixed-point `float` values are stored as scoreboard entries on the `rs` objective.

Example RedScript:

```rs
fn sample() {
    let x: int = 42;
}
```

Typical generated command pattern:

```mcfunction
scoreboard players set $x rs 42
```

The compiler uses fake-player names such as:

- `$x`
- `$t0`
- `$ret`

This keeps temporary values and user variables addressable through standard scoreboard operations.

### Booleans

Booleans are represented as:

- `0` for false
- `1` for true

Conditions are compiled into `execute if score ... matches 1..` style checks.

### Floats

`float` values are stored as fixed-point integers scaled by `1000`.

Example:

```rs
let speed: float = 1.5;
```

becomes an internal scoreboard value of `1500`.

Multiplication and division insert scaling correction steps during lowering so arithmetic remains approximately correct under the fixed-point scheme.

## Functions

Each RedScript function becomes one or more `.mcfunction` files in the generated namespace.

Example:

```rs
fn reward_player() {
    give(@s, "minecraft:diamond", 1);
}
```

becomes a datapack function like:

```text
data/<namespace>/function/reward_player.mcfunction
```

Function calls map to Minecraft `function` commands:

```mcfunction
function <namespace>:reward_player
```

The compiler also generates runtime entrypoints such as:

- `__load.mcfunction`
- `__tick.mcfunction`
- trigger dispatch helpers like `__trigger_<name>_dispatch.mcfunction`

## Control Flow

RedScript control flow is lowered into basic blocks and conditional jumps, then emitted as `execute if score ... run function ...` patterns.

Examples:

- `if` creates conditional branches plus merge blocks.
- `while` and `for` create explicit loop check, body, and exit blocks.
- `foreach` extracts the loop body into a helper function and runs it with `execute as <selector> run function ...`.

## Selectors and Execution Context

Selectors such as `@a`, `@e[type=zombie]`, and `@s` are preserved directly in emitted commands.

Context blocks map as follows:

| RedScript | Minecraft form |
|:--|:--|
| `as @a { ... }` | `execute as @a run function ...` |
| `at @s { ... }` | `execute at @s run function ...` |
| `execute as @a if entity @s[tag=vip] run { ... }` | `execute as @a if entity @s[tag=vip] run function ...` |

The body is extracted into a helper `.mcfunction` so the generated `execute` command stays simple and composable.

## Builtins

Many RedScript builtins compile almost directly to one Minecraft command.

Examples:

| RedScript | Generated command pattern |
|:--|:--|
| `say("Hello")` | `say Hello` |
| `give(@s, "minecraft:bread", 1)` | `give @s minecraft:bread 1` |
| `kill(@e[type=zombie])` | `kill @e[type=zombie]` |
| `title(@a, "Fight!")` | `title @a title {"text":"Fight!"}` |
| `scoreboard_set(@s, "kills", 5)` | `scoreboard players set @s kills 5` |

Other builtins need special lowering:

- `scoreboard_get(...)` reads a scoreboard into a compiler-managed temp variable.
- `data_get(...)` uses `execute store result score ... run data get ...`.
- `random(...)` uses `scoreboard players random` for legacy compatibility.
- `random_native(...)` uses `/random value <min> <max>` on MC 1.20.3+.
- `random_sequence(...)` uses `/random reset <sequence> <seed>` on MC 1.20.3+.
- `spawn_object(...)` spawns an invisible armor stand and returns a selector handle.

## Structs

Structs are stored in Minecraft storage under `rs:heap`.

Example:

```rs
struct Point { x: int, y: int }

fn test() {
    let p: Point = { x: 10, y: 20 };
    p.x = 30;
}
```

Typical generated patterns:

```mcfunction
data modify storage rs:heap point_p.x set value 10
data modify storage rs:heap point_p.y set value 20
data modify storage rs:heap point_p.x set value 30
```

Field reads use `data get storage ...` together with `execute store result score ...`.

## Arrays

Arrays are represented with Minecraft storage and currently behave like NBT-backed collections.

Example:

```rs
let arr: int[] = [1, 2, 3];
arr.push(4);
let first = arr[0];
```

Typical generated patterns:

```mcfunction
data modify storage rs:heap arr set value []
data modify storage rs:heap arr append value 1
data modify storage rs:heap arr append value 2
data modify storage rs:heap arr append value 3
data modify storage rs:heap arr append value 4
```

This part of the storage model is still evolving, so larger collection features should be treated as early-stage compared with scalar scoreboard variables.

## World Objects

`spawn_object(...)` creates an invisible marker armor stand and uses tags plus scoreboards to model a world-backed object.

Example:

```rs
let turret = spawn_object(0, 64, 0);
turret.health = 100;
turret.tag("turret");
```

Typical generated behavior:

- summon an armor stand with tags like `__rs_obj_<n>`
- address it with a selector such as `@e[tag=__rs_obj_<n>,limit=1]`
- map field writes to scoreboard or storage operations
- map `tag(...)` and `untag(...)` to the vanilla `tag` command

## Tick and Trigger Decorators

### `@tick`

Tick handlers are registered through `data/minecraft/tags/function/tick.json` and invoked from `__tick.mcfunction`.

### `@tick(rate=N)`

Rate-limited tick handlers get an extra scoreboard counter. The compiler inserts logic equivalent to:

1. increment the counter every tick
2. check whether it has reached `N`
3. reset it when the body runs

### `@on_trigger("name")`

Trigger handlers generate:

- `scoreboard objectives add <name> trigger` in `__load.mcfunction`
- trigger checks in `__tick.mcfunction`
- a dispatch function that calls the user handler and clears the trigger score

## Command Block Target

In command block mode, the compiler emits a JSON description for command block placement instead of a datapack directory. This is meant for command-block-based setups while reusing the same frontend, lowering, and optimization pipeline.

## Optimizations

The optimizer currently includes three core passes.

### Constant folding

Compile-time constant expressions are evaluated early.

Example:

```rs
return 2 + 3;
```

is simplified to an IR constant equivalent to `5`.

### Copy propagation

Redundant temporaries are removed when values can be forwarded safely.

Example idea:

```rs
let x: int = 10;
let y: int = x;
return y;
```

can emit fewer scoreboard moves because `y` can reuse the known value of `x`.

### Dead code elimination

Assignments whose results are never read are removed before code generation. This reduces scoreboard churn and helps keep generated datapacks smaller and easier to inspect.

## Practical Consequences

The mapping strategy is intentionally pragmatic:

- scoreboard storage is fast and predictable for scalar logic
- storage-backed structs and arrays handle composite data
- helper functions keep `execute`-heavy control flow manageable
- optimization passes reduce unnecessary commands before codegen

That combination is what lets RedScript express higher-level gameplay logic while still compiling to vanilla Minecraft primitives.
