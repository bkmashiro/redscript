# `interactions` — Player interaction detection

Import: `import interactions;`

Common patterns for detecting player input: right-click (carrot-on-a-stick), sneak/crouch detection, look direction checks, and combined input combos. Uses scoreboard objectives for tracking. Call `interactions_init()` once in your `@load` function.

## Functions

### `interactions_init()`

Initialize interaction scoreboards. Call once from your `@load` function.

- `rs.click` — `minecraft.used:minecraft.carrot_on_a_stick`
- `rs.sneak` — `minecraft.custom:minecraft.sneak_time`
- `rs.attack` — `minecraft.custom:minecraft.damage_dealt`

**Example:**
```rs
import interactions;

@load
fn setup() {
    interactions_init();
}
```

---

### `on_right_click(callback_fn: string)`

Check for right-click (carrot on a stick). Tags players who clicked with `rs.clicked` and resets their click counter. Call from a `@tick` function.

**Example:**
```rs
import interactions;

@tick
fn check_input() {
    on_right_click("my_action");
}
```

---

### `example_right_click()`

Example right-click handler: detects clicks, resets counter, and emits a `say`.

---

### `is_sneaking(target: selector): int`

Returns 1 if the target is currently sneaking (sneak_time > 0), 0 otherwise.

**Example:**
```rs
import interactions;
let sneaking: int = is_sneaking(@s);
```

---

### `on_sneak_start()`

Detect the first tick of sneaking for all players. Tags players with `rs.sneak_start` when `sneak_time == 1`, removes the tag otherwise. Call from `@tick`.

---

### `check_look_up()`

Tag players looking up (pitch < -45°) with `rs.look_up`. Call from `@tick`.

---

### `check_look_down()`

Tag players looking down (pitch > 45°) with `rs.look_down`. Call from `@tick`.

---

### `check_look_straight()`

Tag players looking straight (pitch between -45° and 45°) with `rs.look_straight`. Call from `@tick`.

---

### `check_holding_item(item_id: string)`

Check if player is holding a specific item. Currently emits a `say` reminder to use predicate files for NBT checks.

---

### `on_sneak_click()`

Detect sneak + right-click combo. Tags players with `rs.sneak_click` for the combo, `rs.clicked` for normal click. Call from `@tick`.

**Example:**
```rs
import interactions;

@tick
fn check_combos() {
    on_sneak_click();
}
```

---

### `on_double_sneak()`

Detect double-tap sneak within a 10-tick window. Tags players with `rs.double_sneak`. Call from `@tick`.
