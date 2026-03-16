<div align="center">

<img src="./logo.png" alt="RedScript Logo" width="64" />

<img src="https://img.shields.io/badge/RedScript-2.1.1-red?style=for-the-badge&logo=minecraft&logoColor=white" alt="RedScript" />

**一个编译到 Minecraft Datapack 的类型化脚本语言。**

写干净的游戏逻辑，把记分板的面条代码交给 RedScript 处理。

[![CI](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-1123%20passing-brightgreen)](https://github.com/bkmashiro/redscript)
[![npm](https://img.shields.io/npm/v/redscript-mc?color=cb3837)](https://www.npmjs.com/package/redscript-mc)
[![npm downloads](https://img.shields.io/npm/dm/redscript-mc?color=cb3837)](https://www.npmjs.com/package/redscript-mc)
[![VSCode](https://img.shields.io/badge/VSCode-插件-007ACC?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=bkmashiro.redscript-vscode)
[![在线 IDE](https://img.shields.io/badge/试用-在线IDE-orange)](https://redscript-ide.pages.dev)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

[English](./README.md) · [快速开始](#快速开始) · [文档](https://redscript-docs.pages.dev) · [贡献指南](./CONTRIBUTING.md)

### 🚀 [在线试用 — 无需安装！](https://redscript-ide.pages.dev)

<img src="./demo.gif" alt="RedScript Demo — 用粒子在 Minecraft 中绘制数学曲线" width="520" />

*↑ 五条数学函数图像实时粒子渲染 — 纯原版，无需 MOD！*
*`y = x·sin(x)` · `y = sin(x) + ½sin(2x)` · `y = e⁻ˣsin(4x)` · `y = tanh(2x)` · 玫瑰曲线 `r = cos(2θ)`*
*每条曲线由 RedScript 定点数学库逐 tick 计算，64 个采样点动态绘制。*

</div>

---

### RedScript 是什么？

RedScript 是一门编译到原版 Minecraft 数据包的脚本语言。用变量、函数、循环、事件写代码，RedScript 帮你生成记分板命令和 `.mcfunction` 文件。

**上面的演示？** 五条数学曲线，每条 64 个采样点，核心逻辑：

```rs
import "stdlib/math"

let phase: int = 0;
let frame: int = 0;

// 5 条曲线每 128 tick (~6.5 秒) 自动切换
@tick fn _wave_tick() {
    phase = (phase + 4) % 360;
    frame = frame + 1;

    let curve_id: int = (frame / 128) % 5;

    // 计算 9 列的 sin 值（每列相差 40°，刚好覆盖完整周期）
    let s0: int = sin_fixed((phase +   0) % 360);
    let s1: int = sin_fixed((phase +  40) % 360);
    // ... s2 到 s8 ...

    // 绘制图像：每条曲线有 64 个固定坐标粒子，每 tick 全部重绘
    if (curve_id == 0) { _draw_xsinx(); }
    if (curve_id == 1) { _draw_harmonic(); }
    // ...

    actionbar(@a, f"§e  y = x·sin(x)   phase: {phase}°  center: {s0}‰");
}
```

**你得到：**
- ✅ `let` / `const` 变量（告别 `scoreboard players set`）
- ✅ `if` / `else` / `for` / `foreach` / `break` / `continue` 完整控制流
- ✅ `@tick` / `@load` / `@on(Event)` 装饰器
- ✅ `foreach (p in @a) at @s` — 遍历实体并设置执行上下文
- ✅ f-strings 如 `f"分数: {points}"` 动态输出
- ✅ `enum` 类型 + `match` 分发（零运行时开销）
- ✅ 多返回值：`fn divmod(a: int, b: int): (int, int)`
- ✅ 泛型：`fn max<T>(a: T, b: T): T`（单态化）
- ✅ `Option<T>` 空值安全：`Some(x)` / `None` / `if let Some(x) = opt`
- ✅ `@coroutine(batch=N)` 将循环分散到多个 tick（不再触发 maxCommandChain 限制）
- ✅ `@schedule(ticks=N)` 延迟执行函数
- ✅ 模块系统：`module math; import math::sin;`
- ✅ 多版本目标：`--mc-version 1.20.2`
- ✅ 源码映射：`--source-map` 支持调试
- ✅ 语言服务协议（LSP）：诊断、悬停提示、跳转定义、代码补全
- ✅ 一个文件 → 可直接使用的 datapack

---

### v2.1.x 新增内容

- **`enum` + `match` 分发** — 零运行时开销的状态机；编译器将枚举变体折叠为整数常量，用 `execute if score` 分发，无堆分配
- **多返回值** — `fn divmod(a: int, b: int): (int, int)` 解包到独立记分板槽位，不需要结构体包装
- **泛型** — `fn max<T>(a: T, b: T): T` 在编译期完整单态化，无装箱无间接引用
- **`Option<T>` 空值安全** — `Some(x)` / `None` 与 `if let Some(x) = opt` 模式绑定，不再依赖哨兵整数
- **`@coroutine(batch=N)`** — 将繁重循环分散到多个 tick（`batch=50` 表示每 tick 执行 50 次迭代），避免触发 `maxCommandChainLength` 限制
- **`@schedule(ticks=N)`** — 延迟 N 个游戏 tick 后执行函数，编译为带自动命名空间前缀的 `schedule function`
- **模块系统** — `module math;` 声明命名模块；调用方 `import math::sin` 可按符号树摇
- **多版本目标** — `--mc-version 1.20.2` 针对目标服务器版本切换发射策略（宏子函数 vs 传统记分板）
- **源码映射** — `--source-map` 生成 `.mcrs.map` 附属文件，将每行 `.mcfunction` 映射回原始源码，支持编辑器内调试
- **LSP 悬停 + 补全** — 50+ 内置函数及所有装饰器（`@tick`/`@load`/`@coroutine`/`@schedule`/`@on_trigger`）均支持悬停内联文档

---

### 快速开始

#### 方式 1：在线 IDE（无需安装）

**[→ redscript-ide.pages.dev](https://redscript-ide.pages.dev)** — 写代码，实时看输出。

#### 方式 2：VSCode 插件

1. 安装 [RedScript for VSCode](https://marketplace.visualstudio.com/items?itemName=bkmashiro.redscript-vscode)
2. 获得语法高亮、自动补全、悬停文档等功能

#### 方式 3：命令行

```mcrs
struct Timer { _id: int; duration: int; }

impl Timer {
    fn new(duration: int): Timer {
        return Timer { _id: 0, duration: duration };
    }
    fn done(self): bool { return true; }
}

@on(PlayerJoin)
fn welcome(player: Player) {
    say(f"Welcome {player}!");
}

@tick fn game_loop() {
    let timer = Timer::new(100);
    setTimeout(200, () => { say("Delayed!"); });
}
```

```bash
npm install -g redscript-mc
redscript compile game.mcrs -o ./my-datapack
```

#### 部署

把输出文件夹丢进存档的 `datapacks/` 目录，游戏内跑 `/reload`，完成。

---

### 语言特性

#### 变量与类型

```rs
let x: int = 42;
let name: string = "Steve";
let spawn: BlockPos = (0, 64, 0);
let nearby: BlockPos = (~5, ~0, ~5);   // 相对坐标
const MAX: int = 100;                  // 编译期常量
```

#### MC 名称（Objective / Tag / Team）

用 `#name` 表示 Minecraft 标识符，不需要引号：

```rs
// Objective、fake player、tag、team 名都不用引号
let hp: int = scoreboard_get(@s, #health);
scoreboard_set(#game, #timer, 300);      // fake player #game，objective timer
tag_add(@s, #hasKey);
team_join(#red, @s);
gamerule(#keepInventory, true);

// 字符串仍然兼容（向后兼容）
scoreboard_get(@s, "health")             // 和 #health 编译结果相同
```

#### 函数与默认参数

```rs
fn greet(player: selector, msg: string = "欢迎！") {
    tell(player, msg);
}

greet(@s);              // 使用默认消息
greet(@a, "你好！");    // 覆盖默认值
```

#### 装饰器

```rs
@tick                  // 每 tick 执行
fn heartbeat() { ... }

@tick(rate=20)         // 每秒执行一次
fn every_second() { ... }

@on_advancement("story/mine_diamond")
fn on_diamond() {
    give(@s, "minecraft:diamond", 5);
}

@on_death
fn on_death() {
    scoreboard_add(@s, #deaths, 1);
}
```

#### 控制流

```rs
if (hp <= 0) {
    respawn();
} else if (hp < 5) {
    warn_player();
}

for (let i: int = 0; i < 10; i = i + 1) {
    say(f"生成第 {i} 波");
    summon("minecraft:zombie", ~0, ~0, ~0);
}

foreach (player in @a) {
    heal(player, 2);
}
```

#### 结构体与枚举

```rs
enum Phase { Lobby, Playing, Ended }

struct Player {
    score: int,
    alive: bool,
}

match (phase) {
    Phase::Lobby   => { announce("等待玩家..."); }
    Phase::Playing => { every_second(); }
    Phase::Ended   => { show_scoreboard(); }
}
```

#### Lambda

```rs
fn apply(f: (int) -> int, x: int) -> int {
    return f(x);
}

let double = (x: int) -> int { return x * 2; };
apply(double, 5);  // 10
```

#### 数组

```rs
let scores: int[] = [];
push(scores, 42);

foreach (s in scores) {
    announce("得分：${s}");
}
```

---

### CLI 参考

```
redscript compile <file>       编译为 datapack（默认）或 structure
  -o, --output <dir>           输出目录              [默认: ./out]
  --target datapack|structure  输出格式              [默认: datapack]
  --namespace <ns>             Datapack 命名空间     [默认: 文件名]
  --mc-version <ver>           目标 MC 版本          [默认: 1.21]
  --include <dir>              额外库搜索路径（可重复）
  --source-map                 生成 .mcrs.map 源码映射文件
  --no-optimize                禁用优化器
  --stats                      输出优化器统计信息

redscript repl                 启动交互式 REPL
redscript validate <file>      验证 MC 命令语法
```

---

### 标准库

RedScript 内置标准库，使用短路径直接导入，无需指定完整文件路径：

```rs
import "stdlib/math"      // 定点数学
import "stdlib/vec"       // 2D/3D 向量几何
import "stdlib/combat"    // 伤害、击杀检测辅助函数
import "stdlib/player"    // 血量、存活检测、范围判断
import "stdlib/cooldown"  // 每玩家冷却时间管理
```

通过 `--include <dir>` 可添加自定义库路径，自有模块也能用同样的短路径导入。

所有标准库文件都使用 `module library;` —— 只有你实际调用的函数才会编译进去。

```rs
import "stdlib/math"            // abs, sign, min, max, clamp, lerp, isqrt, sqrt_fixed,
                                // pow_int, gcd, lcm, sin_fixed, cos_fixed, map, ceil_div,
                                // log2_int, mulfix, divfix, smoothstep, smootherstep

import "stdlib/vec"             // dot2d, cross2d, length2d_fixed, distance2d_fixed,
                                // manhattan, chebyshev, atan2_fixed, normalize2d_x/y,
                                // rotate2d_x/y, lerp2d_x/y, dot3d, cross3d_x/y/z,
                                // length3d_fixed

import "stdlib/advanced"        // fib, is_prime, collatz_steps, digit_sum, reverse_int,
                                // mod_pow, hash_int, noise1d, bezier_quad,
                                // mandelbrot_iter, julia_iter, angle_between,
                                // clamp_circle_x/y, newton_sqrt, digital_root

import "stdlib/bigint"          // bigint_init, bigint_from_int_a/b, bigint_add/sub/mul,
                                // bigint_compare, bigint_mul_small, bigint_fib
                                // — 最多 32 位十进制数，纯记分板运行

import "stdlib/player"     // is_alive, in_range, get_health
import "stdlib/timer"      // start_timer, tick_timer, has_elapsed
import "stdlib/cooldown"   // set_cooldown, check_cooldown
import "stdlib/mobs"       // ZOMBIE, SKELETON, CREEPER ... (60+ 实体常量)
```

**示例 — 游戏内计算斐波那契数列第 50 项：**

```rs
import "stdlib/bigint"

fn show_fib() {
    bigint_fib(50);
    // F(50) = 12,586,269,025 — 超过 int32，分 3 个 limb 存储：
    let l0: int = bigint_get_a(0);  // 9025
    let l1: int = bigint_get_a(1);  // 8626
    let l2: int = bigint_get_a(2);  // 125
    say(f"F(50) limbs: {l2} {l1} {l0}");
}
```

---

### 更多文档

| | |
|---|---|
| 📖 [语言参考](docs/LANGUAGE_REFERENCE.md) | 完整语法与类型系统 |
| 🔧 [内置函数](https://redscript-docs.pages.dev/Builtins) | 所有 34+ MC 内置函数 |
| ⚡ [优化器](https://redscript-docs.pages.dev/Optimizer) | 各优化 Pass 说明 |
| 🧱 [结构体目标](docs/STRUCTURE_TARGET.md) | 编译到 NBT 命令方块结构体 |
| 🧪 [集成测试](https://redscript-docs.pages.dev/Integration-Testing) | 在真实 Paper 服务器上测试 |
| 🏗 [实现指南](docs/IMPLEMENTATION_GUIDE.md) | 编译器内部原理 |

---

### 更新日志亮点

#### v2.1.1（2026-03-16）

- stdlib 包含路径支持：`import "stdlib/math"` 无需指定完整路径
- `--include <dir>` CLI 参数，支持自定义库路径
- LSP 悬停支持 50+ 内置函数及全部装饰器
- VSCode 插件支持 f-string 语法高亮

#### v2.0.0

- 新编译器管线：**AST → HIR → MIR → LIR → emit**
- 新 LIR 优化器（死槽位消除 + 常量立即数折叠）
- CLI `compile` 默认使用 v2 管线
- 完整 `use "..."` 导入解析（含库模块）
- 宏调用（`^var`/`~var`）在 v2 发射器中端到端支持
- v2 中完成结构体/impl 降级（字段槽位 + 方法分发）

完整发布说明见 [CHANGELOG.md](./CHANGELOG.md)。

---

<div align="center">

MIT License · Copyright © 2026 [bkmashiro](https://github.com/bkmashiro)

*少写一点，多做一些，更快交付。*

</div>
