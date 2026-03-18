# `math_hp` — High-precision math

Import: `import math_hp;`

High-precision arithmetic exploiting Minecraft's internal IEEE 754 double storage. Provides double-precision sin/cos via a Marker entity rotation trick, high-precision division via Display Entity SVD, double arithmetic (add, sub, mul, div), high-precision ln (Newton-refined), double sqrt, and real-valued power. Setup required: call `init_trig()` (and optionally `init_div()`, `init_double_add()`) from your `@load` function.

> **Setup required:** Call `init_trig()` in your `@load` function. These functions are auto-registered via `@require_on_load` but the entity must exist at runtime.

## Functions

### `init_trig()`

Create the `rs_trig` Marker entity used by `sin_hp`/`cos_hp`/`norm3_hp`. Safe to call multiple times (only spawns if not already present). Called automatically via `@require_on_load`.

---

### `sin_hp(angle: int): int`

> **Precision:** ~15 significant figures (Java `Math.sin` double precision)  
> **Cost:** ~8 commands + entity NBT read/write  
> **Requires:** `rs_trig` Marker entity must exist (call `init_trig()` in `@load`)

High-precision sine. `angle` in degrees ×10000 (e.g. 450000 = 45°). Returns `sin(angle/10000°) × 10000`.

**Example:**
```rs
import math_hp;

@load fn setup() { init_trig(); }

fn my_fn() {
    let s: int = sin_hp(900000);  // 10000  (sin 90° = 1.0)
}
```

---

### `cos_hp(angle: int): int`

> **Precision:** ~15 significant figures  
> **Cost:** ~8 commands + entity NBT read/write  
> **Requires:** `rs_trig` Marker entity

High-precision cosine. `angle` in degrees ×10000. Returns `cos(angle/10000°) × 10000`.

---

### `init_div()`

Create the `rs_div` block_display entity used by `div_hp`, `div3_hp`, `double_div`. Called automatically via `@require_on_load`.

---

### `div_hp(a: int, b: int): int`

> **Precision:** ~15 significant figures (Display Entity SVD, Java double)  
> **Cost:** ~10 commands + entity transformation write/read  
> **Requires:** `rs_div` block_display entity (call `init_div()` in `@load`)

High-precision integer division `a/b`, returns `(a/b) × 10000`. Example: `div_hp(10000, 3000)` ≈ 33333.

**Example:**
```rs
import math_hp;
let result: int = div_hp(10000, 3000);  // ~33333
```

---

### `div3_hp(a: int, b: int, c: int, d: int): int`

> **Precision:** ~15 significant figures  
> **Requires:** `rs_div` entity

Divide three values by `d` simultaneously via a diagonal matrix decomposition. Returns `a/d × 10000`. Results for `b/d` and `c/d` are in scoreboards `$div3_y` and `$div3_z __rs_math_hp`.

---

### `sqrt_hp(x: int): int`

> **Precision:** ~8 significant figures (two Newton refinement steps using `div_hp`)  
> **Requires:** `rs_div` entity

High-precision square root. Input `x ×10000`. Returns `√(x/10000) × 10000`.

---

### `norm3_hp(x: int, y: int, z: int): int`

> **Requires:** `rs_trig` entity

High-precision 3D vector magnitude `√(x²+y²+z²)`. All inputs ×10000, returns ×10000.

---

### `double_mul_fixed(d: double, f: int): double`

> **Precision:** Full IEEE 754 double (no integer intermediate for the multiplication)  
> **Cost:** ~5 commands + macro function call

Multiply a double value `d` by a fixed-point integer `f` (×10000 scale). Computes `d × (f / 10000)` entirely in IEEE 754 double arithmetic using a function macro trick.

---

### `init_double_add()`

Summon the AEC marker entity for `double_add`/`double_sub`. Called automatically via `@require_on_load`.

---

### `double_add(a: double, b: double): double`

> **Precision:** Full IEEE 754 double (~15 significant figures)  
> **Cost:** ~6 commands + entity teleport

`a + b` in true double precision via entity position trick (Marker teleported to `x=a` then relative TP by `+b`).

---

### `double_sub(a: double, b: double): double`

> **Precision:** Full IEEE 754 double. Note: catastrophic cancellation applies when a ≈ b  
> **Cost:** ~7 commands

`a - b` in double precision. Negates `b` via execute-store with scale -1 then calls `double_add`.

---

### `double_mul(a: double, b: double): double`

> **Precision:** ~4 decimal digits (10000× scale integer intermediary; NOT full double precision)  
> **Cost:** ~5 commands  
> **Note:** Overflow for |a|×|b| > ~21474; safe for small values only

`a × b` via scoreboard integer approximation. For larger values use ln/exp decomposition.

---

### `double_div(a: double, b: double): double`

> **Precision:** Full IEEE 754 double  
> **Cost:** ~6 commands + entity transformation  
> **Requires:** `rs_div` entity  
> **Warning:** Division by zero produces Java Infinity/NaN which corrupts NBT

`a / b` in true double precision via Display Entity SVD trick.

---

### `ln_hp(x: int): int`

> **Precision:** ~8–9 significant digits (one Newton step on top of `ln_5term`)  
> **Cost:** ~35 commands (ln_5term + exp_fx + correction)

High-precision natural log. Input/output ×10000. Valid range: x ∈ [100, 1000000]. Algorithm: initial estimate via 5-term atanh series, then one Newton refinement step.

---

### `ln_5term(x: int): int`

> **Precision:** max_error ≈ 0.000002 (2× better than 3-term `ln()`)  
> **Cost:** ~30 commands

Natural log using 5-term atanh series with range reduction. Input/output ×10000. Valid range: x ∈ [100, 1000000].

---

### `double_sqrt(x: double): double`

Square root of a double value. Strategy: converts to ×10000 integer, applies `isqrt`, scales back to double.

---

### `pow_real(base: double, exp_val: double): double`

> **Requires:** `rs_trig` entity  
> **Precision:** ~6–8 significant digits (limited by exp_fx precision)

`base^exp_val` for double inputs using `e^(exp_val × ln(base))` via fixed-point helpers.

---

### `pow_fast(base: double, exp_val: int): double`

`base^exp_val` for double base, integer exponent. Uses binary exponentiation. Handles negative exponents via `double_div`. Recursive.
