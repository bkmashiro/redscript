# RedScript Language Reference

This document describes the syntax and semantics RedScript accepts today.

---

## Program Structure

A source file may optionally declare a namespace, followed by any number of `struct` and `fn` declarations.

```rs
namespace turret;

struct TurretState { health: int }

fn main() {}
```

If no namespace is provided, the CLI derives one from the filename or uses the compile option you pass.

### Library modules

Mark a file as a library (not a standalone datapack entry point) with `module library;`:

```rs
module library;

fn helper(x: int) -> int {
    return x * 2;
}
```

---

## Module System

```rs
module library;   // marks this file as a library (not a standalone datapack)

import math;      // import a stdlib module by name
import "path/to/file";  // import by relative file path
```

Imported names are available globally within the file. Circular imports are not supported.

---

## Types

### Primitive types

| Type | Backend | Notes |
|:--|:--|:--|
| `int` | Scoreboard — signed 32-bit | Primary numeric type |
| `bool` | Scoreboard — lowered as `0` / `1` | `true` = 1, `false` = 0 |
| `fixed` | Scoreboard — ×10000 fixed-point | `1.5` is stored as `15000` |
| `double` | NBT IEEE 754 double (`rs:d` storage) | Not backed by scoreboard; no arithmetic with scoreboard types without explicit cast |
| `string` | Compiler/builtin | Primarily used as builtin arguments |
| `void` | — | Function return type when no value is produced |
| `float` | **Deprecated** — MC NBT float | Boundary type; no arithmetic supported; triggers `[FloatArithmetic]` lint warning |

### Composite types

| Type form | Example |
|:--|:--|
| Struct | `TurretState` |
| Array | `int[]`, `string[]` |

### Type casting

There are **no implicit conversions**. Use the `as` keyword for explicit casts:

```rs
let x: double = 3.14d;
let x_fixed: fixed = x as fixed;    // double → fixed
let x_int: int = x_fixed as int;    // fixed → int
let d: double = x_fixed as double;  // fixed → double
```

### Literal suffixes

- `double` literals use the `d` suffix: `3.14d`, `0.0d`, `1.0d`
- `fixed` literals are regular numbers declared as `fixed` type (no suffix needed)
- `int` literals are plain integers: `42`, `-7`
- `bool` literals: `true`, `false`

### Variables

```rs
let hp: int = 20;
let enabled: bool = true;
let speed: fixed = 1.5;
let x: double = 3.14d;
let name: string = "turret";
let numbers: int[] = [1, 2, 3];
```

Type annotations are supported on `let` bindings and function parameters.

---

## Functions

Functions use C-style syntax and may return values. Return types follow `->`.

```rs
fn add(a: int, b: int) -> int {
    return a + b;
}

fn announce() {
    say("Ready");
}
```

Rules:

- Parameters are positional.
- A missing return type defaults to `void`.
- `return;` is valid in `void` functions.
- Function calls are synchronous and compile to `function <namespace>:<name>`.

### Generic functions

Some stdlib functions use a type parameter `<T>`:

```rs
fn abs<T>(x: T) -> T { ... }
fn min<T>(a: T, b: T) -> T { ... }
```

---

## Control Flow

### `if` / `else`

```rs
fn reward(kills: int) {
    if (kills >= 10) {
        give(@s, "minecraft:diamond", 1);
    } else {
        tell(@s, "Keep going.");
    }
}
```

`else if` chains are expressed as nested `if` inside `else`.

### `while`

```rs
fn countdown() {
    let n: int = 5;
    while (n > 0) {
        n -= 1;
    }
}
```

### `for`

RedScript supports C-style `for` loops.

```rs
fn repeat() {
    for (let i: int = 0; i < 5; i += 1) {
        say("tick");
    }
}
```

The initializer is optional. Compound assignment is supported in the step clause.

### `foreach`

`foreach` iterates over a selector. The body is extracted into a helper function and run with `execute as ... run function ...`.

```rs
fn notify_players() {
    foreach (player in @a) {
        title(player, "Fight!");
    }
}
```

Inside the loop body, the bound variable refers to the current entity context (`@s`).

---

## Structs

Structs group fields and are stored in Minecraft NBT storage.

```rs
struct TurretState {
    health: int,
    level: int
}

fn create() {
    let state: TurretState = { health: 40, level: 1 };
    state.health = 50;
    let hp = state.health;
    state.health += 5;
}
```

Supported operations:

- Struct declaration
- Struct literals
- Field read / field assignment
- Compound assignment on fields (`state.health += 5`)

---

## Arrays

Arrays are backed by Minecraft NBT storage.

```rs
fn sample() {
    let nums: int[] = [1, 2, 3];
    nums.push(4);
    let first = nums[0];
}
```

Supported operations:

- Empty arrays: `[]`
- Array literals with initial values
- `push(...)`
- Index reads (`arr[0]`)

---

## Decorators

Decorators attach runtime behaviour to functions.

### `@tick`

Runs every game tick via the generated `__tick.mcfunction`.

```rs
@tick
fn heartbeat() {
    say("tick");
}
```

### `@tick(rate=N)`

Runs every `N` ticks using a generated scoreboard counter.

```rs
@tick(rate=20)
fn once_per_second() {
    say("1 second");
}
```

### `@on_trigger("name")`

Generates trigger plumbing for `/trigger name`.

```rs
@on_trigger("shop_buy")
fn handle_shop() {
    complete_purchase();
}
```

The compiler creates:

- a trigger objective in `__load.mcfunction`
- a dispatch function
- trigger checks inside `__tick.mcfunction`

### `@schedule(N)`

Runs the function once after `N` ticks (one-shot scheduled call).

```rs
@schedule(100)
fn delayed_explosion() {
    summon("tnt", "~", "~", "~");
}
```

### `@coroutine`

Marks a function as a tick-splitting state machine. The body can use `yield <ticks>` to pause execution across ticks, resuming automatically when the countdown completes.

```rs
@coroutine
fn cutscene() {
    title(@s, "Chapter 1");
    yield 60;  // pause 60 ticks
    title(@s, "Chapter 2");
    yield 40;
    title(@s, "The End");
}
```

The compiler generates a scoreboard-backed state machine; no blocking occurs — other functions continue to run during the yield.

---

## Execute Context

RedScript supports both shorthand context blocks and explicit `execute ... run { ... }`.

### Shorthand `as` / `at`

```rs
as @a {
    say("Hello from each player");
}

at @s {
    summon("zombie", "~", "~", "~");
}

as @a at @s {
    particle("flame", "~", "~", "~");
}
```

### `execute ... run { ... }`

Supported subcommands:

- `as <selector>`
- `at <selector>`
- `if entity <selector>`
- `unless entity <selector>`
- `in <dimension>`

```rs
execute as @a run {
    say("Hello");
}

execute as @a at @s run {
    particle("flame", "~", "~", "~");
}

execute as @a if entity @s[tag=admin] run {
    give(@s, "minecraft:diamond", 1);
}

execute as @a unless entity @s[tag=dead] run {
    effect(@s, "regeneration", 5);
}

execute as @a at @s if entity @s[tag=vip] in overworld run {
    title(@s, "VIP");
}
```

---

## Selectors

Entity selectors are first-class expressions and can be passed directly to builtins.

### Selector heads

| Selector | Meaning |
|:--|:--|
| `@a` | All players |
| `@e` | All entities |
| `@s` | Current executor |
| `@p` | Nearest player |

### Common filters

```rs
@e[type=zombie]
@e[type=zombie, distance=..8]
@e[type=armor_stand, tag=turret]
@a[scores={kills=10..}]
@p[distance=..5]
@a[x_rotation=-90..-45]
```

Supported filter categories:

- `type`
- `distance` with ranges (`..5`, `1..`, `1..10`)
- `tag`
- score filters
- `limit`
- `sort`
- `nbt`
- `gamemode`
- `x_rotation` / `y_rotation`

---

## Coordinates

Block positions are first-class values with the `BlockPos` type.

### Absolute coordinates

```rs
let spawn: BlockPos = (0, 64, 0);
setblock((4, 65, 4), "minecraft:gold_block");
```

### Relative coordinates

```rs
tp(@s, (~1, ~0, ~-1));
```

### Local coordinates

```rs
tp(@s, (^0, ^1, ^0));
```

### Mixed coordinates

```rs
setblock((~0, 64, ~0), "minecraft:stone");
```

Each component can be:

- an absolute integer like `64`
- a relative coordinate like `~` or `~-2`
- a local coordinate like `^` or `^3`

---

## Builtins

The compiler recognises these builtins and lowers them to Minecraft commands or runtime helpers.

### General builtins

| Builtin | Returns | Notes |
|:--|:--|:--|
| `say(msg)` | `void` | Emits `say` |
| `tell(sel, msg)` | `void` | Emits `tellraw` with plain text JSON |
| `title(sel, msg)` | `void` | Emits `title <sel> title` |
| `give(sel, item, count?)` | `void` | Default count is `1` |
| `effect(sel, effect, duration?, amplifier?)` | `void` | Defaults: duration `30`, amplifier `0` |
| `effect_clear(sel, effect?)` | `void` | Clears specific or all effects |
| `summon(type, x?, y?, z?, nbt?)` | `void` | Defaults position to `~ ~ ~` |
| `particle(name, x?, y?, z?)` | `void` | Defaults position to `~ ~ ~` |
| `tp(sel, x?, y?, z?)` | `void` | Also accepts `tp(sel, pos)` with `BlockPos` |
| `setblock(x, y, z, block)` | `void` | Also accepts `setblock(pos, block)` with `BlockPos` |
| `fill(x1, y1, z1, x2, y2, z2, block)` | `void` | Also accepts `fill(from, to, block)` with `BlockPos` |
| `clone(x1, y1, z1, x2, y2, z2, dx, dy, dz)` | `void` | Also accepts `clone(from, to, dest)` |
| `kill(sel?)` | `void` | Defaults to `@s` |
| `clear(sel, item?)` | `void` | Clears all or specific item |
| `time_set(ticks)` | `void` | Sets world time |
| `weather(type)` | `void` | `"clear"`, `"rain"`, `"thunder"` |
| `gamerule(rule, value)` | `void` | Sets a gamerule |
| `difficulty(level)` | `void` | `"peaceful"`, `"easy"`, `"normal"`, `"hard"` |

### Scoreboard builtins

| Builtin | Returns | Notes |
|:--|:--|:--|
| `scoreboard_get(target, objective)` | `int` | Reads a scoreboard score |
| `score(target, objective)` | `int` | Alias of `scoreboard_get` |
| `scoreboard_set(target, objective, value)` | `void` | Writes a scoreboard score |
| `scoreboard_add_objective(name, criterion)` | `void` | Creates a new objective |

### Data / NBT builtins

| Builtin | Returns | Notes |
|:--|:--|:--|
| `data_get(kind, target, path, scale?)` | `int` | Reads NBT with `data get` |
| `storage_get_int(storage, path, index)` | `int` | Reads an array element from NBT storage |
| `storage_set_array(storage, path, json)` | `void` | Writes an array literal to NBT storage |

### Random builtins

| Builtin | Returns | Notes |
|:--|:--|:--|
| `random(min, max)` | `int` | Uses `scoreboard players random` (pre-1.20.3) |
| `random_native(min, max)` | `int` | Uses `/random value` (MC 1.20.3+) |
| `random_sequence(sequence, seed?)` | `void` | Uses `/random reset` (MC 1.20.3+); default seed `0` |

### Team builtins

| Builtin | Returns | Notes |
|:--|:--|:--|
| `team_add(name)` | `void` | Creates a team |
| `team_remove(name)` | `void` | Removes a team |
| `team_join(sel, name)` | `void` | Adds entities to team |
| `team_leave(sel)` | `void` | Removes entities from teams |
| `team_option(name, key, value)` | `void` | Sets a team option |

### Tag builtins

| Builtin | Returns | Notes |
|:--|:--|:--|
| `tag_add(sel, name)` | `void` | Adds an entity tag |
| `tag_remove(sel, name)` | `void` | Removes an entity tag |

### Entity helper methods

These are written as member calls on selectors or object handles:

| Method | Returns | Example |
|:--|:--|:--|
| `entity.tag(name)` | `void` | `@s.tag("boss");` |
| `entity.untag(name)` | `void` | `@s.untag("boss");` |
| `entity.has_tag(name)` | `bool` | `let boss: bool = @s.has_tag("boss");` |

### World object

| Builtin | Returns | Notes |
|:--|:--|:--|
| `spawn_object(x, y, z)` | world object handle | Spawns invisible armor stand with generated tags |

### Escape hatch

| Builtin | Returns | Notes |
|:--|:--|:--|
| `raw(cmd)` | `void` | Emits a literal Minecraft command |

---

## Raw Commands

Use `raw(...)` as an escape hatch for commands RedScript does not model directly.

```rs
fn admin() {
    raw("gamemode creative @a");
}
```

### `__NS__` and `__OBJ__` substitutions

Inside `raw(...)`, two compile-time tokens are replaced automatically:

- `__NS__` — replaced with the current namespace (e.g. `my_pack`)
- `__OBJ__` — replaced with the current scoreboard objective (`__<namespace>`)

```rs
fn example() {
    raw("scoreboard players set #flag __OBJ__ 1");
    raw("function __NS__:helper");
}
```

---

## Operators

### Arithmetic

| Operator | Description |
|:--|:--|
| `+` | Addition |
| `-` | Subtraction / unary negate |
| `*` | Multiplication |
| `/` | Integer division |
| `%` | Modulo |

### Comparison

| Operator | Description |
|:--|:--|
| `==` | Equal |
| `!=` | Not equal |
| `<` | Less than |
| `<=` | Less than or equal |
| `>` | Greater than |
| `>=` | Greater than or equal |

### Logical

| Operator | Description |
|:--|:--|
| `&&` | Logical AND |
| `\|\|` | Logical OR |
| `!` | Logical NOT |

### Assignment

| Operator | Description |
|:--|:--|
| `=` | Assign |
| `+=` | Add-assign |
| `-=` | Subtract-assign |
| `*=` | Multiply-assign |
| `/=` | Divide-assign |
| `%=` | Modulo-assign |

---

## Numeric Semantics

- `int` values map directly to MC scoreboard integers (signed 32-bit).
- `bool` is lowered as integer `0` or `1`.
- `fixed` is a signed 32-bit scoreboard integer scaled by **×10000** (e.g. `1.5` → `15000`). Previously incorrectly documented as ×1000.
- `double` is an IEEE 754 64-bit float stored in `rs:d` NBT storage — not accessible through scoreboard arithmetic without explicit casting.
- `float` is deprecated. It represents an MC NBT float boundary type with no arithmetic support; using it triggers a `[FloatArithmetic]` lint warning.
- `string` values are currently most useful as builtin arguments rather than general-purpose data.
