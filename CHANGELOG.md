# Changelog

All notable changes to RedScript will be documented in this file.

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
