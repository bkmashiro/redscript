# `player` — Player utilities

Import: `import player;`

Player utility helpers built on scoreboard and tag patterns. All functions operate on the nearest player (`@p`).

## Functions

### `heal(amount: int)`

Add `amount` to the nearest player's `#health` scoreboard value.

**Example:**
```rs
import player;
heal(20);  // restore 20 health
```

---

### `damage(amount: int)`

Subtract `amount` from the nearest player's `#health` scoreboard value, clamping at 0.

**Example:**
```rs
import player;
damage(10);
```

---

### `is_op(): int`

Returns 1 if the nearest player has the tag `op`, 0 otherwise.

**Example:**
```rs
import player;
if (is_op() == 1) {
    give(@p, "minecraft:command_block", 1);
}
```
