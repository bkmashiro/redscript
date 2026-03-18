# `bits` — Bitwise operations

Import: `import bits;`

Bitwise operations simulated with integer arithmetic (multiply/divide/modulo), since MC scoreboard has no native bitwise ops. Performance is O(32) per operation — fast enough for most game logic. For hot paths (>1000 calls/tick), consider lookup tables or restructuring the algorithm.

## Functions

### `bit_get(x: int, n: int): int`

> **Cost:** O(n) — n up to 30 iterations

Return 1 if bit `n` is set in `x`, 0 otherwise. `n ∈ [0, 30]`.

**Example:**
```rs
import bits;
let flag: int = bit_get(0b1010, 1);  // 1
```

---

### `bit_set(x: int, n: int): int`

> **Cost:** O(n)

Set bit `n` to 1. `n ∈ [0, 30]`. Returns updated value.

**Example:**
```rs
import bits;
let v: int = bit_set(0, 3);  // 8
```

---

### `bit_clear(x: int, n: int): int`

> **Cost:** O(n)

Clear bit `n` to 0. `n ∈ [0, 30]`. Returns updated value.

**Example:**
```rs
import bits;
let v: int = bit_clear(15, 0);  // 14
```

---

### `bit_toggle(x: int, n: int): int`

> **Cost:** O(n)

Toggle bit `n`. `n ∈ [0, 30]`. Returns updated value.

**Example:**
```rs
import bits;
let v: int = bit_toggle(5, 1);  // 7  (101 → 111)
```

---

### `bit_shl(x: int, n: int): int`

> **Cost:** O(n)

Left shift `x` by `n` bits (`x << n`). `n ∈ [0, 30]`.

**Example:**
```rs
import bits;
let v: int = bit_shl(1, 4);  // 16
```

---

### `bit_shr(x: int, n: int): int`

> **Cost:** O(n)

Logical right shift `x` by `n` bits (`x >> n`). Divides by 2^n, truncating toward zero. `n ∈ [0, 30]`.

**Example:**
```rs
import bits;
let v: int = bit_shr(16, 2);  // 4
```

---

### `bit_and(a: int, b: int): int`

> **Cost:** O(31) — iterates over 31 bits

Bitwise AND of `a` and `b`. Operates on bits 0–30 (sign bit excluded).

**Example:**
```rs
import bits;
let v: int = bit_and(12, 10);  // 8  (1100 & 1010 = 1000)
```

---

### `bit_or(a: int, b: int): int`

> **Cost:** O(31)

Bitwise OR of `a` and `b`. Operates on bits 0–30.

**Example:**
```rs
import bits;
let v: int = bit_or(12, 10);  // 14  (1100 | 1010 = 1110)
```

---

### `bit_xor(a: int, b: int): int`

> **Cost:** O(31)

Bitwise XOR of `a` and `b`. Operates on bits 0–30.

**Example:**
```rs
import bits;
let v: int = bit_xor(12, 10);  // 6  (1100 ^ 1010 = 0110)
```

---

### `bit_not(x: int): int`

> **Cost:** O(31)

Bitwise NOT of `x`. Inverts all 31 bits (sign bit excluded).

**Example:**
```rs
import bits;
let v: int = bit_not(0);  // 2147483647  (all 31 bits set)
```

---

### `popcount(x: int): int`

> **Cost:** O(31)

Count the number of set bits in `x`. Returns a value in `[0, 31]`.

**Example:**
```rs
import bits;
let count: int = popcount(255);  // 8
```
