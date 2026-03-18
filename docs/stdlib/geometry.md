# `geometry` — 3D geometry and selection zones

Import: `import geometry;`

3D geometry helpers for Minecraft datapacks: bounding box and sphere containment tests, vertical cylinder and cone checks, 2D fan (sector) selection, parabola helpers, grid/tile math, angle utilities, and sun angle conversion. Fixed-point convention: coordinates ×100 (1 block = 100 units); angles in degrees ×10000. Requires `math` for `sqrt_fx`, `sin_fixed`, `cos_fixed`, `abs`.

## Functions

### `midpoint(a: int, b: int): int`

Integer midpoint of two coordinates: `(a + b) / 2`.

---

### `aabb_contains(px: int, py: int, pz: int, minx: int, miny: int, minz: int, maxx: int, maxy: int, maxz: int): int`

Returns 1 if point `(px, py, pz)` is inside the axis-aligned bounding box, 0 otherwise.

**Example:**
```rs
import geometry;
let inside: int = aabb_contains(50, 64, 50, 0, 60, 0, 100, 80, 100);  // 1
```

---

### `sphere_contains(px: int, py: int, pz: int, cx: int, cy: int, cz: int, r: int): int`

Returns 1 if point is inside a sphere. Avoids sqrt by comparing squared distances.

**Example:**
```rs
import geometry;
let inside: int = sphere_contains(5, 0, 0, 0, 0, 0, 10);  // 1 (dist=5 < r=10)
```

---

### `cylinder_contains(px: int, pz: int, cx: int, cz: int, r: int): int`

Returns 1 if `(px, pz)` is inside a vertical cylinder (ignores Y axis). 2D circle check.

**Example:**
```rs
import geometry;
let inside: int = cylinder_contains(3, 4, 0, 0, 10);  // 1
```

---

### `parabola_y(y0: int, vy0: int, t: int): int`

Y position at tick `t` for a parabolic arc. `y0`: initial Y ×100, `vy0`: initial Y velocity ×100. Gravity: 5 units/tick² (= 0.05 blocks/tick²).

---

### `parabola_x(x0: int, vx0: int, t: int): int`

Horizontal X position at tick `t` (no drag, constant velocity).

---

### `parabola_land_t(vy0: int): int`

Approximate tick when projectile returns to Y=0: `t ≈ 2 × vy0 / 5`.

---

### `tile_of(coord: int, tile_size: int): int`

Which tile a coordinate belongs to (floor division, handles negative coordinates correctly).

---

### `tile_center(tile: int, tile_size: int): int`

Center coordinate of a tile.

---

### `angle_normalize(deg: int): int`

Normalize angle to `[0, 3600000)` (degrees ×10000).

---

### `angle_diff(a: int, b: int): int`

Signed shortest angular difference between two angles (degrees ×10000). Result in `(-1800000, 1800000]`.

---

### `mc_day_angle(daytime: int): int`

Convert MC `/time query daytime` (0–24000) to sun angle ×10000. Tick 0 = dawn (90°), tick 6000 = noon (180°).

---

### `in_cylinder(px: int, py: int, pz: int, cx: int, cz: int, radius: int, y_lo: int, y_hi: int): int`

Returns 1 if `(px, py, pz)` is inside a vertical cylinder centred at `(cx, *, cz)` with the given height bounds. All coordinates ×10000 (1 block = 10000 units).

> **Note:** Radius up to ~46340 (≈4.6 blocks at ×10000 scale) to avoid overflow. For larger radii, divide all coords by 10 first.

**Example:**
```rs
import geometry;
let inside: int = in_cylinder(50000, 64000, 50000, 50000, 50000, 30000, 60000, 70000);
```

---

### `in_cone(px: int, py: int, pz: int, apex_x: int, apex_y: int, apex_z: int, dir_y: int, half_angle_tan: int, height: int): int`

Returns 1 if point is inside an upright cone (axis along ±Y from apex). `half_angle_tan = tan(half-angle) × 10000` (e.g. 45° → 10000, 30° → 5773). `dir_y > 0` for upward cone, `dir_y < 0` for downward.

---

### `in_sector_2d(px: int, pz: int, cx: int, cz: int, dir_angle: int, half_angle: int, radius: int): int`

Returns 1 if `(px, pz)` is inside a 2D fan (sector) in the XZ plane. `dir_angle` and `half_angle` are ×10000 radians (full circle = 628318). Requires `atan2_fixed` from `vec`.

> **Requires:** `math:tables` NBT storage must be pre-loaded (via `@require_on_load(_atan_init)`)

**Example:**
```rs
import geometry;
// Is point in a 90° cone facing east (+X)?
let inside: int = in_sector_2d(10, 0, 0, 0, 0, 157080, 20);
```
