# `parabola` — Projectile trajectories

Import: `import parabola;`

Projectile motion helpers using Minecraft's native physics model. All positions/velocities ×10000 (blocks × 10000), time in ticks, gravity ≈ 0.08 blocks/tick² (800 in ×10000). Provides ballistic aiming (compute initial velocity to hit a target in N ticks), position at time t, flight time estimation, and per-tick drag physics. Requires `math` for `mulfix`, `isqrt`.

## Functions

### `parabola_gravity(): int`

MC gravity constant per tick ×10000: returns 800 (= 0.08 × 10000).

---

### `parabola_gravity_half(): int`

Half-gravity constant: returns 400.

---

### `parabola_vx(dx: int, ticks: int): int`

Initial X velocity ×10000 to reach horizontal offset `dx` blocks in `ticks` ticks (no drag).

**Example:**
```rs
import parabola;
let vx: int = parabola_vx(10, 20);  // 5000 (0.5 blocks/tick)
```

---

### `parabola_vy(dy: int, ticks: int): int`

Initial Y velocity ×10000 to reach vertical offset `dy` blocks in `ticks` ticks (compensates for gravity).

**Example:**
```rs
import parabola;
let vy: int = parabola_vy(5, 20);  // upward velocity to reach +5 blocks in 20 ticks
```

---

### `parabola_vz(dz: int, ticks: int): int`

Initial Z velocity ×10000 to reach `dz` blocks in `ticks` ticks.

---

### `parabola_speed_xz(dx: int, dz: int, ticks: int): int`

Horizontal speed ×10000: `√(vx² + vz²)`. Uses `isqrt`.

---

### `parabola_x(vx0: int, t: int): int`

X position at tick `t` in blocks given initial velocity `vx0 ×10000`.

---

### `parabola_y(vy0: int, t: int): int`

Y position at tick `t` in blocks given initial velocity `vy0 ×10000`. Applies gravity: `vy0×t/10000 - 400×t²/10000`.

---

### `parabola_z(vz0: int, t: int): int`

Z position at tick `t` in blocks given initial velocity `vz0 ×10000`.

---

### `parabola_flight_time(vy0: int): int`

Ticks until the projectile returns to launch height (y=0): `2 × vy0 / 800`. Returns 0 if `vy0 ≤ 0`.

**Example:**
```rs
import parabola;
let t: int = parabola_flight_time(8000);  // 20 ticks
```

---

### `parabola_max_height(vy0: int): int`

Maximum height above launch point in blocks at the apex.

---

### `parabola_step_vx(vx: int, drag: int): int`

Apply drag to X velocity for one tick: `mulfix(vx, drag)`. `drag` ×10000 (e.g. 9900 for arrows).

---

### `parabola_step_vy(vy: int, drag: int): int`

Apply gravity then drag to Y velocity for one tick: `mulfix(vy - gravity, drag)`.

---

### `parabola_step_vz(vz: int, drag: int): int`

Apply drag to Z velocity for one tick.

---

### `parabola_ticks_for_range(range: int): int`

Estimate ticks to reach a horizontal range. Uses average-speed heuristic: `t ≈ range × 10000 / 8000` (assumes ~0.8 blocks/tick horizontal for arrows). For precise aiming, use `parabola_vx/vy/vz` with desired ticks instead.

---

### `parabola_in_range(dx: int, dz: int, max_range: int): int`

Returns 1 if target is within horizontal range (squared distance check, no sqrt).
