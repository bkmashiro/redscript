# `effects` — Potion effect helpers

Import: `import effects;`

Named wrappers around the built-in `effect()` and `effect_clear()` commands for common potion effects, plus a convenience "full buff" package.

## Functions

### `speed(target: selector, duration: int, level: int)`

Apply `minecraft:speed` effect to target.

**Example:**
```rs
import effects;
speed(@s, 200, 1);  // speed II for 10 seconds
```

---

### `jump(target: selector, duration: int, level: int)`

Apply `minecraft:jump_boost` effect to target.

---

### `regen(target: selector, duration: int, level: int)`

Apply `minecraft:regeneration` effect to target.

---

### `resistance(target: selector, duration: int, level: int)`

Apply `minecraft:resistance` effect to target.

---

### `strength(target: selector, duration: int, level: int)`

Apply `minecraft:strength` effect to target.

---

### `invisible(target: selector, duration: int)`

Apply `minecraft:invisibility` effect (amplifier 0) to target.

---

### `night_vision(target: selector, duration: int)`

Apply `minecraft:night_vision` effect (amplifier 0) to target.

---

### `slow_fall(target: selector, duration: int)`

Apply `minecraft:slow_falling` effect (amplifier 0) to target.

---

### `glow(target: selector, duration: int)`

Apply `minecraft:glowing` effect (amplifier 0) to target.

---

### `clear_effects(target: selector)`

Clear all effects from target.

**Example:**
```rs
import effects;
clear_effects(@a);
```

---

### `clear_effect(target: selector, eff: string)`

Clear a specific effect from target.

**Example:**
```rs
import effects;
clear_effect(@s, "minecraft:poison");
```

---

### `buff_all(target: selector, duration: int)`

Apply a full buff package: speed I, strength I, regen I, resistance 0.

**Example:**
```rs
import effects;
buff_all(@a, 600);  // 30-second buff for all players
```
