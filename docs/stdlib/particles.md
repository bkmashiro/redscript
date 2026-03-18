# `particles` — Particle effect helpers

Import: `import particles;`

Named wrappers for common particle effects at specific positions, plus helpers for drawing 2D/3D particle shapes: lines, circles, and helices. Coordinates in block integers unless noted.

## Functions

### `hearts_at(x: int, y: int, z: int)`

Spawn `heart` particles at block position.

**Example:**
```rs
import particles;
hearts_at(0, 65, 0);
```

---

### `flames(x: int, y: int, z: int)`

Spawn `flame` particles at position.

---

### `smoke(x: int, y: int, z: int)`

Spawn `large_smoke` particles at position.

---

### `explosion_effect(x: int, y: int, z: int)`

Spawn `explosion` particles at position.

---

### `sparkles_at(x: int, y: int, z: int)`

Spawn `enchant` magic sparkle particles at position.

---

### `angry_at(x: int, y: int, z: int)`

Spawn `angry_villager` particles at position.

---

### `happy_at(x: int, y: int, z: int)`

Spawn `happy_villager` particles at position.

---

### `portal_effect(x: int, y: int, z: int)`

Spawn `portal` particles at position.

---

### `totem_at(x: int, y: int, z: int)`

Spawn `totem_of_undying` particles at position.

---

### `end_sparkles_at(x: int, y: int, z: int)`

Spawn `end_rod` sparkle particles at position.

---

### `particle_at_fx(x_fx: int, y_fx: int, z_fx: int, particle: string)`

Spawn a particle at a fixed-point position (coordinates ×100; 1 block = 100 units). Converts to decimal block coordinates before emitting.

**Example:**
```rs
import particles;
particle_at_fx(150, 6400, 250, "minecraft:flame");  // 1.5, 64.0, 2.5
```

---

### `draw_line_2d(x0: int, y0: int, x1: int, y1: int, steps: int, z: int, particle: string)`

Draw a straight line from `(x0, y0)` to `(x1, y1)` with `steps` particle samples. All coords ×100.

**Example:**
```rs
import particles;
draw_line_2d(0, 6400, 1000, 6400, 20, 0, "minecraft:flame");  // horizontal line
```

---

### `draw_circle(cx: int, cy: int, cz: int, r: int, steps: int, particle: string)`

Draw a circle in the XZ plane centred at `(cx, cy, cz)`. `cx`, `cy`, `cz` in blocks; `r` in ×100 units; `steps` particles.

> **Requires:** `math:tables` NBT storage must be pre-loaded (uses `sin_fixed`/`cos_fixed`)

**Example:**
```rs
import particles;
draw_circle(0, 65, 0, 500, 36, "minecraft:enchant");  // 5-block radius circle
```

---

### `draw_helix(cx: int, cy_start: int, cz: int, r: int, height: int, rotations: int, steps: int, particle: string)`

Draw a helix spiral. `r` in ×100 units; `height` in blocks.

> **Requires:** `math:tables` NBT storage must be pre-loaded

---

### `particle_dot(x: int, y: int, z: int, particle: string)`

Spawn a single particle at integer block coordinates using `raw()`.
