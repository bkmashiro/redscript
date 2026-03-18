# `color` — RGB/HSL/hex color utilities

Import: `import color;`

Pack and unpack RGB colors as integers (`0xRRGGBB = R×65536 + G×256 + B`), linear blend between colors, convert between RGB and HSL color spaces, and produce packed hex integers. All HSL operations use ×10000 scale: H ∈ [0, 3600000], S/L ∈ [0, 10000], R/G/B ∈ [0, 2550000] when ×10000-scaled.

## Functions

### `rgb_pack(r: int, g: int, b: int): int`

Pack RGB components (each 0–255) into a single integer `0xRRGGBB`.

**Example:**
```rs
import color;
let red: int = rgb_pack(255, 0, 0);  // 16711680
```

---

### `rgb_r(packed: int): int`

Extract red component (0–255) from a packed RGB integer.

**Example:**
```rs
import color;
let r: int = rgb_r(16711680);  // 255
```

---

### `rgb_g(packed: int): int`

Extract green component (0–255) from a packed RGB integer.

---

### `rgb_b(packed: int): int`

Extract blue component (0–255) from a packed RGB integer.

---

### `rgb_lerp(a: int, b: int, t: int): int`

Linear blend between two packed colors. `t ∈ [0, 1000]` — 0 returns `a`, 1000 returns `b`. Interpolates each channel independently.

**Example:**
```rs
import color;
let blended: int = rgb_lerp(rgb_pack(0,0,0), rgb_pack(255,255,255), 500);  // mid-grey
```

---

### `rgb_to_l(r: int, g: int, b: int): int`

Lightness component in HSL (×10000). R/G/B are raw 0–255. Returns L ∈ [0, 10000].

**Example:**
```rs
import color;
let l: int = rgb_to_l(255, 255, 255);  // 10000
```

---

### `rgb_to_s(r: int, g: int, b: int): int`

Saturation component in HSL (×10000). Returns S ∈ [0, 10000].

---

### `rgb_to_h(r: int, g: int, b: int): int`

Hue component in HSL (×10000). Returns H ∈ [0, 3600000] (0°–360° × 10000).

---

### `hsl_to_r(h: int, s: int, l: int): int`

Convert HSL (×10000 scale) to red component ×10000. H ∈ [0, 3600000], S/L ∈ [0, 10000]. Returns R ∈ [0, 2550000].

**Example:**
```rs
import color;
let r: int = hsl_to_r(0, 10000, 5000);  // pure red, R=2550000
```

---

### `hsl_to_g(h: int, s: int, l: int): int`

Convert HSL (×10000 scale) to green component ×10000. Returns G ∈ [0, 2550000].

---

### `hsl_to_b(h: int, s: int, l: int): int`

Convert HSL (×10000 scale) to blue component ×10000. Returns B ∈ [0, 2550000].

---

### `hsl_to_packed(h: int, s: int, l: int): int`

Convert HSL (×10000 scale) directly to a packed `0xRRGGBB` integer.

**Example:**
```rs
import color;
let packed: int = hsl_to_packed(0, 10000, 5000);  // pure red
```

---

### `rgb_to_hex(r: int, g: int, b: int): int`

Pack RGB into `0xRRGGBB` integer. Equivalent to `rgb_pack`; provided as an explicit alias. R/G/B ∈ [0, 255].

**Example:**
```rs
import color;
let hex: int = rgb_to_hex(0, 128, 255);
```
