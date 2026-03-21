#!/usr/bin/env bash
set -euo pipefail

DOCS_ROOT="${HOME}/projects/redscript-docs"
EN_DIR="${DOCS_ROOT}/docs/en/stdlib"
ZH_DIR="${DOCS_ROOT}/docs/zh/stdlib"

mkdir -p "${EN_DIR}" "${ZH_DIR}"

cat > "${EN_DIR}/linalg.md" <<'EOF'
# `linalg` — Double-precision linear algebra

Import: `import "stdlib/linalg.mcrs";`

Double-precision vector and 2×2 matrix helpers for RedScript datapacks. This module covers 2D/3D dot products, lengths, distances, 3D cross products, 2×2 determinants, matrix multiplication, matrix-vector multiplication, and solving a 2×2 linear system with Cramer's rule.

**Dependency:** `stdlib/math_hp.mcrs` for `double_sqrt`.

## Data model

- All values are native IEEE 754 `double`.
- 2×2 matrices are passed as four scalars in row-major order: `[a b; c d]`.
- Cross products and normalization are exposed as one function per output component.

## Quick example

```rs
import "stdlib/linalg.mcrs";
import "stdlib/math_hp.mcrs";

let nx: double = vec3d_normalize_x(3.0d, 0.0d, 4.0d);  // 0.6
let ny: double = vec3d_normalize_y(3.0d, 0.0d, 4.0d);  // 0.0
let nz: double = vec3d_normalize_z(3.0d, 0.0d, 4.0d);  // 0.8

let det: double = mat2d_det(2.0d, 1.0d, 1.0d, 3.0d);   // 5.0
let x: double = solve2d_x(2.0d, 1.0d, 1.0d, 3.0d, 5.0d, 10.0d);  // 1.0
let y: double = solve2d_y(2.0d, 1.0d, 1.0d, 3.0d, 5.0d, 10.0d);  // 3.0
```

## 2D vectors

| Function | Description |
|:--|:--|
| `vec2d_dot(ax: double, ay: double, bx: double, by: double): double` | Dot product `ax*bx + ay*by`. |
| `vec2d_length(x: double, y: double): double` | Euclidean length `sqrt(x*x + y*y)`. |
| `vec2d_dist(ax: double, ay: double, bx: double, by: double): double` | Distance between two 2D points. |
| `vec2d_normalize_x(x: double, y: double): double` | X component of the normalized vector. |
| `vec2d_normalize_y(x: double, y: double): double` | Y component of the normalized vector. |

Example:

```rs
let dot: double = vec2d_dot(3.0d, 4.0d, 3.0d, 4.0d);   // 25.0
let len: double = vec2d_length(3.0d, 4.0d);            // 5.0
let dist: double = vec2d_dist(0.0d, 0.0d, 3.0d, 4.0d); // 5.0
```

## 3D vectors

| Function | Description |
|:--|:--|
| `vec3d_dot(ax: double, ay: double, az: double, bx: double, by: double, bz: double): double` | Dot product `ax*bx + ay*by + az*bz`. |
| `vec3d_length(x: double, y: double, z: double): double` | Euclidean length in 3D. |
| `vec3d_dist(ax: double, ay: double, az: double, bx: double, by: double, bz: double): double` | Distance between two 3D points. |
| `vec3d_cross_x(ax: double, ay: double, az: double, bx: double, by: double, bz: double): double` | X component of `a × b`. |
| `vec3d_cross_y(ax: double, ay: double, az: double, bx: double, by: double, bz: double): double` | Y component of `a × b`. |
| `vec3d_cross_z(ax: double, ay: double, az: double, bx: double, by: double, bz: double): double` | Z component of `a × b`. |
| `vec3d_normalize_x(x: double, y: double, z: double): double` | X component of the normalized vector. |
| `vec3d_normalize_y(x: double, y: double, z: double): double` | Y component of the normalized vector. |
| `vec3d_normalize_z(x: double, y: double, z: double): double` | Z component of the normalized vector. |

Example:

```rs
let d: double = vec3d_dot(1.0d, 2.0d, 3.0d, 4.0d, 5.0d, 6.0d); // 32.0
let cz: double = vec3d_cross_z(1.0d, 0.0d, 0.0d, 0.0d, 1.0d, 0.0d); // 1.0
```

## 2×2 matrices

Matrix layout:

```text
[ a  b ]
[ c  d ]
```

| Function | Description |
|:--|:--|
| `mat2d_det(a: double, b: double, c: double, d: double): double` | Determinant `a*d - b*c`. |
| `mat2d_mul_r0c0(a0: double, b0: double, c0: double, d0: double, a1: double, b1: double, c1: double, d1: double): double` | Product element `[0,0]` of `M0 × M1`. |
| `mat2d_mul_r0c1(a0: double, b0: double, c0: double, d0: double, a1: double, b1: double, c1: double, d1: double): double` | Product element `[0,1]`. |
| `mat2d_mul_r1c0(a0: double, b0: double, c0: double, d0: double, a1: double, b1: double, c1: double, d1: double): double` | Product element `[1,0]`. |
| `mat2d_mul_r1c1(a0: double, b0: double, c0: double, d0: double, a1: double, b1: double, c1: double, d1: double): double` | Product element `[1,1]`. |
| `mat2d_vecmul_x(a: double, b: double, c: double, d: double, vx: double, vy: double): double` | X component of `M × v`. |
| `mat2d_vecmul_y(a: double, b: double, c: double, d: double, vx: double, vy: double): double` | Y component of `M × v`. |

Example:

```rs
let det: double = mat2d_det(1.0d, 2.0d, 3.0d, 4.0d); // -2.0
let rx: double = mat2d_vecmul_x(0.0d, -1.0d, 1.0d, 0.0d, 1.0d, 0.0d); // 0.0
let ry: double = mat2d_vecmul_y(0.0d, -1.0d, 1.0d, 0.0d, 1.0d, 0.0d); // 1.0
```

## Cramer's rule

These functions solve:

```text
[ a  b ] [x]   [ex]
[ c  d ] [y] = [ey]
```

| Function | Description |
|:--|:--|
| `solve2d_x(a: double, b: double, c: double, d: double, ex: double, ey: double): double` | Returns `x = (ex*d - b*ey) / det`. |
| `solve2d_y(a: double, b: double, c: double, d: double, ex: double, ey: double): double` | Returns `y = (a*ey - ex*c) / det`. |

## Notes and caveats

- `solve2d_x` and `solve2d_y` do not guard against `det == 0`.
- Normalization uses an internal `double -> int` zero check. In practice, exact zero vectors return `0.0d`, and very small vectors whose squared length truncates to `0` are also treated as zero.
- If you need fixed-point vector math, use [`vec`](./vec.md) instead of `linalg`.
EOF

cat > "${EN_DIR}/sort.md" <<'EOF'
# `sort` — Sorting algorithms for `int[]`

Import: `import "stdlib/sort.mcrs";`

Sorting helpers for RedScript arrays. The module includes in-place insertion sort, a merge helper for two already-sorted arrays, and a coroutine-based bottom-up merge sort for larger workloads.

## Quick example

```rs
import "stdlib/sort.mcrs";

let data: int[] = [30, 10, 50, 20, 40];
insertion_sort(data, 5);
// data = [10, 20, 30, 40, 50]

let merged: int[] = sort_merge([1, 3, 5], 3, [2, 4, 6], 3);
// merged = [1, 2, 3, 4, 5, 6]
```

## Functions

### `insertion_sort(arr: int[], len: int)`

Sorts `arr[0..len-1]` in ascending order, in place.

- Time complexity: `O(n^2)`
- Best fit: small arrays or nearly-sorted data
- Stable: yes

### `insertion_sort_desc(arr: int[], len: int)`

Sorts `arr[0..len-1]` in descending order, in place.

- Time complexity: `O(n^2)`
- Stable: yes

### `sort_merge(a: int[], la: int, b: int[], lb: int): int[]`

Merges two ascending sorted prefixes, `a[0..la-1]` and `b[0..lb-1]`, into a new ascending array.

- Inputs are not modified.
- Output length is `la + lb`.
- The merge is stable because equal values prefer `a[i]` first.

### `merge_sort_coro(arr: int[], n: int)`

Coroutine-based bottom-up merge sort over `arr[0..n-1]`.

```rs
@coroutine(batch=1, onDone=merge_sort_noop)
fn merge_sort_coro(arr: int[], n: int)
```

Behavior:

- Sorts ascending, in place.
- Performs one full merge pass per tick.
- Uses a temporary `int[]` scratch buffer for each merged segment.
- Finishes after about `ceil(log2(n))` ticks.

This is the stdlib option for larger arrays when you want to spread the cost across ticks instead of blocking one frame with `O(n^2)` insertion sort.

### `merge_sort_noop()`

Default `onDone` callback used by `merge_sort_coro`. Replace the decorator with your own callback if you need a completion hook.

## Notes and caveats

- `len` and `n` control how much of the array is processed; the rest of the array is untouched.
- `sort_merge` assumes both input prefixes are already sorted ascending.
- `merge_sort_coro` mutates the original array and returns nothing.
- `@coroutine` callback selection is fixed at definition time, so customizing `onDone` usually means copying the function and changing the decorator.
EOF

cat > "${EN_DIR}/bigint.md" <<'EOF'
# `bigint` — Multi-precision integer arithmetic

Import: `import "stdlib/bigint.mcrs";`

Arbitrary-precision integer helpers built on base-10000 chunk arrays. Numbers are stored as big-endian `int[]`, where `arr[0]` is the most significant chunk and each chunk is in the range `0..9999`.

Example:

```text
[1, 2345, 6789] = 1*10000^2 + 2345*10000 + 6789
                = 100023456789
```

## Representation

- Base: `10000`
- Endianness: big-endian
- Chunk width: 4 decimal digits
- Typical array invariant: every chunk stays in `0..9999`

## Core constants and chunk helpers

| Function | Description |
|:--|:--|
| `bigint_base(): int` | Returns `10000`. |
| `chunk_hi(n: int): int` | High part of a single 2-chunk split: `n / 10000`. |
| `chunk_lo(n: int): int` | Low part of a single 2-chunk split: `n % 10000`. |
| `bigint_chunk(a: int[], i: int): int` | Reads one chunk by index. |

## 3-chunk helpers

These helpers operate on explicit `(hi, mid, lo)` values instead of arrays.

| Function | Description |
|:--|:--|
| `bigint3_add_lo(alo: int, blo: int): int` | Low chunk of `alo + blo`, modulo base. |
| `bigint3_carry_lo(alo: int, blo: int): int` | Carry from the low chunk add. |
| `bigint3_add_mid(amid: int, bmid: int, carry: int): int` | Middle chunk add with incoming carry. |
| `bigint3_carry_mid(amid: int, bmid: int, carry: int): int` | Carry from the middle chunk add. |
| `bigint3_add_hi(ahi: int, bhi: int, carry: int): int` | High chunk add with incoming carry. |
| `bigint3_sub_lo(alo: int, blo: int): int` | Low chunk subtraction with wraparound borrow. |
| `bigint3_borrow_lo(alo: int, blo: int): int` | Borrow from the low chunk subtraction. |
| `bigint3_sub_mid(amid: int, bmid: int, borrow: int): int` | Middle chunk subtraction with borrow. |
| `bigint3_borrow_mid(amid: int, bmid: int, borrow: int): int` | Borrow from the middle chunk subtraction. |
| `bigint3_sub_hi(ahi: int, bhi: int, borrow: int): int` | High chunk subtraction. |
| `bigint3_mul1_lo(a: int, b: int): int` | Low chunk of `a * b`. |
| `bigint3_mul1_hi(a: int, b: int): int` | High chunk of `a * b`. |
| `bigint3_cmp(ahi: int, amid: int, alo: int, bhi: int, bmid: int, blo: int): int` | Returns `1`, `0`, or `-1`. |
| `int32_to_bigint3_lo(n: int): int` | Low chunk of `abs(n)`. |
| `int32_to_bigint3_mid(n: int): int` | Middle chunk of `abs(n)`. |
| `int32_to_bigint3_hi(n: int): int` | High chunk of `abs(n)`. |
| `bigint3_to_int32(hi: int, mid: int, lo: int): int` | Reassembles a 3-chunk value into one `int`. |
| `bigint3_div_chunk(chunk: int, rem: int, divisor: int): int` | One-step quotient helper for division by a small integer. |
| `bigint3_rem_chunk(chunk: int, rem: int, divisor: int): int` | One-step remainder helper for division by a small integer. |

Tested example:

```rs
let hi: int = int32_to_bigint3_hi(1023456789);   // 10
let mid: int = int32_to_bigint3_mid(1023456789); // 2345
let lo: int = int32_to_bigint3_lo(1023456789);   // 6789
```

## Array operations

| Function | Description |
|:--|:--|
| `bigint_zero(arr: int[], len: int)` | Sets the first `len` chunks to zero. |
| `bigint_copy(src: int[], dst: int[], len: int)` | Copies `len` chunks. |
| `bigint_cmp(a: int[], b: int[], len: int): int` | Lexicographic compare from most significant chunk to least. |
| `bigint_add(a: int[], b: int[], result: int[], len: int): int` | Adds two same-length bigints and returns the carry-out. |
| `bigint_sub(a: int[], b: int[], result: int[], len: int)` | Computes `a - b` with the precondition `a >= b`. |
| `bigint_mul_small(a: int[], n: int, result: int[], len: int)` | Multiplies by a small factor `n <= 9999`. |
| `bigint_shift_left(arr: int[], len: int)` | Shifts left by one chunk, equivalent to multiplying by the base and dropping overflow. |
| `bigint_is_zero(arr: int[], len: int): int` | Returns `1` if all chunks are zero. |
| `bigint_leading_zeros(arr: int[], len: int): int` | Counts leading zero chunks. |
| `bigint_div_small(a: int[], divisor: int, result: int[], len: int): int` | Divides by a small integer and returns the remainder. |
| `bigint_mod_small(a: int[], divisor: int, len: int): int` | Computes only the remainder of a small-integer division. |

## Full multiplication and division

| Function | Description |
|:--|:--|
| `bigint_mul(a: int[], b: int[], result: int[], la: int, lb: int)` | Schoolbook `O(la*lb)` multiplication. `result` must be pre-zeroed and length `la + lb`. |
| `bigint_mul_result_len(la: int, lb: int): int` | Returns `la + lb`. |
| `bigint_sq(a: int[], result: int[], len: int)` | Squares a bigint using the diagonal/off-diagonal optimization. `result` must be pre-zeroed and length `len * 2`. |
| `bigint_shl1(a: int[], len: int): void` | Internal left-shift-by-one-chunk helper used by division. |
| `bigint_cmp_window(a: int[], aoff: int, b: int[], len: int): int` | Compares a window inside `a` to `b`. |
| `bigint_sub_window(a: int[], aoff: int, b: int[], len: int): void` | Subtracts `b` from a window inside `a`. |
| `bigint_mul_small_into(b: int[], factor: int, out: int[], len: int): void` | Writes `b * factor` into `out`. |
| `bigint_div(a: int[], b: int[], quotient: int[], remainder: int[], la: int, lb: int): void` | Long division using binary search for each quotient chunk. |

Example:

```rs
import "stdlib/bigint.mcrs";

let a: int[] = [0, 0, 1234, 5678];
let b: int[] = [0, 0, 9999];
let result: int[] = [0, 0, 0, 0, 0, 0, 0];
bigint_mul(a, b, result, 4, 3);
```

## Notes and caveats

- Array APIs generally assume the caller preallocates arrays of the exact required length.
- `bigint_mul` and `bigint_sq` require the output array to be zeroed before the call.
- `bigint_div_small` and `bigint_mod_small` assume `1 <= divisor <= 9999`.
- `int32_to_bigint3_*` converts `n` with `abs(n)`, so sign is discarded.
- `bigint_div` has fixed internal temp buffers of length `16` in the current implementation. Treat that as a practical upper bound for `la` and `lb`.
- `bigint_div` does not guard against division by zero.
- `bigint_sub` is intended for `a >= b`, but the current implementation does not preserve a borrow across more than one chunk. Verify chained-borrow cases before relying on it.
EOF

cat > "${EN_DIR}/heap.md" <<'EOF'
# `heap` — Min-heap and Max-heap priority queues

Import: `import "stdlib/heap.mcrs";`

Binary heap helpers for integer priorities. The same array layout is used for both the min-heap and max-heap variants.

## Layout

```text
h[0]       = current size
h[1..size] = heap elements
```

- Root index: `1`
- Parent of `i`: `i / 2`
- Left child of `i`: `i * 2`
- Right child of `i`: `i * 2 + 1`
- Capacity: `64` elements total

## Functions

| Function | Description |
|:--|:--|
| `heap_new(): int[]` | Creates a new heap array with size `0` and 64 zero-filled slots. |
| `heap_size(h: int[]): int` | Returns the number of stored elements. |
| `heap_peek(h: int[]): int` | Returns the root element. For a min-heap this is the minimum; for a max-heap it is the maximum. |
| `heap_push(h: int[], val: int): int[]` | Inserts `val` into the min-heap and restores order by sift-up. |
| `heap_pop(h: int[]): int[]` | Removes the root from the min-heap and restores order by sift-down. |
| `max_heap_push(h: int[], val: int): int[]` | Inserts `val` into the max-heap. |
| `max_heap_pop(h: int[]): int[]` | Removes the root from the max-heap. |

## Quick examples

### Min-heap

```rs
import "stdlib/heap.mcrs";

let h: int[] = heap_new();
h = heap_push(h, 5);
h = heap_push(h, 1);
h = heap_push(h, 3);

let top: int = heap_peek(h); // 1
h = heap_pop(h);
let next: int = heap_peek(h); // 3
```

### Max-heap

```rs
import "stdlib/heap.mcrs";

let h: int[] = heap_new();
h = max_heap_push(h, 3);
h = max_heap_push(h, 1);
h = max_heap_push(h, 5);

let top: int = heap_peek(h); // 5
h = max_heap_pop(h);
let next: int = heap_peek(h); // 3
```

## Notes and caveats

- `heap_peek`, `heap_pop`, and `max_heap_pop` assume the heap is non-empty.
- `heap_push` and `max_heap_push` do not check for overflow past 64 elements.
- The functions return the array so they compose cleanly with `let h: int[] = ...`, but the same underlying array is being mutated.
EOF

cat > "${ZH_DIR}/linalg.md" <<'EOF'
# `linalg` — 双精度线性代数

导入：`import "stdlib/linalg.mcrs";`

用于 RedScript datapack 的双精度向量与 2×2 矩阵工具。模块提供 2D/3D 点积、长度、距离、3D 叉积、2×2 行列式、矩阵乘法、矩阵乘向量，以及基于 Cramer 法则的 2×2 线性方程组求解。

**依赖：** `stdlib/math_hp.mcrs`，因为长度计算依赖 `double_sqrt`。

## 数据表示

- 所有数值都使用原生 IEEE 754 `double`。
- 2×2 矩阵通过四个标量按行优先传入：`[a b; c d]`。
- 叉积和归一化按输出分量拆成多个函数。

## 快速示例

```rs
import "stdlib/linalg.mcrs";
import "stdlib/math_hp.mcrs";

let nx: double = vec3d_normalize_x(3.0d, 0.0d, 4.0d);  // 0.6
let ny: double = vec3d_normalize_y(3.0d, 0.0d, 4.0d);  // 0.0
let nz: double = vec3d_normalize_z(3.0d, 0.0d, 4.0d);  // 0.8

let det: double = mat2d_det(2.0d, 1.0d, 1.0d, 3.0d);   // 5.0
let x: double = solve2d_x(2.0d, 1.0d, 1.0d, 3.0d, 5.0d, 10.0d);  // 1.0
let y: double = solve2d_y(2.0d, 1.0d, 1.0d, 3.0d, 5.0d, 10.0d);  // 3.0
```

## 2D 向量

| 函数 | 说明 |
|:--|:--|
| `vec2d_dot(ax: double, ay: double, bx: double, by: double): double` | 点积 `ax*bx + ay*by`。 |
| `vec2d_length(x: double, y: double): double` | 欧氏长度 `sqrt(x*x + y*y)`。 |
| `vec2d_dist(ax: double, ay: double, bx: double, by: double): double` | 两个 2D 点之间的距离。 |
| `vec2d_normalize_x(x: double, y: double): double` | 单位向量的 X 分量。 |
| `vec2d_normalize_y(x: double, y: double): double` | 单位向量的 Y 分量。 |

示例：

```rs
let dot: double = vec2d_dot(3.0d, 4.0d, 3.0d, 4.0d);   // 25.0
let len: double = vec2d_length(3.0d, 4.0d);            // 5.0
let dist: double = vec2d_dist(0.0d, 0.0d, 3.0d, 4.0d); // 5.0
```

## 3D 向量

| 函数 | 说明 |
|:--|:--|
| `vec3d_dot(ax: double, ay: double, az: double, bx: double, by: double, bz: double): double` | 点积 `ax*bx + ay*by + az*bz`。 |
| `vec3d_length(x: double, y: double, z: double): double` | 3D 欧氏长度。 |
| `vec3d_dist(ax: double, ay: double, az: double, bx: double, by: double, bz: double): double` | 两个 3D 点之间的距离。 |
| `vec3d_cross_x(ax: double, ay: double, az: double, bx: double, by: double, bz: double): double` | `a × b` 的 X 分量。 |
| `vec3d_cross_y(ax: double, ay: double, az: double, bx: double, by: double, bz: double): double` | `a × b` 的 Y 分量。 |
| `vec3d_cross_z(ax: double, ay: double, az: double, bx: double, by: double, bz: double): double` | `a × b` 的 Z 分量。 |
| `vec3d_normalize_x(x: double, y: double, z: double): double` | 单位向量的 X 分量。 |
| `vec3d_normalize_y(x: double, y: double, z: double): double` | 单位向量的 Y 分量。 |
| `vec3d_normalize_z(x: double, y: double, z: double): double` | 单位向量的 Z 分量。 |

示例：

```rs
let d: double = vec3d_dot(1.0d, 2.0d, 3.0d, 4.0d, 5.0d, 6.0d); // 32.0
let cz: double = vec3d_cross_z(1.0d, 0.0d, 0.0d, 0.0d, 1.0d, 0.0d); // 1.0
```

## 2×2 矩阵

矩阵布局：

```text
[ a  b ]
[ c  d ]
```

| 函数 | 说明 |
|:--|:--|
| `mat2d_det(a: double, b: double, c: double, d: double): double` | 行列式 `a*d - b*c`。 |
| `mat2d_mul_r0c0(a0: double, b0: double, c0: double, d0: double, a1: double, b1: double, c1: double, d1: double): double` | `M0 × M1` 的 `[0,0]` 元素。 |
| `mat2d_mul_r0c1(a0: double, b0: double, c0: double, d0: double, a1: double, b1: double, c1: double, d1: double): double` | `[0,1]` 元素。 |
| `mat2d_mul_r1c0(a0: double, b0: double, c0: double, d0: double, a1: double, b1: double, c1: double, d1: double): double` | `[1,0]` 元素。 |
| `mat2d_mul_r1c1(a0: double, b0: double, c0: double, d0: double, a1: double, b1: double, c1: double, d1: double): double` | `[1,1]` 元素。 |
| `mat2d_vecmul_x(a: double, b: double, c: double, d: double, vx: double, vy: double): double` | `M × v` 的 X 分量。 |
| `mat2d_vecmul_y(a: double, b: double, c: double, d: double, vx: double, vy: double): double` | `M × v` 的 Y 分量。 |

示例：

```rs
let det: double = mat2d_det(1.0d, 2.0d, 3.0d, 4.0d); // -2.0
let rx: double = mat2d_vecmul_x(0.0d, -1.0d, 1.0d, 0.0d, 1.0d, 0.0d); // 0.0
let ry: double = mat2d_vecmul_y(0.0d, -1.0d, 1.0d, 0.0d, 1.0d, 0.0d); // 1.0
```

## Cramer 法则

这两个函数求解：

```text
[ a  b ] [x]   [ex]
[ c  d ] [y] = [ey]
```

| 函数 | 说明 |
|:--|:--|
| `solve2d_x(a: double, b: double, c: double, d: double, ex: double, ey: double): double` | 返回 `x = (ex*d - b*ey) / det`。 |
| `solve2d_y(a: double, b: double, c: double, d: double, ex: double, ey: double): double` | 返回 `y = (a*ey - ex*c) / det`。 |

## 注意事项

- `solve2d_x` 和 `solve2d_y` 不会检查 `det == 0`。
- 归一化内部先把长度平方截断为 `int` 再做零判断，所以零向量会返回 `0.0d`，长度非常小且平方截断为 `0` 的向量也会被当作零向量。
- 如果你需要定点整数向量运算，应使用 [`vec`](./vec.md) 而不是 `linalg`。
EOF

cat > "${ZH_DIR}/sort.md" <<'EOF'
# `sort` — `int[]` 排序算法

导入：`import "stdlib/sort.mcrs";`

面向 RedScript 数组的排序工具。模块包含原地插入排序、用于合并两个有序数组的辅助函数，以及面向大数组的协程式自底向上归并排序。

## 快速示例

```rs
import "stdlib/sort.mcrs";

let data: int[] = [30, 10, 50, 20, 40];
insertion_sort(data, 5);
// data = [10, 20, 30, 40, 50]

let merged: int[] = sort_merge([1, 3, 5], 3, [2, 4, 6], 3);
// merged = [1, 2, 3, 4, 5, 6]
```

## 函数

### `insertion_sort(arr: int[], len: int)`

将 `arr[0..len-1]` 原地按升序排序。

- 时间复杂度：`O(n^2)`
- 适合：小数组或“几乎有序”的数据
- 稳定：是

### `insertion_sort_desc(arr: int[], len: int)`

将 `arr[0..len-1]` 原地按降序排序。

- 时间复杂度：`O(n^2)`
- 稳定：是

### `sort_merge(a: int[], la: int, b: int[], lb: int): int[]`

将两个升序前缀 `a[0..la-1]` 和 `b[0..lb-1]` 合并为一个新的升序数组。

- 不修改输入数组。
- 输出长度为 `la + lb`。
- 因为相等时优先取 `a[i]`，所以合并过程是稳定的。

### `merge_sort_coro(arr: int[], n: int)`

基于协程的自底向上归并排序，对 `arr[0..n-1]` 生效。

```rs
@coroutine(batch=1, onDone=merge_sort_noop)
fn merge_sort_coro(arr: int[], n: int)
```

行为说明：

- 升序排序，原地修改。
- 每个 tick 完成一整轮 merge pass。
- 每个 merge 段都会分配一个临时 `int[]` scratch 缓冲区。
- 大约经过 `ceil(log2(n))` 个 tick 后排序完成。

当数组较大、你不想用 `O(n^2)` 的插入排序在单 tick 内做完时，`merge_sort_coro` 是 stdlib 里的服务器友好方案。

### `merge_sort_noop()`

`merge_sort_coro` 默认使用的 `onDone` 回调，占位用空函数。如果你需要排序完成通知，通常做法是复制该函数并改掉装饰器里的 `onDone`。

## 注意事项

- `len` 和 `n` 决定处理多少个元素，数组剩余部分不会被改动。
- `sort_merge` 假定两个输入前缀都已经按升序排好。
- `merge_sort_coro` 会直接修改原数组，不返回新数组。
- `@coroutine` 的回调是在定义时固定的，因此想换 `onDone` 一般需要复制函数定义。
EOF

cat > "${ZH_DIR}/bigint.md" <<'EOF'
# `bigint` — 多精度整数运算

导入：`import "stdlib/bigint.mcrs";`

基于 base-10000 分块数组实现的任意精度整数工具。数值使用大端 `int[]` 表示，即 `arr[0]` 是最高位块，每个块都应在 `0..9999` 范围内。

示例：

```text
[1, 2345, 6789] = 1*10000^2 + 2345*10000 + 6789
                = 100023456789
```

## 表示方式

- 基数：`10000`
- 端序：大端
- 每块宽度：4 位十进制数字
- 常见约束：每个块保持在 `0..9999`

## 常量与单块辅助函数

| 函数 | 说明 |
|:--|:--|
| `bigint_base(): int` | 返回 `10000`。 |
| `chunk_hi(n: int): int` | 单个数拆成两块时的高位：`n / 10000`。 |
| `chunk_lo(n: int): int` | 单个数拆成两块时的低位：`n % 10000`。 |
| `bigint_chunk(a: int[], i: int): int` | 读取指定索引上的块。 |

## 三块辅助函数

这组函数直接处理 `(hi, mid, lo)`，不经过数组。

| 函数 | 说明 |
|:--|:--|
| `bigint3_add_lo(alo: int, blo: int): int` | `alo + blo` 的低块，对 base 取模。 |
| `bigint3_carry_lo(alo: int, blo: int): int` | 低块加法产生的进位。 |
| `bigint3_add_mid(amid: int, bmid: int, carry: int): int` | 带进位的中间块加法。 |
| `bigint3_carry_mid(amid: int, bmid: int, carry: int): int` | 中间块加法的进位。 |
| `bigint3_add_hi(ahi: int, bhi: int, carry: int): int` | 带进位的高块加法。 |
| `bigint3_sub_lo(alo: int, blo: int): int` | 低块减法，必要时借位回绕。 |
| `bigint3_borrow_lo(alo: int, blo: int): int` | 低块减法的借位。 |
| `bigint3_sub_mid(amid: int, bmid: int, borrow: int): int` | 带借位的中间块减法。 |
| `bigint3_borrow_mid(amid: int, bmid: int, borrow: int): int` | 中间块减法的借位。 |
| `bigint3_sub_hi(ahi: int, bhi: int, borrow: int): int` | 高块减法。 |
| `bigint3_mul1_lo(a: int, b: int): int` | `a * b` 的低块。 |
| `bigint3_mul1_hi(a: int, b: int): int` | `a * b` 的高块。 |
| `bigint3_cmp(ahi: int, amid: int, alo: int, bhi: int, bmid: int, blo: int): int` | 返回 `1`、`0` 或 `-1`。 |
| `int32_to_bigint3_lo(n: int): int` | `abs(n)` 的低块。 |
| `int32_to_bigint3_mid(n: int): int` | `abs(n)` 的中间块。 |
| `int32_to_bigint3_hi(n: int): int` | `abs(n)` 的高块。 |
| `bigint3_to_int32(hi: int, mid: int, lo: int): int` | 把三块重新拼成一个 `int`。 |
| `bigint3_div_chunk(chunk: int, rem: int, divisor: int): int` | 小整数除法中的单步商辅助函数。 |
| `bigint3_rem_chunk(chunk: int, rem: int, divisor: int): int` | 小整数除法中的单步余数辅助函数。 |

已测试示例：

```rs
let hi: int = int32_to_bigint3_hi(1023456789);   // 10
let mid: int = int32_to_bigint3_mid(1023456789); // 2345
let lo: int = int32_to_bigint3_lo(1023456789);   // 6789
```

## 数组运算

| 函数 | 说明 |
|:--|:--|
| `bigint_zero(arr: int[], len: int)` | 将前 `len` 个块清零。 |
| `bigint_copy(src: int[], dst: int[], len: int)` | 复制 `len` 个块。 |
| `bigint_cmp(a: int[], b: int[], len: int): int` | 从高位到低位做字典序比较。 |
| `bigint_add(a: int[], b: int[], result: int[], len: int): int` | 两个同长度整数相加，返回最终进位。 |
| `bigint_sub(a: int[], b: int[], result: int[], len: int)` | 计算 `a - b`，前提是 `a >= b`。 |
| `bigint_mul_small(a: int[], n: int, result: int[], len: int)` | 乘以小整数 `n <= 9999`。 |
| `bigint_shift_left(arr: int[], len: int)` | 整体左移一块，相当于乘以 base 并丢弃最高位溢出。 |
| `bigint_is_zero(arr: int[], len: int): int` | 全零时返回 `1`。 |
| `bigint_leading_zeros(arr: int[], len: int): int` | 统计前导零块数量。 |
| `bigint_div_small(a: int[], divisor: int, result: int[], len: int): int` | 除以小整数并返回余数。 |
| `bigint_mod_small(a: int[], divisor: int, len: int): int` | 只计算小整数除法的余数。 |

## 完整乘法与除法

| 函数 | 说明 |
|:--|:--|
| `bigint_mul(a: int[], b: int[], result: int[], la: int, lb: int)` | 学校式 `O(la*lb)` 乘法。`result` 需要预先清零，长度为 `la + lb`。 |
| `bigint_mul_result_len(la: int, lb: int): int` | 返回 `la + lb`。 |
| `bigint_sq(a: int[], result: int[], len: int)` | 平方优化版乘法。`result` 需要预先清零，长度为 `len * 2`。 |
| `bigint_shl1(a: int[], len: int): void` | 供除法使用的内部左移一块辅助函数。 |
| `bigint_cmp_window(a: int[], aoff: int, b: int[], len: int): int` | 比较 `a` 的一个窗口与 `b`。 |
| `bigint_sub_window(a: int[], aoff: int, b: int[], len: int): void` | 在 `a` 的窗口上原地减去 `b`。 |
| `bigint_mul_small_into(b: int[], factor: int, out: int[], len: int): void` | 将 `b * factor` 写入 `out`。 |
| `bigint_div(a: int[], b: int[], quotient: int[], remainder: int[], la: int, lb: int): void` | 每一位商用二分搜索试商的长除法实现。 |

示例：

```rs
import "stdlib/bigint.mcrs";

let a: int[] = [0, 0, 1234, 5678];
let b: int[] = [0, 0, 9999];
let result: int[] = [0, 0, 0, 0, 0, 0, 0];
bigint_mul(a, b, result, 4, 3);
```

## 注意事项

- 数组 API 通常要求调用方先按正确长度分配好输出数组。
- `bigint_mul` 和 `bigint_sq` 要求输出数组在调用前已经清零。
- `bigint_div_small` 和 `bigint_mod_small` 假定 `1 <= divisor <= 9999`。
- `int32_to_bigint3_*` 会先取 `abs(n)`，因此符号会丢失。
- 当前实现中的 `bigint_div` 内部临时数组长度固定为 `16`，因此 `la`、`lb` 实际上应视为不超过 16。
- `bigint_div` 不会检查除数是否为零。
- `bigint_sub` 的目标语义是处理 `a >= b`，但当前实现不能跨多个块持续保留 borrow；遇到连续借位场景时，使用前应先验证。
EOF

cat > "${ZH_DIR}/heap.md" <<'EOF'
# `heap` — 小根堆与大根堆优先队列

导入：`import "stdlib/heap.mcrs";`

面向整数优先级的二叉堆工具。小根堆和大根堆共享同一种数组布局。

## 布局

```text
h[0]       = 当前大小
h[1..size] = 堆元素
```

- 根节点索引：`1`
- `i` 的父节点：`i / 2`
- `i` 的左孩子：`i * 2`
- `i` 的右孩子：`i * 2 + 1`
- 总容量：`64` 个元素

## 函数

| 函数 | 说明 |
|:--|:--|
| `heap_new(): int[]` | 创建一个新堆，初始大小为 `0`，并预填 64 个零槽位。 |
| `heap_size(h: int[]): int` | 返回当前元素数量。 |
| `heap_peek(h: int[]): int` | 返回根元素。对小根堆来说是最小值，对大根堆来说是最大值。 |
| `heap_push(h: int[], val: int): int[]` | 向小根堆插入 `val`，并通过 sift-up 恢复堆序。 |
| `heap_pop(h: int[]): int[]` | 从小根堆移除根元素，并通过 sift-down 恢复堆序。 |
| `max_heap_push(h: int[], val: int): int[]` | 向大根堆插入 `val`。 |
| `max_heap_pop(h: int[]): int[]` | 从大根堆移除根元素。 |

## 快速示例

### 小根堆

```rs
import "stdlib/heap.mcrs";

let h: int[] = heap_new();
h = heap_push(h, 5);
h = heap_push(h, 1);
h = heap_push(h, 3);

let top: int = heap_peek(h); // 1
h = heap_pop(h);
let next: int = heap_peek(h); // 3
```

### 大根堆

```rs
import "stdlib/heap.mcrs";

let h: int[] = heap_new();
h = max_heap_push(h, 3);
h = max_heap_push(h, 1);
h = max_heap_push(h, 5);

let top: int = heap_peek(h); // 5
h = max_heap_pop(h);
let next: int = heap_peek(h); // 3
```

## 注意事项

- `heap_peek`、`heap_pop` 和 `max_heap_pop` 都假定堆非空。
- `heap_push` 与 `max_heap_push` 都不会检查是否超过 64 个元素。
- 这些函数虽然返回数组，便于写成 `h = heap_push(h, x)`，但底层修改的仍是同一个数组。
EOF

cd "${DOCS_ROOT}"
git add -A
git commit -S -m "docs(stdlib): linalg/sort/bigint/heap modules"
git push
openclaw system event --text "Done: linalg/sort/bigint/heap docs" --mode now
