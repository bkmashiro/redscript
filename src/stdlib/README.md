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

### particles.mcrs
Particle effect shortcuts.
- `hearts(target)` — Heart particles above target
- `flames(x, y, z)` — Fire particles
- `smoke(x, y, z)` — Smoke effect
- `explosion_effect(x, y, z)` — Explosion particles
- `sparkles(target)` — Enchantment sparkles
- `angry(target)` — Angry villager particles
- `happy(target)` — Happy villager particles
- `portal_effect(x, y, z)` — Portal particles
- `totem_effect(target)` — Totem of undying particles
- `end_sparkles(target)` — End rod particles

### spawn.mcrs
Teleport and spawn utilities.
- `teleport_to(target, x, y, z)` — TP to coordinates
- `teleport_to_entity(target, dest)` — TP to entity
- `gather_all(x, y, z)` — TP all players
- `launch_up(target, height)` — Launch player upward
- `goto_lobby(target)` — TP to lobby
- `goto_arena(target)` — TP to arena

### teams.mcrs
Team management.
- `create_team(name, color)` — Create colored team
- `create_red_team()`, `create_blue_team()` — Quick team setup
- `create_green_team()`, `create_yellow_team()`
- `add_to_team(target, team)` — Add player to team
- `remove_from_teams(target)` — Remove from all teams
- `setup_two_teams()` — Quick 2-team setup
- `setup_four_teams()` — Quick 4-team setup
- `cleanup_teams()` — Remove all teams

### bossbar.mcrs
Bossbar for timers and progress.
- `create_timer_bar(id, name, seconds)` — Timer bossbar
- `create_health_bar(id, name, max)` — Red health bar
- `create_progress_bar(id, name, max)` — Blue progress bar
- `update_bar(id, value)` — Update value
- `hide_bar(id)`, `show_bar(id)` — Visibility
- `remove_bar(id)` — Delete bossbar
- `update_bar_color(id, percent)` — Color by percentage
