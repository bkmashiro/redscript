# 5. 推荐优先级

## Near-term triage update

After Lane 2/3/4 scaffolds, the near-term roadmap is intentionally narrower:

1. Build reusable TS optimizer infrastructure first: shared LIR slot/use/effect analysis, local liveness, rewrite safety helpers, and property-based optimizer tests. See [08](./08-ts-optimizer-infra.md) and the concrete step order in [10](./10-near-term-optimizer-roadmap.md).
2. Keep the long-term compiler direction aligned with the thin VIR recommendation in [09](./09-vir-architecture-recommendation.md): SSA values + block arguments, Minecraft-aware numeric/effect semantics, but no physical scoreboard slot binding until legalization/slot planning.
3. Prefer compiler/backend optimizations next, especially follow-on work after the LIR scoreboard RMW pass in [07](./07-rmw-optimizer-design.md).
4. Keep display / attribute / enchantment mechanisms as live-gated probes until the target Paper/TestHarness server proves same-tick readback, schema compatibility, and cost advantage.
5. Do **not** open near-term Spark lanes for AI/pathfinding, mob target selection, villager POI, shulker homing, redstone analog ALU, sculk/light/leaves distance fields, worldgen noise, item-merge reductions, or player-state oracles. They remain research notes only.

## 最先做的 5 个 live probes

### 1. Attribute item-modifier `dot4/dot8`

**原因**

* 只需要一个 carrier 和一个 modifier。
* 理论核心成本只有 2 条命令。
* 能直接融合常数系数、多个输入和 bias。
* 对编译器的 dot product、affine layer、颜色变换、坐标变换都很有价值。

**首批测试**

```text
same-tick refresh
signed/bias range
attribute clamp
replace vs accumulate
batch 1/64/512
Vanilla vs Paper
```

---

### 2. Enchantment Level-Based Value ALU

**原因**

* 机制是正式 data-driven API。
* `lookup`、square、fraction 已经覆盖很多 bounded helper。
* 1.21.11 exponent 直接提供 pow/sqrt/reciprocal。
* 一个 item modifier 可以同时装载多个输入 level。

**首批测试**

```text
lookup 1..255
levels_squared
fraction 1/x
exponent sqrt(x)
多 enchantment product/division
attribute clamp
```

---

### 3. Display decomposition characterization suite

不要只测现有 division trick，统一测试：

```text
diagonal matrix
complex 2×2 hypot
scaled rotation
symmetric PSD eigenvalues
negative determinant
rank-deficient matrix
repeated singular values
quaternion normalization
same tick vs reload
```

**原因**

* 一个实验矩阵可以确定一整类 helper 是否可用。
* display 不需要 tick latency。
* readback 是现成 NBT。
* 潜在覆盖 sqrt、hypot、atan2、PCA、normalization。

---

### 4. Custom dimension `coordinate_scale`

**原因**

* probe 极短。
* 若任意 ratio 成功，将提供低命令数的 constant float multiply/divide。
* 失败成本也很低。
* 可立即确定它是否只适用于内置 1:8。

**测试矩阵**

```text
1 -> 2.5
2.5 -> 1
negative coordinates
fractional coordinates
large but safe coordinates
round trip
Vanilla/Paper
```

---

### 5. Projectile raycast/collision lane — deferred

**Status:** Not a near-term lane. Keep only as a domain-specific raycast/collision research note.

**Why deferred**

* Tick latency and Paper projectile configuration can dominate real cost.
* It is only attractive for actual raycast/collision helpers, not scalar arithmetic.
* It should not compete with LIR/RMW optimizer work or low-risk helper consolidation.

**Only reconsider when**

```text
axis-aligned wall
diagonal wall
thin obstacle
entity hit
block vs entity precedence
high velocity
chunk boundary
Paper projectile config
```

all have a concrete gameplay/compiler caller and a measured break-even against command ray marching.

Next speculative probes such as sculk nearest/distance, light max-plus, leaves/scaffolding BFS, redstone analog batch, AI/pathfinding, and item merge reduction are deferred until there is a specific real-server use case.

---

## 最先做的 5 个 compiler/codegen optimizations

### 1. 建立真实成本 instrumentation

没有 `(L,F,Q,R,T,S,tick_ns)`，很容易把“一行扫描一万实体”误判为优化。这应先于所有 exotic helper。

### 2. SSA copy/temp elimination + in-place RMW + constant pool

风险最低，适用于所有程序，通常比任何单个数学 trick 带来的总收益更大。

### 3. `return run` ABI + function flattening + delayed scalarization

减少 helper boundary 的 score copy、NBT component read 和 wrapper 命令。尤其适合几何/display pipeline。

### 4. Range/scale/overflow analysis

它决定：

* 是否安全用 scoreboard；
* 是否能降为 u8 enchantment；
* attribute 是否会 clamp；
* fixed-point scale 选多少；
* fast/balanced/high-precision tier 如何选择。

### 5. Representation-aware batch lowering

识别：

```text
boolean array -> block/item/NBT reduction
bounded unary -> enchantment
dot/affine -> attribute
norm compare -> selector distance
rotation -> local coordinates
raycast -> projectile
```

并基于 measured break-even 自动选择。

---

## 最值得做成 helper API 的 5 个数学函数族

### 1. `sincos` / `rotate3`

```text
sincos_yaw(angle)
forward3(yaw,pitch)
rotate_local3(rotation, vector)
```

**原因**

local coordinates 是服务端现成的正交变换，低风险、同 tick、读回明确，并且一个 rotation 可复用多次。

---

### 2. `atan2_pitch` / `normalize3`

```text
look_angles(dx,dy,dz)
normalize3(dx,dy,dz)
```

**原因**

`facing` 已经隐式做方向归一化和角度计算。相比 polynomial atan2，它命令少，且对完整 3D 向量自然工作。

需要明确：

```text
zero vector policy
Minecraft yaw convention
vertical vector convention
```

---

### 3. `reciprocal` / `division`

建议 API：

```text
recip_fast(x)
recip_balanced(x)
recip_precise(x)

div_fast(a,b)
div_balanced(a,b)
div_precise(a,b)
```

候选 backend：

* score 原生整数除法：exact integer tier。
* enchantment fraction/exponent：bounded fast tier。
* display decomposition：若 probe 稳定。
* Newton-Raphson：balanced/precise fallback。

**原因**

除法是 fixed-point runtime 的高频昂贵操作，也最适合 tiering。

---

### 4. `hypot` / `norm` / `sqrt`

```text
hypot2(x,y)
norm3(x,y,z)
sqrt(x)
norm_leq(v,r)
```

backend：

* `norm_leq`：selector distance，直接 boolean。
* `hypot2`：display complex-matrix SVD，若 probe 成功。
* `sqrt(u8)`：1.21.11 exponent。
* `sumsq`：multi-enchantment/scoreboard。
* high precision：Newton 或 LUT+Newton。

**原因**

很多调用者实际上只需要 norm comparison，不需要数值 sqrt；API 分离后可避免无意义 scalarization。

---

### 5. `dotN` / `affine_reduceN`

```text
dot4
dot8
affine4
affine8
weighted_sum
```

backend：

* 小 N、int32：scoreboard。
* 中等 N、浮点系数：attribute modifiers。
* 大 batch bounded values：item/block representation。
* 常系数矩阵：local-coordinate rotation 或预专门化 function。

**原因**

它直接服务于编译器后端、图形变换、ML-like 运算、插值和 polynomial evaluation。若 attribute probe 成功，收益可能比单独的 sqrt trick 更大。

`rand_range` 不必做成有调用开销的普通 helper；更适合 compiler intrinsic，直接发出一条 `/random value ... sequence`，由 runtime 负责 stream allocation。

---

总体上，最可能真正形成高收益 backend 的并不是 AI 或复杂物理，而是三类机制：

1. **服务器 canonicalization/decomposition**：`facing`、local coordinates、display matrix、dimension scale、align。
2. **数据驱动的小型数值解释器**：item modifiers、attributes、enchantment Level-Based Values、predicates、loot。
3. **命令返回值自带 reduction**：`execute if items/data/entity`、fill/clone、split execute success count。

Physics、redstone、光照、sculk 和 AI 更适合作为**异步 batch accelerator、raycast、distance field、nearest/reachability oracle**，不适合替代普通 hot scalar arithmetic。

[1]: https://www.minecraft.net/en-us/article/minecraft-snapshot-23w06a "https://www.minecraft.net/en-us/article/minecraft-snapshot-23w06a"
[2]: https://bugs.mojang.com/browse/MC-123388 "https://bugs.mojang.com/browse/MC-123388"
[3]: https://www.minecraft.net/tr-tr/article/minecraft-snapshot-17w45a "https://www.minecraft.net/tr-tr/article/minecraft-snapshot-17w45a"
[4]: https://www.minecraft.net/it-it/article/minecraft-java-edition-1-20-2 "https://www.minecraft.net/it-it/article/minecraft-java-edition-1-20-2"
[5]: https://bugs.mojang.com/browse/MC-198821 "https://bugs.mojang.com/browse/MC-198821"
[6]: https://www.minecraft.net/nl-nl/article/minecraft-1-19-4-pre-release-1 "https://www.minecraft.net/nl-nl/article/minecraft-1-19-4-pre-release-1"
[7]: https://www.minecraft.net/it-it/article/village---pillage-out-java- "https://www.minecraft.net/it-it/article/village---pillage-out-java-"
[8]: https://www.minecraft.net/de-de/article/minecraft-java-edition-1-20-5 "https://www.minecraft.net/de-de/article/minecraft-java-edition-1-20-5"
[9]: https://www.minecraft.net/en-us/article/minecraft-java-edition-1-20-5 "https://www.minecraft.net/en-us/article/minecraft-java-edition-1-20-5"
[10]: https://www.minecraft.net/de-de/article/minecraft-java-edition-1-21-5 "https://www.minecraft.net/de-de/article/minecraft-java-edition-1-21-5"
[11]: https://www.minecraft.net/it-it/article/buzzy-bees-out-now-in-java "https://www.minecraft.net/it-it/article/buzzy-bees-out-now-in-java"
[12]: https://www.minecraft.net/nl-nl/article/village---pillage-out-java- "https://www.minecraft.net/nl-nl/article/village---pillage-out-java-"
[13]: https://www.minecraft.net/de-de/article/minecraft-java-edition-1-21 "https://www.minecraft.net/de-de/article/minecraft-java-edition-1-21"
[14]: https://www.minecraft.net/zh-hans/article/minecraft-snapshot-24w18a "https://www.minecraft.net/zh-hans/article/minecraft-snapshot-24w18a"
[15]: https://www.minecraft.net/nl-nl/article/minecraft-snapshot-23w42a "https://www.minecraft.net/nl-nl/article/minecraft-snapshot-23w42a"
[16]: https://www.minecraft.net/ko-kr/article/minecraft-snapshot-22w18a "https://www.minecraft.net/ko-kr/article/minecraft-snapshot-22w18a"
[17]: https://www.minecraft.net/nl-nl/article/minecraft-java-edition-1-21-4 "https://www.minecraft.net/nl-nl/article/minecraft-java-edition-1-21-4"
[18]: https://www.minecraft.net/nl-nl/article/minecraft-java-edition-1-21 "https://www.minecraft.net/nl-nl/article/minecraft-java-edition-1-21"
[19]: https://docs.papermc.io/paper/reference/world-configuration/ "https://docs.papermc.io/paper/reference/world-configuration/"
[20]: https://www.minecraft.net/ja-jp/article/minecraft-snapshot-23w31a "https://www.minecraft.net/ja-jp/article/minecraft-snapshot-23w31a"
[21]: https://www.minecraft.net/de-de/article/minecraft-java-edition-1-20-3 "https://www.minecraft.net/de-de/article/minecraft-java-edition-1-20-3"
[22]: https://www.minecraft.net/pl-pl/article/minecraft-java-edition-1-20-3 "https://www.minecraft.net/pl-pl/article/minecraft-java-edition-1-20-3"
