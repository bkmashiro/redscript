# `combat` — Damage and health helpers

Import: `import combat;`

Simple RPG-style combat utilities built on scoreboard patterns. Manages health values stored in a `#health` scoreboard objective.

## Functions

### `weapon_damage(base: int, bonus: int): int`

Calculate total weapon damage as `base + bonus`.

**Example:**
```rs
import combat;
let dmg: int = weapon_damage(10, 5);  // 15
```

---

### `enemy_health(name: string): int`

Read the health scoreboard value for the named entity.

**Example:**
```rs
import combat;
let hp: int = enemy_health("boss");
```

---

### `apply_damage(name: string, amount: int)`

Subtract `amount` from the named entity's `#health` scoreboard value, clamping at 0.

**Example:**
```rs
import combat;
apply_damage("boss", 20);
```
