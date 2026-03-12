# Examples

This folder contains small RedScript example programs that demonstrate common datapack patterns and the current language feature set.

## `counter.rs`

A minimal tick counter.

Demonstrates:
- `@tick`
- `scoreboard_get()` and `scoreboard_set()`
- integer math and `%`
- `if`
- `say()`

## `shop.rs`

A simple shop entry point that runs from `@on_trigger("shop_buy")` and reads a companion `shop_choice` scoreboard to decide what to give the player.

Demonstrates:
- `@on_trigger`
- helper functions
- nested `if` / `else`
- `give()`
- `tell()`
- scoreboard-driven branching

Note: the current trigger system fires when a trigger objective is set, but it does not pass the numeric trigger amount into the handler. This example uses `shop_choice` for the item selection value.

## `arena.rs`

A PvP arena tracker that checks the `kills` objective every 200 ticks, finds the highest score, and notifies the leader or tied leaders.

Demonstrates:
- periodic logic with `@tick`
- `foreach (player in @a)`
- per-player scoreboard reads
- aggregation with local variables
- `announce()`, `actionbar()`, `subtitle()`, and `title_times()`
- `tell()` and `title()`

## `world_manager.rs`

A small world administration example that resets a lobby platform and locks in predictable world settings from a trigger handler.

Demonstrates:
- `BlockPos` tuple literals with `setblock()` and `fill()`
- `weather()` and `time_set()`
- `gamerule()`
- `announce()` and `actionbar()`
- `@on_trigger`

## `turret.rs`

An automated turret deployment example. A trigger spawns an invisible armor stand, tags it as a turret, stores a health value, and a tick loop kills nearby zombies around every deployed turret.

Demonstrates:
- `spawn_object()`
- world object field assignment
- entity tagging
- `struct` literals and field reads
- `@tick(rate=20)`
- nested `foreach`
- `at` blocks

## `quiz.rs`

A trigger-based quiz game. Players start with `quiz_start`, answer with `quiz_a`, `quiz_b`, or `quiz_c`, and keep score in scoreboards while receiving `tellraw`-style messages through `tell()`.

Demonstrates:
- multiple `@on_trigger` handlers
- regular functions with parameters
- scoreboard-backed state machines
- branching by current question and answer choice
- `title()` and `tell()`

Note: `tell()` lowers to Minecraft `tellraw`, so these messages are rendered as JSON text components in the datapack output.
