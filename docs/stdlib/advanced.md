# `advanced` — Higher-order integer math and algorithmic functions

Import: `import advanced;`

Provides number theory (Fibonacci, primality, Collatz, digit operations, modular exponentiation), integer hashing, 1D noise, Bézier curves (quadratic through N-order), fractal iteration (Mandelbrot, Julia), 2D geometry helpers, and digital root / Ulam spiral utilities. Requires `math` for `lerp`, `smoothstep`, `mulfix`, `abs`, `isqrt`, `sqrt_fixed`.

## Functions

### `fib(n: int): int`

Fibonacci number F(n) using simple iteration. F(0)=0, F(1)=1. Safe up to n=46 (F(46)≈INT_MAX); overflows for larger inputs.

**Example:**
```rs
import advanced;
let f: int = fib(10);  // 55
```

---

### `is_prime(n: int): int`

Primality test by trial division up to √n. Returns 1 if `n` is prime, 0 otherwise.

**Example:**
```rs
import advanced;
let p: int = is_prime(97);  // 1
```

---

### `collatz_steps(n: int): int`

Number of steps in the Collatz sequence starting at `n` until reaching 1.

**Example:**
```rs
import advanced;
let s: int = collatz_steps(27);  // 111
```

---

### `digit_sum(n: int): int`

Sum of decimal digits. Negative input uses absolute value.

**Example:**
```rs
import advanced;
let d: int = digit_sum(123);  // 6
```

---

### `count_digits(n: int): int`

Count decimal digits. Zero has 1 digit. Negative input counts absolute digits.

**Example:**
```rs
import advanced;
let d: int = count_digits(100);  // 3
```

---

### `reverse_int(n: int): int`

Reverse the decimal digits of an integer. Sign is preserved.

**Example:**
```rs
import advanced;
let r: int = reverse_int(12345);  // 54321
```

---

### `mod_pow(base: int, exp: int, m: int): int`

Modular exponentiation: `(base ^ exp) mod m` using fast O(log exp) squaring. `m` must be ≤ 46340 to avoid overflow.

> **Cost:** O(log exp) multiply-divide steps

**Example:**
```rs
import advanced;
let r: int = mod_pow(2, 10, 1000);  // 24  (1024 mod 1000)
```

---

### `hash_int(n: int): int`

Integer hash function. Output is non-negative in range `[0, ~2×10⁹)`. Deterministic — same input always produces the same output. Suitable as a seeded pseudo-random value for procedural generation.

**Example:**
```rs
import advanced;
let h: int = hash_int(42);
```

---

### `noise1d(x: int): int`

1D value noise. Input `x` in fixed-point (scale=1000). Output in `[0, 999]` — smoothly interpolated between hashed lattice points using smoothstep for C1 continuity.

**Example:**
```rs
import advanced;
let n: int = noise1d(500);  // between noise1d(0) and noise1d(1000)
```

---

### `bezier_quad(p0: int, p1: int, p2: int, t: int): int`

Quadratic Bézier curve using De Casteljau's algorithm. `t` in `[0, 1000]` (fixed-point). Numerically stable, safe for large coordinates.

**Example:**
```rs
import advanced;
let mid: int = bezier_quad(0, 500, 1000, 500);  // 500
```

---

### `bezier_cubic(p0: int, p1: int, p2: int, p3: int, t: int): int`

Cubic Bézier curve (4 control points) using De Casteljau's algorithm. `t` in `[0, 1000]`.

**Example:**
```rs
import advanced;
let pos: int = bezier_cubic(0, 333, 667, 1000, 500);
```

---

### `bezier_quartic(p0: int, p1: int, p2: int, p3: int, p4: int, t: int): int`

Quartic Bézier curve (5 control points) using De Casteljau's algorithm. `t` in `[0, 1000]`.

**Example:**
```rs
import advanced;
let pos: int = bezier_quartic(0, 250, 500, 750, 1000, 500);  // 500
```

---

### `bezier_n(pts: int[], n: int, t: int): int`

N-order Bézier curve via De Casteljau's algorithm. `t` in `[0, 1000]`. **Modifies `pts` in-place.** Use `bezier_n_safe` if you need to preserve the control points array.

**Example:**
```rs
import advanced;
let pts: int[] = [0, 333, 667, 1000];
let pos: int = bezier_n(pts, 4, 500);
```

---

### `bezier_n_safe(pts: int[], work: int[], n: int, t: int): int`

N-order Bézier, non-destructive. Copies `pts` into `work` (length ≥ n) then runs `bezier_n` on `work`. `pts` is not modified.

**Example:**
```rs
import advanced;
let pts: int[] = [0, 333, 667, 1000];
let work: int[] = [0, 0, 0, 0];
let pos: int = bezier_n_safe(pts, work, 4, 750);
```

---

### `mandelbrot_iter(cx: int, cy: int, max_iter: int): int`

Mandelbrot set iteration count. `cx`, `cy`: fixed-point coordinates of `c` (scale=1000). Returns iterations before escape (`|z| > 2`), or `max_iter` if inside the set. Use the return value to colour blocks.

**Example:**
```rs
import advanced;
let iters: int = mandelbrot_iter(-1000, 0, 100);  // 100 (point in set)
```

---

### `julia_iter(z0r: int, z0i: int, cr: int, ci: int, max_iter: int): int`

Julia set iteration count — generalised Mandelbrot with fixed `c` and variable starting point `z0`. Same escape condition and scale as `mandelbrot_iter`.

**Example:**
```rs
import advanced;
let iters: int = julia_iter(0, 0, -7000, 2600, 50);
```

---

### `angle_between(x1: int, y1: int, x2: int, y2: int): int`

Angle between two 2D vectors in degrees (unsigned, 0–180). Normalises both vectors before computing. Returns 0 if either vector is zero.

> **Note:** Keep vector components ≤ ~2000 to avoid overflow in the normalisation step.

**Example:**
```rs
import advanced;
let deg: int = angle_between(1000, 0, 0, 1000);  // 90
```

---

### `clamp_circle_x(x: int, y: int, r: int): int`

X component of a 2D point clamped to lie within a circle of radius `r` centred at the origin.

**Example:**
```rs
import advanced;
let cx: int = clamp_circle_x(600, 0, 500);  // 500
```

---

### `clamp_circle_y(x: int, y: int, r: int): int`

Y component of a 2D point clamped to lie within a circle of radius `r` centred at the origin.

**Example:**
```rs
import advanced;
let cy: int = clamp_circle_y(0, 600, 500);  // 500
```

---

### `newton_sqrt(n: int): int`

Newton's method integer square root (alternative to `isqrt`). Converges quadratically.

**Example:**
```rs
import advanced;
let r: int = newton_sqrt(25);  // 5
```

---

### `digital_root(n: int): int`

Repeatedly sum digits until a single digit remains (digital root). `digital_root(493)` → 7 (4+9+3=16 → 1+6=7).

**Example:**
```rs
import advanced;
let d: int = digital_root(493);  // 7
```

---

### `spiral_ring(n: int): int`

Ulam spiral ring number: which concentric square ring integer `n` falls on. Ring 0: n=1; Ring 1: n=2–9; Ring 2: n=10–25.

**Example:**
```rs
import advanced;
let ring: int = spiral_ring(9);  // 1
```
