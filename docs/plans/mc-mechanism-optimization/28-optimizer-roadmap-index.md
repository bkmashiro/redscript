# 28. Optimizer Roadmap Index After LIR Local-Copy

> **For Hermes/Spark:** Use this as the routing document after `27-lir-local-copy-proof-to-release-roadmap.md` is closed out. Pick one roadmap lane at a time; do not mix unrelated optimizer families in a single tranche.

**Goal:** Close the current LIR local-copy lane cleanly, then choose the next optimizer family from measured command-pressure and semantic-risk evidence.

**Architecture:** Keep production defaults stable. Prefer project-owned TypeScript LIR analysis/rewrite infrastructure; treat VIR, SMT, fuzzing, or external optimizer tools as isolated evidence sidecars unless a future ADR explicitly promotes them.

**Tech Stack:** TypeScript, Jest, RedScript arithmetic probes, Minecraft validation, existing LIR rewrite/equivalence fixtures.

---

## Current local-copy lane closeout status

The active local-copy roadmap is closed for manual experimental use:

1. **Track AC docs hardening** — completed as a docs-only tranche.
   - Documents that `--experimental-lir-local-copy-rewrite` is manual, experimental, and off by default.
   - Documents incompatibility with `--incremental`.
   - Documents maintainer evidence gate: `npm run gate:lir-local-copy -- --output /tmp/redscript-lir-local-copy.json`.
   - States that passing the gate is evidence, not semantic proof/default-readiness.
2. **Track AD default enablement decision** — intentionally deferred.
   - Do not treat this as closeout.
   - It requires materially reducing/explaining residuals, broader negative/equivalence coverage, an ADR, and a rollback story.

Practical estimate:

- **Closeout-only:** done.
- **Default enablement:** separate future project, not a tail task.

---

## Roadmap candidates for other optimizer families

### R1 — LIR dead-store / dead-temp elimination

**Status:** First conservative slice implemented 2026-06-29: compiler-temp overwrite-before-read elimination in the existing dead-slot pass.

**Product promise:** Remove writes to compiler-owned temps when the value is never read before being overwritten or crossing an observable boundary.

**Why first:** It reuses the existing LIR liveness/barrier infrastructure and should be lower risk than cross-function optimization.

**Primary files:**

- `src/optimizer/lir/analysis.ts`
- `src/optimizer/lir/rewrite.ts`
- new or existing LIR pass file under `src/optimizer/lir/`
- `src/__tests__/optimizer/lir/*.test.ts`
- `benchmarks/arithmetic-probes.ts`

**Proof/gate:** unit tests for barriers/raw/macro/call boundaries; arithmetic probe command deltas; `npm run test:lir`; `npm run validate-mc`.

**Risk:** accidentally deleting writes to ABI/runtime-visible slots. Restrict first version to compiler `_tN` temps.

---

### R2 — LIR constant folding and algebraic peepholes

**Product promise:** Collapse obvious scoreboard arithmetic constants and identities before emission, such as add-zero, multiply-one, double-negation-like patterns if represented in LIR.

**Why:** It can reduce command count without requiring a new IR.

**Primary files:**

- LIR arithmetic representation and lowering sites
- `src/optimizer/lir/rmw.ts` or a separate peephole pass
- `src/__tests__/optimizer/lir/*.test.ts`
- arithmetic probe fixtures

**Proof/gate:** deterministic fixtures for each identity; negative tests for non-commutative/division/modulo cases; arithmetic probes.

**Status:** tranche R2 currently includes conservative `score_min`/`score_max` self-no-op folding in `src/optimizer/lir/const_imm.ts` with unit tests and negative coverage. Next: extend to const-driven no-op identities only where safety is machine-verified.

**Risk:** Minecraft scoreboard integer semantics, overflow/truncation, division/modulo edge cases.

---

### R3 — Scoreboard temp lifetime / slot reuse planning

**Product promise:** Reduce fake-player temp pressure by reusing compiler-owned temp slots when lifetimes do not overlap.

**Why:** This targets command and objective clutter that local copy rewrite cannot solve.

**Primary files:**

- LIR liveness/next-use analysis
- temp allocation or lowering stage that creates `_tN` slots
- tests around functions, calls, macros, and raw commands

**Proof/gate:** lifetime visual/debug output first; allocator off by default until fixtures cover calls/raw/macro/barriers.

**Risk:** high. Shared fake-player temps can be observable across `execute`, function calls, raw commands, and runtime helpers. Needs explicit ABI boundary policy.

---

### R4 — Function-level command peephole/canonicalization

**Product promise:** Canonicalize adjacent emitted command patterns that are clearly equivalent, especially redundant scoreboard set/copy sequences within one function.

**Why:** It is localized and can run after lowering without requiring broad compiler changes.

**Primary files:**

- LIR command lowering/emission path
- existing rewrite harness
- Minecraft validation fixtures

**Proof/gate:** before/after `.mcfunction` snapshots; `validate-mc`; negative tests for comments/source maps if relevant.

**Risk:** textual command equivalence is fragile. Prefer LIR-level canonicalization unless the pattern is purely mechanical.

---

### R5 — Call/return materialization cleanup

**Product promise:** Reduce copy pressure around `$pN`, `$ret`, helper arguments, and return preservation where ABI rules prove the copy is redundant.

**Why:** Arithmetic probes show copy pressure around helper calls; this can have real impact on stdlib math.

**Primary files:**

- call lowering / ABI documentation
- LIR analysis and rewrite fixtures
- arithmetic probe cases using `math` and `math_hp`

**Proof/gate:** first tranche must be documentation/diagnostic-only: enumerate `$pN`/`$ret` clobber rules and helper visibility. Rewrite only after negative tests exist.

**Risk:** very high. ABI and reentrancy mistakes can silently corrupt caller state.

---

### R6 — Storage/NBT copy-pressure reduction

**Product promise:** Avoid unnecessary whole-list/compound NBT copies and prefer scalar or path-local operations when safe.

**Why:** This targets a different cost class than scoreboard commands.

**Primary files:**

- storage/NBT lowering
- cost model in arithmetic or mechanism probes
- Minecraft validation/test datapacks

**Proof/gate:** live/Paper mechanism probes likely required; static validation alone is not enough.

**Risk:** high because NBT path semantics and command side effects are not equivalent to scoreboard temps.

---

### R7 — Function inlining / outlining decision gate

**Product promise:** Reduce `function` call overhead for tiny helpers or outline repeated command blocks when it lowers total command pressure.

**Why:** Can help generated helper-heavy code, but only with a cost model.

**Primary files:**

- MIR/HIR function metadata or lowering stage
- benchmark cost model
- emitted datapack snapshots

**Proof/gate:** start diagnostic-only: measure call sites, command deltas, and code-size tradeoffs. No rewrite in first tranche.

**Risk:** recursion, `execute as/at` context, tick/load semantics, and code-size explosion.

---

### R8 — VIR arithmetic revisit, still experimental

**Product promise:** Re-evaluate whether the isolated VIR arithmetic lane can prove value after LIR local-copy improvements.

**Why:** The old VIR spike was closed because proof/allocation blockers were unresolved; after LIR improvements, the remaining benefit may be smaller or more focused.

**Primary files:**

- `src/optimizer/vir/**` only in an explicit experimental lane
- archived VIR evidence docs
- arithmetic probes

**Proof/gate:** read-only comparison first: compare current LIR path vs VIR spike outputs and residuals. No production integration.

**Risk:** very high if promoted too early. Keep off production path unless a new ADR says otherwise.

---

## Recommended order

1. Use this closeout as the handoff point for the local-copy lane; do not fold default enablement into the next small task.
2. Create R1 as the next active roadmap if we want another low-risk production-adjacent optimizer.
3. Run R5 as a diagnostic-only ABI/call-copy investigation if math helper command count is the priority.
4. Defer R3/R6/R7/R8 until the lower-risk LIR lanes have stronger evidence.

Do not default-enable any experimental optimizer based only on benchmark deltas. Each roadmap needs explicit negative fixtures, controller gates, and a rollback/default decision before promotion.
