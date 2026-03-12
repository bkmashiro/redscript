# Crystal Rush

`showcase_game.rs` is a complete RedScript mini-game showcase built around a simple loop:

1. Players join with `/trigger crystal_join`
2. Anyone in the lobby can start a countdown with `/trigger crystal_start`
3. During the round, players use `/trigger crystal_claim` near one of four crystal lanes
4. `/trigger crystal_dash` spends the shared stdlib cooldown to lunge forward
5. Zombies spawn in waves and touching them applies scoreboard-based damage
6. First player to `15` score wins, then the arena resets

## Mechanics

- Four crystal pads exist at north, south, east, and west.
- A player claims the crystal in the lane they are currently closest to.
- Claiming a crystal removes the block, awards score, and starts its recharge cycle.
- Every second the game respawns missing crystals and periodically spawns zombie pressure.
- If a player's tracked health reaches `0`, they are teleported back to spawn and lose `1` score.

## Feature Coverage

- `const` declarations: scoring, timers, cooldown, and damage are all constant-driven.
- `enum` types: `Phase` and `Lane` drive game flow and crystal logic.
- Arrays: lane lists and respawn loops use `int[]`.
- Structs: `GameState` and `PlayerState` snapshot scoreboard-backed state.
- String interpolation: titles, actionbars, and announcements use `${...}`.
- `match`: used for phase dispatch, lane lookup, lane labels, and lane crystal state.
- Default parameters: `crystal_reward(base, streak = 0)`.
- `foreach` over selectors: player counting and per-player round updates.
- BlockPos with `~` and `^`: arena pad marking uses `(~0, 64, ~0)`, dash uses `(^0, ^0, ^3)`.
- `@tick(rate=20)`: once-per-second game logic runs in `crystal_rush_second`.
- Trigger decorator: this repo currently supports `@on_trigger("...")`, not `@on_advancement` / `@on_death`, so Crystal Rush uses trigger handlers for join/start/claim/dash.
- Stdlib imports: `math.rs`, `player.rs`, and `cooldown.rs` are imported and exercised.
- `execute/as/at` blocks: used for zombie contact damage and spawn-pad marking.
- Scoreboard operations: all game state is stored in objectives like `score`, `crystals`, `health`, and `crystal`.
- `fill` / `setblock`: arena build and crystal respawn both use block-editing builtins.
- `title` / `subtitle` / `actionbar`: all phases and major player events surface feedback through UI.
- Multiple functions calling each other: the game loop is split into snapshots, dispatch, arena setup, scoring, respawn, and reset helpers.

## Notes

- The imported stdlib cooldown helper is currently a single global slot on objective `rs`, so dash acts as a shared cooldown showcase rather than a per-player system.
- The compiler surface today does not implement `@on_advancement` or `@on_death`; this example intentionally stays within the supported decorator set in the current codebase.
