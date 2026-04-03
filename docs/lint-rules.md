# RedScript Lint Rules

The lint engine runs after HIR lowering and reports warnings before code generation.

## Existing Rules

### `unused-variable`
Warns when a `let` binding is declared but never read.

```redscript
fn foo(): void {
  let x: int = 5;  // warning: "x" is declared but never used
}
```

### `unused-import`
Warns when an imported symbol is never called in the module.

```redscript
import mylib::helper;  // warning: "helper" is never used

fn main(): void {
  say("hello");
}
```

### `magic-number`
Warns when a literal number with absolute value greater than 1 is used directly outside a `const` declaration.

```redscript
fn foo(): void {
  let x: int = 1000;  // warning: avoid magic number 1000
}

const MAX: int = 1000;  // OK — const declarations are exempt
```

### `dead-branch`
Warns when an `if` condition is a compile-time constant (always true or always false).

```redscript
fn foo(): void {
  if 1 == 2 {  // warning: condition is always false
    say("never");
  }
}
```

### `function-too-long`
Warns when a function body exceeds the line limit (default: 50 lines). Configurable via `LintOptions.maxFunctionLines`.

```redscript
// warning if this function body exceeds 50 lines
fn process_all() {
    // ... 51+ lines of code ...
}
```

Configurable via `LintOptions`:

```typescript
lintString(source, file, ns, { maxFunctionLines: 100 })
```

---

## New Rules

### `no-dead-assignment`
Warns when a variable is assigned a value that is immediately overwritten before being read. The initial write is "dead" — it has no effect on program behavior.

```redscript
fn foo(): void {
  let x: int = 0;  // warning: assignment to "x" is never read before being overwritten
  x = 42;
  say("done");
}
```

No warning when each assigned value is read:

```redscript
fn foo(): int {
  let x: int = 5;
  let y: int = x;  // reads x — clears pending write
  x = 10;
  return x + y;    // reads x again
}
```

### `prefer-match-exhaustive`
Warns when a `match` expression uses Option patterns (`Some`/`None`) but is missing one of the arms and has no wildcard `_` catch-all.

```redscript
fn foo(x: Option<int>): void {
  match x {
    Some(v) => { say("got value"); }
    // warning: match on Option is missing a None arm
  }
}
```

No warning when both arms are present, or when a wildcard covers the rest:

```redscript
fn foo(x: Option<int>): void {
  match x {
    Some(v) => { say("got value"); }
    None    => { say("nothing"); }
  }
}
```

### `no-empty-catch`
Warns about silent failure patterns — specifically:
- An `if let Some` with an empty `else {}` block (silently ignores the None case)
- A `match` arm with an empty body

```redscript
fn foo(x: Option<int>): void {
  if let Some(v) = x {
    say("ok");
  } else {}  // warning: None case is silently ignored
}

fn bar(x: Option<int>): void {
  match x {
    Some(v) => { say("ok"); }
    None    => {}  // warning: empty match arm body
  }
}
```

### `naming-convention`
Enforces naming conventions:
- Variables (let bindings, foreach bindings, if-let / while-let bindings) must use **camelCase**
- Struct and enum type names must use **PascalCase**

A leading underscore is allowed (e.g. `_unused` is valid camelCase).

```redscript
fn foo(): void {
  let my_var: int = 5;  // warning: "my_var" should use camelCase — use myVar
}

struct myPoint { x: int, y: int }  // warning: "myPoint" should use PascalCase — use MyPoint
```

No warning for:

```redscript
fn foo(): void {
  let myVar: int = 5;
  let _ignored: int = 0;
}

struct MyPoint { x: int, y: int }
```

### `no-magic-numbers`
Similar to `magic-number` but checks against a configurable allow-list (default: `[0, 1]`) instead of a threshold. Numbers outside the allow-list that appear in expressions outside `const` declarations are flagged.

```redscript
fn foo(): void {
  let x: int = 42;  // warning: Magic number 42 — extract to a named const
}

const ANSWER: int = 42;  // OK — const declarations are exempt
```

Configurable via `LintOptions.allowedNumbers`:

```typescript
lintString(source, file, ns, { allowedNumbers: [0, 1, 42, 100] })
```
