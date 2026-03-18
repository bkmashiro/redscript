# `physics` — Velocity, gravity, and collision

Import: `import physics;`

Simple physics simulation for Minecraft datapacks. Fixed-point convention: positions/velocities ×100 (1 block = 100 units), time in ticks (1/20 second), gravity = 8 units/tick² (= 0.08 blocks/tick²). Provides projectile motion, drag, spring physics, circular motion, friction, and impact velocity helpers.

## Functions

### `gravity_fx(): int`

Returns the gravity constant: 8 (= 0.08 blocks/tick² × 100).

---

### `air_drag_fx(): int`

Returns air drag factor: 9800 (= 0.98 × 10000 per tick).

---

### `water_drag_fx(): int`

Returns water drag factor: 8000 (= 0.80 × 10000 per tick).

---

### `projectile_y(p0: int, v0: int, t: int): int`

Y position after `t` ticks. No drag, constant gravity. `p0`, `v0` ×100, `t` in ticks.

**Example:**
```rs
import physics;
let y: int = projectile_y(6400, 100, 10);  // y after 10 ticks
```

---

### `projectile_x(p0: int, v0: int, t: int): int`

Horizontal position after `t` ticks (no gravity, no drag).

---

### `projectile_vy(v0: int, t: int): int`

Y velocity after `t` ticks of gravity: `v0 - gravity × t`.

---

### `projectile_land_t(v0y: int): int`

Approximate tick when Y returns to 0: `2 × v0y / gravity_fx()`.

---

### `projectile_max_height(v0y: int): int`

Maximum height ×100 reached: `v0y² / (2 × gravity)`.

---

### `apply_drag(v_fx: int, drag_fx: int): int`

Apply drag to a velocity: `v × drag / 10000`.

---

### `apply_gravity(vy_fx: int): int`

Subtract one tick of gravity from Y velocity: `vy - gravity_fx()`.

---

### `update_pos(p_fx: int, v_fx: int): int`

Advance position by one tick: `p + v`.

---

### `bounce_v(v_fx: int, restitution_fx: int): int`

Reflect velocity with energy loss. `restitution_fx ×10000`: 10000 = elastic, 5000 = half energy, 0 = inelastic.

**Example:**
```rs
import physics;
let new_vy: int = bounce_v(-50, 8000);  // 80% energy retained
```

---

### `clamp_velocity(v_fx: int, max_fx: int): int`

Clamp speed to `[-max_fx, max_fx]`.

---

### `spring_force(pos_fx: int, target_fx: int, k_fx: int): int`

Hooke's law: `F = -k × (pos - target)`. `k_fx ×10000`.

---

### `spring_update_v(v_fx: int, pos_fx: int, target_fx: int, k_fx: int, damping_fx: int): int`

Update velocity with spring force and damping: `v × damping + spring_force`. Both `k_fx` and `damping_fx` ×10000.

**Example:**
```rs
import physics;
// Spring toward target=0, damping=0.8
let v: int = spring_update_v(50, 200, 0, 5000, 8000);
```

---

### `circular_x(cx: int, r: int, angle_deg: int): int`

X position on a circle. `cx` ×100, `r` ×100, `angle_deg` in degrees (integer, not ×10000).

> **Requires:** `math:tables` NBT storage must be pre-loaded

---

### `circular_z(cz: int, r: int, angle_deg: int): int`

Z position on a circle.

> **Requires:** `math:tables` NBT storage must be pre-loaded

---

### `friction_decel(v_fx: int, friction_fx: int): int`

Reduce velocity toward zero by `friction_fx ×100` per tick, never overshooting zero.

---

### `is_grounded(y_fx: int, ground_y_fx: int): int`

Returns 1 if `y_fx ≤ ground_y_fx`.

---

### `impact_velocity(h_fx: int): int`

Velocity after falling from height `h_fx ×100`: approximates `√(2 × g × h)`.
