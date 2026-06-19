# Numeric Scale and Precision Policy

Status: completed Phase 11 policy baseline. This document records the current numeric contract and migration discipline. It does **not** change compiler or stdlib semantics by itself; future numeric changes should update this document and add tests in the same slice.

## Goals

RedScript targets Minecraft datapacks, so most fast arithmetic eventually passes through scoreboard integers. The policy goal is not to force one global fixed-point scale. The goal is to make every scale boundary explicit enough that compiler changes, stdlib helpers, docs, and tests do not silently disagree.

The current working rules are:

1. The language-level `fixed` type has one canonical representation.
2. `double` remains a separate NBT-backed Java double representation.
3. Stdlib helper families may use scale-specific integer APIs when that is safer than pretending they are language `fixed`.
4. Mixed numeric arithmetic must fail loudly unless a conversion is explicit and documented.
5. Scale migrations are semantic migrations and require broad golden/runtime tests.

## Current representations

| Surface | Representation | Contract |
|---|---:|---|
| `int` | scoreboard int32 | Plain integer. No implicit conversion to/from `fixed` or `double` in binary arithmetic. |
| `fixed` | scoreboard int32, ×10000 | Decimal literals lower with `Math.round(value * 10000)`. `fixed * fixed` must divide by `10000`; `fixed / fixed` must multiply the dividend by `10000` before division. |
| `float` | legacy alias of `fixed` | Deprecated spelling. It remains compatible with `fixed` while the alias exists, but new docs/examples should use `fixed`. |
| `double` | NBT-backed Java double (`rs:d`) | Stored out-of-scoreboard. Casts and some helper paths round-trip through ×10000 scoreboard values when returning to integer/fixed contexts. |
| `math.mcrs` legacy helpers | mostly ×1000 integer fixed-point | `sqrt_fixed`, `sin_fixed`, `cos_fixed`, and `lerp` document/use ×1000 conventions. Treat these as legacy scale-specific APIs, not language `fixed`. |
| `math_hp.mcrs` helpers | mostly ×10000 integer fixed-point or NBT double tricks | `*_hp` helpers generally document ×10000 inputs/outputs and may use marker/display-entity tricks. |
| `signal.mcrs` helpers | mostly ×10000 integer fixed-point | Probabilities, distributions, and fractions use explicit `_fx`-style integer scale conventions. |
| `geometry.mcrs` helpers | mixed ×100 and ×10000 | Older projectile/coordinate helpers use ×100; selector/shape helpers use ×10000; angles use ×10000 degrees or explicit radians depending on helper. |

## Why multiple scales remain valid

Minecraft scoreboards are signed int32. Multiplication is the main pressure point:

| Scale | 1.0 value | Safe-ish product intuition | Typical use |
|---|---:|---|---|
| ×100 | `100` | Large coordinate/velocity envelopes | Block/tick geometry, gameplay coordinates, coarse physics. |
| ×1000 | `1000` | Medium precision with more headroom than ×10000 | Legacy trig/sqrt helpers, simple interpolation. |
| ×10000 | `10000` | Better fractional precision but multiplication overflows quickly unless corrected or bounded | Language `fixed`, probabilities, high-precision helpers. |

A global rewrite from ×1000 or ×100 to ×10000 can reduce headroom and make formerly safe gameplay helpers overflow. A rewrite in the other direction can break language-level `fixed` expectations and existing golden output. Do not migrate scale by search-and-replace.

## Language-level `fixed`

Phase 11 decision: compiler `fixed` remains ×10000. This is now treated as the canonical language representation, not an open migration target. Any future proposal to move it to a lower scale is a major semantic migration and must include broad golden/runtime tests, docs, and compatibility planning.

The compiler contract for `fixed` is currently ×10000:

- A decimal literal such as `1.5` lowers to `15000`.
- `a: fixed; b: fixed; a * b` lowers as:
  - multiply the two ×10000 score values,
  - divide by `10000` to restore ×10000 scale.
- `a / b` lowers as:
  - multiply the dividend by `10000`,
  - divide by the divisor.
- Struct fields, method receiver fields, and function parameters that are typed `fixed` or legacy `float` must keep this scale metadata through MIR lowering.
- `expr as fixed`, `expr as int`, and `expr as double` are explicit conversions. Future scale-specific conversions must make rounding and overflow policy visible.

Current hardening tests pin this behavior in:

- `src/__tests__/fixed.test.ts`
- `src/__tests__/mir/lower-extra5.test.ts`

## `double` policy

`double` is not “a bigger fixed”. It is an NBT-backed Java double value with helper-specific precision and conversion boundaries.

Current documented tiers:

| Helper path | Precision tier | Contract |
|---|---|---|
| `double_add` | NBT/entity double | Uses the entity position trick and keeps arithmetic in Java double precision. |
| `double_div` | NBT/display-entity double | Uses display-entity SVD and keeps the division in Java double precision; division by zero follows Java double/MC NBT failure modes and is not safe to read back. |
| `double_sub` | scale-crossing double | Negates the subtrahend through a ×10000 score read/write before using the add path; expect fixed-scale rounding/truncation at that boundary. |
| `double_mul` | macro-scale double path | Reads the second operand through a ×10000 score to build the shared `__dmul_apply_scale` macro argument, then scales a ×10000 read of the first operand through NBT-backed double storage; avoids the old ×10000 int32 scoreboard product envelope, but rounds/truncates operands at 1e-4, requires each operand ×10000 to fit the command/score envelope, and does not promise NaN/Infinity behaviour. |
| `double_mul_fixed` | NBT double × ×10000 fixed | Uses a macro scale trick so the double operand stays in NBT and is multiplied by a ×10000 fixed integer scale. |

Docs and API names should say when a helper is true NBT/double precision versus approximate or scale-crossing.

## Stdlib scale families

### Legacy ×1000 helpers (`math.mcrs`)

Keep these semantics unless a deliberate migration plan replaces them:

- `sqrt_fixed(x)` currently means `x` is ×1000 and returns ×1000.
- `sin_fixed(deg)` / `cos_fixed(deg)` return ×1000.
- `lerp(a, b, t)` uses `t` in `[0, 1000]`.

Because these names contain `fixed` but do not match language `fixed` ×10000, they should be documented as legacy scale-specific integer helpers. New code can use the explicit additive aliases (`sqrt_fx1000`, `sin_fx1000`, `cos_fx1000`, `lerp_t1000`, `mul_fx1000`, `div_fx1000`, `smoothstep_t1000`, and `smootherstep_t1000`) to make the scale visible. The old names remain available for compatibility and are not deprecated by this policy document alone.

### High-precision ×10000 helpers (`math_hp.mcrs`)

`*_hp` helpers generally use ×10000 and runtime entity/NBT tricks. Keep each helper’s setup requirement and overflow envelope explicit. These helpers may be suitable for language-`fixed` interop, but only when the input/output scale actually matches ×10000.

### Probability/statistics helpers (`signal.mcrs`)

The `_fx` convention means integer fixed-point, usually ×10000. Probability helpers should keep the scale visible in parameter names such as `p_fx`, `lambda_fx`, and in docs.

### Geometry helpers (`geometry.mcrs`)

Geometry intentionally mixes scales:

- Older projectile helpers use coordinates/velocities ×100 for block-level headroom.
- Angle helpers use degrees ×10000.
- Selector/cylinder/cone helpers use coordinates ×10000 and must document overflow-sensitive radius ranges.

Do not infer all geometry inputs are language `fixed`.

## Conversion and DX rules

Current rule: mixed numeric binary arithmetic is rejected before lowering. Code must use explicit casts or helper functions.

Allowed direction for future DX:

- Keep `expr as fixed`, `expr as int`, and `expr as double` explicit.
- Future scale-specific forms must expose scale and rounding, for example `expr as fx3 round`, `expr as fx3 trunc`, or named stdlib helpers such as `to_fx1000_round(expr)`.
- Target typing may help literals where the target type is syntactically declared (`let x: fixed = 1.2`, return type, function arg, struct field), but must not silently convert arbitrary runtime expressions across numeric families.
- A future `numeric fx4 { ... }` block, if added, should be sugar over explicit target typing and should reject ambiguous mixed-scale expressions.

Not allowed:

- C-style casts such as `(fx3)a` as the main surface.
- Implicit `int + fixed`, `double + fixed`, or cross-scale arithmetic.
- Hidden scale migrations in stdlib helper bodies without matching docs and golden/runtime tests.

## Helper tuner policy

Numeric tuning is helper-level infrastructure. It must not change the language-level `fixed` representation or make `fixed` scale configurable through compiler options.

Tuner outputs should be treated as generated stdlib overlays:

- Primary artifact: a generated `.mcrs` helper implementation with an `AUTO-GENERATED by redscript tune` header.
- Sidecar artifact: a generated `.tune.json` manifest when `--manifest-out` is provided. It records schema version, adapter name/description, input/output scale contracts, overflow policy, params/specs, sample source, sample coverage, sample-based overflow/reference validity report, budget, metrics, and generated code path.
- The generated header must record adapter name, tune date, search budget, error metrics, and the command needed to regenerate it.
- Generated helpers may replace or wrap a specific stdlib helper family, but the scale contract remains part of that helper API name/docs (`fx1000`, `×10000`, `double`, etc.).
- The tuner should optimize coefficients, thresholds, iteration counts, lookup-table contents, or approximation variants within a declared input range and overflow envelope.
- Tuning should be reproducible enough for review: keep sample ranges, reference function, objective metric, and MC int32 simulation in the adapter/test code.

Not allowed:

- A global compiler flag that changes `fixed` from ×10000 to another divisor.
- Generated code silently overwriting checked-in stdlib without review.
- Tuning against JavaScript floating-point behavior without also simulating scoreboard int32 overflow/truncation where the helper lowers to scoreboard math.

## Migration checklist

Before changing any numeric scale or helper precision:

1. State the source and target representation.
2. State the overflow envelope and maximum safe input ranges.
3. Add typechecker tests if the change affects allowed expressions.
4. Add MIR/emitter golden tests for language-level fixed-point lowering.
5. Add stdlib unit or Paper-oracle tests for helper behavior.
6. Update docs/comments in the same slice.
7. If renaming APIs, keep a compatibility/deprecation path unless doing a documented breaking release.

## Near-term roadmap

1. Use the explicit ×1000 aliases in new examples and docs when touching legacy helpers; keep old names as compatibility wrappers.
2. Use the documented double precision tiers when writing docs/examples: `double_add`/`double_div` are NBT-backed high precision paths, `double_sub` crosses a ×10000 score boundary, `double_mul` uses the macro-scale double path, and `double_mul_fixed` is NBT double × ×10000 fixed.
3. Helper auto-tuning is now exposed through `redscript tune`; generated `.mcrs` overlays/manifests remain review artifacts, bounded to helper-level coefficients/variants.
4. Future ergonomic conversion helpers or scale-specific syntax can build on this baseline, but should be a new phase with explicit RED tests.

Completed audit note: `math.mcrs`, `math_hp.mcrs`, `signal.mcrs`, and `geometry.mcrs` now carry file-level scale policy comments that preserve existing semantics while making legacy ×1000, ×10000, NBT double, and geometry ×100 boundaries explicit. Phase 11 also locks language `fixed` to ×10000, rejects mixed numeric arithmetic, pins fixed lowering scale behavior, adds explicit ×1000 aliases, and records double helper precision tiers.
