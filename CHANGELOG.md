# Changelog

All notable changes to RedScript will be documented in this file.

## [Unreleased] — v3.0.0

> **Status:** Active development. All stdlib modules below are merged to `main`; language features are stabilised pending final integration tests.

### Added

#### Language / Compiler
- **`match` expression** — pattern-match on int / enum values; compiles to `execute if score` chains with exhaustiveness checking
- **`for item in array` iteration** — `for x in arr { … }` syntax sugar; desugars to `while idx < arr.len() { let x = arr[idx]; idx++ }` in HIR; generates loop-header / loop-body / loop-exit mcfunction splits
- **`arr.len()` — literal constant + dynamic runtime** — literal arrays (`[1,2,3].len()`) fold to a compile-time constant (`scoreboard players set`); function-parameter and heap arrays use the new `nbt_list_len` MIR instruction which lowers to `execute store result score … run data get storage`
- **`state.mcrs`** — persistent entity/global state management stdlib module
- **`dialog.mcrs`** — NPC dialog trees with choice branching and callback support
- **`scheduler.mcrs`** — tick-budget-aware task scheduler (coroutine-compatible)

#### Tests
- **Coverage: 80% → 85%** — new unit tests for builtins, runtime, emit pipeline, and stdlib modules; arr.len() compile-time and dynamic paths fully covered

#### stdlib
- **`linalg.mcrs`** — double-precision linear algebra: `vec2_add/sub/scale/dot/length/normalize`, `vec3_cross`, `mat2x2 / mat3x3 / mat4x4` multiply, Cramer's rule solver for 2×2 and 3×3 systems
- **`fft.mcrs`** — Discrete Fourier Transform with a `@coroutine` variant for in-game use; supports transforms up to n=64; quarter-wave symmetry test now enabled after related compiler fix
- **`ecs.mcrs`** — Entity Component System: `register_component`, `get_component`, `has_component`; built-in Health and Velocity components; `@tick` system iteration via `foreach(entity[tag=has_<component>])`; fills the gap that Java datapacks have vs Bedrock's native component model
- **`sort.mcrs` v2** — coroutine-based bottom-up merge sort for large arrays (n > 64); yields every 20 comparisons to stay within the 20 ms tick budget

#### Language / Events
- **`@on(EventType)` full compiler implementation** — compiler generates Minecraft function-tag JSON and wires an `events.mcrs` dispatcher automatically; supported events: `PlayerJoin`, `PlayerDeath`, `EntityKill`, `ItemUse` (each with correctly typed parameters)
- **MC integration tests** for `@on(PlayerJoin)` and `@on(PlayerDeath)` added to the test suite

#### Runtime
- **`MCRuntime`** `storage_get_int` / `storage_set_array` builtins — allows `sin` / `cos` (which rely on NBT storage) to execute correctly in unit test environment without a running Minecraft instance

### Fixed

#### Compiler
- **Dynamic array indexing on function parameters** — `arr[i]` inside a callee now resolves to the correct per-call-site monomorphized NBT path; previously the binding was shadowed and produced a wrong path
- **`scoreboard_get` / `scoreboard_set` Player selector** — emits `@s` (not an empty string) when the Player argument resolves to the executing entity

#### stdlib
- **`linalg.mcrs`** — `double_sqrt` return-type cast corrected; prevents type mismatch in chained double-precision expressions

#### Events
- **`@on(BlockBreak)`** — constrained to `Player` parameter only; Minecraft does not expose block type at function-tag dispatch time and including it caused a compile error

---

## [2.6.1] - 2026-03-20

### Fixed

#### Compiler
- **Dynamic array indexing on function parameters** — `arr[i]` in callee functions now correctly resolves the per-call-site monomorphized binding (regression introduced in v2.4.0 array-reference work)
- **`scoreboard_get` / `scoreboard_set` Player param** — selector now correctly emits `@s` instead of an empty string when the Player argument is the executing entity

#### stdlib
- **`linalg.mcrs`** — `double_sqrt` return type cast fixed; avoids type error in chained double expressions

#### Events
- **`@on(BlockBreak)`** — removed block-type parameter; MC provides no runtime block type info at function-tag dispatch

---

## [2.6.0] - 2026-03-19

### Compiler

- **Parser** now emits `span.endLine` for function declarations — LSP clients receive accurate scope ranges for hovers and highlights
- **String concatenation error:** `"string" + var` now raises a compile-time error with a hint to use f-string interpolation instead of silently producing broken output
- **F-string MC text components:** f-string interpolation inside `tell`, `title`, `subtitle`, `actionbar`, and `announce` now emits proper Minecraft JSON text components (e.g. `["", {"score": …}, " text"]`) instead of raw concatenated strings
- **LSP inlay hints:** the language server now shows inferred types next to unannotated `let` bindings inline in the editor

### stdlib

- **`mat3_mul` / `mat4_mul`** — 3×3 and 4×4 matrix multiply helpers (fixed-point ×10000 scale) in `stdlib/matrix.mcrs`
- **`bigint_div`** — full arbitrary-precision long division returning both quotient and remainder in `stdlib/bigint.mcrs`
- **`graph.mcrs`** — adjacency-list graph library: `graph_add_edge`, BFS, DFS, `has_path`, and `shortest_path` (Dijkstra's algorithm)
- **`ode.mcrs`** — Runge-Kutta 4th-order ODE solver supporting exponential decay/growth and sine oscillator systems

### VSCode Extension

- **v1.3.17:** inlay hints for inferred `let` binding types; improved variable hover tooltips showing type and declaration site

## [2.5.0] - 2026-03-17

### Added
- `stdlib/easing.mcrs`: 12 easing functions (quad/cubic/quartic/sine/expo/back/bounce/smooth)
- `stdlib/noise.mcrs`: value noise 1D/2D, fractal Brownian motion, terrain height helper
- `stdlib/physics.mcrs`: projectile motion, drag, spring, friction, circular motion, bounce
- `stdlib/matrix.mcrs`: 2D/3D rotation helpers, Display Entity quaternion helpers, lerp_angle
- `stdlib/bigint.mcrs`: upgraded to arbitrary-precision array API (`bigint_add/sub/mul_small/cmp/zero/copy`)
- `execute store success` peephole optimization: each `if` condition now generates 1 command instead of 2
- `examples/math-demo.mcrs`: demonstrates math/easing/noise/physics stdlib
- `stdlib/list.mcrs`: `sort4` / `sort5` optimal sorting networks; `list_sort_asc/desc` (arbitrary length)

### Changed
- `stdlib/bigint.mcrs`: old global-state API removed, replaced with array-by-reference API
- `examples/showcase.mcrs`: updated to use new bigint API

## [2.4.0] - 2026-03-17

### Added
- **Dynamic array index read**: `arr[i]` where `i` is a variable — compiled to MC Function Macro (`$()` syntax, requires MC 1.20.2+)
- **Dynamic array index write**: `arr[i] = val`, `arr[i] += val`, and other compound assignments
- **Array parameters by reference**: `fn foo(arr: int[], len: int)` — arrays passed to functions are now correctly accessible via dynamic index inside the callee. Per-call-site monomorphization ensures each array binding is specialized.
- **`list_push(arr, val)`** — append int to NBT array
- **`list_pop(arr)`** — remove last element from NBT array
- **`list_push(arr, val)` / `list_pop(arr)` / `list_len(arr)`** — NBT array manipulation builtins
- `stdlib/list.mcrs`: `sort4` / `sort5` optimal sorting networks (5/9 comparisons)
- `stdlib/list.mcrs`: `list_sort_asc(arr, n)` / `list_sort_desc(arr, n)` — arbitrary-length in-place bubble sort via array reference

### Known Limitations
- `for` loop constant-unrolling may interfere with dynamic array access when loop bounds are compile-time constants; use `while` loops for dynamic array iteration

## [2.3.0] - 2026-03-17

### Added
- `stdlib/math.mcrs`: `ln` (SA-tuned atanh series, max_error < 0.0006), `sqrt_fx` (×10000 scale), `exp_fx` (Horner Taylor + 2^k scaling)
- `stdlib/math_hp.mcrs`: `sin_hp`/`cos_hp` using MC entity rotation trick (double precision), `init_trig()` bootstrap
- `stdlib/random.mcrs`: LCG (`next_lcg`, `random_range`, `random_bool`) + PCG (`pcg_next_lo/hi`, `pcg_output`)
- `stdlib/color.mcrs`: RGB packing/unpacking, `rgb_lerp`, HSL↔RGB conversion (`hsl_to_r/g/b`, `rgb_to_h/s/l`)
- `stdlib/bits.mcrs`: bitwise AND/OR/XOR/NOT, left/right shift, bit get/set/clear/toggle, popcount (all integer-simulated)
- `stdlib/list.mcrs`: `sort3`, min/max/avg for 3 and 5 values, weighted choice utilities
- `stdlib/geometry.mcrs`: AABB/sphere/cylinder contains checks, parabola physics, grid/tile helpers, angle normalization, MC sun angle
- `stdlib/signal.mcrs`: uniform, normal (12-sample approximation), exponential distribution, bernoulli trial, weighted2/3 choice
- `stdlib/bigint.mcrs`: 96-bit base-10000 arithmetic (add, sub, mul, div, cmp, int32↔bigint3 conversion)
- `src/tuner/`: hyperparameter search framework (Nelder-Mead + Simulated Annealing) for stdlib coefficient optimization
  - `adapters/ln-polynomial.ts`: atanh series adapter
  - `adapters/sqrt-newton.ts`: Newton iteration adapter
  - CLI: `redscript tune --adapter <name> [--strategy nm|sa] [--budget N] [--out path]`

### Changed
- `stdlib/vec.mcrs`: added 2D/3D add/sub/scale/neg component helpers

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
