<div align="center">

<img src="./logo.png" alt="RedScript Logo" width="64" />

<img src="https://img.shields.io/badge/RedScript-1.2.27-red?style=for-the-badge&logo=minecraft&logoColor=white" alt="RedScript" />

**一个编译到 Minecraft Datapack 的类型化脚本语言。**

写干净的游戏逻辑，把记分板的面条代码交给 RedScript 处理。

[![CI](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-918%20passing-brightgreen)](https://github.com/bkmashiro/redscript)
[![npm](https://img.shields.io/npm/v/redscript-mc?color=cb3837)](https://www.npmjs.com/package/redscript-mc)
[![npm downloads](https://img.shields.io/npm/dm/redscript-mc?color=cb3837)](https://www.npmjs.com/package/redscript-mc)
[![VSCode](https://img.shields.io/badge/VSCode-插件-007ACC?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=bkmashiro.redscript-vscode)
[![在线 IDE](https://img.shields.io/badge/试用-在线IDE-orange)](https://redscript-ide.pages.dev)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

[English](./README.md) · [快速开始](#快速开始) · [文档](https://redscript-docs.pages.dev) · [贡献指南](./CONTRIBUTING.md)

### 🚀 [在线试用 — 无需安装！](https://redscript-ide.pages.dev)

<img src="./demo.gif" alt="RedScript Demo" width="400" />

*↑ 每 tick 在玩家位置生成粒子 — 纯原版，无需 MOD！仅 30 行 RedScript，包含完整控制流：`if`、`foreach`、`@tick`、f-strings 等。*

</div>

---

### RedScript 是什么？

RedScript 是一门编译到原版 Minecraft 数据包的脚本语言。用变量、函数、循环、事件写代码，RedScript 帮你生成记分板命令和 `.mcfunction` 文件。

**上面的演示？** 只有 30 行：

```rs
let counter: int = 0;
let running: bool = false;

@tick fn demo_tick() {
    if (!running) { return; }
    counter = counter + 1;
    
    foreach (p in @a) at @s {
        particle("minecraft:end_rod", ~0, ~1, ~0, 0.5, 0.5, 0.5, 0.1, 5);
    }
    
    if (counter % 20 == 0) {
        say(f"已运行 {counter} ticks");
    }
}

@keep fn start() {
    running = true;
    counter = 0;
    say(f"Demo 已启动！");
}

@keep fn stop() {
    running = false;
    say(f"Demo 已停止，共运行 {counter} ticks。");
}
```

**你得到：**
- ✅ `let` / `const` 变量（告别 `scoreboard players set`）
- ✅ `if` / `else` / `for` / `foreach` 完整控制流
- ✅ `@tick` / `@load` / `@on(Event)` 装饰器
- ✅ `foreach (p in @a) at @s` — 遍历实体并设置执行上下文
- ✅ f-strings 如 `f"分数: {points}"` 动态输出
- ✅ 一个文件 → 可直接使用的 datapack

---

### v1.2.27 新增内容

- **BigInt 实机验证通过** (`bigint.mcrs`)：任意精度整数在 MC 记分板 + NBT 上完整运行 — base 10000 × 8 limbs = 最多 32 位十进制数；`bigint_fib(50)` = 12,586,269,025 在 Paper 1.21.4 实机验证正确
- **`storage_set_int` 宏修复**：动态 NBT 数组写入改用 `execute store result storage` 而非 `data modify set value $(n)` — 规避 Minecraft 宏机制对整数值的静默替换 bug
- **完整标准库** (`math.mcrs`、`vec.mcrs`、`advanced.mcrs`、`bigint.mcrs`、`showcase.mcrs`)：18 个数学函数、14 个向量几何函数、20+ 数论与分形函数
- **`module library;` pragma**：库文件零成本树摇 — 标准库永远不会撑大你的数据包
- **`@require_on_load(fn)` 装饰器**：sin/cos/atan 查找表初始化器的声明式加载依赖跟踪

### v1.2.26 新增内容

- **数学标准库** (`math.mcrs`)：18 个定点数函数 — `abs`、`sign`、`min`、`max`、`clamp`、`lerp`、`isqrt`、`sqrt_fixed`、`pow_int`、`gcd`、`lcm`、`sin_fixed`、`cos_fixed`、`map`、`ceil_div`、`log2_int`、`mulfix`、`divfix`、`smoothstep`、`smootherstep`
- **向量标准库** (`vec.mcrs`)：2D / 3D 几何 — 点积/叉积、`length2d_fixed`、`atan2_fixed`（二分搜索正切表，O(log 46)）、`normalize2d`、`rotate2d`、`lerp2d`、完整 3D 叉积
- **高级标准库** (`advanced.mcrs`)：数论（`fib`、`is_prime`、`collatz_steps`、`mod_pow`）、哈希/噪声（splitmix32 `hash_int`、`noise1d`）、曲线（`bezier_quad`）、分形（`mandelbrot_iter`、`julia_iter`）、几何实验
- **BigInt** (`bigint.mcrs`)：任意精度整数架构设计 — base 10000 × 8 limbs = 最多 32 位十进制数
- **编译器修复**：`isqrt` 大数收敛、优化器拷贝传播别名失效、跨函数变量命名冲突、MCRuntime 数组索引正则

### v1.2.25 新增内容

- `impl` 块与方法，支持围绕结构体构建面向对象风格 API
- `is` 类型收窄，实体判断更安全
- 使用 `@on(Event)` 的静态事件系统
- 面向运行时输出的 f-string
- `Timer::new(...)` 与实例方法组成的 Timer OOP API
- `setTimeout(...)` 与 `setInterval(...)` 调度辅助函数
- 优化器中的死代码消除
- 标准库新增 313 个 Minecraft 标签常量

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
  --no-optimize                禁用优化器
  --stats                      输出优化器统计信息

redscript repl                 启动交互式 REPL
redscript validate <file>      验证 MC 命令语法
```

---

### 标准库

所有标准库文件都使用 `module library;` —— 只有你实际调用的函数才会编译进去。

```rs
import "stdlib/math.mcrs"       // abs, sign, min, max, clamp, lerp, isqrt, sqrt_fixed,
                                // pow_int, gcd, lcm, sin_fixed, cos_fixed, map, ceil_div,
                                // log2_int, mulfix, divfix, smoothstep, smootherstep

import "stdlib/vec.mcrs"        // dot2d, cross2d, length2d_fixed, distance2d_fixed,
                                // manhattan, chebyshev, atan2_fixed, normalize2d_x/y,
                                // rotate2d_x/y, lerp2d_x/y, dot3d, cross3d_x/y/z,
                                // length3d_fixed

import "stdlib/advanced.mcrs"   // fib, is_prime, collatz_steps, digit_sum, reverse_int,
                                // mod_pow, hash_int, noise1d, bezier_quad,
                                // mandelbrot_iter, julia_iter, angle_between,
                                // clamp_circle_x/y, newton_sqrt, digital_root

import "stdlib/bigint.mcrs"     // bigint_init, bigint_from_int_a/b, bigint_add/sub/mul,
                                // bigint_compare, bigint_mul_small, bigint_fib
                                // — 最多 32 位十进制数，纯记分板运行

import "stdlib/player.mcrs"     // is_alive, in_range, get_health
import "stdlib/timer.mcrs"      // start_timer, tick_timer, has_elapsed
import "stdlib/cooldown.mcrs"   // set_cooldown, check_cooldown
import "stdlib/mobs.mcrs"       // ZOMBIE, SKELETON, CREEPER ... (60+ 实体常量)
```

**示例 — 游戏内计算斐波那契数列第 50 项：**

```rs
import "stdlib/bigint.mcrs"

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

#### v1.2.27（2026-03-14）

- **BigInt 实机修复**：`storage_set_int` 宏改用 `execute store result storage`，规避 MC 宏整数替换 bug；BigInt 在 Paper 1.21.4 实机验证通过
- showcase 示例修复：`atan2_fixed` 返回度数（0–360），更正不必要的除以 1000；`mod_pow` 测试改用小 modulus 避免 INT32 溢出

#### v1.2.26（2026-03-14）

- 完整的数学/向量/高级/BigInt 标准库（详见上方）
- `module library;` pragma，实现零成本树摇
- `storage_get_int` / `storage_set_int` 动态 NBT 数组内置函数
- 编译器修复：`isqrt` 收敛、拷贝传播、变量作用域命名

#### v1.2.25（2026-03-13）

- 实体类型层级与 `W_IMPOSSIBLE_AS` 警告
- 变量名混淆（`$a`、`$b`、`$c` ...），最小化记分板占用
- CI/CD 自动化：每次推送自动发布 npm + VSCode 插件

#### v1.2.0

- 新增 `impl` 块、实例方法与静态构造函数
- 新增 `is` 类型收窄，提升实体相关控制流的类型安全
- 新增 `@on(Event)` 静态事件与回调调度内置函数
- 新增运行时输出用 f-string
- 标准库补充 Timer OOP API 与 313 个 MC 标签常量
- 优化器支持死代码消除

完整发布说明见 [CHANGELOG.md](./CHANGELOG.md)。

---

<div align="center">

MIT License · Copyright © 2026 [bkmashiro](https://github.com/bkmashiro)

*少写一点，多做一些，更快交付。*

</div>
