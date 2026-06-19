# 3. 看起来诱人但大概率不划算或不可靠的方案

## 3.1 Client-only renderer 结果

不应依赖：

* display interpolation
* billboard 最终朝向
* text layout/line wrapping
* particle trajectory
* sound attenuation/pitch
* item model predicate
* shader/model matrix

这些结果主要存在于客户端，服务器没有稳定 NBT 读回。Display 只有服务端 transformation 本身值得利用；客户端插值结果不能作为计算输出。([Minecraft.net][4])

## 3.2 直接写 decomposed display transform，期待它自动做矩阵乘法

若写入：

```text
translation
left_rotation
scale
right_rotation
```

NBT 很可能只保存这些分量，而不会把它们乘起来再重新分解。真正可能触发 canonicalization 的路径是写入 16 元素 matrix form。

## 3.3 用普通 physics 做 `+`, `*`, `/`

对单标量，通常需要：

1. score → NBT
2. 初始化实体
3. 等 tick
4. NBT → score

即使核心 physics 一条命令，端到端也会输给 scoreboard。Physics 的优势只在：

* 本来数据就在实体状态中；
* 大 batch；
* 同时获得 collision/raycast 等 scoreboard 难算的结果；
* 可接受 tick latency。

## 3.4 Falling block time-to-impact 计算 sqrt

理论上自由落体时间与 sqrt(height) 有关，但：

* 延迟 O(sqrt n) tick；
* drag、terminal velocity、碰撞 epsilon；
* 离散时间；
* chunk/entity ticking；
* 输入输出搬运。

通常不如 Newton 或 LUT。

## 3.5 AI/pathfinding 做普通数学

AI 具备昂贵的语义计算，但：

* acquisition 不每 tick 执行；
* path 不直接序列化；
* 存在随机性和 tie；
* activation range；
* Paper 配置；
* TPS 成本远高于命令数看起来的数值。

只能作为领域专用 oracle。

## 3.6 Redstone 做单个 4-bit scalar

虽然 comparator 能 subtract/max，仍需要：

* 输入 signal materialization；
* 1–2 tick；
* 输出解码；
* 方块和区块；
* Paper redstone 差异。

除非一次更新数百个 cell，否则 scoreboard 一般完胜。

## 3.7 Random tick、流体、火、作物、铜氧化、composter

这些机制依赖随机 tick、邻域状态、gamerule 和 chunk ticking，不适合作为确定性运行时。即使只需要随机，也有 `/random` 和 loot engine。

## 3.8 Worldgen、`locate structure`、portal search 做 hot math

它们可能隐含：

* nearest search
* noise
* coordinate scaling
* terrain scan

但会加载/生成区块，污染世界持久状态，并造成非常大的尾延迟。只适合离线预计算。

## 3.9 玩家专属状态作为 ALU

XP、food、exhaustion、recipe book、advancement progress 都可能有有趣公式，但会污染玩家状态、难 batch、难在无人服务器测试。

## 3.10 大量 summon/kill “计算实体”

若每次 helper 调用都 summon/kill：

* entity index 更新；
* UUID 分配；
* chunk save；
* selector 扫描；
* Paper activation bookkeeping。

应预分配 lane pool，reset 状态而不是反复创建。

## 3.11 高熵 macro 参数

宏参数组合会影响解析/cache。对每个随机输入都生成全新命令文本，可能把一个“1 行动态命令”变成严重的 parser/cache miss 工作负载。宏参数集会缓存，但高熵 tuple 几乎没有 warm hit。([Minecraft.net][20])

## 3.12 假定内部计算一定回写 NBT

很多有吸引力的数据只存在于运行时对象中：

* path nodes
* collision manifold
* light queue
* comparator cached output
* renderer decomposition
* AI sensor candidates

没有可读 NBT 就不能算 datapack backend。每个方案首先应测试“输出是否服务器端可序列化”。

## 3.13 用 NaN、Infinity、畸形 quaternion/SNBT 制造特殊运算

这类技巧高度依赖 codec、JOML、DataFixer 和异常处理，可能导致：

* command rejection
* entity 删除
* chunk 无法保存
* server crash
* 版本间行为变化

不应进入 public helper。

## 3.14 只统计源码行，隐藏 fork/扫描

以下都可能是“一条命令”但真实成本巨大：

```mcfunction
execute as @e run ...
clone 32768 blocks ...
execute if items entity @e container.* ...
execute as 10000 markers if predicate ...
```

必须同时统计 fork、候选扫描、方块数和 tick time。

## 3.15 用 command blocks/redstone 把命令移出 datapack 计数

这只是记账转移。若目标是服务器性能，不应把 command block 执行、block updates 和 redstone ticks 当作免费。

---
