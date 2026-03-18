# RedScript Roadmap

Last updated: 2026-03-18

---

## Current State (v2.5.0)

### Compiler
- v2 pipeline: HIR → MIR → LIR → mcfunction
- Type system: int / fixed (×10000) / double (NBT IEEE 754) / float (deprecated)
- `double` type: NBT storage `rs:d`, explicit `as` cast, binary ops auto-lower to stdlib intrinsics
- Module system, generics, enum, Option<T>
- @coroutine (back-edge yield, batch/onDone), @schedule, @on_trigger, @tick
- Optional semicolons
- Incremental compilation, source maps, LSP (hover/goto/completion/signature help/references/rename)
- DCE, peephole optimizer, int32 overflow-safe constant folding
- Compiler intrinsics: `double + double` → `double_add`, etc.
- `__NS__` / `__OBJ__` placeholders in raw()
- `nbt_read` MIR instruction (fixes as-fixed temp rename bug)

### stdlib (35 modules, complete)
| Module | Contents |
|--------|----------|
| `math` | abs/sign/min/max/clamp/lerp/sqrt/sin/cos/atan2/ln/exp/cbrt/bezier + SA-tuned |
| `math_hp` | double_add/sub/mul/div, ln_hp, double_sqrt, pow_real, pow_fast |
| `list` | sum/avg/min/max/contains/index_of/shuffle/dedup_count |
| `random` | LCG/PCG, distributions: normal/binomial/hypergeometric/gamma/poisson/geometric |
| `signal` | DFT (n≤8), distributions |
| `geometry` | in_cylinder/cone/sector_2d/sphere/aabb |
| `bits` | bit_and/or/xor/shl/shr/popcount |
| `bigint` | 96-bit + arbitrary-length array API |
| `matrix` | 2D/3D rotation, scale, quaternion |
| `vec` | dot/cross/length/normalize/atan2_fixed |
| `quaternion` | quat_mul/slerp/euler/axis-angle |
| `color` | RGB↔HSL, pack/unpack, lerp, rgb_to_hex |
| `noise` | value noise 1D/2D, fractal Brownian motion |
| `easing` | quad/cubic/quartic/sine/expo/back/bounce/smoothstep |
| `parabola` | ballistic trajectory, launch angle |
| `advanced` | bezier_n, Mandelbrot/Julia, modular exponentiation |
| `calculus` | trapezoid/Simpson integration, Welford statistics |
| `expr` | RPN expression evaluator |
| `world` | sun_altitude, sun_azimuth |
| `physics/particles/combat/effects/player/mobs/...` | 16 more game mechanic modules |

### Tests
- Unit/e2e: **1588** passing
- MC integration: **74** passing

### Tooling
- SA + Nelder-Mead tuner (`redscript tune --adapter <name>`)
- VSCode extension v1.2.73 (syntax highlight, hover, goto-def, completion, signature help, find references, rename)
- VitePress docs site with stdlib reference + zh translations

---

## Roadmap

### v2.6 — Language Polish

#### Compiler
- [ ] **`for i in 0..n` syntax sugar** — desugar to while, less boilerplate
- [ ] **Array literal type inference** — `let a = [1, 2, 3]` → `int[]` without annotation
- [ ] **Struct methods** — `impl Vec3 { fn dot(self, other) }` syntax
- [ ] **Inlay hints** — show inferred types next to `let` (LSP framework ready, needs AST `inferredType`)
- [ ] **exp_fx / sin_fixed SA Tuner adapters** — further error reduction

#### stdlib  
- [ ] **bigint ÷ bigint** — full arbitrary-precision division (currently only div_small)
- [ ] **mat3_mul / mat4_mul** — general matrix multiply in matrix.mcrs

---

### v3.0 — Compiler-Native stdlib Advantage
> These use features unique to RedScript (coroutine, struct, type system) that raw mcfunction cannot replicate.

#### P1 — Data Structures (leverages struct + int[] backend)
- [ ] **`heap.mcrs`** — MinHeap / MaxHeap (priority queue over int[])
  - `heap_push(h, val)`, `heap_pop(h)`, `heap_peek(h)`
  - Use case: event scheduling, Dijkstra priority queue
  - Advantage: type-safe struct wrapper; in raw mcfunction requires 100+ lines of manual storage management

- [ ] **`graph.mcrs`** — adjacency list + traversal
  - `graph_add_edge(g, from, to, weight)`, BFS, DFS
  - Backed by int[] arrays, struct for graph metadata
  - Prerequisite for pathfinding

#### P2 — Coroutine-Native Algorithms (leverages @coroutine)
> The killer differentiator vs kaer. These are impossible to implement cleanly in raw mcfunction because they require tick-spreading.

- [ ] **`pathfind.mcrs`** — A* pathfinding
  - `@coroutine(batch=20, onDone="on_path_done")`
  - Processes 20 nodes/tick → 500-node graph in 25 ticks
  - Input: start/goal coords + obstacle tags. Output: waypoint list in storage
  - Use case: mob AI, NPC navigation, auto-turret targeting
  - kaer equivalent: impossible (each tick can run ~65k commands total, A* on 500 nodes = timeout)

- [ ] **`fft.mcrs`** — Fast Fourier Transform (O(n log n))
  - Current DFT is O(n²), n≤8. FFT enables n=64/128 in reasonable ticks
  - `@coroutine(batch=8)` for butterfly stages
  - Use case: audio analysis, terrain frequency analysis, signal filtering
  - Advantage: requires double precision (we have it), kaer has only DFT

- [ ] **`sort.mcrs`** — merge sort / quicksort over int[]
  - Current list.mcrs has bubble sort (O(n²))
  - Merge sort via @coroutine: sort 1000 elements in ~50 ticks
  - Use case: leaderboards, inventory sorting

#### P3 — Numerical Computing (leverages double precision chain)
- [ ] **`ode.mcrs`** — Runge-Kutta 4 ODE solver
  - `rk4_step(f, y, t, h)` — one integration step
  - Use case: physics simulation, smooth projectile arcs with drag
  - Requires double precision throughout (we have double_mul, pow_real etc.)

- [ ] **`linalg.mcrs`** — Linear algebra over double
  - Dot product, matrix-vector multiply, Gaussian elimination
  - Use case: 3D transformations, regression, curve fitting
  - More precision than fixed-point matrix.mcrs

#### P4 — ECS Framework (leverages foreach + struct + type system)
- [ ] **`ecs.mcrs`** — Entity Component System
  - `register_component(entity, Health { 100, 100 })`
  - `@tick` system auto-iterates over tagged entities
  - Advantage: type-safe component access; kaer has no abstraction over entity NBT

---

### Long-term 🌱

- [ ] **REPL / playground** — browser-based RedScript → mcfunction live preview
- [ ] **Generic containers** — needs compiler generics instantiation  
- [ ] **Cross-file incremental tests** — only rerun affected modules
- [ ] **String interpolation** — proper language feature (currently VSCode extension trick)

---

## Architecture Notes

- **double parameter passing**: callee sees `rs:d __dp0`, `__dp1` (NBT copy, not scoreboard)
- **double_mul_fixed macro**: `rs:math_hp __dmul_args.scale` (dot notation, not space)
- **marker entity UUID**: `b54f1a4f-d7ac-4002-915e-3c2a3bf6f8a4` (double_add/sub entity trick)
- **`__NS__` / `__OBJ__`**: replaced at compile time in raw() strings
- **mulfix(a,b) = a×b/1000** (correction divisor for ×10000 fixed multiply)
- **Coroutine yield mechanism**: loop back-edges, NOT a `yield` keyword
- **@coroutine constraint**: cannot contain macro calls (continuations called via `function`, not macro)
