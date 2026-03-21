# `physics` — Simple Fixed-Point Physics Helpers

Import: `import "stdlib/physics.mcrs"`

Simple physics simulation helpers for Minecraft datapacks. This module uses per-axis integer math and a fixed-point scale of **×100**, where `100` means `1.0 block` or `1.0 block/tick` depending on context.

## Units

- Position: blocks ×100
- Velocity: blocks/tick ×100
- Time: ticks
- Gravity: `8` means `0.08 blocks/tick^2`
- Drag and restitution: ×10000

## Quick Example

```rs
import "stdlib/physics.mcrs";

let y0: int = 6400;    // 64.00 blocks
let vy0: int = 120;    // 1.20 blocks/tick
let t: int = 10;

let y: int = projectile_y(y0, vy0, t);
let vy: int = projectile_vy(vy0, t);

let bounced: int = bounce_v(vy, 7000);   // 70% bounce
```

## Constants

### `gravity_fx(): int`

Returns `8`, representing Minecraft-like gravity in ×100 units.

### `air_drag_fx(): int`

Returns `9800`, meaning a drag factor of `0.98` per tick.

### `water_drag_fx(): int`

Returns `8000`, meaning a drag factor of `0.80` per tick.

## Projectile Motion

### `projectile_y(p0: int, v0: int, t: int): int`

Vertical position after `t` ticks with constant gravity and no drag.

### `projectile_x(p0: int, v0: int, t: int): int`

Horizontal position after `t` ticks with no drag.

### `projectile_vy(v0: int, t: int): int`

Vertical velocity after `t` ticks of gravity.

### `projectile_land_t(v0y: int): int`

Approximate tick when vertical position returns to launch height. Returns `0` if `v0y <= 0`.

### `projectile_max_height(v0y: int): int`

Maximum height above the launch point in ×100 units.

## Drag and Integration

### `apply_drag(v_fx: int, drag_fx: int): int`

Apply one multiplicative drag step: `v * drag / 10000`.

### `apply_gravity(vy_fx: int): int`

Apply one gravity tick to a vertical velocity.

### `update_pos(p_fx: int, v_fx: int): int`

Advance one tick by adding velocity directly to position.

## Collision and Clamping

### `bounce_v(v_fx: int, restitution_fx: int): int`

Reflect velocity and apply a restitution factor.

- `10000` = perfectly elastic
- `5000` = half-speed rebound
- `0` = no rebound

### `clamp_velocity(v_fx: int, max_fx: int): int`

Clamp velocity into `[-max_fx, max_fx]`.

## Spring Helpers

### `spring_force(pos_fx: int, target_fx: int, k_fx: int): int`

Hooke-style spring force toward `target_fx`, with `k_fx` scaled by ×10000.

### `spring_update_v(v_fx: int, pos_fx: int, target_fx: int, k_fx: int, damping_fx: int): int`

Apply spring force and damping to produce the next velocity estimate.

## Circular Motion

This section depends on trig helpers from `stdlib/math`.

### `circular_x(cx: int, r: int, angle_deg: int): int`

X coordinate on a circle around center `cx`.

### `circular_z(cz: int, r: int, angle_deg: int): int`

Z coordinate on a circle around center `cz`.

## Friction and Impact

### `friction_decel(v_fx: int, friction_fx: int): int`

Reduce velocity toward zero by a fixed per-tick amount.

### `is_grounded(y_fx: int, ground_y_fx: int): int`

Return `1` if `y_fx <= ground_y_fx`, otherwise `0`.

### `impact_velocity(h_fx: int): int`

Approximate impact speed from a fall height in ×100 units. Returns `0` for non-positive heights.

## Notes

- This module is intentionally simple and axis-separated.
- No vector type is used; callers combine `x`, `y`, and `z` themselves.
- `circular_x()`, `circular_z()`, and `impact_velocity()` rely on math helpers such as `sin_fixed`, `cos_fixed`, and `isqrt`.
