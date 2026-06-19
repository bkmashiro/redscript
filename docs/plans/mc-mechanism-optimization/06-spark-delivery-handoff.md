# Spark Delivery Handoff: MC Mechanism Arithmetic Optimization

This file is the controller-facing task board. Each task is intentionally small enough to hand to Spark as an isolated lane.

## Lane 0 — Read-only report digestion

**Objective:** Verify the split report and current code agree before editing.

**Files:**
- Read: `docs/plans/mc-mechanism-optimization/*.md`
- Read: `docs/plans/arithmetic-optimization-exploration.md`
- Read: `benchmarks/arithmetic-probes.ts`
- Read: `src/stdlib/math_hp.mcrs`

**Deliverable:** A short PASS/ISSUES summary listing stale assumptions, missing probe cases, or helper names that do not match code.

**No edits.**

## Lane 1 — Cost model extension

**Objective:** Extend static arithmetic probes beyond command categories.

**Files:**
- Modify: `benchmarks/arithmetic-probes.ts`
- Modify: `src/__tests__/arithmetic-probes.test.ts`
- Maybe modify: `docs/dev/README-benchmarks.md`

**Expected additions:**
- estimated forks: commands containing `execute as @e`, `execute as @a`, broad selectors, or `run function` inside `execute as`;
- selector mentions and broad selector risk;
- NBT scalar reads vs whole-list copies;
- macro command count;
- entity/display setup hints from command categories;
- JSON field names stable enough for future trend comparison.

**Verification:**
```bash
npm test -- src/__tests__/arithmetic-probes.test.ts --runInBand
npm run bench:arithmetic -- --case all --opt 1 --output /tmp/arithmetic-probes-cost.json
npm run build
```

## Lane 2 — Display decomposition characterization probe

**Objective:** Add a live Paper probe for display transformation decomposition before any new helper API.

**Probe cases:**
- diagonal matrix baseline;
- complex 2×2 hypot matrix `[[3,-4],[4,3]]` expecting singular values near 5;
- scaled rotation;
- symmetric PSD/eigenvalue toy matrix;
- rank-deficient matrix;
- same-tick read vs next-tick read if harness supports tick stepping.

**Files likely touched:**
- `src/__tests__/mc-integration/...` or a new focused live probe test file;
- helper utilities if existing mc integration harness needs a reusable command/assert wrapper.

**Non-goal:** no public stdlib helper.

## Lane 3 — Attribute / item-modifier ALU probe

**Objective:** Test whether item modifier + attribute read can implement fused affine/dot reductions with same-tick readback.

**Probe cases:**
- one carrier with fixed base and replace:true modifier;
- signed/bias range;
- repeated invocation does not accumulate stale modifiers;
- `dot4` expected value;
- batch N=1 and small N if harness supports entity pools.

**Non-goal:** no `dot4` helper until clamp/version behavior is understood.

## Lane 4 — Enchantment Level-Based Value ALU probe

**Objective:** Test bounded unary ALU possibilities for lookup/square/fraction/exponent.

**Probe cases:**
- `lookup` for small bounded input;
- `levels_squared` sum of squares;
- `fraction` reciprocal;
- if target version supports it, `exponent` sqrt/reciprocal;
- level 0 / absent enchantment edge case.

**Non-goal:** no version-gated helper API until capability matrix is documented.

## Lane 5 — Combined `sincos_hp` helper

**Objective:** Implement the lowest-risk public helper candidate after measuring current separate-call baseline.

**Files likely touched:**
- `src/stdlib/math_hp.mcrs`
- `src/__tests__/stdlib/math_hp.test.ts` or `src/__tests__/double.test.ts` if existing patterns fit
- generated docs only via `npm run docs:gen` if comments become public docs

**Required proof:**
- compile-time command count comparison via `benchmarks/arithmetic-probes.ts` or an added probe case;
- live Paper representative angles if the harness can cover `sin_hp`/`cos_hp` already;
- no behavior change to existing `sin_hp` / `cos_hp`.

## Lane 6 — RMW optimizer design review

**Objective:** Produce a design before implementation.

**Read:**
- `src/lir/types.ts`
- `src/lir/lower.ts`
- `src/emit/index.ts`
- `src/optimizer/lir/*`
- existing optimizer tests

**Deliverable:** exact safe insertion point, pattern shape, side-effect barriers, and RED test plan for scoreboard read-modify-write direct emission.

**No edits unless explicitly promoted.**

## Final controller gate for any edit lane

Run at minimum:

```bash
npm run build
npm run validate-mc
npm test -- --runInBand
git diff --check
```

For live probes, report clearly whether the Paper/TestHarnessPlugin path actually ran or skipped offline. Offline skip is not real Minecraft proof.
