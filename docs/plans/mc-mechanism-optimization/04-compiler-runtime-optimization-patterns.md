# 4. 适合 compiler/runtime 的优化模式

## 4.1 建立 representation-aware IR

不要让所有数值都默认是 scoreboard int。建议为值标记：

```text
ScoreI32(scale)
StorageNumber(type, scale)
EntityPos3
EntityRotation2
DisplayMatrix4
AttributeScalar(range, scale)
EnchantLevelU8
ItemCountU7
BlockBitset(shape)
SpatialPoint3
AsyncPhysicsState(kind, ready_tick)
```

然后由 cost model 选择表示转换，而不是先全部 scalarize。

---

## 4.2 Read-modify-write 直接化

源 IR：

```text
t = x
t = t + y
z = t
```

若 `x` dead：

```mcfunction
scoreboard players operation #x alu += #y alu
```

并把后续 `z` 重命名为 `x`。

若 `x` live：

```mcfunction
scoreboard players operation #z alu = #x alu
scoreboard players operation #z alu += #y alu
```

不要生成不必要的 `tmp → out` copy。

---

## 4.3 Single-use temp 消除与 score register allocation

对每个 temporary 做：

* use count
* last use
* live interval
* destructive operation legality
* representation

优先复用 dead operand 的 score slot。对 helper 内固定数量 temp 做全局 fake-player register pool，例如：

```text
#r0 #r1 #r2 #r3
```

避免按源变量名制造大量 scoreboard entries。

---

## 4.4 Constant slot pool

对：

```mcfunction
scoreboard players add #x alu 17
```

使用 immediate，不需要 `#c17`。

只有 scoreboard operation RHS 必须是 score 时，才使用 constant slot：

```mcfunction
scoreboard players operation #x alu *= #c1000 alu
```

建议：

* 按 `(value,scale)` interning。
* load function 一次初始化。
* 对 ±1、0、powers of two、fixed-point bases 预留 hot slots。
* 编译期折叠 polynomial coefficients。

---

## 4.5 Native min/max/swap pattern recognition

识别：

```text
x < lo ? lo : x
x > hi ? hi : x
```

直接降为 `<`/`>`，不要生成分支 function。

同理交换：

```text
tmp=a; a=b; b=tmp
```

直接：

```mcfunction
scoreboard players operation #a alu >< #b alu
```

---

## 4.6 Function result ABI：`return run`

Helper：

```mcfunction
# alu:helper
...
return run scoreboard players get #result alu
```

Caller：

```mcfunction
execute store result score #dst alu run function alu:helper
```

这能消除：

* caller/callee 共享 temp 约定；
* helper 尾部 copy；
* 再次 `scoreboard players get` wrapper。

`return run` 和 `execute if function` 为函数结果/条件提供了正式通道。([Minecraft.net][21])

对非常小的 helper，仍应比较 inline 与 call。

---

## 4.7 Delayed scalarization

不要立即把：

```text
Pos[0], Pos[1], Pos[2]
```

拆成三个 score。

优先：

```mcfunction
data modify storage alu:io vec set from entity @e[tag=out,limit=1] Pos
```

如果下一个 helper 也接受 NBT vector、macro compound、entity position，就保持 whole-vector 表示。

只有最终 consumer 真正需要一个 scalar score 时再 `data get`。

这对 Rotation、Motion、display scale/quaternion 同样适用。

---

## 4.8 Command result batching

优先寻找“命令 result 已经是 reduction”的 lowering：

* `execute if items` → 总 item count
* `execute if entity` → entity count
* `execute if data` → path match count
* `fill`/`clone` → affected block count
* split `execute ... if predicate` 的 success count
* `/random` → sample
* `/attribute get` → aggregate attribute

这类命令的价值通常高于“游戏物理”。

---

## 4.9 Selector cache 与 relation traversal

不要在同一 helper 中多次执行宽泛：

```mcfunction
@e[tag=alu_core,sort=nearest,limit=1]
```

优化方案：

1. 先 `execute as` 选一次，后续使用 `@s`。
2. 使用稳定 unique tag/generation ID。
3. 对 lane 关联使用：

   * passengers
   * vehicle
   * owner
   * target
   * origin
4. 预分配 core，不反复 summon。
5. 避免在不同维度重复全局 selector。

对“query + output + scratch”可以组织成乘客树，从而用关系 traversal 替代 tag+nearest。

---

## 4.10 Function flattening 和 tail-call fusion

建议规则：

* 1–3 条、单 callsite helper：优先 inline。
* 多 callsite、宏参数稳定：保留 function。
* caller 只调用 callee 后返回：

```mcfunction
return run function alu:callee
```

* 连续 wrappers 合并。
* 对 fast tier 允许 code duplication，减少调用和 storage ABI。
* 对 high-precision iterative helper 保持函数结构，避免 pack 膨胀。

---

## 4.11 Macro specialization 与 cache-aware codegen

Macro 不应被视为零成本动态命令。

建议：

* 高频常量参数生成专门函数，例如：

  * `store_scale_1e3`
  * `store_scale_1e4`
  * `poly_deg3_range_pi4`
* 低频参数走通用 macro。
* 对 macro tuple 做编译器端 interning。
* 不把随机 score 直接变成命令文本，除非没有替代。
* 可由 Number Provider 读取的动态值，不要宏注入。
* macro 参数 storage 在调用点视作 snapshot read。
* function macro 调用是 optimizer 的 parse/cache/effect barrier。

---

## 4.12 Storage alias 和 wildcard effect analysis

以下命令：

```mcfunction
data modify storage alu:s arr[{flag:1b}].x set value 0
```

可能写多个路径。IR 应记录：

```text
write set = alu:s.arr[*].x where flag=1
```

优化器只能在证明路径不相交时重排。

宏函数：

```mcfunction
function alu:f with storage alu:args
```

应把 `alu:args` 视为完整 read dependency；函数内再修改该 storage 不应影响已经展开的参数。

---

## 4.13 Range、scale 和 overflow abstract interpretation

为每个值跟踪：

```text
[min,max]
fixed-point scale
signedness
may_be_zero
may_be_negative
precision tier
```

用途：

* 证明 int32 乘法不会溢出。
* 自动选择 ×100、×1000、×10000。
* 判断能否使用 enchant level u8 backend。
* 判断 item count u7 backend。
* 为 reciprocal/sqrt 插入 domain guard。
* 选择 attribute bias，避免 lower clamp。
* 判断 display/entity Pos 是否会越过安全坐标范围。
* 自动决定 Newton iteration 次数。

---

## 4.14 Tiered helper dispatch

建议每个近似 helper 都有 metadata：

```text
domain
max_abs_error
max_rel_error
monotonic?
deterministic?
commands_hot
commands_cold
ticks
persistent_state
version_capability
paper_safe
```

例如：

```text
sqrt.fast
  display SVD or enchant exponent
  2–4 commands
  bounded domain
  version-gated

sqrt.balanced
  range reduction + LUT + 1 Newton
  scoreboard
  deterministic

sqrt.precise
  integer/fixed-point Newton
  more commands
  documented error bound
```

调用点根据用户 annotation、误差预算和 backend capabilities 选择。

---

## 4.15 Batch lowering

建议建立规则式 backend selector：

| IR 形态                       | 候选 backend                                     |
| --------------------------- | ---------------------------------------------- |
| 大量 boolean reduction        | block volume、`execute if items`、NBT path count |
| bounded item integers       | item counts、`modify_contents`                  |
| u8 unary function           | enchantment Level-Based Value                  |
| affine/dot reduction        | attribute modifiers                            |
| 2D/3D quantized nonlinear函数 | spatial codebook、heightmap                     |
| norm threshold              | selector `distance`                            |
| trig/rotation               | local coordinates                              |
| atan2/normalize             | `facing`                                       |
| async raycast/collision     | projectile lane                                |
| grid distance field         | light/leaves/scaffolding                       |
| random mask                 | structure integrity                            |
| seeded scalar RNG           | `/random` named sequence                       |

关键是计算 break-even batch size，而不是硬编码“某机制总是更快”。

---

## 4.16 Tick-phase SSA

把异步 helper 显式建模为：

```text
token = issue(op, inputs)
wait_until token.ready_tick
outputs = collect(token)
```

每个 lane 保存：

```text
state
generation
issue_tick
ready_tick
timeout_tick
result_valid
```

优化规则：

* 相同 latency 的任务成批 issue/collect。
* 计算等待期间穿插纯 scoreboard 工作。
* 禁止 collect 前读 Motion/Pos。
* entity 不存在视为显式 failure，不是零结果。
* Paper 下加入 watchdog timeout。

---

## 4.17 Persistent ALU core pool

在专用空维度中预分配：

* marker lanes
* display decomposition cores
* attribute/enchantment living cores
* projectile lanes
* block scratch regions
* container/item cores

每个 lane 有：

```text
free/busy
generation
owner/task id
ready_tick
```

避免 summon/kill。对有 idle tick 成本的实体，只保留 benchmark 证明有收益的数量。

---

## 4.18 `strict` 与 simulation-aware placement

1.21.5+：

* RAM/bitset 初始化、clone、template permutation：倾向使用 strict。
* 红石、光照、叶子 BFS、comparator probe：必须允许 updates。
* compiler IR 中应区分：

```text
place_raw
place_and_simulate
```

而不是调用者手写 strict。([Minecraft.net][10])

---

## 4.19 Cost model 不只算命令行

建议每次 benchmark 输出：

```text
static_lines
dynamic_commands_executed
execute_forks
entities_scanned
slots_scanned
blocks_touched
nbt_scalar_reads
macro_parameter_tuple
macro_cache_cold/warm
tick_latency
mean_tick_ns
p95_tick_ns
max_tick_ns
persistent_entities
forced_chunks
```

特别应分别测试：

* N=1、8、64、512、4096 lanes
* cold macro tuple
* warm macro tuple
* loaded/unloaded chunk
* Vanilla
* Paper 默认配置
* 实际部署 Paper 配置

---

## 4.20 Live oracle harness

建议每个 candidate helper 自动生成：

```text
setup
edge_cases
random_cases
issue
tick_step
collect
assert
cleanup/reset
```

测试数据至少覆盖：

* 0、±1
* min/max
* scale 边界
* negative rounding
* overflow 邻域
* exact powers of two
* reciprocal near zero
* display degenerate/repeated singular values
* coordinate boundary
* tie cases
* chunk unload/reload
* save/restart
* repeated same input
* shuffled lane order

对 float helper记录：

```text
absolute error
relative error
ULP-like error
monotonic violations
sign errors
determinism hash
```

测试时可使用 `/tick freeze`、`/tick step`、`/tick sprint`；1.21.5 还提供适合 CI 的 headless GameTest 入口。([Minecraft.net][22])

---

## 4.21 Capability/version matrix

建议编译器明确区分：

```text
java_1_20_5
  item components
  execute if items
  modern item modifiers

java_1_21_0
  data-driven enchantments
  Level-Based Values incl. lookup

java_1_21_5
  strict block placement
  headless GameTest

java_1_21_11
  exponent Level-Based Value

vanilla
paper(build, config fingerprint)
```

同一 helper 可以有：

```text
exact_scoreboard
fast_display
fast_enchantment
batch_attribute
paper_safe_fallback
```

不要只检查 Minecraft 版本字符串，还要 fingerprint Paper 的 entity activation、AI tick 和 redstone 配置。

---

## 4.22 Helper promotion gate

一个 trick 只有同时满足以下条件才进入 public stdlib：

1. 明确输入 domain。
2. 零、负数、overflow、degenerate case 有定义。
3. 读回路径完全服务器端。
4. save/reload 后一致，或明确声明 ephemeral。
5. 同输入重复结果稳定。
6. Vanilla 与目标 Paper build 都有测试。
7. 端到端成本优于 fallback，而非只看核心一条命令。
8. batch break-even 已测量。
9. 误差有上界。
10. 版本 capability 不满足时自动 fallback。

---
