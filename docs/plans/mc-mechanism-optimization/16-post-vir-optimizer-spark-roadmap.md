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
| G | Read-only local-temp proof-gap readiness triage | Deterministic readiness buckets for local-temp exact-proof-gap cases | Low | Small diagnostics-only slice | Completed |
| H | Short-window local-temp proof-gap diagnostics | Deterministic short-window trace-kind and fixture-selection buckets | Low | Small diagnostics-only slice | Completed |
| I | Short-window fixture-selection evidence pack | Deterministic candidate/blocked fixture slices for rewrite-test design | Low | Small diagnostics-only slice | Completed |
| J | Future rewrite fixture export diagnostics | Deterministic future fixture export summary for offline rewrite-test planning | Low | Small diagnostics-only slice | Completed |
| K | Unknown-cause split | Deterministic triage buckets for unknown-like proof-miss causes | Low | Small diagnostics-only slice | Completed |
| L | Offline rewrite-test harness v0 | Deterministic fixture-consumption harness metadata without production rewrites | Low | Small diagnostics-only slice | Completed |
| M | Offline bounded equivalence harness | Test-only LIR interpreter/checker proves smallest exported rewrite fixtures over bounded samples | Medium | Small TDD slice | Completed |
| N | Explicit gated local-copy rewrite path | Existing local-copy/RMW rewrite pass is available only through an experimental opt-in pipeline flag, with default compiler behavior flag-off | Medium | Small TDD slice | Completed |
| O | Experimental local-copy benchmark comparison + proof-evidence prep | Add deterministic flag-off/flag-on benchmark comparison and bounded fixture expansion before any default-on decision | Medium | Small TDD slice | Completed |
| P | Explicit no-regression benchmark gate | Add explicit evidence-only gate that fails on command/score-copy regressions when experimental local-copy comparison is explicitly enabled | Medium | Small diagnostics-only slice | Completed |
| Q | Predecessor arithmetic + read/write-window bounded equivalence | Expand offline local-temp rewrite evidence for non-add families and temp read/write-window boundaries | Medium | Small TDD slice | Completed |
| R | Offline rewrite-equivalence fixture pack and runner | Deterministic fixture metadata + reusable offline runner for bounded equivalence checks | Medium | Small TDD slice | Completed |
| S | Offline equivalence pack + benchmark gate integration | Add deterministic offline-pack evidence into explicit local-copy benchmark paths and no-regression gate checks | Medium | Small diagnostics-only slice | Completed |
| T | CI-friendly explicit local-copy no-regression gate path | Add concise, CI-safe wrapper and workflow step to run evidence-only gate with full JSON artifact | Medium | Small diagnostics-only slice | Completed |
| U | Offline rewrite fixture family/window expansion | Expand bounded equivalence fixture coverage for score-swap, score-set-overwrite, and unsupported typed boundary cases | Low | Small diagnostics-only slice | Completed |
| V | Offline rewrite family readiness contract | Add explicit required-family readiness metadata and fail the evidence gate when required fixture families are missing or failed | Medium | Small diagnostics-only slice | Completed |
| W | Explicit local-copy rollout readiness summary for manual opt-in | Add deterministic aggregate+regression evidence summary for manual experimental rollout readiness | Medium | Small diagnostics-only slice | Completed |
| X | CLI experimental local-copy opt-in manual gate | Expose manual CLI flag passthrough to existing experimental LIR local-copy rewrite path; no default/on by default changes | Low | Small TDD slice | Completed |
| Y | Residual local-copy blocker/provenance diagnostics | Add deterministic residual blocker summary for score-copy opportunities after explicit local-copy flag-on | Low | Small diagnostics-only slice | Completed |

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

## Tranche G — local-temp exact-proof-gap readiness buckets

- Status: Completed as a diagnostics-only tranche; no production rewrite gates or optimizer behavior were enabled.
- Outcome: added deterministic readiness grouping under `lirAdjacentWindowSummary.localTempProofGapReadinessSummary` for `local-temp-exact-proof-gap` cases.
- Conservative buckets now cover candidates versus blocked/unknown, with deterministic `candidateCaseNames` and `blockedOrUnknownCaseNames` arrays and reproducible goal guidance.
- Scope: this is rewrite-test triage evidence only; it does not assert proof of rewrite-correctness or production rewrite enablement.

## Tranche H — short-window proof diagnostics for local-temp proof gaps

- Status: Completed as a diagnostics-only tranche; no production rewrite gates or optimizer behavior were enabled.
- Outcome: added deterministic short-window trace-kind evidence for local-temp proof-gap misses under `lirAdjacentWindowSummary.localTempProofGapReadinessSummary.shortWindowProofSummary` and `slotProvenanceSummary.localProofEvidenceSummary.lirAdjacentWindowSummary.shortWindowProofSummary`.
- The following deterministic buckets were introduced:
  - `single-predecessor-copy-into-local-temp`
  - `predecessor-arith-feeds-local-temp`
  - `successor-arith-consumes-local-temp`
  - `copy-chain-needs-wider-window`
  - `cross-function-or-boundary-window`
  - `opaque-or-unparsed-window`
- Fixture-selection signals were added conservatively:
  - `futureRewriteTestCandidateCaseNames` only includes clearly local and non-boundary cases.
  - `needsWiderWindowCaseNames` marks cases that still need additional local window context.
- Safety reminder: this tranche is strictly for future rewrite-test fixture planning and selection, not a proof of rewrite correctness and not an optimization enablement mechanism.

## Tranche I — short-window fixture-selection pack

- Status: Completed as a diagnostics-only tranche; no production rewrite gates or optimizer behavior was changed.
- Outcome: added deterministic fixture-selection summaries under:
  - `benchmark.lirOpportunitySummary...shortWindowProofSummary.fixtureSelectionSummary` (via aggregated short-window summary paths)
- `fixtureSelectionSummary` includes:
  - `candidateFixtures` with deterministic top-per-bucket entries (`caseName`, `example`, `reason`, `recommendedTestKind`)
- `blockedFixtureFamilies` for wider-window / cross-function / opaque-unparsed families
- `rewriteEnablementStatus` fixed to `'disabled-diagnostics-only'`
- `nextSafeDiagnosticGoals`
- Next-safe direction: design explicit rewrite-test fixtures from these buckets next; keep production behavior unchanged.

## Tranche J — future rewrite fixture export diagnostics

- Status: Completed as diagnostics-only/offline planning infrastructure.
- Outcome: added `futureRewriteFixtureExportSummary` (also surfaced under `lirOpportunitySummary`) with deterministic candidate/blocked fixture partitioning and evidence groupings:
  - `candidateFixtureNames`
  - `blockedFixtureNames`
  - `byFixtureFamily`
  - `byBlockerKind`
  - `nextRequiredEvidence`
- The summary is deterministic by case/family/cause ordering, deduplicated, and capped for stable review.
- This is explicitly future rewrite-test preparation and does **not** imply rewrite correctness.

## Tranche K — unknown-cause split

- Status: Completed as a conservative triage split.
- Outcome: added `unknownCauseSplitSummary` with deterministic grouped causes including:
  - `unparsed-command`
  - `insufficient-window`
  - `opaque-window`
  - `boundary-or-cross-function`
  - `missing-predecessor-evidence`
  - `missing-successor-evidence`
  - `unknown-other`
- This tranche preserves prior unknown buckets (including `unknown-unparsed-command` in adjacent-window evidence) and does not claim stronger proof semantics.
- Result remains diagnostics-only and used for triage only.

## Tranche L — offline rewrite-test harness v0

- Status: Completed as diagnostics-only.
- Outcome: added `offlineRewriteTestHarnessSummary` with stable status values:
  - `fixture-selection-only`
  - `no-candidates`
  - `blocked-by-unknown-evidence`
- Added harness metadata includes:
  - `candidateFixtureCount`
  - `blockedFixtureCount`
  - `supportedTestKinds`
  - `requiredBeforeRewriteEnablement`
  - `rewriteEnablementStatus` fixed to `'disabled-diagnostics-only'`
- Harness remains offline and future-facing; production rewrites are still disabled.

## Tranche M — offline bounded equivalence harness

- Status: Completed.
- Outcome: added `src/optimizer/lir/equivalence.ts` as a conservative, test-only bounded LIR interpreter/checker.
- Added coverage for local copy forwarding, predecessor arithmetic feeding a local temp, counterexamples, division/modulo by zero refusal, and opaque instruction refusal.
- This harness is evidence for future rewrites only; it is not a production proof by itself.

## Tranche N — explicit gated local-copy rewrite path

- Status: Completed.
- Outcome: added `LIROptimizeOptions.experimentalLocalCopyRewrite` and wired it through `compile`, `compileModules`, and `lirOptimizeModule`.
- The local-copy/RMW rewrite pass is now explicitly opt-in for pipeline callers; default compiler behavior keeps the rewrite flag off while equivalence/bench gates mature.
- Added pipeline tests proving:
  - default `lirOptimizeModule(mod)` does not run the experimental local-copy rewrite;
  - `lirOptimizeModule(mod, { experimentalLocalCopyRewrite: true })` runs the existing local copy/output and local copy/return collapses;
  - existing LIR pass tests remain valid through the standalone `scoreboardRmwPass` entrypoint.
- This is a gated integration slice, not default production enablement. Next safe work is a flag-off/flag-on benchmark comparison and a broader equivalence fixture pack before any default enablement decision.

## Tranche O — experimental local-copy benchmark comparison + bounded proof families

- Status: Completed as evidence-only.
- Outcome:
  - Added deterministic CLI and report support for opt-in experimental rewrite execution:
    - `--experimental-lir-local-copy-rewrite` in `bench:arithmetic`.
    - `ArithmeticProbeReport.experimentalLocalCopyRewriteComparison` with off/on command and `scoreCopy` totals plus deltas.
  - Added bounded rewrite-equivalence fixtures that explicitly match current experimental copy-chain and local-copy/RMW shapes:
    - `copy-chain/no-reuse` output shape,
    - local-copy/output RMW shape,
    - local-copy/return RMW shape.
  - Added tests proving:
    - default benchmark mode is flag-off,
    - explicit flag-on path is forwarded and deterministic,
    - the experimental comparison is additive and does not affect default enablement.
  - Constraint preserved: this tranche only produces evidence and comparisons; it does not make local-copy/RMW rewrites the compiler default.

## Tranche P — explicit experimental local-copy no-regression gate

- Status: Completed as evidence-only.
- Outcome:
  - Added a new CLI gate flag `--require-experimental-lir-local-copy-no-regressions`.
  - Added strict dependency check requiring `--experimental-lir-local-copy-rewrite` when gate flag is used.
  - Added exported pure gate evaluator `evaluateExperimentalLocalCopyRewriteNoRegressionGate` with failure conditions:
    - comparison missing,
    - off/on case counts differ,
    - command summary regressedCount > 0,
    - scoreCopy summary regressedCount > 0,
    - per-case command/scoreCopy delta > 0,
    - aggregate command delta > 0,
    - aggregate scoreCopy delta > 0.
  - Added additive report status at `experimentalLocalCopyRewriteNoRegressionGate` with:
    - `mode: experimental-no-regression-evidence-only`,
    - `status: pass | fail`,
    - `failReasons`,
    - `rationale: benchmark-evidence-only-no-production`.
  - Added tests for missing dependency, passing synthetic comparison, and synthetic command/scoreCopy regression detection.
  - Existing behavior remains proof-less and evidence-only; this gate does not assert correctness and does not enable any rewrite by default.

## Tranche Q — offline bounded local-temp arithmetic/window evidence

- Status: Completed as evidence-only.
- Outcome:
  - Expanded `src/__tests__/optimizer/lir/rewrite_equivalence.test.ts` with additional offline bounded families for local-temp/local-copy rewrites that remain experimental-only:
    - predecessor arithmetic rewrites for `score_sub`, `score_mul`, `score_min`, `score_max`;
    - safe local-temp read/write-window cases where temp is consumed into output/`return_value` and never observed afterward;
    - unsafe observed post-window cases that now produce `counterexample` when temp is in `observedSlots`;
    - non-add edge coverage for local temp/output rewrites with nonzero `score_div`/`score_mod`;
    - explicit division/modulo-by-zero unsupported behavior checks remain in place;
    - return-path predecessor coverage for a non-add opcode (`score_mul`) feeding `$ret`.
  - No optimizer pipeline, benchmark, or rewrite behavior files were changed; this tranche is evidence-only.
  - Existing checker support already covered these operations, so `src/optimizer/lir/equivalence.ts` did not require semantic changes.

## Tranche R — offline rewrite-equivalence fixture pack and runner v1

- Status: Completed as evidence-only.
- Outcome:
  - Added `src/optimizer/lir/rewrite_equivalence_fixtures.ts` with:
    - a fixture contract including `name`, `family`, `expectedStatus`, `before`, `after`, `observedSlots`, and `samples`;
    - deterministic fixture pack `offlineRewriteEquivalenceFixtures` with required family buckets for offline coverage;
    - `runOfflineRewriteEquivalenceFixtures()` that emits per-fixture expected-vs-actual status plus deterministic family summaries and totals.
  - Refactored `src/__tests__/optimizer/lir/rewrite_equivalence.test.ts` to consume the reusable pack and to validate deterministic evidence summaries and non-equivalence for unsafe/unsupported cases.
  - This tranche is offline bounded evidence prep for future local-copy/RMW rewrite experiments and does not alter production optimizer behavior or enable rewrites.

## Tranche S — offline equivalence pack evidence in local-copy benchmark gate

- Status: Completed as evidence-only.
- Outcome:
  - Wired `runOfflineRewriteEquivalenceFixtures()` into the explicit experimental local-copy benchmark path and added additive summary output under:
    - `ArithmeticProbeReport.offlineRewriteEquivalencePackSummary`.
  - Added benchmark-only, deterministic schema with stable family ordering from the fixture runner:
    - overall pack counts and per-family summaries,
    - `status: 'pass' | 'fail'`,
    - failed fixture list with cap,
    - `evidenceStatus: 'bounded-offline-evidence-only'`.
  - Updated no-regression evaluator to require (in explicit gate path) both `experimentalLocalCopyRewriteComparison` and the offline equivalence pack summary to pass.
  - Added deterministic tests for summary conversion, stable family order, failed offline summary integration into the no-regression gate, and report attachment.

## Tranche T — CI-friendly explicit local-copy evidence gate wrapper

- Status: Completed as evidence-only.
- Outcome:
  - Added `scripts/check-lir-local-copy-gate.ts` to run:
    - `runArithmeticProbeReport('all', [1], true)`
    - `evaluateExperimentalLocalCopyRewriteNoRegressionGate(report.experimentalLocalCopyRewriteComparison, report.offlineRewriteEquivalencePackSummary)`
  - Wrapper behavior:
    - writes full JSON report artifact (default `/tmp/redscript-lir-local-copy-gate.json`, configurable via `--output <path>`),
    - prints concise evidence-only stdout (`gate status`, `failReasons`, offline pack status/total/failed, deltas, regressedCount, output path),
    - exits with non-zero status when `experimentalLocalCopyRewriteNoRegressionGate.status !== 'pass'`.
  - Added `gate:lir-local-copy` npm script and CI step named `Evidence-only experimental LIR local-copy no-regression gate`.
  - The path is explicitly `bounded-offline-evidence-only` and does not enable production rewrite behavior.

## Tranche U — bounded rewrite fixture family expansion

- Status: Completed as evidence-only.
- Outcome:
  - Expanded `src/optimizer/lir/rewrite_equivalence_fixtures.ts` with a deterministic, bounded offline pack extension for three additional evidence families:
    - `score-swap-window` (safe/equivalent when only swap result is observed, counterexample when local temp remains observed);
    - `score-set-overwrite-window` (safe/equivalent when overwritten temp is not observed, counterexample when it is).
    - `unsupported-typed-boundary` (typed boundary instructions that are intentionally unsupported by the bounded checker, such as storage/NBT/store/call/macro typed nodes).
  - Updated deterministic suite expectations so totals and per-family summaries reflect the new families while preserving stable ordering of existing families.
  - No production compiler behavior changed; this tranche is strictly bounded/offline evidence and is not production correctness proof.

## Tranche V — offline rewrite family readiness contract for explicit local-copy gate

- Status: Completed as evidence-only.
- Outcome:
  - Added deterministic required-family readiness metadata under `OfflineRewriteEquivalencePackSummary.offlineRewriteFamilyReadinessSummary` with bounded evidence-only semantics:
    - `status: 'pass' | 'fail'`
    - `evidenceStatus: 'bounded-offline-evidence-only'`
    - deterministic required family entries for:
      - `local-copy-forwarding`
      - `predecessor-arithmetic`
      - `read-write-window`
      - `score-swap-window`
      - `score-set-overwrite-window`
      - `unsupported-boundary`
      - `unsupported-typed-boundary`
    - `missingFamilies`
    - `failedFamilies`
    - `notes`/`gateReason` text calling out bounded/offline scope and non-production status.
  - Updated no-regression evaluator to fail when the readiness summary is missing, required families are missing, required-family failures are present, or the offline pack itself fails.
  - Added tests for deterministic required-family ordering, fail-paths for missing/failed required families, and explicit inclusion of readiness metadata in report+gate outputs.
  - No production optimizer behavior changed; this remains evidence-only readiness contract work.

## Tranche W — explicit rollout readiness summary for experimental local-copy opt-in

- Status: Completed as evidence-only.
- Outcome:
  - Added `ArithmeticProbeReport.experimentalLocalCopyRewriteRolloutReadinessSummary` and `ArithmeticProbeExperimentalLocalCopyRewriteRolloutReadinessSummary` with:
    - `status: 'pass' | 'fail'`
    - `recommendation: 'manual-experimental-opt-in-only' | 'stay-experimental'`
    - `evidenceStatus: 'benchmark-and-bounded-offline-evidence-only'`
    - deterministic `reasons`,
    - copied `commandDelta`/`scoreCopyDelta` and regression counts from the experimental comparison,
    - `requiredGateStatus`, `offlinePackStatus`, `familyReadinessStatus`,
    - capped deterministic `improvedCaseNames`.
  - Added rollout evaluator that passes only when:
    - the no-regression gate passes,
    - offline equivalence pack status is `pass`,
    - family readiness status is `pass`,
    - there are no command/scoreCopy regressions in summary and per-case,
    - there is aggregate command/scoreCopy improvement (`commandDelta < 0` or `scoreCopyDelta < 0`).
  - Added a concise rollout/readiness line to `scripts/check-lir-local-copy-gate.ts`, bound the wrapper to explicit-report readiness output, and made the wrapper exit non-zero if either the no-regression gate or rollout readiness summary fails.
  - Added unit tests for:
    - synthetic gate-fail and no-improvement fail conditions,
    - deterministic/capped improved-case ordering,
    - real explicit `runArithmeticProbeReport('all', [1], true)` pass path with `-193/-193`.
  - This tranche does not change production/default optimizer behavior; it is bounded evidence for manual experimental opt-in only.

## Tranche X — CLI experimental local-copy opt-in flag

- Status: Completed.
- Outcome:
  - Added `--experimental-lir-local-copy-rewrite` to CLI parsing as an explicit manual opt-in flag.
  - Updated `redscript compile` and `redscript publish` command wiring to pass
    `experimentalLirLocalCopyRewrite` into `compile(...)`.
  - Added a hard error when `--incremental` is paired with `--experimental-lir-local-copy-rewrite`
    with exact message:
    `Error: --experimental-lir-local-copy-rewrite is not supported with --incremental`.
  - Updated CLI help text to label the flag as experimental/manual opt-in and off-by-default.
  - Added CLI tests that:
    - prove the parser accepts the new flag,
    - verify `compile` with and without the flag can succeed and produce different output for a tiny local-copy-sensitive fixture,
    - verify `publish` accepts the same flag and produces a zip,
    - verify incremental use returns the explicit unsupported error,
    - verify help text documents the new experimental wording.
  - This tranche is evidence-only/manual opt-in only. No production pipeline behavior changed.

## Tranche Y — residual local-copy blocker/provenance diagnostics

- Status: Completed as diagnostics-only.
- Outcome:
  - Added residual diagnostics on explicit experimental local-copy benchmark runs at
    `ArithmeticProbeReport.experimentalLocalCopyRewriteResidualSummary`.
  - The summary is derived from existing opportunity evidence and adds deterministic fields for residual explanations when flag-on data is available:
    - `totalResidualCount`, `status`, `recommendation`, `onCaseCount`,
    - deterministic `residualByStatus` entries,
    - deterministic `residualByPattern` buckets,
    - deterministic `residualByFamily` buckets with capped `examples`,
    - deterministic `residualByProvenanceReason` buckets,
    - sorted/capped `topResidualCaseNames` plus per-case residual summaries.
  - Added explicit residual bucket caps for review stability:
    - `MAX_RESIDUAL_CASE_SUMMARY_ENTRIES = 8`
    - `MAX_RESIDUAL_PATTERNS_PER_SUMMARY = 12`
    - `MAX_RESIDUAL_FAMILIES_PER_SUMMARY = 12`
    - `MAX_RESIDUAL_EXAMPLES_PER_BUCKET = 3`
  - Added tests for deterministic ordering/capping, empty-input conservatism (`no-residuals`), and presence only on experimental local-copy report paths.
  - No optimizer logic, pipeline, CLI semantics, or benchmark behavior changed; this remains bounded diagnostics-only provenance for future gated rewrite candidates.

---

## Suggested next `/goal` for Hermes

Use the active tracker [27 — LIR Local-Copy Manual Opt-In Active Roadmap](./27-lir-local-copy-active-roadmap.md) for new long-running goals. This file is now a historical tranche log through Y.

The next non-blocked track in [27](./27-lir-local-copy-active-roadmap.md) is Track Z: residual safeCandidate fixture/proof split.

```text
In /Users/yuzhe/projects/redscript, continue the LIR local-copy optimizer lane by reading and following docs/plans/mc-mechanism-optimization/27-lir-local-copy-active-roadmap.md as the source of truth.
Start with the first unchecked non-blocked track. Keep default behavior unchanged, keep VIR read-only, use Spark only for bounded implementation slices, run controller gates, update the roadmap, then signed commit/push after verification.
```

## Done criteria for this roadmap

This roadmap is currently complete through Tranche Y with J/K/L/O/P/Q/R/S/T/U/V/W/X/Y diagnostics-only offline planning and evidence outputs.
It does not authorize production rewrite enablement.

Do not keep adding diagnostic fields indefinitely. Once proof/allocation/corpus-split evidence is clear, move to a bounded, explicitly gated next tranche and stop.

Next safe work remains:
1. keep the explicit no-regression gate path operational while coverage evidence stabilizes,
2. use residual blocker/provenance summaries to isolate the highest-signal candidate families for the next gated rewrite-safe tranche,
3. proceed to a separately gated rewrite implementation tranche only after bounded offline evidence and gate stability justify implementation.
