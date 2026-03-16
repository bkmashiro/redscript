# Changelog

All notable changes to RedScript will be documented in this file.

## [2.1.1] - 2026-03-16

### Added
- stdlib include path: `import "stdlib/math"` without specifying full path
- `--include <dir>` CLI flag for custom library paths
- LSP hover for 50+ builtin functions and all decorators (@tick/@load/@coroutine/@schedule/@on_trigger)
- f-string syntax highlighting in VSCode extension

### Changed
- Example files cleaned up: removed stale/redundant examples, added coroutine/enum/scheduler demos

## [1.2.15] - 2026-03-13

### Changed
- All builtin functions now support macro parameters, so runtime variables can be used in any argument position

## [1.2.14] - 2026-03-13

### Added
- Automatic Minecraft 1.20.2+ function macro support

### Changed
- Runtime variables now work in more command positions, including coordinates and entity types

## [1.2.13] - 2026-03-13

### Changed
- Trivial control-flow helper functions are now inlined during optimization
- Empty blocks are removed automatically during optimization

## [1.2.12] - 2026-03-13

### Changed
- Dead code elimination now preserves all public functions automatically
- Functions whose names start with `_` are treated as private by default

## [1.2.11] - 2026-03-13

### Fixed
- Entity types now compile with the `minecraft:` namespace where required
- Struct method field storage and method-call state restoration

## [1.2.10] - 2026-03-13

### Added
- `break` and `continue` statements
- `match` range patterns such as `70..79`
- `foreach` execute context modifiers like `at @s` and `positioned`
- Complete support for Minecraft `execute` subcommands

## [1.2.0] - 2026-03-12

### Added
- `is` type narrowing for entity checks (`if (e is Player)`)
- `impl` blocks for struct methods
- Static method calls (`Type::method()`)
- Runtime f-strings for output functions
- Timer OOP API in stdlib
- `setTimeout(delay, callback)` builtin
- `setInterval(delay, callback)` builtin
- `clearInterval(id)` builtin
- `@on(Event)` static event system
- PlayerDeath, PlayerJoin, BlockBreak, EntityKill, ItemUse
- Dead code elimination optimizer pass
- Automatic namespace prefixing for scoreboard objectives
- Comprehensive MC tag constants (313 tags)

### Changed
- Stdlib timer functions now use OOP API

### Documentation
- Updated README and docs site for the v1.2 language, stdlib, and builtins changes

## [1.1.0] - 2026-03-12

### Language Features
- **Variable selector syntax**: `execute if entity p[x_rotation=-90..-45]` now works in foreach loops
- **New selector filters**: `x_rotation`, `y_rotation`, `x`, `y`, `z` for rotation and position checks
- **Duplicate binding detection**: Error when redeclaring foreach variables

### Builtins
- `effect_clear(target, [effect])` — Clear all or specific effects
- `data_merge(target, nbt)` — Merge NBT data into entities

### Standard Library
- `effects.mcrs` — Effect shortcuts (speed, strength, regen, buff_all...)
- `world.mcrs` — World/gamerule helpers (set_day, weather_clear, enable_keep_inventory...)
- `inventory.mcrs` — Inventory management (give_kit_warrior, clear_inventory...)
- `particles.mcrs` — Particle effects (hearts_at, flames, sparkles_at...)
- `spawn.mcrs` — Teleport utilities (teleport_to, gather_all, goto_lobby...)
- `teams.mcrs` — Team management (create_red_team, setup_two_teams...)
- `bossbar.mcrs` — Bossbar helpers (create_progress_bar, update_bar...)
- `interactions.mcrs` — Input detection (check_look_up, on_right_click, on_sneak_click...)

### Bug Fixes
- Negative coordinates in summon/tp/particle now work correctly
- Stdlib particles use coordinates instead of selectors

### Documentation
- Added tutorials: Zombie Survival, Capture the Flag, Parkour Race
- Added local debugging guide
- Added stdlib reference page
- Added Paper server testing guide

### Community
- CONTRIBUTING.md with development guide
- GitHub issue/PR templates
- CHANGELOG.md

## [1.0.0] - 2026-03-12

### 🎉 Initial Release

#### Language Features
- Variables with type inference: `let x = 5;`
- Functions with typed parameters and return types
- Control flow: `if`/`else`, `while`, `for i in 0..10`
- `foreach` for entity iteration
- Structs and Enums
- Lambda expressions: `(x: int) => x * 2`
- NBT structured parameters
- `@load` decorator for datapack initialization
- Global variables (compile to scoreboard fake players)
- `#mc_name` syntax for bare Minecraft identifiers
- Match expressions with pattern matching

#### Builtins (34+)
- Player: `say`, `tell`, `title`, `actionbar`, `give`, `kill`, `tp`, `effect`
- Scoreboard: `scoreboard_get`, `scoreboard_set`, `scoreboard_add`
- World: `setblock`, `fill`, `summon`, `weather`, `time_set`, `gamerule`
- Data: `data_get`, `data_merge`
- Runtime Sets: `set_new`, `set_add`, `set_contains`, `set_remove`
- And more...

#### Standard Library
- `math.mcrs` - `abs`, `min`, `max`, `clamp`, `sign`
- `player.mcrs` - `heal`, `feed`, `teleport_spawn`
- `cooldown.mcrs` - Cooldown management
- `timer.mcrs` - Timer utilities
- `combat.mcrs` - Combat helpers
- `mobs.mcrs` - Mob spawning utilities
- `sets.mcrs` - Set operations
- `strings.mcrs` - String formatting

#### CLI
- `redscript compile` - Compile to datapack
- `redscript watch` - Watch mode with hot reload
- `redscript check` - Type checking
- `redscript fmt` - Code formatter
- `redscript repl` - Interactive REPL
- Output targets: datapack, cmdblock, structure

#### Tooling
- VSCode Extension (v0.8.2) with syntax highlighting, autocomplete, go-to-definition, rename
- Online IDE: https://redscript-ide.pages.dev
- Documentation: https://redscript-docs.pages.dev
- Paper plugin for integration testing

#### Optimizer
- Dead code elimination
- Constant folding
- Inline simple functions
- Remove redundant scoreboard operations
