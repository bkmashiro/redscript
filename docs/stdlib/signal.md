# `signal` — Statistical distributions, DFT, and signal processing

Import: `import signal;`

Statistical distributions (uniform, Gaussian approximation, exponential, Bernoulli, weighted choice, gamma, Poisson, geometric, negative binomial) and Discrete Fourier Transform helpers for up to 8 samples. All probability and distribution values use ×10000 scale. Requires `math` for `ln`, `exp_fx`, `sqrt_fx`; requires `random` for `next_lcg`.

## Functions

### `uniform_int(seed: int, lo: int, hi: int): int`

Uniform integer in `[lo, hi]` inclusive using inline LCG.

**Example:**
```rs
import signal;
let roll: int = uniform_int(42, 1, 6);  // d6
```

---

### `uniform_frac(seed: int): int`

Uniform fraction in `[0, 10000]` (×10000 scale).

---

### `normal_approx12(seed: int): int`

> **Cost:** 12 LCG advances per call

Approximate N(0, 1) × 10000 using the sum-of-12-uniforms method. Output range ≈ `[-60000, 60000]`. Mean = 0, σ ≈ 10000. Good enough for game use.

**Example:**
```rs
import signal;
let noise: int = normal_approx12(seed);  // ≈ N(0,1) × 10000
```

---

### `exp_dist_approx(seed: int, lambda_fx: int): int`

> **Requires:** `math` for `ln`

Exponential distribution variate ×10000. `lambda_fx ×10000` (e.g. 10000 = rate 1.0). Output capped at 100000 (10.0) for MC sanity.

---

### `bernoulli(seed: int, p_fx: int): int`

Bernoulli trial: 1 with probability `p_fx / 10000`, 0 otherwise.

**Example:**
```rs
import signal;
let hit: int = bernoulli(seed, 3000);  // 30% chance of 1
```

---

### `weighted2(seed: int, w0: int, w1: int): int`

Choose 0 or 1 with integer weights `w0`, `w1`.

---

### `weighted3(seed: int, w0: int, w1: int, w2: int): int`

Choose 0, 1, or 2 with integer weights.

---

### `gamma_sample(shape_k: int, scale_theta: int, seed: int): int`

> **Cost:** O(shape_k / 10000) — up to 5 exponential samples  
> **Requires:** `math` for `ln`

Gamma(k, θ) variate ×10000. `shape_k ×10000` (e.g. 20000 = k=2), `scale_theta ×10000`. Handles k = 1..5.

---

### `poisson_sample(lambda: int, seed: int): int`

> **Cost:** O(lambda / 10000) expected — Knuth algorithm  
> **Requires:** `math` for `exp_fx`

Poisson(λ) count. `lambda ×10000`. Works well for λ ≤ 20 (200000 in ×10000). Hard cap at 100 iterations.

**Example:**
```rs
import signal;
let spawns: int = poisson_sample(30000, seed);  // Poisson(3) spawn count
```

---

### `geometric_sample(p_success: int, seed: int): int`

> **Requires:** `math` for `ln`

Geometric(p) — count of failures before first success. `p_success ×10000`. Returns non-negative integer.

---

### `negative_binomial_sample(r: int, p_success: int, seed: int): int`

> **Cost:** O(r) — sums r geometric samples  
> **Requires:** `geometric_sample`

Negative Binomial(r, p) — failures before `r` successes. `p_success ×10000`.

---

### `dft_real(s0: int, s1: int, s2: int, s3: int, s4: int, s5: int, s6: int, s7: int, n: int, k: int): int`

> **Cost:** O(n) — n multiply-add operations using 45°-step trig lookup

Real part of DFT bin `k` for `n` samples (`n ≤ 8`). All sample values ×10000. Returns `(1/n) × Σ samples[j] × cos(2π k j / n)` × 10000. Uses `_cos45`/`_sin45` which handle 45°-step angles without NBT.

**Example:**
```rs
import signal;
// Compute DC component (k=0) of a 4-sample signal
let dc: int = dft_real(10000, 5000, 0, -5000, 0, 0, 0, 0, 4, 0);
```

---

### `dft_imag(s0: int, s1: int, s2: int, s3: int, s4: int, s5: int, s6: int, s7: int, n: int, k: int): int`

> **Cost:** O(n)

Imaginary part of DFT bin `k` (negative sine convention). Returns `-(1/n) × Σ samples[j] × sin(2π k j / n)` × 10000.

---

### `dft_magnitude(s0: int, s1: int, s2: int, s3: int, s4: int, s5: int, s6: int, s7: int, n: int, k: int): int`

> **Cost:** O(n) + sqrt

Magnitude of DFT bin `k`: `√(real² + imag²)`.
