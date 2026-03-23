<div align="center">

<img src="./logo.png" alt="RedScript Logo" width="64" />

<img src="https://img.shields.io/badge/RedScript-2.6.1-red?style=for-the-badge&logo=minecraft&logoColor=white" alt="RedScript" />

**一个编译为 Minecraft datapacks 的类型化脚本语言。**

编写干净的游戏逻辑。RedScript 负责处理 scoreboard 的 spaghetti。

[![CI](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-1901%20passing-brightgreen)](https://github.com/bkmashiro/redscript)
[![npm](https://img.shields.io/npm/v/redscript-mc?color=cb3837)](https://www.npmjs.com/package/redscript-mc)
[![npm downloads](https://img.shields.io/npm/dm/redscript-mc?color=cb3837)](https://www.npmjs.com/package/redscript-mc)
[![VSCode](https://img.shields.io/badge/VSCode-Extension-007ACC?logo=visualstudiocode)](https://marketplace.visualstudio.com/items?itemName=bkmashiro.redscript-vscode)
[![Online IDE](https://img.shields.io/badge/Try-Online%20IDE-orange)](https://redscript-ide.pages.dev)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

[English](./README.md) · [快速开始](#快速开始) · [文档](https://redscript-docs.pages.dev) · [贡献](./CONTRIBUTING.md)

### 🚀 [在线试用，无需安装](https://redscript-ide.pages.dev)

<img src="./demo.gif" alt="RedScript Demo — 在 Minecraft 中用粒子绘制数学曲线" width="520" />

*↑ 五条数学曲线以粒子实时渲染，100% 原版，无需 mod！*
*`y = x·sin(x)` · `y = sin(x) + ½sin(2x)` · `y = e⁻ˣsin(4x)` · `y = tanh(2x)` · `r = cos(2θ)` 玫瑰线*
*每条曲线都由 RedScript 的 fixed-point math stdlib 逐 tick 计算。*

</div>

---

### 什么是 RedScript？

RedScript 是一种会编译为原版 Minecraft datapacks 的类型化脚本语言。你可以用变量、函数、循环和事件编写清晰的代码，RedScript 会替你处理 scoreboard 命令和 `.mcfunction` 文件。

**上面的演示是什么？** 五条数学曲线，每条各有 64 个采样点。核心逻辑如下：

```rs
import "stdlib/math"

let phase: int = 0;
let frame: int = 0;

// 5 curves cycle every 128 ticks (~6.5 s each)
@tick fn _wave_tick() {
    phase = (phase + 4) % 360;
    frame = frame + 1;

    let curve_id: int = (frame / 128) % 5;

    // Compute sin at 9 column offsets (40° apart = full sine wave span)
    let s0: int = sin_fixed((phase +   0) % 360);
    let s1: int = sin_fixed((phase +  40) % 360);
    // ... s2 through s8 ...

    // Draw bar chart: each column height = sin value
    // (64 fixed particle positions per curve, all respawned each tick)
    if (curve_id == 0) { _draw_xsinx(); }
    if (curve_id == 1) { _draw_harmonic(); }
    // ...

    actionbar(@a, f"§e  y = x·sin(x)   phase: {phase}°  center: {s0}‰");
}
```

**你将获得：**
- ✅ `let` / `const` 变量（不用再写 `scoreboard players set`）
- ✅ `if` / `else` / `for` / `foreach` / `break` / `continue` 控制流
- ✅ `@tick` / `@load` / `@on(Event)` decorators
- ✅ `foreach (p in @a) at @s positioned ~ ~1 ~` 以及完整的 `execute` subcommand 支持
- ✅ 支持 `70..79` 这类范围模式的 `match`
- ✅ Builtins 在任意参数位置都接受 runtime macro variables
- ✅ 像 `f"Score: {points}"` 这样的 f-strings 用于动态输出
- ✅ public functions 会自动保留；`_privateFn()` 会保持 private
- ✅ `enum` 类型配合 `match` dispatch（零 runtime 开销）
- ✅ 多返回值：`fn divmod(a: int, b: int): (int, int)`
- ✅ Generics：`fn max<T>(a: T, b: T): T`（monomorphized）
- ✅ `Option<T>` 空值安全：`Some(x)` / `None` / `if let Some(x) = opt`
- ✅ `@coroutine(batch=N)` 用于把循环分摊到多个 tick（不用再担心 maxCommandChain）
- ✅ `@schedule(ticks=N)` 用于延迟函数执行
- ✅ 模块系统：`module math; import math::sin;`
- ✅ 多版本目标：`--mc-version 1.20.2`
- ✅ Source maps：`--source-map` 方便调试
- ✅ Language Server Protocol：diagnostics、hover、go-to-def、completion
- ✅ 一个文件直接编译成可用的 datapack

---

### 快速开始

#### 方式 1：Online IDE（无需安装）

**[→ redscript-ide.pages.dev](https://redscript-ide.pages.dev)** 直接写代码，立刻看输出。

#### 方式 2：VSCode Extension

1. 安装 [RedScript for VSCode](https://marketplace.visualstudio.com/items?itemName=bkmashiro.redscript-vscode)
2. 获得语法高亮、自动补全、hover docs 等功能

#### 方式 3：CLI

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

把输出目录放进世界存档的 `datapacks/` 目录，然后运行 `/reload`。完成。

---

### 语言

#### Variables & Types

```rs
let x: int = 42;
let name: string = "Steve";
let spawn: BlockPos = (0, 64, 0);
let nearby: BlockPos = (~5, ~0, ~5);   // relative coords
const MAX: int = 100;                  // compile-time constant
```

#### MC Names（Objectives、Tags、Teams）

用 `#name` 表示 Minecraft 标识符，不需要引号：

```rs
// Objectives, fake players, tags, teams — write without quotes
let hp: int = scoreboard_get(@s, #health);
scoreboard_set(#game, #timer, 300);     // fake player #game, objective timer
tag_add(@s, #hasKey);
team_join(#red, @s);
gamerule(#keepInventory, true);

// String literals still work (backward compatible)
scoreboard_get(@s, "health")            // same output as #health
```

#### Functions & Defaults

```rs
fn greet(player: selector, msg: string = "Welcome!") {
    tell(player, msg);
}

greet(@s);              // uses default message
greet(@a, "Hello!");    // override
```

#### Decorators

```rs
@tick                  // every tick
fn heartbeat() { ... }

@tick(rate=20)         // every second
fn every_second() { ... }

@on_advancement("story/mine_diamond")
fn on_diamond() {
    give(@s, "minecraft:diamond", 5);
}

@on_death
fn on_death() {
    scoreboard_add(@s, #deaths, 1);
}

// Delay execution by N ticks (20t = 1 second)
@schedule(ticks=20)
fn after_one_second(): void {
    title(@a, "One second later!");
}

// Spread a heavy loop across multiple ticks (batch=N iterations/tick)
@coroutine(batch=50, onDone=all_done)
fn process_all(): void {
    let i: int = 0;
    while (i < 1000) {
        // work spread over ~20 ticks instead of lagging one tick
        i = i + 1;
    }
}
```

#### Control Flow

```rs
if (hp <= 0) {
    respawn();
} else if (hp < 5) {
    warn_player();
}

for (let i: int = 0; i < 10; i = i + 1) {
    say(f"Spawning wave {i}");
    summon("minecraft:zombie", ~0, ~0, ~0);
}

foreach (player in @a) {
    heal(player, 2);
}
```

#### Structs & Enums

```rs
enum Phase { Lobby, Playing, Ended }

struct Player {
    score: int,
    alive: bool,
}

match (phase) {
    Phase::Lobby   => { announce("Waiting..."); }
    Phase::Playing => { every_second(); }
    Phase::Ended   => { show_scoreboard(); }
}
```

#### Lambdas

```rs
fn apply(f: (int) -> int, x: int) -> int {
    return f(x);
}

let double = (x: int) -> int { return x * 2; };
apply(double, 5);  // 10
```

#### Arrays

```rs
let scores: int[] = [];
push(scores, 42);

foreach (s in scores) {
    announce(f"Score: {s}");
}
```

---

### CLI Reference

```
redscript compile <file>       Compile to datapack (default) or structure
  -o, --output <dir>           Output directory         [default: ./out]
  --target datapack|structure  Output format            [default: datapack]
  --namespace <ns>             Datapack namespace       [default: filename]
  --mc-version <ver>           Target MC version        [default: 1.21]
  --include <dir>              Extra library search path (repeatable)
  --source-map                 Emit .mcrs.map source map for debugging
  --no-optimize                Skip optimizer passes
  --stats                      Print optimizer statistics

redscript repl                 Interactive REPL
redscript validate <file>      Validate MC commands
```

---

### Stdlib

RedScript 内置 standard library。使用短路径即可，不需要写完整路径：

```rs
import "stdlib/math"      // fixed-point math: ln, sqrt_fx, exp_fx, sin_fixed, cos_fixed...
import "stdlib/math_hp"   // high-precision trig via entity rotation (init_trig required)
import "stdlib/vec"       // 2D/3D vector: dot, cross, length, distance, atan2, rotate...
import "stdlib/random"    // LCG & PCG random number generators
import "stdlib/color"     // RGB/HSL color packing, blending, conversion
import "stdlib/bits"      // bitwise AND/OR/XOR/NOT/shift/popcount (integer-simulated)
import "stdlib/list"      // sort3, min/max/avg, weighted utilities
import "stdlib/geometry"  // AABB/sphere contains, parabola physics, angle helpers
import "stdlib/signal"    // normal/exponential distributions, bernoulli, weighted choice
import "stdlib/bigint"    // 96-bit base-10000 arithmetic (add/sub/mul/div/cmp)
import "stdlib/easing"    // 12 easing functions: quad/cubic/sine/bounce/back/smooth
import "stdlib/noise"     // value noise, fractal Brownian motion, terrain height
import "stdlib/calculus"  // numerical differentiation, trapezoid/Simpson integration, curve length, online statistics
import "stdlib/matrix"    // 2D/3D rotation, Display Entity quaternion helpers
import "stdlib/combat"    // damage, kill-check helpers
import "stdlib/player"    // health, alive check, range
import "stdlib/cooldown"  // per-player cooldown tracking
```

所有 stdlib 文件都使用 `module library;`，因此只有你实际调用到的函数才会被编译进去。

> standard library 的一部分灵感来自 [kaer-3058/large_number](https://github.com/kaer-3058/large_number)，这是一个面向 Minecraft datapacks 的完整数学库。

你也可以通过 `--include <dir>` 添加自定义 library 路径，让自己的 modules 以同样方式工作。

**示例：在游戏内计算 Fibonacci(50)：**

```rs
import "stdlib/bigint"

fn show_fib() {
    bigint_fib(50);
    // F(50) = 12,586,269,025 — too big for int32, stored across 3 limbs:
    let l0: int = bigint_get_a(0);  // 9025
    let l1: int = bigint_get_a(1);  // 8626
    let l2: int = bigint_get_a(2);  // 125
    say(f"F(50) limbs: {l2} {l1} {l0}");
}
```

---

### 示例

`examples/` 目录里提供了可直接编译的 demos：

| File | 展示内容 |
|---|---|
| `readme-demo.mcrs` | 实时正弦波粒子效果：`@tick`、`foreach`、f-strings、math stdlib |
| `math-showcase.mcrs` | 全套 stdlib math modules：trig、vectors、BigInt、fractals |
| `showcase.mcrs` | 完整功能展示：structs、enums、`match`、lambdas、`@tick`/`@load` |
| `coroutine-demo.mcrs` | `@coroutine(batch=50)`：把 1000 次迭代分散到约 20 个 ticks |
| `enum-demo.mcrs` | enum 状态机：NPC AI 通过 `match` 在 Idle → Moving → Attacking 之间切换 |
| `scheduler-demo.mcrs` | `@schedule(ticks=20)`：延迟事件与链式调度 |

编译任意示例：
```bash
node dist/cli.js compile examples/coroutine-demo.mcrs -o ~/mc-server/datapacks/demo --namespace demo
```

---

### Changelog Highlights

#### v1.2.27 (2026-03-14)

- **BigInt real-MC fix**：`storage_set_int` macro 现在使用 `execute store result storage`，而不是 `data modify set value $(n)`；这可以绕过 Minecraft 在整数 macro substitution 上的一个 bug。BigInt 已在 Paper 1.21.4 上确认可用
- **showcase**：`atan2_fixed` 返回的是 degrees（0–360），不是 millidegrees；修复了示例中过度除法的问题；`mod_pow` 测试样例改为使用安全的小模数范围，避免 INT32 overflow

#### v1.2.26 (2026-03-14)

- 完整的 math/vector/advanced/bigint standard library（见上）
- `module library;` pragma，实现零成本 tree-shaking
- `storage_get_int` / `storage_set_int` dynamic NBT array builtins
- 编译器 bug 修复：`isqrt` 收敛、copy propagation、变量作用域

#### v1.2.25 (2026-03-13)

- Entity type hierarchy，带 `W_IMPOSSIBLE_AS` warnings
- 变量名混淆为 `$a`、`$b`、`$c` 等，以尽量缩小 scoreboard footprint
- 自动化 CI/CD：每次 push 都会发布 npm 包和 VSCode extension

#### v1.2.0

- `impl` blocks、methods 和 static constructors
- `is` 类型收窄，用于 entity-safe 控制流
- `@on(Event)` 静态事件与 callback scheduling builtins
- 用于输出函数的 runtime f-strings
- 扩展后的 stdlib，包含 Timer OOP APIs 与 313 个 MC tag 常量
- Dead code elimination

完整版本说明见 [CHANGELOG.md](./CHANGELOG.md)。

---

## 致谢

standard library 的一部分灵感来自 [kaer-3058/large_number](https://github.com/kaer-3058/large_number)，这是一个面向 Minecraft datapacks 的完整数学库。RedScript 在类似算法之上提供了更高层、更类型安全的 API。

---

<div align="center">

MIT License · Copyright © 2026 [bkmashiro](https://github.com/bkmashiro)

*少写一点。多构建一些。更快交付。*

</div>
