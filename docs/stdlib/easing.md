# `easing` — Easing functions for animations and transitions

Import: `import easing;`

Standard easing functions for smooth animations, UI transitions, and projectile arcs. All functions take `t ∈ [0, 10000]` (fixed-point ×10000) and return a value in `[0, 10000]` (elastic/bounce may slightly exceed this range). Requires `math` for `abs`, `clamp`.

## Functions

### `ease_linear(t: int): int`

Linear easing — no transformation.

**Example:**
```rs
import easing;
let v: int = ease_linear(5000);  // 5000
```

---

### `ease_in_quad(t: int): int`

Quadratic ease-in: slow start, fast end. `f(t) = t²`.

**Example:**
```rs
import easing;
let v: int = ease_in_quad(5000);  // 2500
```

---

### `ease_out_quad(t: int): int`

Quadratic ease-out: fast start, slow end.

---

### `ease_in_out_quad(t: int): int`

Quadratic ease-in-out: slow start and end, fast middle.

---

### `ease_in_cubic(t: int): int`

Cubic ease-in: `f(t) = t³`.

---

### `ease_out_cubic(t: int): int`

Cubic ease-out.

---

### `ease_in_out_cubic(t: int): int`

Cubic ease-in-out.

---

### `ease_in_quart(t: int): int`

Quartic ease-in: `f(t) = t⁴`.

---

### `ease_out_quart(t: int): int`

Quartic ease-out.

---

### `ease_in_sine(t: int): int`

Sine-approximated ease-in using a polynomial approximation of `1 - cos(t×π/2)`.

---

### `ease_out_sine(t: int): int`

Sine-approximated ease-out.

---

### `ease_in_out_sine(t: int): int`

Sine-approximated ease-in-out.

---

### `ease_in_expo(t: int): int`

Exponential ease-in: very slow start, explosive end. Uses cubic proxy approximation.

---

### `ease_out_expo(t: int): int`

Exponential ease-out.

---

### `ease_in_back(t: int): int`

Back ease-in: slight pullback before moving forward. Overshoot constant c1 ≈ 1.70158.

---

### `ease_out_back(t: int): int`

Back ease-out.

---

### `ease_in_out_back(t: int): int`

Back ease-in-out.

---

### `ease_out_bounce(t: int): int`

Bounce ease-out: bounces at the end (ball-dropping effect). Piecewise with 4 bounce segments.

---

### `ease_in_bounce(t: int): int`

Bounce ease-in.

---

### `ease_in_out_bounce(t: int): int`

Bounce ease-in-out.

---

### `ease_smooth(t: int): int`

Smoothstep: `3t² - 2t³`. Equivalent to Ken Perlin's smoothstep, re-exported here for convenience.

---

### `ease_smoother(t: int): int`

Smootherstep (Ken Perlin's order-5): `6t⁵ - 15t⁴ + 10t³`. Even smoother acceleration curve with zero first and second derivatives at both endpoints.

**Example:**
```rs
import easing;
let t: int = 3000;  // 30% through animation
let v: int = ease_out_bounce(t);
// use v to interpolate a position
```
