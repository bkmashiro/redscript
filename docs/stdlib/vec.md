# `vec` — 2D and 3D vectors

Import: `import vec;`

2D and 3D vector math with fixed-point scale=1000 (same as `math`). A unit vector has components in `[-1000, 1000]`. Provides dot product, cross product, Euclidean/Manhattan/Chebyshev distance, normalisation, linear interpolation, 2D rotation, `atan2` lookup, and 3D component-wise arithmetic. Requires `math` for `abs`, `sqrt_fixed`, `sin_fixed`, `cos_fixed`, `lerp`, `mulfix`.

## Functions

### `dot2d(ax: int, ay: int, bx: int, by: int): int`

2D dot product of integer vectors. `dot2d(3, 4, 3, 4)` → 25.

---

### `cross2d(ax: int, ay: int, bx: int, by: int): int`

Z-component of the 3D cross product: `ax×by − ay×bx`. Positive means b is counter-clockwise from a.

---

### `length2d_fixed(x: int, y: int): int`

Euclidean length ×1000. `length2d_fixed(3, 4)` → 5000. Input components safe up to ~1000.

---

### `distance2d_fixed(x1: int, y1: int, x2: int, y2: int): int`

Euclidean distance between two points ×1000. `distance2d_fixed(0, 0, 3, 4)` → 5000.

---

### `manhattan(x1: int, y1: int, x2: int, y2: int): int`

Manhattan (taxicab) distance: `|dx| + |dy|`.

---

### `chebyshev(x1: int, y1: int, x2: int, y2: int): int`

Chebyshev (chess-king) distance: `max(|dx|, |dy|)`.

---

### `normalize2d_x(x: int, y: int): int`

X component of unit vector ×1000. Returns 0 for zero vector.

**Example:**
```rs
import vec;
let ux: int = normalize2d_x(3, 4);  // 600  (3/5 × 1000)
```

---

### `normalize2d_y(x: int, y: int): int`

Y component of unit vector ×1000. `normalize2d_y(3, 4)` → 800.

---

### `lerp2d_x(ax: int, ay: int, bx: int, by: int, t: int): int`

X component of linear interpolation between vectors a and b. `t ∈ [0, 1000]`.

---

### `lerp2d_y(ax: int, ay: int, bx: int, by: int, t: int): int`

Y component of linear interpolation. `lerp2d_y(0, 0, 100, 200, 500)` → 100.

---

### `atan2_fixed(y: int, x: int): int`

> **Cost:** O(log 46) — binary search on 46-entry tan table  
> **Requires:** `math:tables` NBT storage must be pre-loaded (auto-loaded via `@require_on_load(_atan_init)`)

Angle of vector `(y, x)` in integer degrees `[0, 359]`. Inputs clamped to ≤46340 to avoid overflow.

**Example:**
```rs
import vec;
let angle: int = atan2_fixed(1, 1);  // 45
```

---

### `rotate2d_x(x: int, y: int, deg: int): int`

> **Requires:** `math:tables` NBT storage must be pre-loaded

X component after 2D rotation by `deg` degrees (integer degrees, not ×10000). `rotate2d_x(1000, 0, 90)` → 0.

---

### `rotate2d_y(x: int, y: int, deg: int): int`

> **Requires:** `math:tables` NBT storage must be pre-loaded

Y component after 2D rotation. `rotate2d_y(1000, 0, 90)` → 1000.

---

### `dot3d(ax: int, ay: int, az: int, bx: int, by: int, bz: int): int`

3D dot product.

---

### `cross3d_x(ax: int, ay: int, az: int, bx: int, by: int, bz: int): int`

X component of 3D cross product: `ay×bz − az×by`.

---

### `cross3d_y(ax: int, ay: int, az: int, bx: int, by: int, bz: int): int`

Y component of 3D cross product: `az×bx − ax×bz`.

---

### `cross3d_z(ax: int, ay: int, az: int, bx: int, by: int, bz: int): int`

Z component of 3D cross product: `ax×by − ay×bx`.

---

### `length3d_fixed(x: int, y: int, z: int): int`

Euclidean length ×1000. `length3d_fixed(1, 1, 1)` → 1732. Input components safe up to ~800.

---

### `distance3d_fixed(x1: int, y1: int, z1: int, x2: int, y2: int, z2: int): int`

3D Euclidean distance ×1000.

---

### `manhattan3d(x1: int, y1: int, z1: int, x2: int, y2: int, z2: int): int`

3D Manhattan distance.

---

### `chebyshev3d(x1: int, y1: int, z1: int, x2: int, y2: int, z2: int): int`

3D Chebyshev distance.

---

### 2D arithmetic helpers

| Function | Description |
|:--|:--|
| `add2d_x(ax, bx)` | ax + bx |
| `add2d_y(ay, by)` | ay + by |
| `sub2d_x(ax, bx)` | ax - bx |
| `sub2d_y(ay, by)` | ay - by |
| `scale2d_x(x, s)` | x × s / 1000 |
| `scale2d_y(y, s)` | y × s / 1000 |
| `neg2d_x(x)` | -x |
| `neg2d_y(y)` | -y |

---

### 3D arithmetic helpers

| Function | Description |
|:--|:--|
| `add3d_x(ax, bx)` | ax + bx |
| `add3d_y(ay, by)` | ay + by |
| `add3d_z(az, bz)` | az + bz |
| `sub3d_x(ax, bx)` | ax - bx |
| `sub3d_y(ay, by)` | ay - by |
| `sub3d_z(az, bz)` | az - bz |
| `scale3d_x(x, s)` | x × s / 1000 |
| `scale3d_y(y, s)` | y × s / 1000 |
| `scale3d_z(z, s)` | z × s / 1000 |
| `neg3d_x(x)` | -x |
| `neg3d_y(y)` | -y |
| `neg3d_z(z)` | -z |

**Example:**
```rs
import vec;
// Normalize a 2D direction and scale to speed 300
let dx: int = 3; let dy: int = 4;
let vx: int = scale2d_x(normalize2d_x(dx, dy), 300);  // 180
let vy: int = scale2d_y(normalize2d_y(dx, dy), 300);  // 240
```
