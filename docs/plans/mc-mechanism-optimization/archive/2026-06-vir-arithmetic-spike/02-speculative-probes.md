# 2. 值得实验验证的 speculative 方案

## A. Display transformation decomposition

Display 接受 16 元素矩阵，内部保存时会转成 translation、left rotation、scale、right rotation 的分解形式。这是服务端可读回的“浮点矩阵 canonicalizer”，但具体分解算法、轴排序、符号选择和退化情形不属于稳定语言 ABI。([Minecraft.net][1])

### S1. 复数 2×2 block → `hypot(x,y)`

**机制假设**

写入：

```text
A = [[x,-y,0],
     [y, x,0],
     [0, 0,1]]
```

其前两个奇异值都是：

```text
sqrt(x²+y²)
```

**最小 probe**

```mcfunction
data modify entity @e[tag=svd,limit=1] transformation set value \
[3f,-4f,0f,0f, 4f,3f,0f,0f, 0f,0f,1f,0f, 0f,0f,0f,1f]

data modify storage alu:probe scale set from entity @e[tag=svd,limit=1] transformation.scale
```

**成功输出**

`scale` 中两个分量约为 `5`，另一个约为 `1`。

**读回**

display entity `transformation.scale` → storage。

**失败原因**

* 分解不是预期 SVD/polar 形式。
* scale 轴被重排。
* 某一 scale 带负号。
* 只有 save/reload 时才重新编码。
* matrix list 的行列序不同；不过该构造转置后奇异值相同。

**版本风险**

中。应测试同 tick、下一 tick、chunk unload/reload 和 `/data get` 四种路径。

---

### S2. 对称正定矩阵 → eigenvalue/PCA oracle

**机制假设**

对称正定矩阵的 singular values 等于 eigenvalues，rotation 对应 principal axes。

**最小 probe**

写入：

```text
[[5,4,0],
 [4,5,0],
 [0,0,1]]
```

前两个 eigenvalues 是 9 和 1，eigenvectors 是 ±45°。

**成功输出**

* `scale` 包含约 `9,1,1`。
* left/right quaternion 表示约 45° 主轴。

**读回**

`scale` 和 `left_rotation`/`right_rotation`。

**失败原因**

* 轴排序不稳定。
* 两个 rotation 共同分摊方向，单独一个 quaternion 不等于 eigenbasis。
* quaternion 符号 `q`/`-q` 随实现变化。
* 重复 singular value 时方向任意。

**版本风险**

高于 hypot，但若 probe 通过，可提供 2×2 covariance PCA、principal direction、condition estimate。

---

### S3. Quaternion normalization/canonicalization

**机制假设**

Display codec 或变换构造过程会把非单位 quaternion 正规化。

**最小 probe**

```mcfunction
data modify entity @e[tag=qnorm,limit=1] transformation.left_rotation set value [0f,0f,0f,2f]
data get entity @e[tag=qnorm,limit=1] transformation.left_rotation
```

再测试：

```text
[0,2,0,2]
[1,2,3,4]
q 和 -q
```

**成功输出**

读回 quaternion 的 L2 norm 约为 1，并出现稳定 sign canonicalization。

**读回**

entity NBT。

**失败原因**

* NBT 原样保存，只在 renderer 中规范化。
* 只接受合法 quaternion，但不回写。
* normalized runtime object 序列化时仍保存原输入。

**版本风险**

高。只有“写后立即读”和“save/reload 后读”都稳定才值得使用。

---

### S4. Polar rotation 同时给出 hypot 和 atan2

**机制假设**

矩阵：

```text
[[6,-8],
 [8, 6]]
```

是 scale=10 与 rotation=`atan2(8,6)` 的组合。分解可能一次输出：

* scale = 10
* rotation angle ≈ 53.130102°

**最小 probe**

写上述 4×4 extension，读 `scale` 和两个 quaternion。

**成功输出**

一个稳定 quaternion 承担完整平面 rotation，scale 含两个 10。

**失败原因**

rotation 被 left/right 任意拆分；因此 scale 可用，但 angle 不可用。

**版本风险**

中高。相比 `facing`，它的价值在于同时得到 norm 和 angle。

---

## B. Attribute、enchantment 和 item pipeline

### S5. 两命令 `dot8`

**机制假设**

一个 `set_attributes` item modifier 中放 8 个动态 `add_value` modifiers，属性系统一次完成：

```text
b + Σ c_i x_i
```

**最小 probe**

输入：

```text
x = [1,2,3,4]
c = [2,-3,5,7]
b = 100
```

预期：

```text
100 + 2 - 6 + 15 + 28 = 139
```

执行：

```mcfunction
item modify entity @e[tag=core,limit=1] weapon.mainhand alu:dot4
execute store result score #out alu run attribute @e[tag=core,limit=1] minecraft:generic.attack_damage get 1000
```

**成功输出**

`#out=139000`，或在选定 scale 下等价。

**失败原因**

* fixed/this score target 上下文不对。
* carrier 不支持属性。
* attribute clamp。
* 装备 modifier 下一 tick 才生效。
* item modifier 重复累积。

**版本风险**

中，尤其是 1.20.5 之后 item schema 和 slot 名变化。

---

### S6. 多 enchantment 的乘法、reciprocal 和 division

**机制假设**

carrier attribute base=1。

对输入 level `x`，定义 modifier：

```text
amount_x = x - 1
operation = add_multiplied_total
```

它把当前值乘以 `x`。

对 level `y`，定义：

```text
amount_recip_y = (1-y)/y = 1/y - 1
```

可用：

* numerator：linear，产生 `1-y`
* denominator：linear，产生 `y`
* 外层 `fraction`

则属性结果：

```text
1 * x * (1/y) = x/y
```

**最小 probe**

* `x=6,y=3`，预期 division=2。
* 两者都用 `x-1,y-1`，预期 product=18。
* `y=4` 单独 reciprocal，预期 0.25。

**读回**

`/attribute get scale`。

**失败原因**

* 多个 `add_multiplied_total` 的聚合顺序与假设不同。
* fraction 的 zero/NaN 处理。
* modifier IDs 冲突。
* 低于 attribute min 被 clamp。
* level 0 被视为 enchantment absent。

**版本风险**

1.21+ 中等。收益可能非常高。

---

### S7. 多 enchantment `levels_squared` → fused sum of squares

**机制假设**

给一件 item 同时设置三个 custom enchantments，levels 为 3、4、12；每个 enchantment 对同一 attribute 添加 `level²`。

**最小 probe**

```text
expected = 9 + 16 + 144 = 169
```

设置 levels 后同 tick 查询 attribute。

**成功输出**

169，允许最后 command-result 量化误差。

**读回**

attribute → score。

**失败原因**

* 一件 item 上多个 enchantment attribute effects 未共同生效。
* slot/id 冲突。
* attribute clamp。
* levels_squared 的 added 或 level indexing 配错。

**版本风险**

低至中。若成功，可作为 `sumsq2/3/4` 前端，再接 display sqrt。

---

### S8. `set_count` 链作为 saturating affine ALU

**机制假设**

Item modifier sequence：

```text
count = c*x
count += d*y
count = clamp(count,1,99)
```

**最小 probe**

`x=20,y=7,c=2,d=-1`，预期 33。

调用一次 modifier，随后：

```mcfunction
execute store result score #out alu run execute if items entity @e[tag=core,limit=1] weapon.mainhand *
```

**成功输出**

33。

**失败原因**

* 每一步单独整数化，结果与一次 fused affine 不同。
* 负 count 使 item 消失。
* `add` 字段或 provider schema 随版本变化。
* max stack component 阻止目标 count。

**版本风险**

中；适合 u7/u8 saturating arithmetic。

---

### S9. Item entity 自动 merge 作为异步 sum reduction

**机制假设**

同位置、同 item/components 的 item entities 会自动合并 stack count。

**最小 probe**

生成 count 20 和 count 30 的两个同类 item entity，固定 pickup delay，step 若干 tick。

**成功输出**

* item entity 数量从 2 变 1。
* 合并后的 item count=50。

**读回**

`execute if entity` 计数和 item entity 的 Item NBT。

**失败原因**

* merge 检查并非每 tick。
* owner、age、pickup delay、component 不同。
* stack cap。
* Paper 的 item merge radius/interval/config 不同。
* 超过上限时仍保留多个实体。

**版本风险**

高，且延迟明显。只可能用于已经物理 itemized 的大批 reduction。

---

### S10. Crafter/custom recipe 作为 3×3 pattern decoder

**机制假设**

把 9 个 boolean/categorical 输入编码为 crafter slots，custom recipes 将匹配 pattern 映射到输出 item ID。

**最小 probe**

定义两个不冲突的 custom recipes：

```text
pattern A -> alu:true
pattern B -> alu:false
```

用一条 NBT copy 写入 3×3 inventory，脉冲 crafter，读取输出。

**成功输出**

指定 pattern 产生对应 item。

**读回**

输出 inventory 或 item entity。

**失败原因**

* recipe 优先级/冲突。
* crafter disabled slots 影响 pattern。
* 红石 edge、输出空间、tick 顺序。
* 输入构造成本超过普通 predicate。

**版本风险**

1.21+ 中等；更适合复杂 recipe semantics，而非数值 hot path。

---

## C. Coordinate、physics、collision

### S11. Custom dimension `coordinate_scale` 作为任意常量乘除

**机制假设**

两个自定义 dimension type 的 coordinate scale 分别为 1 和 2.5，`execute in` 会按比值缩放执行位置。

**最小 probe**

源 marker：

```text
Pos = [80,64,-40]
```

从 scale=1 维度执行到 scale=2.5 维度。

**成功输出**

大致：

```text
[32,64,-16]
```

并在反向得到 `[200,64,-100]`。

**读回**

目标维度 marker `Pos`。

**失败原因**

* `/execute in` 只对特定内置维度或 Nether-like 转换缩放。
* custom dimension scale 不参与 command context。
* world border clamp。
* dimension type schema 在新版本发生变化。

**版本风险**

高，但 probe 极便宜。一旦成功，它会提供任意 compile-time 常量的 x/z 浮点乘除。

---

### S12. Teleport rotation 写回是否提供 modulo/clamp

**机制假设**

写入超范围 yaw/pitch 后，entity Rotation 被 canonicalize：

```text
yaw 1000° -> 某个 [-180,180) 值
pitch 120° -> 90° 或等价值
```

**最小 probe**

```mcfunction
tp @e[tag=ang,limit=1] ~ ~ ~ 1000 120
data get entity @e[tag=ang,limit=1] Rotation
```

再测试负值、±180、±90、NaN 禁止输入。

**成功输出**

稳定 yaw modulo 360 和 pitch clamp。

**失败原因**

NBT 保存原始角度，只在使用朝向时动态解释。

**版本风险**

低至中。若只对部分路径 canonicalize，不能作为公共 helper。

---

### S13. Projectile 一 tick continuous raycast

**机制假设**

Projectile 每 tick 对运动线段执行 collision raycast，而不是只检查最终位置。

**最小 probe**

* Arrow at x=0。
* `NoGravity:1b`。
* `Motion=[10,0,0]`。
* x=5 处放一面墙。
* `/tick step 1`。
* 读取 `Pos`、`Motion`、`inGround`、命中的 block state。

**成功输出**

arrow 在 x≈墙面处停止，`inGround=1`。

**可实现运算**

* segment/voxel first intersection
* min positive hit time
* raycast
* spatial clamp
* occlusion query

**失败原因**

* projectile speed/drag 顺序。
* 高速穿透。
* NoGravity 或 Motion 被 clamp。
* Paper projectile settings。
* 命中后实体立即删除或反弹。

**版本风险**

中高，但对于 raycast helper 潜在收益很大。

---

### S14. Entity collision resolution 作为 clamp/projection

**机制假设**

普通实体 movement 会把 displacement 沿碰撞面裁剪，并把相应 Motion 分量清零。

**最小 probe**

* 无重力实体，AABB 已知。
* 起点距墙 2 格。
* `Motion=[4,0,0]`。
* step 1 tick。
* 读取 Pos/Motion。

再用 `Motion=[4,0,4]` 测试轴顺序和沿墙滑动。

**成功输出**

* x displacement 被 clamp 到碰撞面。
* 法向 Motion≈0。
* 切向分量保留。

**失败原因**

* step height。
* AABB 尺寸/碰撞 epsilon。
* 轴分解顺序导致非对称。
* entity activation。
* 实体类型自身 movement logic。

**版本风险**

高。适合 collision/raycast backend，不适合一般 `min`。

---

### S15. Projectile drag 或 Area Effect Cloud 作为 tick recurrence

**机制假设**

Projectile 隐式计算：

```text
v[n+1] = r*v[n] + g
p[n+1] = p[n] + v[n+1]
```

Area Effect Cloud 隐式计算：

```text
radius[n+1] = radius[n] + radius_per_tick
```

**最小 probe**

在 tick freeze 下读取 n=0、1、2、8 时的 Motion/Pos/Radius，拟合实际更新顺序和常量。

**成功输出**

固定实体类型、介质、版本下得到稳定 recurrence。

**可实现运算**

* `r^n`
* geometric series
* repeated affine update
* 免费的 N 次累加，代价是 N tick latency
* 大量 lane 并行 recurrence

**失败原因**

* 水/空气介质改变 drag。
* radius 低于阈值后实体移除。
* projectile despawn。
* Paper activation 或 tick rates。

**版本风险**

中高。只适合 latency-tolerant batch。

---

### S16. Explosion/wind burst 作为 radial normalize + SIMD vector field

**机制假设**

一次无 block damage 的 explosion/wind burst 对多个实体计算：

* 从爆心到实体的方向
* 方向归一化
* 距离衰减
* 视线/exposure
* knockback vector

**最小 probe**

在 `(3,0,4)`、`(6,0,8)`、`(-3,0,4)` 放三个相同 victim；触发 `block_interaction:none` 的 custom enchantment explosion 或可控 wind burst；step 1；读取 Motion。

**成功输出**

方向比约为：

```text
(3,4)
(3,4)
(-3,4)
```

幅值随距离变化。

**失败原因**

* exposure ray sampling。
* knockback resistance。
* 实体受伤/无敌帧。
* explosion center offset。
* 随机性或不同实体 hitbox。
* Paper event/plugin 修改。

**版本风险**

高，但一次事件可以同时计算大量 radial vectors。

---

### S17. Minecart rail code 作为 tangent projection

**机制假设**

Minecart 在 rail 上会将输入 velocity 投影到 rail tangent，并施加速度 clamp/drag。

**最小 probe**

* east-west straight rail。
* minecart `Motion=[1,0,1]`。
* step 1。
* 读 Motion。
* 再测试 ascending/curve rails。

**成功输出**

straight rail 后 z 分量近零；curve rail 给已知旋转后的 tangent。

**失败原因**

* rail snapping/位置修正干扰。
* minecart experimental changes。
* drag 和 slope acceleration 混在一起。
* 速度过大进入不同路径。

**版本风险**

高。可研究 vector projection，但 local-coordinate rotation 通常更便宜。

---

### S18. Target block 作为 2D radial distance quantizer

**机制假设**

箭命中 target block 后，输出 1–15 的 redstone strength，与命中点距中心的距离有关。

**最小 probe**

分别击中：

* 中心
* 水平偏 0.25
* 边缘附近
* 四个对称方向

读取 target block `power` 或邻接线强度。

**成功输出**

中心 15，向边缘单调下降且旋转对称。

**读回**

blockstate predicate、comparator BE 或 redstone wire。

**失败原因**

* projectile hit position 不够可控。
* block reset timer。
* 不同 projectile hitbox。
* 输出只有低精度量化。

**版本风险**

中。适合作为粗 `hypot2`/distance bucket。

---

### S19. `/locate poi` 作为 nearest + distance oracle

**机制假设**

`locate poi` 返回离执行位置最近 POI 的距离，command result 可被 store。

**最小 probe**

在 `(3,64,4)` 放 meeting POI，等待注册：

```mcfunction
execute positioned 0 64 0 store result score #d alu run locate poi minecraft:meeting
```

再改变 y，判断使用水平距离还是 3D 距离。

**成功输出**

`#d≈5`，并稳定选择最近 POI。

**失败原因**

* command result 不是距离。
* 距离舍入规则不同。
* POI 尚未注册。
* 搜索内部开销巨大。
* 搜索会加载/扫描过多区块。

**版本风险**

中高。即便成功，也更像昂贵 oracle，而非 hot stdlib。

---

### S20. Shulker bullet homing 作为 iterative normalization/steering

**机制假设**

Shulker bullet 朝 target 每 tick 进行有限转向和速度更新，可读出规范化 steering vector。

**最小 probe**

让 bullet 自然锁定或写入合法 target UUID，target 位于 `(3,4,12)`，读取连续 8 tick 的 `Motion`/direction NBT。

**成功输出**

Motion 逐步朝目标方向收敛，并遵循稳定分段规则。

**失败原因**

* target 字段不可安全写入。
* bullet 有随机 axis phase。
* 路径不是连续向量 steering。
* target 丢失或 bullet despawn。

**版本风险**

很高。研究价值高，stdlib 价值低。

---

### S21. `/spreadplayers` 作为 batch Poisson-like sampler

**机制假设**

一次命令把大量 marker 放在给定区域，并尽量满足最小间距。

**最小 probe**

100 个 marker，一次 `spreadplayers`，读取所有 Pos，检查：

* 最小 pairwise distance
* 分布均匀性
* 同样初始状态重跑是否稳定

**成功输出**

满足或接近最小间距的 blue-noise-like 点集。

**失败原因**

* 无 seed 控制。
* 地形高度介入。
* 求解失败或 retry 成本高。
* team grouping 改变语义。

**版本风险**

中。适合程序化布局，不适合确定性数学 helper。

---

## D. Redstone、光照和 block updates

### S22. Container comparator 作为归一化 sum/division

**机制假设**

容器 comparator strength 是槽位 fullness 的平均值，再映射到 1–15；相当于内置：

```text
quantize_4bit(Σ count_i/maxStack_i / slot_count)
```

**最小 probe**

对固定 chest：

* empty
* 每槽半满
* 每槽全满
* 只一个槽全满
* 混合 max-stack-size items

读 comparator block entity 的输出字段；若不序列化，则读邻接 wire。

**成功输出**

符合稳定的归一化平均公式。

**失败原因**

* comparator 输出不在可读 NBT 中。
* 只能用 16 个 blockstate 分支读回。
* 一 tick 更新延迟。
* 自定义 max stack size 处理不同。
* Paper redstone 实现差异。

**版本风险**

中高。精度只有 4 bit，但可能对大批槽位有价值。

---

### S23. Crafter comparator 作为 9-bit popcount

Crafter comparator 输出是 0–9；每个有物品或被 toggled 的 slot 增加一。([Minecraft.net][15])

**最小 probe**

9 slots 中占用 5 个，或占用 3 个并 disable 2 个。

**成功输出**

comparator strength=5。

**失败原因**

主要是读回路径和 block update 延迟，而非计算本身。

**版本风险**

1.21+ 低。

**评价**

机制确定，但通常不如 `execute if items`，除非 crafter 已经是程序状态载体。

---

### S24. Comparator subtract/compare + redstone dust 作为 4-bit analog ALU

**机制假设**

* subtract mode：`max(a-b,0)`
* compare mode：`a` if `a>=b` else `0`
* dust propagation：`max_i(source_i-distance_i,0)`

**最小 probe**

建立 16×16 个 comparator cell，一次设置所有 `(a,b)` 输入，step 2 tick，验证完整 truth table。

输出读取方案：

* comparator BE output；
* 或在每个 lane 放 marker，通过 blockstate range predicate 统计；
* 或把 boolean threshold 输出接灯，再用 `clone filtered` 聚合。

**成功输出**

所有 256 组合满足预期。

**失败原因**

* redstone update ordering。
* quasi-connectivity/邻接干扰。
* 输出读回需过多命令。
* Paper 使用非 vanilla redstone implementation。
* 源信号 materialization 成本过高。

**版本风险**

Paper 配置风险高。适合 large spatial batch，不适合单 scalar。

---

### S25. Sculk vibration 作为 distance quantizer 和 nearest-event selector

Vibration listener 会从候选事件中选择最近事件；sculk vibration 传播具有按距离产生的 tick 延迟，sensor 输出强度与距离相关。([Minecraft.net][16])

**最小 probe**

* sensor at origin。
* 在 3、7 格处各放一个可被 `/damage` 或 projectile impact 触发 vibration 的 source。
* 单独触发，记录 activation tick 和 redstone strength。
* 同 tick 触发两者，观察选择谁。

**成功输出**

* 到达延迟随距离单调增加。
* 近源产生更强输出。
* 同 tick 时选择近源。

**失败原因**

* 选择的 command action 不发 game event。
* sensor cooldown。
* wool occlusion。
* 传播距离上限。
* chunk 边界。
* Paper 行为/tick 设置。

**版本风险**

中高。非常适合 nearest-event 和 coarse distance，但 latency 至少为若干 tick。

---

### S26. Light engine 作为 max-plus distance transform

**机制假设**

在透明、无 skylight 的空间中，block light 近似执行：

```text
L(p) = max_sources(source_level - path_cost)
```

即 capped max-plus convolution / Manhattan distance transform。

**最小 probe**

* 私有暗维度。
* origin 放 `light[level=15]`。
* 在 Manhattan distance 0..16 放 sample markers。
* 等 light task settle。
* predicate `alu:light_ge_10` 检查阈值。

```mcfunction
execute store success score #count alu run execute as @e[tag=light_sample] at @s if predicate alu:light_ge_10
```

**成功输出**

开放空气中，`distance<=5` 的点通过 level≥10；多个 source 取最大值。

**读回**

light predicate → per-marker score 或成功分支总数。

**失败原因**

* skylight 污染。
* block opacity/path attenuation。
* light update 异步。
* chunk 尚未 fully lighted。
* Paper alternate lighting engine。

**版本风险**

中高。对大体素场非常有吸引力，标量则不划算。

---

### S27. Leaves/scaffolding blockstate 作为 capped min-plus BFS

**机制假设**

* leaves 的 `distance` 是到 log 的 capped shortest distance。
* scaffolding 的 `distance` 是到支撑结构的 capped 距离。

**最小 probe**

在平面网格放 persistent leaves，放一个 log source；允许 block updates；用 block-state range predicate 读取 distance=1..7。

**成功输出**

形成 capped Manhattan-like distance field；多 source 取 min。

**读回**

每 sample marker 执行 block predicate，或统计各 distance bucket。

**失败原因**

* leaves 非 persistent 而 decay。
* strict placement 抑制了需要的更新。
* cap=7 太小。
* update queue 未 settle。
* 不同 block 的传播 metric/方向约束不同。

**版本风险**

中。适合批量 BFS/distance morphology。

---

### S28. Daylight detector 作为 4-bit coarse trig

**机制假设**

在固定天气和天空条件下，daylight detector 的 signal 随 day time 呈周期曲线，可视为粗略 sin/cos LUT。

**最小 probe**

遍历：

```text
time = 0, 1000, 2000, ... 23000
```

每点读取 normal/inverted detector power。

**成功输出**

稳定、周期、单调分段的 0–15 曲线。

**失败原因**

* 天气和 skylight。
* 维度 sky rules。
* 全局 time 副作用。
* 曲线不是所需 phase。
* 只有 4-bit 精度。

**版本风险**

中。只适合艺术性/低精度模拟，不适合 public trig。

---

### S29. Lectern comparator 作为 page-fraction quantizer

**机制假设**

N 页书当前页 p 被映射到 1–15，隐式完成近似：

```text
1 + floor(14*p/(N-1))
```

**最小 probe**

15 页书，读取 page 0、7、14 的 comparator strength。

**成功输出**

约 1、8、15。

**失败原因**

* page NBT schema。
* 更新延迟。
* N=1 边界。
* comparator output 读回成本。

**版本风险**

低至中。可做 4-bit normalized ratio，但实用价值有限。

---

### S30. Creaking Heart comparator 作为距离量化器

1.21.4 起，连接 Creaking 的 heart 可输出与距离有关的 comparator signal。([Minecraft.net][17])

**最小 probe**

建立合法连接，分别把 Creaking 放在 0、8、16、24 格处，读取 comparator strength。

**成功输出**

稳定、单调的 distance bucket。

**失败原因**

* heart/Creaking 链接不合法。
* 时间、激活状态或环境限制。
* AI/activation 使状态不更新。
* 输出范围和公式过粗。

**版本风险**

1.21.4+，Paper 风险高。

---

### S31. Custom jukebox song comparator output 作为 categorical LUT

Custom jukebox song 可定义 0–15 的 comparator output。([Minecraft.net][18])

**最小 probe**

定义：

```text
alu:a -> comparator_output 3
alu:b -> comparator_output 11
```

插入对应 item 并开始播放，读取 comparator。

**成功输出**

3 或 11。

**失败原因**

* item→song 映射或播放状态。
* 插入/播放 tick 延迟。
* 4-bit 输出太小。
* NBT/item predicate 直接查表更便宜。

**版本风险**

1.21+ 中等。

---

### S32. Structure integrity + seed 作为 seeded Bernoulli mask

**机制假设**

对包含 N 个相同方块的 template，使用 integrity `p` 和固定 seed 放置，得到稳定的随机空间子集。

**最小 probe**

* 1,000 个 white wool 的 template。
* integrity=0.25、固定 seed。
* 放置后 `clone filtered white_wool` 计数。
* 清空后用相同 seed 重跑。

**成功输出**

* 同 seed 完全相同 mask。
* count 约为 250。
* 不同 seed 给不同 mask。

**失败原因**

* integrity 与 processor/air 的语义不同。
* seed 还混入位置。
* 同 seed 跨版本不稳定。
* 清理/放置本身成本过高。

**版本风险**

中。适合一次生成大随机 mask，而不是逐样本 RNG。

---

### S33. Custom worldgen density/biome 作为 noise/hash oracle

**机制假设**

自定义 dimension 的 density function 或 biome source 已经实现大规模 seeded noise。把输入整数映射到世界坐标，生成 chunk，再查询 block/biome，即可获得：

* deterministic noise bit
* categorical hash
* multi-threshold quantized noise

**最小 probe**

定义一维 noise threshold：

```text
noise(x,z)>0 -> stone
else -> air
```

同坐标跨 reload 查询，多坐标统计分布；多 y 层放不同 threshold 得到多 bit。

**成功输出**

固定 world seed、版本下可重现的空间噪声。

**失败原因**

* chunk generation 成本。
* 已生成 chunk 不随 datapack reload 改变。
* worldgen 算法跨版本变化。
* 只能按空间坐标查询。
* 生成大量永久世界数据。

**版本风险**

极高。适合离线/procedural field，不适合 runtime helper。

---

### S34. Weighted pressure plate 作为物理 occupancy counter

**机制假设**

把实体数量映射为 0–15 的 signal，可在无需 selector count 的情况下维持一个持续 occupancy 统计。

**最小 probe**

在 plate 上放 0、1、10、20、100 个有效实体，step tick，读取 power。

**成功输出**

符合预期的饱和计数映射。

**失败原因**

* marker 不触发压力板。
* entity collision/activation。
* 只有 4-bit。
* `execute if entity` 一条命令已能精确计数。

**版本风险**

低，但几乎一定不值得做 scalar helper。

---

## E. Entity AI 和 pathfinding

Paper 可配置 entity activation range、inactive tick/wakeup、AI behavior tick rates、chunk/block-entity ticking；因此所有 AI/physics probe 都必须记录完整 Paper 配置。([docs.papermc.io][19])

### S35. Mob target selection 作为语义过滤后的 argmin

**机制假设**

受控 mob 会在满足 target predicate 的候选中选择最近或最高优先级目标。

**最小 probe**

* solver mob。
* 两个有效 target，距离 5 和 8。
* 无墙、固定状态。
* step 至 target acquisition。
* 使用：

```mcfunction
execute as @e[tag=solver] on target run scoreboard players operation #picked alu = @s id
```

**成功输出**

稳定选择近目标。

**失败原因**

* random acquisition。
* visibility/target conditions。
* revenge/anger memory。
* sensor tick interval。
* Paper activation。
* tie breaker 不稳定。

**版本风险**

极高。只能作为领域专用 semantic nearest，不适合 stdlib。

---

### S36. Path arrival time 作为 reachability/approx shortest-path cost

**机制假设**

在固定速度、固定 maze 中，到达 target 的 tick 数近似 path cost；未在 timeout 内到达即不可达。

**最小 probe**

两个 maze：

* 一条长度 20 的可达走廊。
* 一条几何距离较短但完全封闭的目标。

记录首次进入目标半径的 tick。

**成功输出**

可达 maze 在稳定 tick 区间到达，封闭 maze timeout。

**失败原因**

* path recalculation interval。
* 随机 wander。
* acceleration/collision。
* door/jump/swim semantics。
* path nodes 不可直接读回。
* server lag 和 Paper AI settings。

**版本风险**

极高，但可用于大型、异步游戏内规划实验。

---

### S37. Villager POI selection 作为 nearest-resource oracle

**机制假设**

Villager POI acquisition 已实现过滤、可达性检查和目标选择；选择结果可能写入 `Brain.memories`。

**最小 probe**

放两个合法 workstation/bed，spawn 一个状态完全受控的 villager，等待 acquisition，读取：

```mcfunction
data get entity @e[tag=solver,limit=1] Brain.memories
```

**成功输出**

可读到选择的 POI 坐标，且近/可达 POI 稳定获选。

**失败原因**

* memory 不序列化或路径改变。
* schedule/profession/claim state。
* random tie。
* POI registration latency。
* Paper behavior tick rate。

**版本风险**

极高。研究价值大于编译器实用价值。

---

## F. 其他时间和玩家状态机制

### S38. XP level conversion 作为 piecewise inverse-quadratic/sqrt oracle

**机制假设**

总 XP 到 level 的转换本身是分段二次公式的逆，因此隐式包含 floor 和近似 sqrt。

**最小 probe**

专用测试玩家：

```mcfunction
experience set @p 0 points
$experience add @p $(n) points
execute store result score #level alu run experience query @p levels
```

**成功输出**

level 与宿主端 XP 公式的反函数一致。

**失败原因**

* 玩家专用。
* 破坏玩家 XP 状态。
* 输出仅为整数 level。
* 3 条命令，加保存/恢复后更多。

**版本风险**

低，但几乎不值得进入 stdlib。

---

### S39. Entity Age/Fuse/Duration 作为免费 tick counter

**机制假设**

TNT Fuse、item Age、area cloud Age/Duration 等字段由游戏每 tick 自增/自减，并在阈值触发状态变化或实体移除。

**最小 probe**

设置不同初始 Fuse/Duration，step 1、8、20 ticks，读 NBT 或测试实体是否存在。

**成功输出**

稳定的 saturating decrement/increment 和 deadline event。

**失败原因**

* entity activation。
* 到期实体直接删除，精确终值不可读。
* 字段更新顺序。
* Paper 对非活跃实体降频。

**版本风险**

中。可替代某些 runtime countdown，但 `schedule` 通常更干净。

---
