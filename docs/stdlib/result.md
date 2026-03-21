# `result` — Result\<T\> error handling type

Import: `import result;`

Provides a `Result` enum with `Ok(value)` and `Err(code)` variants for safe error propagation in Minecraft datapacks. Useful wherever an operation may succeed or fail — division, inventory checks, entity lookups, etc.

Error codes are integers. Use negative values by convention (e.g. `-1` = generic error, `-2` = division by zero).

---

## Type

### `enum Result`

```redscript
enum Result {
  Ok(value: int),
  Err(code: int),
}
```

`Ok` wraps a successful integer value; `Err` wraps an integer error code.

---

## Constructors

### `result_ok(value: int): Result`

Create a successful `Result` wrapping `value`.

```redscript
import result;
let r: Result = result_ok(42);
```

---

### `result_err(code: int): Result`

Create a failed `Result` with error code `code`.

```redscript
import result;
let r: Result = result_err(-1);
```

---

## Query helpers

### `result_is_ok(r: Result): int`

Returns `1` if `r` is `Ok`, `0` otherwise.

```redscript
import result;
let r: Result = result_ok(5);
if (result_is_ok(r) == 1) {
  // success path
}
```

---

### `result_is_err(r: Result): int`

Returns `1` if `r` is `Err`, `0` otherwise.

---

## Extraction helpers

### `result_value(r: Result): int`

Extract the value from an `Ok` result. Returns `0` if `r` is `Err`.
Always check `result_is_ok` first.

```redscript
import result;
let r: Result = result_ok(99);
let v: int = result_value(r);  // 99
```

---

### `result_code(r: Result): int`

Extract the error code from an `Err` result. Returns `0` if `r` is `Ok`.
Always check `result_is_err` first.

```redscript
import result;
let r: Result = result_err(-2);
let c: int = result_code(r);  // -2
```

---

## Utilities

### `result_divide(a: int, b: int): Result`

Safe integer division. Returns `Err(-2)` if `b == 0`, otherwise `Ok(a / b)`.

```redscript
import result;
let r: Result = result_divide(10, 2);
match r {
  Result::Ok(value) => {
    // value = 5
  }
  Result::Err(code) => {
    // code = -2 (division by zero)
  }
}
```

---

## Full example

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

## Error code conventions

| Code | Meaning           |
|------|-------------------|
| -1   | Generic error     |
| -2   | Division by zero  |
| -3   | Not found         |

You can define your own codes. Use negative values to distinguish errors from valid zero results.
