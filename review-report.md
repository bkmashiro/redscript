# 0. 总体结论

RedScript 不是一个“还没有架构”的玩具编译器；它已经有 lexer / parser / AST / typechecker / HIR / MIR / LIR / optimizer / emitter / mc-validator / mc-test client / LSP / lint / incremental compile 等模块。主问题不是“完全没分层”，而是：

1. **分层边界已经存在，但编译入口仍然承担过多职责**，很多 import 合并、decorator 元信息抽取、runtime/singleton/memoize/benchmark 后处理都混在 `src/emit/compile.ts`。
2. **测试数量不少，但可信度分层不够清晰**：有 parser/typechecker/codegen/optimizer/mc-syntax/integration tests；但真正的 Paper server integration 在 CI 中是“offline graceful skip”，不是稳定的 headless oracle。
3. **Minecraft command 有效性验证目前是半自动化**：`MCCommandValidator` 有 Brigadier fixture + 特殊规则，但 `mc-syntax.test.ts` 明确跳过 macro lines 和 `function ... with storage`，这正好覆盖了 Minecraft 1.20.2+ function macro 相关高风险区域。
4. **redscript-testharness 方向正确**：它是 Paper 1.21.4 插件，暴露 HTTP API 控制服务器、scoreboard、block、entity、events、reset、reload；但 `redscript test --mc-url` 当前 runner 使用的 `/run`、`/score` endpoint 与 harness 实际暴露的 `/command`、`/scoreboard` 不一致，这是必须优先修的协议裂缝。
5. **语言功能面太宽**：语法同时包含通用语言特性、Rust-like/TS-like 抽象、Minecraft selector/execute/raw command、decorator runtime 模型、struct/enum/interface/lambda/Option 等。长期维护风险主要来自“语义承诺大于可验证能力”。

下面按你要求的结构展开。

---

# 1. 项目整体理解

## 1.1 redscript 是什么？

`redscript-mc` 是一个 TypeScript 实现的 RedScript 编译器，包描述是“high-level programming language that compiles to Minecraft datapacks”，CLI bin 包括 `redscript`、`rsc` 和 `redscript-lsp`。 README 的核心定位更直接：**“A typed language that compiles to Minecraft datapacks. Write clean code. Get vanilla datapacks. No mods required.”**

所以它不是 Bukkit/Paper 插件语言，而是**把 `.mcrs` DSL 编译为 vanilla datapack** 的 compiler toolchain。

## 1.2 输入语言长什么样？

输入是 `.mcrs`，语法大体是 C/TS/Rust 混合风格，再内嵌 Minecraft 领域对象。README 示例：

```rs
@tick fn check_rewards() {
    foreach (p in @a) {
        if (scoreboard_get(p, #points) >= 100) {
            scoreboard_add(p, #rewards, 1);
            scoreboard_set(p, #points, 0);
            give(p, "minecraft:diamond", 1);
            tell(p, "Reward claimed!");
        }
    }
}
```

README 还展示了 `@load`、`@tick`、selector、`foreach`、`effect` 等 Minecraft 集成语法。

从 AST 类型看，语言不仅有 `int/bool/float/fixed/string/void/BlockPos`，还有 entity/selector/tuple/Option、struct/enum/function type、lambda、array、match、foreach、execute block、raw command 等。

## 1.3 输出是什么？

输出是 datapack 文件集合。Emitter 文档写得很清楚：Stage 7 把 LIR module 转成 datapack files；每个 `LIRFunction` 生成一个 `.mcfunction`，路径形如 `data/<namespace>/function/<name>.mcfunction`。

当前 emitter 会生成：

* `pack.mcmeta`
* `data/<namespace>/function/*.mcfunction`
* `data/minecraft/tags/function/load.json`
* 条件存在的 `data/minecraft/tags/function/tick.json`
* event handler tag files
* profiler / benchmark / watch / throttle / retry / memoize runtime helper functions
* 可选 source map

相关代码在 `src/emit/index.ts`，例如它会写 `pack.mcmeta`、`load.mcfunction`、每个 LIR function 的 `.mcfunction`、以及 load/tick tag。

## 1.4 编译流程阶段

仓库已经有明确 pipeline。`src/emit/compile.ts` 文件头声明流程为：

> Source → Lexer → Parser → TypeCheck → HIR → MIR → Optimize → LIR → Emit

按实际代码看：

### lexer / parser

`src/lexer/index.ts` 定义 token，包括 keywords、primitive types、selector、decorator、literal、range、relative/local coord、raw command 等。 Lexer 还专门区分 `@a/@e/@s/@p/@r/@n` selector 和 `@tick/@on...` decorator。

Parser 是 recursive descent + precedence climbing，并通过继承链拆成 `Parser → DeclParser → StmtParser → ExprParser → TypeParser → ParserBase`。 顶层 `parse()` 处理 `namespace`、`module library`、global、struct、impl、interface、enum、const、declare、export、import、function，并有 parse error recovery。

### AST / IR

AST 集中在 `src/ast/types.ts`，这个文件既包含纯语言结构，也包含 Minecraft selector、execute subcommand、decorator/event/runtime 结构。

IR 层已经比较完整：

* MIR：三地址、显式 CFG、versioned temporaries。
* LIR：2-address、MC-specific typed nodes，接近 1:1 映射到 MC command。

这是项目非常值得保留的资产。

### semantic analysis

有 `src/typechecker/index.ts`。文件头说它在 Parser 和 Lowering 中间做 basic type checking，并且“collects errors but doesn't block compilation (warn mode)”；实际 `CompileOptions` 里也有 `lenient`。

TypeChecker 收集 functions、interfaces、globals、impl methods、structs、singletons、enums、consts，然后检查 function bodies。 它还检查 `@watch`、`@throttle`、`@retry`、`@profile`、`@benchmark`、`@memoize`、`@on(...)` decorator 的参数和函数签名。

### optimization

MIR optimizer 已有相当多 pass：loop unroll、LICM、NBT batch/coalesce、scoreboard batch read、constant fold、strength reduction、CSE、copy propagation、branch simplify、DCE、block merge、auto-inline、interprocedural const propagation。

LIR optimizer 有 `deadSlotElimModule`、`execStorePeephole`、`constImmFold`。

但也有一个重要信号：`selectorCache` 被明确排除在默认 pipeline 外，因为它会发出需要 codegen 支持的 synthetic `call_context`。 这说明“优化 pass 已写”不等于“端到端可用”。

### code generation

LIR 到 command 的最后一步主要在 `emitInstr()`。它把 `score_set`、`score_copy`、`score_add`、`store_score_to_nbt`、`call`、`call_macro`、`call_if_score`、`macro_line`、`raw` 等 LIR 指令直接映射为字符串命令。

`flattenExecute()` 是一个 command text 层 peephole optimizer，会把 `execute if A run execute if B run X` 合并为 `execute if A if B run X`。

### output packaging

普通 `compile` 直接输出文件；`publish` 命令会 zip datapack，并且 CLI 里有 `mcVersionToPackFormat()`。 但 emitter 自己的 `pack.mcmeta` 当前硬编码 `pack_format: 26`。 这导致 `compile` 和 `publish` 在版本 pack format 上有潜在不一致，是一个具体修复点。

## 1.5 redscript-testharness 的角色

`redscript-testharness` 是 Paper 1.21.4 插件，README 明确说它暴露 HTTP API，用于在真实 Minecraft server 上 integration testing RedScript compiled datapacks。

它提供：

* `/status`
* `/scoreboard`
* `/block`
* `/entity`
* `/chat`
* `/events`
* `/command`
* `/tick`
* `/reset`
* `/reload`

README 列出了这些 endpoint 和用途。 插件实际 `onEnable()` 中还注册了 `/player`、`/nbt`、`/scoreboard/dump`、`/storage/dump`。

主仓库中的 `MCTestClient` 是它的 TypeScript client，支持 command、ticks、scoreboard、block、entities、chat、events、reset、reload、dumpScores、dumpStorage、assert helpers。

## 1.6 当前最核心维护风险

核心风险不是单点 bug，而是**验证闭环不够硬**：

* 语言承诺范围很大。
* compiler pipeline 代码阶段多，但总入口仍混合大量跨阶段逻辑。
* `raw` 能绕过类型系统和 command validator。
* syntax validator 是 partial parser，且跳过 macro 相关命令。
* integration test 需要外部 live server，CI 里是 offline skip。
* test runner 和 testharness HTTP protocol 已经不一致。

这个组合会让你“不确定编译出来的代码是否真的有效”成为长期状态。

---

# 2. 当前测试体系审计

## 2.1 已有哪些测试？

仓库测试不少。`src/__tests__` 下有 parser、typechecker、lowering、MIR/LIR、optimizer、emit、mc-syntax、mc-validator、mc-integration、mc-test-client、stdlib、lint、formatter、incremental 等测试目录和文件。`package.json` 的 test script 是 `jest`，并有专门 `validate-mc` 跑 `mc-syntax.test.ts`。

代表性测试：

### Parser unit tests

`src/__tests__/parser.test.ts` 直接用 `Lexer` + `Parser` 解析字符串，并断言 Program / FnDecl / Stmt / Expr。它覆盖 namespace、function、decorator、types、enum、impl、if/else 等。

### Compile-all smoke test

`compile-all.test.ts` 会找仓库内所有 `.mcrs`，通过 CLI 编译，目标是防止语言变化破坏现有源码。 但 skip list 非常重要：它跳过 `test-datapacks/`、`src/templates/`、多个 example，以及“requires librarySources injection”“unsupported array-return-call patterns”等。 这说明它是 smoke test，不是完整语言正确性证明。

### MC syntax validation

`mc-syntax.test.ts` 会 compile source，抽出 `.mcfunction` 行，用 `MCCommandValidator` 验证。它当前验证 `shop/quiz/turret` 示例、string interpolation、f-string、array operations、match。 但它过滤掉 comments、macro lines `$...`、以及 `with storage` function calls。 这正是 command validation 的最大盲点之一。

### MC integration tests

`mc-integration.test.ts` 会把编译结果写到 `MC_SERVER_DIR/world/datapacks/redscript-test`，然后通过 `MCTestClient` 控制真实 Paper server。文件头明确要求 Paper server + TestHarnessPlugin，且 `MC_SERVER_DIR` 指向服务器目录。

它覆盖 tick、setblock/fill、scoreboard arithmetic、if/else、entity query、function return、match、while、event compile/load、struct/enum/array/break/continue/foreach、stdlib math 等。

### @test runner

`src/testing/runner.ts` 能解析 `@test` functions、生成 `__run_all_tests`，dry-run 时只验证编译。 但 live 模式使用 `/run` 和 `/score` endpoint。 当前 testharness 并没有注册 `/run` 或 `/score`，注册的是 `/command`、`/scoreboard` 等。 这是一个实际协议不一致问题。

## 2.2 这些测试覆盖了什么？

| 层级                                                           |       当前状态 | 评价                                                                  |
| ------------------------------------------------------------ | ---------: | ------------------------------------------------------------------- |
| Unit test：lexer/parser/AST/typechecker/codegen 小函数           |          有 | parser/typechecker/optimizer/emit/lir/mir 测试较多，但需要统一命名和 snapshot 策略 |
| Golden test：输入 RedScript，比较生成输出                              |          弱 | 现有测试多是包含性断言或行为断言，不是稳定 full artifact golden                          |
| Static validation：mcfunction/json/command/datapack structure | 有但 partial | `MCCommandValidator` 存在，但 macro / `with storage` 被跳过                |
| Simulator / interpreter test                                 |       基本缺失 | 没看到系统性的 scoreboard/storage/function subset interpreter              |
| Integration test：headless Paper server                       |  有但 CI 不硬跑 | 当前依赖外部服务器；CI 中 mc-integration 是 offline graceful skip               |
| Manual in-game test                                          |       未结构化 | README 还是“drop datapack into world and /reload”式手工路径                |

CI 当前 `npm test` 后还跑 `mc-integration`，但 env 设置为 `MC_OFFLINE=true`，步骤名称也是“offline - graceful skip”。 因此 PR 上并没有真正的 Minecraft oracle。

## 2.3 哪些行为必须进 Minecraft 才能验证？

这些需要真实 server 或 server-as-oracle：

* Brigadier 对完整 command 的解析，尤其 selector、NBT、JSON text、macro function。
* datapack reload 是否报错。
* `data/minecraft/tags/function/load.json` / `tick.json` 是否真的触发。
* scoreboard objective 是否存在、fake player 是否可用。
* entity selector 运行时匹配数量。
* `execute as/at/positioned/in/anchored` 上下文语义。
* block/world/entity/NBT 状态变化。
* Paper/Bukkit event bridge 行为。
* tick timing、schedule、coroutine、throttle、retry、watch。

## 2.4 哪些可以脱离 Minecraft 自动化？

这些不需要启动 Minecraft：

* lexer/parser snapshot
* AST snapshot
* semantic/type error tests
* import/module resolution tests
* HIR/MIR/LIR snapshot
* command IR structural validation
* datapack path/json structure validation
* reference resolution：function/tag/predicate/loot/advancement/storage namespace
* objective declaration/use analysis
* optimizer before/after IR equivalence on subset
* command text partial parser / whitelist validator
* fuzz parser 不崩溃
* golden output diff

## 2.5 当前 test harness 是否足够表达？

| 需求                  | 当前是否足够 | 说明                                                                            |
| ------------------- | -----: | ----------------------------------------------------------------------------- |
| 编译是否成功              |     部分 | compiler 自己能判断；harness 不负责 compile                                            |
| 输出结构是否正确            |     不足 | harness 只 reload/运行；需要 artifact validator                                     |
| 生成命令是否语法有效          |     部分 | static validator partial；server reload 可做 oracle，但目前 reload endpoint 不返回结构化错误 |
| 运行时行为是否符合预期         |    部分够 | scoreboard/block/entity/events 查询能力已可用                                        |
| Minecraft 内状态是否符合预期 |    部分够 | scoreboard/block/entity/storage dump 可查；storage dump 目前靠读 log，较脆弱             |
| CI 判断 pass/fail     |     不足 | 没有统一 test case descriptor 和 JSON result protocol                              |

`ResetHandler` 已能清 logs、forceload chunks、fill air、kill entities、reset scoreboard，非常适合做隔离基础。 但 `ReloadHandler` 捕获异常后只写 warning，最后仍返回 `{ok: true}`。 这不够做可靠 CI 判定。

## 2.6 当前最大盲区

最大盲区是：

**“编译成功 + partial command validation + optional live server”不能证明 datapack 在真实版本下完整 load/run 正确。**

具体表现：

1. macro / `function with storage` 没被 static validator 覆盖。
2. `redscript test --mc-url` 与 harness protocol 不一致，live @test 路径可能不可用。
3. CI 里没有 headless server oracle。
4. `compile-all` 跳过大量已知问题输入。
5. reload 和 command execution 没有结构化 capture Minecraft parse/runtime errors。
6. raw command 不 typecheck；TypeChecker 对 `raw` 明确“不检查”。

---

# 3. 如何减少人工进 Minecraft 实验

## A. 不启动 Minecraft 的测试

### A1. Parser snapshot tests

输入：`.mcrs` 源码字符串。

输出：稳定 JSON AST snapshot，去掉 span 或把 span 规范化。

示例：

```rs
@tick(rate=20)
fn heartbeat(): void {
  say("tick");
}
```

expected：

```json
{
  "namespace": "test",
  "declarations": [
    {
      "name": "heartbeat",
      "decorators": [{ "name": "tick", "args": { "rate": 20 } }],
      "returnType": "void"
    }
  ]
}
```

当前 parser tests 是手写 expect，建议保留，同时新增 `tests/parser/snapshots/*.snap.json`。Parser 已有独立入口，非常适合做这个。

### A2. AST snapshot tests

输入：真实 examples / stdlib 小片段。

输出：AST normalized snapshot。

重点覆盖：

* selector raw + parsed selector filter
* `execute ... {}` block
* `foreach`
* `match`
* decorators
* `raw("...")`
* `namespace` / `module library`
* import

注意：AST 现在混合语言语义和 MC 语义，snapshot 可以帮助你发现语法演进是否破坏 AST shape。

### A3. Type checking / semantic error tests

输入：错误 RedScript。

expected：diagnostic kind、message、line、col。

已有 diagnostics 支持 file/line/col 和 source pointer。 建议所有 error tests 都 snapshot JSON：

```json
{
  "kind": "TypeError",
  "message": "Default value for 'x' must be int, got string",
  "line": 3,
  "col": 12
}
```

必须覆盖：

* 未定义函数
* 参数数量错误
* default parameter 顺序错误
* `@watch` 参数错误
* `@memoize` 非 int 参数
* event handler 参数类型错误
* raw command 被 lint warning 标记为 unsafe

### A4. Code generation golden tests

输入：固定 `.mcrs`。

expected：

```text
pack.mcmeta
data/test/function/__load.mcfunction
data/test/function/main.mcfunction
data/minecraft/tags/function/load.json
```

以及每个文件内容 snapshot。

建议先从 10 个小 case 开始，不要一开始 golden 全部 examples。golden 的重点不是覆盖所有功能，而是**给 codegen refactor 提供回归锁**。

### A5. Generated command syntax validation

当前 `MCCommandValidator` 读取 Brigadier JSON，并对 `execute`、`scoreboard`、`function`、`data`、`return` 有特殊处理。

立即补强：

1. 不再跳过 `function ... with storage`。
2. 不再跳过 `$` macro line；至少验证 macro 展开后的 template root command。
3. `validateFunction()` 支持 `function <id> with storage <id>`。
4. 对 `tellraw/title/data modify` JSON/NBT 做 lightweight tokenizer，而不是简单 whitespace tokenizer。
5. fixture 按 MC version 命名：`mc-commands-1.20.4.json`、`1.21.4.json`。

### A6. Generated datapack/resource structure validation

新增 `src/validate/artifact.ts`：

检查：

* `pack.mcmeta` JSON 合法。
* `pack_format` 与 `mcVersion` 一致。
* 所有 `data/<namespace>/function/*.mcfunction` 路径合法。
* 所有 tag json 合法，`values` 是 string array。
* tag values 引用的 function 存在。
* function command 引用的 function 存在。
* objective name 长度/字符合法。
* namespace 小写合法。
* function path lower-case collision。

这是不启动 MC 的高收益 validator。

### A7. Property-based tests / fuzzing

建议加 `fast-check`：

* lexer 不崩溃：任意字符串要么 tokens，要么 DiagnosticError。
* parser 不死循环：随机 token-like source 不能 hang。
* roundtrip formatter：`parse(format(source))` 不崩。
* command tokenizer：随机 quotes/brackets/braces 不崩。
* optimizer invariant：MIR verify before/after 都通过。

目标不是证明正确，而是提前抓 crash 和 infinite loop。

---

## B. 启动 headless Minecraft server 的集成测试

### B1. 推荐目录结构

```text
tests/
  cases/
    hello_world/
      case.yaml
      main.mcrs
      expected-files.json
    scoreboard_addition/
      case.yaml
      main.mcrs
    tick_lifecycle/
      case.yaml
      main.mcrs

  golden/
    hello_world.snap/
    scoreboard_addition.snap/

  integration/
    run-case.ts
    install-datapack.ts
    assert.ts

docker/
  paper/
    Dockerfile
    server.properties
    eula.txt

.github/workflows/
  ci.yml
  mc-integration-nightly.yml
```

### B2. 每个 test case 如何描述？

建议 YAML：

```yaml
name: scoreboard_addition
source: main.mcrs
namespace: rs_test_add
minecraft_version: "1.21.4"
entrypoint: "rs_test_add:main"

compile:
  mc_version: "1.21.4"
  expect_success: true

install:
  datapack_name: "redscript-test-scoreboard-addition"

setup:
  - command: "scoreboard objectives add result dummy"
  - command: "scoreboard players set #input_a result 1"
  - command: "scoreboard players set #input_b result 2"

run:
  - command: "function rs_test_add:__load"
  - command: "function rs_test_add:main"
  - wait_ticks: 2

assert:
  - scoreboard:
      target: "#sum"
      objective: "result"
      equals: 3

cleanup:
  - command: "scoreboard objectives remove result"
```

### B3. test harness 和 compiler 如何通信？

不要让 Minecraft 插件调用 compiler。保持单向：

1. Node test runner 调用 RedScript compiler，得到 datapack files。
2. Node runner 把 datapack 安装到 server world。
3. Node runner 调用 harness `/reload`。
4. Node runner 调用 `/command` 执行 `/function ns:entry`。
5. Node runner 调用 `/scoreboard`、`/block`、`/entity`、`/storage/dump` 获取结果。
6. Node runner 输出 JSON pass/fail。

这和现有 `MCTestClient` 基本一致；它已经支持 command、ticks、scoreboard、block、entity、storage dump。

### B4. 自动 reset world

已有 `fullReset()` 对应 harness `/reset`，会 clear area、kill entities、reset scoreboards。 Harness 端还会 forceload chunks，然后 fill air / kill non-player entities / reset scoreboards。

建议新增：

```http
POST /world/reset
{
  "mode": "template",
  "template": "void-superflat",
  "datapacks": "clear"
}
```

短期不用真的重建 world；先做到：

* 每个 test 独立 namespace。
* 每个 test 独立 scoreboard objective prefix。
* 每个 test 前 `/reset`。
* 每个 suite 前清空 `world/datapacks/redscript-test-*`。
* 每个 test 后 kill `@e[tag=rs_test]`。

### B5. 如何收集 Minecraft 内执行结果？

当前可以收集：

* scoreboard：`/scoreboard`
* block：`/block`
* entity：`/entity`
* chat/events：`/chat`、`/events`
* full scoreboard objective dump：`/scoreboard/dump`
* storage raw dump：`/storage/dump`

`/storage/dump` 目前通过执行 `data get storage` 后读 `logs/latest.log` 抽取输出。 这能用，但建议升级为更结构化的方式：插件内直接调用 NMS/command feedback API 或至少返回 `raw` + `matched` + `logLines` + `commandOk`。

### B6. 如何避免 flaky tests？

现有代码有明显 flaky 来源：

* `MCTestClient.reload()` 固定 `await ticks(40)`。
* integration setup reload 后又 `setTimeout(5000)`。
* 很多测试只断言 “greater than 0” 或 tick margin。
* entity 测试依赖 chunk loaded、peaceful mode、kill timing。

改法：

1. `/reload` 返回 datapack reload 完成后的日志摘要和错误列表。
2. `/command` 返回 command success、captured feedback、exception、server tick。
3. 用 `/tick freeze` + `/tick step N` 做 tick-sensitive 测试；client 已有 `tickFreeze/tickStep/tickUnfreeze`，但应改成 server-side 确认 step 完成。
4. 每个测试 namespace/objective 唯一。
5. 每个测试只断言确定状态，不断言 wall-clock。
6. 使用 void superflat world，README 已经推荐，因为没有 terrain、mob spawn 更确定。

### B7. PR 跑哪些，nightly 跑哪些？

PR 每次跑：

* unit tests
* parser/typechecker snapshots
* golden tests
* artifact validator
* command static validator
* 5～10 个快速 headless Paper smoke cases：hello/load/function/scoreboard/if/tick

Nightly 跑：

* 全量 Paper integration
* 多 Minecraft 版本 matrix：1.20.4 / 1.21 / 1.21.4
* long-running tick/coroutine/watch/throttle/retry
* entity selector stress
* stdlib integration
* fuzzing longer budget
* performance regression / command count budget

---

## C. 最小人工测试

仍然必须人工测试的部分：

* 视觉效果：particle、title、actionbar、bossbar、sound 体验。
* 玩家交互手感：click/use/block break latency。
* multiplayer edge cases：多玩家 selector、权限、死亡/重连、team。
* client-side rendering：resource pack、模型、粒子密度、屏幕遮挡。
* tick-sensitive gameplay feel：竞技玩法、节奏、TPS 抖动体验。
* Paper 与 vanilla 差异可疑点。

人工测试 checklist：

```text
[ ] /reload 无红字、server log 无 datapack parse error
[ ] load function 执行一次，不重复初始化
[ ] tick function 在 20 TPS 下行为正常
[ ] 低 TPS 下不发生状态爆炸或重复触发
[ ] 多玩家加入/退出后 selector 行为正确
[ ] 无玩家在线时 tick/load 不抛错
[ ] 视觉效果位置、数量、持续时间可接受
[ ] bossbar/title/actionbar 不刷屏
[ ] scoreboard/sidebar 不污染其他 datapack
[ ] namespace 与已有 datapack 不冲突
[ ] world reset/restart 后状态恢复符合预期
[ ] Paper 与目标 vanilla 版本命令语法一致
```

---

# 4. 生成代码有效性验证体系

## 4.1 语法有效性

要验证：

* command parseable
* `.mcfunction` 每行合法
* JSON 合法
* datapack structure 符合目标版本
* macro command 合法
* `function ... with storage` 合法

当前 `MCCommandValidator` 是好的起点，但它是 partial validator。它读取 Brigadier JSON，root command 不存在会报错，并对 execute/scoreboard/function/data/return 做特殊处理。

必须补：

1. `function <id> with storage <storage>`。
2. `$` macro line 的 template validation。
3. JSON text/NBT path tokenizer。
4. version-specific Brigadier fixture。
5. server oracle fallback：把生成 datapack 自动 load 到 Paper，读取 reload errors。

## 4.2 静态语义有效性

新增 `ArtifactAnalyzer`：

检查项：

* `function ns:name` 是否存在。
* tag json 的 `values` 是否都存在。
* `load.json/tick.json` 是否路径正确。
* scoreboard objective 是否创建后使用。
* fake player/objective 名是否合法。
* storage namespace/path 是否一致。
* `data get storage ns path` 的 namespace 合法。
* advancement / predicate / loot table / item tag 引用是否存在。
* selector 是否可能过宽，例如 `@e` 无 type/limit 出现在 tick。
* namespace/function path lower-case collision。
* `fnNameToPath()` 会把 `::` 转 `/` 并 lower-case，必须检测 `Foo` vs `foo`、`A::B` vs `a/b` 等碰撞。
* objective 命名碰撞。比如 `singletonObjectiveName()` 注释说“hash suffix if needed”，但代码实际只是切片组合 `__${structName.slice(0,4)}_${fieldName.slice(0,8)}`。

## 4.3 动态语义有效性

用 harness 做：

* `/reload` 后检查日志无 datapack error。
* `/function ns:__load` 后检查 objective/storage 初始化。
* `/function ns:main` 后查 scoreboard/storage/block/entity。
* tick/load tag：step N ticks 后查状态。
* runtime error：command 返回 false 或 server log 有 error 时 fail。

建议扩展 harness：

```http
POST /command
{
  "cmd": "/function ns:main",
  "capture": true,
  "failOnErrorLog": true
}
```

返回：

```json
{
  "ok": true,
  "cmd": "/function ns:main",
  "tick": 12345,
  "feedback": ["Executed function ns:main"],
  "errors": []
}
```

当前 `/command` 只返回 `{ok, cmd}`，不含 feedback/error details。

## 4.4 行为等价性

目标：

* 优化前后行为一致。
* 重构 codegen 后行为一致。
* MC version 变化行为明确。

分三层做：

1. **IR interpreter equivalence**：对 scoreboard/storage/function subset，在 JS 内解释 MIR/LIR。
2. **Golden command diff**：小 case 保持输出稳定。
3. **Server equivalence**：同一 source，`--no-opt` 和 `--opt` 分别安装到两个 namespace，执行同一 test descriptor，比较 scoreboard/storage/block/entity 结果。

示例：

```text
compile source with opt=false → namespace rs_noopt
compile source with opt=true  → namespace rs_opt
run same setup/run/assert
compare declared observable state
```

## 4.5 务实 validators / linters / analyzers

优先实现：

1. `DatapackStructureValidator`
2. `CommandSyntaxValidator`
3. `FunctionReferenceResolver`
4. `ScoreboardObjectiveAnalyzer`
5. `NamespaceCollisionAnalyzer`
6. `TickCostAnalyzer`
7. `RawCommandLint`
8. `SelectorRiskLint`
9. `VersionCompatibilityValidator`
10. `ServerOracleValidator`

其中 `ServerOracleValidator` 是兜底：完全解析 Minecraft command 很难，所以用 Paper server reload + command execution 当 oracle。

---

# 5. 指令生成效率优化

## 5.1 当前 codegen 可能低效的点

### 已有优化能力

项目已经有 MIR/LIR optimizer，不是空白。MIR pipeline 有 constant folding、strength reduction、CSE、DCE、inlining、LICM、NBT/scoreboard batching 等。 LIR pipeline 有 dead slot、peephole、const immediate fold。

### 仍然可疑的低效点

1. **过多 `.mcfunction` 文件**
   每个 LIR function 一个 file，runtime helper 也会生成多个 file。 对小函数应更激进 inline；但必须保留 public entrypoint。

2. **重复 scoreboard temp 操作**
   LIR 是 2-address scoreboard slot 模型，容易产生 copy / const / op / write 链。需要 dead slot + const immediate + copy folding 更彻底。

3. **function call 层级**
   if/while/match lowering 如果为每个 block 生成 helper function，会增加 call overhead。LIR flat function + conditional call 应尽量减少 block function 碎片。

4. **tick 内 selector 成本**
   `@tick foreach @e` 是高危。已有 selector cache pass 但默认禁用，说明需要补 codegen support 后谨慎启用。

5. **raw command 阻断优化**
   `raw` 直接发字符串，TypeChecker 不检查，optimizer 也无法理解其 side effects。

6. **macro compat path 风险**
   pre-1.20.2 `macroLineCompat()` 只是 best-effort，把 `$(param)` 替换成 `{storage:rs:macro_args,path:param}`，注释也承认 dynamic numeric positions 不能真正 emulated。

7. **版本 pack_format 与 codegen option 不完全一致**
   `EmitOptions` 有 `mcVersion`，但 `pack.mcmeta` hardcoded 26。

## 5.2 优化方向逐项回答

| 问题                     | 当前判断                  | 建议                                                                  |
| ---------------------- | --------------------- | ------------------------------------------------------------------- |
| 过多 mcfunction 文件       | 可能                    | 小函数 auto-inline；只保留 exported/@tick/@load/@on/@test entrypoint       |
| 重复命令                   | 可能                    | LIR command canonicalization + adjacent command merge               |
| 重复 scoreboard 操作       | 很可能                   | copy-chain folding、single-use temp elimination、direct target update |
| 常量折叠                   | 已有                    | 加 golden + equivalence test，避免 regression                           |
| DCE                    | 已有                    | 扩展到 artifact-level unreachable function/tag pruning                 |
| CSE                    | 已有 MIR CSE            | 对 scoreboard_get/data_get 加 side-effect model                       |
| 减少 function call 层级    | 有空间                   | inline small pure functions；merge CFG fallthrough blocks            |
| 减少 tick 成本             | 重点                    | tick budget analyzer，selector risk lint，throttle lowering           |
| 避免不必要 selector         | 重点                    | selectorCache pass 端到端启用前先做 validation                              |
| 缓存 selector/scoreboard | 有空间                   | tick 内同 selector snapshot tag；scoreboard read batching              |
| 合并连续命令                 | 部分已有 fill batching 测试 | 扩展 setblock→fill、scoreboard set chains、tellraw batching             |
| 更短 namespace/objective | 谨慎                    | 短名 + hash suffix，避免碰撞                                               |
| tick 模型优化              | 重点                    | compile-time tick budget + coroutine batch splitting                |
| 局部/全局/跨函数优化            | 已有基础                  | 需要 pass-level metrics 和 behavior equivalence                        |

## 5.3 适合项目的 IR 设计

保留并强化四层：

```text
AST
  负责语法结构、source span、用户意图
  不做 Minecraft command 字符串

HIR
  负责语义消糖：foreach/execute/decorator/struct/enum/method
  保留高级概念和类型

MIR
  三地址 + CFG + typed operands
  做大多数优化：const fold, CSE, DCE, LICM, inline, branch simplify

Command IR / LIR
  Minecraft-specific typed command nodes
  负责 scoreboard/storage/function/execute/tag/resource reference
  仍不直接拼字符串

Emit Text
  纯 rendering：CommandIR -> .mcfunction lines + json files
```

当前 LIR 已接近 Command IR，但还缺：

* version-gated command node
* typed selector node
* typed NBT path / JSON text / resource location
* artifact references
* command side-effect classification
* raw command wrapper `UnsafeRawCommand`

## 5.4 优化例子

### 例子 1：setblock batching

仓库已有真实 integration case：

```rs
fn build_row() {
  setblock((0, 70, 0), "minecraft:stone");
  setblock((1, 70, 0), "minecraft:stone");
  setblock((2, 70, 0), "minecraft:stone");
  setblock((3, 70, 0), "minecraft:stone");
}
```

测试注释明确这是“setblock batching optimizer — 4 adjacent setblocks → fill”，integration 还验证 0..3 都是 stone，邻居 -1 和 4 是 air。

低效：

```mcfunction
setblock 0 70 0 minecraft:stone
setblock 1 70 0 minecraft:stone
setblock 2 70 0 minecraft:stone
setblock 3 70 0 minecraft:stone
```

优化：

```mcfunction
fill 0 70 0 3 70 0 minecraft:stone
```

这个 pass 很适合放在 Command IR 层，因为它需要识别连续 block commands 和坐标邻接。

### 例子 2：scoreboard read-modify-write

仓库已有 RMW integration case：

```rs
fn chain_rmw() {
  scoreboard_set("#rmw", #v, 1);
  let v: int = scoreboard_get("#rmw", #v);
  scoreboard_set("#rmw", #v, v * 2);
  v = scoreboard_get("#rmw", #v);
  scoreboard_set("#rmw", #v, v * 2);
  v = scoreboard_get("#rmw", #v);
  scoreboard_set("#rmw", #v, v * 2);
}
```

测试期望最终 `#rmw/v = 8`。

可能低效形态：

```mcfunction
execute store result score $t0 __ns run scoreboard players get #rmw v
scoreboard players operation $t1 __ns = $t0 __ns
scoreboard players operation $t1 __ns *= #const_2 __ns
scoreboard players operation #rmw v = $t1 __ns
```

可优化为：

```mcfunction
scoreboard players operation #rmw v *= #const_2 __ns
```

前提：

* 读写的是同一个 scoreboard slot。
* 中间没有 raw command / data command / function call 可能改写该 score。
* 常量 `2` 已可用或可 immediate-fold。

这个属于 MIR + LIR 跨层优化：MIR 识别 RMW pattern，LIR 做 direct scoreboard op。

---

# 6. 语言语法设计审计

## 6.1 总体评价

RedScript 当前语法有两个方向同时存在：

1. 通用程序语言：function、let、struct、enum、interface、lambda、Option、array、match、for/while。
2. Minecraft DSL：selector、execute block、decorator、scoreboard、storage/NBT、raw command、tick/load/event lifecycle。

这不是错，但目前**抽象层级不够统一**。一些功能像是“通用语言”，一些又是“Minecraft command 的薄包装”。这会导致：

* 语法学习成本高。
* 静态检查难。
* codegen 特例多。
* README feature 与 AST/typing 支持容易 drift。

一个具体例子：README 宣称 `Result<int, string>`，但 AST TypeNode 明确有 `option`，没有 dedicated `result` type。  这可能通过 enum/stdlib 模拟，但从语言设计角度，文档承诺和核心 AST 模型应保持一致。

另一个具体例子：`builtins.d.mcrs` 使用 `coord` 类型，比如 `summon(type: string, x: coord = ~, ...)`，但 AST primitive type 列表没有 `coord`。  如果 parser/type system 没有独立处理，这会形成 builtins 与 type model 漂移。

## 6.2 与 Minecraft 命令模型是否自然匹配？

匹配得比较好的部分：

* `@tick`、`@load` 直接对应 datapack lifecycle。
* selector 作为 first-class literal 很自然。
* `foreach (p in @a)` 对 `execute as @a` 抽象合理。
* `execute` block / `as` / `at` / `positioned` 是 Minecraft command model 的自然抽象。
* `scoreboard_get/set` 是必要低层 escape。

不够自然的部分：

* struct/interface/lambda/generic 如果没有清晰 runtime model，会让用户以为它是完整通用语言，但最终都落到 scoreboard/storage/function，语义成本很高。
* `raw("...")` 是必要 escape hatch，但现在太容易绕过验证。
* decorator 数量过多：`@tick(rate=N)`、`@throttle`、`@schedule`、`@retry`、`@watch`、`@coroutine`、`@benchmark`、`@profile`、`@memoize` 都在 FnDecl decorator union 里。 这会让 compile pipeline 和 runtime helpers 快速膨胀。

## 6.3 哪些语法应该保留？

保留并加强：

* `namespace`
* `import`
* `fn`
* `let`
* `if/else`
* `match`
* `foreach selector`
* `@load`
* `@tick`
* `@on(Event)`
* selector literal
* execute context block
* `BlockPos`
* f-string
* scoreboard/storage builtins
* `module library`

这些与 Minecraft datapack 模型直接相关，且静态检查价值高。

## 6.4 哪些语法应该废弃或降级？

建议降级为 experimental：

* `interface`
* generic function
* lambda / function type
* complex struct inheritance
* `Option` beyond simple pattern use
* advanced decorators：`@retry`、`@memoize`、`@benchmark`、`@profile`，除非已有稳定 runtime tests

建议废弃或重命名：

* 裸 `raw("...")` → `unsafe raw("...")` 或 `mc { ... }`
* `fixed` → 明确为 `score_fixed` 或 `fixed<scale>`，避免误解为普通 fixed-point number。
* `selector` → `Selector<T>`，例如 `Selector<Player>`，和 AST 里已有 `selector` parameterized type 对齐。
* `@tick(rate=N)` 与 `@throttle(ticks=N)` 二者语义要统一：一个保留，一个降级为 sugar。

## 6.5 更合理的语法方向

建议核心设计原则：

```rs
namespace mypack;

resource objective points: dummy;
resource storage state: mypack:state;

@load
fn init() {
  objective points ensure;
}

@tick(every = 20)
fn reward_tick() {
  for p in players(tag = "playing") {
    let pts: score = p.score(points);
    if pts >= 100 {
      p.give("minecraft:diamond", 1);
      p.score(points).set(0);
    }
  }
}

@test
fn test_reward() {
  given score("#p", points) = 100;
  run reward_tick();
  expect score("#p", points) == 0;
}
```

也就是：

* 把 scoreboard/storage/function/tag/predicate/advancement 显式建模为 typed resources。
* 把测试语法作为语言一等能力，而不是外部手写 harness。
* 把 raw command 降到 unsafe escape。
* 把 version-specific 能力标注在 resource/command IR 上。

---

# 7. 重构建议路线图

## Phase 0：保命修复

### 目标

不大改架构，让项目能测、能跑、能防回归。

### 改动范围

1. 修 `redscript test --mc-url` 与 harness protocol 不一致：

   * runner 改用 `/command` 和 `/scoreboard`。
   * 或 harness 增加 `/run`、`/score` compatibility endpoint。
2. 修 `pack.mcmeta` hardcoded `pack_format: 26`。
3. `mc-syntax.test.ts` 不再跳过 `with storage`。
4. 为 macro line 增加最小 validation。
5. 建立 10 个 golden tests。
6. CI 中区分 `unit`、`static`、`integration-offline`，不要把 offline skip 冒充 integration pass。
7. 给 `raw` 增加 lint warning。

### 风险

低。主要是 snapshot 初始落地会产生 diff 噪音。

### 收益

立即降低“不知道生成物能否用”的不确定性。

### MVP

* `tests/golden/hello_world`
* `tests/golden/scoreboard_add`
* `tests/static/macro_with_storage`
* `redscript test --dry-run` 和 `--mc-url` 行为一致

### 推荐 PR 拆分

1. `fix(testing): align @test runner with harness endpoints`
2. `fix(emit): versioned pack_format in compile output`
3. `test(golden): add initial codegen snapshots`
4. `test(mc-syntax): validate function macros`
5. `lint: warn on unsafe raw command`

---

## Phase 1：编译 pipeline 清晰化

### 目标

把现有阶段边界从“目录存在”升级为“数据契约清晰”。

### 推荐结构

```text
src/
  frontend/
    lexer/
    parser/
    ast/
    preprocess/
  semantic/
    symbols/
    typecheck/
    decorators/
    resources/
  ir/
    hir/
    mir/
    lir/
    command/
  optimize/
    mir/
    lir/
    command/
  codegen/
    lower-to-command-ir.ts
    render-mcfunction.ts
    render-json.ts
  emit/
    artifact.ts
    datapack.ts
  validate/
    artifact.ts
    command.ts
    references.ts
    version.ts
  cli/
  testing/
```

结合实际仓库，不建议一次移动所有目录。先新增 `src/pipeline/compilePipeline.ts`，把 `src/emit/compile.ts` 里的阶段拆成小函数：

```ts
parseSource()
resolveImports()
mergeModules()
runTypecheck()
lowerToHIRStage()
lowerToMIRStage()
optimizeMIRStage()
lowerToLIRStage()
optimizeLIRStage()
collectRuntimeMetadata()
emitDatapack()
validateArtifacts()
```

### 风险

中。移动文件会影响 import path、tests、LSP。

### 收益

后续可以单独 snapshot 每个 stage。

### MVP

`compile()` 行为不变，但内部每个 stage 都可单测。

### PR 拆分

1. `refactor(pipeline): extract parse/import/typecheck stages`
2. `refactor(pipeline): extract IR lowering stages`
3. `refactor(pipeline): extract runtime metadata collection`
4. `test(pipeline): stage snapshots`

---

## Phase 2：IR 与 validation

### 目标

引入 Command IR 和 artifact validator。

### 改动范围

* `CommandIR`：typed command AST。
* `ResourceRef`：function/storage/objective/tag/predicate/advancement。
* `ArtifactGraph`：files + references。
* `VersionProfile`：MC version -> pack_format、command capabilities。
* `validateArtifacts()` 默认在 compile 后运行，可通过 `--no-validate` 禁用。

### 风险

中高。Command IR 会触及 emitter 和 tests。

### 收益

大幅减少 string concatenation 风险，让 static validation 和 optimization 更可靠。

### MVP

先只建 scoreboard/function/data/execute/tellraw/raw command nodes，覆盖现有 emitInstr 主要分支。

### PR 拆分

1. `feat(command-ir): add typed command nodes`
2. `refactor(emit): render LIR through command-ir`
3. `feat(validate): artifact reference resolver`
4. `feat(validate): versioned pack_format and path validation`
5. `test(validate): invalid function/objective/storage cases`

---

## Phase 3：Minecraft integration CI

### 目标

真正 headless server test，而不是 offline skip。

### 改动范围

* redscript-testharness Docker build
* Paper download/cache
* GitHub Actions service/job
* test descriptor runner
* structured JSON result
* nightly matrix

### 风险

中。CI 时间、Paper download、flakiness。

### 收益

最高。它直接回答“生成代码是否真的有效”。

### MVP

PR 上只跑 5 个 smoke cases：

1. load function
2. scoreboard addition
3. function call return
4. tick increments
5. setblock/fill

### PR 拆分

1. `ci(harness): build plugin jar in workflow`
2. `ci(mc): start paper server headless`
3. `test(integration): descriptor runner`
4. `test(integration): smoke case set`
5. `ci(nightly): full matrix`

---

## Phase 4：语言设计升级

### 目标

重新审视语法，逐步迁移，不推倒重写。

### 改动范围

* typed resource declarations
* test syntax
* unsafe raw command
* selector type refinements
* module namespace cleanup
* compatibility layer

### 风险

高。会影响用户代码。

### 收益

长期可维护性提升最大。

### MVP

新增语法，不破坏旧语法：

```rs
resource objective points: dummy;
unsafe raw("...");
@test fn ...
```

旧 `raw()` 保留但 lint warning。

### PR 拆分

1. `feat(lang): resource objective declarations`
2. `feat(lang): unsafe raw syntax`
3. `feat(test): first-class test assertions`
4. `feat(lang): selector typed aliases`
5. `chore(compat): deprecation diagnostics`

---

# 8. 推荐高价值测试用例设计

下面每个 case 都应至少有：unit/golden/static；部分加 integration。

| 用例                    | RedScript 输入                                                                                            | expected compile result               | expected files                                              | expected MC state/output                                    | 层级                        |
| --------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- | ------------------------- |
| hello world           | `@load fn init(){ say("hello"); }`                                                                      | success                               | `pack.mcmeta`, `data/ns/function/init.mcfunction`, load tag | reload 后可 `/function ns:init`，chat/log 有 hello 或 command ok | golden/static/integration |
| function 定义调用         | `fn add(x:int,y:int)->int{return x+y;} fn main(){let z:int=add(1,2); scoreboard_set("#r",#out,z);}`     | success                               | `add.mcfunction`, `main.mcfunction`                         | `#r/out=3`                                                  | unit/golden/integration   |
| scoreboard 变量读写       | `fn main(){scoreboard_set("#a",#v,1); let x:int=scoreboard_get("#a",#v); scoreboard_set("#b",#v,x+2);}` | success                               | main file                                                   | `#b/v=3`                                                    | static/integration        |
| 条件判断                  | `if (x > 5) ... else ...`                                                                               | success                               | branch helper 或 conditional commands                        | x=6 -> 1, x=5 -> 0                                          | unit/golden/integration   |
| 循环                    | `for i in 0..5 { ... }` / `while`                                                                       | success                               | loop functions/commands                                     | counter exact N                                             | unit/golden/integration   |
| entity selector       | `foreach (e in @e[type=minecraft:armor_stand]) { ... }`                                                 | success                               | execute as selector                                         | spawned 3 -> count 3                                        | static/integration        |
| storage/NBT           | `data_get` / array push/pop                                                                             | success                               | data commands                                               | storage value equals expected                               | static/integration        |
| namespace 冲突          | `fn Foo(){ } fn foo(){ }`                                                                               | compile fail 或 validator fail         | none                                                        | collision diagnostic                                        | unit/static               |
| 未定义引用                 | `fn main(){ missing(); }`                                                                               | semantic error                        | none                                                        | diagnostic snapshot                                         | unit                      |
| 类型错误                  | `let x:int="s";`                                                                                        | TypeError                             | none                                                        | line/col snapshot                                           | unit                      |
| 无效 command 生成         | `unsafe raw("scoreboard players set A obj nope")`                                                       | compile success + static command fail | raw emitted                                                 | validator error                                             | static                    |
| 优化等价                  | setblock x4                                                                                             | opt/noopt both success                | opt has fill                                                | same 4 blocks stone                                         | golden/integration        |
| 多文件项目                 | `import math;` + include dir                                                                            | success                               | merged module output                                        | stdlib result correct                                       | unit/static/integration   |
| load/tick 生命周期        | `@load init`, `@tick loop`                                                                              | success                               | load/tick tags                                              | init once, tick N times                                     | integration               |
| 错误信息 snapshot         | syntax/type/lowering error                                                                              | fail                                  | none                                                        | JSON diagnostic stable                                      | unit                      |
| fuzz parser           | random source                                                                                           | no crash/hang                         | none                                                        | DiagnosticError or Program                                  | fuzz                      |
| known bugs regression | PR #38 `!=`, PR #44 return retSlot                                                                      | success + expected command            | generated `unless score` / correct `$ret`                   | behavior correct                                            | unit/golden/integration   |

已知 bug/regression 来源可以来自 open PR / commit history：例如 open PR #44 指向 LIR lowering 中 `retSlot` 未使用、`return_value` 是否正确复制 `$ret` 的问题。 近期 commit 也显示修过 `ne` inequality operator、跳过 known-broken examples、修 AI-generated expectations。

---

# 9. test harness 协议设计

## 9.1 推荐协议

```text
Node runner
  compile RedScript
  validate artifacts
  install datapack
  POST /reload
  POST /reset
  run setup commands
  run entrypoint
  wait ticks
  query assertions
  output JSON
```

## 9.2 测试描述格式

```yaml
schema: redscript.mc-test/v1
name: scoreboard_addition
source: tests/cases/scoreboard_addition/main.mcrs
namespace: redscript_test_add
minecraft_version: "1.21.4"
entrypoint: "redscript_test_add:main"

compile:
  optimize: true
  expect_success: true
  validators:
    - artifact
    - command_syntax
    - references

server:
  datapack_name: "redscript-test-addition"
  reset:
    clear_area: true
    kill_entities: true
    reset_scoreboards: true
    area: [-50, 0, -50, 50, 100, 50]

setup:
  - command: "scoreboard objectives add test dummy"
  - command: "scoreboard players set #a test 1"
  - command: "scoreboard players set #b test 2"

run:
  - command: "function redscript_test_add:__load"
  - command: "function redscript_test_add:main"
  - wait_ticks: 5

assert:
  - scoreboard:
      target: "#result"
      objective: "test"
      equals: 3
  - storage:
      storage: "redscript_test_add:state"
      path: "result.value"
      equals: 3
      optional: true

teardown:
  - command: "scoreboard objectives remove test"
```

## 9.3 Harness 应该新增 / 改造的 endpoint

已有 endpoint 可保留，但建议新增：

### `POST /datapack/install`

```json
{
  "name": "redscript-test-addition",
  "files": [
    {
      "path": "pack.mcmeta",
      "content": "{...}"
    }
  ],
  "clearExisting": true
}
```

避免 Node runner 直接写 server filesystem，方便 Docker/remote server。

### `POST /reload`

返回结构化结果：

```json
{
  "ok": true,
  "tick": 1234,
  "durationMs": 921,
  "errors": [],
  "warnings": [],
  "datapacks": ["redscript-test-addition"]
}
```

当前 `ReloadHandler` 总是 `{ok: true}`，需要改。

### `POST /command`

返回 command feedback：

```json
{
  "ok": true,
  "cmd": "/function ns:main",
  "tick": 1240,
  "feedback": [
    "Executed 12 commands from function ns:main"
  ],
  "errors": []
}
```

### `POST /assert`

可选，把常用断言放 server side：

```json
{
  "scoreboard": {
    "target": "#result",
    "objective": "test",
    "equals": 3
  }
}
```

## 9.4 CI JSON result

Runner 最终输出：

```json
{
  "schema": "redscript.mc-test-result/v1",
  "suite": "integration-smoke",
  "minecraftVersion": "1.21.4",
  "paperVersion": "1.21.4-232",
  "compilerVersion": "3.0.2",
  "summary": {
    "passed": 12,
    "failed": 0,
    "skipped": 0,
    "durationMs": 42133
  },
  "tests": [
    {
      "name": "scoreboard_addition",
      "status": "passed",
      "durationMs": 612,
      "artifacts": {
        "fileCount": 4,
        "commandCount": 18
      },
      "assertions": [
        {
          "type": "scoreboard",
          "target": "#result",
          "objective": "test",
          "expected": 3,
          "actual": 3,
          "passed": true
        }
      ]
    }
  ],
  "serverErrors": [],
  "logs": {
    "reload": [],
    "commands": []
  }
}
```

---

# 10. 错误信息与开发者体验 DX

## 10.1 当前状态

已有：

* `DiagnosticError` 区分 `LexError | ParseError | LoweringError | TypeError`。
* 诊断包含 file/line/col。
* formatter 能打印 source pointer。
* CLI `check --format json` 能输出 diagnostics JSON。
* CLI 有 `--source-map`。
* README 宣称 LSP、VSCode extension。

不足：

* span 只有 line/col，endLine/endCol 在 AST 有但不系统使用。
* 相似名称提示未见系统实现。
* codegen internal error 与 lowering error 可能混在一起。
* 没有统一 `--dump-ast --dump-hir --dump-mir --dump-lir --dump-command-ir`。
* 没有“解释这段 RedScript 生成了哪些 MC commands”的稳定 CLI。
* source map 已有选项，但需要和 `.mcfunction` 注释、JSON map、LSP hover 联动。

## 10.2 短期建议

1. `redscript check --format json` 作为所有 tests 的 diagnostic snapshot 标准。
2. `DiagnosticKind` 增加：

   * `SemanticError`
   * `CodegenError`
   * `ValidationError`
   * `InternalCompilerError`
3. 所有 compiler crash 包装为 internal error，并附 stage。
4. 增加 `--dump-stage mir,lir,commands`。
5. `raw` warning 显示 source span。

## 10.3 长期建议

1. LSP hover 显示 generated commands。
2. “go to generated function” source map。
3. formatter 与 parser snapshot 双向测试。
4. resource reference autocomplete。
5. version-specific diagnostics：例如“function macro requires MC >= 1.20.2”。

---

# 11. 代码质量和维护性审计

## 11.1 模块边界

目录层面已经拆分较好；问题在 `src/emit/compile.ts` 承担了过多 orchestration 和跨阶段修补。它处理 lex/parse、module imports、library parsing/merging、typecheck、HIR、decorator metadata、MIR、optimization、LIR、budget、singleton injection、memoize/benchmark renaming、emit、prune、error wrapping。

建议：把它从“实际 compiler”降级为“pipeline coordinator”。

## 11.2 parser/codegen 耦合

AST 里 Minecraft-specific execute/selectors/raw/decorators 与通用语法混在一起。短期可以接受，但中期应把“surface AST”与“semantic HIR”明确分开，让 parser 不知道 runtime helper 和 codegen policy。

## 11.3 隐式全局状态

风险点：

* namespace/objective 默认派生。
* `__<namespace>` objective 全局共享。
* runtime helper 名 `__watch_*`、`__throttle_*`、`__retry_*`、`__memo_*` 需要 collision check。
* function lower-case path conversion 需要 symbol table 约束。

## 11.4 string concatenation codegen

`emitInstr()` 直接拼字符串，虽然 LIR typed，但最终 command grammar 仍未类型化。 建议引入 Command IR 后再 render。

## 11.5 错误处理

TypeChecker 有 collector；parser 有 recovery；compile 会把普通 Error 包装为 `LoweringError`。 建议每个 stage 都返回 `Result<T, Diagnostics>` 或抛 `DiagnosticBundleError`，不要靠 message parse。

## 11.6 version-specific Minecraft 逻辑散落

`emitInstr()` 根据 `mcVersion` 处理 macro call；CLI `publish` 单独有 pack format mapping；emitter hardcode pack_format。   应集中到 `VersionProfile`。

## 11.7 文件级建议

| 文件                                           | 建议                                                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/compile.ts`                             | 当前 regex preprocess import `"..."`，适合短期；长期改为 parser-level import resolver，避免字符串级 include 破坏 span。 |
| `src/emit/compile.ts`                        | 拆 pipeline；不要在这里做 decorator metadata、runtime injection、DCE prune 全部逻辑                             |
| `src/lexer/index.ts`                         | `raw("...")` 作为 lexer special case 会让 raw 不像普通函数；建议改成 parser/semantic 层 unsafe construct          |
| `src/ast/types.ts`                           | 拆 pure AST、MC AST extension、decorator metadata                                                    |
| `src/typechecker/index.ts`                   | 拆 symbol collection、type inference、decorator validation、entity selector typing、interface checking |
| `src/mir/types.ts`                           | 保留；补 side-effect model                                                                            |
| `src/lir/types.ts`                           | 保留；升级为 Command IR 或在其后新增 Command IR                                                               |
| `src/emit/index.ts`                          | render-only；移除 pack version decision；减少 raw string 拼接                                             |
| `src/mc-validator/index.ts`                  | 支持 macro、version、artifact context；不要只验证单行 command                                                 |
| `src/testing/runner.ts`                      | 修 endpoint；支持 YAML descriptor；输出 JSON                                                             |
| `src/mc-test/client.ts`                      | 移除固定 sleep；`reload()` 等待结构化 server result                                                         |
| `redscript-testharness/Handlers.kt`          | `/reload`、`/command` 返回 logs/errors；新增 datapack install；storage dump 不应依赖 log scraping            |
| `redscript-testharness/GameEventListener.kt` | 当前 chat 只捕获 player chat/death message；`/say`/`tellraw` 未必能完整捕获，测试要避免把 chat 当唯一 oracle。            |

---

# 12. 最终输出

## 12.1 Top 10 最重要问题，按严重程度排序

1. **`redscript test --mc-url` 与 testharness endpoint 不一致**：runner 用 `/run`、`/score`，harness 没有这两个 endpoint。
2. **CI 没有真正运行 headless Minecraft integration**：当前是 offline graceful skip。
3. **command syntax validation 跳过 macro 和 `with storage`**，覆盖不到高风险 command macro。
4. **compile output 的 `pack.mcmeta` hardcoded pack_format 26**，而 publish 另有 version mapping。
5. **`compile-all` skip list 暴露大量 unsupported / brittle examples**，但容易让人误以为全仓库可编译。
6. **`src/emit/compile.ts` 职责过重**，阶段边界实际不够硬。
7. **`raw` command 绕过 typecheck、optimizer、validator**。
8. **namespace/function/objective collision 缺少系统 validator**，尤其 lower-case path 和 singleton objective truncation。
9. **reload/command server oracle 返回信息不够结构化**，无法可靠判断 datapack parse/runtime error。
10. **语言功能面过宽，文档/AST/builtins/type system 有 drift 风险**，例如 `Result`、`coord` 类型承诺。

## 12.2 Top 10 最值得做的改进，按收益 / 成本排序

1. 修 `redscript test --mc-url` endpoint 协议。
2. `pack_format` 统一走 `VersionProfile`。
3. 建立 10 个 golden tests。
4. `mc-syntax` 覆盖 macro / `with storage`。
5. 新增 artifact validator：path/json/function reference/objective/namespace。
6. `raw` 加 unsafe lint + static command validation。
7. CI 加最小 Paper smoke tests。
8. `/reload` 和 `/command` 返回 structured errors/logs。
9. 加 command count / tick budget regression。
10. 新增 `--dump-ast/hir/mir/lir/commands`，提升 debug 能力。

## 12.3 测试体系路线图

```text
Week 1:
  parser/typechecker diagnostic snapshots
  initial codegen golden tests
  artifact validator MVP

Week 2:
  command validator macro support
  @test runner protocol fix
  CI separates unit/static/integration clearly

Month 1:
  test descriptor runner
  Paper Docker smoke CI
  server structured reload/command results

Month 2:
  nightly multi-version integration
  optimizer equivalence tests
  scoreboard/storage subset simulator

Long-term:
  first-class RedScript test syntax
  behavior equivalence matrix
  performance budget gates
```

## 12.4 编译 pipeline 重构路线图

```text
Now:
  compile.ts / emit/compile.ts are entrypoints

Phase 1:
  extract parse/import/typecheck/lower/opt/emit stages

Phase 2:
  add stage snapshots and explicit stage result types

Phase 3:
  introduce Command IR after LIR

Phase 4:
  artifact graph + validators become default compile step

Phase 5:
  version profiles own all MC-version-specific behavior
```

## 12.5 语法设计改进路线图

```text
Short-term:
  document stable vs experimental syntax
  unsafe raw warning
  resource/objective/storage declaration proposal

Medium-term:
  typed resources
  Selector<T>
  unified tick/throttle/schedule model
  @test assertion syntax

Long-term:
  smaller stable core
  compatibility layer for old syntax
  language server understands resources and generated commands
```

## 12.6 2 周内最小计划

第 1 周：

* 修 `testing/runner.ts` live mode，用 `/command` 和 `/scoreboard`。
* `emit/index.ts` 使用 `mcVersionToPackFormat` 等价逻辑。
* 加 golden framework：hello、function call、scoreboard、if、tick。
* `mc-syntax` 支持 `function ... with storage`。
* 给 `raw` 加 lint warning。

第 2 周：

* artifact validator MVP。
* CI 中明确 `npm test`、`npm run validate-mc`、`golden`。
* redscript-testharness `/reload` 返回 errors/log tail。
* 5 个 Paper smoke tests 在独立 workflow 中可手动触发。
* 文档写明哪些测试是 static，哪些是 real server。

## 12.7 2 个月中期计划

* Command IR MVP。
* Function/objective/storage reference resolver。
* Test descriptor runner。
* Paper Docker GitHub Actions smoke PR gate。
* Nightly full integration。
* 多版本 command fixture。
* Optimizer equivalence suite。
* Tick budget analyzer。
* `--dump-stage` CLI。
* LSP diagnostic 与 generated command/source map 初步联动。

## 12.8 长期理想架构

```text
RedScript Source
  ↓
Preprocess / Import Resolver
  ↓
Lexer / Parser
  ↓
Surface AST
  ↓
Semantic AST + Symbol Table + Resource Table
  ↓
HIR
  ↓
MIR CFG
  ↓
MIR Optimizer
  ↓
LIR / Command IR
  ↓
Command Optimizer
  ↓
Artifact Graph
  ↓
Validators
  - syntax
  - references
  - namespace/objective/path collision
  - version compatibility
  - tick budget
  ↓
Emit Datapack
  ↓
Optional Server Oracle
  - reload
  - run test functions
  - assert scoreboard/storage/block/entity
```

这条路线不要求推倒重写。它优先把现有资产固化：MIR/LIR、optimizer、mc-validator、testharness、MCTestClient 都能继续用；真正要改变的是“验证闭环”和“阶段契约”。当前项目已经有足够基础，最务实的下一步不是改语法，而是先让每次 PR 都能回答一个问题：**这个 `.mcrs` 编译出的 datapack，在目标 Minecraft 版本上能 reload、能执行、能产生预期状态吗？**
