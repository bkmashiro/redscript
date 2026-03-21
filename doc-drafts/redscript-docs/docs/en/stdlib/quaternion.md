# `quaternion` — Fixed-Point Quaternion Math

Import: `import "stdlib/quaternion.mcrs"`

Quaternion helpers for Minecraft Display Entity rotations. Components are stored separately, each in **×10000** scale, matching the `[x, y, z, w]` convention used by display entity rotation fields.

Requires `stdlib/math` for `sin_fixed()`, `cos_fixed()`, `mulfix()`, and `isqrt()`.

## Scale and Conventions

- `10000` means `1.0`
- Identity quaternion is `(0, 0, 0, 10000)`
- A unit quaternion has `qx^2 + qy^2 + qz^2 + qw^2 ≈ 10000^2`
- Euler conversion uses **YXZ** order: yaw, then pitch, then roll

## Quick Example

```rs
import "stdlib/quaternion.mcrs";

let qx: int = quat_axis_y_x(90);
let qy: int = quat_axis_y_y(90);
let qz: int = quat_axis_y_z(90);
let qw: int = quat_axis_y_w(90);

let mid_y: int = quat_slerp_y(0, 0, 0, 10000, qx, qy, qz, qw, 500);
```

## Identity Quaternion

### `quat_identity_w(): int`

Return `10000`.

### `quat_identity_x(): int`

Return `0`.

### `quat_identity_y(): int`

Return `0`.

### `quat_identity_z(): int`

Return `0`.

## Axis-Angle Constructors

Each axis-angle constructor is split into per-component functions. Angles are plain integer degrees, and the implementation uses `sin(angle / 2)` and `cos(angle / 2)`.

### X-axis rotation

- `quat_axis_x_x(angle_deg: int): int`
- `quat_axis_x_y(angle_deg: int): int`
- `quat_axis_x_z(angle_deg: int): int`
- `quat_axis_x_w(angle_deg: int): int`

### Y-axis rotation

- `quat_axis_y_x(angle_deg: int): int`
- `quat_axis_y_y(angle_deg: int): int`
- `quat_axis_y_z(angle_deg: int): int`
- `quat_axis_y_w(angle_deg: int): int`

### Z-axis rotation

- `quat_axis_z_x(angle_deg: int): int`
- `quat_axis_z_y(angle_deg: int): int`
- `quat_axis_z_z(angle_deg: int): int`
- `quat_axis_z_w(angle_deg: int): int`

## Quaternion Product

These functions compute the component-wise result of `a * b`.

- `quat_mul_x(ax, ay, az, aw, bx, by, bz, bw): int`
- `quat_mul_y(ax, ay, az, aw, bx, by, bz, bw): int`
- `quat_mul_z(ax, ay, az, aw, bx, by, bz, bw): int`
- `quat_mul_w(ax, ay, az, aw, bx, by, bz, bw): int`

Use them together when composing rotations.

## Conjugate

For unit quaternions, the conjugate is also the inverse.

- `quat_conj_x(qx, qy, qz, qw): int`
- `quat_conj_y(qx, qy, qz, qw): int`
- `quat_conj_z(qx, qy, qz, qw): int`
- `quat_conj_w(qx, qy, qz, qw): int`

## Magnitude and Dot

### `quat_mag_sq(qx: int, qy: int, qz: int, qw: int): int`

Return magnitude squared in ×10000 scale. A normalized quaternion should be close to `10000`.

### `quat_dot(ax: int, ay: int, az: int, aw: int, bx: int, by: int, bz: int, bw: int): int`

Return dot product in ×10000 scale.

## Interpolation

### `quat_slerp_x(ax: int, ay: int, az: int, aw: int, bx: int, by: int, bz: int, bw: int, t: int): int`

### `quat_slerp_y(ax: int, ay: int, az: int, aw: int, bx: int, by: int, bz: int, bw: int, t: int): int`

### `quat_slerp_z(ax: int, ay: int, az: int, aw: int, bx: int, by: int, bz: int, bw: int, t: int): int`

### `quat_slerp_w(ax: int, ay: int, az: int, aw: int, bx: int, by: int, bz: int, bw: int, t: int): int`

Approximate spherical interpolation between `a` and `b`.

- `t` is in `[0, 1000]`
- `0` returns `a`
- `1000` returns `b`

Implementation detail: this is a lerp-plus-normalize approximation rather than true trig-based SLERP, which is cheaper and suitable for Minecraft animation.

## Euler to Quaternion

### `quat_euler_x(yaw: int, pitch: int, roll: int): int`

### `quat_euler_y(yaw: int, pitch: int, roll: int): int`

### `quat_euler_z(yaw: int, pitch: int, roll: int): int`

### `quat_euler_w(yaw: int, pitch: int, roll: int): int`

Convert yaw, pitch, and roll in degrees into a quaternion using YXZ order.

## Notes

- These helpers return components separately instead of a single array, which matches how RedScript users often write NBT fields.
- Axis-angle constructors and Euler conversion depend on the math trig tables being available.
