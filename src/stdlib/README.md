# RedScript Stdlib

This folder contains source-only utility modules for RedScript projects. There is
no import system yet, so stdlib usage is intentionally simple:

1. Copy the functions you need into your project file.
2. Compile a stdlib file on its own to inspect the generated `.mcfunction` output.
3. Recreate the same pattern with `raw("function namespace:name")` if you prefer
   to wire precompiled datapack functions manually.

## Modules

### `math.rs`

Integer helpers:

- `abs(x: int) -> int`
- `min(a: int, b: int) -> int`
- `max(a: int, b: int) -> int`
- `clamp(x: int, lo: int, hi: int) -> int`
- `sign(x: int) -> int`

Example:

```rs
let offset: int = abs(delta);
let limited: int = clamp(offset, 0, 20);
```

### `player.rs`

Nearest-player helpers:

- `heal(amount: int)` adds to the nearest player's `health` scoreboard value
- `damage(amount: int)` subtracts from the nearest player's `health` scoreboard
- `is_op() -> int` returns `1` when the nearest player has the `op` tag

Example:

```rs
if (is_op() == 1) {
    heal(4);
} else {
    damage(2);
}
```

### `strings.rs`

String helpers:

- `str_len(s: string) -> int`

Important limitation:

RedScript still does not support general runtime string manipulation. Today the
compiler only lowers `str_len(...)` cleanly when the input is a string literal,
a `const` string, or a string variable initialized from a literal-backed value.
That path works by storing the string in `storage rs:strings` and reading its
character count with `data get storage`.

Example:

```rs
let name: string = "Player";
let n: int = str_len(name);
tell(@s, "${n}");
```

### `mobs.rs`

Vanilla Java Edition entity type constants for selectors, summon helpers, and
command wrappers. The file groups hostile, passive, neutral, boss, and misc
entity IDs so you can copy stable names instead of repeating raw strings.

Example:

```rs
summon(ALLAY, "~", "~", "~");
summon(ZOMBIE, "~", "~", "~");
```
```

### `timer.rs`

Countdown helpers plus a `Timer` struct shape:

- `struct Timer { ticks: int, active: int }`
- `timer_start(name: string, duration: int)`
- `timer_tick(name: string) -> int`
- `timer_done(name: string) -> int`

Important limitation:

Current RedScript lowering does not preserve string arguments when they are passed
into user-defined functions. Because of that, `timer.rs` is implemented as a
single-slot template backed by `timer_ticks` and `timer_active` fake players on
the `rs` objective. Keep one copy per named timer, or replace those fake-player
names with your own concrete identifiers.

Example:

```rs
timer_start("wave", 200);
let remaining: int = timer_tick("wave");
if (timer_done("wave") == 1) {
    say("Next wave.");
}
```

### `cooldown.rs`

Cooldown helpers:

- `cooldown_start(name: string, ticks: int)`
- `cooldown_ready(name: string) -> int`
- `cooldown_tick(name: string)`

This file has the same single-slot limitation as `timer.rs`. Copy it and rename
the scoreboard fake players if you need multiple independent cooldowns.

Example:

```rs
if (cooldown_ready("dash") == 1) {
    cooldown_start("dash", 40);
}
cooldown_tick("dash");
```

## Incorporation Patterns

### Copy into your project

This is the simplest path today. Paste the helper functions above your gameplay
functions and compile one `.rs` file.

### Compile separately

You can inspect or ship a stdlib datapack directly:

```bash
npx ts-node src/cli.ts compile src/stdlib/math.rs -o dist/stdlib-math
```

### Call precompiled helpers with `raw()`

If you compile helper files into their own namespace, you can call them from raw
Minecraft commands:

```rs
raw("function stdlib_math:abs");
```

That pattern is most useful for command wrappers or tick/load entrypoints where
the datapack interface is already fixed.
