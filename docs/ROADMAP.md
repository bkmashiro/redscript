# RedScript Roadmap

> 生成于 2026-03-16 · 按依赖关系排序的完整改进计划

---

## 执行顺序总览

```
Phase 1 — 编译器基础设施 (并行进行，无依赖)
  1a. 静态命令预算分析
  1b. 增量编译

Phase 2 — 语言核心扩展 (依赖 Phase 1 基础)
  2a. 枚举 + 模式匹配
  2b. 多返回值 / 元组
  2c. 泛型（单态化）

Phase 3 — 优化 pass (依赖 MIR/LIR 管道稳定)
  3a. execute store peephole pass
  3b. NBT 批量读取
  3c. Selector 缓存
  3d. 小常量循环展开
  3e. 跨函数常量传播

Phase 4 — 工具链 (依赖语言稳定)
  4a. Source map
  4b. LSP (Language Server Protocol)

Phase 5 — MC 生态 (依赖语言稳定)
  5a. 多版本目标 (--mc-version)
  5b. 模块系统 + Namespace 隔离
  5c. @schedule 装饰器

Phase 6 — 类型系统完善 (最后，改动最大)
  6a. Null safety / Option<T>
  6b. 可选类型 + 完整的 TypeChecker
```

---

## Phase 1 — 编译器基础设施

### 1a. 静态命令预算分析

**目标：** 静态估算每个循环体的 MC 命令数，超过 `maxCommandChainLength`（默认 65536）时发出警告。

**实现：**
- 在 LIR 层加 `estimateCommandCount(fn)` 函数，遍历 LIR 指令估算命令数
- 对每个循环：估算循环体命令数 × 最大迭代次数（如果上界可知）
- 超过阈值（建议警告线：32768，错误线：65536）时：
  - Warning：`loop may exceed tick budget (~N commands), consider @coroutine`
- 与 `@coroutine` 联动：标注了 `@coroutine` 的函数跳过此警告

**为什么先做：** 和已实现的 `@coroutine` 形成闭环，让用户知道什么时候该用它。

---

### 1b. 增量编译

**目标：** watch mode 下只重新编译有改动的文件及其依赖，而非全量。

**实现：**
- 在 HIR 层加内容哈希缓存：`Map<filename, { hash: string, hir: HIRModule }>`
- 建立依赖图：每个文件导入哪些其他文件
- watch 时：只对 hash 变化的文件重新跑 AST→HIR，依赖不变的文件复用缓存的 HIR
- 接着只对脏文件往下跑 HIR→MIR→LIR→codegen

**为什么先做：** 不影响语言语义，纯工程优化。大项目编译时间痛点。

---

## Phase 2 — 语言核心扩展

### 2a. 枚举 + 模式匹配

**目标：** 支持代数枚举类型，扩展 `match` 支持枚举变体。

**语法：**
```redscript
enum Phase { Idle, Moving, Attacking }

let phase: Phase = Phase::Idle;

match phase {
    Phase::Idle    => start_idle(),
    Phase::Moving  => update_movement(),
    Phase::Attacking => do_attack(),
}
```

**编译策略：**
- 每个枚举变体映射到一个整数常量（`Idle=0, Moving=1, ...`）
- 枚举变量编译成普通 scoreboard int slot
- `match` 编译成 `execute if score ... matches N` 链
- 零运行时开销

**实现范围：**
- Lexer/Parser：`enum` 关键字、`::` 路径操作符
- TypeChecker：枚举类型声明、变体作用域
- HIR：`EnumDecl`、`PathExpr`（`Phase::Idle`）
- MIR→LIR：枚举变量 → int slot，`match` → 条件跳转链

**为什么先做：** 游戏状态机极其常见，这是最高频的语言痛点。

---

### 2b. 多返回值 / 元组

**目标：** 函数可以返回多个值，调用方可解构。

**语法：**
```redscript
fn divmod(a: int, b: int): (int, int) {
    return (a / b, a % b);
}

let (q, r) = divmod(10, 3);
```

**编译策略：**
- 元组编译成多个独立 scoreboard slots（`$divmod_ret0`, `$divmod_ret1`）
- 调用方解构 = 分别读取对应 slot
- 最多支持 N=8 个元素（超过建议用 struct）

**实现范围：**
- Parser：元组类型 `(T, T)`、元组字面量 `(a, b)`、解构 `let (a, b) = ...`
- TypeChecker：元组类型推断
- HIR/MIR：`TupleExpr`、`DestructureStmt`
- LIR：多 slot 分配

---

### 2c. 泛型（单态化）

**目标：** 支持基础泛型函数，编译期单态化展开。

**语法：**
```redscript
fn max<T>(a: T, b: T): T {
    if a > b { return a; }
    return b;
}

fn clamp<T>(val: T, lo: T, hi: T): T {
    return max(min(val, hi), lo);
}
```

**编译策略：**
- 泛型函数在调用时单态化（monomorphize）：`max<int>` 生成一份 int 专用函数
- 函数名 mangle：`max_int`, `max_float`
- 不支持泛型 struct（v1，后续可加）

**为什么这里做：** 消掉 stdlib 里 `math.mcrs` 中大量重复代码（`min_int`/`min_float` 等）。

---

## Phase 3 — 优化 Pass

### 3a. `execute store` Peephole Pass

**目标：** 将 `scoreboard operation set` + `execute ... run` 合并为 `execute store result score`。

**示例：**
```mcfunction
# 现在生成的
execute as @s run function ns:_fn
scoreboard players set $result __ns 1

# 优化后
execute store result score $result __ns as @s run function ns:_fn
```

**实现：** LIR 层 peephole pass，识别 `StoreTmp + ExecCmd` 模式 → 合并。

---

### 3b. NBT 批量读取

**目标：** 同函数内多次访问同一 entity 不同字段 → 合并成一次 `data get`。

**实现：**
- MIR 层分析：收集同一 entity selector 的所有字段读取
- 如果 ≥2 次读取且中间没有写操作 → 合并为一次 `data get`，结果存临时 NBT storage
- 后续读取从 storage 里取

---

### 3c. Selector 缓存

**目标：** 同 tick 函数内相同 selector 多次出现 → 第一次用 `tag` 标记，后续用标记查询。

**实现：**
- HIR 层分析：收集同函数内重复使用的 selector
- 第一次查询后：`tag @e[...] add __cached_sel_N`
- 后续查询替换为：`@e[tag=__cached_sel_N]`
- 函数退出时清理标记

---

### 3d. 小常量循环展开

**目标：** 循环次数是编译期常量且 ≤8 时，直接展开。

**实现：**
- MIR pass：检测 `for (let i=0; i<N; i++)` 且 N 是常量
- N ≤ 8：展开 N 份循环体（替换 `i` 为字面量）
- 消掉 loop header、pc slot、条件跳转

---

### 3e. 跨函数常量传播

**目标：** 调用方传入常量参数时，被调函数内可继续折叠。

**实现：**
- Call graph 构建
- 对每个 callsite：如果参数全是常量 → clone 函数体，将参数替换为常量，再跑常量折叠
- 类似 inline + fold，但不需要完全内联

---

## Phase 4 — 工具链

### 4a. Source Map

**目标：** 生成的 `.mcfunction` 每行对应源文件哪行，用于调试。

**格式：** 在每个生成的 `.mcfunction` 目录下放 `sourcemap.json`：
```json
{
  "version": 1,
  "sources": ["src/main.mcrs"],
  "mappings": [
    { "line": 1, "source": 0, "sourceLine": 12, "sourceCol": 4 },
    ...
  ]
}
```

**实现：**
- AST 节点已有 line/col 信息
- HIR/MIR/LIR 节点透传 source location
- Codegen 在 emit 每条命令时附加 source location → 写入 sourcemap

---

### 4b. LSP (Language Server Protocol)

**目标：** 一份实现，覆盖 VSCode、Neovim、Zed 等所有 LSP 编辑器。

**功能（按优先级）：**
1. **Diagnostics** — 实时显示类型错误、未定义变量
2. **Hover** — 鼠标悬停显示类型信息
3. **Go-to-definition** — 跳转到函数/变量定义
4. **Completion** — 自动补全函数名、字段、关键字
5. **Rename** — 重命名变量/函数，自动更新所有引用
6. **Find references** — 查找所有引用

**实现：**
- `src/lsp/server.ts` — LSP server（基于 `vscode-languageserver` 或手写）
- 复用现有 Parser + TypeChecker（需要先完善 TypeChecker 为 error-mode）
- `bin/redscript-lsp` 入口
- VSCode 插件更新：从 grammar-only 升级为 LSP client

**为什么在这里做：** 依赖 TypeChecker 稳定（Phase 6 完善之前，LSP 已经能提供基本功能）。

---

## Phase 5 — MC 生态

### 5a. 多版本目标

**目标：** `--mc-version 1.20.2` flag，codegen 根据目标版本决定使用哪些 MC 特性。

**版本差异表：**
| 特性 | 引入版本 |
|---|---|
| Function macros (`$var`) | 1.20.2 |
| `execute if function` | 1.20.2 |
| Scoreboard `display` 改动 | 1.21 |

**实现：**
- `McVersion` enum + 比较函数
- Codegen 各处加 `if (version >= McVersion.v1_20_2)` 分支
- 老版本降级策略（macro → 用 storage 模拟）

---

### 5b. 模块系统 + Namespace 隔离

**目标：** 每个 `.mcrs` 文件是一个模块，有独立作用域，多 datapack 共存不冲突。

**语法：**
```redscript
// in math.mcrs
module math;
export fn sin(x: int): int { ... }

// in main.mcrs
import math::sin;
// or
import math::*;
```

**编译策略：**
- 每个模块的 scoreboard objective：`__${namespace}_${module}`
- 跨模块调用生成正确的 function path
- DCE 跨模块工作（未被 import 的 export 函数可被裁剪）

---

### 5c. `@schedule` 装饰器

**目标：** 语言层暴露 MC `schedule function` 命令。

**语法：**
```redscript
@schedule(ticks=20)
fn after_one_second() {
    tellraw(@a, "One second passed!");
}

// 调用：
schedule_after_one_second();  // 生成: schedule function ns:after_one_second 20t
```

**实现：**
- Parser：`@schedule(ticks=N)` 装饰器
- Codegen：为被装饰函数生成包装调用函数，emit `schedule function ... Nt`

---

## Phase 6 — 类型系统完善

### 6a. Null safety / Option<T>

**目标：** `@p`（最近玩家）可能没有玩家，应返回 `Option<selector<player>>`。

**语法：**
```redscript
let p: Option<selector<player>> = get_nearest_player();
if let Some(player) = p {
    give(player, "minecraft:diamond");
}
```

**编译策略：**
- `Option<T>` 编译为两个 slot：`has_value: bool` + `value: T`
- `if let Some(x) = opt` → 检查 `has_value` slot，true 则绑定 `value`
- selector 相关的内置函数返回值改为 `Option<selector<...>>`

---

### 6b. TypeChecker 完善（error mode）

**目标：** TypeChecker 从 warn-mode 升级到 error-mode，类型错误阻止编译。

**当前问题：**
- TypeChecker 存在但只 warn
- `redscript check` 硬编码 namespace
- 很多隐式转换没有检查

**实现：**
- TypeChecker 改为抛 `DiagnosticError`（而非 `DiagnosticWarning`）
- `compile()` 在 TypeChecker 有错误时提前返回
- 修复 `redscript check` 使用编译时 namespace
- 加强隐式数值转换检查（int ↔ float）

---

## 工作量估算

| Phase | 内容 | 估算 |
|---|---|---|
| 1a | 静态预算分析 | 2-3天 |
| 1b | 增量编译 | 1周 |
| 2a | 枚举 + match | 2周 |
| 2b | 多返回值 / 元组 | 1周 |
| 2c | 泛型 | 2-3周 |
| 3a-3e | 优化 passes | 2-3周（可并行） |
| 4a | Source map | 3-4天 |
| 4b | LSP | 3-4周 |
| 5a | 多版本目标 | 1周 |
| 5b | 模块系统 | 2-3周 |
| 5c | @schedule | 2-3天 |
| 6a | Option<T> | 2周 |
| 6b | TypeChecker error-mode | 1周 |

**总计：约 20-25 周**（AI agent 加速下可大幅压缩）

---

*此文档由奇尔沙治生成 · 2026-03-16*
