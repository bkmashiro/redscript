# RedScript Standard Library

Ready-to-use utility functions for common Minecraft operations.

## Usage

```mcrs
import "stdlib/effects.mcrs"
import "stdlib/world.mcrs"

fn start() {
    set_day();
    buff_all(@a, 600);  // 30 second buff
}
```

## Modules

### math.mcrs
Basic math utilities.
- `abs(x)` — Absolute value
- `min(a, b)` — Minimum of two values
- `max(a, b)` — Maximum of two values
- `clamp(x, min, max)` — Clamp value to range
- `sign(x)` — Sign of number (-1, 0, 1)

### effects.mcrs
Effect shortcuts.
- `speed(target, duration, level)`
- `jump(target, duration, level)`
- `regen(target, duration, level)`
- `resistance(target, duration, level)`
- `strength(target, duration, level)`
- `invisible(target, duration)`
- `night_vision(target, duration)`
- `slow_fall(target, duration)`
- `glow(target, duration)`
- `clear_effects(target)`
- `buff_all(target, duration)` — Speed + strength + regen + resistance

### world.mcrs
World and game rule helpers.
- `set_day()`, `set_night()`, `set_noon()`, `set_midnight()`
- `weather_clear()`, `weather_rain()`, `weather_thunder()`
- `enable_keep_inventory()`, `disable_keep_inventory()`
- `disable_mob_griefing()`, `disable_fire_spread()`
- `set_peaceful()`, `set_easy()`, `set_normal()`, `set_hard()`
- `barrier_wall(x1,y1,z1,x2,y2,z2)`
- `clear_area(x1,y1,z1,x2,y2,z2)`
- `glass_box(x1,y1,z1,x2,y2,z2)`

### inventory.mcrs
Inventory management.
- `clear_inventory(target)`
- `give_kit_warrior(target)`
- `give_kit_archer(target)`
- `give_kit_mage(target)`
- `remove_item(target, item)`

### player.mcrs
Player state management.
- `heal(amount)`
- `damage(amount)`
- `is_op()` — Check if player has op tag

### cooldown.mcrs
Cooldown system using scoreboards.
- `cooldown_start(target, ticks)`
- `cooldown_tick()`
- `is_on_cooldown(target)` → int

### timer.mcrs
Timer utilities.
- `timer_start(name, ticks)`
- `timer_tick()`
- `timer_done(name)` → int

### combat.mcrs
Combat helpers.
- `apply_damage(target, amount)`
- `knockback(target, strength)`

### mobs.mcrs
Mob spawning utilities.
- `spawn_zombie(x, y, z)`
- `spawn_skeleton(x, y, z)`
- `spawn_creeper(x, y, z)`

### sets.mcrs
Runtime set operations (NBT-based).
- `make_set()` → string
- `add_to_set(set, value)`
- `in_set(set, value)` → int
- `remove_from_set(set, value)`

### strings.mcrs
String formatting helpers.
- `broadcast(msg)` — Announce to all players
- `whisper(target, msg)` — Private message
