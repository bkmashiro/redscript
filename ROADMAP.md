# RedScript Roadmap

Last updated: 2026-03-19

---

## Current State (v2.6.0)

### Compiler
- v2 pipeline: HIR → MIR → LIR → mcfunction
- Type system: int / fixed (×10000) / double (NBT IEEE 754) / float (deprecated)
- `double` type: NBT storage `rs:d`, explicit `as` cast, binary ops auto-lower to stdlib intrinsics
- Module system, generics, enum, Option<T>
- @coroutine (back-edge yield, batch/onDone), @schedule, @on_trigger, @tick
- Optional semicolons
- `for i in 0..n` range syntax sugar ✅
- Incremental compilation, source maps
- DCE, peephole optimizer, int32 overflow-safe constant folding
- Compiler intrinsics: `double + double` → `double_add`, etc.
- `__NS__` / `__OBJ__` placeholders in raw()
- `nbt_read` MIR instruction (fixes as-fixed temp rename bug)
- `impl TypeName {}` struct methods with field-by-field param expansion ✅
- `let h: int[] = heap_new()` — int[] var from function call monomorphized ✅

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
| `heap` | MinHeap / MaxHeap (priority queue) ✅ |
| `sort` | heapsort + mergesort over int[] ✅ |
| `pathfind` | A* (coroutine-based, 20 nodes/tick) ✅ |
| `physics/particles/combat/effects/player/mobs/...` | 13 more game mechanic modules |

### Tests
- Unit/e2e: **1679** passing
- MC integration: **88** passing

### Tooling
- SA + Nelder-Mead tuner (`redscript tune --adapter <name>`)
- VSCode extension v1.3.14 — full LSP: hover (builtins/fn/struct/var/selector/decorator), goto-def, completion (imported modules, @decorators, @selectors, locals), signature help, references, rename
- VitePress docs site with stdlib reference + zh tutorials 01-10

---

## Today's Sprint (2026-03-19)

Priority order (dependencies first):

### ① Parser: add `span.endLine` to fn declarations
- **Status**: ✅ done (commit `eded998`)
- **Why**: LSP currently uses "next fn start - 1" as implicit endLine. This works but is fragile.
  Proper fix: parser emits `endLine` when it sees the closing `}`.
- **Impact**: hover/F12/completion scope all improve

### ② Compiler: `string + var` type error
- **Status**: ✅ done (commit `8ce5955`)
- **Why**: `"text" + 5` silently compiles to broken `tellraw @a {"text":"~"}`. 
  Should be a compile error directing user to f-strings.
- **Change**: in HIR binary op lowering, if either operand is string type, throw DiagnosticError.

### ③ f-string in tell/subtitle/actionbar/title
- **Status**: ✅ done (commit `8ce5955`)
- **Why**: f-string emit for builtins doesn't interpolate scoreboard values into JSON text component.
  Need to emit `{"score":{"name":"$var","objective":"..."}}` or `{"text":"","extra":[...]}` form.
- **Impact**: `tell(@a, f"Score: {score}")` actually works

### ④ LSP: Inlay hints
- **Status**: ✅ done (commit `80fe229`)
- **Why**: `let x = some_fn()` — type shown next to variable name
- **Needs**: type inference info from TypeChecker or from collectLocals result

### ⑤ stdlib: mat3_mul / mat4_mul
- **Status**: ✅ done (commit `c44e581`)
- **Where**: `src/stdlib/matrix.mcrs`
- **Notes**: pure fixed-point arithmetic, no new compiler features needed

### ⑥ stdlib: bigint ÷ bigint
- **Status**: ✅ done (commit `c44e581`)
- **Where**: `src/stdlib/bigint.mcrs`  
- **Notes**: algorithm: long division on int[] representation

---

## Roadmap

### v2.6 — Language Polish (in progress)

#### Compiler
- [x] **`for i in 0..n` syntax sugar** — implemented
- [x] **Array literal type inference** — `let a = [1, 2, 3]` → `int[]` without annotation (already worked)
- [x] **Struct methods** — `impl Vec3 { fn dot(self, other) }` with field-by-field expansion
- [x] **`string + var` type error** — errors with clear f-string hint ✅
- [x] **f-string tell/subtitle/actionbar** — proper JSON text component emit ✅
- [x] **Inlay hints** — shows inferred type next to unannotated `let` ✅
- [x] **Parser: fn endLine in span** — accurate scope for LSP ✅
- [x] **`match` expression** — pattern-match on int/enum; compiles to scoreboard if-chains ✅
- [x] **`for item in array` (`for_each`) iteration** — HIR desugaring to while + dynamic index ✅
- [x] **`arr.len()` dynamic support** — `nbt_list_len` MIR instruction; literal arrays fold to constant, params use `data get storage` at runtime ✅
- [ ] **exp_fx / sin_fixed SA Tuner adapters** — further error reduction

#### stdlib
- [x] **bigint ÷ bigint** — full arbitrary-precision long division ✅
- [x] **mat3_mul / mat4_mul** — 3×3 and 4×4 matrix multiply (fixed ×10000) ✅
- [x] **`dialog.mcrs`** — NPC dialog trees with choice branching ✅
- [x] **`scheduler.mcrs`** — tick-budget-aware task scheduler ✅

---

### v3.0 — Compiler-Native stdlib Advantage
> These use features unique to RedScript (coroutine, struct, type system) that raw mcfunction cannot replicate.

#### P1 — Data Structures (leverages struct + int[] backend)
- [x] **`heap.mcrs`** — MinHeap / MaxHeap — done
- [x] **`sort.mcrs`** — heapsort + mergesort — done
- [x] **`pathfind.mcrs`** — A* pathfinding — done
- [x] **`graph.mcrs`** — adjacency list + BFS/DFS — done

#### P2 — Coroutine-Native Algorithms
- [x] **`fft.mcrs`** — Fast Fourier Transform (O(n log n)) via @coroutine — done
- [x] **`sort.mcrs` v2** — merge sort via @coroutine for large n

#### P3 — Numerical Computing (double precision)
- [x] **`ode.mcrs`** — Runge-Kutta 4 ODE solver — done
- [x] **`linalg.mcrs`** — Linear algebra over double — done

#### P4 — ECS Framework
- [x] **`ecs.mcrs`** — Entity Component System — done
  - Fill the gap that Bedrock's component system has but Java datapacks lack
  - `register_component(entity, Health { 100, 100 })` — attach struct-as-component to entity via NBT + tag
  - `get_component(entity, Health)` — read component fields back via scoreboard/storage
  - `@tick fn health_system()` + `foreach(e: entity[tag=has_health])` — system iteration
  - Advantage: kaer has nothing like this; raw mcfunction requires 100+ lines of manual NBT management per component type
  - Implementation: tags for component presence, NBT storage for data, struct field expansion for reads/writes

---

### v3.1 — Documentation & Tooling

#### Language Reference (redscript-docs)
Current state: `en/reference/syntax.md`, `decorators.md`, `builtins.md`, `cli.md` exist but are incomplete.

- [x] **Language Spec completeness audit** — check syntax.md covers: f-string, for..in, range, impl blocks, Option<T>, generics, enums, all decorator args
- [ ] **Type system doc** — int/fixed/double/float distinction, explicit cast rules, when to use which
- [ ] **Error messages guide** — common compiler errors + how to fix (StringConcat, FloatArithmetic, etc.)
- [x] **stdlib API completeness** — many stdlib/*.md files are stubs; fill in function signatures, params, return values, examples

#### stdlib Docs (Codex-assisted batch generation)
Missing or incomplete stdlib docs:
- [x] `heap.md`, `sort.md`, `pathfind.md` — new modules, no docs yet
- [x] `matrix.md` — needs mat3_mul/mat4_mul entries
- [x] `bigint.md` — needs bigint_div entry
- [x] `graph.md`, `ecs.md` — will need docs when implemented
- [x] Chinese translations of all reference docs (en/ → zh/ sync)

#### Changelog
- [x] **v2.6.0 changelog** — document LSP improvements, f-string emit, string+var error, inlay hints, parser endLine, mat/bigint additions

---

### Long-term 🌱

- [ ] **Generic containers** — needs compiler generics instantiation  
- [ ] **Cross-file incremental tests** — only rerun affected modules
- ~~**REPL / playground**~~ — removed, not worth the effort

---

## Architecture Notes

- **double parameter passing**: callee sees `rs:d __dp0`, `__dp1` (NBT copy, not scoreboard)
- **double_mul_fixed macro**: `rs:math_hp __dmul_args.scale` (dot notation, not space)
- **marker entity UUID**: `b54f1a4f-d7ac-4002-915e-3c2a3bf6f8a4` (double_add/sub entity trick)
- **`__NS__` / `__OBJ__`**: replaced at compile time in raw() strings
- **mulfix(a,b) = a×b/1000** (correction divisor for ×10000 fixed multiply)
- **Coroutine yield mechanism**: loop back-edges, NOT a `yield` keyword
- **@coroutine constraint**: cannot contain macro calls (continuations called via `function`, not macro)
- **f-string tell emit**: must generate `{"text":"","extra":[{"text":"prefix"},{"score":...},...]}` JSON
