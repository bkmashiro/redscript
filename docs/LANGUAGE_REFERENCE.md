# RedScript Language Reference

This document describes the syntax RedScript accepts today.

## Program Structure

A source file may optionally declare a namespace, followed by any number of `struct` and `fn` declarations.

```rs
namespace turret;

struct TurretState { health: int }

fn main() {}
```

If no namespace is provided, the CLI derives one from the filename or uses the compile option you pass.

## Types

RedScript currently supports these primitive types:

| Type | Notes |
|:--|:--|
| `int` | Scoreboard-backed integer values |
| `bool` | Lowered as `0` or `1` |
| `float` | Fixed-point values scaled by `1000` |
| `string` | Used primarily in builtin calls |
| `void` | Function return type when no value is produced |

Composite types:

| Type form | Example |
|:--|:--|
| Struct | `TurretState` |
| Array | `int[]`, `string[]` |

### Variables

```rs
let hp: int = 20;
let enabled: bool = true;
let speed: float = 1.5;
let name: string = "turret";
let numbers: int[] = [1, 2, 3];
```

Type annotations are supported on `let` bindings and function parameters. Function return types use `->`.

## Functions

Functions use C-style syntax and may return values.

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

The initializer is optional, and compound assignment is supported in the step clause.

### `foreach`

`foreach` iterates over a selector by extracting the body into a helper function and running it with `execute as ... run function ...`.

```rs
fn notify_players() {
    foreach (player in @a) {
        title(player, "Fight!");
    }
}
```

Inside the loop body, the bound variable refers to the current entity context.

## Structs

Structs group fields and are stored in Minecraft storage.

```rs
struct TurretState {
    health: int,
    level: int
}

fn create() {
    let state: TurretState = { health: 40, level: 1 };
    state.health = 50;
    let hp = state.health;
}
```

Supported operations:

- Struct declaration
- Struct literals
- Field read
- Field assignment
- Compound assignment on fields such as `state.health += 5`

## Arrays

Arrays are currently backed by Minecraft storage.

```rs
fn sample() {
    let nums: int[] = [1, 2, 3];
    nums.push(4);
    let first = nums[0];
}
```

Current support includes:

- Empty arrays: `[]`
- Array literals with initial values
- `push(...)`
- Index reads such as `arr[0]`

## Decorators

Decorators attach runtime behavior to functions.

### `@tick`

Runs every game tick through the generated `__tick.mcfunction`.

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

## Execute Context

RedScript supports both shorthand context blocks and explicit `execute ... run { ... }`.

### `as`

```rs
as @a {
    say("Hello from each player");
}
```

### `at`

```rs
at @s {
    summon("zombie", "~", "~", "~");
}
```

### Combined `as` and `at`

```rs
as @a at @s {
    particle("flame", "~", "~", "~");
}
```

### `execute ... run { ... }`

Supported subcommands today:

- `as <selector>`
- `at <selector>`
- `if entity <selector>`
- `unless entity <selector>`
- `in <dimension>`

Examples:

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

## Selectors

Entity selectors are first-class expressions and can be passed directly to builtins.

### Supported selector heads

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
```

Supported filter categories in the current parser:

- `type`
- `distance` with ranges such as `..5`, `1..`, `1..10`
- `tag`
- score filters
- `limit`
- `sort`
- `nbt`
- `gamemode`

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

## Builtins

The compiler recognizes these builtins and lowers them directly to Minecraft commands or runtime helpers.

| Builtin | Returns | Notes |
|:--|:--|:--|
| `say(msg)` | `void` | Emits `say` |
| `tell(sel, msg)` | `void` | Emits `tellraw` with a plain text JSON component |
| `title(sel, msg)` | `void` | Emits `title <sel> title` |
| `give(sel, item, count?)` | `void` | Default count is `1` |
| `effect(sel, effect, duration?, amplifier?)` | `void` | Defaults: duration `30`, amplifier `0` |
| `summon(type, x?, y?, z?, nbt?)` | `void` | Defaults position to `~ ~ ~` |
| `particle(name, x?, y?, z?)` | `void` | Defaults position to `~ ~ ~` |
| `tp(sel, x?, y?, z?)` | `void` | Also accepts `tp(sel, pos)` with `BlockPos` |
| `setblock(x, y, z, block)` | `void` | Also accepts `setblock(pos, block)` with `BlockPos` |
| `fill(x1, y1, z1, x2, y2, z2, block)` | `void` | Also accepts `fill(from, to, block)` with `BlockPos` |
| `clone(x1, y1, z1, x2, y2, z2, dx, dy, dz)` | `void` | Also accepts `clone(from, to, dest)` with `BlockPos` |
| `kill(sel?)` | `void` | Defaults to `@s` |
| `scoreboard_get(target, objective)` | `int` | Reads a scoreboard score |
| `score(target, objective)` | `int` | Alias of `scoreboard_get` |
| `scoreboard_set(target, objective, value)` | `void` | Writes a scoreboard score |
| `data_get(kind, target, path, scale?)` | `int` | Reads NBT with `data get` |
| `random(min, max)` | `int` | Uses `scoreboard players random` for pre-1.20.3 compatibility |
| `random_native(min, max)` | `int` | Uses `/random value <min> <max>` (MC 1.20.3+) |
| `random_sequence(sequence, seed?)` | `void` | Uses `/random reset <sequence> <seed>`; default seed is `0` (MC 1.20.3+) |
| `spawn_object(x, y, z)` | world object handle | Spawns an invisible armor stand with generated tags |
| `raw(cmd)` | `void` | Emits a literal Minecraft command |

### Entity helper methods

These are written as member calls on selectors or spawned object handles:

| Method | Returns | Example |
|:--|:--|:--|
| `entity.tag(name)` | `void` | `@s.tag("boss");` |
| `entity.untag(name)` | `void` | `@s.untag("boss");` |
| `entity.has_tag(name)` | `bool` | `let boss: bool = @s.has_tag("boss");` |

## Operators

Arithmetic and comparison operators:

- `+`, `-`, `*`, `/`, `%`
- `==`, `!=`, `<`, `<=`, `>`, `>=`
- `&&`, `||`
- unary `-`, `!`

Assignment operators:

- `=`
- `+=`
- `-=`
- `*=`
- `/=`
- `%=`

## Raw Commands

Use `raw(...)` when you need an escape hatch for a command RedScript does not model directly.

```rs
fn admin() {
    raw("gamemode creative @a");
}
```

## Notes on Numeric Semantics

- `int` values map directly to scoreboard integers.
- `bool` is lowered as integer `0` or `1`.
- `float` is stored as fixed-point `value * 1000`.
- String values are currently most useful as builtin arguments rather than general-purpose data values.
