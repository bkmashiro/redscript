# RedScript Standard Library Roadmap

> 目标：覆盖卡儿数学库（large_number）的所有核心功能，但以 RedScript 语言提供干净的 API。
> 参考分析：`docs/LARGE_NUMBER_ANALYSIS.md`（本地，不追踪到 git）

---

## 现有 stdlib（已实现）

| 文件 | 内容 |
|------|------|
| `stdlib/math.mcrs` | min/max/clamp/abs，基础固定点运算，sin/cos（近似） |
| `stdlib/vec.mcrs` | Vec2/Vec3 struct，基础运算 |

---

## Batch 1 — 纯整数，无需新语言特性（当前可做）

### `stdlib/math.mcrs` 补充
- [x] `abs`, `sign`, `clamp`, `lerp`, `pow2`
- [ ] `ln(x: int): int` — atanh 级数，固定点 ×10000（tuner 生成系数）
- [ ] `sqrt(x: int): int` — 牛顿迭代法，固定点 ×10000
- [ ] `exp(x: int): int` — e^x，查表 + 泰勒，固定点 ×10000
- [ ] `sin(x: int): int` — 实体旋转矩阵法，`@load` 自动初始化辅助实体
- [ ] `cos(x: int): int` — 同上

### `stdlib/random.mcrs`（新建）
- [x] `next_lcg(seed: int): int` — LCG 伪随机
- [x] `random_range(seed, lo, hi)` — 范围随机
- [ ] `random_bool(seed: int): int` — 0 或 1

### `stdlib/vec.mcrs` 补充
- [x] `Vec2`, `Vec3`, `dot2`, `dot3`, `dist2_sq`, `dist3_sq`
- [ ] `add2`, `sub2`, `scale2`（Vec2 加减缩放）
- [ ] `add3`, `sub3`, `scale3`（Vec3 加减缩放）
- [ ] `cross3(a, b: Vec3): Vec3` — 叉积

### `stdlib/color.mcrs`（新建）
- [ ] `rgb_to_int(r, g, b: int): int` — 打包成单个 int
- [ ] `int_to_r/g/b(c: int): int` — 解包
- [ ] `hsl_to_rgb(h, s, l: int): (int, int, int)` — 需要元组返回值

---

## Batch 2 — 需要位运算支持（语言特性 PR 先）

> 依赖：编译器支持 `^`、`>>`、`<<` 运算符（目前 scoreboard 没有原生位运算，需要编译器层模拟或降级）

### `stdlib/random.mcrs` 升级
- [ ] `next_pcg(state: int): int` — PCG 算法（比 LCG 质量好，需要 `^` 和 `>>` ）
- [ ] `next_xorshift(x: int): int` — Xorshift（仅需 `^`、`>>`、`<<`）

### `stdlib/bits.mcrs`（新建）
- [ ] `bit_and(a, b: int): int` — 用加法模拟（慢但正确）
- [ ] `bit_or(a, b: int): int`
- [ ] `bit_xor(a, b: int): int`
- [ ] `bit_shift_left(x, n: int): int` — 乘以 2^n
- [ ] `bit_shift_right(x, n: int): int` — 除以 2^n

---

## Batch 3 — 需要数组完整支持

> 依赖：数组 literal 初始化完整实现（目前只有读取，写入走 workaround）

### `stdlib/list.mcrs`（新建）
- [ ] 基于 NBT list 的动态数组
- [ ] `list_push`, `list_pop`, `list_get`, `list_set`, `list_len`
- [ ] `list_sort_int` — 冒泡排序（整数）
- [ ] `list_sum`, `list_min`, `list_max`

### `stdlib/math.mcrs` — 查表升级
- [ ] `ln` 升级为查表 + 插值（需要 `@precompute` 或 `@load` 初始化 NBT list）
- [ ] `sin`/`cos` 高精度版（查表 + 和角公式）

---

## Batch 4 — 高级数学（长期）

### `stdlib/bigint.mcrs`
- [ ] 万进制 int 数组大数（基于 NBT int array）
- [ ] 大数加减乘
- [ ] 大数除以整数（竖式法）

### `stdlib/geometry.mcrs`
- [ ] `parabola_shoot` — 抛物线弹道（给定目标点和时间计算初速度）
- [ ] `cone_select` — 圆锥选区
- [ ] `midpoint3` — 三维中点

### `stdlib/signal.mcrs`
- [ ] `normal_dist_approx` — 正态分布近似（12个均匀分布相加）
- [ ] `exponential_dist` — 指数分布随机变量

---

## Tuner 覆盖计划

以下函数需要 `redscript tune` 生成最优系数：

| 函数 | Adapter | 目标精度 |
|------|---------|---------|
| `ln` | `ln-polynomial`（已有） | < 0.001 |
| `sqrt` | `sqrt-newton`（待写） | < 0.001 |
| `exp` | `exp-polynomial`（待写） | < 0.001 |
| `sin`/`cos` | `sincos-table`（待写） | < 0.0001 |

---

## 语言特性依赖清单

| 特性 | 依赖的 stdlib | 难度 | 状态 |
|------|-------------|------|------|
| 位运算 `^>><< ` | random PCG, bits | 中 | ❌ TODO |
| 数组 literal 初始化 | list, bigint | 中 | ❌ TODO（读取已修，写入待做） |
| 元组返回值 | color（hsl_to_rgb）| 中 | ❌ TODO |
| `@precompute` 装饰器 | 高精度 sin/cos/ln | 高 | ❌ 长期 |

---

*生成于 2026-03-17 · 奇尔沙治*
