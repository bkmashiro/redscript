# 1. 高确定性可行方案

## 1.1 Scoreboard 原生的 min、max、swap、comparison lowering

虽然属于 scoreboard，但它应当作为所有“奇技淫巧”的基准线。

**可实现运算**

* `min(a,b)`：`<`
* `max(a,b)`：`>`
* swap：`><`
* clamp：两条命令
* comparison → 0/1：`execute store success`
* 区间判断、符号分支

```mcfunction
# x = max(x, lo)
scoreboard players operation #x alu > #lo alu

# x = min(x, hi)
scoreboard players operation #x alu < #hi alu

# b = (x < y)
execute store success score #b alu run execute if score #x alu < #y alu
```

**成本**

* min/max/swap：1 条。
* clamp：2 条。
* comparison materialize：1 条。

**精度和风险**

纯 int32。唯一风险是前置运算已经溢出。

**初始化/读回**

只需 objective；结果在 scoreboard。

**Batch**

`execute as` 可批量，但会 fork。

**Public stdlib**

不建议做函数调用，应由编译器直接内联成 intrinsic。

---

## 1.2 `execute store` 作为数值 cast、constant-scale 和 quantizer

**机制名称**

Command result → NBT numeric type，或 NBT numeric value → command result。

**可实现运算**

* int32 → float/double fixed-point
* float/double → int32 量化
* 乘以编译期常量
* 除以编译期常量
* byte/short/int/long/float/double 类型窄化
* helper ABI 中 score 与 storage 的互转

```mcfunction
# score 12345 -> storage double 12.345
execute store result storage alu:io x double 0.001 run scoreboard players get #x alu

# storage double -> score ×1000
execute store result score #y alu run data get storage alu:io x 1000
```

动态 scale 可通过宏注入：

```mcfunction
$execute store result storage alu:io x double $(scale) run scoreboard players get #x alu
```

**命令数量**

* 单向转换：1。
* round-trip：2。
* 动态 scale：仍是一条运行命令，但增加 macro 调用和冷参数重解析成本。

**精度/风险**

* command result 本质上是整数。
* NBT → score 会发生整数化；负数的舍入方向必须 probe。
* byte/short 窄化的溢出行为不要作为语言 ABI，除非专门锁版本测试。
* Mojira 有长期报告指出 `execute store ... double <scale>` 的中间 scale 计算可能只有 float 精度，因此不要把它视为完整 binary64 通道。([Mojira][2])

**初始化**

仅 storage；动态 scale 需要宏函数。

**读回**

scoreboard 或 storage。

**Batch**

中等。共享 storage 会产生覆盖；多 lane 应写 entity NBT、分槽 storage，或保持 score 表示。

**Public stdlib**

适合作为内部 `cast`, `quantize`, `to_fixed`, `from_fixed` intrinsic；不适合作为通用高精度乘除法。

---

## 1.3 `execute align` 作为三维 floor/网格量化器

**可实现运算**

* `floor(x)`, `floor(y)`, `floor(z)` 同时执行
* 对负数按方块网格语义下取整
* voxelization
* 连续位置 → 方块坐标

```mcfunction
execute as @e[type=marker,tag=alu_q] at @s align xyz run tp @s ~ ~ ~

# 整个三元组一次搬回 storage
data modify storage alu:out pos set from entity @e[type=marker,tag=alu_q,limit=1] Pos
```

`execute align` 会把执行位置对齐到方块网格。([Minecraft.net][3])

**命令数量**

* 三轴 floor：1。
* 整个 `Pos` 列表读回：1。
* 若分别 scalarize 成三个 score：额外 3 条。

**精度/风险**

* 结果仍以 double Pos 保存，但值为整数坐标。
* 负数是 floor，不是 Java/C 风格 toward-zero。
* 非有限值不应进入实体 Pos。

**初始化**

一个 marker；最好在专用 forceload 维度中。

**读回**

entity `Pos` → storage，或三个 score。

**Batch**

很好：

```mcfunction
execute as @e[tag=alu_q] at @s align xyz run tp @s ~ ~ ~
```

一条源码命令处理 N lane，但 `F=N`。

**Public stdlib**

适合 `floor3`, `voxelize`, `block_pos`；标量 `floor(x)` 未必比 fixed-point scoreboard 划算。

---

## 1.4 Local coordinates 作为内置 SO(3) matrix-vector 乘法

**可实现运算**

* `sin/cos`
* yaw/pitch → forward vector
* 局部向量旋转到世界空间
* 正交基生成
* 3D rotation matrix × vector
* 同一 rotation 下批量变换多个固定向量

```mcfunction
# rot marker 保存输入 Rotation
# out 被放到原点 + rot 的 local forward
execute positioned 0 0 0 rotated as @e[tag=rot,limit=1] run tp @e[tag=out,limit=1] ^0 ^0 ^1

data modify storage alu:out vec set from entity @e[tag=out,limit=1] Pos
```

动态局部向量：

```mcfunction
$execute positioned 0 0 0 rotated as @e[tag=rot,limit=1] run tp @e[tag=out,limit=1] ^$(x) ^$(y) ^$(z)
```

**命令数量**

* rotation × vector：1。
* 整个向量读回：1。
* scalar score 输出：额外 3 条。
* 若输入 local vector 需要宏，另有一次 function call。

**精度/风险**

* Rotation 是 float，Pos 是 double；最终有效角度精度受 Rotation 限制。
* 应在原点附近计算，避免“大基址 + 小位移”再相减产生精度损失。
* pitch 接近 ±90° 时局部左右基向量的约定应做回归测试。
* yaw 符号、零度朝向按 Minecraft 约定，不等同于常见数学坐标系。

**初始化**

一个 rotation marker、一个 output marker。

**读回**

entity `Pos`，一次 whole-list copy 到 storage。

**Batch**

好。多个向量共享一个 Rotation 时，收益尤其明显。

**Public stdlib**

非常适合：

```text
sincos_yaw
forward3
rotate_local3
basis_from_yaw_pitch
```

服务端位置和旋转是同 tick 更新；客户端插值不影响 NBT 读回。([Minecraft.net][4])

---

## 1.5 `facing` round-trip 作为 atan2、pitch 和方向归一化

**可实现运算**

给定两点 `p`,`q`：

* yaw = `atan2` 的 Minecraft 版本
* pitch
* 单位方向向量
* 方向向量规范化
* 朝向 canonicalization

```mcfunction
# src 的执行位置朝向 dst，然后用相对 Rotation 把结果写回 src
execute as @e[tag=src,limit=1] at @s facing entity @e[tag=dst,limit=1] feet run tp @s ~ ~ ~ ~ ~

data modify storage alu:out rot set from entity @e[tag=src,limit=1] Rotation
```

继续获取单位向量：

```mcfunction
execute positioned 0 0 0 rotated as @e[tag=src,limit=1] run tp @e[tag=unit,limit=1] ^ ^ ^1
data modify storage alu:out unit set from entity @e[tag=unit,limit=1] Pos
```

**命令数量**

* atan2 + pitch：1 commit + 1 whole-list read。
* normalized vector：再加 1 transform + 1 read。
* 如果后续直接在 local coordinates 中消费 rotation，可省去读回。

**精度/风险**

* 零向量 `p=q` 必须显式 guard。
* yaw 范围、正负零、垂直方向的 yaw 选择要 probe。
* 结果是 angle canonicalization，不保证与宿主语言 `atan2` 的边界约定完全相同。

**初始化**

src、dst、可选 unit marker。

**读回**

`Rotation` 或单位 marker 的 `Pos`。

**Batch**

中高。每 lane 需要稳定关联 src/dst，建议使用乘客、owner/origin 关系或 generation tag，避免全局 selector 配错。

**Public stdlib**

适合 `atan2_mc`, `look_angles`, `normalize3_fast`。若语言要求标准数学坐标系，应在 wrapper 中做轴交换和符号修正。

---

## 1.6 `execute in` 的维度坐标缩放

**可实现运算**

内置 Overworld ↔ Nether 变换提供：

* x、z 乘 8
* x、z 除 8
* y 保持不变
* 二维向量固定比例缩放

```mcfunction
execute at @e[tag=src,limit=1] in minecraft:the_nether run tp @e[tag=out_nether,limit=1] ~ ~ ~

execute in minecraft:the_nether run data modify storage alu:out pos set from entity @e[tag=out_nether,limit=1] Pos
```

`execute in` 使用维度间的 coordinate scale；内置 Overworld/Nether 是经典的 1:8 映射。([Mojira][5])

**命令数量**

* scale + 写入目标 marker：1。
* whole-list 读回：1。
* 把输出实体移回原维度会再增加一条，不推荐。

**精度/风险**

* 只缩放 x、z。
* 世界边界附近可能发生范围约束。
* 目标维度和 marker 所在区块必须加载。
* 内置 8 倍可视为高确定性；任意 custom `coordinate_scale` 放在 speculative 部分。

**初始化**

两个维度各一个 marker；目标区块 forceload。

**读回**

目标维度实体 `Pos` → storage。

**Batch**

可以，但跨维度实体管理和 chunk 成本会迅速上升。

**Public stdlib**

只建议做内部 `scale_xz_by_8` intrinsic。对普通标量，scoreboard 乘除仍更便宜。

---

## 1.7 Spatial selector 作为 norm comparator、argmin 和 nearest-neighbour LUT

### A. 球内判断，不计算平方或 sqrt

```mcfunction
execute store success score #inside alu run execute positioned 0 0 0 if entity @e[tag=v,limit=1,distance=..5]
```

实现：

```text
x²+y²+z² <= r²
```

而不显式计算平方。

### B. 半径内 popcount

```mcfunction
execute store result score #n alu run execute positioned 0 0 0 if entity @e[tag=point,distance=..16]
```

### C. 最近 codebook / 向量量化

```mcfunction
execute at @e[tag=query,limit=1] as @e[tag=code,sort=nearest,limit=1] run scoreboard players operation #out alu = @s lut
```

或把 code marker 的 NBT 输出复制到 query marker：

```mcfunction
execute as @e[tag=query] at @s run data modify entity @s data.value set from entity @e[tag=code,sort=nearest,limit=1] data.value
```

**可实现运算**

* norm threshold
* nearest/furthest
* argmin
* Voronoi quantizer
* 2D/3D arbitrary approximate LUT
* nearest nonzero bucket
* random categorical：`sort=random,limit=1`

**命令数量**

通常 1 条核心命令。

**精度/风险**

* 位置为 double，但 selector 距离比较的精确边界应 probe。
* 最近点 tie 的选择不应进入语言语义。
* `L=1` 不代表便宜：nearest codebook 内部约为扫描 `M` 个候选；N 个 query 是 `O(NM)`。

**初始化**

持久化 codebook marker；每个 marker 存输出 score 或 NBT。

**读回**

scoreboard、query marker NBT 或 storage。

**Batch**

命令行 batch 很好，真实成本可能很差。适合较小 codebook，例如 16、32、64 个节点。

**Public stdlib**

适合 `quantize2`, `nearest_palette`, `norm_leq`；不适合大表通用查找。

---

## 1.8 Heightmap 作为二维整数 ROM

**机制**

预先构造每个 `(x,z)` 列的最高方块高度为 `f(x,z)+bias`，然后用：

```mcfunction
execute as @e[tag=hquery] at @s positioned over motion_blocking run tp @s ~ ~ ~
```

读取 y。

`positioned over` 直接把执行高度放到指定 heightmap 顶端；可选 `world_surface`、`motion_blocking`、`motion_blocking_no_leaves`、`ocean_floor`。([Minecraft.net][6])

**可实现运算**

* `(x,z) -> bounded integer`
* 2D LUT
* 地图/导航 cost field
* piecewise approximation
* 二元离散函数

**命令数量**

* query：1。
* whole Pos 读回：1。
* 若只消费空间结果，可不读回。

**精度/风险**

* 输出范围受世界高度限制。
* 顶面坐标可能有 ±1 的编码约定，初始化时校准。
* 修改 ROM 后要确认 heightmap 已更新。
* 不要用 suppress update 的放置方式构建后直接假设 heightmap 正确。

**初始化**

一片预制方块列和 query markers；区块需保持加载。

**读回**

query marker `Pos[1]`。

**Batch**

变换本身很好，一条命令可更新所有 query；将每个 y scalarize 到独立 score 仍会 fork。

**Public stdlib**

适合作为大型、只读、低维 bounded LUT backend；不适合小型标量表。

---

## 1.9 NBT path 作为结构化 popcount、filter 和 broadcast SIMD

**可实现运算**

* list/string 长度
* 匹配元素数量
* existence
* exact-value popcount
* 对所有匹配节点广播赋值
* 结构化 filter/delete
* 稀疏数据上的 map

```mcfunction
# list 长度
execute store result score #len alu run data get storage alu:buf arr

# 统计 flag=1 的元素
execute store result score #ones alu run execute if data storage alu:buf arr[{flag:1b}]

# 对所有 flag=1 的元素广播写入
data modify storage alu:buf arr[{flag:1b}].x set value 0
```

NBT path 可产生多个匹配节点；`execute if data` 的 result 可反映匹配数，修改操作可作用于所有匹配节点。([Minecraft.net][7])

**命令数量**

* count：1。
* broadcast write：1。
* filter/delete：通常 1。

**精度/风险**

* 适合 exact NBT equality、子 compound 匹配，不支持一般数值范围聚合。
* list 长度和 filtered path result 应纳入每版本回归测试。
* 对巨大 NBT 列表，内部遍历成本仍是 O(N)。

**初始化**

storage 或实体/方块 NBT。

**读回**

count → scoreboard；修改结果留在 storage/NBT。

**Batch**

非常好，特别适合已经以 AoS compound list 表示的数据。

**Public stdlib**

应暴露为编译器内部操作：

```text
nbt_len
nbt_count_match
nbt_broadcast_set
nbt_filter
```

---

## 1.10 `execute if items` 作为跨槽位精确 reduction

**机制**

1.20.5+ 中，单独使用 `execute if items` 时，返回所有匹配 item stack 中的**物品总数**，且 source selector 可匹配多个实体，slot 可用 `container.*` 等范围。([Minecraft.net][8])

```mcfunction
execute store result score #sum alu run execute if items entity @e[tag=item_lane] container.* minecraft:redstone
```

**可实现运算**

* popcount：每个 true 用 count=1
* bounded integer sum：数值编码为 stack count
* 按 item type/component 分类求和
* 跨多个实体和槽位 reduction
* collection predicate、component predicate

**命令数量**

输入已经 itemized 时，reduction 只需 1 条。

**精度/风险**

* 单 stack 范围受 max stack size 限制；1.20.5 的组件允许自定义上限，但仍是小整数域。
* item count 为 0 时 stack 可能消失。
* 物品表示的构造成本往往比 reduction 本身大。

**初始化**

容器方块、拥有 inventory 的实体，或预制 item lanes。

**读回**

直接 score。

**Batch**

非常好：一个 selector、一个 slot range 就能聚合大量槽位。

**Public stdlib**

适合 item/container 已经是程序数据模型的场景。若仅为一次整数求和而临时创建物品，不划算。

---

## 1.11 `modify_contents` / item modifier 作为 item-vector map

**机制**

`minecraft:modify_contents` 可把 item modifier 应用于容器、bundle、charged projectiles 等组件中的每一个 item；`filtered` 可以只处理匹配元素。([Minecraft.net][9])

概念性 modifier：

```json
{
  "function": "minecraft:modify_contents",
  "modifier": {
    "function": "minecraft:filtered",
    "item_filter": {"items": "minecraft:redstone"},
    "modifier": [
      {"function": "minecraft:set_count", "count": 2, "add": true},
      {"function": "minecraft:limit_count", "limit": {"min": 1, "max": 99}}
    ]
  }
}
```

调用：

```mcfunction
item modify entity @e[tag=item_core] weapon.mainhand alu:map_contents
```

**可实现运算**

* 所有元素加常数、设 count
* saturating clamp
* component map
* 按 predicate 分支 map
* categorical rewrite
* bounded affine transform

**命令数量**

* 整个 nested item vector map：1。
* 读回：whole NBT 1 条，或后续 item reduction 1 条。

**精度/风险**

* item count 是小整数。
* count=0 可能删除元素。
* `filtered` schema 在后续版本发生过字段调整，因此需要 pack-format adapter。
* 实际工作仍与内容元素数成正比。

**初始化**

承载 contents 的 item 或容器。

**读回**

item NBT/component、item predicate、搬运到公开槽位后用 `execute if items`。

**Batch**

很好。对 N 个 core 使用一个 selector，仍是 N 个内部 item 修改。

**Public stdlib**

适合作为 `u7/u8 vector` backend，不适合作为一般 int32 SIMD。

---

## 1.12 Block volume 作为 bitset SIMD、popcount 和 memcmp

### Destructive popcount

```mcfunction
execute store result score #ones alu run fill 0 0 0 31 31 31 minecraft:air replace minecraft:white_wool
```

返回被替换方块数。

### Non-destructive-ish popcount

```mcfunction
execute store result score #ones alu run clone 0 0 0 31 31 31 64 0 0 filtered minecraft:white_wool force
```

返回复制方块数；目标 scratch 区需要管理。

### 整块数组 equality

```mcfunction
execute store success score #eq alu run execute if blocks 0 0 0 31 31 31 64 0 0 all
```

### Bulk permutation

`place template` 的 rotation/mirror 可对整个三维 block array 做批量轴交换、翻转和旋转。

**可实现运算**

* bitset popcount
* destructive filter
* Hamming-distance 的一部分
* bulk equality / masked equality
* transpose/rotation/reflection
* seeded sparse mask
* cellular state initialization

**命令数量**

通常每个 volume reduction 或 transform 1 条。

**精度/风险**

* 受 command modification block limit 限制。
* clone/fill 的返回值是实际受影响方块数，目标与源相同状态可能不计数。
* block entity 会显著增加成本。
* 1.21.5 的 `strict` 可抑制 block/shape updates；这是 RAM copy 的好事，但若本来要利用红石、光照、叶子更新，就不能加 strict。([Minecraft.net][10])

**初始化**

源区、scratch 区；最好在专用 forceload dimension。

**读回**

scoreboard，或结果方块区。

**Batch**

极好，尤其是数百至数万 bit 的聚合。

**Public stdlib**

值得做 `block_bitset` backend；但要把 block count 和 chunk cost 纳入真实成本。

---

## 1.13 Predicate/Number Provider 作为预编译布尔电路

概念性 predicate：

```json
{
  "condition": "minecraft:value_check",
  "value": {
    "type": "minecraft:storage",
    "storage": "alu:io",
    "path": "x"
  },
  "range": {"min": -1.0, "max": 1.0}
}
```

调用：

```mcfunction
execute store success score #ok alu run execute if predicate alu:x_in_unit
```

跨实体统计：

```mcfunction
execute store success score #n alu run execute as @e[tag=lane] if predicate alu:lane_ok
```

**可实现运算**

* storage float/double range comparison
* score comparison
* boolean `all_of`, `any_of`, inversion
* block state property range
* light range
* movement x/y/z、speed、horizontal speed、vertical speed 范围
* 周期 tick predicate
* 复杂 item/entity/location 条件

1.21 的 movement predicate 可直接检查分量及 speed/horizontal/vertical speed，block state predicate 支持属性范围，light predicate 可读取可见光级别。([Minecraft.net][11])

**命令数量**

* 一个预编译 predicate evaluation：1。
* 跨 lane successful-branch count：仍可在一条命令中完成。

**精度/风险**

* 输出通常只有 boolean 或成功 fork 数。
* 静态 threshold 很便宜；用宏生成高熵 inline predicate 会引入解析成本。
* movement 值的 tick 时序必须固定。

**初始化**

predicate JSON；可选 lane entities。

**读回**

scoreboard success/result。

**Batch**

非常好，但应记录 fork 数。

**Public stdlib**

适合 branch lowering、range checks、domain guards。不要把简单 score comparison 包成函数。

---

## 1.14 `/random` named sequence 作为可重置 PRNG

```mcfunction
# seed 可通过宏注入
$random reset alu:stream $(seed) false false
execute store result score #r alu run random value 0..2147483647 alu:stream
```

**可实现运算**

* uniform integer
* 独立命名 stream
* 固定 seed 重放
* 版本内伪 hash：reset(seed) 后取第一个样本
* reservoir/categorical sampling 的基础

Named random sequence 可以显式 reset，并选择是否混入 world seed 和 sequence ID。([Minecraft.net][4])

**命令数量**

* 连续 stream 每样本：1。
* keyed sample/hash-like：reset 1 + sample 1。

**精度/风险**

* 不是密码学 hash。
* 不应承诺跨 Minecraft 版本的算法和输出稳定性。
* 对同一 named stream 并发调用会引入顺序依赖。
* 动态生成大量 sequence ID 会触发宏解析或状态膨胀。

**初始化**

无，或固定 sequence pool。

**读回**

scoreboard command result。

**Batch**

可为不同 subsystem 分配独立 stream；每 lane 独立 stream 的管理成本较高。

**Public stdlib**

适合 `rand_range`, `rand_stream`; “hash” API 必须命名为 version-scoped，例如 `hash32_mc_1_21_11`。

---

## 1.15 Loot engine 作为 random/binomial/weighted categorical ALU

```mcfunction
loot replace entity @e[tag=rng_core,limit=1] inventory.0 loot alu:binomial

execute store result score #k alu run execute if items entity @e[tag=rng_core,limit=1] inventory.0 *
```

**可实现运算**

* uniform number provider
* binomial sampling
* weighted categorical choice
* probability table
* random count
* `limit_count` clamp
* enchantment-level-dependent probability
* random vector/item generation

Loot functions和 number providers 本身支持随机数、bonus、count limit 等组合。([Minecraft.net][12])

**命令数量**

* sample/materialize：1。
* 读 count：1。
* 读 category：1 至数条，取决于编码。

**精度/风险**

* RNG 上下文和调用顺序影响输出。
* item stack count 是小整数。
* 为普通 uniform int 单独走 loot 通常不如 `/random`。

**初始化**

loot table 和一个带槽位的 carrier。

**读回**

item count/type/component → score 或 predicate。

**Batch**

较好；一个 loot call 可生成多个 stack，但大量实体各自调用仍有内部成本。

**Public stdlib**

适合 `binomial`, `weighted_choice`, `loot_sample`，不适合最基础的 uniform integer。

---

## 1.16 Item attribute modifier 作为 fused affine reducer

这是我认为最值得系统验证的方向之一。

Item modifier 的 `set_attributes` 可构造多个 attribute modifiers；amount 可由 score Number Provider 提供。属性系统随后统一执行 `add_value`、`add_multiplied_base`、`add_multiplied_total`。([Minecraft.net][8])

概念性 item modifier：

```json
{
  "function": "minecraft:set_attributes",
  "replace": true,
  "modifiers": [
    {
      "id": "alu:x",
      "attribute": "minecraft:generic.attack_damage",
      "operation": "add_value",
      "slot": "mainhand",
      "amount": {
        "type": "minecraft:score",
        "target": {"type": "minecraft:fixed", "name": "#x"},
        "score": "alu",
        "scale": 0.002
      }
    },
    {
      "id": "alu:y",
      "attribute": "minecraft:generic.attack_damage",
      "operation": "add_value",
      "slot": "mainhand",
      "amount": {
        "type": "minecraft:score",
        "target": {"type": "minecraft:fixed", "name": "#y"},
        "score": "alu",
        "scale": -0.0005
      }
    }
  ]
}
```

调用：

```mcfunction
item modify entity @e[tag=alu_core,limit=1] weapon.mainhand alu:dot2

execute store result score #out alu run attribute @e[tag=alu_core,limit=1] minecraft:generic.attack_damage get 1000
```

若 base 为 `b`，多个 `add_value` 可以计算：

```text
b + c0*x0 + c1*x1 + ... + cn*xn
```

`add_multiplied_total` 可把已经编码为 `1+u_i` 的因子做乘积链。

**命令数量**

* 动态构造/修改 item modifiers：1。
* aggregate attribute 读回：1。
* `dot8`、`dot16` 仍可能是 2 条核心命令。

**精度/风险**

* modifier amount/attribute 使用浮点值，但 `/attribute get scale` 最终返回整数 command result。
* 属性有自身 min/max clamp；必须选合适的受支持属性并做 bias/range proof。
* carrier 必须实际支持该 attribute。
* modifier ID 必须唯一。
* `replace:true` 或固定 ID 很重要，否则重复调用可能累积。
* 同 tick 装备刷新是否总是立即反映到 `/attribute get`，必须 Vanilla/Paper probe。
* signed 输出常需加 bias，因为许多易用属性下界非负。

**初始化**

一个持久化、NoAI、Silent、Invulnerable 的 living carrier，固定 base attribute 和一件 mainhand item。

**读回**

scoreboard；只需比较时也可直接查询属性后 materialize boolean。

**Batch**

潜力很高：

```mcfunction
item modify entity @e[tag=alu_core] weapon.mainhand alu:dot
execute as @e[tag=alu_core] store result score @s alu_out run attribute @s minecraft:generic.attack_damage get 1000
```

两条源命令处理 N lane，但 `F=N`。

**Public stdlib**

在完成 clamp、同 tick 刷新和 Paper 行为测试后，适合：

```text
affine_reduce4
dot4
dot8
product_factors
```

---

## 1.17 Enchantment Level-Based Value 作为 bounded unary ALU

1.21 的自定义 enchantment 可以让装备物品向 carrier attribute 加 modifier，modifier amount 是 Level-Based Value：

* `linear`
* `clamped`
* `fraction`
* `levels_squared`
* `lookup`

1.21.11 增加：

* `exponent(base, power)`。([Minecraft.net][13])

输入是 enchantment level；可通过 item modifier 的 `set_enchantments` 从 score/number provider 写入。然后读取装备者 attribute。

```mcfunction
item modify entity @e[tag=ench_core,limit=1] weapon.mainhand alu:set_levels

execute store result score #out alu run attribute @e[tag=ench_core,limit=1] minecraft:generic.attack_damage get 1000
```

**可实现运算**

* bounded arbitrary LUT：`lookup`
* `x²+c`
* `clamp(ax+b)`
* `p(x)/q(x)`，其中子项是 Level-Based Value
* 1.21.11+：`x^p`
* 正数域 sqrt：`x^0.5`
* reciprocal：`x^-1`
* 指数表或 `base^x`
* 多个 enchantment level 经 attribute operations 融合

**命令数量**

* 设置一个或多个输入 level：1 个 item modifier call。
* 读 attribute：1。
* 理论上 unary LUT、square、sqrt、reciprocal 都可能是 2 条核心命令。

**精度/风险**

* 输入是有界整数 level，不是任意 int32/float。
* level 0 通常意味着 enchantment 不存在，应把 domain 定为 `[1,max_level]`，或用偏置 `level=x+1`。
* 输出受 attribute clamp 和 `/attribute get` 量化。
* lookup 表大小、装备 slot、custom enchant schema 都需要版本 adapter。
* `exponent` 仅适用于 1.21.11+；负底数、零的负次幂等必须 domain guard。

**初始化**

自定义 enchantments、一个 carrier、一件受支持 item。

**读回**

attribute → score。

**Batch**

很好，一个 item modifier 可以同时设置多个 enchantments。

**Public stdlib**

强烈建议做一个内部：

```text
u8_eval(function_id, x)
```

并据版本选择 `lookup`、`levels_squared` 或 `exponent` backend。

---

## 1.18 `schedule` 和 `periodic_tick` 作为无 per-tick scoreboard 的时序运行时

**可实现运算**

* 延迟 continuation
* timeout
* debounce/coalescing
* 固定 tick 后 collect physics result
* 周期任务
* 避免每 tick 对所有对象执行 `score -= 1`

```mcfunction
schedule function alu:raycast_collect 2t replace
```

或使用 entity predicate 中的 `periodic_tick` 选择当前 tick 应运行的实体。([Minecraft.net][14])

**命令数量**

* schedule：1。
* 到期后执行目标 function。
* 中间 N tick 没有 scoreboard decrement 命令。

**精度/风险**

* latency 明确为 tick 级。
* scheduled function 不能自然携带每次调用的 macro 参数。
* 同一 function 使用 `replace` 会合并调用；需要 queue、lane pool 或多个 trampoline ID。
* server lag 不改变 tick 数，但改变 wall-clock 时间。

**初始化**

continuation storage、lane 状态或 scheduled function pool。

**读回**

storage/score/entity state。

**Batch**

适合整批 issue → wait → collect，而不适合大量独立动态 deadline。

**Public stdlib**

适合 runtime scheduler，不属于数值 helper。

---
