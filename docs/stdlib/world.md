# `world` — World queries and manipulation

Import: `import world;`

World manipulation helpers: time control, weather, gamerules, difficulty, fill helpers, and sun angle calculations. Sun angle functions use `×10000` scale and require `math` for `sin_fixed`.

## Functions

### `set_day()`

Set world time to day (tick 1000).

---

### `set_night()`

Set world time to night (tick 13000).

---

### `set_noon()`

Set world time to noon (tick 6000).

---

### `set_midnight()`

Set world time to midnight (tick 18000).

---

### `weather_clear()`

Set weather to clear.

---

### `weather_rain()`

Set weather to rain.

---

### `weather_thunder()`

Set weather to thunder.

---

### `enable_keep_inventory()`

Set `keepInventory` gamerule to true.

---

### `disable_keep_inventory()`

Set `keepInventory` gamerule to false.

---

### `disable_mob_griefing()`

Set `mobGriefing` gamerule to false.

---

### `disable_fire_spread()`

Set `doFireTick` gamerule to false.

---

### `set_peaceful()`

Set difficulty to peaceful.

---

### `set_easy()`

Set difficulty to easy.

---

### `set_normal()`

Set difficulty to normal.

---

### `set_hard()`

Set difficulty to hard.

---

### `barrier_wall(x1: int, y1: int, z1: int, x2: int, y2: int, z2: int)`

Fill region with `minecraft:barrier` blocks.

**Example:**
```rs
import world;
barrier_wall(-50, 0, -50, 50, 256, -50);
```

---

### `clear_area(x1: int, y1: int, z1: int, x2: int, y2: int, z2: int)`

Fill region with `minecraft:air`.

---

### `glass_box(x1: int, y1: int, z1: int, x2: int, y2: int, z2: int)`

Create a hollow glass box: fills outer shell with glass, clears interior with air.

**Example:**
```rs
import world;
glass_box(0, 64, 0, 10, 74, 10);
```

---

### `sun_altitude(ticks: int): int`

> **Requires:** `math:tables` NBT storage must be pre-loaded (uses `sin_fixed`)

Sun elevation above the horizon ×10000. Noon (tick 6000) → 900000 (+90°); midnight (tick 18000) → -900000 (-90°). Uses `sin_fixed`.

**Example:**
```rs
import world;
let alt: int = sun_altitude(6000);  // 900000 (directly overhead)
```

---

### `sun_azimuth(ticks: int): int`

Compass angle of the sun ×10000. Tick 0 = 0° (east), increases linearly to 3600000 over 24000 ticks.

**Example:**
```rs
import world;
let az: int = sun_azimuth(12000);  // 1800000 (180°, west)
```
