# `noise` — Procedural noise

Import: `import noise;`

Procedural noise functions using fixed-point arithmetic (×10000 scale) with no external dependencies. Provides 1D and 2D integer hash functions, smooth value noise (bilinear interpolation with smoothstep), fractal Brownian motion (octave stacking), and a terrain height convenience function. Requires `math` for `lerp`, `abs`, `clamp`.

## Functions

### `hash_1d(x: int): int`

Pseudo-random integer from a 1D coordinate. Returns any int (use `%` to restrict range).

**Example:**
```rs
import noise;
let h: int = hash_1d(42);
```

---

### `hash_2d(x: int, z: int): int`

Pseudo-random integer from 2D coordinates.

---

### `hash_1d_pos(x: int): int`

Hash in `[0, 10000]` from 1D coordinate.

---

### `hash_2d_pos(x: int, z: int): int`

Hash in `[0, 10000]` from 2D coordinates.

---

### `value_noise_1d(x_fx: int): int`

> **Cost:** O(1) — 2 hash lookups + smoothstep interpolation

Smooth 1D value noise at position `x_fx` (fixed-point ×10000). Returns value in `[0, 10000]`. Uses linear interpolation with smoothstep for C1 continuity.

**Example:**
```rs
import noise;
let n: int = value_noise_1d(15000);  // position 1.5 → smooth value in [0, 10000]
```

---

### `value_noise_2d(x_fx: int, z_fx: int): int`

> **Cost:** O(1) — 4 hash lookups + bilinear interpolation

Smooth 2D value noise. Returns value in `[0, 10000]`. Bilinear interpolation of 4 corner hash values with smoothstep weights.

**Example:**
```rs
import noise;
let n: int = value_noise_2d(10000, 20000);  // at (1.0, 2.0)
```

---

### `fbm_1d(x_fx: int, octaves: int, persistence_fx: int): int`

> **Cost:** O(octaves) — one value_noise_1d call per octave

Fractal Brownian Motion in 1D. Stacks `octaves` noise layers with amplitude decaying by `persistence_fx ×10000` per octave (typical: 5000 = 0.5). Returns normalised value in `[0, 10000]`.

**Example:**
```rs
import noise;
let n: int = fbm_1d(10000, 4, 5000);  // 4 octaves, 0.5 persistence
```

---

### `fbm_2d(x_fx: int, z_fx: int, octaves: int, persistence_fx: int): int`

> **Cost:** O(octaves)

Fractal Brownian Motion in 2D. Returns normalised value in `[0, 10000]`.

**Example:**
```rs
import noise;
let n: int = fbm_2d(10000, 30000, 3, 5000);
```

---

### `terrain_height(x: int, z: int, base_y: int, amplitude: int): int`

Generate terrain height at block coordinate `(x, z)` using 3-octave 2D fbm with persistence 0.5. Returns `base_y + noise × amplitude` in blocks.

**Example:**
```rs
import noise;
let h: int = terrain_height(100, 200, 64, 20);  // height near y=64±20
```
