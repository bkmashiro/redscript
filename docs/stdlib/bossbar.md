# `bossbar` — Boss bar UI helpers

Import: `import bossbar;`

Convenience wrappers around the built-in `bossbar_*` commands for common boss bar patterns: timers, health bars, progress bars, and dynamic colour updates based on percentage.

## Functions

### `create_timer_bar(id: string, name: string, max_seconds: int)`

Create and show a green timer boss bar visible to all players. Value starts at `max_seconds × 20` (full) and is displayed with the `"progress"` style.

**Example:**
```rs
import bossbar;
create_timer_bar("my_pack:timer", "Round Timer", 60);
```

---

### `create_health_bar(id: string, name: string, max_val: int)`

Create a red health-style boss bar visible to all players, starting at full (`max_val`).

**Example:**
```rs
import bossbar;
create_health_bar("my_pack:boss_hp", "Boss Health", 200);
```

---

### `create_progress_bar(id: string, name: string, max_val: int)`

Create a blue progress boss bar visible to all players, starting at 0.

**Example:**
```rs
import bossbar;
create_progress_bar("my_pack:quest", "Quest Progress", 100);
```

---

### `update_bar(id: string, value: int)`

Update the current value of a boss bar.

**Example:**
```rs
import bossbar;
update_bar("my_pack:boss_hp", 150);
```

---

### `hide_bar(id: string)`

Hide a boss bar (sets visible = 0).

**Example:**
```rs
import bossbar;
hide_bar("my_pack:timer");
```

---

### `show_bar(id: string)`

Show a hidden boss bar (sets visible = 1).

**Example:**
```rs
import bossbar;
show_bar("my_pack:timer");
```

---

### `remove_bar(id: string)`

Permanently remove a boss bar.

**Example:**
```rs
import bossbar;
remove_bar("my_pack:timer");
```

---

### `update_bar_color(id: string, percent: int)`

Set boss bar colour based on percentage: green if > 66%, yellow if > 33%, red otherwise.

**Example:**
```rs
import bossbar;
update_bar_color("my_pack:boss_hp", 45);  // yellow
```
