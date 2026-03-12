<div align="center">

<img src="https://img.shields.io/badge/RedScript-1.0-red?style=for-the-badge&logo=minecraft&logoColor=white" alt="RedScript" />

**一个编译到 Minecraft Datapack 的类型化脚本语言。**

写干净的游戏逻辑，把记分板的面条代码交给 RedScript 处理。

[![CI](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bkmashiro/redscript/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/redscript-mc?color=cb3837)](https://www.npmjs.com/package/redscript-mc)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-423%20passing-brightgreen)](./src/__tests__)

[English](./README.md) · [Wiki](https://github.com/bkmashiro/redscript/wiki) · [快速开始](#快速开始) · [🚀 在线 IDE](https://redscript-ide.pages.dev)

</div>

---

### RedScript 是什么？

你想做一个 Minecraft 小游戏——倒计时、击杀计数、复活逻辑、记分板显示。用原版 MC 的话，这意味着 40+ 个 `.mcfunction` 文件、几百条 `execute if score` 命令，还要花一个周末调试。

用 RedScript，就是这样：

```rs
// pvp_game.mcrs
import "stdlib/player.mcrs"

const GAME_TIME: int = 300;

@tick(rate=20)
fn every_second() {
    let time: int = scoreboard_get(#game, #timer);

    if (time <= 0) {
        end_game();
        return;
    }

    scoreboard_set(#game, #timer, time - 1);
    actionbar(@a, "⏱ 剩余 ${time} 秒");
}

fn start_game() {
    scoreboard_set(#game, #timer, GAME_TIME);
    scoreboard_set(#game, #running, 1);
    title(@a, "开始战斗！", "游戏已开始");
    tp(@a, (0, 64, 0));
}

fn end_game() {
    scoreboard_set(#game, #running, 0);
    title(@a, "游戏结束！");
    announce("感谢游玩！");
}

@on_death
fn on_kill() {
    scoreboard_add(@s, #kills, 1);
}
```

一个文件，几秒钟编译出可以直接用的 datapack。

---

### 快速开始

#### 安装

```bash
npm install -g redscript
```

#### 编译

```bash
redscript compile pvp_game.mcrs -o ./my-datapack
```

```
✓ 已编译 pvp_game.mcrs
  命名空间 : pvp_game
  函数数量  : 7
  命令数量  : 34  →  28  (优化器节省了 18%)
  输出目录  : ./my-datapack/
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
    summon("minecraft:zombie", (i, 64, 0));
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

```rs
import "stdlib/math.mcrs"       // abs, min, max, clamp
import "stdlib/player.mcrs"     // is_alive, in_range, get_health
import "stdlib/timer.mcrs"      // start_timer, tick_timer, has_elapsed
import "stdlib/cooldown.mcrs"   // set_cooldown, check_cooldown
import "stdlib/mobs.mcrs"       // ZOMBIE, SKELETON, CREEPER ... (60+ 实体常量)
```

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

*少写一点，多做一些，更快交付。*

</div>
