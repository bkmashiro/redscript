# `quaternion` — 3D rotations for Display Entities

Import: `import quaternion;`

Quaternion math for MC Display Entity rotations. Quaternions are stored as `[x, y, z, w]` with all components ×10000 (e.g. `qw=10000` = 1.0). A unit quaternion satisfies `qx²+qy²+qz²+qw² = 100,000,000` (= 10000²). Provides constructors from axis-angle, quaternion multiplication, conjugate, magnitude, dot, SLERP (via LERP+normalize for MC game quality), and Euler angles to quaternion conversion (YXZ order). Requires `math` for `sin_fixed`, `cos_fixed`, `mulfix`, `abs`, `isqrt`.

## Functions

### `quat_identity_w(): int`

Returns W component of identity quaternion: 10000.

### `quat_identity_x(): int` / `quat_identity_y(): int` / `quat_identity_z(): int`

Returns 0 (X, Y, Z components of identity).

---

### `quat_axis_x_x(angle_deg: int): int`

> **Requires:** `math:tables` NBT storage must be pre-loaded

X component of quaternion for rotation `angle_deg°` around X axis. Uses `sin(angle/2) × 10`.

### `quat_axis_x_y(angle_deg: int): int` / `quat_axis_x_z(angle_deg: int): int`

Return 0 (for X-axis rotation, Y and Z components are 0).

### `quat_axis_x_w(angle_deg: int): int`

> **Requires:** `math:tables` NBT storage must be pre-loaded

W component: `cos(angle/2) × 10`.

---

### `quat_axis_y_x(angle_deg: int): int` / `quat_axis_y_z(angle_deg: int): int`

Return 0 (for Y-axis rotation).

### `quat_axis_y_y(angle_deg: int): int`

> **Requires:** `math:tables` NBT storage must be pre-loaded

Y component for rotation around Y axis: `sin(angle/2) × 10`.

### `quat_axis_y_w(angle_deg: int): int`

> **Requires:** `math:tables` NBT storage must be pre-loaded

W component: `cos(angle/2) × 10`.

---

### `quat_axis_z_x(angle_deg: int): int` / `quat_axis_z_y(angle_deg: int): int`

Return 0 (for Z-axis rotation).

### `quat_axis_z_z(angle_deg: int): int`

> **Requires:** `math:tables` NBT storage must be pre-loaded

Z component for rotation around Z axis: `sin(angle/2) × 10`.

### `quat_axis_z_w(angle_deg: int): int`

> **Requires:** `math:tables` NBT storage must be pre-loaded

W component: `cos(angle/2) × 10`.

---

### `quat_mul_x(ax: int, ay: int, az: int, aw: int, bx: int, by: int, bz: int, bw: int): int`

X component of quaternion product `a × b`. Uses `mulfix` for fixed-point arithmetic.

**Example:**
```rs
import quaternion;
// Compose two 90° Y-axis rotations
let ax: int = quat_axis_y_x(90); let ay: int = quat_axis_y_y(90);
let az: int = quat_axis_y_z(90); let aw: int = quat_axis_y_w(90);
let rx: int = quat_mul_x(ax, ay, az, aw, ax, ay, az, aw);  // 180° rotation
```

### `quat_mul_y(...)`, `quat_mul_z(...)`, `quat_mul_w(...)`

Y, Z, W components of quaternion product.

---

### `quat_conj_x(qx: int, qy: int, qz: int, qw: int): int`

X component of conjugate (= inverse for unit quaternion): `-qx`.

### `quat_conj_y(...)`, `quat_conj_z(...)`, `quat_conj_w(...)`

Y, Z components: negated. W component: unchanged.

---

### `quat_mag_sq(qx: int, qy: int, qz: int, qw: int): int`

Magnitude squared ×10000 using `mulfix`. For unit quaternion this should equal 10000.

---

### `quat_dot(ax: int, ay: int, az: int, aw: int, bx: int, by: int, bz: int, bw: int): int`

Dot product of two quaternions ×10000.

---

### `quat_slerp_x(ax: int, ay: int, az: int, aw: int, bx: int, by: int, bz: int, bw: int, t: int): int`

X component of SLERP interpolation. `t ∈ [0, 1000]`. Uses LERP + normalize approximation (cheaper than true SLERP; sufficient for MC game use).

### `quat_slerp_y(...)`, `quat_slerp_z(...)`, `quat_slerp_w(...)`

Y, Z, W components of SLERP interpolation.

**Example:**
```rs
import quaternion;
// Interpolate halfway between identity and 90° Y rotation
let bx: int = quat_axis_y_x(90); let by_: int = quat_axis_y_y(90);
let bz: int = quat_axis_y_z(90); let bw: int = quat_axis_y_w(90);
let rx: int = quat_slerp_x(0, 0, 0, 10000, bx, by_, bz, bw, 500);  // 45° at t=500
```

---

### `quat_euler_x(yaw: int, pitch: int, roll: int): int`

> **Requires:** `math:tables` NBT storage must be pre-loaded

X component of quaternion from Euler angles (YXZ order, MC convention). `yaw`, `pitch`, `roll` in degrees (plain integers).

### `quat_euler_y(yaw: int, pitch: int, roll: int): int`

Y component from Euler angles.

### `quat_euler_z(yaw: int, pitch: int, roll: int): int`

Z component from Euler angles.

### `quat_euler_w(yaw: int, pitch: int, roll: int): int`

W component from Euler angles.

**Example:**
```rs
import quaternion;
// Build quaternion from player yaw=45°, pitch=30°, roll=0°
let qx: int = quat_euler_x(45, 30, 0);
let qy: int = quat_euler_y(45, 30, 0);
let qz: int = quat_euler_z(45, 30, 0);
let qw: int = quat_euler_w(45, 30, 0);
```
