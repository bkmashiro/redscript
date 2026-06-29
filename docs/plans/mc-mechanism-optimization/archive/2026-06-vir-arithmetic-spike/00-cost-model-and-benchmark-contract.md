# Cost Model and Benchmark Contract

下面把“少命令”区分成两个目标：

* **代码生成成本**：实际发出的命令行数 `L`。
* **服务器真实成本**：fork 数 `F`、扫描实体/槽位/方块数 `Q`、NBT 读回数 `R`、延迟 tick 数 `T`、常驻状态 `S`、版本/配置风险 `V`。

例如：

```mcfunction
execute as @e[tag=lane] run function alu:step
```

虽然 `L=1`，但若有 1,000 个 lane，实际是 `F≈1000`。因此建议 benchmark 同时记录：

```text
C = (L, F, Q, R, T, S, V, tick_time_ns)
```

下面命令数量默认不含一次性初始化，也不含调用者把输入搬入对应表示的成本。代码是伪 mcfunction；slot 名、item modifier schema、enchantment schema 应按具体 pack format 生成适配版本。

“高确定性”表示底层机制明确存在，不表示我已经在你的目标 Vanilla/Paper build 上验证了所有舍入、同 tick 刷新和成本细节。Display 接受任意仿射矩阵并以分解形式保存；宏函数会根据参数重解析并缓存；`execute if items` 可直接返回所有匹配栈的物品总数；1.21 的 Level-Based Value 已包含 linear、clamped、fraction、levels_squared、lookup，1.21.11 又增加了 exponent。([Minecraft.net][1])

---
