# RedScript Language Reference

This document describes the syntax and semantics RedScript accepts today.

---

## Program Structure

A source file may optionally declare a namespace, followed by any number of `struct`, `enum`, and `fn` declarations.

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
| Enum | `Phase` |
| Array | `int[]`, `string[]` |
| Tuple | `(int, int)` |
| Option | `Option<int>` |

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

## Constants

Use `const` to declare compile-time constants. Constants are inlined at every use site and are exempt from magic-number lint warnings.

```rs
const MAX_HEALTH: int = 20
const PI_APPROX: int = 31416

fn reset(health: int) {
    if (health > MAX_HEALTH) {
        health = MAX_HEALTH;
    }
}
```

Top-level constants are visible across the entire file. Local constants may also appear inside function bodies.

---

## Global Variables

`let` declarations at the **module level** (outside any function) create persistent global variables backed by scoreboard entries. They are readable and writable from any function in the file.

```rs
let counter: int = 0;

fn increment() {
    counter = counter + 1;
}

fn reset() {
    counter = 0;
}
```

The generated scoreboard entry uses a synthetic name derived from the variable name. Global variables survive across ticks — they are not reset between function calls.

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

### Multi-return values (Tuples)

Functions can return multiple values as a tuple. The caller destructs with `let (a, b) = ...`:

```rs
fn divmod(a: int, b: int) -> (int, int) {
    return (a / b, a % b);
}

fn example() {
    let (quotient, remainder) = divmod(10, 3);
}
```

Tuple types with more than two elements are also supported: `(int, bool, int)`.

---

## Enums

Enums define a named set of integer variants. Variants are accessed with the `::` path operator.

```rs
enum Phase { Idle, Moving, Attacking }

fn start() {
    let p: Phase = Phase::Idle;
    p = Phase::Attacking;
}
```

By default variants are numbered from `0`. You can assign explicit values; subsequent variants continue from the last assigned value:

```rs
enum Priority { Low = 10, Medium, High = 30 }
// Low=10, Medium=11, High=30
```

Enums can be used as function parameters and return types:

```rs
fn get_phase(): Phase {
    return Phase::Moving;
}

fn handle(p: Phase) {
    // use match to dispatch on p
}
```

Internally enums are scoreboard integers — `Phase::Idle` compiles to `0`, `Phase::Moving` to `1`, etc.

---

## Option\<T\>

`Option<T>` represents a value that may or may not be present. It uses two scoreboard slots internally (`has` and `val`).

```rs
fn find_score(target: string) -> Option<int> {
    let val: int = scoreboard_get(target, "kills");
    if (val >= 0) {
        return Some(val);
    }
    return None;
}
```

### Consuming an Option

Use `if let Some(x) = opt { ... }` to bind and use the inner value:

```rs
fn reward(opt: Option<int>) {
    if let Some(score) = opt {
        give(@s, "minecraft:diamond", score);
    } else {
        tell(@s, "No score found.");
    }
}
```

Use `match` for exhaustive handling:

```rs
fn describe(opt: Option<int>) {
    match opt {
        Some(v) => { tell(@s, "value present"); }
        None    => { tell(@s, "empty"); }
    }
}
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

### `do-while`

Executes the body at least once before evaluating the condition:

```rs
fn poll() {
    let attempts: int = 0;
    do {
        attempts += 1;
    } while (attempts < 3);
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

### `for`-range

Iterate over an integer range with `for var in start..end`:

```rs
fn count_up() {
    for i in 0..10 {
        say("counting");
    }
}
```

Use `..=` for an **inclusive** upper bound:

```rs
fn count_inclusive() {
    for i in 1..=5 {
        // i takes values 1, 2, 3, 4, 5
    }
}
```

The bound can be a variable:

```rs
fn count_to(n: int) {
    for i in 0..n {
        say("tick");
    }
}
```

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

### `break` and `continue`

`break` exits the innermost loop immediately. `continue` skips the rest of the current iteration.

```rs
fn find_first_even(n: int) -> int {
    for i in 0..n {
        if (i % 2 == 0) {
            return i;
        }
    }
    return -1;
}

fn skip_odds() {
    for i in 0..10 {
        if (i % 2 != 0) {
            continue;
        }
        say("even");
    }
}
```

### Labeled loops

Attach a label to a loop and use `break label` or `continue label` to target an outer loop:

```rs
fn search() {
    outer: for i in 0..10 {
        for j in 0..10 {
            if (i == j) {
                break outer;   // exits both loops
            }
        }
    }
}
```

---

## Match Expressions

`match` dispatches on the value of an expression. Each arm has a pattern followed by `=> { ... }`. Arms are evaluated top-to-bottom; the first matching arm runs.

### Integer patterns

```rs
fn describe(n: int) {
    match n {
        1 => { tell(@s, "one"); }
        2 => { tell(@s, "two"); }
        _ => { tell(@s, "other"); }
    }
}
```

Both `match expr { ... }` (preferred) and `match (expr) { ... }` (legacy) are accepted.

### Enum patterns

```rs
enum Phase { Idle, Moving, Attacking }

fn handle(p: Phase) {
    match p {
        Phase::Idle      => { tell(@s, "idle"); }
        Phase::Moving    => { tell(@s, "moving"); }
        Phase::Attacking => { tell(@s, "attacking"); }
        _                => { }
    }
}
```

### Option patterns

```rs
fn show(opt: Option<int>) {
    match opt {
        Some(v) => { tell(@s, "got value"); }
        None    => { tell(@s, "nothing"); }
    }
}
```

`Some(binding)` binds the inner value to `binding` for use in the arm body.

### Wildcard

`_` matches anything and does not bind a name. Use it as a catch-all.

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

### Singleton structs

Mark a struct `@singleton` to make it a global state object. The compiler synthesises `get()` and `set(gs)` static methods backed by a scoreboard objective.

```rs
@singleton
struct GameState {
    phase: int,
    tick_count: int,
}

fn tick() {
    let gs: GameState = GameState::get();
    gs.tick_count += 1;
    GameState::set(gs);
}
```

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

Decorators attach compile-time or runtime behaviour to functions and structs.

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

### `@watch("objective")`

Detects when a scoreboard value changes for any player and calls the function handler. The handler must have no parameters.

```rs
@watch("rs.kills")
fn on_kill_change() {
    let k: int = scoreboard_get("@s", "rs.kills");
    if (k >= 10) {
        title(@s, "Achievement Unlocked!");
    }
}
```

The compiler generates a `__watch_<fn>` dispatcher registered in `tick.json`. Each tick it compares the current value against the stored previous value per player, calling the handler only when a change is detected.

### `@throttle(ticks=N)`

Rate-limits a function so that it runs at most once every `N` ticks, regardless of how often it is called. Useful on functions registered to high-frequency events.

```rs
@throttle(ticks=20)
fn on_player_move() {
    say("moved");
}
```

The compiler generates a `__throttle_<fn>` dispatcher and a `__throttle` scoreboard objective.

### `@retry(max=N)`

Wraps the function body in retry logic: if the function returns a falsy value it is called again up to `max` total attempts.

```rs
@retry(max=3)
fn try_spawn_mob(): int {
    // return 1 on success, 0 on failure
    return 0;
}
```

### `@memoize`

Caches the result of a single-`int`-parameter function using a scoreboard-backed LRU-1 cache. On a cache hit, the body is skipped and the cached result is returned immediately.

```rs
@memoize
fn fib(n: int): int {
    if (n <= 1) { return n; }
    return fib(n - 1) + fib(n - 2);
}
```

Constraints: the function must have exactly one `int` parameter.

### `@coroutine`

Marks a function as a tick-splitting state machine. Loop back-edges become automatic yield points: the loop body runs up to `batch` iterations per tick, then returns — resuming next tick where it left off.

```rs
@coroutine(batch=10, onDone="on_scan_done")
fn scan_region() {
    let x: int = 0;
    while (x < 1000) {
        process(x);
        x += 1;
    }
    // after the loop: calls on_scan_done()
}
```

**Parameters:**
- `batch` — maximum loop iterations per tick (default: 1). Total ticks = actual iterations / batch.
- `onDone` — optional function name to call when the coroutine finishes.

**How it works:**

The compiler performs control-flow analysis (dominator tree + back-edge detection) to find all loop headers. Each loop is split into a *continuation function* that runs up to `batch` iterations before returning. A generated `@tick` dispatcher checks a scoreboard `pc` counter and calls the right continuation each tick.

```
call scan_region()           → sets pc = 1, initializes live vars
@tick → dispatcher           → pc == 1 → call _coro_scan_region_cont_1
cont_1 runs 10 iterations    → returns (yield)
next tick: cont_1 runs again → ... until loop exits
loop done                    → calls onDone, sets pc = -1 (stopped)
```

Variables that are live across yield points are automatically promoted to persistent scoreboard slots.

**Constraints:**
- Functions containing macro calls cannot use `@coroutine` (continuations are invoked via `function`, which does not substitute macro variables).
- Nested loops: the transform handles each loop independently. For nested loops, extract the inner loop into a separate function.
- Multiple sequential loops compile to multiple continuations dispatched in order.
- Calling one coroutine from another: use `onDone` chaining — the first coroutine's `onDone` callback initializes the second.

```rs
@coroutine(batch=5, onDone="start_phase2")
fn phase1() { /* long work */ }

fn start_phase2() {
    phase2();  // initializes phase2's pc, starts it
}

@coroutine(batch=5)
fn phase2() { /* runs after phase1 completes */ }
```

**Performance note:** `@coroutine` is designed to stay within MC's per-tick command budget (`maxCommandChainLength`, default 65536). Without it, 1000 iterations × 20 commands = 20000 commands/tick — fine. But 10000 iterations × 20 = 200000 — exceeds the limit and causes silent truncation. The `batch` parameter is your throttle valve.

No blocking occurs — other `@tick` functions and game logic continue to run while the coroutine is spread across ticks.

### `@config("key", default: value)`

Injects a compile-time configuration value into a global `let`. The default is used unless `CompileOptions.config` overrides the key.

```rs
@config("max_players", default: 20)
let MAX_PLAYERS: int

@config("difficulty", default: 1)
let DIFFICULTY: int

fn announce() {
    tell(@a, "Max players:");
}
```

Pass overrides at compile time:

```typescript
compile(source, { namespace: "mygame", config: { max_players: 10, difficulty: 3 } })
```

This is useful for building the same datapack with different tuning parameters without editing source.

### `@singleton` (on structs)

See [Singleton structs](#singleton-structs) above.

### `@deprecated("message")`

Marks a function as deprecated. Callers emit a compile-time warning.

```rs
@deprecated("use take_damage() instead")
fn apply_damage(amount: int) {
    // old implementation
}
```

### `@load`

Marks a function to be called during datapack load (inside `__load.mcfunction`).

```rs
@load
fn init() {
    scoreboard_add_objective("kills", "playerKillCount");
}
```

### `@keep`

Prevents dead-code elimination from removing the function, even if no other code calls it.

```rs
@keep
fn debug_dump() {
    // always emitted even if unreferenced
}
```

### `@inline` / `@no_inline`

Override the compiler's inlining heuristic for a specific function.

```rs
@inline
fn fast_path(x: int): int {
    return x * 2;
}

@no_inline
fn large_helper(x: int): int {
    // kept as a separate mcfunction even if small
    return x + 1;
}
```

---

## Event Handlers

The `@on(EventType)` decorator wires a function as a handler for a built-in game event. The handler receives a `player` parameter representing the player that triggered the event.

```rs
@on(PlayerDeath)
fn on_death(player: Player) {
    tell(player, "You died!");
}

@on(PlayerJoin)
fn on_join(player: Player) {
    title(player, "Welcome!");
}
```

### Supported event types

| Event | Trigger |
|:--|:--|
| `PlayerDeath` | Detected via scoreboard kill criterion |
| `PlayerJoin` | Detected via entity tag on first login |
| `BlockBreak` | Detected via advancement trigger |
| `EntityKill` | Detected via scoreboard kill criterion |
| `ItemUse` | Detected via scoreboard item use criterion |

Each event handler is automatically registered in `tick.json`. Detection logic and handler dispatch are generated by the compiler — no manual wiring needed.

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
