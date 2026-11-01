# `cooldown` — Caller-owned deadlines

Upcoming 4.0 API. Import: `import cooldown;`

Each cooldown is an integer deadline stored by the caller. The module owns no
scoreboard state and registers no per-tick work. Different skills and players
use different caller-owned variables or score slots.

## Functions

- `cooldown_start(now: int, ticks: int): int` returns a deadline.
- `cooldown_ready(ready_at: int, now: int): bool` checks whether it has been reached.
- `cooldown_remaining(ready_at: int, now: int): int` returns remaining ticks, clamped to zero.

`now` is a non-negative, monotonic tick clock shared by the game. Use the same
clock epoch for creation and checks. Reset stored deadlines to zero when that
clock resets or wraps. Zero deadlines are immediately ready. Non-positive
durations return `now`, and deadline addition saturates at 2147483647, the signed
32-bit scoreboard maximum. This API does not implement an unbounded clock.

## Example: per-player state

Create the `dash_cd` objective in your game bootstrap. Call this function from a
player execution context and pass your shared clock:

```rs
import cooldown;

fn try_dash(now: int) {
    let ready_at: int = scoreboard_get(@s, "dash_cd");
    if (cooldown_ready(ready_at, now)) {
        tp(@s, ~0, ~0, ~3);
        scoreboard_set(@s, "dash_cd", cooldown_start(now, 40));
    }
}
```

There is no `cooldown_tick`. The old string-name API ignored its name and routed
every ability to one global slot. Replace it with real caller-owned state.
`@throttle` is also retired. Use `@tick(rate=N)` for periodic work and explicit
deadlines for suppressing repeated calls. See [4.0 migration](../MIGRATION_4.md).
