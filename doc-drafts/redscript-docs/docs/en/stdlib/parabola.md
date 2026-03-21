# `parabola` — Projectile Aiming and Trajectory Helpers

Import: `import "stdlib/parabola.mcrs"`

Projectile helpers for Minecraft-style trajectories. This module is aimed at launch planning and simple tick-by-tick simulation. It uses **×10000 fixed-point velocities** and a gravity constant tuned to Minecraft projectile motion.

## Units

- Position offsets: blocks
- Velocity: blocks/tick ×10000
- Time: ticks
- Gravity: `800` means `0.08 blocks/tick^2`
- Drag: ×10000

Requires `stdlib/math` for `mulfix()` and `isqrt()`.

## Quick Example

```rs
import "stdlib/parabola.mcrs";

let ticks: int = 20;
let vx: int = parabola_vx(16, ticks);
let vy: int = parabola_vy(4, ticks);
let vz: int = parabola_vz(0, ticks);

let y_at_10: int = parabola_y(vy, 10);
let flight: int = parabola_flight_time(vy);
```

## Constants

### `parabola_gravity(): int`

Returns `800`, the per-tick gravity constant in ×10000 scale.

### `parabola_gravity_half(): int`

Returns `400`, used by the displacement formulas.

## Velocity Solvers

### `parabola_vx(dx: int, ticks: int): int`

Initial X velocity needed to travel `dx` blocks in `ticks` ticks. Returns `0` if `ticks <= 0`.

### `parabola_vy(dy: int, ticks: int): int`

Initial Y velocity needed to reach vertical offset `dy` in `ticks` ticks under constant gravity. Returns `0` if `ticks <= 0`.

### `parabola_vz(dz: int, ticks: int): int`

Initial Z velocity needed to travel `dz` blocks in `ticks` ticks. Returns `0` if `ticks <= 0`.

### `parabola_speed_xz(dx: int, dz: int, ticks: int): int`

Horizontal speed magnitude from the solved `vx` and `vz`, returned in ×10000 scale.

## Position at Tick `t`

### `parabola_x(vx0: int, t: int): int`

Horizontal X displacement after `t` ticks.

### `parabola_y(vy0: int, t: int): int`

Vertical displacement after `t` ticks under constant gravity.

### `parabola_z(vz0: int, t: int): int`

Horizontal Z displacement after `t` ticks.

## Flight Estimates

### `parabola_flight_time(vy0: int): int`

Approximate number of ticks until a projectile returns to launch height. Returns `0` if `vy0 <= 0`.

### `parabola_max_height(vy0: int): int`

Approximate maximum height above launch point, in blocks.

## Tick-Step Drag Helpers

These functions are for per-tick simulation, not closed-form aiming.

### `parabola_step_vx(vx: int, drag: int): int`

Apply drag to X velocity.

### `parabola_step_vy(vy: int, drag: int): int`

Apply gravity first, then drag, to Y velocity.

### `parabola_step_vz(vz: int, drag: int): int`

Apply drag to Z velocity.

## Targeting Helpers

### `parabola_ticks_for_range(range: int): int`

Estimate a practical flight time for a horizontal range, using a simple average-speed heuristic. Returns at least `1`.

### `parabola_in_range(dx: int, dz: int, max_range: int): int`

Return `1` if the horizontal target lies within `max_range`, otherwise `0`.

## Notes

- Closed-form position helpers here assume no drag.
- Drag-aware helpers only advance velocity one tick at a time.
- `parabola_y()` and `parabola_max_height()` return integer block values, so truncation is expected.
