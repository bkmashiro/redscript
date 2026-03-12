<div align="center">

<img src="https://img.shields.io/badge/RedScript-1.0-red?style=for-the-badge&logo=minecraft&logoColor=white" alt="RedScript" />

**A typed scripting language that compiles to Minecraft datapacks.**

Write clean game logic. RedScript handles the scoreboard spaghetti.

[![CI](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/redscript?color=cb3837)](https://www.npmjs.com/package/redscript)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-423%20passing-brightgreen)](./src/__tests__)

[English](#english) · [中文](#中文) · [Wiki](https://github.com/bkmashiro/redscript/wiki) · [快速开始](#quick-start--快速开始)

</div>

---

## English

### What is RedScript?

You want to make a Minecraft mini-game. You need a countdown timer, kill counter, respawn logic, and a scoreboard display. In vanilla MC, that's 40+ `.mcfunction` files, hundreds of `execute if score` commands, and a weekend of debugging.

With RedScript, it's this:

```rs
// pvp_game.rs
import "stdlib/player.rs"

const GAME_TIME: int = 300;  // 15 seconds × 20 ticks

@tick(rate=20)
fn every_second() {
    let time: int = scoreboard_get("#game", "timer");

    if (time <= 0) {
        end_game();
        return;
    }

    scoreboard_set("#game", "timer", time - 1);
    actionbar(@a, "⏱ ${time}s remaining");
}

fn start_game() {
    scoreboard_set("#game", "timer", GAME_TIME);
    scoreboard_set("#game", "running", 1);
    title(@a, "Fight!", "Game started");
    tp(@a, (0, 64, 0));
}

fn end_game() {
    scoreboard_set("#game", "running", 0);
    title(@a, "Game Over!");
    announce("Thanks for playing!");
}

@on_death
fn on_kill() {
    scoreboard_add(@s, "kills", 1);
}
```

One file. Compiles to a ready-to-use datapack in seconds.

---

### Quick Start

#### Install

```bash
npm install -g redscript
```

#### Compile

```bash
redscript compile pvp_game.rs -o ./my-datapack
```

```
✓ Compiled pvp_game.rs
  Namespace : pvp_game
  Functions : 7
  Commands  : 34  →  28  (optimizer: −18%)
  Output    : ./my-datapack/
```

#### Deploy

Drop the output folder into your world's `datapacks/` directory and run `/reload`. Done.

---

### The Language

#### Variables & Types

```rs
let x: int = 42;
let name: string = "Steve";
let spawn: BlockPos = (0, 64, 0);
let nearby: BlockPos = (~5, ~0, ~5);   // relative coords
const MAX: int = 100;                  // compile-time constant
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
fn on_diamond(player: selector) {
    give(player, "minecraft:diamond", 5);
}

@on_death
fn on_death() {
    scoreboard_add(@s, "deaths", 1);
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
    summon("minecraft:zombie", (i, 64, 0));
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

let phase = Phase::Playing;

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
push(scores, 100);

foreach (s in scores) {
    announce("Score: ${s}");
}
```

---

### CLI Reference

```
redscript compile <file>       Compile to datapack (default) or structure
  -o, --output <dir>           Output directory         [default: ./out]
  --target datapack|structure  Output format            [default: datapack]
  --namespace <ns>             Datapack namespace       [default: filename]
  --no-optimize                Skip optimizer passes
  --stats                      Print optimizer statistics

redscript repl                 Interactive REPL
redscript validate <file>      Validate MC commands
```

---

### Standard Library

```rs
import "stdlib/math.rs"       // abs, min, max, clamp
import "stdlib/player.rs"     // is_alive, in_range, get_health
import "stdlib/timer.rs"      // start_timer, tick_timer, has_elapsed
import "stdlib/cooldown.rs"   // set_cooldown, check_cooldown
import "stdlib/mobs.rs"       // ZOMBIE, SKELETON, CREEPER, ... (60+ constants)
```

---

### Further Reading

| | |
|---|---|
| 📖 [Language Reference](docs/LANGUAGE_REFERENCE.md) | Full syntax & type system |
| 🔧 [Builtins](https://github.com/bkmashiro/redscript/wiki/Builtins) | All 34+ MC builtin functions |
| ⚡ [Optimizer](https://github.com/bkmashiro/redscript/wiki/Optimizer) | How the optimizer works |
| 🧱 [Structure Target](docs/STRUCTURE_TARGET.md) | Compile to NBT command block structures |
| 🧪 [Integration Testing](https://github.com/bkmashiro/redscript/wiki/Integration-Testing) | Test against a real Paper server |
| 🏗 [Implementation Guide](docs/IMPLEMENTATION_GUIDE.md) | Compiler internals |

---

## 中文

### RedScript 是什么？

你想做一个 Minecraft 小游戏——倒计时、击杀计数、复活逻辑、记分板显示。用原版 MC 的话，这意味着 40+ 个 `.mcfunction` 文件、几百条 `execute if score` 命令，还要花一个周末调试。

用 RedScript，就是这样：

```rs
// pvp_game.rs
import "stdlib/player.rs"

const GAME_TIME: int = 300;

@tick(rate=20)
fn every_second() {
    let time: int = scoreboard_get("#game", "timer");

    if (time <= 0) {
        end_game();
        return;
    }

    scoreboard_set("#game", "timer", time - 1);
    actionbar(@a, "⏱ 剩余 ${time} 秒");
}

fn start_game() {
    scoreboard_set("#game", "timer", GAME_TIME);
    title(@a, "开始战斗！", "游戏已开始");
    tp(@a, (0, 64, 0));
}

fn end_game() {
    title(@a, "游戏结束！");
    announce("感谢游玩！");
}

@on_death
fn on_kill() {
    scoreboard_add(@s, "kills", 1);
}
```

一个文件，几秒钟编译出可以直接用的 datapack。

---

### 快速开始 / Quick Start

#### 安装

```bash
npm install -g redscript
```

#### 编译

```bash
redscript compile pvp_game.rs -o ./my-datapack
```

#### 部署

把输出文件夹丢进存档的 `datapacks/` 目录，游戏内跑 `/reload`。完成。

---

### 语言特性

| 特性 | 说明 |
|------|------|
| 类型系统 | `int` / `string` / `bool` / `selector` / `BlockPos` / 泛型数组 |
| 函数 | 默认参数、返回值、调用链 |
| 控制流 | `if/else` / `for` / `while` / `foreach` / `match` |
| 装饰器 | `@tick` / `@tick(rate=N)` / `@on_advancement` / `@on_death` / `@on_craft` |
| Lambda | 高阶函数，单态化编译（无运行时函数指针） |
| 结构体/枚举 | 组合类型 + 模式匹配 |
| 数组 | NBT storage 实现，支持 push/pop/len/foreach |
| 字符串插值 | `"玩家 ${name} 得分 ${score}"` |
| import | 多文件项目，`import "path/to/file.rs"` |
| const | 编译期常量内联 |
| 优化器 | 死代码消除、CSE、LICM、setblock→fill 批合并 |
| 两种输出 | `datapack`（默认）或 `structure`（NBT 命令方块结构体） |
| MC 内置函数 | 34+ 个，覆盖聊天、传送、方块、实体、记分板、bossbar、队伍 |

---

### 更多文档

| | |
|---|---|
| 📖 [语言参考](docs/LANGUAGE_REFERENCE.md) | 完整语法与类型系统 |
| 🔧 [内置函数](https://github.com/bkmashiro/redscript/wiki/Builtins) | 所有 34+ MC 内置函数 |
| ⚡ [优化器](https://github.com/bkmashiro/redscript/wiki/Optimizer) | 各优化 Pass 说明 |
| 🧱 [结构体目标](docs/STRUCTURE_TARGET.md) | 编译到 NBT 命令方块结构体 |
| 🧪 [集成测试](https://github.com/bkmashiro/redscript/wiki/Integration-Testing) | 在真实 Paper 服务器上测试 |
| 🏗 [实现指南](docs/IMPLEMENTATION_GUIDE.md) | 编译器内部原理 |

---

<div align="center">

MIT License · Copyright © 2026 [bkmashiro](https://github.com/bkmashiro)

*Write less. Build more. Ship faster.*

</div>
