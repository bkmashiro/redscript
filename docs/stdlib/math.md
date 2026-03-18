# `math` — Basic math operations

Import: `import math;`

Integer and fixed-point math helpers for RedScript datapacks. Fixed-point convention: scale = 1000 (1.0 → 1000, 3.14 → 3140) unless noted. Includes basic helpers (abs, sign, min, max, clamp, lerp), iterative algorithms (isqrt, sqrt_fixed, pow_int, gcd, lcm), trigonometry via a lookup table, fixed-point arithmetic helpers, easing (smoothstep/smootherstep), logarithms, exponential, cubic root, combinatorics, linear equation solvers, numerical integration steps, and arc trig approximations.

## Functions

### `abs<T>(x: T): T`

Absolute value. Works for any numeric type.

**Example:**
```rs
import math;
let v: int = abs(-5);  // 5
```

---

### `sign(x: int): int`

Sign of `x`: returns 1, 0, or -1.

---

### `min<T>(a: T, b: T): T`

Minimum of two values.

---

### `max<T>(a: T, b: T): T`

Maximum of two values.

---

### `clamp<T>(x: T, lo: T, hi: T): T`

Clamp `x` to the range `[lo, hi]`.

---

### `lerp(a: int, b: int, t: int): int`

Linear interpolation. `t ∈ [0, 1000]`. `lerp(100, 200, 750)` → 175.

**Example:**
```rs
import math;
let v: int = lerp(0, 1000, 500);  // 500
```

---

### `isqrt(n: int): int`

> **Cost:** ≤16 Newton-Raphson iterations

Integer square root: `⌊√n⌋`. Uses Newton's method. Converges in ≤16 iterations for all int32.

**Example:**
```rs
import math;
let r: int = isqrt(25);  // 5
```

---

### `sqrt_fixed(x: int): int`

Fixed-point sqrt (scale=1000). Returns `√x × 1000`. `sqrt_fixed(2000)` ≈ 1414.

---

### `pow_int(base: int, exp: int): int`

> **Cost:** O(log exp)

Integer power `base^exp` (exp ≥ 0). Fast exponentiation by squaring.

---

### `gcd(a: int, b: int): int`

Greatest common divisor (Euclidean algorithm). `gcd(12, 8)` → 4.

---

### `lcm(a: int, b: int): int`

Least common multiple. `lcm(4, 6)` → 12.

---

### `map(x: int, in_lo: int, in_hi: int, out_lo: int, out_hi: int): int`

Range map: scale `x` from `[in_lo, in_hi]` onto `[out_lo, out_hi]` using integer arithmetic.

**Example:**
```rs
import math;
let v: int = map(5, 0, 10, 0, 100);  // 50
```

---

### `ceil_div(a: int, b: int): int`

Ceiling division: `⌈a / b⌉`. Requires b > 0.

---

### `log2_int(n: int): int`

Integer log base 2: `⌊log₂(n)⌋`. Returns -1 for n ≤ 0.

---

### `sin_fixed(deg: int): int`

> **Precision:** ≤1 unit error (≤0.1% relative) for all integer degree inputs  
> **Cost:** ~4 MC commands + 1 NBT read  
> **Requires:** `math:tables` NBT storage must be pre-loaded (auto-loaded via `@require_on_load(_math_init)`)

`sin(deg°) × 1000`. Handles any integer degrees; normalises internally. `sin_fixed(30)` → 500.

**Example:**
```rs
import math;
let s: int = sin_fixed(90);  // 1000
```

---

### `cos_fixed(deg: int): int`

> **Precision:** ≤1 unit error  
> **Cost:** ~4 MC commands + 1 NBT read  
> **Requires:** `math:tables` NBT storage must be pre-loaded

`cos(deg°) × 1000`. Implemented as `sin_fixed(deg + 90)`.

---

### `mulfix(a: int, b: int): int`

Fixed-point multiply: `(a × b) / 1000`. Use when both operands are fixed-point (scale=1000) to avoid overflow.

**Example:**
```rs
import math;
let v: int = mulfix(500, 707);  // 353  (≈ 0.5 × 0.707)
```

---

### `divfix(a: int, b: int): int`

Fixed-point divide: `(a × 1000) / b`. Returns 0 if b=0.

---

### `smoothstep(lo: int, hi: int, x: int): int`

> **Cost:** ~5 operations

Smooth Hermite interpolation `3t² - 2t³`. Returns value in `[0, 1000]`. Eases in AND out.

**Example:**
```rs
import math;
let v: int = smoothstep(0, 100, 50);  // 500
```

---

### `smootherstep(lo: int, hi: int, x: int): int`

Perlin's order-5 smootherstep `6t⁵ - 15t⁴ + 10t³`. Zero first and second derivatives at endpoints.

---

### `ln(x: int): int`

> **Precision:** max_error ≈ 0.000504 (tuned 2026-03-17, ~8–9 significant digits)  
> **Cost:** ~27 commands (auto-tuned atanh polynomial)

Natural logarithm. Input/output ×10000 scale. Valid range: x ∈ [100, 1000000] (0.01–100.0). Uses 3-term atanh series with range reduction.

**Example:**
```rs
import math;
let l: int = ln(27183);  // ~10000  (ln(e) ≈ 1.0)
```

---

### `sqrt_fx(x: int): int`

Fixed-point sqrt, scale ×10000. Input x ×10000 (e.g. 40000=4.0), returns `√(x/10000) × 10000`. `sqrt_fx(20000)` ≈ 14142.

---

### `exp_fx(x: int): int`

`e^(x/10000) × 10000`. Uses range reduction + 6-term Horner-form Taylor series. `exp_fx(10000)` ≈ 27183. Valid range: x ∈ [-100000, 100000].

---

### `cbrt_fx(x: int): int`

Integer cube root: `⌊∛x⌋`. Newton's method, 20 iterations.

---

### `cbrt_newton(x: int): int`

Cube root with additional Newton refinement steps beyond `cbrt_fx`. Better convergence for large values.

---

### `factorial(n: int): int`

`n!` for n ∈ [0, 12]. (13! exceeds int32.)

---

### `combinations(n: int, k: int): int`

`C(n, k)` for n ≤ 20, k ≤ n. Uses multiplicative formula to avoid overflow.

---

### `log10_fx(x: int): int`

Log base 10, fixed-point ×10000. Uses `ln(x) / ln(10)`.

---

### `log2_fx(x: int): int`

Log base 2, fixed-point ×10000. Uses `ln(x) / ln(2)`.

---

### `loga_fx(base_fx: int, x: int): int`

Log base `base_fx` of `x`, both ×10000.

---

### `gamma_int(n: int): int`

Gamma function for positive integers: `Γ(n) = (n-1)!`.

---

### `solve2x2_x(a: int, b: int, e: int, c: int, d: int, f: int): int`

Solve `ax + by = e, cx + dy = f` for x using Cramer's rule. Returns `x × 10000`. Returns 0 if determinant is 0.

---

### `solve2x2_y(a: int, b: int, e: int, c: int, d: int, f: int): int`

Solve the same system for y. Returns `y × 10000`.

---

### `quadratic_disc(a: int, b: int, c: int): int`

Discriminant `b² - 4ac`. Positive: two real roots; zero: one root; negative: no real roots.

---

### `quadratic_x1(a: int, b: int, c: int): int`

Larger root of `ax² + bx + c = 0`, returned ×10000.

---

### `quadratic_x2(a: int, b: int, c: int): int`

Smaller root ×10000.

---

### `approx_eq(a: int, b: int, eps: int): int`

Returns 1 if `|a - b| ≤ eps`.

---

### `cubic_disc_fx(p_fx: int, q_fx: int): int`

Discriminant of depressed cubic `t³ + p×t + q = 0`, ×10000 inputs.

---

### `cubic_newton(a_fx: int, b_fx: int, c_fx: int, d_fx: int, x0_fx: int): int`

Newton iteration for general cubic `ax³ + bx² + cx + d = 0`. Up to 20 iterations. Returns approximate root ×10000.

---

### `trapezoid_step(fa: int, fb: int, h: int): int`

One trapezoidal integration step: `(fa + fb) / 2 × h`. All ×10000.

---

### `simpson_step(fa: int, fm: int, fb: int, h: int): int`

One Simpson's rule step over 2h width: `(fa + 4×fm + fb) × h/3`. All ×10000.

---

### `newton_step(x_fx: int, fx: int, dfx: int): int`

One Newton-Raphson step: `x - f(x)/f'(x)`. Returns new x ×10000.

---

### `asin_approx(x_fx: int): int`

Arcsin approximation for `x_fx ∈ [-10000, 10000]` (×10000). Returns degrees ×10000. Uses `arctan(x / √(1-x²))`.

---

### `acos_approx(x_fx: int): int`

Arccos approximation. Returns degrees ×10000. Computed as `90° - asin(x)`.
