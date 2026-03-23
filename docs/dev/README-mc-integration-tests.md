# MC Integration Tests — 操作手册

RedScript 有两层测试：

1. **单元/e2e 测试**：纯编译器，不需要 MC 服务器，直接 `npm test`
2. **MC 联动测试**：需要 Paper 服务器 + TestHarness 插件，测试生成的 mcfunction 在真实 MC 里是否正确执行

---

## 快速跑法

```bash
# 1. 确认服务器在跑
curl http://localhost:25561/status

# 2. 跑所有 MC 联动测试
cd ~/projects/redscript
MC_SERVER_DIR=~/mc-test-server MC_PORT=25561 npx jest src/__tests__/mc-integration/ --testTimeout=120000 --no-coverage --forceExit

# 3. 跑单个测试文件
MC_SERVER_DIR=~/mc-test-server MC_PORT=25561 npx jest say-fstring --testTimeout=60000 --forceExit
```

服务器不在线时，测试会自动跳过（不报错），只有编译时测试会跑。

---

## 启动 Paper 服务器

Java 装在 Homebrew（不在系统 PATH）：

```bash
export JAVA_HOME="/opt/homebrew/opt/openjdk@21"
export PATH="$JAVA_HOME/bin:$PATH"

cd ~/mc-test-server
java -Xmx2G -Xms512M -jar paper.jar --nogui
```

服务器起来后 TestHarness 插件自动在 **端口 25561** 上开 HTTP API。

验证：
```bash
curl http://localhost:25561/status
# → {"online":true,"tps_1m":20.0,...}
```

---

## 关键注意事项

### 1. 只能有一个 redscript-test datapack

`~/mc-test-server/world/datapacks/` 里**只留 `redscript-test/`**，其他旧 datapack 全删掉。  
多个 datapack 有相同 namespace 会导致 MC 用旧版本，测试结果不对。

```bash
# 清理旧 datapack（只留 redscript-test）
ls ~/mc-test-server/world/datapacks/
trash ~/mc-test-server/world/datapacks/<旧的>
```

### 2. Reload 用 TestHarness API

不要用 `/reload` 命令（需要 `/reload confirm`，Paper 1.21+ 要求）。  
测试代码里用 `mc.reload()`，它调用的是 `POST /reload`。

### 3. Java 路径

系统 `java` 命令指向一个壳，实际没装。用：
```bash
/opt/homebrew/opt/openjdk@21/bin/java -version
# openjdk version "21.0.10"
```

---

## 测试文件结构

```
src/__tests__/mc-integration/
├── syntax-coverage.test.ts     # 语法特性：for-each、match、Option、impl、struct、array
├── say-fstring.test.ts         # say() + f-string macro 编译和运行时测试
├── stdlib-coverage.test.ts     # stdlib 覆盖（数学、物理等）
├── stdlib-coverage-2~8.test.ts # stdlib 覆盖续集
└── item-entity-events.test.ts  # 实体/物品/事件
```

### 写新 test case 的模式

```typescript
import { compile } from '../../compile'
import { MCTestClient } from '../../mc-test/client'

const NS = 'my_test_ns'  // 每个文件用唯一 namespace
let serverOnline = false
let mc: MCTestClient

beforeAll(async () => {
  mc = new MCTestClient(process.env.MC_HOST ?? 'localhost', parseInt(process.env.MC_PORT ?? '25561'))
  try {
    serverOnline = await mc.isOnline()
  } catch { serverOnline = false }
  if (!serverOnline) return

  // 编译 + 写入 datapack
  writeFixture(`...redscript code...`, NS)
  await mc.reload()
  await mc.ticks(5)
}, 30_000)

test('runtime: xxx', async () => {
  if (!serverOnline) return  // 服务器不在线就跳过

  await mc.command(`/function ${NS}:fn_name`)
  await mc.ticks(5)
  const score = await mc.scoreboard('#result', 'objective')
  expect(score).toBe(42)
}, 20_000)
```

### 可用的 TestHarness API（via MCTestClient）

| 方法 | 说明 |
|------|------|
| `mc.isOnline()` | 检查服务器是否在线 |
| `mc.reload()` | Reload datapacks（正确方式） |
| `mc.ticks(n)` | 等待 n 个游戏 tick（50ms 各） |
| `mc.command('/xxx')` | 执行 MC 命令 |
| `mc.scoreboard(player, obj)` | 读取 scoreboard 值 |
| `mc.chat(since)` | 读取聊天日志 |
| `mc.assertChatContains(str)` | 断言聊天包含字符串 |
| `mc.reset()` | 清空聊天和事件日志 |
| `mc.fullReset(...)` | 完整重置（清空区域、实体、scoreboard） |

---

## 已知问题

- `impl Counter` 测试（syntax-coverage）：runtime 失败，`#impl_out` 读到 0 而不是 3。这是预存在的 impl 方法运行时 bug，与 f-string/say macro 无关。
- `repl-server-extra.test.ts`：端口 3001 占用导致 10 个测试失败，与代码无关。
