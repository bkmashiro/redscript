# `timer` — Countdown timers

Import: `import timer;`

Timer struct with OOP-style API for countdown/stopwatch functionality, plus tick/time conversion helpers. Each `Timer::new()` is statically allocated a unique compile-time ID; the compiler inlines scoreboard operations per instance. `Timer::new()` must be called at the top level of a function (not inside loops or if/else bodies).

## Struct: `Timer`

```rs
struct Timer {
    _id: int,
    _duration: int
}
```

### `Timer::new(duration: int): Timer`

Create a new timer with the given duration in ticks. Initialises scoreboard slots to 0 (inactive).

**Example:**
```rs
import timer;

fn start_round() {
    let t: Timer = Timer::new(600);  // 30-second timer
    t.start();
}
```

---

### `Timer.start(self)`

Start or resume the timer (sets active = 1).

---

### `Timer.pause(self)`

Pause the timer (sets active = 0).

---

### `Timer.reset(self)`

Reset elapsed ticks to zero.

---

### `Timer.done(self): bool`

Returns true if elapsed ticks ≥ duration.

**Example:**
```rs
import timer;

@tick
fn check_timer() {
    if (my_timer.done()) {
        end_round();
    }
}
```

---

### `Timer.elapsed(self): int`

Get elapsed ticks.

---

### `Timer.remaining(self): int`

Get remaining ticks, clamped at zero.

---

### `Timer.tick(self)`

Manually advance the timer by one tick when active. Call from a `@tick` function.

## Conversion functions

### `tick_to_seconds(ticks: int): int`

Convert MC ticks to seconds (20 ticks = 1 second).

---

### `tick_to_ms(ticks: int): int`

Convert ticks to milliseconds (1 tick = 50ms).

---

### `seconds_to_ticks(s: int): int`

Convert seconds to ticks (`s × 20`).

---

### `format_time_s(ticks: int): int`

Seconds component of tick count (mod 60).

---

### `format_time_m(ticks: int): int`

Minutes component of tick count (mod 60).

---

### `format_time_h(ticks: int): int`

Hours component of tick count.

**Example:**
```rs
import timer;
let elapsed: int = 1500;  // ticks
let mins: int = format_time_m(elapsed);  // 1
let secs: int = format_time_s(elapsed);  // 15
```
