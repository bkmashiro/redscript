# RedScript 编译器架构

这份文档用最简单的语言，解释 RedScript 编译器怎样把 `.mcrs` 源码变成 Minecraft datapack 里的 `.mcfunction` 文件。

你可以把它理解成一条流水线：

- `Lexer` 把字符串切成一个个小块
- `Parser` 把小块拼成语法树
- `TypeChecker` 检查类型和上下文
- `Lowering` 把高级语法翻成更容易生成命令的 IR
- `CodeGen` 把 IR 输出成 datapack 文件
- `Optimizer` 在中间或最后阶段删掉浪费的内容

## 编译流程总览

源码 → Lexer → Parser → TypeChecker → Lowering → CodeGen → .mcfunction

```text
+-------------------+
|   RedScript 源码   |
+---------+---------+
          |
          v
+-------------------+
| Lexer             |
| 字符 -> Token     |
+---------+---------+
          |
          v
+-------------------+
| Parser            |
| Token -> AST      |
+---------+---------+
          |
          v
+-------------------+
| TypeChecker       |
| AST + 符号表      |
| + @s 上下文       |
+---------+---------+
          |
          v
+-------------------+
| Lowering          |
| AST -> IR         |
| 变量 -> scoreboard|
+---------+---------+
          |
          v
+-------------------+
| Optimizer         |
| DCE / 命令合并    |
+---------+---------+
          |
          v
+-------------------+
| CodeGen           |
| IR -> mcfunction  |
| + tick/load tags  |
+---------+---------+
          |
          v
+-------------------+
| datapack 输出      |
| .mcfunction/json  |
+-------------------+
```

## 1. 词法分析 (Lexer)

### 干什么的？

Lexer 的工作很简单：从左到右读源码，把字符流切成一个个 `Token`。

比如这段代码：

```rs
let hp: int = scoreboard_get(@s, "health");
```

会大致切成：

```text
let | hp | : | int | = | scoreboard_get | ( | @s | , | "health" | ) | ;
```

这样后面的 Parser 就不用再关心“字符”了，只需要处理“词”。

### 核心数据结构 Token

简化后的核心结构就是：

```ts
type Token = {
  kind: TokenKind
  value: string
  line: number
  col: number
}
```

这里最重要的是两件事：

- `kind`：这个词是什么，比如 `ident`、`int_lit`、`selector`
- `line/col`：出错时要告诉用户“哪一行哪一列有问题”

### 实际实现里要特别处理什么？

RedScript 的 Lexer 不只是普通编程语言的 Lexer，它还要处理 Minecraft 特有语法。

#### 1. `@a` 和 `@tick` 不是一回事

- `@a`、`@e[...]`、`@s` 是实体选择器，记成 `selector`
- `@tick`、`@on(PlayerDeath)`、`@on_trigger("x")` 是装饰器，记成 `decorator`

也就是说，Lexer 在看到 `@` 时，要先判断后面跟的是选择器还是装饰器。

#### 2. `@e[type=zombie,tag=boss]` 会尽量作为一个整体 Token

因为中括号里可能还带 NBT、范围、逗号，先整体收起来更稳。等到 Parser 再拆内部字段。

#### 3. 范围字面量 `1..10`

RedScript 支持：

- `..5`
- `1..`
- `1..10`

它们都不是两个点，而是一个完整的 `range_lit`。

#### 4. `->`、`==`、`+=` 这些双字符运算符

如果 Lexer 先把 `->` 切成 `-` 和 `>`，Parser 就会很难处理。

#### 5. f-string

`f"hello {name}"` 不会被当成普通字符串，而是单独记成 `f_string`，后面会编译成 `tellraw` JSON。

### 简化实现（10 行伪代码）

```text
while not end:
  ch = advance()
  if ch is whitespace: continue
  if startsWith("//"): skipLine()
  else if ch begins number: readNumberOrRange()
  else if ch == '@': readSelectorOrDecorator()
  else if ch begins letter: readIdentifierOrKeyword()
  else if ch == '"': readString()
  else if ch begins operator: readOperator()
  else if ch begins delimiter: addToken()
  else: reportError()
```

### 一个简化示例

输入：

```rs
@on(PlayerDeath)
fn handle() { tellraw(@a, f"HP: {scoreboard_get(@s, "hp")}"); }
```

输出：

```text
decorator("@on(PlayerDeath)")
fn
ident("handle")
(
)
{
ident("tellraw")
(
selector("@a")
,
f_string("HP: { ... }")
)
;
}
```

## 2. 语法分析 (Parser)

### 干什么的？

Parser 把 Token 变成 AST。

AST 的意思是“抽象语法树”。它不关心空格和换行，只关心代码的结构。

比如：

```rs
let x: int = 1 + 2 * 3;
```

真正重要的不是字符顺序，而是：

- 这是一个 `let` 语句
- 变量名叫 `x`
- 类型是 `int`
- 初始化表达式是 `1 + (2 * 3)`

### 核心数据结构 AST

可以把 AST 想成一棵树：

```text
let
├─ name: x
├─ type: int
└─ init: binary(+)
   ├─ left: 1
   └─ right: binary(*)
      ├─ left: 2
      └─ right: 3
```

项目里的 AST 结构比这个更丰富，除了函数、变量、表达式，还包含：

- `struct`
- `impl`
- `enum`
- `foreach`
- `execute`
- `f_string`
- `static_call`
- `member_assign`

### 递归下降解析（简化示例）

RedScript 的 Parser 用的是“递归下降”。

意思是：每种语法都写一个函数。

例如：

- `parseFnDecl()` 解析函数
- `parseStmt()` 解析语句
- `parseExpr()` 解析表达式
- `parseSelector()` 解析实体选择器

最常见的写法是：

```text
parseStmt():
  if current is let: return parseLet()
  if current is if: return parseIf()
  if current is while: return parseWhile()
  if current is foreach: return parseForeach()
  return parseExprStmt()
```

### 表达式优先级怎么做？

表达式不是按看到的顺序直接拼，而是按优先级解析。

例如：

```rs
1 + 2 * 3
```

必须解析成：

```text
    (+)
   /   \
  1    (*)
      /   \
     2     3
```

项目里的实现使用 precedence climbing。思路是：

```text
parseBinaryExpr(minPrec):
  left = parseUnary()
  while current token is binary op and prec >= minPrec:
    op = advance()
    right = parseBinaryExpr(prec(op) + 1)
    left = Binary(op, left, right)
  return left
```

### 选择器怎么解析？

Lexer 已经把 `@e[type=zombie, distance=..5]` 收成一个 token。

Parser 再做第二次拆分：

```text
selector token
    |
    +--> kind = @e
    +--> filters.type = zombie
    +--> filters.distance = { max: 5 }
```

简化伪代码：

```text
parseSelector(raw):
  split "@e[...]" into kind + filterString
  for each key=value in filterString:
    if key == type: save string
    if key == distance: parseRange()
    if key == tag: push to tag/notTag
    if key == limit: parse int
  return EntitySelector
```

### `impl` 的语法糖

Parser 在解析 `impl PlayerState { fn heal(self, x: int) {} }` 时，会把它保存成 `ImplBlock`。

这里有个小技巧：

- 如果方法第一个参数叫 `self`
- 并且没有显式写类型

Parser 会自动把它补成当前 `impl` 的结构体类型。

也就是：

```rs
impl Counter {
  fn inc(self) {}
}
```

会被理解成类似：

```rs
fn inc(self: Counter) {}
```

## 3. 类型检查 (TypeChecker)

### 干什么的？

Parser 只保证“语法长得像代码”。

TypeChecker 负责保证“语义讲得通”。

例如：

- `int` 不能直接赋值给 `string`
- 没声明的变量不能用
- 返回值类型要对得上
- `@on(PlayerDeath)` 的函数参数必须符合事件要求
- `self` 必须出现在方法的第一个参数位置

### 符号表

TypeChecker 里最重要的数据结构之一是符号表。它本质上是名字到类型的映射。

```text
scope
├─ x      -> int
├─ hp     -> int
├─ player -> Player
└─ state  -> struct Counter
```

项目里实际上维护了几张表：

- `functions`: 普通函数表
- `implMethods`: `类型 -> 方法名 -> FnDecl`
- `structs`: 结构体字段表
- `enums`: 枚举表
- `consts`: 常量表
- `scope`: 当前局部作用域

### 类型推断流程

它的工作顺序可以理解成两遍：

```text
第一遍：
  收集函数、struct、enum、impl 方法签名

第二遍：
  逐个检查函数体里的语句和表达式
```

这样做的好处是：后面调用前面或后面的函数都能识别。

简化伪代码：

```text
check(program):
  collect function signatures
  collect impl methods
  collect struct fields
  collect enums and consts
  for each function:
    checkFunctionBody()
```

### `@s` 上下文追踪

这是 RedScript 里一个很关键，也很容易忽略的点。

在 Minecraft 里，`@s` 的真实类型不是固定的，它要看当前执行上下文。

例如：

```rs
foreach (z in @e[type=zombie]) {
  // 这里的 @s 实际上就是 zombie
}
```

或者：

```rs
as @a {
  // 这里的 @s 是 Player
}
```

TypeChecker 的做法是维护一个 `selfTypeStack`：

```text
初始: [entity]

进入 as @a:
  push(Player)

进入 foreach @e[type=zombie]:
  push(Zombie)

离开作用域:
  pop()
```

所以当类型系统看到 `@s` 时，不是简单返回 `entity`，而是返回“栈顶当前类型”。

ASCII 图：

```text
外层函数
selfTypeStack = [entity]

as @a {
  selfTypeStack = [entity, Player]

  foreach mob in @e[type=zombie] {
    selfTypeStack = [entity, Player, Zombie]
    @s  ==> Zombie
  }

  离开 foreach
  selfTypeStack = [entity, Player]
}

离开 as
selfTypeStack = [entity]
```

### 一个简化示例

```rs
@on(PlayerDeath)
fn on_die(player: Player) {
  let x: int = 1;
}
```

TypeChecker 会检查：

- `PlayerDeath` 是不是合法事件
- 这个事件是否要求 1 个参数
- 参数类型是不是 `Player`

如果写成：

```rs
@on(PlayerDeath)
fn on_die(x: int) {}
```

就会报错。

## 4. IR 降级 (Lowering)

### 干什么的？

Parser 和 TypeChecker 处理的是“源码世界”的结构。

但是生成 Minecraft 命令时，直接面对 AST 很麻烦。因为 Minecraft 命令本质上更接近：

- 赋值
- 比较
- 跳转
- 调函数
- 原始命令

所以 Lowering 会把 AST 变成更朴素的 IR。

项目里的 IR 很像三地址码（TAC）：

- `assign`
- `binop`
- `cmp`
- `jump`
- `jump_if`
- `call`
- `return`
- `raw`

### 高级语法 → 低级 IR

举个例子：

```rs
let c: int = a + b;
```

会变成类似：

```text
t0 = a
t0 += b
c = t0
```

再比如：

```rs
if (hp > 0) { heal(); } else { die(); }
```

会变成：

```text
t0 = (hp > 0)
if t0 goto then
goto else

then:
  call heal
  goto end

else:
  call die
  goto end
```

ASCII 图：

```text
AST if/while/foreach
        |
        v
+------------------+
| Lowering         |
| 拆成基本块和跳转 |
+--------+---------+
         |
         v
entry -> cmp -> jump_if
           |        |
           v        v
         then     else
           \        /
            \      /
             -> end
```

### scoreboard 变量分配

Minecraft 没有真正的本地变量，所以编译器要自己模拟。

RedScript 的主要做法是：

- 整数变量放进 scoreboard objective `rs`
- 变量名映射成 fake player，比如 `$hp`
- 临时变量映射成 `$_0`、`$_1`
- 返回值放进 `$ret`
- 参数通过 `$p0`、`$p1` 传递

也就是：

```text
源码变量 x
   |
   v
scoreboard players set $x rs 0
```

IR 设计图：

```text
RedScript 变量
   |
   +--> 局部变量    -> $name on objective rs
   +--> 临时变量    -> $_N on objective rs
   +--> 返回值      -> $ret on objective rs
   +--> 参数槽位    -> $p0, $p1, ...
```

这个设计很朴素，但非常适合 Minecraft 的执行模型。

### 函数调用约定

RedScript 的函数调用不是靠真正的调用栈，而是靠固定约定：

1. 调用方先把参数写到 `$p0`, `$p1`, ...`
2. 执行 `function namespace:fn_name`
3. 被调函数入口把 `$pN` 复制到自己的局部变量
4. 返回值写入 `$ret`
5. 调用方再把 `$ret` 复制出来

简化示例：

```text
caller:
  $p0 = a
  $p1 = b
  function demo:add
  x = $ret
```

### `foreach` 怎么降级？

这是一个很典型的“高级语法拆低级语法”案例。

源码：

```rs
foreach (z in @e[type=zombie]) {
  damage(z, 1);
}
```

Lowering 的做法不是在当前位置展开所有逻辑，而是：

1. 生成一个子函数
2. 把循环体放进子函数
3. 主函数发出：

```mcfunction
execute as @e[type=minecraft:zombie] run function ns:main/foreach_0
```

4. 子函数内部把绑定变量 `z` 映射成 `@s`

所以 `foreach` 本质上是“选择器 + execute as + 子函数”。

### `impl` 方法怎么降级？

`impl` 不会保留成一个独立运行时结构。

Lowering 会把方法名改写成普通函数名：

```text
impl Counter {
  fn inc(self, n: int) {}
}

==>

Counter_inc(self, n)
```

这样后面的 CodeGen 不需要理解“面向对象”，只需要按普通函数生成就行。

## 5. 代码生成 (CodeGen)

### IR → mcfunction

CodeGen 的工作是把 IR 指令翻成真正的 Minecraft 命令。

例如：

```text
assign x, 5
```

会生成：

```mcfunction
scoreboard players set $x rs 5
```

再例如：

```text
cmp t0, a, >, b
```

会生成两步：

```mcfunction
scoreboard players set $t0 rs 0
execute if score $a rs > $b rs run scoreboard players set $t0 rs 1
```

因为 Minecraft 没有“比较后直接得到布尔值”的指令，只能先清零，再条件赋 1。

### `tick.json` / `load.json` 生成

CodeGen 不只是生成函数，还要生成 datapack 入口。

#### `__load.mcfunction`

它负责：

- 创建运行时 scoreboard objective `rs`
- 初始化全局变量
- 注册 trigger objective
- 初始化某些事件检测用 objective
- 调用所有 `@load` 函数

并在：

```text
data/minecraft/tags/function/load.json
```

里注册：

```json
{ "values": ["<namespace>:__load"] }
```

#### `__tick.mcfunction`

它负责：

- 每 tick 调用所有 `@tick` 函数
- 检查 `@on_trigger(...)`
- 检查事件标签并分发 `@on(...)`

并在：

```text
data/minecraft/tags/function/tick.json
```

里注册：

```json
{ "values": ["<namespace>:__tick"] }
```

### 目录结构

典型输出结构如下：

```text
pack.mcmeta
data/
  minecraft/
    tags/
      function/
        load.json
        tick.json
  mypack/
    function/
      __load.mcfunction
      __tick.mcfunction
      main.mcfunction
      main/then_0.mcfunction
      main/else_0.mcfunction
      __trigger_x_dispatch.mcfunction
    advancements/
      on_advancement_x.json
```

为什么会有 `main/then_0.mcfunction` 这种文件？

因为控制流被拆成多个基本块后，每个块都可以落成一个单独的 `.mcfunction` 文件，前一个块用 `function` 跳过去。

## 6. 优化器

RedScript 里有两层优化：

- AST 层的死代码消除
- 命令层的优化，比如公共子表达式和 `setblock` 批处理

### 6.1 死代码消除 (DCE)

#### 标记-清除算法

DCE 的核心思路是：先找“肯定会用到”的东西，再把没用到的删掉。

步骤：

1. 找入口点
2. 从入口点出发，递归标记会调用到的函数
3. 记录哪些常量、局部声明真的被读取
4. 清除未使用内容

伪代码：

```text
findEntryPoints()
for each entry:
  markReachable(entry)

markReachable(fn):
  if fn already marked: return
  mark fn
  scan fn body
  if fn calls other function:
    markReachable(other)
```

#### 入口点追踪

项目里会把这些当成入口点：

- `main`
- `@tick`
- `@load`
- `@on(...)`
- `@on_trigger(...)`
- `@on_advancement(...)`
- `@on_craft(...)`
- `@on_death`
- `@on_login`
- `@on_join_team`

也就是说，就算某个事件函数没有被普通函数显式调用，它也不会被删掉。

ASCII 图：

```text
入口点
├─ main
├─ tick_fn
└─ on_die

从这些点出发做图遍历：

main ----> helper_a ----> helper_b
tick_fn -> helper_b
on_die --> reward_player

没有任何边连到的 unused_fn
=> 删除
```

### 6.2 setblock 批处理

这是一个非常实用的命令级优化。

#### 相邻方块检测

优化器会扫描一串命令：

```mcfunction
setblock 0 64 0 stone
setblock 1 64 0 stone
setblock 2 64 0 stone
```

如果发现它们：

- 方块类型相同
- `y` 相同
- 在 `x` 或 `z` 轴连续相邻

就认为它们可以合并。

#### fill 命令合并

上面的三条会被改写成：

```mcfunction
fill 0 64 0 2 64 0 stone
```

伪代码：

```text
scan commands from left to right
if current is setblock:
  start a run
  keep extending while next block is adjacent and same type
  if run length >= 2:
    replace run with one fill command
```

ASCII 图：

```text
setblock(0,64,0,stone)
setblock(1,64,0,stone)
setblock(2,64,0,stone)
        |
        v
fill(0,64,0 -> 2,64,0, stone)
```

## 7. 特色功能实现

### 7.1 impl 块

#### 方法解析

类型检查阶段会先把 `impl` 里的方法登记到：

```text
implMethods[typeName][methodName] = FnDecl
```

这样当编译器看到：

```rs
Counter::new()
```

或

```rs
state.inc(1)
```

就能知道应该解析到哪个方法。

#### self 参数处理

这里分三步：

1. Parser：如果 `impl` 方法第一个参数是 `self`，会自动补成结构体类型
2. TypeChecker：检查 `self` 是否真的是第一个参数，类型是否匹配当前 `impl`
3. Lowering：把方法改写成普通函数，比如 `Counter_inc`

简化示例：

```rs
impl Counter {
  fn inc(self, by: int) {}
}
```

等价于：

```text
FnDecl(name="inc", params=[self: Counter, by: int])
Lowered name = Counter_inc
```

### 7.2 事件系统 `@on(Event)`

#### 标签检测

RedScript 目前把事件类型定义在 `src/events/types.ts` 里。

例如：

- `PlayerDeath`
- `PlayerJoin`
- `BlockBreak`
- `EntityKill`
- `ItemUse`

每个事件都会绑定一个 tag，例如：

```text
PlayerDeath -> rs.just_died
PlayerJoin  -> rs.just_joined
```

TypeChecker 会检查：

- 事件名是否合法
- 处理函数参数是否符合事件签名

Lowering 会把事件信息挂到 IR 函数元数据里：

```text
eventHandler = {
  eventType: "PlayerDeath",
  tag: "rs.just_died"
}
```

#### tick dispatcher

CodeGen 在生成 `__tick.mcfunction` 时，会把这些事件处理器统一串起来：

```mcfunction
execute as @a[tag=rs.just_died] run function ns:on_die
tag @a[tag=rs.just_died] remove rs.just_died
```

也就是：

```text
游戏里某处给玩家打 tag
        |
        v
__tick.mcfunction 扫描 tag
        |
        v
执行对应 RedScript 事件函数
        |
        v
移除 tag，避免重复触发
```

这是一个很简单但很稳的事件分发模型。

补充一点：

- `@on_trigger("x")` 不是 tag 模式，而是 scoreboard trigger objective
- `@on_advancement(...)`、`@on_craft(...)`、`@on_death` 会额外生成 advancement JSON

### 7.3 f-string

#### 编译为 tellraw JSON

RedScript 的 f-string 不是在编译期简单拼接字符串，而是会转成 `tellraw` 用的 JSON 数组。

例如：

```rs
tellraw(@a, f"HP: {hp}");
```

会被拆成：

```text
[
  "",
  {"text":"HP: "},
  {"score":{"name":"$hp","objective":"rs"}}
]
```

Lowering 的处理流程是：

1. 识别 `say`、`tellraw`、`title` 这些“富文本内建函数”
2. 如果消息参数是 `f_string` 或 `str_interp`
3. 调用 `buildRichTextJson`
4. 把文本片段和表达式片段分别转成 JSON component

ASCII 图：

```text
f"HP: {hp}"
   |
   +--> text("HP: ")
   +--> expr(hp)
            |
            v
      scoreboard component
            |
            v
tellraw JSON array
```

简化伪代码：

```text
buildRichTextJson(fstring):
  parts = [""]
  for part in fstring.parts:
    if part is text:
      parts.push({text: value})
    else:
      parts.push(convertExprToJson(part.expr))
  return JSON.stringify(parts)
```

## 小结

如果把整个编译器浓缩成一句话，可以这样理解：

```text
RedScript 编译器做的事，
就是把“像普通语言一样写的游戏逻辑”，
一步步翻译成“Minecraft 能执行的 scoreboard / execute / function 命令”。
```

其中最关键的设计是三点：

- 前端用 `Token -> AST` 保存源码结构
- 中间层用 IR 抹平高级语法
- 后端把变量、控制流、事件系统映射到 Minecraft 原生命令

所以它虽然看起来像一个普通编译器，但本质上是在给 Minecraft 这台“很奇怪的虚拟机”做代码翻译。
