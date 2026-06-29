# Post-VIR Optimizer Spark Roadmap Implementation Plan

> **For Hermes:** Use `spark-implementation-lane` for implementation tranches and keep the controller responsible for final diff review, gates, commits, and push decisions.

**Goal:** Convert the closed experimental VIR arithmetic spike into a production-safe optimizer roadmap split into bounded Spark-sized tranches.

**Architecture:** Keep production compiler behavior on the existing MIR/LIR path while extracting useful optimizer infrastructure and evidence from the VIR spike. Treat VIR as experimental research until semantic proof and allocation-check gates pass; production-safe work should happen in LIR/shared analysis first.

**Tech Stack:** TypeScript, Jest, `benchmarks/arithmetic-probes.ts`, `src/optimizer/lir/**`, `src/optimizer/vir/**`, RedScript compiler pipeline tests, Spark/Codex implementation workers.

---

## Status and archive boundary

The previous plan set is archived under:

- `docs/plans/mc-mechanism-optimization/archive/2026-06-vir-arithmetic-spike/`

The archive contains the original 00–15 documents and the completed experimental VIR arithmetic closeout. This document is the new active plan.

## Global rules for every Spark tranche

**Always allowed for all tranches:**

- Read any project files needed for context.
- Modify only the tranche-specific allowed files.
- Add tests only in tranche-specific test paths.
- Update this roadmap only when the tranche produces verified results.

**Always forbidden unless a later user message explicitly overrides:**

- No production compiler pipeline hook for VIR.
- No parser/typechecker/LSP/registry/declaration surface changes.
- No public language semantics changes.
- No `package.json`, lockfile, version, release, or generated-docs changes.
- No external live Paper/Minecraft proof unless explicitly enabled by the controller.
- No commit or push from Spark workers.
- Do not count skipped/offline/live probes as semantic proof.

**Controller gates after every tranche:**

```bash
git status --short --branch
git diff --stat
git diff --name-only
git diff --check
```

For code tranches, also run the tranche's exact targeted tests and at least:

```bash
npm run build
npm run validate-mc
```

Run `npm test -- --runInBand` before commit if shared compiler behavior, shared optimizer infrastructure, or broad tests changed.

## Active decision model

Use the closed VIR spike result as evidence, not as a mandate:

- **Continue production-safe work:** LIR/shared optimizer analyses, verifier-style diagnostics, benchmark reporting, tests.
- **Pause broad VIR expansion:** no new VIR op families, effects, calls, storage, control-flow, or production hooks until proof gates are stronger.
- **Research-only VIR cleanup is allowed:** fixture isolation, semantic proof harness, allocation-check diagnosis, and documentation.
- **External optimizer tooling is not the production shortcut:** borrow LLVM/MLIR/Cranelift/regalloc2 ideas, and use Z3/egg/egglog/fast-check as offline proof/search/test aids where useful. Keep the production compiler path on project-owned TypeScript LIR infrastructure unless a separate ADR-backed spike proves a specific dependency is worth it.

## External compiler tooling policy

The useful split is **project-owned production optimizer, external tooling as sidecars**:

- Production path should stay a small RedScript-owned TypeScript LIR optimizer: slot/liveness analysis, barrier-aware rewrite windows, verifier checks, deterministic dashboards, and eventually a tiny pass manager.
- Z3/SMT can be introduced only as an offline/test proof oracle for bounded arithmetic equivalence and rewrite preconditions.
- egg/egglog can be introduced only as an offline rewrite exploration oracle; any promoted rewrite must still be hand-audited and covered by RedScript tests.
- fast-check-style property tests are preferred for rewrite invariants and can support the next LIR-only tranche if dependency policy allows it.
- LLVM/MLIR/Cranelift/Binaryen should not be added as production dependencies now; the Minecraft scoreboard/datapack target would require custom dialect/backend/effect/slot semantics that likely erase the intended savings.

Any future mature-toolchain experiment must be a separate bounded Spark tranche with docs/test-only output first, no production compiler hookup, no package metadata changes unless explicitly approved, and an ADR before dependency adoption.

## Spark tranche index

| Tranche | Name | Main output | Risk | Suggested worker size | Status |
| --- | --- | --- | --- | --- | --- |
| A | Read-only optimizer state audit | Fresh map of current optimizer/VIR/LIR state | None | Long audit | Completed; see [17](./17-arithmetic-corpus-fixture-split.md) |
| B | Arithmetic corpus fixture split | Dashboard separates setup-only blockers from arithmetic blockers | Low | Goal-sized | Completed; see [17](./17-arithmetic-corpus-fixture-split.md) |
| C | Semantic proof harness v0 | Supported arithmetic cases have deterministic offline proof status | Medium | Goal-sized | Completed |
| D | Allocation-check failure reduction | Planner failures shrink or become explained with minimal fixes | Medium | Goal-sized | Complete (diagnostic only) |
| E | Production-safe LIR opportunity lane | One LIR optimization or diagnostic promoted without VIR | Medium | Goal-sized | Completed (diagnostic only) |
| F | Decision ADR and next roadmap refresh | Go/pause criteria after B–E | Low | Docs-only | Completed; see [21](./21-post-vir-decision-adr.md) |

---

## Tranche A — Read-only optimizer state audit

**Objective:** Give Spark a long but no-edit task to map the current state after the archived VIR spike, so implementation tranches do not start from stale assumptions.

**Allowed files:** read-only access to the repository.

**Forbidden:** any file modifications, commits, pushes, package installs, or generated artifacts.

**Spark prompt:**

```text
You are the Spark audit worker for RedScript.

Workdir: /Users/yuzhe/projects/redscript

Goal: Read the current optimizer, arithmetic probe, and archived VIR docs, then return a concise implementation audit for the next optimizer tranche. Do not edit files.

Read at minimum:
- docs/plans/mc-mechanism-optimization/README.md
- docs/plans/mc-mechanism-optimization/16-post-vir-optimizer-spark-roadmap.md
- docs/plans/mc-mechanism-optimization/archive/2026-06-vir-arithmetic-spike/13-vir-spike-close-report.md
- docs/plans/mc-mechanism-optimization/archive/2026-06-vir-arithmetic-spike/15-vir-blocker-drilldown-report.md
- benchmarks/arithmetic-probes.ts
- src/optimizer/lir/**
- src/optimizer/vir/**
- src/__tests__/arithmetic-probes.test.ts
- src/__tests__/optimizer/lir/**
- src/__tests__/optimizer/vir/**

Return exactly:
1. Current optimizer/VIR/LIR state in 10 bullets or fewer.
2. The top 5 implementation risks with file references.
3. The safest next tranche among B–E, with reasons.
4. Any stale assumptions found in this roadmap.
5. Commands you ran, if any. Do not claim tests passed unless you ran them.
```

**Controller verification:** ensure `git status --short --branch` is clean after the audit.

---

## Tranche B — Split setup-only raw summon fixtures from arithmetic VIR blockers

**Objective:** Make the arithmetic dashboard distinguish setup/fixture boilerplate from true arithmetic-lowering blockers, without implementing call lowering or touching production compile paths.

**Why:** The closed spike found `raw:summon-marker-setup` as the dominant call-target family. That appears to be structural benchmark setup, not an arithmetic VIR requirement. The dashboard should make this impossible to confuse with a true semantic blocker.

**Allowed files:**

- Modify: `benchmarks/arithmetic-probes.ts`
- Modify: `src/__tests__/arithmetic-probes.test.ts`
- Modify: `docs/plans/mc-mechanism-optimization/16-post-vir-optimizer-spark-roadmap.md`
- Optionally create/modify: `docs/plans/mc-mechanism-optimization/17-arithmetic-corpus-fixture-split.md`

**Forbidden:**

- No `src/compiler/**`, parser, typechecker, LSP, declarations, registry, package metadata, or production pipeline changes.
- No VIR call lowering.
- No changing the underlying arithmetic probe source programs just to make the dashboard look better unless the report explicitly marks this as a corpus decision.

**Expected implementation shape:**

Add additive dashboard fields such as:

```ts
fixtureBoundarySummary?: {
  setupOnlyCaseNames: string[]
  setupOnlyUnsupportedCount: number
  trueArithmeticUnsupportedCount: number
  mixedOrUnknownCaseNames: string[]
  dominantFixtureFamilies: Array<{ family: string; count: number; caseNames: string[] }>
}
```

Keep existing `virDecision`, `virDecisionDashboard`, and closeout fields compatible. Prefer deriving this from existing `rawSummonMarkerSetupIsolation` / call-target family data rather than duplicating unrelated logic.

**Tests to add/update:**

- synthetic dashboard where all unsupported cases are setup-only;
- synthetic dashboard with mixed setup-only + true arithmetic unsupported cases;
- deterministic sorting of family/case-name arrays;
- assertion that setup-only unsupported cases do **not** count as passing semantic proof;
- representative arithmetic probe fixture still reports `status: stay-experimental` unless proof/allocation thresholds pass.

**Commands Spark should run:**

```bash
npm test -- src/__tests__/arithmetic-probes.test.ts --runInBand
npm run build
npm run validate-mc
git diff --check
npm run bench:arithmetic -- --case all --opt 1 --output /tmp/redscript-tranche-b-fixture-split.json
```

**Return exactly:**

1. Changed files.
2. New dashboard schema fields.
3. Exact test/command results.
4. Representative JSON snippet from `/tmp/redscript-tranche-b-fixture-split.json`.
5. Whether any true arithmetic blocker remains after setup-only isolation.
6. Blockers or risky assumptions.

---

## Tranche C — Semantic proof harness v0 for supported arithmetic probes

**Objective:** Replace the current “supported but unproven” bucket with a deterministic offline proof harness for a small controlled subset.

**Why:** The VIR lane cannot continue toward production while supported cases are not semantically proven. This tranche should prove a tiny subset well, not broaden VIR scope.

**Allowed files:**

- Modify: `benchmarks/arithmetic-probes.ts`
- Modify: `src/__tests__/arithmetic-probes.test.ts`
- Modify/create: `src/__tests__/optimizer/vir/semantic-proof.test.ts`
- Modify/create under: `src/optimizer/vir/**` only if needed for pure test helpers or explicit proof metadata
- Optionally create/modify: `docs/plans/mc-mechanism-optimization/18-vir-semantic-proof-harness.md`

**Forbidden:**

- No production compiler hook.
- No broad VIR support for calls, storage, raw commands, macros, NBT, selectors, or control-flow.
- No live server oracle unless explicitly enabled.
- No claim that unsupported cases are semantically proven.

**Expected implementation shape:**

Create a small deterministic equivalence check for controlled arithmetic cases. Acceptable approaches:

1. evaluate old direct-lowering command-shape metadata against VIR planned metadata where a pure arithmetic model is already available; or
2. add a tiny test-only interpreter for the VIR arithmetic subset and compare against MIR/source fixture expected values; or
3. encode explicit fixture inputs/outputs for the controlled cases and prove planned/direct agreement at the benchmark layer.

The key is conservative reporting:

```ts
semanticProof: {
  status: 'proven' | 'unproven' | 'unsupported'
  method: 'offline-arithmetic-model' | 'fixture-expected-output' | 'none'
  reason?: string
}
```

**Tests to add/update:**

- one proven controlled arithmetic case;
- one supported-but-unproven case remains unproven;
- one unsupported case remains unsupported, not proven;
- deterministic aggregate counts for `proven`, `unproven`, and `unsupported`;
- dashboard status remains conservative unless minimum proof thresholds pass.

**Commands Spark should run:**

```bash
npm test -- src/__tests__/arithmetic-probes.test.ts --runInBand
npm test -- src/__tests__/optimizer/vir --runInBand
npm run build
npm run validate-mc
git diff --check
npm run bench:arithmetic -- --case all --opt 1 --output /tmp/redscript-tranche-c-semantic-proof.json
```

**Return exactly:**

1. Changed files.
2. Proof method implemented and why it is conservative.
3. Proven/unproven/unsupported counts from representative output.
4. Exact command results.
5. Cases still unproven and why.
6. Blockers or risky assumptions.

## Tranche C execution status

- Implemented a minimal deterministic proof witness for one controlled pure arithmetic case (`int_arithmetic`) using an explicit offline fixture witness.
- Remaining supported pure-arithmetic cases still report as supported-but-unproven until explicit witnesses are added.
- Existing unsupported cases remain unsupported and still block semantic-proof closeout/go-no-go checks.

---

## Tranche D — Allocation-check failure diagnosis and minimal reduction

**Status:** Diagnostic pass complete; no new planner/parallel-copy change is merged yet. Allocation failures are now deterministically classified and captured for next tranche planning.

**Objective:** Reduce or precisely explain the current planned allocation-check failures without widening VIR semantics.

**Known failure focus from the closed spike:**

- `int_add_sub_mul`
- `int_div_mod_mix`
- `int_temp_heavy`

**Allowed files:**

- Modify: `src/optimizer/vir/lower/slot-planner.ts`
- Modify: `src/optimizer/vir/lower/allocation-checker.ts`
- Modify: `src/optimizer/vir/lower/parallel-copies.ts`
- Modify: `src/__tests__/optimizer/vir/slot-planner.test.ts`
- Modify: `src/__tests__/optimizer/vir/lowering.test.ts`
- Modify: `benchmarks/arithmetic-probes.ts` only for diagnostic fields needed to explain failures
- Modify: `src/__tests__/arithmetic-probes.test.ts` only for aggregate diagnostic tests
- Optionally create/modify: `docs/plans/mc-mechanism-optimization/19-vir-allocation-check-closeout.md`

**Forbidden:**

- No production compiler hook.
- No adding new VIR op families to make failures disappear.
- No weakening allocation checks.
- No deleting failing diagnostics unless replaced by stronger evidence.

**Expected implementation shape:**

1. First add a clearer failure classifier:

```ts
allocationFailureBreakdown?: Array<{
  category: 'parallel-copy-cycle' | 'ret-precolor-conflict' | 'dead-lhs-affinity-conflict' | 'unknown'
  count: number
  caseNames: string[]
  examples: string[]
}>
```

2. Then apply the smallest planner/parallel-copy fix that removes one real class without weakening checks.
3. If no safe fix exists, produce a docs/report-only closeout with exact classifier output.

**Closeout note:** see [19-vir-allocation-check-closeout](./19-vir-allocation-check-closeout.md) for the deterministic classifier schema, case-level outcome, and post-run verdict.

**Tests to add/update:**

- targeted slot-planner regression for at least one known failure shape;
- allocation checker still catches an intentionally invalid allocation;
- benchmark dashboard classifies failures deterministically;
- no test accepts an allocation-check failure as a pass.

**Commands Spark should run:**

```bash
npm test -- src/__tests__/optimizer/vir --runInBand
npm test -- src/__tests__/arithmetic-probes.test.ts --runInBand
npm run build
npm run validate-mc
git diff --check
npm run bench:arithmetic -- --case all --opt 1 --output /tmp/redscript-tranche-d-allocation.json
```

**Return exactly:**

1. Changed files.
2. Failure categories before/after, or why before/after could not be measured.
3. Exact test/command results.
4. Representative JSON snippet.
5. Whether any allocation-check failure count decreased.
6. Blockers or risky assumptions.

---

## Tranche E — Production-safe LIR optimization or diagnostic promotion

**Objective:** Promote one useful, low-risk optimizer improvement on the existing LIR path, independent of VIR.

**Evidence status:** All `E` tranche changes in this repository state are diagnostic-only. They improve proof-miss visibility and deterministic triage evidence, but do not claim rewrite correctness and do not change production rewrite behavior.

**Why:** This keeps optimization progress useful even if VIR remains paused.

**Allowed files:** choose one narrow slice after Tranche A audit. Candidate areas:

- `src/optimizer/lir/analysis.ts`
- `src/optimizer/lir/rewrite.ts`
- `src/optimizer/lir/rmw.ts`
- `src/__tests__/optimizer/lir/**`
- `benchmarks/arithmetic-probes.ts` for diagnostics only
- `src/__tests__/arithmetic-probes.test.ts` for diagnostics only
- `docs/plans/mc-mechanism-optimization/16-post-vir-optimizer-spark-roadmap.md`

**Forbidden:**

- No VIR production hook.
- No semantic change to user-visible RedScript programs.
- No broad peephole rewrite that changes unrelated command order around raw/macro/call/storage barriers.
- No optimizer behavior changes without targeted tests and benchmark evidence.

**Possible Spark-sized slices:**

1. Add a read-only benchmark diagnostic that lists top remaining LIR copy opportunities by safe/blocked/unknown category.
2. Add one local rewrite harness invariant test and a narrowly scoped no-op/self-copy cleanup if not already covered.
3. Add a module/function-level barrier report that explains why a copy opportunity is blocked, without changing emitted LIR.

**Commands Spark should run:**

```bash
npm run test:lir
npm test -- src/__tests__/arithmetic-probes.test.ts --runInBand
npm run build
npm run validate-mc
git diff --check
npm run bench:arithmetic -- --case all --opt 1 --output /tmp/redscript-tranche-e-lir.json
```

**Return exactly:**

1. Selected slice and why it is production-safe.
2. Changed files.
3. Exact behavior or diagnostic change.
4. Exact test/command results.
5. Benchmark snippet if diagnostics changed.
6. Blockers or risky assumptions.

## Tranche E execution status

- Selected slice: diagnostics-only LIR opportunity evidence promotion using existing score-copy rewrite-opportunity telemetry.
- Changed files: `benchmarks/arithmetic-probes.ts`, `src/__tests__/arithmetic-probes.test.ts`, `docs/plans/mc-mechanism-optimization/20-lir-opportunity-closeout.md`.
- Behavior change: aggregate LIR score-copy opportunity summary added to `ArithmeticProbeReport.lirOpportunitySummary` with deterministic status totals, case-name attribution, capped examples, and recommendation.
- Safety: no compiler pipeline hooks or emitted LIR behavior were changed. VIR hooks remain unchanged and experimental.

---

## Tranche F — Decision ADR and roadmap refresh

**Objective:** After B–E, write the decision record that says whether to continue VIR, freeze it, or move only LIR infrastructure forward.

**Allowed files:**

- Modify: `docs/plans/mc-mechanism-optimization/16-post-vir-optimizer-spark-roadmap.md`
- Create/modify: `docs/plans/mc-mechanism-optimization/21-post-vir-decision-adr.md`
- Optionally modify: `docs/plans/mc-mechanism-optimization/README.md`

**Forbidden:** code changes.

**ADR must answer:**

1. Did fixture splitting remove false blockers from the arithmetic dashboard?
2. How many supported cases are semantically proven?
3. Are allocation-check failures zero, reduced, or merely classified?
4. Did any production-safe LIR improvement ship independently of VIR?
5. Should VIR continue, pause, or stay as read-only experimental infrastructure?
6. What exact conditions must be true before production integration is reconsidered?

**Docs-only verification:**

```bash
git diff --check
git diff --stat
git status --short --branch
```

**Return exactly:**

1. Changed docs.
2. Final recommendation.
3. Evidence table from B–E.
4. Remaining blockers.
5. Next 2–3 Spark goals only, not a giant rewrite.

## Tranche F execution status

- Status: Completed; final decision is documented in [21-post-vir-decision-adr.md](./21-post-vir-decision-adr.md).
- Recommendation outcome: keep VIR experimental/read-only and do not integrate it into the production compiler pipeline now.
- Safety: production compiler pipeline and VIR production hooks remain unchanged; Tranche E shipped no emitted LIR behavior changes.
- LIR lane result: Tranche F now captures adjacent-window context from **real** arithmetic probe per-line provenance (not synthetic merges), making `lirAdjacentWindowSummary.proofMissAdjacentWindowBreakdown` observable for real bench output.
- Safety reminder: this tranche is diagnostic-only and does not alter rewrite behavior or proof eligibility in production.

---

## Suggested next `/goal` for Hermes

This roadmap is closed. Use this only if starting a new, explicitly scoped LIR-only tranche:

```text
In /Users/yuzhe/projects/redscript, start a new production-safe LIR-only optimizer tranche using docs/plans/mc-mechanism-optimization/21-post-vir-decision-adr.md and docs/plans/mc-mechanism-optimization/20-lir-opportunity-closeout.md as evidence.

Goal: turn the diagnostic `lirOpportunitySummary` into one narrow LIR-only rewrite or blocker-provenance spike. Prefer the top `score_copy -> score_arith` candidate class, but implement no behavior change unless tests prove slot/barrier safety.

Rules:
- Use Spark/Codex as implementation worker where useful.
- Controller must review diff and run real gates.
- Keep VIR experimental/read-only.
- Do not touch production compiler pipeline, parser, typechecker, LSP, registry, declarations, package metadata, public language semantics, or `src/optimizer/vir/**`.
- Do not commit or push unless explicitly asked.

Return:
1. Selected LIR-only slice and why.
2. Changed files, if any.
3. Exact tests/commands and results.
4. Representative before/after benchmark or diagnostic output.
5. Blockers/risky assumptions.
```

## Done criteria for this roadmap

This roadmap is done after Tranche F and is closed at this point.

Do not keep adding diagnostic fields indefinitely. Once proof/allocation/corpus-split evidence is clear, write Tranche F and stop.

Reopen only if the user starts a new, explicitly scoped LIR-only tranche.
