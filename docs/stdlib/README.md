# Standard Library

RedScript ships with 35 stdlib modules. Import any module with `import <name>;`.

## Categories

### Mathematics
- [math](math.md) — basic math (`abs`, `clamp`, `lerp`, `sin_fixed`, `sqrt_fx`, `ln`, `exp_fx`, `smoothstep`, ...)
- [math_hp](math_hp.md) — high-precision (`sin_hp`, `cos_hp`, `ln_hp`, `double_sqrt`, `pow_real`, ...)
- [bits](bits.md) — bitwise operations (`bit_and`, `bit_or`, `bit_xor`, `bit_shl`, `popcount`, ...)
- [bigint](bigint.md) — multi-word integers (base-10000 bigint add/sub/mul/div, arbitrary length)
- [calculus](calculus.md) — numerical integration/differentiation (trapezoid, Simpson, Welford statistics)

### Data Structures
- [list](list.md) — array aggregates (`sum`, `avg`, `min`, `max`, `sort3`–`sort5`, `shuffle`, ...)
- [sets](sets.md) — set operations (`set_new`, `set_add`, `set_contains`, `set_remove`)
- [matrix](matrix.md) — matrix math for Display Entities (2D/3D rotation, scale, quaternion helpers)
- [vec](vec.md) — 2D/3D vectors (`dot2d`, `cross3d`, `length2d_fixed`, `atan2_fixed`, `normalize2d_x`, ...)
- [quaternion](quaternion.md) — 3D rotations (`quat_mul`, `quat_slerp`, `quat_euler`, axis-angle constructors)

### Randomness & Statistics
- [random](random.md) — LCG/PCG RNG, binomial and hypergeometric sampling
- [noise](noise.md) — procedural noise (value noise 1D/2D, fractal Brownian motion, terrain height)

### Signal Processing
- [signal](signal.md) — DFT (up to 8 samples), Gaussian/exponential/Poisson/geometric distributions
- [expr](expr.md) — RPN expression evaluator (dynamic formula evaluation at runtime)

### Geometry & Graphics
- [geometry](geometry.md) — selection zones (AABB, sphere, cylinder, cone, sector)
- [advanced](advanced.md) — Bézier curves (quadratic–N-order), Mandelbrot/Julia, modular exponentiation
- [parabola](parabola.md) — projectile trajectories (ballistic aiming, drag physics)
- [easing](easing.md) — easing functions (quad, cubic, quartic, sine, expo, back, bounce, smoothstep)
- [particles](particles.md) — particle helpers (hearts, flame, smoke; draw line, circle, helix)
- [color](color.md) — RGB/HSL/hex color utilities (pack/unpack, lerp, RGB↔HSL conversion)

### Physics
- [physics](physics.md) — velocity, gravity, collision (projectile motion, drag, spring, friction)
- [strings](strings.md) — string utilities (`str_len`)

### Minecraft Game Mechanics
- [player](player.md) — player utilities (`heal`, `damage`, `is_op`)
- [mobs](mobs.md) — mob type string constants (all vanilla entity IDs)
- [combat](combat.md) — damage and health (`weapon_damage`, `apply_damage`)
- [effects](effects.md) — potion effects (`speed`, `jump`, `regen`, `buff_all`, ...)
- [spawn](spawn.md) — entity spawning and teleportation (`teleport_to`, `goto_lobby`, `goto_arena`)
- [interactions](interactions.md) — interaction entities (right-click, sneak, look-direction detection)
- [inventory](inventory.md) — inventory management (`clear_inventory`, `give_kit_warrior`, ...)
- [bossbar](bossbar.md) — boss bar UI (`create_timer_bar`, `create_health_bar`, `update_bar_color`)
- [cooldown](cooldown.md) — ability cooldowns (`cooldown_start`, `cooldown_ready`, `cooldown_tick`)
- [timer](timer.md) — countdown timers (`Timer` struct with `start`, `done`, `remaining`)
- [tags](tags.md) — Minecraft block/entity/item/damage type tag string constants
- [teams](teams.md) — team management (`setup_two_teams`, `setup_four_teams`, `add_to_team`)
- [world](world.md) — world queries (`set_day`, `weather_clear`, `sun_altitude`, `glass_box`, ...)
