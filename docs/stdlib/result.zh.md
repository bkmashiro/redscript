# `result` — Result\<T\> 错误处理类型

导入：`import result;`

提供 `Result` 枚举，包含 `Ok(value)` 和 `Err(code)` 两个变体，用于 Minecraft datapack 中的安全错误传递。适用于任何可能成功或失败的操作——除法、物品栏检查、实体查找等。

错误码为整数，约定使用负数（例如 `-1` = 通用错误，`-2` = 除以零）。

---

## 类型

### `enum Result`

```redscript
enum Result {
  Ok(value: int),
  Err(code: int),
}
```

`Ok` 包裹成功的整数值；`Err` 包裹整数错误码。

---

## 构造函数

### `result_ok(value: int): Result`

创建包含 `value` 的成功结果。

```redscript
import result;
let r: Result = result_ok(42);
```

---

### `result_err(code: int): Result`

创建包含错误码 `code` 的失败结果。

```redscript
import result;
let r: Result = result_err(-1);
```

---

## 查询辅助函数

### `result_is_ok(r: Result): int`

若 `r` 是 `Ok` 返回 `1`，否则返回 `0`。

```redscript
import result;
let r: Result = result_ok(5);
if (result_is_ok(r) == 1) {
  // 成功路径
}
```

---

### `result_is_err(r: Result): int`

若 `r` 是 `Err` 返回 `1`，否则返回 `0`。

---

## 提取辅助函数

### `result_value(r: Result): int`

从 `Ok` 结果中提取值。若 `r` 是 `Err` 则返回 `0`。
建议先调用 `result_is_ok` 检查。

```redscript
import result;
let r: Result = result_ok(99);
let v: int = result_value(r);  // 99
```

---

### `result_code(r: Result): int`

从 `Err` 结果中提取错误码。若 `r` 是 `Ok` 则返回 `0`。
建议先调用 `result_is_err` 检查。

```redscript
import result;
let r: Result = result_err(-2);
let c: int = result_code(r);  // -2
```

---

## 实用函数

### `result_divide(a: int, b: int): Result`

安全整除。若 `b == 0` 返回 `Err(-2)`，否则返回 `Ok(a / b)`。

```redscript
import result;
let r: Result = result_divide(10, 2);
match r {
  Result::Ok(value) => {
    // value = 5
  }
  Result::Err(code) => {
    // code = -2（除以零）
  }
}
```

---

## 完整示例

```redscript
import result;

fn safe_op(a: int, b: int): Result {
  if (b == 0) {
    return Result::Err(code: -1);
  }
  return Result::Ok(value: a / b);
}

@tick fn run() {
  let r: Result = safe_op(10, 0);
  match r {
    Result::Ok(value) => {
      scoreboard_set("#result", "out", value);
    }
    Result::Err(code) => {
      scoreboard_set("#error", "out", code);
    }
  }
}
```

---

## 错误码约定

| 错误码 | 含义       |
|--------|------------|
| -1     | 通用错误   |
| -2     | 除以零     |
| -3     | 未找到     |

你可以自定义错误码。使用负数以区分错误和合法的零值返回。
