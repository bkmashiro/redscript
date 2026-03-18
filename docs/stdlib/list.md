# `list` — Array aggregates and sorting

Import: `import list;`

Array utilities including static min/max/avg/sum helpers for up to 5 values, optimal sorting networks for 2–5 values, weighted random choice, dynamic sorting (bubble sort, ascending/descending) and aggregates (sum, avg, min, max, contains, index_of, shuffle, dedup count) for arbitrary-length arrays.

> **Note:** Dynamic array functions (those taking `arr: int[]`) require RedScript ≥ 2.4.0 (array parameter by reference).

## Functions

### `sort2_min(a: int, b: int): int`

Minimum of two values.

### `sort2_max(a: int, b: int): int`

Maximum of two values.

### `list_min3(a: int, b: int, c: int): int`

Minimum of three values.

### `list_max3(a: int, b: int, c: int): int`

Maximum of three values.

### `list_min5(a: int, b: int, c: int, d: int, e: int): int`

Minimum of five values.

### `list_max5(a: int, b: int, c: int, d: int, e: int): int`

Maximum of five values.

### `list_sum3(a: int, b: int, c: int): int`

Sum of three values.

### `list_sum4(a: int, b: int, c: int, d: int): int`

Sum of four values.

### `list_sum5(a: int, b: int, c: int, d: int, e: int): int`

Sum of five values.

### `avg3(a: int, b: int, c: int): int`

Integer average of three values.

### `avg5(a: int, b: int, c: int, d: int, e: int): int`

Integer average of five values.

---

### `sort3(a: int, b: int, c: int, pos: int): int`

Sort three values, returning the value at sorted position `pos` (0=min, 1=mid, 2=max). Uses a 3-comparison sorting network.

**Example:**
```rs
import list;
let median: int = sort3(30, 10, 20, 1);  // 20
```

---

### `sort4(a: int, b: int, c: int, d: int, pos: int): int`

Sort four values, returning the value at sorted position `pos` (0=min, 3=max). Uses a 5-comparison optimal sorting network.

---

### `sort5(a: int, b: int, c: int, d: int, e: int, pos: int): int`

Sort five values, returning the value at sorted position `pos`. Uses a 9-comparison sorting network (Batcher odd-even merge).

---

### `weighted2(seed: int, w0: int, w1: int): int`

Choose 0 or 1 with weights `w0`, `w1`. Returns the index selected. Uses LCG from `seed`.

**Example:**
```rs
import list;
let choice: int = weighted2(12345, 70, 30);  // 70% chance of 0, 30% chance of 1
```

---

### `weighted3(seed: int, w0: int, w1: int, w2: int): int`

Choose 0, 1, or 2 with given weights. Returns the index selected.

---

### `list_sort_asc(arr: int[], len: int)`

> **Cost:** O(n²) — bubble sort

In-place ascending bubble sort of `len` elements.

**Example:**
```rs
import list;
let nums: int[] = [30, 10, 20];
list_sort_asc(nums, 3);  // [10, 20, 30]
```

---

### `list_sort_desc(arr: int[], len: int)`

> **Cost:** O(n²) — bubble sort

In-place descending bubble sort of `len` elements.

---

### `list_sum(arr: int[], len: int): int`

> **Cost:** O(n)

Sum of all `len` elements in `arr`.

---

### `list_avg(arr: int[], len: int): int`

> **Cost:** O(n)

Arithmetic mean ×10000 (fixed-point). Returns `(sum × 10000) / len`. Returns 0 for empty array.

---

### `list_min(arr: int[], len: int): int`

> **Cost:** O(n)

Minimum element in `arr`.

---

### `list_max(arr: int[], len: int): int`

> **Cost:** O(n)

Maximum element in `arr`.

---

### `list_contains(arr: int[], len: int, val: int): int`

> **Cost:** O(n)

Returns 1 if `val` is in `arr`, 0 otherwise.

---

### `list_index_of(arr: int[], len: int, val: int): int`

> **Cost:** O(n)

First index of `val` in `arr`, or -1 if not found.

---

### `list_shuffle(arr: int[], len: int, seed: int): int[]`

> **Cost:** O(n)

Fisher-Yates shuffle in-place using LCG RNG. Returns `arr`. Uses `next_lcg` from `random`.

**Example:**
```rs
import list;
let deck: int[] = [1, 2, 3, 4, 5];
list_shuffle(deck, 5, 99999);
```

---

### `list_dedup_count(arr: int[], len: int): int`

> **Cost:** O(n²) — suitable for small arrays

Count of unique values in `arr`.
