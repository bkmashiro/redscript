# `calculus` — Numerical calculus

Import: `import calculus;`

Numerical differentiation (finite differences), numerical integration (trapezoid rule, Simpson's 1/3 rule, Riemann sums), 2D curve length approximation, and running online statistics (Welford's algorithm for mean and variance). All values use fixed-point ×10000 scale unless noted.

## Functions

### `deriv_forward(f1: int, f0: int, h_fx: int): int`

Forward difference derivative: `(f(x+h) - f(x)) / h`. Returns `df/dx ×10000`.

**Example:**
```rs
import calculus;
let d: int = deriv_forward(20000, 10000, 10000);  // 10000 (slope = 1.0)
```

---

### `deriv_central(f_plus: int, f_minus: int, h_fx: int): int`

Central difference derivative (more accurate than forward): `(f(x+h) - f(x-h)) / (2h)`. Returns `df/dx ×10000`.

**Example:**
```rs
import calculus;
let d: int = deriv_central(15000, 5000, 5000);  // 10000
```

---

### `second_deriv(f_plus: int, f0: int, f_minus: int, h_fx: int): int`

Second derivative via central differences: `(f(x+h) - 2f(x) + f(x-h)) / h²`. Returns `d²f/dx² ×10000`.

**Example:**
```rs
import calculus;
let d2: int = second_deriv(10000, 5000, 10000, 5000);
```

---

### `integrate_trapezoid(vals: int[], n: int, h_fx: int): int`

Trapezoidal rule integration over `n` equally-spaced function values. `vals[i]` are `×10000`, `h_fx` is step width `×10000`. Returns integral `×10000`.

> **Cost:** O(n)

**Example:**
```rs
import calculus;
let vals: int[] = [0, 10000, 20000, 10000, 0];
let area: int = integrate_trapezoid(vals, 5, 10000);
```

---

### `integrate_simpson(vals: int[], n: int, h_fx: int): int`

Simpson's 1/3 rule integration (`n` must be odd and ≥ 3; if even, uses `n-1`). More accurate than trapezoid for smooth functions.

> **Cost:** O(n)

**Example:**
```rs
import calculus;
let vals: int[] = [0, 7071, 10000, 7071, 0];
let area: int = integrate_simpson(vals, 5, 2500);
```

---

### `riemann_left(vals: int[], n: int, h_fx: int): int`

Left Riemann sum over `n` values.

> **Cost:** O(n)

---

### `riemann_right(vals: int[], n: int, h_fx: int): int`

Right Riemann sum over `n` values.

> **Cost:** O(n)

---

### `riemann_mid(vals: int[], n: int, h_fx: int): int`

Midpoint Riemann sum. `vals` should contain `n` midpoint values (one per interval).

> **Cost:** O(n)

---

### `curve_length_2d(xs: int[], ys: int[], n: int): int`

Approximate arc length of a 2D polyline through `n` points. Coordinates are `×10000`. Returns total length `×10000`.

> **Cost:** O(n) with integer sqrt per segment

**Example:**
```rs
import calculus;
let xs: int[] = [0, 10000, 20000];
let ys: int[] = [0, 0, 0];
let len: int = curve_length_2d(xs, ys, 3);  // ~20000
```

---

### `running_mean(prev_mean: int, new_val: int, n: int): int`

Welford's online mean update. `n` is the count after adding `new_val` (n ≥ 1). Returns updated mean `×10000`.

**Example:**
```rs
import calculus;
let mean: int = running_mean(50000, 70000, 2);  // 60000
```

---

### `running_m2(prev_m2: int, prev_mean: int, new_mean: int, new_val: int): int`

Welford's M2 update for online variance. `variance = m2 / (n-1)`.

---

### `variance_from_m2(m2: int, n: int): int`

Compute variance from Welford's M2 accumulator. Returns 0 for n ≤ 1.

---

### `std_dev_approx(variance_fx: int): int`

Approximate standard deviation as `√variance` using integer sqrt.
