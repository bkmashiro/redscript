# LIR Local-Copy Proof-to-Release Roadmap

> **For Hermes/Spark:** This is the current source of truth for long-running `/goal` sessions in the RedScript LIR local-copy lane. Read this first, start with the first unchecked non-blocked track, then update the checkboxes and evidence after each verified tranche.

**Goal:** Move the experimental LIR local-copy rewrite path from “manual evidence path” toward a proof-backed release decision without changing production defaults prematurely.

**Architecture:** Keep production defaults unchanged. Treat `--experimental-lir-local-copy-rewrite` as a manual evidence path while diagnostics classify residual score-copy opportunities. Future work should first turn unknown residuals into proof/blocker buckets, then only implement a tiny rewrite if fixture/proof evidence justifies it. Spark may implement bounded slices; the controller must review diffs, run gates, commit, and update this roadmap.

**Tech Stack:** TypeScript, Jest, RedScript arithmetic probe benchmark, LIR rewrite equivalence fixtures, existing `gate:lir-local-copy` evidence wrapper.

---

## Current status snapshot

Latest committed implementation tranche: `8d18c64 feat: classify residual LIR rewrite candidates`.

Completed posture:

- [x] VIR arithmetic spike closed; keep `src/optimizer/vir/**` experimental/read-only.
- [x] LIR local-copy/RMW rewrite path exists but remains off by default.
- [x] CLI manual opt-in exists: `--experimental-lir-local-copy-rewrite` for `compile` and `publish`.
- [x] Incremental compile guard exists: `--incremental` + flag fails explicitly.
- [x] CI-friendly evidence gate exists: `npm run gate:lir-local-copy`.
- [x] Offline rewrite equivalence pack exists and is integrated into the explicit evidence gate.
- [x] Family-readiness and rollout-readiness summaries exist.
- [x] Residual diagnostics exist at `ArithmeticProbeReport.experimentalLocalCopyRewriteResidualSummary`.
- [x] Track Z diagnostics exist at `experimentalLocalCopyRewriteResidualSummary.trackZResidualDiagnostics`.

Latest controller evidence from `/tmp/redscript-lir-track-z-controller.json`:

```json
{
  "gate": "pass",
  "rollout": "pass",
  "recommendation": "manual-experimental-opt-in-only",
  "commandDelta": -193,
  "scoreCopyDelta": -193,
  "offlineFixtures": 29,
  "offlineFailed": 0,
  "residualTotal": 1277,
  "trackZ": {
    "targetPattern": "score_copy -> score_arith",
    "totalCount": 328,
    "byLabel": [
      { "label": "unknown-needs-lir-proof", "count": 328 }
    ],
    "recommendation": "collect-more-data",
    "topCaseNames": [
      "sqrt_fx1000",
      "div3_hp",
      "double_div",
      "double_mul",
      "sin_cos_hp_separate",
      "sin_hp",
      "sqrt_fx10000",
      "int_div_mod_mix"
    ]
  }
}
```

Decision from this evidence:

- The manual opt-in path is stable enough for explicit evidence runs.
- The evidence does **not** justify default enablement.
- The evidence does **not** justify Track AA rewrite implementation yet.
- All 328 target residual `safeCandidate score_copy -> score_arith` items are still `unknown-needs-lir-proof` with current facts.
- Next work is Track AB: proof/window diagnostics.

---

## Non-negotiable rules for all future tranches

- Keep default compiler behavior unchanged unless this roadmap is explicitly updated to authorize a default-enable decision tranche.
- Keep `--experimental-lir-local-copy-rewrite` manual/experimental until Track AD is complete.
- Do not touch parser, typechecker, LSP, package metadata, GitHub workflows, lockfiles, or public language semantics unless a track explicitly scopes it.
- Do not touch `src/optimizer/vir/**` in this lane.
- Do not add dependencies unless a separate ADR approves them.
- Do not treat benchmark no-regression as semantic proof; it is evidence only.
- Update this roadmap after every verified tranche.
- Spark workers must not commit or push; controller commits after review/gates.

Recommended controller gates after any code/test tranche:

```bash
npm run test:probe
npm run test:lir
npm run build
npm run validate-mc
git diff --check
npm run gate:lir-local-copy -- --output /tmp/redscript-lir-<track>-controller.json
```

For docs-only roadmap cleanup, `git diff --check` plus diff/readback is enough.

---

## Completed tracks

### Track Z — Residual safeCandidate fixture/proof split

**Status:** [x] Completed

**What shipped:** `trackZResidualDiagnostics` for the residual `safeCandidate + score_copy -> score_arith` bucket.

**Evidence:** `/tmp/redscript-lir-track-z-controller.json` reported:

- `trackZResidualDiagnostics.totalCount = 328`
- `byLabel = [{ label: "unknown-needs-lir-proof", count: 328 }]`
- `recommendation = "collect-more-data"`

**Decision:** No rewrite implementation yet. Continue to Track AB.

---

## Active / future tracks

### Track AB — Window/proof diagnostics for unknown residuals

**Status:** [x] Implemented (diagnostic-only, conservative)

**Product promise:** Convert the dominant `unknown-needs-lir-proof` residuals into named proof/blocker buckets so the next decision is evidence-backed: implement a narrow rewrite, add more proof fixtures, or stop.

**Why now:** Track Z showed all 328 target residuals are unknown with current facts. The next useful work is not optimizer code; it is structured proof/window evidence.

**Allowed files:**

- `benchmarks/arithmetic-probes.ts`
- `src/__tests__/arithmetic-probes.test.ts`
- `src/optimizer/lir/rewrite_equivalence_fixtures.ts` only if freezing tiny proof fixtures is necessary
- `src/__tests__/optimizer/lir/rewrite_equivalence.test.ts` only for fixture runner coverage if needed
- this roadmap and linked docs under `docs/plans/mc-mechanism-optimization/`

**Forbidden:**

- No changes to `src/optimizer/lir/rmw.ts`.
- No pass-order changes.
- No default/CLI behavior changes.
- No production-emitted behavior changes.
- No VIR changes.

**Implementation outline:**

- [x] Read or regenerate Track Z baseline with:
  `npm run gate:lir-local-copy -- --output /tmp/redscript-lir-track-ab-baseline.json`.
- [x] For target residuals (`safeCandidate + score_copy -> score_arith + unknown-needs-lir-proof`), add structured local-window facts where available:
  - previous command class,
  - current copy destination/source slot,
  - next command class,
  - next-next command class,
  - consuming arithmetic operation,
  - whether copied source is reused later in the same function,
  - whether destination/source is protected (`$ret`, `$pN`, runtime/framework slot),
  - whether either slot has cross-function/module/external mention evidence,
  - whether a command/barrier/function boundary interrupts the candidate window.
- [x] Add a Track AB summary nested under `trackZResidualDiagnostics` or adjacent to it. Suggested labels:
  - `local-window-dead-source-candidate`
  - `source-reused-needs-copy`
  - `protected-or-abi-slot`
  - `external-or-cross-function-mention`
  - `barrier-or-boundary-window`
  - `non-adjacent-window-needs-pass-design`
  - `unparsed-or-insufficient-window`
- [x] Add deterministic aggregate fields: counts by label, top case names, capped examples, and recommendation.
- [x] Add synthetic tests for every label and one real explicit-report test proving the all-case report is populated.
- [x] Update this roadmap with real counts and the next decision.

**Latest controller gate evidence:** `npm run gate:lir-local-copy -- --output /tmp/redscript-lir-track-ab-controller.json`

- `gate = "pass"`
- `rollout = "pass"`
- `recommendation = "manual-experimental-opt-in-only"`
- `commandDelta = -193`
- `scoreCopyDelta = -193`
- `offlineFixtures = 29`
- `offlineFailed = 0`
- `trackABResidualDiagnostics.totalCount = 328`
- `trackABResidualDiagnostics.byLabel = [{ label: "non-adjacent-window-needs-pass-design", count: 328 }]`
- `trackABResidualDiagnostics.topCaseNames = ["sqrt_fx1000", "div3_hp", "double_div", "double_mul", "sin_cos_hp_separate", "sin_hp", "sqrt_fx10000", "int_div_mod_mix"]`
- `trackABResidualDiagnostics.recommendation = "collect-more-data"`

**Definition of Done:**

- [x] Track AB all-case output explains all 328 Track Z unknowns using a named proof/window bucket.
- [x] No optimizer behavior changes.
- [x] Full controller gates pass.
- [x] Roadmap records whether Track AA is unblocked, more proof diagnostics are required, or the family should stop.

**Decision:** Track AA remains blocked. Since `non-adjacent-window-needs-pass-design` accounts for all 328 target residuals, the next non-blocked work is Track AE: classify the non-adjacent pass-design gap before attempting any rewrite.

**Expected next decision after AB:**

- If `local-window-dead-source-candidate` dominates and offline fixtures prove equivalence: unblock Track AA.
- If `source-reused-needs-copy`, protected/ABI, external mention, or barrier/boundary dominates: do not rewrite that family; document the blocker and consider analyzer cleanup.
- If `unparsed-or-insufficient-window` dominates: add one more diagnostics tranche, not a rewrite.

---

### Track AE — Non-adjacent pass-design gap classification

**Status:** [ ] Not started — next recommended track

**Product promise:** Split the 328 `non-adjacent-window-needs-pass-design` residuals into actionable design buckets before writing any optimizer rewrite.

**Why now:** Track AB showed every remaining Track Z target residual is not a local adjacent-window proof candidate. A rewrite would require either a wider/non-adjacent pass design or a decision to stop this residual family.

**Allowed files:**

- `benchmarks/arithmetic-probes.ts`
- `src/__tests__/arithmetic-probes.test.ts`
- this roadmap and linked docs under `docs/plans/mc-mechanism-optimization/`

**Forbidden:**

- No changes to `src/optimizer/lir/rmw.ts`.
- No pass-order changes.
- No default/CLI behavior changes.
- No production-emitted behavior changes.
- No VIR changes.

**Implementation outline:**

- [ ] Add a Track AE summary nested under or adjacent to `trackABResidualDiagnostics` for the `non-adjacent-window-needs-pass-design` bucket.
- [ ] Classify the gap into deterministic buckets such as:
  - `copy-chain-wider-window-required`
  - `merge-or-control-flow-boundary`
  - `helper-function-boundary`
  - `requires-new-lir-dataflow-pass`
  - `insufficient-command-context`
  - `not-worth-pursuing`
- [ ] Include counts, top case names, capped examples, and recommendation.
- [ ] Add synthetic tests for bucket sorting/capping and one all-case report test proving Track AE is populated.
- [ ] Update this roadmap with controller gate counts and the next decision.

**Definition of Done:**

- [ ] Track AE explains the 328 non-adjacent residuals with pass-design buckets.
- [ ] No optimizer behavior changes.
- [ ] Full controller gates pass.
- [ ] Roadmap records whether Track AA remains blocked, a wider-pass design ADR is needed, or the residual family should stop.

---

### Track AA — Narrow residual rewrite implementation

**Status:** [ ] Blocked by Track AB/AE proof and pass-design diagnostics

**Product promise:** Add exactly one tiny LIR rewrite for a fixture-proven residual class, still behind `--experimental-lir-local-copy-rewrite`.

**Allowed files:**

- `src/optimizer/lir/rmw.ts`
- `src/__tests__/optimizer/lir/rmw.test.ts`
- `src/__tests__/optimizer/lir/pipeline.test.ts` if pass integration needs coverage
- `src/optimizer/lir/rewrite_equivalence_fixtures.ts`
- `src/__tests__/optimizer/lir/rewrite_equivalence.test.ts`
- `benchmarks/arithmetic-probes.ts` and probe tests only for evidence fields if needed
- this roadmap

**Forbidden:**

- No default enablement.
- No CLI behavior changes.
- No broad canonicalization pass unless Track AB explicitly proves it is needed and safe.
- No cross-function rewrite.
- No protected `$ret`/`$pN`/external module mention rewrite.

**Implementation outline:**

- [ ] Write RED tests for the exact proven fixture class.
- [ ] Implement the smallest pattern in the existing experimental RMW/local-copy path.
- [ ] Add negative tests for protected slot, boundary, external mention, non-adjacent, and non-commutative alias cases as relevant.
- [ ] Run the explicit comparison gate and record command/scoreCopy deltas.
- [ ] Update this roadmap with before/after residual counts.

**Definition of Done:**

- [ ] Targeted LIR optimizer tests pass.
- [ ] Offline equivalence fixtures pass.
- [ ] `gate:lir-local-copy` still passes with no regressions.
- [ ] Manual experimental flag remains required.

---

### Track AC — Manual opt-in documentation hardening

**Status:** [ ] Optional after AB/AA stabilizes

**Product promise:** Make manual experimental usage understandable without implying default readiness.

**Allowed files:**

- CLI/user docs if present
- `README.md` or docs under `docs/` only if they already document CLI options
- this roadmap

**Forbidden:**

- No behavior changes.
- No npm package/version changes unless explicitly requested.

**Implementation outline:**

- [ ] Document the flag as experimental/manual/off-by-default.
- [ ] Document incremental incompatibility.
- [ ] Include the exact evidence gate command for maintainers.
- [ ] State that gate pass is not semantic proof/default readiness.

**Definition of Done:**

- [ ] Docs are accurate and do not oversell safety.
- [ ] `git diff --check` passes.

---

### Track AD — Default enablement decision gate

**Status:** [ ] Not ready

This track should remain unchecked until all are true:

- [ ] Residual `unknown` is materially reduced or explained by stable blocker buckets.
- [ ] Required offline equivalence families cover every rewrite family that would be enabled.
- [ ] No-regression gate passes over the agreed benchmark corpus.
- [ ] At least one real corpus benefit remains after any new rewrite and no per-case command/scoreCopy regression exists.
- [ ] Negative tests cover protected slots, external mentions, boundaries, non-adjacent windows, and non-commutative aliases.
- [ ] A short ADR says why default enablement is safe and what rollback looks like.

Until then, keep recommendation at `manual-experimental-opt-in-only` or `stay-experimental`.

---

## Long-running Hermes goal template

Use this when starting a long run whose job is to read and follow this roadmap:

```text
In /Users/yuzhe/projects/redscript, continue the LIR local-copy optimizer lane by reading and following docs/plans/mc-mechanism-optimization/27-lir-local-copy-proof-to-release-roadmap.md as the source of truth.

Rules:
- Use Spark/Codex as bounded implementation worker where useful.
- Controller must inspect the diff, run real gates, update the roadmap checkboxes/evidence, then sign/commit/push if verified.
- Keep default compiler behavior unchanged unless the active roadmap explicitly says otherwise.
- Keep VIR experimental/read-only; do not touch src/optimizer/vir/**.
- Do not change parser, typechecker, LSP, package metadata, GitHub workflows, lockfiles, or public language semantics unless the active roadmap explicitly scopes it.
- Do not enable --experimental-lir-local-copy-rewrite by default.
- Treat benchmark gates as evidence, not semantic proof.

Start with the first unchecked non-blocked track in the roadmap. At the time this goal was written, that is Track AB: window/proof diagnostics for unknown residuals.

Expected workflow:
1. Check git status and recent log.
2. Read the roadmap and the referenced docs/evidence.
3. Dispatch Spark only with an explicit allowed-files/forbidden-scope prompt.
4. Review Spark's diff; repair small tail issues if needed.
5. Run the controller gates:
   - npm run test:probe
   - npm run test:lir
   - npm run build
   - npm run validate-mc
   - git diff --check
   - npm run gate:lir-local-copy -- --output /tmp/redscript-lir-<track>-controller.json
6. Update docs/plans/mc-mechanism-optimization/27-lir-local-copy-proof-to-release-roadmap.md with completed checkboxes and real evidence.
7. Commit signed and push only after verification.

Return:
1. Selected track and why.
2. Changed files.
3. Exact test/gate results.
4. Representative JSON/evidence from the gate output.
5. Roadmap updates made.
6. Next recommended track or blocker.
```

---

## Running notes

Append a short note here after each completed tranche.

### 2026-06-29 — Roadmap reset after Phase Y

- Created the previous active roadmap to replace ad-hoc continuation from the older Tranche X/Y appendix.
- Track Z became the next unchecked non-blocked track.

### 2026-06-29 — Track Z completed

- Added `trackZResidualDiagnostics` for the residual `safeCandidate score_copy -> score_arith` bucket.
- Controller gate `/tmp/redscript-lir-track-z-controller.json` reports all 328 target residuals as `unknown-needs-lir-proof`; no `rewriteable-now` class is proven by existing facts.
- Next unchecked non-blocked track: Track AB.

### 2026-06-29 — Roadmap renamed and refocused

- Renamed from `27-lir-local-copy-active-roadmap.md` to `27-lir-local-copy-proof-to-release-roadmap.md`.
- Refocused future work on proof/window diagnostics before rewrite implementation or default enablement.

### 2026-06-29 — Track AB completed

- Added `trackABResidualDiagnostics` for Track Z `unknown-needs-lir-proof` residuals.
- Controller gate `/tmp/redscript-lir-track-ab-controller.json` reports all 328 target residuals as `non-adjacent-window-needs-pass-design`.
- `gate = "pass"`, rollout remains `manual-experimental-opt-in-only`, `commandDelta = -193`, `scoreCopyDelta = -193`, offline fixtures `29/29` pass.
- Track AA remains blocked; next unchecked non-blocked track is Track AE.
