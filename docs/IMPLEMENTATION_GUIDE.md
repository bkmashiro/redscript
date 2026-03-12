# RedScript Compiler — Implementation Guide for AI Agent

> **读这份文档的 agent**：你的任务是为 RedScript 编译器实现 Lexer、Parser 和 AST→IR Lowering 三个模块。
> 仓库在 `/tmp/redscript`，TypeScript，已有 IR/optimizer/codegen 骨架和 15 个测试。

---

## 目录结构（当前）

```
src/
  ir/types.ts          ← IR 类型（已完成）
  ir/builder.ts        ← IRBuilder（已完成）
  optimizer/passes.ts  ← 优化 pass（已完成）
  codegen/mcfunction/  ← mcfunction 生成器（已完成）
  lexer/               ← 你来实现
  parser/              ← 你来实现
  ast/                 ← 你来实现（AST 类型定义）
  lowering/            ← 你来实现（AST → IR）
  __tests__/           ← 已有 optimizer + codegen 测试
```

---

## 任务 1：Lexer (`src/lexer/index.ts`)

### Token 类型完整列表

```ts
export type TokenKind =
  // 关键字
  | 'fn' | 'let' | 'if' | 'else' | 'while' | 'for' | 'foreach'
  | 'return' | 'as' | 'at' | 'in' | 'struct' | 'trigger'
  // 类型
  | 'int' | 'bool' | 'float' | 'string' | 'void'
  // 布尔字面量
  | 'true' | 'false'
  // 实体选择器
  | 'selector'      // @a @e @s @p @r  (含 [...] 参数)
  // 装饰器
  | 'decorator'     // @tick @on_trigger @tick(rate=N)
  // 字面量
  | 'int_lit'       // 42
  | 'float_lit'     // 3.14
  | 'string_lit'    // "hello"
  | 'range_lit'     // ..5  1..  1..10
  // 运算符
  | '+' | '-' | '*' | '/' | '%'
  | '==' | '!=' | '<' | '<=' | '>' | '>='
  | '&&' | '||' | '!'
  | '=' | '+=' | '-=' | '*=' | '/=' | '%='
  // 分隔符
  | '{' | '}' | '(' | ')' | '[' | ']'
  | ',' | ';' | ':' | '->' | '.'
  // 特殊
  | 'ident'         // 变量名、函数名
  | 'raw_cmd'       // raw("...") 的内容
  | 'eof'

export interface Token {
  kind: TokenKind
  value: string     // 原始文本
  line: number
  col: number
}
```

### 棘手的词法规则

**1. 实体选择器 vs 装饰器：**
- `@a` `@e` `@s` `@p` `@r` `@n` → `selector` token（后面可跟 `[...]`）
- `@tick` `@on_trigger` `@tick(rate=20)` → `decorator` token
- 规则：`@` 后接 `a/e/s/p/r/n` 且下一字符不是字母 → selector；否则 decorator

**2. 范围字面量：**
- `..5` → `range_lit`, value=`"..5"`
- `1..` → `range_lit`, value=`"1.."`
- `1..10` → `range_lit`, value=`"1..10"`
- 注意 `..` 不是两个点，是范围运算符

**3. 实体选择器的 `[...]` 参数：**
选择器的过滤参数需要特殊处理（包含嵌套大括号的 NBT）：
```
@e[type=zombie, distance=..5, nbt={NoAI:1b}]
```
词法器可以把 `@e[type=zombie, distance=..5]` 整个作为一个 `selector` token，
内部解析交给 Parser。

**4. `->` 不要拆成 `-` 和 `>`**

**5. 注释：** `//` 行注释，跳过到行尾

---

## 任务 2：AST 类型 (`src/ast/types.ts`)

```ts
// --- 类型节点 ---
export type TypeNode =
  | { kind: 'named'; name: 'int' | 'bool' | 'float' | 'string' | 'void' }
  | { kind: 'array'; elem: TypeNode }

// --- 范围表达式 ---
export interface RangeExpr {
  min?: number    // undefined = 无下界
  max?: number    // undefined = 无上界
}

// --- 实体选择器 ---
export type SelectorKind = '@a' | '@e' | '@s' | '@p' | '@r' | '@n'
export interface SelectorFilter {
  type?: string
  distance?: RangeExpr
  tag?: string[]
  notTag?: string[]
  scores?: Record<string, RangeExpr>
  limit?: number
  sort?: 'nearest' | 'furthest' | 'random' | 'arbitrary'
  nbt?: string
  gamemode?: string
}
export interface EntitySelector {
  kind: SelectorKind
  filters?: SelectorFilter
}

// --- 表达式 ---
export type Expr =
  | { kind: 'int_lit';    value: number }
  | { kind: 'float_lit';  value: number }
  | { kind: 'bool_lit';   value: boolean }
  | { kind: 'str_lit';    value: string }
  | { kind: 'range_lit';  range: RangeExpr }
  | { kind: 'ident';      name: string }
  | { kind: 'selector';   sel: EntitySelector }
  | { kind: 'binary';     op: BinOp | CmpOp; left: Expr; right: Expr }
  | { kind: 'unary';      op: '!' | '-'; operand: Expr }
  | { kind: 'assign';     target: string; op: '='|'+='|'-='|'*='|'/='|'%='; value: Expr }
  | { kind: 'call';       fn: string; args: Expr[] }
  | { kind: 'member';     obj: Expr; field: string }  // entity.health

// --- 语句 ---
export type Stmt =
  | { kind: 'let';        name: string; type?: TypeNode; init: Expr }
  | { kind: 'expr';       expr: Expr }
  | { kind: 'return';     value?: Expr }
  | { kind: 'if';         cond: Expr; then: Block; else_?: Block }
  | { kind: 'while';      cond: Expr; body: Block }
  | { kind: 'foreach';    binding: string; selector: EntitySelector; body: Block }
  | { kind: 'as_block';   selector: EntitySelector; body: Block }
  | { kind: 'at_block';   selector: EntitySelector; body: Block }
  | { kind: 'as_at';      as_sel: EntitySelector; at_sel: EntitySelector; body: Block }
  | { kind: 'raw';        cmd: string }

export type Block = Stmt[]

// --- 函数宣告 ---
export interface Decorator {
  name: 'tick' | 'on_trigger'
  args?: { rate?: number; trigger?: string }
}

export interface Param { name: string; type: TypeNode }

export interface FnDecl {
  name: string
  params: Param[]
  returnType: TypeNode
  decorators: Decorator[]
  body: Block
}

// --- 顶层 ---
export interface Program {
  namespace: string    // 从文件名推断 或 首行 `namespace mypack;`
  declarations: FnDecl[]
}
```

---

## 任务 3：Parser (`src/parser/index.ts`)

使用**递归下降**解析器（Recursive Descent Parser）。不需要外部库。

### 结构

```ts
export class Parser {
  private tokens: Token[]
  private pos: number = 0
  
  constructor(tokens: Token[]) { this.tokens = tokens }
  
  private peek(): Token { return this.tokens[this.pos] }
  private advance(): Token { return this.tokens[this.pos++] }
  private expect(kind: TokenKind): Token { ... }
  private match(...kinds: TokenKind[]): boolean { ... }
  
  parse(): Program { ... }
  
  private parseFnDecl(): FnDecl { ... }
  private parseDecorators(): Decorator[] { ... }
  private parseBlock(): Block { ... }
  private parseStmt(): Stmt { ... }
  private parseExpr(): Expr { ... }     // Pratt parser 或 precedence climbing
  private parseSelector(): EntitySelector { ... }
  private parseRange(): RangeExpr { ... }
}
```

### 运算符优先级（从低到高）

```
||                          (左结合)
&&                          (左结合)
== !=                       (左结合)
< <= > >=                   (左结合)
+ -                         (左结合)
* / %                       (左结合)
! - (前缀)                  (右结合)
. [] ()  (后缀)              (左结合)
```

### 实体选择器解析细节

```ts
// parseSelector(): EntitySelector
// 输入: @e[type=zombie, distance=..5, tag=boss, tag=!excluded, limit=1]

// 1. 消费 selector token (已经是整个 @e[...] 字符串)
// 2. 拆分 kind (@e) 和 filter 参数字符串
// 3. 解析每个 key=value 对:
//    - type=zombie         → filters.type = "zombie"
//    - distance=..5        → filters.distance = { max: 5 }
//    - distance=1..10      → filters.distance = { min: 1, max: 10 }
//    - tag=boss            → filters.tag = [..., "boss"]
//    - tag=!excluded       → filters.notTag = [..., "excluded"]
//    - limit=1             → filters.limit = 1
//    - sort=nearest        → filters.sort = "nearest"
//    - scores={kills=1..}  → filters.scores = { kills: { min: 1 } }
//    - nbt={NoAI:1b}       → filters.nbt = "{NoAI:1b}"
```

---

## 任务 4：AST → IR Lowering (`src/lowering/index.ts`)

### 核心类

```ts
export class Lowering {
  private module: IRModule
  private builder: IRBuilder
  private varMap: Map<string, string>  // source var → IR var name
  private fnQueue: FnDecl[]
  
  lower(program: Program): IRModule { ... }
  
  private lowerFn(fn: FnDecl): IRFunction { ... }
  private lowerBlock(stmts: Stmt[]): void { ... }
  private lowerStmt(stmt: Stmt): void { ... }
  private lowerExpr(expr: Expr): Operand { ... }
  private lowerForeach(stmt: ForeachStmt): void { ... }
  private lowerBuiltinCall(name: string, args: Expr[]): Operand | null { ... }
}
```

### 关键 Lowering 规则

#### 变量声明
```
let x: int = expr;
→
$x = lowerExpr(expr)   (assign instr)
```

#### 二元表达式
```
a + b
→
$t0 = lowerExpr(a)
$t1 = lowerExpr(b)
$t2 = binop $t0 + $t1
return { kind: 'var', name: '$t2' }
```

#### if/else
```
if (cond) { then } else { else_ }
→
$cond = lowerExpr(cond)
emit: jump_if $cond → then_label
emit: jump → else_label

[then_label]:
  lowerBlock(then)
  emit: jump → merge_label

[else_label]:
  lowerBlock(else_)
  emit: jump → merge_label

[merge_label]:
```

#### while
```
while (cond) { body }
→
[loop_check]:
  $cond = lowerExpr(cond)
  jump_unless $cond → loop_exit
  lowerBlock(body)
  jump → loop_check

[loop_exit]:
```

#### foreach — 最重要的规则
```
foreach (entity in @e[type=zombie]) { body }
→
// 1. 把 body 提取成独立函数（名字: parent_fn/foreach_N）
// 2. emit raw: "execute as @e[type=zombie] run function ns:parent_fn/foreach_N"

生成的子函数内容:
  lowerBlock(body)   (其中 "entity" 变量绑定到 @s)
```

#### 内建函数（直接 emit raw，不进优化 pipeline）
```ts
const BUILTINS: Record<string, (args: string[]) => string> = {
  say:    ([msg]) => `say ${msg}`,
  tell:   ([sel, msg]) => `tellraw ${sel} {"text":"${msg}"}`,
  title:  ([sel, msg]) => `title ${sel} title {"text":"${msg}"}`,
  give:   ([sel, item, count]) => `give ${sel} ${item} ${count ?? 1}`,
  kill:   ([sel]) => `kill ${sel ?? '@s'}`,
  effect: ([sel, eff, dur, amp]) => `effect give ${sel} ${eff} ${dur ?? 30} ${amp ?? 0}`,
  summon: ([type, x, y, z, nbt]) => `summon ${type} ${x ?? '~'} ${y ?? '~'} ${z ?? '~'} ${nbt ?? ''}`,
  random: ([min, max]) => null,  // special: needs execute store
}
// random(min, max) →
//   emit: raw(`execute store result score ${dst} rs run random value ${min} ${max}`)
//   return dst
```

#### @tick 装饰器
```
@tick fn game_loop() { ... }
→ IRFunction { isTickLoop: true, ... }
→ codegen 自动注册到 minecraft:tick tag

@tick(rate=N) fn slow_fn() { ... }
→ IRFunction { isTickLoop: true, tickRate: N }
→ codegen 生成 counter 逻辑:
    scoreboard players add $__tick_slow_fn rs 1
    execute if score $__tick_slow_fn rs matches N.. run function ns:slow_fn
    execute if score $__tick_slow_fn rs matches N.. run scoreboard players set $__tick_slow_fn rs 0
```

#### Selector 转字符串（在 raw/builtin emit 时）
```ts
function selectorToString(sel: EntitySelector): string {
  const { kind, filters } = sel
  if (!filters) return kind
  
  const parts: string[] = []
  if (filters.type) parts.push(`type=${filters.type}`)
  if (filters.distance) parts.push(`distance=${rangeToString(filters.distance)}`)
  if (filters.tag) filters.tag.forEach(t => parts.push(`tag=${t}`))
  if (filters.notTag) filters.notTag.forEach(t => parts.push(`tag=!${t}`))
  if (filters.limit) parts.push(`limit=${filters.limit}`)
  if (filters.sort) parts.push(`sort=${filters.sort}`)
  if (filters.scores) {
    const scoreStr = Object.entries(filters.scores)
      .map(([k, v]) => `${k}=${rangeToString(v)}`).join(',')
    parts.push(`scores={${scoreStr}}`)
  }
  if (filters.nbt) parts.push(`nbt=${filters.nbt}`)
  return parts.length ? `${kind}[${parts.join(', ')}]` : kind
}

function rangeToString(r: RangeExpr): string {
  if (r.min !== undefined && r.max !== undefined) return `${r.min}..${r.max}`
  if (r.min !== undefined) return `${r.min}..`
  if (r.max !== undefined) return `..${r.max}`
  return '..'
}
```

---

## 端到端测试用例

测试文件写在 `src/__tests__/e2e.test.ts`。

### 测试 1：简单函数
```rs
// input: src/test_programs/add.rs
fn add(a: int, b: int) -> int {
    return a + b;
}
```
预期输出 `data/test/function/add.mcfunction`:
```
# block: entry
scoreboard players operation $a rs = $p0 rs
scoreboard players operation $b rs = $p1 rs
scoreboard players operation $result rs = $a rs
scoreboard players operation $result rs += $b rs
return run scoreboard players get $result rs
```

### 测试 2：if/else
```rs
fn abs(x: int) -> int {
    if (x < 0) {
        return -x;
    } else {
        return x;
    }
}
```

### 测试 3：@tick + say
```rs
@tick(rate=20)
fn heartbeat() {
    say("still alive");
}
```
预期：生成 `minecraft:tick` tag，counter 逻辑，`say still alive`

### 测试 4：foreach
```rs
fn kill_zombies() {
    foreach (z in @e[type=zombie, distance=..10]) {
        kill(z);
    }
}
```
预期：entry 函数有 `execute as @e[type=zombie, distance=..10] run function test:kill_zombies/foreach_0`
子函数有 `kill @s`

### 测试 5：变量和 while
```rs
fn count_down() {
    let i: int = 10;
    while (i > 0) {
        i = i - 1;
    }
}
```

---

## 实现顺序

1. `src/ast/types.ts` — AST 类型定义（纯类型，不需要测试）
2. `src/lexer/index.ts` + `src/__tests__/lexer.test.ts`
3. `src/parser/index.ts` + `src/__tests__/parser.test.ts`
4. `src/lowering/index.ts` + `src/__tests__/lowering.test.ts`
5. `src/__tests__/e2e.test.ts` — 端到端

**每完成一个文件就 commit + push（小步提交）。**

---

## 编译器入口（最后）

```ts
// src/index.ts
import { Lexer } from './lexer'
import { Parser } from './parser'
import { Lowering } from './lowering'
import { optimize } from './optimizer/passes'
import { generateDatapack } from './codegen/mcfunction'

export function compile(source: string, namespace: string) {
  const tokens = new Lexer(source).tokenize()
  const ast = new Parser(tokens).parse()
  const ir = new Lowering(namespace).lower(ast)
  const optimized = { ...ir, functions: ir.functions.map(optimize) }
  return generateDatapack(optimized)
}
```

---

## 约束和注意事项

1. **MC 整数**：只有整数，`int` 是 32-bit signed。除法是截断除法（`Math.trunc`）。
2. **`@s` 是魔法变量**：在 `foreach`/`as` 块内，`entity` 变量绑定到 `@s`（当前执行者）。lowering 时 `kill(entity)` → `kill @s`。
3. **函数名冲突**：`foreach` 提取出的子函数要用父函数名作前缀，保证唯一。
4. **计分板 objective 名 `rs`**：所有变量用同一个 objective，fake player 名区分变量。
5. **`$ret` 是约定的返回值寄存器**。
6. **`$p0` `$p1` ... 是参数寄存器**。
7. **所有 fake player 名以 `$` 开头**，避免和真实玩家名冲突。
8. **`return` 命令（Java 1.20+）**：只用在函数最后。中途 return 需要条件跳转到 exit block。

---

## 参考资料

- `docs/mc-reference/commands.md` — 所有命令语法（已整理）
- `src/ir/types.ts` — IR 类型（你要输出这些）
- `src/ir/builder.ts` — IRBuilder API（用这个构建 IR）
- `src/codegen/mcfunction/index.ts` — codegen（了解它期望什么格式的 IR）
- `src/__tests__/optimizer.test.ts` — 看看测试风格

加油！
