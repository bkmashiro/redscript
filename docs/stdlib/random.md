# `random` — LCG/PCG RNG and distributions

Import: `import random;`

Pseudo-random number generators and statistical sampling. LCG (Linear Congruential Generator) with parameters from Numerical Recipes (a=1664525, c=1013904223, modulus 2³² via int32 overflow). Also provides a simplified PCG32-variant, binomial sampling, and hypergeometric sampling.

## Functions

### `next_lcg(seed: int): int`

Advance LCG state: `seed × 1664525 + 1013904223`. The returned value is the new seed AND the random output. Fast, suitable for most game use.

**Example:**
```rs
import random;
let seed: int = 12345;
seed = next_lcg(seed);
```

---

### `random_range(seed: int, lo: int, hi: int): int`

Integer in `[lo, hi)`. `seed` should be the output of `next_lcg`. Uses absolute value + modulo.

**Example:**
```rs
import random;
let seed: int = next_lcg(42);
let roll: int = random_range(seed, 1, 7);  // d6: 1–6
```

---

### `random_bool(seed: int): int`

Returns 0 or 1 with equal probability.

---

### `pcg_next_lo(state_lo: int): int`

Advance PCG state low word. Use with `pcg_next_hi` to maintain the two-word state.

---

### `pcg_next_hi(state_hi: int, state_lo: int): int`

Advance PCG state high word.

---

### `pcg_output(state_lo: int): int`

Extract output from PCG low word using XSH-RR permutation (simplified XOR-shift).

> **Note:** Statistical quality is better than plain LCG but this is a simplified PCG32 variant, not the full reference implementation.

---

### `binomial_sample(n: int, p_x10000: int, seed: int): int`

> **Cost:** O(n) — n LCG advances

Count successes in `n` Bernoulli trials. `p_x10000`: probability ×10000 (5000 = 50%). Returns count ∈ `[0, n]`.

**Example:**
```rs
import random;
let hits: int = binomial_sample(10, 3000, 99999);  // 10 trials at 30% each
```

---

### `hypergeometric_sample(pop_size: int, success_states: int, draws: int, seed: int): int`

> **Cost:** O(draws)

Draw `draws` items without replacement from a population of `pop_size` items, of which `success_states` are successes. Returns successes drawn ∈ `[0, min(draws, success_states)]`.

**Example:**
```rs
import random;
// Draw 5 cards from 52-card deck with 4 aces
let aces: int = hypergeometric_sample(52, 4, 5, 12345);
```
