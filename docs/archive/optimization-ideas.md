尽量按**你这种 C-like → IR → mcfunction** 的流水线来想，覆盖：

* 前端/中端优化
* 后端/发射优化
* 数据表示优化
* 控制流优化
* 工程层面的分析与 cost model

我不会只列教科书名字，也会写一点**在你这里具体意味着什么**。

---

# 一、编译目标无关的优化

这些优化原则上不依赖 Minecraft，换成别的后端也成立。

---

## A. 常量与表达式优化

### 1. 常量折叠（Constant Folding）

编译期直接算出来：

```c
x = 2 + 3 * 4
```

变成：

```c
x = 14
```

包括：

* 算术常量折叠
* 比较常量折叠
* 逻辑常量折叠
* 位运算常量折叠
* 类型转换常量折叠

---

### 2. 常量传播（Constant Propagation）

已知某变量是常量，就继续传播：

```c
a = 5
b = a + 2
```

变成：

```c
b = 7
```

---

### 3. 稀疏条件常量传播（SCCP）

同时做：

* 常量传播
* 死分支消除

例如：

```c
if (0) { ... } else { ... }
```

直接删掉前者。

---

### 4. 代数化简（Algebraic Simplification）

例如：

* `x + 0 -> x`
* `x - 0 -> x`
* `x * 1 -> x`
* `x * 0 -> 0`
* `x / 1 -> x`
* `!!x -> x!=0` 或规范形式
* `x == x -> true`（需注意 NaN/未定义语义之类，如果你语言有的话）

---

### 5. 强度削弱（Strength Reduction）

把贵操作变便宜操作，例如：

* `x * 2 -> x + x`
* `x << 1` 之类（如果 IR/语言支持位移）

不过这个要看后端成本模型，不一定总是更优。

---

### 6. 公共子表达式消除（CSE）

同一表达式重复算多次，提一次：

```c
t1 = a + b
t2 = a + b
```

变成复用 `t1`。

分：

* 局部 CSE
* 全局 CSE / GVN

---

### 7. 值编号（Value Numbering）

识别“虽然写法不同，但值等价”的表达式，用于支撑 CSE/GVN。

---

## B. 复制与赋值相关优化

### 8. 复制传播（Copy Propagation）

例如：

```c
a = b
c = a
```

变成：

```c
c = b
```

---

### 9. 冗余 move 消除

例如：

```c
a = b
b = a
```

或者 `x = x` 之类无意义 copy。

---

### 10. 目的地前推（Destination Forwarding）

例如：

```c
t = a + b
x = t
```

直接改成把结果写到 `x`。

这个虽然在你后端里特别有用，但原则上是目标无关的中端优化。

---

### 11. 临时变量消除

减少无意义 `tmp`：

* tmp 只用一次
* tmp 只是中转
* tmp 生命周期很短

---

## C. 死代码与可达性优化

### 12. 死代码消除（DCE）

删除结果没人用、且无副作用的指令。

---

### 13. 死存储消除（Dead Store Elimination）

某次写入后来在被读之前就被覆盖了，可以删。

---

### 14. 不可达代码消除（Unreachable Code Elimination）

删掉永远到不了的 block。

---

### 15. 死分支消除（Dead Branch Elimination）

条件恒定时，删掉一边分支。

---

### 16. 死函数消除

没被调用的函数不生成。

---

## D. 控制流图优化

### 17. 基本块合并（Block Merging）

一个块只跳到下一个，下一个也只有这一个前驱，那就并掉。

---

### 18. 跳转穿透 / 跳转线程化（Jump Threading）

例如：

```text
A -> B -> C
```

如果 B 只是跳转，可直接 A -> C。

---

### 19. 分支简化（Branch Simplification）

例如：

* 条件取反消掉多余 not
* `if cond goto L1 else goto L2` 规范化
* 两边都跳同一目标就变无条件跳转

---

### 20. 条件合并 / 条件规约

例如多个条件共享子条件，提出来。

---

### 21. 结构化控制流简化

例如把一些笨重的 CFG 重新变成更简单的：

* 单边 if
* 早返回
* guard 风格

---

### 22. 尾合并（Tail Merging）

多个 block 末尾有相同后缀，合并成共享尾部。

---

### 23. 尾调用优化（Tail Call Optimization）

如果你的语言/调用约定允许。

---

## E. 循环优化

这些比较经典，但你未必都需要。

### 24. 循环不变代码外提（LICM）

循环里每次都一样的东西拿到外面。

---

### 25. 循环强度削弱

例如归纳变量变换。

---

### 26. 归纳变量优化（Induction Variable Optimization）

识别 `i=i+1` 这种模式，减少冗余计算。

---

### 27. 循环展开（Loop Unrolling）

减少分支开销，但会增大代码体积。对 mc 这种目标常常不一定划算。

---

### 28. 循环旋转（Loop Rotation）

改变循环形状以便其他优化。

---

### 29. 循环删除

如果循环没有可观察副作用且结果没用。

---

## F. 过程间优化（IPO）

### 30. 函数内联（Inlining）

把小函数展开到调用点。

---

### 31. 参数常量化 / 专门化（Function Specialization）

若某调用点参数恒定，生成特化版本。

---

### 32. 过程间常量传播

跨函数传播常量。

---

### 33. 过程间死代码消除

内联/分析后删除不再需要的参数、返回值、函数。

---

### 34. 纯函数分析 / 副作用分析

标记：

* pure
* read-only
* write-only
* no-return
* deterministic

这会支撑很多优化。

---

## G. 数据流与表示层优化

### 35. SSA 化带来的优化

不是单个优化，但会极大简化：

* 常量传播
* DCE
* GVN
* copy coalescing

---

### 36. 活跃性分析（Liveness Analysis）

支撑：

* 临时复用
* 槽位复用
* 生命周期缩短

---

### 37. 区间分析 / 值域分析（Range Analysis）

知道变量可能范围后，可做：

* 条件简化
* 溢出检查消除
* 匹配范围更紧

---

### 38. 别名分析（Alias Analysis）

判断两个写入/读取会不会指向同一存储位置。

在抽象语言层是通用优化关键基础。

---

### 39. 逃逸分析（Escape Analysis）

某对象/变量是否逃出当前作用域，可决定是否需要更“重”的表示。

---

### 40. 冗余加载消除

已知值没变，不必再 load。

---

### 41. 冗余比较消除

同一条件已经比较过且中间未破坏，可复用结论。

---

## H. 代码尺寸与布局优化

### 42. 代码尺寸优化

在多个等价方案中选更短的 IR / 更少指令。

---

### 43. 热路径优化 / 冷路径下沉

如果你有 profiling 或启发式，可把常走路径做得更短。

---

### 44. 块布局优化（Block Layout）

让常见 fallthrough 更自然，减少跳转。

---

### 45. 函数布局优化

把经常一起调用的放近一些。
对文本后端意义没那么大，但仍可用于组织输出和减少间接结构。

---

## I. 前端层面的规范化

这些不一定叫“优化”，但很值钱。

### 46. 语法糖消除

* `for -> while`
* `a += b -> a = a + b`
* `?:` 展开
* 短路逻辑显式化

---

### 47. 表达式规范化

把复杂嵌套表达式拆成统一格式，便于后续优化。

---

### 48. 布尔规范化

统一布尔值/条件表示方式，避免后端到处特判。

---

### 49. ANF / 三地址化

将复杂表达式变成一串简单绑定，便于分析。

---

---

# 二、编译目标有关的优化

这里说的是**与 Minecraft 命令系统 / scoreboard / NBT / execute / function 调用模型有关**的优化。
这些往往才是你项目里**最有收益**的部分。

---

## A. scoreboard 相关优化

### 1. scoreboard 槽位复用

不同变量生命周期不重叠时，复用同一个 player/objective 槽。

这是你的“寄存器分配”对应物。

---

### 2. scoreboard 临时变量消除

例如：

```text
t = a
t += b
x = t
```

直接：

```text
x = a
x += b
```

---

### 3. scoreboard copy coalescing

尽量让逻辑变量映射到同一物理槽，减少 `operation =` 拷贝。

---

### 4. 立即数物化优化

有些常量是否值得：

* 直接写死
* 用预存常量槽
* 用某种 shared constant table

取决于命令成本。

---

### 5. scoreboard 读后写 / 写后写消除

例如某个槽刚被写，后面覆盖前没有读，前写可删。

虽然本质像 dead store，但这里是对 scoreboard 物理资源层做的。

---

### 6. scoreboard 运算形式选择

例如实现 `x += 1` 时到底用：

* `players add`
* 还是通过某个常量槽 `operation +=`

要看支持的操作和命令数。

---

### 7. scoreboard objective 组织优化

* 合并 objective
* 分离热/冷 objective
* 命名策略
* 初始化策略

有时影响指令复杂度和管理复杂度。

---

### 8. scoreboard 生命周期缩短

尽量早释放槽，给复用创造机会。

---

## B. execute 上下文优化

### 9. execute 链合并

多条拥有相同上下文的命令合并：

```mcfunction
execute as ... at ... run cmd1
execute as ... at ... run cmd2
```

可变成一次 `run function` 或更紧凑布局。

---

### 10. execute context hoisting

把公共前缀提到外面：

```mcfunction
execute as A at @s run ...
execute as A at @s run ...
```

提成：

```mcfunction
execute as A at @s run function ...
```

---

### 11. execute context sinking

反过来，有时不要过度 hoist。若共享体太短、额外 function call 更贵，则下沉更优。

所以这是个 cost-model 问题。

---

### 12. execute 前缀共享

例如：

* 两条命令共享 `as @e[tag=x] at @s`
* 一条额外多了 `if score ...`

则可以组织成前缀树风格，减少重复。

---

### 13. 嵌套 execute 扁平化

减少层层生成的 execute 包装。

---

### 14. execute 排序优化

对命令重新排序，使能共享更多上下文前缀。
前提是副作用和依赖允许。

---

### 15. 上下文等价分析

识别两个看似不同、其实等价的 context，支撑合并。

---

### 16. 无效上下文变换消除

例如：

* 重复 `as @s`
* 无意义 `at @s`
* 重复 positioned / rotated 等同设置

---

## C. 条件与分支 lowering 优化

### 17. `if/else` 到 execute guard 的选择优化

同样的高层分支，可以 lower 成：

* 两个分支函数
* 一个 guard 执行 then，else 单独处理
* 条件写值再统一 merge

要选命令数更少/热路径更短的形式。

---

### 18. 条件链合并

多个语句有同样条件：

```mcfunction
execute if score X matches 1 run cmd1
execute if score X matches 1 run cmd2
```

提成共享 guard block/function。

---

### 19. 条件取反与规范化

选择更短、更自然的：

* `if`
* `unless`
* matches 某区间
* 用比较结果槽
* 直接比较两 score

---

### 20. 分支消解成条件执行

某些小分支不值得真的拆 block / function，直接变成 guarded commands。

---

### 21. merge 点消除

高层 CFG 的 merge 若只为了拼值，可以改成直接在各分支写最终位置。

---

### 22. 范围匹配优化

`matches 0..0`、`matches 1..` 等范围表达选择更合适写法。

---

## D. function / mcfunction 组织优化

### 23. 小函数内联

如果一次 `function` 调用开销/文本冗余不划算，就直接内联。

---

### 24. 重复片段 outline

反过来，多个地方重复相同命令序列时，抽成函数复用。

这在 mc 里不是传统编译器常见优化，但非常实际。

---

### 25. function 边界调整

选择哪些 block 真正成为独立 mcfunction，哪些留在同文件/同逻辑块。

---

### 26. 热路径内联，冷路径抽取

常走路径减少 function call，冷路径抽出去减体积。

---

### 27. 调用图裁剪

没必要暴露/生成的辅助函数不输出。

---

### 28. trampoline / jump-only function 消除

有些函数只是立即调用另一个函数或只有一条跳转，直接消掉。

---

## E. NBT / storage / 数据载体选择优化

### 29. 变量放 scoreboard 还是 NBT

这是很大的后端优化点。根据变量用途选择：

* 高频算术 -> scoreboard
* 结构化数据 -> storage/NBT
* 持久化/跨 tick -> storage/NBT
* 临时值 -> scoreboard

---

### 30. NBT 读写缓存

如果某个 NBT 值反复参与计算，可先读到 scoreboard 临时，再批量用。

---

### 31. 冗余 NBT load/store 消除

连续多次读同一路径、中间无改动，可复用；
写后又被覆盖，前写可删。

---

### 32. 批量 NBT 访问优化

若多次访问同一个 compound/list 附近路径，考虑重组表示或合并操作。

---

### 33. NBT 路径规范化

减少路径层级、统一访问形式，便于匹配与优化。

---

### 34. 数据布局优化

例如某个数组/结构到底怎么放：

* list
* int array
* object/compound
* 多个平行字段

不同布局会极大影响命令复杂度。

---

### 35. 热数据 / 冷数据分离

高频访问的变量不要都塞进深层 NBT。

---

## F. selector / entity 查询优化

### 36. selector 查询去重

同一 tick / 同一 block 里相同 selector 不要重复逻辑构造或重复包装。

---

### 37. selector 结果缓存

若语义允许，把结果绑定到上下文或标记，减少反复筛选。

---

### 38. selector 收窄

让 selector 更具体，减少扫描成本和误匹配风险。

---

### 39. 查询顺序优化

先用便宜条件筛，再做贵条件。

虽然 Minecraft 具体实现细节不是完全公开优化接口，但结构上还是成立。

---

### 40. `@s` 上下文化

如果已经在 `as` 某实体上下文中，就尽量用 `@s` 而不是重新 selector。

---

## G. 命令级 peephole 优化

### 41. 相邻命令合并

例如两条连续操作可改写为更短序列。

---

### 42. 无效命令消除

例如产生了 no-op：

* 加 0
* 复制给自己
* 条件恒真/恒假 guarding 的残留

---

### 43. 命令顺序微调

为了减少临时槽、共享 context 或避免多余 copy，对相邻命令重排。

---

### 44. 原语选择优化

某个语义用多种命令都能实现时，选更便宜的那个。

---

### 45. 文本层重复前缀压缩

虽然不是运行时优化，但能减少产物冗余和维护成本。

---

## H. Tick / 调度模型相关优化

### 46. 热路径每 tick 命令数优化

对每 tick 运行的函数特别 aggressive 地压命令数。

---

### 47. 冷路径延迟求值

不常用逻辑不要提前算。

---

### 48. 多 tick 拆分

如果某逻辑可以分摊到多个 tick，减少单 tick 峰值成本。

这已经有点接近调度优化，不只是传统编译优化了。

---

### 49. 增量更新

某状态没变就不重复计算/写回。

---

### 50. 事件驱动替代轮询

能在状态变化时触发，就不要每 tick 扫。

这个很目标相关，而且往往收益巨大。

---

## I. 目标特有的控制流表示优化

### 51. CFG 到 function graph 的划分优化

Minecraft 没有原生 jump，只有 function 调用和条件执行。
所以你怎么把 CFG 切成 function graph，本身就是大优化点。

---

### 52. “真假分支”布局选择

对于：

```c
if (cond) A else B
```

到底：

* then inline, else function
* else inline, then function
* 两边都 function
* guard 一个块另一个 fallthrough

要看热度与大小。

---

### 53. 早退出（early exit）风格生成

把复杂嵌套分支改为多个 guard-return 风格，有时更适合 mcfunction。

---

### 54. 状态机化优化

复杂控制流可编译成显式状态机，但状态机本身也可再优化：

* 合并状态
* 删除空状态
* 热状态收紧

---

## J. 资源命名与产物组织优化

### 55. 文件拆分策略优化

文件过大不好管，过碎调用多。需要平衡。

---

### 56. 名称池化 / 常量池化

统一临时名、目标名、常量槽等，减少管理成本。

---

### 57. 初始化代码最小化

objectives、storage、常量表初始化尽量只做一次、只做必要内容。

---

---

# 三、很值得单独列出来的“分析”

这些不是直接优化，但没它们很多优化做不好。

---

## 编译目标无关分析

* use-def / def-use
* 活跃性分析
* 到达定义
* 常量分析
* 值域分析
* 别名分析
* 副作用分析
* 纯函数分析
* CFG 分析
* dominator / post-dominator
* loop analysis
* call graph analysis

---

## 编译目标有关分析

* execute context 等价/包含分析
* scoreboard 槽生命周期分析
* storage path alias 分析
* selector 成本/重复分析
* tick 热度分析
* function call 成本分析
* 条件 lowering 成本分析
* 数据载体选择分析（scoreboard vs NBT）
* 命令数与热路径 cost model

---

# 四、如果按“最值得先做”的优先级排

如果你现在真在做这个编译器，我会建议你优先做这些。

---

## 先做：目标无关

1. 常量折叠
2. 常量传播
3. copy propagation
4. DCE
5. block merge
6. branch simplification
7. 小函数内联
8. 活跃性分析
9. destination forwarding
10. 临时变量消除

---

## 先做：目标有关

1. scoreboard 临时消除
2. scoreboard 槽位复用
3. execute 链合并
4. 条件 guard 合并
5. function 边界优化
6. scoreboard / NBT 载体选择
7. 冗余 NBT load/store 消除
8. selector/context 复用
9. 热路径命令数优化
10. peephole

---

# 五、哪些“看起来很经典”，但你未必该急着做

这些不是没用，而是对你当前项目可能性价比不高：

* 完整 GVN/PRE
* 很重的循环优化体系
* 完整 SSA-based global optimizer
* 特别复杂的 interprocedural alias analysis
* 自动 profile-guided optimization
* 超复杂 instruction scheduling

因为你的目标不是 CPU，很多收益不如目标特化优化直接。

---

# 六、一个更实用的归纳

你其实可以把所有优化再抽成两句话：

## 目标无关优化，本质上是在做：

* 少算
* 不重复算
* 不存没用的值
* 不走没必要的控制流
* 更晚丢信息

## 目标有关优化，本质上是在做：

* 少发命令
* 少切 execute 上下文
* 少分 function
* 少碰昂贵载体（NBT / selector / 深层 context）
* 把值放到最适合 Minecraft 的地方