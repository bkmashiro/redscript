# Templates

This folder contains production-oriented RedScript templates you can copy into datapack projects and adapt to your own scoreboard/objective naming.

## Included templates

### `mini-game-framework.rs`

A reusable round controller with four phases:

- `0`: waiting
- `1`: starting
- `2`: playing
- `3`: ending

It provides `/trigger game_join`, `/trigger game_start`, and a `@tick(rate=20)` loop that advances the countdown and announces state changes with `title`, `subtitle`, and `actionbar`.

### `economy.rs`

A scoreboard-backed coin system with:

- `earn(player, amount)`
- `spend(player, amount) -> int`
- `balance(player) -> int`
- `shop_buy(player, item, price)`

Use it as the base layer for shops, quest rewards, or class unlocks.

### `combat.rs`

A combat state module built around `CombatEntity`:

- health
- max health
- defense
- cooldown

It includes direct damage/heal helpers, alive checks, cooldown ticking, and combat tags such as `in_combat`, `combat_ready`, and `defeated`.

### `quest.rs`

A mission system using a `Quest` struct and scoreboard-backed progress:

- start a quest
- add progress
- complete the quest
- hook into `/trigger kill_zombie`

This works well for survival servers, RPG loops, and PvE encounters.

## Combining templates

### Economy + Combat = RPG foundation

Use `combat.rs` to handle health, armor, and cooldown windows. Reward victories or enemy kills through `economy.rs`, then let players spend coins on better gear or consumables.

### Quest + Economy = reward loop

Run `quest_complete()` and then call `earn()` to pay players for finishing objectives. This gives you a clean mission-reward pipeline with minimal scoreboard plumbing.

### Mini-game framework + Combat = arena match

Use `mini-game-framework.rs` for phase control and player flow, then activate combat logic only during phase `2` so the lobby and ending states remain safe.

## RedScript reference card

### Core syntax

```rs
struct Stats { hp: int, armor: int }

fn add(a: int, b: int) -> int {
    return a + b;
}

if (score > 10) {
    title(@s, "Ready");
} else {
    actionbar(@s, "Keep going");
}

foreach (player in @a) {
    tell(player, "Round live");
}
```

### Decorators

```rs
@tick
fn every_tick() {}

@tick(rate=20)
fn once_per_second() {}

@on_trigger("shop_buy")
fn handle_trigger() {}
```

### Common builtins

```rs
title(@a, "Fight!");
actionbar(@a, "Capture the point");
give(@s, "minecraft:bread", 1);
scoreboard_set("@s", "coins", 10);
let coins: int = scoreboard_get("@s", "coins");
tag_add(@s, "boss");
tag_remove(@s, "boss");
```

### Execution context

```rs
as @a {
    say("Hello");
}

at @s {
    summon("zombie", "~", "~", "~");
}

execute as @a if entity @s[tag=vip] run {
    title(@s, "VIP");
}
```
