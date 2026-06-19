# Arithmetic Optimization and Minecraft Mechanism Exploration

Status: Phase 14 proposal / exploration backlog. The full Minecraft mechanism report is split under [`mc-mechanism-optimization/`](./mc-mechanism-optimization/README.md) with a Spark delivery handoff.

This document tracks the next numeric direction after the fixed-scale policy,
helper-level tuner, and `double_mul` macro-scale work. The goal is not to change
language-level `fixed` semantics. `fixed` remains compiler-owned ×10000. Future
work should optimize helper implementations, MIR/LIR/codegen output, and selected
Minecraft runtime mechanisms behind explicit stdlib APIs.

## Current baseline

### Compiler optimization stack

The optimizer is no longer a blank slate. The MIR pipeline already has ordinary
compiler passes such as loop unrolling, LICM, NBT/scoreboard batching, constant
folding, strength reduction, CSE, copy propagation, branch simplification, DCE,
block merging, inlining, and interprocedural constant propagation. The LIR side
currently has dead-slot elimination, constant-immediate folding, and an
`execute store` peephole.

The remaining gap is Minecraft-specific cost awareness:

- command count and file count are not yet tracked per helper/probe;
- scoreboard temp/copy chains may still survive to emitted commands;
- read-modify-write patterns are not always emitted as direct scoreboard ops;
- selector caching is not enabled in the default pipeline yet because it needs
  matching codegen/runtime support;
- raw commands, macro calls, storage side effects, and entity side effects form
  optimization barriers;
- there is no stable benchmark artifact for helper command cost, setup cost, or
  live Paper latency.

### Arithmetic/helper baseline

| Area | Current state | Main limitation |
| --- | --- | --- |
| `int` arithmetic | Native scoreboard operations | Mostly codegen/temp overhead, not math semantics |
| language `fixed` | ×10000, mixed arithmetic rejected, lowering pinned | `*`/`/` can overflow due int32 scoreboard envelope |
| legacy `fx1000` helpers | Explicit aliases exist in `math.mcrs` | Lower precision but better headroom; should remain explicit |
| `double_add/sub` | Entity position/local-coordinate trick | True double-ish path but command/entity-heavy |
| `double_mul` | Reviewed macro-scale path | Better than int32 product, not full IEEE multiplication |
| `double_div` / `div_hp` | Display entity SVD/decomposition trick | Powerful but setup/entity/macro cost must be measured |
| `ln_hp` / `exp_fx` | Iterative/polynomial approximations exist | Need range/error/cost profiles |
| `sqrt_fx` | Mostly `isqrt(x) * 100` style approximation | Fast, but precision is coarse for ×10000 helpers |

## Phase 14 goals

1. Build a reusable way to express arithmetic probes as small RedScript snippets.
2. Compile probes under optimization presets and report command/file/category
   costs in a machine-readable format.
3. Use Paper/live probes only for Minecraft mechanisms that cannot be proven from
   emitted commands alone.
4. Split high-risk mechanism ideas into small Spark-sized lanes with explicit
   success/failure criteria.
5. Promote only proven mechanisms into public stdlib helpers; keep speculative
   probes under tests/benchmarks.

## Tooling first: arithmetic probe benchmark

A first tool should live under `benchmarks/` and answer:

- What source snippet was compiled?
- Which stdlib module(s) were included?
- How many `.mcfunction` files and emitted commands were generated?
- How many commands mention `scoreboard`, `execute`, `data`, `function`,
  `summon`, `tp`, `storage`, selectors, or macros?
- How do O0/O1/O2 differ?

The initial version does not need to execute Minecraft. It is a compile-time cost
lens. Later live probes can add Paper latency and output correctness.

Recommended usage shape:

```bash
npx ts-node benchmarks/arithmetic-probes.ts --list
npx ts-node benchmarks/arithmetic-probes.ts --case fixed_mul_div
npx ts-node benchmarks/arithmetic-probes.ts --case double_div --opt 1 --output /tmp/ddiv.json
npx ts-node benchmarks/arithmetic-probes.ts --case all --opt all
```

## Exploration backlog

### A. Display entity SVD / transformation decomposition

#### A1. Rank-1 matrix norm probe

Question: can block_display transformation decomposition expose
`sqrt(x*x + y*y + z*z)` as a singular value when the matrix is rank-1?

Success criteria:

- Paper probe sets a rank-1 3×3 transformation matrix for `(3,4,0)` and reads a
  scale component close to `5`.
- Probe repeats with `(1,1,1)` and a scaled fixed-point input.
- Document which `transformation.scale[i]` component is stable.

Potential helpers if proven:

- `norm2_svd(x, y)`
- `norm3_svd(x, y, z)`
- `hypot_svd(x, y)`
- `normalize3_svd(x, y, z)`
- possibly a new `sqrt_hp` backend for non-negative inputs.

#### A2. Batch division / reciprocal profile

Existing `div3_hp` suggests one denominator can be shared by several numerators.
Generalize the pattern only after cost and live correctness are measured.

Candidate helpers:

- `div2_hp(a, b, d)`
- `div3_hp(a, b, c, d)` refinement/benchmark
- `normalize2_hp(x, y)`
- `normalize3_hp(x, y, z)`
- `recip_hp(d)` if the reciprocal can be represented safely.

#### A3. Quaternion normalization probe

Question: if a non-unit quaternion is written into a display/entity rotation
field, does Minecraft normalize and persist the normalized values back to NBT?

Success criteria:

- Paper probe writes known non-unit quaternions.
- Reads back normalized values, not original raw values.
- Demonstrates stable behavior across reload/tick boundaries.

Potential helpers if proven:

- `rsqrt_hp(x)`
- vector/quaternion normalization helpers
- reciprocal square-root initialization for Newton refinements.

### B. Entity rotation / local coordinate basis

#### B1. `sincos_hp` combined helper

Current `sin_hp` and `cos_hp` can likely share one rotation/local teleport and
read both `Pos[0]` and `Pos[2]`. This is low-risk because the mechanism already
exists.

Success criteria:

- Compile-time benchmark shows fewer commands than separate `sin_hp` + `cos_hp`.
- Paper oracle verifies representative angles.
- Public API is explicit about output storage/return convention.

#### B2. Direction vector from yaw/pitch

Use `rotated` plus local coordinate movement to get a direction basis vector.
This is useful for projectile/raycast/gameplay helpers rather than pure math.

Candidate helpers:

- `dir_from_yaw_pitch_hp(yaw, pitch)`
- `ray_step_from_angles_hp(yaw, pitch, distance)`

#### B3. Facing/rotation inverse probe

Question: can `tp ... facing ...` or another entity operation provide a stable
`atan2`/yaw/pitch inverse by reading `Rotation` afterward?

This is speculative and should remain a probe until live behavior is proven.

### C. Scoreboard/codegen optimizations

#### C1. Direct read-modify-write scoreboard op

Detect patterns where a scoreboard slot is read into a temp, modified, then
written back to the same slot without intervening side effects. Emit direct
`scoreboard players operation slot *= ...` / `+= ...` where safe.

Success criteria:

- Command-count golden proves fewer emitted commands.
- Tests cover raw command/function/storage side-effect barriers.
- No behavior change for aliased slots or cross-block control flow.

#### C2. Single-use temp/copy-chain folding

Tighten LIR/codegen so single-use temps and adjacent copy chains disappear before
emission.

Success criteria:

- Golden command snippets shrink for arithmetic-heavy code.
- Existing optimizer tests still pass.
- No generated debug/profile artifact regresses.

#### C3. Constant slot pool audit

Evaluate whether canonical `#const_2`, `#const_1000`, `#const_10000`, etc.
reduce emitted setup and runtime commands versus local constants.

This needs load/setup cost accounting; do not add a global constant pool without
measuring datapack size and load impact.

### D. Approximate math / iterative helper families

#### D1. `sqrt` tiers

Define explicit tiers instead of overloading one helper name:

- `sqrt_fx10000_fast`: current-style `isqrt(x) * 100`, low cost.
- `sqrt_fx10000_newton1`: one Newton refinement from a fast initial guess.
- `sqrt_fx10000_newton2`: two refinements, bounded range.
- `sqrt_hp`: entity/SVD-backed if proven.

Each tier needs range, overflow, error, and command-cost metadata.

#### D2. Reciprocal/Newton division tiers

For repeated division by the same denominator, approximate reciprocal may beat
repeated scoreboard division or repeated SVD calls.

Candidate method:

```text
r_{n+1} = r_n * (2 - d*r_n)
```

Use tuner/adapters for initial guesses or range-specific coefficients. Keep it
helper-level; do not change `/` semantics.

#### D3. Trig tiers

Current tiers are roughly legacy LUT ×1000 and entity hp. Add a middle tier only
if compile-time/live benchmarks show value:

- LUT + interpolation at ×10000;
- `sincos_hp` combined output for high precision;
- angle range reduction helpers for polynomial approximations.

#### D4. `ln`/`exp` profiles

Use the existing tuner and benchmark tool to create range-specific profiles:

- narrow `[0.5, 2]` fast path;
- broad positive range with range reduction;
- hp path with Newton correction.

## Spark lane decomposition

These are intentionally small and mostly independent.

1. **Read-only cost audit lane**
   - Run `benchmarks/arithmetic-probes.ts` after it exists.
   - Compare O0/O1/O2 for arithmetic cases.
   - Return top command categories and suspicious temp/call patterns.

2. **SVD rank-1 Paper probe lane**
   - Add a focused live harness/probe for display rank-1 norm behavior.
   - No public helper API.
   - Return exact commands, observed values, and stability notes.

3. **`sincos_hp` implementation lane**
   - Add combined helper and tests if the emitted path can share work.
   - Include command-count comparison against separate calls.

4. **RMW optimizer read-only design lane**
   - Inspect LIR/codegen for safe insertion point.
   - Produce a minimal test plan and side-effect barriers before implementation.

5. **sqrt tier prototype lane**
   - Prototype `sqrt_fx10000_newton1` behind a new helper name.
   - Use range/error/command cost reports; do not replace existing `sqrt_fx`.

## Promotion criteria

A probe becomes a public stdlib helper only when all of these are true:

- compile-time cost is measured and documented;
- live Paper behavior is verified when entity/display/macro semantics are used;
- input range and overflow envelope are documented;
- output scale and precision tier are explicit in the helper name or docs;
- tests cover representative, boundary, and failure/invalid cases;
- docs are generated from stdlib comments rather than hand-edited downstream.
