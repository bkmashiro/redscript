# `cooldown` — Ability cooldown helpers

Import: `import cooldown;`

Manages a single cooldown slot using `cooldown_ticks` and `cooldown_active` scoreboard values on the `rs` objective. The `name` parameter is reserved for future multi-slot routing.

## Functions

### `cooldown_start(name: string, ticks: int)`

Start a cooldown for `ticks` duration. Sets the active flag and tick counter.

**Example:**
```rs
import cooldown;
cooldown_start("dash", 40);  // 2-second cooldown
```

---

### `cooldown_ready(name: string): int`

Returns 1 if the cooldown is inactive or has expired, 0 if still active.

**Example:**
```rs
import cooldown;
if (cooldown_ready("dash") == 1) {
    // perform ability
    cooldown_start("dash", 40);
}
```

---

### `cooldown_tick(name: string)`

Advance the cooldown by one tick. Call this every tick (e.g. from a `@tick` function). Automatically clears the active flag when the timer reaches zero.

**Example:**
```rs
import cooldown;

@tick
fn update() {
    cooldown_tick("dash");
}
```
